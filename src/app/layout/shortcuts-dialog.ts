import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { Icon } from '../shared/ui/icon';
import { I } from '../shared/icons';
import { HotkeysService } from '../core/ui/hotkeys.service';
import { L } from '../core/i18n';

@Component({
  selector: 'tk-shortcuts-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg-head items-center!">
      <h2 class="flex-1">{{ L('Гарячі клавіші', 'Keyboard shortcuts') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="L('Закрити', 'Close')" (click)="ref.close()">
        <svg [lucideIcon]="I.x" aria-hidden="true"></svg>
      </button>
    </div>
    <div class="dlg-body">
      <dl class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
        @for (h of hk.all; track h.combo) {
          <dt class="text-ink-2">{{ h.description }}</dt>
          <dd class="m-0"><span class="kbd">{{ hk.label(h.combo) }}</span></dd>
        }
        <dt class="text-ink-2">{{ L('Скасувати останню дію на табло', 'Undo the last change on the bay board') }}</dt>
        <dd class="m-0"><span class="kbd">{{ hk.label('mod+z') }}</span></dd>
      </dl>
    </div>
  `,
})
export class ShortcutsDialog {
  protected readonly L = L;
  protected readonly I = I;
  protected readonly hk = inject(HotkeysService);
  protected readonly ref = inject(DialogRef);
}
