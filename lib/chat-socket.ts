import { getApiBaseUrl } from '@/constants/api';

type ChatSocketOptions = {
  reconnect?: boolean;
  reconnectDelayMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

export type ChatSocketConnection = {
  getSocket: () => WebSocket | null;
  send: (data: string) => boolean;
  close: () => void;
};

function resolveSocketBase() {
  const fromEnv = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const apiBase = getApiBaseUrl();
  try {
    const url = new URL(apiBase);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = url.hostname;
    return `${protocol}//${host}:8002`;
  } catch {
    return 'ws://192.168.1.4:8002';
  }
}

export function connectChatSocket(
  account: string,
  onMessage: (data: unknown) => void,
  options: ChatSocketOptions = {},
): ChatSocketConnection {
  const reconnect = options.reconnect !== false;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1200;
  let closedByClient = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const open = () => {
    clearReconnectTimer();
    socket = new WebSocket(resolveSocketBase());

    socket.onopen = () => {
      socket?.send(JSON.stringify({ type: 'register', account: String(account) }));
      options.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data || '{}')));
      } catch {
        onMessage(null);
      }
    };

    socket.onerror = () => {
      options.onError?.();
    };

    socket.onclose = () => {
      socket = null;
      options.onClose?.();
      if (closedByClient || !reconnect) return;
      reconnectTimer = setTimeout(open, reconnectDelayMs);
    };
  };

  open();

  return {
    getSocket: () => socket,
    send: (data: string) => {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(data);
      return true;
    },
    close: () => {
      closedByClient = true;
      clearReconnectTimer();
      socket?.close();
      socket = null;
    },
  };
}
