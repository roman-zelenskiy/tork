import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { ThemeService, ThemeMode } from '../../core/ui/theme.service';
import { ToastService } from '../../core/ui/toast.service';
import { HotkeysService } from '../../core/ui/hotkeys.service';
import { HasUnsaved } from '../../shared/form';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { normPhone } from '../../shared/format';
import { SettingsHeader } from './settings-header';
import { L } from '../../core/i18n';

/** Загальні налаштування сервісу: реквізити, валюта, крок табло, філія й тема за замовчуванням */
@Component({
  selector: 'tk-settings-page',
  imports: [RouterLink, FormField, TextField, Select, RadioGroup, SettingsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-settings-header />
    @if (!db.ready()) {
      <div class="skeleton h-96 max-w-3xl"></div>
    } @else {
      <form class="flex max-w-3xl flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
        <section class="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="s-org">
          <h2 id="s-org" class="m-0 text-[15px] font-semibold sm:col-span-2">{{ L('Сервіс', 'Service') }}</h2>
          <tk-field class="sm:col-span-2" forId="st-name" [label]="L('Назва (у повідомленнях і друкованих формах)', 'Name (in messages and printed forms)')" [required]="true" [error]="err('name')">
            <tk-text-field inputId="st-name" [(value)]="name" [maxLength]="40" [invalid]="!!err('name')" />
          </tk-field>
          <tk-field forId="st-phone" [label]="L('Телефон', 'Phone')" [error]="err('phone')">
            <tk-text-field inputId="st-phone" mask="phone" [(value)]="phone" [invalid]="!!err('phone')" />
          </tk-field>
          <tk-field forId="st-email" label="Email" [error]="err('email')">
            <tk-text-field inputId="st-email" type="email" [(value)]="email" [invalid]="!!err('email')" />
          </tk-field>
          <tk-field forId="st-site" [label]="L('Сайт', 'Website')">
            <tk-text-field inputId="st-site" [(value)]="site" placeholder="tork.ua" />
          </tk-field>
          <tk-field forId="st-cur" [label]="L('Валюта', 'Currency')" [hint]="L('Гривня — єдина підтримувана валюта', 'The hryvnia is the only supported currency')">
            <tk-select inputId="st-cur" [options]="currencies" [value]="'UAH'" [disabled]="true" />
          </tk-field>
        </section>

        <section class="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="s-work">
          <h2 id="s-work" class="m-0 text-[15px] font-semibold sm:col-span-2">{{ L('Робота', 'Operations') }}</h2>
          <tk-field forId="st-branch" [label]="L('Філія за замовчуванням', 'Default branch')">
            <tk-select inputId="st-branch" [options]="branchOptions()" [(value)]="branchId" />
          </tk-field>
          <tk-field forId="st-slot" [label]="L('Крок табло й запису', 'Board and booking step')">
            <tk-select inputId="st-slot" [options]="slots" [(value)]="slotMin" />
          </tk-field>
          <p class="m-0 text-[13px] text-ink-2 sm:col-span-2">
            {{ L('Ставки нормо-години, пости й графік роботи — у', 'Standard-hour rates, bays and opening hours are in') }} <a routerLink="/dovidnyky/normo-hodyny" class="link">{{ L('довідниках', 'Directories') }}</a>.
          </p>
        </section>

        <section class="card flex flex-col gap-3 p-5" aria-labelledby="s-ui">
          <h2 id="s-ui" class="m-0 text-[15px] font-semibold">{{ L('Інтерфейс', 'Interface') }}</h2>
          <tk-radio-group variant="segmented" [ariaLabel]="L('Тема', 'Theme')" [options]="themes" [value]="theme.mode()" (changed)="theme.setMode($event)" />
          <p class="m-0 text-xs text-ink-3">{{ L('Тема зберігається одразу. Гарячі клавіші:', 'The theme is saved instantly. Shortcuts:') }} <span class="kbd">{{ hk.label('mod+k') }}</span> {{ L('пошук', 'search') }}, <span class="kbd">N</span> {{ L('новий наряд', 'new work order') }}, <span class="kbd">?</span> {{ L('усі клавіші', 'all shortcuts') }}.</p>
        </section>

        <div class="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <button type="button" class="btn" [disabled]="!dirty()" (click)="reset()">{{ L('Скасувати зміни', 'Discard changes') }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="!dirty() || saving()" [attr.aria-busy]="saving()">{{ L('Зберегти', 'Save') }}</button>
        </div>
      </form>
    }
  `,
})
export class SettingsPage implements HasUnsaved {
  protected readonly L = L;
  protected readonly db = inject(DbService);
  protected readonly theme = inject(ThemeService);
  protected readonly hk = inject(HotkeysService);
  private readonly toast = inject(ToastService);
  protected readonly currencies: Option<string>[] = [{ value: 'UAH', label: L('Гривня, ₴', 'Hryvnia, UAH') }];
  protected readonly slots: Option<number>[] = [15, 30].map((v) => ({ value: v, label: L(`${v} хвилин`, `${v} minutes`) }));
  protected readonly themes: Option<ThemeMode>[] = [
    { value: 'light', label: L('Світла', 'Light') },
    { value: 'dark', label: L('Темна', 'Dark') },
    { value: 'system', label: L('Як у системі', 'Match system') },
  ];
  protected readonly branchOptions = computed<Option<string>[]>(() => this.db.branches.items().map((b) => ({ value: b.id, label: b.name })));

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly site = signal('');
  protected readonly branchId = signal<string | null>(null);
  protected readonly slotMin = signal<number | null>(15);
  protected readonly saving = signal(false);
  private readonly tried = signal(false);
  private readonly initial = signal('');

  private snap(): string {
    return JSON.stringify([this.name(), this.phone(), this.email(), this.site(), this.branchId(), this.slotMin()]);
  }
  protected readonly dirty = computed(() => this.snap() !== this.initial());

  constructor() {
    effect(() => {
      const s = this.db.settings();
      if (s && !this.initial()) this.load();
    });
  }

  private load(): void {
    const s = this.db.settings()!;
    this.name.set(s.serviceName);
    this.phone.set(s.phone);
    this.email.set(s.email);
    this.site.set(s.site);
    this.branchId.set(s.branchId);
    this.slotMin.set(s.slotMin);
    this.initial.set(this.snap());
  }

  hasUnsaved(): boolean {
    return this.dirty();
  }

  protected err(k: 'name' | 'phone' | 'email'): string | null {
    if (!this.tried()) return null;
    if (k === 'name') return this.name().trim() ? null : L('Введіть назву', 'Enter a name');
    if (k === 'phone') return this.phone() && !normPhone(this.phone()) ? L('Номер неповний', 'Incomplete number') : null;
    return this.email() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email()) ? L('Перевірте email', 'Check the email') : null;
  }

  protected reset(): void {
    this.load();
    this.tried.set(false);
  }

  protected async save(): Promise<void> {
    this.tried.set(true);
    if (this.err('name') || this.err('phone') || this.err('email') || this.saving()) return;
    const s = this.db.settings()!;
    this.saving.set(true);
    try {
      await this.db.settingsRepo.update(
        s.id,
        { serviceName: this.name().trim(), phone: this.phone(), email: this.email().trim(), site: this.site().trim(), branchId: this.branchId(), slotMin: this.slotMin() ?? 15 },
        { log: L('Змінено налаштування', 'Settings changed') },
      );
      this.initial.set(this.snap());
      this.toast.success(L('Налаштування збережено', 'Settings saved'));
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
