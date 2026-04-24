import { resolveMediaUrl } from '@/constants/api';

export const defaultAvatarImage = require('../public/image/avatar.jpg');

type AvatarSource = { uri: string } | number;

export function avatarSource(url?: string | null): AvatarSource {
  const normalized = String(url || '').trim().replace(/^\.\.\//, '');
  const uri = resolveMediaUrl(normalized);
  return uri ? { uri } : defaultAvatarImage;
}
