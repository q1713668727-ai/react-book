import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CartIcon from '@/public/icon/gouwuche.svg';
import PictureIcon from '@/public/icon/tupian.svg';
import SearchIcon from '@/public/icon/sousuo.svg';

type CartMode = 'cart' | 'wish';

const recommendProducts = [
  { id: 'cart-recommend-1', name: '魅大咖 微宽松水洗牛仔裤', price: '115.9', sold: '89342' },
  { id: 'cart-recommend-2', name: '卡得利 · 大象耳朵床 北欧主卧双人床', price: '2256', sold: '86' },
  { id: 'cart-recommend-3', name: '轻薄防晒衬衫外套', price: '79', sold: '6120' },
  { id: 'cart-recommend-4', name: '奶油风实木床头柜', price: '189', sold: '836' },
];

export default function CartScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<CartMode>('cart');
  const isCart = mode === 'cart';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
            <BackIcon width={24} height={24} color="#20242B" />
          </Pressable>
          <View style={styles.headerTabs}>
            <Pressable style={styles.headerTab} onPress={() => setMode('cart')}>
              <ThemedText style={[styles.headerTabText, isCart && styles.headerTabTextActive]}>购物车</ThemedText>
              {isCart ? <View style={styles.headerTabLine} /> : null}
            </Pressable>
            <Pressable style={styles.headerTab} onPress={() => setMode('wish')}>
              <ThemedText style={[styles.headerTabText, !isCart && styles.headerTabTextActive]}>心愿单</ThemedText>
              {!isCart ? <View style={styles.headerTabLine} /> : null}
            </Pressable>
          </View>
          <View style={styles.headerRight}>
            {isCart ? (
              <Pressable hitSlop={10} style={styles.headerIcon}>
                <SearchIcon width={21} height={21} color="#20242B" />
              </Pressable>
            ) : null}
            <Pressable hitSlop={10} style={styles.manageBtn}>
              <ThemedText style={styles.manageText}>管理</ThemedText>
            </Pressable>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isCart ? <CartContent router={router} /> : <WishContent router={router} />}
          <RecommendGrid router={router} />
        </ScrollView>

        {isCart ? (
          <View style={styles.checkoutBar}>
            <View style={styles.checkWrap}>
              <View style={styles.checkCircle} />
              <ThemedText style={styles.checkText}>全选</ThemedText>
            </View>
            <View style={styles.totalWrap}>
              <ThemedText style={styles.totalLabel}>总计</ThemedText>
              <ThemedText style={styles.totalPrice}>¥0</ThemedText>
            </View>
            <Pressable style={styles.checkoutBtn}>
              <ThemedText style={styles.checkoutText}>结算</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}

function CartContent({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View>
      <View style={styles.cartStore}>
        <View style={styles.checkCircle} />
        <View style={styles.storeAvatar} />
        <ThemedText numberOfLines={1} style={styles.storeName}>是CC家的呀</ThemedText>
        <ThemedText style={styles.storeArrow}>›</ThemedText>
        <Pressable style={styles.couponBtn}>
          <ThemedText style={styles.couponBtnText}>领券</ThemedText>
        </Pressable>
      </View>
      <View style={styles.cartItem}>
        <View style={styles.checkCircle} />
        <Pressable
          style={styles.cartImage}
          onPress={() =>
            router.push({
              pathname: '/product/[id]',
              params: { id: 'cart-cc-jeans', name: '是CC家的呀 · 美式复古做旧牛仔裤', price: '121', sold: '3127' },
            })
          }>
          <PictureIcon width={46} height={46} color="#C6CBD3" />
        </Pressable>
        <View style={styles.cartInfo}>
          <ThemedText numberOfLines={2} style={styles.cartTitle}>是CC家的呀 · 美式复古做旧牛仔裤</ThemedText>
          <ThemedText style={styles.cartSpec}>复古蓝 / 建议125-140斤</ThemedText>
          <ThemedText style={styles.cartCoupon}>店铺立减2元 退换包运费</ThemedText>
          <View style={styles.cartPriceRow}>
            <ThemedText style={styles.cartPrice}>到手价 ¥121</ThemedText>
            <ThemedText style={styles.cartOrigin}>¥158</ThemedText>
            <View style={styles.cartQty}><ThemedText style={styles.cartQtyText}>×1</ThemedText></View>
          </View>
        </View>
      </View>
    </View>
  );
}

function WishContent({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View>
      <View style={styles.wishTabs}>
        <ThemedText style={[styles.wishTabText, styles.wishTabTextActive]}>全部</ThemedText>
        <ThemedText style={styles.wishTabText}>可售</ThemedText>
      </View>
      <Pressable
        style={styles.wishItem}
        onPress={() =>
          router.push({
            pathname: '/product/[id]',
            params: { id: 'wish-jeans', name: '是CC家的呀 · 美式复古做旧牛仔裤', price: '126', sold: '3127' },
          })
        }>
        <View style={styles.wishImage}>
          <PictureIcon width={54} height={54} color="#C6CBD3" />
        </View>
        <View style={styles.wishInfo}>
          <ThemedText numberOfLines={2} style={styles.wishTitle}>是CC家的呀 · 美式复古做旧牛仔裤</ThemedText>
          <View style={styles.wishMetaRow}>
            <ThemedText style={styles.wishMeta}>6443人已加购</ThemedText>
            <ThemedText style={styles.wishMeta}>已售3127</ThemedText>
          </View>
          <View style={styles.wishPriceRow}>
            <ThemedText style={styles.wishPrice}>¥126</ThemedText>
            <ThemedText style={styles.cartOrigin}>¥158</ThemedText>
          </View>
          <View style={styles.wishActions}>
            <Pressable style={styles.wishActionBtn}><ThemedText style={styles.wishActionText}>进店</ThemedText></Pressable>
            <Pressable style={styles.wishActionBtn}><ThemedText style={styles.wishActionText}>找相似</ThemedText></Pressable>
            <Pressable style={styles.wishCartBtn}><CartIcon width={16} height={16} color="#20242B" /></Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function RecommendGrid({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.recommendSection}>
      <View style={styles.recommendTitleRow}>
        <View style={styles.titleLine} />
        <ThemedText style={styles.recommendTitle}>猜你喜欢</ThemedText>
        <View style={styles.titleLine} />
      </View>
      <View style={styles.productGrid}>
        {recommendProducts.map((item) => (
          <Pressable
            key={item.id}
            style={styles.productCard}
            onPress={() =>
              router.push({
                pathname: '/product/[id]',
                params: { id: item.id, name: item.name, price: item.price, sold: item.sold },
              })
            }>
            <View style={styles.productImage}>
              <PictureIcon width={52} height={52} color="#D0D3D8" />
            </View>
            <View style={styles.productBody}>
              <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
              <View style={styles.productMeta}>
                <ThemedText style={styles.productPrice}>¥{item.price}</ThemedText>
                <ThemedText style={styles.productSold}>已售 {item.sold}</ThemedText>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  header: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  headerIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTabs: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', gap: 20, paddingLeft: 2 },
  headerTab: { height: 50, minWidth: 54, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerTabText: { fontSize: 15, color: '#8B9098', fontWeight: '800' },
  headerTabTextActive: { fontSize: 18, color: '#20242B', fontWeight: '900' },
  headerTabLine: { position: 'absolute', bottom: 4, width: 22, height: 2, borderRadius: 1, backgroundColor: '#F02D47' },
  headerRight: { minWidth: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  manageBtn: { height: 36, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  manageText: { fontSize: 14, color: '#20242B', fontWeight: '700' },
  scrollContent: { paddingBottom: 78 },
  cartStore: {
    height: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFF',
  },
  checkCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#DADDE2', backgroundColor: '#FFF' },
  storeAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#C3A17B' },
  storeName: { maxWidth: 180, fontSize: 14, color: '#20242B', fontWeight: '800' },
  storeArrow: { fontSize: 22, color: '#20242B', lineHeight: 24 },
  couponBtn: {
    marginLeft: 'auto',
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECEEF1',
  },
  couponBtnText: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  cartItem: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFF',
  },
  cartImage: { width: 92, height: 92, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  cartInfo: { flex: 1, minHeight: 92, gap: 5 },
  cartTitle: { fontSize: 14, lineHeight: 19, color: '#20242B', fontWeight: '700' },
  cartSpec: { fontSize: 12, color: '#8B9098', fontWeight: '600' },
  cartCoupon: { fontSize: 12, color: '#F02D47', fontWeight: '800' },
  cartPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 1 },
  cartPrice: { fontSize: 18, color: '#F02D47', fontWeight: '900' },
  cartOrigin: { fontSize: 12, color: '#9EA3AA', textDecorationLine: 'line-through', fontWeight: '700' },
  cartQty: { marginLeft: 'auto', height: 24, borderRadius: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  cartQtyText: { fontSize: 12, color: '#555B66', fontWeight: '800' },
  wishTabs: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 28, paddingHorizontal: 16, backgroundColor: '#FFF' },
  wishTabText: { fontSize: 14, color: '#8B9098', fontWeight: '800' },
  wishTabTextActive: { color: '#20242B' },
  wishItem: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#FFF' },
  wishImage: { width: 108, height: 108, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  wishInfo: { flex: 1, gap: 6 },
  wishTitle: { fontSize: 14, lineHeight: 19, color: '#20242B', fontWeight: '700' },
  wishMetaRow: { flexDirection: 'row', gap: 12 },
  wishMeta: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
  wishPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  wishPrice: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  wishActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 'auto' },
  wishActionBtn: { height: 28, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  wishActionText: { fontSize: 12, color: '#20242B', fontWeight: '800' },
  wishCartBtn: { width: 30, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  recommendSection: { paddingTop: 18 },
  recommendTitleRow: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  titleLine: { width: 42, height: StyleSheet.hairlineWidth, backgroundColor: '#DADDE2' },
  recommendTitle: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8, paddingTop: 8 },
  productCard: {
    width: '48.85%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  productImage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  productBody: { padding: 8, gap: 6 },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  productPrice: { fontSize: 16, color: '#111', fontWeight: '800' },
  productSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
  checkoutBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 62,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEEEE',
  },
  checkWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 14, color: '#555B66', fontWeight: '700' },
  totalWrap: { marginLeft: 'auto', marginRight: 14, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  totalLabel: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  totalPrice: { fontSize: 15, color: '#F02D47', fontWeight: '900' },
  checkoutBtn: { width: 98, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  checkoutText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
});
