import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';

export default function PublishScreen() {
  const router = useRouter();
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !user?.account) {
      router.replace('/login');
    }
  }, [isReady, router, user?.account]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '发布' }} />
      <ThemedView style={styles.root}>
        <ThemedText style={styles.title}>选择要发布的内容</ThemedText>
        <View style={styles.grid}>
          <Pressable style={[styles.card, styles.note]} onPress={() => router.push('/add-note')}>
            <ThemedText style={styles.cardTitle}>发布笔记</ThemedText>
            <ThemedText style={styles.cardDesc}>图文内容，支持标题和正文</ThemedText>
          </Pressable>
          <Pressable style={[styles.card, styles.video]} onPress={() => router.push('/add-video')}>
            <ThemedText style={styles.cardTitle}>发布视频</ThemedText>
            <ThemedText style={styles.cardDesc}>视频稿件，带标题展示</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1, padding: 16, gap: 18 },
  title: { fontSize: 18, fontWeight: '700' },
  grid: { gap: 12 },
  card: { borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ECECEE', gap: 8 },
  note: { backgroundColor: '#FFF7F8' },
  video: { backgroundColor: '#F6F9FF' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: '#7E8698' },
});
