import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { Icon } from '../shared/ui/icon';
import { I, IconNode } from '../shared/icons';
import { DbService } from '../core/data/db.service';
import { ThemeService } from '../core/ui/theme.service';
import { QuickActions } from '../core/ui/quick-actions.service';
import { HotkeysService } from '../core/ui/hotkeys.service';
import { norm } from '../shared/ui/option';
import { formatPlate, normalizePlate } from '../core/data/plates';
import { STATUS_LABEL } from '../core/domain/order-math';
import { fmtPhone } from '../shared/format';
import { L } from '../core/i18n';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconNode;
  run: () => unknown;
  keywords?: string;
  mono?: boolean;
}

/**
 * Командна палітра (Ctrl/⌘+K): пошук клієнтів, авто (номер, VIN), нарядів, запчастин (SKU)
 * і швидкі дії. Повністю з клавіатури: ↑↓, Enter, Escape.
 */
@Component({
  selector: 'tk-command-palette',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex items-center gap-2.5 border-b border-line px-4">
      <svg [lucideIcon]="I.search" [size]="18" class="flex-none text-ink-3" aria-hidden="true"></svg>
      <input
        #input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="cmd-list"
        [attr.aria-label]="L('Пошук або команда', 'Search or command')"
        [attr.aria-activedescendant]="results().length ? 'cmd-' + active() : null"
        [placeholder]="L('Клієнт, номер авто, VIN, наряд, SKU або дія…', 'Customer, number plate, VIN, work order, SKU or action…')"
        autocomplete="off"
        spellcheck="false"
        class="h-13 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none"
        [value]="query()"
        (input)="query.set(input.value); active.set(0)"
        (keydown)="onKey($event)"
      />
      <span class="kbd hidden sm:inline-flex">Esc</span>
    </div>
    <div id="cmd-list" role="listbox" [attr.aria-label]="L('Результати', 'Results')" class="max-h-[min(440px,60dvh)] overflow-y-auto p-1.5">
      @for (c of results(); track c.id; let i = $index) {
        @if (c.group !== results()[i - 1]?.group) {
          <div class="menu-label" role="presentation">{{ c.group }}</div>
        }
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- фокус лишається в полі пошуку, вибір — Enter через aria-activedescendant -->
        <div
          role="option"
          class="menu-item h-9"
          [id]="'cmd-' + i"
          [class.active]="i === active()"
          [attr.aria-selected]="i === active()"
          (click)="exec(c)"
          (mousemove)="active.set(i)"
        >
          <svg [lucideIcon]="c.icon" aria-hidden="true"></svg>
          <span class="truncate-1 flex-1" [class.mono]="c.mono">{{ c.label }}</span>
          @if (c.hint) {
            <span class="truncate-1 max-w-[45%] text-xs text-ink-3">{{ c.hint }}</span>
          }
        </div>
      } @empty {
        <div class="px-3 py-8 text-center text-[13px] text-ink-3">
          {{ L('Нічого не знайдено за «' + query() + '». Спробуйте номер авто без пробілів або останні цифри телефону.', 'Nothing found for “' + query() + '”. Try the number plate without spaces or the last digits of a phone number.') }}
        </div>
      }
    </div>
    <div class="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3 sm:flex">
      <span><span class="kbd">↑</span> <span class="kbd">↓</span> {{ L('вибір', 'select') }}</span>
      <span><span class="kbd">Enter</span> {{ L('відкрити', 'open') }}</span>
      <span class="ml-auto"><span class="kbd">{{ hk.label('mod+k') }}</span> {{ L('палітра', 'palette') }}</span>
    </div>
  `,
})
export class CommandPalette {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly quick = inject(QuickActions);
  protected readonly hk = inject(HotkeysService);
  private readonly ref = inject(DialogRef);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  constructor() {
    effect(() => {
      const i = this.active();
      document.getElementById(`cmd-${i}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  private go(path: string | unknown[]): () => void {
    return () => void this.router.navigate(Array.isArray(path) ? path : [path]);
  }

  private readonly base: Cmd[] = [
    { id: 'a-order', group: L('Дії', 'Actions'), label: L('Новий наряд', 'New work order'), icon: I.plus, hint: 'N', run: () => this.quick.newOrder(), keywords: L('запис створити', 'booking create') },
    { id: 'a-client', group: L('Дії', 'Actions'), label: L('Новий клієнт', 'New customer'), icon: I.userPlus, run: () => this.quick.newClient(), keywords: L('створити додати', 'create add client') },
    { id: 'a-theme', group: L('Дії', 'Actions'), label: L('Перемкнути тему', 'Toggle theme'), icon: I.moon, run: () => this.theme.toggle(), keywords: L('темна світла', 'dark light') },
    { id: 'a-day', group: L('Дії', 'Actions'), label: L('Мій день механіка', 'Mechanic’s day'), icon: I.timer, run: this.go('/mekhaniky/den') },
    { id: 'n-dash', group: L('Перейти', 'Go to'), label: L('Огляд', 'Overview'), icon: I.dashboard, run: this.go('/'), keywords: L('аналітика дашборд', 'analytics dashboard') },
    { id: 'n-tablo', group: L('Перейти', 'Go to'), label: L('Табло постів', 'Bay board'), icon: I.calendarClock, run: this.go('/tablo'), keywords: L('розклад записи', 'schedule bookings') },
    { id: 'n-orders', group: L('Перейти', 'Go to'), label: L('Наряди', 'Work orders'), icon: I.clipboardList, run: this.go('/naryady') },
    { id: 'n-kanban', group: L('Перейти', 'Go to'), label: L('Канбан нарядів', 'Work order kanban'), icon: I.kanban, run: this.go('/naryady/kanban') },
    { id: 'n-appr', group: L('Перейти', 'Go to'), label: L('Погодження', 'Approvals'), icon: I.message, run: this.go('/naryady/pogodzhennia') },
    { id: 'n-clients', group: L('Перейти', 'Go to'), label: L('Клієнти', 'Customers'), icon: I.users, run: this.go('/kliyenty') },
    { id: 'n-rem', group: L('Перейти', 'Go to'), label: L('Нагадування й розсилки', 'Reminders and mailings'), icon: I.bellRing, run: this.go('/nahaduvannia') },
    { id: 'n-stock', group: L('Перейти', 'Go to'), label: L('Склад', 'Stock'), icon: I.boxes, run: this.go('/sklad') },
    { id: 'n-moves', group: L('Перейти', 'Go to'), label: L('Журнал рухів складу', 'Stock movement log'), icon: I.transfer, run: this.go('/sklad/rukh') },
    { id: 'n-purch', group: L('Перейти', 'Go to'), label: L('Закупівлі', 'Purchasing'), icon: I.truck, run: this.go('/sklad/zakupivli') },
    { id: 'n-mech', group: L('Перейти', 'Go to'), label: L('Механіки', 'Mechanics'), icon: I.wrench, run: this.go('/mekhaniky') },
    { id: 'n-pay', group: L('Перейти', 'Go to'), label: L('Зарплата', 'Payroll'), icon: I.wallet, run: this.go('/mekhaniky/zarplata') },
    { id: 'n-dir', group: L('Перейти', 'Go to'), label: L('Довідники', 'Directories'), icon: I.list, run: this.go('/dovidnyky') },
    { id: 'n-set', group: L('Перейти', 'Go to'), label: L('Налаштування', 'Settings'), icon: I.settings, run: this.go('/nalashtuvannia') },
    { id: 'n-data', group: L('Перейти', 'Go to'), label: L('Дані: експорт, імпорт, скидання', 'Data: export, import, reset'), icon: I.database, run: this.go('/nalashtuvannia/dani') },
  ];

  protected readonly results = computed<Cmd[]>(() => {
    const raw = this.query().trim();
    const q = norm(raw);
    if (!q) return this.base;
    const words = q.split(/\s+/);
    const hit = (s: string) => {
      const h = norm(s);
      return words.every((w) => h.includes(w));
    };
    const digits = raw.replace(/\D/g, '');
    const plateQ = normalizePlate(raw);
    const out: Cmd[] = this.base.filter((c) => hit(`${c.label} ${c.keywords ?? ''}`));

    const clients = this.db.clients
      .items()
      .filter((c) => hit(c.name) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
      .slice(0, 6);
    for (const c of clients)
      out.push({ id: c.id, group: L('Клієнти', 'Customers'), label: c.name, hint: fmtPhone(c.phone), icon: I.user, run: this.go(['/kliyenty', c.id]) });

    const cars = this.db.cars
      .items()
      .filter((c) => (plateQ.length >= 2 && c.plate.includes(plateQ)) || (raw.length >= 4 && c.vin.includes(raw.toUpperCase())) || hit(`${c.make} ${c.model}`))
      .slice(0, 6);
    for (const c of cars)
      out.push({ id: c.id, group: L('Авто', 'Cars'), label: `${formatPlate(c.plate)} · ${c.make} ${c.model}`, hint: c.vin, icon: I.car, run: this.go(['/avto', c.id]) });

    if (digits.length >= 2 || /^н|^№|^wo/i.test(raw)) {
      const num = raw.replace(/^№\s*/, '').toUpperCase();
      const orders = this.db.orders
        .items()
        .filter((o) => o.number.includes(num) || (digits.length >= 3 && o.number.replace(/\D/g, '').endsWith(digits)))
        .slice(0, 6);
      for (const o of orders) {
        const car = this.db.cars.get(o.carId);
        out.push({
          id: o.id,
          group: L('Наряди', 'Work orders'),
          label: `№ ${o.number}`,
          hint: `${STATUS_LABEL[o.status]} · ${car ? formatPlate(car.plate) : ''}`,
          icon: I.clipboardList,
          run: this.go(['/naryady', o.id]),
        });
      }
    }

    const parts = this.db.parts
      .items()
      .filter((p) => (raw.length >= 3 && norm(p.sku).includes(q.replace(/\s/g, ''))) || hit(`${p.name} ${p.brand}`))
      .slice(0, 5);
    for (const p of parts)
      out.push({ id: p.id, group: L('Запчастини', 'Parts'), label: `${p.brand} ${p.sku}`, hint: p.name, icon: I.package, mono: true, run: () => void this.router.navigate(['/sklad'], { queryParams: { q: p.sku } }) });

    return out.slice(0, 40);
  });

  protected exec(c: Cmd): void {
    this.ref.close();
    // дія запускається після закриття палітри — щоб нова модалка отримала фокус
    setTimeout(() => void c.run(), 0);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.results().length;
    if (e.key === 'ArrowDown') this.active.set(n ? (this.active() + 1) % n : 0);
    else if (e.key === 'ArrowUp') this.active.set(n ? (this.active() - 1 + n) % n : 0);
    else if (e.key === 'Enter') {
      const c = this.results()[this.active()];
      if (c) this.exec(c);
    } else return;
    e.preventDefault();
  }

  focus(): void {
    this.input().nativeElement.focus();
  }
}
