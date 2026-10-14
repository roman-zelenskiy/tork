import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';

export default [
  { path: '', title: 'Налаштування', canDeactivate: [unsavedGuard], loadComponent: () => import('./settings-page').then((m) => m.SettingsPage) },
  { path: 'dani', title: 'Дані', loadComponent: () => import('./data-page').then((m) => m.DataPage) },
] satisfies Routes;
