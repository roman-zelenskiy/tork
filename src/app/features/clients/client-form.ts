import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { ClientKind } from '../../core/data/models';
import { ClientsService } from '../../core/domain/clients.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { RadioGroup, Switch } from '../../shared/ui/checkbox';
import { TagInput } from '../../shared/ui/tag-input';
import { Option } from '../../shared/ui/option';
import { L } from '../../core/i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Створення й редагування клієнта (бокова панель) */
@Component({
  selector: 'tk-client-form',
  imports: [Icon, FormField, TextField, RadioGroup, Switch, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1" id="cf-h">{{ editId ? L('Редагувати клієнта', 'Edit customer') : L('Новий клієнт', 'New customer') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="requestClose()">
        <svg [lucideIcon]="I.x" aria-hidden="true"></svg>
      </button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()" aria-labelledby="cf-h">
      <div class="dlg-body flex flex-col gap-4">
        <tk-radio-group variant="segmented" [ariaLabel]="L('Тип клієнта', 'Customer type')" [options]="kinds" [(value)]="kind" />

        <tk-field forId="cf-name" [label]="kind() === 'company' ? L('Назва компанії', 'Company name') : L('Ім’я та прізвище', 'Full name')" [required]="true" [error]="err('name')">
          <tk-text-field
            inputId="cf-name"
            [(value)]="name"
            [placeholder]="kind() === 'company' ? L('ТОВ «Південьтранс»', 'Pivdentrans LLC') : L('Олег Марченко', 'Oleh Marchenko')"
            [maxLength]="80"
            autocomplete="name"
            [invalid]="!!err('name')"
            describedBy="cf-name-err"
          />
        </tk-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <tk-field forId="cf-phone" [label]="L('Телефон', 'Phone')" [required]="true" [error]="err('phone')" [hint]="dupPhoneHint()">
            <tk-text-field inputId="cf-phone" mask="phone" [(value)]="phone" [icon]="I.phone" autocomplete="tel" [invalid]="!!err('phone')" describedBy="cf-phone-err" />
          </tk-field>
          <tk-field forId="cf-email" label="Email" [error]="err('email')">
            <tk-text-field inputId="cf-email" type="email" [(value)]="email" placeholder="name@gmail.com" autocomplete="email" [invalid]="!!err('email')" describedBy="cf-email-err" />
          </tk-field>
        </div>

        <tk-field forId="cf-tags" [label]="L('Теги', 'Tags')" [hint]="L('Наприклад, «постійний», «знижка 5%», «таксі»', 'For example, “regular”, “5% discount”, “taxi”')">
          <tk-tag-input inputId="cf-tags" [(tags)]="tags" [suggestions]="suggestions" />
        </tk-field>

        <tk-field forId="cf-notes" [label]="L('Нотатки', 'Notes')" [error]="err('notes')">
          <tk-text-field inputId="cf-notes" [multiline]="true" [rows]="3" [(value)]="notes" [maxLength]="500" [placeholder]="L('Коли зручно дзвонити, побажання щодо запчастин…', 'When to call, parts preferences…')" />
        </tk-field>

        <tk-switch [(checked)]="allowMessages">
          {{ L('Згода на SMS і Viber', 'Agrees to SMS and Viber') }}
          <span class="block text-xs text-ink-3">{{ L('Нагадування про ТО й погодження робіт', 'Service reminders and repair approvals') }}</span>
        </tk-switch>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">
          @if (saving()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          }
          {{ editId ? L('Зберегти зміни', 'Save changes') : L('Створити клієнта', 'Create customer') }}
        </button>
      </div>
    </form>
  `,
})
export class ClientForm extends FormDialog<string> {
  protected readonly L = L;
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly clients = inject(ClientsService);
  private readonly data = inject<{ id?: string; name?: string }>(DIALOG_DATA) ?? {};
  protected readonly editId = this.data.id ?? null;
  protected readonly suggestions = this.clients.allTags();

  protected readonly kinds: Option<ClientKind>[] = [
    { value: 'person', label: L('Фізособа', 'Individual') },
    { value: 'company', label: L('Компанія', 'Company') },
  ];

  protected readonly kind = signal<ClientKind | null>('person');
  protected readonly name = signal(this.data.name ?? '');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly notes = signal('');
  protected readonly allowMessages = signal(true);

  private readonly dup = computed(() => this.clients.findByPhone(this.phone(), this.editId ?? undefined));
  protected readonly dupPhoneHint = computed(() => (this.dup() && !this.submitted() ? L(`Цей номер уже має ${this.dup()!.name}`, `${this.dup()!.name} already has this number`) : null));

  constructor() {
    super();
    const c = this.db.clients.get(this.editId);
    if (c) {
      this.kind.set(c.kind);
      this.name.set(c.name);
      this.phone.set(c.phone);
      this.email.set(c.email);
      this.tags.set(c.tags);
      this.notes.set(c.notes);
      this.allowMessages.set(c.allowMessages);
    }
    this.markPristine();
  }

  protected snapshot() {
    return [this.kind(), this.name(), this.phone(), this.email(), this.tags(), this.notes(), this.allowMessages()];
  }

  protected errors() {
    const name = this.name().trim();
    return {
      name: !name ? L('Введіть ім’я', 'Enter a name') : name.length < 3 ? L('Занадто коротко', 'Too short') : null,
      phone: !this.phone()
        ? L('Введіть телефон', 'Enter a phone number')
        : this.phone().length !== 13
          ? L('Номер неповний: +380 і 9 цифр', 'Incomplete number: +380 and 9 digits')
          : this.dup()
            ? L(`Цей номер уже має ${this.dup()!.name}`, `${this.dup()!.name} already has this number`)
            : null,
      email: this.email() && !EMAIL.test(this.email().trim()) ? L('Перевірте email: name@domain.ua', 'Check the email: name@domain.com') : null,
    };
  }

  protected save(): Promise<void> {
    return this.submit(async () => {
      const payload = {
        kind: this.kind() ?? 'person',
        name: this.name().trim().replace(/\s+/g, ' '),
        phone: this.phone(),
        email: this.email().trim().toLowerCase(),
        tags: this.tags(),
        notes: this.notes().trim(),
        allowMessages: this.allowMessages(),
      };
      if (this.editId) {
        await this.db.clients.update(this.editId, payload, { log: L(`Змінено клієнта ${payload.name}`, `Customer ${payload.name} changed`) });
        this.toast.success(L('Зміни збережено', 'Changes saved'));
        return this.editId;
      }
      const c = await this.db.clients.create(payload, { log: L(`Новий клієнт ${payload.name}`, `New customer ${payload.name}`) });
      this.toast.success(L(`Клієнта ${c.name} створено`, `Customer ${c.name} created`));
      return c.id;
    });
  }
}
