import AsyncStorage from '@react-native-async-storage/async-storage';

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

function getMmkv(): SyncStorage | null {
  if (mmkv !== undefined) return mmkv;
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

export function getString(key: string): string | undefined {
  const value = getMmkv()?.getString(key);
  return value ?? memory.get(key);
}

export function setString(key: string, value: string) {
  memory.set(key, value);
  getMmkv()?.set(key, value);
  void AsyncStorage.setItem(key, value);
}

export function removeString(key: string) {
  memory.delete(key);
  getMmkv()?.remove(key);
  void AsyncStorage.removeItem(key);
}

export async function hydrateStorage(keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      const mmkvValue = getMmkv()?.getString(key);
      if (mmkvValue != null) {
        memory.set(key, mmkvValue);
        return;
      }
      const value = await AsyncStorage.getItem(key);
      if (value != null) {
        memory.set(key, value);
        getMmkv()?.set(key, value);
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
