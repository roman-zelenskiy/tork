import { Routes } from '@angular/router';
import { L } from '../../core/i18n';

export default [
  { path: '', title: L('Склад', 'Stock'), loadComponent: () => import('./stock-list').then((m) => m.StockList) },
  { path: 'rukh', title: L('Рух складу', 'Stock movements'), loadComponent: () => import('./movements').then((m) => m.Movements) },
  { path: 'zakupivli', title: L('Закупівлі', 'Purchasing'), loadComponent: () => import('./purchases').then((m) => m.Purchases) },
] satisfies Routes;
