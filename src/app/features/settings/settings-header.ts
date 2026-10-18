import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '../../shared/ui/states';
import { Tabs, TabItem } from '../../shared/ui/tabs';
import { L } from '../../core/i18n';

@Component({
  selector: 'tk-settings-header',
  imports: [PageHeader, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-5' },
  template: `
    <tk-page-header [title]="L('Налаштування', 'Settings')"><ng-content /></tk-page-header>
    <tk-tabs [items]="tabs" [ariaLabel]="L('Розділи налаштувань', 'Settings sections')" />
  `,
})
export class SettingsHeader {
  protected readonly L = L;
  protected readonly tabs: TabItem<string>[] = [
    { value: 'main', label: L('Загальні', 'General'), link: '/nalashtuvannia' },
    { value: 'data', label: L('Дані', 'Data'), link: '/nalashtuvannia/dani' },
  ];
}
