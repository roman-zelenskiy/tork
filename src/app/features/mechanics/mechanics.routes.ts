import { Routes } from '@angular/router';
import { L } from '../../core/i18n';

export default [
  { path: '', title: L('Механіки', 'Mechanics'), loadComponent: () => import('./mechanics-page').then((m) => m.MechanicsPage) },
  { path: 'den', title: L('Мій день механіка', 'Mechanic’s day'), loadComponent: () => import('./my-day').then((m) => m.MyDay) },
  { path: 'zarplata', title: L('Зарплата', 'Payroll'), loadComponent: () => import('./payroll').then((m) => m.Payroll) },
] satisfies Routes;
