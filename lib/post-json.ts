import { apiUrl } from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitAuthSessionExpired } from '@/lib/auth-session-events';

const TOKEN_KEY = '@auth_token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string
  ) {
    super(message ?? '请求失败');
    this.name = 'ApiError';
  }
}

type Envelope<T> = {
  status: number;
  message?: string;
  result?: T;
  token?: string;
  tokenExpireAt?: string | number;
};

function isOtherDeviceLogin(message?: string) {
  const text = String(message || '');
  return /异地|其他设备|别处登录|别的设备|另一台设备|账号已登录|账户已登录|被挤下线/i.test(text);
}

export async function getAuthHeaders(withJson = true) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = withJson
    ? { 'Content-Type': 'application/json' }
    : {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseEnvelope<T>(res: Response, path: string): Promise<Envelope<T>> {
  const text = await res.text();
  let data: Envelope<T>;
  try {
    data = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error(text ? text.slice(0, 200) : '无法解析服务器响应');
  }

  if (data.status !== 200) {
    if (!path.startsWith('/login') && isOtherDeviceLogin(data.message)) {
      emitAuthSessionExpired(data.message);
    }
    throw new ApiError(data.status ?? res.status, data.message);
  }

  return data;
}

function buildQuery(params?: Record<string, unknown>) {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        search.append(key, String(item));
      });
      return;
    }
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function postJson<T = unknown>(path: string, body: unknown): Promise<Envelope<T>> {
  const url = apiUrl(path);
  const headers = await getAuthHeaders(true);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return parseEnvelope<T>(res, path);
}

export async function postPublicJson<T = unknown>(path: string, body: unknown): Promise<Envelope<T>> {
  const url = apiUrl(path);
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return parseEnvelope<T>(res, path);
}

export async function getJson<T = unknown>(path: string, params?: Record<string, unknown>): Promise<Envelope<T>> {
  const url = `${apiUrl(path)}${buildQuery(params)}`;
  const headers = await getAuthHeaders(false);
  const res = await fetch(url, { method: 'GET', headers });
  return parseEnvelope<T>(res, path);
}
