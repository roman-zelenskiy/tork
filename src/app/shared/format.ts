/** Форматування для українського інтерфейсу: гроші, дати, час, тривалість, телефони */

const money = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const dateNum = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('uk-UA', { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const rel = new Intl.RelativeTimeFormat('uk', { numeric: 'auto' });

export const fmtMoney = (v: number) => `${money.format(Math.round(v))} ₴`;
export const fmtNum = (v: number) => money.format(v);
export const fmtNum1 = (v: number) => num1.format(v);
export const fmtKm = (v: number) => `${money.format(v)} км`;
export const fmtHours = (h: number) => `${num1.format(h)} н/г`;
export const fmtPct = (v: number) => `${Math.round(v)}%`;

export const fmtDate = (iso: string | Date | null | undefined) => (iso ? dateFmt.format(new Date(iso)).replace(' р.', '') : '—');
export const fmtDateShort = (iso: string | Date) => dateShort.format(new Date(iso));
export const fmtDateNum = (iso: string | Date) => dateNum.format(new Date(iso));
export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string | Date | null | undefined) => (iso ? `${fmtDateShort(iso)}, ${fmtTime(iso)}` : '—');
export const fmtWeekday = (d: Date) => weekday.format(d);
export const fmtDayLong = (d: Date) => {
  const s = weekdayLong.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** «45 хв», «1 год 30 хв» */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} хв`;
  return r ? `${h} год ${r} хв` : `${h} год`;
}

/** «щойно», «5 хв тому», «вчора» */
export function fmtAgo(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'щойно';
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

/** +380671234567 → +380 67 123 45 67 */
export function fmtPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return `+380 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return p;
}

export const normPhone = (raw: string): string | null => {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('380') ? d.slice(3) : d.startsWith('0') ? d.slice(1) : d;
  return local.length === 9 ? `+380${local}` : null;
};

/** Ініціали для аватара: «Олег Марченко» → «ОМ», «ТОВ «Південьтранс»» → «ПТ» */
export function initials(name: string): string {
  const clean = name.replace(/^(ТОВ|ФОП|ПП|ПрАТ)\s+/, '').replace(/[«»"]/g, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/** Відмінювання за числом: plural(3, ['наряд','наряди','нарядів']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
