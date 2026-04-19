import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { fetchFollowList, toggleFollow, type FollowListItem } from '@/lib/redbook-api';

const tabs = [
  { key: 'mutual', text: '互相关注' },
  { key: 'follow', text: '关注' },
  { key: 'fans', text: '粉丝' },
  { key: 'recommend', text: '推荐' },
] as const;

type FollowTab = (typeof tabs)[number]['key'];

function avatarUrl(url?: string) {
  return resolveMediaUrl(String(url || '').replace(/^\.\.\//, ''));
}

export default function FollowFansScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const [active, setActive] = useState<FollowTab>('follow');
  const [list, setList] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === 'fans') setActive('fans');
  }, [params.tab]);

  const loadCurrent = useCallback(async () => {
    if (!user?.account) {
      setLoading(false);
      setList([]);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchFollowList(active);
      setList(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [active, user?.account]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const title = useMemo(() => {
    const current = tabs.find((item) => item.key === active);
    return `我的${current?.text || ''}`;
  }, [active]);

  async function onToggle(item: FollowListItem) {
    const target = String(item.account || '');
    if (!target || !user?.account || target === user.account || updating.includes(target)) return;

    setUpdating((prev) => [...prev, target]);
    try {
      const action = item.followed ? 'unfollow' : 'follow';
      await toggleFollow(target, action);
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setUpdating((prev) => prev.filter((id) => id !== target));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '我的关注' }} />
      <ThemedView style={styles.root}>
        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <Pressable key={tab.key} style={styles.tabBtn} onPress={() => setActive(tab.key)}>
              <ThemedText style={active === tab.key ? styles.tabActive : styles.tabIdle}>{tab.text}</ThemedText>
              {active === tab.key ? <View style={styles.tabLine} /> : null}
            </Pressable>
          ))}
        </View>

        <ThemedText style={styles.title}>
          {title}（{list.length}）
        </ThemedText>

        <FlatList
          data={list}
          keyExtractor={(item, index) => `${item.account}-${index}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? <ActivityIndicator /> : <ThemedText style={styles.emptyText}>{error || '暂无数据'}</ThemedText>}
            </View>
          }
          renderItem={({ item }) => {
            const targetAccount = String(item.account || '');
            const pending = updating.includes(targetAccount);
            const mutual = !!item.mutual;
            const followed = !!item.followed;
            return (
              <View style={styles.row}>
                <Pressable
                  style={styles.userPart}
                  onPress={() =>
                    router.push({
                      pathname: '/user/[account]',
                      params: { account: targetAccount, name: String(item.name || ''), avatar: String(item.url || '') },
                    })
                  }>
                  {avatarUrl(item.url) ? (
                    <Image source={{ uri: avatarUrl(item.url) }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]} />
                  )}
                  <View style={styles.info}>
                    <ThemedText style={styles.name}>{item.name || targetAccount}</ThemedText>
                    <ThemedText style={styles.desc}>
                      关注 {Number(item.attention || 0)} | 粉丝 {Number(item.fans || 0)}
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  disabled={pending}
                  style={[styles.btn, mutual || followed ? styles.btnMuted : styles.btnFollow, pending && styles.btnPending]}
                  onPress={() => void onToggle(item)}>
                  <ThemedText style={mutual || followed ? styles.btnMutedText : styles.btnFollowText}>
                    {pending ? '处理中' : mutual ? '互相关注' : followed ? '已关注' : active === 'fans' ? '回关' : '关注'}
                  </ThemedText>
                </Pressable>
              </View>
            );
          }}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  tabBtn: { alignItems: 'center', gap: 6 },
  tabActive: { fontSize: 16, fontWeight: '700' },
  tabIdle: { fontSize: 15, color: '#8B93A6' },
  tabLine: { width: 18, height: 3, borderRadius: 2, backgroundColor: '#FF3B5C' },
  title: { marginTop: 14, marginBottom: 10, fontSize: 14, color: '#7E8698' },
  list: { paddingBottom: 24, gap: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 42 },
  emptyText: { color: '#8B93A6' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAF0',
    padding: 10,
  },
  userPart: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ECEFF6' },
  avatarFallback: { backgroundColor: '#ECEFF6' },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
  desc: { fontSize: 12, color: '#8B93A6' },
  btn: { minWidth: 84, height: 34, borderRadius: 17, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  btnFollow: { borderWidth: 1, borderColor: '#FF3158', backgroundColor: '#FFF8FA' },
  btnMuted: { borderWidth: 1, borderColor: '#D5DAE6', backgroundColor: '#F6F8FC' },
  btnPending: { opacity: 0.6 },
  btnFollowText: { color: '#F34F71', fontSize: 13, fontWeight: '600' },
  btnMutedText: { color: '#5F6677', fontSize: 13, fontWeight: '600' },
});
