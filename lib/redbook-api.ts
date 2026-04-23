import { getJson, postJson } from '@/lib/post-json';

export type ConversationItem = {
  id: string;
  title?: string;
  avatar?: string;
  url?: string;
  read?: number;
  date?: string | number;
  time?: string | number;
  lastTime?: string | number;
  updateTime?: string | number;
  updatedAt?: string | number;
  createTime?: string | number;
  createdAt?: string | number;
  historyMessage?: Array<{
    date?: string | number;
    time?: string | number;
    lastTime?: string | number;
    updateTime?: string | number;
    updatedAt?: string | number;
    createTime?: string | number;
    createdAt?: string | number;
    mine?: boolean;
    text?: {
      type?: 'text' | 'emoji' | 'file' | string;
      message?: string;
      url?: string;
    };
  }>;
};

export type FollowListItem = {
  account: string;
  name?: string;
  url?: string;
  attention?: number | string;
  fans?: number | string;
  likes?: number | string;
  followed?: boolean;
  fan?: boolean;
  mutual?: boolean;
};

export type UserProfile = {
  account: string;
  name?: string;
  url?: string;
  avatar?: string;
  background?: string;
  ip?: string;
  region?: string;
  attention?: number | string;
  fans?: number | string;
  likes?: number | string;
  collects?: number | string;
  sign?: string;
};

export type UserPostItem = {
  id: number | string;
  account?: string;
  title?: string;
  brief?: string;
  image?: string | string[];
  cover?: string;
  likes?: number | string;
  collects?: number | string;
  collect?: number | string;
  contentType?: 'note' | 'video' | string;
  videoUrl?: string;
  video?: string;
  mediaUrl?: string;
  file?: string;
  url?: string;
  avatar?: string;
  authorAvatar?: string;
  authorName?: string;
  name?: string;
};

export async function fetchConversationList(account: string) {
  const { result } = await getJson<ConversationItem[]>('/websocket/init', { account });
  return Array.isArray(result) ? result : [];
}

export async function clearConversationMessages(account: string, targetUser: string) {
  return postJson('/clearBadge', { account, targetUser, clearHistory: true });
}

export async function deleteConversationMessages(account: string, targetUser: string) {
  return postJson('/deleteUser', { account, targetUser });
}

export async function fetchMoreMessage(params: { account: string; target: string; length: number }) {
  return getJson<{ id?: string; historyMessage?: ConversationItem['historyMessage'] }>('/websocket/getMoreMessage', params);
}

export async function fetchConversation(params: { account: string; target: string }) {
  const { result, ...rest } = await postJson<ConversationItem & { firstChat?: boolean }>('/getConversation', params);
  return { result, ...rest };
}

export async function createConversation(payload: {
  me: { message: string; UserToUser: string; account: string };
  you: { message: string; UserToUser: string; account: string };
}) {
  return postJson('/add', payload);
}

export async function fetchAllUser(params: {
  account: string[];
  keyword: string;
  limit?: number;
  offset?: number;
}) {
  return postJson<FollowListItem[]>('/getAllUser', params) as Promise<{
    status: number;
    message?: string;
    result?: FollowListItem[];
    total?: number;
  }>;
}

export async function fetchFollowStatus(targetAccount: string) {
  const { result } = await postJson<{ followed?: boolean }>('/user/followStatus', { targetAccount });
  return !!result?.followed;
}

export async function toggleFollow(targetAccount: string, action: 'follow' | 'unfollow') {
  return postJson<{ followed?: boolean; self?: { attention?: number }; target?: { fans?: number } }>(
    '/user/toggleFollow',
    { targetAccount, action }
  );
}

export async function fetchFollowList(type: 'mutual' | 'follow' | 'fans' | 'recommend') {
  const { result } = await postJson<{ data?: FollowListItem[]; summary?: { follow?: number; fans?: number } }>(
    '/user/followList',
    { type }
  );
  return {
    data: Array.isArray(result?.data) ? result.data : [],
    summary: result?.summary,
  };
}

export async function fetchUserInfo(account: string) {
  const { result } = await postJson<UserProfile>('/user/getUserInfo', { account });
  return result;
}

export async function fetchUserPosts(account: string) {
  const { result } = await postJson<{ data?: UserPostItem[] }>('/user/myNote', { account });
  return Array.isArray(result?.data) ? result.data : [];
}
