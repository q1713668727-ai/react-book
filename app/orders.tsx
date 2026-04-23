import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { cancelMarketOrder, cancelMarketOrderRefund, confirmMarketOrderReceipt, fetchMarketOrders, fetchMarketProduct, reviewMarketOrder, type MarketOrder, type MarketOrderStatus } from '@/lib/market-api';
import { getString, hydrateStorage, setString } from '@/lib/storage';
import PictureIcon from '@/public/icon/tupian.svg';
import DefaultShopIcon from '@/public/icon/dp.svg';

type OrderTab = '全部' | MarketOrderStatus;

const tabs: OrderTab[] = ['全部', '待付款', '待发货', '待收货/使用', '评价', '已取消', '售后'];
const ORDER_BADGE_READ_KEY = '@orders_badge_read_v1';
const stickyBadgeTabs = new Set<MarketOrderStatus>(['待付款', '待发货', '待收货/使用']);
const clearableBadgeTabs = new Set<MarketOrderStatus>(['评价', '已取消', '售后']);

type ClearableBadgeStatus = Extract<MarketOrderStatus, '评价' | '已取消' | '售后'>;
type BadgeReadState = Partial<Record<ClearableBadgeStatus, string[]>>;

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function countdownText(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function parseBadgeReadState(raw: string | undefined) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as BadgeReadState;
    if (!value || typeof value !== 'object') return {};
    return {
      评价: Array.isArray(value.评价) ? value.评价.map((item) => String(item)).filter(Boolean) : [],
      已取消: Array.isArray(value.已取消) ? value.已取消.map((item) => String(item)).filter(Boolean) : [],
      售后: Array.isArray(value.售后) ? value.售后.map((item) => String(item)).filter(Boolean) : [],
    };
  } catch {
    return {};
  }
}

function isClearableBadgeStatus(status: MarketOrderStatus): status is ClearableBadgeStatus {
  return status === '评价' || status === '已取消' || status === '售后';
}

export default function OrdersScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [activeTab, setActiveTab] = useState<OrderTab>('全部');
  const [keyword, setKeyword] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [reviewOrder, setReviewOrder] = useState<MarketOrder | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [badgeReadState, setBadgeReadState] = useState<BadgeReadState>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      await hydrateStorage([ORDER_BADGE_READ_KEY]);
      if (!alive) return;
      setBadgeReadState(parseBadgeReadState(getString(ORDER_BADGE_READ_KEY)));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadOrders = useCallback(async () => {
    const items = await fetchMarketOrders().catch(() => []);
    setOrders(items);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchMarketOrders().then((items) => {
        if (alive) setOrders(items);
      }).catch(() => {
        if (alive) setOrders([]);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!orders.some((order) => order.status === '待付款' && order.payDeadline <= now)) return;
    void loadOrders();
  }, [loadOrders, now, orders]);

  const visibleOrders = useMemo(() => {
    const trimmed = keyword.trim();
    return orders.filter((order) => {
      const tabMatched = activeTab === '全部' || order.status === activeTab;
      const keywordMatched = !trimmed || order.shop.includes(trimmed) || order.items.some((item) => item.name.includes(trimmed));
      return tabMatched && keywordMatched;
    });
  }, [activeTab, keyword, orders]);

  const statusCounts = useMemo(() => {
    const counts = new Map<MarketOrderStatus, number>();
    orders.forEach((order) => counts.set(order.status, (counts.get(order.status) || 0) + 1));
    return counts;
  }, [orders]);

  const badgeCounts = useMemo(() => {
    const counts = new Map<MarketOrderStatus, number>();
    orders.forEach((order) => {
      if (stickyBadgeTabs.has(order.status)) {
        counts.set(order.status, (counts.get(order.status) || 0) + 1);
        return;
      }
      if (isClearableBadgeStatus(order.status)) {
        const readSet = new Set((badgeReadState[order.status] || []).map((item) => String(item)));
        if (!readSet.has(String(order.id))) {
          counts.set(order.status, (counts.get(order.status) || 0) + 1);
        }
      }
    });
    return counts;
  }, [badgeReadState, orders]);

  function persistBadgeReadState(next: BadgeReadState) {
    setBadgeReadState(next);
    setString(ORDER_BADGE_READ_KEY, JSON.stringify(next));
  }

  function markTabRead(tab: OrderTab) {
    if (tab === '全部' || !isClearableBadgeStatus(tab)) return;
    const tabOrderIds = orders.filter((item) => item.status === tab).map((item) => String(item.id));
    if (!tabOrderIds.length) return;
    const current = new Set((badgeReadState[tab] || []).map((item) => String(item)));
    let changed = false;
    tabOrderIds.forEach((id) => {
      if (current.has(id)) return;
      current.add(id);
      changed = true;
    });
    if (!changed) return;
    persistBadgeReadState({
      ...badgeReadState,
      [tab]: Array.from(current),
    });
  }

  function badgeText(tab: OrderTab) {
    if (tab === '全部') return '';
    const count = stickyBadgeTabs.has(tab) ? (statusCounts.get(tab) || 0) : (badgeCounts.get(tab) || 0);
    if (!count) return '';
    return count > 99 ? '99+' : String(count);
  }

  async function handleConfirmReceipt(order: MarketOrder) {
    const ok = await feedback.confirm({
      title: '确认收货',
      message: `确认已收到「${order.items[0]?.name || order.orderNo}」吗？确认后可评价商品。`,
      confirmLabel: '确认收货',
    });
    if (!ok) return;
    try {
      await confirmMarketOrderReceipt(order);
      feedback.toast('已确认收货');
      await loadOrders();
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '确认收货失败');
    }
  }

  async function handleCancelOrder(order: MarketOrder) {
    const ok = await feedback.confirm({
      title: '取消订单',
      message: `确认取消「${order.items[0]?.name || order.orderNo}」吗？`,
      confirmLabel: '取消订单',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelMarketOrder(order);
      feedback.toast('订单已取消');
      await loadOrders();
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '取消订单失败');
    }
  }

  async function handleCancelRefund(order: MarketOrder) {
    const ok = await feedback.confirm({
      title: '取消售后',
      message: `确认取消「${order.items[0]?.name || order.orderNo}」的售后申请吗？`,
      confirmLabel: '取消售后',
    });
    if (!ok) return;
    try {
      await cancelMarketOrderRefund(order);
      feedback.toast('售后已取消');
      await loadOrders();
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '取消售后失败');
    }
  }

  function openAddressPicker(order: MarketOrder) {
    router.push({
      pathname: '/address-list',
      params: {
        mode: 'pick-order-address',
        orderId: order.id,
        orderNo: order.orderNo,
      },
    });
  }

  function openReview(order: MarketOrder) {
    setReviewOrder(order);
    setReviewText('');
    setReviewRating(5);
  }

  async function submitReview() {
    if (!reviewOrder) return;
    const content = reviewText.trim();
    if (!content) {
      feedback.toast('请输入评价内容');
      return;
    }
    try {
      await reviewMarketOrder(reviewOrder, content, reviewRating);
      feedback.toast('评价已发布');
      setReviewOrder(null);
      setReviewText('');
      await loadOrders();
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '评价失败');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}>
            <Feather name="chevron-left" size={30} color="#22252B" />
          </Pressable>
          <View style={styles.searchBox}>
            <Feather name="search" size={18} color="#A1A5AD" />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="搜索我的订单"
              placeholderTextColor="#A6A8AD"
              style={styles.searchInput}
            />
          </View>
          <Pressable hitSlop={10} style={styles.headerIcon}>
            <MaterialCommunityIcons name="filter-variant" size={29} color="#20242B" />
          </Pressable>
          <Pressable hitSlop={10} style={styles.headerIcon}>
            <Feather name="more-horizontal" size={28} color="#20242B" />
          </Pressable>
        </View>

        <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
            {tabs.map((tab) => (
              <Pressable
                key={tab}
                style={styles.tabItem}
                onPress={() => {
                  setActiveTab(tab);
                  markTabRead(tab);
                }}
              >
                <ThemedText style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</ThemedText>
                {badgeText(tab) ? (
                  <View style={styles.badge}><ThemedText style={styles.badgeText}>{badgeText(tab)}</ThemedText></View>
                ) : null}
                {activeTab === tab ? <View style={styles.tabLine} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {visibleOrders.length ? visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              now={now}
              onCancel={handleCancelOrder}
              onCancelRefund={handleCancelRefund}
              onChangeAddress={openAddressPicker}
              onConfirmReceipt={handleConfirmReceipt}
              onReview={openReview}
            />
          )) : (
            <View style={styles.emptyBox}>
              <ThemedText style={styles.emptyTitle}>暂无相关订单</ThemedText>
              <ThemedText style={styles.emptyText}>换个分类或搜索词试试</ThemedText>
            </View>
          )}
        </ScrollView>

        <Modal visible={!!reviewOrder} transparent animationType="fade" onRequestClose={() => setReviewOrder(null)}>
          <View style={styles.reviewOverlay}>
            <Pressable style={styles.reviewBackdrop} onPress={() => setReviewOrder(null)} />
            <View style={styles.reviewSheet}>
              <ThemedText style={styles.reviewTitle}>评价商品</ThemedText>
              <ThemedText numberOfLines={1} style={styles.reviewProduct}>{reviewOrder?.items[0]?.name}</ThemedText>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} hitSlop={8} onPress={() => setReviewRating(value)}>
                    <ThemedText style={[styles.starText, value <= reviewRating && styles.starTextActive]}>★</ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="说说商品质量、物流或使用感受"
                placeholderTextColor="#A2A6AE"
                multiline
                maxLength={500}
                style={styles.reviewInput}
              />
              <View style={styles.reviewFooter}>
                <Pressable style={styles.reviewCancelBtn} onPress={() => setReviewOrder(null)}>
                  <ThemedText style={styles.reviewCancelText}>取消</ThemedText>
                </Pressable>
                <Pressable style={styles.reviewSubmitBtn} onPress={submitReview}>
                  <ThemedText style={styles.reviewSubmitText}>发布评价</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

      </ThemedView>
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  now,
  onConfirmReceipt,
  onCancel,
  onCancelRefund,
  onChangeAddress,
  onReview,
}: {
  order: MarketOrder;
  now: number;
  onCancel: (order: MarketOrder) => void;
  onCancelRefund: (order: MarketOrder) => void;
  onChangeAddress: (order: MarketOrder) => void;
  onConfirmReceipt: (order: MarketOrder) => void;
  onReview: (order: MarketOrder) => void;
}) {
  const router = useRouter();
  const feedback = useFeedback();
  const first = order.items[0];
  const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isUnpaid = order.status === '待付款';
  const canChangeAddress = order.status === '待付款' || order.status === '待发货';
  const canApplyRefund = order.status === '待发货' || order.status === '待收货/使用' || order.status === '评价';
  const paySeconds = Math.max(0, Math.floor((order.payDeadline - now) / 1000));

  async function openProduct() {
    if (!first?.productId) return;
    try {
      const product = await fetchMarketProduct(first.productId);
      if (!product) throw new Error('商品已下架');
      router.push({
        pathname: '/product/[id]',
        params: { id: first.productId, name: first.name, price: String(first.price), sold: first.soldText },
      });
    } catch {
      feedback.dialog({
        title: '商品已下架',
        message: '该商品不存在或已下架，暂时无法查看详情。',
        actions: [{ label: '知道了', variant: 'primary' }],
      });
    }
  }

  function openService() {
    router.push({
      pathname: '/product-service',
      params: {
        productId: first?.productId ? String(first.productId) : undefined,
        shopId: order.shopId ? String(order.shopId) : undefined,
        shop: order.shop || first?.shop || '店铺客服',
        name: first?.name || order.orderNo,
        price: String(first?.price ?? order.total ?? 0),
        imageUrl: first?.imageUrl || '',
        orderId: String(order.id || ''),
        orderNo: order.orderNo,
        orderStatus: order.status,
        orderTotal: String(order.total || 0),
        orderQuantity: String(totalCount || 0),
        orderSpec: first?.specText || '',
        refundStatus: order.refundStatus || '',
      },
    });
  }

  return (
    <View style={styles.orderCard}>
      <View style={styles.shopRow}>
        <View style={styles.shopAvatar}>
          {order.shopAvatarUrl ? <Image source={{ uri: order.shopAvatarUrl }} style={styles.shopAvatarImage} contentFit="cover" /> : <DefaultShopIcon width={20} height={20} />}
        </View>
        <ThemedText numberOfLines={1} style={styles.shopName}>{order.shop}</ThemedText>
        <Feather name="chevron-right" size={22} color="#2B2F36" />
        <ThemedText style={styles.statusText}>{order.status}</ThemedText>
      </View>

      <Pressable style={styles.productRow} onPress={openProduct}>
        <View style={styles.productImage}>
          {first.imageUrl ? <Image source={{ uri: first.imageUrl }} style={styles.productPhoto} contentFit="cover" /> : <PictureIcon width={58} height={58} color="#D2D6DD" />}
        </View>
        <View style={styles.productInfo}>
          <View style={styles.productTitleRow}>
            <ThemedText numberOfLines={1} style={styles.productTitle}>{first.name}</ThemedText>
            <ThemedText style={styles.productPrice}>¥{formatPrice(first.price)}</ThemedText>
          </View>
          <View style={styles.specRow}>
            <ThemedText numberOfLines={1} style={styles.productSpec}>{first.specText}</ThemedText>
            <ThemedText style={styles.qty}>×{first.quantity}</ThemedText>
          </View>
          <ThemedText numberOfLines={1} style={styles.serviceText}>7天无理由退货　极速退款　晚发必赔</ThemedText>
          {order.refundStatus ? <ThemedText numberOfLines={1} style={styles.refundStatusText}>{order.refundStatus}</ThemedText> : null}
        </View>
      </Pressable>

      <View style={styles.summaryRow}>
        <ThemedText style={styles.countText}>共 {totalCount} 件</ThemedText>
        <View style={styles.totalTextRow}>
          {order.discount > 0 ? <ThemedText style={styles.discountText}>已优惠 ¥{formatPrice(order.discount)}</ThemedText> : null}
          <ThemedText style={styles.totalLabel}>{order.status}</ThemedText>
          <ThemedText style={styles.totalPrice}>¥{formatPrice(order.total)}</ThemedText>
        </View>
      </View>

      <View style={styles.actionRow}>
        {isUnpaid ? <Pressable style={styles.lightBtn} onPress={() => onCancel(order)}><ThemedText style={styles.lightBtnText}>取消订单</ThemedText></Pressable> : null}
        {canChangeAddress ? <Pressable style={styles.lightBtn} onPress={() => onChangeAddress(order)}><ThemedText style={styles.lightBtnText}>修改地址</ThemedText></Pressable> : null}
        {canApplyRefund ? (
          <Pressable
            style={styles.lightBtn}
            onPress={() => router.push({ pathname: '/order-refund', params: { id: order.id, orderNo: order.orderNo } })}
          >
            <ThemedText style={styles.lightBtnText}>申请退款</ThemedText>
          </Pressable>
        ) : null}
        {order.status === '售后' ? (
          <Pressable style={styles.lightBtn} onPress={() => onCancelRefund(order)}><ThemedText style={styles.lightBtnText}>取消售后</ThemedText></Pressable>
        ) : null}
        <Pressable style={styles.lightBtn} onPress={openService}><ThemedText style={styles.lightBtnText}>联系客服</ThemedText></Pressable>
        {order.status === '待收货/使用' ? (
          <Pressable style={styles.payBtn} onPress={() => onConfirmReceipt(order)}><ThemedText style={styles.payBtnText}>确认收货</ThemedText></Pressable>
        ) : null}
        {isUnpaid && paySeconds > 0 ? (
          <Pressable style={styles.payBtn}><ThemedText style={styles.payBtnText}>立即支付 {countdownText(paySeconds)}</ThemedText></Pressable>
        ) : null}
        {order.status === '评价' && order.reviewed ? (
          <Pressable style={styles.reviewDoneBtn}><ThemedText style={styles.reviewDoneBtnText}>已评价</ThemedText></Pressable>
        ) : null}
        {order.status === '评价' && !order.reviewed ? (
          <Pressable style={styles.reviewActionBtn} onPress={() => onReview(order)}><ThemedText style={styles.reviewActionBtnText}>评价</ThemedText></Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, backgroundColor: '#FFF' },
  headerIcon: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, height: 42, borderRadius: 21, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F5F6' },
  searchInput: { flex: 1, padding: 0, fontSize: 16, color: '#30343B' },
  tabWrap: { height: 48, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F1F2' },
  tabContent: { paddingHorizontal: 18, gap: 26, alignItems: 'center' },
  tabItem: { height: 48, justifyContent: 'center' },
  tabText: { fontSize: 16, color: '#777D87', fontWeight: '700' },
  tabTextActive: { color: '#20242B', fontWeight: '900' },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: '#F02D47' },
  badge: { position: 'absolute', top: 4, right: -14, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  badgeText: { fontSize: 10, lineHeight: 12, color: '#FFF', fontWeight: '900' },
  listContent: { paddingBottom: 26 },
  orderCard: { marginBottom: 8, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: '#FFF' },
  shopRow: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4E3' },
  shopAvatarImage: { width: '100%', height: '100%' },
  shopName: { maxWidth: '62%', fontSize: 18, color: '#252A32', fontWeight: '900' },
  statusText: { marginLeft: 'auto', fontSize: 17, color: '#B53A65', fontWeight: '900' },
  productRow: { minHeight: 116, flexDirection: 'row', gap: 14, paddingTop: 14 },
  productImage: { width: 94, height: 94, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F1F3' },
  productPhoto: { width: '100%', height: '100%' },
  productInfo: { flex: 1, gap: 8 },
  productTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productTitle: { flex: 1, fontSize: 16, color: '#2B3038', fontWeight: '800' },
  productPrice: { fontSize: 18, color: '#20242B', fontWeight: '900' },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productSpec: { flex: 1, fontSize: 13, color: '#8D929A', fontWeight: '700' },
  qty: { fontSize: 14, color: '#8D929A', fontWeight: '700' },
  serviceText: { fontSize: 14, color: '#B53A65', fontWeight: '800' },
  refundStatusText: { fontSize: 13, color: '#F02D47', fontWeight: '900' },
  summaryRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countText: { fontSize: 14, color: '#8B9098', fontWeight: '700' },
  totalTextRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  discountText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
  totalLabel: { fontSize: 14, color: '#30343B', fontWeight: '800' },
  totalPrice: { fontSize: 24, color: '#20242B', fontWeight: '900' },
  actionRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  lightBtn: { minWidth: 104, height: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6E8EC' },
  lightBtnText: { fontSize: 15, color: '#30343B', fontWeight: '900' },
  payBtn: { minWidth: 148, height: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  payBtnText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  reviewActionBtn: { minWidth: 148, height: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  reviewActionBtnText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  reviewDoneBtn: { minWidth: 148, height: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6E8EC', backgroundColor: '#FFF' },
  reviewDoneBtnText: { fontSize: 15, color: '#30343B', fontWeight: '900' },
  emptyBox: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  emptyText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
  reviewOverlay: { flex: 1, justifyContent: 'flex-end' },
  reviewBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  reviewSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24, backgroundColor: '#FFF', gap: 12 },
  reviewTitle: { textAlign: 'center', fontSize: 18, color: '#20242B', fontWeight: '900' },
  reviewProduct: { fontSize: 14, color: '#555B66', fontWeight: '700' },
  ratingRow: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8 },
  starText: { fontSize: 27, color: '#D8DCE2', fontWeight: '900' },
  starTextActive: { color: '#FFB31A' },
  reviewInput: { minHeight: 132, borderRadius: 8, padding: 12, textAlignVertical: 'top', fontSize: 14, lineHeight: 20, color: '#20242B', backgroundColor: '#F6F6F7' },
  reviewFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewCancelBtn: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6E8EC' },
  reviewCancelText: { fontSize: 15, color: '#30343B', fontWeight: '900' },
  reviewSubmitBtn: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  reviewSubmitText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
});
