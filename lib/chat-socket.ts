import { getApiBaseUrl } from '@/constants/api';

function resolveSocketBase() {
  const fromEnv = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const apiBase = getApiBaseUrl();
  try {
    const url = new URL(apiBase);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = url.hostname;
    return `${protocol}//${host}:8001`;
  } catch {
    return 'ws://192.168.1.4:8001';
  }
}

export function connectChatSocket(account: string, onMessage: (data: unknown) => void) {
  const socket = new WebSocket(resolveSocketBase());

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'register', account: String(account) }));
  };

  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(String(event.data || '{}')));
    } catch {
      onMessage(null);
    }
  };

  return socket;
}
