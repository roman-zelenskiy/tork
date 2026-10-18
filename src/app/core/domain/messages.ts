import { BRAND, L } from '../i18n';

/** Підстановка змінних у шаблони SMS/Viber */
export interface TemplateVars {
  name?: string;
  car?: string;
  plate?: string;
  work?: string;
  date?: string;
  link?: string;
  service?: string;
}

export const TEMPLATE_VARS: { key: string; hint: string }[] = L(
  [
    { key: '{ім’я}', hint: 'ім’я клієнта' },
    { key: '{авто}', hint: 'марка й модель' },
    { key: '{номер}', hint: 'держномер' },
    { key: '{робота}', hint: 'назва роботи' },
    { key: '{дата}', hint: 'дата запису чи ТО' },
    { key: '{посилання}', hint: 'посилання' },
    { key: '{сервіс}', hint: 'назва сервісу' },
  ],
  [
    { key: '{name}', hint: 'customer’s first name' },
    { key: '{car}', hint: 'make and model' },
    { key: '{plate}', hint: 'number plate' },
    { key: '{work}', hint: 'job name' },
    { key: '{date}', hint: 'booking or service date' },
    { key: '{link}', hint: 'link' },
    { key: '{service}', hint: 'service name' },
  ],
);

/** Змінні приймаємо обома мовами: шаблон, імпортований з іншої версії, теж спрацює */
export function renderTemplate(text: string, v: TemplateVars): string {
  return text
    .replace(/\{(ім[\u02bc’']я|name)\}/g, v.name ?? '')
    .replace(/\{(авто|car)\}/g, v.car ?? '')
    .replace(/\{(номер|plate)\}/g, v.plate ?? '')
    .replace(/\{(робота|work)\}/g, v.work ?? '')
    .replace(/\{(дата|date)\}/g, v.date ?? '')
    .replace(/\{(посилання|link)\}/g, v.link ?? '')
    .replace(/\{(сервіс|service)\}/g, v.service ?? BRAND)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** SMS: 70 символів кирилицею на сегмент (67 у склеєних), латиницею (GSM-7) — 160 (153) */
export function smsSegments(text: string): number {
  const n = [...text].length;
  const [one, many] = [...text].some((c) => c.charCodeAt(0) > 127) ? [70, 67] : [160, 153];
  return n <= one ? 1 : Math.ceil(n / many);
}

/** Юрособа: «ТОВ «…»», «ФОП …» чи «… LLC», «Sole trader …» — звертаємось повною назвою */
export const COMPANY_RE = /^(ТОВ|ФОП|ПП|ПрАТ)\s|\b(LLC|Ltd|PE)$|^Sole trader\s/;

export const firstName = (full: string) => (COMPANY_RE.test(full) ? full : full.split(' ')[0]);
