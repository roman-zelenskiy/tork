import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Icon } from '../shared/ui/icon';
import { I } from '../shared/icons';
import { DbService } from '../core/data/db.service';
import { AppNotification } from '../core/data/models';
import { fmtAgo } from '../shared/format';
import { EmptyState } from '../shared/ui/states';
import { Tooltip } from '../shared/ui/tooltip';
import { AppContext } from '../core/ui/app-context.service';
import { L } from '../core/i18n';

/** Центр сповіщень: дзвіночок у топбарі + панель (відповіді клієнтів, склад, наряди) */
@Component({
  selector: 'tk-notifications',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, CdkTrapFocus, Icon, EmptyState, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn btn-ghost btn-icon relative"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [attr.aria-label]="unread() ? L('Сповіщення: ' + unread() + ' непрочитаних', 'Notifications: ' + unread() + ' unread') : L('Сповіщення', 'Notifications')"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [tkTip]="L('Сповіщення', 'Notifications')"
      (click)="open.set(!open())"
    >
      <svg [lucideIcon]="I.bell" [size]="18" aria-hidden="true"></svg>
      @if (unread()) {
        <span class="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent num" aria-hidden="true">
          {{ unread() > 9 ? '9+' : unread() }}
        </span>
      }
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="tork-backdrop-clear"
      [cdkConnectedOverlayViewportMargin]="8"
      (backdropClick)="open.set(false)"
      (detach)="open.set(false)"
    >
      <div
        class="popover flex max-h-[min(520px,80dvh)] w-[min(380px,calc(100vw-16px))] flex-col"
        role="dialog"
        [attr.aria-label]="L('Сповіщення', 'Notifications')"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (keydown.escape)="open.set(false)"
      >
        <div class="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 class="m-0 flex-1 text-sm font-semibold">{{ L('Сповіщення', 'Notifications') }}</h2>
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="!unread()" (click)="markAll()">
            <svg [lucideIcon]="I.checkAll" aria-hidden="true"></svg>{{ L('Прочитати всі', 'Mark all as read') }}
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
          @for (n of items(); track n.id) {
            <button type="button" class="menu-item items-start! gap-3! py-2.5!" (click)="openItem(n)">
              <span class="mt-0.5 grid size-7 flex-none place-items-center rounded-full" [class]="toneBg(n)">
                <svg [lucideIcon]="icon(n)" [size]="14" aria-hidden="true"></svg>
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="truncate-1 flex-1 text-[13px]" [class.font-semibold]="!n.read">{{ n.title }}</span>
                  @if (!n.read) {
                    <span class="size-2 flex-none rounded-full bg-accent" [attr.aria-label]="L('непрочитане', 'unread')"></span>
                  }
                </span>
                <span class="mt-0.5 line-clamp-2 block text-xs leading-[1.45] text-ink-2">{{ n.text }}</span>
                <span class="mt-1 block text-[11px] text-ink-3">{{ ago(n.createdAt) }}</span>
              </span>
            </button>
          } @empty {
            <tk-empty art="bell" [title]="L('Нових сповіщень немає', 'No new notifications')" [text]="L('Тут з’являться відповіді клієнтів на погодження, низькі залишки й зміни нарядів.', 'Customer approval responses, low stock and work order changes will show up here.')" [compact]="true" />
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class Notifications {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly ctx = inject(AppContext);
  protected readonly open = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  ];

  protected readonly items = computed(() =>
    [...this.db.notifications.items()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40),
  );
  protected readonly unread = computed(() => this.db.notifications.items().filter((n) => !n.read).length);

  protected ago(iso: string): string {
    return fmtAgo(iso, this.ctx.now());
  }

  protected icon(n: AppNotification) {
    return n.kind === 'approval' ? I.message : n.kind === 'stock' ? I.package : n.kind === 'order' ? I.clipboardList : I.info;
  }
  protected toneBg(n: AppNotification): string {
    return n.kind === 'approval' ? 'bg-accent-soft text-accent-ink' : n.kind === 'stock' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info';
  }

  protected async openItem(n: AppNotification): Promise<void> {
    this.open.set(false);
    if (!n.read) void this.db.notifications.update(n.id, { read: true }, { log: false });
    if (n.link) await this.router.navigateByUrl(n.link);
  }

  protected async markAll(): Promise<void> {
    const now = new Date().toISOString();
    this.db.notifications.replaceAll(this.db.notifications.items().map((n) => (n.read ? n : { ...n, read: true, updatedAt: now })));
  }
}
