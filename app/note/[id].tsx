import { Image as ExpoImage } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Animated,
  Image as RNImage,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppActivityIndicator } from '@/components/app-loading';
import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { avatarSource } from '@/lib/avatar-source';
import { useThemeColor } from '@/hooks/use-theme-color';
import { hasContentRef, setContentRef } from '@/lib/content-refs';
import { postJson, postPublicJson } from '@/lib/post-json';
import CommentIcon from '@/public/icon/pinglun.svg';
import CollectedIcon from '@/public/icon/shoucang.svg';
import UncollectedIcon from '@/public/icon/shoucang_1.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';
import MoreIcon from '@/public/icon/gengduo.svg';

type NoteCommentDto = {
  id?: number | string;
  parentId?: number | string;
  account?: string;
  name?: string;
  text?: string;
  avatar?: string;
  likeCount?: number | string;
  liked?: boolean;
  location?: string;
  date?: string;
  replyToName?: string;
  replyToAccount?: string;
  replies?: NoteCommentDto[];
};

type NoteDetailDto = {
  id: number | string;
  title?: string;
  brief?: string;
  image?: string;
  account?: string;
  likes?: number | string;
  collects?: number | string;
  hidden?: boolean | number | string;
  date?: string;
  name?: string;
  url?: string;
  comments?: NoteCommentDto[];
};

type UserInfoDto = {
  likes?: string;
  collects?: string;
};

type CommentLikeResult = {
  commentId: number | string;
  commentIndex?: number;
  replyIndex?: number;
  parentId?: number | string;
  liked: boolean;
  likeCount: number;
};

type ReplyResult = {
  parentId: number | string;
  parentIndex?: number;
  reply: NoteCommentDto;
};

type NoteComment = {
  id: string;
  localKey: string;
  index: number;
  account: string;
  name: string;
  text: string;
  avatarUri?: string;
  likeCount: number;
  liked: boolean;
  date: string;
  location: string;
  replies: NoteReply[];
};

type NoteReply = {
  id: string;
  parentId: string;
  parentIndex: number;
  parentLocalKey: string;
  localKey: string;
  index: number;
  account: string;
  name: string;
  text: string;
  avatarUri?: string;
  likeCount: number;
  liked: boolean;
  date: string;
  location: string;
  replyToName: string;
  replyToAccount: string;
};

type ReplyTarget = {
  parentId: string;
  parentIndex: number;
  parentLocalKey: string;
  replyToName: string;
  replyToAccount: string;
};

type NoteDetail = {
  id: string;
  account: string;
  title: string;
  brief: string;
  imageUris: string[];
  likes: number;
  collects: number;
  liked: boolean;
  collected: boolean;
  hidden: boolean;
  date: string;
  authorName: string;
  authorAvatar?: string;
  comments: NoteComment[];
};

type ImageSizeMap = Record<string, { width: number; height: number }>;

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapReplies(items: NoteCommentDto[] | undefined, parent: { id: string; index: number; localKey: string }): NoteReply[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: String(item.id ?? index),
    parentId: String(item.parentId ?? parent.id),
    parentIndex: parent.index,
    parentLocalKey: parent.localKey,
    localKey: `${parent.localKey}-reply-${String(item.id ?? 'reply')}-${index}`,
    index,
    account: String(item.account || ''),
    name: String(item.name || item.account || '用户'),
    text: String(item.text || ''),
    avatarUri: resolveMediaUrl(typeof item.avatar === 'string' ? item.avatar : undefined),
    likeCount: Number(item.likeCount || 0),
    liked: Boolean(item.liked),
    date: String(item.date || ''),
    location: String(item.location || ''),
    replyToName: String(item.replyToName || ''),
    replyToAccount: String(item.replyToAccount || ''),
  }));
}

function mapComments(items: NoteCommentDto[] | undefined): NoteComment[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const id = String(item.id ?? index);
    const localKey = `${id}-${index}`;
    return {
      id,
      localKey,
      index,
      account: String(item.account || ''),
      name: String(item.name || item.account || '用户'),
      text: String(item.text || ''),
      avatarUri: resolveMediaUrl(typeof item.avatar === 'string' ? item.avatar : undefined),
      likeCount: Number(item.likeCount || 0),
      liked: Boolean(item.liked),
      date: String(item.date || ''),
      location: String(item.location || ''),
      replies: mapReplies(item.replies, { id, index, localKey }),
    };
  });
}

function toNoteDetail(note: NoteDetailDto, userInfo?: UserInfoDto): NoteDetail {
  const imageUris = String(note.image ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((file) => (note.account ? resolveMediaUrl(`note-image/${note.account}/${file}`) : undefined))
    .filter((item): item is string => Boolean(item));

  const noteId = String(note.id);
  const likedIds = new Set(parseIdList(userInfo?.likes));
  const collectedIds = new Set(parseIdList(userInfo?.collects));

  return {
    id: noteId,
    account: String(note.account || ''),
    title: String(note.title || '未命名笔记'),
    brief: String(note.brief || ''),
    imageUris,
    likes: Number(note.likes || 0),
    collects: Number(note.collects || 0),
    liked: hasContentRef(likedIds, 'note', noteId),
    collected: hasContentRef(collectedIds, 'note', noteId),
    hidden: Boolean(Number(note.hidden || 0)),
    date: String(note.date || ''),
    authorName: String(note.name || note.account || '用户'),
    authorAvatar: resolveMediaUrl(typeof note.url === 'string' ? note.url : undefined),
    comments: mapComments(note.comments),
  };
}

export default function NoteDetailScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const feedback = useFeedback();
  const border = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [commentLikingIds, setCommentLikingIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [imageSizes, setImageSizes] = useState<ImageSizeMap>({});
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [hiddenPromptVisible, setHiddenPromptVisible] = useState(false);
  const [pendingHidden, setPendingHidden] = useState(false);
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const settingsTranslateY = useRef(new Animated.Value(280)).current;

  const isOwnNote = Boolean(note?.account && user?.account && note.account === user.account);

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
    if (!note || !isOwnNote) return;
    closeSettingsSheet();
    setHiddenPromptVisible(true);
  }

  function openDeletePrompt() {
    if (!note || !isOwnNote) return;
    closeSettingsSheet();
    setDeletePromptVisible(true);
  }

  async function loadDetail(isRefresh = false) {
    if (!id) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [detailRes, userInfoRes] = await Promise.all([
        postPublicJson<NoteDetailDto>('/noteDetail', { id, account: user?.account || '' }),
        user?.account
          ? postJson<UserInfoDto>('/user/getUserInfo', { account: user.account })
          : Promise.resolve({ result: { likes: '', collects: '' } as UserInfoDto }),
      ]);

      if (!detailRes.result) throw new Error('笔记不存在');

      const nextLikedIds = new Set(parseIdList(userInfoRes.result?.likes));
      const nextCollectedIds = new Set(parseIdList(userInfoRes.result?.collects));
      const nextNote = toNoteDetail(detailRes.result, {
        likes: Array.from(nextLikedIds).join(','),
        collects: Array.from(nextCollectedIds).join(','),
      });

      setLikedIds(nextLikedIds);
      setCollectedIds(nextCollectedIds);
      setCommentLikingIds(new Set());
      setCurrentPage(0);
      setNote(nextNote);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载详情失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }

  async function submitComment() {
    const text = commentText.trim();
    if (!user?.account || !text || !note) return;

    setSubmitting(true);
    try {
      const body = replyingTo
        ? {
            id: note.id,
            action: 'reply',
            parentId: replyingTo.parentId,
            parentIndex: replyingTo.parentIndex,
            account: user.account,
            name: user.name || user.account,
            text,
            avatar: user.url || '',
            likeCount: 0,
            location: '',
            date: new Date().toISOString().slice(0, 10),
            replyToName: replyingTo.replyToName,
            replyToAccount: replyingTo.replyToAccount,
          }
        : {
            id: note.id,
            account: user.account,
            name: user.name || user.account,
            text,
            avatar: user.url || '',
            likeCount: 0,
            location: '',
            date: new Date().toISOString().slice(0, 10),
          };

      const { result } = await postJson<NoteCommentDto | ReplyResult>('/upload/addComment', body);

      setCommentText('');
      setReplyingTo(null);
      setCommentVisible(false);
      setError(null);
      feedback.toast('评论发布成功');

      if (result && replyingTo && 'reply' in result) {
        const nextReply = mapReplies([result.reply], {
          id: replyingTo.parentId,
          index: replyingTo.parentIndex,
          localKey: replyingTo.parentLocalKey,
        })[0];
        setNote((prev) =>
          prev
            ? {
                ...prev,
                comments: prev.comments.map((comment) =>
                  comment.localKey === replyingTo.parentLocalKey
                    ? { ...comment, replies: [...comment.replies, nextReply] }
                    : comment
                ),
              }
            : prev
        );
      } else if (result) {
        const nextComment = mapComments([result])[0];
        setNote((prev) =>
          prev
            ? {
                ...prev,
                comments: [...prev.comments, nextComment],
              }
            : prev
        );
      } else {
        await loadDetail(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发表评论失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleCommentLike(targetComment: NoteComment | NoteReply) {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    const { id: commentId, localKey, index: commentIndex } = targetComment;
    if (!note || commentLikingIds.has(localKey)) return;

    const isReply = 'parentId' in targetComment;
    const currentComment = isReply
      ? note.comments
          .find((comment) => comment.localKey === targetComment.parentLocalKey)
          ?.replies.find((reply) => reply.localKey === localKey)
      : note.comments.find((comment) => comment.localKey === localKey);
    if (!currentComment) return;

    const previousLiked = currentComment.liked;
    const nextLiked = !previousLiked;
    const nextLikeCount = Math.max(0, currentComment.likeCount + (nextLiked ? 1 : -1));

    setCommentLikingIds((prev) => new Set(prev).add(localKey));
    setNote((prev) =>
      prev
        ? {
            ...prev,
            comments: prev.comments.map((comment) =>
              isReply
                ? comment.localKey === targetComment.parentLocalKey
                  ? {
                      ...comment,
                      replies: comment.replies.map((reply) =>
                        reply.localKey === localKey ? { ...reply, liked: nextLiked, likeCount: nextLikeCount } : reply
                      ),
                    }
                  : comment
                : comment.localKey === localKey
                  ? { ...comment, liked: nextLiked, likeCount: nextLikeCount }
                  : comment
            ),
          }
        : prev
    );

    try {
      const { result } = await postJson<CommentLikeResult>('/upload/addComment', {
        id: note.id,
        action: 'like',
        commentId,
        commentIndex: isReply ? undefined : commentIndex,
        parentId: isReply ? targetComment.parentId : 0,
        parentIndex: isReply ? targetComment.parentIndex : undefined,
        replyIndex: isReply ? targetComment.index : undefined,
        account: user.account,
        name: user.name || user.account,
        avatar: user.url || '',
      });
      if (result) {
        setNote((prev) =>
          prev
            ? {
                ...prev,
                comments: prev.comments.map((comment) =>
                  isReply
                    ? comment.localKey === targetComment.parentLocalKey
                      ? {
                          ...comment,
                          replies: comment.replies.map((reply) =>
                            reply.localKey === localKey
                              ? { ...reply, liked: Boolean(result.liked), likeCount: Number(result.likeCount || 0) }
                              : reply
                          ),
                        }
                      : comment
                    : comment.localKey === localKey
                      ? { ...comment, liked: Boolean(result.liked), likeCount: Number(result.likeCount || 0) }
                      : comment
                ),
              }
            : prev
        );
      }
      setError(null);
    } catch (err) {
      setNote((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((comment) =>
                isReply
                  ? comment.localKey === targetComment.parentLocalKey
                    ? {
                        ...comment,
                        replies: comment.replies.map((reply) =>
                          reply.localKey === localKey
                            ? { ...reply, liked: previousLiked, likeCount: currentComment.likeCount }
                            : reply
                        ),
                      }
                    : comment
                  : comment.localKey === localKey
                    ? { ...comment, liked: previousLiked, likeCount: currentComment.likeCount }
                    : comment
              ),
            }
          : prev
      );
      setError(err instanceof Error ? err.message : '评论点赞失败');
    } finally {
      setCommentLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(localKey);
        return next;
      });
    }
  }

  async function toggleLike() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!note || liking) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !note.liked;
    const nextLikes = Math.max(0, note.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = setContentRef(previousLikedIds, 'note', note.id, nextLiked);

    setLiking(true);
    setLikedIds(nextLikedIds);
    setNote((prev) => (prev ? { ...prev, liked: nextLiked, likes: nextLikes } : prev));

    try {
      await postJson('/user/addLikeNote', {
        likesArr: Array.from(nextLikedIds).join(','),
        account: user.account,
        num: nextLikes,
        setId: note.id,
      });
      setError(null);
    } catch (err) {
      setLikedIds(previousLikedIds);
      setNote((prev) => (prev ? { ...prev, liked: note.liked, likes: note.likes } : prev));
      setError(err instanceof Error ? err.message : '点赞失败');
    } finally {
      setLiking(false);
    }
  }

  async function toggleCollect() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!note || collecting) return;

    const previousCollectedIds = new Set(collectedIds);
    const nextCollected = !note.collected;
    const nextCollects = Math.max(0, note.collects + (nextCollected ? 1 : -1));
    const nextCollectedIds = setContentRef(previousCollectedIds, 'note', note.id, nextCollected);

    setCollecting(true);
    setCollectedIds(nextCollectedIds);
    setNote((prev) => (prev ? { ...prev, collected: nextCollected, collects: nextCollects } : prev));

    try {
      await postJson('/user/addCollectNote', {
        collectsArr: Array.from(nextCollectedIds).join(','),
        account: user.account,
        num: nextCollects,
        setId: note.id,
      });
      setError(null);
    } catch (err) {
      setCollectedIds(previousCollectedIds);
      setNote((prev) => (prev ? { ...prev, collected: note.collected, collects: note.collects } : prev));
      setError(err instanceof Error ? err.message : '收藏失败');
    } finally {
      setCollecting(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [id, user?.account]);

  useEffect(() => {
    if (!commentVisible) return;
    const keyboardSub = Keyboard.addListener('keyboardDidHide', () => {
      setReplyingTo(null);
      setCommentVisible(false);
    });

    return () => keyboardSub.remove();
  }, [commentVisible]);

  useEffect(() => {
    const imageUris = note?.imageUris ?? [];
    imageUris.forEach((uri) => {
      if (imageSizes[uri]) return;

      RNImage.getSize(
        uri,
        (imageWidth, imageHeight) => {
          setImageSizes((prev) => {
            if (prev[uri]) return prev;
            return {
              ...prev,
              [uri]: { width: imageWidth, height: imageHeight },
            };
          });
        },
        () => {
          setImageSizes((prev) => {
            if (prev[uri]) return prev;
            return {
              ...prev,
              [uri]: { width: 3, height: 4 },
            };
          });
        }
      );
    });
  }, [note?.imageUris, imageSizes]);

  const realImages = note?.imageUris ?? [];
  const loopImages = useMemo(() => {
    if (!realImages.length) return [];
    if (realImages.length === 1) return realImages;
    return [realImages[realImages.length - 1], ...realImages, realImages[0]];
  }, [realImages]);

  useEffect(() => {
    if (!loopImages.length) return;
    const initialPage = realImages.length > 1 ? 1 : 0;
    const timer = setTimeout(() => {
      carouselRef.current?.scrollTo({ x: width * initialPage, animated: false });
    }, 0);

    return () => clearTimeout(timer);
  }, [loopImages, realImages.length, width]);

  const activeImageIndex = useMemo(() => {
    if (!realImages.length) return 0;
    return currentPage;
  }, [currentPage, realImages.length]);

  const activeImageUri = realImages[activeImageIndex];
  const activeImageSize = activeImageUri ? imageSizes[activeImageUri] : undefined;
  const carouselHeight = activeImageSize
    ? Math.min(Math.max((width * activeImageSize.height) / Math.max(activeImageSize.width, 1), 240), 680)
    : Math.min(Math.max(width * 1.18, 240), 680);
  const totalCommentCount = useMemo(
    () => (note?.comments ?? []).reduce((total, comment) => total + 1 + comment.replies.length, 0),
    [note?.comments]
  );

  function handleCarouselMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!loopImages.length) return;

    const rawPage = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));

    if (realImages.length <= 1) {
      setCurrentPage(0);
      return;
    }

    if (rawPage === 0) {
      setCurrentPage(realImages.length - 1);
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({ x: width * realImages.length, animated: false });
      });
      return;
    }

    if (rawPage === loopImages.length - 1) {
      setCurrentPage(0);
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({ x: width, animated: false });
      });
      return;
    }

    setCurrentPage(rawPage - 1);
  }

  async function toggleHidden() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!note || note.account !== user.account || pendingHidden) return;

    const previousHidden = note.hidden;
    const nextHidden = !previousHidden;
    setNote((prev) => (prev ? { ...prev, hidden: nextHidden } : prev));
    setHiddenPromptVisible(false);
    setPendingHidden(true);

    try {
      const { result } = await postJson<{ hidden?: boolean }>('/content/toggleHidden', {
        account: user.account,
        id: note.id,
        contentType: 'note',
        hidden: nextHidden,
      });
      let finalHidden = nextHidden;
      if (typeof result?.hidden === 'boolean') {
        finalHidden = Boolean(result.hidden);
        setNote((prev) => (prev ? { ...prev, hidden: Boolean(result.hidden) } : prev));
      }
      setError(null);
      feedback.toast(finalHidden ? '笔记已隐藏' : '笔记已取消隐藏');
    } catch (err) {
      setNote((prev) => (prev ? { ...prev, hidden: previousHidden } : prev));
      setError(err instanceof Error ? err.message : '隐藏设置失败');
    } finally {
      setPendingHidden(false);
    }
  }

  async function deleteNote() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!note || note.account !== user.account || pendingDelete) return;

    setPendingDelete(true);
    try {
      await postJson('/content/delete', {
        account: user.account,
        id: note.id,
        contentType: 'note',
        deleteFiles: true,
      });
      setError(null);
      setDeletePromptVisible(false);
      feedback.toast('笔记已删除');
      router.replace('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setPendingDelete(false);
    }
  }

  function openReply(target: NoteComment | NoteReply) {
    if (!user?.account) {
      router.push('/login');
      return;
    }

    const replyTarget: ReplyTarget =
      'parentId' in target
        ? {
            parentId: target.parentId,
            parentIndex: target.parentIndex,
            parentLocalKey: target.parentLocalKey,
            replyToName: target.name,
            replyToAccount: target.account,
          }
        : {
            parentId: target.id,
            parentIndex: target.index,
            parentLocalKey: target.localKey,
            replyToName: target.name,
            replyToAccount: target.account,
          };

    setReplyingTo(replyTarget);
    setCommentVisible(true);
    setTimeout(() => commentInputRef.current?.focus(), 80);
  }

  function renderCommentLike(comment: NoteComment | NoteReply) {
    const liked = comment.liked;
    const pending = commentLikingIds.has(comment.localKey);
    const LikeIcon = liked ? LikedIcon : UnlikedIcon;

    return (
      <Pressable
        style={[styles.commentLikeBtn, pending ? styles.commentLikePending : null]}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel={liked ? '取消评论点赞' : '点赞评论'}
        onPress={() => void toggleCommentLike(comment)}>
        <LikeIcon width={18} height={18} color={liked ? '#FF2442' : muted} />
        {comment.likeCount > 0 ? (
          <ThemedText style={[styles.commentLikeText, { color: liked ? '#FF2442' : muted }]}>
            {comment.likeCount}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  }

  function renderReply(reply: NoteReply) {
    return (
      <View key={reply.localKey} style={styles.replyItem}>
        <View style={styles.replyTop}>
          <ThemedText style={styles.replyName}>
            {reply.name}
            {reply.replyToName ? <ThemedText style={styles.replyTo}> 回复 {reply.replyToName}</ThemedText> : null}
          </ThemedText>
          {renderCommentLike(reply)}
        </View>
        <ThemedText style={styles.replyText}>{reply.text}</ThemedText>
        <View style={styles.commentMetaRow}>
          <ThemedText style={[styles.metaText, { color: muted }]}>{[reply.date, reply.location].filter(Boolean).join(' · ')}</ThemedText>
          <Pressable onPress={() => openReply(reply)}>
            <ThemedText style={[styles.replyActionText, { color: muted }]}>回复</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: () =>
            note ? (
              <View style={styles.headerUser}>
                <ExpoImage source={avatarSource(note.authorAvatar)} style={styles.headerAvatar} contentFit="cover" />
                <ThemedText style={styles.headerName}>{note.authorName}</ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.headerName}>笔记详情</ThemedText>
            ),
          headerRight: () =>
            isOwnNote ? (
              <Pressable hitSlop={12} style={styles.headerMoreBtn} onPress={openSettingsSheet}>
                <MoreIcon width={25} height={25} color="#20242B" />
              </Pressable>
            ) : null,
        }}
      />
      <ThemedView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.stateBlock}>
              <AppActivityIndicator label="正在加载笔记" />
            </View>
          ) : error && !note ? (
            <View style={styles.stateBlock}>
              <ThemedText style={[styles.stateText, { color: muted }]}>{error}</ThemedText>
              <Pressable style={[styles.retryBtn, { borderColor: border }]} onPress={() => void loadDetail()}>
                <ThemedText style={styles.retryText}>重试</ThemedText>
              </Pressable>
            </View>
          ) : note ? (
            <>
              {loopImages.length ? (
                <View style={[styles.carouselShell, { height: carouselHeight }]}>
                  <ScrollView
                    ref={carouselRef}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={handleCarouselMomentumEnd}>
                    {loopImages.map((imageUri, index) => (
                      <View key={`image-${index}-${imageUri}`} style={{ width, height: carouselHeight }}>
                        <ExpoImage source={{ uri: imageUri }} style={styles.heroImage} contentFit="contain" />
                      </View>
                    ))}
                  </ScrollView>
                  {realImages.length > 1 ? (
                    <View style={styles.paginationWrap}>
                      <View style={styles.paginationBadge}>
                        <ThemedText style={styles.paginationText}>{activeImageIndex + 1}/{realImages.length}</ThemedText>
                      </View>
                      <View style={styles.paginationDots}>
                        {realImages.map((imageUri, index) => (
                          <View
                            key={`dot-${index}-${imageUri}`}
                            style={[styles.paginationDot, index === activeImageIndex ? styles.paginationDotActive : null]}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.heroFallback, styles.imageFallback, { width, height: carouselHeight }]} />
              )}

              <View style={styles.contentBlock}>
                <ThemedText type="title" style={styles.title}>{note.title}</ThemedText>
                {note.brief ? <ThemedText style={styles.brief}>{note.brief}</ThemedText> : null}
                <View style={styles.summaryRow}>
                  <ThemedText style={[styles.metaText, { color: muted }]}>获赞 {note.likes}</ThemedText>
                  <ThemedText style={[styles.metaText, { color: muted }]}>收藏 {note.collects}</ThemedText>
                  <ThemedText style={[styles.metaText, { color: muted }]}>评论 {totalCommentCount}</ThemedText>
                </View>
              </View>

              <View style={styles.dateBlock}>
                <ThemedText style={[styles.metaText, { color: muted }]}>{note.date}</ThemedText>
              </View>

              <View style={[styles.commentHeader, { borderTopColor: border, borderBottomColor: border }]}>
                <ThemedText style={styles.commentTitle}>全部评论</ThemedText>
              </View>

              {note.comments.length ? (
                note.comments.map((item, index) => (
                  <View key={item.localKey} style={[styles.commentCard, { borderBottomColor: border }]}>
                    <ExpoImage source={avatarSource(item.avatarUri)} style={styles.commentAvatar} contentFit="cover" />
                    <View style={styles.commentBody}>
                      <View style={styles.commentTop}>
                        <ThemedText style={styles.commentName}>{item.name}</ThemedText>
                        {renderCommentLike(item)}
                      </View>
                      <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                      <View style={styles.commentMetaRow}>
                        <ThemedText style={[styles.metaText, { color: muted }]}>{[item.date, item.location].filter(Boolean).join(' · ')}</ThemedText>
                        <Pressable onPress={() => openReply(item)}>
                          <ThemedText style={[styles.replyActionText, { color: muted }]}>回复</ThemedText>
                        </Pressable>
                      </View>
                      {item.replies.length ? <View style={styles.replyList}>{item.replies.map(renderReply)}</View> : null}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyBlock}>
                  <ThemedText style={[styles.stateText, { color: muted }]}>还没有评论</ThemedText>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>

        {error && note ? (
          <View style={styles.inlineError}>
            <ThemedText style={[styles.stateText, { color: '#FF2442' }]}>{error}</ThemedText>
          </View>
        ) : null}

        <View style={[styles.inputBar, { borderTopColor: border, backgroundColor: '#FFFFFF' }]}>
          <Pressable
            style={[styles.inputGhost, { borderColor: border }]}
            onPress={() => {
              setReplyingTo(null);
              setCommentVisible(true);
            }}>
            <ThemedText style={[styles.inputGhostText, { color: muted }]}>{user ? '说点什么...' : '登录后可评论'}</ThemedText>
          </Pressable>
          <Pressable style={[styles.actionBtn, { opacity: liking ? 0.6 : 1 }]} disabled={liking} onPress={() => void toggleLike()}>
            {note?.liked ? <LikedIcon width={22} height={22} color="#FF2442" /> : <UnlikedIcon width={22} height={22} color={muted} />}
            <ThemedText style={[styles.actionText, { color: note?.liked ? '#FF2442' : muted }]}>{note?.likes ? note.likes : '点赞'}</ThemedText>
          </Pressable>
          <Pressable style={[styles.actionBtn, { opacity: collecting ? 0.6 : 1 }]} disabled={collecting} onPress={() => void toggleCollect()}>
            {note?.collected ? <CollectedIcon width={22} height={22} color="#FF2442" /> : <UncollectedIcon width={22} height={22} color={muted} />}
            <ThemedText style={[styles.actionText, { color: note?.collected ? '#FF2442' : muted }]}>{note?.collects ? note.collects : '收藏'}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { opacity: submitting ? 0.6 : 1 }]}
            disabled={submitting}
            onPress={() => {
              setReplyingTo(null);
              setCommentVisible(true);
            }}>
            <CommentIcon width={22} height={22} color={muted} />
            <ThemedText style={[styles.actionText, { color: muted }]}>{totalCommentCount ? totalCommentCount : '评论'}</ThemedText>
          </Pressable>
        </View>

        <Modal
          visible={commentVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setReplyingTo(null);
            setCommentVisible(false);
          }}
          onShow={() => {
            if (!user?.account) return;
            setTimeout(() => commentInputRef.current?.focus(), 80);
          }}>
          <Pressable
            style={styles.mask}
            onPress={() => {
              setReplyingTo(null);
              setCommentVisible(false);
            }}
          />
          <View style={styles.commentPanel}>
            <View style={styles.panelHeader}>
              <ThemedText style={styles.panelTitle}>共 {totalCommentCount} 条评论</ThemedText>
              <Pressable
                onPress={() => {
                  setReplyingTo(null);
                  setCommentVisible(false);
                }}>
                <ThemedText style={[styles.metaText, { color: muted }]}>关闭</ThemedText>
              </Pressable>
            </View>

            <FlatList
              data={note?.comments ?? []}
              keyExtractor={(item) => item.localKey}
              contentContainerStyle={styles.panelList}
              ListEmptyComponent={<ThemedText style={[styles.stateText, { color: muted }]}>还没有评论，快来抢沙发</ThemedText>}
              renderItem={({ item }) => (
                <View style={styles.panelCommentItem}>
                  <ExpoImage source={avatarSource(item.avatarUri)} style={styles.panelCommentAvatar} contentFit="cover" />
                  <View style={styles.panelCommentMain}>
                    <ThemedText style={styles.panelCommentName}>{item.name}</ThemedText>
                    <ThemedText style={styles.panelCommentText}>{item.text}</ThemedText>
                    <View style={styles.commentMetaRow}>
                      <ThemedText style={[styles.metaText, { color: muted }]}>{[item.date, item.location].filter(Boolean).join(' · ')}</ThemedText>
                      <Pressable onPress={() => openReply(item)}>
                        <ThemedText style={[styles.replyActionText, { color: muted }]}>回复</ThemedText>
                      </Pressable>
                    </View>
                    {item.replies.length ? <View style={styles.panelReplyList}>{item.replies.map(renderReply)}</View> : null}
                  </View>
                  {renderCommentLike(item)}
                </View>
              )}
            />

            <View style={styles.panelInputRow}>
              <TextInput
                ref={commentInputRef}
                style={styles.panelInput}
                editable={Boolean(user) && !submitting}
                placeholder={user ? (replyingTo ? `回复 ${replyingTo.replyToName}` : '写下你的评论...') : '登录后可评论'}
                placeholderTextColor={muted}
                value={commentText}
                onChangeText={(text) => {
                  if (error) setError(null);
                  setCommentText(text);
                }}
              />
              <Pressable
                style={[styles.sendBtn, { opacity: user && commentText.trim() && !submitting ? 1 : 0.5 }]}
                disabled={submitting}
                onPress={() => {
                  if (!user) {
                    router.push('/login');
                    return;
                  }
                  void submitComment();
                }}>
                <ThemedText style={styles.sendText}>{submitting ? '发送中' : '发送'}</ThemedText>
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
                <ThemedText style={styles.settingsTitle}>笔记设置</ThemedText>
                <Pressable hitSlop={12} style={styles.settingsCloseBtn} onPress={closeSettingsSheet}>
                  <Feather name="x" size={28} color="#3C3C3F" />
                </Pressable>
              </View>
              <View style={styles.settingsActions}>
                <SettingsAction icon="edit-3" label="编辑" onPress={closeSettingsSheet} />
                <SettingsAction icon="arrow-up-circle" label="置顶" onPress={closeSettingsSheet} />
                <SettingsAction icon={note?.hidden ? 'eye' : 'eye-off'} label={note?.hidden ? '取消隐藏' : '隐藏笔记'} onPress={openHiddenPrompt} />
                <SettingsAction icon="trash-2" label="删除" danger onPress={openDeletePrompt} />
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={hiddenPromptVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHiddenPromptVisible(false)}>
          <View style={styles.hiddenPromptRoot}>
            <Pressable style={styles.hiddenPromptBackdrop} onPress={() => setHiddenPromptVisible(false)} />
            <View style={styles.hiddenPromptBox}>
              <ThemedText style={styles.hiddenPromptTitle}>{note?.hidden ? '取消隐藏笔记' : '隐藏笔记'}</ThemedText>
              <ThemedText style={styles.hiddenPromptDesc}>
                {note?.hidden ? '取消隐藏后，其他用户可以重新看到这个笔记。' : '隐藏后，这个笔记将不会展示给其他用户。'}
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
              <ThemedText style={styles.hiddenPromptTitle}>删除笔记</ThemedText>
              <ThemedText style={styles.hiddenPromptDesc}>删除后将同时移除数据库记录和本地图片文件，且无法恢复。</ThemedText>
              <View style={styles.hiddenPromptActions}>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptCancel]} onPress={() => setDeletePromptVisible(false)} disabled={pendingDelete}>
                  <ThemedText style={styles.hiddenPromptCancelText}>取消</ThemedText>
                </Pressable>
                <Pressable style={[styles.hiddenPromptBtn, styles.hiddenPromptDanger]} onPress={() => void deleteNote()} disabled={pendingDelete}>
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

function SettingsAction({
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
  safe: { flex: 1 },
  root: { flex: 1 },
  scrollContent: { paddingBottom: 96 },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerName: { fontSize: 16, fontWeight: '600' },
  headerMoreBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  stateBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 12 },
  stateText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: '600' },
  avatarFallback: { backgroundColor: '#E5E5EA' },
  carouselShell: { backgroundColor: '#0F0F10' },
  heroImage: { width: '100%', height: '100%', backgroundColor: '#0F0F10' },
  heroFallback: { backgroundColor: '#E5E5EA' },
  imageFallback: { backgroundColor: '#E5E5EA' },
  paginationWrap: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center', gap: 10 },
  paginationBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  paginationText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  paginationDots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paginationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  paginationDotActive: { width: 18, backgroundColor: '#FFFFFF' },
  contentBlock: { padding: 16, gap: 10 },
  title: { fontSize: 22 },
  brief: { fontSize: 15, lineHeight: 24 },
  summaryRow: { flexDirection: 'row', gap: 16 },
  metaText: { fontSize: 12 },
  dateBlock: { paddingHorizontal: 16, paddingBottom: 12 },
  commentHeader: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  commentTitle: { fontSize: 16, fontWeight: '600' },
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  commentCard: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentBody: { flex: 1, gap: 6 },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  commentName: { fontSize: 14, fontWeight: '600' },
  commentText: { fontSize: 14, lineHeight: 22, color: '#1F2329' },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  replyActionText: { fontSize: 12, fontWeight: '600' },
  replyList: { marginTop: 4, gap: 8, borderRadius: 8, backgroundColor: '#F7F8FA', padding: 10 },
  replyItem: { gap: 4 },
  replyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  replyName: { flex: 1, color: '#5A6270', fontSize: 13, fontWeight: '600' },
  replyTo: { color: '#8E8E93', fontSize: 13, fontWeight: '500' },
  replyText: { color: '#1F2329', fontSize: 13, lineHeight: 19 },
  commentLikeBtn: { minWidth: 34, minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingLeft: 8 },
  commentLikeText: { fontSize: 12, fontWeight: '600' },
  commentLikePending: { opacity: 0.6 },
  inlineError: { paddingHorizontal: 16, paddingBottom: 8 },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputGhost: { flex: 1, minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 21, paddingHorizontal: 14, justifyContent: 'center' },
  inputGhostText: { fontSize: 14 },
  actionBtn: { minWidth: 62, height: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, flexDirection: 'row', gap: 4 },
  actionText: { fontSize: 15, fontWeight: '700' },
  mask: { flex: 1, backgroundColor: 'transparent' },
  commentPanel: { maxHeight: '70%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEC' },
  panelTitle: { fontSize: 15, fontWeight: '700', color: '#1D1F24' },
  panelList: { paddingVertical: 10, gap: 12 },
  panelCommentItem: { flexDirection: 'row', gap: 10 },
  panelCommentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF1F6' },
  panelCommentMain: { flex: 1, gap: 4 },
  panelCommentName: { color: '#5A6270', fontSize: 13 },
  panelCommentText: { color: '#1F2329', fontSize: 14, lineHeight: 20 },
  panelReplyList: { marginTop: 4, gap: 8, borderRadius: 8, backgroundColor: '#F7F8FA', padding: 10 },
  panelInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECECEC', paddingTop: 10 },
  panelInput: { flex: 1, height: 40, borderRadius: 20, backgroundColor: '#F5F6F8', paddingHorizontal: 12, fontSize: 14, color: '#1F2329' },
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
