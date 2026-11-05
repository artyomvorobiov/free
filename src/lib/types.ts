export type ChatKind = 'direct' | 'group' | 'self';
export type MessageKind = 'text' | 'image' | 'voice' | 'circle' | 'touch' | 'capsule' | 'system';
export type TouchKind = 'heart' | 'hug' | 'wave' | 'spark';

export type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio?: string;
  status_emoji: string | null;
  status_text: string | null;
  status_until: string | null;
  status_quiet?: boolean;
  last_seen_at: string | null;
};

export type Profile = ProfileLite & {
  bio: string;
  status_quiet: boolean;
  show_last_seen: boolean;
  read_receipts: boolean;
  push_preview: boolean;
  created_at: string;
};

export type Member = ProfileLite & {
  role: 'owner' | 'member';
  seen_at: string | null;
  joined_at: string;
};

export type MessageMeta = {
  /** размеры фото */
  w?: number;
  h?: number;
  /** длительность голосового/кружка в секундах */
  duration?: number;
  /** 0..1, ~48 столбиков волны голосового */
  waveform?: number[];
  touch?: TouchKind;
  forwarded_from?: string;
  scheduled?: boolean;
  /** системные сообщения */
  type?: 'created' | 'added' | 'removed' | 'left' | 'title' | 'theme' | 'disappear';
  value?: string | number | null;
  title?: string;
  user_id?: string;
};

export type Reaction = { user_id: string; emoji: string };

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  meta: MessageMeta;
  reply_to: string | null;
  view_once: boolean;
  silent: boolean;
  unlock_at: string | null;
  expires_at: string | null;
  edited_at: string | null;
  created_at: string;
  reactions?: Reaction[];
  capsule?: { body: string } | null;
  opens?: { user_id: string }[];
  reply?: { id: string; sender_id: string | null; kind: MessageKind; body: string | null } | null;
  /** локальные поля (не хранятся на сервере) */
  _status?: 'sending' | 'failed';
  _localUri?: string;
};

export type Chat = {
  id: string;
  kind: ChatKind;
  title: string | null;
  emoji: string | null;
  theme: string;
  disappear_seconds: number | null;
  created_at: string;
  last_message_at: string;
  last_read_at: string;
  muted_until: string | null;
  snoozed_until: string | null;
  pinned_at: string | null;
  archived: boolean;
  members: Member[];
  last_message: Message | null;
  unread: number;
};

export type ScheduledMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  send_at: string;
  silent: boolean;
  created_at: string;
};

export type TypingKind = 'text' | 'voice' | 'circle';
