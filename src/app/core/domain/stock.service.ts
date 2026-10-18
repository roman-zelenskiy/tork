import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Order, OrderPart, PURCHASE_PREFIX, Part, StockMovement } from '../data/models';
import { newId, nowIso } from '../data/util';
import { L, unitLabel } from '../i18n';

/**
 * Склад по філіях: доступно = залишок − резерв. Резерв під наряд, видача (списання),
 * повернення, надходження, переміщення. Кожна дія — запис у журнал рухів.
 * Після списання перевіряємо мінімальний залишок: сповіщення + чернетка замовлення постачальнику.
 */
@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly db = inject(DbService);

  available(p: Part, branchId: string): number {
    return (p.stock[branchId] ?? 0) - (p.reserved[branchId] ?? 0);
  }

  isLow(p: Part, branchId: string): boolean {
    return this.available(p, branchId) <= p.minStock;
  }

  private mv(partId: string, type: StockMovement['type'], qty: number, branchId: string, orderId: string | null, note: string, toBranchId: string | null = null): StockMovement {
    const now = nowIso();
    return { id: newId('mv'), createdAt: now, updatedAt: now, partId, type, qty, branchId, toBranchId, orderId, note };
  }

  private async commit(parts: Map<string, Part>, moves: StockMovement[]): Promise<void> {
    if (!moves.length) return;
    const now = nowIso();
    this.db.parts.replaceAll(this.db.parts.items().map((p) => (parts.has(p.id) ? { ...parts.get(p.id)!, updatedAt: now } : p)));
    this.db.movements.replaceAll([...moves, ...this.db.movements.items()]);
  }

  /** Резервує доступні запчастини; якщо не вистачає — рядок лишається без резерву */
  async reserveParts(o: Order, lines: OrderPart[]): Promise<OrderPart[]> {
    const touched = new Map<string, Part>();
    const moves: StockMovement[] = [];
    const out = lines.map((l) => {
      if (l.reserved || l.issued || !l.partId || l.decision === 'declined') return l;
      const p = touched.get(l.partId) ?? this.db.parts.get(l.partId);
      if (!p || this.available(p, o.branchId) < l.qty) return l;
      const next = { ...p, reserved: { ...p.reserved, [o.branchId]: (p.reserved[o.branchId] ?? 0) + l.qty } };
      touched.set(p.id, next);
      moves.push(this.mv(p.id, 'reserve', l.qty, o.branchId, o.id, L(`Резерв під наряд ${o.number}`, `Reserved for ${o.number}`)));
      return { ...l, reserved: true };
    });
    await this.commit(touched, moves);
    return out;
  }

  /** Видача в роботу: списання з залишку й резерву */
  async issueParts(o: Order, lines: OrderPart[]): Promise<OrderPart[]> {
    const touched = new Map<string, Part>();
    const moves: StockMovement[] = [];
    const out = lines.map((l) => {
      if (l.issued || !l.partId || l.decision === 'declined') return l;
      const p = touched.get(l.partId) ?? this.db.parts.get(l.partId);
      if (!p) return l;
      const stock = p.stock[o.branchId] ?? 0;
      if (!l.reserved && this.available(p, o.branchId) < l.qty) return l;
      const next = {
        ...p,
        stock: { ...p.stock, [o.branchId]: Math.max(0, stock - l.qty) },
        reserved: { ...p.reserved, [o.branchId]: Math.max(0, (p.reserved[o.branchId] ?? 0) - (l.reserved ? l.qty : 0)) },
      };
      touched.set(p.id, next);
      moves.push(this.mv(p.id, 'out', l.qty, o.branchId, o.id, L(`Видано в наряд ${o.number}`, `Issued to ${o.number}`)));
      return { ...l, reserved: false, issued: true };
    });
    await this.commit(touched, moves);
    await this.checkLow([...touched.values()], o.branchId);
    return out;
  }

  /** Знімає резерв; withIssued — повертає й видані запчастини на склад */
  async releaseParts(o: Order, lines: OrderPart[], withIssued: boolean): Promise<OrderPart[]> {
    const touched = new Map<string, Part>();
    const moves: StockMovement[] = [];
    const out = lines.map((l) => {
      if (!l.partId || (!l.reserved && !(withIssued && l.issued))) return l;
      const p = touched.get(l.partId) ?? this.db.parts.get(l.partId);
      if (!p) return { ...l, reserved: false };
      let next = p;
      if (l.reserved) {
        next = { ...next, reserved: { ...next.reserved, [o.branchId]: Math.max(0, (next.reserved[o.branchId] ?? 0) - l.qty) } };
        moves.push(this.mv(p.id, 'release', l.qty, o.branchId, o.id, L(`Знято резерв: ${o.number}`, `Reservation released: ${o.number}`)));
      }
      if (withIssued && l.issued) {
        next = { ...next, stock: { ...next.stock, [o.branchId]: (next.stock[o.branchId] ?? 0) + l.qty } };
        moves.push(this.mv(p.id, 'in', l.qty, o.branchId, o.id, L(`Повернення з наряду ${o.number}`, `Returned from ${o.number}`)));
      }
      touched.set(p.id, next);
      return { ...l, reserved: false, issued: withIssued ? false : l.issued };
    });
    await this.commit(touched, moves);
    return out;
  }

  /** Надходження, списання, переміщення між філіями (ручні операції складу) */
  async move(part: Part, type: 'in' | 'writeoff' | 'transfer', qty: number, branchId: string, note: string, toBranchId: string | null = null): Promise<void> {
    const p = this.db.parts.get(part.id) ?? part;
    const stock = { ...p.stock };
    if (type === 'in') stock[branchId] = (stock[branchId] ?? 0) + qty;
    else {
      if (this.available(p, branchId) < qty) throw new Error(L(`Доступно лише ${this.available(p, branchId)} ${p.unit} — решта в резерві або відсутня`, `Only ${this.available(p, branchId)} ${unitLabel(p.unit)} available — the rest is reserved or out of stock`));
      stock[branchId] = (stock[branchId] ?? 0) - qty;
      if (type === 'transfer' && toBranchId) stock[toBranchId] = (stock[toBranchId] ?? 0) + qty;
    }
    const next: Part = { ...p, stock };
    await this.commit(new Map([[p.id, next]]), [this.mv(p.id, type, qty, branchId, null, note, toBranchId)]);
    const label = type === 'in' ? L('Надходження', 'Receipt') : type === 'writeoff' ? L('Списання', 'Write-off') : L('Переміщення', 'Transfer');
    this.db.log('parts', p.id, 'stock', `${label}: ${p.brand} ${p.sku} × ${qty}`);
    if (type !== 'in') await this.checkLow([next], branchId);
  }

  /** Низький залишок → сповіщення й автоматична чернетка замовлення постачальнику */
  async checkLow(parts: Part[], branchId: string): Promise<void> {
    const low = parts.filter((p) => this.isLow(p, branchId));
    if (!low.length) return;
    const branch = this.db.branches.get(branchId)?.name ?? '';
    for (const p of low) {
      const supplierId = p.supplierId;
      if (!supplierId) continue;
      const qty = Math.max(p.minStock * 2 - this.available(p, branchId), 1);
      const draft = this.db.purchases.items().find((x) => x.status === 'draft' && x.auto && x.supplierId === supplierId && x.branchId === branchId);
      if (draft) {
        if (draft.lines.some((l) => l.partId === p.id)) continue;
        await this.db.purchases.update(draft.id, { lines: [...draft.lines, { partId: p.id, qty, cost: p.cost }] }, { log: false });
      } else {
        const n = this.db.purchases.items().reduce((m, x) => Math.max(m, Number(x.number.replace(/\D/g, '')) || 0), 100) + 1;
        await this.db.purchases.create(
          { number: `${PURCHASE_PREFIX}${n}`, supplierId, branchId, status: 'draft', lines: [{ partId: p.id, qty, cost: p.cost }], auto: true },
          { log: L(`Автоматична чернетка замовлення ЗАМ-${n}`, `Automatic purchase order draft PO-${n}`) },
        );
      }
      const title = L(`Закінчується ${p.brand} ${p.sku}`, `Running low: ${p.brand} ${p.sku}`);
      if (this.db.notifications.items().some((n) => !n.read && n.title === title)) continue;
      await this.db.notify({
        kind: 'stock',
        title,
        text: L(
          `${p.name}: доступно ${this.available(p, branchId)} ${p.unit} (${branch}), мінімум ${p.minStock}. Додано в чернетку замовлення.`,
          `${p.name}: ${this.available(p, branchId)} ${unitLabel(p.unit)} available (${branch}), minimum ${p.minStock}. Added to a purchase order draft.`,
        ),
        link: '/sklad/zakupivli',
      });
    }
  }
}
