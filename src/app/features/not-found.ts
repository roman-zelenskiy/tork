import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../shared/ui/states';

@Component({
  selector: 'tk-not-found',
  imports: [RouterLink, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-empty art="search" title="Такої сторінки немає" text="Можливо, наряд або клієнта видалили, або в адресі помилка.">
      <a routerLink="/" class="btn btn-primary">На огляд</a>
      <a routerLink="/naryady" class="btn">До нарядів</a>
    </tk-empty>
  `,
})
export class NotFound {
  constructor() {
    // SSR: правильний статус для пошукових систем і моніторингу
    const res = inject(RESPONSE_INIT, { optional: true });
    if (res) res.status = 404;
  }
}
