import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readAddressItems, type AddressItem } from '@/lib/address-book';
import { calculateCoupons, couponLevelOf, couponLevels, filterCouponsForLines, type CouponLevel, type CouponSelection } from '@/lib/coupon-optimizer';
import { createMarketOrder, fetchMyMarketCoupons, type MyMarketCoupon } from '@/lib/market-api';
import { readMarketCheckoutItems, removeMarketCartItems, type MarketCartItem } from '@/lib/market-cart';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import PictureIcon from '@/public/icon/tupian.svg';
import DefaultShopIcon from '@/public/icon/dp.svg';

type PayMethod = 'wechat' | 'alipay' | 'more';

type ShopGroup = {
  key: string;
  shop: string;
  shopId: number | null;
  shopAvatarUrl: string;
  items: MarketCartItem[];
};

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

function groupCartItems(items: MarketCartItem[]) {
  const map = new Map<string, ShopGroup>();
  items.forEach((item) => {
    const key = String(item.shopId ?? (item.shop || 'default'));
    const group = map.get(key) || { key, shop: item.shop || '默认店铺', shopId: item.shopId, shopAvatarUrl: item.shopAvatarUrl || '', items: [] };
    if (!group.shopAvatarUrl && item.shopAvatarUrl) group.shopAvatarUrl = item.shopAvatarUrl;
    group.items.push(item);
    map.set(key, group);
  });
  return Array.from(map.values());
}

export default function CheckoutScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { height: screenHeight } = useWindowDimensions();
  const couponSheetTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const [items, setItems] = useState<MarketCartItem[]>([]);
  const [address, setAddress] = useState<AddressItem | null>(null);
  const [coupons, setCoupons] = useState<MyMarketCoupon[]>([]);
  const [selectedCouponIds, setSelectedCouponIds] = useState<CouponSelection>({});
  const [couponSheetVisible, setCouponSheetVisible] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('wechat');
  const [remark, setRemark] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const groups = useMemo(() => groupCartItems(items), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const shipping = 0;
  const couponLines = useMemo(
    () => items.map((item) => ({
      productId: item.productId,
      shopId: item.shopId,
      amount: item.price * item.quantity,
    })),
    [items],
  );
  const orderCoupons = useMemo(() => filterCouponsForLines(coupons, couponLines), [couponLines, coupons]);
  const couponCalculation = useMemo(
    () => calculateCoupons(couponLines, orderCoupons, selectedCouponIds),
    [couponLines, orderCoupons, selectedCouponIds],
  );
  const discount = couponCalculation.totalDiscount;
  const total = Math.max(0, subtotal + shipping - discount);

  const load = useCallback(async () => {
    const [checkoutItems, addresses, myCoupons] = await Promise.all([
      readMarketCheckoutItems(),
      readAddressItems().catch(() => []),
      fetchMyMarketCoupons().catch(() => []),
    ]);
    setItems(checkoutItems);
    setAddress(addresses.find((item) => item.isDefault) || addresses[0] || null);
    setCoupons(myCoupons);
    setSelectedCouponIds(calculateCoupons(
      checkoutItems.map((item) => ({ productId: item.productId, shopId: item.shopId, amount: item.price * item.quantity })),
      filterCouponsForLines(myCoupons, checkoutItems.map((item) => ({ productId: item.productId, shopId: item.shopId, amount: item.price * item.quantity }))),
    ).selected);
  }, []);

  const refreshCheckout = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!couponSheetVisible) return;
    couponSheetTranslateY.setValue(screenHeight);
    Animated.timing(couponSheetTranslateY, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [couponSheetTranslateY, couponSheetVisible, screenHeight]);

  async function submitOrder(paid: boolean) {
    try {
      await createMarketOrder({
        items,
        discount,
        total,
        shipping,
        address: toOrderAddressSnapshot(address),
        remark,
        couponIds: Object.values(couponCalculation.selected).filter((id): id is number => typeof id === 'number'),
        paid,
        paymentMethod: paid ? payMethod : undefined,
      });
      await removeMarketCartItems(items.map((item) => item.key));
      feedback.dialog({
        title: paid ? '支付成功' : '订单已提交',
        message: paid ? `已支付 ¥${formatPrice(total)}` : '订单已生成，状态为待付款',
        actions: [
          { label: '完成', variant: 'plain', onPress: () => router.replace('/cart') },
          { label: '查看订单', variant: 'primary', onPress: () => router.replace('/orders') },
        ],
      });
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '订单提交失败，请稍后重试');
    }
  }

  async function handlePay() {
    if (!items.length) {
      feedback.toast('请先从购物车选择商品');
      router.replace('/cart');
      return;
    }
    if (!address) {
      const ok = await feedback.confirm({
        title: '请先设置地址',
        message: '添加收货地址后再提交订单',
        confirmLabel: '去设置',
      });
      if (ok) router.push('/address-list');
      return;
    }
    feedback.dialog({
      title: '模拟支付',
      message: '请选择本次订单的支付结果',
      actions: [
        { label: '取消', variant: 'plain' },
        { label: '未付款', variant: 'plain', onPress: () => void submitOrder(false) },
        { label: '付款', variant: 'primary', onPress: () => void submitOrder(true) },
      ],
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshCheckout()} />}>
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/cart'))}>
              <BackIcon width={24} height={24} color="#222832" />
            </Pressable>
            <View style={styles.headerPromise}>
              <ThemedText style={styles.promiseText}>7天无理由退货</ThemedText>
              <ThemedText style={styles.promiseDot}>·</ThemedText>
              <ThemedText style={styles.promiseText}>极速退款</ThemedText>
              <ThemedText style={styles.promiseDot}>·</ThemedText>
              <ThemedText style={styles.promiseText}>晚发必赔</ThemedText>
            </View>
            <View style={styles.backSpace} />
          </View>

          <Pressable style={styles.addressPanel} onPress={() => router.push('/address-list')}>
            <MaterialCommunityIcons name="map-marker-outline" size={26} color="#2F343B" />
            <View style={styles.addressTextBlock}>
              {address ? (
                <>
                  <ThemedText numberOfLines={1} style={styles.addressMain}>{address.name} {address.detail}</ThemedText>
                  <ThemedText numberOfLines={1} style={styles.addressSub}>{address.region}　{maskPhone(address.phone)}</ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={styles.addressMain}>去设置收货地址</ThemedText>
                  <ThemedText style={styles.addressSub}>用于商家发货与售后服务</ThemedText>
                </>
              )}
            </View>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>

          <View style={styles.promiseRow}>
            <ThemedText style={styles.promiseSmall}>包邮</ThemedText>
            <View style={styles.promiseSep} />
            <ThemedText style={styles.promiseSmall}>预售</ThemedText>
            <View style={styles.promiseSep} />
            <ThemedText style={styles.promiseSmall}>5天内发货</ThemedText>
            <View style={styles.promiseSep} />
            <ThemedText style={styles.promiseSmall}>晚发必赔</ThemedText>
          </View>

          {groups.length ? (
            groups.map((group) => (
              <View key={group.key} style={styles.shopBlock}>
                <View style={styles.shopHeader}>
                  <View style={styles.shopAvatar}>
                    {group.shopAvatarUrl ? (
                      <Image source={{ uri: group.shopAvatarUrl }} style={styles.shopAvatarImage} contentFit="cover" />
                    ) : (
                      <DefaultShopIcon width={20} height={20} />
                    )}
                  </View>
                  <ThemedText numberOfLines={1} style={styles.shopName}>{group.shop}</ThemedText>
                </View>

                {group.items.map((item) => (
                  <View key={item.key} style={styles.productRow}>
                    <View style={styles.productImage}>
                      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.imagePhoto} contentFit="cover" /> : <PictureIcon width={44} height={44} color="#C6CBD3" />}
                    </View>
                    <View style={styles.productInfo}>
                      <ThemedText numberOfLines={1} style={styles.productTitle}>{item.name}</ThemedText>
                      <ThemedText numberOfLines={1} style={styles.productSpec}>{item.specText}</ThemedText>
                    </View>
                    <View style={styles.productPriceBlock}>
                      <ThemedText style={styles.productPrice}>¥{formatPrice(item.price)}</ThemedText>
                      <ThemedText style={styles.productQty}>× {item.quantity}</ThemedText>
                    </View>
                  </View>
                ))}

                <View style={styles.remarkRow}>
                  <ThemedText style={styles.rowTitle}>备注</ThemedText>
                  <TextInput
                    value={remark}
                    onChangeText={(text) => setRemark(text.slice(0, 80))}
                    placeholder="与商家协商一致后留言"
                    placeholderTextColor="#9EA3AA"
                    style={styles.remarkInput}
                  />
                  <ThemedText style={styles.chevronLight}>›</ThemedText>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyBlock}>
              <ThemedText style={styles.emptyTitle}>暂无结算商品</ThemedText>
              <Pressable style={styles.emptyBtn} onPress={() => router.replace('/cart')}>
                <ThemedText style={styles.emptyBtnText}>返回购物车</ThemedText>
              </Pressable>
            </View>
          )}

          <View style={styles.amountPanel}>
            <InfoRow title="商品金额" value={`¥${formatPrice(subtotal)}`} strong />
            <Pressable style={styles.infoRow} onPress={() => setCouponSheetVisible(true)}>
              <ThemedText style={styles.infoTitle}>优惠券</ThemedText>
              <ThemedText style={discount > 0 ? styles.couponValue : styles.infoValueMuted}>
                {discount > 0 ? `-¥${formatPrice(discount)}` : '暂无可用'}
              </ThemedText>
              <ThemedText style={styles.chevronLight}>›</ThemedText>
            </Pressable>
            <InfoRow title="运费" extra="包邮" value={`¥${formatPrice(shipping)}`} />
            <View style={styles.dashedLine} />
            <View style={styles.totalRow}>
              <ThemedText style={styles.totalSmall}>总计：</ThemedText>
              <ThemedText style={styles.totalBig}>¥{formatPrice(total)}</ThemedText>
            </View>
          </View>

          <View style={styles.payPanel}>
            <PayRow method="wechat" title="微信支付" iconText="✓" color="#10C635" active={payMethod === 'wechat'} onPress={() => setPayMethod('wechat')} />
            <PayRow method="alipay" title="支付宝免密支付" subtitle="可切换普通支付" iconText="支" color="#1677FF" active={payMethod === 'alipay'} onPress={() => setPayMethod('alipay')} />
            <Pressable style={styles.morePayRow} onPress={() => setPayMethod('more')}>
              <ThemedText style={styles.morePayText}>更多支付方式</ThemedText>
              <ThemedText style={styles.chevronLight}>›</ThemedText>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.payBar}>
          <View style={styles.payTotal}>
            <ThemedText style={styles.payTotalLabel}>总计</ThemedText>
            <ThemedText style={styles.payCurrency}>¥</ThemedText>
            <ThemedText style={styles.payTotalPrice}>{formatPrice(total)}</ThemedText>
          </View>
          <Pressable style={styles.payBtn} onPress={() => void handlePay()}>
            <ThemedText style={styles.payBtnText}>立即支付</ThemedText>
          </Pressable>
        </View>

        <Modal visible={couponSheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => setCouponSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setCouponSheetVisible(false)} />
            <Animated.View style={[styles.couponSheet, { transform: [{ translateY: couponSheetTranslateY }] }]}>
              <View style={styles.couponSheetHeader}>
                <View style={styles.couponCloseSpace} />
                <ThemedText style={styles.couponSheetTitle}>选择优惠券</ThemedText>
                <Pressable hitSlop={10} style={styles.couponCloseBtn} onPress={() => setCouponSheetVisible(false)}>
                  <ThemedText style={styles.couponCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.couponSheetContent}>
                {orderCoupons.length ? (
                  <>
                    {couponLevels.map((level) => {
                      const levelCoupons = orderCoupons.filter((coupon) => couponLevelOf(coupon) === level);
                      if (!levelCoupons.length) return null;
                      return (
                        <View key={level} style={styles.couponLevelBlock}>
                          <View style={styles.couponLevelHeader}>
                            <ThemedText style={styles.couponLevelTitle}>{couponLevelTitle(level)}</ThemedText>
                            <Pressable onPress={() => setSelectedCouponIds((current) => ({ ...current, [level]: null }))}>
                              <ThemedText style={styles.couponLevelClear}>不使用</ThemedText>
                            </Pressable>
                          </View>
                          {levelCoupons.map((coupon) => {
                            const selected = selectedCouponIds[level] === coupon.id;
                            const testSelection = { ...selectedCouponIds, [level]: coupon.id };
                            const testCalculation = calculateCoupons(couponLines, orderCoupons, testSelection);
                            const usable = testCalculation.selected[level] === coupon.id && testCalculation.discounts[level] > 0;
                            return (
                              <Pressable
                                key={coupon.id}
                                style={[styles.couponTicket, selected && styles.couponTicketSelected, !usable && styles.couponTicketDisabled]}
                                onPress={() => {
                                  if (!usable) return;
                                  setSelectedCouponIds((current) => ({ ...current, [level]: current[level] === coupon.id ? null : coupon.id }));
                                  setCouponSheetVisible(false);
                                }}>
                                <View style={styles.couponTicketLeft}>
                                  <View style={styles.couponAmountRow}>
                                    <ThemedText style={styles.couponCurrency}>¥</ThemedText>
                                    <ThemedText style={styles.couponAmount}>{formatPrice(coupon.discount)}</ThemedText>
                                  </View>
                                  <ThemedText style={styles.couponThreshold}>{coupon.thresholdText}</ThemedText>
                                </View>
                                <View style={styles.couponTicketRight}>
                                  <View style={styles.couponTitleRow}>
                                    <View style={styles.couponTag}>
                                      <ThemedText style={styles.couponTagText}>{couponLevelTitle(level)}</ThemedText>
                                    </View>
                                    <ThemedText numberOfLines={1} style={styles.couponTitle}>{coupon.title}</ThemedText>
                                  </View>
                                  <ThemedText numberOfLines={1} style={styles.couponDesc}>
                                    {coupon.endAt ? `${coupon.endAt} 前有效` : '长期有效'} · {usable ? `本层可减 ¥${formatPrice(testCalculation.discounts[level])}` : '不满足使用条件'}
                                  </ThemedText>
                                  <ThemedText style={[styles.couponSelectText, selected && styles.couponSelectTextActive, !usable && styles.couponSelectTextDisabled]}>
                                    {selected ? '已选' : usable ? '选择' : '不可用'}
                                  </ThemedText>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                    <Pressable
                      style={styles.clearCouponBtn}
                      onPress={() => {
                        setSelectedCouponIds(calculateCoupons(couponLines, orderCoupons).selected);
                        setCouponSheetVisible(false);
                      }}>
                      <ThemedText style={styles.clearCouponText}>自动选择最优惠</ThemedText>
                    </Pressable>
                  </>
                ) : (
                  <View style={styles.couponEmpty}>
                    <ThemedText style={styles.couponEmptyTitle}>暂无可用优惠券</ThemedText>
                    <ThemedText style={styles.couponEmptyText}>领取后的优惠券会显示在这里</ThemedText>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

function InfoRow({ title, value, extra, strong = false }: { title: string; value: string; extra?: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText style={styles.infoTitle}>{title}</ThemedText>
      {extra ? <ThemedText style={styles.infoExtra}>{extra}</ThemedText> : null}
      <ThemedText style={strong ? styles.infoValueStrong : styles.infoValue}>{value}</ThemedText>
    </View>
  );
}

function couponLevelTitle(level: CouponLevel) {
  if (level === 'product') return '商品券';
  if (level === 'shop') return '店铺券';
  return '平台券';
}

function PayRow({
  title,
  subtitle,
  iconText,
  color,
  active,
  onPress,
}: {
  method: PayMethod;
  title: string;
  subtitle?: string;
  iconText: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.payMethodRow} onPress={onPress}>
      <View style={[styles.payIcon, { backgroundColor: color }]}>
        <ThemedText style={styles.payIconText}>{iconText}</ThemedText>
      </View>
      <View style={styles.payMethodTextBlock}>
        <ThemedText style={styles.payMethodTitle}>{title}</ThemedText>
        {subtitle ? <ThemedText style={styles.payMethodSub}>{subtitle}</ThemedText> : null}
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <ThemedText style={styles.radioMark}>✓</ThemedText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  content: { paddingBottom: 116, backgroundColor: '#F6F6F7' },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: '#FFF' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  backSpace: { width: 34 },
  headerPromise: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  promiseText: { fontSize: 15, color: '#2C8C68', fontWeight: '800' },
  promiseDot: { fontSize: 15, color: '#2C8C68', fontWeight: '700' },
  addressPanel: { minHeight: 82, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF' },
  addressTextBlock: { flex: 1, gap: 8 },
  addressMain: { fontSize: 18, color: '#20242B', fontWeight: '900' },
  addressSub: { fontSize: 13, color: '#717983', fontWeight: '700' },
  chevron: { fontSize: 30, color: '#B3B7BE', lineHeight: 32 },
  chevronLight: { fontSize: 26, color: '#B9BDC4', lineHeight: 28 },
  promiseRow: { minHeight: 42, paddingHorizontal: 58, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF' },
  promiseSmall: { fontSize: 14, color: '#656C76', fontWeight: '700' },
  promiseSep: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: '#DFE2E6' },
  shopBlock: { marginTop: 8, paddingTop: 16, backgroundColor: '#FFF' },
  shopHeader: { height: 34, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  shopAvatar: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4E3' },
  shopAvatarImage: { width: '100%', height: '100%' },
  shopName: { flex: 1, fontSize: 18, color: '#20242B', fontWeight: '900' },
  productRow: { minHeight: 108, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16, flexDirection: 'row', gap: 12 },
  productImage: { width: 88, height: 88, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0F2' },
  imagePhoto: { width: '100%', height: '100%' },
  productInfo: { flex: 1, gap: 7, paddingTop: 5 },
  productTitle: { fontSize: 16, color: '#2A2E35', fontWeight: '800' },
  productSpec: { fontSize: 13, color: '#8C929B', fontWeight: '700' },
  productPriceBlock: { minWidth: 70, alignItems: 'flex-end', paddingTop: 6, gap: 5 },
  productPrice: { fontSize: 18, color: '#20242B', fontWeight: '900' },
  productQty: { fontSize: 14, color: '#707780', fontWeight: '700' },
  remarkRow: { height: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0F1F3' },
  rowTitle: { fontSize: 16, color: '#30343B', fontWeight: '800' },
  remarkInput: { flex: 1, height: 42, textAlign: 'right', fontSize: 15, color: '#30343B', fontWeight: '700' },
  amountPanel: { marginTop: 8, paddingTop: 12, paddingHorizontal: 18, backgroundColor: '#FFF' },
  infoRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoTitle: { fontSize: 16, color: '#30343B', fontWeight: '800' },
  infoExtra: { fontSize: 15, color: '#8D9299', fontWeight: '700' },
  infoValue: { marginLeft: 'auto', fontSize: 17, color: '#20242B', fontWeight: '900' },
  infoValueStrong: { marginLeft: 'auto', fontSize: 18, color: '#20242B', fontWeight: '900' },
  infoValueMuted: { marginLeft: 'auto', fontSize: 16, color: '#9EA3AA', fontWeight: '800' },
  couponValue: { marginLeft: 'auto', fontSize: 16, color: '#F02D47', fontWeight: '900' },
  dashedLine: { height: StyleSheet.hairlineWidth, marginTop: 8, borderStyle: 'dashed', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E3E5E8' },
  totalRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  totalSmall: { fontSize: 15, color: '#5D646E', fontWeight: '700' },
  totalBig: { fontSize: 30, color: '#20242B', fontWeight: '900' },
  payPanel: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: '#FFF' },
  payMethodRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14 },
  payIcon: { width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  payIconText: { fontSize: 14, color: '#FFF', fontWeight: '900' },
  payMethodTextBlock: { flex: 1, gap: 4 },
  payMethodTitle: { fontSize: 17, color: '#30343B', fontWeight: '800' },
  payMethodSub: { fontSize: 13, color: '#7F8690', fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#D7DAE0', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  radioMark: { fontSize: 15, lineHeight: 17, color: '#FFF', fontWeight: '900' },
  morePayRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  morePayText: { flex: 1, fontSize: 15, color: '#8B9098', fontWeight: '800' },
  payBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6E8EC',
  },
  payTotal: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  payTotalLabel: { fontSize: 16, color: '#30343B', fontWeight: '800' },
  payCurrency: { fontSize: 18, color: '#F02D47', fontWeight: '900' },
  payTotalPrice: { fontSize: 30, color: '#F02D47', fontWeight: '900' },
  payBtn: { width: 150, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  payBtnText: { fontSize: 20, color: '#FFF', fontWeight: '900' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  couponSheet: {
    height: '72%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  couponSheetHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  couponCloseSpace: { width: 40 },
  couponSheetTitle: { fontSize: 18, color: '#2A2D33', fontWeight: '900' },
  couponCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  couponCloseText: { fontSize: 34, lineHeight: 36, color: '#4B4F56', fontWeight: '300' },
  couponSheetContent: { paddingHorizontal: 14, paddingBottom: 30 },
  couponLevelBlock: { marginBottom: 8 },
  couponLevelHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  couponLevelTitle: { fontSize: 15, color: '#343941', fontWeight: '900' },
  couponLevelClear: { fontSize: 13, color: '#8B9098', fontWeight: '800' },
  couponTicket: {
    minHeight: 96,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F1F3',
  },
  couponTicketSelected: { borderColor: '#F02D47', backgroundColor: '#FFF8FA' },
  couponTicketDisabled: { opacity: 0.55 },
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
  couponTicketRight: { flex: 1, minHeight: 96, paddingLeft: 14, paddingRight: 92, justifyContent: 'center', position: 'relative', gap: 9 },
  couponTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  couponTag: { height: 22, borderRadius: 2, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D5D8DE' },
  couponTagText: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  couponTitle: { flex: 1, fontSize: 15, color: '#343941', fontWeight: '900' },
  couponDesc: { fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  couponSelectText: { position: 'absolute', right: 18, top: 38, fontSize: 14, color: '#F02D47', fontWeight: '900' },
  couponSelectTextActive: { color: '#D63C58' },
  couponSelectTextDisabled: { color: '#8B9098' },
  clearCouponBtn: { height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  clearCouponText: { fontSize: 14, color: '#555B66', fontWeight: '900' },
  couponEmpty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 8 },
  couponEmptyTitle: { fontSize: 15, color: '#20242B', fontWeight: '900' },
  couponEmptyText: { fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  emptyBlock: { marginTop: 8, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#FFF' },
  emptyTitle: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  emptyBtn: { height: 38, borderRadius: 19, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  emptyBtnText: { fontSize: 14, color: '#FFF', fontWeight: '900' },
});
