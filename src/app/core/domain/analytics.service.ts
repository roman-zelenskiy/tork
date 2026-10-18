import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Order } from '../data/models';
import { StatsService } from './stats.service';
import { partPrice, workPrice } from './order-math';
import { addDays, startOfDay, toMin, ymd } from '../../shared/format';
import { BRAND, L } from '../i18n';

export interface Period {
  from: number;
  to: number;
}

export interface Kpis {
  revenue: number;
  orders: number;
  avgCheck: number;
  cars: number;
  conversion: number | null;
  deferredShare: number | null;
  proposed: number;
}

const DAY = 86400000;

/** Аналітика з даних localStorage: виручка, чек, завантаження постів, погодження, топи */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly db = inject(DbService);
  private readonly stats = inject(StatsService);

  closed(p: Period, branches: string[] | null): Order[] {
    return this.db.orders.items().filter((o) => {
      if (o.status !== 'vydano' || !o.closedAt) return false;
      if (branches && !branches.includes(o.branchId)) return false;
      const t = Date.parse(o.closedAt);
      return t >= p.from && t <= p.to;
    });
  }

  kpis(p: Period, branches: string[] | null): Kpis {
    const list = this.closed(p, branches);
    const totals = this.stats.totals();
    const revenue = list.reduce((s, o) => s + (totals.get(o.id)?.total ?? 0), 0);
    const cars = new Set(list.map((o) => o.carId)).size;
    let proposed = 0;
    let approved = 0;
    for (const a of this.db.approvals.items()) {
      if (a.status !== 'answered') continue;
      const t = Date.parse(a.sentAt);
      if (t < p.from || t > p.to) continue;
      const o = this.db.orders.get(a.orderId);
      if (branches && o && !branches.includes(o.branchId)) continue;
      for (const i of a.items) {
        proposed += i.price;
        if (i.decision === 'approved') approved += i.price;
      }
    }
    return {
      revenue,
      orders: list.length,
      avgCheck: list.length ? revenue / list.length : 0,
      cars,
      conversion: proposed ? (approved / proposed) * 100 : null,
      deferredShare: proposed ? ((proposed - approved) / proposed) * 100 : null,
      proposed,
    };
  }

  previous(p: Period): Period {
    const len = p.to - p.from;
    return { from: p.from - len - 1, to: p.from - 1 };
  }

  /** Виручка по днях (або тижнях, якщо період довший за 45 днів) */
  revenueSeries(p: Period, branches: string[] | null): { label: string; date: number; value: number; count: number }[] {
    const days = Math.ceil((p.to - p.from) / DAY);
    const weekly = days > 45;
    const buckets = new Map<string, { label: string; date: number; value: number; count: number }>();
    const keyOf = (t: number) => {
      const d = startOfDay(new Date(t));
      if (!weekly) return d;
      return addDays(d, -((d.getDay() + 6) % 7));
    };
    for (let t = p.from; t <= p.to; t += weekly ? 7 * DAY : DAY) {
      const d = keyOf(t);
      buckets.set(ymd(d), { label: ymd(d), date: d.getTime(), value: 0, count: 0 });
    }
    const totals = this.stats.totals();
    for (const o of this.closed(p, branches)) {
      const b = buckets.get(ymd(keyOf(Date.parse(o.closedAt!))));
      if (!b) continue;
      b.value += totals.get(o.id)?.total ?? 0;
      b.count++;
    }
    return [...buckets.values()].sort((a, b) => a.date - b.date);
  }

  /** Середнє завантаження постів по днях тижня (Пн–Сб), % робочого часу */
  heatmap(p: Period, branches: string[] | null): { posts: string[]; days: string[]; cells: [number, number, number][] } {
    const posts = this.db.posts.items().filter((x) => x.active && (!branches || branches.includes(x.branchId)));
    const dayNames = L(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const busy = new Map<string, number>();
    for (const o of this.db.orders.items()) {
      if (o.status === 'skasovano' || !o.postId || !o.start) continue;
      const t = Date.parse(o.start);
      if (t < p.from || t > p.to) continue;
      const dow = (new Date(t).getDay() + 6) % 7;
      if (dow > 5) continue;
      const k = `${o.postId}|${dow}`;
      busy.set(k, (busy.get(k) ?? 0) + o.durationMin);
    }
    // скільки разів кожен день тижня трапився в періоді
    const occurs = [0, 0, 0, 0, 0, 0, 0];
    for (let t = startOfDay(new Date(p.from)).getTime(); t <= p.to; t += DAY) occurs[(new Date(t).getDay() + 6) % 7]++;
    const cells: [number, number, number][] = [];
    posts.forEach((post, pi) => {
      const b = this.db.branches.get(post.branchId);
      const minutes = b ? toMin(b.closesAt) - toMin(b.opensAt) : 600;
      for (let d = 0; d < 6; d++) {
        const cap = minutes * Math.max(1, occurs[d]);
        cells.push([d, pi, Math.min(100, Math.round(((busy.get(`${post.id}|${d}`) ?? 0) / cap) * 100))]);
      }
    });
    const multi = !branches || branches.length > 1;
    return { posts: posts.map((x) => (multi ? `${x.name} (${this.db.branches.get(x.branchId)?.name.replace(`${BRAND} `, '').slice(0, 3)}.)` : x.name)), days: dayNames, cells };
  }

  top(p: Period, branches: string[] | null, kind: 'works' | 'parts', n = 7): { name: string; value: number; count: number }[] {
    const m = new Map<string, { name: string; value: number; count: number }>();
    for (const o of this.closed(p, branches)) {
      const lines = kind === 'works' ? o.works.filter((w) => w.decision !== 'declined').map((w) => ({ name: w.name, v: workPrice(w) })) : o.parts.filter((x) => x.decision !== 'declined').map((x) => ({ name: x.name, v: partPrice(x) }));
      for (const l of lines) {
        const cur = m.get(l.name) ?? { name: l.name, value: 0, count: 0 };
        cur.value += l.v;
        cur.count++;
        m.set(l.name, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, n);
  }

  byBranch(p: Period): { branch: string; id: string; revenue: number; orders: number; avgCheck: number }[] {
    return this.db.branches.items().map((b) => {
      const k = this.kpis(p, [b.id]);
      return { branch: b.name, id: b.id, revenue: k.revenue, orders: k.orders, avgCheck: k.avgCheck };
    });
  }
}
