import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { filter } from 'rxjs';
import { Icon } from '../shared/ui/icon';
import { I } from '../shared/icons';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { DbService } from '../core/data/db.service';
import { StorageService } from '../core/data/storage.service';
import { ErrorState } from '../shared/ui/states';
import { HotkeysService } from '../core/ui/hotkeys.service';
import { ThemeService } from '../core/ui/theme.service';
import { QuickActions } from '../core/ui/quick-actions.service';
import { Dialogs } from '../core/ui/dialogs.service';
import { CommandPalette } from './command-palette';
import { ShortcutsDialog } from './shortcuts-dialog';
import { ToastService } from '../core/ui/toast.service';

/** Оболонка CRM: сайдбар, топбар, банер сховища, вміст розділу */
@Component({
  selector: 'tk-shell',
  imports: [RouterOutlet, RouterLink, CdkTrapFocus, Icon, Sidebar, Topbar, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh' },
  template: `
    <a href="#main" class="sr-only z-[1200] rounded-md bg-surface px-3 py-2 shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Перейти до вмісту</a>

    <!-- десктоп -->
    <aside class="shell-aside no-print sticky top-0 hidden h-dvh flex-none border-r border-line bg-bg lg:block" aria-label="Головне меню">
      <tk-sidebar />
    </aside>

    <!-- мобільне меню -->
    @if (mobileNav()) {
      <div class="animate-fade fixed inset-0 z-[900] bg-[var(--overlay)] lg:hidden" (click)="mobileNav.set(false)" aria-hidden="true"></div>
      <aside
        class="animate-drawer fixed inset-y-0 left-0 z-[901] w-[min(280px,85vw)] border-r border-line bg-bg shadow-pop lg:hidden"
        aria-label="Головне меню"
        tabindex="-1"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (keydown.escape)="mobileNav.set(false)"
      >
        <tk-sidebar [mobile]="true" (navigate)="mobileNav.set(false)" />
      </aside>
    }

    <div class="flex min-w-0 flex-1 flex-col">
      <tk-topbar class="no-print" (menu)="mobileNav.set(true)" (openSearch)="openPalette()" />

      @if (storage.problem(); as p) {
        <div class="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-[13px] sm:px-6" [class]="p === 'quota' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-ink'" role="alert">
          <svg [lucideIcon]="I.alert" aria-hidden="true"></svg>
          <span class="flex-1">
            {{
              p === 'quota'
                ? 'Сховище браузера заповнене — останню зміну не збережено. Видаліть зайві фото або експортуйте дані.'
                : 'Браузер не дозволяє зберігати дані (приватний режим або заборона cookies). Зміни діятимуть до закриття вкладки.'
            }}
          </span>
          <a routerLink="/nalashtuvannia/dani" class="link font-medium">Керувати даними</a>
        </div>
      }

      <main id="main" tabindex="-1" class="min-w-0 flex-1 px-4 pt-5 pb-10 outline-none sm:px-6 lg:px-8">
        @if (db.loadError(); as err) {
          <tk-error title="Не вдалося відкрити базу" [text]="err" (retry)="retry()" />
        } @else {
          <router-outlet />
        }
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  protected readonly storage = inject(StorageService);
  protected readonly mobileNav = signal(false);
  private readonly dialogs = inject(Dialogs);
  private readonly theme = inject(ThemeService);
  private readonly quick = inject(QuickActions);
  private readonly hotkeys = inject(HotkeysService);
  private readonly router = inject(Router);

  constructor() {
    const off = [
      this.hotkeys.register({ combo: 'mod+k', description: 'Командна палітра', handler: () => this.openPalette(), allowInInput: true }),
      this.hotkeys.register({ combo: 'n', description: 'Новий наряд', handler: () => void this.quick.newOrder() }),
      this.hotkeys.register({ combo: '[', description: 'Згорнути/розгорнути меню', handler: () => void this.theme.toggleSidebar() }),
      this.hotkeys.register({ combo: 'shift+?', description: 'Гарячі клавіші', handler: () => this.dialogs.open(ShortcutsDialog, null, { size: 'sm', label: 'Гарячі клавіші' }) }),
      this.hotkeys.register({ combo: 't', description: 'Табло постів', handler: () => void this.router.navigate(['/tablo']) }),
      this.hotkeys.register({ combo: 'k', description: 'Канбан нарядів', handler: () => void this.router.navigate(['/naryady/kanban']) }),
    ];
    inject(DestroyRef).onDestroy(() => off.forEach((f) => f()));

    // відповідь клієнта на погодження (з іншої вкладки) — тост із переходом до наряду
    const toast = inject(ToastService);
    const seen = new Set<string>();
    effect(() => {
      const ch = this.db.externalChange();
      if (!ch || ch.name !== 'notifications') return;
      untracked(() => {
        for (const n of this.db.notifications.items()) {
          if (n.read || seen.has(n.id) || n.kind !== 'approval' || Date.parse(n.createdAt) < ch.at - 10000) continue;
          seen.add(n.id);
          toast.info(`${n.title}. ${n.text}`, n.link ? { label: 'Відкрити', run: () => void this.router.navigateByUrl(n.link! + '#pogodzhennia') } : undefined);
        }
      });
    });

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // після переходу фокус — на вміст (для скрінрідерів), мобільне меню закривається
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.mobileNav.set(false));
    }
  }

  private paletteOpen = false;
  openPalette(): void {
    if (this.paletteOpen) return;
    this.paletteOpen = true;
    const ref = this.dialogs.open(CommandPalette, null, { size: 'md', top: true, label: 'Командна палітра' });
    ref.closed.subscribe(() => (this.paletteOpen = false));
  }

  protected retry(): void {
    this.db.loadError.set(null);
    void this.db.init();
  }
}
