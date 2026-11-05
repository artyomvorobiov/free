import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Ban, Bell, Eye, LogOut, MessageSquareText, Moon, Trash, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header, Row, Section, Segmented } from '@/components/ui/Controls';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, setStatus, updateProfile } from '@/lib/api';
import { deleteAccount, signOut } from '@/lib/auth';
import { statusActive } from '@/lib/chat-utils';
import { confirm } from '@/lib/confirm';
import { DEMO } from '@/lib/config';
import { ensureNotificationPermission } from '@/lib/notifications';
import { formatUntil } from '@/lib/time';
import { useAuth } from '@/store/auth';
import { useSettings, type ThemeMode } from '@/store/settings';
import { toast } from '@/store/ui';
import { accents, fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const PRESETS: { emoji: string; text: string; quiet: boolean }[] = [
  { emoji: '🎧', text: 'В фокусе', quiet: true },
  { emoji: '💼', text: 'На встрече', quiet: true },
  { emoji: '🚗', text: 'В дороге', quiet: false },
  { emoji: '🌙', text: 'Сплю', quiet: true },
  { emoji: '🏋️', text: 'На тренировке', quiet: false },
  { emoji: '✈️', text: 'В отпуске', quiet: true },
  { emoji: '🤒', text: 'Болею', quiet: true },
  { emoji: '📵', text: 'Отвечу позже', quiet: true },
];

function durations() {
  const now = new Date();
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  return [
    { label: '30 мин', date: new Date(now.getTime() + 30 * 60_000) },
    { label: '1 час', date: new Date(now.getTime() + 3600_000) },
    { label: 'До вечера', date: now.getHours() < 19 ? at(0, 19) : at(0, 23) },
    { label: 'До утра', date: at(1, 9) },
    { label: 'Неделя', date: new Date(now.getTime() + 7 * 86400_000) },
    { label: 'Без срока', date: null as Date | null },
  ];
}

export function StatusSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const profile = useAuth((s) => s.profile);
  const [emoji, setEmoji] = useState('🎧');
  const [text, setText] = useState('');
  const [quiet, setQuiet] = useState(true);
  const [dur, setDur] = useState(1);
  const options = durations();

  const save = async () => {
    try {
      await setStatus({ emoji, text: text.trim() || 'Занят(а)', until: options[dur].date, quiet });
      toast('Статус обновлён — друзья увидят его в чате', 'success', emoji);
      onClose();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Статус" subtitle="Подскажите друзьям, когда ждать ответа. Статус виден в чатах с вами." scroll>
      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => {
            const on = emoji === p.emoji && text === p.text;
            return (
              <Tap
                key={p.text}
                haptics
                onPress={() => {
                  setEmoji(p.emoji);
                  setText(p.text);
                  setQuiet(p.quiet);
                }}
                style={[styles.preset, { backgroundColor: on ? t.text : t.surface2 }]}
              >
                <T v="callout">{p.emoji}</T>
                <T v="caption" color={on ? t.bg : t.text}>
                  {p.text}
                </T>
              </Tap>
            );
          })}
        </View>
        <View style={[styles.custom, { backgroundColor: t.surface2 }]}>
          <T style={{ fontSize: 22 }}>{emoji}</T>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Свой статус…"
            placeholderTextColor={t.textTertiary}
            maxLength={60}
            style={{ flex: 1, color: t.text, fontFamily: fonts.regular, fontSize: 16 }}
          />
        </View>
        <T v="tiny" tone="secondary" style={{ textTransform: 'uppercase', marginLeft: 4 }}>
          Сколько продлится
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o, i) => (
            <Tap key={o.label} haptics onPress={() => setDur(i)} style={[styles.preset, { backgroundColor: dur === i ? t.accent : t.surface2 }]}>
              <T v="caption" color={dur === i ? t.onAccent : t.text}>
                {o.label}
              </T>
            </Tap>
          ))}
        </View>
        <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: t.surface2 }}>
          <Row
            emoji="🔕"
            label="Тихий режим"
            hint="Пока статус активен, уведомления приходят без звука"
            switchValue={quiet}
            onSwitch={setQuiet}
            last
            iconBg={t.surface}
          />
        </View>
        <Button title="Поставить статус" onPress={save} />
        {profile && statusActive(profile) ? (
          <Button
            title="Убрать статус"
            kind="ghost"
            onPress={async () => {
              await setStatus(null).catch((e) => toast(errorText(e), 'error'));
              onClose();
            }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

export default function Settings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile);
  const email = useAuth((s) => s.email);
  const themeMode = useSettings((s) => s.themeMode);
  const setThemeMode = useSettings((s) => s.setThemeMode);
  const accentId = useSettings((s) => s.accentId);
  const setAccent = useSettings((s) => s.setAccent);
  const [statusOpen, setStatusOpen] = useState(false);

  const toggle = (key: 'read_receipts' | 'show_last_seen' | 'push_preview') => async (v: boolean) => {
    try {
      await updateProfile({ [key]: v });
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  if (!profile) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const active = statusActive(profile);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Настройки" large />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Tap scale={0.99} onPress={() => router.push('/profile')} style={[styles.card, { backgroundColor: t.surface }]}>
          <Avatar id={profile.id} name={profile.display_name} url={profile.avatar_url} size={64} />
          <View style={{ flex: 1 }}>
            <T v="h3">{profile.display_name}</T>
            <T v="callout" tone="secondary">
              @{profile.username}
            </T>
            {email && !DEMO ? (
              <T v="small" tone="tertiary" style={{ marginTop: 2 }}>
                {email}
              </T>
            ) : null}
          </View>
          <T v="caption" tone="accent">
            Изменить
          </T>
        </Tap>

        <Section>
          <Row
            emoji={active ? profile.status_emoji ?? '💬' : '💬'}
            label={active ? profile.status_text ?? 'Статус' : 'Поставить статус'}
            hint={active ? `${profile.status_until ? formatUntil(profile.status_until) : 'без срока'}${profile.status_quiet ? ' · тихий режим' : ''}` : 'В фокусе, в дороге, сплю…'}
            onPress={() => setStatusOpen(true)}
            last
          />
        </Section>

        <Section title="Оформление">
          <View style={{ padding: 12, gap: 14 }}>
            <Segmented<ThemeMode>
              options={[
                { label: 'Авто', value: 'system' },
                { label: 'Светлая', value: 'light' },
                { label: 'Тёмная', value: 'dark' },
              ]}
              value={themeMode}
              onChange={setThemeMode}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {accents.map((a) => {
                const c = t.scheme === 'dark' && a.dark ? a.dark.color : a.color;
                const on = accentId === a.id;
                return (
                  <Tap key={a.id} haptics onPress={() => setAccent(a.id)} accessibilityLabel={a.name}>
                    <View style={[styles.accentRing, { borderColor: on ? c : 'transparent' }]}>
                      <View style={[styles.accent, { backgroundColor: c }]} />
                    </View>
                  </Tap>
                );
              })}
            </View>
          </View>
        </Section>

        <Section title="Приватность">
          <Row
            icon={Eye}
            label="Отчёты о прочтении"
            hint="Собеседники видят ✓✓, когда вы прочитали"
            switchValue={profile.read_receipts}
            onSwitch={toggle('read_receipts')}
          />
          <Row
            icon={Moon}
            label="Показывать «в сети»"
            hint="Время последнего визита"
            switchValue={profile.show_last_seen}
            onSwitch={toggle('show_last_seen')}
          />
          <Row
            icon={MessageSquareText}
            label="Текст в уведомлениях"
            hint="Выключите, чтобы на экране блокировки было просто «Новое сообщение»"
            switchValue={profile.push_preview}
            onSwitch={toggle('push_preview')}
          />
          <Row icon={Ban} label="Заблокированные" onPress={() => router.push('/blocked')} last />
        </Section>

        {Platform.OS !== 'web' ? (
          <Section title="Уведомления">
            <Row
              icon={Bell}
              label="Разрешить уведомления"
              onPress={async () => {
                const ok = await ensureNotificationPermission();
                if (ok) toast('Уведомления включены', 'success', '🔔');
                else Linking.openSettings().catch(() => {});
              }}
              last
            />
          </Section>
        ) : null}

        <Section>
          <Row icon={UserRound} label="Профиль" onPress={() => router.push('/profile')} />
          <Row
            icon={LogOut}
            label="Выйти"
            onPress={async () => {
              if (await confirm('Выйти из аккаунта?', 'Переписки сохранятся на сервере.', 'Выйти', false)) signOut();
            }}
          />
          <Row
            icon={Trash}
            label="Удалить аккаунт"
            danger
            last
            onPress={async () => {
              if (!(await confirm('Удалить аккаунт?', 'Профиль, личные чаты и все ваши данные будут удалены без возможности восстановления.', 'Продолжить'))) return;
              if (!(await confirm('Точно удалить?', 'Это действие нельзя отменить.', 'Удалить навсегда'))) return;
              try {
                await deleteAccount();
              } catch (e) {
                toast(errorText(e), 'error');
              }
            }}
          />
        </Section>

        <T v="small" tone="tertiary" center style={{ marginTop: 24 }}>
          Близко · версия {Constants.expoConfig?.version ?? '1.0.0'}
          {DEMO ? ' · демо-режим' : ''}
        </T>
      </ScrollView>
      <StatusSheet visible={statusOpen} onClose={() => setStatusOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 22 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  accentRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  accent: { width: 28, height: 28, borderRadius: 14 },
});
