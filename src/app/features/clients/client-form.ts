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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Створення й редагування клієнта (бокова панель) */
@Component({
  selector: 'tk-client-form',
  imports: [Icon, FormField, TextField, RadioGroup, Switch, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1" id="cf-h">{{ editId ? 'Редагувати клієнта' : 'Новий клієнт' }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" aria-label="Закрити" (click)="requestClose()">
        <svg [lucideIcon]="I.x" aria-hidden="true"></svg>
      </button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()" aria-labelledby="cf-h">
      <div class="dlg-body flex flex-col gap-4">
        <tk-radio-group variant="segmented" ariaLabel="Тип клієнта" [options]="kinds" [(value)]="kind" />

        <tk-field forId="cf-name" [label]="kind() === 'company' ? 'Назва компанії' : 'Ім’я та прізвище'" [required]="true" [error]="err('name')">
          <tk-text-field
            inputId="cf-name"
            [(value)]="name"
            [placeholder]="kind() === 'company' ? 'ТОВ «Південьтранс»' : 'Олег Марченко'"
            [maxLength]="80"
            autocomplete="name"
            [invalid]="!!err('name')"
            describedBy="cf-name-err"
          />
        </tk-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <tk-field forId="cf-phone" label="Телефон" [required]="true" [error]="err('phone')" [hint]="dupPhoneHint()">
            <tk-text-field inputId="cf-phone" mask="phone" [(value)]="phone" [icon]="I.phone" autocomplete="tel" [invalid]="!!err('phone')" describedBy="cf-phone-err" />
          </tk-field>
          <tk-field forId="cf-email" label="Email" [error]="err('email')">
            <tk-text-field inputId="cf-email" type="email" [(value)]="email" placeholder="name@gmail.com" autocomplete="email" [invalid]="!!err('email')" describedBy="cf-email-err" />
          </tk-field>
        </div>

        <tk-field forId="cf-tags" label="Теги" hint="Наприклад, «постійний», «знижка 5%», «таксі»">
          <tk-tag-input inputId="cf-tags" [(tags)]="tags" [suggestions]="suggestions" />
        </tk-field>

        <tk-field forId="cf-notes" label="Нотатки" [error]="err('notes')">
          <tk-text-field inputId="cf-notes" [multiline]="true" [rows]="3" [(value)]="notes" [maxLength]="500" placeholder="Коли зручно дзвонити, побажання щодо запчастин…" />
        </tk-field>

        <tk-switch [(checked)]="allowMessages">
          Згода на SMS і Viber
          <span class="block text-xs text-ink-3">Нагадування про ТО й погодження робіт</span>
        </tk-switch>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()" [attr.aria-busy]="saving()">
          @if (saving()) {
            <svg [lucideIcon]="I.loader" class="animate-spin" aria-hidden="true"></svg>
          }
          {{ editId ? 'Зберегти зміни' : 'Створити клієнта' }}
        </button>
      </div>
    </form>
  `,
})
export class ClientForm extends FormDialog<string> {
  protected readonly I = I;
  private readonly db = inject(DbService);
  private readonly clients = inject(ClientsService);
  private readonly data = inject<{ id?: string; name?: string }>(DIALOG_DATA) ?? {};
  protected readonly editId = this.data.id ?? null;
  protected readonly suggestions = this.clients.allTags();

  protected readonly kinds: Option<ClientKind>[] = [
    { value: 'person', label: 'Фізособа' },
    { value: 'company', label: 'Компанія' },
  ];

  protected readonly kind = signal<ClientKind | null>('person');
  protected readonly name = signal(this.data.name ?? '');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly notes = signal('');
  protected readonly allowMessages = signal(true);

  private readonly dup = computed(() => this.clients.findByPhone(this.phone(), this.editId ?? undefined));
  protected readonly dupPhoneHint = computed(() => (this.dup() && !this.submitted() ? `Цей номер уже має ${this.dup()!.name}` : null));

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
      name: !name ? 'Введіть ім’я' : name.length < 3 ? 'Занадто коротко' : null,
      phone: !this.phone()
        ? 'Введіть телефон'
        : this.phone().length !== 13
          ? 'Номер неповний: +380 і 9 цифр'
          : this.dup()
            ? `Цей номер уже має ${this.dup()!.name}`
            : null,
      email: this.email() && !EMAIL.test(this.email().trim()) ? 'Перевірте email: name@domain.ua' : null,
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
        await this.db.clients.update(this.editId, payload, { log: `Змінено клієнта ${payload.name}` });
        this.toast.success('Зміни збережено');
        return this.editId;
      }
      const c = await this.db.clients.create(payload, { log: `Новий клієнт ${payload.name}` });
      this.toast.success(`Клієнта ${c.name} створено`);
      return c.id;
    });
  }
}
