import type { MarketCoupon } from '@/lib/market-api';

export type CouponLevel = 'product' | 'shop' | 'platform';
export const couponLevels: CouponLevel[] = ['product', 'shop', 'platform'];

export type CouponCartLine = {
  productId: string | number;
  shopId: string | number | null;
  amount: number;
};

export type CouponSelection = Partial<Record<CouponLevel, number | null>>;

export type CouponCalculation = {
  subtotal: number;
  payable: number;
  totalDiscount: number;
  selected: CouponSelection;
  discounts: Record<CouponLevel, number>;
  coupons: Partial<Record<CouponLevel, MarketCoupon>>;
};

function money(value: number) {
  return Math.round(Math.max(0, Number(value || 0)) * 100) / 100;
}

export function couponLevelOf(coupon: Pick<MarketCoupon, 'couponLevel' | 'scope'>): CouponLevel {
  return coupon.couponLevel || coupon.scope;
}

function sameId(left: unknown, right: unknown) {
  return String(left ?? '') === String(right ?? '');
}

function candidateCoupons(coupons: MarketCoupon[], level: CouponLevel) {
  return [null, ...coupons.filter((coupon) => couponLevelOf(coupon) === level)];
}

function applyCoupon(
  level: CouponLevel,
  coupon: MarketCoupon | null,
  lines: CouponCartLine[],
  currentTotal: number,
) {
  if (!coupon) return { ok: true, discount: 0, lines, total: currentTotal };

  const threshold = Number(coupon.threshold || 0);
  const discountAmount = Number(coupon.discount || 0);
  if (discountAmount <= 0) return { ok: false, discount: 0, lines, total: currentTotal };

  if (level === 'platform') {
    if (currentTotal < threshold) return { ok: false, discount: 0, lines, total: currentTotal };
    const discount = money(Math.min(discountAmount, currentTotal));
    return { ok: true, discount, lines, total: money(currentTotal - discount) };
  }

  const eligible = lines.filter((line) => {
    if (level === 'product') return coupon.productId != null && sameId(line.productId, coupon.productId);
    return coupon.shopId != null && sameId(line.shopId, coupon.shopId);
  });
  const eligibleAmount = money(eligible.reduce((sum, line) => sum + line.amount, 0));
  if (eligibleAmount < threshold) return { ok: false, discount: 0, lines, total: currentTotal };

  const discount = money(Math.min(discountAmount, eligibleAmount, currentTotal));
  let remainingDiscount = discount;
  const nextLines = lines.map((line) => {
    if (!eligible.includes(line) || remainingDiscount <= 0) return line;
    const lineDiscount = Math.min(line.amount, remainingDiscount);
    remainingDiscount = money(remainingDiscount - lineDiscount);
    return { ...line, amount: money(line.amount - lineDiscount) };
  });
  return { ok: true, discount, lines: nextLines, total: money(currentTotal - discount) };
}

export function calculateCoupons(
  lines: CouponCartLine[],
  coupons: MarketCoupon[],
  forcedSelection?: CouponSelection,
): CouponCalculation {
  const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const normalizedLines = lines.map((line) => ({ ...line, amount: money(line.amount) }));
  const productCandidates = forcedSelection && 'product' in forcedSelection
    ? [coupons.find((coupon) => coupon.id === forcedSelection.product) || null]
    : candidateCoupons(coupons, 'product');
  const shopCandidates = forcedSelection && 'shop' in forcedSelection
    ? [coupons.find((coupon) => coupon.id === forcedSelection.shop) || null]
    : candidateCoupons(coupons, 'shop');
  const platformCandidates = forcedSelection && 'platform' in forcedSelection
    ? [coupons.find((coupon) => coupon.id === forcedSelection.platform) || null]
    : candidateCoupons(coupons, 'platform');

  let best: CouponCalculation = {
    subtotal,
    payable: subtotal,
    totalDiscount: 0,
    selected: {},
    discounts: { product: 0, shop: 0, platform: 0 },
    coupons: {},
  };

  for (const productCoupon of productCandidates) {
    const productResult = applyCoupon('product', productCoupon, normalizedLines, subtotal);
    if (!productResult.ok) continue;
    for (const shopCoupon of shopCandidates) {
      const shopResult = applyCoupon('shop', shopCoupon, productResult.lines, productResult.total);
      if (!shopResult.ok) continue;
      for (const platformCoupon of platformCandidates) {
        const platformResult = applyCoupon('platform', platformCoupon, shopResult.lines, shopResult.total);
        if (!platformResult.ok) continue;
        const discounts = {
          product: productResult.discount,
          shop: shopResult.discount,
          platform: platformResult.discount,
        };
        const totalDiscount = money(discounts.product + discounts.shop + discounts.platform);
        const calculation: CouponCalculation = {
          subtotal,
          payable: platformResult.total,
          totalDiscount,
          selected: {
            product: productCoupon?.id ?? null,
            shop: shopCoupon?.id ?? null,
            platform: platformCoupon?.id ?? null,
          },
          discounts,
          coupons: {
            product: productCoupon || undefined,
            shop: shopCoupon || undefined,
            platform: platformCoupon || undefined,
          },
        };
        if (calculation.payable < best.payable || (calculation.payable === best.payable && totalDiscount > best.totalDiscount)) {
          best = calculation;
        }
      }
    }
  }

  return best;
}

export function filterCouponsForLines(coupons: MarketCoupon[], lines: CouponCartLine[]) {
  const productIds = new Set(lines.map((line) => String(line.productId)));
  const shopIds = new Set(lines.map((line) => String(line.shopId ?? '')));
  return coupons.filter((coupon) => {
    const level = couponLevelOf(coupon);
    if (level === 'platform') return true;
    if (level === 'product') return coupon.productId != null && productIds.has(String(coupon.productId));
    return coupon.shopId != null && shopIds.has(String(coupon.shopId));
  });
}
