import { hydrateStorage, getString, setString } from '@/lib/storage';
import type { AddressItem } from '@/lib/address-book';
import type { MarketCartItem } from '@/lib/market-cart';

export const MARKET_ORDERS_KEY = '@market_orders';

export type MarketOrderStatus = '待付款' | '待发货' | '待收货/使用' | '评价' | '已取消' | '售后';

export type MarketOrder = {
  id: string;
  orderNo: string;
  status: MarketOrderStatus;
  shop: string;
  shopId: number | null;
  shopAvatarUrl?: string;
  items: MarketCartItem[];
  subtotal: number;
  discount: number;
  total: number;
  address?: AddressItem | null;
  createdAt: number;
  payDeadline: number;
};

function parseOrders() {
  const raw = getString(MARKET_ORDERS_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as MarketOrder[] : [];
  } catch {
    setString(MARKET_ORDERS_KEY, '[]');
    return [];
  }
}

function writeOrders(orders: MarketOrder[]) {
  setString(MARKET_ORDERS_KEY, JSON.stringify(orders));
}

export async function readMarketOrders() {
  await hydrateStorage([MARKET_ORDERS_KEY]);
  return parseOrders();
}

export async function addMarketOrders(payload: {
  items: MarketCartItem[];
  discount: number;
  total: number;
  address?: AddressItem | null;
}) {
  await hydrateStorage([MARKET_ORDERS_KEY]);
  const now = Date.now();
  const groups = new Map<string, MarketCartItem[]>();
  payload.items.forEach((item) => {
    const key = String(item.shopId ?? item.shop ?? 'default');
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  const nextOrders = Array.from(groups.values()).map((items, index) => {
    const first = items[0];
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const ratio = payload.items.length ? subtotal / payload.items.reduce((sum, item) => sum + item.price * item.quantity, 0) : 1;
    const discount = Math.round(payload.discount * ratio * 100) / 100;
    const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    return {
      id: `${now}-${index}`,
      orderNo: `MO${now}${index}`,
      status: '待付款' as const,
      shop: first.shop || '默认店铺',
      shopId: first.shopId,
      shopAvatarUrl: first.shopAvatarUrl || '',
      items,
      subtotal,
      discount,
      total,
      address: payload.address || null,
      createdAt: now,
      payDeadline: now + 27 * 60 * 1000,
    };
  });
  const orders = [...nextOrders, ...parseOrders()];
  writeOrders(orders);
  return orders;
}
