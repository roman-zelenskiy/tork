import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Approval, ApprovalItem, Decision, Order, OrderWork, Priority, Work } from '../data/models';
import { formatPlate } from '../data/plates';
import { newId, nowIso } from '../data/util';
import { OrdersService } from './orders.service';
import { StockService } from './stock.service';
import { canMove, partPrice, workPrice } from './order-math';
import { firstName, renderTemplate } from './messages';
import { appUrl } from '../../shared/app-url';

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: 'Обов’язково',
  recommended: 'Рекомендовано',
  later: 'Можна відкласти',
};

function token(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => abc[x % abc.length]).join('');
}

/**
 * Погодження робіт клієнтом: рекомендації після діагностики → посилання клієнту →
 * відповідь (з іншої вкладки) оновлює наряд, відмови стають відкладеними роботами-нагадуваннями.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private readonly db = inject(DbService);
  private readonly orders = inject(OrdersService);
  private readonly stock = inject(StockService);

  link(a: Pick<Approval, 'token'>): string {
    return appUrl(`pogodzhennia/${a.token}`);
  }

  /** Рядки наряду, які чекають рішення клієнта */
  pending(o: Order) {
    return {
      works: o.works.filter((w) => w.needsApproval && w.decision === null),
      parts: o.parts.filter((p) => p.needsApproval && p.decision === null),
    };
  }

  async addRecommendation(
    o: Order,
    r: { work: Work | null; name: string; hours: number; priority: Priority; description: string; photos: string[]; partId: string | null },
  ): Promise<void> {
    const line: OrderWork = {
      ...this.orders.workLine(r.work ?? ({ id: '', categoryId: '' } as Work), o.postId, o.mechanicId),
      workId: r.work?.id ?? null,
      name: r.name,
      hours: r.hours,
      needsApproval: true,
      priority: r.priority,
      decision: null,
      photos: r.photos,
      note: r.description,
    };
    const parts = [...o.parts];
    const p = this.db.parts.get(r.partId);
    if (p) {
      parts.push({ id: newId('p'), partId: p.id, sku: p.sku, name: `${p.brand} ${p.name}`, qty: 1, price: p.price, reserved: false, issued: false, needsApproval: true, decision: null });
    }
    await this.db.orders.update(
      o.id,
      { works: [...o.works, line], parts },
      { log: `${o.number}: рекомендація «${r.name}» (${PRIORITY_LABEL[r.priority].toLowerCase()})` },
    );
  }

  async send(o: Order, message: string, channel: 'sms' | 'viber'): Promise<Approval> {
    const { works, parts } = this.pending(o);
    if (!works.length && !parts.length) throw new Error('Немає рекомендацій, що чекають погодження');
    const prev = this.db.approvals.get(o.approvalId);
    const items: ApprovalItem[] = [
      ...works.map((w) => ({
        lineId: w.id,
        kind: 'work' as const,
        title: w.name,
        description: w.note ?? prev?.items.find((i) => i.lineId === w.id)?.description ?? '',
        priority: w.priority,
        price: workPrice(w),
        photos: w.photos,
        decision: null,
      })),
      ...parts.map((p) => ({ lineId: p.id, kind: 'part' as const, title: p.name, description: p.sku, priority: 'must' as Priority, price: partPrice(p), photos: [], decision: null })),
    ];
    // попереднє непідтверджене погодження скасовується — діє лише останнє посилання
    if (prev && prev.status === 'sent') await this.db.approvals.update(prev.id, { status: 'cancelled' }, { log: false });
    const a = await this.db.approvals.create(
      { token: token(), orderId: o.id, status: 'sent', items, message, sentAt: nowIso(), answeredAt: null, clientComment: '' },
      { action: 'message', log: `${o.number}: надіслано погодження (${items.length} поз.)` },
    );
    await this.db.orders.update(o.id, { approvalId: a.id }, { log: false });
    const cur = this.db.orders.get(o.id)!;
    if (cur.status !== 'pogodzhennia' && canMove(cur.status, 'pogodzhennia').ok && ['pryiom', 'diagnostyka'].includes(cur.status))
      await this.orders.setStatus(cur, 'pogodzhennia');
    const client = this.db.clients.get(o.clientId);
    if (client) {
      await this.db.mailings.create(
        { templateId: null, channel, title: `Погодження ${o.number}`, recipients: [{ clientId: client.id, carId: o.carId, phone: client.phone, text: message }] },
        { log: false },
      );
    }
    return a;
  }

  defaultMessage(o: Order): string {
    const client = this.db.clients.get(o.clientId);
    const car = this.db.cars.get(o.carId);
    const tpl = this.db.templates.items().find((t) => t.name.toLowerCase().includes('погодж'))?.text ?? '{ім’я}, перегляньте рекомендації для {авто}: {посилання}';
    return renderTemplate(tpl, {
      name: client ? firstName(client.name) : '',
      car: car ? `${car.make} ${car.model}` : '',
      plate: car ? formatPlate(car.plate) : '',
      service: this.db.settings()?.serviceName,
      link: '{посилання}',
    });
  }

  /** Відповідь клієнта зі сторінки погодження */
  async answer(a: Approval, decisions: Record<string, Exclude<Decision, null>>, comment: string): Promise<void> {
    const fresh = this.db.approvals.get(a.id);
    if (!fresh || fresh.status !== 'sent') throw new Error('Це погодження вже неактуальне — сервіс надіслав нове або скасував його.');
    const now = nowIso();
    await this.db.approvals.update(a.id, { status: 'answered', answeredAt: now, clientComment: comment.trim(), items: fresh.items.map((i) => ({ ...i, decision: decisions[i.lineId] ?? 'declined' })) }, { log: false });

    const o = this.db.orders.get(a.orderId);
    if (!o) return;
    const dec = (id: string): Decision => decisions[id] ?? (fresh.items.some((i) => i.lineId === id) ? 'declined' : null);
    let parts = o.parts.map((p) => (fresh.items.some((i) => i.lineId === p.id) ? { ...p, decision: dec(p.id) } : p));
    // запчастини, прив’язані до відхилених робіт (додані разом з рекомендацією), теж відхиляються
    const declinedWorks = o.works.filter((w) => fresh.items.some((i) => i.lineId === w.id) && dec(w.id) === 'declined');
    const works = o.works.map((w) => (fresh.items.some((i) => i.lineId === w.id) ? { ...w, decision: dec(w.id) } : w));
    if (o.status !== 'zapys') parts = await this.stock.reserveParts(o, parts);
    const approvedSum = fresh.items.filter((i) => decisions[i.lineId] === 'approved').reduce((s, i) => s + i.price, 0);
    await this.db.orders.update(o.id, { works, parts }, { action: 'update', log: `${o.number}: клієнт погодив ${fresh.items.filter((i) => decisions[i.lineId] === 'approved').length} з ${fresh.items.length}` });

    // відмови → відкладені роботи (нагадування)
    for (const w of declinedWorks) {
      const days = w.priority === 'must' ? 7 : w.priority === 'recommended' ? 30 : 90;
      await this.db.reminders.create(
        {
          source: 'deferred',
          clientId: o.clientId,
          carId: o.carId,
          title: w.name,
          amount: workPrice(w),
          orderId: o.id,
          ruleId: null,
          dueDate: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
          dueMileage: null,
          status: 'pending',
        },
        { log: false },
      );
    }
    const client = this.db.clients.get(o.clientId);
    const n = fresh.items.filter((i) => decisions[i.lineId] === 'approved').length;
    await this.db.notify({
      kind: 'approval',
      title: `Відповідь на погодження: ${client?.name ?? 'клієнт'}`,
      text: `${o.number}: погоджено ${n} з ${fresh.items.length} на ${approvedSum.toLocaleString('uk-UA')} ₴${comment.trim() ? `. Коментар: «${comment.trim()}»` : ''}`,
      link: `/naryady/${o.id}`,
    });
  }

  async cancel(a: Approval): Promise<void> {
    await this.db.approvals.update(a.id, { status: 'cancelled' }, { log: 'Погодження скасовано' });
  }

  /** Рішення за клієнта (погодив телефоном) */
  async decideByPhone(o: Order, lineId: string, decision: Exclude<Decision, null>): Promise<void> {
    const works = o.works.map((w) => (w.id === lineId ? { ...w, decision } : w));
    let parts = o.parts.map((p) => (p.id === lineId ? { ...p, decision } : p));
    if (o.status !== 'zapys') parts = await this.stock.reserveParts(o, parts);
    await this.db.orders.update(o.id, { works, parts }, { log: `${o.number}: рішення клієнта телефоном` });
  }
}
