import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { Icon } from './Icon';
import { T } from './T';
import { Tap } from './Tap';

type Props = {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'lg' | 'md' | 'sm';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
};

export function Button({ title, onPress, kind = 'primary', size = 'lg', icon, loading, disabled, style, full }: Props) {
  const t = useTheme();
  const bg =
    kind === 'primary' ? t.accent : kind === 'secondary' ? t.surface2 : kind === 'danger' ? 'rgba(229,72,77,0.12)' : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? t.danger : kind === 'ghost' ? t.accent : t.text;
  const h = size === 'lg' ? 56 : size === 'md' ? 46 : 36;
  return (
    <Tap
      haptics
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        {
          height: h,
          borderRadius: size === 'sm' ? radius.pill : radius.lg,
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' ? 14 : 22,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          alignSelf: full ? 'stretch' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Icon icon={icon} size={size === 'sm' ? 16 : 20} color={fg} /> : null}
          <T v={size === 'sm' ? 'caption' : 'bodySemi'} color={fg}>
            {title}
          </T>
        </View>
      )}
    </Tap>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 40,
  color,
  bg,
  iconSize = 20,
  disabled,
  label,
  fill,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  size?: number;
  color?: string;
  bg?: string;
  iconSize?: number;
  disabled?: boolean;
  label?: string;
  fill?: string;
}) {
  const t = useTheme();
  return (
    <Tap
      haptics
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? 'transparent',
      }}
    >
      <Icon icon={icon} size={iconSize} color={color ?? t.text} fill={fill} />
    </Tap>
  );
}
