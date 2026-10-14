/**
 * Українські номерні знаки (стандарт 2004 р.): дві літери регіону, чотири цифри, дві літери серії.
 * Дозволені лише літери, однакові в кирилиці й латиниці: А В С Е Н І К М О Р Т Х.
 * Зберігаємо без пробілів кирилицею («КА4821ВІ»), показуємо з пробілами («КА 4821 ВІ»).
 */
const LAT_TO_CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' };
export const PLATE_LETTERS = 'АВСЕНІКМОРТХ';

export function normalizePlate(raw: string): string {
  return [...raw.toUpperCase().replace(/[\s-]/g, '')].map((c) => LAT_TO_CYR[c] ?? c).join('');
}

export function isValidPlate(raw: string): boolean {
  const p = normalizePlate(raw);
  return new RegExp(`^[${PLATE_LETTERS}]{2}\\d{4}[${PLATE_LETTERS}]{2}$`).test(p);
}

export function formatPlate(raw: string): string {
  const p = normalizePlate(raw);
  return p.length === 8 ? `${p.slice(0, 2)} ${p.slice(2, 6)} ${p.slice(6)}` : p;
}

export const plateError = (raw: string) =>
  !raw.trim()
    ? 'Введіть номер'
    : isValidPlate(raw)
      ? null
      : 'Формат: дві літери, чотири цифри, дві літери — наприклад, КА 4821 ВІ';

/** Регіони за першими двома літерами (для підказки) */
export const PLATE_REGIONS: Record<string, string> = {
  АА: 'Київ',
  КА: 'Київ',
  ТТ: 'Київ',
  АІ: 'Київська обл.',
  КІ: 'Київська обл.',
  ВС: 'Львівська обл.',
  НС: 'Львівська обл.',
  АЕ: 'Дніпропетровська обл.',
  КЕ: 'Дніпропетровська обл.',
  ВН: 'Одеська обл.',
  НН: 'Одеська обл.',
  АХ: 'Харківська обл.',
  КХ: 'Харківська обл.',
  АВ: 'Вінницька обл.',
  ВІ: 'Полтавська обл.',
  АМ: 'Житомирська обл.',
  ВМ: 'Сумська обл.',
};
