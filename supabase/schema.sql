-- =====================================================================
--  «Близко» — схема базы данных для Supabase
--
--  Как применить:
--    Supabase Dashboard → SQL Editor → New query → вставьте ВЕСЬ файл → Run.
--  Скрипт идемпотентный: его можно безопасно запускать повторно
--  (например, после обновления приложения).
--
--  Что создаётся:
--    • таблицы профилей, чатов, сообщений, реакций, капсул и т. д.;
--    • политики безопасности (RLS) — каждый видит только свои чаты;
--    • функции (RPC), которые вызывает приложение;
--    • хранилища файлов: avatars (публичное) и media (приватное);
--    • фоновые задачи (pg_cron): отложенные сообщения, исчезающие
--      сообщения, открытие капсул;
--    • push-уведомления через Expo Push API (pg_net) — без отдельного сервера.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Расширения
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------

-- Профиль пользователя (1:1 с auth.users)
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text unique,
  display_name   text not null default '',
  bio            text not null default '',
  avatar_url     text,
  status_emoji   text,
  status_text    text,
  status_until   timestamptz,
  status_quiet   boolean not null default false,  -- «тихий» статус: пуши без звука
  last_seen_at   timestamptz,
  show_last_seen boolean not null default true,
  read_receipts  boolean not null default true,
  push_preview   boolean not null default true,   -- показывать текст в уведомлениях
  created_at     timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 64),
  constraint profiles_bio_len check (char_length(bio) <= 300),
  constraint profiles_status_text_len check (status_text is null or char_length(status_text) <= 60)
);

-- Чат: личный (direct), группа (group) или «Заметки» (self)
create table if not exists public.chats (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('direct', 'group', 'self')),
  title             text check (title is null or char_length(title) <= 64),
  emoji             text check (emoji is null or char_length(emoji) <= 16),
  theme             text not null default 'default' check (char_length(theme) <= 32),
  disappear_seconds integer check (disappear_seconds is null or disappear_seconds between 60 and 31536000),
  direct_key        text unique,      -- для личных чатов: «uuidA:uuidB», защищает от дублей
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now()
);

-- Участники чата (видны всем участникам)
create table if not exists public.chat_members (
  chat_id   uuid not null references public.chats (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  seen_at   timestamptz,               -- публичная отметка «прочитано» (если включены отчёты о прочтении)
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

-- Личные настройки чата (видны только владельцу): прочитано, без звука, «ответить позже», закреп
create table if not exists public.chat_prefs (
  chat_id       uuid not null references public.chats (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  last_read_at  timestamptz,
  muted_until   timestamptz,
  snoozed_until timestamptz,
  pinned_at     timestamptz,
  archived      boolean not null default false,
  primary key (chat_id, user_id)
);

-- Сообщения
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references public.chats (id) on delete cascade,
  sender_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  kind           text not null default 'text'
                 check (kind in ('text', 'image', 'voice', 'circle', 'touch', 'capsule', 'system')),
  body           text check (body is null or char_length(body) <= 4000),
  media_path     text,                 -- путь в бакете media: <chat_id>/<message_id>.<ext>
  meta           jsonb not null default '{}'::jsonb,
  reply_to       uuid references public.messages (id) on delete set null,
  view_once      boolean not null default false,
  silent         boolean not null default false,
  unlock_at      timestamptz,          -- для капсул времени
  expires_at     timestamptz,          -- для исчезающих сообщений
  edited_at      timestamptz,
  created_at     timestamptz not null default now(),
  constraint messages_meta_size check (pg_column_size(meta) < 8192)
);
create index if not exists messages_chat_created_idx on public.messages (chat_id, created_at desc);
create index if not exists messages_expires_idx on public.messages (expires_at) where expires_at is not null;
create index if not exists messages_media_idx on public.messages (media_path) where media_path is not null;
create index if not exists messages_capsule_idx on public.messages (unlock_at) where kind = 'capsule';

-- Содержимое капсул времени: хранится отдельно и становится доступно только в момент открытия
create table if not exists public.capsule_bodies (
  message_id uuid primary key references public.messages (id) on delete cascade,
  body       text not null check (char_length(body) <= 4000)
);

-- Кто уже открыл одноразовое медиа
create table if not exists public.view_once_opens (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  opened_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Реакции (одна на пользователя на сообщение)
create table if not exists public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  chat_id    uuid not null references public.chats (id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists reactions_chat_idx on public.reactions (chat_id);

-- Отложенные сообщения (видны только автору до момента отправки)
create table if not exists public.scheduled_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  send_at    timestamptz not null,
  silent     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_messages_send_at_idx on public.scheduled_messages (send_at);

-- Push-токены устройств (Expo)
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- Блокировки
create table if not exists public.blocks (
  blocker    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- Жалобы (просматриваются администратором в Supabase Dashboard → Table Editor)
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_user uuid references public.profiles (id) on delete set null,
  message_id  uuid references public.messages (id) on delete set null,
  reason      text not null check (char_length(reason) <= 500),
  created_at  timestamptz not null default now()
);

-- Служебный журнал отправленных уведомлений (чтобы не слать дважды)
create table if not exists public.push_log (
  message_id uuid not null,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, kind)
);

-- ---------------------------------------------------------------------
-- 2. Вспомогательные функции для политик
-- ---------------------------------------------------------------------

-- Является ли текущий пользователь участником чата
create or replace function public.is_member(p_chat uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = p_chat and user_id = auth.uid()
  );
$$;

-- То же, но принимает текст (имя папки в хранилище) и не падает на мусоре
create or replace function public.is_member_text(p_chat text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_chat is null or p_chat !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return public.is_member(p_chat::uuid);
end;
$$;

-- Может ли пользователь писать в чат (участник и нет блокировки в личном чате)
create or replace function public.can_send_as(p_chat uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user is not null
    and exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_user)
    and not exists (
      select 1
      from public.chats c
      join public.chat_members other on other.chat_id = c.id and other.user_id <> p_user
      join public.blocks b
        on (b.blocker = other.user_id and b.blocked = p_user)
        or (b.blocker = p_user and b.blocked = other.user_id)
      where c.id = p_chat and c.kind = 'direct'
    );
$$;

create or replace function public.can_send(p_chat uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_send_as(p_chat, auth.uid());
$$;

-- Может ли текущий пользователь прочитать файл из бакета media
create or replace function public.can_read_media(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    where m.media_path = p_name
      and public.is_member(m.chat_id)
      and (m.expires_at is null or m.expires_at > now())
      and (
        not m.view_once
        or m.sender_id = auth.uid()
        or not exists (
          select 1 from public.view_once_opens v
          where v.message_id = m.id and v.user_id = auth.uid()
        )
      )
  );
$$;

-- Текст для уведомления
create or replace function public.message_preview(p_kind text, p_body text, p_view_once boolean)
returns text
language sql immutable
as $$
  select case p_kind
    when 'text'    then left(coalesce(p_body, ''), 180)
    when 'image'   then case when p_view_once then '📷 Одноразовое фото' else '📷 Фото' end
    when 'voice'   then '🎤 Голосовое сообщение'
    when 'circle'  then case when p_view_once then '⭕ Одноразовый кружок' else '⭕ Видеосообщение' end
    when 'touch'   then '💗 Касание'
    when 'capsule' then '💌 Капсула времени — откроется в назначенный момент'
    else 'Новое сообщение'
  end;
$$;

-- Сколько непрочитанных у пользователя (для бейджа на иконке)
create or replace function public.unread_total(p_user uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum((
    select count(*)
    from public.messages m
    where m.chat_id = cm.chat_id
      and m.sender_id is distinct from p_user
      and m.kind <> 'system'
      and m.created_at > coalesce(p.last_read_at, cm.joined_at)
      and (m.expires_at is null or m.expires_at > now())
  )), 0)::integer
  from public.chat_members cm
  left join public.chat_prefs p on p.chat_id = cm.chat_id and p.user_id = cm.user_id
  where cm.user_id = p_user
    and (p.muted_until is null or p.muted_until < now());
$$;

-- ---------------------------------------------------------------------
-- 3. Push-уведомления через Expo Push API (pg_net, асинхронно)
-- ---------------------------------------------------------------------
create or replace function public.send_expo_push(p_messages jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_len integer := coalesce(jsonb_array_length(p_messages), 0);
  v_from integer := 0;
begin
  while v_from < v_len loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (
        select jsonb_agg(e.value order by e.ordinality)
        from jsonb_array_elements(p_messages) with ordinality as e
        where e.ordinality > v_from and e.ordinality <= v_from + 100
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
    );
    v_from := v_from + 100;
  end loop;
exception when others then
  -- уведомления никогда не должны ломать отправку сообщений
  raise warning 'send_expo_push: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Триггеры
-- ---------------------------------------------------------------------

-- Новый пользователь → профиль и чат «Заметки»
create or replace function public.ensure_user_bootstrap(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_chat uuid;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  if not exists (
    select 1 from public.chats c
    join public.chat_members m on m.chat_id = c.id
    where c.kind = 'self' and m.user_id = p_user
  ) then
    insert into public.chats (kind, created_by) values ('self', p_user) returning id into v_chat;
    insert into public.chat_members (chat_id, user_id, role) values (v_chat, p_user, 'owner');
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.ensure_user_bootstrap(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверки и вычисляемые поля перед вставкой сообщения
create or replace function public.messages_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_disappear integer;
begin
  new.created_at := now();
  new.edited_at := null;

  if new.kind in ('image', 'voice', 'circle') then
    if new.media_path is null or split_part(new.media_path, '/', 1) <> new.chat_id::text then
      raise exception 'media_path must be inside the chat folder' using errcode = '22023';
    end if;
  else
    new.media_path := null;
    new.view_once := false;
  end if;

  if new.kind = 'text' and coalesce(btrim(new.body), '') = '' then
    raise exception 'empty message' using errcode = '22023';
  end if;

  if new.kind = 'capsule' then
    if new.unlock_at is null or new.unlock_at < now() + interval '1 minute' then
      raise exception 'capsule must unlock in the future' using errcode = '22023';
    end if;
    new.body := null;
  else
    new.unlock_at := null;
  end if;

  if new.kind = 'touch' and exists (
    select 1 from public.messages
    where chat_id = new.chat_id and sender_id = new.sender_id and kind = 'touch'
      and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'too many touches' using errcode = '22023';
  end if;

  if new.reply_to is not null and not exists (
    select 1 from public.messages where id = new.reply_to and chat_id = new.chat_id
  ) then
    new.reply_to := null;
  end if;

  if new.kind <> 'system' then
    select disappear_seconds into v_disappear from public.chats where id = new.chat_id;
    if v_disappear is not null then
      new.expires_at := coalesce(new.unlock_at, now()) + make_interval(secs => v_disappear);
    else
      new.expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- После вставки: обновляем чат, «будим» отложенные чаты и рассылаем пуши
create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_chat    public.chats%rowtype;
  v_sender  text;
  v_preview text;
  v_title   text;
  v_push    jsonb;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;

  if new.kind = 'system' then
    return null;
  end if;

  -- новое входящее сообщение возвращает чат из «Ответить позже»
  update public.chat_prefs
     set snoozed_until = null
   where chat_id = new.chat_id
     and user_id is distinct from new.sender_id
     and snoozed_until is not null;

  select * into v_chat from public.chats where id = new.chat_id;
  if v_chat.kind = 'self' then
    return null;
  end if;

  select coalesce(nullif(display_name, ''), username, 'Близко') into v_sender
    from public.profiles where id = new.sender_id;
  v_preview := public.message_preview(new.kind, new.body, new.view_once);
  v_title := case when v_chat.kind = 'group' then coalesce(nullif(v_chat.title, ''), 'Группа') else v_sender end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', v_title,
           'body', case
                     when not pr.push_preview then 'Новое сообщение'
                     when v_chat.kind = 'group' then v_sender || ': ' || v_preview
                     else v_preview
                   end,
           'sound', case
                      when new.silent or (pr.status_quiet and pr.status_until > now()) then null
                      else 'default'
                    end,
           'badge', public.unread_total(cm.user_id),
           'priority', 'high',
           'channelId', 'messages',
           'data', jsonb_build_object('chatId', new.chat_id, 'messageId', new.id)
         )), '[]'::jsonb)
    into v_push
    from public.chat_members cm
    join public.profiles pr on pr.id = cm.user_id
    join public.push_tokens t on t.user_id = cm.user_id
    left join public.chat_prefs p on p.chat_id = cm.chat_id and p.user_id = cm.user_id
   where cm.chat_id = new.chat_id
     and cm.user_id is distinct from new.sender_id
     and (p.muted_until is null or p.muted_until < now())
     and not exists (
       select 1 from public.blocks b where b.blocker = cm.user_id and b.blocked = new.sender_id
     );

  perform public.send_expo_push(v_push);
  return null;
exception when others then
  raise warning 'messages_after_insert: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Редактирование: менять можно только текст своих текстовых сообщений
create or replace function public.messages_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- служебные операции (фоновые задачи, администратор) не ограничиваем
  if auth.uid() is null then
    return new;
  end if;
  if old.kind <> 'text' then
    raise exception 'only text messages can be edited' using errcode = '22023';
  end if;
  if coalesce(btrim(new.body), '') = '' then
    raise exception 'empty message' using errcode = '22023';
  end if;
  new.id := old.id;
  new.chat_id := old.chat_id;
  new.sender_id := old.sender_id;
  new.kind := old.kind;
  new.media_path := old.media_path;
  new.meta := old.meta;
  new.reply_to := old.reply_to;
  new.view_once := old.view_once;
  new.silent := old.silent;
  new.unlock_at := old.unlock_at;
  new.expires_at := old.expires_at;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_update on public.messages;
create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

-- Реакция всегда привязана к чату своего сообщения
create or replace function public.reactions_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select chat_id into new.chat_id from public.messages where id = new.message_id;
  if new.chat_id is null then
    raise exception 'message not found' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists reactions_before_write on public.reactions;
create trigger reactions_before_write
  before insert or update on public.reactions
  for each row execute function public.reactions_before_write();

-- Если пользователь отключил «был(а) в сети» — стираем время
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
as $$
begin
  if not new.show_last_seen then
    new.last_seen_at := null;
  end if;
  if new.username is not null then
    new.username := lower(new.username);
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.chats              enable row level security;
alter table public.chat_members       enable row level security;
alter table public.chat_prefs         enable row level security;
alter table public.messages           enable row level security;
alter table public.capsule_bodies     enable row level security;
alter table public.view_once_opens    enable row level security;
alter table public.reactions          enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.push_tokens        enable row level security;
alter table public.blocks             enable row level security;
alter table public.reports            enable row level security;
alter table public.push_log           enable row level security;

-- profiles
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- chats (создание и изменение — только через функции ниже)
drop policy if exists "chats: members read" on public.chats;
create policy "chats: members read" on public.chats
  for select to authenticated using (public.is_member(id));

-- chat_members
drop policy if exists "chat_members: members read" on public.chat_members;
create policy "chat_members: members read" on public.chat_members
  for select to authenticated using (public.is_member(chat_id));

-- chat_prefs (только свои)
drop policy if exists "chat_prefs: own" on public.chat_prefs;
create policy "chat_prefs: own" on public.chat_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(chat_id));

-- messages
drop policy if exists "messages: members read" on public.messages;
create policy "messages: members read" on public.messages
  for select to authenticated
  using (public.is_member(chat_id) and (expires_at is null or expires_at > now()));
drop policy if exists "messages: send" on public.messages;
create policy "messages: send" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind in ('text', 'image', 'voice', 'circle', 'touch')
    and public.can_send(chat_id)
  );
drop policy if exists "messages: edit own" on public.messages;
create policy "messages: edit own" on public.messages
  for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
drop policy if exists "messages: delete own" on public.messages;
create policy "messages: delete own" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));

-- capsule_bodies: автор видит всегда, остальные — после открытия
drop policy if exists "capsules: read when unlocked" on public.capsule_bodies;
create policy "capsules: read when unlocked" on public.capsule_bodies
  for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id
      and public.is_member(m.chat_id)
      and (m.sender_id = (select auth.uid()) or m.unlock_at <= now())
  ));

-- view_once_opens
drop policy if exists "view_once: members read" on public.view_once_opens;
create policy "view_once: members read" on public.view_once_opens
  for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.chat_id)));

-- reactions
drop policy if exists "reactions: members read" on public.reactions;
create policy "reactions: members read" on public.reactions
  for select to authenticated using (public.is_member(chat_id));
drop policy if exists "reactions: own insert" on public.reactions;
create policy "reactions: own insert" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(chat_id));
drop policy if exists "reactions: own update" on public.reactions;
create policy "reactions: own update" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(chat_id));
drop policy if exists "reactions: own delete" on public.reactions;
create policy "reactions: own delete" on public.reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- scheduled_messages
drop policy if exists "scheduled: own" on public.scheduled_messages;
create policy "scheduled: own" on public.scheduled_messages
  for all to authenticated
  using (sender_id = (select auth.uid()))
  with check (
    sender_id = (select auth.uid())
    and public.can_send(chat_id)
    and send_at > now()
    and send_at < now() + interval '366 days'
  );

-- push_tokens
drop policy if exists "push_tokens: own" on public.push_tokens;
create policy "push_tokens: own" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- blocks
drop policy if exists "blocks: own" on public.blocks;
create policy "blocks: own" on public.blocks
  for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

-- reports: только отправка
drop policy if exists "reports: create" on public.reports;
create policy "reports: create" on public.reports
  for insert to authenticated with check (reporter = (select auth.uid()));

-- push_log: без доступа для клиентов (политик нет)

-- ---------------------------------------------------------------------
-- 6. Функции, которые вызывает приложение (RPC)
-- ---------------------------------------------------------------------

-- Гарантирует наличие профиля и «Заметок», возвращает профиль
create or replace function public.bootstrap()
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.ensure_user_bootstrap(auth.uid());
  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

-- Свободен ли username
create or replace function public.is_username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1 from public.profiles
      where username = lower(p_username) and id <> auth.uid()
    );
$$;

-- Поиск людей по @username или имени
create or replace function public.search_users(p_query text)
returns setof public.profiles
language sql stable security definer set search_path = public
as $$
  with q as (
    select replace(replace(replace(lower(btrim(ltrim(p_query, '@'))), '\', '\\'), '%', '\%'), '_', '\_') as s
  )
  select p.*
  from public.profiles p, q
  where p.id <> auth.uid()
    and p.username is not null
    and length(q.s) >= 2
    and (p.username like q.s || '%' or lower(p.display_name) like '%' || q.s || '%')
  order by (p.username = q.s) desc, p.username
  limit 25;
$$;

-- Список моих чатов одним запросом
create or replace function public.get_my_chats()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_message_at desc), '[]'::jsonb)
  from (
    select
      c.id, c.kind, c.title, c.emoji, c.theme, c.disappear_seconds,
      c.created_at, c.last_message_at,
      coalesce(p.last_read_at, me.joined_at) as last_read_at,
      p.muted_until, p.snoozed_until, p.pinned_at,
      coalesce(p.archived, false) as archived,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id,
          'username', pr.username,
          'display_name', pr.display_name,
          'avatar_url', pr.avatar_url,
          'bio', pr.bio,
          'status_emoji', pr.status_emoji,
          'status_text', pr.status_text,
          'status_until', pr.status_until,
          'status_quiet', pr.status_quiet,
          'last_seen_at', pr.last_seen_at,
          'role', cm.role,
          'seen_at', cm.seen_at,
          'joined_at', cm.joined_at
        ) order by cm.joined_at), '[]'::jsonb)
        from public.chat_members cm
        join public.profiles pr on pr.id = cm.user_id
        where cm.chat_id = c.id
      ) as members,
      (
        select to_jsonb(m)
        from public.messages m
        where m.chat_id = c.id and (m.expires_at is null or m.expires_at > now())
        order by m.created_at desc
        limit 1
      ) as last_message,
      (
        select count(*)
        from public.messages m
        where m.chat_id = c.id
          and m.sender_id is distinct from auth.uid()
          and m.kind <> 'system'
          and m.created_at > coalesce(p.last_read_at, me.joined_at)
          and (m.expires_at is null or m.expires_at > now())
      )::integer as unread
    from public.chat_members me
    join public.chats c on c.id = me.chat_id
    left join public.chat_prefs p on p.chat_id = c.id and p.user_id = me.user_id
    where me.user_id = auth.uid()
  ) t;
$$;

-- Отметить чат прочитанным
create or replace function public.mark_read(p_chat uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member(p_chat) then
    return;
  end if;
  insert into public.chat_prefs (chat_id, user_id, last_read_at)
  values (p_chat, auth.uid(), now())
  on conflict (chat_id, user_id) do update set last_read_at = excluded.last_read_at;

  update public.chat_members
     set seen_at = now()
   where chat_id = p_chat and user_id = auth.uid()
     and coalesce((select read_receipts from public.profiles where id = auth.uid()), true);
end;
$$;

-- Найти или создать личный чат
create or replace function public.get_or_create_direct(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_key  text;
  v_chat uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_other is null or p_other = v_me then
    select c.id into v_chat from public.chats c
      join public.chat_members m on m.chat_id = c.id
     where c.kind = 'self' and m.user_id = v_me
     limit 1;
    return v_chat;
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'user not found' using errcode = '22023';
  end if;

  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select id into v_chat from public.chats where direct_key = v_key;
  if v_chat is not null then
    return v_chat;
  end if;

  if exists (select 1 from public.blocks where blocker = p_other and blocked = v_me) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  insert into public.chats (kind, direct_key, created_by)
  values ('direct', v_key, v_me)
  on conflict (direct_key) do nothing
  returning id into v_chat;

  if v_chat is null then
    select id into v_chat from public.chats where direct_key = v_key;
  end if;

  insert into public.chat_members (chat_id, user_id)
  values (v_chat, v_me), (v_chat, p_other)
  on conflict do nothing;

  return v_chat;
end;
$$;

-- Системное сообщение в чат (внутренняя функция)
create or replace function public.post_system(p_chat uuid, p_actor uuid, p_meta jsonb)
returns void
language sql security definer set search_path = public
as $$
  insert into public.messages (chat_id, sender_id, kind, meta)
  values (p_chat, p_actor, 'system', p_meta);
$$;

-- Создать группу
create or replace function public.create_group(p_title text, p_emoji text, p_members uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_chat uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;

  insert into public.chats (kind, title, emoji, created_by)
  values ('group', left(btrim(p_title), 64), nullif(p_emoji, ''), v_me)
  returning id into v_chat;

  insert into public.chat_members (chat_id, user_id, role) values (v_chat, v_me, 'owner');

  insert into public.chat_members (chat_id, user_id)
  select v_chat, p.id
    from public.profiles p
   where p.id = any (coalesce(p_members, '{}'::uuid[]))
     and p.id <> v_me
     and not exists (select 1 from public.blocks b where b.blocker = p.id and b.blocked = v_me)
  on conflict do nothing;

  perform public.post_system(v_chat, v_me, jsonb_build_object('type', 'created', 'title', left(btrim(p_title), 64)));
  return v_chat;
end;
$$;

-- Добавить участников в группу
create or replace function public.add_members(p_chat uuid, p_members uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if not exists (select 1 from public.chats where id = p_chat and kind = 'group') or not public.is_member(p_chat) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_id in
    select p.id from public.profiles p
     where p.id = any (coalesce(p_members, '{}'::uuid[]))
       and not exists (select 1 from public.chat_members m where m.chat_id = p_chat and m.user_id = p.id)
       and not exists (select 1 from public.blocks b where b.blocker = p.id and b.blocked = v_me)
  loop
    insert into public.chat_members (chat_id, user_id) values (p_chat, v_id) on conflict do nothing;
    perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'added', 'user_id', v_id));
  end loop;
end;
$$;

-- Исключить участника (только создатель группы)
create or replace function public.remove_member(p_chat uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from public.chat_members m join public.chats c on c.id = m.chat_id
     where m.chat_id = p_chat and m.user_id = v_me and m.role = 'owner' and c.kind = 'group'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'use leave_chat' using errcode = '22023';
  end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_user;
  delete from public.chat_prefs where chat_id = p_chat and user_id = p_user;
  perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'removed', 'user_id', p_user));
end;
$$;

-- Покинуть группу
create or replace function public.leave_chat(p_chat uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_kind text;
  v_role text;
  v_next uuid;
begin
  select c.kind, m.role into v_kind, v_role
    from public.chats c join public.chat_members m on m.chat_id = c.id and m.user_id = v_me
   where c.id = p_chat;
  if v_kind is null then
    return;
  end if;
  if v_kind <> 'group' then
    raise exception 'only groups can be left' using errcode = '22023';
  end if;

  delete from public.chat_members where chat_id = p_chat and user_id = v_me;
  delete from public.chat_prefs where chat_id = p_chat and user_id = v_me;

  if not exists (select 1 from public.chat_members where chat_id = p_chat) then
    delete from public.chats where id = p_chat;
    return;
  end if;

  if v_role = 'owner' then
    select user_id into v_next from public.chat_members
     where chat_id = p_chat order by joined_at limit 1;
    update public.chat_members set role = 'owner' where chat_id = p_chat and user_id = v_next;
  end if;

  perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'left'));
end;
$$;

-- Изменить настройки чата: название, эмодзи, тему, исчезающие сообщения
create or replace function public.update_chat(p_chat uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_chat public.chats%rowtype;
  v_secs integer;
begin
  select * into v_chat from public.chats where id = p_chat;
  if v_chat.id is null or not public.is_member(p_chat) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_patch ? 'title' and v_chat.kind = 'group' then
    if coalesce(btrim(p_patch->>'title'), '') = '' then
      raise exception 'title required' using errcode = '22023';
    end if;
    if btrim(p_patch->>'title') is distinct from v_chat.title then
      update public.chats set title = left(btrim(p_patch->>'title'), 64) where id = p_chat;
      perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'title', 'value', left(btrim(p_patch->>'title'), 64)));
    end if;
  end if;

  if p_patch ? 'emoji' and v_chat.kind = 'group' then
    update public.chats set emoji = nullif(p_patch->>'emoji', '') where id = p_chat;
  end if;

  if p_patch ? 'theme' and (p_patch->>'theme') is distinct from v_chat.theme then
    update public.chats set theme = coalesce(nullif(p_patch->>'theme', ''), 'default') where id = p_chat;
    if v_chat.kind <> 'self' then
      perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'theme', 'value', coalesce(nullif(p_patch->>'theme', ''), 'default')));
    end if;
  end if;

  if p_patch ? 'disappear_seconds' then
    v_secs := nullif(p_patch->>'disappear_seconds', '')::integer;
    if v_secs is distinct from v_chat.disappear_seconds then
      update public.chats set disappear_seconds = v_secs where id = p_chat;
      perform public.post_system(p_chat, v_me, jsonb_build_object('type', 'disappear', 'value', v_secs));
    end if;
  end if;
end;
$$;

-- Отправить капсулу времени (сообщение + запечатанное содержимое за одну транзакцию)
create or replace function public.send_capsule(p_chat uuid, p_body text, p_unlock_at timestamptz, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not public.can_send(p_chat) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'empty capsule' using errcode = '22023';
  end if;
  insert into public.messages (id, chat_id, sender_id, kind, unlock_at)
  values (v_id, p_chat, auth.uid(), 'capsule', p_unlock_at);
  insert into public.capsule_bodies (message_id, body) values (v_id, left(p_body, 4000));
  return v_id;
end;
$$;

-- Отметить, что одноразовое медиа просмотрено
create or replace function public.open_view_once(p_message uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.view_once_opens (message_id, user_id)
  select m.id, auth.uid()
    from public.messages m
   where m.id = p_message
     and m.view_once
     and m.sender_id is distinct from auth.uid()
     and public.is_member(m.chat_id)
  on conflict do nothing;
end;
$$;

-- Зарегистрировать push-токен устройства
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(p_token, '') = '' then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Удалить аккаунт (требование App Store). Удаляет пользователя и все его данные.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- группы, где пользователь был создателем, передаём следующему участнику
  update public.chat_members m
     set role = 'owner'
   where (m.chat_id, m.user_id) in (
     select distinct on (o.chat_id) o.chat_id, o.user_id
       from public.chat_members o
       join public.chat_members mine on mine.chat_id = o.chat_id and mine.user_id = v_me and mine.role = 'owner'
      where o.user_id <> v_me
      order by o.chat_id, o.joined_at
   );
  delete from public.chats c where c.kind = 'self' and c.created_by = v_me;
  delete from public.chats c
   where c.kind = 'direct' and exists (select 1 from public.chat_members m where m.chat_id = c.id and m.user_id = v_me);
  delete from auth.users where id = v_me;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Фоновые задачи
-- ---------------------------------------------------------------------

-- Публикация отложенных сообщений
create or replace function public.publish_due_messages()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.scheduled_messages%rowtype;
begin
  for r in
    delete from public.scheduled_messages where send_at <= now() returning *
  loop
    if public.can_send_as(r.chat_id, r.sender_id) then
      insert into public.messages (chat_id, sender_id, kind, body, silent, meta)
      values (r.chat_id, r.sender_id, 'text', r.body, r.silent, jsonb_build_object('scheduled', true));
    end if;
  end loop;
end;
$$;

-- Уведомление «Капсула открылась»
create or replace function public.notify_unlocked_capsules()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r       record;
  v_push  jsonb;
  v_name  text;
begin
  for r in
    select m.id, m.chat_id, m.sender_id
      from public.messages m
     where m.kind = 'capsule'
       and m.unlock_at <= now()
       and m.unlock_at > now() - interval '1 day'
       and not exists (select 1 from public.push_log l where l.message_id = m.id and l.kind = 'unlock')
  loop
    insert into public.push_log (message_id, kind) values (r.id, 'unlock') on conflict do nothing;
    select coalesce(nullif(display_name, ''), username, 'Кто-то') into v_name from public.profiles where id = r.sender_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', t.token,
             'title', '💌 Капсула открылась',
             'body', case when cm.user_id = r.sender_id
                          then 'Ваша капсула времени открылась'
                          else coalesce(v_name, 'Кто-то') || ' оставил(а) вам послание — пора прочитать' end,
             'sound', 'default',
             'priority', 'high',
             'channelId', 'messages',
             'data', jsonb_build_object('chatId', r.chat_id, 'messageId', r.id)
           )), '[]'::jsonb)
      into v_push
      from public.chat_members cm
      join public.push_tokens t on t.user_id = cm.user_id
     where cm.chat_id = r.chat_id;
    perform public.send_expo_push(v_push);
  end loop;
end;
$$;

-- Удаление исчезнувших сообщений, истёкших статусов и служебного журнала
create or replace function public.purge_expired()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.messages where expires_at is not null and expires_at < now();
  update public.profiles
     set status_emoji = null, status_text = null, status_until = null, status_quiet = false
   where status_until is not null and status_until < now();
  delete from public.push_log where created_at < now() - interval '7 days';
  perform public.notify_unlocked_capsules();
end;
$$;

-- Расписание (pg_cron). Повторный запуск просто обновит задачи.
select cron.schedule('blizko-publish-scheduled', '30 seconds', 'select public.publish_due_messages()');
select cron.schedule('blizko-purge-expired', '* * * * *', 'select public.purge_expired()');

-- ---------------------------------------------------------------------
-- 8. Права на функции
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- функции, доступные только авторизованным пользователям приложения
  foreach f in array array[
    'public.bootstrap()',
    'public.is_username_available(text)',
    'public.search_users(text)',
    'public.get_my_chats()',
    'public.mark_read(uuid)',
    'public.get_or_create_direct(uuid)',
    'public.create_group(text, text, uuid[])',
    'public.add_members(uuid, uuid[])',
    'public.remove_member(uuid, uuid)',
    'public.leave_chat(uuid)',
    'public.update_chat(uuid, jsonb)',
    'public.send_capsule(uuid, text, timestamptz, uuid)',
    'public.open_view_once(uuid)',
    'public.register_push_token(text, text)',
    'public.delete_my_account()',
    'public.is_member(uuid)',
    'public.is_member_text(text)',
    'public.can_send(uuid)',
    'public.can_read_media(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;

  -- внутренние функции — недоступны клиентам
  foreach f in array array[
    'public.can_send_as(uuid, uuid)',
    'public.unread_total(uuid)',
    'public.send_expo_push(jsonb)',
    'public.ensure_user_bootstrap(uuid)',
    'public.post_system(uuid, uuid, jsonb)',
    'public.publish_due_messages()',
    'public.notify_unlocked_capsules()',
    'public.purge_expired()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Хранилище файлов
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('media', 'media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
                                            'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm',
                                            'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: read" on storage.objects;
create policy "avatars: read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "media: upload to my chats" on storage.objects;
create policy "media: upload to my chats" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_member_text((storage.foldername(name))[1]));
drop policy if exists "media: read" on storage.objects;
create policy "media: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (owner_id = (select auth.uid()::text) or public.can_read_media(name))
  );
drop policy if exists "media: delete own" on storage.objects;
create policy "media: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------
-- 10. Realtime: какие таблицы транслируются в приложение
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages', 'reactions', 'chat_members', 'chats', 'view_once_opens', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Готово ✨
