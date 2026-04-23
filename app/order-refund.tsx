import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { applyMarketOrderRefund, fetchMarketOrders, type MarketOrder } from '@/lib/market-api';
import PictureIcon from '@/public/icon/tupian.svg';

type ReceivedStatus = '已收货' | '未收货';

const refundReasons = [
  '不想要了',
  '拍错/多拍/不喜欢',
  '商品信息描述不符',
  '商品质量问题',
  '未按约定时间发货',
  '商家协商一致退款',
  '其他原因',
];

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export default function OrderRefundScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const params = useLocalSearchParams<{ id?: string; orderNo?: string }>();
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [receivedStatus, setReceivedStatus] = useState<ReceivedStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const order = useMemo(() => {
    const id = String(params.id || '');
    const orderNo = String(params.orderNo || '');
    return orders.find((item) => String(item.id) === id || item.orderNo === orderNo) || null;
  }, [orders, params.id, params.orderNo]);

  const first = order?.items[0];
  const totalCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  useEffect(() => {
    let alive = true;
    fetchMarketOrders()
      .then((items) => {
        if (alive) setOrders(items);
      })
      .catch(() => {
        if (alive) setOrders([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submitRefund() {
    if (!order) {
      feedback.toast('订单不存在或已刷新');
      return;
    }
    if (order.status !== '待发货' && order.status !== '待收货/使用') {
      feedback.toast('当前订单不能申请退款');
      return;
    }
    if (!reason) {
      feedback.toast('请选择退款原因');
      return;
    }
    if (!receivedStatus) {
      feedback.toast('请选择收货状态');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await applyMarketOrderRefund(order, { reason, receivedStatus });
      feedback.toast('退款申请已提交');
      router.replace('/orders');
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '退款申请失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))}>
            <Feather name="chevron-left" size={30} color="#22252B" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>申请退款</ThemedText>
          <View style={styles.headerIcon} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {loading ? (
            <View style={styles.emptyBox}>
              <ThemedText style={styles.emptyTitle}>正在加载订单</ThemedText>
            </View>
          ) : order && first ? (
            <>
              <View style={styles.section}>
                <View style={styles.shopRow}>
                  <ThemedText numberOfLines={1} style={styles.shopName}>{order.shop}</ThemedText>
                  <ThemedText style={styles.statusText}>{order.status}</ThemedText>
                </View>
                <View style={styles.productRow}>
                  <View style={styles.productImage}>
                    {first.imageUrl ? <Image source={{ uri: first.imageUrl }} style={styles.productPhoto} contentFit="cover" /> : <PictureIcon width={58} height={58} color="#D2D6DD" />}
                  </View>
                  <View style={styles.productInfo}>
                    <ThemedText numberOfLines={2} style={styles.productTitle}>{first.name}</ThemedText>
                    <View style={styles.specRow}>
                      <ThemedText numberOfLines={1} style={styles.productSpec}>{first.specText}</ThemedText>
                      <ThemedText style={styles.qty}>x{first.quantity}</ThemedText>
                    </View>
                    <View style={styles.amountRow}>
                      <ThemedText style={styles.countText}>共 {totalCount} 件</ThemedText>
                      <ThemedText style={styles.amountText}>退款金额 ¥{formatPrice(order.total)}</ThemedText>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>收货状态</ThemedText>
                <View style={styles.segmentRow}>
                  {(['未收货', '已收货'] as ReceivedStatus[]).map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.segmentBtn, receivedStatus === item && styles.segmentBtnActive]}
                      onPress={() => setReceivedStatus(item)}
                    >
                      <ThemedText style={[styles.segmentText, receivedStatus === item && styles.segmentTextActive]}>{item}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>退款原因</ThemedText>
                <View style={styles.reasonList}>
                  {refundReasons.map((item) => (
                    <Pressable key={item} style={styles.reasonItem} onPress={() => setReason(item)}>
                      <ThemedText style={styles.reasonText}>{item}</ThemedText>
                      <View style={[styles.radio, reason === item && styles.radioActive]}>
                        {reason === item ? <View style={styles.radioDot} /> : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyBox}>
              <ThemedText style={styles.emptyTitle}>订单不存在</ThemedText>
              <ThemedText style={styles.emptyText}>返回订单列表刷新后再试</ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            disabled={!order || submitting}
            style={[styles.submitBtn, (!order || submitting) && styles.submitBtnDisabled]}
            onPress={submitRefund}
          >
            <ThemedText style={styles.submitText}>{submitting ? '提交中...' : '提交申请'}</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, backgroundColor: '#FFF' },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, color: '#20242B', fontWeight: '900' },
  content: { paddingBottom: 104 },
  section: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: '#FFF' },
  shopRow: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopName: { flex: 1, fontSize: 17, color: '#252A32', fontWeight: '900' },
  statusText: { fontSize: 15, color: '#B53A65', fontWeight: '900' },
  productRow: { minHeight: 106, flexDirection: 'row', gap: 14, paddingTop: 14 },
  productImage: { width: 92, height: 92, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F1F3' },
  productPhoto: { width: '100%', height: '100%' },
  productInfo: { flex: 1, justifyContent: 'space-between', gap: 8 },
  productTitle: { fontSize: 16, lineHeight: 21, color: '#2B3038', fontWeight: '800' },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productSpec: { flex: 1, fontSize: 13, color: '#8D929A', fontWeight: '700' },
  qty: { fontSize: 14, color: '#8D929A', fontWeight: '700' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  countText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
  amountText: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  sectionTitle: { marginBottom: 14, fontSize: 17, color: '#20242B', fontWeight: '900' },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segmentBtn: { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6E8EC' },
  segmentBtnActive: { backgroundColor: '#FFF0F3', borderColor: '#F02D47' },
  segmentText: { fontSize: 15, color: '#30343B', fontWeight: '900' },
  segmentTextActive: { color: '#F02D47' },
  reasonList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EEF0F3' },
  reasonItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF0F3' },
  reasonText: { flex: 1, fontSize: 15, color: '#30343B', fontWeight: '800' },
  radio: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#CDD2DA' },
  radioActive: { borderColor: '#F02D47' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F02D47' },
  emptyBox: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, color: '#20242B', fontWeight: '900' },
  emptyText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, backgroundColor: '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECEEF2' },
  submitBtn: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  submitBtnDisabled: { opacity: 0.55 },
  submitText: { fontSize: 16, color: '#FFF', fontWeight: '900' },
});
