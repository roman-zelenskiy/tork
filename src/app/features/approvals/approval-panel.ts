import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DbService } from '../../core/data/db.service';
import { Order, OrderWork, Priority } from '../../core/data/models';
import { ApprovalsService, PRIORITY_LABEL } from '../../core/domain/approvals.service';
import { workPrice } from '../../core/domain/order-math';
import { Dialogs } from '../../core/ui/dialogs.service';
import { ToastService } from '../../core/ui/toast.service';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { Tooltip } from '../../shared/ui/tooltip';
import { PhotoViewer } from '../../shared/ui/photo-viewer';
import { fmtAgo, fmtMoney } from '../../shared/format';
import { RecommendationDialog } from './recommendation-dialog';
import { SendDialog } from './send-dialog';
import { appUrl } from '../../shared/app-url';
import { L } from '../../core/i18n';

export const PRIORITY_TONE: Record<Priority, string> = { must: 'badge-danger', recommended: 'badge-accent', later: 'badge-info' };

/** Блок «Погодження клієнтом» у наряді */
@Component({
  selector: 'tk-approval-panel',
  imports: [Icon, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block scroll-mt-20' },
  template: `
    <section class="card" aria-labelledby="ap-h" [class.flash]="flash()">
      <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 id="ap-h" class="m-0 flex-1 text-[15px] font-semibold">{{ L('Погодження клієнтом', 'Customer approval') }}</h2>
        <button type="button" class="btn btn-sm no-print" [disabled]="closed()" (click)="addReco()"><svg [lucideIcon]="I.plus" aria-hidden="true"></svg>{{ L('Рекомендація', 'Recommendation') }}</button>
        <button type="button" class="btn btn-sm btn-primary no-print" [disabled]="!pendingCount() || closed()" (click)="send()">
          <svg [lucideIcon]="I.send" aria-hidden="true"></svg>{{ approval()?.status === 'sent' ? L('Надіслати повторно', 'Send again') : L('Надіслати клієнту', 'Send to customer') }}
        </button>
      </div>

      @if (approval(); as a) {
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5 text-[13px]" role="status">
          @switch (a.status) {
            @case ('sent') {
              <span class="badge badge-accent"><svg [lucideIcon]="I.clock" [size]="12" aria-hidden="true"></svg>{{ L('Чекає відповіді', 'Awaiting reply') }}</span>
              <span class="text-ink-2">{{ L('надіслано', 'sent') }} {{ ago(a.sentAt) }}</span>
            }
            @case ('answered') {
              <span class="badge badge-success"><svg [lucideIcon]="I.check" [size]="12" aria-hidden="true"></svg>{{ L('Клієнт відповів', 'Customer replied') }}</span>
              <span class="text-ink-2">{{ ago(a.answeredAt!) }}: {{ L('погоджено', 'approved') }} {{ approvedCount(a) }} {{ L('з', 'of') }} {{ a.items.length }}</span>
            }
            @case ('cancelled') {
              <span class="badge">{{ L('Скасовано', 'Cancelled') }}</span>
            }
          }
          <span class="ml-auto flex gap-1">
            <a class="btn btn-ghost btn-sm" [href]="'pogodzhennia/' + a.token" target="_blank" rel="noopener"><svg [lucideIcon]="I.external" aria-hidden="true"></svg>{{ L('Як бачить клієнт', 'Customer view') }}</a>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Скопіювати посилання', 'Copy link')" [tkTip]="L('Скопіювати посилання', 'Copy link')" (click)="copy(a.token)"><svg [lucideIcon]="I.copy" [size]="14" aria-hidden="true"></svg></button>
          </span>
        </div>
        @if (a.clientComment) {
          <p class="m-0 border-b border-line px-4 py-2.5 text-[13px]"><span class="text-ink-3">{{ L('Коментар клієнта:', 'Customer comment:') }}</span> {{ L('«', '“') }}{{ a.clientComment }}{{ L('»', '”') }}</p>
        }
      }

      @if (recos().length) {
        <ul class="m-0 list-none p-0">
          @for (w of recos(); track w.id) {
            <li class="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0">
              <div class="min-w-0 flex-1 basis-56">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge" [class]="tone(w.priority)">{{ plabel(w.priority) }}</span>
                  <span class="text-[13px] font-medium">{{ w.name }}</span>
                </div>
                @if (w.note) {
                  <p class="mt-1 mb-0 text-[13px] text-ink-2">{{ w.note }}</p>
                }
                @if (w.photos.length) {
                  <div class="mt-2 flex gap-1.5">
                    @for (p of w.photos; track $index) {
                      <button type="button" class="size-12 overflow-hidden rounded-md border border-line" [attr.aria-label]="L('Фото ', 'Photo ') + ($index + 1)" (click)="view(w.photos, $index)"><img [src]="p" alt="" class="size-full object-cover" /></button>
                    }
                  </div>
                }
              </div>
              <div class="flex flex-none items-center gap-2">
                <span class="text-[13px] font-medium num">{{ money(price(w)) }}</span>
                @if (w.decision === 'approved') {
                  <span class="badge badge-success">{{ L('Погоджено', 'Approved') }}</span>
                } @else if (w.decision === 'declined') {
                  <span class="badge badge-danger">{{ L('Відмова', 'Declined') }}</span>
                } @else {
                  <span class="flex gap-1 no-print">
                    <button type="button" class="btn btn-sm btn-icon" [attr.aria-label]="L('Клієнт погодив телефоном', 'Customer approved by phone')" [tkTip]="L('Погодив телефоном', 'Approved by phone')" (click)="decide(w, 'approved')"><svg [lucideIcon]="I.check" aria-hidden="true"></svg></button>
                    <button type="button" class="btn btn-sm btn-icon btn-danger" [attr.aria-label]="L('Клієнт відмовився', 'Customer declined')" [tkTip]="L('Відмовився', 'Declined')" (click)="decide(w, 'declined')"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
                  </span>
                }
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="m-0 px-4 py-5 text-[13px] text-ink-3">
          {{ L('Після діагностики додайте рекомендації з поясненням і фото — клієнт погодить їх за посиланням зі смартфона.', 'After diagnostics, add recommendations with explanations and photos — the customer approves them from a link on their phone.') }}
        </p>
      }
    </section>
  `,
})
export class ApprovalPanel {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly money = fmtMoney;
  private readonly db = inject(DbService);
  private readonly approvals = inject(ApprovalsService);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(ToastService);
  readonly order = input.required<Order>();

  protected readonly approval = computed(() => this.db.approvals.get(this.order().approvalId));
  protected readonly recos = computed(() => {
    const rank: Record<Priority, number> = { must: 0, recommended: 1, later: 2 };
    return this.order()
      .works.filter((w) => w.needsApproval)
      .sort((a, b) => rank[a.priority] - rank[b.priority]);
  });
  protected readonly pendingCount = computed(() => {
    const p = this.approvals.pending(this.order());
    return p.works.length + p.parts.length;
  });
  protected readonly closed = computed(() => this.order().status === 'vydano' || this.order().status === 'skasovano');
  /** Підсвітка, коли відповідь прийшла з іншої вкладки */
  protected readonly flash = computed(() => {
    const ch = this.db.externalChange();
    const a = this.approval();
    return !!ch && ch.name === 'approvals' && !!a?.answeredAt && Date.parse(a.answeredAt) > ch.at - 5000;
  });

  protected tone(p: Priority): string {
    return PRIORITY_TONE[p];
  }
  protected plabel(p: Priority): string {
    return PRIORITY_LABEL[p];
  }
  protected price(w: OrderWork): number {
    return workPrice(w);
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }
  protected approvedCount(a: { items: { decision: string | null }[] }): number {
    return a.items.filter((i) => i.decision === 'approved').length;
  }

  protected addReco(): void {
    this.dialogs.open(RecommendationDialog, this.order(), { drawer: true, label: L('Рекомендація', 'Recommendation') });
  }
  protected send(): void {
    this.dialogs.open(SendDialog, this.order(), { size: 'lg', label: L('Надіслати на погодження', 'Send for approval') });
  }
  protected view(photos: string[], index: number): void {
    this.dialogs.open(PhotoViewer, { photos, index }, { size: 'xl', label: L('Фото', 'Photos') });
  }
  protected async decide(w: OrderWork, d: 'approved' | 'declined'): Promise<void> {
    try {
      await this.approvals.decideByPhone(this.order(), w.id, d);
      this.toast.success(d === 'approved' ? L(`«${w.name}» погоджено`, `“${w.name}” approved`) : L(`«${w.name}»: відмова`, `“${w.name}” declined`));
    } catch (e) {
      this.toast.error(e);
    }
  }
  protected async copy(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(appUrl(`pogodzhennia/${token}`));
      this.toast.success(L('Посилання скопійовано', 'Link copied'));
    } catch {
      this.toast.error(L('Не вдалося скопіювати посилання', 'Couldn’t copy the link'));
    }
  }
}
