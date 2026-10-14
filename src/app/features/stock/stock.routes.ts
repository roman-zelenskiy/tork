import { Routes } from '@angular/router';

export default [
  { path: '', title: 'Склад', loadComponent: () => import('./stock-list').then((m) => m.StockList) },
  { path: 'rukh', title: 'Рух складу', loadComponent: () => import('./movements').then((m) => m.Movements) },
  { path: 'zakupivli', title: 'Закупівлі', loadComponent: () => import('./purchases').then((m) => m.Purchases) },
] satisfies Routes;
