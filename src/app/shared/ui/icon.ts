import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconNode } from '../icons';

/**
 * Іконка Lucide: <svg [lucideIcon]="I.wrench" [size]="18"></svg>.
 * Розмір 16 і товщина лінії 1.75 — єдині для всього застосунку.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- атрибут сумісний з Lucide: <svg [lucideIcon]>
  selector: 'svg[lucideIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    focusable: 'false',
    class: 'lucide',
    '[attr.width]': 'size()',
    '[attr.height]': 'size()',
    '[attr.stroke-width]': 'strokeWidth()',
  },
  template: `
    @for (n of lucideIcon(); track $index) {
      @let a = n[1];
      @switch (n[0]) {
        @case ('path') {
          <svg:path [attr.d]="a['d']" />
        }
        @case ('circle') {
          <svg:circle [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.r]="a['r']" [attr.fill]="a['fill'] ?? null" />
        }
        @case ('rect') {
          <svg:rect [attr.x]="a['x']" [attr.y]="a['y']" [attr.width]="a['width']" [attr.height]="a['height']" [attr.rx]="a['rx'] ?? null" [attr.ry]="a['ry'] ?? null" />
        }
        @case ('line') {
          <svg:line [attr.x1]="a['x1']" [attr.y1]="a['y1']" [attr.x2]="a['x2']" [attr.y2]="a['y2']" />
        }
        @case ('polyline') {
          <svg:polyline [attr.points]="a['points']" />
        }
        @case ('polygon') {
          <svg:polygon [attr.points]="a['points']" />
        }
        @case ('ellipse') {
          <svg:ellipse [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.rx]="a['rx']" [attr.ry]="a['ry']" />
        }
      }
    }
  `,
})
export class Icon {
  readonly lucideIcon = input.required<IconNode>();
  readonly size = input<number | string>(16);
  readonly strokeWidth = input<number | string>(1.75);
}
