import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { deleteAddressItem, readAddressItems, saveAddressItem, setDefaultAddressItem, type AddressInput, type AddressItem } from '@/lib/address-book';
import { updateMarketOrderAddress } from '@/lib/market-api';
import BackIcon from '@/public/icon/fanhuijiantou.svg';

type RegionProvince = {
  name: string;
  cities: {
    name: string;
    districts: {
      name: string;
      towns: string[];
    }[];
  }[];
};

const emptyForm: AddressInput = {
  region: '',
  detail: '',
  name: '',
  phone: '',
  isDefault: false,
};

const regionData: RegionProvince[] = [
  {
    name: '北京',
    cities: [{ name: '北京市', districts: [{ name: '大兴区', towns: ['安定镇', '北臧村镇', '博兴街道', '采育镇', '高米店街道', '观音寺街道', '黄村镇', '旧宫镇', '礼贤镇', '林校路街道', '庞各庄镇'] }] }],
  },
  {
    name: '山东省',
    cities: [{ name: '临沂市', districts: [{ name: '兰陵县', towns: ['卞庄街道', '苍山街道', '长城镇', '大仲村镇', '二庙乡'] }] }],
  },
  {
    name: '广东省',
    cities: [
      { name: '广州市', districts: [{ name: '天河区', towns: ['棠下街道', '员村街道', '猎德街道'] }, { name: '越秀区', towns: ['北京街道', '东山街道'] }] },
      { name: '深圳市', districts: [{ name: '南山区', towns: ['粤海街道', '蛇口街道'] }, { name: '福田区', towns: ['福田街道', '香蜜湖街道'] }] },
    ],
  },
  {
    name: '江苏省',
    cities: [
      { name: '南京市', districts: [{ name: '鼓楼区', towns: ['湖南路街道', '中央门街道'] }] },
      { name: '苏州市', districts: [{ name: '姑苏区', towns: ['平江街道', '沧浪街道'] }] },
    ],
  },
  { name: '上海', cities: [{ name: '上海市', districts: [{ name: '浦东新区', towns: ['陆家嘴街道', '张江镇'] }, { name: '黄浦区', towns: ['南京东路街道'] }] }] },
  { name: '浙江省', cities: [{ name: '杭州市', districts: [{ name: '西湖区', towns: ['西溪街道', '转塘街道'] }] }] },
  { name: '四川省', cities: [{ name: '成都市', districts: [{ name: '武侯区', towns: ['浆洗街街道', '望江路街道'] }] }] },
  { name: '天津', cities: [{ name: '天津市', districts: [{ name: '和平区', towns: ['劝业场街道', '小白楼街道'] }] }] },
  { name: '重庆', cities: [{ name: '重庆市', districts: [{ name: '渝中区', towns: ['解放碑街道', '朝天门街道'] }] }] },
];

const hotCities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '天津', '武汉', '长沙', '重庆', '成都'];

function maskPhone(phone: string) {
  const value = phone.trim();
  if (value.length < 8) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function addressText(item: AddressItem) {
  return `收货人:${item.name}\n手机号码:${item.phone}\n所在地区:${item.region.replace(/\s+/g, '')}\n详细地址:${item.detail.replace(/\s+/g, '')}`;
}

function formatRegionText(value: string) {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return '';
  const parts = compact.match(/(.+?(?:省|自治区|特别行政区|市))?(.+?市)?(.+?(?:区|县|旗))?(.+?(?:镇|乡|街道|苏木))?$/);
  const normalized = parts?.slice(1).filter(Boolean).join(' ');
  return normalized || value.trim();
}

function parseAddressText(raw: string): Partial<AddressInput> {
  const labelled: Partial<AddressInput> = {};
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(收货人|姓名|手机号码|联系电话|手机号|所在地区|地区|详细地址|地址)\s*[:：]\s*(.+?)\s*$/);
    if (!match) return;
    const [, label, value] = match;
    if (label === '收货人' || label === '姓名') labelled.name = value;
    if (label === '手机号码' || label === '联系电话' || label === '手机号') labelled.phone = value.replace(/[^\d]/g, '');
    if (label === '所在地区' || label === '地区') labelled.region = formatRegionText(value);
    if (label === '详细地址' || label === '地址') labelled.detail = value;
  });
  if (labelled.name || labelled.phone || labelled.region || labelled.detail) return labelled;

  const text = raw.replace(/\s+/g, ' ').trim();
  const phone = text.match(/1[3-9]\d{9}/)?.[0] || '';
  const withoutPhone = phone ? text.replace(phone, '').trim() : text;
  const tokens = withoutPhone.split(' ').filter(Boolean);
  const name = tokens.find((item) => item.length >= 2 && item.length <= 4 && !/[省市区县镇街道路号栋室\d]/.test(item)) || '';
  const detail = name ? withoutPhone.replace(name, '').trim() : withoutPhone;
  return { phone, name, detail };
}

export default function AddressListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; orderId?: string; orderNo?: string }>();
  const feedback = useFeedback();
  const pickOrderAddressMode = String(params.mode || '') === 'pick-order-address';
  const targetOrderId = String(params.orderId || '');
  const targetOrderNo = String(params.orderNo || '');
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [editing, setEditing] = useState<AddressItem | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);
  const [form, setForm] = useState<AddressInput>(emptyForm);
  const [rawAddress, setRawAddress] = useState('');
  const [regionStep, setRegionStep] = useState(0);
  const [regionSearch, setRegionSearch] = useState('');
  const [selectedProvince, setSelectedProvince] = useState<RegionProvince | null>(null);
  const [selectedCity, setSelectedCity] = useState<RegionProvince['cities'][number] | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<RegionProvince['cities'][number]['districts'][number] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setAddresses(await readAddressItems());
  }, []);

  const refreshAddresses = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openAddForm() {
    setEditing(null);
    setRawAddress('');
    setForm({ ...emptyForm, isDefault: addresses.length === 0 });
    setFormVisible(true);
  }

  function openEditForm(item: AddressItem) {
    setEditing(item);
    setRawAddress('');
    setForm({
      region: item.region,
      detail: item.detail,
      name: item.name,
      phone: item.phone,
      isDefault: item.isDefault,
    });
    setFormVisible(true);
  }

  function openRegionPicker() {
    setRegionStep(0);
    setRegionSearch('');
    setSelectedProvince(null);
    setSelectedCity(null);
    setSelectedDistrict(null);
    setRegionPickerVisible(true);
  }

  async function submitForm() {
    const next = {
      ...form,
      region: form.region.trim(),
      detail: form.detail.trim(),
      name: form.name.trim(),
      phone: form.phone.trim(),
    };
    if (!next.region || !next.detail || !next.name || !next.phone) {
      feedback.toast('请补全地址信息');
      return;
    }
    setAddresses(await saveAddressItem(next, editing?.id));
    setFormVisible(false);
  }

  async function recognizeAddress() {
    const clipboardText = await Clipboard.getStringAsync().catch(() => '');
    const sourceText = clipboardText.trim() || rawAddress;
    if (!sourceText.trim()) {
      feedback.toast('请先复制地址文本，或在文本框中输入地址信息');
      return;
    }
    setRawAddress(sourceText);
    const parsed = parseAddressText(sourceText);
    setForm((current) => ({
      ...current,
      name: parsed.name || current.name,
      phone: parsed.phone || current.phone,
      region: parsed.region || current.region,
      detail: parsed.detail || current.detail,
    }));
  }

  function chooseHotCity(cityName: string) {
    const province = regionData.find((item) => item.name === cityName || item.cities.some((city) => city.name.startsWith(cityName)));
    const city = province?.cities.find((item) => item.name.startsWith(cityName)) || province?.cities[0];
    if (!province || !city) return;
    setSelectedProvince(province);
    setSelectedCity(city);
    setRegionStep(2);
  }

  function finishRegion(town: string) {
    const parts = [selectedProvince?.name, selectedCity?.name, selectedDistrict?.name, town].filter(Boolean);
    setForm((current) => ({ ...current, region: parts.join(' ') }));
    setRegionPickerVisible(false);
  }

  async function confirmDelete(item: AddressItem) {
    const ok = await feedback.confirm({
      title: '删除地址',
      message: '确定删除这条收货地址吗？',
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) setAddresses(await deleteAddressItem(item.id));
  }

  async function copyAddress(item: AddressItem) {
    await Share.share({ message: addressText(item) });
  }

  async function makeDefault(item: AddressItem) {
    if (item.isDefault) return;
    setAddresses(await setDefaultAddressItem(item.id));
  }

  async function pickOrderAddress(item: AddressItem) {
    if (!pickOrderAddressMode) return;
    if (!targetOrderId && !targetOrderNo) {
      feedback.toast('订单信息丢失，请返回重试');
      return;
    }
    try {
      await updateMarketOrderAddress(
        {
          id: targetOrderId,
          orderNo: targetOrderNo,
        },
        item,
      );
      feedback.toast('收货地址已修改');
      router.back();
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : '修改地址失败');
    }
  }

  const pickerOptions = useMemo(() => {
    const keyword = regionSearch.trim();
    const source = regionStep === 0
      ? regionData.map((item) => item.name)
      : regionStep === 1
        ? selectedProvince?.cities.map((item) => item.name) || []
        : regionStep === 2
          ? selectedCity?.districts.map((item) => item.name) || []
          : selectedDistrict?.towns || [];
    return keyword ? source.filter((item) => item.includes(keyword)) : source;
  }, [regionSearch, regionStep, selectedCity, selectedDistrict, selectedProvince]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
            <BackIcon width={26} height={26} color="#2B2F36" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>{pickOrderAddressMode ? '选择收货地址' : '地址列表'}</ThemedText>
          <View style={styles.headerSpace} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshAddresses()} />}>
          {addresses.length ? (
            addresses.map((item) => (
              <Pressable key={item.id} style={[styles.addressBlock, pickOrderAddressMode && styles.addressBlockPick]} onPress={() => void pickOrderAddress(item)}>
                <ThemedText style={styles.region}>{item.region}</ThemedText>
                <ThemedText style={styles.detail}>{item.detail}</ThemedText>
                <ThemedText style={styles.contact}>{item.name} {maskPhone(item.phone)}</ThemedText>
                {pickOrderAddressMode ? (
                  <View style={styles.pickHintRow}>
                    <ThemedText style={styles.pickHint}>点击使用此地址</ThemedText>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable style={styles.defaultWrap} onPress={() => void makeDefault(item)}>
                      <View style={[styles.radio, item.isDefault && styles.radioActive]}>
                        {item.isDefault ? <View style={styles.radioDot} /> : null}
                      </View>
                      <ThemedText style={[styles.defaultText, item.isDefault && styles.defaultTextActive]}>默认</ThemedText>
                    </Pressable>
                    <View style={styles.addressActions}>
                      <Pressable style={styles.actionBtn} onPress={() => void confirmDelete(item)}>
                        <ThemedText style={styles.actionText}>删除</ThemedText>
                      </Pressable>
                      <View style={styles.actionDivider} />
                      <Pressable style={styles.actionBtn} onPress={() => void copyAddress(item)}>
                        <ThemedText style={styles.actionText}>复制</ThemedText>
                      </Pressable>
                      <View style={styles.actionDivider} />
                      <Pressable style={styles.actionBtn} onPress={() => openEditForm(item)}>
                        <ThemedText style={styles.actionText}>修改</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Pressable>
            ))
          ) : (
            <View style={styles.empty}>
              <ThemedText style={styles.emptyTitle}>暂无收货地址</ThemedText>
              <ThemedText style={styles.emptyText}>添加一个常用地址，购物时会更方便</ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.addBtn} onPress={openAddForm}>
            <ThemedText style={styles.addText}>添加新地址</ThemedText>
          </Pressable>
        </View>

        <Modal visible={formVisible} animationType="slide" onRequestClose={() => setFormVisible(false)}>
          <SafeAreaView style={styles.formSafe} edges={['top', 'bottom']}>
            <ThemedView style={styles.formPage}>
              <View style={styles.createHeader}>
                <Pressable hitSlop={12} style={styles.backBtn} onPress={() => setFormVisible(false)}>
                  <BackIcon width={26} height={26} color="#2B2F36" />
                </Pressable>
                <ThemedText style={styles.createTitle}>{editing ? '修改地址' : '创建新地址'}</ThemedText>
                <Pressable style={styles.saveBtn} onPress={() => void submitForm()}>
                  <ThemedText style={styles.saveText}>保存</ThemedText>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.createContent}>
                <View style={styles.pasteBox}>
                  <TextInput
                    value={rawAddress}
                    multiline
                    placeholder="复制地址，帮你快速填写"
                    placeholderTextColor="#B3B7BE"
                    onChangeText={setRawAddress}
                    style={styles.pasteInput}
                  />
                  <Pressable style={styles.recognizeBtn} onPress={() => void recognizeAddress()}>
                    <ThemedText style={styles.recognizeText}>粘贴并识别</ThemedText>
                  </Pressable>
                </View>

                <View style={styles.createRow}>
                  <ThemedText style={styles.createLabel}>收货人</ThemedText>
                  <TextInput value={form.name} maxLength={25} placeholder="姓名" placeholderTextColor="#B3B7BE" onChangeText={(name) => setForm((current) => ({ ...current, name }))} style={styles.createInput} />
                </View>
                <View style={styles.createRow}>
                  <ThemedText style={styles.createLabel}>联系电话</ThemedText>
                  <ThemedText style={styles.phonePrefix}>+86</ThemedText>
                  <TextInput value={form.phone} keyboardType="phone-pad" maxLength={11} placeholder="手机号" placeholderTextColor="#B3B7BE" onChangeText={(phone) => setForm((current) => ({ ...current, phone }))} style={styles.phoneInput} />
                </View>
                <Pressable style={styles.createRow} onPress={openRegionPicker}>
                  <ThemedText style={styles.createLabel}>所在地区</ThemedText>
                  <ThemedText numberOfLines={1} style={[styles.regionValue, !form.region && styles.placeholderText]}>{form.region || '请选择省 / 市 / 区 / 街道'}</ThemedText>
                  <ThemedText style={styles.rowArrow}>›</ThemedText>
                </Pressable>
                <View style={styles.createRowTall}>
                  <ThemedText style={styles.createLabel}>详细地址</ThemedText>
                  <TextInput
                    value={form.detail}
                    multiline
                    placeholder="小区、楼栋、门牌号"
                    placeholderTextColor="#B3B7BE"
                    onChangeText={(detail) => setForm((current) => ({ ...current, detail }))}
                    style={styles.detailInput}
                  />
                </View>
                <Pressable style={styles.defaultCreateRow} onPress={() => setForm((current) => ({ ...current, isDefault: !current.isDefault }))}>
                  <ThemedText numberOfLines={1} style={styles.defaultCreateLabel}>设为默认地址</ThemedText>
                  <View style={[styles.switchTrack, form.isDefault && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, form.isDefault && styles.switchThumbActive]} />
                  </View>
                </Pressable>
              </ScrollView>
            </ThemedView>
          </SafeAreaView>
        </Modal>

        <Modal visible={regionPickerVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setRegionPickerVisible(false)}>
          <View style={styles.regionOverlay}>
            <Pressable style={styles.regionBackdrop} onPress={() => setRegionPickerVisible(false)} />
            <View style={styles.regionSheet}>
              <View style={styles.regionHeader}>
                <View style={styles.regionCloseSpace} />
                <ThemedText style={styles.regionTitle}>所在地区</ThemedText>
                <Pressable style={styles.regionClose} onPress={() => setRegionPickerVisible(false)}>
                  <ThemedText style={styles.regionCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.regionTabs}>
                {['请选择', selectedProvince?.name, selectedCity?.name, selectedDistrict?.name].filter(Boolean).map((item, index) => (
                  <Pressable key={`${item}-${index}`} style={styles.regionTab} onPress={() => setRegionStep(index)}>
                    <ThemedText style={[styles.regionTabText, regionStep === index && styles.regionTabTextActive]}>{item}</ThemedText>
                    {regionStep === index ? <View style={styles.regionTabLine} /> : null}
                  </Pressable>
                ))}
              </View>

              {regionStep === 0 ? (
                <View style={styles.hotBlock}>
                  <View style={styles.countryRow}>
                    <ThemedText style={styles.countryActive}>中国内地（大陆）</ThemedText>
                    <ThemedText style={styles.countryText}>港澳台地区及海外</ThemedText>
                  </View>
                  <ThemedText style={styles.hotTitle}>热门城市</ThemedText>
                  <View style={styles.hotGrid}>
                    {hotCities.map((city) => (
                      <Pressable key={city} style={styles.hotCity} onPress={() => chooseHotCity(city)}>
                        <ThemedText style={styles.hotCityText}>{city}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <ThemedText style={styles.provinceTitle}>省份 / 地区</ThemedText>
                </View>
              ) : (
                <View style={styles.searchWrap}>
                  <ThemedText style={styles.searchIcon}>⌕</ThemedText>
                  <TextInput value={regionSearch} placeholder="搜索" placeholderTextColor="#B9BDC5" onChangeText={setRegionSearch} style={styles.searchInput} />
                </View>
              )}

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.optionList}>
                {pickerOptions.map((option) => {
                  const active = option === selectedProvince?.name || option === selectedCity?.name || option === selectedDistrict?.name;
                  const letter = option.slice(0, 1).toUpperCase();
                  return (
                    <Pressable
                      key={option}
                      style={styles.optionRow}
                      onPress={() => {
                        if (regionStep === 0) {
                          const province = regionData.find((item) => item.name === option);
                          setSelectedProvince(province || null);
                          setSelectedCity(null);
                          setSelectedDistrict(null);
                          setRegionStep(1);
                          setRegionSearch('');
                        } else if (regionStep === 1) {
                          const city = selectedProvince?.cities.find((item) => item.name === option) || null;
                          setSelectedCity(city);
                          setSelectedDistrict(null);
                          setRegionStep(2);
                          setRegionSearch('');
                        } else if (regionStep === 2) {
                          const district = selectedCity?.districts.find((item) => item.name === option) || null;
                          setSelectedDistrict(district);
                          setRegionStep(3);
                          setRegionSearch('');
                        } else {
                          finishRegion(option);
                        }
                      }}>
                      <ThemedText style={styles.optionLetter}>{letter}</ThemedText>
                      <ThemedText style={[styles.optionText, active && styles.optionTextActive]}>{option}</ThemedText>
                      {active ? <ThemedText style={styles.optionCheck}>✓</ThemedText> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  root: { flex: 1, backgroundColor: '#FFF' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
  },
  backBtn: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, color: '#2A2D33', fontWeight: '500', letterSpacing: 0 },
  headerSpace: { width: 50 },
  content: { minHeight: '100%', paddingTop: 16, paddingHorizontal: 34, paddingBottom: 104 },
  addressBlock: { marginBottom: 23 },
  addressBlockPick: { borderRadius: 8, padding: 10, marginHorizontal: -10 },
  region: { fontSize: 12, lineHeight: 19, color: '#969BA3', fontWeight: '500' },
  detail: { marginTop: 2, fontSize: 16, lineHeight: 24, color: '#33363C', fontWeight: '500' },
  contact: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#7F848C', fontWeight: '500' },
  pickHintRow: { marginTop: 12, alignItems: 'flex-end' },
  pickHint: { fontSize: 12, color: '#F51F4D', fontWeight: '700' },
  actionRow: { marginTop: 19, minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  defaultWrap: { minWidth: 78, minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#D8DCE2', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#F51F4D' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#F51F4D' },
  defaultText: { fontSize: 13, color: '#A2A6AE', fontWeight: '500' },
  defaultTextActive: { color: '#3A3D43' },
  addressActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  actionBtn: { minWidth: 50, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, color: '#8F949C', fontWeight: '500' },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 15, backgroundColor: '#E9EBEF' },
  empty: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 14, color: '#2A2D33', fontWeight: '700' },
  emptyText: { fontSize: 11, color: '#969BA3', fontWeight: '500' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 36,
    paddingTop: 17,
    paddingBottom: 15,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F1F3',
  },
  addBtn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F51F4D' },
  addText: { fontSize: 16, color: '#FFF', fontWeight: '600' },
  formSafe: { flex: 1, backgroundColor: '#FFF' },
  formPage: { flex: 1, backgroundColor: '#FFF' },
  createHeader: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  createTitle: { fontSize: 16, color: '#2A2D33', fontWeight: '500' },
  saveBtn: { width: 58, height: 50, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13, color: '#F51F4D', fontWeight: '800' },
  createContent: { paddingHorizontal: 26, paddingTop: 18, paddingBottom: 36 },
  pasteBox: { minHeight: 72, borderRadius: 2, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F8F8F9' },
  pasteInput: { flex: 1, minHeight: 46, padding: 0, textAlignVertical: 'top', fontSize: 13, lineHeight: 20, color: '#32363C' },
  recognizeBtn: { height: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E7E9ED', backgroundColor: '#FFF' },
  recognizeText: { fontSize: 12, color: '#4A4F57', fontWeight: '600' },
  createRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F1F3' },
  createRowTall: { minHeight: 88, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F1F3' },
  createLabel: { width: 90, fontSize: 16, color: '#24282F', fontWeight: '500' },
  createInput: { flex: 1, height: 62, padding: 0, fontSize: 14, color: '#24282F' },
  phonePrefix: { width: 46, fontSize: 15, color: '#24282F', fontWeight: '500' },
  phoneInput: { flex: 1, height: 62, padding: 0, fontSize: 14, color: '#24282F' },
  regionValue: { flex: 1, fontSize: 14, color: '#24282F', fontWeight: '500' },
  placeholderText: { color: '#B3B7BE', fontWeight: '400' },
  rowArrow: { fontSize: 23, color: '#B3B7BE', lineHeight: 25 },
  detailInput: { flex: 1, minHeight: 68, padding: 0, textAlignVertical: 'top', fontSize: 14, lineHeight: 21, color: '#24282F' },
  defaultCreateRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  defaultCreateLabel: { flex: 1, fontSize: 16, color: '#24282F', fontWeight: '500' },
  switchTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 2, backgroundColor: '#D7DAE0' },
  switchTrackActive: { backgroundColor: '#F51F4D' },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  switchThumbActive: { alignSelf: 'flex-end' },
  regionOverlay: { flex: 1, justifyContent: 'flex-end' },
  regionBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  regionSheet: { height: '69%', borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: '#FFF', overflow: 'hidden' },
  regionHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regionCloseSpace: { width: 52 },
  regionTitle: { fontSize: 18, color: '#2A2D33', fontWeight: '600' },
  regionClose: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  regionCloseText: { fontSize: 30, color: '#A5A9B0', fontWeight: '300' },
  regionTabs: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, gap: 26 },
  regionTab: { minHeight: 44, justifyContent: 'center', position: 'relative' },
  regionTabText: { fontSize: 14, color: '#858A93', fontWeight: '500' },
  regionTabTextActive: { fontSize: 15, color: '#2A2D33', fontWeight: '800' },
  regionTabLine: { position: 'absolute', left: 0, right: 0, bottom: 4, height: 2, borderRadius: 1, backgroundColor: '#F51F4D' },
  countryRow: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryActive: { fontSize: 13, color: '#33363C', fontWeight: '700' },
  countryText: { fontSize: 13, color: '#7F848C', fontWeight: '600' },
  hotBlock: { paddingHorizontal: 28, paddingTop: 4 },
  hotTitle: { marginTop: 16, fontSize: 13, color: '#33363C', fontWeight: '700' },
  hotGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hotCity: { width: '22.7%', height: 38, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F6F7' },
  hotCityText: { fontSize: 13, color: '#33363C', fontWeight: '600' },
  provinceTitle: { marginTop: 22, fontSize: 14, color: '#33363C', fontWeight: '700' },
  searchWrap: { height: 38, marginHorizontal: 28, marginTop: 4, borderRadius: 19, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F6F6F7' },
  searchIcon: { width: 26, fontSize: 20, color: '#B3B7BE' },
  searchInput: { flex: 1, height: 38, padding: 0, fontSize: 13, color: '#33363C' },
  optionList: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 28 },
  optionRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  optionLetter: { width: 26, fontSize: 12, color: '#A2A6AE', fontWeight: '500' },
  optionText: { flex: 1, fontSize: 15, color: '#33363C', fontWeight: '500' },
  optionTextActive: { color: '#F51F4D', fontWeight: '800' },
  optionCheck: { width: 26, textAlign: 'right', fontSize: 20, color: '#F51F4D', fontWeight: '800' },
});
