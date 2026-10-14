import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatPlate } from '../../core/data/plates';
import { initials } from '../format';

/** Аватар з ініціалами; відтінок стабільний для імені */
@Component({
  selector: 'tk-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-none', 'aria-hidden': 'true' },
  template: `
    <span
      class="grid place-items-center rounded-full font-semibold select-none"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.38"
      [style.background]="'hsl(' + hue() + ' 45% var(--av-l, 88%))'"
      [style.color]="'hsl(' + hue() + ' 45% var(--av-t, 28%))'"
      >{{ text() }}</span
    >
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(28);
  protected readonly text = computed(() => initials(this.name()));
  protected readonly hue = computed(() => {
    let h = 0;
    for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) % 360;
    // уникаємо кислотних зелених — тримаємося теплої половини кола й синіх
    return [20, 35, 200, 220, 260, 330, 10, 45, 190, 280][h % 10];
  });
}

/** Держномер у вигляді таблички з синьо-жовтою смужкою UA */
@Component({
  selector: 'tk-plate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span class="plate" [attr.aria-label]="'Номер ' + text()"><span>{{ text() }}</span></span>`,
})
export class Plate {
  readonly value = input.required<string>();
  protected readonly text = computed(() => formatPlate(this.value()));
}

/** Рядок-скелетон для таблиць і карток */
@Component({
  selector: 'tk-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @for (r of rowsArr(); track $index) {
      <div class="flex items-center gap-3" [style.height.px]="rowHeight()">
        @for (c of colsArr(); track $index; let ci = $index) {
          <div class="skeleton h-3" [style.flex]="ci === 0 ? '2' : '1'" [style.opacity]="1 - r * 0.07"></div>
        }
      </div>
    }
  `,
})
export class Skeleton {
  readonly rows = input(6);
  readonly cols = input(4);
  readonly rowHeight = input(44);
  protected readonly rowsArr = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly colsArr = computed(() => Array.from({ length: this.cols() }, (_, i) => i));
}
