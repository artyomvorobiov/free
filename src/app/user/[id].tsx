import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { errorText, getProfile, openDirect } from '@/lib/api';
import { statusActive } from '@/lib/chat-utils';
import { formatLastSeen, formatUntil, isOnline } from '@/lib/time';
import type { ProfileLite } from '@/lib/types';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [p, setP] = useState<ProfileLite | null | undefined>(undefined);

  useEffect(() => {
    getProfile(String(id)).then(setP).catch(() => setP(null));
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Профиль" />
      {p === undefined ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={t.textTertiary} />
      ) : p === null ? (
        <T v="callout" tone="secondary" center style={{ marginTop: 40 }}>
          Профиль не найден
        </T>
      ) : (
        <View style={{ alignItems: 'center', padding: 24, gap: 6 }}>
          <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={110} online={isOnline(p.last_seen_at)} />
          <T v="h2" style={{ marginTop: 12 }}>
            {p.display_name}
          </T>
          <T v="callout" tone="secondary">
            @{p.username} · {formatLastSeen(p.last_seen_at)}
          </T>
          {statusActive(p) ? (
            <T v="callout" style={{ marginTop: 6 }}>
              {p.status_emoji} {p.status_text} {p.status_until ? formatUntil(p.status_until) : ''}
            </T>
          ) : null}
          {p.bio ? (
            <T v="body" center style={{ marginTop: 8 }}>
              {p.bio}
            </T>
          ) : null}
          <Button
            title="Написать"
            icon={MessageCircle}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
            onPress={async () => {
              try {
                const chatId = await openDirect(p.id);
                router.replace({ pathname: '/chat/[id]', params: { id: chatId } });
              } catch (e) {
                toast(errorText(e), 'error');
              }
            }}
          />
        </View>
      )}
    </View>
  );
}
