import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import PictureIcon from '@/public/icon/tupian.svg';

export default function ProductServiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; price?: string }>();
  const productName = String(params.name || '是CC家的呀 · 美式复古做旧牛仔裤');
  const price = String(params.price || '126');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.headerBack} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
            <BackIcon width={24} height={24} color="#20242B" />
          </Pressable>
          <View style={styles.shopAvatar} />
          <View style={styles.headerInfo}>
            <ThemedText numberOfLines={1} style={styles.shopTitle}>是CC家的呀的店</ThemedText>
            <View style={styles.shopMetaRow}>
              <ThemedText style={styles.shopMeta}>金牌客服</ThemedText>
              <ThemedText style={styles.shopMeta}>已售 3.1万件</ThemedText>
            </View>
          </View>
          <Pressable style={styles.shopBtn}>
            <ThemedText style={styles.shopBtnText}>进入店铺</ThemedText>
          </Pressable>
          <Pressable hitSlop={10} style={styles.moreBtn}>
            <ThemedText style={styles.moreText}>···</ThemedText>
          </Pressable>
        </View>

        <View style={styles.productStrip}>
          <View style={styles.stripImage}>
            <PictureIcon width={30} height={30} color="#C6CBD3" />
          </View>
          <View style={styles.stripInfo}>
            <ThemedText numberOfLines={1} style={styles.stripTitle}>{productName}</ThemedText>
            <View style={styles.stripPriceRow}>
              <ThemedText style={styles.stripPrice}>¥{price}</ThemedText>
              <ThemedText style={styles.stripOrigin}>¥158</ThemedText>
            </View>
          </View>
          <Pressable style={styles.buyPill}>
            <ThemedText style={styles.buyPillText}>购买</ThemedText>
          </Pressable>
        </View>

        <View style={styles.chatBody}>
          <ThemedText style={styles.timeText}>08:52</ThemedText>

          <View style={styles.messageRow}>
            <View style={styles.agentAvatar} />
            <View style={styles.messageColumn}>
              <ThemedText style={styles.agentName}>是CC家的客服  AI</ThemedText>
              <View style={styles.bubble}>
                <ThemedText style={styles.bubbleText}>欢迎来到小店，很高兴为您服务~</ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.messageRow}>
            <View style={styles.agentAvatar} />
            <View style={styles.messageColumn}>
              <ThemedText style={styles.agentName}>是CC家的客服  AI</ThemedText>
              <View style={styles.bubbleLarge}>
                <ThemedText style={styles.bubbleText}>宝宝，您看中的这款牛仔裤正在做限时优惠，支持7天无理由退换和退货包运费，快下单吧~</ThemedText>
                <View style={styles.inlineProduct}>
                  <View style={styles.inlineImage}>
                    <PictureIcon width={30} height={30} color="#C6CBD3" />
                  </View>
                  <View style={styles.inlineInfo}>
                    <ThemedText numberOfLines={1} style={styles.inlineTitle}>{productName}</ThemedText>
                    <ThemedText numberOfLines={1} style={styles.inlineSpec}>复古蓝 M（建议125-140斤）</ThemedText>
                    <View style={styles.inlinePriceRow}>
                      <ThemedText style={styles.inlinePrice}>¥{price}</ThemedText>
                      <ThemedText style={styles.stripOrigin}>¥158</ThemedText>
                      <ThemedText style={styles.inlineQty}>x 1</ThemedText>
                    </View>
                  </View>
                </View>
                <Pressable style={styles.inlineBuyBtn}>
                  <ThemedText style={styles.inlineBuyText}>立即购买</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bottomPanel}>
          <View style={styles.sendCard}>
            <View style={styles.sendImage}>
              <PictureIcon width={30} height={30} color="#C6CBD3" />
            </View>
            <View style={styles.sendInfo}>
              <ThemedText numberOfLines={1} style={styles.sendTitle}>{productName}</ThemedText>
              <ThemedText numberOfLines={1} style={styles.sendDesc}>洗褪眼查刀准潮流香蕉裤直筒裤</ThemedText>
              <ThemedText style={styles.sendPrice}>¥{price}</ThemedText>
            </View>
            <Pressable hitSlop={8} style={styles.closeBtn}>
              <ThemedText style={styles.closeText}>×</ThemedText>
            </Pressable>
            <Pressable style={styles.sendProductBtn}>
              <ThemedText style={styles.sendProductText}>发送商品</ThemedText>
            </Pressable>
          </View>
          <View style={styles.inputRow}>
            <TextInput placeholder="发消息..." placeholderTextColor="#8F949D" style={styles.input} />
            <Pressable style={styles.roundTool}>
              <ThemedText style={styles.roundToolText}>☺</ThemedText>
            </Pressable>
            <Pressable style={styles.roundTool}>
              <ThemedText style={styles.plusText}>＋</ThemedText>
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
  shopAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#8B5D39', marginLeft: 2 },
  headerInfo: { flex: 1, paddingLeft: 8, gap: 2 },
  shopTitle: { fontSize: 14, color: '#20242B', fontWeight: '800' },
  shopMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shopMeta: { fontSize: 11, color: '#777D87', fontWeight: '700' },
  shopBtn: { height: 32, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  shopBtnText: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  moreBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 22, lineHeight: 22, color: '#20242B', fontWeight: '900' },
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
  stripImage: { width: 42, height: 42, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  stripInfo: { flex: 1, gap: 4 },
  stripTitle: { fontSize: 14, color: '#20242B', fontWeight: '700' },
  stripPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  stripPrice: { fontSize: 13, color: '#20242B', fontWeight: '800' },
  stripOrigin: { fontSize: 12, color: '#A2A6AE', textDecorationLine: 'line-through', fontWeight: '600' },
  buyPill: { width: 48, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4F6' },
  buyPillText: { fontSize: 12, color: '#F02D47', fontWeight: '800' },
  chatBody: { flex: 1, paddingHorizontal: 14, paddingTop: 28 },
  timeText: { alignSelf: 'center', fontSize: 13, color: '#8E939C', fontWeight: '600', marginBottom: 18 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 18 },
  agentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#8B5D39' },
  messageColumn: { flex: 1, gap: 5 },
  agentName: { fontSize: 11, color: '#8E939C', fontWeight: '700' },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    borderRadius: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#FFF',
  },
  bubbleLarge: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    borderRadius: 6,
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 12,
    backgroundColor: '#FFF',
  },
  bubbleText: { fontSize: 14, lineHeight: 21, color: '#20242B', fontWeight: '600' },
  inlineProduct: { marginTop: 8, flexDirection: 'row', gap: 8 },
  inlineImage: { width: 64, height: 64, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  inlineInfo: { flex: 1, gap: 3 },
  inlineTitle: { fontSize: 12, color: '#20242B', fontWeight: '700' },
  inlineSpec: { fontSize: 11, color: '#777D87', fontWeight: '600' },
  inlinePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  inlinePrice: { fontSize: 15, color: '#20242B', fontWeight: '900' },
  inlineQty: { marginLeft: 'auto', fontSize: 11, color: '#777D87', fontWeight: '700' },
  inlineBuyBtn: { alignSelf: 'flex-end', marginTop: 8, width: 78, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  inlineBuyText: { fontSize: 12, color: '#FFF', fontWeight: '900' },
  bottomPanel: {
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
  sendImage: { width: 58, height: 58, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8EA' },
  sendInfo: { flex: 1, gap: 2 },
  sendTitle: { fontSize: 13, color: '#20242B', fontWeight: '700' },
  sendDesc: { fontSize: 12, color: '#555B66', fontWeight: '600' },
  sendPrice: { fontSize: 13, color: '#F02D47', fontWeight: '900' },
  closeBtn: { position: 'absolute', right: 8, top: 6, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 22, color: '#A2A6AE', fontWeight: '400' },
  sendProductBtn: { position: 'absolute', right: 10, bottom: 10, width: 78, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F02D47' },
  sendProductText: { fontSize: 12, color: '#FFF', fontWeight: '900' },
  inputRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 16, backgroundColor: '#F6F6F7', fontSize: 14, color: '#20242B' },
  roundTool: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#20242B' },
  roundToolText: { fontSize: 19, lineHeight: 21, color: '#20242B', fontWeight: '700' },
  plusText: { fontSize: 22, lineHeight: 24, color: '#20242B', fontWeight: '500' },
});
