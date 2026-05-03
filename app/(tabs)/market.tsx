import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { SkeletonImage } from '@/components/skeleton-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fetchMarketHome, type MarketCategory, type MarketCategoryChild, type MarketProduct } from '@/lib/market-api';
import CameraIcon from '@/public/icon/paizhao.svg';
import CartIcon from '@/public/icon/gouwuche.svg';
import CouponIcon from '@/public/icon/youhuiquan.svg';
import HistoryIcon from '@/public/icon/lishizuji.svg';
import MessageIcon from '@/public/icon/kefuxiaoxi.svg';
import OrderIcon from '@/public/icon/dingdan.svg';
import PictureIcon from '@/public/icon/tupian.svg';

type MarketShortcut = MarketCategoryChild & {
  fixed?: boolean;
  route?: '/orders' | '/cart' | '/coupons' | '/product-service-list' | '/market-category' | '/product-history';
};

const recommendFixedShortcuts: MarketShortcut[] = [
  { id: -1, key: 'orders', title: '我的订单', iconUrl: '', fixed: true, route: '/orders' },
  { id: -2, key: 'cart', title: '购物车', iconUrl: '', fixed: true, route: '/cart' },
  { id: -3, key: 'coupons', title: '优惠券', iconUrl: '', fixed: true, route: '/coupons' },
  { id: -4, key: 'service', title: '客服消息', iconUrl: '', fixed: true, route: '/product-service-list' },
  { id: -5, key: 'history', title: '历史足迹', iconUrl: '', fixed: true, route: '/product-history' },
];

const fixedShortcutIcons = {
  orders: OrderIcon,
  cart: CartIcon,
  coupons: CouponIcon,
  service: MessageIcon,
  history: HistoryIcon,
} as const;

function chunkFeatures(features: MarketShortcut[]) {
  const items = features.length ? features : [];
  if (!items.length) return [];
  return [items.slice(0, 5), items.slice(5, 10)].filter((row) => row.length);
}

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export default function MarketScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchMarketHome();
      setCategories(data.categories);
      setProducts(data.products);
      setActiveKey((current) => current || data.categories[0]?.key || '');
      setErrorText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message || '集市加载失败' : '集市加载失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeCategory = categories.find((item) => item.key === activeKey) ?? categories[0];
  const shortcuts = useMemo<MarketShortcut[]>(() => {
    if (!activeCategory) return [];
    const children = activeCategory.children || [];
    if (activeCategory.title === '推荐') return [...children, ...recommendFixedShortcuts];
    return children;
  }, [activeCategory]);
  const shortcutRows = useMemo(() => {
    if (!activeCategory) return [];
    const children = (activeCategory.children || []) as MarketShortcut[];
    if (activeCategory.title === '推荐') return [...chunkFeatures(children), recommendFixedShortcuts];
    return chunkFeatures(children);
  }, [activeCategory]);
  const visibleProducts = useMemo(() => {
    if (!activeCategory) return products;
    if (activeCategory.title === '推荐') return products;
    return products.filter((item) => item.categoryPath.includes(activeCategory.title) || item.category === activeCategory.title);
  }, [activeCategory, products]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchRow}>
          <Pressable style={styles.searchBox} onPress={() => router.push({ pathname: '/search', params: { type: 'product' } })}>
            <TextInput pointerEvents="none" editable={false} placeholder="搜索后台上架商品" style={styles.input} />
            <CameraIcon width={19} height={19} color="#5F6570" />
          </Pressable>
          <Pressable style={styles.searchBtn} onPress={() => router.push({ pathname: '/search', params: { type: 'product' } })}>
            <ThemedText style={styles.searchText}>搜索</ThemedText>
          </Pressable>
        </View>

        <View style={styles.categoryWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
            {categories.map((item) => (
              <Pressable key={item.key} style={styles.categoryItem} onPress={() => setActiveKey(item.key)}>
                <ThemedText style={[styles.categoryText, activeKey === item.key && styles.categoryTextActive]}>{item.title}</ThemedText>
                {activeKey === item.key ? <View style={styles.categoryLine} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {activeCategory && shortcuts.length ? (
          <View style={styles.featurePanel}>
            {shortcutRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.featureRow}>
                {row.map((item) => {
                  const FixedIcon = item.fixed ? fixedShortcutIcons[item.key as keyof typeof fixedShortcutIcons] : undefined;
                  return (
                  <Pressable
                    key={item.key}
                    style={styles.featureItem}
                    onPress={() => {
                      if (item.route === '/cart') {
                        router.push('/cart');
                        return;
                      }
                      if (item.route === '/orders') {
                        router.push('/orders');
                        return;
                      }
                      if (item.route === '/coupons') {
                        router.push('/coupons');
                        return;
                      }
                      if (item.route === '/product-service-list') {
                        router.push('/product-service-list');
                        return;
                      }
                      if (item.route === '/product-history') {
                        router.push('/product-history');
                        return;
                      }
                      router.push({
                        pathname: '/market-category',
                        params: {
                          title: item.title,
                          parent: activeCategory.title,
                          categoryId: item.fixed ? String(activeCategory.id) : String(item.id),
                        },
                      });
                    }}>
                    <View style={styles.featureIconWrap}>
                      {item.iconUrl ? (
                        <SkeletonImage source={{ uri: item.iconUrl }} style={styles.featureIcon} contentFit="cover" />
                      ) : FixedIcon ? (
                        <FixedIcon width={28} height={28} />
                      ) : (
                        <PictureIcon width={28} height={28} color="#D85C75" />
                      )}
                    </View>
                    <ThemedText numberOfLines={1} style={styles.featureText}>{item.title}</ThemedText>
                  </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.stateBox}><AppActivityIndicator label="正在加载集市" /></View>
        ) : errorText ? (
          <View style={styles.stateBox}><ThemedText style={styles.stateText}>{errorText}</ThemedText></View>
        ) : (
          <FlatList
            key={activeCategory?.key || 'market'}
            data={visibleProducts}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            refreshing={refreshing}
            onRefresh={() => void loadData(true)}
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
                  {item.imageUrl ? <SkeletonImage source={{ uri: item.imageUrl }} style={styles.productPhoto} contentFit="cover" /> : <PictureIcon width={52} height={52} color="#D0D3D8" />}
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
  searchRow: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchBox: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F7',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, height: 36, padding: 0, fontSize: 14, color: '#272B33' },
  searchBtn: { height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  searchText: { fontSize: 15, color: '#22252B', fontWeight: '700' },
  categoryWrap: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  categoryContent: { paddingHorizontal: 12, alignItems: 'center', gap: 20 },
  categoryItem: { height: 42, alignItems: 'center', justifyContent: 'center' },
  categoryText: { fontSize: 14, color: '#555B66', fontWeight: '700' },
  categoryTextActive: { color: '#111' },
  categoryLine: { position: 'absolute', bottom: 3, width: 18, height: 2, borderRadius: 1, backgroundColor: '#111' },
  featurePanel: { paddingTop: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  featureRow: { height: 68, flexDirection: 'row', alignItems: 'center' },
  featureItem: { width: '20%', alignItems: 'center', justifyContent: 'center', gap: 7 },
  featureIconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  featureIcon: { width: 28, height: 28, borderRadius: 3 },
  featureText: { fontSize: 12, color: '#3E434D', fontWeight: '700' },
  stateBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
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
  productImage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  productPhoto: { width: '100%', height: '100%' },
  productBody: { padding: 8, gap: 6 },
  productPathText: { fontSize: 10, lineHeight: 14, color: '#8A909B', fontWeight: '600' },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  productPrice: { fontSize: 16, color: '#111', fontWeight: '800' },
  productSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
});
