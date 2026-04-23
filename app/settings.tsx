import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/app-feedback';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import BackIcon from '@/public/icon/fanhuijiantou.svg';

type SettingRow = {
  title: string;
  value?: string;
  route?: '/change-password' | '/address-list';
};

const groups: SettingRow[][] = [
  [{ title: '修改密码', route: '/change-password' }, { title: '隐私设置' }],
  [{ title: '通知设置' }, { title: '收货地址', route: '/address-list' }],
  [{ title: '青少年模式', value: '未开启' }, { title: '深色模式' }],
  [{ title: '帮助与客服' }, { title: '鼓励一下' }, { title: '个人信息收集清单' }, { title: '第三方信息共享清单' }, { title: '关于 账户信息' }],
];

export default function SettingsScreen() {
  const router = useRouter();
  const feedback = useFeedback();
  const { signOut } = useAuth();

  async function logout() {
    await signOut();
    router.replace('/login');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable hitSlop={12} style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
            <BackIcon width={27} height={27} color="#111" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>设置</ThemedText>
          <View style={styles.headerSpace} />
        </View>

        <View style={styles.content}>
          {groups.map((group, groupIndex) => (
            <View key={`group-${groupIndex}`} style={styles.group}>
              {group.map((item, index) => (
                <Pressable
                  key={item.title}
                  style={[styles.row, index > 0 && styles.rowDivider]}
                  onPress={() => {
                    if (item.route) {
                      router.push(item.route);
                      return;
                    }
                    feedback.toast('功能暂未开发');
                  }}>
                  <ThemedText style={styles.rowTitle}>{item.title}</ThemedText>
                  <View style={styles.rowRight}>
                    {item.value ? <ThemedText style={styles.rowValue}>{item.value}</ThemedText> : null}
                    <ThemedText style={styles.chevron}>›</ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}

          <Pressable style={styles.logoutBtn} onPress={() => void logout()}>
            <ThemedText style={styles.logoutText}>登出账户</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#343941' },
  headerSpace: { width: 44 },
  content: { paddingTop: 28, paddingHorizontal: 28 },
  group: {
    marginBottom: 26,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EFEFEF' },
  rowTitle: { fontSize: 16, color: '#5F6570', fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowValue: { fontSize: 15, color: '#848A94' },
  chevron: { fontSize: 26, color: '#B3B7BE', lineHeight: 28 },
  logoutBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    marginTop: 14,
  },
  logoutText: { fontSize: 16, color: '#5F6570', fontWeight: '600' },
});
