import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type LaunchCoverProps = {
  onReady?: (event: LayoutChangeEvent) => void;
};

function LaunchCoverComponent({ onReady }: LaunchCoverProps) {
  return (
    <View style={styles.container} onLayout={onReady}>
      <StatusBar style="dark" />
      <Image
        source={require('@/assets/images/splash.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        priority="high"
      />
    </View>
  );
}

export const LaunchCover = memo(LaunchCoverComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
