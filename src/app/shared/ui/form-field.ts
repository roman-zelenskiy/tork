import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';
import { I } from '../icons';

/**
 * Обгортка поля: підпис, підказка, помилка біля поля (з id для aria-describedby).
 * forId — id контрола всередині; помилка має id `${forId}-err`.
 */
@Component({
  selector: 'tk-field',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'field' },
  template: `
    @if (label()) {
      <label class="label" [attr.for]="forId()" [id]="forId() + '-label'">
        {{ label() }}
        @if (required()) {
          <span class="text-danger" aria-hidden="true">*</span>
        }
      </label>
    }
    <ng-content />
    @if (error()) {
      <span class="error-text animate-fade" [id]="forId() + '-err'" role="alert">
        <svg [lucideIcon]="I.circleAlert" [size]="13" class="mt-[2px] flex-none" aria-hidden="true"></svg>{{ error() }}
      </span>
    } @else if (hint()) {
      <span class="hint" [id]="forId() + '-err'">{{ hint() }}</span>
    }
  `,
})
export class FormField {
  protected readonly I = I;
  readonly label = input<string | null>(null);
  readonly forId = input.required<string>();
  readonly error = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly required = input(false);
}
