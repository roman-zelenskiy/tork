import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';
import { L } from '../../core/i18n';

export default [
  { path: '', title: L('Налаштування', 'Settings'), canDeactivate: [unsavedGuard], loadComponent: () => import('./settings-page').then((m) => m.SettingsPage) },
  { path: 'dani', title: L('Дані', 'Data'), loadComponent: () => import('./data-page').then((m) => m.DataPage) },
] satisfies Routes;
