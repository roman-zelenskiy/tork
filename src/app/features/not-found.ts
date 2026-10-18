import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../shared/ui/states';
import { L } from '../core/i18n';

@Component({
  selector: 'tk-not-found',
  imports: [RouterLink, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-empty art="search" [title]="L('Такої сторінки немає', 'This page doesn’t exist')" [text]="L('Можливо, наряд або клієнта видалили, або в адресі помилка.', 'The work order or customer may have been deleted, or the address has a typo.')">
      <a routerLink="/" class="btn btn-primary">{{ L('На огляд', 'To the overview') }}</a>
      <a routerLink="/naryady" class="btn">{{ L('До нарядів', 'To work orders') }}</a>
    </tk-empty>
  `,
})
export class NotFound {
  protected readonly L = L;
  constructor() {
    // SSR: правильний статус для пошукових систем і моніторингу
    const res = inject(RESPONSE_INIT, { optional: true });
    if (res) res.status = 404;
  }
}
