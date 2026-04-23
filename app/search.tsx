import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fetchAllUser } from '@/lib/redbook-api';
import { postPublicJson } from '@/lib/post-json';
import { readJsonArray, SEARCH_HISTORY_KEY, writeJsonArray } from '@/lib/storage';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CameraIcon from '@/public/icon/paizhao.svg';

type SearchType = 'user' | 'product' | 'image' | 'video';

const searchTypes: { key: SearchType; label: string }[] = [
  { key: 'user', label: '用户' },
  { key: 'product', label: '商品' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];

type Suggestion = {
  id: string;
  title: string;
};

type SearchContentDto = {
  id: number | string;
  title?: string;
  brief?: string;
  account?: string;
  name?: string;
  contentType?: string;
};

function useDebouncedText(value: string, delay = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function uniqSuggestions(items: Suggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSearchType(value: unknown): SearchType {
  const text = String(Array.isArray(value) ? value[0] : value || '').trim();
  return text === 'product' || text === 'image' || text === 'video' ? text : 'user';
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [keyword, setKeyword] = useState('');
  const [activeType, setActiveType] = useState<SearchType>(() => normalizeSearchType(params.type));
  const [history, setHistory] = useState<string[]>(() => readJsonArray(SEARCH_HISTORY_KEY));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedKeyword = useDebouncedText(keyword.trim());
  const showSuggestions = Boolean(keyword.trim());
  const historyItems = useMemo(() => history.slice(0, 12), [history]);

  useEffect(() => {
    setActiveType(normalizeSearchType(params.type));
  }, [params.type]);

  useEffect(() => {
    let cancelled = false;
    const key = debouncedKeyword;
    if (!key) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        if (activeType === 'user') {
          const res = await fetchAllUser({ account: [], keyword: key, limit: 10, offset: 0 });
          const next = uniqSuggestions(
            (Array.isArray(res.result) ? res.result : []).flatMap((item) => {
              const name = String(item.name || '').trim();
              const account = String(item.account || '').trim();
              return [
                name ? { id: `name-${account}`, title: name } : null,
                account ? { id: `account-${account}`, title: account } : null,
              ].filter(Boolean) as Suggestion[];
            })
          ).slice(0, 10);
          if (!cancelled) setSuggestions(next);
          return;
        }

        if (activeType === 'image' || activeType === 'video') {
          const res = (await postPublicJson<SearchContentDto[]>('/searchContent', {
            keyword: key,
            type: activeType === 'video' ? 'video' : 'note',
            limit: 10,
            offset: 0,
          })) as { result?: SearchContentDto[] };
          const next = uniqSuggestions(
            (Array.isArray(res.result) ? res.result : []).flatMap((item) => {
              const title = String(item.title || '').trim();
              const brief = String(item.brief || '').trim();
              const name = String(item.name || '').trim();
              return [
                title ? { id: `title-${item.id}`, title } : null,
                brief ? { id: `brief-${item.id}`, title: brief } : null,
                name ? { id: `name-${item.id}`, title: name } : null,
              ].filter(Boolean) as Suggestion[];
            })
          ).slice(0, 10);
          if (!cancelled) setSuggestions(next);
          return;
        }

        if (!cancelled) setSuggestions([]);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeType, debouncedKeyword]);

  function saveHistory(value: string) {
    const text = value.trim();
    if (!text) return;
    const next = [text, ...history.filter((item) => item !== text)].slice(0, 20);
    setHistory(next);
    writeJsonArray(SEARCH_HISTORY_KEY, next);
  }

  function goSearch(nextKeyword = keyword, nextType = activeType) {
    const key = nextKeyword.trim();
    if (!key) return;
    saveHistory(key);
    router.push({ pathname: '/find', params: { keyword: key, type: nextType } });
  }

  function clearHistory() {
    setHistory([]);
    writeJsonArray(SEARCH_HISTORY_KEY, []);
  }

  function renderSuggestionTitle(text: string) {
    const key = keyword.trim();
    if (!key) return <ThemedText numberOfLines={1} style={styles.suggestionText}>{text}</ThemedText>;
    const lowerText = text.toLowerCase();
    const lowerKey = key.toLowerCase();
    const index = lowerText.indexOf(lowerKey);
    if (index < 0) return <ThemedText numberOfLines={1} style={styles.suggestionText}>{text}</ThemedText>;

    return (
      <ThemedText numberOfLines={1} style={styles.suggestionText}>
        {text.slice(0, index)}
        <ThemedText style={styles.suggestionHighlight}>{text.slice(index, index + key.length)}</ThemedText>
        {text.slice(index + key.length)}
      </ThemedText>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchRow}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <BackIcon width={23} height={23} color="#333" />
          </Pressable>
          <View style={styles.inputWrap}>
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="搜索"
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => goSearch()}
            />
            <CameraIcon width={20} height={20} color="#5F6570" />
          </View>
          <Pressable style={styles.searchBtn} onPress={() => goSearch()}>
            <ThemedText style={styles.searchText}>搜索</ThemedText>
          </Pressable>
        </View>

        {showSuggestions ? null : <View style={styles.typeBar}>
          {searchTypes.map((item) => {
            const active = item.key === activeType;
            return (
              <Pressable key={item.key} style={[styles.typeBtn, active && styles.typeBtnActive]} onPress={() => setActiveType(item.key)}>
                <ThemedText style={[styles.typeText, active && styles.typeTextActive]}>{item.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>}

        {showSuggestions ? (
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.suggestionList}
            ListFooterComponent={loading ? <AppActivityIndicator compact style={styles.loading} /> : null}
            ListEmptyComponent={!loading ? (
              <View style={styles.emptySuggestions}>
                <ThemedText style={styles.clearText}>没有找到相关搜索</ThemedText>
              </View>
            ) : null}
            renderItem={({ item }) => (
              <Pressable style={styles.suggestionRow} onPress={() => goSearch(item.title)}>
                <Feather name="search" size={16} color="#B5B8BF" />
                <View style={styles.suggestionTitle}>{renderSuggestionTitle(item.title)}</View>
                <Feather name="corner-up-left" size={15} color="#B5B8BF" />
              </Pressable>
            )}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>历史记录</ThemedText>
              {historyItems.length ? (
                <Pressable hitSlop={10} onPress={clearHistory}>
                  <ThemedText style={styles.clearText}>清空</ThemedText>
                </Pressable>
              ) : null}
            </View>

            {historyItems.length ? (
              <View style={styles.historyGrid}>
                {historyItems.map((word) => (
                  <Pressable key={word} style={styles.historyItem} onPress={() => goSearch(word)}>
                    <ThemedText numberOfLines={1} style={styles.historyText}>{word}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : (
              <ThemedText style={styles.emptyHistory}>暂无搜索历史</ThemedText>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF', paddingHorizontal: 12, paddingTop: 6 },
  searchRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F6F6F7',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, height: 38, fontSize: 15, color: '#22252B', padding: 0 },
  searchBtn: { height: 40, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  searchText: { fontSize: 15, color: '#252932', fontWeight: '700' },
  typeBar: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBtn: { height: 30, paddingHorizontal: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F8' },
  typeBtnActive: { backgroundColor: '#FFF1F3' },
  typeText: { fontSize: 14, color: '#6F7480', fontWeight: '600', includeFontPadding: false },
  typeTextActive: { color: '#FF2442', fontWeight: '800' },
  suggestionList: { paddingTop: 8, paddingBottom: 24 },
  suggestionRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F1F2',
  },
  suggestionTitle: { flex: 1, minWidth: 0 },
  suggestionText: { fontSize: 15, color: '#4E535C', fontWeight: '600' },
  suggestionHighlight: { color: '#D85C75', fontWeight: '800' },
  loading: { marginTop: 14 },
  emptySuggestions: { alignItems: 'center', justifyContent: 'center', paddingTop: 42 },
  content: { paddingTop: 6, paddingBottom: 28 },
  sectionHeader: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, color: '#22252B', fontWeight: '700' },
  clearText: { fontSize: 13, color: '#A2A6AE', fontWeight: '500' },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 12, paddingTop: 4 },
  historyItem: { width: '30%', minWidth: 96 },
  historyText: { fontSize: 14, lineHeight: 20, color: '#5E6470', fontWeight: '500' },
  emptyHistory: { marginTop: 8, fontSize: 14, color: '#A2A6AE' },
});
