import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MarketServiceMessage, MarketServiceSession } from '@/lib/market-api';
import type { ConversationItem } from '@/lib/redbook-api';

const CHAT_CONVERSATIONS_KEY_PREFIX = '@chat_conversations_v2:';
const CHAT_CONVERSATION_KEY_PREFIX = '@chat_conversation_v2:';
const SERVICE_SESSIONS_KEY_PREFIX = '@market_service_sessions_v2:';
const SERVICE_SESSION_KEY_PREFIX = '@market_service_session_v2:';

type HistoryMessage = NonNullable<ConversationItem['historyMessage']>[number];

function parseTime(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10000000000 ? value * 1000 : value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? (numeric < 10000000000 ? numeric * 1000 : numeric) : 0;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function historyTime(message: HistoryMessage | undefined) {
  if (!message) return 0;
  const record = message as HistoryMessage & Record<string, unknown>;
  return parseTime(record.date ?? record.time ?? record.lastTime ?? record.updateTime ?? record.updatedAt ?? record.createTime ?? record.createdAt);
}

function historyKey(message: HistoryMessage, index: number) {
  const text = message.text || {};
  const time = historyTime(message);
  return [time || index, message.mine ? '1' : '0', text.type || '', text.message || '', text.url || ''].join('|');
}

function serviceMessageKey(message: MarketServiceMessage, index: number) {
  return [message.id || '', message.sessionId || '', message.createdAt || index, message.sender || '', message.messageType || '', message.content || ''].join('|');
}

function mergeByKey<T>(localItems: T[], cloudItems: T[], keyOf: (item: T, index: number) => string, timeOf: (item: T) => number) {
  const map = new Map<string, T>();
  localItems.forEach((item, index) => map.set(keyOf(item, index), item));
  cloudItems.forEach((item, index) => map.set(keyOf(item, index), item));
  return Array.from(map.values()).sort((a, b) => timeOf(a) - timeOf(b));
}

function conversationKey(account: string, target: string) {
  return `${CHAT_CONVERSATION_KEY_PREFIX}${account}:${target}`;
}

function serviceSessionKey(account: string, sessionId: number | string) {
  return `${SERVICE_SESSION_KEY_PREFIX}${account}:${sessionId}`;
}

function latestConversationTime(item: ConversationItem) {
  const history = Array.isArray(item.historyMessage) ? item.historyMessage : [];
  const latest = history[history.length - 1];
  const record = item as ConversationItem & Record<string, unknown>;
  return historyTime(latest) || parseTime(record.date ?? record.time ?? record.lastTime ?? record.updateTime ?? record.updatedAt ?? record.createTime ?? record.createdAt);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local cache should never block chat usage.
  }
}

export function mergeConversation(local: ConversationItem | null | undefined, cloud: ConversationItem | null | undefined): ConversationItem | null {
  if (!local && !cloud) return null;
  const localHistory = Array.isArray(local?.historyMessage) ? local.historyMessage : [];
  const cloudHistory = Array.isArray(cloud?.historyMessage) ? cloud.historyMessage : [];
  const historyMessage = mergeByKey(localHistory, cloudHistory, historyKey, historyTime);
  return {
    ...(local || {}),
    ...(cloud || {}),
    id: String(cloud?.id || local?.id || ''),
    title: cloud?.title || local?.title,
    avatar: cloud?.avatar || local?.avatar,
    url: cloud?.url || local?.url,
    read: Math.max(0, Number(cloud?.read || local?.read || 0)),
    historyMessage,
  };
}

export function mergeConversationList(localItems: ConversationItem[], cloudItems: ConversationItem[]) {
  const map = new Map<string, ConversationItem>();
  localItems.forEach((item) => {
    if (item.id) map.set(String(item.id), item);
  });
  cloudItems.forEach((item) => {
    if (!item.id) return;
    const id = String(item.id);
    map.set(id, mergeConversation(map.get(id), item) || item);
  });
  return Array.from(map.values()).sort((a, b) => latestConversationTime(b) - latestConversationTime(a));
}

export async function readCachedConversationList(account: string) {
  return readJson<ConversationItem[]>(`${CHAT_CONVERSATIONS_KEY_PREFIX}${account}`, []);
}

export async function writeCachedConversationList(account: string, items: ConversationItem[]) {
  await writeJson(`${CHAT_CONVERSATIONS_KEY_PREFIX}${account}`, items);
  await Promise.all(items.map((item) => (item.id ? writeCachedConversationOnly(account, String(item.id), item) : Promise.resolve())));
}

export async function readCachedConversation(account: string, target: string) {
  return readJson<ConversationItem | null>(conversationKey(account, target), null);
}

export async function writeCachedConversation(account: string, target: string, item: ConversationItem) {
  await writeCachedConversationOnly(account, target, item);
  const list = await readCachedConversationList(account);
  await writeJson(`${CHAT_CONVERSATIONS_KEY_PREFIX}${account}`, mergeConversationList(list, [{ ...item, id: target }]));
}

async function writeCachedConversationOnly(account: string, target: string, item: ConversationItem) {
  await writeJson(conversationKey(account, target), item);
}

export async function deleteCachedConversation(account: string, target: string) {
  try {
    await AsyncStorage.removeItem(conversationKey(account, target));
    const list = await readCachedConversationList(account);
    await writeCachedConversationList(account, list.filter((item) => String(item.id) !== target));
  } catch {
    // Ignore cache cleanup failure.
  }
}

export async function clearCachedConversationMessages(account: string, target: string) {
  const cached = await readCachedConversation(account, target);
  if (cached) await writeCachedConversation(account, target, { ...cached, read: 0, historyMessage: [] });
  const list = await readCachedConversationList(account);
  await writeCachedConversationList(
    account,
    list.map((item) => (String(item.id) === target ? { ...item, read: 0, historyMessage: [] } : item)),
  );
}

export function mergeServiceSession(local: MarketServiceSession | null | undefined, cloud: MarketServiceSession | null | undefined): MarketServiceSession | null {
  if (!local && !cloud) return null;
  const localMessages = Array.isArray(local?.messages) ? local.messages : [];
  const cloudMessages = Array.isArray(cloud?.messages) ? cloud.messages : [];
  const messages = mergeByKey(localMessages, cloudMessages, serviceMessageKey, (message) => parseTime(message.createdAt));
  const base = {
    ...(local || {}),
    ...(cloud || {}),
  } as MarketServiceSession;
  return {
    ...base,
    messages,
    updatedAt: Math.max(Number(local?.updatedAt || 0), Number(cloud?.updatedAt || 0), Number(messages[messages.length - 1]?.createdAt || 0)),
  };
}

export function mergeServiceSessionList(localItems: MarketServiceSession[], cloudItems: MarketServiceSession[]) {
  const map = new Map<string, MarketServiceSession>();
  localItems.forEach((item) => map.set(String(item.id), item));
  cloudItems.forEach((item) => {
    const key = String(item.id);
    map.set(key, mergeServiceSession(map.get(key), item) || item);
  });
  return Array.from(map.values()).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function readCachedServiceSessions(account: string) {
  return readJson<MarketServiceSession[]>(`${SERVICE_SESSIONS_KEY_PREFIX}${account}`, []);
}

export async function writeCachedServiceSessions(account: string, items: MarketServiceSession[]) {
  await writeJson(`${SERVICE_SESSIONS_KEY_PREFIX}${account}`, items);
  await Promise.all(items.map((item) => writeCachedServiceSessionOnly(account, item)));
}

export async function readCachedServiceSession(account: string, sessionId: number | string) {
  return readJson<MarketServiceSession | null>(serviceSessionKey(account, sessionId), null);
}

export async function writeCachedServiceSession(account: string, item: MarketServiceSession) {
  await writeCachedServiceSessionOnly(account, item);
  const list = await readCachedServiceSessions(account);
  await writeJson(`${SERVICE_SESSIONS_KEY_PREFIX}${account}`, mergeServiceSessionList(list, [item]));
}

async function writeCachedServiceSessionOnly(account: string, item: MarketServiceSession) {
  await writeJson(serviceSessionKey(account, item.id), item);
}

export async function deleteCachedServiceSession(account: string, sessionId: number | string) {
  try {
    await AsyncStorage.removeItem(serviceSessionKey(account, sessionId));
    const list = await readCachedServiceSessions(account);
    await writeCachedServiceSessions(account, list.filter((item) => String(item.id) !== String(sessionId)));
  } catch {
    // Ignore cache cleanup failure.
  }
}
