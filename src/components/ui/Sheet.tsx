import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
};

/** Нижняя «шторка» с плавным появлением */
export function Sheet({ visible, onClose, title, subtitle, children, scroll }: SheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(600);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = 600;
      y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      fade.value = withTiming(1, { duration: 220 });
    } else if (mounted) {
      y.value = withTiming(700, { duration: 220, easing: Easing.in(Easing.cubic) });
      fade.value = withTiming(0, { duration: 220 });
      const id = setTimeout(() => setMounted(false), 230);
      return () => clearTimeout(id);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.panel,
            { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 },
            panel,
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.surface3 }]} />
          {title ? (
            <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: subtitle ? 4 : 12 }}>
              <T v="h2">{title}</T>
              {subtitle ? (
                <T v="callout" tone="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
                  {subtitle}
                </T>
              ) : null}
            </View>
          ) : null}
          <Body
            style={scroll ? { maxHeight: 520 } : undefined}
            keyboardShouldPersistTaps="handled"
            {...(scroll ? { showsVerticalScrollIndicator: false } : {})}
          >
            {children}
          </Body>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type SheetAction = {
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  hint?: string;
  danger?: boolean;
  onPress: () => void;
};

/** Список действий в шторке */
export function ActionList({ actions, onDone }: { actions: SheetAction[]; onDone?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 12, gap: 2 }}>
      {actions.map((a) => (
        <Tap
          key={a.label}
          scale={0.98}
          haptics
          onPress={() => {
            onDone?.();
            setTimeout(a.onPress, onDone ? 320 : 0);
          }}
          style={[styles.action, { backgroundColor: 'transparent' }]}
        >
          <View style={[styles.actionIcon, { backgroundColor: a.danger ? 'rgba(229,72,77,0.12)' : t.surface2 }]}>
            {a.icon ? <Icon icon={a.icon} size={19} color={a.danger ? t.danger : t.text} /> : <T v="h3">{a.emoji}</T>}
          </View>
          <View style={{ flex: 1 }}>
            <T v="bodyMedium" tone={a.danger ? 'danger' : 'primary'}>
              {a.label}
            </T>
            {a.hint ? (
              <T v="caption" tone="secondary">
                {a.hint}
              </T>
            ) : null}
          </View>
        </Tap>
      ))}
    </View>
  );
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <ActionList actions={actions} onDone={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 16 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
