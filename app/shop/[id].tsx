import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import MessageIcon from '@/public/icon/xiaoxi.svg';
import PictureIcon from '@/public/icon/tupian.svg';
import SearchIcon from '@/public/icon/sousuo.svg';
import ShareIcon from '@/public/icon/fenxiang.svg';

const tabs = ['综合', '销量', '新品', '价格'];
const products = [
  { id: 'shop-bed-1', name: '卡得利 · 意式极简悬浮床 20cm加厚靠包', price: '3997', sold: '已售8' },
  { id: 'shop-bed-2', name: '卡得利 · 大象耳朵床 北欧主卧双人床', price: '2256', sold: '已售86' },
  { id: 'shop-bed-3', name: '卡得利 · 软靠真皮床 小户型储物款', price: '3180', sold: '已售24' },
  { id: 'shop-bed-4', name: '卡得利 · 黑白撞色现代床 高弹海绵靠背', price: '2899', sold: '已售52' },
  { id: 'shop-bed-5', name: '卡得利 · 奶油风云朵床 主卧婚床套装', price: '4590', sold: '已售17' },
  { id: 'shop-bed-6', name: '卡得利 · 胡桃木框架床 静音稳固排骨架', price: '3699', sold: '已售39' },
];

export default function ShopDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const shopName = String(params.name || '卡得利家具旗舰店');
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const sortedProducts = useMemo(() => {
    if (activeTab === '价格') {
      return [...products].sort((a, b) => Number(a.price) - Number(b.price));
    }
    if (activeTab === '销量') {
      return [...products].reverse();
    }
    return products;
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.shopHero}>
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
              <BackIcon width={24} height={24} color="#FFF" />
            </Pressable>
            <View style={styles.headerTitle} />
            <View style={styles.headerActions}>
              <Pressable hitSlop={10} style={styles.headerIcon}>
                <SearchIcon width={22} height={22} color="#FFF" />
              </Pressable>
              <Pressable hitSlop={10} style={styles.headerIcon}>
                <MessageIcon width={22} height={22} color="#FFF" />
              </Pressable>
              <Pressable hitSlop={10} style={styles.headerIcon}>
                <ShareIcon width={22} height={22} color="#FFF" />
              </Pressable>
            </View>
          </View>

          <View style={styles.shopInfo}>
            <View style={styles.logo}>
              <ThemedText style={styles.logoText}>CALDRI</ThemedText>
            </View>
            <View style={styles.shopCopy}>
              <ThemedText numberOfLines={1} style={styles.shopName}>{shopName}</ThemedText>
              <View style={styles.scoreRow}>
                <ThemedText style={styles.stars}>★★★★★</ThemedText>
                <ThemedText style={styles.score}>4.9</ThemedText>
                <ThemedText style={styles.followed}>已售 962</ThemedText>
              </View>
              <View style={styles.metaRow}>
                <ThemedText style={styles.metaText}>粉丝4.1万</ThemedText>
                <ThemedText style={styles.metaText}>五星家具</ThemedText>
                <ThemedText style={styles.metaText}>2黄冠店铺</ThemedText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
            {tabs.map((item) => {
              const active = item === activeTab;
              return (
                <Pressable key={item} style={styles.tabItem} onPress={() => setActiveTab(item)}>
                  <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{item}</ThemedText>
                  {active ? <View style={styles.tabLine} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <FlatList
          data={sortedProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.productColumns}
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={styles.productCard}
              onPress={() =>
                router.push({
                  pathname: '/product/[id]',
                  params: { id: item.id, name: item.name, price: item.price, sold: item.sold.replace('已售', '') },
                })
              }>
              <View style={styles.productImage}>
                <PictureIcon width={74} height={74} color="#BFC4CC" />
              </View>
              <View style={styles.productBody}>
                <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
                <View style={styles.productMeta}>
                  <ThemedText style={styles.productPrice}>¥{item.price}</ThemedText>
                  <ThemedText style={styles.productSold}>{item.sold}</ThemedText>
                </View>
              </View>
            </Pressable>
          )}
        />
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
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: 102 },
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
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  tabText: { fontSize: 14, color: '#8B9098', fontWeight: '700' },
  tabTextActive: { color: '#20242B', fontWeight: '900' },
  tabLine: { position: 'absolute', bottom: 5, width: 20, height: 3, borderRadius: 2, backgroundColor: '#20242B' },
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
  productBody: { paddingHorizontal: 8, paddingVertical: 9, gap: 6 },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  productPrice: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  productSold: { fontSize: 11, color: '#9A9FA8', fontWeight: '700' },
});
