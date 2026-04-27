import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { postJson } from '@/lib/post-json';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';
import {
  createConversation,
  fetchFollowStatus,
  fetchUserInfo,
  fetchUserPosts,
  toggleFollow,
  type UserPostItem,
  type UserProfile,
} from '@/lib/redbook-api';

function normalizeCount(value: unknown) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return 0;
  if (text.includes(',')) return text.split(',').filter(Boolean).length;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function avatarOf(profile?: UserProfile | null, fallback?: string) {
  const raw = String(profile?.url || profile?.avatar || fallback || '').replace(/^\.\.\//, '');
  return resolveMediaUrl(raw);
}

function isVideoFileName(value: unknown) {
  return /\.(mp4|mov|m4v|webm|avi|mkv|flv|m3u8)$/i.test(String(value || ''));
}

function isImageFileName(value: unknown) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(String(value || ''));
}

function toMediaPath(value: unknown) {
  return String(value || '').trim().replace(/^\.\.\//, '');
}

function isVideo(item: UserPostItem) {
  if (String(item.contentType || '').toLowerCase() === 'video') return true;
  if (item.videoUrl || item.video || item.mediaUrl || item.file) return true;
  const firstImage = Array.isArray(item.image) ? item.image[0] : String(item.image || '').split('/')[0];
  return isVideoFileName(firstImage) || isVideoFileName(item.url);
}

function postCover(item: UserPostItem) {
  if (isVideo(item)) return undefined;
  const first = Array.isArray(item.image) ? item.image[0] : String(item.image || '').split('/')[0];
  if (!first || !item.account) return undefined;
  return resolveMediaUrl(`note-image/${item.account}/${first}`);
}

function postVideoCover(item: UserPostItem) {
  const raw = Array.isArray(item.image) ? item.image[0] : String(item.image || '').split('/')[0];
  const coverPath = toMediaPath(item.cover || raw);
  const account = String(item.account || '').trim();

  if (!coverPath) return undefined;
  if (/^https?:\/\//i.test(coverPath)) return coverPath;
  if (coverPath.startsWith('user-avatar/')) return undefined;
  if (isVideoFileName(coverPath)) return undefined;
  if (coverPath.includes('/')) return resolveMediaUrl(coverPath);
  if (account && isImageFileName(coverPath)) return resolveMediaUrl(`video-cover/${account}/${coverPath}`);
  return resolveMediaUrl(coverPath);
}

function postVideo(item: UserPostItem) {
  const first = Array.isArray(item.image) ? item.image[0] : String(item.image || '').split('/')[0];
  const file =
    item.videoUrl ||
    item.video ||
    item.mediaUrl ||
    item.file ||
    (isVideoFileName(first) ? first : '') ||
    (isVideoFileName(item.url) ? item.url : '');
  if (!file) return undefined;
  if (/^https?:\/\//i.test(String(file))) return String(file);
  const normalized = toMediaPath(file);
  if (normalized.includes('/')) return resolveMediaUrl(normalized);
  if (!item.account) return resolveMediaUrl(normalized);
  return resolveMediaUrl(`video/${item.account}/${normalized}`);
}

function itemContentType(item: UserPostItem): 'note' | 'video' {
  return isVideo(item) ? 'video' : 'note';
}

function itemFeedKey(item: UserPostItem) {
  return `${itemContentType(item)}-${item.id}`;
}

function postAuthorAvatar(item: UserPostItem, fallback?: string) {
  const raw = String(item.authorAvatar || item.avatar || fallback || item.url || '').trim();
  if (!raw || isVideoFileName(raw)) return undefined;
  return resolveMediaUrl(toMediaPath(raw));
}

type UserInfoResponse = {
  likes?: string;
  collects?: string;
};

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ account: string; name?: string; avatar?: string }>();
  const { user } = useAuth();
  const account = String(params.account || '');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPostItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const thumbPendingRef = useRef<Set<string>>(new Set());

  const isSelf = account && user?.account && account === user.account;

  const loadAll = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [info, noteList, status] = await Promise.all([
        fetchUserInfo(account),
        fetchUserPosts(account),
        isSelf || !user?.account ? Promise.resolve(false) : fetchFollowStatus(account),
      ]);
      const userInfoRes = user?.account
        ? await postJson<UserInfoResponse>('/user/getUserInfo', { account: user.account }).catch(() => ({ result: { likes: '' } as UserInfoResponse }))
        : { result: { likes: '' } as UserInfoResponse };

      setProfile(info ?? null);
      setPosts(noteList);
      setLikedIds(new Set(parseIdList(userInfoRes.result?.likes)));
      setFollowed(Boolean(status));
    } finally {
      setLoading(false);
    }
  }, [account, isSelf, user?.account]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let disposed = false;
    const targets = posts.filter((item) => {
      const id = String(item.id);
      return isVideo(item) && postVideo(item) && !postVideoCover(item) && !videoThumbs[id] && !thumbPendingRef.current.has(id);
    });
    if (!targets.length) return;

    targets.forEach((item) => {
      const id = String(item.id);
      const videoUri = postVideo(item);
      if (!videoUri) return;
      thumbPendingRef.current.add(id);
      VideoThumbnails.getThumbnailAsync(videoUri, { time: 100, quality: 0.7 })
        .then(({ uri }) => {
          if (disposed || !uri) return;
          setVideoThumbs((prev) => (prev[id] ? prev : { ...prev, [id]: uri }));
        })
        .catch(() => undefined)
        .finally(() => {
          thumbPendingRef.current.delete(id);
        });
    });

    return () => {
      disposed = true;
    };
  }, [posts, videoThumbs]);

  const displayName = useMemo(
    () => String(profile?.name || params.name || profile?.account || account || '用户'),
    [profile?.name, profile?.account, params.name, account]
  );
  const avatarUri = avatarOf(profile, String(params.avatar || ''));
  const attention = normalizeCount(profile?.attention);
  const fans = normalizeCount(profile?.fans);
  const likes = normalizeCount(profile?.likes) + normalizeCount(profile?.collects);

  async function onToggleFollow() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (isSelf || !account || followLoading) return;
    setFollowLoading(true);
    try {
      const action = followed ? 'unfollow' : 'follow';
      const res = await toggleFollow(account, action);
      setFollowed(Boolean(res.result?.followed));
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              fans: Number(res.result?.target?.fans ?? prev.fans ?? 0),
            }
          : prev
      );
    } finally {
      setFollowLoading(false);
    }
  }

  async function onSendMessage() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!account || account === user.account) {
      router.replace('/(tabs)/chat');
      return;
    }

    const target = {
      id: account,
      avatar: String(profile?.url || params.avatar || ''),
      title: displayName,
      read: 0,
      historyMessage: [],
    };
    const me = {
      id: user.account,
      avatar: String(user.url || ''),
      title: String(user.name || user.account),
      read: 0,
      historyMessage: [],
    };

    await createConversation({
      me: {
        message: JSON.stringify(target),
        UserToUser: `${user.account}-${account}`,
        account: user.account,
      },
      you: {
        message: JSON.stringify(me),
        UserToUser: `${account}-${user.account}`,
        account,
      },
    });

    router.push({
      pathname: '/chat/[id]',
      params: { id: account, title: displayName, url: String(profile?.url || params.avatar || '') },
    });
  }

  async function toggleLike(item: UserPostItem) {
    if (!user?.account) {
      router.push('/login');
      return;
    }

    const key = itemFeedKey(item);
    if (pendingIds.includes(key)) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !(likedIds.has(key) || likedIds.has(String(item.id)));
    const currentLikes = normalizeCount(item.likes);
    const nextLikes = Math.max(0, currentLikes + (nextLiked ? 1 : -1));
    const nextLikedIds = new Set(previousLikedIds);

    if (nextLiked) nextLikedIds.add(key);
    else {
      nextLikedIds.delete(key);
      nextLikedIds.delete(String(item.id));
    }

    setPendingIds((prev) => [...prev, key]);
    setLikedIds(nextLikedIds);
    setPosts((prev) => prev.map((row) => (String(row.id) === String(item.id) && itemContentType(row) === itemContentType(item) ? { ...row, likes: nextLikes } : row)));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextLikedIds).join(','),
        account: user.account,
        num: nextLikes,
        setId: item.id,
        contentType: itemContentType(item),
      });
    } catch {
      setLikedIds(previousLikedIds);
      setPosts((prev) => prev.map((row) => (String(row.id) === String(item.id) && itemContentType(row) === itemContentType(item) ? item : row)));
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== key));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: displayName }} />
      <ThemedView style={styles.root}>
        {loading ? (
          <View style={styles.loading}>
            <AppActivityIndicator label="正在加载主页" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            numColumns={2}
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.header}>
                <View style={styles.profileRow}>
                  <Image source={avatarSource(avatarUri)} style={styles.avatar} contentFit="cover" />
                  <View style={styles.profileInfo}>
                    <ThemedText style={styles.name}>{displayName}</ThemedText>
                    <ThemedText style={styles.meta}>小红书号：{profile?.account || account || '-'}</ThemedText>
                    <ThemedText style={styles.meta}>IP：{profile?.ip || profile?.region || '广东'}</ThemedText>
                  </View>
                </View>
                <View style={styles.stats}>
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statNum}>{attention}</ThemedText>
                    <ThemedText style={styles.statLabel}>关注</ThemedText>
                  </View>
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statNum}>{fans}</ThemedText>
                    <ThemedText style={styles.statLabel}>粉丝</ThemedText>
                  </View>
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statNum}>{likes}</ThemedText>
                    <ThemedText style={styles.statLabel}>获赞与收藏</ThemedText>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  {!isSelf ? (
                    <Pressable
                      style={[styles.actionBtn, followed ? styles.actionFollowed : styles.actionPrimary]}
                      disabled={followLoading}
                      onPress={() => void onToggleFollow()}>
                      <ThemedText style={followed ? styles.actionFollowedText : styles.actionPrimaryText}>
                        {followLoading ? '处理中' : followed ? '已关注' : '关注'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  <Pressable style={[styles.actionBtn, styles.actionMuted]} onPress={() => void onSendMessage()}>
                    <ThemedText style={styles.actionMutedText}>发私信</ThemedText>
                  </Pressable>
                </View>
              </View>
            }
            ListEmptyComponent={<View style={styles.empty}><ThemedText style={styles.meta}>还没有发布内容</ThemedText></View>}
            renderItem={({ item, index }) => {
              const tall = index % 3 !== 1;
              const video = isVideo(item);
              const imageUri = postCover(item);
              const videoUri = postVideo(item);
              const videoCoverUri = video ? (videoThumbs[String(item.id)] ?? postVideoCover(item)) : undefined;
              const likeCount = normalizeCount(item.likes);
              const feedKey = itemFeedKey(item);
              const liked = likedIds.has(feedKey) || likedIds.has(String(item.id));
              const pending = pendingIds.includes(feedKey);
              const displayImageUri = video ? videoCoverUri : imageUri;
              const authorName = String(item.authorName || item.name || displayName);
              const authorAvatar = postAuthorAvatar(item, avatarUri);
              const LikeIcon = liked ? LikedIcon : UnlikedIcon;

              return (
                <Pressable
                  style={styles.cardWrap}
                  onPress={() => {
                    if (video && videoUri) {
                      router.push({ pathname: '/(tabs)/video', params: { id: String(item.id) } });
                      return;
                    }
                    router.push({ pathname: '/note/[id]', params: { id: String(item.id) } });
                  }}>
                  <View style={styles.card}>
                    {displayImageUri ? (
                      <Image source={{ uri: displayImageUri }} style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort]} contentFit="cover" />
                    ) : (
                      <View style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort, styles.imageFallback]} />
                    )}
                    {video ? (
                      <View style={styles.videoBadge}>
                        <ThemedText style={styles.videoBadgeText}>▶</ThemedText>
                      </View>
                    ) : null}
                    <View style={styles.cardBody}>
                      <ThemedText numberOfLines={2} style={styles.cardTitle}>{item.title || '无标题'}</ThemedText>
                      {item.brief ? <ThemedText numberOfLines={2} style={styles.cardBrief}>{item.brief}</ThemedText> : null}
                      <View style={styles.cardInfo}>
                        <View style={styles.authorRow}>
                          <Image source={avatarSource(authorAvatar)} style={styles.authorAvatar} contentFit="cover" />
                          <ThemedText numberOfLines={1} style={styles.authorName}>{authorName}</ThemedText>
                        </View>
                        <Pressable
                          hitSlop={8}
                          disabled={pending}
                          style={styles.likeWrap}
                          onPress={(event) => {
                            event.stopPropagation();
                            void toggleLike(item);
                          }}>
                          <LikeIcon width={15} height={15} color={liked ? '#FF4D6D' : '#6C737F'} />
                          <ThemedText style={[styles.likes, liked && styles.likesActive, pending && styles.likesDisabled]}>{likeCount}</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 14 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EDF1F7' },
  avatarFallback: { backgroundColor: '#EDF1F7' },
  profileInfo: { flex: 1, gap: 5 },
  name: { fontSize: 24, fontWeight: '800' },
  meta: { fontSize: 13, color: '#7E8698' },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#7E8698' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: '#FF3158' },
  actionPrimaryText: { color: '#FFF', fontWeight: '600' },
  actionFollowed: { backgroundColor: '#F2F4F8' },
  actionFollowedText: { color: '#6A7285', fontWeight: '600' },
  actionMuted: { backgroundColor: '#F2F4F8' },
  actionMutedText: { color: '#3A4252', fontWeight: '600' },
  listContent: { paddingHorizontal: 6, paddingBottom: 24, paddingTop: 8, flexGrow: 1 },
  column: { gap: 8, marginBottom: 8 },
  cardWrap: { flex: 1, maxWidth: '50%', paddingHorizontal: 4 },
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EFEFEF',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardImage: { width: '100%' },
  cardImageTall: { aspectRatio: 3 / 4 },
  cardImageShort: { aspectRatio: 4 / 5 },
  imageFallback: { backgroundColor: '#EDEDED' },
  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(14,16,22,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeText: { color: '#FFF', fontSize: 12, marginLeft: 2, lineHeight: 14 },
  cardBody: { padding: 10, gap: 6 },
  cardTitle: { fontSize: 14, lineHeight: 20, color: '#1F2329', fontWeight: '600' },
  cardBrief: { fontSize: 12, lineHeight: 18, color: '#7B746D' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  authorAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#F0F0F0' },
  authorAvatarFallback: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E5E5E5' },
  authorName: { marginLeft: 6, fontSize: 11, color: '#7B746D', flexShrink: 1 },
  likeWrap: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F7F4F0', flexDirection: 'row', alignItems: 'center', gap: 3 },
  likes: { fontSize: 11, color: '#6C737F', fontWeight: '600' },
  likesActive: { color: '#FF4D6D' },
  likesDisabled: { opacity: 0.6 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
});
