import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { Order, OrderStatus } from '../../core/data/models';
import { OrdersService } from '../../core/domain/orders.service';
import { STATUS_LABEL, canMove } from '../../core/domain/order-math';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { L } from '../../core/i18n';

/**
 * Зміна статусу з інтерфейсу (канбан, сторінка наряду, табло): перевірка переходу,
 * попередження з підтвердженням, підказки наступного кроку (акт прийому, погодження).
 */
@Injectable({ providedIn: 'root' })
export class StatusMove {
  private readonly db = inject(DbService);
  private readonly orders = inject(OrdersService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  async move(o: Order, to: OrderStatus): Promise<boolean> {
    const check = canMove(o.status, to);
    if (!check.ok) {
      if (check.reason) this.toast.error(check.reason);
      return false;
    }
    const warn = this.orders.warnings(o, to);
    if (warn.length || to === 'skasovano') {
      const ok = await this.dialogs.confirm({
        title: to === 'skasovano' ? L(`Скасувати наряд ${o.number}?`, `Cancel work order ${o.number}?`) : L(`Перевести ${o.number} у «${STATUS_LABEL[to]}»?`, `Move ${o.number} to “${STATUS_LABEL[to]}”?`),
        text: warn.join(' ') || L('Резерви запчастин буде знято.', 'Part reservations will be released.'),
        confirm: to === 'skasovano' ? L('Скасувати наряд', 'Cancel work order') : L(`Так, у «${STATUS_LABEL[to]}»`, `Yes, move to “${STATUS_LABEL[to]}”`),
        cancel: L('Не змінювати', 'Keep as is'),
        danger: to === 'skasovano',
      });
      if (!ok) return false;
    }
    try {
      const prev = o.status;
      await this.orders.setStatus(this.db.orders.get(o.id) ?? o, to);
      const undo = { label: L('Скасувати', 'Undo'), run: () => this.revert(o.id, prev) };
      if (to === 'pryiom' && !o.intake)
        this.toast.info(L(`${o.number}: прийом. Заповніть акт прийому`, `${o.number}: intake. Fill in the intake report`), { label: L('Відкрити акт', 'Open report'), run: () => void this.router.navigate(['/naryady', o.id, 'pryiom']) });
      else if (to === 'pogodzhennia' && !o.approvalId)
        this.toast.info(L(`${o.number}: додайте рекомендації й надішліть клієнту`, `${o.number}: add recommendations and send them to the customer`), { label: L('Відкрити', 'Open'), run: () => void this.router.navigate(['/naryady', o.id], { fragment: 'pogodzhennia' }) });
      else this.toast.success(`${o.number}: ${STATUS_LABEL[to]}`, canMove(to, prev).ok ? undo : undefined);
      return true;
    } catch (e) {
      this.toast.error(e);
      return false;
    }
  }

  private async revert(id: string, prev: OrderStatus): Promise<void> {
    const o = this.db.orders.get(id);
    if (o) await this.orders.setStatus(o, prev);
  }
}
