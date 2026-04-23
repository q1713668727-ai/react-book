import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const AUTH_USER_KEY = '@auth_user';
export const AUTH_TOKEN_KEY = '@auth_token';
export const AUTH_TOKEN_EXPIRE_KEY = '@auth_token_expire_at';
export const SEARCH_HISTORY_KEY = '@search_history';

type SyncStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

const memory = new Map<string, string>();
let mmkv: SyncStorage | null | undefined;
let shouldUseMmkv: boolean | undefined;

function detectMmkvAvailability() {
  if (shouldUseMmkv !== undefined) return shouldUseMmkv;
  if (Platform.OS === 'web') {
    shouldUseMmkv = false;
    return shouldUseMmkv;
  }
  try {
    // In Expo Go, NitroModules are not available for MMKV v4.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as { appOwnership?: string };
    if (String(Constants?.appOwnership || '') === 'expo') {
      shouldUseMmkv = false;
      return shouldUseMmkv;
    }
  } catch {
    // Ignore detection failures and try MMKV.
  }
  shouldUseMmkv = true;
  return shouldUseMmkv;
}

function getMmkv(): SyncStorage | null {
  if (mmkv !== undefined) return mmkv;
  if (!detectMmkvAvailability()) {
    mmkv = null;
    return mmkv;
  }
  try {
    // MMKV v4 requires NitroModules in the native build. Keep it lazy so
    // devices without Nitro support can still run with AsyncStorage fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-mmkv') as { createMMKV?: (config: { id: string }) => SyncStorage };
    mmkv = mod.createMMKV?.({ id: 'react-book-storage' }) ?? null;
  } catch {
    mmkv = null;
  }
  return mmkv;
}

function readMmkv(key: string) {
  const storage = getMmkv();
  if (!storage) return undefined;
  try {
    return storage.getString(key);
  } catch {
    mmkv = null;
    return undefined;
  }
}

function writeMmkv(key: string, value: string) {
  const storage = getMmkv();
  if (!storage) return;
  try {
    storage.set(key, value);
  } catch {
    mmkv = null;
  }
}

function removeMmkv(key: string) {
  const storage = getMmkv();
  if (!storage) return;
  try {
    storage.remove(key);
  } catch {
    mmkv = null;
  }
}

export function getString(key: string): string | undefined {
  const value = readMmkv(key);
  return value ?? memory.get(key);
}

export function setString(key: string, value: string) {
  memory.set(key, value);
  writeMmkv(key, value);
  void AsyncStorage.setItem(key, value);
}

export function removeString(key: string) {
  memory.delete(key);
  removeMmkv(key);
  void AsyncStorage.removeItem(key);
}

export async function hydrateStorage(keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      const mmkvValue = readMmkv(key);
      if (mmkvValue != null) {
        memory.set(key, mmkvValue);
        return;
      }
      const value = await AsyncStorage.getItem(key);
      if (value != null) {
        memory.set(key, value);
        writeMmkv(key, value);
      }
    })
  );
}

export function readJsonArray(key: string): string[] {
  const raw = getString(key);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    removeString(key);
    return [];
  }
}

export function writeJsonArray(key: string, value: string[]) {
  setString(key, JSON.stringify(value));
}
