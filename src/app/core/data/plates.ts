import { L, isEn } from '../i18n';

/**
 * Українські номерні знаки (стандарт 2004 р.): дві літери регіону, чотири цифри, дві літери серії.
 * Дозволені лише літери, однакові в кирилиці й латиниці: А В С Е Н І К М О Р Т Х.
 * Зберігаємо без пробілів кирилицею («КА4821ВІ»), показуємо з пробілами («КА 4821 ВІ»).
 */
const LAT_TO_CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' };
export const PLATE_LETTERS = 'АВСЕНІКМОРТХ';
const CYR_TO_LAT = Object.fromEntries(Object.entries(LAT_TO_CYR).map(([lat, cyr]) => [cyr, lat]));

export function normalizePlate(raw: string): string {
  return [...raw.toUpperCase().replace(/[\s-]/g, '')].map((c) => LAT_TO_CYR[c] ?? c).join('');
}

export function isValidPlate(raw: string): boolean {
  const p = normalizePlate(raw);
  return new RegExp(`^[${PLATE_LETTERS}]{2}\\d{4}[${PLATE_LETTERS}]{2}$`).test(p);
}

/** В англійському інтерфейсі показуємо латиницею — літери однакові на вигляд */
export function formatPlate(raw: string): string {
  let p = normalizePlate(raw);
  if (isEn) p = [...p].map((c) => CYR_TO_LAT[c] ?? c).join('');
  return p.length === 8 ? `${p.slice(0, 2)} ${p.slice(2, 6)} ${p.slice(6)}` : p;
}

export const plateError = (raw: string) =>
  !raw.trim()
    ? L('Введіть номер', 'Enter a number plate')
    : isValidPlate(raw)
      ? null
      : L('Формат: дві літери, чотири цифри, дві літери — наприклад, КА 4821 ВІ', 'Format: two letters, four digits, two letters — for example, KA 4821 BI');

/** Регіони за першими двома літерами (для підказки) */
export const PLATE_REGIONS: Record<string, string> = {
  АА: L('Київ', 'Kyiv'),
  КА: L('Київ', 'Kyiv'),
  ТТ: L('Київ', 'Kyiv'),
  АІ: L('Київська обл.', 'Kyiv region'),
  КІ: L('Київська обл.', 'Kyiv region'),
  ВС: L('Львівська обл.', 'Lviv region'),
  НС: L('Львівська обл.', 'Lviv region'),
  АЕ: L('Дніпропетровська обл.', 'Dnipropetrovsk region'),
  КЕ: L('Дніпропетровська обл.', 'Dnipropetrovsk region'),
  ВН: L('Одеська обл.', 'Odesa region'),
  НН: L('Одеська обл.', 'Odesa region'),
  АХ: L('Харківська обл.', 'Kharkiv region'),
  КХ: L('Харківська обл.', 'Kharkiv region'),
  АВ: L('Вінницька обл.', 'Vinnytsia region'),
  ВІ: L('Полтавська обл.', 'Poltava region'),
  АМ: L('Житомирська обл.', 'Zhytomyr region'),
  ВМ: L('Сумська обл.', 'Sumy region'),
};
