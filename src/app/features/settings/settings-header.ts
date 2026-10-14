import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';

@Component({
  selector: 'tk-settings-header',
  imports: [PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header title="Налаштування"><ng-content /></tk-page-header>
    <tk-tabs [items]="tabs" ariaLabel="Розділи налаштувань" />
  `,
})
export class SettingsHeader {
  protected readonly tabs: TabItem<string>[] = [
    { value: 'main', label: 'Загальні', link: '/nalashtuvannia' },
    { value: 'data', label: 'Дані', link: '/nalashtuvannia/dani' },
  ];
}
