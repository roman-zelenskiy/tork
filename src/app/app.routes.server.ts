import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Статичні розділи пререндеряться під час збірки (оболонка + скелетони),
 * сторінки з параметрами рендеряться сервером на запит. Дані завжди підвантажує браузер.
 */
const STATIC = [
  '',
  'tablo',
  'naryady',
  'naryady/kanban',
  'naryady/pogodzhennia',
  'kliyenty',
  'nahaduvannia',
  'sklad',
  'sklad/rukh',
  'sklad/zakupivli',
  'mekhaniky',
  'mekhaniky/den',
  'mekhaniky/zarplata',
  'nalashtuvannia',
  'nalashtuvannia/dani',
];
const DIRECTORY_SECTIONS = ['filii', 'posty', 'spivrobitnyky', 'normo-hodyny', 'postachalnyky', 'shablony', 'pravyla-to'];

/** true у збірці для GitHub Pages (angular.json → configurations.pages.define) */
declare const STATIC_BUILD: boolean;

/**
 * Статичний хостинг (GitHub Pages) не має сервера: сторінки з параметрами рендеряться в браузері,
 * а глибокі посилання відкриває 404.html (копія index.csr.html).
 */
const dynamicMode = STATIC_BUILD ? RenderMode.Client : RenderMode.Server;

export const serverRoutes: ServerRoute[] = [
  { path: 'pogodzhennia/:token', renderMode: dynamicMode },
  { path: 'naryady/:id', renderMode: dynamicMode },
  { path: 'naryady/:id/pryiom', renderMode: dynamicMode },
  { path: 'naryady/:id/druk', renderMode: dynamicMode },
  { path: 'kliyenty/:id', renderMode: dynamicMode },
  { path: 'avto/:id', renderMode: dynamicMode },
  { path: 'dovidnyky/:section', renderMode: RenderMode.Prerender, getPrerenderParams: async () => DIRECTORY_SECTIONS.map((section) => ({ section })) },
  ...STATIC.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender as const })),
  // невідомі адреси — сторінка «не знайдено» зі статусом 404
  { path: '**', renderMode: dynamicMode },
];

