import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';

export default [
  { path: '', title: 'Клієнти', loadComponent: () => import('./clients-list').then((m) => m.ClientsList) },
  { path: ':id', title: 'Клієнт', canDeactivate: [unsavedGuard], loadComponent: () => import('./client-page').then((m) => m.ClientPage) },
] satisfies Routes;
