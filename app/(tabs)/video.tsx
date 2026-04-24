import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Animated,
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

import { AppActivityIndicator } from '@/components/app-loading';
import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { hasContentRef, setContentRef } from '@/lib/content-refs';
import { postJson, postPublicJson } from '@/lib/post-json';
import CommentIcon from '@/public/icon/pinglun.svg';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CollectedIcon from '@/public/icon/shoucang.svg';
import SearchIcon from '@/public/icon/sousuo.svg';
import UncollectedIcon from '@/public/icon/shoucang_1.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';
import MoreIcon from '@/public/icon/gengduo.svg';

type AVPlaybackStatus = {
  isLoaded: boolean;
  durationMillis?: number;
  positionMillis?: number;
};

type ExpoAvVideoRef = {
  playAsync?: () => Promise<unknown>;
  pauseAsync?: () => Promise<unknown>;
};

type ExpoAvModule = {
  Video: ComponentType<any>;
  ResizeMode: { COVER?: string };
};

let expoAvModule: ExpoAvModule | null = null;
try {
  // expo-av is removed from Expo Go in newer SDKs.
  // Keep a safe runtime fallback to prevent route crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoAvModule = require('expo-av') as ExpoAvModule;
} catch {
  expoAvModule = null;
}

const VideoComponent = expoAvModule?.Video || null;
const ResizeModeCover = expoAvModule?.ResizeMode?.COVER || 'cover';

function safelyPause(ref: ExpoAvVideoRef | null | undefined) {
  if (!ref?.pauseAsync) return;
  void ref.pauseAsync().catch(() => undefined);
}

function safelyPlay(ref: ExpoAvVideoRef | null | undefined) {
  if (!ref?.playAsync) return;
  void ref.playAsync().catch(() => undefined);
}

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
  hidden?: boolean | number | string;
  comment?: unknown;
};

type FollowStatus = {
  followed?: boolean;
};

type CommentItem = {
  id: string;
  index: number;
  account: string;
  name: string;
  text: string;
  avatar?: string;
  date?: string;
  likeCount?: number;
  liked?: boolean;
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
  hidden: boolean;
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

function normalizeLikeUsers(value: unknown): { account?: string; name?: string; avatar?: string }[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return text.split(',').filter(Boolean).map((account) => ({ account }));
    }
  }
  return [];
}

function parseCommentList(raw: unknown, viewerAccount = ''): CommentItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      const likeUsers = normalizeLikeUsers(item?.likeUsers || item?.likeAccounts || item?.likeUserInfo);
      const liked = viewerAccount ? likeUsers.some((user) => String(user?.account || '').trim() === viewerAccount) : false;
      return {
      id: String(item?.id ?? idx),
      index: idx,
      account: String(item?.account || ''),
      name: String(item?.name || item?.account || '用户'),
      text: String(item?.text || ''),
      avatar: typeof item?.avatar === 'string' ? item.avatar : '',
      date: typeof item?.date === 'string' ? item.date : '',
      likeCount: parseCount(item?.likeCount ?? item?.likes ?? likeUsers.length),
      liked,
    };
    });
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return parseCommentList(parsed, viewerAccount);
    } catch {
      return text
        .split(';/')
        .filter(Boolean)
        .map((item, idx): CommentItem | null => {
          try {
            const row = JSON.parse(item);
            const likeUsers = normalizeLikeUsers(row?.likeUsers || row?.likeAccounts || row?.likeUserInfo);
            return {
              id: String(row?.id ?? idx),
              index: idx,
              account: String(row?.account || ''),
              name: String(row?.name || row?.account || '用户'),
              text: String(row?.text || ''),
              avatar: typeof row?.avatar === 'string' ? row.avatar : '',
              date: typeof row?.date === 'string' ? row.date : '',
              likeCount: parseCount(row?.likeCount ?? row?.likes ?? likeUsers.length),
              liked: viewerAccount ? likeUsers.some((user) => String(user?.account || '').trim() === viewerAccount) : false,
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

function mapVideo(item: VideoDto, viewerAccount = ''): VideoFeedItem {
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
    hidden: Boolean(Number(item.hidden || 0)),
    commentList: parseCommentList(item.comment, viewerAccount),
  };
}

export default function VideoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const feedback = useFeedback();
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
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [hiddenPromptVisible, setHiddenPromptVisible] = useState(false);
  const [pendingHidden, setPendingHidden] = useState(false);
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const videoRefs = useRef<Record<string, ExpoAvVideoRef | null>>({});
  const listRef = useRef<FlatList<VideoFeedItem> | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const pausedIdsRef = useRef<Set<string>>(new Set());
  const settingsTranslateY = useRef(new Animated.Value(280)).current;
  const targetId = Array.isArray(params.id) ? params.id[0] : params.id;

  const pauseAllVideos = useCallback(() => {
    Object.values(videoRefs.current).forEach((ref) => {
      safelyPause(ref);
    });
  }, []);

  const pauseInactiveVideos = useCallback((activeId: string) => {
    Object.entries(videoRefs.current).forEach(([id, ref]) => {
      if (!ref || id === activeId) return;
      safelyPause(ref);
    });
  }, []);

  const current = items[activeIndex];
  const currentLiked = current ? hasContentRef(likedIds, 'video', current.id) : false;
  const currentCollected = current ? hasContentRef(collectIds, 'video', current.id) : false;
  const currentFollowed = current ? Boolean(followedMap[current.account]) : false;

  function openSettingsSheet() {
    settingsTranslateY.setValue(280);
    setSettingsVisible(true);
    Animated.timing(settingsTranslateY, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }

  function closeSettingsSheet() {
    Animated.timing(settingsTranslateY, {
      toValue: 280,
      duration: 190,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSettingsVisible(false);
    });
  }

  function openHiddenPrompt() {
    if (!current || current.account !== user?.account) return;
    closeSettingsSheet();
    setHiddenPromptVisible(true);
  }

  function openDeletePrompt() {
    if (!current || current.account !== user?.account) return;
    closeSettingsSheet();
    setDeletePromptVisible(true);
  }

  const currentComments = useMemo(() => {
    return Array.isArray(current?.commentList) ? current.commentList : [];
  }, [current?.commentList]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const videoRes = await postPublicJson<VideoDto[]>('/video', targetId ? { targetId, account: user?.account || '' } : {});
      const userRes = user?.account
        ? await postJson<UserInfoResult>('/user/getUserInfo', { account: user.account }).catch(() => ({ result: { likes: '', collects: '' } as UserInfoResult }))
        : { result: { likes: '', collects: '' } as UserInfoResult };

      const nextItems = Array.isArray(videoRes.result) ? videoRes.result.map((item) => mapVideo(item, user?.account || '')) : [];
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
        safelyPlay(currentRef);
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
          if (!pausedIdsRef.current.has(item.id)) safelyPlay(ref);
        } else {
          safelyPause(ref);
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

    if (nextPaused) safelyPause(ref);
    else safelyPlay(ref);
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

    const prevLiked = currentLiked;
    const nextLiked = !prevLiked;
    const nextLikes = Math.max(0, current.likes + (nextLiked ? 1 : -1));

    const prevSet = new Set(likedIds);
    const nextSet = setContentRef(prevSet, 'video', current.id, nextLiked);

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

    const prevCollected = currentCollected;
    const nextCollected = !prevCollected;
    const nextCollects = Math.max(0, current.collects + (nextCollected ? 1 : -1));

    const prevSet = new Set(collectIds);
    const nextSet = setContentRef(prevSet, 'video', current.id, nextCollected);

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

  async function toggleHidden() {
    if (!current || current.account !== user?.account || pendingHidden) return;

    const previousHidden = current.hidden;
    const nextHidden = !previousHidden;
    setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, hidden: nextHidden } : item)));
    setHiddenPromptVisible(false);
    setPendingHidden(true);

    try {
      const { result } = await postJson<{ hidden?: boolean }>('/content/toggleHidden', {
        account: user.account,
        id: current.id,
        contentType: 'video',
        hidden: nextHidden,
      });
      let finalHidden = nextHidden;
      if (typeof result?.hidden === 'boolean') {
        finalHidden = Boolean(result.hidden);
        setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, hidden: Boolean(result.hidden) } : item)));
      }
      setError(null);
      feedback.toast(finalHidden ? '视频已隐藏' : '视频已取消隐藏');
    } catch (err) {
      setItems((prev) => prev.map((item, idx) => (idx === activeIndex ? { ...item, hidden: previousHidden } : item)));
      setError(err instanceof Error ? err.message : '隐藏设置失败');
    } finally {
      setPendingHidden(false);
    }
  }

  async function deleteVideo() {
    if (!current || current.account !== user?.account || pendingDelete) return;

    const deletingId = current.id;
    setPendingDelete(true);
    try {
      await postJson('/content/delete', {
        account: user.account,
        id: deletingId,
        contentType: 'video',
        deleteFiles: true,
      });
      setError(null);
      setDeletePromptVisible(false);
      feedback.toast('视频已删除');
      router.replace('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setPendingDelete(false);
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
            index: current.commentList.length,
            account: String(res.result.account || user.account),
            name: String(res.result.name || user.name || user.account),
            text: String(res.result.text || text),
            avatar: String(res.result.avatar || user.url || ''),
            date: String(res.result.date || ''),
            likeCount: parseCount(res.result.likeCount),
            liked: false,
          }
        : {
            id: String(Date.now()),
            index: current.commentList.length,
            account: user.account,
            name: String(user.name || user.account),
            text,
            avatar: String(user.url || ''),
            date: new Date().toISOString().slice(0, 19).replace('T', ' '),
            likeCount: 0,
            liked: false,
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
      feedback.toast('评论发布成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '评论失败');
    } finally {
      setCommentPending(false);
    }
  }

  async function toggleVideoCommentLike(comment: CommentItem) {
    if (!current || !user?.account) {
      router.push('/login');
      return;
    }

    const previousLiked = Boolean(comment.liked);
    const nextLiked = !previousLiked;
    const nextLikeCount = Math.max(0, parseCount(comment.likeCount) + (nextLiked ? 1 : -1));
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === activeIndex
          ? {
              ...item,
              commentList: item.commentList.map((row) =>
                row.id === comment.id ? { ...row, liked: nextLiked, likeCount: nextLikeCount } : row
              ),
            }
          : item
      )
    );

    try {
      const { result } = await postJson<{ liked?: boolean; likeCount?: number }>('/upload/addComment', {
        id: current.id,
        contentType: 'video',
        action: 'like',
        commentId: comment.id,
        commentIndex: comment.index,
        parentId: 0,
        account: user.account,
        name: user.name || user.account,
        avatar: user.url || '',
      });
      if (result) {
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === activeIndex
              ? {
                  ...item,
                  commentList: item.commentList.map((row) =>
                    row.id === comment.id ? { ...row, liked: Boolean(result.liked), likeCount: parseCount(result.likeCount) } : row
                  ),
                }
              : item
          )
        );
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === activeIndex
            ? {
                ...item,
                commentList: item.commentList.map((row) =>
                  row.id === comment.id ? { ...row, liked: previousLiked, likeCount: parseCount(comment.likeCount) } : row
                ),
              }
            : item
        )
      );
      setError(err instanceof Error ? err.message : '评论点赞失败');
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
            <AppActivityIndicator label="正在加载视频" />
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
              const itemLiked = hasContentRef(likedIds, 'video', item.id);
              const itemCollected = hasContentRef(collectIds, 'video', item.id);
              const visibleCollects = item.collects || (itemCollected ? 1 : 0);
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
                      VideoComponent ? (
                      <VideoComponent
                        ref={(ref: ExpoAvVideoRef | null) => {
                          videoRefs.current[item.id] = ref;
                        }}
                        source={{ uri: item.videoUri }}
                        style={styles.video}
                        resizeMode={ResizeModeCover}
                        isLooping
                        shouldPlay={isActive && !paused}
                        isMuted={false}
                        progressUpdateIntervalMillis={250}
                        onPlaybackStatusUpdate={(status: AVPlaybackStatus) => updatePlaybackStatus(item.id, status)}
                      />
                      ) : (
                        <View style={[styles.video, styles.videoFallback]}>
                          <ThemedText style={styles.muted}>当前环境不支持该视频模块</ThemedText>
                        </View>
                      )
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
                      <Pressable style={styles.topBtn} onPress={() => router.push({ pathname: '/search', params: { type: 'video' } })}>
                        <SearchIcon width={24} height={24} color="#FFF" />
                      </Pressable>
                      {item.account && user?.account === item.account ? (
                        <Pressable style={styles.topBtn} onPress={openSettingsSheet}>
                          <MoreIcon width={25} height={25} color="#FFF" />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.overlay, { bottom: insets.bottom + 10 }]}>
                    <View style={styles.authorRow}>
                      <Image source={avatarSource(item.authorAvatar)} style={styles.avatar} contentFit="cover" />
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
                        <ThemedText style={[styles.actionText, itemCollected && isActive ? styles.activeAction : null]}>{visibleCollects || '收藏'}</ThemedText>
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
                  <Image source={avatarSource(item.avatar)} style={styles.commentAvatar} contentFit="cover" />
                  <View style={styles.commentMain}>
                    <ThemedText style={styles.commentName}>{item.name || item.account || '用户'}</ThemedText>
                    <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                    <ThemedText style={styles.commentDate}>{item.date || ''}</ThemedText>
                  </View>
                  <Pressable style={styles.commentLikeBtn} onPress={() => void toggleVideoCommentLike(item)}>
                    {item.liked ? (
                      <LikedIcon width={18} height={18} color="#FF5B77" />
                    ) : (
                      <UnlikedIcon width={18} height={18} color="#9AA0AA" />
                    )}
                    {parseCount(item.likeCount) > 0 ? (
                      <ThemedText style={[styles.commentLikeText, item.liked && styles.commentLikeTextActive]}>{item.likeCount}</ThemedText>
                    ) : null}
                  </Pressable>
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

        <Modal visible={settingsVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSettingsSheet}>
          <View style={styles.settingsModalRoot}>
            <Pressable style={styles.settingsBackdrop} onPress={closeSettingsSheet} />
            <Animated.View style={[styles.settingsSheet, { transform: [{ translateY: settingsTranslateY }] }]}>
              <View style={styles.settingsHeader}>
                <View style={styles.settingsHeaderSide} />
                <ThemedText style={styles.settingsTitle}>视频设置</ThemedText>
                <Pressable hitSlop={12} style={styles.settingsCloseBtn} onPress={closeSettingsSheet}>
                  <Feather name="x" size={28} color="#3C3C3F" />
                </Pressable>
              </View>
              <View style={styles.settingsActions}>
                <VideoSettingsAction icon="edit-3" label="编辑" onPress={closeSettingsSheet} />
                <VideoSettingsAction icon="arrow-up-circle" label="置顶" onPress={closeSettingsSheet} />
                <VideoSettingsAction icon={current?.hidden ? 'eye' : 'eye-off'} label={current?.hidden ? '取消隐藏' : '隐藏视频'} onPress={openHiddenPrompt} />
                <VideoSettingsAction icon="trash-2" label="删除" danger onPress={openDeletePrompt} />
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={hiddenPromptVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHiddenPromptVisible(false)}>
          <View style={styles.hiddenPromptRoot}>
            <Pressable style={styles.hiddenPromptBackdrop} onPress={() => setHiddenPromptVisible(false)} />
            <View style={styles.hiddenPromptBox}>
              <ThemedText style={styles.hiddenPromptTitle}>{current?.hidden ? '取消隐藏视频' : '隐藏视频'}</ThemedText>
              <ThemedText style={styles.hiddenPromptDesc}>
                {current?.hidden ? '取消隐藏后，其他用户可以重新看到这个视频。' : '隐藏后，这个视频将不会展示给其他用户。'}
              </ThemedText>
              <View style={styles.hiddenPromptActions}>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptCancel]} onPress={() => setHiddenPromptVisible(false)}>
                  <ThemedText style={styles.hiddenPromptCancelText}>取消</ThemedText>
                </Pressable>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptConfirm]} onPress={() => void toggleHidden()} disabled={pendingHidden}>
                  <ThemedText style={styles.hiddenPromptConfirmText}>{pendingHidden ? '处理中' : '确认'}</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={deletePromptVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDeletePromptVisible(false)}>
          <View style={styles.hiddenPromptRoot}>
            <Pressable style={styles.hiddenPromptBackdrop} onPress={() => setDeletePromptVisible(false)} />
            <View style={styles.hiddenPromptBox}>
              <ThemedText style={styles.hiddenPromptTitle}>删除视频</ThemedText>
              <ThemedText style={styles.hiddenPromptDesc}>删除后将同时移除数据库记录、视频文件和封面文件，且无法恢复。</ThemedText>
              <View style={styles.hiddenPromptActions}>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptCancel]} onPress={() => setDeletePromptVisible(false)} disabled={pendingDelete}>
                  <ThemedText style={styles.hiddenPromptCancelText}>取消</ThemedText>
                </Pressable>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptDanger]} onPress={() => void deleteVideo()} disabled={pendingDelete}>
                  <ThemedText style={styles.hiddenPromptConfirmText}>{pendingDelete ? '删除中' : '删除'}</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

function VideoSettingsAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.settingsAction} onPress={onPress}>
      <View style={styles.settingsActionIcon}>
        <Feather name={icon} size={30} color={danger ? '#D93A3A' : '#7F7F83'} />
      </View>
      <ThemedText style={[styles.settingsActionText, danger && styles.settingsActionDanger]}>{label}</ThemedText>
    </Pressable>
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
  commentLikeBtn: { minWidth: 36, minHeight: 34, alignItems: 'center', justifyContent: 'center', gap: 2 },
  commentLikeText: { color: '#9AA0AA', fontSize: 11, fontWeight: '600' },
  commentLikeTextActive: { color: '#FF5B77' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECECEC', paddingTop: 10 },
  input: { flex: 1, height: 40, borderRadius: 20, backgroundColor: '#F5F6F8', paddingHorizontal: 12, fontSize: 14 },
  sendBtn: { width: 64, height: 36, borderRadius: 18, backgroundColor: '#FF4F72', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  settingsModalRoot: { flex: 1, justifyContent: 'flex-end' },
  settingsBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.56)' },
  settingsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    backgroundColor: '#FFFFFF',
  },
  settingsHeader: {
    height: 62,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsHeaderSide: { width: 42 },
  settingsTitle: { fontSize: 21, color: '#303034', fontWeight: '700' },
  settingsCloseBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  settingsActions: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  settingsAction: { flex: 1, alignItems: 'center', gap: 10, minWidth: 0 },
  settingsActionIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
  settingsActionText: { textAlign: 'center', fontSize: 14, color: '#5C5C61', fontWeight: '700' },
  settingsActionDanger: { color: '#D93A3A' },
  hiddenPromptRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  hiddenPromptBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  hiddenPromptBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  hiddenPromptTitle: { color: '#1F2329', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  hiddenPromptDesc: { marginTop: 10, color: '#606774', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  hiddenPromptActions: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hiddenPromptBtn: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  hiddenPromptCancel: { backgroundColor: '#F1F2F5' },
  hiddenPromptConfirm: { backgroundColor: '#FF2442' },
  hiddenPromptDanger: { backgroundColor: '#D93A3A' },
  hiddenPromptCancelText: { color: '#4E5561', fontSize: 15, fontWeight: '700' },
  hiddenPromptConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
