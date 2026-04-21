import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { messageReadKey, writeChatReadMarker } from '@/lib/chat-read-markers';
import { connectChatSocket } from '@/lib/chat-socket';
import { createConversation, fetchConversation, fetchFollowStatus, toggleFollow, type ConversationItem } from '@/lib/redbook-api';
import EmojiIcon from '@/public/icon/biaoqing.svg';
import MoreIcon from '@/public/icon/gengduo.svg';

type ChatMessage = {
  id: string;
  mine: boolean;
  date: string;
  type: 'text' | 'emoji';
  text?: string;
  emoji?: keyof typeof emojiAssets;
};

type ChatDisplayItem =
  | {
      kind: 'time';
      id: string;
      text: string;
    }
  | {
      kind: 'message';
      id: string;
      message: ChatMessage;
    };

type HistoryMessage = NonNullable<ConversationItem['historyMessage']>[number];

const emojiAssets = {
  '0.gif': require('../../public/emoji/0.gif'),
  '1.gif': require('../../public/emoji/1.gif'),
  '2.gif': require('../../public/emoji/2.gif'),
  '3.gif': require('../../public/emoji/3.gif'),
  '4.gif': require('../../public/emoji/4.gif'),
  '5.gif': require('../../public/emoji/5.gif'),
  '6.gif': require('../../public/emoji/6.gif'),
  '7.gif': require('../../public/emoji/7.gif'),
  '8.gif': require('../../public/emoji/8.gif'),
  '9.gif': require('../../public/emoji/9.gif'),
  '10.gif': require('../../public/emoji/10.gif'),
  '11.gif': require('../../public/emoji/11.gif'),
  '12.gif': require('../../public/emoji/12.gif'),
  '13.gif': require('../../public/emoji/13.gif'),
  '14.gif': require('../../public/emoji/14.gif'),
  '15.gif': require('../../public/emoji/15.gif'),
  '16.gif': require('../../public/emoji/16.gif'),
  '17.gif': require('../../public/emoji/17.gif'),
  '18.gif': require('../../public/emoji/18.gif'),
  '19.gif': require('../../public/emoji/19.gif'),
  '20.gif': require('../../public/emoji/20.gif'),
  '21.gif': require('../../public/emoji/21.gif'),
  '22.gif': require('../../public/emoji/22.gif'),
  '23.gif': require('../../public/emoji/23.gif'),
  '24.gif': require('../../public/emoji/24.gif'),
  '25.gif': require('../../public/emoji/25.gif'),
  '26.gif': require('../../public/emoji/26.gif'),
  '27.gif': require('../../public/emoji/27.gif'),
  '28.gif': require('../../public/emoji/28.gif'),
  '29.gif': require('../../public/emoji/29.gif'),
  '30.gif': require('../../public/emoji/30.gif'),
  '31.gif': require('../../public/emoji/31.gif'),
  '32.gif': require('../../public/emoji/32.gif'),
  '33.gif': require('../../public/emoji/33.gif'),
  '34.gif': require('../../public/emoji/34.gif'),
  '35.gif': require('../../public/emoji/35.gif'),
} as const;

const emojiList = Object.keys(emojiAssets) as (keyof typeof emojiAssets)[];
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const tenMinutes = 10 * 60 * 1000;

function normalizeEmojiKey(value: unknown): keyof typeof emojiAssets | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const file = raw.includes('/') ? raw.split('/').pop() || '' : raw;
  if (Object.prototype.hasOwnProperty.call(emojiAssets, file)) return file as keyof typeof emojiAssets;
  return undefined;
}

function toChatMessages(history: ConversationItem['historyMessage']) {
  return (Array.isArray(history) ? history : []).map((item, index) => {
    const textType = item?.text?.type === 'emoji' ? 'emoji' : 'text';
    const date = historyMessageDate(item);
    return {
      id: `${date || 'd'}-${index}`,
      mine: Boolean(item?.mine),
      date: String(date || ''),
      type: textType,
      text: textType === 'text' ? String(item?.text?.message || '') : undefined,
      emoji: textType === 'emoji' ? normalizeEmojiKey(item?.text?.url) : undefined,
    } as ChatMessage;
  });
}

function avatarUri(url?: string) {
  return resolveMediaUrl(String(url || '').replace(/^\.\.\//, ''));
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

function historyMessageDate(message: HistoryMessage | undefined) {
  if (!message) return '';
  const record = message as HistoryMessage & Record<string, unknown>;
  const value =
    record.date ??
    record.time ??
    record.lastTime ??
    record.updateTime ??
    record.updatedAt ??
    record.createTime ??
    record.createdAt ??
    '';
  return String(value || '');
}

function formatDetailTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (Math.abs(diffMs) < tenMinutes) return '刚刚';

  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);

  if (diffDays === 0) return `今天 ${time}`;
  if (diffDays > 0 && diffDays < 7) return `${weekdayLabels[date.getDay()]} ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function toDisplayMessages(messages: ChatMessage[]) {
  const items: ChatDisplayItem[] = [];
  let lastShownTime = 0;

  messages.forEach((message, index) => {
    const date = parseMessageDate(message.date);
    if (date) {
      const time = date.getTime();
      if (!lastShownTime || time - lastShownTime >= tenMinutes) {
        items.push({
          kind: 'time',
          id: `time-${message.id}-${index}`,
          text: formatDetailTime(date),
        });
        lastShownTime = time;
      }
    }

    items.push({
      kind: 'message',
      id: message.id,
      message,
    });
  });

  return items;
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; title?: string; url?: string }>();
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const readCountRef = useRef(0);
  const listRef = useRef<FlatList<ChatDisplayItem> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatId = String(params.id || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [listHeight, setListHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(80);
  const [followed, setFollowed] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [timeTick, setTimeTick] = useState(0);

  const targetName = String(params.title || chatId || '聊天');
  const targetAvatar = avatarUri(String(params.url || ''));
  const myAvatar = avatarUri(String(user?.url || ''));

  useEffect(() => {
    readCountRef.current = 0;
  }, [user?.account, chatId]);

  const ensureConversation = useCallback(async () => {
    if (!user?.account || !chatId || chatId === user.account) return false;

    const response = await fetchConversation({ account: user.account, target: chatId });
    const history = toChatMessages(response.result?.historyMessage);
    setMessages(history);
    const latest = response.result?.historyMessage?.[response.result.historyMessage.length - 1];
    readCountRef.current = Math.max(readCountRef.current, Number(response.result?.read || 0));
    void writeChatReadMarker(user.account, chatId, messageReadKey(latest), readCountRef.current);

    const isFirstChat = Boolean((response as unknown as { firstChat?: boolean }).firstChat);
    if (!isFirstChat) return true;

    const target = {
      id: chatId,
      avatar: String(params.url || ''),
      title: targetName,
      read: 0,
      historyMessage: [],
    };
    const me = {
      id: user.account,
      avatar: String(user.url || ''),
      title: String(user.name || user.account),
      read: 0,
      historyMessage: [],
    };
    await createConversation({
      me: {
        message: JSON.stringify(target),
        UserToUser: `${user.account}-${chatId}`,
        account: user.account,
      },
      you: {
        message: JSON.stringify(me),
        UserToUser: `${chatId}-${user.account}`,
        account: chatId,
      },
    });
    return true;
  }, [user?.account, user?.name, user?.url, chatId, params.url, targetName]);

  useEffect(() => {
    if (!user?.account || !chatId) return;
    let unmounted = false;

    (async () => {
      try {
        const ok = await ensureConversation();
        if (!ok || unmounted) return;
        const ws = connectChatSocket(user.account, (raw) => {
          const packet = raw as { type?: number; data?: { account?: string; target?: string; message?: HistoryMessage } };
          if (packet?.type !== 200 || !packet.data || !packet.data.message) return;

          const incomingAccount = String(packet.data.account || '');
          const incomingTarget = String(packet.data.target || '');
          if (incomingAccount !== chatId && incomingTarget !== chatId) return;
          if (incomingAccount === user.account) return;

          const data = packet.data.message;
          const receivedAt = historyMessageDate(data) || new Date().toISOString();
          readCountRef.current += 1;
          void writeChatReadMarker(user.account, chatId, messageReadKey(data), readCountRef.current);
          const next: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            mine: !Boolean(incomingAccount === chatId),
            date: receivedAt,
            type: data.text?.type === 'emoji' ? 'emoji' : 'text',
            text: data.text?.type === 'text' ? String(data.text.message || '') : undefined,
            emoji: data.text?.type === 'emoji' ? normalizeEmojiKey(data.text.url) : undefined,
          };
          setMessages((prev) => [...prev, next]);
        });
        socketRef.current = ws;
        setReady(true);
      } catch {
        setReady(false);
      }
    })();

    return () => {
      unmounted = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user?.account, chatId, ensureConversation]);

  useEffect(() => {
    if (!user?.account || !chatId || chatId === user.account) {
      setFollowed(false);
      return;
    }

    let cancelled = false;
    fetchFollowStatus(chatId)
      .then((nextFollowed) => {
        if (!cancelled) setFollowed(nextFollowed);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user?.account, chatId]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const canSend = useMemo(() => text.trim().length > 0 && !sending && ready, [text, sending, ready]);
  const shouldInvertMessages = listHeight > 0 && contentHeight > listHeight + 1;
  const displayMessages = useMemo(() => {
    const next = toDisplayMessages(messages);
    return shouldInvertMessages ? next.reverse() : next;
  }, [messages, shouldInvertMessages, timeTick]);
  const messagesComposerPadding = useMemo(
    () =>
      shouldInvertMessages
        ? {
            paddingTop: composerHeight + keyboardHeight + 16,
          }
        : {
            paddingBottom: composerHeight + keyboardHeight + 16,
          },
    [composerHeight, keyboardHeight, shouldInvertMessages]
  );

  useEffect(() => {
    if (!messages.length) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      if (shouldInvertMessages) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        listRef.current?.scrollToEnd({ animated: true });
      }
    }, 80);

    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [composerHeight, keyboardHeight, messages.length, shouldInvertMessages]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setInterval(() => setTimeTick((tick) => tick + 1), 60000);
    return () => clearInterval(timer);
  }, [messages.length]);

  async function sendMessage(type: 'text' | 'emoji', value: string) {
    if (!user?.account || !chatId || !ready || sending) return;
    setSending(true);
    try {
      const sentAt = new Date().toISOString();
      const payload = {
        UserToUser: `${user.account}-${chatId}`,
        account: user.account,
        target: chatId,
        message: {
          date: sentAt,
          mine: true,
          text:
            type === 'text'
              ? { message: value, type: 'text' }
              : { url: value, type: 'emoji' },
        },
      };

      socketRef.current?.send(JSON.stringify(payload));
      const emoji = type === 'emoji' ? normalizeEmojiKey(value) : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          mine: true,
          date: sentAt,
          type,
          text: type === 'text' ? value : undefined,
          emoji,
        },
      ]);
      if (type === 'text') setText('');
    } finally {
      setSending(false);
    }
  }

  function goTargetProfile() {
    router.push({
      pathname: '/user/[account]',
      params: { account: chatId, name: targetName, avatar: String(params.url || '') },
    });
  }

  async function handleToggleFollow() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!chatId || chatId === user.account || followPending) return;

    const previous = followed;
    const next = !previous;
    setFollowed(next);
    setFollowPending(true);
    try {
      const res = await toggleFollow(chatId, next ? 'follow' : 'unfollow');
      setFollowed(Boolean(res.result?.followed));
    } catch {
      setFollowed(previous);
    } finally {
      setFollowPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitleAlign: 'left',
          headerTitle: () => (
            <Pressable style={styles.headerUser} onPress={goTargetProfile}>
              {targetAvatar ? (
                <Image source={{ uri: targetAvatar }} style={styles.headerAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.headerAvatar, styles.avatarFallback]} />
              )}
              <ThemedText style={styles.headerName} numberOfLines={1}>{targetName}</ThemedText>
              {user?.account && chatId !== user.account ? (
                <Pressable
                  style={[styles.headerFollowBtn, followed ? styles.headerFollowedBtn : styles.headerFollowActiveBtn, followPending ? styles.headerFollowPending : null]}
                  disabled={followPending}
                  onPress={(event) => {
                    event.stopPropagation();
                    void handleToggleFollow();
                  }}>
                  <ThemedText style={[styles.headerFollowText, followed ? styles.headerFollowedText : styles.headerFollowActiveText]}>
                    {followPending ? '处理中' : followed ? '已关注' : '关注'}
                  </ThemedText>
                </Pressable>
              ) : null}
            </Pressable>
          ),
          headerRight: () => (
            <Pressable style={styles.headerMoreBtn} onPress={goTargetProfile}>
              <MoreIcon width={24} height={24} color="#3D3D3D" />
            </Pressable>
          ),
        }}
      />
      <ThemedView style={styles.root}>
        <FlatList
          ref={listRef}
          style={styles.messages}
          contentContainerStyle={[styles.messagesContent, messagesComposerPadding]}
          data={displayMessages}
          inverted={shouldInvertMessages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          renderItem={({ item }) => {
            if (item.kind === 'time') {
              return (
                <View style={styles.timeRow}>
                  <ThemedText style={styles.timeText}>{item.text}</ThemedText>
                </View>
              );
            }

            const message = item.message;
            return (
              <View key={message.id} style={[styles.msgRow, message.mine ? styles.msgRowMine : styles.msgRowYou]}>
                {message.mine ? null : targetAvatar ? (
                  <Image source={{ uri: targetAvatar }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]} />
                )}

                <View style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleYou]}>
                  {message.type === 'emoji' ? (
                    message.emoji ? <Image source={emojiAssets[message.emoji]} style={styles.emojiImage} contentFit="contain" /> : <ThemedText style={styles.bubbleYouText}>[表情]</ThemedText>
                  ) : (
                    <ThemedText style={message.mine ? styles.bubbleMineText : styles.bubbleYouText}>{message.text}</ThemedText>
                  )}
                </View>

                {message.mine ? myAvatar ? (
                  <Image source={{ uri: myAvatar }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]} />
                ) : null}
              </View>
            );
          }}
        />

        <View style={[styles.composer, { bottom: keyboardHeight }]} onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}>
          {showEmoji ? (
            <View style={styles.emojiPanel}>
              {emojiList.map((emojiKey) => (
                <Pressable key={emojiKey} style={styles.emojiBtn} onPress={() => void sendMessage('emoji', emojiKey)}>
                  <Image source={emojiAssets[emojiKey]} style={styles.emojiBtnImage} contentFit="contain" />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.inputBar}>
            <Pressable
              style={styles.emojiToggle}
              onPress={() => {
                setShowEmoji((prev) => {
                  const next = !prev;
                  if (next) Keyboard.dismiss();
                  return next;
                });
              }}>
              <EmojiIcon width={26} height={26} color={showEmoji ? '#FF2442' : '#5B6475'} fill={showEmoji ? '#FF2442' : '#5B6475'} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={ready ? '输入消息' : '连接中...'}
              editable={ready && !sending}
              onFocus={() => setShowEmoji(false)}
            />
            <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend} onPress={() => void sendMessage('text', text.trim())}>
              <ThemedText style={styles.sendText}>{sending ? '发送中' : '发送'}</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  headerUser: { maxWidth: 245, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -12 },
  headerAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECECEE' },
  headerName: { maxWidth: 112, flexShrink: 1, fontSize: 16, color: '#111', fontWeight: '700' },
  headerFollowBtn: { minWidth: 52, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  headerFollowActiveBtn: { backgroundColor: '#FF2442' },
  headerFollowedBtn: { backgroundColor: '#F0F1F4' },
  headerFollowPending: { opacity: 0.65 },
  headerFollowText: { fontSize: 12, fontWeight: '700' },
  headerFollowActiveText: { color: '#FFF' },
  headerFollowedText: { color: '#8E8E93' },
  headerMoreBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  messages: { flex: 1 },
  messagesContent: { padding: 12, gap: 12 },
  timeRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  timeText: { color: '#9AA0AA', fontSize: 12, lineHeight: 16 },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowYou: { justifyContent: 'flex-start' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ECECEE' },
  avatarFallback: { backgroundColor: '#ECECEE' },
  bubble: { maxWidth: '68%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#4ACA6D' },
  bubbleYou: { backgroundColor: '#D9D9D9' },
  bubbleMineText: { color: '#0B2A12', fontSize: 16, lineHeight: 22 },
  bubbleYouText: { color: '#111', fontSize: 16, lineHeight: 22 },
  emojiImage: { width: 34, height: 34 },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3E3E7',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#F5F5F5',
  },
  emojiToggle: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 38,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  sendBtn: { minWidth: 64, height: 34, borderRadius: 8, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#F5F5F5',
  },
  emojiBtn: { width: '12.5%', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  emojiBtnImage: { width: 34, height: 34 },
});
