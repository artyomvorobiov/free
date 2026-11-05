import { Text, type TextProps, type TextStyle } from 'react-native';

import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type TVariant =
  | 'hero'
  | 'title'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'bodySemi'
  | 'callout'
  | 'caption'
  | 'small'
  | 'tiny';

const variants: Record<TVariant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.displaySemi, fontSize: 21, lineHeight: 27, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  bodySemi: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  callout: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  small: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 15 },
  tiny: { fontFamily: fonts.semibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.2 },
};

export type TProps = TextProps & {
  v?: TVariant;
  color?: string;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';
  center?: boolean;
};

export function T({ v = 'body', color, tone = 'primary', center, style, ...rest }: TProps) {
  const t = useTheme();
  const toneColor =
    tone === 'secondary'
      ? t.textSecondary
      : tone === 'tertiary'
        ? t.textTertiary
        : tone === 'accent'
          ? t.accent
          : tone === 'danger'
            ? t.danger
            : tone === 'onAccent'
              ? t.onAccent
              : t.text;
  return (
    <Text
      {...rest}
      style={[variants[v], { color: color ?? toneColor }, center && { textAlign: 'center' }, style]}
    />
  );
}
