import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { fetchMyMarketCoupons, type MyMarketCoupon } from '@/lib/market-api';

type CouponGroup = {
  key: string;
  shopName: string;
  shopAvatarUrl: string;
  coupons: MyMarketCoupon[];
};

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatClaimedAt(value: string) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CouponsScreen() {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const [coupons, setCoupons] = useState<MyMarketCoupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo<CouponGroup[]>(() => {
    const map = new Map<string, CouponGroup>();
    coupons.forEach((coupon) => {
      const key = String(coupon.shopId || coupon.shopName || 'unknown');
      const current = map.get(key) || {
        key,
        shopName: coupon.shopName || '默认店铺',
        shopAvatarUrl: coupon.shopAvatarUrl || '',
        coupons: [],
      };
      current.coupons.push(coupon);
      map.set(key, current);
    });
    return Array.from(map.values());
  }, [coupons]);

  const loadCoupons = useCallback(async (isRefresh = false) => {
    if (!user?.account) {
      setCoupons([]);
      setError(null);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setCoupons(await fetchMyMarketCoupons());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载优惠券失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [user?.account]);

  useFocusEffect(
    useCallback(() => {
      void loadCoupons();
    }, [loadCoupons]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
            <MaterialCommunityIcons name="chevron-left" size={30} color="#222832" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>我的优惠券</ThemedText>
          <View style={styles.headerSpace} />
        </View>

        {!isReady || loading ? (
          <View style={styles.centerState}>
            <AppActivityIndicator label="正在加载" />
          </View>
        ) : !user ? (
          <View style={styles.centerState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="ticket-percent-outline" size={36} color="#F02D47" />
            </View>
            <ThemedText style={styles.emptyTitle}>登录后查看卡券</ThemedText>
            <Pressable style={styles.loginBtn} onPress={() => router.push('/login')}>
              <ThemedText style={styles.loginText}>去登录</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCoupons(true)} />}>
            <View style={styles.summaryBand}>
              <View>
                <ThemedText style={styles.summaryLabel}>已领取</ThemedText>
                <ThemedText style={styles.summaryValue}>{coupons.length}</ThemedText>
              </View>
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={42} color="#F02D47" />
            </View>

            {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

            {groups.length ? (
              groups.map((group) => (
                <View key={group.key} style={styles.shopSection}>
                  <View style={styles.shopHeader}>
                    {group.shopAvatarUrl ? (
                      <Image source={{ uri: group.shopAvatarUrl }} style={styles.shopAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.shopAvatarFallback}>
                        <MaterialCommunityIcons name="storefront-outline" size={18} color="#7B828C" />
                      </View>
                    )}
                    <View style={styles.shopTitleBlock}>
                      <ThemedText numberOfLines={1} style={styles.shopName}>{group.shopName}</ThemedText>
                      <ThemedText style={styles.shopSub}>{group.coupons.length} 张可用卡券</ThemedText>
                    </View>
                  </View>

                  {group.coupons.map((coupon) => {
                    const claimedAt = formatClaimedAt(coupon.claimedAt);
                    return (
                      <View key={coupon.id} style={styles.ticket}>
                        <View style={styles.ticketLeft}>
                          <View style={styles.amountRow}>
                            <ThemedText style={styles.currency}>¥</ThemedText>
                            <ThemedText style={styles.amount}>{formatPrice(coupon.discount)}</ThemedText>
                          </View>
                          <ThemedText style={styles.threshold}>{coupon.thresholdText}</ThemedText>
                        </View>
                        <View style={styles.ticketRight}>
                          <View style={styles.titleRow}>
                            <View style={styles.scopeTag}>
                              <ThemedText style={styles.scopeText}>{coupon.scope === 'product' ? '商品券' : coupon.scope === 'platform' ? '平台券' : '商家券'}</ThemedText>
                            </View>
                            <ThemedText numberOfLines={1} style={styles.couponTitle}>{coupon.title}</ThemedText>
                          </View>
                          <ThemedText numberOfLines={1} style={styles.couponDesc}>
                            {coupon.scope === 'platform' ? '全平台商品可用' : coupon.productName ? `适用 ${coupon.productName}` : '店铺商品可用'}
                          </ThemedText>
                          <ThemedText numberOfLines={1} style={styles.couponMeta}>
                            {coupon.endAt ? `${coupon.endAt} 前有效` : '长期有效'}{claimedAt ? ` · ${claimedAt} 领取` : ''}
                          </ThemedText>
                          {coupon.shopId ? (
                            <Pressable
                              style={styles.useBtn}
                              onPress={() => router.push({ pathname: '/shop/[id]', params: { id: String(coupon.shopId) } })}>
                              <ThemedText style={styles.useText}>去使用</ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            ) : (
              <View style={styles.centerState}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="ticket-percent-outline" size={36} color="#C8CDD4" />
                </View>
                <ThemedText style={styles.emptyTitle}>暂无已领取优惠券</ThemedText>
                <ThemedText style={styles.stateText}>去商品详情页领取店铺优惠券后会显示在这里</ThemedText>
              </View>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  root: { flex: 1, backgroundColor: '#F6F7F9' },
  header: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EBEF',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, color: '#222832', fontWeight: '900' },
  headerSpace: { width: 40 },
  content: { padding: 14, paddingBottom: 28 },
  summaryBand: {
    minHeight: 104,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECEFF3',
  },
  summaryLabel: { fontSize: 13, color: '#7D8490', fontWeight: '700' },
  summaryValue: { marginTop: 4, fontSize: 28, color: '#222832', fontWeight: '900' },
  shopSection: { marginTop: 14 },
  shopHeader: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  shopAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF0F3' },
  shopAvatarFallback: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF0F3', alignItems: 'center', justifyContent: 'center' },
  shopTitleBlock: { flex: 1 },
  shopName: { fontSize: 15, color: '#252A32', fontWeight: '900' },
  shopSub: { marginTop: 2, fontSize: 12, color: '#9AA1AB', fontWeight: '700' },
  ticket: {
    minHeight: 118,
    marginBottom: 10,
    borderRadius: 8,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECEFF3',
  },
  ticketLeft: { width: 104, backgroundColor: '#FFF1F3', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  currency: { fontSize: 15, color: '#F02D47', fontWeight: '800' },
  amount: { fontSize: 26, color: '#F02D47', fontWeight: '900' },
  threshold: { marginTop: 5, fontSize: 12, color: '#D63C58', fontWeight: '800' },
  ticketRight: { flex: 1, minHeight: 118, paddingLeft: 13, paddingRight: 84, justifyContent: 'center', gap: 7, position: 'relative' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scopeTag: { height: 22, borderRadius: 3, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D7DBE1' },
  scopeText: { fontSize: 12, color: '#59616C', fontWeight: '800' },
  couponTitle: { flex: 1, fontSize: 15, color: '#252A32', fontWeight: '900' },
  couponDesc: { fontSize: 12, color: '#6F7782', fontWeight: '700' },
  couponMeta: { fontSize: 12, color: '#A5ABB4', fontWeight: '700' },
  useBtn: { position: 'absolute', right: 12, top: 42, height: 34, minWidth: 64, borderRadius: 17, paddingHorizontal: 13, backgroundColor: '#F02D47', alignItems: 'center', justifyContent: 'center' },
  useText: { fontSize: 13, color: '#FFF', fontWeight: '900' },
  centerState: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, color: '#252A32', fontWeight: '900', textAlign: 'center' },
  stateText: { fontSize: 13, lineHeight: 20, color: '#8A929D', fontWeight: '700', textAlign: 'center' },
  loginBtn: { marginTop: 8, height: 40, minWidth: 112, borderRadius: 20, paddingHorizontal: 22, backgroundColor: '#F02D47', alignItems: 'center', justifyContent: 'center' },
  loginText: { fontSize: 14, color: '#FFF', fontWeight: '900' },
  errorText: { marginTop: 12, fontSize: 13, color: '#D63C58', fontWeight: '700' },
});
