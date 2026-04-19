import AsyncStorage from '@react-native-async-storage/async-storage';

import { latestMessageKey } from '@/lib/chat-read-markers';
import type { ConversationItem } from '@/lib/redbook-api';

const MESSAGE_TIMES_KEY = '@chat_message_times';

export type ChatMessageTimeMarker = {
  messageKey: string;
  seenAt: number;
};

function markerKey(account: string, target: string) {
  return `${account}:${target}`;
}

function normalizeMarker(value: unknown): ChatMessageTimeMarker | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const marker = value as Partial<ChatMessageTimeMarker>;
  const seenAt = Number(marker.seenAt || 0);
  if (!marker.messageKey || !Number.isFinite(seenAt) || seenAt <= 0) return undefined;
  return {
    messageKey: String(marker.messageKey),
    seenAt,
  };
}

export async function readChatMessageTimeMarkers() {
  try {
    const raw = await AsyncStorage.getItem(MESSAGE_TIMES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.entries(parsed).reduce<Record<string, ChatMessageTimeMarker>>((next, [key, value]) => {
      const marker = normalizeMarker(value);
      if (marker) next[key] = marker;
      return next;
    }, {});
  } catch {
    return {};
  }
}

export async function ensureChatMessageTimeMarkers(account: string, items: ConversationItem[]) {
  const markers = await readChatMessageTimeMarkers();
  let changed = false;
  const now = Date.now();

  items.forEach((item) => {
    if (!item.id) return;
    const key = markerKey(account, item.id);
    const messageKey = latestMessageKey(item);
    if (markers[key]?.messageKey === messageKey) return;

    markers[key] = {
      messageKey,
      seenAt: now,
    };
    changed = true;
  });

  if (changed) {
    await AsyncStorage.setItem(MESSAGE_TIMES_KEY, JSON.stringify(markers));
  }

  return markers;
}
