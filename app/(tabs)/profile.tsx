import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { postJson } from '@/lib/post-json';
import type { AuthUser } from '@/types/auth';

type ProfileTab = 'notes' | 'collections';

type ProfileUserResponse = AuthUser & {
  collects?: string;
  likes?: string;
};

type ProfileNoteDto = {
  id: number | string;
  image?: string;
  title?: string;
  account?: string;
  likes?: number | string;
  name?: string;
  url?: string;
};

type ProfileNoteResponse = {
  data?: ProfileNoteDto[];
};

type LikeTotalResponse = {
  totalLikes?: number;
};

type ProfileNote = {
  id: string;
  imageUri?: string;
  title: string;
  likes: number;
  account: string;
  authorName: string;
  authorAvatar?: string;
  liked: boolean;
};

const GAP = 8;

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toProfileNote(item: ProfileNoteDto, likedIds: Set<string>): ProfileNote {
  const firstImage = String(item.image ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)[0];

  return {
    id: String(item.id),
    imageUri: item.account && firstImage ? resolveMediaUrl(`note-image/${item.account}/${firstImage}`) : undefined,
    title: String(item.title || '未命名笔记'),
    likes: Number(item.likes || 0),
    account: String(item.account || ''),
    authorName: String(item.name || item.account || '用户'),
    authorAvatar: resolveMediaUrl(typeof item.url === 'string' ? item.url : undefined),
    liked: likedIds.has(String(item.id)),
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isReady, signOut } = useAuth();
  const border = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');
  const [activeTab, setActiveTab] = useState<ProfileTab>('notes');
  const [profile, setProfile] = useState<ProfileUserResponse | null>(null);
  const [notes, setNotes] = useState<ProfileNote[]>([]);
  const [collections, setCollections] = useState<ProfileNote[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [likeTotal, setLikeTotal] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfileData = useCallback(async (isRefresh = false) => {
    if (!user?.account) {
      setProfile(null);
      setNotes([]);
      setCollections([]);
      setLikedIds(new Set());
      setLikeTotal(0);
      setLoadError(null);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoadingProfile(true);

    try {
      const [{ result: profileResult }, { result: noteResult }, { result: collectResult }, { result: likeResult }] =
        await Promise.all([
          postJson<ProfileUserResponse>('/user/getUserInfo', { account: user.account }),
          postJson<ProfileNoteResponse>('/user/myNote', { account: user.account }),
          postJson<ProfileNoteResponse>('/user/findCollectNote', { account: user.account }),
          postJson<LikeTotalResponse>('/user/getMyLikeTotal', { account: user.account }),
        ]);

      const nextLikedIds = new Set(parseIdList(profileResult?.likes));
      setProfile(profileResult ?? null);
      setLikedIds(nextLikedIds);
      setNotes(Array.isArray(noteResult?.data) ? noteResult.data.map((item) => toProfileNote(item, nextLikedIds)) : []);
      setCollections(
        Array.isArray(collectResult?.data) ? collectResult.data.map((item) => toProfileNote(item, nextLikedIds)) : []
      );
      setLikeTotal(Number(likeResult?.totalLikes || 0));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载个人主页失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoadingProfile(false);
    }
  }, [user?.account]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  useFocusEffect(
    useCallback(() => {
      void loadProfileData(true);
    }, [loadProfileData])
  );

  async function toggleLike(itemId: string) {
    if (!user?.account) {
      router.push('/login');
      return;
    }

    if (pendingIds.includes(itemId)) return;

    const currentItem = [...notes, ...collections].find((item) => item.id === itemId);
    if (!currentItem) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !currentItem.liked;
    const nextLikes = Math.max(0, currentItem.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = new Set(previousLikedIds);

    if (nextLiked) nextLikedIds.add(itemId);
    else nextLikedIds.delete(itemId);

    setPendingIds((prev) => [...prev, itemId]);
    setLikedIds(nextLikedIds);
    setNotes((prev) => prev.map((item) => (item.id === itemId ? { ...item, liked: nextLiked, likes: nextLikes } : item)));
    setCollections((prev) => prev.map((item) => (item.id === itemId ? { ...item, liked: nextLiked, likes: nextLikes } : item)));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextLikedIds).join(','),
        account: user.account,
        num: nextLikes,
        setId: itemId,
      });
    } catch (err) {
      setLikedIds(previousLikedIds);
      setNotes((prev) => prev.map((item) => (item.id === itemId ? currentItem : item)));
      setCollections((prev) => prev.map((item) => (item.id === itemId ? currentItem : item)));
      setLoadError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== itemId));
    }
  }

  const currentUser = profile ?? user;
  const avatarUri = currentUser ? resolveMediaUrl(typeof currentUser.url === 'string' ? currentUser.url : undefined) : undefined;
  const displayName = currentUser ? String(currentUser.name || currentUser.account || '用户') : '游客';
  const accountLabel = currentUser?.account ? `小红书号：${currentUser.account}` : '小红书号：未设置';
  const displayBio = currentUser ? String(currentUser.sign || currentUser.email || '这个人很神秘，还没有留下简介') : '登录后查看你的资料和笔记';
  const visibleItems = activeTab === 'notes' ? notes : collections;
  const emptyText = activeTab === 'notes' ? '还没有发布笔记' : '还没有收藏内容';
  const stats = useMemo(
    () => ({ notes: notes.length, collections: collections.length, likes: likeTotal }),
    [notes, collections, likeTotal]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <View style={[styles.header, { borderBottomColor: border }]}> 
          <ThemedText type="title" style={styles.headerTitle}>我的</ThemedText>
        </View>

        <FlatList
          data={visibleItems}
          keyExtractor={(item, index) => `${activeTab}-${item.id}-${index}`}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.gridContent}
          refreshing={refreshing}
          onRefresh={() => void loadProfileData(true)}
          ListHeaderComponent={
            <View style={styles.profileBlock}>
              <View style={styles.identityRow}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
                ) : currentUser ? (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <ThemedText style={[styles.avatarLetter, { color: muted }]}>
                      {String(currentUser.account || '?').slice(0, 1).toUpperCase()}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <ThemedText style={[styles.avatarLetter, { color: muted }]}>?</ThemedText>
                  </View>
                )}
                <View style={styles.identityTextBlock}>
                  <ThemedText numberOfLines={1} style={styles.nickname}>{displayName}</ThemedText>
                  <ThemedText numberOfLines={1} style={[styles.accountText, { color: muted }]}>{accountLabel}</ThemedText>
                  <ThemedText numberOfLines={2} style={[styles.bio, { color: muted }]}>{displayBio}</ThemedText>
                </View>
              </View>
              {!isReady ? (
                <ActivityIndicator style={styles.authLoading} />
              ) : user ? (
                <>
                  <View style={styles.authRow}>
                    <Pressable style={[styles.outlineBtn, { borderColor: border }]} onPress={() => void signOut()}>
                      <ThemedText style={styles.outlineBtnText}>退出登录</ThemedText>
                    </Pressable>
                  </View>
                  {loadingProfile ? <ActivityIndicator style={styles.authLoading} /> : null}
                  {loadError ? (
                    <View style={styles.errorBox}>
                      <ThemedText style={[styles.errorText, { color: muted }]}>{loadError}</ThemedText>
                      <Pressable style={[styles.outlineBtn, { borderColor: border }]} onPress={() => void loadProfileData()}>
                        <ThemedText style={styles.outlineBtnText}>重试</ThemedText>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.authRow}>
                  <Pressable style={[styles.primaryOutlineBtn, { borderColor: '#FF2442' }]} onPress={() => router.push('/login')}>
                    <ThemedText style={styles.primaryOutlineText}>登录</ThemedText>
                  </Pressable>
                  <Pressable style={[styles.outlineBtn, { borderColor: border }]} onPress={() => router.push('/register')}>
                    <ThemedText style={styles.outlineBtnText}>注册</ThemedText>
                  </Pressable>
                </View>
              )}
              <View style={styles.stats}>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statNum}>{stats.notes}</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: muted }]}>笔记</ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: border }]} />
                <View style={styles.statItem}>
                  <ThemedText style={styles.statNum}>{stats.collections}</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: muted }]}>收藏</ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: border }]} />
                <View style={styles.statItem}>
                  <ThemedText style={styles.statNum}>{stats.likes}</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: muted }]}>获赞</ThemedText>
                </View>
              </View>
              <View style={styles.tabs}>
                <Pressable style={styles.tabActive} onPress={() => setActiveTab('notes')}>
                  <ThemedText style={activeTab === 'notes' ? styles.tabActiveText : [styles.tabIdle, { color: muted }]}>笔记</ThemedText>
                  {activeTab === 'notes' ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
                <Pressable style={styles.tabActive} onPress={() => setActiveTab('collections')}>
                  <ThemedText style={activeTab === 'collections' ? styles.tabActiveText : [styles.tabIdle, { color: muted }]}>收藏</ThemedText>
                  {activeTab === 'collections' ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            user ? (
              <View style={styles.emptyBlock}>
                {loadingProfile ? <ActivityIndicator /> : <ThemedText style={[styles.emptyText, { color: muted }]}>{emptyText}</ThemedText>}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const pending = pendingIds.includes(item.id);

            return (
              <Pressable style={styles.cardWrap} onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.id } })}>
                <ThemedView style={[styles.noteCard, { borderColor: border }]}> 
                  {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={styles.noteImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.noteImage, styles.noteImageFallback]} />
                  )}
                  <ThemedText numberOfLines={2} style={styles.noteTitle}>{item.title}</ThemedText>
                  <View style={styles.noteMetaRow}>
                    <View style={styles.authorRow}>
                      {item.authorAvatar ? (
                        <Image source={{ uri: item.authorAvatar }} style={styles.noteAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.noteAvatar, styles.avatarPlaceholder]} />
                      )}
                      <ThemedText numberOfLines={1} style={[styles.authorName, { color: muted }]}>{item.authorName}</ThemedText>
                    </View>
                    <Pressable
                      hitSlop={8}
                      disabled={pending}
                      onPress={(event) => {
                        event.stopPropagation();
                        void toggleLike(item.id);
                      }}>
                      <ThemedText style={[styles.noteLikes, { color: item.liked ? '#FF2442' : muted, opacity: pending ? 0.6 : 1 }]}> 
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
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 22 },
  authLoading: { marginVertical: 12 },
  errorBox: { alignItems: 'center', gap: 10, marginBottom: 12 },
  errorText: { fontSize: 13, textAlign: 'center' },
  authRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignSelf: 'stretch', justifyContent: 'center' },
  outlineBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  outlineBtnText: { fontSize: 15, fontWeight: '600' },
  primaryOutlineBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1 },
  primaryOutlineText: { fontSize: 15, fontWeight: '600', color: '#FF2442' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E5EA' },
  avatarLetter: { fontSize: 32, fontWeight: '700' },
  profileBlock: { paddingHorizontal: 16, paddingBottom: 16 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, marginBottom: 16 },
  identityTextBlock: { flex: 1, justifyContent: 'center', gap: 6 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E5E5' },
  nickname: { fontSize: 30, fontWeight: '800', lineHeight: 36 },
  accountText: { fontSize: 17, lineHeight: 22 },
  bio: { fontSize: 15, lineHeight: 21 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 20, width: '100%', justifyContent: 'space-around', paddingVertical: 8 },
  statItem: { alignItems: 'center', gap: 4, flex: 1 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 13 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 28, marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 4 },
  tabActive: { alignItems: 'center', gap: 6 },
  tabActiveText: { fontSize: 16, fontWeight: '600' },
  tabUnderline: { height: 3, width: 24, borderRadius: 2, backgroundColor: '#FF2442' },
  tabIdle: { fontSize: 16 },
  gridContent: { paddingHorizontal: 12 - GAP / 2, paddingBottom: 24 },
  columnWrap: { gap: GAP, marginBottom: GAP },
  cardWrap: { flex: 1, maxWidth: '50%', paddingHorizontal: GAP / 2 },
  noteCard: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  noteImage: { width: '100%', aspectRatio: 1 },
  noteImageFallback: { backgroundColor: '#E5E5EA' },
  noteTitle: { fontSize: 13, paddingHorizontal: 8, paddingTop: 8, lineHeight: 18, minHeight: 44 },
  noteMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 8 },
  authorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E5E5E5' },
  authorName: { flex: 1, fontSize: 12 },
  noteLikes: { fontSize: 12 },
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14 },
});
