import { Routes } from '@angular/router';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'filii' },
  { path: ':section', title: 'Довідники', loadComponent: () => import('./directories-page').then((m) => m.DirectoriesPage) },
] satisfies Routes;
