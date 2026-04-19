import { Image as ExpoImage } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { postJson, postPublicJson } from '@/lib/post-json';
import CommentIcon from '@/public/icon/pinglun.svg';
import CollectedIcon from '@/public/icon/shoucang.svg';
import UncollectedIcon from '@/public/icon/shoucang_1.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';

type NoteCommentDto = {
  id?: number | string;
  account?: string;
  name?: string;
  text?: string;
  avatar?: string;
  likeCount?: number | string;
  location?: string;
  date?: string;
};

type NoteDetailDto = {
  id: number | string;
  title?: string;
  brief?: string;
  image?: string;
  account?: string;
  likes?: number | string;
  collects?: number | string;
  date?: string;
  name?: string;
  url?: string;
  comments?: NoteCommentDto[];
};

type UserInfoDto = {
  likes?: string;
  collects?: string;
};

type NoteComment = {
  id: string;
  name: string;
  text: string;
  avatarUri?: string;
  likeCount: number;
  date: string;
  location: string;
};

type NoteDetail = {
  id: string;
  title: string;
  brief: string;
  imageUris: string[];
  likes: number;
  collects: number;
  liked: boolean;
  collected: boolean;
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

function mapComments(items: NoteCommentDto[] | undefined): NoteComment[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: String(item.id ?? index),
    name: String(item.name || item.account || '用户'),
    text: String(item.text || ''),
    avatarUri: resolveMediaUrl(typeof item.avatar === 'string' ? item.avatar : undefined),
    likeCount: Number(item.likeCount || 0),
    date: String(item.date || ''),
    location: String(item.location || ''),
  }));
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
    title: String(note.title || '未命名笔记'),
    brief: String(note.brief || ''),
    imageUris,
    likes: Number(note.likes || 0),
    collects: Number(note.collects || 0),
    liked: likedIds.has(noteId),
    collected: collectedIds.has(noteId),
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
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [imageSizes, setImageSizes] = useState<ImageSizeMap>({});

  async function loadDetail(isRefresh = false) {
    if (!id) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [detailRes, userInfoRes] = await Promise.all([
        postPublicJson<NoteDetailDto>('/noteDetail', { id }),
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
      const { result } = await postJson<NoteCommentDto>('/upload/addComment', {
        id: note.id,
        account: user.account,
        name: user.name || user.account,
        text,
        avatar: user.url || '',
        likeCount: 0,
        location: '',
        date: new Date().toISOString().slice(0, 10),
      });

      setCommentText('');
      setCommentVisible(false);
      setError(null);

      if (result) {
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

  async function toggleLike() {
    if (!user?.account) {
      router.push('/login');
      return;
    }
    if (!note || liking) return;

    const previousLikedIds = new Set(likedIds);
    const nextLiked = !note.liked;
    const nextLikes = Math.max(0, note.likes + (nextLiked ? 1 : -1));
    const nextLikedIds = new Set(previousLikedIds);
    if (nextLiked) nextLikedIds.add(note.id);
    else nextLikedIds.delete(note.id);

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
    const nextCollectedIds = new Set(previousCollectedIds);
    if (nextCollected) nextCollectedIds.add(note.id);
    else nextCollectedIds.delete(note.id);

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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: () =>
            note ? (
              <View style={styles.headerUser}>
                {note.authorAvatar ? (
                  <ExpoImage source={{ uri: note.authorAvatar }} style={styles.headerAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.headerAvatar, styles.avatarFallback]} />
                )}
                <ThemedText style={styles.headerName}>{note.authorName}</ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.headerName}>笔记详情</ThemedText>
            ),
        }}
      />
      <ThemedView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator />
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
                  <ThemedText style={[styles.metaText, { color: muted }]}>评论 {note.comments.length}</ThemedText>
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
                  <View key={`${item.id}-${index}`} style={[styles.commentCard, { borderBottomColor: border }]}>
                    {item.avatarUri ? (
                      <ExpoImage source={{ uri: item.avatarUri }} style={styles.commentAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.commentAvatar, styles.avatarFallback]} />
                    )}
                    <View style={styles.commentBody}>
                      <View style={styles.commentTop}>
                        <ThemedText style={styles.commentName}>{item.name}</ThemedText>
                        <ThemedText style={[styles.metaText, { color: muted }]}>赞 {item.likeCount}</ThemedText>
                      </View>
                      <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                      <ThemedText style={[styles.metaText, { color: muted }]}>{[item.date, item.location].filter(Boolean).join(' · ')}</ThemedText>
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
          <Pressable style={[styles.inputGhost, { borderColor: border }]} onPress={() => setCommentVisible(true)}>
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
              setCommentVisible(true);
            }}>
            <CommentIcon width={22} height={22} color={muted} />
            <ThemedText style={[styles.actionText, { color: muted }]}>{note?.comments.length ? note.comments.length : '评论'}</ThemedText>
          </Pressable>
        </View>

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
            <View style={styles.panelHeader}>
              <ThemedText style={styles.panelTitle}>共 {note?.comments.length ?? 0} 条评论</ThemedText>
              <Pressable onPress={() => setCommentVisible(false)}>
                <ThemedText style={[styles.metaText, { color: muted }]}>关闭</ThemedText>
              </Pressable>
            </View>

            <FlatList
              data={note?.comments ?? []}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              contentContainerStyle={styles.panelList}
              ListEmptyComponent={<ThemedText style={[styles.stateText, { color: muted }]}>还没有评论，快来抢沙发</ThemedText>}
              renderItem={({ item }) => (
                <View style={styles.panelCommentItem}>
                  {item.avatarUri ? (
                    <ExpoImage source={{ uri: item.avatarUri }} style={styles.panelCommentAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.panelCommentAvatar, styles.avatarFallback]} />
                  )}
                  <View style={styles.panelCommentMain}>
                    <ThemedText style={styles.panelCommentName}>{item.name}</ThemedText>
                    <ThemedText style={styles.panelCommentText}>{item.text}</ThemedText>
                    <ThemedText style={[styles.metaText, { color: muted }]}>{[item.date, item.location].filter(Boolean).join(' · ')}</ThemedText>
                  </View>
                </View>
              )}
            />

            <View style={styles.panelInputRow}>
              <TextInput
                ref={commentInputRef}
                style={styles.panelInput}
                editable={Boolean(user) && !submitting}
                placeholder={user ? '写下你的评论...' : '登录后可评论'}
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
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  scrollContent: { paddingBottom: 96 },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerName: { fontSize: 16, fontWeight: '600' },
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
  panelInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECECEC', paddingTop: 10 },
  panelInput: { flex: 1, height: 40, borderRadius: 20, backgroundColor: '#F5F6F8', paddingHorizontal: 12, fontSize: 14, color: '#1F2329' },
  sendBtn: { width: 64, height: 36, borderRadius: 18, backgroundColor: '#FF4F72', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
