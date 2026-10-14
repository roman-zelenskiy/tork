import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Channel } from '../../core/data/models';

/** Прев’ю повідомлення на екрані телефона: бульбашка SMS або Viber */
@Component({
  selector: 'tk-message-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'img', '[attr.aria-label]': '"Прев’ю повідомлення: " + text()' },
  template: `
    <div class="mx-auto w-[240px] rounded-[28px] border-[6px] border-[#26231f] bg-[#26231f] shadow-pop">
      <div class="overflow-hidden rounded-[22px]" [style.background]="channel() === 'viber' ? '#f4f1fb' : '#f2f2f4'">
        <div class="flex items-center gap-2 px-3 pt-4 pb-2 text-[11px] text-[#3d3a35]" [style.background]="channel() === 'viber' ? '#7360f2' : '#e9e9ec'">
          <span class="grid size-6 place-items-center rounded-full text-[10px] font-bold" [style.background]="channel() === 'viber' ? '#fff' : '#c9c6c0'" [style.color]="channel() === 'viber' ? '#7360f2' : '#3d3a35'">{{ sender().slice(0, 1) }}</span>
          <span class="font-semibold" [style.color]="channel() === 'viber' ? '#fff' : '#26231f'">{{ sender() }}</span>
          <span class="ml-auto" [style.color]="channel() === 'viber' ? '#e8e3ff' : '#6d6a64'">{{ channel() === 'viber' ? 'Viber' : 'SMS' }}</span>
        </div>
        <div class="min-h-[220px] p-3">
          <div class="max-w-[92%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[12px] leading-[1.45] break-words text-[#26231f] shadow-sm">
            {{ text() }}
            <div class="mt-1 text-right text-[10px] text-[#8a867f]">зараз</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MessagePreview {
  readonly channel = input<Channel>('viber');
  readonly text = input('');
  readonly sender = input('Торк');
}
