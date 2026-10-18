import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BodyZone, Damage, DamageKind } from '../../core/data/models';
import { DAMAGE_COLOR, DAMAGE_LABEL, ZONE_LABEL } from '../../core/domain/body';
import { L } from '../../core/i18n';

interface ZoneShape {
  zone: BodyZone;
  d: string;
  /** Центр для маркера */
  cx: number;
  cy: number;
}

const r = (x: number, y: number, w: number, h: number, rx = 6) =>
  `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${h - 2 * rx}a${rx} ${rx} 0 0 1 -${rx} ${rx}h-${w - 2 * rx}a${rx} ${rx} 0 0 1 -${rx} -${rx}v-${h - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} -${rx}z`;

/** Схема кузова «зверху»: перед угорі. Кожна деталь — окрема зона */
const ZONES: ZoneShape[] = [
  { zone: 'bumper_front', d: 'M62 50 Q62 22 130 18 Q198 22 198 50 Z', cx: 130, cy: 36 },
  { zone: 'headlight_l', d: r(64, 52, 30, 14, 5), cx: 79, cy: 59 },
  { zone: 'headlight_r', d: r(166, 52, 30, 14, 5), cx: 181, cy: 59 },
  { zone: 'hood', d: 'M96 52 H164 L170 150 H90 Z', cx: 130, cy: 100 },
  { zone: 'fender_fl', d: 'M58 68 H94 L88 150 H58 Z', cx: 72, cy: 110 },
  { zone: 'fender_fr', d: 'M166 68 H202 V150 H172 Z', cx: 188, cy: 110 },
  { zone: 'windshield', d: 'M90 152 H170 L160 194 H100 Z', cx: 130, cy: 172 },
  { zone: 'mirror_l', d: r(36, 166, 20, 14, 4), cx: 46, cy: 173 },
  { zone: 'mirror_r', d: r(204, 166, 20, 14, 4), cx: 214, cy: 173 },
  { zone: 'door_fl', d: 'M58 152 H88 L98 196 V282 H58 Z', cx: 76, cy: 225 },
  { zone: 'door_fr', d: 'M172 152 H202 V282 H162 V196 Z', cx: 184, cy: 225 },
  { zone: 'roof', d: r(100, 196, 60, 166, 8), cx: 130, cy: 279 },
  { zone: 'door_rl', d: 'M58 284 H98 V362 L88 376 H58 Z', cx: 76, cy: 330 },
  { zone: 'door_rr', d: 'M162 284 H202 V376 H172 L162 362 Z', cx: 184, cy: 330 },
  { zone: 'rear_window', d: 'M100 364 H160 L168 396 H92 Z', cx: 130, cy: 380 },
  { zone: 'fender_rl', d: 'M58 378 H88 L92 452 H58 Z', cx: 72, cy: 414 },
  { zone: 'fender_rr', d: 'M172 378 H202 V452 H168 Z', cx: 188, cy: 414 },
  { zone: 'trunk', d: 'M92 398 H168 L166 452 H94 Z', cx: 130, cy: 425 },
  { zone: 'taillight_l', d: r(64, 454, 30, 12, 4), cx: 79, cy: 460 },
  { zone: 'taillight_r', d: r(166, 454, 30, 12, 4), cx: 181, cy: 460 },
  { zone: 'bumper_rear', d: 'M62 468 H198 Q198 496 130 500 Q62 496 62 468 Z', cx: 130, cy: 484 },
  { zone: 'wheel_fl', d: r(40, 84, 16, 52, 5), cx: 48, cy: 110 },
  { zone: 'wheel_fr', d: r(204, 84, 16, 52, 5), cx: 212, cy: 110 },
  { zone: 'wheel_rl', d: r(40, 388, 16, 52, 5), cx: 48, cy: 414 },
  { zone: 'wheel_rr', d: r(204, 388, 16, 52, 5), cx: 212, cy: 414 },
];

const LETTER: Record<DamageKind, string> = L({ scratch: 'П', dent: 'В', chip: 'С', crack: 'Т' }, { scratch: 'S', dent: 'D', chip: 'C', crack: 'K' });

/**
 * Інтерактивна схема кузова: зони — кнопки (Tab/Enter/Space), маркери пошкоджень
 * з першою літерою виду. Обрана зона підсвічена акцентом.
 */
@Component({
  selector: 'tk-body-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <svg viewBox="0 0 260 520" class="mx-auto block h-auto w-full max-w-[300px] select-none" role="group" [attr.aria-label]="L('Схема кузова, перед угорі', 'Body diagram, front at the top')">
      <text x="130" y="11" text-anchor="middle" class="fill-ink-3 text-[10px]">{{ L('ПЕРЕД', 'FRONT') }}</text>
      <text x="130" y="516" text-anchor="middle" class="fill-ink-3 text-[10px]">{{ L('ЗАД', 'REAR') }}</text>
      @for (z of zones; track z.zone) {
        @let n = count().get(z.zone) ?? 0;
        <path
          [attr.d]="z.d"
          class="zone outline-none"
          [class.zone-sel]="selected() === z.zone"
          [class.zone-dmg]="n > 0"
          [attr.role]="readonly() ? 'img' : 'button'"
          [attr.tabindex]="readonly() ? -1 : 0"
          [attr.aria-label]="label(z.zone) + (n ? L(', пошкоджень: ', ', damage: ') + n : L(', без пошкоджень', ', no damage'))"
          [attr.aria-pressed]="readonly() ? null : selected() === z.zone"
          (click)="!readonly() && pick.emit(z.zone)"
          (keydown.enter)="!readonly() && pick.emit(z.zone)"
          (keydown.space)="$event.preventDefault(); !readonly() && pick.emit(z.zone)"
        >
          <title>{{ label(z.zone) }}</title>
        </path>
      }
      @for (m of markers(); track m.id) {
        <g class="pointer-events-none" aria-hidden="true">
          <circle [attr.cx]="m.x" [attr.cy]="m.y" r="8" [attr.fill]="m.color" stroke="var(--surface)" stroke-width="2" />
          <text [attr.x]="m.x" [attr.y]="m.y + 3.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--surface)">{{ m.letter }}</text>
        </g>
      }
    </svg>
    <ul class="mt-3 flex list-none flex-wrap justify-center gap-x-3 gap-y-1 p-0 text-xs text-ink-2" [attr.aria-label]="L('Позначення', 'Legend')">
      @for (k of kinds; track k) {
        <li class="inline-flex items-center gap-1.5">
          <span class="grid size-4 place-items-center rounded-full text-[9px] font-bold text-surface" [style.background]="color(k)" aria-hidden="true">{{ letter(k) }}</span>{{ kindLabel(k) }}
        </li>
      }
    </ul>
  `,
  styles: `
    .zone {
      fill: var(--subtle);
      stroke: var(--border-strong);
      stroke-width: 1.2;
      cursor: pointer;
      transition: fill 120ms ease;
    }
    .zone:hover {
      fill: var(--muted);
    }
    .zone:focus-visible {
      stroke: var(--focus);
      stroke-width: 2.5;
    }
    .zone-dmg {
      fill: color-mix(in srgb, var(--danger) 12%, var(--subtle));
    }
    .zone-sel,
    .zone-sel:hover {
      fill: var(--accent-soft);
      stroke: var(--accent);
      stroke-width: 2;
    }
    :host([data-readonly]) .zone {
      cursor: default;
    }
  `,
})
export class BodyDiagram {
  protected readonly L = L;
  protected readonly zones = ZONES;
  protected readonly kinds: DamageKind[] = ['scratch', 'dent', 'chip', 'crack'];
  readonly damages = input<Damage[]>([]);
  readonly selected = input<BodyZone | null>(null);
  readonly readonly = input(false);
  readonly pick = output<BodyZone>();

  protected readonly count = computed(() => {
    const m = new Map<BodyZone, number>();
    for (const d of this.damages()) m.set(d.zone, (m.get(d.zone) ?? 0) + 1);
    return m;
  });

  /** Кілька пошкоджень в одній зоні — маркери поруч */
  protected readonly markers = computed(() => {
    const seen = new Map<BodyZone, number>();
    return this.damages().map((d) => {
      const z = ZONES.find((x) => x.zone === d.zone)!;
      const i = seen.get(d.zone) ?? 0;
      seen.set(d.zone, i + 1);
      return { id: d.id, x: z.cx + (i % 2 ? 9 : -9) * Math.min(1, i) + (i > 1 ? 0 : 0), y: z.cy + Math.floor(i / 2) * 16, color: DAMAGE_COLOR[d.kind], letter: LETTER[d.kind] };
    });
  });

  protected label(z: BodyZone): string {
    return ZONE_LABEL[z];
  }
  protected color(k: DamageKind): string {
    return DAMAGE_COLOR[k];
  }
  protected letter(k: DamageKind): string {
    return LETTER[k];
  }
  protected kindLabel(k: DamageKind): string {
    return DAMAGE_LABEL[k];
  }
}
