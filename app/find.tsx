import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { createConversation, fetchAllUser, fetchConversationList, type FollowListItem } from '@/lib/redbook-api';

function useDebouncedText(value: string, delay = 260) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function toAvatar(url?: string) {
  return resolveMediaUrl(String(url || '').replace(/^\.\.\//, ''));
}

export default function FindScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'input' | 'search'>('input');
  const [total, setTotal] = useState(0);
  const [submitting, setSubmitting] = useState<string[]>([]);
  const debouncedKeyword = useDebouncedText(keyword.trim());

  const hasMore = useMemo(() => list.length < total, [list.length, total]);

  const loadUsers = useCallback(async (params: { key: string; limit: number; offset: number; reset: boolean; manual: boolean }) => {
    const { key, limit, offset, reset, manual } = params;
    if (!key) return;
    setLoading(true);
    try {
      const account = String(user?.account || '');
      const messageList = account ? await fetchConversationList(account) : [];
      const exclude = [account, ...messageList.map((item) => String(item.id || ''))].filter(Boolean);

      const res = await fetchAllUser({
        account: Array.from(new Set(exclude)),
        keyword: key,
        limit,
        offset,
      });
      const next = Array.isArray(res.result) ? res.result : [];
      setList((prev) => (reset ? next : [...prev, ...next]));
      setTotal(Number(res.total || next.length));
      setError(null);
    } catch (err) {
      if (manual) {
        setError(err instanceof Error ? err.message : '搜索失败');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.account]);

  useEffect(() => {
    if (!debouncedKeyword) {
      setList([]);
      setTotal(0);
      return;
    }
    setSearchMode('input');
    void loadUsers({ key: debouncedKeyword, limit: 5, offset: 0, reset: true, manual: false });
  }, [debouncedKeyword, loadUsers]);

  async function followUser(item: FollowListItem) {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    const targetAccount = String(item.account || '');
    if (!targetAccount || targetAccount === user.account || submitting.includes(targetAccount)) return;

    setSubmitting((prev) => [...prev, targetAccount]);
    try {
      const target = {
        id: targetAccount,
        avatar: String(item.url || ''),
        title: String(item.name || targetAccount),
        read: 0,
        historyMessage: [],
      };
      const me = {
        id: user.account,
        avatar: String(user.url || ''),
        title: String(user.name || user.account),
        read: 0,
        historyMessage: [],
      };
      await createConversation({
        me: {
          message: JSON.stringify(target),
          UserToUser: `${user.account}-${targetAccount}`,
          account: user.account,
        },
        you: {
          message: JSON.stringify(me),
          UserToUser: `${targetAccount}-${user.account}`,
          account: targetAccount,
        },
      });

      setList((prev) => prev.filter((row) => String(row.account || '') !== targetAccount));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : '关注失败');
    } finally {
      setSubmitting((prev) => prev.filter((id) => id !== targetAccount));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '发现用户' }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchRow}>
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="输入昵称或账号关键词"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => {
              const key = keyword.trim();
              if (!key) return;
              setSearchMode('search');
              void loadUsers({ key, limit: 10, offset: 0, reset: true, manual: true });
            }}
          />
          <Pressable
            style={styles.searchBtn}
            onPress={() => {
              const key = keyword.trim();
              if (!key) return;
              setSearchMode('search');
              void loadUsers({ key, limit: 10, offset: 0, reset: true, manual: true });
            }}>
            <ThemedText style={styles.searchBtnText}>搜索</ThemedText>
          </Pressable>
        </View>

        {!keyword.trim() ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.muted}>请输入关键字搜索用户</ThemedText>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item, index) => `${item.account}-${index}`}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {loading ? <ActivityIndicator /> : <ThemedText style={styles.muted}>{error || '没有匹配用户'}</ThemedText>}
              </View>
            }
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (searchMode !== 'search' || !hasMore || loading) return;
              const key = keyword.trim();
              if (!key) return;
              void loadUsers({ key, limit: 10, offset: list.length, reset: false, manual: false });
            }}
            renderItem={({ item }) => {
              const targetAccount = String(item.account || '');
              const pending = submitting.includes(targetAccount);
              return (
                <View style={styles.row}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() =>
                      router.push({
                        pathname: '/user/[account]',
                        params: { account: targetAccount, name: String(item.name || ''), avatar: String(item.url || '') },
                      })
                    }>
                    {toAvatar(item.url) ? (
                      <Image source={{ uri: toAvatar(item.url) }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]} />
                    )}
                    <View style={styles.info}>
                      <ThemedText numberOfLines={1} style={styles.name}>
                        {item.name || '用户'}
                      </ThemedText>
                      <ThemedText numberOfLines={1} style={styles.meta}>
                        粉丝 {Number(item.fans || 0)}
                      </ThemedText>
                      <ThemedText numberOfLines={1} style={styles.meta}>
                        小红书号：{targetAccount || '-'}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[styles.followBtn, pending && styles.followBtnDisabled]}
                    disabled={pending}
                    onPress={() => void followUser(item)}>
                    <ThemedText style={styles.followText}>{pending ? '处理中' : '关注'}</ThemedText>
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  searchBtn: { height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontSize: 15, fontWeight: '600' },
  list: { paddingVertical: 12, gap: 10 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  muted: { color: '#8E8E93' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEE',
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ECECEE' },
  avatarFallback: { backgroundColor: '#ECECEE' },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12, color: '#8E8E93' },
  followBtn: { minWidth: 72, height: 34, borderRadius: 18, borderWidth: 1, borderColor: '#FF2442', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  followBtnDisabled: { opacity: 0.6 },
  followText: { color: '#FF2442', fontSize: 13, fontWeight: '600' },
});
