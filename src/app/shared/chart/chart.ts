import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input, output, signal, afterNextRender } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { ThemeService } from '../../core/ui/theme.service';

/** Кольори теми для графіків (читаються з CSS-змінних, тож світла й темна теми однакові за логікою) */
export interface ChartPalette {
  text: string;
  text2: string;
  text3: string;
  line: string;
  surface: string;
  subtle: string;
  accent: string;
  accentSoft: string;
  series: string[];
  seq: [string, string];
  font: string;
  mono: string;
}

function readPalette(): ChartPalette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    text: v('--text'),
    text2: v('--text-2'),
    text3: v('--text-3'),
    line: v('--border-strong'),
    surface: v('--surface'),
    subtle: v('--subtle'),
    accent: v('--viz-1'),
    accentSoft: v('--accent-soft'),
    series: [v('--viz-1'), v('--viz-2'), v('--viz-3')],
    seq: [v('--viz-seq-0'), v('--viz-seq-1')],
    font: 'IBM Plex Sans, sans-serif',
    mono: 'IBM Plex Mono, monospace',
  };
}

/** Спільні налаштування: підказка, сітка, шрифт */
export function baseOption(p: ChartPalette): EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font, color: p.text2, fontSize: 12 },
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.line,
      textStyle: { color: p.text, fontFamily: p.font, fontSize: 12 },
      extraCssText: 'box-shadow: var(--shadow-pop); border-radius: 8px;',
    },
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
  };
}

/**
 * Графік ECharts. На сервері й до гідратації — скелетон потрібної висоти (без зсуву верстки).
 * build() отримує палітру поточної теми й перебудовується при її зміні.
 */
@Component({
  selector: 'tk-chart',
  imports: [NgxEchartsDirective],
  providers: [provideEchartsCore({ echarts: () => import('./echarts-setup').then((m) => m.default) })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    @if (shown()) {
      <div echarts [options]="options()" [style.height.px]="height()" class="w-full" (chartClick)="pointClick.emit($event)"></div>
    } @else {
      <div class="skeleton w-full" [style.height.px]="height()"></div>
    }
  `,
})
export class Chart {
  readonly build = input.required<(p: ChartPalette) => EChartsCoreOption>();
  readonly height = input(240);
  /** Текстовий опис для скрінрідерів */
  readonly label = input.required<string>();
  readonly pointClick = output<unknown>();

  private readonly theme = inject(ThemeService);
  protected readonly shown = signal(false);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => this.shown.set(true));
  }

  protected readonly options = computed(() => {
    this.theme.resolved();
    return this.build()(readPalette());
  });
}
