import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { feedItems as fallbackFeedItems } from '@/data/mock-xhs';
import { hasContentRef, setContentRef } from '@/lib/content-refs';
import { postJson, postPublicJson } from '@/lib/post-json';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';
import ScanIcon from '@/public/icon/saoyisao.svg';
import SearchIcon from '@/public/icon/sousuo.svg';

type HomeNoteDto = {
  id: number | string;
  title?: string;
  brief?: string;
  image?: string;
  cover?: string;
  account?: string;
  likes?: number | string;
  name?: string;
  url?: string;
  avatar?: string;
  authorAvatar?: string;
  authorName?: string;
  videoUrl?: string;
  video?: string;
  mediaUrl?: string;
  file?: string;
  contentType?: string;
  feedKey?: string;
  hidden?: boolean | number | string;
};

type FallbackFeedDto = (typeof fallbackFeedItems)[number];

type HomeFeedItem = {
  id: string;
  rawId: string;
  contentType: 'note' | 'video';
  title: string;
  brief: string;
  imageUri?: string;
  videoUri?: string;
  likes: number;
  liked: boolean;
  authorName: string;
  authorAvatar?: string;
};

type UserInfoResponse = {
  likes?: string;
};

type FollowListItem = {
  account?: string;
};

type FollowListResponse = {
  data?: FollowListItem[];
};

type ProfileNoteResponse = {
  data?: HomeNoteDto[];
};

const GAP = 8;
const H_PADDING = 10;
const tabs = ['关注', '发现', '附近'] as const;
type HomeTab = (typeof tabs)[number];

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function toVideoUri(note: HomeNoteDto, firstImage: string) {
  const candidate =
    String(note.videoUrl || '').trim() ||
    String(note.video || '').trim() ||
    String(note.mediaUrl || '').trim() ||
    String(note.file || '').trim() ||
    (isVideoFileName(firstImage) ? firstImage : '');
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const normalized = toMediaPath(candidate);
  if (normalized.includes('/')) return resolveMediaUrl(normalized);
  if (!note.account) return resolveMediaUrl(normalized);
  return resolveMediaUrl(`video/${note.account}/${normalized}`);
}

function toVideoCoverUri(note: HomeNoteDto) {
  const raw = String(note.cover || note.image || '').trim();
  const normalized = toMediaPath(raw);
  const account = String(note.account || '').trim();
  const coverPath = normalized;

  if (!coverPath) return undefined;
  if (/^https?:\/\//i.test(coverPath)) return coverPath;
  if (coverPath.startsWith('user-avatar/')) return undefined;
  if (isVideoFileName(coverPath)) return undefined;
  if (coverPath.includes('/')) return resolveMediaUrl(coverPath);
  if (account && isImageFileName(coverPath)) return resolveMediaUrl(`video-cover/${account}/${coverPath}`);
  return resolveMediaUrl(coverPath);
}

function toAuthorAvatar(item: HomeNoteDto) {
  const avatar = String(item.authorAvatar || item.avatar || item.url || '').trim();
  if (!avatar || isVideoFileName(avatar)) return undefined;
  return resolveMediaUrl(toMediaPath(avatar));
}

function toHomeFeedItem(note: HomeNoteDto, likedIds: Set<string>): HomeFeedItem {
  const contentType = String(note.contentType || '').toLowerCase() === 'video' ? 'video' : 'note';
  const rawId = String(note.id);
  const itemId = String(note.feedKey || `${contentType}-${rawId}`);
  const firstImage = String(note.image ?? '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)[0];
  const videoUri = contentType === 'video' ? toVideoUri(note, firstImage) : undefined;
  const imageUri =
    contentType === 'video'
      ? toVideoCoverUri(note)
      : note.account && firstImage
        ? resolveMediaUrl(`note-image/${note.account}/${firstImage}`)
        : undefined;
  const liked = hasContentRef(likedIds, contentType, rawId);

  return {
    id: itemId,
    rawId,
    contentType,
    title: String(note.title || '分享一则日常片段'),
    brief: String(note.brief || ''),
    imageUri,
    videoUri,
    likes: Number(note.likes || 0),
    liked,
    authorName: String(note.authorName || note.name || note.account || '匿名用户'),
    authorAvatar: toAuthorAvatar(note),
  };
}

function toFallbackFeedItem(item: FallbackFeedDto, likedIds: Set<string>): HomeFeedItem {
  const itemId = `fallback-note-${item.id}`;

  return {
    id: itemId,
    rawId: item.id,
    contentType: 'note',
    title: item.title,
    brief: '没有数据展示的内容',
    imageUri: item.imageUri,
    likes: item.likes,
    liked: hasContentRef(likedIds, 'note', item.id),
    authorName: '演示用户',
  };
}

function buildFallbackFeed(likedIds: Set<string>) {
  return fallbackFeedItems.map((item) => toFallbackFeedItem(item, likedIds));
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<HomeFeedItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<HomeTab>('发现');
  const thumbPendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;
    const targets = items.filter((item) => item.contentType === 'video' && item.videoUri && !videoThumbs[item.id] && !thumbPendingRef.current.has(item.id));
    if (!targets.length) return;

    targets.forEach((item) => {
      thumbPendingRef.current.add(item.id);
      VideoThumbnails.getThumbnailAsync(item.videoUri!, { time: 100, quality: 0.7 })
        .then(({ uri }) => {
          if (disposed || !uri) return;
          setVideoThumbs((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: uri }));
        })
        .catch(() => undefined)
        .finally(() => {
          thumbPendingRef.current.delete(item.id);
        });
    });

    return () => {
      disposed = true;
    };
  }, [items, videoThumbs]);

  const loadHomeFeed = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const userInfoRes = user?.account
        ? await postJson<UserInfoResponse>('/user/getUserInfo', { account: user.account }).catch(() => ({ result: { likes: '' } as UserInfoResponse }))
        : { result: { likes: '' } as UserInfoResponse };
      const nextLikedIds = new Set(parseIdList(userInfoRes.result?.likes));

      let feedResult: HomeNoteDto[] = [];
      let emptyMessage = '暂时没有加载到内容，刷新试试';

      if (activeTab === '关注') {
        if (!user?.account) {
          setLikedIds(nextLikedIds);
          setItems([]);
          setError('登录后查看关注用户的作品');
          return;
        }

        const followRes = await postJson<FollowListResponse>('/user/followList', { type: 'follow' });
        const accounts = Array.from(
          new Set((followRes.result?.data || []).map((item) => String(item.account || '').trim()).filter(Boolean))
        );
        emptyMessage = accounts.length ? '关注的用户还没有发布作品' : '还没有关注任何用户';

        const postResults = await Promise.all(
          accounts.map((account) =>
            postJson<ProfileNoteResponse>('/user/myNote', { account }).catch(() => ({ result: { data: [] } as ProfileNoteResponse }))
          )
        );
        feedResult = postResults.flatMap((res) => (Array.isArray(res.result?.data) ? res.result.data : []));
      } else {
        const { result } = await postPublicJson<HomeNoteDto[]>('/index', { init: true, scope: activeTab === '附近' ? 'nearby' : 'discover' });
        feedResult = Array.isArray(result) ? result : [];
      }

      const serverItems = feedResult
        .filter((item) => !Number(item.hidden || 0))
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .map((item) => toHomeFeedItem(item, nextLikedIds));
      setLikedIds(nextLikedIds);
      setItems(serverItems.length ? serverItems : activeTab === '发现' ? buildFallbackFeed(nextLikedIds) : []);
      setError(serverItems.length || activeTab === '发现' ? null : emptyMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const nextLikedIds = new Set<string>();
      setLikedIds(nextLikedIds);
      setItems(activeTab === '发现' ? buildFallbackFeed(nextLikedIds) : []);
      setError(/登录已失效|请先登录|登录过期|重新登录/.test(message) ? null : message || null);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeTab, user?.account]);

  useEffect(() => {
    void loadHomeFeed();
  }, [loadHomeFeed]);

  async function toggleLike(itemId: string) {
    if (!user?.account) {
      router.push('/login');
      return;
    }

    if (pendingIds.includes(itemId)) return;

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !currentItem.liked;
    const nextLikes = Math.max(0, currentItem.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = setContentRef(previousLikedIds, currentItem.contentType, currentItem.rawId, nextLiked);

    setPendingIds((prev) => [...prev, itemId]);
    setLikedIds(nextLikedIds);
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, liked: nextLiked, likes: nextLikes } : item)));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextLikedIds).join(','),
        account: user.account,
        num: nextLikes,
        setId: currentItem.rawId,
        contentType: currentItem.contentType,
      });
    } catch (err) {
      setLikedIds(previousLikedIds);
      setItems((prev) => prev.map((item) => (item.id === itemId ? currentItem : item)));
      setError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== itemId));
    }
  }

  const listEmpty = loading ? (
    <View style={styles.stateBlock}>
      <AppActivityIndicator label="正在加载" />
    </View>
  ) : (
    <View style={styles.stateBlock}>
      <ThemedText style={styles.stateText}>{error ?? '暂时没有加载到内容，刷新试试'}</ThemedText>
      <Pressable style={styles.retryBtn} onPress={() => void loadHomeFeed(true)}>
        <ThemedText style={styles.retryText}>重新加载</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <View style={styles.topBar}>
          <Pressable style={styles.searchBtn} onPress={() => router.push('/search')}>
            <ScanIcon width={24} height={24} color="#2C2C2C" />
          </Pressable>
          <View style={styles.tabsNav}>
            {tabs.map((tab) => {
              const active = tab === activeTab;
              return (
                <Pressable key={tab} style={styles.tabItem} onPress={() => setActiveTab(tab)}>
                  <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{tab}</ThemedText>
                  <View style={[styles.tabLine, active && styles.tabLineActive]} />
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.searchBtn} onPress={() => router.push('/search')}>
            <SearchIcon width={24} height={24} color="#2C2C2C" />
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
          ListEmptyComponent={listEmpty}
          renderItem={({ item, index }) => {
            const tall = index % 3 !== 1;
            const pending = pendingIds.includes(item.id);
            const displayImageUri = item.contentType === 'video' ? (videoThumbs[item.id] ?? item.imageUri) : item.imageUri;
            const LikeIcon = item.liked ? LikedIcon : UnlikedIcon;

            return (
              <Pressable
                style={styles.cardWrap}
                onPress={() => {
                  if (item.contentType === 'video') {
                    router.push({ pathname: '/(tabs)/video', params: { id: item.rawId } });
                    return;
                  }
                  router.push({ pathname: '/note/[id]', params: { id: item.rawId } });
                }}>
                <ThemedView style={styles.card}>
                  {displayImageUri ? (
                    <Image source={{ uri: displayImageUri }} style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort]} contentFit="cover" />
                  ) : (
                    <View style={[styles.cardImage, tall ? styles.cardImageTall : styles.cardImageShort, styles.imageFallback]} />
                  )}
                  {item.contentType === 'video' ? (
                    <View style={styles.videoBadge}>
                      <ThemedText style={styles.videoBadgeText}>▶</ThemedText>
                    </View>
                  ) : null}
                  <View style={styles.cardBody}>
                    <ThemedText numberOfLines={2} style={styles.cardTitle}>{item.title}</ThemedText>
                    {item.brief ? <ThemedText numberOfLines={2} style={styles.cardBrief}>{item.brief}</ThemedText> : null}
                    <View style={styles.cardInfo}>
                      <View style={styles.authorRow}>
                        <Image source={avatarSource(item.authorAvatar)} style={styles.authorAvatar} contentFit="cover" />
                        <ThemedText numberOfLines={1} style={styles.authorName}>{item.authorName}</ThemedText>
                      </View>
                      <Pressable
                        hitSlop={8}
                        disabled={pending}
                        style={styles.likeWrap}
                        onPress={(event) => {
                          event.stopPropagation();
                          void toggleLike(item.id);
                        }}>
                        <LikeIcon width={15} height={15} color={item.liked ? '#FF4D6D' : '#6C737F'} />
                        <ThemedText style={[styles.likes, item.liked && styles.likesActive, pending && styles.likesDisabled]}>{item.likes}</ThemedText>
                      </Pressable>
                    </View>
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
    paddingHorizontal: H_PADDING,
  },
  searchBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: { height: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabText: { fontSize: 17, color: '#9D9D9D', fontWeight: '500' },
  tabTextActive: { color: '#111111', fontWeight: '700' },
  tabLine: { width: 24, height: 2, borderRadius: 999, backgroundColor: 'transparent' },
  tabLineActive: { backgroundColor: '#111111' },
  listContent: { paddingHorizontal: H_PADDING - GAP / 2, paddingBottom: 24, paddingTop: GAP, flexGrow: 1 },
  columnWrap: { gap: GAP, marginBottom: GAP },
  cardWrap: { flex: 1, maxWidth: '50%', paddingHorizontal: GAP / 2 },
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
  imageFallback: { backgroundColor: '#EDEDED' },
  cardImageTall: { aspectRatio: 3 / 4 },
  cardImageShort: { aspectRatio: 4 / 5 },
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
  stateBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12, minHeight: 240 },
  stateText: { fontSize: 14, textAlign: 'center', color: '#8E8E93' },
  retryBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, borderColor: '#E5E5E5' },
  retryText: { fontSize: 14, fontWeight: '600' },
});
