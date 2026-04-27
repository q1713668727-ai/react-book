import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Animated, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { avatarSource } from '@/lib/avatar-source';
import { readAddressItems, setDefaultAddressItem, type AddressItem } from '@/lib/address-book';
import { calculateCoupons, couponLevelOf, filterCouponsForLines } from '@/lib/coupon-optimizer';
import { addMarketCartItem, isMarketWishListed, readMarketCartItems, recordMarketBrowseItem, toggleMarketWishItem } from '@/lib/market-cart';
import { createMarketOrder, fetchMarketCoupons, fetchMarketProduct, fetchMarketProductReviews, fetchMarketProducts, fetchMyMarketCoupons, receiveMarketCoupon, type MarketCoupon, type MarketProduct, type MarketProductReview } from '@/lib/market-api';
import { useAuth } from '@/contexts/auth-context';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CartIcon from '@/public/icon/gouwuche.svg';
import CustomerServiceIcon from '@/public/icon/kefu.svg';
import ShopIcon from '@/public/icon/dianpu.svg';
import ShareIcon from '@/public/icon/fenxiang.svg';
import FavoriteIcon from '@/public/icon/shoucang.svg';
import PictureIcon from '@/public/icon/tupian.svg';

const HERO_HEIGHT = 390;
const TOP_BAR_HEIGHT = 48;
const fallbackSpecs = ['发货地: 广东广州', '运费险: 商家赠送', '7天无理由退换'];
const paymentOptions = [
  { id: 'wechat', title: '微信支付', color: '#36B854', active: true },
  { id: 'alipay-family', title: '支付宝免密支付', subtitle: '可切换普通支付', color: '#2C7DF0' },
  { id: 'alipay-later', title: '支付宝  先用后付', color: '#4B8CF7' },
  { id: 'huabei', title: '花呗分期', color: '#54A8D8' },
];
type ProductSection = '商品' | '评价' | '详情';
const topTabs: ProductSection[] = ['商品', '评价', '详情'];

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function maskPhone(phone: string) {
  const value = String(phone || '').trim();
  if (value.length < 8) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function toOrderAddressSnapshot(address: AddressItem | null) {
  if (!address) return null;
  const regionText = String(address.region || '').trim();
  const regionParts = regionText ? regionText.split(/\s+/).filter(Boolean) : [];
  const [province = '', city = '', district = ''] = regionParts;
  return {
    id: address.id,
    name: address.name,
    phone: address.phone,
    region: regionText,
    detail: address.detail,
    province,
    city,
    district,
    detailAddress: address.detail,
    receiver: address.name,
    mobile: address.phone,
  };
}

function pickRandomProducts(products: MarketProduct[], currentId?: string | number) {
  const id = String(currentId || '');
  return [...products]
    .filter((item) => String(item.id) !== id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const cartSheetTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const buySheetTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const couponSheetTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [topBarVisible, setTopBarVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ProductSection>('商品');
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [buySheetVisible, setBuySheetVisible] = useState(false);
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [couponSheetVisible, setCouponSheetVisible] = useState(false);
  const [remarkSheetVisible, setRemarkSheetVisible] = useState(false);
  const [payDialogVisible, setPayDialogVisible] = useState(false);
  const [remark, setRemark] = useState('');
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [wishListed, setWishListed] = useState(false);
  const [recommendProducts, setRecommendProducts] = useState<MarketProduct[]>([]);
  const [marketCoupons, setMarketCoupons] = useState<MarketCoupon[]>([]);
  const [reviews, setReviews] = useState<MarketProductReview[]>([]);
  const [claimedCoupons, setClaimedCoupons] = useState<MarketCoupon[]>([]);
  const [receivedCouponIds, setReceivedCouponIds] = useState<number[]>([]);
  const [addressItems, setAddressItems] = useState<AddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [defaultAddress, setDefaultAddress] = useState<AddressItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sectionY = useRef<Record<ProductSection, number>>({ 商品: 0, 评价: 0, 详情: 0 });
  const params = useLocalSearchParams<{ id?: string; name?: string; price?: string; sold?: string; openCoupon?: string; openCart?: string }>();
  const [product, setProduct] = useState<MarketProduct | null>(null);
  const name = product?.name || String(params.name || '魅大咖 微宽松水洗牛仔裤');
  const price = product ? formatPrice(product.price) : String(params.price || '115.9');
  const originPrice = product ? formatPrice(product.originPrice) : '116';
  const sold = product?.soldText || String(params.sold || '89342');
  const heroImages = useMemo(
    () => product?.imageUrls?.length ? product.imageUrls : product?.imageUrl ? [product.imageUrl] : [],
    [product?.imageUrl, product?.imageUrls],
  );
  const detailImages = useMemo(
    () => product?.hdImageUrls?.length ? product.hdImageUrls : heroImages,
    [heroImages, product?.hdImageUrls],
  );
  const skus = useMemo(() => product?.skus?.length ? product.skus : [], [product?.skus]);
  const firstSkuId = skus[0]?.id ?? null;
  const selectedSku = skus.find((sku) => sku.id === selectedSkuId) || skus[0];
  const selectedPrice = selectedSku ? formatPrice(selectedSku.price) : price;
  const selectedOriginPrice = selectedSku ? formatPrice(selectedSku.originPrice) : originPrice;
  const selectedImage = selectedSku?.imageUrl || heroImages[0];
  const selectedStock = selectedSku ? Number(selectedSku.stock || 0) : Number(product?.stock || 0);
  const maxQuantity = Math.max(1, Math.min(
    selectedStock || 1,
    product?.purchaseLimit ? Number(product.purchaseLimit) : selectedStock || 1,
  ));
  const selectedSpecs = selectedSku?.specs?.length ? selectedSku.specs : [{ name: '规格', value: '默认规格' }];
  const selectedSpecMap = selectedSpecs.reduce<Record<string, string>>((acc, item) => {
    acc[item.name] = item.value;
    return acc;
  }, {});
  const selectedSpecText = selectedSpecs.map((item) => item.value).join(' / ');
  const orderSubtotal = (selectedSku?.price ?? Number(product?.price || price || 0)) * quantity;
  const specGroups = useMemo(() => {
    const groups = new Map<string, { value: string; imageUrl: string }[]>();
    const sourceSkus = skus.length ? skus : [];
    sourceSkus.forEach((sku) => {
      const specs = sku.specs?.length ? sku.specs : [{ name: '规格', value: '默认规格' }];
      specs.forEach((spec) => {
        if (!spec.name || !spec.value) return;
        const values = groups.get(spec.name) || [];
        if (!values.some((item) => item.value === spec.value)) {
          values.push({ value: spec.value, imageUrl: sku.imageUrl || '' });
          groups.set(spec.name, values);
        }
      });
    });
    if (!groups.size) groups.set('规格', [{ value: '默认规格', imageUrl: heroImages[0] || '' }]);
    return Array.from(groups.entries()).map(([name, values]) => ({ name, values }));
  }, [heroImages, skus]);
  const productSpecs = useMemo(() => {
    const skuSpecs = product?.skus?.flatMap((sku) => sku.specs || []) || [];
    const grouped = new Map<string, Set<string>>();
    skuSpecs.forEach((item) => {
      if (!item.name || !item.value) return;
      if (!grouped.has(item.name)) grouped.set(item.name, new Set());
      grouped.get(item.name)?.add(item.value);
    });
    const rows = Array.from(grouped.entries()).map(([key, values]) => `${key}: ${Array.from(values).join(' / ')}`);
    if (product?.shippingFrom) rows.push(`发货地: ${product.shippingFrom}`);
    if (product?.freeShipping) rows.push('全店包邮');
    if (product?.purchaseLimit) rows.push(`限购: ${product.purchaseLimit} 件`);
    return rows.length ? rows : fallbackSpecs;
  }, [product]);
  const selectedAddress = addressItems.find((item) => item.id === selectedAddressId) || defaultAddress;
  const buyCouponLines = useMemo(
    () => [{
      productId: String(product?.id || params.id || ''),
      shopId: product?.shopId ?? null,
      amount: orderSubtotal,
    }],
    [orderSubtotal, params.id, product?.id, product?.shopId],
  );
  const buyCoupons = useMemo(() => filterCouponsForLines(claimedCoupons, buyCouponLines), [buyCouponLines, claimedCoupons]);
  const buyCouponCalculation = useMemo(() => calculateCoupons(buyCouponLines, buyCoupons), [buyCouponLines, buyCoupons]);
  const payableAmount = formatPrice(buyCouponCalculation.payable);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'));
  const topBarOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT - TOP_BAR_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const couponSheetCoupons = buySheetVisible ? buyCoupons : marketCoupons;
  const couponSheetMaxDiscount = couponSheetCoupons.length ? Math.max(...couponSheetCoupons.map((item) => item.discount)) : 0;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const nextVisible = y > 4;
    const nextTab = y >= sectionY.current.详情 - TOP_BAR_HEIGHT - 8
      ? '详情'
      : y >= sectionY.current.评价 - TOP_BAR_HEIGHT - 8
        ? '评价'
        : '商品';

    setTopBarVisible((current) => (current === nextVisible ? current : nextVisible));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }

  function scrollToSection(section: ProductSection) {
    const y = Math.max(sectionY.current[section] - TOP_BAR_HEIGHT, 0);
    scrollRef.current?.scrollTo({ y, animated: true });
  }

  function handleHeroMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(x / Math.max(screenWidth, 1));
    setHeroImageIndex(Math.min(Math.max(nextIndex, 0), Math.max(heroImages.length - 1, 0)));
  }

  function handleSelectSpec(name: string, value: string) {
    const nextSpecMap = { ...selectedSpecMap, [name]: value };
    const nextSku = skus.find((sku) => {
      const skuSpecs = sku.specs?.length ? sku.specs : [{ name: '规格', value: '默认规格' }];
      return Object.entries(nextSpecMap).every(([specName, specValue]) => skuSpecs.some((spec) => spec.name === specName && spec.value === specValue));
    }) || skus.find((sku) => {
      const skuSpecs = sku.specs?.length ? sku.specs : [{ name: '规格', value: '默认规格' }];
      return skuSpecs.some((spec) => spec.name === name && spec.value === value);
    });
    if (nextSku) {
      setSelectedSkuId(nextSku.id);
      setQuantity(1);
    }
  }

  function changeQuantity(delta: number) {
    setQuantity((current) => {
      const nextQuantity = Math.min(maxQuantity, Math.max(1, current + delta));
      if (delta > 0 && nextQuantity === current) {
        feedback.toast(`最多购买 ${maxQuantity} 件`);
      }
      return nextQuantity;
    });
  }

  async function handleAddCart() {
    if (selectedStock <= 0) {
      feedback.toast('当前规格库存不足，请选择其他规格');
      return;
    }
    const cartKey = `${String(product?.id || params.id || name)}:${selectedSku?.id ?? 'default'}`;
    const cartItems = await readMarketCartItems();
    const existingQuantity = cartItems.find((item) => item.key === cartKey)?.quantity || 0;
    const limit = maxQuantity;
    if (existingQuantity >= limit) {
      feedback.toast(`最多购买 ${limit} 件`);
      return;
    }
    if (existingQuantity + quantity > limit) {
      feedback.toast(`最多购买 ${limit} 件，购物车中已有 ${existingQuantity} 件`);
      return;
    }
    await addMarketCartItem({
      productId: String(product?.id || params.id || name),
      skuId: selectedSku?.id ?? null,
      shopId: product?.shopId ?? null,
      shop: product?.shop || '默认店铺',
      shopAvatarUrl: product?.shopAvatarUrl || '',
      name,
      imageUrl: selectedImage || heroImages[0] || '',
      specText: selectedSpecText || '默认规格',
      price: Number(selectedSku?.price ?? product?.price ?? price ?? 0),
      originPrice: Number(selectedSku?.originPrice ?? product?.originPrice ?? originPrice ?? 0),
      quantity,
      stock: selectedStock,
      purchaseLimit: Number(product?.purchaseLimit || 0),
      soldText: sold,
    });
    setCartSheetVisible(false);
    feedback.toast(`${name} 已加入购物车`);
  }

  async function handleToggleWish() {
    if (!product) {
      feedback.toast('商品加载中，请稍后再收藏');
      return;
    }
    const next = await toggleMarketWishItem(product);
    setWishListed(next);
    feedback.toast(next ? '已加入心愿单' : '已取消收藏');
  }

  async function refreshDefaultAddress() {
    const addresses = await readAddressItems();
    const nextDefault = addresses.find((item) => item.isDefault) || null;
    setAddressItems(addresses);
    setDefaultAddress(nextDefault);
    setSelectedAddressId((current) => (current && addresses.some((item) => item.id === current) ? current : nextDefault?.id || null));
  }

  async function openBuySheet() {
    await refreshDefaultAddress();
    setBuySheetVisible(true);
  }

  function handlePressBuyAddress() {
    if (selectedAddress) {
      setAddressSheetVisible(true);
      return;
    }
    setBuySheetVisible(false);
    router.push('/address-list');
  }

  async function handleSetDefaultAddress(id: string) {
    const addresses = await setDefaultAddressItem(id);
    const nextDefault = addresses.find((item) => item.isDefault) || null;
    setAddressItems(addresses);
    setDefaultAddress(nextDefault);
    setSelectedAddressId(id);
  }

  async function submitBuyOrder(paid: boolean) {
    if (!user?.account) {
      setBuySheetVisible(false);
      router.push('/login');
      return;
    }
    if (!selectedAddress) {
      feedback.toast('请先设置收货地址');
      return;
    }
    const orderItem = {
      key: `${String(product?.id || params.id || name)}:${selectedSku?.id ?? 'default'}`,
      productId: String(product?.id || params.id || ''),
      skuId: selectedSku?.id ?? null,
      shopId: product?.shopId ?? null,
      shop: product?.shop || '默认店铺',
      shopAvatarUrl: product?.shopAvatarUrl || '',
      name,
      imageUrl: selectedImage || heroImages[0] || '',
      specText: selectedSpecText || '默认规格',
      price: Number(selectedSku?.price ?? product?.price ?? price ?? 0),
      originPrice: Number(selectedSku?.originPrice ?? product?.originPrice ?? originPrice ?? 0),
      quantity,
      soldText: sold,
      addedAt: Date.now(),
    };
    try {
      await createMarketOrder({
        items: [orderItem],
        discount: buyCouponCalculation.totalDiscount,
        total: buyCouponCalculation.payable,
        shipping: 0,
        address: toOrderAddressSnapshot(selectedAddress),
        remark,
        couponIds: Object.values(buyCouponCalculation.selected).filter((id): id is number => typeof id === 'number'),
        paid,
        paymentMethod: paid ? 'mock' : undefined,
      });
      setBuySheetVisible(false);
      feedback.dialog({
        title: paid ? '支付成功' : '订单已提交',
        message: paid ? `已支付 ¥${formatPrice(buyCouponCalculation.payable)}` : '订单已生成，状态为待付款',
        actions: [
          { label: '完成', variant: 'plain' },
          { label: '查看订单', variant: 'primary', onPress: () => router.push('/orders') },
        ],
      });
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '订单提交失败，请稍后重试');
    }
  }

  function handleBuyPay() {
    setPayDialogVisible(true);
  }

  function handlePayChoice(paid: boolean) {
    setPayDialogVisible(false);
    void submitBuyOrder(paid);
  }

  async function handleReceiveCoupon(coupon: MarketCoupon) {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (receivedCouponIds.includes(coupon.id)) return;
    setReceivedCouponIds((current) => current.includes(coupon.id) ? current : [...current, coupon.id]);
    try {
      await receiveMarketCoupon(coupon.id);
      setClaimedCoupons((current) => current.some((item) => item.id === coupon.id) ? current : [coupon, ...current]);
      setMarketCoupons((current) =>
        current.map((item) =>
          item.id === coupon.id
            ? {
                ...item,
                receivedCount: item.receivedCount + 1,
                remainingCount: item.unlimitedCount ? item.remainingCount : Math.max(0, item.remainingCount - 1),
              }
            : item,
        ),
      );
    } catch (err) {
      setReceivedCouponIds((current) => current.filter((id) => id !== coupon.id));
      feedback.toast(err instanceof Error ? err.message : '领取失败，请稍后重试');
    }
  }

  const refreshPage = useCallback(async () => {
    if (!params.id) return;
    setRefreshing(true);
    try {
      const nextProduct = await fetchMarketProduct(params.id).catch(() => null);
      if (nextProduct) {
        setProduct(nextProduct);
        void recordMarketBrowseItem(nextProduct);
        const [nextReviews, nextRecommendProducts, nextMarketCoupons, nextWishListed] = await Promise.all([
          fetchMarketProductReviews(params.id).catch(() => []),
          fetchMarketProducts({ limit: 50 }).catch(() => []),
          fetchMarketCoupons({ productId: nextProduct.id, shopId: nextProduct.shopId || undefined }).catch(() => []),
          isMarketWishListed(nextProduct.id).catch(() => false),
        ]);
        setReviews(nextReviews);
        setRecommendProducts(pickRandomProducts(nextRecommendProducts, nextProduct.id));
        setMarketCoupons(nextMarketCoupons);
        setWishListed(nextWishListed);
      } else {
        setReviews([]);
        setMarketCoupons([]);
      }

      if (user?.account) {
        const nextClaimedCoupons = await fetchMyMarketCoupons().catch(() => []);
        setClaimedCoupons(nextClaimedCoupons);
        setReceivedCouponIds(nextClaimedCoupons.map((item) => item.id));
      } else {
        setClaimedCoupons([]);
        setReceivedCouponIds([]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [params.id, user?.account]);

  useEffect(() => {
    if (!params.id) return;
    let alive = true;
    fetchMarketProduct(params.id)
      .then((data) => {
        if (!alive || !data) return;
        setProduct(data);
        void recordMarketBrowseItem(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (!params.id) return;
    let alive = true;
    fetchMarketProductReviews(params.id)
      .then((items) => {
        if (alive) setReviews(items);
      })
      .catch(() => {
        if (alive) setReviews([]);
      });
    return () => {
      alive = false;
    };
  }, [params.id]);

  useEffect(() => {
    setHeroImageIndex(0);
    setSelectedSkuId(firstSkuId);
    setQuantity(1);
  }, [firstSkuId, product?.id]);

  useEffect(() => {
    if (!product?.id) return;
    let alive = true;
    isMarketWishListed(product.id).then((next) => {
      if (alive) setWishListed(next);
    });
    return () => {
      alive = false;
    };
  }, [product?.id]);

  useEffect(() => {
    let alive = true;
    fetchMarketProducts({ limit: 50 })
      .then((items) => {
        if (alive) setRecommendProducts(pickRandomProducts(items, product?.id || params.id));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [params.id, product?.id]);

  useEffect(() => {
    const productId = product?.id || params.id;
    const shopId = product?.shopId;
    if (!productId && !shopId) return;
    let alive = true;
    fetchMarketCoupons({ productId, shopId: shopId || undefined })
      .then((items) => {
        if (alive) setMarketCoupons(items);
      })
      .catch(() => {
        if (alive) setMarketCoupons([]);
      });
    return () => {
      alive = false;
    };
  }, [params.id, product?.id, product?.shopId]);

  useEffect(() => {
    if (!user?.account) {
      setClaimedCoupons([]);
      setReceivedCouponIds([]);
      return;
    }
    let alive = true;
    fetchMyMarketCoupons()
      .then((items) => {
        if (alive) {
          setClaimedCoupons(items);
          setReceivedCouponIds(items.map((item) => item.id));
        }
      })
      .catch(() => {
        if (alive) {
          setClaimedCoupons([]);
          setReceivedCouponIds([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [user?.account]);

  useEffect(() => {
    if (params.openCoupon === '1') setCouponSheetVisible(true);
  }, [params.openCoupon]);

  useEffect(() => {
    if (params.openCart === '1') setCartSheetVisible(true);
  }, [params.openCart]);

  useEffect(() => {
    if (!cartSheetVisible) return;
    cartSheetTranslateY.setValue(screenHeight);
    Animated.timing(cartSheetTranslateY, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [cartSheetTranslateY, cartSheetVisible, screenHeight]);

  useEffect(() => {
    if (!buySheetVisible) return;
    buySheetTranslateY.setValue(screenHeight);
    Animated.timing(buySheetTranslateY, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [buySheetTranslateY, buySheetVisible, screenHeight]);

  useEffect(() => {
    if (!couponSheetVisible) return;
    couponSheetTranslateY.setValue(screenHeight);
    Animated.timing(couponSheetTranslateY, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [couponSheetTranslateY, couponSheetVisible, screenHeight]);

  useEffect(() => {
    void refreshDefaultAddress();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshDefaultAddress();
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshPage()} />}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false, listener: handleScroll },
          )}>
          <View style={styles.hero}>
            {heroImages.length ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={handleHeroMomentumEnd}
                style={styles.heroCarousel}>
                {heroImages.map((item) => (
                  <Image key={item} source={{ uri: item }} style={[styles.heroImage, { width: screenWidth }]} contentFit="cover" />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.heroFallback}>
                <PictureIcon width={110} height={110} color="#D7DBE2" />
              </View>
            )}
            <View style={styles.heroCounter}>
              <ThemedText style={styles.heroCounterText}>{heroImageIndex + 1}/{Math.max(heroImages.length, 1)}</ThemedText>
            </View>
            <Pressable hitSlop={12} style={styles.backBtn} onPress={goBack}>
              <BackIcon width={24} height={24} color="#FFF" />
            </Pressable>
            <Pressable hitSlop={12} style={[styles.heroIconBtn, styles.favoriteBtn, wishListed && styles.favoriteBtnActive]} onPress={handleToggleWish}>
              <FavoriteIcon width={22} height={22} color={wishListed ? '#F02D47' : '#20242B'} />
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.priceRow}>
              <ThemedText style={styles.price}>¥{price}</ThemedText>
              <ThemedText style={styles.sold}>已售 {sold}</ThemedText>
            </View>
            <ThemedText style={styles.title}>{name}</ThemedText>
            <ThemedText style={styles.subtitle}>{product?.shop ? `${product.shop} · ` : ''}{product?.freeShipping ? '全店包邮 · ' : ''}{product?.shippingFrom ? `${product.shippingFrom}发货 · ` : ''}支持7天无理由退换</ThemedText>
          </View>

          <Pressable style={styles.card} onPress={() => setCouponSheetVisible(true)}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.sectionTitle}>优惠</ThemedText>
              <ThemedText style={styles.more}>领券 ›</ThemedText>
            </View>
            <View style={styles.couponRow}>
              {marketCoupons.length ? (
                marketCoupons.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.coupon}>
                    <ThemedText style={styles.couponText}>
                      {item.threshold > 0 ? `满${formatPrice(item.threshold)}` : '无门槛'}减{formatPrice(item.discount)}
                    </ThemedText>
                  </View>
                ))
              ) : (
                <View key="empty-coupon" style={styles.coupon}><ThemedText style={styles.couponText}>暂无可领券</ThemedText></View>
              )}
            </View>
          </Pressable>

          <View style={styles.card}>
            <ThemedText style={styles.sectionTitle}>商品参数</ThemedText>
            {productSpecs.map((item) => (
              <View key={item} style={styles.specRow}>
                <ThemedText style={styles.specText}>{item}</ThemedText>
              </View>
            ))}
          </View>

          <View
            style={styles.card}
            onLayout={(event) => {
              sectionY.current.评价 = event.nativeEvent.layout.y;
            }}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.sectionTitle}>买家评价</ThemedText>
              <ThemedText style={styles.more}>全部 {reviews.length} ›</ThemedText>
            </View>
            {reviews.length ? reviews.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.commentRow}>
                <View style={styles.avatar}>
                  <Image source={avatarSource(item.userAvatarUrl)} style={styles.avatarImage} contentFit="cover" />
                </View>
                <View style={styles.commentTextWrap}>
                  <View style={styles.commentHeaderRow}>
                    <ThemedText style={styles.commentName}>{item.userName}</ThemedText>
                    <ThemedText style={styles.commentDate}>{item.createdAt}</ThemedText>
                  </View>
                  <ThemedText style={styles.commentStars}>{'★'.repeat(Math.max(1, Math.min(5, item.rating)))}</ThemedText>
                  <ThemedText style={styles.commentText}>{item.content}</ThemedText>
                  {item.merchantReply ? (
                    <View style={styles.merchantReply}>
                      <View style={styles.merchantReplyHeader}>
                        <ThemedText style={styles.merchantReplyTag}>商家回复</ThemedText>
                        <ThemedText style={styles.merchantReplyName}>{item.merchantReply.shopName}</ThemedText>
                      </View>
                      <ThemedText style={styles.merchantReplyText}>{item.merchantReply.content}</ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            )) : (
              <View style={styles.commentEmpty}>
                <ThemedText style={styles.commentEmptyText}>暂无买家评价</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <ThemedText style={styles.sectionTitle}>为你推荐</ThemedText>
            <View style={styles.recommendGrid}>
              {recommendProducts.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.recommendItem}
                  onPress={() =>
                    router.push({
                      pathname: '/product/[id]',
                      params: { id: String(item.id), name: item.name, price: String(item.price), sold: item.soldText },
                    })
                  }>
                  <View style={styles.recommendImage}>
                    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.recommendPhoto} contentFit="cover" /> : <PictureIcon width={34} height={34} color="#D2D6DD" />}
                  </View>
                  <ThemedText numberOfLines={2} style={styles.recommendText}>{item.name}</ThemedText>
                  <View style={styles.recommendMeta}>
                    <ThemedText style={styles.recommendPrice}>¥{formatPrice(item.price)}</ThemedText>
                    <ThemedText style={styles.recommendSold}>已售 {item.soldText}</ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View
            style={styles.detailTitleWrap}
            onLayout={(event) => {
              sectionY.current.详情 = event.nativeEvent.layout.y;
            }}>
            <ThemedText style={styles.detailTitle}>商品详情</ThemedText>
          </View>

          {(detailImages.length ? detailImages : [undefined, undefined, undefined]).map((item, index) => (
            <View key={item || index} style={styles.detailImage}>
              {item ? <Image source={{ uri: item }} style={styles.detailPhoto} contentFit="cover" /> : <PictureIcon width={96} height={96} color="#C7CCD4" />}
            </View>
          ))}
        </Animated.ScrollView>

        <View pointerEvents={topBarVisible ? 'auto' : 'none'} style={styles.topBarWrap}>
          <Animated.View style={[styles.topBarBg, { opacity: topBarOpacity }]} />
          <Animated.View style={[styles.topBar, { opacity: topBarOpacity }]}>
            <Pressable hitSlop={12} style={styles.topBarIconBtn} onPress={goBack}>
              <BackIcon width={23} height={23} color="#20242B" />
            </Pressable>
            <View style={styles.topTabs}>
              {topTabs.map((item) => (
                <Pressable key={item} style={styles.topTab} onPress={() => scrollToSection(item)}>
                  <ThemedText style={[styles.topTabText, activeTab === item && styles.topTabTextActive]}>{item}</ThemedText>
                  {activeTab === item ? <View style={styles.topTabLine} /> : null}
                </Pressable>
              ))}
            </View>
            <View style={styles.topActions}>
              <Pressable hitSlop={10} style={styles.topBarIconBtn} onPress={() => router.push('/cart')}>
                <CartIcon width={22} height={22} color="#20242B" />
              </Pressable>
              <Pressable hitSlop={10} style={styles.topBarIconBtn}>
                <ShareIcon width={22} height={22} color="#20242B" />
              </Pressable>
            </View>
          </Animated.View>
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            style={styles.bottomTool}
            onPress={() =>
              router.push({
                pathname: '/shop/[id]',
                params: { id: String(product?.shopId || 0), name: product?.shop || '店铺' },
              })
            }>
            <ShopIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>店铺</ThemedText>
          </Pressable>
          <Pressable
            style={styles.bottomTool}
            onPress={() =>
              router.push({
                pathname: '/product-service',
                params: {
                  productId: String(product?.id || params.id || ''),
                  shopId: String(product?.shopId || ''),
                  shop: product?.shop || '店铺客服',
                  name,
                  price,
                  imageUrl: selectedImage || heroImages[0] || '',
                  orderStatus: '未购买',
                },
              })
            }>
            <CustomerServiceIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>客服</ThemedText>
          </Pressable>
          <Pressable style={styles.bottomTool} onPress={() => router.push('/cart')}>
            <CartIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>购物车</ThemedText>
          </Pressable>
          <View style={styles.buyCapsule}>
            <Pressable style={styles.capsuleHalfLeft} onPress={() => setCartSheetVisible(true)}>
              <ThemedText style={styles.capsuleText}>加入购物车</ThemedText>
            </Pressable>
            <Pressable style={styles.capsuleHalfRight} onPress={() => void openBuySheet()}>
              <ThemedText style={styles.capsuleText}>立即购买</ThemedText>
            </Pressable>
          </View>
        </View>

        <Modal visible={cartSheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => setCartSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setCartSheetVisible(false)} />
            <Animated.View style={[styles.cartSheet, { transform: [{ translateY: cartSheetTranslateY }] }]}>
              <View style={styles.cartSheetHandle} />
              <View style={styles.cartSheetHeader}>
                <ThemedText style={styles.cartSheetTitle}>选择规格</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setCartSheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.sheetServiceRow}>
                <ThemedText style={styles.serviceText}>退货包运费</ThemedText>
                <ThemedText style={styles.serviceText}>极速退款</ThemedText>
                <ThemedText style={styles.serviceText}>7天无理由退货</ThemedText>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cartSheetContent}>
                <View style={styles.sheetProductRow}>
                  <View style={styles.sheetProductImage}>
                    {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.sheetPhoto} contentFit="cover" /> : <PictureIcon width={42} height={42} color="#C6CBD3" />}
                  </View>
                  <View style={styles.sheetProductInfo}>
                    <View style={styles.sheetPriceRow}>
                      <ThemedText style={styles.preSaleText}>到手价</ThemedText>
                      <ThemedText style={styles.sheetPrice}>¥{selectedPrice}</ThemedText>
                      <ThemedText style={styles.originPrice}>¥{selectedOriginPrice}</ThemedText>
                    </View>
                    <ThemedText numberOfLines={1} style={styles.couponHint}>已选 {selectedSpecText}</ThemedText>
                  </View>
                  <View style={styles.quantityRow}>
                    <ThemedText style={styles.limitText}>{product?.purchaseLimit ? `限购${product.purchaseLimit}件` : `库存${selectedStock}件`}</ThemedText>
                    <Pressable style={styles.quantityBtn} onPress={() => changeQuantity(-1)}><ThemedText style={styles.quantityBtnText}>−</ThemedText></Pressable>
                    <View style={styles.quantityValue}><ThemedText style={styles.quantityValueText}>{quantity}</ThemedText></View>
                    <Pressable style={styles.quantityBtn} onPress={() => changeQuantity(1)}><ThemedText style={styles.quantityBtnText}>＋</ThemedText></Pressable>
                  </View>
                </View>

                <View style={styles.specBlock}>
                  {specGroups.map((group) => (
                    <View key={group.name} style={styles.specGroup}>
                      <View style={styles.optionHeader}>
                        <ThemedText style={styles.optionTitle}>{group.name}</ThemedText>
                        <ThemedText style={styles.optionList}>{selectedSpecMap[group.name] || '请选择'}</ThemedText>
                      </View>
                      <View style={styles.skuGrid}>
                        {group.values.map((item) => {
                          const active = selectedSpecMap[group.name] === item.value;
                          return (
                            <Pressable key={`${group.name}-${item.value}`} style={[styles.skuOption, active && styles.skuOptionActive]} onPress={() => handleSelectSpec(group.name, item.value)}>
                              <View style={styles.skuOptionImage}>
                                {item.imageUrl || selectedImage ? <Image source={{ uri: item.imageUrl || selectedImage }} style={styles.sheetPhoto} contentFit="cover" /> : <PictureIcon width={26} height={26} color="#BFC4CC" />}
                              </View>
                              <ThemedText numberOfLines={1} style={[styles.skuOptionText, active && styles.optionActiveText]}>{item.value}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <View style={styles.stockLine}>
                    <ThemedText style={styles.stockText}>库存 {selectedStock} 件</ThemedText>
                    {product?.purchaseLimit ? <ThemedText style={styles.stockText}>限购 {product.purchaseLimit} 件</ThemedText> : null}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.sheetFooter}>
                <View style={styles.footerSummary}>
                  <ThemedText numberOfLines={1} style={styles.footerHint}>已选 {selectedSpecText}</ThemedText>
                  <ThemedText style={styles.footerPrice}>¥{selectedPrice} × {quantity}</ThemedText>
                </View>
                <Pressable style={styles.sheetCartBtn} onPress={handleAddCart}>
                  <ThemedText style={styles.sheetCartText}>加入购物车</ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={buySheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => setBuySheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setBuySheetVisible(false)} />
            <Animated.View style={[styles.buySheet, { transform: [{ translateY: buySheetTranslateY }] }]}>
              <View style={styles.buyServiceRow}>
                <ThemedText style={styles.serviceText}>退货包运费</ThemedText>
                <ThemedText style={styles.serviceText}>7天无理由退货</ThemedText>
                <ThemedText style={styles.serviceText}>极速退款</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setBuySheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.buyContent}>
                <Pressable style={styles.addressRow} onPress={handlePressBuyAddress}>
                  <ThemedText style={styles.addressIcon}>⊙</ThemedText>
                  <View style={styles.addressInfo}>
                    {selectedAddress ? (
                      <>
                        <ThemedText numberOfLines={1} style={styles.addressTitle}>{selectedAddress.name} {selectedAddress.detail}</ThemedText>
                        <ThemedText numberOfLines={1} style={styles.addressMeta}>{selectedAddress.region}　{maskPhone(selectedAddress.phone)}</ThemedText>
                      </>
                    ) : (
                      <>
                        <ThemedText numberOfLines={1} style={styles.addressTitle}>去设置地址</ThemedText>
                        <ThemedText style={styles.addressMeta}>请先添加或设置默认收货地址</ThemedText>
                      </>
                    )}
                  </View>
                  <ThemedText style={styles.addressArrow}>›</ThemedText>
                </Pressable>

                <View style={styles.buyProductRow}>
                  <View style={styles.buyProductImage}>
                    {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.sheetPhoto} contentFit="cover" /> : <PictureIcon width={42} height={42} color="#C6CBD3" />}
                  </View>
                  <View style={styles.buyProductInfo}>
                    <View style={styles.sheetPriceRow}>
                      <ThemedText style={styles.preSaleText}>实付</ThemedText>
                      <ThemedText style={styles.sheetPrice}>¥{selectedPrice}</ThemedText>
                    </View>
                    <ThemedText numberOfLines={1} style={styles.buyDetailLink}>已选 {selectedSpecText}</ThemedText>
                  </View>
                  <View style={styles.quantityRowCompact}>
                    <ThemedText style={styles.limitText}>{product?.purchaseLimit ? `限购${product.purchaseLimit}件` : `库存${selectedStock}件`}</ThemedText>
                    <Pressable style={styles.quantityBtn} onPress={() => changeQuantity(-1)}><ThemedText style={styles.quantityBtnText}>−</ThemedText></Pressable>
                    <View style={styles.quantityValue}><ThemedText style={styles.quantityValueText}>{quantity}</ThemedText></View>
                    <Pressable style={styles.quantityBtn} onPress={() => changeQuantity(1)}><ThemedText style={styles.quantityBtnText}>＋</ThemedText></Pressable>
                  </View>
                </View>

                <View style={styles.specBlock}>
                  {specGroups.map((group) => (
                    <View key={group.name} style={styles.specGroup}>
                      <View style={styles.buyOptionHeader}>
                        <ThemedText style={styles.optionTitle}>{group.name}</ThemedText>
                        <ThemedText style={styles.optionList}>{selectedSpecMap[group.name] || '请选择'}</ThemedText>
                      </View>
                      <View style={styles.skuGrid}>
                        {group.values.map((item) => {
                          const active = selectedSpecMap[group.name] === item.value;
                          return (
                            <Pressable key={`${group.name}-${item.value}`} style={[styles.skuOption, active && styles.skuOptionActive]} onPress={() => handleSelectSpec(group.name, item.value)}>
                              <View style={styles.skuOptionImage}>
                                {item.imageUrl || selectedImage ? <Image source={{ uri: item.imageUrl || selectedImage }} style={styles.sheetPhoto} contentFit="cover" /> : <PictureIcon width={26} height={26} color="#BFC4CC" />}
                              </View>
                              <ThemedText numberOfLines={1} style={[styles.skuOptionText, active && styles.optionActiveText]}>{item.value}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <View style={styles.stockLine}>
                    <ThemedText style={styles.stockText}>库存 {selectedStock} 件</ThemedText>
                    {product?.purchaseLimit ? <ThemedText style={styles.stockText}>限购 {product.purchaseLimit} 件</ThemedText> : null}
                  </View>
                </View>

                <View style={styles.buyLineRow}>
                  <ThemedText style={styles.buyLineTitle}>退货包运费 ⓘ</ThemedText>
                  <ThemedText style={styles.buyLineValue}>商家赠送，可抵1公斤退货运费</ThemedText>
                </View>
                <Pressable style={styles.buyLineRow} onPress={() => setCouponSheetVisible(true)}>
                  <ThemedText style={styles.buyLineTitle}>优惠券</ThemedText>
                  <ThemedText numberOfLines={1} style={buyCouponCalculation.totalDiscount > 0 ? styles.buyLineCouponValue : styles.buyLinePlaceholder}>
                    {buyCouponCalculation.totalDiscount > 0 ? `已减 ¥${formatPrice(buyCouponCalculation.totalDiscount)} ›` : buyCoupons.length ? `${buyCoupons.length}张可用 ›` : '暂无可用优惠券 ›'}
                  </ThemedText>
                </Pressable>
                <Pressable style={styles.buyLineRow} onPress={() => setRemarkSheetVisible(true)}>
                  <ThemedText style={styles.buyLineTitle}>备注</ThemedText>
                  <ThemedText numberOfLines={1} style={styles.buyLinePlaceholder}>{remark || '与商家协商一致后留言 ›'}</ThemedText>
                </Pressable>

                <View style={styles.paymentPanel}>
                  {paymentOptions.map((item) => (
                    <Pressable key={item.id} style={styles.paymentRow}>
                      <View style={[styles.paymentIcon, { backgroundColor: item.color }]} />
                      <View style={styles.paymentTextWrap}>
                        <ThemedText style={styles.paymentTitle}>{item.title}</ThemedText>
                        {item.subtitle ? <ThemedText style={styles.paymentSubtitle}>{item.subtitle}</ThemedText> : null}
                      </View>
                      <View style={[styles.radioOuter, item.active && styles.radioOuterActive]}>
                        {item.active ? <View style={styles.radioInner} /> : null}
                      </View>
                    </Pressable>
                  ))}
                  <ThemedText style={styles.morePayText}>更多支付方式⌄</ThemedText>
                </View>
              </ScrollView>

              <View style={styles.buyFooter}>
                <Pressable style={styles.payBtn} onPress={handleBuyPay}>
                  <ThemedText style={styles.payBtnText}>立即支付 ¥{payableAmount}</ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={payDialogVisible} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={() => setPayDialogVisible(false)}>
          <View style={styles.payDialogOverlay}>
            <Pressable style={styles.payDialogBackdrop} onPress={() => setPayDialogVisible(false)} />
            <View style={styles.payDialog}>
              <ThemedText style={styles.payDialogTitle}>模拟支付</ThemedText>
              <ThemedText style={styles.payDialogMessage}>请选择本次订单支付状态</ThemedText>
              <View style={styles.payDialogActions}>
                <Pressable style={styles.payDialogPlainBtn} onPress={() => setPayDialogVisible(false)}>
                  <ThemedText style={styles.payDialogPlainText}>取消</ThemedText>
                </Pressable>
                <Pressable style={styles.payDialogPlainBtn} onPress={() => handlePayChoice(false)}>
                  <ThemedText style={styles.payDialogPlainText}>未支付</ThemedText>
                </Pressable>
                <Pressable style={styles.payDialogPrimaryBtn} onPress={() => handlePayChoice(true)}>
                  <ThemedText style={styles.payDialogPrimaryText}>已支付</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={addressSheetVisible} transparent animationType="slide" onRequestClose={() => setAddressSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setAddressSheetVisible(false)} />
            <View style={styles.addressSheet}>
              <View style={styles.addressSheetHeader}>
                <Pressable hitSlop={12} style={styles.addressBackBtn} onPress={() => setAddressSheetVisible(false)}>
                  <BackIcon width={24} height={24} color="#20242B" />
                </Pressable>
                <ThemedText style={styles.addressSheetTitle}>地址列表</ThemedText>
                <View style={styles.addressBackBtn} />
              </View>
              {addressItems.length ? (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.addressListContent}>
                  {addressItems.map((item) => {
                    const active = selectedAddress?.id === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.addressCard, active && styles.addressCardActive]}
                        onPress={() => {
                          setSelectedAddressId(item.id);
                          setAddressSheetVisible(false);
                        }}>
                        <View style={styles.addressTopRow}>
                          <ThemedText style={styles.addressRegion}>{item.region}</ThemedText>
                          {active ? <ThemedText style={styles.selectedMark}>✓</ThemedText> : null}
                        </View>
                        <ThemedText style={styles.addressMain}>{item.detail}</ThemedText>
                        <View style={styles.addressPhoneRow}>
                          <ThemedText style={styles.addressPhone}>{item.name} {maskPhone(item.phone)}</ThemedText>
                        </View>
                        <View style={styles.addressActions}>
                          <Pressable
                            style={styles.defaultAddressBtn}
                            onPress={(event) => {
                              event.stopPropagation();
                              void handleSetDefaultAddress(item.id);
                            }}>
                            <View style={[styles.defaultDot, item.isDefault && styles.defaultDotActive]} />
                            <ThemedText style={[styles.defaultText, item.isDefault && styles.defaultTextActive]}>{item.isDefault ? '默认地址' : '设为默认'}</ThemedText>
                          </Pressable>
                          <ThemedText style={styles.addressSelectHint}>{active ? '当前使用' : '点击切换'}</ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.addressEmpty}>
                  <ThemedText style={styles.addressEmptyTitle}>暂无默认地址</ThemedText>
                  <ThemedText style={styles.addressEmptyText}>请先添加或设置默认收货地址</ThemedText>
                </View>
              )}
              <View style={styles.addressFooter}>
                <Pressable
                  style={styles.addAddressBtn}
                  onPress={() => {
                    setAddressSheetVisible(false);
                    setBuySheetVisible(false);
                    router.push('/address-list');
                  }}>
                  <ThemedText style={styles.payBtnText}>{defaultAddress ? '管理地址' : '去设置地址'}</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={couponSheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => setCouponSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setCouponSheetVisible(false)} />
            <Animated.View style={[styles.couponSheet, { transform: [{ translateY: couponSheetTranslateY }] }]}>
              <View style={styles.couponSheetHeader}>
                <View style={styles.couponCloseSpace} />
                <ThemedText style={styles.couponSheetTitle}>优惠明细</ThemedText>
                <Pressable hitSlop={10} style={styles.couponCloseBtn} onPress={() => setCouponSheetVisible(false)}>
                  <ThemedText style={styles.couponCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.couponSheetContent}>
                {couponSheetCoupons.length ? (
                  <>
                    <ThemedText style={styles.couponGroupTitle}>{buySheetVisible ? `当前订单已优惠¥${formatPrice(buyCouponCalculation.totalDiscount)}` : `领券可再减¥${formatPrice(couponSheetMaxDiscount)}`}</ThemedText>
                    {couponSheetCoupons.map((item) => {
                      const received = receivedCouponIds.includes(item.id);
                      const level = couponLevelOf(item);
                      const testCalculation = calculateCoupons(buyCouponLines, buyCoupons, { ...buyCouponCalculation.selected, [level]: item.id });
                      const usable = buySheetVisible
                        ? testCalculation.selected[level] === item.id && testCalculation.discounts[level] > 0
                        : orderSubtotal >= Number(item.threshold || 0);
                      const selected = buySheetVisible ? Object.values(buyCouponCalculation.selected).includes(item.id) : false;
                      const canReceive = !received && (item.unlimitedCount || item.remainingCount > 0);
                      const actionText = buySheetVisible
                        ? selected
                          ? '已选'
                          : usable
                            ? '可用'
                            : '不可用'
                        : received
                          ? '已领取'
                          : '领取';
                      return (
                        <View key={item.id} style={styles.couponTicket}>
                          <View style={styles.couponTicketLeft}>
                            <View style={styles.couponAmountRow}>
                              <ThemedText style={styles.couponCurrency}>¥</ThemedText>
                              <ThemedText style={styles.couponAmount}>{formatPrice(item.discount)}</ThemedText>
                            </View>
                            <ThemedText style={styles.couponThreshold}>{item.thresholdText}</ThemedText>
                          </View>
                          <View style={styles.couponTicketRight}>
                            <View style={styles.couponTitleRow}>
                              <View style={styles.couponTag}>
                                <ThemedText style={styles.couponTagText}>{item.scope === 'product' ? '商品券' : item.scope === 'platform' ? '平台券' : '商家券'}</ThemedText>
                              </View>
                              <ThemedText numberOfLines={1} style={styles.couponTicketTitle}>{item.title}</ThemedText>
                            </View>
                            <ThemedText numberOfLines={1} style={styles.couponDesc}>
                              {item.endAt ? `${item.endAt} 前有效` : '长期有效'} · {item.unlimitedCount ? '数量不限' : `剩余${item.remainingCount}张`}
                            </ThemedText>
                            <Pressable
                              style={[
                                styles.couponActionBtn,
                                buySheetVisible
                                  ? !usable && styles.couponActionBtnDisabled
                                  : !canReceive && styles.couponActionBtnDisabled,
                                selected && styles.couponActionBtnSelected,
                              ]}
                              onPress={() => {
                                if (buySheetVisible) {
                                  return;
                                }
                                if (!canReceive) return;
                                void handleReceiveCoupon(item);
                              }}>
                              <ThemedText style={styles.couponActionText}>{actionText}</ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <View style={styles.couponEmpty}>
                    <ThemedText style={styles.couponEmptyTitle}>暂无可领取优惠券</ThemedText>
                    <ThemedText style={styles.couponEmptyText}>商家还没有为该商品配置可用优惠券</ThemedText>
                  </View>
                )}

                <ThemedText style={styles.couponNote}>以上优惠为系统根据单件商品可享受活动/优惠的预估值，最终价格以下单为准</ThemedText>
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={remarkSheetVisible} transparent animationType="slide" onRequestClose={() => setRemarkSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setRemarkSheetVisible(false)} />
            <View style={styles.remarkSheet}>
              <View style={styles.remarkHeader}>
                <View style={styles.sheetClose} />
                <ThemedText style={styles.remarkTitle}>备注</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setRemarkSheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.remarkInputWrap}>
                <TextInput
                  value={remark}
                  onChangeText={(text) => setRemark(text.slice(0, 100))}
                  multiline
                  maxLength={100}
                  placeholder="选填，建议先与商家协商一致"
                  placeholderTextColor="#A2A6AE"
                  style={styles.remarkInput}
                />
                <ThemedText style={styles.remarkCounter}>{remark.length}/100</ThemedText>
              </View>
              <View style={styles.remarkFooter}>
                <Pressable style={styles.payBtn} onPress={() => setRemarkSheetVisible(false)}>
                  <ThemedText style={styles.payBtnText}>提交</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F6' },
  root: { flex: 1, backgroundColor: '#F5F5F6' },
  content: { paddingBottom: 76 },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: '#20242B',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroCarousel: { width: '100%', height: '100%' },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 20,
    elevation: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  heroIconBtn: {
    position: 'absolute',
    top: 10,
    zIndex: 20,
    elevation: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  favoriteBtn: { right: 12 },
  favoriteBtnActive: { backgroundColor: '#FFF1F4' },
  heroCounter: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    zIndex: 10,
    elevation: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  heroCounterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  topBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
  },
  topBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topBarIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTabs: {
    flex: 1,
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  topTab: {
    height: TOP_BAR_HEIGHT,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  topTabText: { fontSize: 15, color: '#5F6570', fontWeight: '700' },
  topTabTextActive: { color: '#191D24', fontWeight: '900' },
  topTabLine: {
    position: 'absolute',
    bottom: 6,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F02D47',
  },
  topActions: { width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  card: { marginTop: 8, backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  price: { fontSize: 24, color: '#F02D47', fontWeight: '900' },
  sold: { fontSize: 12, color: '#8E939C', fontWeight: '600' },
  title: { fontSize: 17, lineHeight: 24, color: '#191D24', fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#8B9098' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, color: '#20242B', fontWeight: '800' },
  more: { fontSize: 12, color: '#90959E', fontWeight: '600' },
  couponRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  coupon: { borderRadius: 4, backgroundColor: '#FFF1F3', paddingHorizontal: 8, paddingVertical: 5 },
  couponText: { color: '#F02D47', fontSize: 12, fontWeight: '700' },
  specRow: { minHeight: 28, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  specText: { fontSize: 13, color: '#5F6570', fontWeight: '600' },
  commentRow: { flexDirection: 'row', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F2F3F5', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  commentTextWrap: { flex: 1, gap: 4 },
  commentHeaderRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  commentName: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  commentDate: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
  commentStars: { fontSize: 12, color: '#FFB31A', fontWeight: '900' },
  commentText: { fontSize: 13, lineHeight: 19, color: '#2C3038' },
  merchantReply: { marginTop: 6, borderRadius: 6, padding: 9, backgroundColor: '#F6F7F9', gap: 5 },
  merchantReplyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  merchantReplyTag: { height: 20, borderRadius: 3, paddingHorizontal: 6, textAlignVertical: 'center', overflow: 'hidden', fontSize: 11, color: '#FFF', fontWeight: '900', backgroundColor: '#F02D47' },
  merchantReplyName: { flex: 1, fontSize: 12, color: '#555B66', fontWeight: '800' },
  merchantReplyText: { fontSize: 12, lineHeight: 18, color: '#343941', fontWeight: '600' },
  commentEmpty: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  commentEmptyText: { fontSize: 13, color: '#9EA3AA', fontWeight: '700' },
  recommendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recommendItem: { width: '47%', gap: 6 },
  recommendImage: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F2F3F5', alignItems: 'center', justifyContent: 'center' },
  recommendPhoto: { width: '100%', height: '100%' },
  recommendText: { fontSize: 12, lineHeight: 17, color: '#323741', fontWeight: '600' },
  recommendMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  recommendPrice: { fontSize: 15, color: '#F02D47', fontWeight: '900' },
  recommendSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
  detailTitleWrap: { height: 44, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontSize: 14, color: '#777D87', fontWeight: '700' },
  detailImage: { height: 420, marginBottom: 8, backgroundColor: '#20242B', alignItems: 'center', justifyContent: 'center' },
  detailPhoto: { width: '100%', height: '100%' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    paddingHorizontal: 8,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEEEE',
  },
  bottomTool: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomToolText: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  buyCapsule: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    flexDirection: 'row',
    marginLeft: 4,
  },
  capsuleHalfLeft: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF8A18' },
  capsuleHalfRight: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  capsuleText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  cartSheet: {
    height: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  cartSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginTop: 8, backgroundColor: '#D9DDE3' },
  cartSheetHeader: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cartSheetTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  cartSheetContent: { paddingBottom: 124 },
  sheetServiceRow: {
    minHeight: 36,
    paddingLeft: 16,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F7FBF9',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#EDF3F0',
  },
  serviceText: { fontSize: 12, color: '#558B76', fontWeight: '700' },
  sheetClose: { position: 'absolute', right: 10, top: 6, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 28, lineHeight: 30, color: '#454A52', fontWeight: '300' },
  sheetProductRow: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#FAFBFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECEFF3',
  },
  sheetProductImage: { width: 78, height: 78, borderRadius: 6, overflow: 'hidden', backgroundColor: '#DCE2EA', alignItems: 'center', justifyContent: 'center' },
  sheetPhoto: { width: '100%', height: '100%', borderRadius: 6 },
  sheetProductInfo: { flex: 1, paddingTop: 2, gap: 5 },
  sheetPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  preSaleText: { fontSize: 13, color: '#D63C58', fontWeight: '800' },
  sheetPrice: { fontSize: 24, color: '#D63C58', fontWeight: '900' },
  originPrice: { fontSize: 14, color: '#7C838D', fontWeight: '600' },
  couponHint: { fontSize: 12, color: '#D63C58', fontWeight: '700' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', paddingTop: 50 },
  limitText: { fontSize: 11, color: '#9EA3AA', fontWeight: '700', marginRight: 8 },
  quantityBtn: { width: 30, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F5' },
  quantityBtnText: { fontSize: 16, color: '#333943', fontWeight: '700' },
  quantityValue: { width: 36, height: 26, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  quantityValueText: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  optionHeader: { paddingHorizontal: 16, paddingTop: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontSize: 14, color: '#20242B', fontWeight: '800' },
  optionList: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  colorGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  colorOption: {
    width: 104,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#F5F5F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F5F5F6',
  },
  colorOptionActive: { backgroundColor: '#FFF4F6', borderColor: '#F0B5C0' },
  colorImage: { height: 94, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE2EA' },
  colorTitle: { marginTop: 6, paddingHorizontal: 7, fontSize: 12, color: '#555B66', fontWeight: '700' },
  colorSubtitle: { paddingHorizontal: 7, paddingBottom: 8, fontSize: 11, color: '#777D87', fontWeight: '600' },
  optionActiveText: { color: '#D63C58' },
  specBlock: { paddingHorizontal: 14, paddingTop: 14, gap: 16 },
  specGroup: { gap: 10 },
  skuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skuOption: {
    minWidth: 104,
    maxWidth: 156,
    minHeight: 38,
    borderRadius: 7,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#F6F6F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F6F6F7',
  },
  skuOptionActive: { backgroundColor: '#FFF4F6', borderColor: '#F0B5C0' },
  skuOptionImage: { width: 38, height: 38, marginRight: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE2EA' },
  skuOptionText: { flexShrink: 1, fontSize: 12, color: '#555B66', fontWeight: '800' },
  stockLine: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  stockText: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
  packageBlock: { paddingHorizontal: 16, paddingTop: 24 },
  packageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10 },
  packageOption: { minHeight: 34, borderRadius: 5, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  packageOptionActive: { backgroundColor: '#FFF1F4', borderWidth: StyleSheet.hairlineWidth, borderColor: '#F0B5C0' },
  packageText: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  sheetFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 102,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F1F1',
    gap: 10,
  },
  footerSummary: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footerHint: { flex: 1, fontSize: 12, color: '#555B66', fontWeight: '700' },
  footerPrice: { fontSize: 13, color: '#D63C58', fontWeight: '900' },
  sheetCartBtn: { width: '100%', height: 46, borderRadius: 23, backgroundColor: '#F02D47', alignItems: 'center', justifyContent: 'center' },
  sheetCartText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  buySheet: {
    maxHeight: '92%',
    minHeight: 640,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  buyServiceRow: {
    height: 42,
    paddingLeft: 54,
    paddingRight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  buyContent: { paddingBottom: 18 },
  addressRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2F2F2',
  },
  addressIcon: { fontSize: 17, color: '#555B66', fontWeight: '800' },
  addressInfo: { flex: 1, gap: 7 },
  addressTitle: { fontSize: 14, color: '#20242B', fontWeight: '900' },
  addressMeta: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  addressArrow: { fontSize: 22, color: '#A2A6AE', lineHeight: 24 },
  buyProductRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 18, alignItems: 'flex-start' },
  buyProductImage: { width: 72, height: 72, borderRadius: 4, backgroundColor: '#DCE2EA', alignItems: 'center', justifyContent: 'center' },
  buyProductInfo: { flex: 1, gap: 5, paddingTop: 2 },
  buyDetailLink: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  quantityRowCompact: { flexDirection: 'row', alignItems: 'center', paddingTop: 50 },
  buyOptionHeader: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  buyColorGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  buyColorOption: {
    flex: 1,
    maxWidth: 104,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#F6F6F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F6F6F7',
  },
  buyColorOptionActive: { backgroundColor: '#FFF4F6', borderColor: '#F0B5C0' },
  buyColorImage: { height: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE2EA' },
  buyColorText: { height: 32, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, color: '#555B66', fontWeight: '800' },
  buySection: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  sizePill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 5,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F4',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0B5C0',
  },
  buyLineRow: {
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  buyLineTitle: { fontSize: 14, color: '#343941', fontWeight: '800' },
  buyLineValue: { flex: 1, textAlign: 'right', fontSize: 13, color: '#343941', fontWeight: '700' },
  buyLineCouponValue: { flex: 1, textAlign: 'right', fontSize: 13, color: '#F02D47', fontWeight: '800' },
  buyLinePlaceholder: { flex: 1, textAlign: 'right', fontSize: 13, color: '#A2A6AE', fontWeight: '700' },
  paymentPanel: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 8,
    borderTopColor: '#F6F6F7',
  },
  paymentRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentIcon: { width: 18, height: 18, borderRadius: 9 },
  paymentTextWrap: { flex: 1, gap: 2 },
  paymentTitle: { fontSize: 14, color: '#343941', fontWeight: '800' },
  paymentSubtitle: { fontSize: 11, color: '#9EA3AA', fontWeight: '700' },
  radioOuter: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: '#D7DAE0', alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  radioInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  morePayText: { alignSelf: 'center', paddingTop: 3, paddingBottom: 8, fontSize: 13, color: '#777D87', fontWeight: '700' },
  buyFooter: {
    paddingHorizontal: 50,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F1F1',
  },
  payBtn: { height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  payBtnText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  payDialogOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 2147483647, elevation: 2147483647 },
  payDialogBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)' },
  payDialog: { width: '82%', borderRadius: 12, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: '#FFF' },
  payDialogTitle: { textAlign: 'center', fontSize: 18, color: '#20242B', fontWeight: '900' },
  payDialogMessage: { marginTop: 10, textAlign: 'center', fontSize: 14, lineHeight: 20, color: '#555B66', fontWeight: '700' },
  payDialogActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  payDialogPlainBtn: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  payDialogPlainText: { fontSize: 14, color: '#30343B', fontWeight: '900' },
  payDialogPrimaryBtn: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  payDialogPrimaryText: { fontSize: 14, color: '#FFF', fontWeight: '900' },
  addressSheet: {
    height: '78%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  addressSheetHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  addressBackBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  addressSheetTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  addressListContent: { paddingBottom: 96 },
  addressCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F1F3',
  },
  addressCardActive: { borderColor: '#F0B5C0', backgroundColor: '#FFF8FA' },
  addressTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  addressRegion: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
  addressMain: { marginTop: 8, fontSize: 15, color: '#20242B', fontWeight: '900' },
  addressPhoneRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addressPhone: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  selectedMark: { fontSize: 20, color: '#D63C58', fontWeight: '800' },
  addressActions: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaultAddressBtn: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7 },
  defaultDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D7DAE0' },
  defaultDotActive: { borderColor: '#D63C58', backgroundColor: '#D63C58' },
  defaultText: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  defaultTextActive: { color: '#D63C58' },
  addressSelectHint: { marginLeft: 'auto', fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  addressActionText: { marginLeft: 'auto', fontSize: 12, color: '#8B9098', fontWeight: '700' },
  addressEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addressEmptyTitle: { fontSize: 15, color: '#20242B', fontWeight: '900' },
  addressEmptyText: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
  addressFooter: { marginTop: 'auto', paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
  addAddressBtn: { height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  couponSheet: {
    height: '76%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  couponSheetHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  couponCloseSpace: { width: 40 },
  couponSheetTitle: { fontSize: 18, color: '#2A2D33', fontWeight: '800' },
  couponCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  couponCloseText: { fontSize: 34, lineHeight: 36, color: '#4B4F56', fontWeight: '300' },
  couponSheetContent: { paddingHorizontal: 14, paddingBottom: 26 },
  couponGroupTitle: { marginTop: 12, marginBottom: 12, fontSize: 16, color: '#555B66', fontWeight: '800' },
  couponTicket: {
    minHeight: 94,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F1F3',
  },
  couponTicketLeft: {
    width: 98,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#F1E5E8',
  },
  couponAmountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  couponCurrency: { fontSize: 18, color: '#F02D47', fontWeight: '700' },
  couponAmount: { fontSize: 30, color: '#F02D47', fontWeight: '500' },
  couponThreshold: { marginTop: 5, fontSize: 12, color: '#D63C58', fontWeight: '700' },
  couponTicketRight: { flex: 1, minHeight: 94, paddingLeft: 14, paddingRight: 18, justifyContent: 'center', position: 'relative', gap: 9 },
  couponTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 94 },
  couponTag: { height: 22, borderRadius: 2, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D5D8DE' },
  couponTagText: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  couponTicketTitle: { flex: 1, fontSize: 15, color: '#343941', fontWeight: '800' },
  couponDesc: { fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  couponActionBtn: { position: 'absolute', right: 16, top: 32, height: 34, minWidth: 74, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  couponActionBtnDisabled: { backgroundColor: '#C9CDD4' },
  couponActionBtnSelected: { backgroundColor: '#D63C58' },
  couponActionText: { fontSize: 14, color: '#FFF', fontWeight: '900' },
  couponOnlyText: { position: 'absolute', right: 18, top: 38, fontSize: 14, color: '#555B66', fontWeight: '800' },
  couponEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  couponEmptyTitle: { fontSize: 15, color: '#20242B', fontWeight: '900' },
  couponEmptyText: { fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  couponNote: { marginTop: 78, paddingHorizontal: 34, textAlign: 'center', fontSize: 12, lineHeight: 19, color: '#C0C4CC', fontWeight: '700' },
  remarkSheet: {
    height: '78%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  remarkHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  remarkTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  remarkInputWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  remarkInput: { minHeight: 160, padding: 0, textAlignVertical: 'top', fontSize: 14, lineHeight: 20, color: '#20242B' },
  remarkCounter: { alignSelf: 'flex-end', marginTop: 8, fontSize: 12, color: '#B5BAC2', fontWeight: '700' },
  remarkFooter: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
});
