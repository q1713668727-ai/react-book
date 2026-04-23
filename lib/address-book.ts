import { getString, hydrateStorage, setString } from '@/lib/storage';
import { postJson } from '@/lib/post-json';

export const ADDRESS_BOOK_KEY = '@address_book_items';

export type AddressItem = {
  id: string;
  region: string;
  detail: string;
  name: string;
  phone: string;
  isDefault: boolean;
  updatedAt: number;
};

export type AddressInput = Omit<AddressItem, 'id' | 'updatedAt'>;

function parseItems() {
  const raw = getString(ADDRESS_BOOK_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as AddressItem[] : [];
  } catch {
    setString(ADDRESS_BOOK_KEY, '[]');
    return [];
  }
}

function writeItems(items: AddressItem[]) {
  setString(ADDRESS_BOOK_KEY, JSON.stringify(items));
  return items;
}

function normalizeRemoteItems(value: unknown) {
  return Array.isArray(value) ? value as AddressItem[] : [];
}

export async function readAddressItems() {
  await hydrateStorage([ADDRESS_BOOK_KEY]);
  try {
    const { result } = await postJson<AddressItem[]>('/user/marketAddresses', {});
    const items = normalizeRemoteItems(result);
    writeItems(items);
    return items;
  } catch {
    return parseItems();
  }
}

export async function saveAddressItem(input: AddressInput, id?: string) {
  await hydrateStorage([ADDRESS_BOOK_KEY]);
  const items = parseItems();
  const nextItem: AddressItem = {
    ...input,
    id: id || `${Date.now()}`,
    updatedAt: Date.now(),
  };
  const next = items.some((item) => item.id === nextItem.id)
    ? items.map((item) => item.id === nextItem.id ? nextItem : item)
    : [...items, nextItem];
  const normalized = input.isDefault ? next.map((item) => ({ ...item, isDefault: item.id === nextItem.id })) : next;
  writeItems(normalized);
  try {
    const { result } = await postJson<AddressItem[]>('/user/saveMarketAddress', nextItem);
    const remoteItems = normalizeRemoteItems(result);
    writeItems(remoteItems);
    return remoteItems;
  } catch {
    return normalized;
  }
}

export async function deleteAddressItem(id: string) {
  await hydrateStorage([ADDRESS_BOOK_KEY]);
  const next = writeItems(parseItems().filter((item) => item.id !== id));
  try {
    const { result } = await postJson<AddressItem[]>('/user/deleteMarketAddress', { id });
    const remoteItems = normalizeRemoteItems(result);
    writeItems(remoteItems);
    return remoteItems;
  } catch {
    return next;
  }
}

export async function setDefaultAddressItem(id: string) {
  await hydrateStorage([ADDRESS_BOOK_KEY]);
  const next = writeItems(parseItems().map((item) => ({ ...item, isDefault: item.id === id })));
  try {
    const { result } = await postJson<AddressItem[]>('/user/setDefaultMarketAddress', { id });
    const remoteItems = normalizeRemoteItems(result);
    writeItems(remoteItems);
    return remoteItems;
  } catch {
    return next;
  }
}
