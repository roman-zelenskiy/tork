/**
 * Мова інтерфейсу. «Торк» збирається двічі — українською (/uk/) та англійською (/en/),
 * тож мова — константа збірки (angular.json → define.LANG), а не стан застосунку.
 * Рядки лежать поруч із місцем використання: L('Клієнти', 'Clients').
 */
declare const LANG: 'uk' | 'en';

export type Lang = 'uk' | 'en';

export const lang: Lang = LANG;
export const isEn = LANG === 'en';

/** Рядок поточною мовою */
export function L<T = string>(uk: T, en: T): T {
  return isEn ? en : uk;
}

/** Локаль для Intl: en-GB — день перед місяцем і 24-годинний час, як в українському інтерфейсі */
export const locale = isEn ? 'en-GB' : 'uk-UA';

/** Назва продукту в інтерфейсі й повідомленнях */
export const BRAND = L('Торк', 'Tork');

/** Ключі localStorage: у кожної мови своя демо-база, щоб українські й англійські дані не змішувались */
export const STORE_PREFIX = isEn ? 'tork-en:' : 'tork:';

/** Одиниці виміру зберігаються українськими ключами; підпис — поточною мовою */
const UNITS: Record<string, string> = { шт: 'pcs', л: 'L', компл: 'set', м: 'm' };
export const unitLabel = (u: string) => (isEn ? (UNITS[u] ?? u) : u);

/**
 * Та сама сторінка іншою мовою. Посилання відносне до base href (/tork/uk/ → ../en/…),
 * тож працює й під час пререндеру, де немає document.
 */
export function switchUrl(routerUrl: string): string {
  return `../${isEn ? 'uk' : 'en'}/${routerUrl.replace(/^\//, '')}`;
}

/** Ручний вибір мови має пріоритет над визначенням за часовим поясом */
export function rememberLang(l: Lang): void {
  try {
    localStorage.setItem('lang', l);
  } catch {
    /* приватний режим — вибір діятиме до закриття вкладки */
  }
}
