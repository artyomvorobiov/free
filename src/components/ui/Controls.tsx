import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { type ReactNode, type Ref } from 'react';
import {
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, webNoOutline } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { IconButton } from './Button';
import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

type InputProps = Omit<TextInputProps, 'ref'> & {
  icon?: LucideIcon;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
};

export function Input({ icon, containerStyle, style, ref, ...rest }: InputProps) {
    const t = useTheme();
    return (
      <View style={[styles.input, { backgroundColor: t.surface2 }, containerStyle]}>
        {icon ? <Icon icon={icon} size={18} color={t.textSecondary} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={t.textTertiary}
          selectionColor={t.accent}
          {...rest}
          style={[{ flex: 1, color: t.text, fontFamily: fonts.regular, fontSize: 16, paddingVertical: 0, minHeight: 22 }, webNoOutline, style]}
        />
      </View>
    );
}

/** Шапка экрана: назад + заголовок + действия справа */
export function Header({
  title,
  subtitle,
  right,
  onBack,
  large,
  transparent,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  large?: boolean;
  transparent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  return (
    <View style={{ paddingTop: insets.top + 4, backgroundColor: transparent ? 'transparent' : t.bg }}>
      <View style={styles.headerRow}>
        <IconButton
          icon={ChevronLeft}
          iconSize={26}
          label="Назад"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        />
        <View style={{ flex: 1, alignItems: large ? 'flex-start' : 'center' }}>
          {title && !large ? (
            <T v="h3" numberOfLines={1}>
              {title}
            </T>
          ) : null}
          {subtitle && !large ? (
            <T v="small" tone="secondary" numberOfLines={1}>
              {subtitle}
            </T>
          ) : null}
        </View>
        <View style={{ minWidth: 40, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }}>{right}</View>
      </View>
      {large && title ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <T v="title">{title}</T>
          {subtitle ? (
            <T v="callout" tone="secondary" style={{ marginTop: 4 }}>
              {subtitle}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 22, paddingHorizontal: 16 }}>
      {title ? (
        <T v="tiny" tone="secondary" style={{ textTransform: 'uppercase', marginLeft: 6, marginBottom: 8 }}>
          {title}
        </T>
      ) : null}
      <View style={{ backgroundColor: t.surface, borderRadius: radius.lg, overflow: 'hidden' }}>{children}</View>
      {footer ? (
        <T v="caption" tone="secondary" style={{ marginHorizontal: 8, marginTop: 8 }}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

export function Row({
  icon,
  emoji,
  label,
  value,
  onPress,
  danger,
  switchValue,
  onSwitch,
  hint,
  last,
  iconBg,
}: {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  switchValue?: boolean;
  onSwitch?: (v: boolean) => void;
  hint?: string;
  last?: boolean;
  iconBg?: string;
}) {
  const t = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hairline }]}>
      {icon || emoji ? (
        <View style={[styles.rowIcon, { backgroundColor: iconBg ?? (danger ? 'rgba(229,72,77,0.12)' : t.surface2) }]}>
          {icon ? <Icon icon={icon} size={18} color={danger ? t.danger : iconBg ? '#fff' : t.text} /> : <T>{emoji}</T>}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T v="bodyMedium" tone={danger ? 'danger' : 'primary'}>
          {label}
        </T>
        {hint ? (
          <T v="caption" tone="secondary" style={{ marginTop: 1 }}>
            {hint}
          </T>
        ) : null}
      </View>
      {value ? (
        <T v="callout" tone="secondary" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </T>
      ) : null}
      {onSwitch ? (
        <Switch
          value={!!switchValue}
          onValueChange={onSwitch}
          trackColor={{ true: t.accent, false: t.surface3 }}
          thumbColor="#fff"
          ios_backgroundColor={t.surface3}
          {...({ activeThumbColor: '#fff' } as object)}
        />
      ) : onPress ? (
        <Icon icon={ChevronRight} size={18} color={t.textTertiary} />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Tap scale={0.99} onPress={onPress}>
      {content}
    </Tap>
  );
}

export function Chip({
  label,
  active,
  onPress,
  count,
  emoji,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  count?: number;
  emoji?: string;
}) {
  const t = useTheme();
  return (
    <Tap
      haptics
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? t.text : t.surface, borderColor: active ? t.text : t.hairline }]}
    >
      {emoji ? <T v="caption">{emoji}</T> : null}
      <T v="caption" color={active ? t.bg : t.text}>
        {label}
      </T>
      {count ? (
        <View style={[styles.chipCount, { backgroundColor: active ? t.bg : t.accent }]}>
          <T v="tiny" color={active ? t.text : t.onAccent}>
            {count}
          </T>
        </View>
      ) : null}
    </Tap>
  );
}

/** Сегментированный выбор */
export function Segmented<V extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: V }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surface2 }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={String(o.value)}
            haptics
            scale={0.97}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: t.surface, ...styles.segmentActive }]}
          >
            <T v="caption" tone={active ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 48, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 54 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipCount: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmented: { flexDirection: 'row', borderRadius: 14, padding: 3, gap: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 11 },
  segmentActive: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
});
