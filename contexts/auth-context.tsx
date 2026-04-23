import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useFeedback } from '@/components/app-feedback';
import { subscribeAuthSessionExpired } from '@/lib/auth-session-events';
import { postJson } from '@/lib/post-json';
import { AUTH_TOKEN_EXPIRE_KEY, AUTH_TOKEN_KEY, AUTH_USER_KEY, getString, hydrateStorage, removeString, setString } from '@/lib/storage';
import type { AuthUser } from '@/types/auth';

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  signIn: (account: string, password: string) => Promise<void>;
  signUp: (params: { name: string; account: string; password: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistUser(user: AuthUser | null) {
  if (user) {
    setString(AUTH_USER_KEY, JSON.stringify(user));
    if (user.token) {
      setString(AUTH_TOKEN_KEY, String(user.token));
    }
    if (user.tokenExpireAt) {
      setString(AUTH_TOKEN_EXPIRE_KEY, String(user.tokenExpireAt));
    }
  } else {
    removeString(AUTH_USER_KEY);
    removeString(AUTH_TOKEN_KEY);
    removeString(AUTH_TOKEN_EXPIRE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const feedback = useFeedback();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const sessionAlertVisibleRef = React.useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrateStorage([AUTH_USER_KEY, AUTH_TOKEN_KEY, AUTH_TOKEN_EXPIRE_KEY]);
        const raw = getString(AUTH_USER_KEY);
        if (!cancelled && raw) {
          setUser(JSON.parse(raw) as AuthUser);
        }
      } catch {
        removeString(AUTH_USER_KEY);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLoginResult = useCallback(async (result: AuthUser, token?: string, tokenExpireAt?: string | number) => {
    const nextUser: AuthUser = {
      ...result,
      token: token ?? result.token,
      tokenExpireAt: tokenExpireAt != null ? String(tokenExpireAt) : result.tokenExpireAt != null ? String(result.tokenExpireAt) : undefined,
    };
    setUser(nextUser);
    await persistUser(nextUser);
  }, []);

  const signIn = useCallback(
    async (account: string, password: string) => {
      const trimmed = account.trim();
      const { result, token, tokenExpireAt } = await postJson<AuthUser>('/login', {
        account: trimmed,
        password,
      });
      if (!result || typeof result !== 'object') {
        throw new Error('登录未返回用户数据');
      }
      await applyLoginResult(result as AuthUser, token, tokenExpireAt);
    },
    [applyLoginResult]
  );

  const signUp = useCallback(
    async (params: { name: string; account: string; password: string; email: string }) => {
      await postJson('/login/reg', {
        name: params.name.trim(),
        account: params.account.trim(),
        password: params.password,
        email: params.email.trim(),
        path: '',
      });
      await signIn(params.account.trim(), params.password);
    },
    [signIn]
  );

  const signOut = useCallback(async () => {
    setUser(null);
    await persistUser(null);
  }, []);

  const updateUser = useCallback(
    async (patch: Partial<AuthUser>) => {
      if (!user) return;
      const keys = Object.keys(patch || {});
      if (!keys.length) return;
      const changed = keys.some((key) => !Object.is((user as any)[key], (patch as any)[key]));
      if (!changed) return;

      const nextUser: AuthUser = { ...user, ...patch };
      setUser(nextUser);
      await persistUser(nextUser);
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    if (!user?.account) return;
    const { result } = await postJson<AuthUser>('/user/getUserInfo', { account: user.account });
    if (!result || typeof result !== 'object') return;
    const nextUser: AuthUser = {
      ...user,
      ...result,
      token: user.token,
      tokenExpireAt: user.tokenExpireAt,
    };
    const changed = Object.keys(nextUser).some((key) => !Object.is((user as any)[key], (nextUser as any)[key]));
    if (!changed) return;
    setUser(nextUser);
    await persistUser(nextUser);
  }, [user]);

  useEffect(() => {
    return subscribeAuthSessionExpired((message) => {
      if (sessionAlertVisibleRef.current) return;
      sessionAlertVisibleRef.current = true;

      feedback.dialog({
        title: '登录提醒',
        message: message || '你的账号已在其他设备登录，请重新登录。',
        dismissable: false,
        actions: [
          {
            label: '重新登录',
            variant: 'primary',
            onPress: async () => {
              await signOut();
              sessionAlertVisibleRef.current = false;
              router.replace('/login');
            },
          },
        ],
      });
    });
  }, [feedback, signOut]);

  const value = useMemo(
    () => ({
      user,
      isReady,
      signIn,
      signUp,
      signOut,
      updateUser,
      refreshUser,
    }),
    [user, isReady, signIn, signUp, signOut, updateUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
