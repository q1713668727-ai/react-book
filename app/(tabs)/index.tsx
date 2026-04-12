import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { postJson } from '@/lib/post-json';

const GAP = 8;
const H_PADDING = 12;

type HomeNoteDto = {
  id: number | string;
  title?: string;
  image?: string;
  account?: string;
  likes?: number | string;
};

type HomeFeedItem = {
  id: string;
  title: string;
  imageUri?: string;
  likes: number;
  liked: boolean;
};

type UserInfoResponse = {
  likes?: string;
};

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toHomeFeedItem(note: HomeNoteDto, likedIds: Set<string>): HomeFeedItem {
  const firstImage = String(note.image ?? '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)[0];

  const imageUri = note.account && firstImage ? resolveMediaUrl(`note-image/${note.account}/${firstImage}`) : undefined;

  return {
    id: String(note.id),
    title: String(note.title || '未命名笔记'),
    imageUri,
    likes: Number(note.likes || 0),
    liked: likedIds.has(String(note.id)),
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const border = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');
  const [items, setItems] = useState<HomeFeedItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHomeFeed(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [{ result: feedResult }, userInfoRes] = await Promise.all([
        postJson<HomeNoteDto[]>('/index', { init: true }),
        user?.account
          ? postJson<UserInfoResponse>('/user/getUserInfo', { account: user.account })
          : Promise.resolve({ result: { likes: '' } as UserInfoResponse }),
      ]);

      const nextLikedIds = new Set(parseIdList(userInfoRes.result?.likes));
      setLikedIds(nextLikedIds);
      setItems(Array.isArray(feedResult) ? feedResult.map((item) => toHomeFeedItem(item, nextLikedIds)) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载首页失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void loadHomeFeed();
  }, [user?.account]);

  async function toggleLike(itemId: string) {
    if (!user?.account) {
      router.push('/login');
      return;
    }

    if (pendingIds.includes(itemId)) {
      return;
    }

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) {
      return;
    }

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !currentItem.liked;
    const nextLikes = Math.max(0, currentItem.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = new Set(previousLikedIds);

    if (nextLiked) nextLikedIds.add(itemId);
    else nextLikedIds.delete(itemId);

    setPendingIds((prev) => [...prev, itemId]);
    setLikedIds(nextLikedIds);
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, liked: nextLiked, likes: nextLikes } : item)));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextLikedIds).join(','),
        account: user.account,
        num: nextLikes,
        setId: itemId,
      });
    } catch (err) {
      setLikedIds(previousLikedIds);
      setItems((prev) => prev.map((item) => (item.id === itemId ? currentItem : item)));
      setError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== itemId));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <View style={[styles.topBar, { borderBottomColor: border }]}> 
          <Pressable hitSlop={8}>
            <ThemedText style={styles.city}>上海</ThemedText>
          </Pressable>
          <Pressable style={[styles.search, { backgroundColor: '#F2F2F7' }]}> 
            <ThemedText style={[styles.searchPlaceholder, { color: muted }]}>搜索笔记、用户</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => void loadHomeFeed(true)}
          ListEmptyComponent={
            loading ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={styles.stateBlock}>
                <ThemedText style={[styles.stateText, { color: muted }]}>{error ?? '暂无内容'}</ThemedText>
                <Pressable style={[styles.retryBtn, { borderColor: border }]} onPress={() => void loadHomeFeed()}>
                  <ThemedText style={styles.retryText}>重试</ThemedText>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const tall = index % 3 !== 1;
            const pending = pendingIds.includes(item.id);

            return (
              <Pressable
                style={styles.cardWrap}
                onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.id } })}>
                <ThemedView style={[styles.card, { borderColor: border }]}> 
                  {item.imageUri ? (
                    <Image
                      source={{ uri: item.imageUri }}
                      style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort]}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort, styles.imageFallback]} />
                  )}
                  <View style={styles.cardBody}>
                    <ThemedText numberOfLines={2} style={styles.cardTitle}>{item.title}</ThemedText>
                    <Pressable
                      hitSlop={8}
                      disabled={pending}
                      onPress={(event) => {
                        event.stopPropagation();
                        void toggleLike(item.id);
                      }}>
                      <ThemedText style={[styles.likes, { color: item.liked ? '#FF2442' : muted, opacity: pending ? 0.6 : 1 }]}>
                        {item.liked ? '♥' : '♡'} {item.likes}
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: H_PADDING, paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  city: { fontSize: 17, fontWeight: '600' },
  search: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', minHeight: 36 },
  searchPlaceholder: { fontSize: 15 },
  listContent: { paddingHorizontal: H_PADDING - GAP / 2, paddingBottom: 24, paddingTop: GAP, flexGrow: 1 },
  columnWrap: { gap: GAP, marginBottom: GAP },
  cardWrap: { flex: 1, maxWidth: '50%', paddingHorizontal: GAP / 2 },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cardImage: { width: '100%' },
  imageFallback: { backgroundColor: '#E5E5EA' },
  cardImageTall: { aspectRatio: 3 / 4 },
  cardImageShort: { aspectRatio: 4 / 5 },
  cardBody: { padding: 10, gap: 6 },
  cardTitle: { fontSize: 14, lineHeight: 20 },
  likes: { fontSize: 12 },
  stateBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12, minHeight: 240 },
  stateText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: '600' },
});
