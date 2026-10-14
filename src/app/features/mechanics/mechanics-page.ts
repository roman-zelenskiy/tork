import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';
import { DbService } from '../../core/data/db.service';
import { MechanicsService } from '../../core/domain/mechanics.service';
import { AppContext } from '../../core/ui/app-context.service';
import { Avatar } from '../../shared/ui/display';
import { EmptyState } from '../../shared/ui/states';
import { DateRange, DateRangePicker, PERIOD_PRESETS } from '../../shared/ui/date-picker';
import { Chart, ChartPalette, baseOption } from '../../shared/chart/chart';
import { fmtHours, fmtMoney, fmtPct } from '../../shared/format';
import { MechanicsHeader } from './mechanics-header';

/** Механіки філії: що роблять зараз, закриті нормо-години й ефективність за період */
@Component({
  selector: 'tk-mechanics-page',
  imports: [RouterLink, Avatar, EmptyState, DateRangePicker, Chart, MechanicsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-mechanics-header [subtitle]="ctx.branch()?.name ?? null">
      <tk-date-range class="w-56" [(value)]="period" />
    </tk-mechanics-header>
    @if (!db.ready()) {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">@for (i of [1, 2, 3]; track i) {<div class="skeleton h-44"></div>}</div>
    } @else if (!rows().length) {
      <div class="card"><tk-empty art="clients" title="Механіків немає" text="Додайте співробітників з роллю «Механік» у довіднику."><a routerLink="/dovidnyky/spivrobitnyky" class="btn">До довідника</a></tk-empty></div>
    } @else {
      <section class="card mb-5 p-4" aria-labelledby="eff-h">
        <h2 id="eff-h" class="m-0 mb-1 text-[15px] font-semibold">Закриті нормо-години</h2>
        <p class="m-0 mb-3 text-xs text-ink-3">Ефективність на картках = нормативний час ÷ фактичний; понад 100% — швидше за норматив.</p>
        <tk-chart [build]="chart" [height]="260" [label]="chartLabel()" />
      </section>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (r of rows(); track r.m.id) {
          <article class="card p-4">
            <div class="flex items-center gap-3">
              <tk-avatar [name]="r.m.name" [size]="40" />
              <div class="min-w-0 flex-1">
                <h3 class="m-0 truncate-1 text-[15px] font-semibold">{{ r.m.name }}</h3>
                <p class="m-0 text-xs text-ink-3">{{ r.skills }}</p>
              </div>
            </div>
            <div class="mt-3 rounded-lg px-3 py-2 text-[13px]" [class]="r.running ? 'bg-accent-soft text-accent-ink' : 'bg-subtle text-ink-2'">
              @if (r.running; as run) {
                <span class="flex items-center gap-2"><span class="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true"></span>Зараз: {{ run.work.name }}</span>
                <a [routerLink]="['/naryady', run.order.id]" class="mono text-xs underline underline-offset-2">{{ run.order.number }}</a>
              } @else {
                {{ r.queue ? 'У черзі ' + r.queue + ' робіт' : 'Вільний' }}
              }
            </div>
            <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><dt class="text-[11px] text-ink-3">Нормо-год</dt><dd class="m-0 font-semibold num">{{ hours(r.s.normHours) }}</dd></div>
              <div><dt class="text-[11px] text-ink-3">Робіт</dt><dd class="m-0 font-semibold num">{{ r.s.works }}</dd></div>
              <div><dt class="text-[11px] text-ink-3">Ефективність</dt><dd class="m-0 font-semibold num" [class.text-success]="(r.s.efficiency ?? 0) >= 100" [class.text-danger]="(r.s.efficiency ?? 100) < 80">{{ r.s.efficiency !== null ? pct(r.s.efficiency) : '—' }}</dd></div>
            </dl>
            <div class="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13px]">
              <span class="text-ink-2">Виручка робіт</span><span class="font-medium num">{{ money(r.s.revenue) }}</span>
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class MechanicsPage {
  protected readonly db = inject(DbService);
  protected readonly ctx = inject(AppContext);
  private readonly mech = inject(MechanicsService);
  protected readonly hours = fmtHours;
  protected readonly money = fmtMoney;
  protected readonly pct = fmtPct;
  protected readonly period = signal<DateRange>(PERIOD_PRESETS[2].range());

  protected readonly rows = computed(() => {
    const p = this.period();
    const from = Date.parse(p.from);
    const to = Date.parse(p.to) + 86400000 - 1;
    const cats = new Map((this.db.settings()?.categories ?? []).map((c) => [c.id, c.name]));
    return this.mech.mechanics(this.ctx.branchId()).map((m) => ({
      m,
      s: this.mech.stats(m.id, from, to),
      running: this.mech.running(m.id),
      queue: this.mech.myWorks(m.id).reduce((n, x) => n + x.works.filter((w) => w.state !== 'done').length, 0),
      skills: m.skills.map((s) => cats.get(s)).filter(Boolean).slice(0, 3).join(', ') || 'універсал',
    }));
  });

  protected readonly chartLabel = computed(() =>
    'Нормо-години за період: ' + this.rows().map((r) => `${r.m.name} ${fmtHours(r.s.normHours)}`).join(', '),
  );

  protected readonly chart = (p: ChartPalette): EChartsCoreOption => {
    const rows = this.rows();
    const names = rows.map((r) => r.m.name.split(' ')[0] + ' ' + (r.m.name.split(' ')[1]?.[0] ?? '') + '.');
    return {
      ...baseOption(p),
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
            tooltip: { ...(baseOption(p)['tooltip'] as object), trigger: 'axis' },
      xAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text2 }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'нормо-години', nameTextStyle: { color: p.text3, align: 'left' }, axisLabel: { color: p.text3 }, splitLine: { lineStyle: { color: p.line, type: 'dashed' } } },
      series: [
        { name: 'Нормо-години', type: 'bar', barMaxWidth: 28, itemStyle: { color: p.accent, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: p.text2, fontSize: 11 }, data: rows.map((r) => Math.round(r.s.normHours * 10) / 10) },
      ],
    };
  };
}
