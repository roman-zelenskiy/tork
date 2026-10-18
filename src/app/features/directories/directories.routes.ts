import { Routes } from '@angular/router';
import { L } from '../../core/i18n';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'filii' },
  { path: ':section', title: L('Довідники', 'Directories'), loadComponent: () => import('./directories-page').then((m) => m.DirectoriesPage) },
] satisfies Routes;
