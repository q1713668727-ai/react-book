import { getJson, postJson } from '@/lib/post-json';

const MARKET_ROOT_BASE = 'http://39.104.19.197:3001';
const MARKET_PRODUCT_IMAGE_BASE = `${MARKET_ROOT_BASE}/uploads/product-images`;
const MARKET_SHOP_AVATAR_BASE = `${MARKET_ROOT_BASE}/uploads/shop-avatars`;
const MARKET_CATEGORY_ICON_BASE = `${MARKET_ROOT_BASE}/uploads/category-icons`;

export type MarketProduct = {
  id: number;
  code: string;
  name: string;
  categoryId: number | null;
  category: string;
  categoryPath: string;
  shopId: number | null;
  shop: string;
  shopAvatarUrl: string;
  shopServiceLevel: string;
  shopFans: number;
  shopSales: number;
  shopRating: number;
  price: number;
  originPrice: number;
  minPrice: number;
  maxPrice: number;
  stock: number;
  sold: number;
  soldText: string;
  favorites: number;
  shippingFrom: string;
  freeShipping: boolean;
  purchaseLimit: number;
  imageUrl: string;
  imageUrls: string[];
  hdImageUrls: string[];
  specs: Array<{ name: string; value: string }>;
  skus: Array<{
    id: number;
    code: string;
    specs: Array<{ name: string; value: string }>;
    imageUrl: string;
    price: number;
    originPrice: number;
    stock: number;
    status: string;
  }>;
  status: string;
};

export type MarketProductReview = {
  id: number;
  productId: number;
  orderId: number;
  orderItemId: number;
  userName: string;
  userAvatarUrl: string;
  rating: number;
  content: string;
  createdAt: string;
  merchantReply: {
    content: string;
    shopName: string;
    repliedAt: string;
    isMerchantReply: true;
  } | null;
};

export type MarketCategory = {
  id: number;
  key: string;
  title: string;
  iconUrl: string;
  features: string[];
  children: MarketCategoryChild[];
};

export type MarketCategoryChild = {
  id: number;
  key: string;
  title: string;
  iconUrl: string;
};

export type MarketHome = {
  categories: MarketCategory[];
  products: MarketProduct[];
};

export type MarketShop = {
  id: number;
  username: string;
  name: string;
  avatarUrl: string;
  description: string;
  serviceLevel: string;
  fans: number;
  sales: number;
  rating: number;
  products: MarketProduct[];
};

export type MarketCoupon = {
  id: number;
  code: string;
  shopId: number | null;
  productId: number | null;
  productName: string;
  title: string;
  scope: 'product' | 'shop' | 'platform';
  couponLevel?: 'product' | 'shop' | 'platform';
  threshold: number;
  thresholdText: string;
  discount: number;
  stackable: boolean;
  oncePerUser: boolean;
  receiveMode?: 'once' | 'unlimited' | 'grant_only';
  totalCount: number;
  receivedCount: number;
  remainingCount: number;
  unlimitedCount: boolean;
  endAt: string;
  status: string;
};

export type MyMarketCoupon = MarketCoupon & {
  shopName: string;
  shopAvatarUrl: string;
  claimedAt: string;
};

export type MarketOrderStatus = '待付款' | '待发货' | '待收货/使用' | '评价' | '已取消' | '售后';

export type MarketOrderItem = {
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
  soldText: string;
  addedAt: number;
};

export type MarketOrder = {
  id: string;
  orderNo: string;
  status: MarketOrderStatus;
  shop: string;
  shopId: number | null;
  shopAvatarUrl?: string;
  items: MarketOrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  address?: unknown;
  createdAt: number;
  payDeadline: number;
  reviewed?: boolean;
  refundStatus?: string;
  refundReason?: string;
  refundReceivedStatus?: '已收货' | '未收货' | '';
  refundAppliedAt?: number;
};

export type MarketServiceMessage = {
  id: number;
  sessionId: number;
  sender: 'user' | 'merchant' | 'ai';
  messageType?: 'text' | 'product';
  content: string;
  payload?: {
    productId?: number;
    name?: string;
    imageUrl?: string;
    price?: number;
    specText?: string;
    orderNo?: string;
    orderStatus?: string;
    orderQuantity?: string;
    orderTotal?: string;
  } | null;
  createdAt: number;
};

export type MarketServiceSession = {
  id: number;
  sessionNo: string;
  account: string;
  shopId: number | null;
  shop: string;
  shopAvatarUrl: string;
  shopServiceLevel: string;
  shopSales: number;
  productId: number | null;
  product: string;
  productImageUrl: string;
  productPrice: number;
  status: string;
  unreadCount?: number;
  updatedAt: number;
  orderTags?: Array<{
    orderId: number;
    orderNo: string;
    status: string;
    createdAt: number;
    total: number;
  }>;
  messages: MarketServiceMessage[];
};

function trimAssetPath(url: string | undefined | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/?public\//i.test(value)) return value;
  return value.replace(/^\.\.\//, '').replace(/^\/+/, '');
}

function buildAssetUrl(base: string, url: string | undefined | null, prefixes: RegExp[] = []) {
  const value = trimAssetPath(url);
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^\/?public\//i.test(value)) return value;

  let mediaPath = value;
  prefixes.forEach((pattern) => {
    mediaPath = mediaPath.replace(pattern, '');
  });
  mediaPath = mediaPath.replace(/^\/+/, '');

  return mediaPath ? `${base}/${mediaPath}` : '';
}

function normalizeMarketProductImage(url: string | undefined | null) {
  return buildAssetUrl(MARKET_PRODUCT_IMAGE_BASE, url, [/^uploads\/product-images\/+/i, /^uploads\/+/i]);
}

function normalizeMarketShopAvatar(url: string | undefined | null) {
  return buildAssetUrl(MARKET_SHOP_AVATAR_BASE, url, [/^uploads\/shop-avatars\/+/i, /^uploads\/+/i]);
}

function normalizeMarketCategoryIcon(url: string | undefined | null) {
  return buildAssetUrl(MARKET_CATEGORY_ICON_BASE, url, [/^uploads\/category-icons\/+/i, /^uploads\/+/i]);
}

function normalizeMarketRootAsset(url: string | undefined | null) {
  const value = trimAssetPath(url);
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^\/?public\//i.test(value)) return value;
  return `${MARKET_ROOT_BASE}/${value}`;
}

function normalizeProduct(product: MarketProduct): MarketProduct {
  return {
    ...product,
    shopAvatarUrl: normalizeMarketShopAvatar(product.shopAvatarUrl),
    imageUrl: normalizeMarketProductImage(product.imageUrl),
    imageUrls: (product.imageUrls || []).map(normalizeMarketProductImage).filter(Boolean),
    hdImageUrls: (product.hdImageUrls || []).map(normalizeMarketProductImage).filter(Boolean),
    skus: (product.skus || []).map((sku) => ({
      ...sku,
      imageUrl: normalizeMarketProductImage(sku.imageUrl),
    })),
  };
}

function normalizeCategory(category: MarketCategory): MarketCategory {
  return {
    ...category,
    iconUrl: normalizeMarketCategoryIcon(category.iconUrl),
    children: (category.children || []).map((child) => ({
      ...child,
      iconUrl: normalizeMarketCategoryIcon(child.iconUrl),
    })),
  };
}

function normalizeShop(shop: MarketShop): MarketShop {
  return {
    ...shop,
    avatarUrl: normalizeMarketShopAvatar(shop.avatarUrl),
    products: (shop.products || []).map(normalizeProduct),
  };
}

export async function fetchMarketHome() {
  const { result } = await getJson<MarketHome>('/market/home');
  return {
    categories: (result?.categories || []).map(normalizeCategory),
    products: (result?.products || []).map(normalizeProduct),
  };
}

export async function fetchMarketProducts(params: {
  categoryId?: number;
  shopId?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { result } = await getJson<MarketProduct[]>('/market/products', params);
  return Array.isArray(result) ? result.map(normalizeProduct) : [];
}

export async function fetchMarketCategoryChildren(id: number | string) {
  const { result } = await getJson<MarketCategoryChild[]>(`/market/categories/${id}/children`);
  return Array.isArray(result)
    ? result.map((child) => ({
        ...child,
        iconUrl: normalizeMarketCategoryIcon(child.iconUrl),
      }))
    : [];
}

export async function fetchMarketProduct(id: number | string) {
  const { result } = await getJson<MarketProduct>(`/market/products/${id}`);
  return result ? normalizeProduct(result) : result;
}

export async function fetchMarketProductReviews(id: number | string) {
  const { result } = await getJson<MarketProductReview[]>(`/market/products/${id}/reviews`);
  return Array.isArray(result)
    ? result.map((item) => ({
        ...item,
        userAvatarUrl: normalizeMarketRootAsset(item.userAvatarUrl),
      }))
    : [];
}

export async function fetchMarketShop(id: number | string) {
  const { result } = await getJson<MarketShop>(`/market/shops/${id}`);
  return result ? normalizeShop(result) : result;
}

export async function fetchMarketCoupons(params: { productId?: number | string; shopId?: number | string } = {}) {
  const { result } = await getJson<MarketCoupon[]>('/market/coupons', params);
  return Array.isArray(result) ? result.filter((item) => item.receiveMode !== 'grant_only') : [];
}

export async function fetchMyMarketCoupons() {
  const { result } = await getJson<MyMarketCoupon[]>('/market/my-coupons');
  return Array.isArray(result) ? result.map((item) => ({ ...item, shopAvatarUrl: normalizeMarketShopAvatar(item.shopAvatarUrl) })) : [];
}

export async function receiveMarketCoupon(couponId: number | string) {
  const { result } = await postJson<MarketCoupon>('/market/receive-coupon', { couponId });
  return result;
}

export async function fetchMarketOrders() {
  const { result } = await getJson<MarketOrder[]>('/market/orders');
  return Array.isArray(result)
    ? result.map((order) => ({
        ...order,
        shopAvatarUrl: normalizeMarketShopAvatar(order.shopAvatarUrl),
        items: (order.items || []).map((item) => ({
          ...item,
          imageUrl: normalizeMarketProductImage(item.imageUrl),
          shopAvatarUrl: normalizeMarketShopAvatar(item.shopAvatarUrl),
        })),
      }))
    : [];
}

export async function createMarketOrder(payload: {
  items: MarketOrderItem[];
  discount: number;
  total: number;
  shipping?: number;
  address?: unknown;
  remark?: string;
  couponIds?: number[];
  paid: boolean;
  paymentMethod?: string;
}) {
  const { result } = await postJson<MarketOrder[]>('/market/orders/create', payload);
  return Array.isArray(result) ? result : [];
}

export async function confirmMarketOrderReceipt(order: Pick<MarketOrder, 'id' | 'orderNo'>) {
  const { result } = await postJson<{ status: MarketOrderStatus }>('/market/orders/confirm-receipt', {
    orderId: order.id,
    orderNo: order.orderNo,
  });
  return result;
}

export async function cancelMarketOrder(order: Pick<MarketOrder, 'id' | 'orderNo'>) {
  const { result } = await postJson<{ status: MarketOrderStatus }>('/market/orders/cancel', {
    orderId: order.id,
    orderNo: order.orderNo,
  });
  return result;
}

export async function updateMarketOrderAddress(order: Pick<MarketOrder, 'id' | 'orderNo'>, address: unknown) {
  const { result } = await postJson<{ address: unknown }>('/market/orders/address', {
    orderId: order.id,
    orderNo: order.orderNo,
    address,
  });
  return result;
}

export async function applyMarketOrderRefund(
  order: Pick<MarketOrder, 'id' | 'orderNo'>,
  payload: { reason: string; receivedStatus: '已收货' | '未收货' },
) {
  const { result } = await postJson<{
    status: MarketOrderStatus;
    refundStatus: string;
    refundReason: string;
    refundReceivedStatus: '已收货' | '未收货';
  }>('/market/orders/refund', {
    orderId: order.id,
    orderNo: order.orderNo,
    reason: payload.reason,
    receivedStatus: payload.receivedStatus,
  });
  return result;
}

export async function cancelMarketOrderRefund(order: Pick<MarketOrder, 'id' | 'orderNo'>) {
  const { result } = await postJson<{ refundStatus: string }>('/market/orders/refund/cancel', {
    orderId: order.id,
    orderNo: order.orderNo,
  });
  return result;
}

export async function reviewMarketOrder(order: Pick<MarketOrder, 'id' | 'orderNo'>, content: string, rating = 5) {
  const { result } = await postJson('/market/orders/review', {
    orderId: order.id,
    orderNo: order.orderNo,
    content,
    rating,
  });
  return result;
}

function normalizeServiceSession(session: MarketServiceSession): MarketServiceSession {
  return {
    ...session,
    shopAvatarUrl: normalizeMarketRootAsset(session.shopAvatarUrl),
    productImageUrl: normalizeMarketRootAsset(session.productImageUrl),
    messages: (session.messages || []).map((message) => ({
      ...message,
      payload: message.payload
        ? {
            ...message.payload,
            imageUrl: normalizeMarketRootAsset(message.payload.imageUrl),
          }
        : null,
    })),
  };
}

export async function fetchMarketServiceSession(params: { productId?: number | string; shopId?: number | string }) {
  const { result } = await getJson<MarketServiceSession>('/market/service/session', params);
  return result ? normalizeServiceSession(result) : result;
}

export async function fetchMarketServiceSessions() {
  const { result } = await getJson<MarketServiceSession[]>('/market/service/sessions');
  return Array.isArray(result) ? result.map(normalizeServiceSession) : [];
}

export async function sendMarketServiceMessage(
  sessionId: number | string,
  content: string,
  options?: {
    messageType?: 'text' | 'product';
    payload?: MarketServiceMessage['payload'];
  },
) {
  const { result } = await postJson<MarketServiceMessage>('/market/service/message', {
    sessionId,
    content,
    messageType: options?.messageType,
    payload: options?.payload,
  });
  return result
    ? {
        ...result,
        payload: result.payload
          ? {
              ...result.payload,
              imageUrl: normalizeMarketRootAsset(result.payload.imageUrl),
            }
          : null,
      }
    : result;
}

export async function deleteMarketServiceSession(sessionId: number | string) {
  const { result } = await postJson<{ sessionId: number | string }>('/market/service/session/delete', { sessionId });
  return result;
}

export async function reviewMarketOrderRefund(
  order: Pick<MarketOrder, 'id' | 'orderNo'>,
  action: 'approve' | 'reject',
) {
  const { result } = await postJson<{
    status: MarketOrderStatus;
    refundStatus: string;
  }>('/market/orders/refund/review', {
    orderId: order.id,
    orderNo: order.orderNo,
    action,
  });
  return result;
}
