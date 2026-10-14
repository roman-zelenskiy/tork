import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { CdkMenu, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { Icon } from '../shared/ui/icon';
import { I, IconNode } from '../shared/icons';
import { Select } from '../shared/ui/select';
import { Option } from '../shared/ui/option';
import { Tooltip } from '../shared/ui/tooltip';
import { Notifications } from './notifications';
import { AppContext } from '../core/ui/app-context.service';
import { ThemeMode, ThemeService } from '../core/ui/theme.service';
import { QuickActions } from '../core/ui/quick-actions.service';
import { HotkeysService } from '../core/ui/hotkeys.service';
import { DbService } from '../core/data/db.service';

@Component({
  selector: 'tk-topbar',
  imports: [CdkMenu, CdkMenuItemRadio, CdkMenuTrigger, Icon, Select, Tooltip, Notifications],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'banner', class: 'sticky top-0 z-30 flex h-14 flex-none items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-4 lg:px-6' },
  template: `
    <button type="button" class="btn btn-ghost btn-icon lg:hidden" aria-label="Відкрити меню" (click)="menu.emit()">
      <svg [lucideIcon]="I.menu" [size]="18" aria-hidden="true"></svg>
    </button>

    <button
      type="button"
      class="control h-9! max-w-[420px] min-w-0 flex-1 bg-surface text-ink-3 shadow-sm hover:text-ink-2 sm:flex-initial sm:basis-[340px]"
      aria-label="Пошук і команди"
      (click)="openSearch.emit()"
    >
      <svg [lucideIcon]="I.search" aria-hidden="true"></svg>
      <span class="truncate-1 flex-1 text-[13px]">Пошук: клієнт, номер, VIN, наряд…</span>
      <span class="kbd hidden sm:inline-flex">{{ hk.label('mod+k') }}</span>
    </button>

    <div class="ml-auto flex items-center gap-1 sm:gap-1.5">
      @if (db.ready() && branchOptions().length > 1) {
        <tk-select
          class="hidden w-48 md:block"
          size="sm"
          [icon]="I.mapPin"
          ariaLabel="Філія"
          [options]="branchOptions()"
          [value]="ctx.branchId()"
          (valueChange)="$event && ctx.setBranch($event)"
        />
      }
      <button type="button" class="btn btn-ghost btn-icon" [cdkMenuTriggerFor]="themeMenu" aria-label="Тема оформлення" tkTip="Тема">
        <svg [lucideIcon]="theme.resolved() === 'dark' ? I.moon : I.sun" [size]="18" aria-hidden="true"></svg>
      </button>
      <ng-template #themeMenu>
        <div class="menu w-44" cdkMenu>
          @for (t of themes; track t.value) {
            <button type="button" class="menu-item" cdkMenuItemRadio [cdkMenuItemChecked]="theme.mode() === t.value" (cdkMenuItemTriggered)="theme.setMode(t.value)">
              <svg [lucideIcon]="t.icon" aria-hidden="true"></svg>
              <span class="flex-1">{{ t.label }}</span>
              @if (theme.mode() === t.value) {
                <svg [lucideIcon]="I.check" class="text-accent-ink!" aria-hidden="true"></svg>
              }
            </button>
          }
        </div>
      </ng-template>
      <tk-notifications />
      <button type="button" class="btn btn-primary ml-1" (click)="quick.newOrder()" [attr.aria-label]="'Новий наряд (' + hk.label('n') + ')'">
        <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>
        <span class="hidden sm:inline">Новий наряд</span>
      </button>
    </div>
  `,
})
export class Topbar {
  protected readonly I = I;
  protected readonly ctx = inject(AppContext);
  protected readonly theme = inject(ThemeService);
  protected readonly quick = inject(QuickActions);
  protected readonly hk = inject(HotkeysService);
  protected readonly db = inject(DbService);
  readonly menu = output<void>();
  readonly openSearch = output<void>();

  protected readonly themes: { value: ThemeMode; label: string; icon: IconNode }[] = [
    { value: 'light', label: 'Світла', icon: I.sun },
    { value: 'dark', label: 'Темна', icon: I.moon },
    { value: 'system', label: 'Як у системі', icon: I.monitor },
  ];

  protected readonly branchOptions = computed<Option<string>[]>(() =>
    this.ctx.branches().map((b) => ({ value: b.id, label: b.name })),
  );
}
