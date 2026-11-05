import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';

const liquid = Platform.OS === 'ios' && (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

type Props = {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** интерактивное «жидкое стекло» iOS 26 реагирует на касания */
  interactive?: boolean;
  intensity?: number;
};

/**
 * Полупрозрачная «стеклянная» подложка:
 * iOS 26+ — нативное Liquid Glass, старые iOS и веб — размытие, Android — плотный фон.
 */
export function Glass({ style, children, interactive, intensity = 60 }: Props) {
  const t = useTheme();
  if (liquid) {
    return (
      <GlassView style={style} glassEffectStyle="regular" isInteractive={interactive} colorScheme={t.scheme}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'android') {
    return <View style={[style, { backgroundColor: t.scheme === 'dark' ? 'rgba(30,29,27,0.96)' : 'rgba(255,255,255,0.96)' }]}>{children}</View>;
  }
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <BlurView intensity={intensity} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glassTint }]} />
      {children}
    </View>
  );
}

export const hasLiquidGlass = liquid;
