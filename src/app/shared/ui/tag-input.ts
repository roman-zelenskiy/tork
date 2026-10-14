import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';
import { Combobox } from './combobox';
import { Option } from './option';

/** Теги: чипи з видаленням + автодоповнення з існуючих і створення нового */
@Component({
  selector: 'tk-tag-input',
  imports: [Icon, Combobox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    @if (tags().length) {
      <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Обрані теги">
        @for (t of tags(); track t) {
          <li class="chip pr-0.5">
            <svg [lucideIcon]="I.tag" [size]="12" aria-hidden="true"></svg>{{ t }}
            <button type="button" class="grid size-5 place-items-center rounded text-ink-3 hover:bg-muted hover:text-ink" [attr.aria-label]="'Прибрати тег ' + t" (click)="remove(t)">
              <svg [lucideIcon]="I.x" [size]="12" aria-hidden="true"></svg>
            </button>
          </li>
        }
      </ul>
    }
    <tk-combobox
      [inputId]="inputId()"
      [options]="options()"
      [resetOnPick]="true"
      [icon]="I.tag"
      size="sm"
      placeholder="Додати тег…"
      emptyHint="Почніть вводити назву тегу"
      createLabel="Створити тег"
      ariaLabel="Додати тег"
      (selected)="add($event.value)"
      (create)="add($event)"
    />
  `,
})
export class TagInput {
  protected readonly I = I;
  readonly tags = model<string[]>([]);
  readonly suggestions = input<string[]>([]);
  readonly inputId = input<string | null>(null);
  protected readonly options = computed<Option<string>[]>(() =>
    this.suggestions()
      .filter((t) => !this.tags().includes(t))
      .map((t) => ({ value: t, label: t })),
  );

  protected add(t: string): void {
    const v = t.trim().slice(0, 30);
    if (v && !this.tags().some((x) => x.toLowerCase() === v.toLowerCase())) this.tags.set([...this.tags(), v]);
  }
  protected remove(t: string): void {
    this.tags.set(this.tags().filter((x) => x !== t));
  }
}
