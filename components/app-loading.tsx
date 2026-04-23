import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const ActivityIndicator = require('react-native-paper/lib/commonjs/components/ActivityIndicator').default as any;
const Text = require('react-native-paper/lib/commonjs/components/Typography/Text').default as any;

export function AppActivityIndicator({ label, compact = false, color = '#F02D47', style }: { label?: string; compact?: boolean; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      <ActivityIndicator animating color={color} size={compact ? 20 : 28} />
      {label ? <Text variant="bodySmall" style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  wrapCompact: {
    minHeight: 0,
    paddingVertical: 0,
    gap: 0,
  },
  label: {
    color: '#7C838D',
    fontWeight: '700',
  },
});
