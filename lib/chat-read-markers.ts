import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ConversationItem } from '@/lib/redbook-api';

const READ_MARKERS_KEY = '@chat_read_markers';

type HistoryMessage = NonNullable<ConversationItem['historyMessage']>[number];

export type ChatReadMarker = {
  messageKey: string;
  readCount: number;
};

export function messageReadKey(message?: HistoryMessage) {
  if (!message) return 'empty';
  const text = message.text;
  return [message.date || '', text?.type || '', text?.message || '', text?.url || ''].join('|');
}

export function latestMessageKey(item: ConversationItem) {
  const history = Array.isArray(item.historyMessage) ? item.historyMessage : [];
  return messageReadKey(history[history.length - 1]);
}

function normalizeMarker(value: unknown): ChatReadMarker | undefined {
  if (typeof value === 'string') {
    return { messageKey: value, readCount: 0 };
  }
  if (!value || typeof value !== 'object') return undefined;
  const marker = value as Partial<ChatReadMarker>;
  return {
    messageKey: String(marker.messageKey || ''),
    readCount: Math.max(0, Number(marker.readCount || 0)),
  };
}

export async function readChatReadMarkers() {
  try {
    const raw = await AsyncStorage.getItem(READ_MARKERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.entries(parsed).reduce<Record<string, ChatReadMarker>>((next, [key, value]) => {
      const marker = normalizeMarker(value);
      if (marker) next[key] = marker;
      return next;
    }, {});
  } catch {
    return {};
  }
}

export async function writeChatReadMarker(account: string, target: string, readKey: string, readCount = 0) {
  if (!account || !target) return;
  const markers = await readChatReadMarkers();
  markers[`${account}:${target}`] = {
    messageKey: readKey,
    readCount: Math.max(0, Number(readCount || 0)),
  };
  await AsyncStorage.setItem(READ_MARKERS_KEY, JSON.stringify(markers));
}

export async function writeConversationReadMarker(account: string, item: ConversationItem) {
  if (!item.id) return;
  await writeChatReadMarker(account, item.id, latestMessageKey(item), Number(item.read || 0));
}
