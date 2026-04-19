import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { subscribeAuthSessionExpired } from '@/lib/auth-session-events';
import { postJson } from '@/lib/post-json';
import type { AuthUser } from '@/types/auth';

const STORAGE_KEY = '@auth_user';
const TOKEN_KEY = '@auth_token';
const TOKEN_EXPIRE_KEY = '@auth_token_expire_at';

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
    if (user.token) {
      await AsyncStorage.setItem(TOKEN_KEY, String(user.token));
    }
    if (user.tokenExpireAt) {
      await AsyncStorage.setItem(TOKEN_EXPIRE_KEY, String(user.tokenExpireAt));
    }
  } else {
    await AsyncStorage.multiRemove([STORAGE_KEY, TOKEN_KEY, TOKEN_EXPIRE_KEY]);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const sessionAlertVisibleRef = React.useRef(false);

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

  useEffect(() => {
    return subscribeAuthSessionExpired((message) => {
      if (sessionAlertVisibleRef.current) return;
      sessionAlertVisibleRef.current = true;

      Alert.alert(
        '登录提醒',
        message || '你的账号已在其他设备登录，请重新登录。',
        [
          {
            text: '确定',
            onPress: () => {
              void (async () => {
                await signOut();
                sessionAlertVisibleRef.current = false;
                router.replace('/login');
              })();
            },
          },
        ],
        { cancelable: false }
      );
    });
  }, [signOut]);

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
