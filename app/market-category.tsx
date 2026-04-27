import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fetchMarketCategoryChildren, fetchMarketProducts, type MarketCategoryChild, type MarketProduct } from '@/lib/market-api';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import PictureIcon from '@/public/icon/tupian.svg';

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export default function MarketCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; parent?: string; categoryId?: string }>();
  const title = String(params.title || '推荐');
  const categoryId = Number(params.categoryId || 0);
  const [tabs, setTabs] = useState<MarketCategoryChild[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState(categoryId);
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(
    async (isRefresh = false, categoryOverride?: number) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        let nextCategoryId = categoryOverride ?? categoryId;
        let nextTabs: MarketCategoryChild[] = [];
        const shouldLoadTabs = !categoryOverride;
        if (shouldLoadTabs && categoryId > 0) {
          nextTabs = await fetchMarketCategoryChildren(categoryId);
          if (nextTabs.length) nextCategoryId = nextTabs[0].id;
        }
        const data = await fetchMarketProducts({
          categoryId: nextCategoryId || undefined,
          keyword: nextCategoryId ? undefined : title,
          limit: 50,
        });
        if (shouldLoadTabs) {
          setTabs(nextTabs);
          setActiveCategoryId(nextCategoryId);
        }
        setProducts(data);
        setErrorText('');
      } catch (error) {
        setErrorText(error instanceof Error ? error.message || '商品加载失败' : '商品加载失败');
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [categoryId, title]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!activeCategoryId || (activeCategoryId === categoryId && tabs.length !== 1)) return;
    void loadData(false, activeCategoryId);
  }, [activeCategoryId, categoryId, loadData, tabs.length]);

  const showTabs = tabs.length > 1;
  const displayProducts = useMemo(() => products, [products]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
            <BackIcon width={24} height={24} color="#222" />
          </Pressable>
          <ThemedText numberOfLines={1} style={styles.headerTitle}>{title}</ThemedText>
          <View style={styles.headerSpace} />
        </View>

        {showTabs ? <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
            {tabs.map((item) => {
              const active = item.id === activeCategoryId;
              return (
                <Pressable key={item.key} style={styles.tabItem} onPress={() => setActiveCategoryId(item.id)}>
                  <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{item.title}</ThemedText>
                  {active ? <View style={styles.tabLine} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View> : null}

        {loading ? (
          <View style={styles.stateBox}><AppActivityIndicator label="正在加载商品" /></View>
        ) : errorText ? (
          <View style={styles.stateBox}><ThemedText style={styles.stateText}>{errorText}</ThemedText></View>
        ) : (
          <FlatList
            data={displayProducts}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            refreshing={refreshing}
            onRefresh={() => void loadData(true, activeCategoryId || undefined)}
            columnWrapperStyle={styles.productColumns}
            contentContainerStyle={styles.productList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.stateBox}><ThemedText style={styles.stateText}>暂无上架商品</ThemedText></View>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.productCard}
                onPress={() =>
                  router.push({
                    pathname: '/product/[id]',
                    params: { id: String(item.id), name: item.name, price: formatPrice(item.price), sold: item.soldText },
                  })
                }>
                <View style={styles.productImage}>
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productPhoto} contentFit="cover" /> : <PictureIcon width={58} height={58} color="#D0D3D8" />}
                </View>
                <View style={styles.productBody}>
                  <ThemedText numberOfLines={2} style={styles.productPathText}>{item.imageUrl}</ThemedText>
                  <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
                  <View style={styles.productMeta}>
                    <ThemedText style={styles.productPrice}>¥{formatPrice(item.price)}</ThemedText>
                    <ThemedText style={styles.productSold}>已售 {item.soldText}</ThemedText>
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF' },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, color: '#20242B', fontWeight: '800' },
  headerSpace: { width: 40 },
  tabWrap: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  tabContent: { paddingHorizontal: 12, alignItems: 'center', gap: 20 },
  tabItem: { height: 42, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, color: '#555B66', fontWeight: '700' },
  tabTextActive: { color: '#111' },
  tabLine: { position: 'absolute', bottom: 3, width: 18, height: 2, borderRadius: 1, backgroundColor: '#111' },
  stateBox: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stateText: { fontSize: 13, color: '#777D87', fontWeight: '700' },
  productList: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 24 },
  productColumns: { gap: 8, marginBottom: 10 },
  productCard: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  productImage: { width: '100%', aspectRatio: 1.12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  productPhoto: { width: '100%', height: '100%' },
  productBody: { padding: 8, gap: 6 },
  productPathText: { fontSize: 10, lineHeight: 14, color: '#8A909B', fontWeight: '600' },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  productPrice: { fontSize: 16, color: '#111', fontWeight: '800' },
  productSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
});
