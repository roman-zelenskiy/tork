import { Routes } from '@angular/router';
import { unsavedGuard } from '../../shared/form';
import { L } from '../../core/i18n';

export default [
  { path: '', title: L('Наряди', 'Work orders'), loadComponent: () => import('./orders-list').then((m) => m.OrdersList) },
  { path: 'kanban', title: L('Канбан нарядів', 'Work order kanban'), loadComponent: () => import('./kanban').then((m) => m.Kanban) },
  { path: 'pogodzhennia', title: L('Погодження', 'Approvals'), loadComponent: () => import('../approvals/approvals-list').then((m) => m.ApprovalsList) },
  { path: ':id', title: L('Наряд', 'Work order'), canDeactivate: [unsavedGuard], loadComponent: () => import('./order-page').then((m) => m.OrderPage) },
  { path: ':id/pryiom', title: L('Акт прийому', 'Intake report'), canDeactivate: [unsavedGuard], loadComponent: () => import('../intake/intake-page').then((m) => m.IntakePage) },
  { path: ':id/druk', title: L('Друк', 'Print'), loadComponent: () => import('../print/print-page').then((m) => m.PrintPage) },
] satisfies Routes;
