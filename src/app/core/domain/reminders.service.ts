import { Injectable, computed, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Car, Channel, Client, MessageTemplate, Reminder, ReminderRule } from '../data/models';
import { formatPlate } from '../data/plates';
import { StatsService } from './stats.service';
import { firstName, renderTemplate } from './messages';
import { fmtDate } from '../../shared/format';
import { appUrlShort } from '../../shared/app-url';

export interface DueItem {
  key: string;
  kind: 'rule' | 'deferred';
  client: Client;
  car: Car;
  title: string;
  ruleId: string | null;
  reminder: Reminder | null;
  dueDate: string | null;
  dueKm: number | null;
  forecastKm: number;
  amount: number;
  overdue: boolean;
  /** Пояснення, чому настав час */
  reason: string;
}

const DAY = 86400000;
const HORIZON_DAYS = 21;

/**
 * Нагадування: правила ТО (пробіг / час / сезон) з прогнозом пробігу
 * і відкладені клієнтом роботи. Обчислюються з історії нарядів.
 */
@Injectable({ providedIn: 'root' })
export class RemindersService {
  private readonly db = inject(DbService);
  private readonly stats = inject(StatsService);

  /** Середній пробіг авто за день (з історії візитів), за замовчуванням ~40 км */
  kmPerDay(car: Car): number {
    const pts = (this.stats.ordersByCar().get(car.id) ?? [])
      .filter((o) => o.mileage && o.status !== 'skasovano')
      .map((o) => [Date.parse(o.start ?? o.createdAt), o.mileage!] as const)
      .sort((a, b) => a[0] - b[0]);
    if (pts.length >= 2) {
      const days = (pts[pts.length - 1][0] - pts[0][0]) / DAY;
      const km = pts[pts.length - 1][1] - pts[0][1];
      if (days > 20 && km > 0) return km / days;
    }
    return 40;
  }

  forecastKm(car: Car, at = Date.now()): number {
    const last = (this.stats.ordersByCar().get(car.id) ?? []).filter((o) => o.mileage).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))[0];
    const base = Math.max(car.mileage, last?.mileage ?? 0);
    const since = last?.start ? Math.max(0, (at - Date.parse(last.start)) / DAY) : 0;
    return Math.round(base + since * this.kmPerDay(car));
  }

  readonly due = computed<DueItem[]>(() => {
    const now = Date.now();
    const out: DueItem[] = [];
    const codeOf = new Map(this.db.works.items().map((w) => [w.id, w.code]));
    const rules = this.db.rules.items().filter((r) => r.active);
    const handled = this.db.reminders.items().filter((r) => r.source === 'rule' && r.status !== 'pending');
    const month = new Date().getMonth() + 1;

    for (const car of this.db.cars.items()) {
      const client = this.db.clients.get(car.clientId);
      if (!client) continue;
      const orders = (this.stats.ordersByCar().get(car.id) ?? []).filter((o) => o.status === 'vydano');
      const forecast = this.forecastKm(car, now);
      for (const rule of rules) {
        const last = orders
          .filter((o) => o.works.some((w) => w.state === 'done' && w.workId && codeOf.get(w.workId) === rule.workCode))
          .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0];
        const lastAt = last?.closedAt ? Date.parse(last.closedAt) : null;
        // уже нагадали/записали після останнього виконання — не повторюємо
        if (handled.some((h) => h.ruleId === rule.id && h.carId === car.id && (!lastAt || Date.parse(h.createdAt) > lastAt))) continue;
        let dueDate: number | null = null;
        let dueKm: number | null = null;
        let reason: string;
        if (rule.seasonMonths.length) {
          const inSeason = rule.seasonMonths.includes(month) || rule.seasonMonths.includes((month % 12) + 1);
          const recent = lastAt && now - lastAt < 120 * DAY;
          if (!inSeason || recent || (!lastAt && !orders.length)) continue;
          if (!lastAt) continue;
          dueDate = now;
          reason = 'Сезон';
        } else {
          if (!lastAt || !last) continue;
          if (rule.everyMonths) dueDate = lastAt + rule.everyMonths * 30.4 * DAY;
          if (rule.everyKm && last.mileage) dueKm = last.mileage + rule.everyKm;
          const byKm = dueKm !== null && forecast >= dueKm - 1500;
          const byDate = dueDate !== null && dueDate <= now + HORIZON_DAYS * DAY;
          if (!byKm && !byDate) continue;
          if (byKm && rule.everyKm) {
            // дата, коли за середнім пробігом авто проїде інтервал від останнього ТО
            const kmDate = lastAt + (rule.everyKm / this.kmPerDay(car)) * DAY;
            dueDate = dueDate ? Math.min(dueDate, kmDate) : kmDate;
          }
          reason = byKm ? `Пробіг ~${forecast.toLocaleString('uk-UA')} км із ${dueKm!.toLocaleString('uk-UA')}` : `Минуло ${rule.everyMonths} міс.`;
        }
        out.push({
          key: `${rule.id}|${car.id}`,
          kind: 'rule',
          client,
          car,
          title: rule.name,
          ruleId: rule.id,
          reminder: null,
          dueDate: dueDate ? new Date(dueDate).toISOString().slice(0, 10) : null,
          dueKm,
          forecastKm: forecast,
          amount: 0,
          overdue: !!dueDate && dueDate < now,
          reason,
        });
      }
    }
    for (const r of this.db.reminders.items()) {
      if (r.source !== 'deferred' || r.status !== 'pending') continue;
      const client = this.db.clients.get(r.clientId);
      const car = this.db.cars.get(r.carId);
      if (!client || !car) continue;
      out.push({
        key: r.id,
        kind: 'deferred',
        client,
        car,
        title: r.title,
        ruleId: null,
        reminder: r,
        dueDate: r.dueDate,
        dueKm: r.dueMileage,
        forecastKm: this.forecastKm(car, now),
        amount: r.amount,
        overdue: !!r.dueDate && Date.parse(r.dueDate) < now,
        reason: `Відмова в наряді ${this.db.orders.get(r.orderId)?.number ?? ''}`.trim(),
      });
    }
    return out.sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
  });

  render(tpl: MessageTemplate | { text: string }, item: Pick<DueItem, 'client' | 'car' | 'title' | 'dueDate'>): string {
    return renderTemplate(tpl.text, {
      name: firstName(item.client.name),
      car: `${item.car.make} ${item.car.model}`,
      plate: formatPlate(item.car.plate),
      work: item.title.toLowerCase(),
      date: item.dueDate ? fmtDate(item.dueDate) : '',
      link: appUrlShort('zapys'),
      service: this.db.settings()?.serviceName,
    });
  }

  /** Розсилка: запис в історію + статус «надіслано» для кожного нагадування */
  async send(items: DueItem[], tpl: MessageTemplate | null, text: string, channel: Channel, title: string): Promise<number> {
    const ok = items.filter((i) => i.client.allowMessages);
    const recipients = ok.map((i) => ({ clientId: i.client.id, carId: i.car.id, phone: i.client.phone, text: this.render({ text }, i) }));
    await this.db.mailings.create({ templateId: tpl?.id ?? null, channel, title, recipients }, { action: 'message', log: `Розсилка «${title}»: ${recipients.length} отримувачів` });
    for (const i of ok) await this.mark(i, 'sent');
    return recipients.length;
  }

  async mark(i: DueItem, status: Reminder['status']): Promise<void> {
    if (i.reminder) {
      await this.db.reminders.update(i.reminder.id, { status }, { log: false });
      return;
    }
    await this.db.reminders.create(
      { source: 'rule', clientId: i.client.id, carId: i.car.id, title: i.title, amount: 0, orderId: null, ruleId: i.ruleId, dueDate: i.dueDate, dueMileage: i.dueKm, status },
      { log: false },
    );
  }

  ruleText(r: ReminderRule): string {
    const parts: string[] = [];
    if (r.everyKm) parts.push(`кожні ${r.everyKm.toLocaleString('uk-UA')} км`);
    if (r.everyMonths) parts.push(`${r.everyKm ? 'або ' : 'кожні '}${r.everyMonths} міс.`);
    if (r.seasonMonths.length) parts.push(`сезон: ${r.seasonMonths.map((m) => MONTHS[m - 1]).join(', ')}`);
    return parts.join(' ') || 'без умов';
  }
}

export const MONTHS = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];
