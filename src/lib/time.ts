const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAYS_ACC = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDiff(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

export function formatTime(iso: string | Date) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время в списке чатов */
export function formatChatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = dayDiff(now, d);
  if (diff === 0) return formatTime(d);
  if (diff === 1) return 'вчера';
  if (diff < 7) return WEEKDAYS_SHORT[d.getDay()];
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** Разделитель дней в чате */
export function formatDay(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = dayDiff(now, d);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «в сети», «был(а) 5 минут назад» и т. п. */
export function formatLastSeen(iso: string | null, onlineNow = false) {
  if (onlineNow) return 'в сети';
  if (!iso) return 'был(а) недавно';
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 2 * 60_000) return 'в сети';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `был(а) ${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`;
  const diff = dayDiff(new Date(), d);
  if (diff === 0) return `был(а) сегодня в ${formatTime(d)}`;
  if (diff === 1) return `был(а) вчера в ${formatTime(d)}`;
  if (diff < 7) return `был(а) ${diff} ${plural(diff, ['день', 'дня', 'дней'])} назад`;
  return `был(а) ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function isOnline(iso: string | null) {
  return !!iso && Date.now() - new Date(iso).getTime() < 2 * 60_000;
}

/** 0:42 */
export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** «2 д 4 ч», «3 ч 12 мин», «45 с» */
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h ? `${d} д ${h} ч` : `${d} д`;
  if (h > 0) return m ? `${h} ч ${m} мин` : `${h} ч`;
  if (m > 0) return `${m} мин`;
  return `${s} с`;
}

/** Сколько ждёт ответа: «45 мин», «3 ч», «2 д» */
export function formatAge(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} д`;
}

/** «сегодня в 18:00», «завтра в 9:00», «в пятницу в 9:00», «12 марта в 9:00» */
export function formatMoment(iso: string | Date) {
  const d = new Date(iso);
  const diff = dayDiff(d, new Date());
  const t = formatTime(d);
  if (diff === 0) return `сегодня в ${t}`;
  if (diff === 1) return `завтра в ${t}`;
  if (diff > 1 && diff < 7) return `в ${WEEKDAYS_ACC[d.getDay()]} в ${t}`;
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? `${base} в ${t}` : `${base} ${d.getFullYear()} в ${t}`;
}

/** «до 15:00», «до завтра», «до 12 марта» */
export function formatUntil(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = dayDiff(d, new Date());
  if (diff === 0) return `до ${formatTime(d)}`;
  if (diff === 1) return `до завтра, ${formatTime(d)}`;
  return `до ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function fullDate(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${formatTime(d)}`;
}

export const DISAPPEAR_OPTIONS: { label: string; short: string; seconds: number | null }[] = [
  { label: 'Выключено', short: 'выкл', seconds: null },
  { label: '1 час', short: '1 ч', seconds: 3600 },
  { label: '1 день', short: '1 д', seconds: 86400 },
  { label: '1 неделя', short: '7 д', seconds: 604800 },
  { label: '1 месяц', short: '30 д', seconds: 2592000 },
];

export function disappearLabel(seconds: number | null | undefined) {
  if (!seconds) return 'выключены';
  const o = DISAPPEAR_OPTIONS.find((x) => x.seconds === seconds);
  if (o) return o.label.toLowerCase();
  return formatCountdown(seconds * 1000);
}

/** Набор быстрых моментов времени для «ответить позже», отложенной отправки и капсул */
export function quickMoments(kind: 'snooze' | 'schedule' | 'capsule'): { label: string; hint: string; date: Date }[] {
  const now = new Date();
  const at = (days: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);
  const evening = now.getHours() < 18 ? at(0, 19) : at(1, 19);
  const tomorrowMorning = at(1, 9);
  const toSaturday = (6 - now.getDay() + 7) % 7 || 7;
  const weekend = at(toSaturday, 11);
  const toMonday = (8 - now.getDay()) % 7 || 7;
  const monday = at(toMonday, 9);

  if (kind === 'snooze') {
    return [
      { label: 'Через час', hint: formatTime(inHours(1)), date: inHours(1) },
      { label: 'Вечером', hint: formatMoment(evening), date: evening },
      { label: 'Завтра утром', hint: formatMoment(tomorrowMorning), date: tomorrowMorning },
      { label: 'На выходных', hint: formatMoment(weekend), date: weekend },
    ];
  }
  if (kind === 'schedule') {
    return [
      { label: 'Через час', hint: formatTime(inHours(1)), date: inHours(1) },
      { label: 'Вечером', hint: formatMoment(evening), date: evening },
      { label: 'Завтра утром', hint: formatMoment(tomorrowMorning), date: tomorrowMorning },
      { label: 'В понедельник', hint: formatMoment(monday), date: monday },
    ];
  }
  const nextYear = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  return [
    { label: 'Завтра', hint: formatMoment(tomorrowMorning), date: tomorrowMorning },
    { label: 'Через неделю', hint: formatMoment(at(7, 10)), date: at(7, 10) },
    { label: 'Через месяц', hint: formatMoment(at(30, 10)), date: at(30, 10) },
    { label: 'В Новый год', hint: formatMoment(nextYear), date: nextYear },
  ];
}
