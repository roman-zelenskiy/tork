import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';
import { DbService } from '../../core/data/db.service';
import { AnalyticsService, Kpis, Period } from '../../core/domain/analytics.service';
import { AppContext } from '../../core/ui/app-context.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { PageHeader, EmptyState } from '../../shared/ui/states';
import { RadioGroup } from '../../shared/ui/checkbox';
import { DateRange, DateRangePicker, PERIOD_PRESETS } from '../../shared/ui/date-picker';
import { Option } from '../../shared/ui/option';
import { Chart, ChartPalette, baseOption } from '../../shared/chart/chart';
import { ChartCard, TableView } from '../../shared/chart/chart-card';
import { fmtDateShort, fmtDayLong, fmtMoney, fmtNum, fmtPct, sameDay } from '../../shared/format';
import { BRAND, L } from '../../core/i18n';

const short = (v: number) =>
  v >= 1_000_000
    ? L(`${(v / 1_000_000).toFixed(1).replace('.', ',')} млн`, `${(v / 1_000_000).toFixed(1)}M`)
    : v >= 1000
      ? L(`${Math.round(v / 1000)} тис`, `${Math.round(v / 1000)}k`)
      : String(Math.round(v));

/** Огляд (стартова сторінка): показники періоду, виручка, завантаження постів, погодження, топи, філії */
@Component({
  selector: 'tk-dashboard',
  imports: [RouterLink, Icon, PageHeader, EmptyState, RadioGroup, DateRangePicker, Chart, ChartCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-page-header [title]="L('Огляд', 'Overview')" [subtitle]="today">
      @if (branchOptions().length > 2) {
        <tk-radio-group variant="segmented" [ariaLabel]="L('Філія', 'Branch')" [options]="branchOptions()" [(value)]="branch" />
      }
      <tk-date-range class="w-56" [(value)]="range" />
    </tk-page-header>

    <!-- сьогодні -->
    <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" [attr.aria-label]="L('Сьогодні', 'Today')">
      @for (t of todayTiles(); track t.label) {
        <a [routerLink]="t.link" class="card group flex items-center gap-3 p-3.5 transition-colors duration-150 hover:border-line-strong">
          <span class="grid size-9 flex-none place-items-center rounded-lg" [style.background]="t.bg" [style.color]="t.fg"><svg [lucideIcon]="t.icon" [size]="18" aria-hidden="true"></svg></span>
          <span class="min-w-0">
            <span class="block text-xs text-ink-2">{{ t.label }}</span>
            @if (db.ready()) {
              <span class="block text-lg leading-tight font-semibold num">{{ t.value }}</span>
            } @else {
              <span class="skeleton mt-1 block h-5 w-10"></span>
            }
          </span>
          <svg [lucideIcon]="I.chevronRight" class="ml-auto text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true"></svg>
        </a>
      }
    </section>

    <!-- показники періоду -->
    <section class="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" [attr.aria-label]="L('Показники за період', 'Period metrics')">
      @for (k of kpiTiles(); track k.label) {
        <div class="card p-4">
          <div class="text-[13px] text-ink-2">{{ k.label }}</div>
          @if (db.ready()) {
            <div class="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.01em] num">{{ k.value }}</div>
            <div class="mt-1 flex items-center gap-1 text-xs" [class]="k.deltaTone">
              @if (k.delta !== null) {
                <svg [lucideIcon]="k.delta >= 0 ? I.trendUp : I.trendDown" [size]="14" aria-hidden="true"></svg>
                <span class="num" [attr.aria-label]="(k.delta >= 0 ? '+' : '') + k.delta + L('% до попереднього періоду', '% vs previous period')">{{ k.delta >= 0 ? '+' : '' }}{{ k.delta }}%</span>
                <span class="hidden text-ink-3 sm:inline">{{ L('до попереднього періоду', 'vs previous period') }}</span>
              } @else {
                <span class="text-ink-3">{{ k.note }}</span>
              }
            </div>
          } @else {
            <div class="skeleton mt-2 h-7 w-32"></div>
            <div class="skeleton mt-2 h-3 w-40"></div>
          }
        </div>
      }
    </section>

    @if (db.ready() && !cur().orders) {
      <div class="card mb-6"><tk-empty art="chart" [title]="L('За цей період виданих нарядів немає', 'No work orders were handed over in this period')" [text]="L('Оберіть довший період або видайте перші наряди — графіки побудуються автоматично.', 'Choose a longer period or hand over your first work orders — the charts will build themselves.')" /></div>
    }

    <div class="grid gap-4 xl:grid-cols-3">
      <tk-chart-card class="xl:col-span-2" [title]="L('Виручка', 'Revenue')" [subtitle]="revenueSubtitle()" [table]="revenueTable()">
        <tk-chart [build]="revenueChart" [height]="260" [label]="L('Виручка ' + money(cur().revenue) + ' за період', 'Revenue ' + money(cur().revenue) + ' for the period')" />
      </tk-chart-card>
      <tk-chart-card [title]="L('Філії', 'Branches')" [subtitle]="L('Виручка за період', 'Revenue for the period')" [table]="branchTable()">
        <tk-chart [build]="branchChart" [height]="260" [label]="branchLabel()" />
      </tk-chart-card>

      <tk-chart-card class="xl:col-span-2" [title]="L('Завантаження постів', 'Bay utilisation')" [subtitle]="L('Середня частка робочого часу, зайнята записами, за днями тижня', 'Average share of working hours taken by bookings, by weekday')" [table]="heatTable()">
        <tk-chart [build]="heatChart" [height]="heatHeight()" [label]="L('Теплова карта завантаження постів за днями тижня', 'Heat map of bay utilisation by weekday')" />
      </tk-chart-card>
      <tk-chart-card [title]="L('Погодження', 'Approvals')" [subtitle]="L('Відповіді клієнтів на рекомендації', 'Customer responses to recommendations')" [table]="null">
        @if (db.ready()) {
          <div class="flex flex-col gap-4 pt-1">
            <div>
              <div class="flex items-baseline justify-between"><span class="text-[13px] text-ink-2">{{ L('Погоджено', 'Approved') }}</span><span class="text-xl font-semibold num">{{ cur().conversion !== null ? pct(cur().conversion!) : '—' }}</span></div>
              <div class="mt-2 flex h-3 overflow-hidden rounded-full bg-muted" role="img" [attr.aria-label]="L('Погоджено ', 'Approved ') + (cur().conversion ?? 0).toFixed(0) + L('%, відкладено ', '%, deferred ') + (cur().deferredShare ?? 0).toFixed(0) + '%'">
                <div class="h-full rounded-l-full" [style.width.%]="cur().conversion ?? 0" style="background: var(--viz-1)"></div>
                <div class="h-full w-0.5 bg-surface"></div>
                <div class="h-full flex-1" style="background: var(--viz-2)"></div>
              </div>
              <div class="mt-2 flex justify-between text-xs text-ink-2">
                <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background: var(--viz-1)"></span>{{ L('погоджено', 'approved') }}</span>
                <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background: var(--viz-2)"></span>{{ L('відкладено', 'deferred') }} {{ cur().deferredShare !== null ? pct(cur().deferredShare!) : '' }}</span>
              </div>
            </div>
            <dl class="m-0 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
              <div><dt class="text-xs text-ink-3">{{ L('Запропоновано', 'Proposed') }}</dt><dd class="m-0 font-semibold num">{{ money(cur().proposed) }}</dd></div>
              <div><dt class="text-xs text-ink-3">{{ L('Чекають відповіді', 'Awaiting reply') }}</dt><dd class="m-0 font-semibold num">{{ waiting() }}</dd></div>
            </dl>
            <a routerLink="/naryady/pogodzhennia" class="link text-[13px]">{{ L('Усі погодження', 'All approvals') }}</a>
          </div>
        } @else {
          <div class="skeleton h-40"></div>
        }
      </tk-chart-card>

      <tk-chart-card [title]="L('Топ робіт', 'Top jobs')" [subtitle]="L('За виручкою', 'By revenue')" [table]="topTable('works')">
        <tk-chart [build]="topWorksChart" [height]="280" [label]="L('Топ робіт: ', 'Top jobs: ') + topLabel('works')" />
      </tk-chart-card>
      <tk-chart-card [title]="L('Топ запчастин', 'Top parts')" [subtitle]="L('За виручкою', 'By revenue')" [table]="topTable('parts')">
        <tk-chart [build]="topPartsChart" [height]="280" [label]="L('Топ запчастин: ', 'Top parts: ') + topLabel('parts')" />
      </tk-chart-card>
      <tk-chart-card [title]="L('Видані наряди', 'Work orders handed over')" [subtitle]="L('Кількість по днях', 'Count per day')" [table]="null">
        <tk-chart [build]="ordersChart" [height]="280" [label]="L('Видано нарядів: ', 'Work orders handed over: ') + cur().orders" />
      </tk-chart-card>
    </div>
  `,
})
export class Dashboard {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly an = inject(AnalyticsService);
  private readonly ctx = inject(AppContext);
  protected readonly money = fmtMoney;
  protected readonly pct = fmtPct;
  protected readonly today = fmtDayLong(new Date());
  protected readonly range = signal<DateRange>(PERIOD_PRESETS[2].range());
  protected readonly branch = signal<string | null>('all');

  protected readonly branchOptions = computed<Option<string>[]>(() => [
    { value: 'all', label: L('Уся мережа', 'All branches') },
    ...this.ctx.branches().map((b) => ({ value: b.id, label: b.name.replace(`${BRAND} `, '') })),
  ]);
  private readonly branches = computed(() => (this.branch() && this.branch() !== 'all' ? [this.branch()!] : null));
  private readonly period = computed<Period>(() => ({ from: Date.parse(this.range().from + 'T00:00:00'), to: Date.parse(this.range().to + 'T23:59:59') }));
  protected readonly cur = computed<Kpis>(() => (this.db.ready() ? this.an.kpis(this.period(), this.branches()) : ({ revenue: 0, orders: 0, avgCheck: 0, cars: 0, conversion: null, deferredShare: null, proposed: 0 } as Kpis)));
  private readonly prev = computed(() => this.an.kpis(this.an.previous(this.period()), this.branches()));
  private readonly series = computed(() => this.an.revenueSeries(this.period(), this.branches()));
  private readonly heat = computed(() => this.an.heatmap(this.period(), this.branches()));
  private readonly topWorks = computed(() => this.an.top(this.period(), this.branches(), 'works'));
  private readonly topParts = computed(() => this.an.top(this.period(), this.branches(), 'parts'));
  private readonly branchRows = computed(() => this.an.byBranch(this.period()));
  protected readonly waiting = computed(() => this.db.approvals.items().filter((a) => a.status === 'sent').length);
  protected readonly heatHeight = computed(() => Math.max(200, this.heat().posts.length * 30 + 50));

  protected readonly todayTiles = computed(() => {
    const now = new Date(this.ctx.now());
    const br = this.branches();
    const os = this.db.orders.items().filter((o) => !br || br.includes(o.branchId));
    const today = os.filter((o) => o.start && sameDay(new Date(o.start), now) && o.status !== 'skasovano').length;
    const work = os.filter((o) => ['pryiom', 'diagnostyka', 'pogodzhennia', 'v_roboti', 'kontrol'].includes(o.status)).length;
    const ready = os.filter((o) => o.status === 'gotovo').length;
    return [
      { label: L('Записів на сьогодні', 'Bookings today'), value: fmtNum(today), link: '/tablo', icon: I.calendarClock, bg: 'var(--s-zapys-bg)', fg: 'var(--s-zapys)' },
      { label: L('У роботі', 'In progress'), value: fmtNum(work), link: '/naryady/kanban', icon: I.wrench, bg: 'var(--s-work-bg)', fg: 'var(--s-work)' },
      { label: L('Готові до видачі', 'Ready for pickup'), value: fmtNum(ready), link: '/naryady/kanban', icon: I.carFront, bg: 'var(--s-ready-bg)', fg: 'var(--s-ready)' },
      { label: L('Чекають клієнта', 'Awaiting customer'), value: fmtNum(this.waiting()), link: '/naryady/pogodzhennia', icon: I.message, bg: 'var(--s-pog-bg)', fg: 'var(--s-pog)' },
    ];
  });

  private delta(a: number, b: number): number | null {
    return b ? Math.round(((a - b) / b) * 100) : null;
  }
  protected readonly kpiTiles = computed(() => {
    const c = this.cur();
    const p = this.prev();
    const tone = (d: number | null) => (d === null ? 'text-ink-3' : d >= 0 ? 'text-success' : 'text-danger');
    const items = [
      { label: L('Виручка', 'Revenue'), value: fmtMoney(c.revenue), delta: this.delta(c.revenue, p.revenue), note: '' },
      { label: L('Середній чек', 'Average ticket'), value: fmtMoney(c.avgCheck), delta: this.delta(c.avgCheck, p.avgCheck), note: '' },
      { label: L('Авто обслуговано', 'Cars serviced'), value: fmtNum(c.cars), delta: this.delta(c.cars, p.cars), note: '' },
      { label: L('Конверсія погоджень', 'Approval rate'), value: c.conversion !== null ? fmtPct(c.conversion) : '—', delta: null, note: c.deferredShare !== null ? L(`відкладено ${fmtPct(c.deferredShare)} суми`, `${fmtPct(c.deferredShare)} of the amount deferred`) : L('немає відповідей', 'no responses') },
    ];
    return items.map((x) => ({ ...x, deltaTone: tone(x.delta) }));
  });

  protected readonly revenueSubtitle = computed(() => {
    const s = this.series();
    const weekly = s.length > 1 && s[1].date - s[0].date > 86400000 * 2;
    return weekly
      ? L(`По тижнях, ${fmtNum(this.cur().orders)} виданих нарядів`, `By week, ${fmtNum(this.cur().orders)} work orders handed over`)
      : L(`По днях, ${fmtNum(this.cur().orders)} виданих нарядів`, `By day, ${fmtNum(this.cur().orders)} work orders handed over`);
  });

  // ——— графіки
  protected readonly revenueChart = (p: ChartPalette): EChartsCoreOption => {
    const s = this.series();
    const weekly = s.length > 1 && s[1].date - s[0].date > 86400000 * 2;
    return {
      ...baseOption(p),
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...(baseOption(p)['tooltip'] as object), trigger: 'axis', axisPointer: { type: weekly ? 'line' : 'shadow', lineStyle: { color: p.text3 } }, valueFormatter: (v: number) => fmtMoney(v) },
      xAxis: { type: 'category', data: s.map((x) => fmtDateShort(new Date(x.date))), boundaryGap: !weekly, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.text3, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { color: p.text3, formatter: (v: number) => short(v) }, splitLine: { lineStyle: { color: p.line, type: 'dashed' } } },
      series: [
        weekly
          ? { name: L('Виручка', 'Revenue'), type: 'line', data: s.map((x) => Math.round(x.value)), symbolSize: 8, lineStyle: { width: 2, color: p.accent }, itemStyle: { color: p.accent, borderColor: p.surface, borderWidth: 2 } }
          : { name: L('Виручка', 'Revenue'), type: 'bar', data: s.map((x) => Math.round(x.value)), barMaxWidth: 16, itemStyle: { color: p.accent, borderRadius: [4, 4, 0, 0] } },
      ],
    };
  };
  protected readonly revenueTable = computed<TableView>(() => ({ head: L(['Дата', 'Нарядів', 'Виручка'], ['Date', 'Work orders', 'Revenue']), rows: this.series().map((x) => [fmtDateShort(new Date(x.date)), x.count, fmtMoney(x.value)]) }));

  protected readonly ordersChart = (p: ChartPalette): EChartsCoreOption => {
    const s = this.series();
    return {
      ...baseOption(p),
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...(baseOption(p)['tooltip'] as object), trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: s.map((x) => fmtDateShort(new Date(x.date))), axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.text3, hideOverlap: true } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: p.text3 }, splitLine: { lineStyle: { color: p.line, type: 'dashed' } } },
      series: [{ name: L('Видано нарядів', 'Handed over'), type: 'bar', data: s.map((x) => x.count), barMaxWidth: 14, itemStyle: { color: p.series[1], borderRadius: [4, 4, 0, 0] } }],
    };
  };

  protected readonly branchChart = (p: ChartPalette): EChartsCoreOption => {
    const rows = this.branchRows();
    return {
      ...baseOption(p),
      grid: { left: 8, right: 16, top: 8, bottom: 4, containLabel: true },
      tooltip: { ...(baseOption(p)['tooltip'] as object), trigger: 'item', valueFormatter: (v: number) => fmtMoney(v) },
      xAxis: { type: 'category', data: rows.map((r) => r.branch.replace(`${BRAND} `, '')), axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.text2 } },
      yAxis: { type: 'value', axisLabel: { color: p.text3, formatter: (v: number) => short(v) }, splitLine: { lineStyle: { color: p.line, type: 'dashed' } } },
      series: [
        {
          name: L('Виручка', 'Revenue'),
          type: 'bar',
          barMaxWidth: 48,
          data: rows.map((r, i) => ({ value: Math.round(r.revenue), itemStyle: { color: p.series[i % 3], borderRadius: [4, 4, 0, 0] } })),
          label: { show: true, position: 'top', color: p.text2, formatter: (x: { value: number }) => short(x.value) },
        },
      ],
    };
  };
  protected readonly branchTable = computed<TableView>(() => ({ head: L(['Філія', 'Нарядів', 'Середній чек', 'Виручка'], ['Branch', 'Work orders', 'Average ticket', 'Revenue']), rows: this.branchRows().map((r) => [r.branch, r.orders, fmtMoney(r.avgCheck), fmtMoney(r.revenue)]) }));
  protected readonly branchLabel = computed(() => this.branchRows().map((r) => `${r.branch}: ${fmtMoney(r.revenue)}`).join('; '));

  protected readonly heatChart = (p: ChartPalette): EChartsCoreOption => {
    const h = this.heat();
    return {
      ...baseOption(p),
      grid: { left: 8, right: 8, top: 8, bottom: 36, containLabel: true },
      tooltip: { ...(baseOption(p)['tooltip'] as object), formatter: (x: { value: [number, number, number] }) => `${h.posts[x.value[1]]}, ${h.days[x.value[0]]}: ${x.value[2]}%` },
      xAxis: { type: 'category', data: h.days, splitArea: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.text2 } },
      yAxis: { type: 'category', data: h.posts, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.text2 } },
      visualMap: { min: 0, max: 100, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, text: ['100%', '0%'], textStyle: { color: p.text3 }, inRange: { color: p.seq } },
      series: [{ type: 'heatmap', data: h.cells, label: { show: true, color: p.text, fontSize: 11, formatter: (x: { value: [number, number, number] }) => `${x.value[2]}` }, itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 4 } }],
    };
  };
  protected readonly heatTable = computed<TableView>(() => {
    const h = this.heat();
    return { head: [L('Пост', 'Bay'), ...h.days], rows: h.posts.map((name, pi) => [name, ...h.days.map((_, d) => `${h.cells.find((c) => c[0] === d && c[1] === pi)?.[2] ?? 0}%`)]) };
  });

  private topChart(p: ChartPalette, items: { name: string; value: number }[]): EChartsCoreOption {
    const rev = [...items].reverse();
    return {
      ...baseOption(p),
      grid: { left: 8, right: 48, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...(baseOption(p)['tooltip'] as object), trigger: 'item', valueFormatter: (v: number) => fmtMoney(v) },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: rev.map((x) => (x.name.length > 26 ? x.name.slice(0, 25) + '…' : x.name)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.text2, fontSize: 11 } },
      series: [{ type: 'bar', data: rev.map((x) => Math.round(x.value)), barMaxWidth: 14, itemStyle: { color: p.accent, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: p.text2, fontSize: 11, formatter: (x: { value: number }) => short(x.value) } }],
    };
  }
  protected readonly topWorksChart = (p: ChartPalette) => this.topChart(p, this.topWorks());
  protected readonly topPartsChart = (p: ChartPalette) => this.topChart(p, this.topParts());
  protected topTable(kind: 'works' | 'parts'): TableView {
    const items = kind === 'works' ? this.topWorks() : this.topParts();
    return { head: [kind === 'works' ? L('Робота', 'Job') : L('Запчастина', 'Part'), L('Разів', 'Times'), L('Виручка', 'Revenue')], rows: items.map((x) => [x.name, x.count, fmtMoney(x.value)]) };
  }
  protected topLabel(kind: 'works' | 'parts'): string {
    return (kind === 'works' ? this.topWorks() : this.topParts()).slice(0, 3).map((x) => x.name).join(', ');
  }
}
