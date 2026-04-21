import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import PictureIcon from '@/public/icon/tupian.svg';

const fallbackTabs = ['推荐', '床', '窗帘', '收纳', '地毯', '吊灯', '香薰香氛'];

function makeProducts(title: string, tab: string) {
  return [
    { id: `${title}-${tab}-1`, name: `卡得利 · ${title}${tab} 真皮实木应灯悬`, price: '3887', sold: '8' },
    { id: `${title}-${tab}-2`, name: `牛马草坪苔微景观 限时立减`, price: '29.8', sold: '4.8万+' },
    { id: `${title}-${tab}-3`, name: `${title}家用透明收纳箱 加厚耐用`, price: '15', sold: '7.3万+' },
    { id: `${title}-${tab}-4`, name: `想想缓率 因为是关键款 轻奢地球仪摆件`, price: '145', sold: '2.6万+' },
    { id: `${title}-${tab}-5`, name: `北欧简约${tab}家居软装组合`, price: '89', sold: '1.2万+' },
    { id: `${title}-${tab}-6`, name: `${title}精选好物 小户型适用`, price: '59.9', sold: '9021' },
  ];
}

export default function MarketCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; parent?: string }>();
  const title = String(params.title || '卧室');
  const parent = String(params.parent || '推荐');
  const tabs = useMemo(() => [parent, ...fallbackTabs.filter((item) => item !== parent)].slice(0, 7), [parent]);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const products = useMemo(() => makeProducts(title, activeTab), [activeTab, title]);

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
          data={products}
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
                  params: { id: item.id, name: item.name, price: item.price, sold: item.sold },
                })
              }>
              <View style={styles.productImage}>
                <PictureIcon width={58} height={58} color="#D0D3D8" />
              </View>
              <View style={styles.productBody}>
                <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
                <View style={styles.productMeta}>
                  <ThemedText style={styles.productPrice}>¥{item.price}</ThemedText>
                  <ThemedText style={styles.productSold}>已售 {item.sold}</ThemedText>
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
  productBody: { padding: 8, gap: 6 },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  productPrice: { fontSize: 16, color: '#111', fontWeight: '800' },
  productSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
});
