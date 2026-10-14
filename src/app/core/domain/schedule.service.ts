import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Order } from '../data/models';
import { toMin, ymd } from '../../shared/format';

export interface Slot {
  postId: string | null;
  start: string | null;
  durationMin: number;
  mechanicId: string | null;
  /** Наряд, що переміщується (виключається з перевірки) */
  orderId?: string;
}

export interface Conflict {
  kind: 'overlap' | 'mechanic' | 'hours' | 'dayoff' | 'past';
  text: string;
  orderId?: string;
}

const MIN = 60_000;
/** Наряди, які займають пост на табло */
export const onBoard = (o: Order) => o.status !== 'skasovano' && !!o.postId && !!o.start;

/** Перевірка конфліктів табло й пошук вільного часу */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly db = inject(DbService);

  conflicts(s: Slot): Conflict[] {
    if (!s.postId || !s.start) return [];
    const out: Conflict[] = [];
    const start = Date.parse(s.start);
    const end = start + s.durationMin * MIN;
    if (start < Date.now() - 5 * MIN && !s.orderId) out.push({ kind: 'past', text: 'Цей час уже минув — перевірте дату' });
    const post = this.db.posts.get(s.postId);
    const branch = this.db.branches.get(post?.branchId);
    if (branch) {
      const d = new Date(start);
      const dow = d.getDay() || 7;
      if (!branch.workDays.includes(dow)) out.push({ kind: 'dayoff', text: `${branch.name} у цей день не працює` });
      else {
        const sm = d.getHours() * 60 + d.getMinutes();
        if (sm < toMin(branch.opensAt) || sm + s.durationMin > toMin(branch.closesAt))
          out.push({ kind: 'hours', text: `Поза робочим часом (${branch.opensAt}–${branch.closesAt})` });
      }
    }
    for (const o of this.db.orders.items()) {
      if (o.id === s.orderId || !onBoard(o)) continue;
      const os = Date.parse(o.start!);
      const oe = os + o.durationMin * MIN;
      if (os >= end || oe <= start) continue;
      if (o.postId === s.postId) out.push({ kind: 'overlap', text: `Пост зайнятий нарядом ${o.number} (${this.hhmm(os)}–${this.hhmm(oe)})`, orderId: o.id });
      else if (s.mechanicId && o.mechanicId === s.mechanicId) {
        const m = this.db.employees.get(s.mechanicId);
        out.push({ kind: 'mechanic', text: `${m?.name ?? 'Механік'} у цей час на іншому пості (${o.number})`, orderId: o.id });
      }
    }
    return out;
  }

  /** Найближчий вільний слот на посту (крок налаштувань, від `from`) */
  nextFree(postId: string, durationMin: number, from = new Date(), days = 14): string | null {
    const post = this.db.posts.get(postId);
    const branch = this.db.branches.get(post?.branchId);
    if (!branch) return null;
    const step = this.db.settings()?.slotMin ?? 15;
    for (let d = 0; d < days; d++) {
      const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
      if (!branch.workDays.includes(day.getDay() || 7)) continue;
      let m = toMin(branch.opensAt);
      if (d === 0) {
        const nowM = from.getHours() * 60 + from.getMinutes();
        m = Math.max(m, Math.ceil(nowM / step) * step);
      }
      for (; m + durationMin <= toMin(branch.closesAt); m += step) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60).toISOString();
        if (!this.conflicts({ postId, start, durationMin, mechanicId: null }).some((c) => c.kind === 'overlap')) return start;
      }
    }
    return null;
  }

  /** Наряди посту за день (для табло й підказок) */
  dayOrders(branchId: string, day: Date): Order[] {
    const key = ymd(day);
    return this.db.orders.items().filter((o) => o.branchId === branchId && onBoard(o) && ymd(new Date(o.start!)) === key);
  }

  private hhmm(t: number): string {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
