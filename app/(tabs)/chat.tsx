import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { ensureChatMessageTimeMarkers, type ChatMessageTimeMarker } from '@/lib/chat-message-times';
import { latestMessageKey, readChatReadMarkers, writeConversationReadMarker, type ChatReadMarker } from '@/lib/chat-read-markers';
import { connectChatSocket } from '@/lib/chat-socket';
import { clearConversationMessages, deleteConversationMessages, fetchConversationList, type ConversationItem } from '@/lib/redbook-api';

const shortcutIcons = {
  likes: require('../../public/image/heart.png'),
  follows: require('../../public/image/person.png'),
  comments: require('../../public/image/message.png'),
} as const;

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const tenMinutes = 10 * 60 * 1000;
const HIDDEN_CONVERSATIONS_KEY_PREFIX = '@chat_hidden_conversations_v1:';

function latestMessage(item: ConversationItem) {
  const history = Array.isArray(item.historyMessage) ? item.historyMessage : [];
  return history[history.length - 1];
}

function latestMessageFromOther(item: ConversationItem) {
  const last = latestMessage(item);
  return Boolean(last && !last.mine);
}

function itemUnread(account: string, item: ConversationItem, markers: Record<string, ChatReadMarker>) {
  if (!latestMessageFromOther(item)) return 0;

  const serverUnread = Math.max(0, Number(item.read || 0));
  const marker = markers[`${account}:${item.id}`];
  if (!marker) return serverUnread;

  if (marker.messageKey === latestMessageKey(item)) return 0;
  return Math.max(0, serverUnread - marker.readCount);
}

function itemPreview(item: ConversationItem) {
  const last = latestMessage(item);
  if (!last) return '[暂无消息]';
  const textType = String(last?.text?.type || '');
  if (textType === 'emoji') return String(last?.text?.message || '').trim() || '[表情]';
  if (textType === 'file') return '[文件]';
  return String(last?.text?.message || '');
}

function conversationTimeValue(account: string | undefined, item: ConversationItem, timeMarkers: Record<string, ChatMessageTimeMarker>) {
  const last = latestMessage(item);
  const lastDate = last?.date ?? last?.time ?? last?.lastTime ?? last?.updateTime ?? last?.updatedAt ?? last?.createTime ?? last?.createdAt;
  if (lastDate != null && String(lastDate).trim()) return lastDate;

  const itemDate = item.date ?? item.time ?? item.lastTime ?? item.updateTime ?? item.updatedAt ?? item.createTime ?? item.createdAt;
  if (itemDate != null && String(itemDate).trim()) return itemDate;

  return account && item.id ? timeMarkers[`${account}:${item.id}`]?.seenAt : '';
}

function parseMessageDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 10000000000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const raw = String(value || '').trim();
  if (!raw) return undefined;

  if (/^\d+$/.test(raw)) {
    const timestamp = Number(raw);
    const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const match = raw.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatMessageTime(value: unknown) {
  if (value == null || !String(value).trim()) return '';
  const date = parseMessageDate(value);
  if (!date) return String(value || '');

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (Math.abs(diffMs) < tenMinutes) return '刚刚';

  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);

  if (diffDays === 0) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  if (diffDays > 0 && diffDays < 7) {
    return weekdayLabels[date.getDay()];
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function avatar(url?: string) {
  return resolveMediaUrl(String(url || '').replace(/^\.\.\//, ''));
}

type ChatSocketPacket = {
  type?: number;
  data?: {
    account?: string;
    target?: string;
    message?: unknown;
  };
};

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useFeedback();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [list, setList] = useState<ConversationItem[]>([]);
  const [hiddenConversationIds, setHiddenConversationIds] = useState<string[]>([]);
  const [markers, setMarkers] = useState<Record<string, ChatReadMarker>>({});
  const [timeMarkers, setTimeMarkers] = useState<Record<string, ChatMessageTimeMarker>>({});
  const [, setTimeTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hiddenStorageKey = user?.account ? `${HIDDEN_CONVERSATIONS_KEY_PREFIX}${user.account}` : '';
  const visibleList = list.filter((item) => !hiddenConversationIds.includes(String(item.id)));

  const loadHiddenConversationIds = useCallback(async () => {
    if (!hiddenStorageKey) {
      setHiddenConversationIds([]);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(hiddenStorageKey);
      if (!raw) {
        setHiddenConversationIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setHiddenConversationIds(Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []);
    } catch {
      setHiddenConversationIds([]);
    }
  }, [hiddenStorageKey]);

  useEffect(() => {
    void loadHiddenConversationIds();
  }, [loadHiddenConversationIds]);

  useFocusEffect(
    useCallback(() => {
      void loadHiddenConversationIds();
    }, [loadHiddenConversationIds]),
  );

  const loadList = useCallback(async (options?: { silent?: boolean }) => {
    if (!user?.account) {
      setLoading(false);
      setList([]);
      setMarkers({});
      setTimeMarkers({});
      return;
    }
    if (!options?.silent) setLoading(true);
    try {
      const result = await fetchConversationList(user.account);
      const nextList = Array.isArray(result)
        ? result.filter((item) => String(item?.id || '').trim())
        : [];
      const nextMarkers = await readChatReadMarkers();
      const nextTimeMarkers = await ensureChatMessageTimeMarkers(user.account, nextList);
      setMarkers(nextMarkers);
      setTimeMarkers(nextTimeMarkers);
      setList(nextList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [user?.account]);

  useFocusEffect(
    useCallback(() => {
      void loadList();
    }, [loadList])
  );

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        setTimeTick((value) => value + 1);
      }, 60 * 1000);

      return () => clearInterval(timer);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.account) return undefined;

      const scheduleRefresh = () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          void loadList({ silent: true });
        }, 250);
      };

      const socket = connectChatSocket(user.account, (raw) => {
        const packet = raw as ChatSocketPacket;
        if (packet?.type !== 200 || !packet.data?.message) return;
        scheduleRefresh();
      });

      return () => {
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        socket.close();
      };
    }, [loadList, user?.account])
  );

  async function saveHiddenConversationIds(nextIds: string[]) {
    setHiddenConversationIds(nextIds);
    if (!hiddenStorageKey) return;
    try {
      await AsyncStorage.setItem(hiddenStorageKey, JSON.stringify(nextIds));
    } catch {
      // ignore storage failure
    }
  }

  async function hideConversation(item: ConversationItem) {
    const targetId = String(item.id || '').trim();
    if (!targetId) return;
    const nextIds = Array.from(new Set([...hiddenConversationIds, targetId]));
    await saveHiddenConversationIds(nextIds);
  }

  async function clearConversation(item: ConversationItem) {
    const targetUser = String(item.id || '').trim();
    if (!targetUser || !user?.account) return;
    const ok = await feedback.confirm({
      title: '清空消息',
      message: `确认清空与「${item.title || targetUser}」的聊天记录吗？`,
      confirmLabel: '清空',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearConversationMessages(user.account, targetUser);
      setList((current) =>
        current.map((entry) =>
          String(entry.id) === targetUser
            ? {
                ...entry,
                read: 0,
                historyMessage: [],
              }
            : entry,
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空消息失败');
    }
  }

  async function deleteConversation(item: ConversationItem) {
    const targetUser = String(item.id || '').trim();
    if (!targetUser || !user?.account) return;
    const ok = await feedback.confirm({
      title: '删除消息',
      message: `确认删除与「${item.title || targetUser}」的会话吗？删除后无法恢复。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteConversationMessages(user.account, targetUser);
      setList((current) => current.filter((entry) => String(entry.id) !== targetUser));
      const nextHiddenIds = hiddenConversationIds.filter((id) => id !== targetUser);
      await saveHiddenConversationIds(nextHiddenIds);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除消息失败');
    }
  }

  function renderRowActions(item: ConversationItem, progress: Animated.AnimatedInterpolation<number>) {
    const actionsTranslate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [252, 0],
      extrapolate: 'clamp',
    });
    const hideActionTranslate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [36, 0],
      extrapolate: 'clamp',
    });
    const clearActionTranslate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [24, 0],
      extrapolate: 'clamp',
    });
    const deleteActionTranslate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [12, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.rowActions, { transform: [{ translateX: actionsTranslate }] }]}>
        <Animated.View style={[styles.rowActionAnimated, { transform: [{ translateX: hideActionTranslate }] }]}>
          <Pressable style={[styles.rowActionBtn, styles.rowActionHide]} onPress={() => void hideConversation(item)}>
            <ThemedText style={styles.rowActionText}>隐藏</ThemedText>
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.rowActionAnimated, { transform: [{ translateX: clearActionTranslate }] }]}>
          <Pressable style={[styles.rowActionBtn, styles.rowActionClear]} onPress={() => void clearConversation(item)}>
            <ThemedText style={styles.rowActionText}>清空消息</ThemedText>
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.rowActionAnimated, { transform: [{ translateX: deleteActionTranslate }] }]}>
          <Pressable style={[styles.rowActionBtn, styles.rowActionDelete]} onPress={() => void deleteConversation(item)}>
            <ThemedText style={styles.rowActionText}>删除消息</ThemedText>
          </Pressable>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>消息</ThemedText>
        </View>

        <View style={styles.shortcutRow}>
          <Pressable style={styles.shortcutWrap} onPress={() => router.push('/chat-likes')}>
            <View style={[styles.shortcutIcon, { backgroundColor: '#FCEAE8' }]}>
              <Image source={shortcutIcons.likes} style={styles.shortcutImage} contentFit="contain" />
            </View>
            <ThemedText style={styles.shortcutText}>赞和收藏</ThemedText>
          </Pressable>
          <Pressable style={styles.shortcutWrap} onPress={() => router.push('/follow-fans')}>
            <View style={[styles.shortcutIcon, { backgroundColor: '#E3E9F9' }]}>
              <Image source={shortcutIcons.follows} style={styles.shortcutImage} contentFit="contain" />
            </View>
            <ThemedText style={styles.shortcutText}>我的关注</ThemedText>
          </Pressable>
          <Pressable style={styles.shortcutWrap} onPress={() => router.push('/chat-comments')}>
            <View style={[styles.shortcutIcon, { backgroundColor: '#DDF0EA' }]}>
              <Image source={shortcutIcons.comments} style={styles.shortcutImage} contentFit="contain" />
            </View>
            <ThemedText style={styles.shortcutText}>评论和@</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={visibleList}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => void loadList()}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? <AppActivityIndicator label="正在加载会话" /> : <ThemedText style={styles.emptyText}>{error || '暂无会话'}</ThemedText>}
            </View>
          }
          renderItem={({ item }) => {
            const unread = user?.account ? itemUnread(user.account, item, markers) : 0;
            return (
              <Swipeable
                overshootRight={false}
                friction={1.8}
                rightThreshold={36}
                renderRightActions={(progress) => renderRowActions(item, progress)}>
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    if (user?.account) {
                      setMarkers((prev) => ({
                        ...prev,
                        [`${user.account}:${item.id}`]: {
                          messageKey: latestMessageKey(item),
                          readCount: Math.max(0, Number(item.read || 0)),
                        },
                      }));
                      void writeConversationReadMarker(user.account, item);
                    }
                    router.push({
                      pathname: '/chat/[id]',
                      params: {
                        id: String(item.id || ''),
                        title: String(item.title || item.id || ''),
                        url: String(item.url || ''),
                      },
                    });
                  }}>
                  <View style={styles.avatarWrap}>
                    {avatar(item.url) ? (
                      <Image source={{ uri: avatar(item.url) }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]} />
                    )}
                    {unread > 0 ? (
                      <View style={styles.badge}>
                        <ThemedText style={styles.badgeText}>{unread > 99 ? '99+' : unread}</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.main}>
                    <ThemedText style={styles.name} numberOfLines={1}>{item.title || item.id}</ThemedText>
                    <ThemedText style={styles.preview} numberOfLines={1}>{itemPreview(item)}</ThemedText>
                  </View>

                  <View style={styles.right}>
                    <ThemedText style={styles.time} numberOfLines={1}>
                      {formatMessageTime(conversationTimeValue(user?.account, item, timeMarkers))}
                    </ThemedText>
                  </View>
                </Pressable>
              </Swipeable>
            );
          }}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF' },
  header: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 18, color: '#111', fontWeight: '600' },
  shortcutRow: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  shortcutWrap: { alignItems: 'center', gap: 6 },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutImage: { width: 22, height: 22 },
  shortcutText: { fontSize: 12, color: '#333' },
  list: { paddingTop: 4, paddingBottom: 24 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 42 },
  emptyText: { color: '#8E8E93' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F3F3',
  },
  avatarWrap: { width: 62, height: 62, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E5E5E5' },
  avatarFallback: { backgroundColor: '#E5E5E5' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFF', fontSize: 10, lineHeight: 18, fontWeight: '700', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
  main: { flex: 1, gap: 5, minWidth: 0, paddingRight: 8 },
  name: { fontSize: 16, fontWeight: '600', color: '#222' },
  preview: { fontSize: 13, color: '#8E8E93' },
  right: { width: 88, alignItems: 'flex-end', justifyContent: 'flex-start', height: 54, paddingTop: 6, marginRight: 8 },
  time: { width: 88, fontSize: 11, color: '#8E8E93', textAlign: 'right' },
  rowActions: {
    width: 252,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  rowActionAnimated: { alignSelf: 'stretch' },
  rowActionBtn: {
    width: 84,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rowActionHide: { backgroundColor: '#8E8E93' },
  rowActionClear: { backgroundColor: '#F5A623' },
  rowActionDelete: { backgroundColor: '#FF2442' },
  rowActionText: { color: '#FFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
