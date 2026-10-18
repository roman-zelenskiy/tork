import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Employee, Order, OrderWork } from '../data/models';
import { nowIso } from '../data/util';
import { OrdersService } from './orders.service';
import { workPrice } from './order-math';
import { L } from '../i18n';

export interface MechStats {
  normHours: number;
  actualMin: number;
  revenue: number;
  works: number;
  efficiency: number | null;
}

const elapsed = (w: OrderWork, now = Date.now()) => w.actualMin + (w.runningSince ? Math.max(0, (now - Date.parse(w.runningSince)) / 60000) : 0);

/**
 * Облік часу механіків: старт / пауза / завершення роботи в наряді.
 * Одночасно в механіка виконується лише одна робота. Зарплата — % від закритих нормо-годин + оклад.
 */
@Injectable({ providedIn: 'root' })
export class MechanicsService {
  private readonly db = inject(DbService);
  private readonly orders = inject(OrdersService);

  readonly elapsed = elapsed;

  mechanics(branchId?: string | null): Employee[] {
    return this.db.employees.items().filter((e) => e.role === 'mechanic' && e.active && (!branchId || e.branchId === branchId));
  }

  /** Роботи механіка в активних нарядах (призначені на нього або без виконавця в його наряді) */
  myWorks(mechId: string): { order: Order; works: OrderWork[] }[] {
    const active = ['pryiom', 'diagnostyka', 'pogodzhennia', 'v_roboti', 'kontrol'];
    return this.db.orders
      .items()
      .filter((o) => active.includes(o.status) && (o.mechanicId === mechId || o.works.some((w) => w.mechanicId === mechId)))
      .map((o) => ({ order: o, works: o.works.filter((w) => w.decision !== 'declined' && !(w.needsApproval && w.decision === null) && (w.mechanicId === mechId || (!w.mechanicId && o.mechanicId === mechId))) }))
      .filter((x) => x.works.length)
      .sort((a, b) => (a.order.start ?? '').localeCompare(b.order.start ?? ''));
  }

  running(mechId: string): { order: Order; work: OrderWork } | null {
    for (const o of this.db.orders.items()) {
      const w = o.works.find((x) => x.runningSince && x.mechanicId === mechId);
      if (w) return { order: o, work: w };
    }
    return null;
  }

  private async setWork(o: Order, id: string, fn: (w: OrderWork) => OrderWork, log: string): Promise<Order> {
    return this.db.orders.update(o.id, { works: o.works.map((w) => (w.id === id ? fn(w) : w)) }, { log });
  }

  private stop(w: OrderWork, state: OrderWork['state']): OrderWork {
    return { ...w, state, actualMin: Math.round(elapsed(w)), runningSince: null };
  }

  async start(o: Order, w: OrderWork, mechId: string): Promise<void> {
    const cur = this.running(mechId);
    if (cur && cur.work.id !== w.id) await this.setWork(cur.order, cur.work.id, (x) => this.stop(x, 'paused'), L(`${cur.order.number}: пауза «${cur.work.name}»`, `${cur.order.number}: paused “${cur.work.name}”`));
    const fresh = this.db.orders.get(o.id)!;
    const next = await this.setWork(fresh, w.id, (x) => ({ ...x, state: 'in_progress', mechanicId: mechId, runningSince: nowIso() }), L(`${o.number}: почато «${w.name}»`, `${o.number}: started “${w.name}”`));
    // наряд переходить у роботу, коли механік почав непогоджувальну роботу
    const diag = /діагност|diagnos/i.test(w.name);
    if (next.status === 'pryiom') await this.orders.setStatus(next, diag ? 'diagnostyka' : 'v_roboti');
    else if ((next.status === 'diagnostyka' || next.status === 'pogodzhennia') && !diag) await this.orders.setStatus(next, 'v_roboti');
  }

  async pause(o: Order, w: OrderWork): Promise<void> {
    await this.setWork(o, w.id, (x) => this.stop(x, 'paused'), L(`${o.number}: пауза «${w.name}»`, `${o.number}: paused “${w.name}”`));
  }

  async finish(o: Order, w: OrderWork): Promise<boolean> {
    const next = await this.setWork(o, w.id, (x) => this.stop(x, 'done'), L(`${o.number}: виконано «${w.name}»`, `${o.number}: done “${w.name}”`));
    const left = next.works.filter((x) => x.decision !== 'declined' && !(x.needsApproval && x.decision === null) && x.state !== 'done');
    if (!left.length && next.status === 'v_roboti') {
      await this.orders.setStatus(next, 'kontrol');
      await this.db.notify({ kind: 'order', title: L(`${next.number}: роботи виконано`, `${next.number}: work done`), text: L('Наряд передано на контроль якості.', 'The work order has moved to quality check.'), link: `/naryady/${next.id}` });
      return true;
    }
    return false;
  }

  async addPhotos(o: Order, w: OrderWork, photos: string[]): Promise<void> {
    await this.db.orders.update(o.id, { works: o.works.map((x) => (x.id === w.id ? { ...x, photos } : x)) }, { log: false });
  }

  /** Закриті нормо-години: виконані роботи у виданих нарядах за період (за датою видачі) */
  stats(mechId: string, from: number, to: number): MechStats {
    let norm = 0;
    let actual = 0;
    let revenue = 0;
    let works = 0;
    for (const o of this.db.orders.items()) {
      if (o.status !== 'vydano' || !o.closedAt) continue;
      const t = Date.parse(o.closedAt);
      if (t < from || t > to) continue;
      for (const w of o.works) {
        const who = w.mechanicId ?? o.mechanicId;
        if (who !== mechId || w.state !== 'done' || w.decision === 'declined') continue;
        norm += w.hours;
        actual += w.actualMin;
        revenue += workPrice(w) * (1 - o.discountPct / 100);
        works++;
      }
    }
    return { normHours: norm, actualMin: actual, revenue, works, efficiency: actual ? Math.round(((norm * 60) / actual) * 100) : null };
  }
}
