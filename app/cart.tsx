import { useCallback, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readMarketCartItems, readMarketWishItems, removeMarketCartItems, removeMarketWishItems, updateMarketCartItemQuantity, writeMarketCheckoutItems, type MarketCartItem, type MarketWishItem } from '@/lib/market-cart';
import { fetchMarketProducts, type MarketProduct } from '@/lib/market-api';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CartIcon from '@/public/icon/gouwuche.svg';
import PictureIcon from '@/public/icon/tupian.svg';
import SearchIcon from '@/public/icon/sousuo.svg';
import DefaultShopIcon from '@/public/icon/dp.svg';

type CartMode = 'cart' | 'wish';
type CartShopGroup = {
  key: string;
  shop: string;
  shopId: number | null;
  shopAvatarUrl: string;
  items: MarketCartItem[];
};

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function shuffleProducts(products: MarketProduct[]) {
  return [...products].sort(() => Math.random() - 0.5).slice(0, 6);
}

function maxCartQuantity(item: MarketCartItem) {
  const limits = [Number(item.stock || 0), Number(item.purchaseLimit || 0)].filter((value) => value > 0);
  return limits.length ? Math.min(...limits) : 999;
}

function groupCartItems(items: MarketCartItem[]) {
  const map = new Map<string, CartShopGroup>();
  items.forEach((item) => {
    const key = String(item.shopId ?? (item.shop || 'default'));
    const group = map.get(key) || {
      key,
      shop: item.shop || '默认店铺',
      shopId: item.shopId,
      shopAvatarUrl: item.shopAvatarUrl || '',
      items: [],
    };
    if (!group.shopAvatarUrl && item.shopAvatarUrl) group.shopAvatarUrl = item.shopAvatarUrl;
    group.items.push(item);
    map.set(key, group);
  });
  return Array.from(map.values());
}

export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const feedback = useFeedback();
  const [mode, setMode] = useState<CartMode>('cart');
  const [cartItems, setCartItems] = useState<MarketCartItem[]>([]);
  const [wishItems, setWishItems] = useState<MarketWishItem[]>([]);
  const [recommendProducts, setRecommendProducts] = useState<MarketProduct[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const isCart = mode === 'cart';
  const allSelected = cartItems.length > 0 && cartItems.every((item) => selectedKeys.includes(item.key));
  const total = useMemo(
    () => cartItems.reduce((sum, item) => selectedKeys.includes(item.key) ? sum + item.price * item.quantity : sum, 0),
    [cartItems, selectedKeys],
  );

  useEffect(() => {
    if (String(params.mode || '').toLowerCase() === 'wish') {
      setMode('wish');
      return;
    }
    setMode('cart');
  }, [params.mode]);

  const refresh = useCallback(async () => {
    const [cart, wish, products] = await Promise.all([
      readMarketCartItems(),
      readMarketWishItems(),
      fetchMarketProducts({ limit: 50 }).catch(() => []),
    ]);
    const usedIds = new Set([...cart.map((item) => item.productId), ...wish.map((item) => item.productId)]);
    setCartItems(cart);
    setSelectedKeys((current) => {
      const validKeys = cart.map((item) => item.key);
      const next = current.filter((key) => validKeys.includes(key));
      return current.length ? next : validKeys;
    });
    setWishItems(wish);
    setRecommendProducts(shuffleProducts(products.filter((item) => !usedIds.has(String(item.id)))));
  }, []);

  function toggleItem(key: string) {
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleGroup(keys: string[]) {
    setSelectedKeys((current) => {
      const groupSelected = keys.every((key) => current.includes(key));
      return groupSelected
        ? current.filter((key) => !keys.includes(key))
        : Array.from(new Set([...current, ...keys]));
    });
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? [] : cartItems.map((item) => item.key));
  }

  async function changeCartQuantity(item: MarketCartItem, delta: number) {
    const max = maxCartQuantity(item);
    const nextQuantity = Math.min(max, Math.max(1, item.quantity + delta));
    if (nextQuantity === item.quantity) {
      if (delta > 0) feedback.toast(`最多购买 ${max} 件`);
      return;
    }
    setCartItems(await updateMarketCartItemQuantity(item.key, nextQuantity));
  }

  async function deleteCartItem(key: string) {
    const next = await removeMarketCartItems([key]);
    setCartItems(next);
    setSelectedKeys((current) => current.filter((item) => item !== key));
    feedback.toast('已删除商品');
  }

  async function deleteWishItem(productId: string) {
    const next = await removeMarketWishItems([productId]);
    setWishItems(next);
    feedback.toast('已从心愿单删除');
  }

  async function goCheckout() {
    const selectedItems = cartItems.filter((item) => selectedKeys.includes(item.key));
    if (!selectedItems.length) {
      feedback.toast('勾选要结算的商品后再继续');
      return;
    }
    await writeMarketCheckoutItems(selectedItems);
    router.push('/checkout');
  }

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

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
          {isCart ? (
            <CartContent
              router={router}
              items={cartItems}
              selectedKeys={selectedKeys}
              onToggleItem={toggleItem}
              onToggleGroup={toggleGroup}
              onChangeQuantity={changeCartQuantity}
              onDeleteItem={deleteCartItem}
            />
          ) : <WishContent router={router} items={wishItems} onDeleteItem={deleteWishItem} />}
          <RecommendGrid router={router} products={recommendProducts} />
        </ScrollView>

        {isCart ? (
          <View style={styles.checkoutBar}>
            <Pressable style={styles.checkWrap} onPress={toggleAll}>
              <View style={[styles.checkCircle, allSelected && styles.checkCircleActive]}>
                {allSelected ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
              </View>
              <ThemedText style={styles.checkText}>全选</ThemedText>
            </Pressable>
            <View style={styles.totalWrap}>
              <ThemedText style={styles.totalLabel}>总计</ThemedText>
              <ThemedText style={styles.totalPrice}>¥{formatPrice(total)}</ThemedText>
            </View>
            <Pressable style={styles.checkoutBtn} onPress={() => void goCheckout()}>
              <ThemedText style={styles.checkoutText}>结算</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}

function CartContent({
  router,
  items,
  selectedKeys,
  onToggleItem,
  onToggleGroup,
  onChangeQuantity,
  onDeleteItem,
}: {
  router: ReturnType<typeof useRouter>;
  items: MarketCartItem[];
  selectedKeys: string[];
  onToggleItem: (key: string) => void;
  onToggleGroup: (keys: string[]) => void;
  onChangeQuantity: (item: MarketCartItem, delta: number) => void;
  onDeleteItem: (key: string) => void;
}) {
  if (!items.length) {
    return (
      <View style={styles.emptyBlock}>
        <CartIcon width={44} height={44} color="#C5CAD2" />
        <ThemedText style={styles.emptyTitle}>购物车还是空的</ThemedText>
        <ThemedText style={styles.emptyText}>去商品详情页加入喜欢的商品</ThemedText>
      </View>
    );
  }

  return (
    <View>
      {groupCartItems(items).map((group) => {
        const groupKeys = group.items.map((item) => item.key);
        const groupSelected = groupKeys.every((key) => selectedKeys.includes(key));
        const firstItem = group.items[0];
        return (
        <View key={group.key} style={styles.cartShopGroup}>
          <View style={styles.cartStore}>
            <Pressable style={[styles.checkCircle, groupSelected && styles.checkCircleActive]} onPress={() => onToggleGroup(groupKeys)}>
              {groupSelected ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
            </Pressable>
            <View style={styles.storeAvatar}>
              {group.shopAvatarUrl ? (
                <Image source={{ uri: group.shopAvatarUrl }} style={styles.storeAvatarImage} contentFit="cover" />
              ) : (
                <DefaultShopIcon width={14} height={14} />
              )}
            </View>
            <ThemedText numberOfLines={1} style={styles.storeName}>{group.shop}</ThemedText>
            <ThemedText style={styles.storeArrow}>›</ThemedText>
            <Pressable
              style={styles.couponBtn}
              onPress={() =>
                router.push({
                  pathname: '/product/[id]',
                  params: { id: firstItem.productId, name: firstItem.name, price: String(firstItem.price), sold: firstItem.soldText, openCoupon: '1' },
                })
              }>
              <ThemedText style={styles.couponBtnText}>领券</ThemedText>
            </Pressable>
          </View>
          {group.items.map((item, index) => (
            <SwipeDeleteRow key={item.key} onDelete={() => onDeleteItem(item.key)}>
              <View style={[styles.cartItem, index > 0 && styles.cartItemDivider]}>
                <Pressable style={[styles.checkCircle, selectedKeys.includes(item.key) && styles.checkCircleActive]} onPress={() => onToggleItem(item.key)}>
                  {selectedKeys.includes(item.key) ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
                </Pressable>
                <Pressable
                  style={styles.cartImage}
                  onPress={() =>
                    router.push({
                      pathname: '/product/[id]',
                      params: { id: item.productId, name: item.name, price: String(item.price), sold: item.soldText },
                    })
                  }>
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.imagePhoto} contentFit="cover" /> : <PictureIcon width={46} height={46} color="#C6CBD3" />}
                </Pressable>
                <View style={styles.cartInfo}>
                  <ThemedText numberOfLines={2} style={styles.cartTitle}>{item.name}</ThemedText>
                  <ThemedText style={styles.cartSpec}>{item.specText}</ThemedText>
                  <ThemedText style={styles.cartCoupon}>店铺优惠 退换包运费</ThemedText>
                  <View style={styles.cartPriceRow}>
                    <ThemedText style={styles.cartPrice}>到手价 ¥{formatPrice(item.price)}</ThemedText>
                    {item.originPrice > item.price ? <ThemedText style={styles.cartOrigin}>¥{formatPrice(item.originPrice)}</ThemedText> : null}
                    <View style={styles.cartQtyStepper}>
                      <Pressable style={styles.cartQtyBtn} onPress={() => onChangeQuantity(item, -1)}>
                        <ThemedText style={styles.cartQtyBtnText}>−</ThemedText>
                      </Pressable>
                      <View style={styles.cartQtyValue}>
                        <ThemedText style={styles.cartQtyText}>{item.quantity}</ThemedText>
                      </View>
                      <Pressable style={styles.cartQtyBtn} onPress={() => onChangeQuantity(item, 1)}>
                        <ThemedText style={styles.cartQtyBtnText}>＋</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </SwipeDeleteRow>
          ))}
        </View>
      )})}
    </View>
  );
}

function WishContent({ router, items, onDeleteItem }: { router: ReturnType<typeof useRouter>; items: MarketWishItem[]; onDeleteItem: (productId: string) => void }) {
  if (!items.length) {
    return (
      <View>
        <View style={styles.wishTabs}>
          <ThemedText style={[styles.wishTabText, styles.wishTabTextActive]}>全部</ThemedText>
          <ThemedText style={styles.wishTabText}>可售</ThemedText>
        </View>
        <View style={styles.emptyBlock}>
          <PictureIcon width={44} height={44} color="#C5CAD2" />
          <ThemedText style={styles.emptyTitle}>心愿单暂无商品</ThemedText>
          <ThemedText style={styles.emptyText}>在商品页点右上角收藏加入心愿单</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.wishTabs}>
        <ThemedText style={[styles.wishTabText, styles.wishTabTextActive]}>全部</ThemedText>
        <ThemedText style={styles.wishTabText}>可售</ThemedText>
      </View>
      {items.map((item) => (
        <SwipeDeleteRow key={item.productId} onDelete={() => onDeleteItem(item.productId)}>
          <Pressable
            style={styles.wishItem}
            onPress={() =>
              router.push({
                pathname: '/product/[id]',
                params: { id: item.productId, name: item.name, price: String(item.price), sold: item.soldText },
              })
            }>
            <View style={styles.wishImage}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.imagePhoto} contentFit="cover" /> : <PictureIcon width={54} height={54} color="#C6CBD3" />}
            </View>
            <View style={styles.wishInfo}>
              <ThemedText numberOfLines={2} style={styles.wishTitle}>{item.name}</ThemedText>
              <View style={styles.wishMetaRow}>
                <ThemedText style={styles.wishMeta}>{item.favorites || 0}人想要</ThemedText>
                <ThemedText style={styles.wishMeta}>已售{item.soldText}</ThemedText>
              </View>
              <View style={styles.wishPriceRow}>
                <ThemedText style={styles.wishPrice}>¥{formatPrice(item.price)}</ThemedText>
                {item.originPrice > item.price ? <ThemedText style={styles.cartOrigin}>¥{formatPrice(item.originPrice)}</ThemedText> : null}
              </View>
              <View style={styles.wishActions}>
                <Pressable
                  style={styles.wishActionBtn}
                  onPress={(event) => {
                    event.stopPropagation();
                    router.push({
                      pathname: '/shop/[id]',
                      params: { id: String(item.shopId || 0), name: item.shop || '店铺' },
                    });
                  }}>
                  <ThemedText style={styles.wishActionText}>进店</ThemedText>
                </Pressable>
                <Pressable
                  style={styles.wishCartBtn}
                  onPress={(event) => {
                    event.stopPropagation();
                    router.push({
                      pathname: '/product/[id]',
                      params: {
                        id: item.productId,
                        name: item.name,
                        price: String(item.price),
                        sold: item.soldText,
                        openCart: '1',
                      },
                    });
                  }}>
                  <CartIcon width={16} height={16} color="#20242B" />
                </Pressable>
              </View>
            </View>
          </Pressable>
        </SwipeDeleteRow>
      ))}
    </View>
  );
}

function SwipeDeleteRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <Swipeable
      overshootRight={false}
      friction={1.8}
      rightThreshold={36}
      renderRightActions={(progress) => {
        const actionsTranslate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [84, 0],
          extrapolate: 'clamp',
        });
        const btnTranslate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View style={[styles.swipeDeleteActions, { transform: [{ translateX: actionsTranslate }] }]}>
            <Animated.View style={[styles.swipeDeleteActionAnimated, { transform: [{ translateX: btnTranslate }] }]}>
              <Pressable style={styles.swipeDeleteBtn} onPress={onDelete}>
                <ThemedText style={styles.swipeDeleteText}>删除</ThemedText>
              </Pressable>
            </Animated.View>
          </Animated.View>
        );
      }}>
      {children}
    </Swipeable>
  );
}

function RecommendGrid({ router, products }: { router: ReturnType<typeof useRouter>; products: MarketProduct[] }) {
  return (
    <View style={styles.recommendSection}>
      <View style={styles.recommendTitleRow}>
        <View style={styles.titleLine} />
        <ThemedText style={styles.recommendTitle}>猜你喜欢</ThemedText>
        <View style={styles.titleLine} />
      </View>
      <View style={styles.productGrid}>
        {products.map((item) => (
          <Pressable
            key={item.id}
            style={styles.productCard}
            onPress={() =>
              router.push({
                pathname: '/product/[id]',
                params: { id: String(item.id), name: item.name, price: String(item.price), sold: item.soldText },
              })
            }>
            <View style={styles.productImage}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.imagePhoto} contentFit="cover" /> : <PictureIcon width={52} height={52} color="#D0D3D8" />}
            </View>
            <View style={styles.productBody}>
              <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
              <View style={styles.productMeta}>
                <ThemedText style={styles.productPrice}>¥{formatPrice(item.price)}</ThemedText>
                <ThemedText style={styles.productSold}>已售 {item.soldText}</ThemedText>
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
  cartShopGroup: { marginTop: 8, backgroundColor: '#FFF' },
  cartStore: {
    height: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFF',
  },
  checkCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#DADDE2', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  checkCircleActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  checkMark: { fontSize: 12, lineHeight: 14, color: '#FFF', fontWeight: '900' },
  storeAvatar: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4E3' },
  storeAvatarImage: { width: '100%', height: '100%' },
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
  swipeDeleteActions: {
    width: 84,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  swipeDeleteActionAnimated: { alignSelf: 'stretch' },
  swipeDeleteBtn: {
    width: 84,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2442',
  },
  swipeDeleteText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  cartItemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F1F2F4', paddingTop: 14 },
  cartImage: { width: 92, height: 92, borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  imagePhoto: { width: '100%', height: '100%' },
  cartInfo: { flex: 1, minHeight: 92, gap: 5 },
  cartTitle: { fontSize: 14, lineHeight: 19, color: '#20242B', fontWeight: '700' },
  cartSpec: { fontSize: 12, color: '#8B9098', fontWeight: '600' },
  cartCoupon: { fontSize: 12, color: '#F02D47', fontWeight: '800' },
  cartPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 1 },
  cartPrice: { fontSize: 18, color: '#F02D47', fontWeight: '900' },
  cartOrigin: { fontSize: 12, color: '#9EA3AA', textDecorationLine: 'line-through', fontWeight: '700' },
  cartQtyStepper: { marginLeft: 'auto', height: 26, borderRadius: 13, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', backgroundColor: '#F6F6F7' },
  cartQtyBtn: { width: 28, height: 26, alignItems: 'center', justifyContent: 'center' },
  cartQtyBtnText: { fontSize: 14, color: '#343941', fontWeight: '900' },
  cartQtyValue: { minWidth: 28, height: 26, alignItems: 'center', justifyContent: 'center' },
  cartQtyText: { fontSize: 12, color: '#555B66', fontWeight: '800' },
  wishTabs: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 28, paddingHorizontal: 16, backgroundColor: '#FFF' },
  wishTabText: { fontSize: 14, color: '#8B9098', fontWeight: '800' },
  wishTabTextActive: { color: '#20242B' },
  wishItem: { flexDirection: 'row', gap: 10, padding: 12, marginTop: 8, backgroundColor: '#FFF' },
  wishImage: { width: 108, height: 108, borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
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
  emptyBlock: { marginTop: 8, minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF' },
  emptyTitle: { fontSize: 15, color: '#20242B', fontWeight: '900' },
  emptyText: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
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
  productImage: { width: '100%', aspectRatio: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
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
