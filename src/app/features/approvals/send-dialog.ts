import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { Channel, Order } from '../../core/data/models';
import { ApprovalsService } from '../../core/domain/approvals.service';
import { smsSegments } from '../../core/domain/messages';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { TextField } from '../../shared/ui/text-field';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { fmtPhone } from '../../shared/format';
import { MessagePreview } from '../../shared/ui/message-preview';
import { appUrl, appUrlShort } from '../../shared/app-url';

/** Надсилання погодження: канал, текст і прев’ю повідомлення на телефоні (імітація) */
@Component({
  selector: 'tk-send-dialog',
  imports: [Icon, TextField, RadioGroup, MessagePreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg-head"><div><h2>Надіслати на погодження</h2><p>{{ client()?.name }}, {{ phone(client()?.phone ?? '') }}</p></div></div>
    <div class="dlg-body grid gap-5 md:grid-cols-[1fr_260px]">
      <div class="flex flex-col gap-3">
        <tk-radio-group variant="segmented" ariaLabel="Канал" [options]="channels" [(value)]="channel" />
        <label class="label" for="sd-text">Текст повідомлення</label>
        <tk-text-field inputId="sd-text" [multiline]="true" [rows]="5" [maxLength]="480" [(value)]="text" />
        <p class="m-0 text-xs text-ink-3">
          {{ '{' }}посилання{{ '}' }} буде замінено на персональне посилання.
          @if (channel() === 'sms') {
            {{ segments() }} SMS-сегмент(и).
          }
        </p>
        @if (!client()?.allowMessages) {
          <p class="m-0 flex gap-2 rounded-lg bg-accent-soft p-2.5 text-[13px] text-accent-ink"><svg [lucideIcon]="I.info" class="mt-0.5 flex-none" aria-hidden="true"></svg>Клієнт не давав згоди на розсилки, але сервісні повідомлення щодо його авто дозволені.</p>
        }
        <p class="m-0 text-xs text-ink-3">Демо: повідомлення не надсилається насправді — відкрийте клієнтську сторінку в новій вкладці.</p>
      </div>
      <tk-message-preview [channel]="channel() ?? 'viber'" [text]="previewText()" [sender]="sender()" />
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="send()"><svg [lucideIcon]="I.send" aria-hidden="true"></svg>Надіслати</button>
    </div>
  `,
})
export class SendDialog extends FormDialog<string> {
  protected readonly I = I;
  protected readonly phone = fmtPhone;
  private readonly db = inject(DbService);
  private readonly approvals = inject(ApprovalsService);
  private readonly order = inject<Order>(DIALOG_DATA);
  protected readonly client = computed(() => this.db.clients.get(this.order.clientId));
  protected readonly sender = computed(() => this.db.settings()?.serviceName ?? 'Торк');
  protected readonly channels: Option<Channel>[] = [
    { value: 'viber', label: 'Viber' },
    { value: 'sms', label: 'SMS' },
  ];
  protected readonly channel = signal<Channel | null>('viber');
  protected readonly text = signal(this.approvals.defaultMessage(this.order));
  protected readonly previewText = computed(() => this.text().replaceAll('{посилання}', appUrlShort('pogodzhennia/…')));
  protected readonly segments = computed(() => smsSegments(this.previewText()));

  constructor() {
    super();
    this.markPristine();
  }
  protected snapshot() {
    return [this.channel(), this.text()];
  }
  protected errors() {
    return { text: this.text().trim() ? null : 'Введіть текст' };
  }
  protected send(): Promise<void> {
    return this.submit(async () => {
      const draft = this.text();
      const a = await this.approvals.send(this.db.orders.get(this.order.id)!, draft, this.channel() ?? 'viber');
      const full = draft.replaceAll('{посилання}', this.approvals.link(a));
      await this.db.approvals.update(a.id, { message: full }, { log: false });
      this.toast.success('Погодження надіслано', { label: 'Відкрити як клієнт', run: () => void window.open(appUrl(`pogodzhennia/${a.token}`), '_blank', 'noopener') });
      return a.token;
    });
  }
}
