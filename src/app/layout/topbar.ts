import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { CdkMenu, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
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
import { L, isEn, rememberLang, switchUrl } from '../core/i18n';

@Component({
  selector: 'tk-topbar',
  imports: [CdkMenu, CdkMenuItemRadio, CdkMenuTrigger, Icon, Select, Tooltip, Notifications],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'banner', class: 'sticky top-0 z-30 flex h-14 flex-none items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-4 lg:px-6' },
  template: `
    <button type="button" class="btn btn-ghost btn-icon lg:hidden" [attr.aria-label]="L('Відкрити меню', 'Open menu')" (click)="menu.emit()">
      <svg [lucideIcon]="I.menu" [size]="18" aria-hidden="true"></svg>
    </button>

    <button
      type="button"
      class="control h-9! max-w-[420px] min-w-0 flex-1 bg-surface text-ink-3 shadow-sm hover:text-ink-2 sm:flex-initial sm:basis-[340px]"
      [attr.aria-label]="L('Пошук і команди', 'Search and commands')"
      (click)="openSearch.emit()"
    >
      <svg [lucideIcon]="I.search" aria-hidden="true"></svg>
      <span class="truncate-1 flex-1 text-[13px]">{{ L('Пошук: клієнт, номер, VIN, наряд…', 'Search: customer, plate, VIN, work order…') }}</span>
      <span class="kbd hidden sm:inline-flex">{{ hk.label('mod+k') }}</span>
    </button>

    <div class="ml-auto flex items-center gap-1 sm:gap-1.5">
      @if (db.ready() && branchOptions().length > 1) {
        <tk-select
          class="hidden w-48 md:block"
          size="sm"
          [icon]="I.mapPin"
          [ariaLabel]="L('Філія', 'Branch')"
          [options]="branchOptions()"
          [value]="ctx.branchId()"
          (valueChange)="$event && ctx.setBranch($event)"
        />
      }
      <button type="button" class="btn btn-ghost btn-icon" [cdkMenuTriggerFor]="themeMenu" [attr.aria-label]="L('Тема оформлення', 'Colour theme')" [tkTip]="L('Тема', 'Theme')">
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
      <a
        class="btn btn-ghost btn-icon font-mono text-[12px] font-semibold tracking-[0.04em]"
        [href]="switchHref()"
        [attr.hreflang]="other"
        [attr.lang]="other"
        [attr.aria-label]="L('English version', 'Українська версія')"
        [tkTip]="L('English', 'Українська')"
        (click)="remember()"
        >{{ L('EN', 'UA') }}</a
      >
      <tk-notifications />
      <button type="button" class="btn btn-primary ml-1" (click)="quick.newOrder()" [attr.aria-label]="L('Новий наряд', 'New work order') + ' (' + hk.label('n') + ')'">
        <svg [lucideIcon]="I.plus" aria-hidden="true"></svg>
        <span class="hidden sm:inline">{{ L('Новий наряд', 'New work order') }}</span>
      </button>
    </div>
  `,
})
export class Topbar {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly ctx = inject(AppContext);
  protected readonly theme = inject(ThemeService);
  protected readonly quick = inject(QuickActions);
  protected readonly hk = inject(HotkeysService);
  protected readonly db = inject(DbService);
  private readonly router = inject(Router);
  readonly menu = output<void>();
  readonly openSearch = output<void>();

  protected readonly themes: { value: ThemeMode; label: string; icon: IconNode }[] = [
    { value: 'light', label: L('Світла', 'Light'), icon: I.sun },
    { value: 'dark', label: L('Темна', 'Dark'), icon: I.moon },
    { value: 'system', label: L('Як у системі', 'Match system'), icon: I.monitor },
  ];

  /** Мовний перемикач веде на ту саму сторінку іншою мовою (окрема збірка /uk/ чи /en/) */
  protected readonly other = isEn ? 'uk' : 'en';
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly switchHref = computed(() => switchUrl(this.url()));
  protected remember(): void {
    rememberLang(this.other);
  }

  protected readonly branchOptions = computed<Option<string>[]>(() =>
    this.ctx.branches().map((b) => ({ value: b.id, label: b.name })),
  );
}
