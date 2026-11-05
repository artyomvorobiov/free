import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { gradientFor, fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = {
  id: string;
  name?: string | null;
  url?: string | null;
  emoji?: string | null;
  size?: number;
  online?: boolean;
  /** «Заметки» */
  self?: boolean;
  ring?: string;
};

function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const Avatar = memo(function Avatar({ id, name, url, emoji, size = 48, online, self, ring }: Props) {
  const t = useTheme();
  const r = size * 0.38;
  const colors = self ? ([t.accent, t.accent] as [string, string]) : gradientFor(id);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          { width: size, height: size, borderRadius: r, overflow: 'hidden' },
          ring ? { borderWidth: 2, borderColor: ring } : null,
        ]}
      >
        {url ? (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.center}>
            {self ? (
              <Text style={{ fontSize: size * 0.42 }}>🔖</Text>
            ) : emoji ? (
              <Text style={{ fontSize: size * 0.46 }}>{emoji}</Text>
            ) : (
              <Text style={{ fontFamily: fonts.displaySemi, fontSize: size * 0.34, color: '#fff', letterSpacing: -0.5 }}>
                {initials(name)}
              </Text>
            )}
          </LinearGradient>
        )}
      </View>
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: Math.max(12, size * 0.27),
            height: Math.max(12, size * 0.27),
            borderRadius: 99,
            backgroundColor: t.success,
            borderWidth: 2.5,
            borderColor: t.bg,
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
