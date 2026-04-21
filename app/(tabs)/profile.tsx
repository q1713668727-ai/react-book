import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { postJson } from '@/lib/post-json';
import MenuIcon from '@/public/icon/mulu.svg';
import ShareIcon from '@/public/icon/fenxiang.svg';
import SettingsIcon from '@/public/icon/shezhi.svg';
import MenIcon from '@/public/icon/men-line.svg';
import WomenIcon from '@/public/icon/women-line.svg';
import LikedIcon from '@/public/icon/xihuan.svg';
import UnlikedIcon from '@/public/icon/xihuan_1.svg';
import type { AuthUser } from '@/types/auth';

const defaultAvatar = require('../../public/image/avatar.jpg');
const emptyNoteImage = require('../../public/image/null.png');
const emptyCollectImage = require('../../public/image/collect.png');

type SideMenuItem = {
  title: string;
  icon: string;
  family?: 'feather' | 'material';
  route?: '/find' | '/settings';
};

const SIDE_MENU_ITEMS: SideMenuItem[] = [
  { title: '发现好友', icon: 'user-plus', route: '/find' },
  { title: '浏览记录', icon: 'clock' },
  { title: '钱包', icon: 'credit-card' },
  { title: '好物体验', icon: 'gift' },
  { title: '订单', icon: 'clipboard' },
  { title: '购物车', icon: 'shopping-cart' },
  { title: '卡券', icon: 'ticket-percent-outline', family: 'material' },
  { title: '心愿单', icon: 'calendar-heart', family: 'material' },
  { title: '账号会员', icon: 'shield-check-outline', family: 'material' },
];

const SIDE_MENU_FOOTER_ITEMS: SideMenuItem[] = [
  { title: '设置', icon: 'settings', route: '/settings' },
  { title: '客服', icon: 'headphones' },
  { title: '扫一扫', icon: 'scan' },
];

type ProfileTab = 'notes' | 'collections';

type ProfileUserResponse = AuthUser & {
  collects?: string;
  likes?: string;
  background?: string;
  attention?: number | string;
  fans?: number | string;
  about?: string;
  birthday?: string;
  sex?: string;
  occupation?: string;
  district?: string;
  school?: string;
};

type ProfileNoteDto = {
  id: number | string;
  image?: string;
  cover?: string;
  title?: string;
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

type ProfileNoteResponse = {
  data?: ProfileNoteDto[];
};

type ProfileNote = {
  id: string;
  rawId: string;
  contentType: 'note' | 'video';
  imageUri?: string;
  videoUri?: string;
  title: string;
  likes: number;
  authorName: string;
  authorAvatar?: string;
  liked: boolean;
};

const GAP = 8;
const OPTION_FIELDS = {
  sex: ['男', '女', '保密'],
  occupation: ['学生', '互联网', '设计', '教育', '自由职业'],
  school: ['家里蹲大学', '北京大学', '清华大学', '复旦大学', '浙江大学'],
} as const;

type EditableField = 'name' | 'about' | 'email' | 'birthday' | 'district' | 'sex' | 'occupation' | 'school';
type TextEditTarget = {
  field: Extract<EditableField, 'name' | 'about' | 'email' | 'birthday' | 'district'>;
  title: string;
  value: string;
  multiline?: boolean;
} | null;
type OptionEditTarget = {
  field: keyof typeof OPTION_FIELDS;
  title: string;
  value: string;
} | null;
type DateDraft = {
  year: number;
  month: number;
  day: number;
};
type RegionDraft = {
  province: string;
  city: string;
  district: string;
};

const CURRENT_YEAR = new Date().getFullYear();
const BIRTHDAY_YEARS = Array.from({ length: 90 }, (_, index) => CURRENT_YEAR - index);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const REGION_DATA = [
  { province: '北京', cities: [{ city: '北京', districts: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '通州区'] }] },
  { province: '上海', cities: [{ city: '上海', districts: ['黄浦区', '徐汇区', '静安区', '浦东新区', '闵行区', '松江区'] }] },
  { province: '广东', cities: [{ city: '广州', districts: ['越秀区', '天河区', '海珠区', '番禺区'] }, { city: '深圳', districts: ['福田区', '南山区', '罗湖区', '宝安区'] }] },
  { province: '浙江', cities: [{ city: '杭州', districts: ['上城区', '西湖区', '滨江区', '萧山区'] }, { city: '宁波', districts: ['海曙区', '江北区', '鄞州区'] }] },
  { province: '江苏', cities: [{ city: '南京', districts: ['玄武区', '秦淮区', '鼓楼区', '建邺区'] }, { city: '苏州', districts: ['姑苏区', '吴中区', '工业园区'] }] },
] as const;

function parseIdList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function countFromCsv(value: unknown): number {
  return parseIdList(value).length;
}

function toNum(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function ageFromBirthday(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  const birthday = new Date(text.replace(/\./g, '-').replace(/\//g, '-'));
  if (Number.isNaN(birthday.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birthday.getFullYear();
  const passedBirthday =
    now.getMonth() > birthday.getMonth() ||
    (now.getMonth() === birthday.getMonth() && now.getDate() >= birthday.getDate());
  if (!passedBirthday) age -= 1;
  return age >= 0 && age < 130 ? `${age}岁` : '';
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseBirthday(value: unknown): DateDraft {
  const text = String(value || '').trim();
  const matched = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const year = matched ? Number(matched[1]) : 1990;
  const month = matched ? Number(matched[2]) : 1;
  const maxDay = daysInMonth(year, month);
  const day = matched ? Math.min(Math.max(Number(matched[3]), 1), maxDay) : 1;
  return {
    year: BIRTHDAY_YEARS.includes(year) ? year : 1990,
    month: month >= 1 && month <= 12 ? month : 1,
    day,
  };
}

function formatBirthday(value: DateDraft) {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function parseRegion(value: unknown): RegionDraft {
  const text = String(value || '').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  const fallback = REGION_DATA[0];
  const province = REGION_DATA.find((item) => item.province === parts[0]) ?? fallback;
  const city = province.cities.find((item) => item.city === parts[1]) ?? province.cities[0];
  const district = city.districts.includes(parts[2] as never) ? parts[2] : city.districts[0];
  return { province: province.province, city: city.city, district };
}

function formatRegion(value: RegionDraft) {
  return `${value.province} ${value.city} ${value.district}`;
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

function toVideoUri(item: ProfileNoteDto, firstImage: string) {
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

function toVideoCoverUri(item: ProfileNoteDto) {
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

function toAuthorAvatar(item: ProfileNoteDto, fallbackAvatar?: string) {
  const avatar = String(item.authorAvatar || item.avatar || fallbackAvatar || item.url || '').trim();
  if (!avatar || isVideoFileName(avatar)) return undefined;
  return resolveMediaUrl(toMediaPath(avatar));
}

function toProfileNote(item: ProfileNoteDto, likedIds: Set<string>, fallbackAvatar?: string): ProfileNote {
  const contentType = String(item.contentType || '').toLowerCase() === 'video' ? 'video' : 'note';
  const rawId = String(item.id);
  const itemId = String(item.feedKey || `${contentType}-${rawId}`);
  const firstImage = String(item.image ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const videoUri = contentType === 'video' ? toVideoUri(item, firstImage) : undefined;
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
    imageUri,
    videoUri,
    title: String(item.title || '未命名笔记'),
    likes: Number(item.likes || 0),
    authorName: String(item.authorName || item.name || item.account || '用户'),
    authorAvatar: toAuthorAvatar(item, fallbackAvatar),
    liked: likedIds.has(itemId) || likedIds.has(rawId),
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const { width } = useWindowDimensions();
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
  const [editVisible, setEditVisible] = useState(false);
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [textEdit, setTextEdit] = useState<TextEditTarget>(null);
  const [textDraft, setTextDraft] = useState('');
  const [optionEdit, setOptionEdit] = useState<OptionEditTarget>(null);
  const [birthdayPickerVisible, setBirthdayPickerVisible] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState<DateDraft>(() => parseBirthday('1990-01-01'));
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);
  const [regionDraft, setRegionDraft] = useState<RegionDraft>(() => parseRegion('北京 北京 东城区'));
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const [sideMenuVisible, setSideMenuVisible] = useState(false);
  const slideX = useRef(new Animated.Value(0)).current;
  const sideMenuX = useRef(new Animated.Value(-width)).current;
  const thumbPendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;
    const targets = [...notes, ...collections].filter(
      (item) => item.contentType === 'video' && item.videoUri && !videoThumbs[item.id] && !thumbPendingRef.current.has(item.id)
    );
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
  }, [notes, collections, videoThumbs]);

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
      const [{ result: profileResult }, { result: noteResult }, { result: collectResult }] = await Promise.all([
        postJson<ProfileUserResponse>('/user/getUserInfo', { account: user.account }),
        postJson<ProfileNoteResponse>('/user/myNote', { account: user.account }),
        postJson<ProfileNoteResponse>('/user/findCollectNote', { account: user.account }),
      ]);

      const nextLikedIds = new Set(parseIdList(profileResult?.likes));
      const authorAvatar = typeof profileResult?.url === 'string' ? profileResult.url : typeof user.url === 'string' ? user.url : undefined;
      setProfile(profileResult ?? null);
      setLikedIds(nextLikedIds);
      setNotes(Array.isArray(noteResult?.data) ? noteResult.data.map((item) => toProfileNote(item, nextLikedIds, authorAvatar)) : []);
      setCollections(
        Array.isArray(collectResult?.data) ? collectResult.data.map((item) => toProfileNote(item, nextLikedIds)) : []
      );
      setLikeTotal(countFromCsv(profileResult?.likes) + countFromCsv(profileResult?.collects));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载个人主页失败');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoadingProfile(false);
    }
  }, [user?.account, user?.url]);

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
        setId: currentItem.rawId,
        contentType: currentItem.contentType,
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

  function openSideMenu() {
    setSideMenuVisible(true);
    sideMenuX.setValue(-width);
    Animated.timing(sideMenuX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function closeSideMenu(afterClose?: () => void) {
    Animated.timing(sideMenuX, {
      toValue: -width,
      duration: 190,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setSideMenuVisible(false);
      afterClose?.();
    });
  }

  function onSideMenuPress(item: SideMenuItem) {
    closeSideMenu(() => {
      if (item.route) router.push(item.route);
    });
  }

  function openEditPanel() {
    if (!user) {
      router.push('/login');
      return;
    }
    setEditMessage(null);
    setEditVisible(true);
    slideX.setValue(width);
    Animated.timing(slideX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function closeEditPanel() {
    Animated.timing(slideX, {
      toValue: width,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEditVisible(false);
    });
  }

  function openTextEdit(target: NonNullable<TextEditTarget>) {
    setTextEdit(target);
    setTextDraft(target.value);
    setEditMessage(null);
  }

  function openOptionEdit(target: NonNullable<OptionEditTarget>) {
    setOptionEdit(target);
    setEditMessage(null);
  }

  function openBirthdayPicker(value: string) {
    setBirthdayDraft(parseBirthday(value));
    setBirthdayPickerVisible(true);
    setEditMessage(null);
  }

  function openRegionPicker(value: string) {
    setRegionDraft(parseRegion(value));
    setRegionPickerVisible(true);
    setEditMessage(null);
  }

  async function saveProfileField(field: EditableField, value: string) {
    if (!user?.account) {
      router.push('/login');
      return false;
    }

    const data = value.trim();
    setSavingField(field);
    setEditMessage(null);
    try {
      await postJson('/setUserData', {
        account: user.account,
        type: field,
        data,
      });
      setProfile((prev) => {
        const base = prev ?? (user as ProfileUserResponse);
        return { ...base, [field]: data };
      });
      setEditMessage('保存成功');
      return true;
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : '保存失败');
      return false;
    } finally {
      setSavingField(null);
    }
  }

  async function confirmTextEdit() {
    if (!textEdit) return;
    if (textEdit.field === 'name' && !textDraft.trim()) {
      setEditMessage('请输入名字');
      return;
    }
    const ok = await saveProfileField(textEdit.field, textDraft);
    if (ok) setTextEdit(null);
  }

  async function confirmOptionEdit(value: string) {
    if (!optionEdit) return;
    const ok = await saveProfileField(optionEdit.field, value);
    if (ok) setOptionEdit(null);
  }

  async function confirmBirthdayPicker() {
    const ok = await saveProfileField('birthday', formatBirthday(birthdayDraft));
    if (ok) setBirthdayPickerVisible(false);
  }

  async function confirmRegionPicker() {
    const ok = await saveProfileField('district', formatRegion(regionDraft));
    if (ok) setRegionPickerVisible(false);
  }

  const currentUser = profile ?? user;
  const avatarUri = currentUser ? resolveMediaUrl(typeof currentUser.url === 'string' ? currentUser.url : undefined) : undefined;
  const bgUri = currentUser ? resolveMediaUrl(typeof currentUser.background === 'string' ? currentUser.background : undefined) : undefined;
  const displayName = currentUser ? String(currentUser.name || currentUser.account || '用户') : '游客';
  const accountLabel = currentUser?.account ? `小红书号：${currentUser.account}` : '小红书号：未设置';
  const displayBio = currentUser ? String(currentUser.about || currentUser.sign || '简单介绍一下自己吧！') : '简单介绍一下自己吧！';
  const sexText = String(currentUser?.sex || '男');
  const SexIcon = sexText === '女' ? WomenIcon : sexText === '男' ? MenIcon : null;
  const ageText = ageFromBirthday(currentUser?.birthday);
  const locationText = String(currentUser?.district || '中国北京');
  const visibleItems = activeTab === 'notes' ? notes : collections;
  const emptyText = activeTab === 'notes' ? '还没有发布笔记' : '还没有收藏内容';
  const emptyImage = activeTab === 'notes' ? emptyNoteImage : emptyCollectImage;
  const sideMenuWidth = width * 0.7;
  const panelWidth = Math.min(width, 460);
  const fieldValue = (field: keyof ProfileUserResponse, fallback = '') => String(currentUser?.[field] || fallback);
  const birthdayDays = Array.from({ length: daysInMonth(birthdayDraft.year, birthdayDraft.month) }, (_, index) => index + 1);
  const selectedProvince = REGION_DATA.find((item) => item.province === regionDraft.province) ?? REGION_DATA[0];
  const selectedCity = selectedProvince.cities.find((item) => item.city === regionDraft.city) ?? selectedProvince.cities[0];

  const stats = useMemo(
    () => ({
      notes: notes.length,
      collections: collections.length,
      likes: likeTotal,
      follow: toNum(currentUser?.attention),
      fans: toNum(currentUser?.fans),
    }),
    [notes.length, collections.length, likeTotal, currentUser?.attention, currentUser?.fans]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <FlatList
          data={visibleItems}
          keyExtractor={(item, index) => `${activeTab}-${item.id}-${index}`}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.gridContent}
          refreshing={refreshing}
          onRefresh={() => void loadProfileData(true)}
          ListHeaderComponent={
            <View>
              <View style={styles.hero}>
                {bgUri ? <Image source={{ uri: bgUri }} style={styles.heroBg} contentFit="cover" /> : null}
                <View style={styles.heroMask} />
                <View style={styles.heroTopRow}>
                  <Pressable style={styles.heroIconBtn} onPress={openSideMenu}>
                    <MenuIcon width={25} height={25} color="#FFF" />
                  </Pressable>
                  <Pressable style={styles.heroIconBtn} onPress={() => router.push('/search')}>
                    <ShareIcon width={24} height={24} color="#FFF" />
                  </Pressable>
                </View>

                <View style={styles.identityRow}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <Image source={defaultAvatar} style={styles.avatar} contentFit="cover" />
                  )}
                  <View style={styles.identityTextBlock}>
                    <ThemedText numberOfLines={1} style={styles.nickname}>{displayName}</ThemedText>
                    <ThemedText numberOfLines={1} style={styles.accountText}>{accountLabel}</ThemedText>
                    <ThemedText numberOfLines={2} style={styles.bio}>{displayBio}</ThemedText>
                  </View>
                </View>

                <View style={styles.profileTags}>
                  <View style={styles.profileTag}>
                    {SexIcon ? <SexIcon width={14} height={14} color="#7E8792" /> : null}
                    <ThemedText style={styles.profileTagText}>{ageText || '0岁'}</ThemedText>
                  </View>
                  <View style={styles.profileTag}>
                    <ThemedText numberOfLines={1} style={styles.profileTagText}>{locationText}</ThemedText>
                  </View>
                </View>

                {!isReady ? (
                  <ActivityIndicator style={styles.authLoading} />
                ) : user ? (
                  <View style={styles.profileActionRow}>
                    <View style={styles.userBar}>
                      <Pressable style={styles.watch} onPress={() => router.push('/follow-fans')}>
                        <ThemedText style={styles.watchNum}>{stats.follow}</ThemedText>
                        <ThemedText style={styles.watchText}>关注</ThemedText>
                      </Pressable>
                      <Pressable style={styles.watch} onPress={() => router.push('/follow-fans?tab=fans')}>
                        <ThemedText style={styles.watchNum}>{stats.fans}</ThemedText>
                        <ThemedText style={styles.watchText}>粉丝</ThemedText>
                      </Pressable>
                      <View style={styles.watch}>
                        <ThemedText style={styles.watchNum}>{stats.likes}</ThemedText>
                        <ThemedText style={styles.watchText}>获赞与收藏</ThemedText>
                      </View>
                    </View>
                    <View style={styles.actionButtons}>
                      <Pressable style={styles.secondaryBtn} onPress={openEditPanel}>
                        <ThemedText style={styles.secondaryText}>编辑资料</ThemedText>
                      </Pressable>
                      <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
                        <SettingsIcon width={18} height={18} color="#FFF" />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.authRow}>
                    <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
                      <ThemedText style={styles.primaryText}>登录</ThemedText>
                    </Pressable>
                    <Pressable style={styles.secondaryBtn} onPress={() => router.push('/register')}>
                      <ThemedText style={styles.secondaryText}>注册</ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={styles.contentBox}>
                <View style={styles.textBar}>
                  <Pressable onPress={() => setActiveTab('notes')}>
                    <ThemedText style={activeTab === 'notes' ? styles.activateText : styles.idleText}>笔记 {stats.notes}</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setActiveTab('collections')}>
                    <ThemedText style={activeTab === 'collections' ? styles.activateText : styles.idleText}>收藏 {stats.collections}</ThemedText>
                  </Pressable>
                </View>
              </View>

              {loadingProfile ? <ActivityIndicator style={styles.loadingInline} /> : null}
              {loadError ? <ThemedText style={styles.errorText}>{loadError}</ThemedText> : null}
            </View>
          }
          ListEmptyComponent={
            user ? (
              <View style={styles.emptyBlock}>
                {loadingProfile ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Image source={emptyImage} style={styles.emptyImage} contentFit="contain" />
                    <ThemedText style={styles.emptyText}>{emptyText}</ThemedText>
                  </>
                )}
              </View>
            ) : null
          }
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
                <ThemedView style={styles.noteCard}>
                  {displayImageUri ? (
                    <Image source={{ uri: displayImageUri }} style={[styles.noteImage, tall ? styles.noteImageTall : styles.noteImageShort]} contentFit="cover" />
                  ) : (
                    <View style={[styles.noteImage, tall ? styles.noteImageTall : styles.noteImageShort, styles.noteImageFallback]} />
                  )}
                  {item.contentType === 'video' ? (
                    <View style={styles.videoBadge}>
                      <ThemedText style={styles.videoBadgeText}>▶</ThemedText>
                    </View>
                  ) : null}
                  <View style={styles.noteBody}>
                    <ThemedText numberOfLines={2} style={styles.noteTitle}>{item.title}</ThemedText>
                    <View style={styles.noteMetaRow}>
                      <View style={styles.authorRow}>
                        {item.authorAvatar ? (
                          <Image source={{ uri: item.authorAvatar }} style={styles.noteAvatar} contentFit="cover" />
                        ) : (
                          <View style={styles.noteAvatarFallback} />
                        )}
                        <ThemedText numberOfLines={1} style={styles.authorName}>{item.authorName}</ThemedText>
                      </View>
                      <Pressable
                        hitSlop={8}
                        disabled={pending}
                        style={styles.noteLikeBtn}
                        onPress={(event) => {
                          event.stopPropagation();
                          void toggleLike(item.id);
                        }}>
                        <LikeIcon width={15} height={15} color={item.liked ? '#FF4D6D' : '#6C737F'} />
                        <ThemedText style={[styles.noteLikes, item.liked && styles.noteLikesActive, pending && styles.noteLikesPending]}>{item.likes}</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
        />
        <Modal visible={sideMenuVisible} transparent animationType="none" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={() => closeSideMenu()}>
          <View style={styles.sideMenuRoot}>
            <Pressable style={styles.sideMenuBackdrop} onPress={() => closeSideMenu()} />
            <Animated.View style={[styles.sideMenuPanel, { width: sideMenuWidth, transform: [{ translateX: sideMenuX }] }]}>
              <SafeAreaView style={styles.sideMenuSafe} edges={['top', 'bottom']}>
                <View style={styles.sideMenuList}>
                  {SIDE_MENU_ITEMS.map((item) => (
                    <SideMenuRow key={item.title} item={item} onPress={() => onSideMenuPress(item)} />
                  ))}
                </View>

                <View style={styles.sideMenuFooter}>
                  {SIDE_MENU_FOOTER_ITEMS.map((item) => (
                    <Pressable key={item.title} style={styles.sideMenuFooterItem} onPress={() => onSideMenuPress(item)}>
                      <SideMenuIcon item={item} size={20} />
                      <ThemedText numberOfLines={1} style={styles.sideMenuFooterText}>{item.title}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>
        <Modal visible={editVisible} transparent animationType="none" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={closeEditPanel}>
          <View style={styles.drawerRoot}>
            <Pressable style={styles.drawerBackdrop} onPress={closeEditPanel} />
            <Animated.View style={[styles.drawerPanel, { width: panelWidth, transform: [{ translateX: slideX }] }]}>
              <SafeAreaView style={styles.drawerSafe} edges={['top', 'bottom']}>
                <View style={styles.drawerHeader}>
                  <Pressable hitSlop={12} style={styles.drawerBackBtn} onPress={closeEditPanel}>
                    <ThemedText style={styles.drawerBackText}>‹</ThemedText>
                  </Pressable>
                  <ThemedText style={styles.drawerTitle}>编辑资料</ThemedText>
                  <View style={styles.drawerHeaderSpace} />
                </View>

                <ScrollView contentContainerStyle={styles.drawerContent}>
                  <Pressable
                    style={styles.avatarEditBox}
                    onPress={() => setEditMessage('当前 RN 项目未安装图片选择依赖，头像上传先保持后端已有图片')}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.editAvatar} contentFit="cover" />
                    ) : (
                      <Image source={defaultAvatar} style={styles.editAvatar} contentFit="cover" />
                    )}
                  </Pressable>

                  <View style={styles.editList}>
                    <EditRow title="名字" value={fieldValue('name', '用户')} onPress={() => openTextEdit({ field: 'name', title: '名字', value: fieldValue('name') })} />
                    <EditRow title="账号" value={fieldValue('account')} />
                    <EditRow title="邮箱" value={fieldValue('email')} onPress={() => openTextEdit({ field: 'email', title: '邮箱', value: fieldValue('email') })} />
                    <EditRow
                      title="简介"
                      value={fieldValue('about', '有趣的简介可以吸引粉丝')}
                      onPress={() => openTextEdit({ field: 'about', title: '简介', value: fieldValue('about'), multiline: true })}
                    />
                    <EditRow title="性别" value={fieldValue('sex', '男')} onPress={() => openOptionEdit({ field: 'sex', title: '性别', value: fieldValue('sex', '男') })} />
                    <EditRow
                      title="生日"
                      value={fieldValue('birthday', '1990-01-01')}
                      onPress={() => openBirthdayPicker(fieldValue('birthday', '1990-01-01'))}
                    />
                    <EditRow
                      title="职业"
                      value={fieldValue('occupation', '选择职业')}
                      onPress={() => openOptionEdit({ field: 'occupation', title: '职业', value: fieldValue('occupation', '选择职业') })}
                    />
                    <EditRow
                      title="地区"
                      value={fieldValue('district', '中国 北京 东城区')}
                      onPress={() => openRegionPicker(fieldValue('district', '北京 北京 东城区'))}
                    />
                    <EditRow
                      title="学校"
                      value={fieldValue('school', '家里蹲大学')}
                      onPress={() => openOptionEdit({ field: 'school', title: '学校', value: fieldValue('school', '家里蹲大学') })}
                    />
                    <Pressable
                      style={styles.editBgRow}
                      onPress={() => setEditMessage('当前 RN 项目未安装图片选择依赖，背景图上传先保持后端已有图片')}>
                      <View style={styles.editBgText}>
                        <ThemedText style={styles.editRowTitle}>背景图</ThemedText>
                        <ThemedText numberOfLines={1} style={styles.editRowValue}>{fieldValue('background')}</ThemedText>
                      </View>
                      {bgUri ? <Image source={{ uri: bgUri }} style={styles.editBgPreview} contentFit="cover" /> : <View style={styles.editBgPreview} />}
                    </Pressable>
                  </View>

                  {editMessage ? <ThemedText style={editMessage === '保存成功' ? styles.editSuccess : styles.editError}>{editMessage}</ThemedText> : null}
                </ScrollView>
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={!!textEdit} transparent animationType="fade" onRequestClose={() => setTextEdit(null)}>
          <View style={styles.sheetRoot}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setTextEdit(null)} />
            <View style={styles.sheetBox}>
              <ThemedText style={styles.sheetTitle}>{textEdit?.title}</ThemedText>
              <TextInput
                value={textDraft}
                onChangeText={setTextDraft}
                placeholder={textEdit?.title}
                style={[styles.textInput, textEdit?.multiline && styles.textArea]}
                multiline={textEdit?.multiline}
                maxLength={textEdit?.field === 'about' ? 50 : 40}
              />
              <Pressable
                disabled={!!savingField}
                style={[styles.saveBtn, savingField && styles.saveBtnDisabled]}
                onPress={() => void confirmTextEdit()}>
                <ThemedText style={styles.saveBtnText}>{savingField ? '保存中...' : '保存'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={!!optionEdit} transparent animationType="fade" onRequestClose={() => setOptionEdit(null)}>
          <View style={styles.sheetRoot}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setOptionEdit(null)} />
            <View style={styles.sheetBox}>
              <ThemedText style={styles.sheetTitle}>{optionEdit?.title}</ThemedText>
              <View style={styles.optionList}>
                {(optionEdit ? OPTION_FIELDS[optionEdit.field] : []).map((item) => (
                  <Pressable
                    key={item}
                    disabled={!!savingField}
                    style={[styles.optionItem, optionEdit?.value === item && styles.optionItemActive]}
                    onPress={() => void confirmOptionEdit(item)}>
                    <ThemedText style={[styles.optionText, optionEdit?.value === item && styles.optionTextActive]}>{item}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={birthdayPickerVisible} transparent animationType="fade" onRequestClose={() => setBirthdayPickerVisible(false)}>
          <View style={styles.sheetRoot}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setBirthdayPickerVisible(false)} />
            <View style={styles.sheetBox}>
              <ThemedText style={styles.sheetTitle}>生日</ThemedText>
              <View style={styles.pickerColumns}>
                <PickerColumn
                  items={BIRTHDAY_YEARS}
                  selected={birthdayDraft.year}
                  suffix="年"
                  onSelect={(year) => {
                    setBirthdayDraft((prev) => {
                      const day = Math.min(prev.day, daysInMonth(year, prev.month));
                      return { ...prev, year, day };
                    });
                  }}
                />
                <PickerColumn
                  items={MONTHS}
                  selected={birthdayDraft.month}
                  suffix="月"
                  onSelect={(month) => {
                    setBirthdayDraft((prev) => {
                      const day = Math.min(prev.day, daysInMonth(prev.year, month));
                      return { ...prev, month, day };
                    });
                  }}
                />
                <PickerColumn
                  items={birthdayDays}
                  selected={birthdayDraft.day}
                  suffix="日"
                  onSelect={(day) => setBirthdayDraft((prev) => ({ ...prev, day }))}
                />
              </View>
              <Pressable disabled={!!savingField} style={[styles.saveBtn, savingField && styles.saveBtnDisabled]} onPress={() => void confirmBirthdayPicker()}>
                <ThemedText style={styles.saveBtnText}>{savingField ? '保存中...' : '保存'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={regionPickerVisible} transparent animationType="fade" onRequestClose={() => setRegionPickerVisible(false)}>
          <View style={styles.sheetRoot}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setRegionPickerVisible(false)} />
            <View style={styles.sheetBox}>
              <ThemedText style={styles.sheetTitle}>地区</ThemedText>
              <View style={styles.pickerColumns}>
                <PickerColumn
                  items={REGION_DATA.map((item) => item.province)}
                  selected={regionDraft.province}
                  onSelect={(province) => {
                    const nextProvince = REGION_DATA.find((item) => item.province === province) ?? REGION_DATA[0];
                    const nextCity = nextProvince.cities[0];
                    setRegionDraft({ province: nextProvince.province, city: nextCity.city, district: nextCity.districts[0] });
                  }}
                />
                <PickerColumn
                  items={selectedProvince.cities.map((item) => item.city)}
                  selected={regionDraft.city}
                  onSelect={(city) => {
                    const nextCity = selectedProvince.cities.find((item) => item.city === city) ?? selectedProvince.cities[0];
                    setRegionDraft((prev) => ({ ...prev, city: nextCity.city, district: nextCity.districts[0] }));
                  }}
                />
                <PickerColumn
                  items={[...selectedCity.districts]}
                  selected={regionDraft.district}
                  onSelect={(district) => setRegionDraft((prev) => ({ ...prev, district }))}
                />
              </View>
              <Pressable disabled={!!savingField} style={[styles.saveBtn, savingField && styles.saveBtnDisabled]} onPress={() => void confirmRegionPicker()}>
                <ThemedText style={styles.saveBtnText}>{savingField ? '保存中...' : '保存'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

function SideMenuIcon({ item, size = 22 }: { item: SideMenuItem; size?: number }) {
  const color = '#343941';

  if (item.family === 'material') {
    return <MaterialCommunityIcons name={item.icon as never} size={size} color={color} />;
  }

  return <Feather name={item.icon as never} size={size} color={color} />;
}

function SideMenuRow({ item, onPress }: { item: SideMenuItem; onPress: () => void }) {
  return (
    <Pressable style={styles.sideMenuRow} onPress={onPress}>
      <View style={styles.sideMenuIconBox}>
        <SideMenuIcon item={item} />
      </View>
      <ThemedText numberOfLines={1} style={styles.sideMenuText}>{item.title}</ThemedText>
    </Pressable>
  );
}

function PickerColumn<T extends string | number>({
  items,
  selected,
  suffix = '',
  onSelect,
}: {
  items: T[];
  selected: T;
  suffix?: string;
  onSelect: (item: T) => void;
}) {
  return (
    <ScrollView style={styles.pickerColumn} contentContainerStyle={styles.pickerColumnContent} showsVerticalScrollIndicator={false}>
      {items.map((item) => {
        const active = item === selected;
        return (
          <Pressable key={String(item)} style={[styles.pickerItem, active && styles.pickerItemActive]} onPress={() => onSelect(item)}>
            <ThemedText numberOfLines={1} style={[styles.pickerText, active && styles.pickerTextActive]}>
              {item}{suffix}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function EditRow({ title, value, onPress }: { title: string; value: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} style={styles.editRow} onPress={onPress}>
      <ThemedText style={styles.editRowTitle}>{title}</ThemedText>
      <View style={styles.editRowRight}>
        <ThemedText numberOfLines={1} style={styles.editRowValue}>{value}</ThemedText>
        {onPress ? <ThemedText style={styles.editRowArrow}>›</ThemedText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF' },
  hero: {
    minHeight: 300,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: '#87ceeb',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroMask: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40,72,110,0.34)' },
  heroTopRow: { zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 16 },
  heroIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  identityRow: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, paddingHorizontal: 16 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E5E5E5' },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E5E5E5', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 28, color: '#6F7688', fontWeight: '700' },
  identityTextBlock: { flex: 1, gap: 4 },
  nickname: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  accountText: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  bio: { fontSize: 11, color: '#D8D8D8', lineHeight: 16 },
  profileTags: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, paddingHorizontal: 16 },
  profileTag: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(238,240,244,0.82)',
  },
  profileTagText: { maxWidth: 180, color: '#6F7782', fontSize: 12, fontWeight: '600' },
  profileActionRow: { zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingHorizontal: 16 },
  userBar: { flexDirection: 'row', gap: 18, alignItems: 'center', flexShrink: 1 },
  watch: { alignItems: 'center' },
  watchNum: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  watchText: { color: 'rgba(255,255,255,0.92)', fontSize: 12 },
  authRow: { zIndex: 1, flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, gap: 8, flexWrap: 'wrap', paddingHorizontal: 16 },
  actionButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexShrink: 0 },
  primaryBtn: { height: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  primaryText: { color: '#2A3A57', fontSize: 13, fontWeight: '600' },
  secondaryBtn: { height: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  secondaryText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  settingsBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  authLoading: { marginTop: 14 },
  contentBox: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: -6, paddingTop: 4 },
  textBar: { flexDirection: 'row', gap: 18, paddingHorizontal: 16, paddingVertical: 8 },
  activateText: { fontSize: 17, color: '#000', fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#E53935', paddingBottom: 6 },
  idleText: { fontSize: 16, color: '#8C8C8C', paddingBottom: 8 },
  loadingInline: { marginVertical: 8 },
  errorText: { textAlign: 'center', color: '#D43838', fontSize: 12, paddingBottom: 8 },
  gridContent: { paddingBottom: 24, flexGrow: 1 },
  columnWrap: { gap: GAP, marginBottom: GAP },
  cardWrap: { flex: 1, maxWidth: '50%', paddingHorizontal: GAP / 2 },
  noteCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EFEFEF',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  noteImage: { width: '100%' },
  noteImageTall: { aspectRatio: 3 / 4 },
  noteImageShort: { aspectRatio: 4 / 5 },
  noteImageFallback: { backgroundColor: '#EDEDED' },
  noteBody: { padding: 10, gap: 6 },
  noteTitle: { fontSize: 14, lineHeight: 20, color: '#1F2329', fontWeight: '600' },
  noteMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  authorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  noteAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#F0F0F0' },
  noteAvatarFallback: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E5E5E5' },
  authorName: { marginLeft: 6, fontSize: 11, color: '#7B746D', flexShrink: 1 },
  noteLikeBtn: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F7F4F0', flexDirection: 'row', alignItems: 'center', gap: 3 },
  noteLikes: { fontSize: 11, color: '#6C737F', fontWeight: '600' },
  noteLikesActive: { color: '#FF4D6D' },
  noteLikesPending: { opacity: 0.6 },
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
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  emptyImage: { width: 210, height: 168, opacity: 0.9 },
  emptyText: { fontSize: 14, color: '#8E8E93' },
  sideMenuRoot: { ...StyleSheet.absoluteFillObject },
  sideMenuPanel: {
    height: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 4, height: 0 },
    elevation: 8,
  },
  sideMenuSafe: { flex: 1, backgroundColor: '#FFF', justifyContent: 'space-between' },
  sideMenuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },
  sideMenuList: { paddingTop: 44 },
  sideMenuRow: {
    height: 56,
    paddingLeft: 20,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideMenuIconBox: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sideMenuText: { flex: 1, fontSize: 15, color: '#343941', fontWeight: '600' },
  sideMenuFooter: {
    height: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FBFBFB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideMenuFooterItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 0 },
  sideMenuFooterText: { fontSize: 11, color: '#565C66', fontWeight: '500' },
  drawerRoot: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'flex-end' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  drawerPanel: { alignSelf: 'stretch', backgroundColor: '#FFF' },
  drawerSafe: { flex: 1, backgroundColor: '#FFF' },
  drawerHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF2',
    paddingHorizontal: 12,
  },
  drawerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  drawerBackText: { fontSize: 34, color: '#111', lineHeight: 38 },
  drawerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  drawerHeaderSpace: { width: 40 },
  drawerContent: { paddingBottom: 28 },
  avatarEditBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  editAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E5E5' },
  editAvatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E5E5', alignItems: 'center', justifyContent: 'center' },
  editAvatarLetter: { fontSize: 30, color: '#6F7688', fontWeight: '700' },
  editList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EFEFF2' },
  editRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF2',
    gap: 18,
  },
  editRowTitle: { fontSize: 15, color: '#111', fontWeight: '500' },
  editRowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  editRowValue: { flexShrink: 1, maxWidth: '88%', textAlign: 'right', fontSize: 14, color: '#8A8A8E' },
  editRowArrow: { fontSize: 24, color: '#C3C3C7', lineHeight: 26 },
  editBgRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF2',
    gap: 14,
  },
  editBgText: { flex: 1, gap: 4 },
  editBgPreview: { width: 58, height: 46, borderRadius: 6, backgroundColor: '#E5E5EA' },
  editSuccess: { marginTop: 14, textAlign: 'center', color: '#1E8E3E', fontSize: 13 },
  editError: { marginTop: 14, textAlign: 'center', color: '#D43838', fontSize: 13, paddingHorizontal: 16 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.26)' },
  sheetBox: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18, gap: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  textInput: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D8D8DD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFB',
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  saveBtn: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF2442' },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  optionList: { gap: 10 },
  optionItem: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  optionItemActive: { backgroundColor: '#FFF1F3', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FF2442' },
  optionText: { fontSize: 15, color: '#333' },
  optionTextActive: { color: '#FF2442', fontWeight: '700' },
  pickerColumns: { flexDirection: 'row', gap: 10, minHeight: 220, maxHeight: 260 },
  pickerColumn: { flex: 1, borderRadius: 10, backgroundColor: '#F6F6F7' },
  pickerColumnContent: { padding: 8, gap: 8 },
  pickerItem: { minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pickerItemActive: { backgroundColor: '#FFF1F3', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FF2442' },
  pickerText: { fontSize: 14, color: '#555' },
  pickerTextActive: { color: '#FF2442', fontWeight: '700' },
});
