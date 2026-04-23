import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { AppActivityIndicator } from '@/components/app-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearMarketBrowseItems, readMarketBrowseItems, writeMarketBrowseItems, type MarketBrowseItem } from '@/lib/market-cart';
import BackIcon from '@/public/icon/fanhuijiantou.svg';
import DateIcon from '@/public/icon/date.svg';
import ListIcon from '@/public/icon/liebiao.svg';
import SearchIcon from '@/public/icon/sousuo.svg';
import PictureIcon from '@/public/icon/tupian.svg';

type HistorySection = {
  key: string;
  title: string;
  items: MarketBrowseItem[];
};

type RenderItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'row'; key: string; items: MarketBrowseItem[] };

type CalendarDay = {
  key: string;
  day: number;
  timestamp: number;
  inMonth: boolean;
  hasHistory: boolean;
};

const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(timestamp: number) {
  return startOfDay(timestamp) + 86400000 - 1;
}

function startOfMonth(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function monthTitle(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sectionTitle(timestamp: number, todayStart: number) {
  const dayStart = startOfDay(timestamp);
  if (dayStart === todayStart) return '今天';
  if (dayStart === todayStart - 86400000) return '昨天';
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildSections(items: MarketBrowseItem[]) {
  const todayStart = startOfDay(Date.now());
  const map = new Map<string, HistorySection>();
  items.forEach((item) => {
    const title = sectionTitle(Number(item.viewedAt || Date.now()), todayStart);
    const dayKey = String(startOfDay(Number(item.viewedAt || Date.now())));
    const section = map.get(dayKey) || { key: dayKey, title, items: [] };
    section.items.push(item);
    map.set(dayKey, section);
  });
  return Array.from(map.values());
}

function chunkRows(section: HistorySection): RenderItem[] {
  const rows: RenderItem[] = [{ type: 'header', key: `header-${section.key}`, title: section.title }];
  for (let index = 0; index < section.items.length; index += 3) {
    rows.push({ type: 'row', key: `row-${section.key}-${index}`, items: section.items.slice(index, index + 3) });
  }
  return rows;
}

function buildCalendarDays(monthTimestamp: number, historyDays: Set<number>) {
  const month = new Date(monthTimestamp);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStartOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = startOfDay(firstDay.getTime()) - gridStartOffset * 86400000;
  return Array.from({ length: 42 }).map<CalendarDay>((_, index) => {
    const timestamp = gridStart + index * 86400000;
    const date = new Date(timestamp);
    return {
      key: String(timestamp),
      day: date.getDate(),
      timestamp,
      inMonth: date.getMonth() === month.getMonth(),
      hasHistory: historyDays.has(timestamp),
    };
  });
}

export default function ProductHistoryScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const [items, setItems] = useState<MarketBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(Date.now()));
  const [selectedDay, setSelectedDay] = useState(startOfDay(Date.now()));
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await readMarketBrowseItems());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const historyDays = useMemo(() => new Set(items.map((item) => startOfDay(Number(item.viewedAt || Date.now())))), [items]);
  const visibleItems = useMemo(
    () => (filterDay == null ? items : items.filter((item) => Number(item.viewedAt || 0) <= endOfDay(filterDay))),
    [filterDay, items],
  );
  const sections = useMemo(() => buildSections(visibleItems), [visibleItems]);
  const rows = useMemo(() => sections.flatMap(chunkRows), [sections]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth, historyDays), [calendarMonth, historyDays]);
  const visibleKeys = useMemo(() => visibleItems.map((item) => `${item.productId}-${item.viewedAt}`), [visibleItems]);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.includes(key));
  const showEmptyState = !rows.length && !manageMode;

  async function clearAll() {
    if (!items.length) return;
    const ok = await feedback.confirm({
      title: '清空商品足迹',
      message: '清空后无法恢复，确定删除全部浏览记录吗？',
      confirmLabel: '清空',
      danger: true,
    });
    if (!ok) return;
    setItems(await clearMarketBrowseItems());
    setFilterDay(null);
    setSelectedKeys([]);
    setManageMode(false);
    feedback.toast('商品足迹已清空');
  }

  function enterManageMode() {
    setManageMode(true);
    setSelectedKeys([]);
  }

  function exitManageMode() {
    setManageMode(false);
    setSelectedKeys([]);
  }

  function toggleSelected(key: string) {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? [] : visibleKeys);
  }

  async function deleteSelected() {
    if (!selectedKeys.length) {
      feedback.toast('请选择要删除的商品');
      return;
    }
    const selectedSet = new Set(selectedKeys);
    const next = items.filter((item) => !selectedSet.has(`${item.productId}-${item.viewedAt}`));
    await writeMarketBrowseItems(next);
    setItems(next);
    setSelectedKeys([]);
    if (!next.length) {
      setManageMode(false);
      setFilterDay(null);
    }
  }

  function openCalendar() {
    const initialDay = filterDay ?? startOfDay(items[0]?.viewedAt || Date.now());
    setSelectedDay(initialDay);
    setCalendarMonth(startOfMonth(initialDay));
    setCalendarVisible(true);
  }

  function changeMonth(delta: number) {
    const current = new Date(calendarMonth);
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1).getTime();
    setCalendarMonth(next);
  }

  function chooseDay(day: CalendarDay) {
    if (!day.hasHistory) {
      feedback.toast('当日无浏览记录');
      return;
    }
    setSelectedDay(day.timestamp);
    if (!day.inMonth) setCalendarMonth(startOfMonth(day.timestamp));
  }

  function confirmCalendar() {
    setFilterDay(selectedDay);
    setCalendarVisible(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        {manageMode ? (
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.manageTextBtn} onPress={exitManageMode}>
              <ThemedText style={styles.cancelText}>取消</ThemedText>
            </Pressable>
            <ThemedText style={styles.title}>管理商品足迹</ThemedText>
            <Pressable hitSlop={12} style={styles.manageTextBtn} onPress={exitManageMode}>
              <ThemedText style={styles.doneText}>完成</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.headerIcon} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/market'))}>
              <BackIcon width={23} height={23} color="#2A2D33" />
            </Pressable>
            <ThemedText style={styles.title}>商品足迹 ({visibleItems.length})</ThemedText>
            <View style={styles.headerActions}>
              <Pressable hitSlop={10} style={styles.headerIcon} onPress={() => router.push('/product-history-search')}>
                <SearchIcon width={27} height={27} color="#2A2D33" />
              </Pressable>
              <Pressable hitSlop={10} style={styles.headerIcon} onPress={enterManageMode}>
                <ListIcon width={27} height={27} color="#2A2D33" />
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.state}>
            <AppActivityIndicator label="正在加载足迹" />
          </View>
        ) : rows.length ? (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.key}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.list, manageMode && styles.listManage]}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={styles.sectionHeader}>
                    <ThemedText style={styles.sectionTitle}>{item.title}</ThemedText>
                    <Pressable hitSlop={10} style={styles.dateBtn} onPress={openCalendar}>
                      <DateIcon width={23} height={23} color="#2A2D33" />
                    </Pressable>
                  </View>
                );
              }
              return (
                <View style={styles.productRow}>
                  {item.items.map((product) => {
                    const key = `${product.productId}-${product.viewedAt}`;
                    const selected = selectedKeys.includes(key);
                    return (
                      <Pressable
                        key={key}
                        style={styles.productCell}
                        onPress={() => {
                          if (manageMode) {
                            toggleSelected(key);
                            return;
                          }
                          router.push({
                            pathname: '/product/[id]',
                            params: { id: product.productId, name: product.name, price: String(product.price), sold: product.soldText },
                          });
                        }}>
                        <View style={styles.productImage}>
                          {product.imageUrl ? (
                            <Image source={{ uri: product.imageUrl }} style={styles.imagePhoto} contentFit="cover" />
                          ) : (
                            <PictureIcon width={46} height={46} color="#C6CBD3" />
                          )}
                          {manageMode ? (
                            <View style={[styles.selectCircle, selected && styles.selectCircleActive]}>
                              {selected ? <ThemedText style={styles.selectMark}>✓</ThemedText> : null}
                            </View>
                          ) : null}
                        </View>
                        <ThemedText numberOfLines={1} style={styles.price}>¥{formatPrice(product.price)}</ThemedText>
                      </Pressable>
                    );
                  })}
                  {Array.from({ length: 3 - item.items.length }).map((_, index) => (
                    <View key={`spacer-${index}`} style={styles.productCell} />
                  ))}
                </View>
              );
            }}
          />
        ) : showEmptyState ? (
          <View style={styles.state}>
            <SearchIcon width={42} height={42} color="#C8CDD5" />
            <ThemedText style={styles.emptyTitle}>还没有商品足迹</ThemedText>
            <ThemedText style={styles.emptyText}>浏览商品详情后会自动记录在这里</ThemedText>
            <Pressable style={styles.goBtn} onPress={() => router.replace('/(tabs)/market')}>
              <ThemedText style={styles.goText}>去逛逛</ThemedText>
            </Pressable>
          </View>
        ) : null}
        {manageMode ? (
          <View style={styles.manageBar}>
            <Pressable style={styles.selectAllWrap} onPress={toggleAll}>
              <View style={[styles.bottomCircle, allSelected && styles.bottomCircleActive]}>
                {allSelected ? <ThemedText style={styles.selectMark}>✓</ThemedText> : null}
              </View>
              <ThemedText style={styles.selectAllText}>全选</ThemedText>
            </Pressable>
            <Pressable style={[styles.deleteBtn, !selectedKeys.length && styles.deleteBtnDisabled]} onPress={() => void deleteSelected()}>
              <ThemedText style={[styles.deleteText, !selectedKeys.length && styles.deleteTextDisabled]}>删除</ThemedText>
            </Pressable>
          </View>
        ) : null}
        <Modal visible={calendarVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCalendarVisible(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setCalendarVisible(false)} />
            <View style={styles.calendarSheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetSide} />
                <ThemedText style={styles.sheetTitle}>选择日期</ThemedText>
                <Pressable hitSlop={12} style={styles.sheetClose} onPress={() => setCalendarVisible(false)}>
                  <ThemedText style={styles.sheetCloseText}>×</ThemedText>
                </Pressable>
              </View>

              <View style={styles.monthRow}>
                <Pressable hitSlop={12} style={styles.monthBtn} onPress={() => changeMonth(-1)}>
                  <ThemedText style={styles.monthArrow}>‹</ThemedText>
                </Pressable>
                <ThemedText style={styles.monthText}>{monthTitle(calendarMonth)}</ThemedText>
                <Pressable hitSlop={12} style={styles.monthBtn} onPress={() => changeMonth(1)}>
                  <ThemedText style={styles.monthArrow}>›</ThemedText>
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {weekLabels.map((label) => (
                  <ThemedText key={label} style={styles.weekText}>{label}</ThemedText>
                ))}
              </View>
              <View style={styles.dayGrid}>
                {Array.from({ length: 6 }).map((_, rowIndex) => (
                  <View key={`calendar-row-${rowIndex}`} style={styles.calendarWeekLine}>
                    {calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7).map((day) => {
                      const selected = day.timestamp === selectedDay;
                      return (
                        <Pressable key={day.key} style={styles.dayCell} onPress={() => chooseDay(day)}>
                          <View style={[styles.dayCircle, selected && styles.dayCircleSelected]}>
                            <ThemedText
                              style={[
                                styles.dayText,
                                !day.hasHistory && styles.dayTextMuted,
                                !day.inMonth && styles.dayTextOutside,
                                selected && styles.dayTextSelected,
                              ]}>
                              {day.day}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              <Pressable style={styles.confirmBtn} onPress={confirmCalendar}>
                <ThemedText style={styles.confirmText}>确认</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, color: '#2A2D33', fontWeight: '500' },
  manageTextBtn: { width: 72, height: 42, alignItems: 'center', justifyContent: 'center' },
  cancelText: { alignSelf: 'flex-start', fontSize: 17, color: '#343941', fontWeight: '400' },
  doneText: { alignSelf: 'flex-end', fontSize: 17, color: '#D63C58', fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 28 },
  listManage: { paddingBottom: 104 },
  sectionTitle: {
    fontSize: 20,
    color: '#2A2D33',
    fontWeight: '500',
  },
  productRow: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  productCell: { flex: 1, minWidth: 0 },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEFF3',
  },
  imagePhoto: { width: '100%', height: '100%' },
  selectCircle: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCircleActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  selectMark: { fontSize: 14, lineHeight: 16, color: '#FFFFFF', fontWeight: '900' },
  price: {
    marginTop: 8,
    fontSize: 19,
    color: '#2A2D33',
    fontWeight: '400',
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyTitle: { fontSize: 17, color: '#20242B', fontWeight: '900' },
  emptyText: { fontSize: 13, color: '#8B9098', fontWeight: '700' },
  goBtn: {
    marginTop: 8,
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F02D47',
  },
  goText: { fontSize: 14, color: '#FFFFFF', fontWeight: '900' },
  manageBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F1F3',
  },
  selectAllWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bottomCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#DADDE2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  bottomCircleActive: { borderColor: '#F02D47', backgroundColor: '#F02D47' },
  selectAllText: { fontSize: 16, color: '#777D87', fontWeight: '500' },
  deleteBtn: {
    width: 132,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F75D7D',
  },
  deleteBtnDisabled: { backgroundColor: '#FFB2C1' },
  deleteText: { fontSize: 17, color: '#FFFFFF', fontWeight: '700' },
  deleteTextDisabled: { color: 'rgba(255,255,255,0.72)' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  calendarSheet: {
    minHeight: '58%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 34,
    backgroundColor: '#FFFFFF',
  },
  sheetHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  sheetSide: { width: 40 },
  sheetTitle: { fontSize: 18, color: '#343941', fontWeight: '500' },
  sheetClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 30, lineHeight: 32, color: '#9EA3AA', fontWeight: '300' },
  monthRow: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  monthBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  monthArrow: { fontSize: 32, lineHeight: 32, color: '#B7BBC2', fontWeight: '300' },
  monthText: { minWidth: 112, textAlign: 'center', fontSize: 18, color: '#343941', fontWeight: '500' },
  weekRow: { height: 36, paddingHorizontal: 34, flexDirection: 'row', alignItems: 'center' },
  weekText: { flex: 1, textAlign: 'center', fontSize: 15, color: '#606672', fontWeight: '500' },
  dayGrid: { paddingHorizontal: 34 },
  calendarWeekLine: { height: 42, flexDirection: 'row', alignItems: 'center' },
  dayCell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: '#FFE6EE' },
  dayText: { fontSize: 16, color: '#2A2D33', fontWeight: '400' },
  dayTextMuted: { color: '#C8CBD1' },
  dayTextOutside: { color: '#D4D7DC' },
  dayTextSelected: { color: '#F02D47', fontWeight: '700' },
  confirmBtn: {
    alignSelf: 'center',
    marginTop: 44,
    width: 132,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F02D47',
  },
  confirmText: { fontSize: 16, color: '#FFFFFF', fontWeight: '800' },
});
