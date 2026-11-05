import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { accents, palettes, type Palette } from './tokens';

export type Theme = Palette & {
  scheme: 'light' | 'dark';
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentId: string;
};

export function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const mode = useSettings((s) => s.themeMode);
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}

export function useTheme(): Theme {
  const scheme = useScheme();
  const accentId = useSettings((s) => s.accentId);
  return useMemo(() => {
    const base = palettes[scheme];
    const a = accents.find((x) => x.id === accentId) ?? accents[0];
    const variant = scheme === 'dark' && a.dark ? a.dark : a;
    return {
      ...base,
      scheme,
      accentId: a.id,
      accent: variant.color,
      onAccent: variant.on,
      accentSoft: hexToRgba(variant.color, scheme === 'dark' ? 0.18 : 0.14),
    };
  }, [scheme, accentId]);
}
