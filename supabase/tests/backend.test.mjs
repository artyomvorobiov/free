// Проверка supabase/schema.sql на локальном Supabase (для разработчиков).
//
// 1) npx supabase start   (нужен Docker; в supabase/config.toml включите шаблоны писем с {{ .Token }})
// 2) psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/schema.sql
// 3) ANON=<anon key> SERVICE=<service_role key> node supabase/tests/backend.test.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.ANON;
const SERVICE = process.env.SERVICE;
const DB = { host: process.env.PGHOST ?? '127.0.0.1', port: process.env.PGPORT ?? '54322' };
const MAILPIT = process.env.MAILPIT ?? 'http://127.0.0.1:54324';
if (!ANON || !SERVICE) {
  console.error('Укажите ключи: ANON=... SERVICE=... node supabase/tests/backend.test.mjs');
  process.exit(2);
}
const admin = createClient(API_URL, SERVICE, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function psql(sql) {
  return execFileSync('psql', ['-h', DB.host, '-p', DB.port, '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
  }).toString().trim();
}

async function mailCode(email) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(MAILPIT + '/api/v1/search?query=' + encodeURIComponent('to:' + email));
    const j = await res.json();
    if (j.messages?.length) {
      const id = j.messages[0].ID;
      const msg = await (await fetch(MAILPIT + '/api/v1/message/' + id)).json();
      const m = (msg.Text || msg.HTML).match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await sleep(300);
  }
  throw new Error('no mail for ' + email);
}

async function userViaEmailOtp(email) {
  const c = createClient(API_URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  const code = await mailCode(email);
  const { data, error: e2 } = await c.auth.verifyOtp({ email, token: code, type: 'email' });
  if (e2) throw e2;
  return { c, id: data.user.id };
}

async function userViaAdminOtp(email) {
  const c = createClient(API_URL, ANON, { auth: { persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const { data, error: e2 } = await c.auth.verifyOtp({ email, token: link.properties.email_otp, type: 'email' });
  if (e2) throw e2;
  return { c, id: data.user.id };
}

const stamp = Date.now().toString(36);
console.log('Auth');
const A = await userViaEmailOtp(`alice_${stamp}@test.dev`);
ok(!!A.id, 'new user signs in with 6-digit email code (confirm-signup template)');
// existing user → magic link template
{
  const c = createClient(API_URL, ANON, { auth: { persistSession: false } });
  await sleep(1100);
  const { error } = await c.auth.signInWithOtp({ email: `alice_${stamp}@test.dev` });
  ok(!error, 'existing user can request a code again', error?.message);
}
const B = await userViaAdminOtp(`bob_${stamp}@test.dev`);
const C = await userViaAdminOtp(`carol_${stamp}@test.dev`);
ok(B.id && C.id, 'more users created');

console.log('Profiles');
for (const [u, name, nick] of [[A, 'Алиса', `alice_${stamp}`], [B, 'Боб', `bob_${stamp}`], [C, 'Кэрол', `carol_${stamp}`]]) {
  const { data: p, error } = await u.c.rpc('bootstrap');
  ok(!error && p.id === u.id, 'bootstrap returns own profile', error?.message);
  const { error: e2 } = await u.c.from('profiles').update({ display_name: name, username: nick }).eq('id', u.id);
  ok(!e2, 'set name + username', e2?.message);
}
{
  const { data } = await B.c.rpc('is_username_available', { p_username: `alice_${stamp}` });
  ok(data === false, 'taken username is unavailable');
  const { data: d2 } = await B.c.rpc('is_username_available', { p_username: 'free_name_' + stamp });
  ok(d2 === true, 'free username is available');
  const { error } = await B.c.from('profiles').update({ username: `alice_${stamp}` }).eq('id', B.id);
  ok(error?.code === '23505', 'duplicate username rejected', error);
  const { error: e3 } = await B.c.from('profiles').update({ display_name: 'hack' }).eq('id', A.id).select();
  const { data: aProf } = await A.c.from('profiles').select('display_name').eq('id', A.id).single();
  ok(aProf.display_name === 'Алиса', 'cannot edit someone else profile', e3);
  const { data: found } = await A.c.rpc('search_users', { p_query: '@bob_' + stamp.slice(0, 3) });
  ok(found?.some((p) => p.id === B.id) && !found.some((p) => p.id === A.id), 'search by @username (excludes self)', found);
  const { data: found2 } = await A.c.rpc('search_users', { p_query: 'кэр' });
  ok(found2?.some((p) => p.id === C.id), 'search by display name (cyrillic, case-insensitive)');
}

console.log('Self chat');
{
  const { data } = await A.c.rpc('get_my_chats');
  ok(Array.isArray(data) && data.length === 1 && data[0].kind === 'self', 'new user has «Заметки»', data);
}

console.log('Direct chat');
const { data: chatAB, error: dErr } = await A.c.rpc('get_or_create_direct', { p_other: B.id });
ok(!dErr && chatAB, 'A creates direct chat with B', dErr?.message);
{
  const { data: again } = await B.c.rpc('get_or_create_direct', { p_other: A.id });
  ok(again === chatAB, 'B gets the same chat (no duplicates)');
}

// realtime subscriptions
const events = { B: [], C: [] };
const subB = B.c.channel('test-b').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => events.B.push(p));
const subC = C.c.channel('test-c').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => events.C.push(p));
await Promise.all([
  new Promise((r) => subB.subscribe((s) => s === 'SUBSCRIBED' && r())),
  new Promise((r) => subC.subscribe((s) => s === 'SUBSCRIBED' && r())),
]);
await sleep(3000);

const m1 = crypto.randomUUID();
{
  const { error } = await A.c.from('messages').insert({ id: m1, chat_id: chatAB, kind: 'text', body: 'Привет, Боб!' });
  ok(!error, 'A sends text', error?.message);
  const { error: e2 } = await C.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'я тут' });
  ok(!!e2, 'outsider C cannot post into A–B chat');
  const { error: e3 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'system', meta: { type: 'created' } });
  ok(!!e3, 'clients cannot forge system messages');
  const { error: e4 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'от имени Боба', sender_id: B.id });
  ok(!!e4, 'cannot impersonate another sender');
  const { data: seenByC } = await C.c.from('messages').select('id').eq('chat_id', chatAB);
  ok(seenByC?.length === 0, 'outsider C sees nothing');
}
await sleep(1500);
ok(events.B.some((e) => e.eventType === 'INSERT' && e.new.id === m1), 'B receives realtime INSERT', events.B.length);
ok(!events.C.some((e) => e.new?.id === m1), 'C does NOT receive realtime INSERT (RLS)');

{
  const { data } = await B.c.rpc('get_my_chats');
  const ch = data.find((c) => c.id === chatAB);
  ok(ch && ch.unread === 1 && ch.last_message?.body === 'Привет, Боб!' && ch.members.length === 2, 'B chat list: unread=1, last message, members', ch);
  await B.c.rpc('mark_read', { p_chat: chatAB });
  const { data: d2 } = await B.c.rpc('get_my_chats');
  ok(d2.find((c) => c.id === chatAB).unread === 0, 'mark_read resets unread');
  const { data: members } = await A.c.from('chat_members').select('user_id, seen_at').eq('chat_id', chatAB);
  ok(members.find((m) => m.user_id === B.id)?.seen_at, 'A sees B read receipt (seen_at)');
  const { data: prefsSpy } = await A.c.from('chat_prefs').select('*').eq('user_id', B.id);
  ok(prefsSpy?.length === 0, 'A cannot see B private chat prefs');
}

console.log('Read receipts off');
{
  await B.c.from('profiles').update({ read_receipts: false }).eq('id', B.id);
  const before = (await A.c.from('chat_members').select('seen_at').eq('chat_id', chatAB).eq('user_id', B.id).single()).data.seen_at;
  await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'ещё одно' });
  await sleep(50);
  await B.c.rpc('mark_read', { p_chat: chatAB });
  const after = (await A.c.from('chat_members').select('seen_at').eq('chat_id', chatAB).eq('user_id', B.id).single()).data.seen_at;
  ok(before === after, 'seen_at not updated when read receipts disabled');
  const { data } = await B.c.rpc('get_my_chats');
  ok(data.find((c) => c.id === chatAB).unread === 0, 'but private unread counter still works');
  await B.c.from('profiles').update({ read_receipts: true }).eq('id', B.id);
}

console.log('Reply, reactions, edit, delete');
{
  const m2 = crypto.randomUUID();
  const { error } = await B.c.from('messages').insert({ id: m2, chat_id: chatAB, kind: 'text', body: 'Привет!', reply_to: m1 });
  ok(!error, 'B replies', error?.message);
  const { data: rows, error: qe } = await A.c
    .from('messages')
    .select('*, reactions(user_id, emoji), capsule:capsule_bodies(body), opens:view_once_opens(user_id), reply:reply_to(id, sender_id, kind, body)')
    .eq('chat_id', chatAB)
    .order('created_at', { ascending: false })
    .limit(50);
  ok(!qe && rows.find((r) => r.id === m2)?.reply?.body === 'Привет, Боб!', 'message query with embedded reply preview', qe?.message);
  const { error: re } = await B.c.from('reactions').upsert({ message_id: m1, chat_id: chatAB, emoji: '❤️' });
  ok(!re, 'B reacts', re?.message);
  const { error: re2 } = await B.c.from('reactions').upsert({ message_id: m1, chat_id: chatAB, emoji: '🔥' });
  ok(!re2, 'B changes reaction (upsert)', re2?.message);
  const { data: rx } = await A.c.from('reactions').select('*').eq('message_id', m1);
  ok(rx.length === 1 && rx[0].emoji === '🔥', 'A sees single updated reaction');
  const { error: re3 } = await C.c.from('reactions').insert({ message_id: m1, chat_id: chatAB, emoji: '👎' });
  ok(!!re3, 'outsider cannot react');

  const { error: ee } = await A.c.from('messages').update({ body: 'Привет, Боб! 👋', kind: 'image', chat_id: chatAB }).eq('id', m1);
  const { data: edited } = await B.c.from('messages').select('*').eq('id', m1).single();
  ok(!ee && edited.body === 'Привет, Боб! 👋' && edited.edited_at && edited.kind === 'text', 'A edits own text (only body changes)', ee?.message);
  await B.c.from('messages').update({ body: 'взлом' }).eq('id', m1);
  const { data: notEdited } = await A.c.from('messages').select('body').eq('id', m1).single();
  ok(notEdited.body === 'Привет, Боб! 👋', 'B cannot edit A message');
  await B.c.from('messages').delete().eq('id', m1);
  const { data: still } = await A.c.from('messages').select('id').eq('id', m1);
  ok(still.length === 1, 'B cannot delete A message');
  const { error: de } = await B.c.from('messages').delete().eq('id', m2);
  const { data: gone } = await A.c.from('messages').select('id').eq('id', m2);
  ok(!de && gone.length === 0, 'B deletes own message for everyone');
  await sleep(1200);
  ok(events.B.some((e) => e.eventType === 'DELETE' && e.old?.id === m2), 'realtime DELETE event carries id');
}

console.log('Touch rate limit');
{
  const { error } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'touch', meta: { touch: 'heart' } });
  const { error: e2 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'touch', meta: { touch: 'heart' } });
  ok(!error && !!e2, 'touch allowed, immediate second touch rejected', [error?.message, e2?.message]);
}

console.log('Capsule');
{
  const unlock = new Date(Date.now() + 120_000).toISOString();
  const { data: capId, error } = await A.c.rpc('send_capsule', { p_chat: chatAB, p_body: 'С днём рождения! 🎂', p_unlock_at: unlock });
  ok(!error && capId, 'A sends capsule', error?.message);
  const { error: early } = await A.c.rpc('send_capsule', { p_chat: chatAB, p_body: 'x', p_unlock_at: new Date().toISOString() });
  ok(!!early, 'capsule must unlock in the future');
  const { data: bView } = await B.c.from('messages').select('id, kind, body, unlock_at, capsule:capsule_bodies(body)').eq('id', capId).single();
  ok(bView.kind === 'capsule' && bView.body === null && bView.capsule === null, 'B sees sealed capsule without content', bView);
  const { data: aView } = await A.c.from('messages').select('capsule:capsule_bodies(body)').eq('id', capId).single();
  ok(aView.capsule?.body === 'С днём рождения! 🎂', 'author can read own capsule');
  const { data: direct } = await B.c.from('capsule_bodies').select('*').eq('message_id', capId);
  ok(direct.length === 0, 'B cannot read capsule_bodies directly');
  psql(`update public.messages set unlock_at = now() - interval '1 second' where id = '${capId}'`);
  const { data: bOpen } = await B.c.from('messages').select('capsule:capsule_bodies(body)').eq('id', capId).single();
  ok(bOpen.capsule?.body === 'С днём рождения! 🎂', 'B reads capsule after unlock');
  const { error: ce } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'capsule', unlock_at: unlock });
  ok(!!ce, 'capsule cannot be inserted directly (only via RPC)');
}

console.log('Media + view once + storage policies');
{
  const mediaId = crypto.randomUUID();
  const path = `${chatAB}/${mediaId}.jpg`;
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
  const { error: ue } = await A.c.storage.from('media').upload(path, bytes, { contentType: 'image/jpeg' });
  ok(!ue, 'A uploads into chat folder', ue?.message);
  const { error: ue2 } = await C.c.storage.from('media').upload(`${chatAB}/${crypto.randomUUID()}.jpg`, bytes, { contentType: 'image/jpeg' });
  ok(!!ue2, 'outsider cannot upload into chat folder');
  const { error: me } = await A.c.from('messages').insert({ id: mediaId, chat_id: chatAB, kind: 'image', media_path: path, view_once: true, meta: { w: 10, h: 10 } });
  ok(!me, 'A sends view-once photo', me?.message);
  const { error: badPath } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'image', media_path: `other/${mediaId}.jpg` });
  ok(!!badPath, 'media_path outside chat folder rejected');
  const { data: s1, error: se1 } = await B.c.storage.from('media').createSignedUrl(path, 60);
  ok(!se1 && s1?.signedUrl, 'B can get signed URL before opening', se1?.message);
  if (s1?.signedUrl) {
    const r = await fetch(s1.signedUrl);
    ok(r.ok && (await r.arrayBuffer()).byteLength === bytes.length, 'signed URL downloads the file');
  }
  const { data: s2 } = await C.c.storage.from('media').createSignedUrl(path, 60);
  ok(!s2?.signedUrl, 'C cannot get signed URL');
  const { error: oe } = await B.c.rpc('open_view_once', { p_message: mediaId });
  ok(!oe, 'B opens view-once', oe?.message);
  const { data: s3 } = await B.c.storage.from('media').createSignedUrl(path, 60);
  ok(!s3?.signedUrl, 'B can no longer access after opening');
  const { data: s4 } = await A.c.storage.from('media').createSignedUrl(path, 60);
  ok(!!s4?.signedUrl, 'sender still can');
  const { data: opens } = await A.c.from('messages').select('opens:view_once_opens(user_id)').eq('id', mediaId).single();
  ok(opens.opens?.[0]?.user_id === B.id, 'sender sees that B opened it');

  // avatar
  const { error: av } = await A.c.storage.from('avatars').upload(`${A.id}/avatar.jpg`, bytes, { contentType: 'image/jpeg', upsert: true });
  ok(!av, 'upload own avatar', av?.message);
  const { error: av2 } = await A.c.storage.from('avatars').upload(`${A.id}/avatar.jpg`, bytes, { contentType: 'image/jpeg', upsert: true });
  ok(!av2, 'replace own avatar (upsert)', av2?.message);
  const { error: av3 } = await C.c.storage.from('avatars').upload(`${A.id}/evil.jpg`, bytes, { contentType: 'image/jpeg' });
  ok(!!av3, 'cannot upload into someone else avatar folder');
  const pub = A.c.storage.from('avatars').getPublicUrl(`${A.id}/avatar.jpg`).data.publicUrl;
  ok((await fetch(pub)).ok, 'avatar public URL works');

  // forward via storage copy
  const { data: chatAC } = await A.c.rpc('get_or_create_direct', { p_other: C.id });
  const { data: s5 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'voice', media_path: `${chatAB}/${crypto.randomUUID()}.m4a`, meta: { duration: 3 } }).select().single();
  await A.c.storage.from('media').upload(s5.media_path, bytes, { contentType: 'audio/mp4' });
  const newPath = `${chatAC}/${crypto.randomUUID()}.m4a`;
  const { error: cpe } = await A.c.storage.from('media').copy(s5.media_path, newPath);
  ok(!cpe, 'forward: copy media into another chat folder', cpe?.message);
  const { error: fwe } = await A.c.from('messages').insert({ chat_id: chatAC, kind: 'voice', media_path: newPath, meta: { duration: 3, forwarded_from: 'Алиса' } });
  ok(!fwe, 'forwarded message inserted');
  const { data: s6 } = await C.c.storage.from('media').createSignedUrl(newPath, 60);
  ok(!!s6?.signedUrl, 'C can play forwarded voice');
}

console.log('Disappearing messages');
{
  const { error } = await A.c.rpc('update_chat', { p_chat: chatAB, p_patch: { disappear_seconds: 3600 } });
  ok(!error, 'enable disappearing (1h)', error?.message);
  const { data: sys } = await B.c.from('messages').select('*').eq('chat_id', chatAB).eq('kind', 'system').order('created_at', { ascending: false }).limit(1).single();
  ok(sys?.meta?.type === 'disappear' && sys.meta.value === 3600, 'system message posted');
  const { data: msg } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'исчезну' }).select().single();
  ok(msg.expires_at && Math.abs(new Date(msg.expires_at) - new Date(msg.created_at) - 3600_000) < 2000, 'expires_at = created_at + 1h');
  psql(`update public.messages set expires_at = now() - interval '1 second' where id = '${msg.id}'`);
  const { data: hidden } = await B.c.from('messages').select('id').eq('id', msg.id);
  ok(hidden.length === 0, 'expired message hidden immediately');
  psql('select public.purge_expired()');
  ok(psql(`select count(*) from public.messages where id = '${msg.id}'`) === '0', 'purge_expired deletes it');
  await A.c.rpc('update_chat', { p_chat: chatAB, p_patch: { disappear_seconds: null } });
  const { data: msg2 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'останусь' }).select().single();
  ok(msg2.expires_at === null, 'disabled again');
  const { error: te } = await B.c.rpc('update_chat', { p_chat: chatAB, p_patch: { theme: 'sunset' } });
  const { data: chatRow } = await A.c.from('chats').select('theme').eq('id', chatAB).single();
  ok(!te && chatRow.theme === 'sunset', 'chat theme shared between members');
  const { error: te2 } = await C.c.rpc('update_chat', { p_chat: chatAB, p_patch: { theme: 'ocean' } });
  ok(!!te2, 'outsider cannot change chat');
}

console.log('Scheduled messages');
{
  const { error: past } = await A.c.from('scheduled_messages').insert({ chat_id: chatAB, body: 'вчера', send_at: new Date(Date.now() - 1000).toISOString() });
  ok(!!past, 'cannot schedule in the past');
  const { data: sch, error } = await A.c.from('scheduled_messages').insert({ chat_id: chatAB, body: 'Доброе утро ☀️', send_at: new Date(Date.now() + 1500).toISOString() }).select().single();
  ok(!error && sch, 'schedule a message', error?.message);
  const { data: bSees } = await B.c.from('scheduled_messages').select('*');
  ok(bSees.length === 0, 'recipient cannot see scheduled message');
  await sleep(2000);
  psql('select public.publish_due_messages()');
  const { data: pub } = await B.c.from('messages').select('*').eq('chat_id', chatAB).eq('body', 'Доброе утро ☀️');
  ok(pub.length === 1 && pub[0].sender_id === A.id && pub[0].meta.scheduled === true, 'published from A at due time');
  ok(psql(`select count(*) from public.scheduled_messages where id = '${sch.id}'`) === '0', 'removed from queue');
  const jobs = psql("select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname like 'blizko-%' and d.status = 'succeeded'");
  ok(Number(jobs) > 0, 'pg_cron jobs are running successfully', jobs);
}

console.log('Snooze');
{
  await B.c.from('chat_prefs').upsert({ chat_id: chatAB, user_id: B.id, snoozed_until: new Date(Date.now() + 3600_000).toISOString() });
  const s1 = (await B.c.from('chat_prefs').select('snoozed_until').eq('chat_id', chatAB).single()).data.snoozed_until;
  ok(!!s1, 'B snoozes chat');
  await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'ты тут?' });
  const s2 = (await B.c.from('chat_prefs').select('snoozed_until').eq('chat_id', chatAB).single()).data.snoozed_until;
  ok(s2 === null, 'new incoming message un-snoozes');
}

console.log('Push payload');
{
  await B.c.rpc('register_push_token', { p_token: 'ExponentPushToken[test-bob]', p_platform: 'ios' });
  await A.c.rpc('register_push_token', { p_token: 'ExponentPushToken[test-alice]', p_platform: 'ios' });
  const out = psql(`begin;
    select set_config('request.jwt.claims', '{"sub":"${A.id}","role":"authenticated"}', true);
    set local role authenticated;
    insert into public.messages (chat_id, kind, body, silent) values ('${chatAB}', 'text', 'тихо', true);
    reset role;
    select convert_from(body, 'UTF8') from net.http_request_queue order by id desc limit 1;
    rollback;`);
  const body = JSON.parse(out.split('\n').find((l) => l.startsWith('[')));
  ok(Array.isArray(body) && body.length === 1 && body[0].to === 'ExponentPushToken[test-bob]', 'push goes only to recipient', body);
  ok(body[0].title === 'Алиса' && body[0].body === 'тихо' && body[0].sound === null && body[0].badge >= 1, 'title/body/silent/badge correct', body[0]);
  await B.c.from('chat_prefs').upsert({ chat_id: chatAB, user_id: B.id, muted_until: 'infinity' });
  const out2 = psql(`begin;
    select set_config('request.jwt.claims', '{"sub":"${A.id}","role":"authenticated"}', true);
    set local role authenticated;
    select count(*) from net.http_request_queue;
    insert into public.messages (chat_id, kind, body) values ('${chatAB}', 'text', 'muted');
    select count(*) from net.http_request_queue;
    rollback;`).split('\n').filter((l) => /^\d+$/.test(l));
  ok(out2.length === 2 && out2[0] === out2[1], 'muted chat → no push', out2);
  await B.c.from('chat_prefs').upsert({ chat_id: chatAB, user_id: B.id, muted_until: null });
  await B.c.from('profiles').update({ push_preview: false }).eq('id', B.id);
  const out3 = psql(`begin;
    select set_config('request.jwt.claims', '{"sub":"${A.id}","role":"authenticated"}', true);
    set local role authenticated;
    insert into public.messages (chat_id, kind, body) values ('${chatAB}', 'text', 'секрет');
    reset role;
    select convert_from(body, 'UTF8') from net.http_request_queue order by id desc limit 1;
    rollback;`);
  const b3 = JSON.parse(out3.split('\n').find((l) => l.startsWith('[')));
  ok(b3[0].body === 'Новое сообщение' && b3[0].sound === 'default', 'hidden preview when push_preview=false', b3[0]);
  await B.c.from('profiles').update({ push_preview: true }).eq('id', B.id);
}

console.log('Groups');
let group;
{
  const { data: g, error } = await A.c.rpc('create_group', { p_title: 'Поход 🏕', p_emoji: '🏕', p_members: [B.id, C.id] });
  group = g;
  ok(!error && g, 'A creates group with B and C', error?.message);
  const { data: cList } = await C.c.rpc('get_my_chats');
  const cg = cList.find((c) => c.id === g);
  ok(cg && cg.members.length === 3 && cg.title === 'Поход 🏕', 'C sees the group with 3 members');
  const { error: se } = await C.c.from('messages').insert({ chat_id: g, kind: 'text', body: 'Я с вами!' });
  ok(!se, 'C writes into group');
  const { error: re } = await C.c.rpc('remove_member', { p_chat: g, p_user: B.id });
  ok(!!re, 'non-owner cannot remove members');
  const { error: re2 } = await A.c.rpc('remove_member', { p_chat: g, p_user: C.id });
  ok(!re2, 'owner removes C', re2?.message);
  const { data: cAfter } = await C.c.from('messages').select('id').eq('chat_id', g);
  ok(cAfter.length === 0, 'removed member loses access');
  const { error: ae } = await B.c.rpc('add_members', { p_chat: g, p_members: [C.id] });
  ok(!ae, 'member adds C back', ae?.message);
  const { error: le } = await A.c.rpc('leave_chat', { p_chat: g });
  ok(!le, 'owner leaves', le?.message);
  const { data: roles } = await B.c.from('chat_members').select('user_id, role').eq('chat_id', g);
  ok(roles.length === 2 && roles.filter((r) => r.role === 'owner').length === 1, 'ownership transferred', roles);
  const { error: ue } = await B.c.rpc('update_chat', { p_chat: g, p_patch: { title: 'Поход 2.0' } });
  const { data: sys } = await C.c.from('messages').select('meta').eq('chat_id', g).eq('kind', 'system').order('created_at', { ascending: false }).limit(1).single();
  ok(!ue && sys.meta.type === 'title', 'rename posts system message');
}

console.log('Blocking + reports');
{
  const { error } = await B.c.from('blocks').insert({ blocked: A.id });
  ok(!error, 'B blocks A', error?.message);
  const { error: se } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'ау' });
  ok(!!se, 'A cannot write to B anymore');
  const { error: se2 } = await B.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'и я не могу' });
  ok(!!se2, 'blocker cannot write either (until unblock)');
  const { error: ge } = await A.c.rpc('get_or_create_direct', { p_other: B.id });
  ok(!ge, 'existing chat still opens');
  const { error: rpe } = await B.c.from('reports').insert({ target_user: A.id, reason: 'спам' });
  ok(!rpe, 'B reports A', rpe?.message);
  const { data: rp } = await B.c.from('reports').select('*');
  ok(rp.length === 0, 'reports are write-only');
  await B.c.from('blocks').delete().eq('blocked', A.id);
  const { error: se3 } = await A.c.from('messages').insert({ chat_id: chatAB, kind: 'text', body: 'снова можно' });
  ok(!se3, 'after unblock A can write');
}

console.log('Account deletion');
{
  const { error } = await C.c.rpc('delete_my_account');
  ok(!error, 'C deletes account', error?.message);
  ok(psql(`select count(*) from auth.users where id = '${C.id}'`) === '0', 'auth user removed');
  ok(psql(`select count(*) from public.profiles where id = '${C.id}'`) === '0', 'profile removed');
  const { data: groupMembers } = await B.c.from('chat_members').select('user_id').eq('chat_id', group);
  ok(groupMembers.length === 1, 'removed from groups');
}

console.log('Anon access');
{
  const anon = createClient(API_URL, ANON, { auth: { persistSession: false } });
  const { data } = await anon.from('profiles').select('*');
  ok(!data || data.length === 0, 'anon cannot read profiles');
  const { error } = await anon.rpc('get_my_chats');
  ok(!!error, 'anon cannot call RPCs', error?.message);
}

await A.c.removeAllChannels();
await B.c.removeAllChannels();
await C.c.removeAllChannels();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
