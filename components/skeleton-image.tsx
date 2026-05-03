import { Image, type ImageProps } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type SkeletonImageProps = Omit<ImageProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  skeletonColor?: string;
};

function sourceKey(source: ImageProps['source']): string {
  if (!source) return '';
  if (typeof source === 'number' || typeof source === 'string') return String(source);
  if (Array.isArray(source)) return source.map((item) => sourceKey(item)).join('|');
  if (typeof source === 'object') {
    const record = source as Record<string, unknown>;
    return String(record.uri || record.blurhash || record.thumbhash || JSON.stringify(record));
  }
  return String(source);
}

export function SkeletonImage({ source, style, skeletonColor = '#EEF0F3', onLoad, onError, onLoadEnd, ...props }: SkeletonImageProps) {
  const initialKey = useMemo(() => sourceKey(source), [source]);
  const [loading, setLoading] = useState(Boolean(initialKey));
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    setLoading(Boolean(initialKey));
  }, [initialKey]);

  useEffect(() => {
    if (!loading) {
      opacity.stopAnimation();
      opacity.setValue(0);
      return;
    }

    opacity.setValue(0.45);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, opacity]);

  return (
    <View style={[styles.wrap, style]}>
      <Image
        {...props}
        source={source}
        style={StyleSheet.absoluteFill}
        onLoad={(event) => {
          setLoading(false);
          onLoad?.(event);
        }}
        onError={(event) => {
          setLoading(false);
          onError?.(event);
        }}
        onLoadEnd={() => {
          setLoading(false);
          onLoadEnd?.();
        }}
      />
      {loading ? <Animated.View pointerEvents="none" style={[styles.skeleton, { backgroundColor: skeletonColor, opacity }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#F1F2F4',
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
  },
});
