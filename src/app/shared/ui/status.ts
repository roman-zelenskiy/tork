import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OrderStatus } from '../../core/data/models';
import { STATUS_LABEL } from '../../core/domain/order-math';

/** CSS-змінні кольорів статусу (див. --s-* у styles.css) */
export const STATUS_VAR: Record<OrderStatus, string> = {
  zapys: 'zapys',
  pryiom: 'pryiom',
  diagnostyka: 'diag',
  pogodzhennia: 'pog',
  v_roboti: 'work',
  kontrol: 'qc',
  gotovo: 'ready',
  vydano: 'done',
  skasovano: 'cancel',
};
export const statusColor = (s: OrderStatus) => `var(--s-${STATUS_VAR[s]})`;
export const statusBg = (s: OrderStatus) => `var(--s-${STATUS_VAR[s]}-bg)`;

/** Пастельний бейдж статусу наряду */
@Component({
  selector: 'tk-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span class="badge" [style.background]="bg()" [style.color]="fg()">
      <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>{{ label() }}
    </span>
  `,
})
export class StatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
  protected readonly fg = computed(() => statusColor(this.status()));
  protected readonly bg = computed(() => statusBg(this.status()));
}
