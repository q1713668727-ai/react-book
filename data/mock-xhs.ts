export type FeedItem = {
  id: string;
  title: string;
  imageUri: string;
  likes: number;
};

export type VideoPlaceholder = {
  id: string;
  title: string;
  subtitle: string;
  coverUri: string;
};

export type Conversation = {
  id: string;
  name: string;
  avatarUri: string;
  lastMessage: string;
  time: string;
  unread?: number;
};

export type ProfileNote = {
  id: string;
  imageUri: string;
  title: string;
};

const pic = (seed: string, w = 400, h = 500) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const feedItems: FeedItem[] = [
  { id: '1', title: '周末brunch记录', imageUri: pic('xhs1', 400, 520), likes: 128 },
  { id: '2', title: '城市漫步路线', imageUri: pic('xhs2', 400, 460), likes: 89 },
  { id: '3', title: '书桌一角', imageUri: pic('xhs3', 400, 580), likes: 256 },
  { id: '4', title: '今日穿搭', imageUri: pic('xhs4', 400, 440), likes: 67 },
  { id: '5', title: '咖啡店探店', imageUri: pic('xhs5', 400, 540), likes: 312 },
  { id: '6', title: '居家收纳技巧', imageUri: pic('xhs6', 400, 480), likes: 154 },
  { id: '7', title: '夜景随拍', imageUri: pic('xhs7', 400, 600), likes: 201 },
  { id: '8', title: '一人食灵感', imageUri: pic('xhs8', 400, 500), likes: 95 },
];

export const videoPlaceholders: VideoPlaceholder[] = [
  {
    id: 'v1',
    title: '短视频占位 1',
    subtitle: '后续可接入 expo-av 播放网络或本地视频',
    coverUri: pic('vid1', 720, 1280),
  },
  {
    id: 'v2',
    title: '短视频占位 2',
    subtitle: '竖向滑动切换，模拟刷视频体验',
    coverUri: pic('vid2', 720, 1280),
  },
  {
    id: 'v3',
    title: '短视频占位 3',
    subtitle: '全屏分页 ScrollView',
    coverUri: pic('vid3', 720, 1280),
  },
];

export const conversations: Conversation[] = [
  {
    id: 'c1',
    name: '小红薯官方',
    avatarUri: pic('av1', 120, 120),
    lastMessage: '欢迎使用，发现更多生活灵感',
    time: '昨天',
  },
  {
    id: 'c2',
    name: '摄影同好',
    avatarUri: pic('av2', 120, 120),
    lastMessage: '下次一起扫街吗？',
    time: '14:32',
    unread: 2,
  },
  {
    id: 'c3',
    name: '美食博主阿花',
    avatarUri: pic('av3', 120, 120),
    lastMessage: '那家店我也去过！',
    time: '周二',
  },
  {
    id: 'c4',
    name: '系统通知',
    avatarUri: pic('av4', 120, 120),
    lastMessage: '你的笔记收到了新的赞',
    time: '10:05',
  },
];

export const profileUser = {
  nickname: '演示用户',
  bio: '分享生活碎片 · 假数据展示',
  avatarUri: pic('me', 200, 200),
  following: 128,
  followers: 2560,
  likes: 8900,
};

export const profileNotes: ProfileNote[] = feedItems.slice(0, 6).map((f) => ({
  id: `pn-${f.id}`,
  imageUri: f.imageUri,
  title: f.title,
}));
