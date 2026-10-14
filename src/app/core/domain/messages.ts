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

export const TEMPLATE_VARS: { key: string; hint: string }[] = [
  { key: '{ім’я}', hint: 'ім’я клієнта' },
  { key: '{авто}', hint: 'марка й модель' },
  { key: '{номер}', hint: 'держномер' },
  { key: '{робота}', hint: 'назва роботи' },
  { key: '{дата}', hint: 'дата запису чи ТО' },
  { key: '{посилання}', hint: 'посилання' },
  { key: '{сервіс}', hint: 'назва сервісу' },
];

export function renderTemplate(text: string, v: TemplateVars): string {
  return text
    .replace(/\{ім[\u02bc’']я\}/g, v.name ?? '')
    .replaceAll('{авто}', v.car ?? '')
    .replaceAll('{номер}', v.plate ?? '')
    .replaceAll('{робота}', v.work ?? '')
    .replaceAll('{дата}', v.date ?? '')
    .replaceAll('{посилання}', v.link ?? '')
    .replaceAll('{сервіс}', v.service ?? 'Торк')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** SMS: 70 символів кирилицею на сегмент (67 у склеєних) */
export function smsSegments(text: string): number {
  const n = [...text].length;
  return n <= 70 ? 1 : Math.ceil(n / 67);
}

export const firstName = (full: string) => (/^(ТОВ|ФОП|ПП|ПрАТ)\s/.test(full) ? full : full.split(' ')[0]);
