import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DbService } from '../../core/data/db.service';
import { ApprovalItem, Priority } from '../../core/data/models';
import { formatPlate } from '../../core/data/plates';
import { ApprovalsService, PRIORITY_LABEL } from '../../core/domain/approvals.service';
import { firstName } from '../../core/domain/messages';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { fmtDateTime, fmtMoney } from '../../shared/format';

const RANK: Record<Priority, number> = { must: 0, recommended: 1, later: 2 };
const NOTE: Record<Priority, string> = {
  must: 'Впливає на безпеку або може спричинити дорожчий ремонт',
  recommended: 'Варто зробити найближчим часом',
  later: 'Можна запланувати на наступний візит',
};

/**
 * Сторінка для клієнта за посиланням з SMS/Viber. Окремий стиль, без CRM:
 * великі шрифти, одна колонка, рішення по кожній позиції, підсумок унизу.
 * Відповідь записується в localStorage — вкладка CRM отримує її миттєво.
 */
@Component({
  selector: 'tk-client-approval',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'client-page block min-h-dvh' },
  template: `
    <header class="border-b border-[#ece7dd] bg-white">
      <div class="mx-auto flex max-w-xl items-center gap-3 px-5 py-4">
        <span class="grid size-9 place-items-center rounded-xl bg-[#e8a93a] text-[15px] font-bold text-[#2a1d05]" aria-hidden="true">Т</span>
        <div class="min-w-0 flex-1">
          <div class="text-[15px] font-semibold">{{ service() }}</div>
          <div class="text-[12px] text-[#6f695e]">{{ branch()?.name }}{{ branch() ? ', ' + branch()!.address : '' }}</div>
        </div>
        @if (branch(); as b) {
          <a [href]="'tel:' + b.phone" class="c-btn c-btn-ghost" aria-label="Подзвонити в сервіс"><svg [lucideIcon]="I.phone" [size]="18" aria-hidden="true"></svg></a>
        }
      </div>
    </header>

    <main class="mx-auto max-w-xl px-5 pt-6 pb-40">
      @if (!db.ready()) {
        <div class="c-skel mb-3 h-7 w-3/4"></div>
        <div class="c-skel mb-8 h-4 w-1/2"></div>
        @for (i of [1, 2, 3]; track i) {
          <div class="c-skel mb-3 h-36"></div>
        }
      } @else if (!approval() || approval()!.status === 'cancelled') {
        <div class="py-16 text-center">
          <div class="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#f6f1e7] text-[#8a5807]"><svg [lucideIcon]="I.link" [size]="24" aria-hidden="true"></svg></div>
          <h1 class="m-0 text-[22px] font-semibold">Посилання неактуальне</h1>
          <p class="mx-auto mt-2 max-w-sm text-[15px] text-[#5c574e]">Можливо, сервіс надіслав оновлені рекомендації. Перевірте останнє повідомлення або зателефонуйте нам.</p>
        </div>
      } @else if (done() || approval()!.status === 'answered') {
        @let a = approval()!;
        <div class="py-8 text-center" role="status">
          <div class="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#e5f3e8] text-[#2c6e3f]"><svg [lucideIcon]="I.check" [size]="30" [strokeWidth]="2.5" aria-hidden="true"></svg></div>
          <h1 class="m-0 text-[24px] font-semibold">Дякуємо, відповідь отримано</h1>
          <p class="mx-auto mt-2 max-w-sm text-[15px] text-[#5c574e]">Майстер уже бачить ваш вибір. Повідомимо, коли {{ carName() }} буде готовий.</p>
        </div>
        <section class="c-card p-5">
          <h2 class="m-0 mb-3 text-[15px] font-semibold">Ваш вибір{{ a.answeredAt ? ' від ' + dt(a.answeredAt) : '' }}</h2>
          @for (i of a.items; track i.lineId) {
            <div class="flex items-start gap-3 border-t border-[#ece7dd] py-2.5 text-[15px] first:border-0">
              <span class="mt-0.5 grid size-5 flex-none place-items-center rounded-full" [class]="i.decision === 'approved' ? 'bg-[#2c6e3f] text-white' : 'bg-[#ece7dd] text-[#6f695e]'">
                <svg [lucideIcon]="i.decision === 'approved' ? I.check : I.minus" [size]="12" [strokeWidth]="3" aria-hidden="true"></svg>
              </span>
              <span class="min-w-0 flex-1" [class.c-muted]="i.decision !== 'approved'">{{ i.title }}<span class="sr-only">{{ i.decision === 'approved' ? ': погоджено' : ': відкладено' }}</span></span>
              <span class="num" [class.line-through]="i.decision !== 'approved'" [class.c-muted]="i.decision !== 'approved'">{{ money(i.price) }}</span>
            </div>
          }
          <div class="mt-2 flex justify-between border-t border-[#26231f] pt-3 text-[16px] font-semibold"><span>Погоджено</span><span class="num">{{ money(sumOf(a.items)) }}</span></div>
        </section>
      } @else {
        @let a = approval()!;
        <p class="m-0 text-[14px] text-[#6f695e]">{{ greeting() }}</p>
        <h1 class="mt-1 mb-2 text-[26px] leading-tight font-semibold tracking-[-0.01em]">Рекомендації для {{ carName() }}</h1>
        <p class="m-0 mb-6 flex flex-wrap items-center gap-2 text-[14px] text-[#5c574e]">
          <span class="c-plate">{{ plate() }}</span>Діагностика завершена {{ dt(a.sentAt) }}. Позначте, що робимо зараз.
        </p>

        @for (g of groups(); track g.priority) {
          <section class="mb-6" [attr.aria-labelledby]="'g-' + g.priority">
            <h2 [id]="'g-' + g.priority" class="m-0 flex items-center gap-2 text-[16px] font-semibold">
              <span class="size-2.5 rounded-full" [style.background]="dot(g.priority)" aria-hidden="true"></span>{{ plabel(g.priority) }}
            </h2>
            <p class="mt-0.5 mb-3 text-[13px] text-[#6f695e]">{{ note(g.priority) }}</p>
            @for (i of g.items; track i.lineId) {
              @let on = choice()[i.lineId] === 'approved';
              <article class="c-card mb-3 overflow-hidden" [class.c-card-on]="on">
                @if (i.photos.length) {
                  <div class="flex snap-x gap-1 overflow-x-auto">
                    @for (p of i.photos; track $index) {
                      <img [src]="p" [alt]="'Фото: ' + i.title" class="h-44 w-full flex-none snap-center object-cover" loading="lazy" />
                    }
                  </div>
                }
                <div class="p-4">
                  <div class="flex items-start gap-3">
                    <h3 class="m-0 flex-1 text-[16px] leading-snug font-semibold">{{ i.title }}</h3>
                    <span class="text-[16px] font-semibold whitespace-nowrap num">{{ money(i.price) }}</span>
                  </div>
                  @if (i.description) {
                    <p class="mt-1.5 mb-0 text-[14px] leading-relaxed text-[#5c574e]">{{ i.description }}</p>
                  }
                  <div class="mt-3 grid grid-cols-2 gap-2" role="radiogroup" [attr.aria-label]="'Рішення: ' + i.title">
                    <button type="button" role="radio" class="c-choice" [class.c-choice-yes]="on" [attr.aria-checked]="on" (click)="set(i.lineId, 'approved')">
                      <svg [lucideIcon]="I.check" [size]="18" aria-hidden="true"></svg>Робимо
                    </button>
                    <button type="button" role="radio" class="c-choice" [class.c-choice-no]="choice()[i.lineId] === 'declined'" [attr.aria-checked]="choice()[i.lineId] === 'declined'" (click)="set(i.lineId, 'declined')">
                      <svg [lucideIcon]="I.clock" [size]="18" aria-hidden="true"></svg>Пізніше
                    </button>
                  </div>
                </div>
              </article>
            }
          </section>
        }

        <label class="mb-2 block text-[14px] font-medium" for="c-comment">Коментар для майстра</label>
        <textarea id="c-comment" class="c-input" rows="3" maxlength="300" placeholder="Наприклад: зателефонуйте перед заміною дисків" [value]="comment()" (input)="comment.set($any($event.target).value)"></textarea>
      }
    </main>

    @if (db.ready() && approval()?.status === 'sent' && !done()) {
      <div class="fixed inset-x-0 bottom-0 border-t border-[#ece7dd] bg-white/95 backdrop-blur" role="region" aria-label="Підсумок">
        <div class="mx-auto flex max-w-xl items-center gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <div class="text-[12px] text-[#6f695e]">Погоджено {{ approvedCount() }} з {{ approval()!.items.length }}</div>
            <div class="text-[20px] font-semibold num" aria-live="polite">{{ money(total()) }}</div>
          </div>
          <button type="button" class="c-btn c-btn-primary" [disabled]="busy()" [attr.aria-busy]="busy()" (click)="submit()">
            @if (busy()) {
              <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
            }
            Підтвердити
          </button>
        </div>
        @if (error()) {
          <p class="mx-auto max-w-xl px-5 pb-3 text-[13px] text-[#b4392b]" role="alert">{{ error() }}</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      color-scheme: light;
      background: #faf8f4;
      color: #26231f;
      font-size: 15px;
    }
    .c-card {
      background: #fff;
      border: 1px solid #ece7dd;
      border-radius: 18px;
      box-shadow: 0 1px 2px rgb(60 45 20 / 0.05);
      transition:
        border-color 150ms ease,
        box-shadow 150ms ease;
    }
    .c-muted {
      color: #8a847a;
    }
    .c-card-on {
      border-color: #2c6e3f;
      box-shadow: 0 0 0 1px #2c6e3f;
    }
    .c-choice {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 46px;
      border-radius: 12px;
      border: 1.5px solid #e2dccf;
      background: #fff;
      color: #3d3a35;
      font: 600 15px/1 var(--font-sans);
      transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
    }
    .c-choice:hover {
      border-color: #bdb5a5;
    }
    .c-choice-yes {
      background: #2c6e3f;
      border-color: #2c6e3f;
      color: #fff;
    }
    .c-choice-yes:hover {
      border-color: #2c6e3f;
    }
    .c-choice-no {
      background: #f3efe7;
      border-color: #8a847a;
      color: #26231f;
    }
    .c-choice:focus-visible,
    .c-btn:focus-visible,
    .c-input:focus-visible {
      outline: 3px solid #c98a1c;
      outline-offset: 2px;
    }
    .c-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 48px;
      padding: 0 22px;
      border-radius: 14px;
      border: 0;
      font: 600 16px/1 var(--font-sans);
    }
    .c-btn-primary {
      background: #26231f;
      color: #fff;
    }
    .c-btn-primary:hover {
      background: #3d3a35;
    }
    .c-btn-primary:disabled {
      opacity: 0.6;
    }
    .c-btn-ghost {
      width: 44px;
      padding: 0;
      background: #f6f1e7;
      color: #26231f;
    }
    .c-input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1.5px solid #e2dccf;
      background: #fff;
      color: #26231f;
      font: 15px/1.5 var(--font-sans);
      resize: vertical;
    }
    .c-plate {
      display: inline-block;
      padding: 1px 6px;
      border: 1.5px solid #26231f;
      border-radius: 4px;
      font: 600 13px/1.4 var(--font-mono);
      background: #fff;
    }
    .c-skel {
      border-radius: 14px;
      background: linear-gradient(90deg, #f0ebe2 0%, #e7e1d6 50%, #f0ebe2 100%);
      background-size: 200% 100%;
      animation: skeleton 1.4s ease-in-out infinite;
    }
  `,
})
export class ClientApproval {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly approvals = inject(ApprovalsService);
  private readonly title = inject(Title);
  readonly token = input.required<string>();
  protected readonly money = fmtMoney;
  protected readonly dt = fmtDateTime;
  protected readonly choice = signal<Record<string, 'approved' | 'declined'>>({});
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly approval = computed(() => this.db.approvals.items().find((a) => a.token === this.token()));
  private readonly order = computed(() => this.db.orders.get(this.approval()?.orderId));
  private readonly car = computed(() => this.db.cars.get(this.order()?.carId));
  private readonly client = computed(() => this.db.clients.get(this.order()?.clientId));
  protected readonly branch = computed(() => this.db.branches.get(this.order()?.branchId));
  protected readonly service = computed(() => this.db.settings()?.serviceName ?? 'Торк');
  protected readonly carName = computed(() => (this.car() ? `${this.car()!.make} ${this.car()!.model}` : 'вашого авто'));
  protected readonly plate = computed(() => (this.car() ? formatPlate(this.car()!.plate) : ''));
  protected readonly greeting = computed(() => (this.client() ? `${firstName(this.client()!.name)}, вітаємо!` : 'Вітаємо!'));
  protected readonly groups = computed(() => {
    const items = [...(this.approval()?.items ?? [])].sort((a, b) => RANK[a.priority] - RANK[b.priority]);
    return (['must', 'recommended', 'later'] as Priority[]).map((p) => ({ priority: p, items: items.filter((i) => i.priority === p) })).filter((g) => g.items.length);
  });
  protected readonly approvedCount = computed(() => Object.values(this.choice()).filter((v) => v === 'approved').length);
  protected readonly total = computed(() => (this.approval()?.items ?? []).filter((i) => this.choice()[i.lineId] === 'approved').reduce((s, i) => s + i.price, 0));

  constructor() {
    let inited = '';
    effect(() => {
      const a = this.approval();
      if (!a || inited === a.id) return;
      inited = a.id;
      this.title.setTitle(`Погодження робіт — ${this.service()}`);
      // за замовчуванням: обов’язкові — «Робимо», решта — без вибору (клієнт обирає сам)
      const init: Record<string, 'approved' | 'declined'> = {};
      for (const i of a.items) if (i.priority === 'must') init[i.lineId] = 'approved';
      this.choice.set(init);
    });
  }

  protected plabel(p: Priority): string {
    return PRIORITY_LABEL[p];
  }
  protected note(p: Priority): string {
    return NOTE[p];
  }
  protected dot(p: Priority): string {
    return p === 'must' ? '#b4392b' : p === 'recommended' ? '#c98a1c' : '#34558f';
  }
  protected sumOf(items: ApprovalItem[]): number {
    return items.filter((i) => i.decision === 'approved').reduce((s, i) => s + i.price, 0);
  }
  protected set(id: string, v: 'approved' | 'declined'): void {
    this.choice.update((c) => ({ ...c, [id]: v }));
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    const a = this.approval()!;
    const missing = a.items.filter((i) => !this.choice()[i.lineId]);
    if (missing.length) {
      this.error.set(`Оберіть «Робимо» або «Пізніше» для: ${missing.map((m) => m.title).join(', ')}`);
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.approvals.answer(a, this.choice(), this.comment());
      this.done.set(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Не вдалося надіслати відповідь. Спробуйте ще раз.');
    } finally {
      this.busy.set(false);
    }
  }
}
