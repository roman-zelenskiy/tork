import { Order, OrderPart, OrderStatus, OrderWork } from '../data/models';

/**
 * Розрахунки наряду. Рядки, від яких клієнт відмовився при погодженні, не входять у суму.
 * Вартість роботи = нормо-години × ставка (поста або категорії), заокруглено до гривні.
 */
export const workPrice = (w: Pick<OrderWork, 'hours' | 'rate'>) => Math.round(w.hours * w.rate);
export const partPrice = (p: Pick<OrderPart, 'qty' | 'price'>) => Math.round(p.qty * p.price);

const counted = <T extends { decision: 'approved' | 'declined' | null }>(x: T) => x.decision !== 'declined';

export function orderTotals(o: Pick<Order, 'works' | 'parts' | 'discountPct' | 'payments'>) {
  const works = o.works.filter(counted).reduce((s, w) => s + workPrice(w), 0);
  const parts = o.parts.filter(counted).reduce((s, p) => s + partPrice(p), 0);
  const subtotal = works + parts;
  const discount = Math.round((subtotal * (o.discountPct || 0)) / 100);
  const total = subtotal - discount;
  const paid = o.payments.reduce((s, p) => s + p.amount, 0);
  return { works, parts, subtotal, discount, total, paid, debt: Math.max(0, total - paid), hours: o.works.filter(counted).reduce((s, w) => s + w.hours, 0) };
}

/** Порядок статусів для канбану й таймлайну */
export const STATUS_FLOW: OrderStatus[] = ['zapys', 'pryiom', 'diagnostyka', 'pogodzhennia', 'v_roboti', 'kontrol', 'gotovo', 'vydano'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  zapys: 'Запис',
  pryiom: 'Прийом',
  diagnostyka: 'Діагностика',
  pogodzhennia: 'Погодження',
  v_roboti: 'В роботі',
  kontrol: 'Контроль якості',
  gotovo: 'Готово',
  vydano: 'Видано',
  skasovano: 'Скасовано',
};

/** Відкриті наряди — ще не видані й не скасовані */
export const isOpen = (s: OrderStatus) => s !== 'vydano' && s !== 'skasovano';

/** Дозволені переходи: вперед по потоку на будь-який наступний крок, назад — на один, скасування — до видачі */
export function canMove(from: OrderStatus, to: OrderStatus): { ok: boolean; reason?: string } {
  if (from === to) return { ok: false };
  if (from === 'vydano') return { ok: false, reason: 'Виданий наряд не змінюють. Створіть новий.' };
  if (from === 'skasovano') return to === 'zapys' ? { ok: true } : { ok: false, reason: 'Скасований наряд можна лише відновити як запис' };
  if (to === 'skasovano') return { ok: true };
  const a = STATUS_FLOW.indexOf(from);
  const b = STATUS_FLOW.indexOf(to);
  if (b < a - 1) return { ok: false, reason: 'Назад можна лише на один крок' };
  return { ok: true };
}
