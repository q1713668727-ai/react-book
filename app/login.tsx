import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/post-json';
import { useThemeColor } from '@/hooks/use-theme-color';

function toChineseAuthError(error: unknown, fallback: string) {
  const text = String(error instanceof ApiError ? error.message : error instanceof Error ? error.message : '').trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (lower.includes('account is required')) return '请输入账号';
  if (lower.includes('password is required')) return '请输入密码';
  if (lower.includes('user not found') || lower.includes('account not found')) return '账号不存在';
  if (lower.includes('password') && (lower.includes('invalid') || lower.includes('wrong') || lower.includes('incorrect'))) return '密码错误';
  if (lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'))) return '登录已过期，请重新登录';
  if (lower.includes('network request failed') || lower.includes('failed to fetch')) return '网络异常，请检查网络后重试';
  return text;
}

export default function LoginScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { signIn, signOut } = useAuth();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputBg = useThemeColor({ light: '#F2F2F7', dark: '#2C2C2E' }, 'background');
  const border = useThemeColor({ light: '#C6C6C8', dark: '#3A3A3C' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');

  const onSubmit = async () => {
    setError(null);
    if (!account.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      await signIn(account, password);
      feedback.toast('登录成功');
      router.replace('/profile');
    } catch (e) {
      setError(toChineseAuthError(e, '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  const onGuestVisit = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable hitSlop={10} onPress={() => void onGuestVisit()}>
              <ThemedText style={styles.guestText}>游客访问</ThemedText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ThemedView style={styles.inner}>
          <ThemedText style={styles.label}>账号</ThemedText>
          <TextInput
            value={account}
            onChangeText={setAccount}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="账号"
            placeholderTextColor={muted}
            style={[
              styles.input,
              { backgroundColor: inputBg, borderColor: border, color: textColor },
            ]}
          />
          <ThemedText style={styles.label}>密码</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="密码"
            placeholderTextColor={muted}
            style={[
              styles.input,
              { backgroundColor: inputBg, borderColor: border, color: textColor },
            ]}
          />
          {error ? (
            <ThemedText style={styles.error} lightColor="#FF3B30" darkColor="#FF453A">
              {error}
            </ThemedText>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, { opacity: loading ? 0.6 : 1 }]}
            onPress={onSubmit}
            disabled={loading}>
            {loading ? (
              <AppActivityIndicator compact color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryBtnText} lightColor="#fff" darkColor="#fff">
                登录
              </ThemedText>
            )}
          </Pressable>
          <Pressable style={styles.linkWrap} onPress={() => router.push('/register')}>
            <ThemedText style={[styles.link, { color: muted }]}>没有账号？去注册</ThemedText>
          </Pressable>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, default: 10 }),
    fontSize: 16,
  },
  error: {
    marginTop: 8,
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#FF2442',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
  linkWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  link: {
    fontSize: 15,
  },
  guestText: {
    color: '#FF2442',
    fontSize: 14,
    fontWeight: '600',
  },
});
