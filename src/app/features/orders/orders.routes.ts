import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';

export default [
  { path: '', title: 'Наряди', loadComponent: () => import('./orders-list').then((m) => m.OrdersList) },
  { path: 'kanban', title: 'Канбан нарядів', loadComponent: () => import('./kanban').then((m) => m.Kanban) },
  { path: 'pogodzhennia', title: 'Погодження', loadComponent: () => import('../approvals/approvals-list').then((m) => m.ApprovalsList) },
  { path: ':id', title: 'Наряд', canDeactivate: [unsavedGuard], loadComponent: () => import('./order-page').then((m) => m.OrderPage) },
  { path: ':id/pryiom', title: 'Акт прийому', canDeactivate: [unsavedGuard], loadComponent: () => import('../intake/intake-page').then((m) => m.IntakePage) },
  { path: ':id/druk', title: 'Друк', loadComponent: () => import('../print/print-page').then((m) => m.PrintPage) },
] satisfies Routes;
