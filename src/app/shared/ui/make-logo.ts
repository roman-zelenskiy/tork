import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Спрощені геометричні знаки марок (лінійні, в кольорі теми) — щоб у списках
 * марку було видно з першого погляду. Невідома марка — монограма з двох літер.
 */
@Component({
  selector: 'tk-make-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-none', '[attr.title]': 'make()' },
  template: `
    <span
      class="grid place-items-center rounded-lg border border-line bg-surface text-ink-2"
      [style.width.px]="size()"
      [style.height.px]="size()"
      aria-hidden="true"
    >
      <svg [attr.width]="size() * 0.66" [attr.height]="size() * 0.66" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        @switch (key()) {
          @case ('skoda') {
            <circle cx="12" cy="12" r="10" />
            <path d="M5.5 13.5c3-1 5-3.5 6.5-7 1 2.5 2.5 3.5 5 3.5l-2 2.5-3 .5-2.5 3z" />
          }
          @case ('volkswagen') {
            <circle cx="12" cy="12" r="10" />
            <path d="M6.5 6.5 9.5 14l2.5-5 2.5 5 3-7.5M5 10l4.5 9.5L12 15l2.5 4.5L19 10" />
          }
          @case ('toyota') {
            <ellipse cx="12" cy="12" rx="10.5" ry="7" />
            <ellipse cx="12" cy="9.2" rx="6" ry="2.6" />
            <ellipse cx="12" cy="12.4" rx="2.4" ry="5.5" />
          }
          @case ('renault') {
            <path d="M12 2 5.5 12 12 22l6.5-10z" />
            <path d="M12 6.5 8.8 12 12 17.5 15.2 12z" />
          }
          @case ('hyundai') {
            <ellipse cx="12" cy="12" rx="10.5" ry="7" />
            <path d="M8.5 7.5 7 16.5M17 7.5l-1.5 9M8 11.8c2.5.8 5.5.8 8.3-.6" />
          }
          @case ('kia') {
            <path d="M2.5 16 5 8v8l4-8M9.5 16 12 8M13.5 16l2.5-8 2 5h-3.5M18.5 16l1-3" />
          }
          @case ('nissan') {
            <circle cx="12" cy="12" r="8.5" />
            <rect x="1.5" y="10" width="21" height="4" rx="1" />
          }
          @case ('mitsubishi') {
            <path d="M12 2.5 9.5 7l2.5 4.5L14.5 7zM12 11.5l-5 .1-2.6 4.4 5.1-.1zM12 11.5l5 .1 2.6 4.4-5.1-.1z" />
          }
          @case ('ford') {
            <ellipse cx="12" cy="12" rx="10.5" ry="6.5" />
            <path d="M10.5 9c-2-.6-4 .3-4 2.2 0 1.7 1.6 2.6 3.3 1.8M9 11.5h2.5M13 9.5v5M13 9.5h3M13 12h2.4M17.5 14.5c.3-1.7.8-3 2-4.2" />
          }
          @case ('mazda') {
            <ellipse cx="12" cy="12" rx="10" ry="8" />
            <path d="M4.5 12.5c3-3.5 5-5 7.5 2 2.5-7 4.5-5.5 7.5-2" />
          }
          @case ('bmw') {
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6.5" />
            <path d="M12 5.5v13M5.5 12h13" />
            <path d="M12 5.5A6.5 6.5 0 0 1 18.5 12H12zM12 18.5A6.5 6.5 0 0 1 5.5 12H12z" fill="currentColor" stroke="none" opacity=".35" />
          }
          @case ('audi') {
            <circle cx="5.5" cy="12" r="3.6" />
            <circle cx="9.8" cy="12" r="3.6" />
            <circle cx="14.2" cy="12" r="3.6" />
            <circle cx="18.5" cy="12" r="3.6" />
          }
          @case ('mercedes') {
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2v10l-8.7 5M12 12l8.7 5" />
          }
          @case ('daewoo') {
            <path d="M12 3c4.5 0 8 4 8 9.5-2-2-4.5-2.5-8-2.5S6 10.5 4 12.5C4 7 7.5 3 12 3z" />
            <path d="M4 14.5c2 2.5 4.5 3.5 8 3.5s6-1 8-3.5" />
          }
          @case ('chevrolet') {
            <path d="M2 10h6.5l1-2.5h5l-1 2.5H22l-2 4h-6.5l-1 2.5h-5l1-2.5H2z" />
          }
          @default {
            <text x="12" y="16" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor" stroke="none" font-family="IBM Plex Sans, sans-serif">
              {{ make().slice(0, 2).toUpperCase() }}
            </text>
          }
        }
      </svg>
    </span>
  `,
})
export class MakeLogo {
  readonly make = input.required<string>();
  readonly size = input(28);
  protected readonly key = computed(() => {
    const m = this.make().toLowerCase();
    if (m.startsWith('mercedes')) return 'mercedes';
    if (m === 'vw') return 'volkswagen';
    return m.split(/\s/)[0];
  });
}
