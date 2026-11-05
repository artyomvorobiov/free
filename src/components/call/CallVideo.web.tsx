import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { StreamLike } from '@/lib/calls/types';

type Props = {
  stream: StreamLike | null;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
  zOrder?: number;
  muted?: boolean;
  version?: number;
};

export function CallVideo({ stream, mirror, fit = 'cover', style, muted, version }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = (stream as unknown as MediaStream) ?? null;
    el.play?.().catch(() => {});
  }, [stream, version]);
  return (
    <View style={style}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        data-testid={muted ? 'local-video' : 'remote-video'}
        style={{ width: '100%', height: '100%', objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined, backgroundColor: '#000' }}
      />
    </View>
  );
}

export function RemoteAudio({ stream }: { stream: StreamLike | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = (stream as unknown as MediaStream) ?? null;
    el.play?.().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay data-testid="remote-audio" />;
}
