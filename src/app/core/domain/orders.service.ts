import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { ORDER_PREFIX, Order, OrderPart, OrderStatus, OrderWork, Part, PayMethod, TAG_DISCOUNT, Work } from '../data/models';
import { fmtMoney } from '../../shared/format';
import { newId, nowIso } from '../data/util';
import { STATUS_FLOW, STATUS_LABEL, canMove, orderTotals } from './order-math';
import { StockService } from './stock.service';
import { L } from '../i18n';

export interface NewOrder {
  branchId: string;
  clientId: string;
  carId: string;
  postId: string | null;
  start: string | null;
  durationMin: number;
  mechanicId: string | null;
  complaint: string;
  workIds: string[];
}

/**
 * Життєвий цикл наряду: створення, переходи статусів з історією, рядки робіт і запчастин
 * (резерв → видача зі складу → повернення в резерв при скасуванні), оплати й закриття.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly db = inject(DbService);
  private readonly stock = inject(StockService);

  private me(): string {
    return L('Адміністратор', 'Administrator');
  }

  /** Ставка: пост (якщо задана) або категорія роботи з налаштувань */
  rateFor(work: Pick<Work, 'categoryId'> | null, postId: string | null): number {
    const post = this.db.posts.get(postId);
    if (post?.rate) return post.rate;
    const cats = this.db.settings()?.categories ?? [];
    return cats.find((c) => c.id === work?.categoryId)?.rate ?? cats[0]?.rate ?? 900;
  }

  nextNumber(): string {
    const max = this.db.orders.items().reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, '')) || 0), 1000);
    return `${ORDER_PREFIX}${max + 1}`;
  }

  workLine(w: Work, postId: string | null, mechanicId: string | null, extra: Partial<OrderWork> = {}): OrderWork {
    return {
      id: newId('w'),
      workId: w.id,
      name: w.name,
      hours: w.hours,
      rate: this.rateFor(w, postId),
      mechanicId,
      state: 'todo',
      actualMin: 0,
      runningSince: null,
      needsApproval: false,
      priority: 'must',
      decision: null,
      photos: [],
      ...extra,
    };
  }

  async create(n: NewOrder): Promise<Order> {
    const works = n.workIds.map((id) => this.db.works.get(id)).filter((w): w is Work => !!w);
    const car = this.db.cars.get(n.carId);
    const client = this.db.clients.get(n.clientId);
    const now = nowIso();
    const number = this.nextNumber();
    return this.db.orders.create(
      {
        number,
        branchId: n.branchId,
        clientId: n.clientId,
        carId: n.carId,
        status: 'zapys',
        postId: n.postId,
        start: n.start,
        durationMin: n.durationMin,
        mechanicId: n.mechanicId,
        complaint: n.complaint,
        mileage: null,
        works: works.map((w) => this.workLine(w, n.postId, n.mechanicId)),
        parts: [],
        discountPct: client?.tags.includes(TAG_DISCOUNT) ? 5 : client?.kind === 'company' ? 3 : 0,
        payments: [],
        history: [{ from: null, to: 'zapys', at: now, by: this.me() }],
        intake: null,
        approvalId: null,
        closedAt: null,
        notes: '',
      },
      { log: L(`Новий наряд ${number}`, `New work order ${number}`) + (car ? ` — ${car.make} ${car.model}` : '') },
    );
  }

  /** Попередження перед переходом (не блокують, але просять підтвердження) */
  warnings(o: Order, to: OrderStatus): string[] {
    const w: string[] = [];
    const t = orderTotals(o);
    if (to === 'vydano' && t.debt > 0) w.push(L(`Наряд не сплачено повністю: борг ${fmtMoney(t.debt)} залишиться за клієнтом.`, `The work order isn’t fully paid: ${fmtMoney(t.debt)} will stay on the customer’s balance.`));
    if (to === 'vydano' && o.works.some((x) => x.decision !== 'declined' && x.state !== 'done')) w.push(L('Не всі роботи позначено виконаними.', 'Not all jobs are marked as done.'));
    if ((to === 'v_roboti' || to === 'kontrol') && o.works.some((x) => x.needsApproval && x.decision === null))
      w.push(L('Клієнт ще не відповів на погодження — непогоджені роботи не виконуйте.', 'The customer hasn’t answered the approval request yet — don’t do unapproved work.'));
    if (to === 'v_roboti' && !o.intake) w.push(L('Акт прийому не заповнено.', 'The intake report isn’t filled in.'));
    if (to === 'skasovano' && o.parts.some((p) => p.issued)) w.push(L('Видані запчастини повернуться на склад.', 'Issued parts will go back to stock.'));
    return w;
  }

  async setStatus(o: Order, to: OrderStatus): Promise<Order> {
    const check = canMove(o.status, to);
    if (!check.ok) throw new Error(check.reason ?? L('Такий перехід неможливий', 'This status change isn’t possible'));
    const now = nowIso();
    let parts = o.parts;
    let works = o.works;

    // склад: видача в роботу, повернення при скасуванні/відкаті
    if (STATUS_FLOW.indexOf(to) >= STATUS_FLOW.indexOf('v_roboti') && to !== 'skasovano') {
      parts = await this.stock.issueParts(o, parts);
    }
    if (to === 'skasovano') parts = await this.stock.releaseParts(o, parts, true);
    if (to === 'zapys' && o.status === 'skasovano') parts = parts.map((p) => ({ ...p, reserved: false, issued: false }));
    if (STATUS_FLOW.indexOf(to) >= STATUS_FLOW.indexOf('pryiom') && o.status === 'zapys') parts = await this.stock.reserveParts(o, parts);
    // контроль якості й далі — роботи, що виконуються, ставимо на паузу
    if (to === 'kontrol' || to === 'gotovo' || to === 'vydano') {
      works = works.map((w) => (w.runningSince ? { ...w, state: 'paused', actualMin: w.actualMin + Math.round((Date.now() - Date.parse(w.runningSince)) / 60000), runningSince: null } : w));
    }

    const patch: Partial<Order> = {
      status: to,
      parts,
      works,
      history: [...o.history, { from: o.status, to, at: now, by: this.me() }],
      closedAt: to === 'vydano' ? now : to === 'skasovano' ? null : o.closedAt,
    };
    const next = await this.db.orders.update(o.id, patch, { action: 'status', log: `${o.number}: ${STATUS_LABEL[o.status]} → ${STATUS_LABEL[to]}` });
    if (to === 'vydano' && o.mileage) {
      const car = this.db.cars.get(o.carId);
      if (car && o.mileage > car.mileage) await this.db.cars.update(car.id, { mileage: o.mileage }, { log: false });
    }
    return next;
  }

  async patch(o: Order, patch: Partial<Order>, log: string | false): Promise<Order> {
    return this.db.orders.update(o.id, patch, { log });
  }

  async addWork(o: Order, w: Work): Promise<void> {
    await this.patch(o, { works: [...o.works, this.workLine(w, o.postId, o.mechanicId)] }, L(`${o.number}: додано роботу «${w.name}»`, `${o.number}: added job “${w.name}”`));
  }

  async addCustomWork(o: Order, name: string, hours: number): Promise<void> {
    const line: OrderWork = { ...this.workLine({ id: '', categoryId: '' } as Work, o.postId, o.mechanicId), workId: null, name, hours };
    await this.patch(o, { works: [...o.works, line] }, L(`${o.number}: додано роботу «${name}»`, `${o.number}: added job “${name}”`));
  }

  async addPart(o: Order, p: Part, qty: number): Promise<void> {
    let line: OrderPart = {
      id: newId('p'),
      partId: p.id,
      sku: p.sku,
      name: `${p.brand} ${p.name}`,
      qty,
      price: p.price,
      reserved: false,
      issued: false,
      needsApproval: false,
      decision: null,
    };
    // з моменту прийому запчастини одразу резервуються; у роботі — видаються
    if (o.status !== 'zapys') [line] = await this.stock.reserveParts(o, [line]);
    if (STATUS_FLOW.indexOf(o.status) >= STATUS_FLOW.indexOf('v_roboti')) [line] = await this.stock.issueParts(o, [line]);
    await this.patch(this.db.orders.get(o.id) ?? o, { parts: [...(this.db.orders.get(o.id) ?? o).parts, line] }, L(`${o.number}: додано ${p.brand} ${p.sku} × ${qty}`, `${o.number}: added ${p.brand} ${p.sku} × ${qty}`));
  }

  async removeLine(o: Order, kind: 'work' | 'part', id: string): Promise<void> {
    if (kind === 'work') {
      const w = o.works.find((x) => x.id === id);
      await this.patch(o, { works: o.works.filter((x) => x.id !== id) }, L(`${o.number}: прибрано роботу «${w?.name}»`, `${o.number}: removed job “${w?.name}”`));
    } else {
      const line = o.parts.find((x) => x.id === id);
      if (line) await this.stock.releaseParts(o, [line], true);
      await this.patch(this.db.orders.get(o.id) ?? o, { parts: (this.db.orders.get(o.id) ?? o).parts.filter((x) => x.id !== id) }, L(`${o.number}: прибрано «${line?.name}»`, `${o.number}: removed “${line?.name}”`));
    }
  }

  async addPayment(o: Order, method: PayMethod, amount: number): Promise<void> {
    const pay = { id: newId('pay'), method, amount: Math.round(amount), at: nowIso() };
    await this.patch(o, { payments: [...o.payments, pay] }, L(`${o.number}: оплата ${fmtMoney(pay.amount)}`, `${o.number}: payment ${fmtMoney(pay.amount)}`));
  }

  async remove(o: Order): Promise<() => Promise<void>> {
    if (o.parts.some((p) => p.reserved || p.issued)) await this.stock.releaseParts(o, o.parts, true);
    const appr = this.db.approvals.items().filter((a) => a.orderId === o.id);
    const removedAppr = await this.db.approvals.removeMany(appr.map((a) => a.id));
    const removed = await this.db.orders.remove(o.id, { log: L(`Видалено наряд ${o.number}`, `Work order ${o.number} deleted`) });
    return async () => {
      if (removed) await this.db.orders.restore(removed, { log: L(`Відновлено наряд ${o.number}`, `Work order ${o.number} restored`) });
      await this.db.approvals.restoreMany(removedAppr);
    };
  }
}
