import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';
import { L } from '../../core/i18n';

@Component({
  selector: 'tk-mechanics-header',
  imports: [PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header [title]="title()" [subtitle]="subtitle()"><ng-content /></tk-page-header>
    <tk-tabs [items]="tabs" [ariaLabel]="L('Розділи механіків', 'Mechanics sections')" />
  `,
})
export class MechanicsHeader {
  protected readonly L = L;
  readonly title = input(L('Механіки', 'Mechanics'));
  readonly subtitle = input<string | null>(null);
  protected readonly tabs: TabItem<string>[] = [
    { value: 'list', label: L('Ефективність', 'Efficiency'), link: '/mekhaniky' },
    { value: 'day', label: L('Мій день', 'My day'), link: '/mekhaniky/den' },
    { value: 'pay', label: L('Зарплата', 'Payroll'), link: '/mekhaniky/zarplata' },
  ];
}
