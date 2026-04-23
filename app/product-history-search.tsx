import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readMarketBrowseItems, type MarketBrowseItem } from '@/lib/market-cart';
import SearchIcon from '@/public/icon/sousuo.svg';
import PictureIcon from '@/public/icon/tupian.svg';

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function matchItem(item: MarketBrowseItem, keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return false;
  return [item.name, item.shop, item.soldText].some((value) => String(value || '').toLowerCase().includes(text));
}

export default function ProductHistorySearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [items, setItems] = useState<MarketBrowseItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      readMarketBrowseItems()
        .then((next) => {
          if (alive) setItems(next);
        })
        .finally(() => {
          if (alive) {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 80);
          }
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  const results = useMemo(() => items.filter((item) => matchItem(item, keyword)), [items, keyword]);
  const showEnd = keyword.trim() && !loading && results.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchHeader}>
          <View style={styles.searchBox}>
            <SearchIcon width={22} height={22} color="#A8ADB5" />
            <TextInput
              ref={inputRef}
              value={keyword}
              onChangeText={setKeyword}
              placeholder="搜索商品足迹"
              placeholderTextColor="#A8ADB5"
              returnKeyType="search"
              style={styles.input}
            />
            {keyword ? (
              <Pressable hitSlop={8} style={styles.clearBtn} onPress={() => setKeyword('')}>
                <ThemedText style={styles.clearText}>×</ThemedText>
              </Pressable>
            ) : null}
          </View>
          <Pressable hitSlop={10} style={styles.cancelBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/product-history'))}>
            <ThemedText style={styles.cancelText}>取消</ThemedText>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.state}>
            <AppActivityIndicator label="正在加载足迹" />
          </View>
        ) : keyword.trim() ? (
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.productId}-${item.viewedAt}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <ThemedText style={styles.emptyText}>没有找到相关足迹</ThemedText>
              </View>
            }
            ListFooterComponent={showEnd ? <ThemedText style={styles.endText}>— THE END —</ThemedText> : null}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/product/[id]',
                    params: { id: item.productId, name: item.name, price: String(item.price), sold: item.soldText },
                  })
                }>
                <View style={styles.thumb}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <PictureIcon width={46} height={46} color="#C6CBD3" />
                  )}
                </View>
                <View style={styles.info}>
                  <ThemedText numberOfLines={2} style={styles.name}>{item.name}</ThemedText>
                  <ThemedText style={styles.price}>¥{formatPrice(item.price)}</ThemedText>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.state}>
            <SearchIcon width={42} height={42} color="#D1D5DB" />
            <ThemedText style={styles.emptyText}>输入关键字搜索浏览过的商品</ThemedText>
          </View>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  searchHeader: {
    height: 64,
    paddingLeft: 36,
    paddingRight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
  },
  searchBox: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingLeft: 18,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F6F6F7',
  },
  input: {
    flex: 1,
    height: 42,
    padding: 0,
    fontSize: 17,
    color: '#343941',
  },
  clearBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  clearText: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', lineHeight: 22, backgroundColor: '#8B9098', color: '#FFFFFF', fontSize: 18, fontWeight: '500' },
  cancelBtn: { height: 42, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 18, color: '#777D87', fontWeight: '500' },
  list: { paddingTop: 14, paddingBottom: 40 },
  row: {
    minHeight: 116,
    paddingLeft: 24,
    paddingRight: 22,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F2F4',
  },
  thumbImage: { width: '100%', height: '100%' },
  info: { flex: 1, minHeight: 88, justifyContent: 'space-between', paddingVertical: 2 },
  name: { fontSize: 15, lineHeight: 22, color: '#777D87', fontWeight: '500' },
  price: { fontSize: 20, color: '#626872', fontWeight: '400' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#A2A7AF', fontWeight: '700' },
  endText: { marginTop: 32, textAlign: 'center', fontSize: 15, color: '#B7BBC2', fontWeight: '600' },
});
