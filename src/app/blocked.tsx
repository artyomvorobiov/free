import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { errorText, listBlocked, unblockUser } from '@/lib/api';
import type { ProfileLite } from '@/lib/types';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

export default function Blocked() {
  const t = useTheme();
  const [list, setList] = useState<ProfileLite[] | null>(null);

  useEffect(() => {
    listBlocked().then(setList).catch(() => setList([]));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Заблокированные" />
      <FlatList
        data={list ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar id={item.id} name={item.display_name} url={item.avatar_url} size={46} />
            <View style={{ flex: 1 }}>
              <T v="bodySemi">{item.display_name}</T>
              <T v="caption" tone="secondary">
                @{item.username}
              </T>
            </View>
            <Button
              title="Разблокировать"
              size="sm"
              kind="secondary"
              onPress={async () => {
                try {
                  await unblockUser(item.id);
                  setList((x) => (x ?? []).filter((p) => p.id !== item.id));
                } catch (e) {
                  toast(errorText(e), 'error');
                }
              }}
            />
          </View>
        )}
        ListEmptyComponent={
          list ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <T style={{ fontSize: 44 }}>🕊️</T>
              <T v="callout" tone="secondary" center style={{ marginTop: 8 }}>
                Здесь никого нет
              </T>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
});
