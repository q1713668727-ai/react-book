import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { videoPlaceholders } from '@/data/mock-xhs';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function VideoScreen() {
  const [pageHeight, setPageHeight] = useState(() => Dimensions.get('window').height);
  const overlayHint = useThemeColor({ light: 'rgba(255,255,255,0.95)', dark: 'rgba(28,28,30,0.92)' }, 'text');

  const onViewportLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - pageHeight) > 1) {
      setPageHeight(h);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.viewport} onLayout={onViewportLayout}>
        <ScrollView
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={pageHeight}
          snapToAlignment="start"
          contentContainerStyle={styles.scrollContent}>
          {videoPlaceholders.map((item) => (
            <View key={item.id} style={[styles.page, { height: pageHeight }]}>
              <Image source={{ uri: item.coverUri }} style={styles.cover} contentFit="cover" />
              <View style={styles.gradient} />
              <View style={styles.caption}>
                <View style={[styles.hintPill, { backgroundColor: overlayHint }]}>
                  <ThemedText style={styles.hintText} lightColor="#333" darkColor="#f2f2f7">
                    竖滑切换 · 占位封面
                  </ThemedText>
                </View>
                <ThemedText style={styles.title} lightColor="#fff" darkColor="#fff">
                  {item.title}
                </ThemedText>
                <ThemedText
                  style={styles.subtitle}
                  lightColor="rgba(255,255,255,0.9)"
                  darkColor="rgba(235,235,245,0.85)">
                  {item.subtitle}
                </ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewport: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  caption: {
    padding: 24,
    paddingBottom: 48,
    gap: 10,
  },
  hintPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hintText: {
    fontSize: 12,
    opacity: 0.9,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
  },
});
