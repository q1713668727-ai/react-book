import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/auth-context';
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="note/[id]" options={{ title: '笔记详情' }} />
          <Stack.Screen name="chat/[id]" options={{ title: '聊天' }} />
          <Stack.Screen name="user/[account]" options={{ title: '用户主页' }} />
          <Stack.Screen name="find" options={{ title: '发现' }} />
          <Stack.Screen name="follow-fans" options={{ title: '关注与粉丝' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="change-password" options={{ title: '修改密码' }} />
          <Stack.Screen name="publish" options={{ title: '发布' }} />
          <Stack.Screen name="add-note" options={{ title: '发布笔记' }} />
          <Stack.Screen name="add-video" options={{ title: '发布视频' }} />
          <Stack.Screen name="login" options={{ title: '登录' }} />
          <Stack.Screen name="register" options={{ title: '注册' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </AuthProvider>
  );
}
