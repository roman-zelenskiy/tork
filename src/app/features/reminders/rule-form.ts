import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DbService } from '../../core/data/db.service';
import { MONTHS } from '../../core/domain/reminders.service';
import { FormDialog } from '../../shared/form';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { FormField } from '../../shared/ui/form-field';
import { TextField } from '../../shared/ui/text-field';
import { Select } from '../../shared/ui/select';
import { Switch } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';

/** Правило ТО: за пробігом, часом (що настане раніше) або сезоном */
@Component({
  selector: 'tk-rule-form',
  imports: [Icon, FormField, TextField, Select, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ editId ? 'Правило ТО' : 'Нове правило ТО' }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" aria-label="Закрити" (click)="requestClose()"><svg [lucideIcon]="I.x" aria-hidden="true"></svg></button>
    </div>
    <form class="flex min-h-0 flex-1 flex-col" novalidate (submit)="$event.preventDefault(); save()">
      <div class="dlg-body flex flex-col gap-4">
        <tk-field forId="rf-name" label="Назва" [required]="true" [error]="err('name')">
          <tk-text-field inputId="rf-name" [(value)]="name" placeholder="Заміна оливи" [maxLength]="50" [invalid]="!!err('name')" />
        </tk-field>
        <tk-field forId="rf-work" label="Робота, за якою рахуємо останнє виконання" [required]="true" [error]="err('work')">
          <tk-select inputId="rf-work" [options]="workOptions()" [(value)]="workCode" [invalid]="!!err('work')" />
        </tk-field>
        <div class="grid grid-cols-2 gap-3">
          <tk-field forId="rf-km" label="Кожні, км" [error]="err('cond')">
            <tk-text-field inputId="rf-km" mask="money" suffix="км" [(value)]="km" />
          </tk-field>
          <tk-field forId="rf-mo" label="Або кожні, місяців">
            <tk-text-field inputId="rf-mo" mask="money" suffix="міс." [(value)]="months" />
          </tk-field>
        </div>
        <tk-field forId="rf-season" label="Сезон (місяці нагадування)" hint="Для шин і кондиціонера — замість пробігу й часу">
          <tk-select inputId="rf-season" [multiple]="true" [options]="monthOptions" [(values)]="season" placeholder="Не сезонне" [manyLabel]="seasonLabel" />
        </tk-field>
        <tk-field forId="rf-tpl" label="Шаблон повідомлення">
          <tk-select inputId="rf-tpl" [options]="tplOptions()" [(value)]="templateId" placeholder="Обирати при розсилці" [clearable]="true" />
        </tk-field>
        <tk-switch [(checked)]="active">Правило активне</tk-switch>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" (click)="requestClose()">Скасувати</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Зберегти</button>
      </div>
    </form>
  `,
})
export class RuleForm extends FormDialog<boolean> {
  protected readonly I = I;
  private readonly db = inject(DbService);
  protected readonly editId = inject<{ id?: string }>(DIALOG_DATA)?.id ?? null;
  protected readonly monthOptions: Option<number>[] = MONTHS.map((m, i) => ({ value: i + 1, label: m }));
  protected readonly seasonLabel = (n: number) => `${n} міс.`;
  protected readonly workOptions = computed<Option<string>[]>(() => this.db.works.items().map((w) => ({ value: w.code, label: w.name, hint: w.code })));
  protected readonly tplOptions = computed<Option<string>[]>(() => this.db.templates.items().map((t) => ({ value: t.id, label: t.name })));
  protected readonly name = signal('');
  protected readonly workCode = signal<string | null>(null);
  protected readonly km = signal('');
  protected readonly months = signal('');
  protected readonly season = signal<number[]>([]);
  protected readonly templateId = signal<string | null>(null);
  protected readonly active = signal(true);

  constructor() {
    super();
    const r = this.db.rules.get(this.editId);
    if (r) {
      this.name.set(r.name);
      this.workCode.set(r.workCode);
      this.km.set(r.everyKm ? String(r.everyKm) : '');
      this.months.set(r.everyMonths ? String(r.everyMonths) : '');
      this.season.set(r.seasonMonths);
      this.templateId.set(r.templateId);
      this.active.set(r.active);
    }
    this.markPristine();
  }
  protected snapshot() {
    return [this.name(), this.workCode(), this.km(), this.months(), this.season(), this.templateId(), this.active()];
  }
  protected errors() {
    return {
      name: this.name().trim() ? null : 'Введіть назву',
      work: this.workCode() ? null : 'Оберіть роботу',
      cond: !this.km() && !this.months() && !this.season().length ? 'Задайте пробіг, час або сезон' : null,
    };
  }
  protected save(): Promise<void> {
    return this.submit(async () => {
      const payload = {
        name: this.name().trim(),
        workCode: this.workCode()!,
        everyKm: this.km() ? Number(this.km()) : null,
        everyMonths: this.months() ? Number(this.months()) : null,
        seasonMonths: [...this.season()].sort((a, b) => a - b),
        templateId: this.templateId(),
        active: this.active(),
      };
      if (this.editId) await this.db.rules.update(this.editId, payload, { log: `Змінено правило «${payload.name}»` });
      else await this.db.rules.create(payload, { log: `Нове правило «${payload.name}»` });
      this.toast.success('Правило збережено');
      return true;
    });
  }
}
