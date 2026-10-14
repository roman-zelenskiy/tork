import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DbService } from './core/data/db.service';
import { ThemeService } from './core/ui/theme.service';
import { ToastHost } from './layout/toast-host';

/**
 * Корінь. Сервер рендерить оболонку зі скелетонами; дані з localStorage
 * читаються лише в браузері після гідратації (afterNextRender) — тож розбіжностей гідратації немає.
 */
@Component({
  selector: 'tk-root',
  imports: [RouterOutlet, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><tk-toast-host />`,
})
export class App {
  private readonly db = inject(DbService);

  constructor() {
    inject(ThemeService);
    afterNextRender(() => void this.db.init());
  }
}
