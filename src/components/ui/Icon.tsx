import type { LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/theme/useTheme';

export type IconProps = {
  icon: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function Icon({ icon: C, size = 22, color, strokeWidth = 2, fill }: IconProps) {
  const t = useTheme();
  return <C size={size} color={color ?? t.text} strokeWidth={strokeWidth} fill={fill ?? 'none'} />;
}
