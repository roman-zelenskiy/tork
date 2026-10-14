import { ConnectedPosition } from '@angular/cdk/overlay';

export interface Option<T = string> {
  value: T;
  label: string;
  /** Другорядний текст праворуч (код, телефон, залишок) */
  hint?: string;
  /** Кольорова крапка (статус, філія) */
  dot?: string;
  disabled?: boolean;
  /** Додаткові слова для пошуку */
  keywords?: string;
  group?: string;
  mono?: boolean;
}

export const DROPDOWN_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

let uid = 0;
export const nextId = (p: string) => `${p}-${++uid}`;

/** Пошук без урахування регістру й апострофів: «мар» знайде «Мар’яна» */
export const norm = (s: string) => s.toLowerCase().replace(/[\u02bc'’`]/g, '').replace(/ё/g, 'е');

export function filterOptions<T>(opts: Option<T>[], q: string): Option<T>[] {
  const n = norm(q.trim());
  if (!n) return opts;
  const words = n.split(/\s+/);
  return opts.filter((o) => {
    const hay = norm(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Клавіатурна навігація списком: повертає новий активний індекс або дію */
export function navKey(e: KeyboardEvent, active: number, count: number): number | 'pick' | 'close' | null {
  switch (e.key) {
    case 'ArrowDown':
      return count ? (active + 1) % count : 0;
    case 'ArrowUp':
      return count ? (active - 1 + count) % count : 0;
    case 'Home':
      return 0;
    case 'End':
      return Math.max(0, count - 1);
    case 'PageDown':
      return Math.min(count - 1, active + 8);
    case 'PageUp':
      return Math.max(0, active - 8);
    case 'Enter':
      return 'pick';
    case 'Escape':
      return 'close';
    default:
      return null;
  }
}
