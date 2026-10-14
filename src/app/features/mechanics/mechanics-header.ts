import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';

@Component({
  selector: 'tk-mechanics-header',
  imports: [PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header [title]="title()" [subtitle]="subtitle()"><ng-content /></tk-page-header>
    <tk-tabs [items]="tabs" ariaLabel="Розділи механіків" />
  `,
})
export class MechanicsHeader {
  readonly title = input('Механіки');
  readonly subtitle = input<string | null>(null);
  protected readonly tabs: TabItem<string>[] = [
    { value: 'list', label: 'Ефективність', link: '/mekhaniky' },
    { value: 'day', label: 'Мій день', link: '/mekhaniky/den' },
    { value: 'pay', label: 'Зарплата', link: '/mekhaniky/zarplata' },
  ];
}
