import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppActivityIndicator } from '@/components/app-loading';
import { SkeletonImage } from '@/components/skeleton-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { postJson } from '@/lib/post-json';
import BackIcon from '@/public/icon/fanhuijiantou.svg';

const avatarImage = require('../public/image/avatar.jpg');

type NoticeItem = {
  id: string;
  kind?: string;
  actor?: {
    account?: string;
    name?: string;
    avatar?: string;
  };
  action: string;
  date: string;
  message?: string;
  quote: string;
  thumbnail?: string;
  contentType?: 'note' | 'video';
  contentId?: string;
};

type NoticeResponse = { data?: NoticeItem[] };

const COMMENT_NOTICE_KINDS = new Set(['comment-received', 'reply-received', 'mention-received']);
const DELETED_COMMENTS_KEY_PREFIX = '@chat_comments_deleted_v1:';

function formatNoticeDate(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw.replace(/-/g, '/'));
  if (Number.isNaN(date.getTime())) return raw.slice(5, 10) || raw;
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function noticeTime(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const date = new Date(raw.replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default function ChatCommentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const deletedKey = user?.account ? `${DELETED_COMMENTS_KEY_PREFIX}${user.account}` : '';

  useEffect(() => {
    let cancelled = false;
    if (!deletedKey) {
      setDeletedIds([]);
      return;
    }
    AsyncStorage.getItem(deletedKey)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setDeletedIds([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          setDeletedIds(Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []);
        } catch {
          setDeletedIds([]);
        }
      })
      .catch(() => {
        if (!cancelled) setDeletedIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deletedKey]);

  const loadNotices = useCallback(
    async (isRefresh = false) => {
      if (!user?.account) {
        setNotices([]);
        setLoading(false);
        setError('登录后查看收到的评论和@');
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { result } = await postJson<NoticeResponse>('/user/receivedInteractions', { account: user.account });
        const list = Array.isArray(result?.data)
          ? result.data
              .filter((item) => COMMENT_NOTICE_KINDS.has(String(item.kind || '').trim()))
              .filter((item) => !deletedIds.includes(String(item.id)))
              .sort((a, b) => noticeTime(b.date) - noticeTime(a.date))
          : [];
        setNotices(list);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setNotices([]);
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [deletedIds, user?.account],
  );

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  function openNotice(item: NoticeItem) {
    const id = String(item.contentId || '').trim();
    if (!id) return;
    if (item.contentType === 'video') {
      router.push({ pathname: '/(tabs)/video', params: { id } });
      return;
    }
    router.push({ pathname: '/note/[id]', params: { id } });
  }

  async function deleteNotice(itemId: string) {
    const id = String(itemId || '').trim();
    if (!id) return;
    const next = Array.from(new Set([...deletedIds, id]));
    setDeletedIds(next);
    setNotices((current) => current.filter((item) => String(item.id) !== id));
    if (deletedKey) {
      try {
        await AsyncStorage.setItem(deletedKey, JSON.stringify(next));
      } catch {
        // ignore storage failure
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat'))}>
            <BackIcon width={28} height={28} color="#22252B" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>收到的评论和@</ThemedText>
          <View style={styles.headerSpace} />
        </View>

        <FlatList
          data={notices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => void loadNotices(true)}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? <AppActivityIndicator label="正在加载" /> : <ThemedText style={styles.emptyText}>{error || '暂无收到的评论和@'}</ThemedText>}
            </View>
          }
          renderItem={({ item }) => (
            <Swipeable
              overshootRight={false}
              friction={1.8}
              rightThreshold={34}
              renderRightActions={(progress) => {
                const actionsTranslate = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [82, 0],
                  extrapolate: 'clamp',
                });
                const btnTranslate = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                  extrapolate: 'clamp',
                });
                return (
                  <Animated.View style={[styles.deleteActions, { transform: [{ translateX: actionsTranslate }] }]}>
                    <Animated.View style={[styles.deleteActionAnimated, { transform: [{ translateX: btnTranslate }] }]}>
                      <Pressable style={styles.deleteBtn} onPress={() => void deleteNotice(item.id)}>
                        <ThemedText style={styles.deleteText}>删除</ThemedText>
                      </Pressable>
                    </Animated.View>
                  </Animated.View>
                );
              }}>
              <Pressable style={styles.row} onPress={() => openNotice(item)}>
                <SkeletonImage source={item.actor?.avatar ? { uri: resolveMediaUrl(item.actor.avatar) } : avatarImage} style={styles.avatar} contentFit="cover" />
                <View style={styles.main}>
                  <View style={styles.nameRow}>
                    <ThemedText numberOfLines={1} style={styles.name}>{item.actor?.name || item.actor?.account || '用户'}</ThemedText>
                  </View>
                  <View style={styles.metaRow}>
                    <ThemedText numberOfLines={1} style={styles.action}>{item.action}</ThemedText>
                    <ThemedText style={styles.date}>{formatNoticeDate(item.date)}</ThemedText>
                  </View>
                  <ThemedText numberOfLines={2} style={styles.content}>{item.message || '评论了你发布的内容'}</ThemedText>
                  <View style={styles.quoteRow}>
                    <View style={styles.quoteLine} />
                    <ThemedText numberOfLines={1} style={styles.quote}>{item.quote || '点击查看详情'}</ThemedText>
                  </View>
                </View>
                {item.thumbnail ? <SkeletonImage source={{ uri: resolveMediaUrl(item.thumbnail) }} style={styles.thumbnail} contentFit="cover" /> : <View style={styles.thumbnailPlaceholder} />}
              </Pressable>
            </Swipeable>
          )}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F1F1',
  },
  backBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, color: '#20242B', fontWeight: '600' },
  headerSpace: { width: 56 },
  list: { paddingHorizontal: 18, flexGrow: 1 },
  empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: '#8E8E93', fontSize: 14 },
  row: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1F1F1' },
  main: { flex: 1, minWidth: 0, paddingLeft: 14, paddingRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { maxWidth: '76%', fontSize: 15, color: '#20242B', fontWeight: '600', lineHeight: 22 },
  metaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { fontSize: 12, color: '#7B7F87', lineHeight: 17 },
  date: { fontSize: 12, color: '#7B7F87', lineHeight: 17 },
  content: { marginTop: 5, fontSize: 14, color: '#292D33', lineHeight: 21 },
  quoteRow: { marginTop: 8, minHeight: 18, flexDirection: 'row', alignItems: 'center' },
  quoteLine: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#ECEDEF', marginRight: 7 },
  quote: { flex: 1, fontSize: 12, color: '#777B83', lineHeight: 18 },
  thumbnail: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#F2F2F2', marginRight: 10 },
  thumbnailPlaceholder: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#F6F6F6', marginRight: 10 },
  deleteActions: {
    width: 82,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  deleteActionAnimated: { alignSelf: 'stretch' },
  deleteBtn: {
    width: 82,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2442',
  },
  deleteText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
