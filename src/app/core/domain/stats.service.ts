import { Injectable, computed, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Order } from '../data/models';
import { orderTotals } from './order-math';

export type Totals = ReturnType<typeof orderTotals>;

export interface ClientStats {
  visits: number;
  revenue: number;
  debt: number;
  lastVisit: string | null;
  openOrders: number;
  cars: number;
}

/** Похідні показники, які потрібні в багатьох розділах: суми нарядів, статистика клієнтів і авто */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly db = inject(DbService);

  /** Підсумки кожного наряду (перераховуються лише при зміні tork:orders) */
  readonly totals = computed(() => new Map(this.db.orders.items().map((o) => [o.id, orderTotals(o)] as const)));

  totalsOf(o: Order): Totals {
    return this.totals().get(o.id) ?? orderTotals(o);
  }

  readonly ordersByClient = computed(() => group(this.db.orders.items(), (o) => o.clientId));
  readonly ordersByCar = computed(() => group(this.db.orders.items(), (o) => o.carId));
  readonly carsByClient = computed(() => group(this.db.cars.items(), (c) => c.clientId));

  readonly clientStats = computed(() => {
    const totals = this.totals();
    const out = new Map<string, ClientStats>();
    for (const c of this.db.clients.items()) {
      const orders = this.ordersByClient().get(c.id) ?? [];
      let revenue = 0;
      let debt = 0;
      let visits = 0;
      let open = 0;
      let last: string | null = null;
      for (const o of orders) {
        const t = totals.get(o.id)!;
        if (o.status === 'vydano') {
          visits++;
          revenue += t.total;
          debt += t.debt;
          const at = o.closedAt ?? o.start ?? o.createdAt;
          if (!last || at > last) last = at;
        } else if (o.status !== 'skasovano' && o.status !== 'zapys') open++;
      }
      out.set(c.id, { visits, revenue, debt, lastVisit: last, openOrders: open, cars: this.carsByClient().get(c.id)?.length ?? 0 });
    }
    return out;
  });
}

function group<T>(items: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of items) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}
