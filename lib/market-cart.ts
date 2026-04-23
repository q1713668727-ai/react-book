import { hydrateStorage, getString, setString } from '@/lib/storage';
import type { MarketProduct } from '@/lib/market-api';

export const MARKET_CART_KEY = '@market_cart_items';
export const MARKET_WISH_KEY = '@market_wish_items';
export const MARKET_CHECKOUT_KEY = '@market_checkout_items';
export const MARKET_BROWSE_KEY = '@market_browse_items';

export type MarketCartItem = {
  key: string;
  productId: string;
  skuId: number | null;
  shopId: number | null;
  shop: string;
  shopAvatarUrl?: string;
  name: string;
  imageUrl: string;
  specText: string;
  price: number;
  originPrice: number;
  quantity: number;
  stock?: number;
  purchaseLimit?: number;
  soldText: string;
  addedAt: number;
};

export type MarketWishItem = {
  productId: string;
  shopId: number | null;
  shop: string;
  shopAvatarUrl?: string;
  name: string;
  imageUrl: string;
  price: number;
  originPrice: number;
  soldText: string;
  favorites: number;
  addedAt: number;
};

export type MarketBrowseItem = {
  productId: string;
  shopId: number | null;
  shop: string;
  name: string;
  imageUrl: string;
  price: number;
  originPrice: number;
  soldText: string;
  viewedAt: number;
};

function parseArray<T>(key: string): T[] {
  const raw = getString(key);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    setString(key, '[]');
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  setString(key, JSON.stringify(value));
}

function maxCartQuantity(item: Pick<MarketCartItem, 'stock' | 'purchaseLimit'>) {
  const limits = [Number(item.stock || 0), Number(item.purchaseLimit || 0)].filter((value) => value > 0);
  return limits.length ? Math.min(...limits) : 999;
}

export async function readMarketCartItems() {
  await hydrateStorage([MARKET_CART_KEY]);
  return parseArray<MarketCartItem>(MARKET_CART_KEY);
}

export async function readMarketCheckoutItems() {
  await hydrateStorage([MARKET_CHECKOUT_KEY]);
  return parseArray<MarketCartItem>(MARKET_CHECKOUT_KEY);
}

export async function writeMarketCheckoutItems(items: MarketCartItem[]) {
  await hydrateStorage([MARKET_CHECKOUT_KEY]);
  writeArray(MARKET_CHECKOUT_KEY, items);
  return items;
}

export async function removeMarketCartItems(keys: string[]) {
  await hydrateStorage([MARKET_CART_KEY]);
  const keySet = new Set(keys);
  const next = parseArray<MarketCartItem>(MARKET_CART_KEY).filter((item) => !keySet.has(item.key));
  writeArray(MARKET_CART_KEY, next);
  return next;
}

export async function readMarketWishItems() {
  await hydrateStorage([MARKET_WISH_KEY]);
  return parseArray<MarketWishItem>(MARKET_WISH_KEY);
}

export async function removeMarketWishItems(productIds: string[]) {
  await hydrateStorage([MARKET_WISH_KEY]);
  const idSet = new Set(productIds.map((item) => String(item)));
  const next = parseArray<MarketWishItem>(MARKET_WISH_KEY).filter((item) => !idSet.has(String(item.productId)));
  writeArray(MARKET_WISH_KEY, next);
  return next;
}

export async function addMarketCartItem(item: Omit<MarketCartItem, 'key' | 'addedAt'>) {
  await hydrateStorage([MARKET_CART_KEY]);
  const key = `${item.productId}:${item.skuId ?? 'default'}`;
  const items = parseArray<MarketCartItem>(MARKET_CART_KEY);
  const index = items.findIndex((current) => current.key === key);
  const quantity = Math.max(1, Number(item.quantity || 1));
  if (index >= 0) {
    const nextItem = { ...items[index], ...item, key };
    items[index] = {
      ...nextItem,
      quantity: Math.min(maxCartQuantity(nextItem), items[index].quantity + quantity),
      addedAt: Date.now(),
    };
  } else {
    const nextItem = { ...item, key, quantity, addedAt: Date.now() };
    items.unshift({ ...nextItem, quantity: Math.min(maxCartQuantity(nextItem), quantity) });
  }
  writeArray(MARKET_CART_KEY, items);
  return items;
}

export async function updateMarketCartItemQuantity(key: string, quantity: number) {
  await hydrateStorage([MARKET_CART_KEY]);
  const items = parseArray<MarketCartItem>(MARKET_CART_KEY);
  const next = items.map((item) => {
    if (item.key !== key) return item;
    return { ...item, quantity: Math.min(maxCartQuantity(item), Math.max(1, quantity)) };
  });
  writeArray(MARKET_CART_KEY, next);
  return next;
}

export async function toggleMarketWishItem(product: MarketProduct) {
  await hydrateStorage([MARKET_WISH_KEY]);
  const productId = String(product.id);
  const items = parseArray<MarketWishItem>(MARKET_WISH_KEY);
  const exists = items.some((item) => item.productId === productId);
  const next = exists
    ? items.filter((item) => item.productId !== productId)
    : [
        {
          productId,
          shopId: product.shopId,
          shop: product.shop,
          shopAvatarUrl: product.shopAvatarUrl,
          name: product.name,
          imageUrl: product.imageUrl || product.imageUrls?.[0] || '',
          price: product.price,
          originPrice: product.originPrice,
          soldText: product.soldText,
          favorites: product.favorites,
          addedAt: Date.now(),
        },
        ...items,
      ];
  writeArray(MARKET_WISH_KEY, next);
  return !exists;
}

export async function isMarketWishListed(productId: string | number) {
  await hydrateStorage([MARKET_WISH_KEY]);
  return parseArray<MarketWishItem>(MARKET_WISH_KEY).some((item) => item.productId === String(productId));
}

export async function readMarketBrowseItems() {
  await hydrateStorage([MARKET_BROWSE_KEY]);
  return parseArray<MarketBrowseItem>(MARKET_BROWSE_KEY);
}

export async function writeMarketBrowseItems(items: MarketBrowseItem[]) {
  await hydrateStorage([MARKET_BROWSE_KEY]);
  writeArray(MARKET_BROWSE_KEY, items);
  return items;
}

export async function recordMarketBrowseItem(product: MarketProduct) {
  await hydrateStorage([MARKET_BROWSE_KEY]);
  const productId = String(product.id);
  const item: MarketBrowseItem = {
    productId,
    shopId: product.shopId,
    shop: product.shop,
    name: product.name,
    imageUrl: product.imageUrl || product.imageUrls?.[0] || '',
    price: product.price,
    originPrice: product.originPrice,
    soldText: product.soldText,
    viewedAt: Date.now(),
  };
  const next = [item, ...parseArray<MarketBrowseItem>(MARKET_BROWSE_KEY).filter((current) => current.productId !== productId)].slice(0, 120);
  writeArray(MARKET_BROWSE_KEY, next);
  return next;
}

export async function clearMarketBrowseItems() {
  await hydrateStorage([MARKET_BROWSE_KEY]);
  writeArray(MARKET_BROWSE_KEY, []);
  return [];
}
