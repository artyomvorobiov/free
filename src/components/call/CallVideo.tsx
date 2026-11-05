import { View, type StyleProp, type ViewStyle } from 'react-native';

import { webrtcLib } from '@/lib/calls/rtc';
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

/** Видео собеседника или своё превью (react-native-webrtc) */
export function CallVideo({ stream, mirror, fit = 'cover', style, zOrder, version }: Props) {
  const lib = webrtcLib();
  if (!lib || !stream?.toURL) return <View style={style} />;
  const RTCView = lib.RTCView;
  return <RTCView key={version} streamURL={stream.toURL()} mirror={mirror} objectFit={fit} zOrder={zOrder} style={style} />;
}

/** На телефоне звук собеседника играет сам */
export function RemoteAudio(_props: { stream: StreamLike | null }) {
  return null;
}
