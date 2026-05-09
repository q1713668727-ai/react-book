import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { mergeConversation, readCachedConversation, writeCachedConversation } from '@/lib/chat-local-cache';
import { messageReadKey, writeChatReadMarker } from '@/lib/chat-read-markers';
import { connectChatSocket, type ChatSocketConnection } from '@/lib/chat-socket';
import { createConversation, fetchConversation, fetchFollowStatus, fetchUserInfo, recallConversationMessage, toggleFollow, type ConversationItem } from '@/lib/redbook-api';
import EmojiIcon from '@/public/icon/biaoqing.svg';
import MoreIcon from '@/public/icon/gengduo.svg';

type ChatMessage = {
  id: string;
  mine: boolean;
  date: string;
  type: 'text' | 'emoji';
  actionKey: string;
  recalledAt?: string | number;
  recalledBy?: string;
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
const HIDDEN_MESSAGES_KEY_PREFIX = '@chat_hidden_messages_v1:';
const CHAT_SCROLL_BOTTOM_GAP = 0;
const KEYBOARD_COMPOSER_GAP = 8;
const RECALL_LIMIT_MS = 60 * 1000;
const CHAT_MORE_ACTIONS = [
  { key: 'album', label: '相册', icon: 'image-outline' },
  { key: 'camera', label: '拍照', icon: 'camera-outline' },
  { key: 'call', label: '语音通话', icon: 'phone-outline' },
  { key: 'note', label: '分享笔记', icon: 'note-text-outline' },
  { key: 'sticky', label: '便利贴', icon: 'sticker-outline' },
  { key: 'map', label: '地图', icon: 'map-outline' },
  { key: 'checkin', label: '打卡', icon: 'calendar-check-outline', badge: 'NEW' },
] as const;

type MessageActionMenuState = {
  message: ChatMessage;
  x: number;
  y: number;
};

type MessageLongPressEvent = {
  nativeEvent?: {
    pageX?: number;
    pageY?: number;
    target?: number | string;
  };
};

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
    const actionKey = historyMessageActionKey(item);
    return {
      id: actionKey || `${date || 'd'}-${index}`,
      mine: Boolean(item?.mine),
      date: String(date || ''),
      type: textType,
      actionKey,
      recalledAt: item?.recalledAt,
      recalledBy: item?.recalledBy,
      text: textType === 'text' ? String(item?.text?.message || '') : undefined,
      emoji: textType === 'emoji' ? normalizeEmojiChar(item?.text?.message, item?.text?.url) : undefined,
    } as ChatMessage;
  });
}

function historyMessageActionKey(message: HistoryMessage | undefined) {
  if (!message) return '';
  const text = message.text || {};
  const url = String(text.url || '').replace(/^images\/emoji\//, '');
  return [parseMessageDate(historyMessageDate(message))?.getTime() || historyMessageDate(message) || '', text.type || '', text.message || '', url].join('|');
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
  const feedback = useFeedback();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const socketRef = useRef<ChatSocketConnection | null>(null);
  const burstRef = useRef<EmojiBurstHandle | null>(null);
  const readCountRef = useRef(0);
  const listRef = useRef<FlatList<ChatDisplayItem> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleScrollTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const listRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listPositionedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const rootRef = useRef<View | null>(null);
  const chatId = String(params.id || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiMounted, setEmojiMounted] = useState(false);
  const [showMorePanel, setShowMorePanel] = useState(false);
  const [morePanelMounted, setMorePanelMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyboardFrame, setKeyboardFrame] = useState<{ screenY: number; height: number } | null>(null);
  const [composerHeight, setComposerHeight] = useState(80);
  const [followed, setFollowed] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [timeTick, setTimeTick] = useState(0);
  const [peerName, setPeerName] = useState(String(params.title || chatId || '聊天'));
  const [peerAvatarPath, setPeerAvatarPath] = useState(String(params.url || ''));
  const [hiddenMessageKeys, setHiddenMessageKeys] = useState<string[]>([]);
  const [actionMenu, setActionMenu] = useState<MessageActionMenuState | null>(null);
  const [listPositioned, setListPositioned] = useState(false);
  const emojiAnim = useRef(new Animated.Value(0)).current;
  const morePanelAnim = useRef(new Animated.Value(0)).current;

  const targetName = peerName;
  const targetAvatar = avatarSource(peerAvatarPath);
  const myAvatar = avatarSource(String(user?.url || ''));
  const hiddenMessagesStorageKey = user?.account && chatId ? `${HIDDEN_MESSAGES_KEY_PREFIX}${user.account}:${chatId}` : '';
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
  const composerBottom = effectiveKeyboardHeight + (keyboardFrame ? KEYBOARD_COMPOSER_GAP : 0);
  const listBottomInset = composerHeight + composerBottom;

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
    if (!hiddenMessagesStorageKey) {
      setHiddenMessageKeys([]);
      return;
    }
    AsyncStorage.getItem(hiddenMessagesStorageKey)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : [];
        setHiddenMessageKeys(Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []);
      })
      .catch(() => setHiddenMessageKeys([]));
  }, [hiddenMessagesStorageKey]);

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
    setShowMorePanel(false);
    setMorePanelMounted(false);
    morePanelAnim.setValue(0);
    setEmojiMounted(true);
    setShowEmoji(true);
    Animated.spring(emojiAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [emojiAnim, morePanelAnim]);

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

  const openMorePanel = useCallback(() => {
    Keyboard.dismiss();
    setShowEmoji(false);
    setEmojiMounted(false);
    emojiAnim.setValue(0);
    setMorePanelMounted(true);
    setShowMorePanel(true);
    Animated.spring(morePanelAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 5,
    }).start();
  }, [emojiAnim, morePanelAnim]);

  const closeMorePanel = useCallback(() => {
    setShowMorePanel(false);
    Animated.timing(morePanelAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMorePanelMounted(false);
    });
  }, [morePanelAnim]);

  const handleMoreAction = useCallback((label: string) => {
    feedback.toast(`${label}功能暂未开放`);
  }, [feedback]);

  useEffect(() => {
    readCountRef.current = 0;
    listPositionedRef.current = false;
    setListPositioned(false);
  }, [user?.account, chatId]);

  const revealListAfterInitialScroll = useCallback(() => {
    if (listPositionedRef.current) return;
    if (listRevealTimerRef.current) clearTimeout(listRevealTimerRef.current);
    listRevealTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        listRevealTimerRef.current = null;
        listPositionedRef.current = true;
        setListPositioned(true);
      });
    }, 620);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    settleScrollTimerRefs.current.forEach((timer) => clearTimeout(timer));
    settleScrollTimerRefs.current = [];

    const runScroll = (nextAnimated: boolean) => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated: nextAnimated });
      } catch {
        // FlatList may briefly reject scrolling before it has measured content.
      }
    };

    rafRef.current = requestAnimationFrame(() => {
      runScroll(animated);
      rafRef.current = null;
    });

    [60, 160, 320, 520].forEach((delay) => {
      const timer = setTimeout(() => {
        settleScrollTimerRefs.current = settleScrollTimerRefs.current.filter((item) => item !== timer);
        runScroll(animated);
      }, delay);
      settleScrollTimerRefs.current.push(timer);
    });
  }, []);

  const persistHistoryMessage = useCallback(async (message: HistoryMessage, options?: { title?: string; avatar?: string }) => {
    if (!user?.account || !chatId) return;
    const cached = await readCachedConversation(user.account, chatId);
    const next = mergeConversation(cached, {
      ...(cached || {}),
      id: chatId,
      title: options?.title || cached?.title || targetName,
      url: options?.avatar || cached?.url || String(peerAvatarPath || params.url || ''),
      historyMessage: [...(cached?.historyMessage || []), message],
    });
    if (next) await writeCachedConversation(user.account, chatId, next);
  }, [chatId, params.url, peerAvatarPath, targetName, user?.account]);

  const persistConversationMessages = useCallback(async (nextMessages: ChatMessage[]) => {
    if (!user?.account || !chatId) return;
    const cached = await readCachedConversation(user.account, chatId);
    if (!cached) return;
    const byKey = new Map(nextMessages.map((message) => [message.actionKey, message]));
    const nextHistory = (cached.historyMessage || []).map((item) => {
      const action = byKey.get(historyMessageActionKey(item));
      if (!action) return item;
      return {
        ...item,
        recalledAt: action.recalledAt,
        recalledBy: action.recalledBy,
      };
    });
    await writeCachedConversation(user.account, chatId, { ...cached, historyMessage: nextHistory });
  }, [chatId, user?.account]);

  const messageTextForCopy = useCallback((message: ChatMessage) => {
    if (message.recalledAt) return '';
    if (message.type === 'emoji') return message.emoji || '';
    return message.text || '';
  }, []);

  const canRecallMessage = useCallback((message: ChatMessage) => {
    const sentAt = parseMessageDate(message.date)?.getTime() || 0;
    const delta = Date.now() - sentAt;
    return message.mine && !message.recalledAt && sentAt > 0 && delta <= RECALL_LIMIT_MS;
  }, []);

  const openMessageActions = useCallback((message: ChatMessage, event: MessageLongPressEvent) => {
    if (message.recalledAt) return;
    const fallbackX = Number(event.nativeEvent?.pageX || windowDimensions.width / 2);
    const fallbackY = Number(event.nativeEvent?.pageY || windowDimensions.height / 2);
    const target = Number(event.nativeEvent?.target || 0);

    rootRef.current?.measureInWindow((rootX, rootY) => {
      const showAt = (pageX: number, pageY: number) => {
        setActionMenu({ message, x: pageX - rootX, y: pageY - rootY });
      };

      if (Number.isFinite(target) && target > 0) {
        UIManager.measure(target, (_x, _y, width, _height, pageX, pageY) => {
          showAt(pageX + width / 2, pageY);
        });
        return;
      }

      showAt(fallbackX, fallbackY);
    });
  }, [windowDimensions.height, windowDimensions.width]);

  const hideMessageLocally = useCallback(async (message: ChatMessage) => {
    setActionMenu(null);
    if (!message.actionKey) return;
    const next = Array.from(new Set([...hiddenMessageKeys, message.actionKey]));
    setHiddenMessageKeys(next);
    if (hiddenMessagesStorageKey) await AsyncStorage.setItem(hiddenMessagesStorageKey, JSON.stringify(next));
  }, [hiddenMessageKeys, hiddenMessagesStorageKey]);

  const copyMessageText = useCallback(async (message: ChatMessage) => {
    const value = messageTextForCopy(message);
    setActionMenu(null);
    if (!value) return;
    await Clipboard.setStringAsync(value);
    feedback.toast('复制成功', { tone: 'success' });
  }, [feedback, messageTextForCopy]);

  const recallMessage = useCallback(async (message: ChatMessage) => {
    if (!user?.account || !chatId || !canRecallMessage(message)) {
      await hideMessageLocally(message);
      return;
    }
    setActionMenu(null);
    try {
      const res = await recallConversationMessage({ account: user.account, target: chatId, messageKey: message.actionKey });
      const recalledAt = res.result?.recalledAt || new Date().toISOString();
      setMessages((current) => {
        const next = current.map((item) => (item.actionKey === message.actionKey ? { ...item, recalledAt, recalledBy: user.account } : item));
        void persistConversationMessages(next);
        return next;
      });
    } catch {
      // If the one-minute window has already passed on the server, fall back to local delete.
      await hideMessageLocally(message);
    }
  }, [canRecallMessage, chatId, hideMessageLocally, persistConversationMessages, user?.account]);

  const ensureConversation = useCallback(async () => {
    if (!user?.account || !chatId || chatId === user.account) return false;

    const cached = await readCachedConversation(user.account, chatId);
    if (cached?.historyMessage?.length) {
      if (cached.title) setPeerName(cached.title);
      if (cached.url || cached.avatar) setPeerAvatarPath(String(cached.url || cached.avatar || ''));
      setMessages(toChatMessages(cached.historyMessage));
      scrollToBottom(false);
    }

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

    const mergedConversation = mergeConversation(cached, response.result || null);
    if (mergedConversation) {
      await writeCachedConversation(user.account, chatId, mergedConversation);
    }
    const history = toChatMessages(mergedConversation?.historyMessage || response.result?.historyMessage);
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
  }, [user?.account, user?.name, user?.url, chatId, params.url, targetName, scrollToBottom]);

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
            id: historyMessageActionKey(data) || `${Date.now()}-${Math.random()}`,
            mine: !Boolean(incomingAccount === chatId),
            date: receivedAt,
            type: data.text?.type === 'emoji' ? 'emoji' : 'text',
            actionKey: historyMessageActionKey(data),
            recalledAt: data.recalledAt,
            recalledBy: data.recalledBy,
            text: data.text?.type === 'text' ? String(data.text.message || '') : undefined,
            emoji: data.text?.type === 'emoji' ? normalizeEmojiChar(data.text?.message, data.text?.url) : undefined,
          };
          void persistHistoryMessage({ ...data, mine: false });
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
  }, [user?.account, chatId, ensureConversation, persistHistoryMessage, scrollToBottom, triggerEmojiBurst]);

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

  const canSend = useMemo(() => text.trim().length > 0 && !sending && ready, [text, sending, ready]);
  const displayMessages = useMemo(() => {
    void timeTick;
    const hidden = new Set(hiddenMessageKeys);
    return toDisplayMessages(messages.filter((message) => !hidden.has(message.actionKey)));
  }, [hiddenMessageKeys, messages, timeTick]);
  const invertedDisplayMessages = useMemo(() => [...displayMessages].reverse(), [displayMessages]);
  const messagesComposerPadding = useMemo(
    () => ({
      paddingBottom: CHAT_SCROLL_BOTTOM_GAP,
    }),
    []
  );

  useEffect(() => {
    if (!displayMessages.length) {
      listPositionedRef.current = true;
      setListPositioned(true);
      return;
    }
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      scrollToBottom(false);
      revealListAfterInitialScroll();
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
      if (listRevealTimerRef.current) {
        clearTimeout(listRevealTimerRef.current);
        listRevealTimerRef.current = null;
      }
    };
  }, [displayMessages.length, revealListAfterInitialScroll, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
  }, [composerBottom, composerHeight, scrollToBottom, windowDimensions.height]);

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
      void persistHistoryMessage(payload.message);
      const actionKey = historyMessageActionKey(payload.message);
      setMessages((prev) => [
        ...prev,
        {
          id: actionKey || `${Date.now()}-${Math.random()}`,
          mine: true,
          date: sentAt,
          type,
          actionKey,
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
      <ThemedView ref={rootRef} style={styles.root}>
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
        {showEmoji || showMorePanel ? (
          <Pressable
            style={[styles.emojiBackdrop, { bottom: composerBottom + composerHeight }]}
            onPress={() => {
              closeEmojiPanel();
              closeMorePanel();
            }}
          />
        ) : null}
        <FlatList
          ref={listRef}
          style={[styles.messages, { marginBottom: listBottomInset, opacity: listPositioned ? 1 : 0 }]}
          contentContainerStyle={[styles.messagesContent, messagesComposerPadding]}
          data={invertedDisplayMessages}
          inverted
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onLayout={() => scrollToBottom(false)}
          onContentSizeChange={() => {
            scrollToBottom(false);
            revealListAfterInitialScroll();
          }}
          renderItem={({ item }) => {
            if (item.kind === 'time') {
              return (
                <View style={styles.timeRow}>
                  <ThemedText style={styles.timeText}>{item.text}</ThemedText>
                </View>
              );
            }

            const message = item.message;
            if (message.recalledAt) {
              return (
                <View style={styles.recalledRow}>
                  <ThemedText style={styles.recalledText}>{message.mine ? '你撤回了一条消息' : '对方撤回了一条消息'}</ThemedText>
                </View>
              );
            }
            return (
              <View key={message.id} style={[styles.msgRow, message.mine ? styles.msgRowMine : styles.msgRowYou]}>
                {message.mine ? null : <Image source={targetAvatar} style={styles.avatar} contentFit="cover" />}

                <Pressable
                  delayLongPress={260}
                  onLongPress={(event) => openMessageActions(message, event)}
                  style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleYou]}>
                  {message.type === 'emoji' ? (
                    <ThemedText style={styles.emojiText}>{message.emoji || fallbackEmoji}</ThemedText>
                  ) : (
                    <ThemedText style={message.mine ? styles.bubbleMineText : styles.bubbleYouText}>{message.text}</ThemedText>
                  )}
                </Pressable>

                {message.mine ? <Image source={myAvatar} style={styles.avatar} contentFit="cover" /> : null}
              </View>
            );
          }}
        />

        {actionMenu ? (
          <Pressable style={styles.actionBackdrop} onPress={() => setActionMenu(null)}>
            <View
              style={[
                styles.messageActionMenu,
                {
                  left: Math.max(14, Math.min(actionMenu.x - 72, windowDimensions.width - 158)),
                  top: Math.max(12, actionMenu.y - 56),
                },
              ]}>
              <Pressable style={styles.messageActionItem} onPress={() => void copyMessageText(actionMenu.message)}>
                <ThemedText style={styles.messageActionIcon}>▣</ThemedText>
                <ThemedText style={styles.messageActionText}>复制</ThemedText>
              </Pressable>
              <Pressable
                style={styles.messageActionItem}
                onPress={() => void (canRecallMessage(actionMenu.message) ? recallMessage(actionMenu.message) : hideMessageLocally(actionMenu.message))}>
                <ThemedText style={styles.messageActionIcon}>{canRecallMessage(actionMenu.message) ? '↩' : '⌫'}</ThemedText>
                <ThemedText style={styles.messageActionText}>{canRecallMessage(actionMenu.message) ? '撤回' : '删除'}</ThemedText>
              </Pressable>
              <View style={styles.messageActionArrow} />
            </View>
          </Pressable>
        ) : null}

        <View
          pointerEvents={listPositioned ? 'auto' : 'none'}
          style={[styles.composer, { bottom: composerBottom, opacity: listPositioned ? 1 : 0 }]}
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
              onFocus={() => {
                closeEmojiPanel();
                closeMorePanel();
              }}
            />
            <Pressable
              style={[styles.moreToggle, showMorePanel && styles.moreToggleActive]}
              onPress={() => (showMorePanel ? closeMorePanel() : openMorePanel())}>
              <MaterialCommunityIcons name="plus" size={30} color={showMorePanel ? '#FF2442' : '#2F343B'} />
            </Pressable>
            <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend} onPress={() => void sendMessage('text', text.trim())}>
              <ThemedText style={styles.sendText}>{sending ? '发送中' : '发送'}</ThemedText>
            </Pressable>
          </View>

          {morePanelMounted ? (
            <Animated.View
              style={[
                styles.morePanel,
                {
                  opacity: morePanelAnim,
                  transform: [
                    {
                      translateY: morePanelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [16, 0],
                      }),
                    },
                  ],
                },
              ]}>
              {CHAT_MORE_ACTIONS.map((item) => (
                <Pressable key={item.key} style={styles.moreAction} onPress={() => handleMoreAction(item.label)}>
                  <View style={styles.moreIconBox}>
                    <MaterialCommunityIcons name={item.icon} size={30} color="#303033" />
                    {'badge' in item && item.badge ? (
                      <View style={styles.moreBadge}>
                        <ThemedText style={styles.moreBadgeText}>{item.badge}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText style={styles.moreActionText}>{item.label}</ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
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
  recalledRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  recalledText: { fontSize: 13, color: '#9AA0AA', fontWeight: '600' },
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
  actionBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  messageActionMenu: {
    position: 'absolute',
    minWidth: 144,
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#24242A',
  },
  messageActionItem: { width: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
  messageActionIcon: { fontSize: 16, color: '#F5F5F8', lineHeight: 18, fontWeight: '800' },
  messageActionText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
  messageActionArrow: {
    position: 'absolute',
    left: '50%',
    bottom: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    backgroundColor: '#24242A',
    transform: [{ rotate: '45deg' }],
  },
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
  moreToggle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  moreToggleActive: { backgroundColor: '#FFEFF2' },
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
  morePanel: {
    minHeight: 214,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 24,
    backgroundColor: '#FFFFFF',
  },
  moreAction: { width: '25%', alignItems: 'center', gap: 8 },
  moreIconBox: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  moreActionText: { fontSize: 13, color: '#8A8A8F', fontWeight: '700' },
  moreBadge: {
    position: 'absolute',
    right: -10,
    top: -9,
    minWidth: 36,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: '#FF2442',
  },
  moreBadgeText: { fontSize: 10, lineHeight: 14, color: '#FFF', fontWeight: '900' },
});
