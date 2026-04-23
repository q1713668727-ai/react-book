import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ComponentType } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppFeedbackProvider } from '@/components/app-feedback';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
export const unstable_settings = {
  anchor: '(tabs)',
};

const PaperProvider = require('react-native-paper/lib/commonjs/core/PaperProvider').default as ComponentType<any>;
const { MD3LightTheme } = require('react-native-paper/lib/commonjs/styles/themes');

const paperTheme = {
  ...MD3LightTheme,
  roundness: 2,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#F02D47',
    secondary: '#20242B',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F6F8',
    onSurface: '#20242B',
    onSurfaceVariant: '#5C6370',
    outline: '#E3E5E9',
  },
};

function isProtectedRoute(pathname: string, segments: string[]) {
  if (!segments.length) return false;

  const path = String(pathname || '');
  const [first, second] = segments;

  if (first === '(tabs)' && (second === 'chat' || second === 'profile')) return true;

  return (
    first === 'chat' ||
    first === 'chat-likes' ||
    first === 'chat-comments' ||
    first === 'cart' ||
    first === 'checkout' ||
    first === 'orders' ||
    first === 'order-refund' ||
    first === 'coupons' ||
    first === 'product-history' ||
    first === 'product-history-search' ||
    first === 'product-service-list' ||
    first === 'product-service' ||
    first === 'follow-fans' ||
    first === 'settings' ||
    first === 'address-list' ||
    first === 'change-password' ||
    first === 'publish' ||
    first === 'add-note' ||
    first === 'add-video' ||
    path.startsWith('/chat/')
  );
}

function AppNavigator() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (!isReady) return;
    const first = segments[0];
    const isAuthPage = first === 'login' || first === 'register';
    if (isAuthPage) return;
    if (user?.account) return;
    if (!isProtectedRoute(pathname, segments)) return;
    router.replace('/login');
  }, [isReady, user?.account, pathname, segments, router]);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="shop/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="cart" options={{ headerShown: false }} />
      <Stack.Screen name="checkout" options={{ headerShown: false }} />
      <Stack.Screen name="orders" options={{ headerShown: false }} />
      <Stack.Screen name="order-refund" options={{ headerShown: false }} />
      <Stack.Screen name="coupons" options={{ headerShown: false }} />
      <Stack.Screen name="product-history" options={{ headerShown: false }} />
      <Stack.Screen name="product-history-search" options={{ headerShown: false }} />
      <Stack.Screen name="product-service-list" options={{ headerShown: false }} />
      <Stack.Screen name="product-service" options={{ headerShown: false }} />
      <Stack.Screen name="market-category" options={{ headerShown: false }} />
      <Stack.Screen name="note/[id]" options={{ title: '笔记详情' }} />
      <Stack.Screen name="chat/[id]" options={{ title: '聊天' }} />
      <Stack.Screen name="chat-likes" options={{ headerShown: false }} />
      <Stack.Screen name="chat-comments" options={{ headerShown: false }} />
      <Stack.Screen name="user/[account]" options={{ title: '用户主页' }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="find" options={{ title: '发现' }} />
      <Stack.Screen name="follow-fans" options={{ title: '关注与粉丝' }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="address-list" options={{ headerShown: false }} />
      <Stack.Screen name="change-password" options={{ title: '修改密码' }} />
      <Stack.Screen name="publish" options={{ title: '发布' }} />
      <Stack.Screen name="add-note" options={{ title: '发布笔记' }} />
      <Stack.Screen name="add-video" options={{ title: '发布视频' }} />
      <Stack.Screen name="login" options={{ title: '登录' }} />
      <Stack.Screen name="register" options={{ title: '注册' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paperTheme}>
        <AppFeedbackProvider>
          <AuthProvider>
            <ThemeProvider value={DefaultTheme}>
              <AppNavigator />
              <StatusBar style="dark" />
            </ThemeProvider>
          </AuthProvider>
        </AppFeedbackProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
