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
import { useThemeColor } from '@/hooks/use-theme-color';
import { ApiError, postJson } from '@/lib/post-json';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputBg = useThemeColor({ light: '#F2F2F7', dark: '#2C2C2E' }, 'background');
  const border = useThemeColor({ light: '#C6C6C8', dark: '#3A3A3C' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');

  async function onSubmit() {
    setMessage(null);
    setSuccess(false);

    if (!user?.account) {
      router.replace('/login');
      return;
    }
    if (!oldPassword || !newPassword || !confirmPassword) {
      setMessage('请填写原密码、新密码和确认密码');
      return;
    }
    if (newPassword.length < 6) {
      setMessage('新密码至少需要 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的新密码不一致');
      return;
    }
    if (oldPassword === newPassword) {
      setMessage('新密码不能和原密码相同');
      return;
    }

    setLoading(true);
    try {
      await postJson('/changePassword', {
        account: user.account,
        oldPassword,
        newPassword,
      });
      setSuccess(true);
      setMessage('密码修改成功，请重新登录');
      await signOut();
      setTimeout(() => router.replace('/login'), 700);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '修改密码失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ThemedView style={styles.inner}>
            <ThemedText style={styles.label}>原密码</ThemedText>
            <TextInput
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              placeholder="请输入原密码"
              placeholderTextColor={muted}
              style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: textColor }]}
            />

            <ThemedText style={styles.label}>新密码</ThemedText>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="至少 6 位"
              placeholderTextColor={muted}
              style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: textColor }]}
            />

            <ThemedText style={styles.label}>确认新密码</ThemedText>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="再次输入新密码"
              placeholderTextColor={muted}
              style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: textColor }]}
            />

            {message ? (
              <ThemedText style={[styles.message, success ? styles.success : styles.error]}>{message}</ThemedText>
            ) : null}

            <Pressable style={[styles.primaryBtn, { opacity: loading ? 0.6 : 1 }]} disabled={loading} onPress={() => void onSubmit()}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryBtnText} lightColor="#fff" darkColor="#fff">
                  保存新密码
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
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
  message: {
    marginTop: 8,
    fontSize: 14,
  },
  error: { color: '#FF3B30' },
  success: { color: '#1E8E3E' },
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
});
