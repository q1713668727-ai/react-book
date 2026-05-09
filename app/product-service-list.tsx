import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { SkeletonImage } from '@/components/skeleton-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { deleteCachedServiceSession, mergeServiceSessionList, readCachedServiceSessions, writeCachedServiceSessions } from '@/lib/chat-local-cache';
import { deleteMarketServiceSession, fetchMarketServiceSessions, type MarketServiceSession } from '@/lib/market-api';
import DefaultShopIcon from '@/public/icon/dp.svg';
import PictureIcon from '@/public/icon/tupian.svg';

function formatTime(value: number) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const pad = (input: number) => String(input).padStart(2, '0');
  if (date.toDateString() === now.toDateString()) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPreview(session: MarketServiceSession, content: string) {
  const text = String(content || '').trim();
  const last = session.messages[session.messages.length - 1];
  if (last?.recalledAt) return last.sender === 'user' ? '[我] 撤回了一条消息' : '[客服] 撤回了一条消息';
  if (!text) return '暂无消息';
  const prefix = last?.sender === 'merchant' ? '[客服] ' : last?.sender === 'ai' ? '[AI] ' : '[我] ';
  return `${prefix}${text}`;
}

export default function ProductServiceListScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const [sessions, setSessions] = useState<MarketServiceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchText, setSearchText] = useState('');
  const [keyboardFrame, setKeyboardFrame] = useState<{ screenY: number; height: number } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const cached = user?.account ? await readCachedServiceSessions(user.account) : [];
      if (cached.length && !options?.silent) {
        setSessions(cached);
        setLoading(false);
      }
      const cloud = await fetchMarketServiceSessions();
      const next = user?.account ? mergeServiceSessionList(cached, cloud) : cloud;
      setSessions(next);
      if (user?.account) await writeCachedServiceSessions(user.account, next);
    } catch (error) {
      if (!options?.silent) {
        setSessions([]);
        feedback.toast(error instanceof Error ? error.message : '客服消息加载失败');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [feedback, user?.account]);

  const refreshSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSessions();
    } finally {
      setRefreshing(false);
    }
  }, [loadSessions]);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
      pollTimerRef.current = setInterval(() => {
        void loadSessions({ silent: true });
      }, 2000);
      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }, [loadSessions]),
  );

  const keyboardHeight = useMemo(() => {
    if (!keyboardFrame) return 0;

    const frameHeight = Number.isFinite(keyboardFrame.height) ? Math.max(0, keyboardFrame.height) : 0;
    const screenY = Number.isFinite(keyboardFrame.screenY)
      ? keyboardFrame.screenY
      : windowDimensions.height - frameHeight;
    const overlap = Math.max(0, windowDimensions.height - screenY);
    const inset = overlap > 0 ? Math.min(overlap, frameHeight || overlap) : frameHeight;

    return Math.max(0, inset - insets.bottom);
  }, [insets.bottom, keyboardFrame, windowDimensions.height]);
  const effectiveKeyboardHeight = keyboardHeight;

  useEffect(() => {
    const updateKeyboardFrame = (event: { endCoordinates?: { height?: number; screenY?: number } }) => {
      const height = Math.max(0, Number(event.endCoordinates?.height || 0));
      const screenY = Number(event.endCoordinates?.screenY);
      setKeyboardFrame({
        height,
        screenY: Number.isFinite(screenY) ? screenY : windowDimensions.height - height,
      });
    };
    const hideKeyboardFrame = () => {
      setKeyboardFrame(null);
    };
    const frameSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', updateKeyboardFrame);
    const didShowSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidShow', updateKeyboardFrame) : null;
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hideKeyboardFrame);
    const didHideSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidHide', hideKeyboardFrame) : null;

    return () => {
      frameSub.remove();
      didShowSub?.remove();
      hideSub.remove();
      didHideSub?.remove();
    };
  }, [windowDimensions.height]);

  const rows = useMemo(
    () =>
      [...sessions]
        .filter((session) => {
          const keyword = searchText.trim().toLowerCase();
          if (!keyword) return true;
          const shop = String(session.shop || '').toLowerCase();
          const product = String(session.product || '').toLowerCase();
          const content = String(session.messages[session.messages.length - 1]?.content || '').toLowerCase();
          return shop.includes(keyword) || product.includes(keyword) || content.includes(keyword);
        })
        .sort((a, b) => {
          const ta = Number(a.messages[a.messages.length - 1]?.createdAt || a.updatedAt || 0);
          const tb = Number(b.messages[b.messages.length - 1]?.createdAt || b.updatedAt || 0);
          return sortOrder === 'desc' ? tb - ta : ta - tb;
        })
        .map((session) => ({
        session,
        lastMessage: session.messages[session.messages.length - 1],
      })),
    [sessions, sortOrder, searchText],
  );

  const handleDeleteSession = useCallback(
    async (session: MarketServiceSession) => {
      const ok = await feedback.confirm({
        title: '删除聊天',
        message: `确认删除与「${session.shop || '店铺客服'}」的聊天吗？`,
        confirmLabel: '删除',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteMarketServiceSession(session.id);
        if (user?.account) await deleteCachedServiceSession(user.account, session.id);
        setSessions((prev) => prev.filter((item) => item.id !== session.id));
        feedback.toast('聊天已删除');
      } catch (error) {
        feedback.toast(error instanceof Error ? error.message : '删除聊天失败');
      }
    },
    [feedback, user?.account],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
            <Feather name="chevron-left" size={30} color="#22252B" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>客服消息</ThemedText>
          <Pressable hitSlop={10} style={styles.sortBtn} onPress={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}>
            <ThemedText style={styles.sortLabel}>更新时间</ThemedText>
            <View style={styles.sortTriangles}>
              <Feather name="chevron-up" size={10} color={sortOrder === 'asc' ? '#F02D47' : '#9EA3AA'} />
              <Feather name="chevron-down" size={10} color={sortOrder === 'desc' ? '#F02D47' : '#9EA3AA'} style={styles.sortDown} />
            </View>
          </Pressable>
          <Pressable hitSlop={10} style={styles.headerIcon} onPress={() => void loadSessions()}>
            <Feather name="refresh-cw" size={20} color="#20242B" />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color="#8D939C" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索店铺、商品或消息"
            placeholderTextColor="#A1A6AE"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchText ? (
            <Pressable hitSlop={8} onPress={() => setSearchText('')}>
              <Feather name="x-circle" size={16} color="#9CA2AB" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={[styles.content, { paddingBottom: 24 + effectiveKeyboardHeight }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshSessions()} />}>
          {rows.length ? (
            rows.map(({ session, lastMessage }) => (
              <Pressable
                key={session.id}
                style={styles.sessionRow}
                onPress={() =>
                  router.push({
                    pathname: '/product-service',
                    params: {
                      productId: session.productId ? String(session.productId) : undefined,
                      shopId: session.shopId ? String(session.shopId) : undefined,
                      shop: session.shop,
                      name: session.product || '商品咨询',
                      price: String(session.productPrice || ''),
                      imageUrl: session.productImageUrl || '',
                    },
                  })
                }>
                <View style={styles.shopAvatar}>
                  {session.shopAvatarUrl ? <SkeletonImage source={{ uri: session.shopAvatarUrl }} style={styles.avatarImage} contentFit="cover" /> : <DefaultShopIcon width={24} height={24} />}
                </View>
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionTitleRow}>
                    <ThemedText numberOfLines={1} style={styles.shopName}>{session.shop || '店铺客服'}</ThemedText>
                    <ThemedText style={styles.timeText}>{formatTime(lastMessage?.createdAt || session.updatedAt)}</ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText numberOfLines={2} style={styles.lastMessage}>{formatPreview(session, lastMessage?.content || '')}</ThemedText>
                    {Number(session.unreadCount || 0) > 0 ? (
                      <View style={styles.unreadBadge}>
                        <ThemedText style={styles.unreadText}>
                          {Number(session.unreadCount || 0) > 99 ? '99+' : Number(session.unreadCount || 0)}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  {session.product ? (
                    <View style={styles.productLine}>
                      <View style={styles.productThumb}>
                        {session.productImageUrl ? <SkeletonImage source={{ uri: session.productImageUrl }} style={styles.avatarImage} contentFit="cover" /> : <PictureIcon width={16} height={16} color="#C6CBD3" />}
                      </View>
                      <ThemedText numberOfLines={1} style={styles.productName}>{session.product}</ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    hitSlop={8}
                    style={styles.deleteBtn}
                    onPress={(event) => {
                      event.stopPropagation();
                      void handleDeleteSession(session);
                    }}>
                    <Feather name="trash-2" size={16} color="#F02D47" />
                  </Pressable>
                  <Feather name="chevron-right" size={22} color="#B2B6BE" />
                </View>
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <ThemedText style={styles.emptyTitle}>{loading ? '正在加载客服消息' : '暂无客服消息'}</ThemedText>
              <ThemedText style={styles.emptyText}>咨询过商品的商家会显示在这里</ThemedText>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F6F6F7' },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F1F3' },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, color: '#20242B', fontWeight: '900' },
  sortBtn: { height: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginRight: 2 },
  sortLabel: { fontSize: 12, color: '#6E7480', fontWeight: '800', marginRight: 2 },
  sortTriangles: { alignItems: 'center', justifyContent: 'center', width: 10, height: 14 },
  sortDown: { marginTop: -3, transform: [{ rotate: '180deg' }] },
  searchWrap: {
    height: 42,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#20242B',
    fontWeight: '600',
    paddingVertical: 0,
  },
  content: { paddingBottom: 24 },
  sessionRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F2F4' },
  shopAvatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4E3' },
  avatarImage: { width: '100%', height: '100%' },
  sessionInfo: { flex: 1, gap: 5, paddingRight: 8 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shopName: { flex: 1, fontSize: 16, color: '#20242B', fontWeight: '900' },
  timeText: { fontSize: 12, color: '#9EA3AA', fontWeight: '700' },
  lastMessage: { flex: 1, fontSize: 13, color: '#6E7480', fontWeight: '700', lineHeight: 18 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2442',
    marginTop: 1,
    marginRight: 2,
    flexShrink: 0,
  },
  unreadText: { fontSize: 11, color: '#FFFFFF', fontWeight: '800', lineHeight: 12, includeFontPadding: false, textAlign: 'center' },
  productLine: { maxWidth: '96%', height: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8, borderRadius: 4, backgroundColor: '#F5F6F8', overflow: 'hidden' },
  productThumb: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EAEE' },
  productName: { flex: 1, fontSize: 12, color: '#8A909A', fontWeight: '700' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1F3' },
  emptyBox: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  emptyText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
});
