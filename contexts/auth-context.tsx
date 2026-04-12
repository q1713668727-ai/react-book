import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { postJson } from '@/lib/post-json';
import type { AuthUser } from '@/types/auth';

const STORAGE_KEY = '@auth_user';

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  signIn: (account: string, password: string) => Promise<void>;
  signUp: (params: { name: string; account: string; password: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistUser(user: AuthUser | null) {
  if (user) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          setUser(JSON.parse(raw) as AuthUser);
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLoginResult = useCallback(async (result: AuthUser) => {
    setUser(result);
    await persistUser(result);
  }, []);

  const signIn = useCallback(
    async (account: string, password: string) => {
      const trimmed = account.trim();
      const { result } = await postJson<AuthUser>('/login', {
        account: trimmed,
        password,
      });
      if (!result || typeof result !== 'object') {
        throw new Error('登录未返回用户数据');
      }
      await applyLoginResult(result as AuthUser);
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

  const value = useMemo(
    () => ({
      user,
      isReady,
      signIn,
      signUp,
      signOut,
    }),
    [user, isReady, signIn, signUp, signOut]
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
