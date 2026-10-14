import { Routes } from '@angular/router';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    // клієнтська сторінка погодження — без оболонки CRM, у стилі клієнта
    path: 'pogodzhennia/:token',
    title: 'Погодження робіт',
    loadComponent: () => import('./features/approvals/client-approval').then((m) => m.ClientApproval),
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', title: 'Огляд', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'tablo', title: 'Табло постів', loadComponent: () => import('./features/board/board').then((m) => m.Board) },
      { path: 'naryady', loadChildren: () => import('./features/orders/orders.routes') },
      { path: 'kliyenty', loadChildren: () => import('./features/clients/clients.routes') },
      { path: 'avto/:id', title: 'Авто', loadComponent: () => import('./features/clients/car-page').then((m) => m.CarPage) },
      { path: 'nahaduvannia', title: 'Нагадування', loadComponent: () => import('./features/reminders/reminders').then((m) => m.Reminders) },
      { path: 'sklad', loadChildren: () => import('./features/stock/stock.routes') },
      { path: 'mekhaniky', loadChildren: () => import('./features/mechanics/mechanics.routes') },
      { path: 'dovidnyky', loadChildren: () => import('./features/directories/directories.routes') },
      { path: 'nalashtuvannia', loadChildren: () => import('./features/settings/settings.routes') },
      { path: '**', title: 'Сторінку не знайдено', loadComponent: () => import('./features/not-found').then((m) => m.NotFound) },
    ],
  },
];
