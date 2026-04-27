import Constants from 'expo-constants';

const DEFAULT_API_BASE = 'http://39.104.19.197:3002';
function sanitizeBaseUrl(value: unknown): string | undefined {
  const text = String(value ?? '').trim().replace(/\/$/, '');
  if (!text) return undefined;
  if (!/^https?:\/\//i.test(text)) return undefined;
  return text;
}

function readConfigBaseUrl(): string | undefined {
  const fromPublicEnv = sanitizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  if (fromPublicEnv) return fromPublicEnv;

  const extra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;
  const fromExtra = sanitizeBaseUrl(extra.apiBaseUrl);
  if (fromExtra) return fromExtra;

  return undefined;
}

const apiBaseUrl = readConfigBaseUrl() || DEFAULT_API_BASE;

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${p}`;
}

/** 将后端返回的相对路径（如 user-avatar/xxx.jpg）拼成可请求的 URL */
export function resolveMediaUrl(relative: string | undefined | null): string | undefined {
  if (relative == null || relative === '') return undefined;
  const normalized = String(relative).trim().replace(/^\.\.\//, '');
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^\/?public\//i.test(normalized)) return normalized;
  const p = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${getApiBaseUrl()}${p}`;
}
