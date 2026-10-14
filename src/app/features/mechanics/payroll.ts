import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DbService } from '../../core/data/db.service';
import { Employee } from '../../core/data/models';
import { MechanicsService } from '../../core/domain/mechanics.service';
import { CellDef, Column, DataTable, FilterDef } from '../../shared/ui/data-table';
import { DateRange, DateRangePicker, PERIOD_PRESETS } from '../../shared/ui/date-picker';
import { Avatar } from '../../shared/ui/display';
import { fmtHours, fmtMoney, fmtPct } from '../../shared/format';
import { MechanicsHeader } from './mechanics-header';

const ROLE: Record<Employee['role'], string> = { mechanic: 'Механік', receptionist: 'Майстер-приймальник', manager: 'Керівник', storekeeper: 'Комірник' };
type Row = Employee & { p: { norm: number; revenue: number; piece: number; base: number; total: number; eff: number | null; branch: string } };

/**
 * Зарплата за період: відсоток від вартості закритих нормо-годин (з урахуванням знижки)
 * + оклад пропорційно днях періоду (30 днів = повний оклад).
 */
@Component({
  selector: 'tk-payroll',
  imports: [DataTable, CellDef, DateRangePicker, Avatar, MechanicsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-mechanics-header title="Зарплата" [subtitle]="db.ready() ? 'Разом до виплати: ' + money(total()) : null">
      <tk-date-range class="w-56" [(value)]="period" />
    </tk-mechanics-header>
    <tk-data-table
      tableId="payroll"
      csvName="zarplata"
      ariaLabel="Зарплата"
      searchPlaceholder="Співробітник…"
      [rows]="rows()"
      [columns]="columns"
      [filters]="filters()"
      [rowId]="rowId"
      [loading]="!db.ready()"
      [defaultSort]="{ key: 'total', dir: 'desc' }"
      emptyArt="clients"
      emptyTitle="Співробітників немає"
    >
      <ng-template tkCell="name" let-r>
        <span class="flex items-center gap-2.5"><tk-avatar [name]="r.name" /><span><span class="block font-medium">{{ r.name }}</span><span class="block text-xs text-ink-3">{{ role(r) }}, {{ r.p.branch }}</span></span></span>
      </ng-template>
      <ng-template tkCell="total" let-r><span class="font-semibold">{{ money(r.p.total) }}</span></ng-template>
    </tk-data-table>
    <p class="mt-3 text-xs text-ink-3">Враховано роботи у виданих нарядах (дата видачі в періоді). Оклад — пропорційно до кількості днів періоду.</p>
  `,
})
export class Payroll {
  protected readonly db = inject(DbService);
  private readonly mech = inject(MechanicsService);
  protected readonly money = fmtMoney;
  protected readonly period = signal<DateRange>(PERIOD_PRESETS[3].range());
  protected readonly rowId = (r: Row) => r.id;

  protected readonly rows = computed<Row[]>(() => {
    const p = this.period();
    const from = Date.parse(p.from);
    const to = Date.parse(p.to) + 86400000 - 1;
    const days = Math.max(1, Math.round((to - from) / 86400000));
    return this.db.employees
      .items()
      .filter((e) => e.active)
      .map((e) => {
        const s = e.role === 'mechanic' ? this.mech.stats(e.id, from, to) : null;
        const piece = s ? Math.round((s.revenue * e.payPercent) / 100) : 0;
        const base = Math.round((e.baseSalary * Math.min(days, 31)) / 30);
        return { ...e, p: { norm: s?.normHours ?? 0, revenue: s?.revenue ?? 0, piece, base, total: piece + base, eff: s?.efficiency ?? null, branch: this.db.branches.get(e.branchId)?.name.replace('Торк ', '') ?? '' } };
      });
  });
  protected readonly total = computed(() => this.rows().reduce((s, r) => s + r.p.total, 0));

  protected readonly columns: Column<Row>[] = [
    { key: 'name', label: 'Співробітник', value: (r) => r.name, required: true },
    { key: 'norm', label: 'Нормо-год', value: (r) => r.p.norm, format: (r) => (r.role === 'mechanic' ? fmtHours(r.p.norm) : '—'), align: 'right' },
    { key: 'eff', label: 'Ефективність', value: (r) => r.p.eff, format: (r) => (r.p.eff !== null ? fmtPct(r.p.eff) : '—'), align: 'right' },
    { key: 'revenue', label: 'Виручка робіт', value: (r) => r.p.revenue, format: (r) => (r.role === 'mechanic' ? fmtMoney(r.p.revenue) : '—'), align: 'right' },
    { key: 'pct', label: '%', value: (r) => r.payPercent, format: (r) => (r.payPercent ? `${r.payPercent}%` : '—'), align: 'right' },
    { key: 'piece', label: 'Відсоток', value: (r) => r.p.piece, format: (r) => fmtMoney(r.p.piece), align: 'right' },
    { key: 'base', label: 'Оклад', value: (r) => r.p.base, format: (r) => fmtMoney(r.p.base), align: 'right' },
    { key: 'total', label: 'Разом', value: (r) => r.p.total, csv: (r) => r.p.total, align: 'right' },
  ];

  protected readonly filters = computed<FilterDef<Row>[]>(() => [
    { key: 'branch', label: 'Філія', options: this.db.branches.items().map((b) => ({ value: b.id, label: b.name })), match: (r, v) => v.includes(r.branchId) },
    { key: 'role', label: 'Роль', options: (Object.keys(ROLE) as Employee['role'][]).map((k) => ({ value: k, label: ROLE[k] })), match: (r, v) => v.includes(r.role) },
  ]);

  protected role(e: Employee): string {
    return ROLE[e.role];
  }
}
