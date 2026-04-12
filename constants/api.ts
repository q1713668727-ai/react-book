/**
 * API 基址：优先 `EXPO_PUBLIC_API_URL`（.env 或构建环境），默认本机 Express。
 * 真机请改为电脑局域网 IP，如 http://192.168.1.5:8000；Android 模拟器可用 http://10.0.2.2:8000。
 */
const raw = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

export function getApiBaseUrl(): string {
  return raw;
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${p}`;
}

/** 将后端返回的相对路径（如 user-avatar/xxx.jpg）拼成可请求的 URL */
export function resolveMediaUrl(relative: string | undefined | null): string | undefined {
  if (relative == null || relative === '') return undefined;
  if (/^https?:\/\//i.test(relative)) return relative;
  const p = relative.startsWith('/') ? relative : `/${relative}`;
  return `${getApiBaseUrl()}${p}`;
}
