type AuthSessionListener = (message?: string) => void;

const listeners = new Set<AuthSessionListener>();

export function subscribeAuthSessionExpired(listener: AuthSessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAuthSessionExpired(message?: string) {
  listeners.forEach((listener) => listener(message));
}
