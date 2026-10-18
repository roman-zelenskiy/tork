import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';
import { L } from '../../core/i18n';

export default [
  { path: '', title: L('Клієнти', 'Clients'), loadComponent: () => import('./clients-list').then((m) => m.ClientsList) },
  { path: ':id', title: L('Клієнт', 'Client'), canDeactivate: [unsavedGuard], loadComponent: () => import('./client-page').then((m) => m.ClientPage) },
] satisfies Routes;
