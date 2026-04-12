import { Image } from 'expo-image';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { conversations } from '@/data/mock-xhs';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function ChatScreen() {
  const border = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'text');
  const muted = useThemeColor({ light: '#8E8E93', dark: '#8E8E93' }, 'text');
  const badgeBg = '#FF2D55';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedView style={styles.root}>
        <View style={[styles.header, { borderBottomColor: border }]}>
          <ThemedText type="title" style={styles.headerTitle}>
            消息
          </ThemedText>
        </View>
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: border }]} />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <Image source={{ uri: item.avatarUri }} style={styles.avatar} contentFit="cover" />
              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  <ThemedText style={[styles.time, { color: muted }]}>{item.time}</ThemedText>
                </View>
                <View style={styles.rowBottom}>
                  <ThemedText style={[styles.preview, { color: muted }]} numberOfLines={1}>
                    {item.lastMessage}
                  </ThemedText>
                  {item.unread != null && item.unread > 0 ? (
                    <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                      <ThemedText style={styles.badgeText}>{item.unread}</ThemedText>
                    </View>
                  ) : null}
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
  safe: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
  },
  list: {
    paddingVertical: 4,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 76,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E5E5E5',
  },
  rowMain: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  preview: {
    fontSize: 14,
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
