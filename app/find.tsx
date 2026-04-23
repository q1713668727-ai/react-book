import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { createConversation, fetchAllUser, type FollowListItem } from '@/lib/redbook-api';
import { postJson, postPublicJson } from '@/lib/post-json';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';

type SearchType = 'user' | 'product' | 'image' | 'video';

const searchTypes: { key: SearchType; label: string; empty: string }[] = [
  { key: 'user', label: '用户', empty: '没有匹配用户' },
  { key: 'product', label: '商品', empty: '暂无匹配商品' },
  { key: 'image', label: '图片', empty: '暂无匹配图片' },
  { key: 'video', label: '视频', empty: '暂无匹配视频' },
];

type SearchContentDto = {
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
};

type SearchFeedItem = {
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

const GAP = 8;

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

function toVideoUri(item: SearchContentDto, firstImage: string) {
  const candidate =
    String(item.videoUrl || '').trim() ||
    String(item.video || '').trim() ||
    String(item.mediaUrl || '').trim() ||
    String(item.file || '').trim() ||
    (isVideoFileName(firstImage) ? firstImage : '');
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const normalized = toMediaPath(candidate);
  if (normalized.includes('/')) return resolveMediaUrl(normalized);
  if (!item.account) return resolveMediaUrl(normalized);
  return resolveMediaUrl(`video/${item.account}/${normalized}`);
}

function toVideoCoverUri(item: SearchContentDto) {
  const coverPath = toMediaPath(item.cover || item.image);
  const account = String(item.account || '').trim();
  if (!coverPath) return undefined;
  if (/^https?:\/\//i.test(coverPath)) return coverPath;
  if (coverPath.startsWith('user-avatar/')) return undefined;
  if (isVideoFileName(coverPath)) return undefined;
  if (coverPath.includes('/')) return resolveMediaUrl(coverPath);
  if (account && isImageFileName(coverPath)) return resolveMediaUrl(`video-cover/${account}/${coverPath}`);
  return resolveMediaUrl(coverPath);
}

function toAuthorAvatar(item: SearchContentDto) {
  const avatar = String(item.authorAvatar || item.avatar || item.url || '').trim();
  if (!avatar || isVideoFileName(avatar)) return undefined;
  return resolveMediaUrl(toMediaPath(avatar));
}

function toSearchFeedItem(item: SearchContentDto, likedIds: Set<string>): SearchFeedItem {
  const contentType = String(item.contentType || '').toLowerCase() === 'video' ? 'video' : 'note';
  const rawId = String(item.id);
  const itemId = String(item.feedKey || `${contentType}-${rawId}`);
  const firstImage = String(item.image ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const imageUri =
    contentType === 'video'
      ? toVideoCoverUri(item)
      : item.account && firstImage
        ? resolveMediaUrl(`note-image/${item.account}/${firstImage}`)
        : undefined;

  return {
    id: itemId,
    rawId,
    contentType,
    title: String(item.title || '分享一则日常片段'),
    brief: String(item.brief || ''),
    imageUri,
    videoUri: contentType === 'video' ? toVideoUri(item, firstImage) : undefined,
    likes: Number(item.likes || 0),
    liked: likedIds.has(itemId) || likedIds.has(rawId),
    authorName: String(item.authorName || item.name || item.account || '匿名用户'),
    authorAvatar: toAuthorAvatar(item),
  };
}

function toAvatar(url?: string) {
  return resolveMediaUrl(String(url || '').replace(/^\.\.\//, ''));
}

function normalizeSearchType(value: unknown): SearchType {
  const text = String(Array.isArray(value) ? value[0] : value || '').trim();
  return text === 'product' || text === 'image' || text === 'video' ? text : 'user';
}

export default function FindScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ keyword?: string; type?: string }>();
  const { user } = useAuth();
  const [keyword, setKeyword] = useState(() => String(params.keyword || ''));
  const [list, setList] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [activeType, setActiveType] = useState<SearchType>(() => normalizeSearchType(params.type));
  const [total, setTotal] = useState(0);
  const [feedItems, setFeedItems] = useState<SearchFeedItem[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingFeedIds, setPendingFeedIds] = useState<string[]>([]);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string[]>([]);
  const thumbPendingRef = useRef<Set<string>>(new Set());
  const routeSearchRef = useRef('');

  const hasMore = useMemo(() => list.length < total, [list.length, total]);
  const hasMoreFeed = useMemo(() => feedItems.length < feedTotal, [feedItems.length, feedTotal]);
  const activeSearchType = searchTypes.find((item) => item.key === activeType) ?? searchTypes[0];

  useEffect(() => {
    let disposed = false;
    const targets = feedItems.filter((item) => item.contentType === 'video' && item.videoUri && !videoThumbs[item.id] && !thumbPendingRef.current.has(item.id));
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
  }, [feedItems, videoThumbs]);

  const loadUsers = useCallback(async (params: { key: string; limit: number; offset: number; reset: boolean; manual: boolean }) => {
    const { key, limit, offset, reset, manual } = params;
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetchAllUser({
        account: [],
        keyword: key,
        limit,
        offset,
      });
      const next = Array.isArray(res.result) ? res.result : [];
      setList((prev) => (reset ? next : [...prev, ...next]));
      setTotal(Number(res.total || next.length));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : manual ? '搜索失败' : '搜索失败，请检查手机是否能访问后端服务');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContent = useCallback(async (params: { key: string; type: Extract<SearchType, 'image' | 'video'>; limit: number; offset: number; reset: boolean }) => {
    const { key, type, limit, offset, reset } = params;
    if (!key) return;
    setLoading(true);
    try {
      const [contentRes, userInfoRes] = await Promise.all([
        postPublicJson<SearchContentDto[]>('/searchContent', {
          keyword: key,
          type: type === 'video' ? 'video' : 'note',
          limit,
          offset,
        }) as Promise<{ status: number; message?: string; result?: SearchContentDto[]; total?: number }>,
        user?.account
          ? postJson<UserInfoResponse>('/user/getUserInfo', { account: user.account }).catch(() => ({ result: { likes: '' } as UserInfoResponse }))
          : Promise.resolve({ result: { likes: '' } as UserInfoResponse }),
      ]);
      const nextLikedIds = new Set(parseIdList(userInfoRes.result?.likes));
      const nextItems = Array.isArray(contentRes.result) ? contentRes.result.map((item) => toSearchFeedItem(item, nextLikedIds)) : [];
      setLikedIds(nextLikedIds);
      setFeedItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setFeedTotal(Number(contentRes.total || nextItems.length));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [user?.account]);

  const executeSearch = useCallback((key: string, type: SearchType, limit = 10) => {
    const text = key.trim();
    if (!text) return;
    setHasSearched(true);
    setSubmittedKeyword(text);
    if (type === 'user') {
      setFeedItems([]);
      setFeedTotal(0);
      void loadUsers({ key: text, limit, offset: 0, reset: true, manual: true });
    } else if (type === 'image' || type === 'video') {
      setList([]);
      setTotal(0);
      void loadContent({ key: text, type, limit, offset: 0, reset: true });
    } else {
      setList([]);
      setTotal(0);
      setFeedItems([]);
      setFeedTotal(0);
    }
  }, [loadContent, loadUsers]);

  useEffect(() => {
    const nextKeyword = String(params.keyword || '').trim();
    const nextType = normalizeSearchType(params.type);
    const routeKey = `${nextType}:${nextKeyword}`;
    if (!nextKeyword || routeSearchRef.current === routeKey) return;
    routeSearchRef.current = routeKey;
    setKeyword(nextKeyword);
    setActiveType(nextType);
    executeSearch(nextKeyword, nextType);
  }, [executeSearch, params.keyword, params.type]);

  async function followUser(item: FollowListItem) {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    const targetAccount = String(item.account || '');
    if (!targetAccount || targetAccount === user.account || submitting.includes(targetAccount)) return;

    setSubmitting((prev) => [...prev, targetAccount]);
    try {
      const target = {
        id: targetAccount,
        avatar: String(item.url || ''),
        title: String(item.name || targetAccount),
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
          UserToUser: `${user.account}-${targetAccount}`,
          account: user.account,
        },
        you: {
          message: JSON.stringify(me),
          UserToUser: `${targetAccount}-${user.account}`,
          account: targetAccount,
        },
      });

      setList((prev) => prev.filter((row) => String(row.account || '') !== targetAccount));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : '关注失败');
    } finally {
      setSubmitting((prev) => prev.filter((id) => id !== targetAccount));
    }
  }

  async function toggleFeedLike(itemId: string) {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (pendingFeedIds.includes(itemId)) return;

    const currentItem = feedItems.find((item) => item.id === itemId);
    if (!currentItem) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !currentItem.liked;
    const nextLikes = Math.max(0, currentItem.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = new Set(previousLikedIds);

    if (nextLiked) nextLikedIds.add(itemId);
    else nextLikedIds.delete(itemId);

    setPendingFeedIds((prev) => [...prev, itemId]);
    setLikedIds(nextLikedIds);
    setFeedItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, liked: nextLiked, likes: nextLikes } : item)));

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
      setFeedItems((prev) => prev.map((item) => (item.id === itemId ? currentItem : item)));
      setError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setPendingFeedIds((prev) => prev.filter((id) => id !== itemId));
    }
  }

  function submitSearch(limit = 10) {
    const key = keyword.trim();
    if (!key) return;
    executeSearch(key, activeType, limit);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchRow}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <BackIcon width={23} height={23} color="#333" />
          </Pressable>
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => submitSearch()}
          />
          <Pressable
            style={styles.searchBtn}
            onPress={() => submitSearch()}>
            <ThemedText style={styles.searchBtnText}>搜索</ThemedText>
          </Pressable>
        </View>

        <View style={styles.searchTypeBar}>
          {searchTypes.map((item) => {
            const active = item.key === activeType;
            return (
              <Pressable
                key={item.key}
                style={styles.searchTypeBtn}
                onPress={() => {
                  if (item.key === activeType) return;
                  setActiveType(item.key);
                  setError(null);
                  setHasSearched(false);
                  setList([]);
                  setTotal(0);
                  setFeedItems([]);
                  setFeedTotal(0);
                }}>
                <ThemedText style={[styles.searchTypeText, active && styles.searchTypeTextActive]}>{item.label}</ThemedText>
                {active ? <View style={styles.searchTypeLine} /> : null}
              </Pressable>
            );
          })}
        </View>

        {!keyword.trim() ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.muted}>请输入关键字搜索{activeSearchType.label}</ThemedText>
          </View>
        ) : !hasSearched ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.muted}>点击搜索查看{activeSearchType.label}结果</ThemedText>
          </View>
        ) : activeType === 'product' ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.muted}>{activeSearchType.empty}</ThemedText>
          </View>
        ) : activeType === 'image' || activeType === 'video' ? (
          <FlatList
            key={`feed-${activeType}`}
            data={feedItems}
            keyExtractor={(item, index) => `${activeType}-${item.id}-${index}`}
            numColumns={2}
            columnWrapperStyle={styles.columnWrap}
            contentContainerStyle={styles.feedList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {loading ? <AppActivityIndicator label="正在搜索" /> : <ThemedText style={styles.muted}>{error || activeSearchType.empty}</ThemedText>}
              </View>
            }
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (!hasSearched || !hasMoreFeed || loading) return;
              const key = submittedKeyword.trim();
              if (!key) return;
              void loadContent({ key, type: activeType, limit: 10, offset: feedItems.length, reset: false });
            }}
            renderItem={({ item, index }) => {
              const tall = index % 3 !== 1;
              const pending = pendingFeedIds.includes(item.id);
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
                          {item.authorAvatar ? (
                            <Image source={{ uri: item.authorAvatar }} style={styles.authorAvatar} contentFit="cover" />
                          ) : (
                            <View style={styles.authorAvatarFallback} />
                          )}
                          <ThemedText numberOfLines={1} style={styles.authorName}>{item.authorName}</ThemedText>
                        </View>
                        <Pressable
                          hitSlop={8}
                          disabled={pending}
                          style={styles.likeWrap}
                          onPress={(event) => {
                            event.stopPropagation();
                            void toggleFeedLike(item.id);
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
        ) : (
          <FlatList
            key="users"
            data={list}
            keyExtractor={(item, index) => `${item.account}-${index}`}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {loading ? <AppActivityIndicator label="正在搜索" /> : <ThemedText style={styles.muted}>{error || activeSearchType.empty}</ThemedText>}
              </View>
            }
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (!hasSearched || !hasMore || loading) return;
              const key = submittedKeyword.trim();
              if (!key) return;
              void loadUsers({ key, limit: 10, offset: list.length, reset: false, manual: false });
            }}
            renderItem={({ item }) => {
              const targetAccount = String(item.account || '');
              const pending = submitting.includes(targetAccount);
              const isSelf = Boolean(user?.account && targetAccount === user.account);
              return (
                <View style={styles.row}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() =>
                      router.push({
                        pathname: '/user/[account]',
                        params: { account: targetAccount, name: String(item.name || ''), avatar: String(item.url || '') },
                      })
                    }>
                    {toAvatar(item.url) ? (
                      <Image source={{ uri: toAvatar(item.url) }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]} />
                    )}
                    <View style={styles.info}>
                      <ThemedText numberOfLines={1} style={styles.name}>
                        {item.name || '用户'}
                      </ThemedText>
                      <ThemedText numberOfLines={1} style={styles.meta}>
                        粉丝 {Number(item.fans || 0)}
                      </ThemedText>
                      <ThemedText numberOfLines={1} style={styles.meta}>
                        小红书号：{targetAccount || '-'}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[styles.followBtn, (pending || isSelf) && styles.followBtnDisabled]}
                    disabled={pending || isSelf}
                    onPress={() => void followUser(item)}>
                    <ThemedText style={styles.followText}>{isSelf ? '自己' : pending ? '处理中' : '关注'}</ThemedText>
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, paddingHorizontal: 12, paddingTop: 6, backgroundColor: '#FFF' },
  searchRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 0,
    backgroundColor: '#FFF',
    paddingHorizontal: 4,
    fontSize: 15,
    color: '#22252B',
  },
  searchBtn: { height: 40, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontSize: 15, fontWeight: '600' },
  searchTypeBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEE',
  },
  searchTypeBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  searchTypeText: {
    fontSize: 15,
    color: '#6F7480',
    fontWeight: '600',
    includeFontPadding: false,
  },
  searchTypeTextActive: {
    color: '#22252B',
    fontWeight: '800',
  },
  searchTypeLine: {
    position: 'absolute',
    left: '28%',
    right: '28%',
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#22252B',
  },
  list: { paddingTop: 8, paddingBottom: 18 },
  feedList: { paddingTop: GAP, paddingBottom: 24, flexGrow: 1 },
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
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  muted: { color: '#8E8E93' },
  row: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 12,
    backgroundColor: '#FFF',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ECECEE' },
  avatarFallback: { backgroundColor: '#ECECEE' },
  info: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontSize: 16, color: '#2D3138', fontWeight: '700', includeFontPadding: false },
  meta: { fontSize: 12, lineHeight: 16, color: '#8D929B', includeFontPadding: false },
  followBtn: {
    minWidth: 62,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8B5C1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
  },
  followBtnDisabled: { opacity: 0.6 },
  followText: { color: '#D85C75', fontSize: 13, fontWeight: '700', includeFontPadding: false },
});
