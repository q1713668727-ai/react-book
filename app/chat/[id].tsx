import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { messageReadKey, writeChatReadMarker } from '@/lib/chat-read-markers';
import { connectChatSocket, type ChatSocketConnection } from '@/lib/chat-socket';
import { createConversation, fetchConversation, fetchFollowStatus, fetchUserInfo, toggleFollow, type ConversationItem } from '@/lib/redbook-api';
import EmojiIcon from '@/public/icon/biaoqing.svg';
import MoreIcon from '@/public/icon/gengduo.svg';

type ChatMessage = {
  id: string;
  mine: boolean;
  date: string;
  type: 'text' | 'emoji';
  text?: string;
  emoji?: string;
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

const emojiList = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😭', '😡', '👍', '👏', '🙏', '🔥', '🎉', '💯', '❤️', '✨'];
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const tenMinutes = 10 * 60 * 1000;
const fallbackEmoji = '🙂';
const HIDDEN_CONVERSATIONS_KEY_PREFIX = '@chat_hidden_conversations_v1:';
const CHAT_SCROLL_BOTTOM_GAP = 28;

type EmojiBurstHandle = {
  burst: (options?: { count?: number; intensity?: number; emojiIndex?: number }) => void;
  clear?: () => void;
};

let EmojiBurstView: ComponentType<{
  ref?: Ref<EmojiBurstHandle>;
  emojis?: string[];
  particlesPerBurst?: number;
  maxParticles?: number;
  emojiSize?: number;
  fadeOutAfter?: number;
  lifetime?: number;
  style?: object;
}> | null = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const burstModule = require('react-native-emoji-burst') as {
      EmojiBurst?: ComponentType<{
        ref?: Ref<EmojiBurstHandle>;
        emojis?: string[];
        particlesPerBurst?: number;
        maxParticles?: number;
        emojiSize?: number;
        fadeOutAfter?: number;
        lifetime?: number;
        style?: object;
      }>;
    };
    EmojiBurstView = burstModule?.EmojiBurst || null;
  } catch {
    EmojiBurstView = null;
  }
}

function normalizeEmojiChar(value: unknown, legacyUrl?: unknown) {
  const raw = String(value || '').trim();
  if (raw) return raw;
  const legacy = String(legacyUrl || '').trim();
  if (!legacy) return fallbackEmoji;
  const file = legacy.includes('/') ? legacy.split('/').pop() || '' : legacy;
  const match = file.match(/^(\d+)\.gif$/i);
  if (!match) return fallbackEmoji;
  const index = Number(match[1]);
  if (!Number.isFinite(index)) return fallbackEmoji;
  return emojiList[index % emojiList.length] || fallbackEmoji;
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
      emoji: textType === 'emoji' ? normalizeEmojiChar(item?.text?.message, item?.text?.url) : undefined,
    } as ChatMessage;
  });
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
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const socketRef = useRef<ChatSocketConnection | null>(null);
  const burstRef = useRef<EmojiBurstHandle | null>(null);
  const readCountRef = useRef(0);
  const listRef = useRef<FlatList<ChatDisplayItem> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleScrollTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number | null>(null);
  const chatId = String(params.id || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiMounted, setEmojiMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyboardFrame, setKeyboardFrame] = useState<{ screenY: number; height: number } | null>(null);
  const [composerHeight, setComposerHeight] = useState(80);
  const [followed, setFollowed] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [timeTick, setTimeTick] = useState(0);
  const [peerName, setPeerName] = useState(String(params.title || chatId || '聊天'));
  const [peerAvatarPath, setPeerAvatarPath] = useState(String(params.url || ''));
  const emojiAnim = useRef(new Animated.Value(0)).current;

  const targetName = peerName;
  const targetAvatar = avatarSource(peerAvatarPath);
  const myAvatar = avatarSource(String(user?.url || ''));
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

  useEffect(() => {
    if (!user?.account || !chatId) return;
    const key = `${HIDDEN_CONVERSATIONS_KEY_PREFIX}${user.account}`;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        let parsed: unknown = [];
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = [];
        }
        const current = Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
        if (!current.includes(chatId)) return;
        const next = current.filter((id) => id !== chatId);
        return AsyncStorage.setItem(key, JSON.stringify(next));
      })
      .catch(() => undefined);
  }, [user?.account, chatId]);

  useEffect(() => {
    setPeerName(String(params.title || chatId || '聊天'));
  }, [params.title, chatId]);

  useEffect(() => {
    setPeerAvatarPath(String(params.url || ''));
  }, [params.url, chatId]);

  const triggerEmojiBurst = useCallback((emoji: string) => {
    if (!emoji || !EmojiBurstView) return;
    const emojiIndex = emojiList.indexOf(emoji);
    burstRef.current?.burst({
      count: 14,
      intensity: 1.12,
      ...(emojiIndex >= 0 ? { emojiIndex } : {}),
    });
  }, []);

  const openEmojiPanel = useCallback(() => {
    Keyboard.dismiss();
    setEmojiMounted(true);
    setShowEmoji(true);
    Animated.spring(emojiAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [emojiAnim]);

  const closeEmojiPanel = useCallback(() => {
    setShowEmoji(false);
    Animated.timing(emojiAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEmojiMounted(false);
    });
  }, [emojiAnim]);

  useEffect(() => {
    readCountRef.current = 0;
  }, [user?.account, chatId]);

  const scrollToBottom = useCallback((animated = true) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    settleScrollTimerRefs.current.forEach((timer) => clearTimeout(timer));
    settleScrollTimerRefs.current = [];

    const runScroll = (nextAnimated: boolean) => {
      try {
        listRef.current?.scrollToEnd({ animated: nextAnimated });
      } catch {
        // FlatList may briefly reject scrollToEnd before it has measured content.
      }
    };

    rafRef.current = requestAnimationFrame(() => {
      runScroll(animated);
      rafRef.current = null;
    });

    [80, 180, 320].forEach((delay) => {
      const timer = setTimeout(() => {
        settleScrollTimerRefs.current = settleScrollTimerRefs.current.filter((item) => item !== timer);
        runScroll(animated);
      }, delay);
      settleScrollTimerRefs.current.push(timer);
    });
  }, []);

  const ensureConversation = useCallback(async () => {
    if (!user?.account || !chatId || chatId === user.account) return false;

    const response = await fetchConversation({ account: user.account, target: chatId });
    const latestTitle = String(response.result?.title || '').trim();
    const latestAvatar = String(response.result?.url || response.result?.avatar || '').trim();
    if (latestTitle) setPeerName(latestTitle);
    if (latestAvatar) setPeerAvatarPath(latestAvatar);

    fetchUserInfo(chatId)
      .then((profile) => {
        if (!profile) return;
        const profileName = String(profile.name || '').trim();
        const profileAvatar = String(profile.url || profile.avatar || '').trim();
        if (profileName) setPeerName(profileName);
        if (profileAvatar) setPeerAvatarPath(profileAvatar);
      })
      .catch(() => undefined);

    const history = toChatMessages(response.result?.historyMessage);
    setMessages(history);
    const latest = response.result?.historyMessage?.[response.result.historyMessage.length - 1];
    readCountRef.current = Math.max(readCountRef.current, Number(response.result?.read || 0));
    void writeChatReadMarker(user.account, chatId, messageReadKey(latest), readCountRef.current);

    const isFirstChat = Boolean((response as unknown as { firstChat?: boolean }).firstChat);
    if (!isFirstChat) return true;

    const target = {
      id: chatId,
      avatar: latestAvatar || String(params.url || ''),
      title: latestTitle || targetName,
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
          if (unmounted) return;
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
            emoji: data.text?.type === 'emoji' ? normalizeEmojiChar(data.text?.message, data.text?.url) : undefined,
          };
          if (next.type === 'emoji' && next.emoji) triggerEmojiBurst(next.emoji);
          setMessages((prev) => [...prev, next]);
          scrollToBottom(true);
        }, {
          reconnect: true,
          onOpen: () => {
            if (!unmounted) setReady(true);
          },
          onClose: () => {
            if (!unmounted) setReady(false);
          },
          onError: () => {
            if (!unmounted) setReady(false);
          },
        });
        socketRef.current = ws;
      } catch {
        setReady(false);
      }
    })();

    return () => {
      unmounted = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user?.account, chatId, ensureConversation, scrollToBottom, triggerEmojiBurst]);

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
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', updateKeyboardFrame);
    const didShowSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidShow', updateKeyboardFrame) : null;
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hideKeyboardFrame);
    const didHideSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidHide', hideKeyboardFrame) : null;

    return () => {
      showSub.remove();
      didShowSub?.remove();
      hideSub.remove();
      didHideSub?.remove();
    };
  }, [windowDimensions.height]);

  const canSend = useMemo(() => text.trim().length > 0 && !sending && ready, [text, sending, ready]);
  const displayMessages = useMemo(() => {
    void timeTick;
    return toDisplayMessages(messages);
  }, [messages, timeTick]);
  const messagesComposerPadding = useMemo(
    () => ({
      paddingBottom: composerHeight + keyboardHeight + CHAT_SCROLL_BOTTOM_GAP,
    }),
    [composerHeight, keyboardHeight]
  );

  useEffect(() => {
    if (!messages.length) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      scrollToBottom(true);
    }, 80);

    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
      settleScrollTimerRefs.current.forEach((timer) => clearTimeout(timer));
      settleScrollTimerRefs.current = [];
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [composerHeight, keyboardHeight, messages.length, scrollToBottom]);

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
              : { message: value, type: 'emoji' },
        },
      };

      const delivered = socketRef.current?.send(JSON.stringify(payload)) ?? false;
      if (!delivered) {
        setReady(false);
        return;
      }
      const emoji = type === 'emoji' ? normalizeEmojiChar(value) : undefined;
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
      if (type === 'emoji' && emoji) triggerEmojiBurst(emoji);
      if (type === 'text') setText('');
    } finally {
      setSending(false);
    }
  }

  function goTargetProfile() {
    router.push({
      pathname: '/user/[account]',
      params: { account: chatId, name: targetName, avatar: String(peerAvatarPath || params.url || '') },
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
              <Image source={targetAvatar} style={styles.headerAvatar} contentFit="cover" />
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
        {EmojiBurstView ? (
          <EmojiBurstView
            ref={burstRef}
            emojis={emojiList}
            particlesPerBurst={14}
            maxParticles={220}
            emojiSize={30}
            lifetime={2.2}
            fadeOutAfter={1.1}
            style={styles.emojiBurstLayer}
          />
        ) : null}
        {showEmoji ? (
          <Pressable style={[styles.emojiBackdrop, { bottom: keyboardHeight + composerHeight }]} onPress={closeEmojiPanel} />
        ) : null}
        <FlatList
          ref={listRef}
          style={styles.messages}
          contentContainerStyle={[styles.messagesContent, messagesComposerPadding]}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onLayout={() => scrollToBottom(false)}
          onContentSizeChange={() => scrollToBottom(true)}
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
                {message.mine ? null : <Image source={targetAvatar} style={styles.avatar} contentFit="cover" />}

                <View style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleYou]}>
                  {message.type === 'emoji' ? (
                    <ThemedText style={styles.emojiText}>{message.emoji || fallbackEmoji}</ThemedText>
                  ) : (
                    <ThemedText style={message.mine ? styles.bubbleMineText : styles.bubbleYouText}>{message.text}</ThemedText>
                  )}
                </View>

                {message.mine ? <Image source={myAvatar} style={styles.avatar} contentFit="cover" /> : null}
              </View>
            );
          }}
        />

        <View
          style={[styles.composer, { bottom: keyboardHeight }]}
          onLayout={(event) => {
            setComposerHeight(event.nativeEvent.layout.height);
            scrollToBottom(false);
          }}>
          {emojiMounted ? (
            <Animated.View
              style={[
                styles.emojiPanel,
                {
                  opacity: emojiAnim,
                  transform: [
                    {
                      translateY: emojiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                    {
                      scale: emojiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1],
                      }),
                    },
                  ],
                },
              ]}>
              {emojiList.map((emojiChar) => (
                <Pressable
                  key={emojiChar}
                  style={styles.emojiBtn}
                  onPress={() => {
                    closeEmojiPanel();
                    void sendMessage('emoji', emojiChar);
                  }}>
                  <ThemedText style={styles.emojiBtnText}>{emojiChar}</ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          <View style={styles.inputBar}>
            <Pressable
              style={styles.emojiToggle}
              onPress={() => (showEmoji ? closeEmojiPanel() : openEmojiPanel())}>
              <EmojiIcon width={26} height={26} color={showEmoji ? '#FF2442' : '#5B6475'} fill={showEmoji ? '#FF2442' : '#5B6475'} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={ready ? '输入消息' : '连接中...'}
              editable={ready && !sending}
              onFocus={closeEmojiPanel}
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
  emojiBurstLayer: { ...StyleSheet.absoluteFillObject },
  emojiBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
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
  emojiText: { fontSize: 34, lineHeight: 38 },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 6,
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
  emojiBtnText: { fontSize: 30, lineHeight: 34 },
});
