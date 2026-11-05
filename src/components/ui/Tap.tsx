import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

const APressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** насколько «проседает» при нажатии */
  scale?: number;
  haptics?: boolean;
};

/** Нажимаемый элемент с мягкой пружинящей анимацией */
export function Tap({ style, children, scale = 0.96, haptics = false, onPressIn, onPressOut, onPress, disabled, ...rest }: Props) {
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));
  return (
    <APressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        s.value = withSpring(scale, { damping: 18, stiffness: 420 });
        o.value = withTiming(0.85, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 14, stiffness: 320 });
        o.value = withTiming(1, { duration: 160 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.tap();
        onPress?.(e);
      }}
      style={[style, anim, disabled && { opacity: 0.45 }]}
    >
      {children}
    </APressable>
  );
}
