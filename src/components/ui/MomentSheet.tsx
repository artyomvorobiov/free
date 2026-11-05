import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarClock } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { formatMoment, quickMoments } from '@/lib/time';
import { useTheme } from '@/theme/useTheme';

import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { T } from './T';
import { Tap } from './Tap';

type Props = {
  visible: boolean;
  onClose: () => void;
  kind: 'snooze' | 'schedule' | 'capsule';
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  onPick: (d: Date) => void;
  /** дополнительное содержимое сверху (например, поле текста капсулы) */
  header?: ReactNode;
};

/** Выбор момента времени: быстрые варианты + своя дата */
export function MomentSheet({ visible, onClose, kind, title, subtitle, confirmLabel = 'Готово', onPick, header }: Props) {
  const t = useTheme();
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(() => new Date(Date.now() + 3 * 3600_000));
  const options = quickMoments(kind);

  useEffect(() => {
    if (visible) {
      setCustom(false);
      setDate(new Date(Date.now() + 3 * 3600_000));
    }
  }, [visible]);

  const pick = (d: Date) => {
    onPick(d);
    onClose();
  };

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, d2) => {
            if (e2.type === 'set' && d2) pick(d2);
          },
        });
      },
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {header}
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {!custom ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {options.map((o) => (
                <Tap
                  key={o.label}
                  haptics
                  onPress={() => pick(o.date)}
                  style={{
                    width: '48.5%',
                    backgroundColor: t.surface2,
                    borderRadius: 18,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                  }}
                >
                  <T v="bodySemi">{o.label}</T>
                  <T v="caption" tone="secondary" style={{ marginTop: 2 }}>
                    {o.hint}
                  </T>
                </Tap>
              ))}
            </View>
            {Platform.OS !== 'web' ? (
              <Tap
                haptics
                onPress={() => (Platform.OS === 'android' ? openAndroid() : setCustom(true))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: t.hairline,
                }}
              >
                <Icon icon={CalendarClock} size={20} color={t.accent} />
                <T v="bodyMedium">Выбрать дату и время</T>
              </Tap>
            ) : null}
          </>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <DateTimePicker
              value={date}
              mode="datetime"
              display="spinner"
              locale="ru-RU"
              minimumDate={new Date(Date.now() + 60_000)}
              minuteInterval={5}
              themeVariant={t.scheme}
              textColor={t.text}
              accentColor={t.accent}
              onValueChange={(_, d) => setDate(d)}
            />
            <T v="caption" tone="secondary" style={{ marginBottom: 12 }}>
              {formatMoment(date)}
            </T>
            <Button title={confirmLabel} full onPress={() => pick(date)} style={{ alignSelf: 'stretch' }} />
          </View>
        )}
      </View>
    </Sheet>
  );
}
