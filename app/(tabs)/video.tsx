import { Image } from 'expo-image';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { postJson, postPublicJson } from '@/lib/post-json';
import CommentIcon from '@/public/icon/pinglun.svg';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CollectedIcon from '@/public/icon/shoucang.svg';
import ShareIcon from '@/public/icon/fenxiang.svg';
import SearchIcon from '@/public/icon/sousuo.svg';
import UncollectedIcon from '@/public/icon/shoucang_1.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';

type VideoDto = {
  id: number | string;
  account?: string;
  title?: string;
  brief?: string;
  name?: string;
  avatar?: string;
  image?: string;
  cover?: string;
  url?: string;
  videoUrl?: string;
  video?: string;
  mediaUrl?: string;
  file?: string;
  likes?: number | string;
  collects?: number | string;
  collect?: number | string;
  comment?: unknown;
};

type FollowStatus = {
  followed?: boolean;
};

type CommentItem = {
  id: string;
  account: string;
  name: string;
  text: string;
  avatar?: string;
  date?: string;
  likeCount?: number;
};

type VideoFeedItem = {
  id: string;
  account: string;
  title: string;
  brief: string;
  authorName: string;
  authorAvatar?: string;
  coverUri?: string;
  videoUri?: string;
  likes: number;
  collects: number;
  commentList: CommentItem[];
};

type UserInfoResult = {
  likes?: string;
  collects?: string;
};

type PlaybackProgress = {
  positionMillis: number;
  durationMillis: number;
};

function parseCount(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseIdList(value: unknown): Set<string> {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parseCommentList(raw: unknown): CommentItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => ({
      id: String(item?.id ?? idx),
      account: String(item?.account || ''),
      name: String(item?.name || item?.account || '用户'),
      text: String(item?.text || ''),
      avatar: typeof item?.avatar === 'string' ? item.avatar : '',
      date: typeof item?.date === 'string' ? item.date : '',
      likeCount: parseCount(item?.likeCount),
    }));
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return parseCommentList(parsed);
    } catch {
      return text
        .split(';/')
        .filter(Boolean)
        .map((item, idx): CommentItem | null => {
          try {
            const row = JSON.parse(item);
            return {
              id: String(row?.id ?? idx),
              account: String(row?.account || ''),
              name: String(row?.name || row?.account || '用户'),
              text: String(row?.text || ''),
              avatar: typeof row?.avatar === 'string' ? row.avatar : '',
              date: typeof row?.date === 'string' ? row.date : '',
              likeCount: parseCount(row?.likeCount),
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is CommentItem => Boolean(item));
    }
  }

  return [];
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

function toVideoUri(item: VideoDto) {
  const candidate =
    String(item.videoUrl || '').trim() ||
    String(item.video || '').trim() ||
    String(item.mediaUrl || '').trim() ||
    String(item.file || '').trim() ||
    String(item.url || '').trim();
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const normalized = toMediaPath(candidate);
  if (normalized.includes('/')) return resolveMediaUrl(normalized);
  if (!item.account) return resolveMediaUrl(normalized);
  return resolveMediaUrl(`video/${item.account}/${normalized}`);
}

function toVideoCoverUri(item: VideoDto) {
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

function mapVideo(item: VideoDto): VideoFeedItem {
  const account = String(item.account || '');
  return {
    id: String(item.id),
    account,
    title: String(item.title || '视频内容'),
    brief: String(item.brief || ''),
    authorName: String(item.name || account || '用户'),
    authorAvatar: resolveMediaUrl(toMediaPath(item.avatar)),
    coverUri: toVideoCoverUri(item),
    videoUri: toVideoUri(item),
    likes: parseCount(item.likes),
    collects: parseCount(item.collects ?? item.collect),
    commentList: parseCommentList(item.comment),
  };
}

export default function VideoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const pageHeight = windowHeight;
  const [items, setItems] = useState<VideoFeedItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [collectIds, setCollectIds] = useState<Set<string>>(new Set());
  const [followedMap, setFollowedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [pendingLike, setPendingLike] = useState(false);
  const [pendingCollect, setPendingCollect] = useState(false);
  const [pendingFollow, setPendingFollow] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentPending, setCommentPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set());
  const [playbackMap, setPlaybackMap] = useState<Record<string, PlaybackProgress>>({});

  const videoRefs = useRef<Record<string, Video | null>>({});
  const listRef = useRef<FlatList<VideoFeedItem> | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const pausedIdsRef = useRef<Set<string>>(new Set());
  const targetId = Array.isArray(params.id) ? params.id[0] : params.id;

  const pauseAllVideos = useCallback(() => {
    Object.values(videoRefs.current).forEach((ref) => {
      void ref?.pauseAsync().catch(() => undefined);
    });
  }, []);

  const pauseInactiveVideos = useCallback((activeId: string) => {
    Object.entries(videoRefs.current).forEach(([id, ref]) => {
      if (!ref || id === activeId) return;
      void ref.pauseAsync().catch(() => undefined);
    });
  }, []);

  const current = items[activeIndex];
  const currentLiked = current ? likedIds.has(`video-${current.id}`) || likedIds.has(current.id) : false;
  const currentCollected = current ? collectIds.has(`video-${current.id}`) : false;
  const currentFollowed = current ? Boolean(followedMap[current.account]) : false;

  const currentComments = useMemo(() => {
    return Array.isArray(current?.commentList) ? current.commentList : [];
  }, [current?.commentList]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const videoRes = await postPublicJson<VideoDto[]>('/video', targetId ? { targetId } : {});
      const userRes = user?.account
        ? await postJson<UserInfoResult>('/user/getUserInfo', { account: user.account }).catch(() => ({ result: { likes: '', collects: '' } as UserInfoResult }))
        : { result: { likes: '', collects: '' } as UserInfoResult };

      const nextItems = Array.isArray(videoRes.result) ? videoRes.result.map(mapVideo) : [];
      const targetIndex = targetId ? Math.max(0, nextItems.findIndex((item) => item.id === String(targetId))) : 0;
      setItems(nextItems);
      setActiveIndex(targetIndex);
      setLikedIds(parseIdList(userRes.result?.likes));
      setCollectIds(parseIdList(userRes.result?.collects));

      if (nextItems.length && user?.account) {
        const first = nextItems[targetIndex] ?? nextItems[0];
        if (first.account && first.account !== user.account) {
          const statusRes = await postJson<FollowStatus>('/user/followStatus', { targetAccount: first.account });
          setFollowedMap((prev) => ({ ...prev, [first.account]: Boolean(statusRes.result?.followed) }));
        }
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(/登录已失效|请先登录|登录过期|重新登录/.test(message) ? null : message || '加载视频失败');
    } finally {
      setLoading(false);
    }
  }, [targetId, user?.account]);

  useEffect(() => {
    pausedIdsRef.current = pausedIds;
  }, [pausedIds]);

  useEffect(() => {
    if (!commentVisible) return;
    const keyboardSub = Keyboard.addListener('keyboardDidHide', () => {
      setCommentVisible(false);
    });

    return () => keyboardSub.remove();
  }, [commentVisible]);

  useEffect(() => {
    if (!items.length || activeIndex < 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: activeIndex, animated: false });
      const activeId = items[activeIndex]?.id || '';
      if (activeId) pauseInactiveVideos(activeId);
      const currentRef = videoRefs.current[items[activeIndex]?.id || ''];
      if (items[activeIndex] && !pausedIds.has(items[activeIndex].id)) {
        void currentRef?.playAsync().catch(() => undefined);
      }
    });
  }, [items, activeIndex, pausedIds, pauseInactiveVideos]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      return () => {
        pauseAllVideos();
      };
    }, [loadData, pauseAllVideos])
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (!first?.index && first?.index !== 0) return;
      const index = first.index;
      setActiveIndex(index);

      const activeId = items[index]?.id;
      if (activeId) pauseInactiveVideos(activeId);

      items.forEach((item, idx) => {
        const ref = videoRefs.current[item.id];
        if (!ref) return;
        if (idx === index) {
          if (!pausedIdsRef.current.has(item.id)) void ref.playAsync().catch(() => undefined);
        } else {
          void ref.pauseAsync().catch(() => undefined);
        }
      });

      const target = items[index];
      if (!target || !user?.account || !target.account || target.account === user.account) return;
      if (followedMap[target.account] !== undefined) return;

      void postJson<FollowStatus>('/user/followStatus', { targetAccount: target.account })
        .then((res) => {
          setFollowedMap((prev) => ({ ...prev, [target.account]: Boolean(res.result?.followed) }));
        })
        .catch(() => undefined);
    }
  ).current;

  function togglePlayback(item: VideoFeedItem) {
    const ref = videoRefs.current[item.id];
    const nextPaused = !pausedIds.has(item.id);
    setPausedIds((prev) => {
      const next = new Set(prev);
      if (nextPaused) next.add(item.id);
      else next.delete(item.id);
      return next;
    });

    if (nextPaused) void ref?.pauseAsync().catch(() => undefined);
    else void ref?.playAsync().catch(() => undefined);
  }

  function updatePlaybackStatus(id: string, status: AVPlaybackStatus) {
    if (!status.isLoaded) return;

    const durationMillis = status.durationMillis || 0;
    const positionMillis = status.positionMillis || 0;
    setPlaybackMap((prev) => {
      const current = prev[id];
      if (current?.durationMillis === durationMillis && Math.abs(current.positionMillis - positionMillis) < 250) {
        return prev;
      }
      return {
        ...prev,
        [id]: {
          durationMillis,
          positionMillis,
        },
      };
    });
  }

  async function toggleLike() {
    if (!current || pendingLike) return;
    if (!user?.account) {
      router.push('/login');
      return;
    }

    const key = `video-${current.id}`;
    const prevLiked = currentLiked;
    const nextLiked = !prevLiked;
    const nextLikes = Math.max(0, current.likes + (nextLiked ? 1 : -1));

    const prevSet = new Set(likedIds);
    const nextSet = new Set(likedIds);
    if (nextLiked) nextSet.add(key);
    else {
      nextSet.delete(key);
      nextSet.delete(current.id);
    }

    setPendingLike(true);
    setLikedIds(nextSet);
    setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, likes: nextLikes } : item)));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextSet).join(','),
        account: user.account,
        num: nextLikes,
        setId: current.id,
        contentType: 'video',
      });
    } catch (err) {
      setLikedIds(prevSet);
      setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, likes: current.likes } : item)));
      setError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setPendingLike(false);
    }
  }

  async function toggleCollect() {
    if (!current || pendingCollect) return;
    if (!user?.account) {
      router.push('/login');
      return;
    }

    const key = `video-${current.id}`;
    const prevCollected = currentCollected;
    const nextCollected = !prevCollected;
    const nextCollects = Math.max(0, current.collects + (nextCollected ? 1 : -1));

    const prevSet = new Set(collectIds);
    const nextSet = new Set(collectIds);
    if (nextCollected) nextSet.add(key);
    else {
      nextSet.delete(key);
      nextSet.delete(current.id);
    }

    setPendingCollect(true);
    setCollectIds(nextSet);
    setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, collects: nextCollects } : item)));

    try {
      await postJson('/user/addCollectNote', {
        collectsArr: Array.from(nextSet).join(','),
        account: user.account,
        num: nextCollects,
        setId: current.id,
        contentType: 'video',
      });
    } catch (err) {
      setCollectIds(prevSet);
      setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, collects: current.collects } : item)));
      setError(err instanceof Error ? err.message : '收藏失败');
    } finally {
      setPendingCollect(false);
    }
  }

  async function toggleFollow() {
    if (!current || pendingFollow || !current.account) return;
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (current.account === user.account) return;

    const prevFollowed = currentFollowed;
    setPendingFollow(true);
    setFollowedMap((prev) => ({ ...prev, [current.account]: !prevFollowed }));

    try {
      const action = prevFollowed ? 'unfollow' : 'follow';
      const res = await postJson<{ followed?: boolean }>('/user/toggleFollow', {
        targetAccount: current.account,
        action,
      });
      setFollowedMap((prev) => ({ ...prev, [current.account]: Boolean(res.result?.followed) }));
    } catch (err) {
      setFollowedMap((prev) => ({ ...prev, [current.account]: prevFollowed }));
      setError(err instanceof Error ? err.message : '关注失败');
    } finally {
      setPendingFollow(false);
    }
  }

  async function sendComment() {
    if (!current || !user?.account) {
      router.push('/login');
      return;
    }

    const text = commentText.trim();
    if (!text || commentPending) return;

    setCommentPending(true);
    try {
      const res = await postJson<CommentItem>('/upload/addComment', {
        id: current.id,
        account: user.account,
        name: user.name || user.account,
        text,
        avatar: user.url || '',
        likeCount: 0,
        location: '',
        date: new Date().toISOString().slice(0, 19).replace('T', ' '),
        contentType: 'video',
        action: 'add',
      });

      const nextComment: CommentItem = res.result
        ? {
            id: String(res.result.id || Date.now()),
            account: String(res.result.account || user.account),
            name: String(res.result.name || user.name || user.account),
            text: String(res.result.text || text),
            avatar: String(res.result.avatar || user.url || ''),
            date: String(res.result.date || ''),
            likeCount: parseCount(res.result.likeCount),
          }
        : {
            id: String(Date.now()),
            account: user.account,
            name: String(user.name || user.account),
            text,
            avatar: String(user.url || ''),
            date: new Date().toISOString().slice(0, 19).replace('T', ' '),
            likeCount: 0,
          };

      setItems((prev) =>
        prev.map((item, idx) =>
          idx === activeIndex
            ? {
                ...item,
                commentList: [...item.commentList, nextComment],
              }
            : item
        )
      );
      setCommentText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '评论失败');
    } finally {
      setCommentPending(false);
    }
  }

  function openCommentPanel() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    setCommentVisible(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ThemedView style={styles.root}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !items.length ? (
          <View style={styles.center}>
            <ThemedText style={styles.muted}>{error || '暂无视频'}</ThemedText>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            removeClippedSubviews
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 75 }}
            getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 80);
            }}
            renderItem={({ item, index }) => {
              const isActive = index === activeIndex;
              const followed = Boolean(followedMap[item.account]);
              const paused = pausedIds.has(item.id);
              const playback = playbackMap[item.id];
              const itemLiked = likedIds.has(`video-${item.id}`) || likedIds.has(item.id);
              const itemCollected = collectIds.has(`video-${item.id}`);
              const LikeIcon = itemLiked ? LikedIcon : UnlikedIcon;
              const CollectIcon = itemCollected ? CollectedIcon : UncollectedIcon;
              const progress =
                playback?.durationMillis && playback.durationMillis > 0
                  ? Math.min(1, Math.max(0, playback.positionMillis / playback.durationMillis))
                  : 0;
              return (
                <View style={[styles.page, { height: pageHeight }]}>
                  <Pressable style={styles.videoTapLayer} onPress={() => togglePlayback(item)}>
                    {item.videoUri ? (
                      <Video
                        ref={(ref) => {
                          videoRefs.current[item.id] = ref;
                        }}
                        source={{ uri: item.videoUri }}
                        style={styles.video}
                        resizeMode={ResizeMode.COVER}
                        isLooping
                        shouldPlay={isActive && !paused}
                        isMuted={false}
                        progressUpdateIntervalMillis={250}
                        onPlaybackStatusUpdate={(status) => updatePlaybackStatus(item.id, status)}
                      />
                    ) : item.coverUri ? (
                      <Image source={{ uri: item.coverUri }} style={styles.video} contentFit="cover" />
                    ) : (
                      <View style={[styles.video, styles.videoFallback]} />
                    )}
                    {paused ? (
                      <View style={styles.centerPlay}>
                        <ThemedText style={styles.centerPlayText}>▶</ThemedText>
                      </View>
                    ) : null}
                  </Pressable>

                  <View style={[styles.topOverlay, { top: insets.top + 4, height: 30 }]}>
                    <Pressable style={styles.topBtn} onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}>
                      <BackIcon width={24} height={24} color="#FFF" />
                    </Pressable>
                    <View style={styles.topRight}>
                      <Pressable style={styles.topBtn}>
                        <SearchIcon width={24} height={24} color="#FFF" />
                      </Pressable>
                      <Pressable style={styles.topBtn}>
                        <ShareIcon width={24} height={24} color="#FFF" />
                      </Pressable>
                    </View>
                  </View>

                  <View style={[styles.overlay, { bottom: insets.bottom + 10 }]}>
                    <View style={styles.authorRow}>
                      {item.authorAvatar ? <Image source={{ uri: item.authorAvatar }} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.videoFallback]} />}
                      <Pressable
                        onPress={() => {
                          if (!item.account) return;
                          router.push({ pathname: '/user/[account]', params: { account: item.account, name: item.authorName } });
                        }}>
                        <ThemedText style={styles.authorName}>{item.authorName}</ThemedText>
                      </Pressable>
                      {item.account && user?.account !== item.account ? (
                        <Pressable style={[styles.followBtn, followed ? styles.followedBtn : null]} onPress={() => void toggleFollow()}>
                          <ThemedText style={styles.followText}>{pendingFollow ? '处理中' : followed ? '已关注' : '关注'}</ThemedText>
                        </Pressable>
                      ) : null}
                    </View>

                    <ThemedText style={styles.title}>{item.title}</ThemedText>
                    {item.brief ? <ThemedText numberOfLines={2} style={styles.brief}>{item.brief}</ThemedText> : null}

                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>

                    <View style={styles.actionRow}>
                      <Pressable style={styles.inputGhost} onPress={openCommentPanel}>
                        <ThemedText style={styles.inputGhostText}>说点什么...</ThemedText>
                      </Pressable>

                      <Pressable style={styles.actionBtn} onPress={() => void toggleLike()}>
                        <LikeIcon width={22} height={22} color={itemLiked ? '#FF5B77' : '#FFF'} />
                        <ThemedText style={[styles.actionText, itemLiked && isActive ? styles.activeAction : null]}>{item.likes ? item.likes : '点赞'}</ThemedText>
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={() => void toggleCollect()}>
                        <CollectIcon width={22} height={22} color={itemCollected ? '#FF5B77' : '#FFF'} />
                        <ThemedText style={[styles.actionText, itemCollected && isActive ? styles.activeAction : null]}>{item.collects ? item.collects : '收藏'}</ThemedText>
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={openCommentPanel}>
                        <CommentIcon width={22} height={22} color="#FFF" />
                        <ThemedText style={styles.actionText}>{item.commentList.length ? item.commentList.length : '评论'}</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        <Modal
          visible={commentVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCommentVisible(false)}
          onShow={() => {
            if (!user?.account) return;
            setTimeout(() => commentInputRef.current?.focus(), 80);
          }}>
          <Pressable style={styles.mask} onPress={() => setCommentVisible(false)} />
          <View style={styles.commentPanel}>
            <View style={styles.commentHeader}>
              <ThemedText style={styles.commentTitle}>共 {currentComments.length} 条评论</ThemedText>
              <Pressable onPress={() => setCommentVisible(false)}>
                <ThemedText style={styles.muted}>关闭</ThemedText>
              </Pressable>
            </View>

            <FlatList
              data={currentComments}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              contentContainerStyle={styles.commentList}
              ListEmptyComponent={<ThemedText style={styles.muted}>还没有评论，快来抢沙发</ThemedText>}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  {item.avatar ? <Image source={{ uri: resolveMediaUrl(item.avatar) }} style={styles.commentAvatar} contentFit="cover" /> : <View style={[styles.commentAvatar, styles.videoFallback]} />}
                  <View style={styles.commentMain}>
                    <ThemedText style={styles.commentName}>{item.name || item.account || '用户'}</ThemedText>
                    <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                    <ThemedText style={styles.commentDate}>{item.date || ''}</ThemedText>
                  </View>
                </View>
              )}
            />

            <View style={styles.inputRow}>
              <TextInput
                ref={commentInputRef}
                style={styles.input}
                placeholder="看话题说，快来评论"
                value={commentText}
                onChangeText={setCommentText}
                editable={!commentPending}
              />
              <Pressable style={styles.sendBtn} onPress={() => void sendComment()}>
                <ThemedText style={styles.sendText}>{commentPending ? '发送中' : '发送'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#9AA0AA' },
  retryBtn: { borderWidth: 1, borderColor: '#444', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: '#EDEEF2' },
  page: { backgroundColor: '#000' },
  videoTapLayer: { ...StyleSheet.absoluteFillObject },
  video: { width: '100%', height: '100%' },
  videoFallback: { backgroundColor: '#1D1F24' },
  centerPlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 72,
    height: 72,
    marginLeft: -36,
    marginTop: -36,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayText: { color: 'rgba(255,255,255,0.86)', fontSize: 34, marginLeft: 5, lineHeight: 42 },
  topOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topBtn: { minWidth: 32, height: 30, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  authorName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  followBtn: { marginLeft: 4, minWidth: 58, height: 28, borderRadius: 14, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  followedBtn: { backgroundColor: 'rgba(255,255,255,0.24)' },
  followText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  title: { color: '#F2F2F7', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  brief: { color: '#F1F2F5', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.22)', paddingTop: 10 },
  inputGhost: { flex: 1, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', paddingHorizontal: 14 },
  inputGhostText: { color: '#BFC3CA', fontSize: 13 },
  actionBtn: { minWidth: 62, height: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  activeAction: { color: '#FF5B77' },
  progressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.28)', marginBottom: 9 },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  mask: { flex: 1, backgroundColor: 'transparent' },
  commentPanel: { maxHeight: '70%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEC' },
  commentTitle: { fontSize: 15, fontWeight: '700', color: '#1D1F24' },
  commentList: { paddingVertical: 10, gap: 12 },
  commentItem: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF1F6' },
  commentMain: { flex: 1, gap: 4 },
  commentName: { color: '#5A6270', fontSize: 13 },
  commentText: { color: '#1F2329', fontSize: 14, lineHeight: 20 },
  commentDate: { color: '#9AA0AA', fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECECEC', paddingTop: 10 },
  input: { flex: 1, height: 40, borderRadius: 20, backgroundColor: '#F5F6F8', paddingHorizontal: 12, fontSize: 14 },
  sendBtn: { width: 64, height: 36, borderRadius: 18, backgroundColor: '#FF4F72', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
