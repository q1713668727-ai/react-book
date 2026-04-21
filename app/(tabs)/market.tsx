import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import CameraIcon from '@/public/icon/paizhao.svg';
import PictureIcon from '@/public/icon/tupian.svg';

type Product = {
  id: string;
  name: string;
  price: string;
  sold: string;
};

type MarketCategory = {
  key: string;
  title: string;
  features: string[][];
  products: Product[];
};

const categories: MarketCategory[] = [
  {
    key: 'recommend',
    title: '推荐',
    features: [
      ['逛逛广场', '买手橱窗', '美的商店', '好货广场', '宠粉清单'],
      ['我的订单', '购物车', '优惠券', '客服消息', '商品足迹'],
    ],
    products: [
      { id: 'recommend-1', name: '魅大咖 微宽松水洗牛仔裤', price: '115.9', sold: '89342' },
      { id: 'recommend-2', name: 'APPLE iPhone 17 Pro 5G双卡双待', price: '8999', sold: '137' },
      { id: 'recommend-3', name: '高腰显瘦直筒休闲长裤', price: '88.0', sold: '2341' },
      { id: 'recommend-4', name: '原切羊排新鲜冷冻烧烤食材', price: '129.9', sold: '4862' },
    ],
  },
  {
    key: 'furniture',
    title: '家具',
    features: [
      ['沙发床垫', '收纳柜', '餐桌椅', '灯具软装', '全屋定制'],
      ['家纺床品', '厨房置物', '清洁工具', '智能家居', '装修灵感'],
    ],
    products: [
      { id: 'furniture-1', name: '小户型多层收纳置物架', price: '59.8', sold: '1203' },
      { id: 'furniture-2', name: '奶油风实木床头柜', price: '189', sold: '836' },
      { id: 'furniture-3', name: '客厅云朵懒人沙发', price: '399', sold: '2180' },
      { id: 'furniture-4', name: '可折叠餐桌家用小圆桌', price: '268', sold: '957' },
    ],
  },
  {
    key: 'fashion',
    title: '穿搭',
    features: [
      ['女装上新', '男装精选', '鞋靴包袋', '配饰腕表', '通勤套装'],
      ['显瘦裤装', '小个子穿搭', '防晒外套', '内衣家居', '潮流趋势'],
    ],
    products: [
      { id: 'fashion-1', name: '微宽松水洗牛仔裤女春夏', price: '115.9', sold: '89342' },
      { id: 'fashion-2', name: '法式方领短袖连衣裙', price: '139', sold: '3221' },
      { id: 'fashion-3', name: '轻薄防晒衬衫外套', price: '79', sold: '6120' },
      { id: 'fashion-4', name: '复古厚底休闲运动鞋', price: '159', sold: '2844' },
    ],
  },
  {
    key: 'beauty',
    title: '美护',
    features: [
      ['面部护肤', '彩妆香水', '洗护清洁', '美容仪器', '身体护理'],
      ['防晒专区', '敏感肌', '口腔护理', '男士护理', '旅行小样'],
    ],
    products: [
      { id: 'beauty-1', name: '温和保湿修护面霜套装', price: '79.9', sold: '9160' },
      { id: 'beauty-2', name: '清透不拔干持妆粉底液', price: '128', sold: '2510' },
      { id: 'beauty-3', name: '氨基酸香氛洗发水', price: '49.9', sold: '7431' },
      { id: 'beauty-4', name: '便携卷翘睫毛夹套装', price: '19.9', sold: '5088' },
    ],
  },
  {
    key: 'sports',
    title: '运动',
    features: [
      ['瑜伽普拉提', '户外露营', '跑步训练', '球类运动', '健身装备'],
      ['运动鞋服', '骑行滑雪', '游泳潜水', '营养补给', '运动护具'],
    ],
    products: [
      { id: 'sports-1', name: '高弹速干瑜伽训练裤', price: '69', sold: '4509' },
      { id: 'sports-2', name: '轻量缓震跑步鞋', price: '229', sold: '1893' },
      { id: 'sports-3', name: '户外折叠露营椅', price: '89', sold: '3376' },
      { id: 'sports-4', name: '家用静音跳绳计数款', price: '29.9', sold: '9821' },
    ],
  },
  {
    key: 'toys',
    title: '潮玩',
    features: [
      ['手办盲盒', '积木拼装', '模型车模', '桌游卡牌', '娃圈周边'],
      ['谷子徽章', '国潮玩具', '解压玩具', '收藏展示', '新品预售'],
    ],
    products: [
      { id: 'toys-1', name: '原创角色系列盲盒', price: '59', sold: '6720' },
      { id: 'toys-2', name: '复古街景积木拼装套装', price: '168', sold: '1202' },
      { id: 'toys-3', name: '亚克力徽章收纳册', price: '26.9', sold: '3941' },
      { id: 'toys-4', name: '桌面展示透明防尘盒', price: '36', sold: '2166' },
    ],
  },
  {
    key: 'food',
    title: '食饮',
    features: [
      ['零食坚果', '咖啡茶饮', '方便速食', '粮油调味', '地方特产'],
      ['低卡轻食', '烘焙甜品', '酒水饮料', '滋补养生', '儿童食品'],
    ],
    products: [
      { id: 'food-1', name: '手工牛轧饼干混合装', price: '39.9', sold: '6228' },
      { id: 'food-2', name: '云南挂耳黑咖啡组合', price: '49', sold: '3180' },
      { id: 'food-3', name: '低脂鸡胸肉即食套餐', price: '69.9', sold: '5187' },
      { id: 'food-4', name: '原切羊排新鲜冷冻烧烤食材', price: '129.9', sold: '4862' },
    ],
  },
  {
    key: 'digital',
    title: '数码',
    features: [
      ['手机通讯', '电脑平板', '耳机音箱', '摄影摄像', '智能穿戴'],
      ['充电配件', '游戏外设', '家用电器', '办公设备', '二手优选'],
    ],
    products: [
      { id: 'digital-1', name: 'APPLE iPhone 17 Pro 5G双卡双待', price: '8999', sold: '137' },
      { id: 'digital-2', name: '降噪蓝牙耳机长续航', price: '199', sold: '2917' },
      { id: 'digital-3', name: '磁吸快充移动电源', price: '99', sold: '7245' },
      { id: 'digital-4', name: '便携机械键盘三模连接', price: '269', sold: '1388' },
    ],
  },
  {
    key: 'fresh',
    title: '生鲜',
    features: [
      ['水果鲜切', '海鲜水产', '肉禽蛋品', '乳品烘焙', '蔬菜豆制'],
      ['冷链到家', '火锅食材', '预制菜', '营养早餐', '时令上新'],
    ],
    products: [
      { id: 'fresh-1', name: '智利车厘子新鲜礼盒', price: '168', sold: '2034' },
      { id: 'fresh-2', name: '深海鳕鱼片儿童辅食', price: '79.9', sold: '1662' },
      { id: 'fresh-3', name: '谷饲牛排家庭套餐', price: '139', sold: '2748' },
      { id: 'fresh-4', name: '当季草莓大果现摘', price: '59.9', sold: '5210' },
    ],
  },
  {
    key: 'antique',
    title: '古玩',
    features: [
      ['文玩手串', '瓷器摆件', '书画篆刻', '老物件', '钱币邮票'],
      ['茶器香器', '玉石翡翠', '木作文房', '鉴赏工具', '收藏入门'],
    ],
    products: [
      { id: 'antique-1', name: '小叶紫檀手串入门款', price: '88', sold: '438' },
      { id: 'antique-2', name: '复古青花瓷茶杯', price: '59', sold: '916' },
      { id: 'antique-3', name: '黄铜镇纸文房摆件', price: '76', sold: '325' },
      { id: 'antique-4', name: '老式邮票收藏册', price: '42', sold: '670' },
    ],
  },
  {
    key: 'kids',
    title: '亲子',
    features: [
      ['童装童鞋', '益智玩具', '绘本教具', '母婴喂养', '出行用品'],
      ['安全座椅', '儿童家具', '洗护护理', '亲子手作', '成长记录'],
    ],
    products: [
      { id: 'kids-1', name: '儿童纯棉短袖套装', price: '49.9', sold: '3208' },
      { id: 'kids-2', name: '磁力片益智积木大颗粒', price: '89', sold: '2741' },
      { id: 'kids-3', name: '宝宝辅食分格餐盘', price: '39.9', sold: '1956' },
      { id: 'kids-4', name: '亲子手工绘画材料包', price: '29.9', sold: '4533' },
    ],
  },
];

export default function MarketScreen() {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState(categories[0].key);
  const activeCategory = categories.find((item) => item.key === activeKey) ?? categories[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.searchRow}>
          <Pressable style={styles.searchBox} onPress={() => router.push({ pathname: '/search', params: { type: 'product' } })}>
            <TextInput pointerEvents="none" editable={false} placeholder="小众不撞款 裙子" style={styles.input} />
            <CameraIcon width={19} height={19} color="#5F6570" />
          </Pressable>
          <Pressable style={styles.searchBtn} onPress={() => router.push({ pathname: '/search', params: { type: 'product' } })}>
            <ThemedText style={styles.searchText}>搜索</ThemedText>
          </Pressable>
        </View>

        <View style={styles.categoryWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
            {categories.map((item) => (
              <Pressable key={item.key} style={styles.categoryItem} onPress={() => setActiveKey(item.key)}>
                <ThemedText style={[styles.categoryText, activeKey === item.key && styles.categoryTextActive]}>{item.title}</ThemedText>
                {activeKey === item.key ? <View style={styles.categoryLine} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.featurePanel}>
          {activeCategory.features.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.featureRow}>
              {row.map((item) => (
                <Pressable
                  key={item}
                  style={styles.featureItem}
                  onPress={() =>
                    router.push({
                      pathname: '/market-category',
                      params: { title: item, parent: activeCategory.title },
                    })
                  }>
                  <View style={styles.featureIconWrap}>
                    <PictureIcon width={28} height={28} color="#D85C75" />
                  </View>
                  <ThemedText numberOfLines={1} style={styles.featureText}>{item}</ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        <FlatList
          key={activeCategory.key}
          data={activeCategory.products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.productColumns}
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={styles.productCard}
              onPress={() =>
                router.push({
                  pathname: '/product/[id]',
                  params: { id: item.id, name: item.name, price: item.price, sold: item.sold },
                })
              }>
              <View style={styles.productImage}>
                <PictureIcon width={52} height={52} color="#D0D3D8" />
              </View>
              <View style={styles.productBody}>
                <ThemedText numberOfLines={2} style={styles.productName}>{item.name}</ThemedText>
                <View style={styles.productMeta}>
                  <ThemedText style={styles.productPrice}>¥{item.price}</ThemedText>
                  <ThemedText style={styles.productSold}>已售 {item.sold}</ThemedText>
                </View>
              </View>
            </Pressable>
          )}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF' },
  searchRow: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchBox: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F7',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, height: 36, padding: 0, fontSize: 14, color: '#272B33' },
  searchBtn: { height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  searchText: { fontSize: 15, color: '#22252B', fontWeight: '700' },
  categoryWrap: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  categoryContent: { paddingHorizontal: 12, alignItems: 'center', gap: 20 },
  categoryItem: { height: 42, alignItems: 'center', justifyContent: 'center' },
  categoryText: { fontSize: 14, color: '#555B66', fontWeight: '700' },
  categoryTextActive: { color: '#111' },
  categoryLine: { position: 'absolute', bottom: 3, width: 18, height: 2, borderRadius: 1, backgroundColor: '#111' },
  featurePanel: { paddingTop: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  featureRow: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  featureItem: { width: '19%', alignItems: 'center', justifyContent: 'center', gap: 7 },
  featureIconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontSize: 12, color: '#3E434D', fontWeight: '700' },
  productList: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 24 },
  productColumns: { gap: 8, marginBottom: 10 },
  productCard: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  productImage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  productBody: { padding: 8, gap: 6 },
  productName: { fontSize: 13, lineHeight: 18, color: '#20242B', fontWeight: '700' },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  productPrice: { fontSize: 16, color: '#111', fontWeight: '800' },
  productSold: { fontSize: 11, color: '#A2A6AE', fontWeight: '600' },
});
