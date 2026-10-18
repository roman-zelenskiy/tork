import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Icon } from '../ui/icon';
import { I } from '../icons';
import { L } from '../../core/i18n';

export interface TableView {
  head: string[];
  rows: (string | number)[][];
}

/** Картка графіка з перемикачем «Графік / Таблиця» — дані доступні без кольору й миші */
@Component({
  selector: 'tk-chart-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex min-w-0 flex-col p-4' },
  template: `
    <div class="mb-3 flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h2 class="m-0 text-[15px] font-semibold">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="m-0 mt-0.5 text-xs text-ink-3">{{ subtitle() }}</p>
        }
      </div>
      @if (table()) {
        <button type="button" class="btn btn-ghost btn-sm" [attr.aria-pressed]="asTable()" (click)="asTable.set(!asTable())">
          <svg [lucideIcon]="asTable() ? I.activity : I.list" aria-hidden="true"></svg>{{ asTable() ? L('Графік', 'Chart') : L('Таблиця', 'Table') }}
        </button>
      }
    </div>
    @if (asTable() && table(); as t) {
      <div class="max-h-[320px] overflow-auto rounded-lg border border-line">
        <table class="tbl">
          <thead><tr>@for (h of t.head; track $index) {<th [class.text-right]="$index > 0">{{ h }}</th>}</tr></thead>
          <tbody>
            @for (r of t.rows; track $index) {
              <tr>@for (c of r; track $index) {<td [class.text-right]="$index > 0" [class.num]="$index > 0">{{ c }}</td>}</tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class ChartCard {
  protected readonly L = L;
  protected readonly I = I;
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly table = input<TableView | null>(null);
  protected readonly asTable = signal(false);
}
