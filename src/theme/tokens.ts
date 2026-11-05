import { Platform } from 'react-native';

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  hairline: string;
  incoming: string;
  incomingText: string;
  overlay: string;
  danger: string;
  success: string;
  warning: string;
  glassTint: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F5F2ED',
    surface: '#FFFFFF',
    surface2: '#EFEBE4',
    surface3: '#E6E1D8',
    text: '#15130F',
    textSecondary: '#7A746B',
    textTertiary: '#ABA498',
    hairline: 'rgba(21,19,15,0.08)',
    incoming: '#FFFFFF',
    incomingText: '#15130F',
    overlay: 'rgba(21,19,15,0.38)',
    danger: '#E5484D',
    success: '#2BB673',
    warning: '#F5A524',
    glassTint: 'rgba(255,255,255,0.72)',
  },
  dark: {
    bg: '#0E0D0C',
    surface: '#1A1917',
    surface2: '#232120',
    surface3: '#2E2C29',
    text: '#F3F0EA',
    textSecondary: '#9A948A',
    textTertiary: '#6B665E',
    hairline: 'rgba(255,255,255,0.08)',
    incoming: '#1F1E1C',
    incomingText: '#F3F0EA',
    overlay: 'rgba(0,0,0,0.55)',
    danger: '#FF6369',
    success: '#3DD68C',
    warning: '#FFB224',
    glassTint: 'rgba(26,25,23,0.72)',
  },
};

export type Accent = {
  id: string;
  name: string;
  color: string;
  on: string;
  /** вариант для тёмной темы (если отличается) */
  dark?: { color: string; on: string };
};

export const accents: Accent[] = [
  { id: 'coral', name: 'Коралл', color: '#FF6A3D', on: '#FFFFFF' },
  { id: 'lime', name: 'Лайм', color: '#C2EE45', on: '#15130F' },
  { id: 'iris', name: 'Ирис', color: '#6F5BFF', on: '#FFFFFF' },
  { id: 'sky', name: 'Небо', color: '#2F8CFF', on: '#FFFFFF' },
  { id: 'rose', name: 'Роза', color: '#FF4D8D', on: '#FFFFFF' },
  { id: 'mint', name: 'Мята', color: '#36D19F', on: '#0E1A15' },
  { id: 'ink', name: 'Чернила', color: '#15130F', on: '#FFFFFF', dark: { color: '#F3F0EA', on: '#15130F' } },
];

/** Общие для собеседников темы чата */
export type ChatTheme = {
  id: string;
  name: string;
  /** null — у каждого свой акцент */
  colors: [string, string] | null;
  on: string;
  emoji: string;
};

export const chatThemes: ChatTheme[] = [
  { id: 'default', name: 'Мой цвет', colors: null, on: '#FFFFFF', emoji: '✨' },
  { id: 'sunset', name: 'Закат', colors: ['#FF8A3D', '#FF3D7F'], on: '#FFFFFF', emoji: '🌅' },
  { id: 'ocean', name: 'Океан', colors: ['#2F7BFF', '#1FC8C8'], on: '#FFFFFF', emoji: '🌊' },
  { id: 'forest', name: 'Лес', colors: ['#2E9E5B', '#A3D84A'], on: '#FFFFFF', emoji: '🌿' },
  { id: 'night', name: 'Ночь', colors: ['#4B3BFF', '#B24BFF'], on: '#FFFFFF', emoji: '🌌' },
  { id: 'peach', name: 'Персик', colors: ['#FFC29A', '#FF9BB5'], on: '#2A1A14', emoji: '🍑' },
  { id: 'mono', name: 'Графит', colors: ['#2B2A28', '#55514B'], on: '#FFFFFF', emoji: '🖤' },
];

export const chatThemeById = (id: string | null | undefined) =>
  chatThemes.find((t) => t.id === id) ?? chatThemes[0];

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const fonts = {
  display: 'Unbounded_700Bold',
  displaySemi: 'Unbounded_600SemiBold',
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
};

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 3 },
  default: { boxShadow: '0 6px 24px rgba(0,0,0,0.08)' },
}) as object;

/** Детерминированный «цвет человека» для аватаров без фото */
const avatarGradients: [string, string][] = [
  ['#FF9A62', '#FF5E7E'],
  ['#7C6CFF', '#4FA3FF'],
  ['#2FD3A0', '#3B9EFF'],
  ['#FFC24B', '#FF7A45'],
  ['#FF6FB5', '#B06CFF'],
  ['#45C4E8', '#2FD3A0'],
  ['#A8E05F', '#2FB873'],
  ['#FF8A8A', '#FFB86B'],
];

export function gradientFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarGradients[Math.abs(h) % avatarGradients.length];
}

/** На вебе убираем системную рамку фокуса у полей ввода */
export const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;
