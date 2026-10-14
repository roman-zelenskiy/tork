import { Routes } from '@angular/router';

export default [
  { path: '', title: 'Механіки', loadComponent: () => import('./mechanics-page').then((m) => m.MechanicsPage) },
  { path: 'den', title: 'Мій день механіка', loadComponent: () => import('./my-day').then((m) => m.MyDay) },
  { path: 'zarplata', title: 'Зарплата', loadComponent: () => import('./payroll').then((m) => m.Payroll) },
] satisfies Routes;
