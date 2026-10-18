import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Channel } from '../../core/data/models';
import { DueItem, RemindersService } from '../../core/domain/reminders.service';
import { TEMPLATE_VARS, smsSegments } from '../../core/domain/messages';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { MessagePreview } from '../../shared/ui/message-preview';
import { plural } from '../../shared/format';
import { BRAND, L, locale } from '../../core/i18n';

/** Масова розсилка за шаблоном зі змінними й прев’ю для кожного отримувача (імітація SMS/Viber) */
@Component({
  selector: 'tk-mailing-dialog',
  imports: [Icon, FormField, TextField, Select, RadioGroup, MessagePreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg-head"><div><h2>{{ L('Розсилка', 'Mailing') }}</h2><p>{{ allowed().length }} {{ plural(allowed().length, ['отримувач', 'отримувачі', 'отримувачів'], ['recipient', 'recipients']) }}{{ skipped() ? ', ' + skipped() + L(' без згоди пропущено', ' without consent skipped') : '' }}</p></div></div>
    <div class="dlg-body grid gap-5 md:grid-cols-[1fr_260px]">
      <div class="flex flex-col gap-3">
        <tk-field forId="ml-title" [label]="L('Назва розсилки', 'Mailing name')" [error]="err('title')">
          <tk-text-field inputId="ml-title" [(value)]="title" [maxLength]="60" />
        </tk-field>
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="ml-tpl" [label]="L('Шаблон', 'Template')">
            <tk-select inputId="ml-tpl" [options]="tplOptions()" [(value)]="tplId" />
          </tk-field>
          <div class="field"><span class="label">{{ L('Канал', 'Channel') }}</span><tk-radio-group variant="segmented" [ariaLabel]="L('Канал', 'Channel')" [options]="channels" [(value)]="channel" /></div>
        </div>
        <tk-field forId="ml-text" [label]="L('Текст', 'Text')" [error]="err('text')" [hint]="hint()">
          <tk-text-field inputId="ml-text" [multiline]="true" [rows]="5" [maxLength]="480" [(value)]="text" [invalid]="!!err('text')" />
        </tk-field>
        <div class="flex flex-wrap gap-1.5" [attr.aria-label]="L('Вставити змінну', 'Insert a variable')">
          @for (v of vars; track v.key) {
            <button type="button" class="chip clickable hover:bg-muted" [attr.aria-label]="L('Вставити ', 'Insert ') + v.hint" (click)="insert(v.key)">{{ v.key }}</button>
          }
        </div>
        <p class="m-0 text-xs text-ink-3">{{ L('Демо: повідомлення не надсилаються — розсилка зберігається в історії.', 'Demo: messages aren’t sent — the mailing is saved to history.') }}</p>
      </div>
      <div>
        <tk-message-preview [channel]="channel() ?? 'sms'" [text]="preview()" [sender]="db.settings()?.serviceName ?? brand" />
        @if (allowed().length > 1) {
          <div class="mt-2 flex items-center justify-center gap-2 text-xs text-ink-2">
            <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Попередній отримувач', 'Previous recipient')" (click)="step(-1)"><svg [lucideIcon]="I.chevronLeft" aria-hidden="true"></svg></button>
            <span class="num">{{ idx() + 1 }} / {{ allowed().length }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="L('Наступний отримувач', 'Next recipient')" (click)="step(1)"><svg [lucideIcon]="I.chevronRight" aria-hidden="true"></svg></button>
          </div>
        }
      </div>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn" (click)="requestClose()">{{ L('Скасувати', 'Cancel') }}</button>
      <button type="button" class="btn btn-primary" [disabled]="saving() || !allowed().length" (click)="send()"><svg [lucideIcon]="I.send" aria-hidden="true"></svg>{{ L('Надіслати', 'Send') }} {{ allowed().length }}</button>
    </div>
  `,
})
export class MailingDialog extends FormDialog<number> {
  protected readonly L = L;
  protected readonly brand = BRAND;
  protected readonly I = I;
  protected readonly plural = plural;
  protected readonly vars = TEMPLATE_VARS;
  protected readonly db = inject(DbService);
  private readonly rem = inject(RemindersService);
  private readonly items = inject<DueItem[]>(DIALOG_DATA);
  protected readonly channels: Option<Channel>[] = [
    { value: 'viber', label: 'Viber' },
    { value: 'sms', label: 'SMS' },
  ];
  protected readonly allowed = computed(() => this.items.filter((i) => i.client.allowMessages));
  protected readonly skipped = computed(() => this.items.length - this.allowed().length);
  protected readonly tplOptions = computed<Option<string>[]>(() => this.db.templates.items().map((t) => ({ value: t.id, label: t.name, hint: t.channel === 'sms' ? 'SMS' : 'Viber' })));
  private readonly guess = this.items.every((i) => i.kind === 'deferred') ? L('Відкладені', 'Deferred') : this.items.some((i) => /шин|tyre/i.test(i.title)) ? L('шин', 'tyre') : L('ТО', 'Service');
  protected readonly tplId = signal<string | null>(this.db.templates.items().find((t) => t.name.includes(this.guess))?.id ?? this.db.templates.items()[0]?.id ?? null);
  protected readonly channel = signal<Channel | null>('viber');
  protected readonly text = signal('');
  protected readonly title = signal(this.items.length === 1 ? `${this.items[0].title}: ${this.items[0].client.name}` : `${this.items[0]?.title ?? L('Нагадування', 'Reminder')} — ${new Date().toLocaleDateString(locale)}`);
  protected readonly idx = signal(0);
  protected readonly preview = computed(() => {
    const it = this.allowed()[this.idx()];
    return it ? this.rem.render({ text: this.text() }, it) : this.text();
  });
  protected readonly hint = computed(() => (this.channel() === 'sms' ? `${smsSegments(this.preview())} ${L('SMS-сегмент(и) на отримувача', 'SMS segment(s) per recipient')}` : null));

  constructor() {
    super();
    effect(() => {
      const t = this.db.templates.get(this.tplId());
      if (t) untracked(() => (this.text.set(t.text), this.channel.set(t.channel)));
    });
    this.markPristine();
  }
  protected step(d: number): void {
    const n = this.allowed().length;
    this.idx.set((this.idx() + d + n) % n);
  }
  protected insert(v: string): void {
    this.text.set(`${this.text()}${this.text().endsWith(' ') || !this.text() ? '' : ' '}${v}`);
  }
  protected snapshot() {
    return [this.tplId(), this.text(), this.title()];
  }
  protected errors() {
    return { title: this.title().trim() ? null : L('Назвіть розсилку', 'Name the mailing'), text: this.text().trim() ? null : L('Введіть текст', 'Enter the text') };
  }
  protected send(): Promise<void> {
    return this.submit(async () => {
      const n = await this.rem.send(this.items, this.db.templates.get(this.tplId()) ?? null, this.text(), this.channel() ?? 'sms', this.title().trim());
      this.toast.success(`${L('Розсилку надіслано', 'Mailing sent')}: ${n} ${plural(n, ['повідомлення', 'повідомлення', 'повідомлень'], ['message', 'messages'])}`);
      return n;
    });
  }
}
