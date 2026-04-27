import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fetchMarketProducts, fetchMarketShop, type MarketProduct, type MarketShop } from '@/lib/market-api';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import PictureIcon from '@/public/icon/tupian.svg';
import SearchIcon from '@/public/icon/sousuo.svg';

const tabs = ['综合', '销量', '新品', '价格'] as const;
type SortTab = typeof tabs[number];
type SortableTab = Exclude<SortTab, '综合'>;
type SortDirection = 'asc' | 'desc';

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function compactCount(value: number) {
  if (value >= 10000) return `${Number((value / 10000).toFixed(1))}万`;
  return String(value || 0);
}

function useDebouncedText(value: string, delay = 220) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function ShopDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const [shop, setShop] = useState<MarketShop | null>(null);
  const [activeTab, setActiveTab] = useState<SortTab>(tabs[0]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [sortDirections, setSortDirections] = useState<Record<SortableTab, SortDirection>>({
    销量: 'desc',
    新品: 'desc',
    价格: 'asc',
  });
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedProducts, setSearchedProducts] = useState<MarketProduct[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const shopName = shop?.name || String(params.name || '店铺');
  const debouncedKeyword = useDebouncedText(searchKeyword.trim());

  const loadSearchedProducts = useCallback(async (keyword: string) => {
    const shopId = Number(params.id || shop?.id || 0);
    if (!shopId || !keyword) {
      setSearchedProducts(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const items = await fetchMarketProducts({ shopId, keyword, limit: 100 });
      setSearchedProducts(items);
    } catch {
      setSearchedProducts([]);
    } finally {
      setSearching(false);
    }
  }, [params.id, shop?.id]);

  const loadShop = useCallback(async (isRefresh = false) => {
    if (!params.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchMarketShop(params.id);
      if (data) setShop(data);
      setErrorText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message || '店铺加载失败' : '店铺加载失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  useEffect(() => {
    const shopId = Number(params.id || shop?.id || 0);
    if (!shopId || !debouncedKeyword) {
      setSearchedProducts(null);
      setSearching(false);
      return;
    }
    void loadSearchedProducts(debouncedKeyword);
  }, [debouncedKeyword, loadSearchedProducts, params.id, shop?.id]);

  const sourceProducts = useMemo<MarketProduct[]>(() => {
    if (!debouncedKeyword) return shop?.products || [];
    return searchedProducts || [];
  }, [debouncedKeyword, searchedProducts, shop?.products]);

  const sortedProducts = useMemo<MarketProduct[]>(() => {
    const products = sourceProducts;
    if (activeTab === '价格') {
      const factor = sortDirections.价格 === 'asc' ? 1 : -1;
      return [...products].sort((a, b) => (a.price - b.price) * factor);
    }
    if (activeTab === '销量') {
      const factor = sortDirections.销量 === 'asc' ? 1 : -1;
      return [...products].sort((a, b) => (a.sold - b.sold) * factor);
    }
    if (activeTab === '新品') {
      // createdAt 不在当前商品结构中，使用 id 近似发布时间排序。
      const factor = sortDirections.新品 === 'asc' ? 1 : -1;
      return [...products].sort((a, b) => (a.id - b.id) * factor);
    }
    return products;
  }, [activeTab, sortDirections, sourceProducts]);

  function handleTabPress(item: SortTab) {
    if (item === '综合') {
      setActiveTab(item);
      return;
    }
    if (activeTab === item) {
      setSortDirections((current) => ({
        ...current,
        [item]: current[item] === 'asc' ? 'desc' : 'asc',
      }));
      return;
    }
    setActiveTab(item);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.shopHero}>
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
              <BackIcon width={24} height={24} color="#FFF" />
            </Pressable>
            {showSearchBar ? (
              <>
                <View style={styles.searchInputWrapInline}>
                  <SearchIcon width={18} height={18} color="#C8CCD3" />
                  <TextInput
                    value={searchKeyword}
                    onChangeText={setSearchKeyword}
                    placeholder="搜索本店商品"
                    placeholderTextColor="#B9BEC7"
                    style={styles.searchInput}
                    returnKeyType="search"
                  />
                </View>
                <Pressable hitSlop={8} style={styles.searchCancelBtnInline} onPress={() => {
                  setShowSearchBar(false);
                  setSearchKeyword('');
                }}>
                  <ThemedText style={styles.searchCancelText}>取消</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.headerTitle} />
                <View style={styles.headerActions}>
                  <Pressable hitSlop={10} style={styles.headerIcon} onPress={() => setShowSearchBar(true)}>
                    <SearchIcon width={22} height={22} color="#FFF" />
                  </Pressable>
                </View>
              </>
            )}
          </View>
          <View style={styles.shopInfo}>
            <View style={styles.logo}>
              {shop?.avatarUrl ? <Image source={{ uri: shop.avatarUrl }} style={styles.logoImage} contentFit="cover" /> : <ThemedText style={styles.logoText}>{shopName.slice(0, 4).toUpperCase()}</ThemedText>}
            </View>
            <View style={styles.shopCopy}>
              <ThemedText numberOfLines={1} style={styles.shopName}>{shopName}</ThemedText>
              <View style={styles.scoreRow}>
                <ThemedText style={styles.stars}>★★★★★</ThemedText>
                <ThemedText style={styles.score}>{formatPrice(shop?.rating || 5)}</ThemedText>
                <ThemedText style={styles.followed}>已售 {compactCount(shop?.sales || 0)}</ThemedText>
              </View>
              <View style={styles.metaRow}>
                <ThemedText style={styles.metaText}>粉丝{compactCount(shop?.fans || 0)}</ThemedText>
                <ThemedText style={styles.metaText}>{shop?.serviceLevel || '金牌客服'}</ThemedText>
                {shop?.description ? <ThemedText numberOfLines={1} style={styles.metaText}>{shop.description}</ThemedText> : null}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
            {tabs.map((item) => {
              const active = item === activeTab;
              const sortable = item !== '综合';
              const direction = sortable ? sortDirections[item] : null;
              return (
                <Pressable key={item} style={styles.tabItem} onPress={() => handleTabPress(item)}>
                  <View style={styles.tabLabelRow}>
                    <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{item}</ThemedText>
                    {sortable ? (
                      <View style={styles.sortArrows}>
                        <ThemedText style={[styles.arrowText, active && direction === 'asc' && styles.arrowTextActive]}>▲</ThemedText>
                        <ThemedText style={[styles.arrowText, active && direction === 'desc' && styles.arrowTextActive]}>▼</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  {active ? <View style={styles.tabLine} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {loading || searching ? (
          <View style={styles.stateBox}><AppActivityIndicator label="正在加载店铺" /></View>
        ) : errorText ? (
          <View style={styles.stateBox}><ThemedText style={styles.stateText}>{errorText}</ThemedText></View>
        ) : (
          <FlatList
            data={sortedProducts}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            refreshing={refreshing}
            onRefresh={() => void (async () => {
              await loadShop(true);
              if (debouncedKeyword) await loadSearchedProducts(debouncedKeyword);
            })()}
            columnWrapperStyle={styles.productColumns}
            contentContainerStyle={styles.productList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.stateBox}><ThemedText style={styles.stateText}>{debouncedKeyword ? '没有找到相关商品' : '店铺暂无上架商品'}</ThemedText></View>}
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
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productPhoto} contentFit="cover" /> : <PictureIcon width={74} height={74} color="#BFC4CC" />}
                </View>
                <View style={styles.productBody}>
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
  safe: { flex: 1, backgroundColor: '#1D1D1D' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  shopHero: {
    height: 174,
    paddingHorizontal: 12,
    backgroundColor: '#2D2E2F',
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: 34 },
  searchInputWrapInline: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#44464A',
    marginLeft: 2,
  },
  searchCancelBtnInline: { height: 36, marginLeft: 8, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, height: 36, color: '#FFF', padding: 0, fontSize: 14 },
  searchCancelText: { fontSize: 13, color: '#E8EAEE', fontWeight: '700' },
  shopInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 22,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
  logoText: { fontSize: 13, color: '#333', fontWeight: '900' },
  shopCopy: { flex: 1, gap: 7 },
  shopName: { fontSize: 18, color: '#FFF', fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stars: { fontSize: 12, color: '#F0354B', fontWeight: '900' },
  score: { fontSize: 13, color: '#FFF', fontWeight: '800' },
  followed: { fontSize: 12, color: '#E0E1E3', fontWeight: '700', marginLeft: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  metaText: { fontSize: 12, color: '#E7E8EA', fontWeight: '600' },
  tabWrap: {
    height: 48,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginTop: -10,
  },
  tabContent: { paddingHorizontal: 16, alignItems: 'center', gap: 30 },
  tabItem: { height: 48, minWidth: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabText: { fontSize: 14, color: '#8B9098', fontWeight: '700' },
  tabTextActive: { color: '#20242B', fontWeight: '900' },
  sortArrows: { alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  arrowText: { fontSize: 8, lineHeight: 9, color: '#B7BCC5', fontWeight: '700' },
  arrowTextActive: { color: '#20242B' },
  tabLine: { position: 'absolute', bottom: 5, width: 20, height: 3, borderRadius: 2, backgroundColor: '#20242B' },
  stateBox: { minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stateText: { fontSize: 13, color: '#777D87', fontWeight: '700' },
  productList: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24 },
  productColumns: { gap: 8, marginBottom: 10 },
  productCard: {
    flex: 1,
    maxWidth: '50%',
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },
  productImage: {
    width: '100%',
    aspectRatio: 0.94,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E4DF',
  },
  productPhoto: { width: '100%', height: '100%' },
  productBody: { paddingHorizontal: 8, paddingVertical: 9, gap: 6 },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  productPrice: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  productSold: { fontSize: 11, color: '#9A9FA8', fontWeight: '700' },
});
