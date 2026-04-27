import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, FlatList, Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { resolveMediaUrl } from '@/constants/api';
import { useAuth } from '@/contexts/auth-context';
import { fetchMarketServiceSession, sendMarketServiceMessage, type MarketServiceMessage, type MarketServiceSession } from '@/lib/market-api';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import EmojiIcon from '@/public/icon/biaoqing.svg';
import PictureIcon from '@/public/icon/tupian.svg';

type EmojiBurstHandle = {
  burst: (options?: { count?: number; intensity?: number; emojiIndex?: number }) => void;
  clear?: () => void;
};

let EmojiBurstView: ComponentType<{
  ref?: Ref<EmojiBurstHandle>;
  emojis?: string[];
  particlesPerBurst?: number;
  maxParticles?: number;
  emojiSize?: number;
  fadeOutAfter?: number;
  lifetime?: number;
  style?: object;
}> | null = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const burstModule = require('react-native-emoji-burst') as {
      EmojiBurst?: ComponentType<{
        ref?: Ref<EmojiBurstHandle>;
        emojis?: string[];
        particlesPerBurst?: number;
        maxParticles?: number;
        emojiSize?: number;
        fadeOutAfter?: number;
        lifetime?: number;
        style?: object;
      }>;
    };
    EmojiBurstView = burstModule?.EmojiBurst || null;
  } catch {
    EmojiBurstView = null;
  }
}

const emojiList = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😭', '😡', '👍', '👏', '🙏', '🔥', '🎉', '💯', '❤️', '✨'];
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const tenMinutes = 10 * 60 * 1000;
const SERVICE_SCROLL_BOTTOM_GAP = 28;

type ServiceDisplayItem =
  | {
      kind: 'time';
      id: string;
      text: string;
    }
  | {
      kind: 'message';
      id: string;
      message: MarketServiceMessage;
    };

function formatPrice(value: number) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe) || safe <= 0) return '0';
  return safe.toFixed(2).replace(/\.00$/, '');
}

function formatSalesCount(value: number) {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 10000) return `${Number((safe / 10000).toFixed(1))}万+`;
  return String(safe);
}

function isEmojiOnly(content: string) {
  return emojiList.includes(String(content || '').trim());
}

function getProductPayload(payload: MarketServiceMessage['payload']) {
  if (!payload || typeof payload !== 'object') return null;
  const name = String(payload.name || '').trim();
  const imageUrl = String(payload.imageUrl || '').trim();
  const price = Number(payload.price || 0);
  const hasCardData = Boolean(name || imageUrl || (Number.isFinite(price) && price > 0));
  if (!hasCardData) return null;
  return {
    ...payload,
    name,
    imageUrl,
    price: Number.isFinite(price) ? price : 0,
    specText: String(payload.specText || '').trim(),
    orderNo: String(payload.orderNo || '').trim(),
    orderStatus: String(payload.orderStatus || '').trim(),
    orderQuantity: String(payload.orderQuantity || '').trim(),
    orderTotal: String(payload.orderTotal || '').trim(),
  };
}

function parseMessageDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 10000000000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDetailTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (Math.abs(diffMs) < tenMinutes) return '刚刚';

  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);

  if (diffDays === 0) return `今天 ${time}`;
  if (diffDays > 0 && diffDays < 7) return `${weekdayLabels[date.getDay()]} ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function toDisplayMessages(messages: MarketServiceMessage[]) {
  const items: ServiceDisplayItem[] = [];
  let lastShownTime = 0;
  messages.forEach((message, index) => {
    const date = parseMessageDate(message.createdAt);
    if (date) {
      const ts = date.getTime();
      if (!lastShownTime || ts - lastShownTime >= tenMinutes) {
        items.push({
          kind: 'time',
          id: `time-${message.id}-${index}`,
          text: formatDetailTime(date),
        });
        lastShownTime = ts;
      }
    }
    items.push({
      kind: 'message',
      id: String(message.id),
      message,
    });
  });
  return items;
}

export default function ProductServiceScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    productId?: string;
    shopId?: string;
    shop?: string;
    name?: string;
    price?: string;
    imageUrl?: string;
    orderId?: string;
    orderNo?: string;
    orderStatus?: string;
    orderTotal?: string;
    orderQuantity?: string;
    orderSpec?: string;
    refundStatus?: string;
  }>();

  const orderNo = String(params.orderNo || '').trim();
  const orderStatus = String(params.orderStatus || '').trim();
  const orderTotal = String(params.orderTotal || '').trim();
  const orderQuantity = String(params.orderQuantity || '').trim();
  const orderSpec = String(params.orderSpec || '').trim();
  const refundStatus = String(params.refundStatus || '').trim();
  const hasOrderContext = Boolean(orderNo);

  const [session, setSession] = useState<MarketServiceSession | null>(null);
  const [messages, setMessages] = useState<MarketServiceMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiMounted, setEmojiMounted] = useState(false);
  const [showQuickSendCard, setShowQuickSendCard] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(116);
  const emojiAnim = useRef(new Animated.Value(0)).current;

  const burstRef = useRef<EmojiBurstHandle | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const listRef = useRef<FlatList<ServiceDisplayItem> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const displayMessages = useMemo(() => toDisplayMessages(messages), [messages]);

  const shopName = session?.shop || String(params.shop || '店铺客服');
  const productName = String(session?.product || params.name || '商品咨询');
  const paramPrice = Number(params.price || 0);
  const productPrice = paramPrice > 0 ? paramPrice : Number(session?.productPrice || 0);
  const productPriceText = formatPrice(productPrice);
  const productImageUrl = String(params.imageUrl || session?.productImageUrl || '').trim();
  const shopAvatarUrl = String(session?.shopAvatarUrl || '').trim();
  const myAvatarUrl = resolveMediaUrl(String(user?.url || '').replace(/^\.\.\//, ''));
  const myName = String(user?.name || user?.account || '我');
  const shopServiceLevel = String(session?.shopServiceLevel || '金牌客服');
  const shopSalesText = formatSalesCount(Number(session?.shopSales || 0));
  const orderStatusText = orderStatus ? `${orderStatus}${refundStatus ? `（${refundStatus}）` : ''}` : '';
  const sendDesc = `店铺：${shopName}`;
  const productId = String(session?.productId || params.productId || '').trim();

  const triggerEmojiBurst = useCallback((emoji: string) => {
    const idx = emojiList.indexOf(emoji);
    if (idx < 0) return;
    burstRef.current?.burst({ count: 12, intensity: 1.1, emojiIndex: idx });
  }, []);

  const applySessionData = useCallback(
    (data: MarketServiceSession | null, options?: { silent?: boolean; burstForIncoming?: boolean }) => {
      if (!data) return;
      setSession(data);
      setMessages((prev) => {
        const next = Array.isArray(data.messages) ? data.messages : [];
        if (options?.burstForIncoming) {
          const seen = seenIdsRef.current;
          next.forEach((item) => {
            if (seen.has(item.id)) return;
            seen.add(item.id);
            if (item.sender !== 'user' && isEmojiOnly(item.content || '')) {
              triggerEmojiBurst(String(item.content || '').trim());
            }
          });
        } else {
          seenIdsRef.current = new Set(next.map((item) => Number(item.id)));
        }

        if (prev.length === next.length) {
          const same = prev.every((item, index) => item.id === next[index]?.id && item.content === next[index]?.content);
          if (same) return prev;
        }
        return next;
      });
      if (!options?.silent) setShowQuickSendCard(true);
    },
    [triggerEmojiBurst],
  );

  const loadSession = useCallback(async (options?: { silent?: boolean; burstForIncoming?: boolean }) => {
    try {
      const data = await fetchMarketServiceSession({ productId: params.productId, shopId: params.shopId });
      applySessionData(data || null, options);
    } catch (error) {
      if (!options?.silent) feedback.toast(error instanceof Error ? error.message : '客服会话加载失败');
    }
  }, [applySessionData, feedback, params.productId, params.shopId]);

  const refreshSession = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSession();
    } finally {
      setRefreshing(false);
    }
  }, [loadSession]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadSession({ silent: true, burstForIncoming: true });
    }, 2000);
    return () => clearInterval(timer);
  }, [loadSession]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (settleScrollTimerRef.current) {
      clearTimeout(settleScrollTimerRef.current);
      settleScrollTimerRef.current = null;
    }
    rafRef.current = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      rafRef.current = null;
    });
    settleScrollTimerRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
      settleScrollTimerRef.current = null;
    }, 90);
  }, []);

  const openEmojiPanel = useCallback(() => {
    Keyboard.dismiss();
    setEmojiMounted(true);
    setShowEmoji(true);
    Animated.spring(emojiAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [emojiAnim]);

  const closeEmojiPanel = useCallback(() => {
    setShowEmoji(false);
    Animated.timing(emojiAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEmojiMounted(false);
    });
  }, [emojiAnim]);

  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollToBottom(true);
      scrollTimerRef.current = null;
    }, 40);
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (settleScrollTimerRef.current) {
        clearTimeout(settleScrollTimerRef.current);
        settleScrollTimerRef.current = null;
      }
    };
  }, [displayMessages.length, keyboardHeight, composerHeight, showEmoji, scrollToBottom]);

  async function handleSend(
    nextContent?: string,
    options?: {
      messageType?: 'text' | 'product';
      payload?: MarketServiceMessage['payload'];
    },
  ) {
    const content = String(nextContent ?? inputText).trim();
    const isProductMessage = options?.messageType === 'product';
    if (!session?.id || (!content && !isProductMessage)) return false;
    setInputText('');
    try {
      const sent = await sendMarketServiceMessage(session.id, content, options);
      if (sent) {
        seenIdsRef.current.add(sent.id);
        setMessages((current) => [...current, sent]);
        scrollToBottom(true);
      }
      if (isEmojiOnly(content)) triggerEmojiBurst(content);
      return true;
    } catch (error) {
      setInputText(content);
      feedback.toast(error instanceof Error ? error.message : '消息发送失败');
      return false;
    }
  }

  async function handleSendProduct() {
    if (!session?.id) return;
    const sent = await handleSend('您好，已发送商品信息，麻烦帮我看一下。', {
      messageType: 'product',
      payload: {
        productId: Number(productId || 0) || undefined,
        name: productName,
        imageUrl: productImageUrl,
        price: Number(productPrice || 0),
        ...(orderSpec ? { specText: orderSpec } : {}),
        ...(orderNo ? { orderNo } : {}),
        ...(orderStatusText ? { orderStatus: orderStatusText } : {}),
        ...(orderQuantity ? { orderQuantity } : {}),
        ...(orderTotal ? { orderTotal } : {}),
      },
    });
    if (sent) setShowQuickSendCard(false);
  }

  async function handleSendOrderContext() {
    if (!session?.id || !hasOrderContext) return;
    const sent = await handleSend('订单咨询，已发送商品信息。', {
      messageType: 'product',
      payload: {
        productId: Number(productId || 0) || undefined,
        name: productName,
        imageUrl: productImageUrl,
        price: Number(productPrice || 0),
        ...(orderSpec ? { specText: orderSpec } : {}),
        ...(orderNo ? { orderNo } : {}),
        ...(orderStatusText ? { orderStatus: orderStatusText } : {}),
        ...(orderQuantity ? { orderQuantity } : {}),
        ...(orderTotal ? { orderTotal } : {}),
      },
    });
    if (sent) setShowQuickSendCard(false);
  }

  function handleOpenShop() {
    if (session?.shopId) {
      router.push({ pathname: '/shop/[id]', params: { id: String(session.shopId), name: shopName } });
      return;
    }
    feedback.toast('当前店铺信息不完整，暂时无法进入店铺');
  }

  function handleOpenProduct() {
    if (!productId) {
      feedback.toast('当前商品信息不完整，暂时无法进入商品页');
      return;
    }
    router.push({ pathname: '/product/[id]', params: { id: productId, name: productName, price: productPriceText } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        {EmojiBurstView ? (
          <EmojiBurstView
            ref={burstRef}
            emojis={emojiList}
            particlesPerBurst={12}
            maxParticles={72}
            emojiSize={30}
            fadeOutAfter={240}
            lifetime={820}
            style={styles.emojiBurstLayer}
          />
        ) : null}
        {showEmoji ? (
          <Pressable style={[styles.emojiBackdrop, { bottom: keyboardHeight + composerHeight }]} onPress={closeEmojiPanel} />
        ) : null}

        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerBack} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
            <BackIcon width={24} height={24} color="#20242B" />
          </Pressable>
          <View style={styles.shopAvatar}>
            {shopAvatarUrl ? <Image source={{ uri: shopAvatarUrl }} style={styles.shopAvatarImage} contentFit="cover" /> : null}
          </View>
          <View style={styles.headerInfo}>
            <ThemedText numberOfLines={1} style={styles.shopTitle}>{shopName}</ThemedText>
            <View style={styles.shopMetaRow}>
              <ThemedText style={styles.shopMeta}>{shopServiceLevel}</ThemedText>
              <ThemedText style={styles.shopMeta}>已售 {shopSalesText}件</ThemedText>
            </View>
          </View>
          <Pressable style={styles.shopBtn} onPress={handleOpenShop}>
            <ThemedText style={styles.shopBtnText}>进入店铺</ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.productStrip} onPress={handleOpenProduct}>
          <View style={styles.stripImage}>
            {productImageUrl ? <Image source={{ uri: productImageUrl }} style={styles.stripImagePhoto} contentFit="cover" /> : <PictureIcon width={30} height={30} color="#C6CBD3" />}
          </View>
          <View style={styles.stripInfo}>
            <ThemedText numberOfLines={1} style={styles.stripTitle}>{productName}</ThemedText>
            <ThemedText style={styles.stripPrice}>¥{productPriceText}</ThemedText>
          </View>
          <View style={styles.buyPill}>
            <ThemedText style={styles.buyPillText}>购买</ThemedText>
          </View>
        </Pressable>

        <FlatList
          ref={listRef}
          style={[styles.chatList, { marginBottom: composerHeight }]}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={() => void refreshSession()}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollToBottom(true)}
          contentContainerStyle={[
            styles.chatContent,
            {
              paddingBottom: keyboardHeight + SERVICE_SCROLL_BOTTOM_GAP,
            },
          ]}
          renderItem={({ item }) => {
            if (item.kind === 'time') {
              return (
                <View style={styles.timeRow}>
                  <ThemedText style={styles.timeText}>{item.text}</ThemedText>
                </View>
              );
            }

            const message = item.message;
            const mine = message.sender === 'user';
            const emojiOnly = isEmojiOnly(message.content || '');
            const productPayload = getProductPayload(message.payload);
            return (
              <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                {mine ? null : <View style={styles.agentAvatar}>{shopAvatarUrl ? <Image source={{ uri: shopAvatarUrl }} style={styles.agentAvatarImage} contentFit="cover" /> : null}</View>}
                <View style={[styles.messageColumn, mine && styles.messageColumnMine, productPayload && styles.messageColumnProduct]}>
                  <ThemedText style={[styles.agentName, mine && styles.myName]}>{mine ? myName : message.sender === 'ai' ? `${shopName} AI` : `${shopName} 客服`}</ThemedText>
                  {productPayload ? (
                    <View style={styles.productMsgBubble}>
                      {String(message.content || '').trim() ? <ThemedText style={styles.productLeadText}>{String(message.content || '').trim()}</ThemedText> : null}
                      <View style={styles.productCardInner}>
                        <View style={styles.productCardImageWrap}>
                          {productPayload.imageUrl ? (
                            <Image source={{ uri: productPayload.imageUrl }} style={styles.productCardImage} contentFit="cover" />
                          ) : (
                            <PictureIcon width={28} height={28} color="#C6CBD3" />
                          )}
                        </View>
                        <View style={styles.productCardInfo}>
                          <ThemedText numberOfLines={1} style={styles.productCardName}>
                            {productPayload.name || productName}
                          </ThemedText>
                          {productPayload.specText ? <ThemedText numberOfLines={1} style={styles.productCardMeta}>规格：{productPayload.specText}</ThemedText> : null}
                          {productPayload.orderNo ? <ThemedText numberOfLines={1} style={styles.productCardMeta}>订单号：{productPayload.orderNo}</ThemedText> : null}
                          {productPayload.orderStatus ? <ThemedText numberOfLines={1} style={styles.productCardMeta}>状态：{productPayload.orderStatus}</ThemedText> : null}
                          {productPayload.orderQuantity ? <ThemedText numberOfLines={1} style={styles.productCardMeta}>数量：{productPayload.orderQuantity}</ThemedText> : null}
                          <ThemedText style={styles.productCardPrice}>¥{formatPrice(Number(productPayload.price || 0))}</ThemedText>
                          {productPayload.orderTotal ? <ThemedText style={styles.productCardTotal}>实付：¥{productPayload.orderTotal}</ThemedText> : null}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.bubble, mine && styles.bubbleMine, emojiOnly && styles.bubbleEmoji]}>
                      {emojiOnly ? (
                        <ThemedText style={styles.emojiText}>{String(message.content || '').trim()}</ThemedText>
                      ) : (
                        <ThemedText style={[styles.bubbleText, mine && styles.bubbleMineText]}>{message.content}</ThemedText>
                      )}
                    </View>
                  )}
                </View>
                {mine ? (
                  myAvatarUrl ? (
                    <Image source={{ uri: myAvatarUrl }} style={styles.agentAvatarImageWrap} contentFit="cover" />
                  ) : (
                    <View style={[styles.agentAvatarImageWrap, styles.agentAvatar]} />
                  )
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<View style={styles.emptyBox}><ThemedText style={styles.emptyText}>暂无消息</ThemedText></View>}
        />

        <View
          style={[styles.bottomPanel, { bottom: keyboardHeight }]}
          onLayout={(event) => {
            setComposerHeight(event.nativeEvent.layout.height);
            scrollToBottom(false);
          }}>
          {showQuickSendCard ? (
            <View style={styles.sendCard}>
              <View style={styles.sendImage}>
                {productImageUrl ? <Image source={{ uri: productImageUrl }} style={styles.sendImagePhoto} contentFit="cover" /> : <PictureIcon width={30} height={30} color="#C6CBD3" />}
              </View>
              <View style={styles.sendInfo}>
                <ThemedText numberOfLines={1} style={styles.sendTitle}>{productName}</ThemedText>
                {hasOrderContext && orderSpec ? <ThemedText numberOfLines={1} style={styles.sendSpec}>型号：{orderSpec}</ThemedText> : null}
                <ThemedText numberOfLines={1} style={styles.sendDesc}>{sendDesc}</ThemedText>
                <ThemedText style={styles.sendPrice}>¥{productPriceText}</ThemedText>
              </View>
              <Pressable hitSlop={8} style={styles.closeBtn} onPress={() => setShowQuickSendCard(false)}>
                <ThemedText style={styles.closeText}>×</ThemedText>
              </Pressable>
              <Pressable style={styles.sendProductBtn} onPress={() => void (hasOrderContext ? handleSendOrderContext() : handleSendProduct())}>
                <ThemedText style={styles.sendProductText}>快捷发送商品</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {emojiMounted ? (
            <Animated.View
              style={[
                styles.emojiPanel,
                {
                  opacity: emojiAnim,
                  transform: [
                    {
                      translateY: emojiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                    {
                      scale: emojiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1],
                      }),
                    },
                  ],
                },
              ]}>
              {emojiList.map((emojiChar) => (
                <Pressable
                  key={emojiChar}
                  style={styles.emojiBtn}
                  onPress={() => {
                    closeEmojiPanel();
                    void handleSend(emojiChar);
                  }}>
                  <ThemedText style={styles.emojiBtnText}>{emojiChar}</ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          <View style={styles.inputRow}>
            <Pressable
              style={styles.emojiToggle}
              onPress={() => (showEmoji ? closeEmojiPanel() : openEmojiPanel())}>
              <EmojiIcon width={26} height={26} color={showEmoji ? '#FF2442' : '#5B6475'} fill={showEmoji ? '#FF2442' : '#5B6475'} />
            </Pressable>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="发消息..."
              placeholderTextColor="#8F949D"
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={() => void handleSend()}
              onFocus={closeEmojiPanel}
            />
            <Pressable style={[styles.sendBtn, !String(inputText || '').trim() && styles.sendBtnDisabled]} onPress={() => void handleSend()}>
              <ThemedText style={styles.sendBtnText}>发送</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#F5F5F6' },
  emojiBurstLayer: { ...StyleSheet.absoluteFillObject },
  emojiBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F1F1',
  },
  headerBack: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
  shopAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#8B5D39', marginLeft: 2, overflow: 'hidden' },
  shopAvatarImage: { width: '100%', height: '100%' },
  headerInfo: { flex: 1, paddingLeft: 8, gap: 2 },
  shopTitle: { fontSize: 14, color: '#20242B', fontWeight: '800' },
  shopMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shopMeta: { fontSize: 11, color: '#777D87', fontWeight: '700' },
  shopBtn: { height: 32, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  shopBtnText: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  productStrip: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 9,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
  },
  stripImage: { width: 42, height: 42, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA', overflow: 'hidden' },
  stripImagePhoto: { width: '100%', height: '100%' },
  stripInfo: { flex: 1, gap: 4 },
  stripTitle: { fontSize: 14, color: '#20242B', fontWeight: '700' },
  stripPrice: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  buyPill: { width: 48, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4F6' },
  buyPillText: { fontSize: 12, color: '#F02D47', fontWeight: '800' },
  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  timeRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  timeText: { color: '#9AA0AA', fontSize: 12, lineHeight: 16 },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  messageRowMine: { justifyContent: 'flex-end' },
  agentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#8B5D39', overflow: 'hidden' },
  agentAvatarImage: { width: '100%', height: '100%' },
  messageColumn: { maxWidth: '80%', gap: 4, alignItems: 'flex-start' },
  messageColumnMine: { maxWidth: '80%', alignItems: 'flex-end' },
  messageColumnProduct: { width: '82%', maxWidth: '82%' },
  agentName: { fontSize: 11, color: '#8E939C', fontWeight: '700' },
  myName: { color: '#7A808A' },
  bubble: {
    maxWidth: '100%',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#FFF',
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#FF2442' },
  bubbleMineText: { color: '#FFF' },
  bubbleEmoji: { backgroundColor: 'transparent', paddingHorizontal: 4, paddingVertical: 2 },
  bubbleText: { flexShrink: 1, fontSize: 14, lineHeight: 21, color: '#20242B', fontWeight: '600' },
  productMsgBubble: {
    width: '100%',
    maxWidth: '100%',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  productLeadText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#252A33',
    fontWeight: '700',
    marginBottom: 8,
  },
  productCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 8,
  },
  productCardImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ECEDEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productCardImage: { width: '100%', height: '100%' },
  productCardInfo: { flex: 1, minWidth: 0, gap: 2 },
  productCardName: { fontSize: 16, color: '#20242B', fontWeight: '800' },
  productCardMeta: { fontSize: 12, color: '#6E7480', fontWeight: '600' },
  productCardPrice: { marginTop: 2, fontSize: 18, color: '#11151C', fontWeight: '900' },
  productCardTotal: { fontSize: 12, color: '#5A616D', fontWeight: '700' },
  emojiText: { fontSize: 34, lineHeight: 38 },
  agentAvatarImageWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DCDDDF' },
  emptyBox: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#8E8E93', fontSize: 14 },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECECEC',
  },
  sendCard: {
    minHeight: 78,
    borderRadius: 8,
    padding: 8,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendImage: { width: 58, height: 58, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA', overflow: 'hidden' },
  sendImagePhoto: { width: '100%', height: '100%' },
  sendInfo: { flex: 1, gap: 2 },
  sendTitle: { fontSize: 13, color: '#20242B', fontWeight: '700' },
  sendSpec: { fontSize: 11, color: '#5B6270', fontWeight: '700' },
  sendDesc: { fontSize: 12, color: '#555B66', fontWeight: '600' },
  sendPrice: { fontSize: 13, color: '#F02D47', fontWeight: '900' },
  closeBtn: { position: 'absolute', right: 8, top: 6, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 22, color: '#A2A6AE', fontWeight: '400' },
  sendProductBtn: { position: 'absolute', right: 10, bottom: 10, width: 92, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  sendProductText: { fontSize: 12, color: '#FFF', fontWeight: '900' },
  inputRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emojiToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 16, backgroundColor: '#F6F6F7', fontSize: 14, color: '#20242B' },
  sendBtn: { minWidth: 58, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#FF2442' },
  sendBtnDisabled: { backgroundColor: '#FFB6C1' },
  sendBtnText: { fontSize: 14, color: '#FFF', fontWeight: '800' },
  emojiPanel: {
    marginBottom: 8,
    minHeight: 128,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#F7F7F8',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiBtn: { width: '12.5%', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  emojiBtnText: { fontSize: 30, lineHeight: 34 },
});
