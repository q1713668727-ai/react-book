import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Animated, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import CartIcon from '@/public/icon/gouwuche.svg';
import CustomerServiceIcon from '@/public/icon/kefu.svg';
import ShopIcon from '@/public/icon/dianpu.svg';
import ShareIcon from '@/public/icon/fenxiang.svg';
import PictureIcon from '@/public/icon/tupian.svg';

const HERO_HEIGHT = 390;
const TOP_BAR_HEIGHT = 48;
const specs = ['颜色: 深蓝 / 浅蓝', '尺码: S M L XL', '发货地: 广东广州', '运费险: 商家赠送', '7天无理由退换'];
const comments = [
  { name: '小鹿爱穿搭', text: '版型挺好，面料摸起来柔软，日常通勤很合适。' },
  { name: '今天也想买', text: '颜色和图片接近，裤长刚好，准备再入一条浅色。' },
];
const recommends = ['复古高腰阔腿裤', '显瘦水洗牛仔裙', '短款牛仔外套', '通勤白色衬衫'];
const colorOptions = [
  { id: 'blue-10', title: '蓝色 | 10cm', subtitle: '习惯侧睡靠枕' },
  { id: 'blue-8', title: '蓝色 | 8cm', subtitle: '习惯睡点', active: true },
];
const packageOptions = ['礼盒发货 | 一只装', '礼盒发货 | 一对装（更优惠）', '礼盒发货 | 8cm/10cm各一只'];
const buyColorOptions = [
  { id: 'hat-black', title: '雾蓝' },
  { id: 'hat-navy', title: '卡米' },
  { id: 'hat-gray', title: '藏青', active: true },
];
const paymentOptions = [
  { id: 'wechat', title: '微信支付', color: '#36B854', active: true },
  { id: 'alipay-family', title: '支付宝免密支付', subtitle: '可切换普通支付', color: '#2C7DF0' },
  { id: 'alipay-later', title: '支付宝  先用后付', color: '#4B8CF7' },
  { id: 'huabei', title: '花呗分期', color: '#54A8D8' },
];
type ProductSection = '商品' | '评价' | '详情';
const topTabs: ProductSection[] = ['商品', '评价', '详情'];

export default function ProductDetailScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [topBarVisible, setTopBarVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ProductSection>('商品');
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [buySheetVisible, setBuySheetVisible] = useState(false);
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [remarkSheetVisible, setRemarkSheetVisible] = useState(false);
  const [remark, setRemark] = useState('');
  const sectionY = useRef<Record<ProductSection, number>>({ 商品: 0, 评价: 0, 详情: 0 });
  const params = useLocalSearchParams<{ id?: string; name?: string; price?: string; sold?: string }>();
  const name = String(params.name || '魅大咖 微宽松水洗牛仔裤');
  const price = String(params.price || '115.9');
  const sold = String(params.sold || '89342');
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'));
  const topBarOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT - TOP_BAR_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const nextVisible = y > 4;
    const nextTab = y >= sectionY.current.详情 - TOP_BAR_HEIGHT - 8
      ? '详情'
      : y >= sectionY.current.评价 - TOP_BAR_HEIGHT - 8
        ? '评价'
        : '商品';

    setTopBarVisible((current) => (current === nextVisible ? current : nextVisible));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }

  function scrollToSection(section: ProductSection) {
    const y = Math.max(sectionY.current[section] - TOP_BAR_HEIGHT, 0);
    scrollRef.current?.scrollTo({ y, animated: true });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false, listener: handleScroll },
          )}>
          <View style={styles.hero}>
            <Pressable hitSlop={12} style={styles.backBtn} onPress={goBack}>
              <BackIcon width={24} height={24} color="#FFF" />
            </Pressable>
            <PictureIcon width={110} height={110} color="#D7DBE2" />
            <View style={styles.heroCounter}>
              <ThemedText style={styles.heroCounterText}>1/9</ThemedText>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.priceRow}>
              <ThemedText style={styles.price}>¥{price}</ThemedText>
              <ThemedText style={styles.sold}>已售 {sold}</ThemedText>
            </View>
            <ThemedText style={styles.title}>{name}</ThemedText>
            <ThemedText style={styles.subtitle}>全店包邮 · 48小时内发货 · 支持7天无理由退换</ThemedText>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.sectionTitle}>优惠</ThemedText>
              <ThemedText style={styles.more}>领券 ›</ThemedText>
            </View>
            <View style={styles.couponRow}>
              <View style={styles.coupon}><ThemedText style={styles.couponText}>满99减10</ThemedText></View>
              <View style={styles.coupon}><ThemedText style={styles.couponText}>新人专享</ThemedText></View>
              <View style={styles.coupon}><ThemedText style={styles.couponText}>限时包邮</ThemedText></View>
            </View>
          </View>

          <View style={styles.card}>
            <ThemedText style={styles.sectionTitle}>商品参数</ThemedText>
            {specs.map((item) => (
              <View key={item} style={styles.specRow}>
                <ThemedText style={styles.specText}>{item}</ThemedText>
              </View>
            ))}
          </View>

          <View
            style={styles.card}
            onLayout={(event) => {
              sectionY.current.评价 = event.nativeEvent.layout.y;
            }}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.sectionTitle}>买家评价</ThemedText>
              <ThemedText style={styles.more}>全部 128 ›</ThemedText>
            </View>
            {comments.map((item) => (
              <View key={item.name} style={styles.commentRow}>
                <View style={styles.avatar}><PictureIcon width={18} height={18} color="#C9CDD4" /></View>
                <View style={styles.commentTextWrap}>
                  <ThemedText style={styles.commentName}>{item.name}</ThemedText>
                  <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <ThemedText style={styles.sectionTitle}>为你推荐</ThemedText>
            <View style={styles.recommendGrid}>
              {recommends.map((item) => (
                <View key={item} style={styles.recommendItem}>
                  <View style={styles.recommendImage}><PictureIcon width={34} height={34} color="#D2D6DD" /></View>
                  <ThemedText numberOfLines={2} style={styles.recommendText}>{item}</ThemedText>
                </View>
              ))}
            </View>
          </View>

          <View
            style={styles.detailTitleWrap}
            onLayout={(event) => {
              sectionY.current.详情 = event.nativeEvent.layout.y;
            }}>
            <ThemedText style={styles.detailTitle}>商品详情</ThemedText>
          </View>

          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.detailImage}>
              <PictureIcon width={96} height={96} color="#C7CCD4" />
            </View>
          ))}
        </Animated.ScrollView>

        <View pointerEvents={topBarVisible ? 'auto' : 'none'} style={styles.topBarWrap}>
          <Animated.View style={[styles.topBarBg, { opacity: topBarOpacity }]} />
          <Animated.View style={[styles.topBar, { opacity: topBarOpacity }]}>
            <Pressable hitSlop={12} style={styles.topBarIconBtn} onPress={goBack}>
              <BackIcon width={23} height={23} color="#20242B" />
            </Pressable>
            <View style={styles.topTabs}>
              {topTabs.map((item) => (
                <Pressable key={item} style={styles.topTab} onPress={() => scrollToSection(item)}>
                  <ThemedText style={[styles.topTabText, activeTab === item && styles.topTabTextActive]}>{item}</ThemedText>
                  {activeTab === item ? <View style={styles.topTabLine} /> : null}
                </Pressable>
              ))}
            </View>
            <View style={styles.topActions}>
              <Pressable hitSlop={10} style={styles.topBarIconBtn} onPress={() => router.push('/cart')}>
                <CartIcon width={22} height={22} color="#20242B" />
              </Pressable>
              <Pressable hitSlop={10} style={styles.topBarIconBtn}>
                <ShareIcon width={22} height={22} color="#20242B" />
              </Pressable>
            </View>
          </Animated.View>
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            style={styles.bottomTool}
            onPress={() =>
              router.push({
                pathname: '/shop/[id]',
                params: { id: 'caldri', name: '卡得利家具旗舰店' },
              })
            }>
            <ShopIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>店铺</ThemedText>
          </Pressable>
          <Pressable
            style={styles.bottomTool}
            onPress={() =>
              router.push({
                pathname: '/product-service',
                params: { name, price },
              })
            }>
            <CustomerServiceIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>客服</ThemedText>
          </Pressable>
          <Pressable style={styles.bottomTool} onPress={() => router.push('/cart')}>
            <CartIcon width={20} height={20} color="#555B66" />
            <ThemedText style={styles.bottomToolText}>购物车</ThemedText>
          </Pressable>
          <View style={styles.buyCapsule}>
            <Pressable style={styles.capsuleHalfLeft} onPress={() => setCartSheetVisible(true)}>
              <ThemedText style={styles.capsuleText}>加入购物车</ThemedText>
            </Pressable>
            <Pressable style={styles.capsuleHalfRight} onPress={() => setBuySheetVisible(true)}>
              <ThemedText style={styles.capsuleText}>立即购买</ThemedText>
            </Pressable>
          </View>
        </View>

        <Modal visible={cartSheetVisible} transparent animationType="slide" onRequestClose={() => setCartSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setCartSheetVisible(false)} />
            <View style={styles.cartSheet}>
              <View style={styles.sheetServiceRow}>
                <ThemedText style={styles.serviceText}>退货包运费</ThemedText>
                <ThemedText style={styles.serviceText}>极速退款</ThemedText>
                <ThemedText style={styles.serviceText}>7天无理由退货</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setCartSheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>

              <View style={styles.sheetProductRow}>
                <View style={styles.sheetProductImage}>
                  <PictureIcon width={42} height={42} color="#C6CBD3" />
                </View>
                <View style={styles.sheetProductInfo}>
                  <View style={styles.sheetPriceRow}>
                    <ThemedText style={styles.preSaleText}>到手价</ThemedText>
                    <ThemedText style={styles.sheetPrice}>¥86</ThemedText>
                    <ThemedText style={styles.originPrice}>¥116</ThemedText>
                  </View>
                  <ThemedText style={styles.couponHint}>商家券 满80减30</ThemedText>
                </View>
                <View style={styles.quantityRow}>
                  <ThemedText style={styles.limitText}>限购10件</ThemedText>
                  <Pressable style={styles.quantityBtn}><ThemedText style={styles.quantityBtnText}>−</ThemedText></Pressable>
                  <View style={styles.quantityValue}><ThemedText style={styles.quantityValueText}>1</ThemedText></View>
                  <Pressable style={styles.quantityBtn}><ThemedText style={styles.quantityBtnText}>＋</ThemedText></Pressable>
                </View>
              </View>

              <View style={styles.optionHeader}>
                <ThemedText style={styles.optionTitle}>颜色分类</ThemedText>
                <ThemedText style={styles.optionList}>☷ 列表</ThemedText>
              </View>
              <View style={styles.colorGrid}>
                {colorOptions.map((item) => (
                  <Pressable key={item.id} style={[styles.colorOption, item.active && styles.colorOptionActive]}>
                    <View style={styles.colorImage}>
                      <PictureIcon width={34} height={34} color="#BFC4CC" />
                    </View>
                    <ThemedText numberOfLines={1} style={[styles.colorTitle, item.active && styles.optionActiveText]}>{item.title}</ThemedText>
                    <ThemedText numberOfLines={1} style={[styles.colorSubtitle, item.active && styles.optionActiveText]}>{item.subtitle}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.packageBlock}>
                <ThemedText style={styles.optionTitle}>包装数量</ThemedText>
                <View style={styles.packageGrid}>
                  {packageOptions.map((item, index) => (
                    <Pressable key={item} style={[styles.packageOption, index === 0 && styles.packageOptionActive]}>
                      <ThemedText style={[styles.packageText, index === 0 && styles.optionActiveText]}>{item}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.sheetFooter}>
                <ThemedText style={styles.footerHint}>承诺48小时内发货，晚发必赔</ThemedText>
                <Pressable style={styles.sheetCartBtn} onPress={() => setCartSheetVisible(false)}>
                  <ThemedText style={styles.sheetCartText}>加入购物车</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={buySheetVisible} transparent animationType="slide" onRequestClose={() => setBuySheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setBuySheetVisible(false)} />
            <View style={styles.buySheet}>
              <View style={styles.buyServiceRow}>
                <ThemedText style={styles.serviceText}>退货包运费</ThemedText>
                <ThemedText style={styles.serviceText}>7天无理由退货</ThemedText>
                <ThemedText style={styles.serviceText}>极速退款</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setBuySheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.buyContent}>
                <Pressable style={styles.addressRow} onPress={() => setAddressSheetVisible(true)}>
                  <ThemedText style={styles.addressIcon}>⊙</ThemedText>
                  <View style={styles.addressInfo}>
                    <ThemedText numberOfLines={1} style={styles.addressTitle}>钱佳峰 二建小区一单元101</ThemedText>
                    <ThemedText style={styles.addressMeta}>包邮　预售　3天内发货，晚发必赔</ThemedText>
                  </View>
                  <ThemedText style={styles.addressArrow}>›</ThemedText>
                </Pressable>

                <View style={styles.buyProductRow}>
                  <View style={styles.buyProductImage}>
                    <PictureIcon width={42} height={42} color="#C6CBD3" />
                  </View>
                  <View style={styles.buyProductInfo}>
                    <View style={styles.sheetPriceRow}>
                      <ThemedText style={styles.preSaleText}>实付</ThemedText>
                      <ThemedText style={styles.sheetPrice}>¥39.9</ThemedText>
                    </View>
                    <ThemedText style={styles.buyDetailLink}>明细 ›</ThemedText>
                  </View>
                  <View style={styles.quantityRowCompact}>
                    <ThemedText style={styles.limitText}>限购10件</ThemedText>
                    <Pressable style={styles.quantityBtn}><ThemedText style={styles.quantityBtnText}>−</ThemedText></Pressable>
                    <View style={styles.quantityValue}><ThemedText style={styles.quantityValueText}>1</ThemedText></View>
                    <Pressable style={styles.quantityBtn}><ThemedText style={styles.quantityBtnText}>＋</ThemedText></Pressable>
                  </View>
                </View>

                <View style={styles.buyOptionHeader}>
                  <ThemedText style={styles.optionTitle}>颜色分类</ThemedText>
                  <ThemedText style={styles.optionList}>☷ 大图</ThemedText>
                </View>
                <View style={styles.buyColorGrid}>
                  {buyColorOptions.map((item) => (
                    <Pressable key={item.id} style={[styles.buyColorOption, item.active && styles.buyColorOptionActive]}>
                      <View style={styles.buyColorImage}>
                        <PictureIcon width={30} height={30} color="#C6CBD3" />
                      </View>
                      <ThemedText style={[styles.buyColorText, item.active && styles.optionActiveText]}>{item.title}</ThemedText>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.buySection}>
                  <ThemedText style={styles.optionTitle}>尺码</ThemedText>
                  <View style={styles.sizePill}>
                    <ThemedText style={styles.optionActiveText}>可调节（54-60cm）</ThemedText>
                  </View>
                </View>

                <View style={styles.buyLineRow}>
                  <ThemedText style={styles.buyLineTitle}>退货包运费 ⓘ</ThemedText>
                  <ThemedText style={styles.buyLineValue}>商家赠送，可抵1公斤退货运费</ThemedText>
                </View>
                <Pressable style={styles.buyLineRow} onPress={() => setRemarkSheetVisible(true)}>
                  <ThemedText style={styles.buyLineTitle}>备注</ThemedText>
                  <ThemedText numberOfLines={1} style={styles.buyLinePlaceholder}>{remark || '与商家协商一致后留言 ›'}</ThemedText>
                </Pressable>

                <View style={styles.paymentPanel}>
                  {paymentOptions.map((item) => (
                    <Pressable key={item.id} style={styles.paymentRow}>
                      <View style={[styles.paymentIcon, { backgroundColor: item.color }]} />
                      <View style={styles.paymentTextWrap}>
                        <ThemedText style={styles.paymentTitle}>{item.title}</ThemedText>
                        {item.subtitle ? <ThemedText style={styles.paymentSubtitle}>{item.subtitle}</ThemedText> : null}
                      </View>
                      <View style={[styles.radioOuter, item.active && styles.radioOuterActive]}>
                        {item.active ? <View style={styles.radioInner} /> : null}
                      </View>
                    </Pressable>
                  ))}
                  <ThemedText style={styles.morePayText}>更多支付方式⌄</ThemedText>
                </View>
              </ScrollView>

              <View style={styles.buyFooter}>
                <Pressable style={styles.payBtn} onPress={() => setBuySheetVisible(false)}>
                  <ThemedText style={styles.payBtnText}>立即支付 ¥39.9</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={addressSheetVisible} transparent animationType="slide" onRequestClose={() => setAddressSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setAddressSheetVisible(false)} />
            <View style={styles.addressSheet}>
              <View style={styles.addressSheetHeader}>
                <Pressable hitSlop={12} style={styles.addressBackBtn} onPress={() => setAddressSheetVisible(false)}>
                  <BackIcon width={24} height={24} color="#20242B" />
                </Pressable>
                <ThemedText style={styles.addressSheetTitle}>地址列表</ThemedText>
                <View style={styles.addressBackBtn} />
              </View>
              <View style={styles.addressCard}>
                <ThemedText style={styles.addressRegion}>山东省 临沂市 兰陵县</ThemedText>
                <ThemedText style={styles.addressMain}>二建小区一单元101</ThemedText>
                <View style={styles.addressPhoneRow}>
                  <ThemedText style={styles.addressPhone}>钱佳峰 15****0386</ThemedText>
                  <ThemedText style={styles.selectedMark}>✓</ThemedText>
                </View>
                <View style={styles.addressActions}>
                  <View style={styles.defaultDot} />
                  <ThemedText style={styles.defaultText}>默认</ThemedText>
                  <ThemedText style={styles.addressActionText}>删除</ThemedText>
                  <ThemedText style={styles.addressActionText}>复制</ThemedText>
                  <ThemedText style={styles.addressActionText}>修改</ThemedText>
                </View>
              </View>
              <View style={styles.addressFooter}>
                <Pressable style={styles.addAddressBtn} onPress={() => setAddressSheetVisible(false)}>
                  <ThemedText style={styles.payBtnText}>添加新地址</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={remarkSheetVisible} transparent animationType="slide" onRequestClose={() => setRemarkSheetVisible(false)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setRemarkSheetVisible(false)} />
            <View style={styles.remarkSheet}>
              <View style={styles.remarkHeader}>
                <View style={styles.sheetClose} />
                <ThemedText style={styles.remarkTitle}>备注</ThemedText>
                <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setRemarkSheetVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.remarkInputWrap}>
                <TextInput
                  value={remark}
                  onChangeText={(text) => setRemark(text.slice(0, 100))}
                  multiline
                  maxLength={100}
                  placeholder="选填，建议先与商家协商一致"
                  placeholderTextColor="#A2A6AE"
                  style={styles.remarkInput}
                />
                <ThemedText style={styles.remarkCounter}>{remark.length}/100</ThemedText>
              </View>
              <View style={styles.remarkFooter}>
                <Pressable style={styles.payBtn} onPress={() => setRemarkSheetVisible(false)}>
                  <ThemedText style={styles.payBtnText}>提交</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F6' },
  root: { flex: 1, backgroundColor: '#F5F5F6' },
  content: { paddingBottom: 76 },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: '#20242B',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    top: 10,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  heroCounter: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  heroCounterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  topBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
  },
  topBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topBarIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTabs: {
    flex: 1,
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  topTab: {
    height: TOP_BAR_HEIGHT,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  topTabText: { fontSize: 15, color: '#5F6570', fontWeight: '700' },
  topTabTextActive: { color: '#191D24', fontWeight: '900' },
  topTabLine: {
    position: 'absolute',
    bottom: 6,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F02D47',
  },
  topActions: { width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  card: { marginTop: 8, backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  price: { fontSize: 24, color: '#F02D47', fontWeight: '900' },
  sold: { fontSize: 12, color: '#8E939C', fontWeight: '600' },
  title: { fontSize: 17, lineHeight: 24, color: '#191D24', fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#8B9098' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, color: '#20242B', fontWeight: '800' },
  more: { fontSize: 12, color: '#90959E', fontWeight: '600' },
  couponRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  coupon: { borderRadius: 4, backgroundColor: '#FFF1F3', paddingHorizontal: 8, paddingVertical: 5 },
  couponText: { color: '#F02D47', fontSize: 12, fontWeight: '700' },
  specRow: { minHeight: 28, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  specText: { fontSize: 13, color: '#5F6570', fontWeight: '600' },
  commentRow: { flexDirection: 'row', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F3F5', alignItems: 'center', justifyContent: 'center' },
  commentTextWrap: { flex: 1, gap: 4 },
  commentName: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  commentText: { fontSize: 13, lineHeight: 19, color: '#2C3038' },
  recommendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recommendItem: { width: '47%', gap: 6 },
  recommendImage: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#F2F3F5', alignItems: 'center', justifyContent: 'center' },
  recommendText: { fontSize: 12, lineHeight: 17, color: '#323741', fontWeight: '600' },
  detailTitleWrap: { height: 44, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontSize: 14, color: '#777D87', fontWeight: '700' },
  detailImage: { height: 420, marginBottom: 8, backgroundColor: '#20242B', alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    paddingHorizontal: 8,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEEEE',
  },
  bottomTool: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomToolText: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  buyCapsule: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    flexDirection: 'row',
    marginLeft: 4,
  },
  capsuleHalfLeft: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF8A18' },
  capsuleHalfRight: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  capsuleText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  cartSheet: {
    maxHeight: '78%',
    minHeight: 548,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  sheetServiceRow: {
    height: 42,
    paddingLeft: 16,
    paddingRight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#F3FAF7',
  },
  serviceText: { fontSize: 12, color: '#558B76', fontWeight: '700' },
  sheetClose: { position: 'absolute', right: 10, top: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 28, lineHeight: 30, color: '#454A52', fontWeight: '300' },
  sheetProductRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 10, alignItems: 'flex-start' },
  sheetProductImage: { width: 72, height: 72, borderRadius: 4, backgroundColor: '#DCE2EA', alignItems: 'center', justifyContent: 'center' },
  sheetProductInfo: { flex: 1, paddingTop: 4, gap: 4 },
  sheetPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  preSaleText: { fontSize: 13, color: '#D63C58', fontWeight: '800' },
  sheetPrice: { fontSize: 22, color: '#D63C58', fontWeight: '900' },
  originPrice: { fontSize: 15, color: '#343941', fontWeight: '500' },
  couponHint: { fontSize: 12, color: '#D63C58', fontWeight: '700' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 48 },
  limitText: { fontSize: 11, color: '#9EA3AA', fontWeight: '700', marginRight: 8 },
  quantityBtn: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center' },
  quantityBtnText: { fontSize: 16, color: '#333943', fontWeight: '700' },
  quantityValue: { width: 34, height: 24, borderRadius: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F3F4' },
  quantityValueText: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  optionHeader: { paddingHorizontal: 16, paddingTop: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontSize: 14, color: '#20242B', fontWeight: '800' },
  optionList: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  colorGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  colorOption: {
    width: 104,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#F5F5F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F5F5F6',
  },
  colorOptionActive: { backgroundColor: '#FFF4F6', borderColor: '#F0B5C0' },
  colorImage: { height: 94, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE2EA' },
  colorTitle: { marginTop: 6, paddingHorizontal: 7, fontSize: 12, color: '#555B66', fontWeight: '700' },
  colorSubtitle: { paddingHorizontal: 7, paddingBottom: 8, fontSize: 11, color: '#777D87', fontWeight: '600' },
  optionActiveText: { color: '#D63C58' },
  packageBlock: { paddingHorizontal: 16, paddingTop: 24 },
  packageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10 },
  packageOption: { minHeight: 34, borderRadius: 5, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  packageOptionActive: { backgroundColor: '#FFF1F4', borderWidth: StyleSheet.hairlineWidth, borderColor: '#F0B5C0' },
  packageText: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  sheetFooter: {
    marginTop: 'auto',
    paddingHorizontal: 50,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F1F1',
    alignItems: 'center',
    gap: 9,
  },
  footerHint: { fontSize: 12, color: '#555B66', fontWeight: '700' },
  sheetCartBtn: { width: '100%', height: 42, borderRadius: 21, backgroundColor: '#F02D47', alignItems: 'center', justifyContent: 'center' },
  sheetCartText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  buySheet: {
    maxHeight: '92%',
    minHeight: 640,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  buyServiceRow: {
    height: 42,
    paddingLeft: 54,
    paddingRight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  buyContent: { paddingBottom: 18 },
  addressRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2F2F2',
  },
  addressIcon: { fontSize: 17, color: '#555B66', fontWeight: '800' },
  addressInfo: { flex: 1, gap: 7 },
  addressTitle: { fontSize: 14, color: '#20242B', fontWeight: '900' },
  addressMeta: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  addressArrow: { fontSize: 22, color: '#A2A6AE', lineHeight: 24 },
  buyProductRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 18, alignItems: 'flex-start' },
  buyProductImage: { width: 72, height: 72, borderRadius: 4, backgroundColor: '#DCE2EA', alignItems: 'center', justifyContent: 'center' },
  buyProductInfo: { flex: 1, gap: 5, paddingTop: 2 },
  buyDetailLink: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  quantityRowCompact: { flexDirection: 'row', alignItems: 'center', paddingTop: 50 },
  buyOptionHeader: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  buyColorGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  buyColorOption: {
    flex: 1,
    maxWidth: 104,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#F6F6F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F6F6F7',
  },
  buyColorOptionActive: { backgroundColor: '#FFF4F6', borderColor: '#F0B5C0' },
  buyColorImage: { height: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE2EA' },
  buyColorText: { height: 32, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, color: '#555B66', fontWeight: '800' },
  buySection: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  sizePill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 5,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F4',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0B5C0',
  },
  buyLineRow: {
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  buyLineTitle: { fontSize: 14, color: '#343941', fontWeight: '800' },
  buyLineValue: { flex: 1, textAlign: 'right', fontSize: 13, color: '#343941', fontWeight: '700' },
  buyLinePlaceholder: { flex: 1, textAlign: 'right', fontSize: 13, color: '#A2A6AE', fontWeight: '700' },
  paymentPanel: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 8,
    borderTopColor: '#F6F6F7',
  },
  paymentRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentIcon: { width: 18, height: 18, borderRadius: 9 },
  paymentTextWrap: { flex: 1, gap: 2 },
  paymentTitle: { fontSize: 14, color: '#343941', fontWeight: '800' },
  paymentSubtitle: { fontSize: 11, color: '#9EA3AA', fontWeight: '700' },
  radioOuter: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: '#D7DAE0', alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  radioInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  morePayText: { alignSelf: 'center', paddingTop: 3, paddingBottom: 8, fontSize: 13, color: '#777D87', fontWeight: '700' },
  buyFooter: {
    paddingHorizontal: 50,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F1F1',
  },
  payBtn: { height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  payBtnText: { fontSize: 15, color: '#FFF', fontWeight: '900' },
  addressSheet: {
    height: '78%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  addressSheetHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  addressBackBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  addressSheetTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  addressCard: { paddingHorizontal: 16, paddingTop: 12 },
  addressRegion: { fontSize: 12, color: '#8B9098', fontWeight: '700' },
  addressMain: { marginTop: 8, fontSize: 15, color: '#20242B', fontWeight: '900' },
  addressPhoneRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addressPhone: { fontSize: 13, color: '#555B66', fontWeight: '700' },
  selectedMark: { fontSize: 20, color: '#D63C58', fontWeight: '800' },
  addressActions: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaultDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D7DAE0' },
  defaultText: { fontSize: 12, color: '#777D87', fontWeight: '700' },
  addressActionText: { marginLeft: 'auto', fontSize: 12, color: '#8B9098', fontWeight: '700' },
  addressFooter: { marginTop: 'auto', paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
  addAddressBtn: { height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  remarkSheet: {
    height: '78%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  remarkHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  remarkTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  remarkInputWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  remarkInput: { minHeight: 160, padding: 0, textAlignVertical: 'top', fontSize: 14, lineHeight: 20, color: '#20242B' },
  remarkCounter: { alignSelf: 'flex-end', marginTop: 8, fontSize: 12, color: '#B5BAC2', fontWeight: '700' },
  remarkFooter: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
});
