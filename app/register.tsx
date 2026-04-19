import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/post-json';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputBg = useThemeColor({ light: '#F2F2F7', dark: '#2C2C2E' }, 'background');
  const border = useThemeColor({ light: '#C6C6C8', dark: '#3A3A3C' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !account.trim() || !email.trim() || !password) {
      setError('请填写昵称、账号、邮箱和密码');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await signUp({
        name: name.trim(),
        account: account.trim(),
        email: email.trim(),
        password,
      });
      router.replace('/profile');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ThemedView style={styles.inner}>
            <ThemedText style={styles.label}>昵称</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="昵称"
              placeholderTextColor={muted}
              style={[
                styles.input,
                { backgroundColor: inputBg, borderColor: border, color: textColor },
              ]}
            />
            <ThemedText style={styles.label}>账号</ThemedText>
            <TextInput
              value={account}
              onChangeText={setAccount}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="登录账号（唯一）"
              placeholderTextColor={muted}
              style={[
                styles.input,
                { backgroundColor: inputBg, borderColor: border, color: textColor },
              ]}
            />
            <ThemedText style={styles.label}>邮箱</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="邮箱"
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
            <ThemedText style={styles.label}>确认密码</ThemedText>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="再次输入密码"
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
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryBtnText} lightColor="#fff" darkColor="#fff">
                  注册
                </ThemedText>
              )}
            </Pressable>
            <Pressable style={styles.linkWrap} onPress={() => router.push('/login')}>
              <ThemedText style={[styles.link, { color: muted }]}>已有账号？去登录</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
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
  scroll: {
    flexGrow: 1,
  },
  inner: {
    padding: 24,
    gap: 8,
    paddingBottom: 40,
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
});
