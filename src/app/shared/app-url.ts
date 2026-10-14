/** Абсолютна адреса з урахуванням base href (на GitHub Pages застосунок живе в /tork/) */
export function appUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), document.baseURI).href;
}

/** Адреса для тексту повідомлень — без протоколу */
export const appUrlShort = (path: string) => appUrl(path).replace(/^https?:\/\//, '');
