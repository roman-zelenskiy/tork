import { Routes } from '@angular/router';
import { Shell } from './layout/shell';
import { L } from './core/i18n';

export const routes: Routes = [
  {
    // клієнтська сторінка погодження — без оболонки CRM, у стилі клієнта
    path: 'pogodzhennia/:token',
    title: L('Погодження робіт', 'Repair approval'),
    loadComponent: () => import('./features/approvals/client-approval').then((m) => m.ClientApproval),
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', title: L('Огляд', 'Overview'), loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'tablo', title: L('Табло постів', 'Bay board'), loadComponent: () => import('./features/board/board').then((m) => m.Board) },
      { path: 'naryady', loadChildren: () => import('./features/orders/orders.routes') },
      { path: 'kliyenty', loadChildren: () => import('./features/clients/clients.routes') },
      { path: 'avto/:id', title: L('Авто', 'Car'), loadComponent: () => import('./features/clients/car-page').then((m) => m.CarPage) },
      { path: 'nahaduvannia', title: L('Нагадування', 'Reminders'), loadComponent: () => import('./features/reminders/reminders').then((m) => m.Reminders) },
      { path: 'sklad', loadChildren: () => import('./features/stock/stock.routes') },
      { path: 'mekhaniky', loadChildren: () => import('./features/mechanics/mechanics.routes') },
      { path: 'dovidnyky', loadChildren: () => import('./features/directories/directories.routes') },
      { path: 'nalashtuvannia', loadChildren: () => import('./features/settings/settings.routes') },
      { path: '**', title: L('Сторінку не знайдено', 'Page not found'), loadComponent: () => import('./features/not-found').then((m) => m.NotFound) },
    ],
  },
];
