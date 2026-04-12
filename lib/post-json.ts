import { apiUrl } from '@/constants/api';

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
};

export async function postJson<T = unknown>(path: string, body: unknown): Promise<Envelope<T>> {
  const url = apiUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: Envelope<T>;
  try {
    data = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error(text ? text.slice(0, 200) : '无法解析服务器响应');
  }

  if (data.status !== 200) {
    throw new ApiError(data.status ?? res.status, data.message);
  }

  return data;
}
