import {
  ActivityEntry,
  Approval,
  AppNotification,
  Branch,
  Car,
  Client,
  Employee,
  EntityKey,
  EntityMap,
  Mailing,
  MessageTemplate,
  Order,
  OrderPart,
  OrderStatus,
  ORDER_PREFIX,
  OrderWork,
  PURCHASE_PREFIX,
  Part,
  Post,
  Priority,
  PurchaseOrder,
  Reminder,
  ReminderRule,
  SavedView,
  Settings,
  TAG_DISCOUNT,
  TAG_FLEET,
  StatusChange,
  StockMovement,
  Supplier,
  Work,
  WorkCategory,
} from './models';
import { orderTotals, STATUS_FLOW, STATUS_LABEL } from '../domain/order-math';
import { PLATE_LETTERS } from './plates';
import { VIN_DB, makeVin } from './vin';
import { rng } from './util';
import { BRAND, L, isEn } from '../i18n';

type Db = { [K in EntityKey]: EntityMap[K][] };

const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const at = (day: Date, minutes: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
const stamp = (d: Date) => ({ createdAt: iso(d), updatedAt: iso(d) });

// ——— довідники, однакові для демо й чистої бази

export const CATEGORIES: WorkCategory[] = [
  { id: 'cat_to', name: L('ТО й мастила', 'Service & oils'), rate: 900 },
  { id: 'cat_engine', name: L('Двигун', 'Engine'), rate: 1100 },
  { id: 'cat_susp', name: L('Ходова частина', 'Suspension'), rate: 950 },
  { id: 'cat_brakes', name: L('Гальма', 'Brakes'), rate: 950 },
  { id: 'cat_elec', name: L('Електрика й діагностика', 'Electrics & diagnostics'), rate: 1200 },
  { id: 'cat_ac', name: L('Кондиціонер', 'Air conditioning'), rate: 1000 },
  { id: 'cat_tires', name: L('Шини й диски', 'Tyres & wheels'), rate: 700 },
  { id: 'cat_body', name: L('Кузов і скло', 'Body & glass'), rate: 1050 },
];

const WORKS: [code: string, name: string, cat: string, hours: number][] = [
  ['ТО-01', 'Заміна моторної оливи та оливного фільтра', 'cat_to', 0.6],
  ['ТО-02', 'Заміна повітряного фільтра', 'cat_to', 0.2],
  ['ТО-03', 'Заміна салонного фільтра', 'cat_to', 0.3],
  ['ТО-04', 'Заміна паливного фільтра', 'cat_to', 0.5],
  ['ТО-05', 'Заміна свічок запалювання (4 шт.)', 'cat_to', 0.8],
  ['ТО-06', 'Заміна оливи в АКПП (часткова)', 'cat_to', 1.0],
  ['ТО-07', 'Заміна гальмівної рідини', 'cat_to', 0.8],
  ['ТО-08', 'Заміна охолоджувальної рідини', 'cat_to', 1.0],
  ['ТО-09', 'Комплексне ТО за регламентом виробника', 'cat_to', 2.5],
  ['ДВ-01', 'Заміна комплекту ГРМ з помпою', 'cat_engine', 3.5],
  ['ДВ-02', 'Заміна ременя приводу навісного обладнання', 'cat_engine', 0.7],
  ['ДВ-03', 'Заміна термостата', 'cat_engine', 1.2],
  ['ДВ-04', 'Заміна свічок розжарювання', 'cat_engine', 1.4],
  ['ДВ-05', 'Чищення дросельної заслінки', 'cat_engine', 0.8],
  ['ДВ-06', 'Заміна комплекту зчеплення', 'cat_engine', 4.0],
  ['ДВ-07', 'Заміна прокладки клапанної кришки', 'cat_engine', 1.5],
  ['ХД-01', 'Діагностика ходової частини', 'cat_susp', 0.5],
  ['ХД-02', 'Заміна передніх амортизаторів (пара)', 'cat_susp', 2.2],
  ['ХД-03', 'Заміна стійок стабілізатора (пара)', 'cat_susp', 0.8],
  ['ХД-04', 'Заміна маточини переднього колеса', 'cat_susp', 1.6],
  ['ХД-05', 'Заміна сайлентблоків переднього важеля', 'cat_susp', 2.0],
  ['ХД-06', 'Розвал-сходження', 'cat_susp', 1.0],
  ['ГЛ-01', 'Заміна передніх гальмівних колодок', 'cat_brakes', 0.8],
  ['ГЛ-02', 'Заміна задніх гальмівних колодок', 'cat_brakes', 0.9],
  ['ГЛ-03', 'Заміна передніх гальмівних дисків і колодок', 'cat_brakes', 1.5],
  ['ГЛ-04', 'Обслуговування супортів', 'cat_brakes', 1.2],
  ['ЕЛ-01', 'Комп’ютерна діагностика', 'cat_elec', 0.5],
  ['ЕЛ-02', 'Діагностика електросистеми й заряду', 'cat_elec', 0.7],
  ['ЕЛ-03', 'Заміна акумулятора з адаптацією', 'cat_elec', 0.4],
  ['ЕЛ-04', 'Заміна лампи фари', 'cat_elec', 0.3],
  ['ЕЛ-05', 'Регулювання світла фар', 'cat_elec', 0.4],
  ['КН-01', 'Діагностика кондиціонера', 'cat_ac', 0.5],
  ['КН-02', 'Заправка кондиціонера фреоном', 'cat_ac', 1.0],
  ['КН-03', 'Антибактеріальна обробка кондиціонера', 'cat_ac', 0.5],
  ['ШН-01', 'Сезонна заміна шин (4 колеса)', 'cat_tires', 1.0],
  ['ШН-02', 'Балансування коліс (4 шт.)', 'cat_tires', 0.6],
  ['ШН-03', 'Ремонт проколу', 'cat_tires', 0.4],
  ['ШН-04', 'Зберігання шин (сезон)', 'cat_tires', 0.2],
  ['КЗ-01', 'Заміна щіток склоочисника', 'cat_body', 0.2],
  ['КЗ-02', 'Полірування фар', 'cat_body', 1.0],
  ['КЗ-03', 'Ремонт сколу лобового скла', 'cat_body', 0.7],
];

/** Роботи англійською — за кодом з українського довідника */
const WORK_EN: Record<string, string> = {
  'ТО-01': 'Engine oil and oil filter change',
  'ТО-02': 'Air filter replacement',
  'ТО-03': 'Cabin filter replacement',
  'ТО-04': 'Fuel filter replacement',
  'ТО-05': 'Spark plug replacement (4 pcs)',
  'ТО-06': 'Automatic transmission fluid change (partial)',
  'ТО-07': 'Brake fluid change',
  'ТО-08': 'Coolant change',
  'ТО-09': 'Full scheduled service to manufacturer spec',
  'ДВ-01': 'Timing belt kit and water pump replacement',
  'ДВ-02': 'Auxiliary drive belt replacement',
  'ДВ-03': 'Thermostat replacement',
  'ДВ-04': 'Glow plug replacement',
  'ДВ-05': 'Throttle body cleaning',
  'ДВ-06': 'Clutch kit replacement',
  'ДВ-07': 'Valve cover gasket replacement',
  'ХД-01': 'Suspension check',
  'ХД-02': 'Front shock absorber replacement (pair)',
  'ХД-03': 'Stabiliser link replacement (pair)',
  'ХД-04': 'Front wheel hub replacement',
  'ХД-05': 'Front control arm bush replacement',
  'ХД-06': 'Wheel alignment',
  'ГЛ-01': 'Front brake pad replacement',
  'ГЛ-02': 'Rear brake pad replacement',
  'ГЛ-03': 'Front brake disc and pad replacement',
  'ГЛ-04': 'Brake caliper service',
  'ЕЛ-01': 'Computer diagnostics',
  'ЕЛ-02': 'Electrical and charging system check',
  'ЕЛ-03': 'Battery replacement with adaptation',
  'ЕЛ-04': 'Headlight bulb replacement',
  'ЕЛ-05': 'Headlight alignment',
  'КН-01': 'Air conditioning check',
  'КН-02': 'Air conditioning regas',
  'КН-03': 'Antibacterial air conditioning treatment',
  'ШН-01': 'Seasonal tyre change (4 wheels)',
  'ШН-02': 'Wheel balancing (4 pcs)',
  'ШН-03': 'Puncture repair',
  'ШН-04': 'Tyre storage (season)',
  'КЗ-01': 'Wiper blade replacement',
  'КЗ-02': 'Headlight polishing',
  'КЗ-03': 'Windscreen chip repair',
};

/** Код роботи англійською: «ТО-01» → «SV-01». Усередині генератора лишаються українські коди */
const CODE_EN: Record<string, string> = { ТО: 'SV', ДВ: 'EN', ХД: 'SU', ГЛ: 'BR', ЕЛ: 'EL', КН: 'AC', ШН: 'TY', КЗ: 'BG' };
const codeOut = (code: string) => (isEn ? `${CODE_EN[code.slice(0, 2)] ?? code.slice(0, 2)}${code.slice(2)}` : code);

const TEMPLATES: [name: string, channel: 'sms' | 'viber', text: string][] = L<[string, 'sms' | 'viber', string][]>(
  [
  ['Нагадування про ТО', 'viber', '{ім’я}, вітаємо! Для {авто} ({номер}) настав час планового обслуговування: {робота}. Запишіться в {сервіс}: {посилання}'],
  ['Сезонна заміна шин', 'sms', '{ім’я}, наближається сезон заміни шин. Запишіться на шиномонтаж у {сервіс} — без черг: {посилання}'],
  ['Відкладені роботи', 'viber', '{ім’я}, під час останнього візиту ми рекомендували для {авто}: {робота}. Нагадуємо, щоб не відкладати безпеку. Запис: {посилання}'],
  ['Авто готове', 'sms', '{ім’я}, ваш {авто} ({номер}) готовий. Чекаємо на вас у {сервіс}.'],
  ['Погодження робіт', 'viber', '{ім’я}, ми завершили діагностику {авто}. Перегляньте рекомендації з фото й цінами та погодьте роботи: {посилання}'],
  ],
  [
    ['Service reminder', 'viber', 'Hi {name}! Your {car} ({plate}) is due for scheduled service: {work}. Book at {service}: {link}'],
    ['Seasonal tyre change', 'sms', '{name}, tyre change season is coming. Book a tyre fitting at {service} with no queues: {link}'],
    ['Deferred work', 'viber', '{name}, at your last visit we recommended for your {car}: {work}. A reminder so safety doesn’t wait. Book: {link}'],
    ['Car ready', 'sms', '{name}, your {car} ({plate}) is ready. We look forward to seeing you at {service}.'],
    ['Repair approval', 'viber', '{name}, we’ve finished diagnosing your {car}. See the recommendations with photos and prices and approve the work: {link}'],
  ],
);

const RULES: [name: string, km: number | null, months: number | null, season: number[], code: string, template: number][] = [
  [L('Заміна оливи', 'Oil change'), 10000, 12, [], 'ТО-01', 0],
  [L('Заміна ременя ГРМ', 'Timing belt replacement'), 60000, 48, [], 'ДВ-01', 0],
  [L('Заміна гальмівної рідини', 'Brake fluid change'), 40000, 24, [], 'ТО-07', 0],
  [L('Сезонна заміна шин', 'Seasonal tyre change'), null, null, [3, 4, 10, 11], 'ШН-01', 1],
  [L('Обслуговування кондиціонера', 'Air conditioning service'), null, 12, [4, 5], 'КН-02', 0],
];

function settings(now: Date): Settings {
  return {
    id: 'settings',
    ...stamp(now),
    serviceName: BRAND,
    phone: '+380 44 390 12 70',
    email: 'servis@tork.ua',
    site: 'tork.ua',
    currency: 'UAH',
    categories: CATEGORIES,
    theme: 'system',
    sidebarCollapsed: false,
    branchId: 'br_pozniaky',
    slotMin: 15,
  };
}

function catalog(now: Date) {
  const works: Work[] = WORKS.map(([code, name, categoryId, hours], i) => ({
    id: `wk_${i + 1}`,
    ...stamp(now),
    code: codeOut(code),
    name: L(name, WORK_EN[code]),
    categoryId,
    hours,
    makes: [],
  }));
  const templates: MessageTemplate[] = TEMPLATES.map(([name, channel, text], i) => ({ id: `tp_${i + 1}`, ...stamp(now), name, channel, text }));
  const rules: ReminderRule[] = RULES.map(([name, everyKm, everyMonths, seasonMonths, workCode, t], i) => ({
    id: `ru_${i + 1}`,
    ...stamp(now),
    name,
    everyKm,
    everyMonths,
    seasonMonths,
    workCode: codeOut(workCode),
    templateId: templates[t].id,
    active: true,
  }));
  return { works, templates, rules };
}

function branchesAndPosts(now: Date) {
  const branches: Branch[] = [
    { id: 'br_pozniaky', ...stamp(now), name: L('Торк Позняки', 'Tork Pozniaky'), address: L('Київ, вул. Здолбунівська, 7', 'Kyiv, 7 Zdolbunivska St'), phone: '+380 44 390 12 70', opensAt: '08:00', closesAt: '20:00', workDays: [1, 2, 3, 4, 5, 6] },
    { id: 'br_vynohradar', ...stamp(now), name: L('Торк Виноградар', 'Tork Vynohradar'), address: L('Київ, просп. Правди, 41', 'Kyiv, 41 Pravdy Ave'), phone: '+380 44 390 12 71', opensAt: '09:00', closesAt: '19:00', workDays: [1, 2, 3, 4, 5, 6] },
  ];
  const p = (id: string, branchId: string, name: string, kind: Post['kind'], rate: number | null): Post => ({ id, ...stamp(now), branchId, name, kind, rate, active: true });
  const posts: Post[] = [
    p('po_p1', 'br_pozniaky', L('Підйомник 1', 'Lift 1'), 'lift', null),
    p('po_p2', 'br_pozniaky', L('Підйомник 2', 'Lift 2'), 'lift', null),
    p('po_p3', 'br_pozniaky', L('Підйомник 3', 'Lift 3'), 'lift', null),
    p('po_pd', 'br_pozniaky', L('Діагностичний пост', 'Diagnostic bay'), 'diag', 1250),
    p('po_pt', 'br_pozniaky', L('Шиномонтаж', 'Tyre fitting'), 'tire', 650),
    p('po_pe', 'br_pozniaky', L('Експрес-сервіс', 'Express service'), 'express', null),
    p('po_v1', 'br_vynohradar', L('Підйомник 1', 'Lift 1'), 'lift', null),
    p('po_v2', 'br_vynohradar', L('Підйомник 2', 'Lift 2'), 'lift', null),
    p('po_vd', 'br_vynohradar', L('Діагностика', 'Diagnostics'), 'diag', 1250),
    p('po_vt', 'br_vynohradar', L('Шиномонтаж', 'Tyre fitting'), 'tire', 650),
  ];
  return { branches, posts };
}

/** Порожня база: налаштування, одна філія, пости й довідники — без клієнтів і нарядів */
export function buildEmpty(now: Date): Partial<Db> {
  const { branches, posts } = branchesAndPosts(now);
  const { works, templates, rules } = catalog(now);
  return {
    settings: [settings(now)],
    branches: branches.slice(0, 1),
    posts: posts.filter((x) => x.branchId === 'br_pozniaky'),
    works,
    templates,
    rules,
  };
}

// ——— демо-дані

const FIRST_M = L(
  ['Олександр', 'Андрій', 'Сергій', 'Дмитро', 'Максим', 'Олег', 'Ігор', 'Віталій', 'Богдан', 'Тарас', 'Юрій', 'Роман', 'Василь', 'Артем', 'Назар', 'Євген', 'Михайло', 'Степан'],
  ['Oleksandr', 'Andrii', 'Serhii', 'Dmytro', 'Maksym', 'Oleh', 'Ihor', 'Vitalii', 'Bohdan', 'Taras', 'Yurii', 'Roman', 'Vasyl', 'Artem', 'Nazar', 'Yevhen', 'Mykhailo', 'Stepan'],
);
const FIRST_F = L(
  ['Олена', 'Ірина', 'Наталія', 'Тетяна', 'Оксана', 'Юлія', 'Марія', 'Анна', 'Світлана', 'Катерина', 'Вікторія', 'Людмила', 'Дарина', 'Софія'],
  ['Olena', 'Iryna', 'Nataliia', 'Tetiana', 'Oksana', 'Yuliia', 'Mariia', 'Anna', 'Svitlana', 'Kateryna', 'Viktoriia', 'Liudmyla', 'Daryna', 'Sofiia'],
);
const LAST = L(
  ['Коваленко', 'Бондаренко', 'Шевченко', 'Мельник', 'Кравченко', 'Ткаченко', 'Олійник', 'Лисенко', 'Марченко', 'Савченко', 'Руденко', 'Гончаренко', 'Мороз', 'Петренко', 'Кузьменко', 'Павленко', 'Литвиненко', 'Ковальчук', 'Сидоренко', 'Гребенюк', 'Остапчук', 'Захарченко', 'Дорошенко', 'Яковенко', 'Білоус', 'Гуменюк', 'Приходько', 'Вакуленко'],
  ['Kovalenko', 'Bondarenko', 'Shevchenko', 'Melnyk', 'Kravchenko', 'Tkachenko', 'Oliinyk', 'Lysenko', 'Marchenko', 'Savchenko', 'Rudenko', 'Honcharenko', 'Moroz', 'Petrenko', 'Kuzmenko', 'Pavlenko', 'Lytvynenko', 'Kovalchuk', 'Sydorenko', 'Hrebeniuk', 'Ostapchuk', 'Zakharchenko', 'Doroshenko', 'Yakovenko', 'Bilous', 'Humeniuk', 'Prykhodko', 'Vakulenko'],
);
const COMPANIES = L(
  ['ТОВ «Південьтранс»', 'ТОВ «Агроресурс-Київ»', 'ФОП Гребенюк О. В.', 'ТОВ «Кур’єр Експрес»', 'ПП «Будмайстер»', 'ТОВ «Фарм-Логістик»'],
  ['Pivdentrans LLC', 'Ahroresurs-Kyiv LLC', 'Sole trader O. Hrebeniuk', 'Kurier Ekspres LLC', 'Budmaister PE', 'Farm-Lohistyk LLC'],
);
const PHONE_CODES = ['50', '63', '66', '67', '68', '73', '93', '95', '96', '97', '98', '99'];
const COLORS = L(
  ['білий', 'чорний', 'сірий', 'сріблястий', 'синій', 'червоний', 'зелений', 'бежевий'],
  ['white', 'black', 'grey', 'silver', 'blue', 'red', 'green', 'beige'],
);
const REGIONS = ['АА', 'КА', 'АІ', 'КІ', 'ВС', 'АЕ', 'ВН', 'АХ', 'ВІ', 'АМ', 'ТТ'];

const COMPLAINTS = L(
  [
    'Стукіт спереду на нерівностях',
    'Скрип гальм при зупинці',
    'Горить Check Engine',
    'Планове ТО, пробіг підійшов',
    'Кондиціонер слабо холодить',
    'Тягне вбік на швидкості',
    'Вібрація керма на 100 км/год',
    'Сезонна заміна шин',
    'Важко запускається зранку',
    'Плаває оберти на холостому ході',
    'Підтікає олива під двигуном',
    'Свистить ремінь при запуску',
    'Не світить ліва фара',
    'Перед поїздкою за кордон — повна перевірка',
  ],
  [
    'Knocking from the front over bumps',
    'Brakes squeak when stopping',
    'Check Engine light is on',
    'Scheduled service, mileage is due',
    'Air conditioning isn’t cooling well',
    'Pulls to one side at speed',
    'Steering wheel vibrates at 100 km/h',
    'Seasonal tyre change',
    'Hard to start in the morning',
    'Idle speed fluctuates',
    'Oil leak under the engine',
    'Belt squeals on start-up',
    'Left headlight doesn’t work',
    'Full check before a trip abroad',
  ],
);

/** Назви запчастин англійською — у тому ж порядку, що й PARTS */
const PART_EN = [
  'Engine oil EDGE 5W-30 LL, 4 L',
  'Engine oil Helix Ultra 5W-40, 4 L',
  'Engine oil Mobil 1 ESP 5W-30, 4 L',
  'Engine oil 8100 X-clean 5W-30, 5 L',
  'Oil filter',
  'Oil filter (cartridge)',
  'Oil filter',
  'Oil filter (genuine)',
  'Oil filter (genuine)',
  'Oil filter',
  'Air filter',
  'Air filter',
  'Air filter',
  'Cabin filter, activated carbon',
  'Cabin filter',
  'Fuel filter',
  'Iridium spark plug',
  'Double Platinum spark plug',
  'ATF 320 transmission fluid, 1 L',
  'DOT 4 brake fluid, 1 L',
  'G12+ antifreeze concentrate, 1.5 L',
  'Timing belt kit with water pump',
  'Timing belt kit',
  'Poly-V belt',
  'Thermostat',
  'Duraterm glow plug',
  'Clutch kit',
  'Front gas shock absorber',
  'Front shock absorber',
  'Front stabiliser link',
  'Stabiliser link',
  'Front wheel hub with bearing',
  'Control arm bush',
  'Front brake pads',
  'Front brake pads',
  'Front brake pads',
  'Front brake pads',
  'Rear brake pads',
  'Front vented brake disc',
  'Front brake disc',
  'Battery Blue Dynamic E11, 74 Ah',
  'Battery S4 005, 60 Ah',
  'H7 Night Breaker Laser bulb',
  'H4 X-tremeVision Pro150 bulb',
  'PAG 46 compressor oil, 250 ml',
  'R134a refrigerant, 1 kg',
  'Air conditioning cleaner, 250 ml',
  'TR414 tubeless valve',
  'Adhesive balancing weights, 5 g × 100',
  'Puncture repair plug patch',
  'Aerotwin wiper blades, set',
  'Throttle body cleaner, 400 ml',
  'Valve cover gasket',
];

/** Запчастини: бренд, назва, артикул, закупівля, роздріб, застосовність, одиниця, кросс-номери, коди робіт */
const PARTS: [brand: string, name: string, sku: string, cost: number, price: number, fits: string[], unit: Part['unit'], cross: string[], works: string[]][] = [
  ['Castrol', 'Олива моторна EDGE 5W-30 LL, 4 л', '15669E', 1480, 1990, [], 'шт', ['15667E'], ['ТО-01', 'ТО-09']],
  ['Shell', 'Олива моторна Helix Ultra 5W-40, 4 л', '550052679', 1250, 1690, [], 'шт', [], ['ТО-01', 'ТО-09']],
  ['Mobil', 'Олива моторна Mobil 1 ESP 5W-30, 4 л', '154283', 1560, 2120, [], 'шт', [], ['ТО-01', 'ТО-09']],
  ['Motul', 'Олива моторна 8100 X-clean 5W-30, 5 л', '102051', 1720, 2290, [], 'шт', [], ['ТО-01']],
  ['MANN-FILTER', 'Фільтр оливний', 'W 712/95', 210, 330, ['Skoda Octavia', 'VW Golf', 'Skoda Fabia'], 'шт', ['OC 593/4', 'OP 641/1'], ['ТО-01', 'ТО-09']],
  ['MANN-FILTER', 'Фільтр оливний (картридж)', 'HU 7020 z', 260, 410, ['VW Passat', 'Skoda Octavia', 'VW Tiguan', 'Skoda Kodiaq'], 'шт', ['OX 388D'], ['ТО-01', 'ТО-09']],
  ['Bosch', 'Фільтр оливний', 'F 026 407 183', 190, 300, ['Renault Duster', 'Renault Megane', 'Renault Logan'], 'шт', ['152089599R'], ['ТО-01']],
  ['Toyota', 'Фільтр оливний (оригінал)', '04152-YZZA6', 320, 480, ['Toyota Camry', 'Toyota RAV4', 'Toyota Corolla'], 'шт', [], ['ТО-01']],
  ['Hyundai/Kia', 'Фільтр оливний (оригінал)', '26300-35505', 180, 290, ['Hyundai Tucson', 'Kia Sportage', 'Hyundai Elantra', 'Kia Ceed'], 'шт', ['W 811/80'], ['ТО-01']],
  ['Filtron', 'Фільтр оливний', 'OP 520/1', 110, 190, ['Daewoo Lanos', 'Chevrolet Aveo'], 'шт', ['W 712/83'], ['ТО-01']],
  ['MANN-FILTER', 'Фільтр повітряний', 'C 35 154', 380, 590, ['Skoda Octavia', 'VW Golf', 'VW Passat'], 'шт', ['LX 2059'], ['ТО-02', 'ТО-09']],
  ['Bosch', 'Фільтр повітряний', 'F 026 400 287', 330, 520, ['Toyota Camry', 'Toyota RAV4'], 'шт', [], ['ТО-02']],
  ['Filtron', 'Фільтр повітряний', 'AP 149/7', 240, 390, ['Renault Duster', 'Renault Logan'], 'шт', [], ['ТО-02']],
  ['MANN-FILTER', 'Фільтр салону вугільний', 'CUK 26 009', 420, 650, ['Skoda Octavia', 'VW Golf', 'VW Passat', 'VW Tiguan'], 'шт', ['K 1172A'], ['ТО-03', 'ТО-09']],
  ['Bosch', 'Фільтр салону', '1 987 432 598', 290, 460, ['Hyundai Tucson', 'Kia Sportage'], 'шт', [], ['ТО-03']],
  ['MANN-FILTER', 'Фільтр паливний', 'WK 69/2', 520, 790, ['VW Passat', 'Skoda Octavia', 'VW Tiguan'], 'шт', [], ['ТО-04']],
  ['NGK', 'Свічка запалювання Iridium', 'BKR6EIX-11', 290, 440, [], 'шт', ['5464'], ['ТО-05']],
  ['Bosch', 'Свічка запалювання Double Platinum', 'FR7DPP33+', 210, 340, [], 'шт', [], ['ТО-05']],
  ['Mobil', 'Рідина АКПП ATF 320, 1 л', '146477', 320, 460, [], 'л', [], ['ТО-06']],
  ['Bosch', 'Гальмівна рідина DOT 4, 1 л', '1 987 479 107', 260, 390, [], 'л', [], ['ТО-07']],
  ['Febi', 'Антифриз G12+ концентрат, 1,5 л', '22268', 330, 490, [], 'шт', [], ['ТО-08']],
  ['Gates', 'Комплект ГРМ з помпою', 'KP25578XS-1', 6400, 8900, ['VW Passat', 'Skoda Octavia', 'VW Golf'], 'компл', ['CT1028WP2'], ['ДВ-01']],
  ['Contitech', 'Комплект ГРМ', 'CT1028K2', 3900, 5600, ['VW Passat', 'Skoda Octavia'], 'компл', [], ['ДВ-01']],
  ['Gates', 'Ремінь поліклиновий', '6PK1153', 520, 790, [], 'шт', ['6PK1155'], ['ДВ-02']],
  ['Wahler', 'Термостат', '4256.92D', 780, 1150, ['Renault Duster', 'Renault Logan'], 'шт', [], ['ДВ-03']],
  ['Bosch', 'Свічка розжарювання Duraterm', '0 250 202 132', 520, 780, ['VW Passat', 'Skoda Octavia'], 'шт', [], ['ДВ-04']],
  ['LuK', 'Комплект зчеплення', '623 3088 00', 6900, 9400, ['Skoda Octavia', 'VW Golf'], 'компл', [], ['ДВ-06']],
  ['KYB', 'Амортизатор передній газовий', '334834', 2150, 3100, ['Skoda Octavia', 'VW Golf'], 'шт', ['315 943'], ['ХД-02']],
  ['Sachs', 'Амортизатор передній', '315 943', 1980, 2850, ['Skoda Octavia', 'VW Golf'], 'шт', ['334834'], ['ХД-02']],
  ['Lemförder', 'Стійка стабілізатора передня', '31743 01', 520, 780, ['Skoda Octavia', 'VW Passat', 'VW Golf'], 'шт', ['19518'], ['ХД-03']],
  ['Febi', 'Стійка стабілізатора', '19518', 390, 590, ['Skoda Octavia', 'VW Golf'], 'шт', ['31743 01'], ['ХД-03']],
  ['SKF', 'Маточина з підшипником передня', 'VKBA 3643', 2350, 3350, ['Skoda Octavia', 'VW Golf', 'VW Passat'], 'шт', [], ['ХД-04']],
  ['Lemförder', 'Сайлентблок важеля', '38420 01', 340, 520, ['Skoda Octavia', 'VW Golf'], 'шт', [], ['ХД-05']],
  ['TRW', 'Колодки гальмівні передні', 'GDB1550', 1050, 1580, ['Skoda Octavia', 'VW Golf', 'VW Passat'], 'компл', ['P 85 112'], ['ГЛ-01', 'ГЛ-03']],
  ['Brembo', 'Колодки гальмівні передні', 'P 85 112', 1290, 1890, ['Skoda Octavia', 'VW Golf'], 'компл', ['GDB1550'], ['ГЛ-01', 'ГЛ-03']],
  ['Bosch', 'Колодки гальмівні передні', '0 986 494 659', 1180, 1720, ['Toyota Camry', 'Toyota RAV4'], 'компл', [], ['ГЛ-01', 'ГЛ-03']],
  ['Ferodo', 'Колодки гальмівні передні', 'FDB4050', 820, 1240, ['Renault Duster', 'Renault Logan'], 'компл', [], ['ГЛ-01']],
  ['TRW', 'Колодки гальмівні задні', 'GDB3539', 760, 1150, ['Hyundai Tucson', 'Kia Sportage'], 'компл', [], ['ГЛ-02']],
  ['Brembo', 'Диск гальмівний передній вентильований', '09.9772.11', 1650, 2390, ['Skoda Octavia', 'VW Golf'], 'шт', ['DF6227'], ['ГЛ-03']],
  ['TRW', 'Диск гальмівний передній', 'DF6227', 1420, 2050, ['Skoda Octavia', 'VW Golf'], 'шт', ['09.9772.11'], ['ГЛ-03']],
  ['Varta', 'Акумулятор Blue Dynamic E11, 74 А·год', '574 012 068', 3600, 4790, [], 'шт', [], ['ЕЛ-03']],
  ['Bosch', 'Акумулятор S4 005, 60 А·год', '0 092 S40 050', 3100, 4150, [], 'шт', [], ['ЕЛ-03']],
  ['Osram', 'Лампа H7 Night Breaker Laser', '64210NL', 380, 590, [], 'шт', [], ['ЕЛ-04']],
  ['Philips', 'Лампа H4 X-tremeVision Pro150', '12342XVPS2', 450, 690, [], 'шт', [], ['ЕЛ-04']],
  ['Errecom', 'Мастило компресора PAG 46, 250 мл', 'OL6001.K.P2', 380, 590, [], 'шт', [], ['КН-02']],
  ['—', 'Фреон R134a, 1 кг', 'R134A-1', 520, 980, [], 'шт', [], ['КН-02']],
  ['Liqui Moly', 'Очищувач кондиціонера, 250 мл', '7577', 290, 460, [], 'шт', [], ['КН-03']],
  ['Schrader', 'Вентиль безкамерний TR414', 'TR414', 12, 30, [], 'шт', [], ['ШН-01', 'ШН-03']],
  ['Hofmann', 'Грузики балансувальні клеєві, 5 г × 100', 'WT-5-100', 160, 260, [], 'шт', [], ['ШН-02']],
  ['Tip Top', 'Латка-грибок для ремонту проколу', '4500064', 40, 90, [], 'шт', [], ['ШН-03']],
  ['Bosch', 'Щітки склоочисника Aerotwin, комплект', 'A863S', 820, 1190, ['Skoda Octavia', 'VW Passat', 'VW Golf'], 'компл', [], ['КЗ-01']],
  ['Liqui Moly', 'Очищувач дросельної заслінки, 400 мл', '5111', 260, 390, [], 'шт', [], ['ДВ-05']],
  ['Elring', 'Прокладка клапанної кришки', '915.920', 420, 640, ['Skoda Octavia', 'VW Golf'], 'шт', [], ['ДВ-07']],
];

const SUPPLIERS: [string, string, string, number, string][] = [
  [L('Автодеталь-Схід', 'Avtodetal-Skhid'), '+380 44 228 40 15', 'order@avtodetal-skhid.ua', 1, L('Фільтри й ходова, доставка двічі на день', 'Filters and suspension, delivered twice a day')],
  [L('ПартсХаб', 'PartsHub'), '+380 67 500 21 33', 'b2b@partshub.ua', 2, L('Оригінальні запчастини Toyota, Hyundai, Kia', 'Genuine Toyota, Hyundai and Kia parts')],
  [L('Мастила Плюс', 'Mastyla Plus'), '+380 50 411 09 90', 'sales@mastyla.plus', 1, L('Оливи, технічні рідини, хімія', 'Oils, fluids and chemicals')],
  [L('Елемент-Авто', 'Element-Avto'), '+380 44 593 77 10', 'zakaz@element-auto.ua', 3, L('Електрика, акумулятори, лампи', 'Electrics, batteries and bulbs')],
];

export function buildDemo(now: Date): Db {
  const r = rng(Number(`${now.getFullYear()}${now.getMonth()}${now.getDate()}`));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const s = settings(now);
  const { branches, posts } = branchesAndPosts(now);
  const { works, templates, rules } = catalog(now);
  // ключ — український код: генератор нижче посилається на нього
  const workByCode = new Map(works.map((w, i) => [WORKS[i][0], w]));
  const catRate = new Map(CATEGORIES.map((c) => [c.id, c.rate]));

  // ——— співробітники
  const emp = (id: string, branchId: string, name: string, role: Employee['role'], phone: string, skills: string[], payPercent: number, baseSalary: number): Employee => ({
    id, ...stamp(addDays(today, -400)), branchId, name, role, phone, skills, payPercent, baseSalary, active: true,
  });
  const ALL = CATEGORIES.map((c) => c.id);
  const employees: Employee[] = [
    emp('em_marchenko', 'br_pozniaky', L('Олег Марченко', 'Oleh Marchenko'), 'mechanic', '+380 67 210 44 18', ALL, 32, 8000),
    emp('em_tkachenko', 'br_pozniaky', L('Віталій Ткаченко', 'Vitalii Tkachenko'), 'mechanic', '+380 93 118 02 77', ['cat_to', 'cat_engine', 'cat_susp', 'cat_brakes'], 30, 8000),
    emp('em_lysenko', 'br_pozniaky', L('Андрій Лисенко', 'Andrii Lysenko'), 'mechanic', '+380 50 712 39 05', ['cat_susp', 'cat_brakes', 'cat_to'], 30, 7500),
    emp('em_rudenko', 'br_pozniaky', L('Юрій Руденко', 'Yurii Rudenko'), 'mechanic', '+380 97 344 81 62', ['cat_elec', 'cat_ac', 'cat_engine'], 35, 9000),
    emp('em_moroz', 'br_pozniaky', L('Тарас Мороз', 'Taras Moroz'), 'mechanic', '+380 66 905 13 48', ['cat_tires', 'cat_susp'], 28, 6500),
    emp('em_kovalchuk', 'br_pozniaky', L('Назар Ковальчук', 'Nazar Kovalchuk'), 'mechanic', '+380 63 470 22 91', ['cat_to', 'cat_body', 'cat_tires'], 28, 6500),
    emp('em_savchenko', 'br_vynohradar', L('Сергій Савченко', 'Serhii Savchenko'), 'mechanic', '+380 68 233 60 14', ALL, 32, 8000),
    emp('em_petrenko', 'br_vynohradar', L('Ігор Петренко', 'Ihor Petrenko'), 'mechanic', '+380 99 501 77 30', ['cat_to', 'cat_engine', 'cat_brakes'], 30, 7500),
    emp('em_bilous', 'br_vynohradar', L('Артем Білоус', 'Artem Bilous'), 'mechanic', '+380 95 120 48 63', ['cat_elec', 'cat_ac', 'cat_engine'], 34, 8500),
    emp('em_honcharenko', 'br_vynohradar', L('Богдан Гончаренко', 'Bohdan Honcharenko'), 'mechanic', '+380 73 388 15 02', ['cat_tires', 'cat_susp', 'cat_body'], 28, 6500),
    emp('em_olena', 'br_pozniaky', L('Олена Кравченко', 'Olena Kravchenko'), 'receptionist', '+380 67 450 30 11', [], 0, 18000),
    emp('em_iryna', 'br_vynohradar', L('Ірина Павленко', 'Iryna Pavlenko'), 'receptionist', '+380 50 677 21 40', [], 0, 17000),
    emp('em_stepan', 'br_pozniaky', L('Степан Яковенко', 'Stepan Yakovenko'), 'storekeeper', '+380 96 233 18 07', [], 0, 16000),
    emp('em_manager', 'br_pozniaky', L('Дмитро Захарченко', 'Dmytro Zakharchenko'), 'manager', '+380 67 101 55 20', [], 0, 32000),
  ];
  const postMechanic: Record<string, string> = {
    po_p1: 'em_marchenko', po_p2: 'em_tkachenko', po_p3: 'em_lysenko', po_pd: 'em_rudenko', po_pt: 'em_moroz', po_pe: 'em_kovalchuk',
    po_v1: 'em_savchenko', po_v2: 'em_petrenko', po_vd: 'em_bilous', po_vt: 'em_honcharenko',
  };

  // ——— постачальники й запчастини
  const suppliers: Supplier[] = SUPPLIERS.map(([name, phone, email, deliveryDays, notes], i) => ({ id: `sp_${i + 1}`, ...stamp(addDays(today, -300)), name, phone, email, deliveryDays, notes }));
  const supplierFor = (brand: string) => (['Toyota', 'Hyundai/Kia'].includes(brand) ? 'sp_2' : ['Castrol', 'Shell', 'Mobil', 'Motul', 'Febi', 'Liqui Moly', 'Errecom', '—'].includes(brand) ? 'sp_3' : ['Varta', 'Osram', 'Philips', 'Bosch'].includes(brand) && r.chance(0.5) ? 'sp_4' : 'sp_1');
  const parts: Part[] = PARTS.map(([brand, ukName, sku, cost, price, fits, unit, cross], i) => {
    const name = L(ukName, PART_EN[i]);
    const consumable = cost < 700;
    const min = consumable ? r.int(4, 10) : r.int(1, 3);
    return {
      id: `pt_${i + 1}`,
      ...stamp(addDays(today, -200)),
      sku, brand, name, crossNumbers: cross, fits, unit, cost, price,
      stock: { br_pozniaky: r.int(min, min * 3 + 4), br_vynohradar: r.int(Math.max(0, min - 2), min * 2 + 2) },
      reserved: { br_pozniaky: 0, br_vynohradar: 0 },
      minStock: min,
      supplierId: supplierFor(brand),
    };
  });
  // кілька позицій нижче мінімуму — щоб одразу спрацювали попередження й чернетка закупівлі
  for (const sku of ['W 712/95', 'GDB1550', '6PK1153', 'BKR6EIX-11']) {
    const p = parts.find((x) => x.sku === sku)!;
    p.stock['br_pozniaky'] = Math.max(0, p.minStock - r.int(1, 3));
  }
  const partsByWork = new Map<string, Part[]>();
  PARTS.forEach((row, i) => row[8].forEach((code) => partsByWork.set(code, [...(partsByWork.get(code) ?? []), parts[i]])));

  // ——— клієнти й авто
  const clients: Client[] = [];
  const cars: Car[] = [];
  const phone = () => `+380${r.pick(PHONE_CODES)}${String(r.int(1000000, 9999999))}`;
  const plate = () => `${r.pick(REGIONS)}${r.int(1000, 9999)}${PLATE_LETTERS[r.int(0, 11)]}${PLATE_LETTERS[r.int(0, 11)]}`;
  const makerWeights = VIN_DB.flatMap((m) => m.models.map((mod) => ({ maker: m, model: mod, w: ['Skoda', 'Volkswagen', 'Toyota', 'Renault', 'Hyundai', 'Kia'].includes(m.make) ? 3 : 1 })));
  const pickModel = () => {
    const total = makerWeights.reduce((s2, x) => s2 + x.w, 0);
    let t = r.next() * total;
    for (const x of makerWeights) if ((t -= x.w) < 0) return x;
    return makerWeights[0];
  };
  const usedPlates = new Set<string>();
  const newCar = (clientId: string, since: Date): Car => {
    const { maker, model } = pickModel();
    const year = r.int(model.years[0], Math.min(model.years[1], today.getFullYear()));
    let pl = plate();
    while (usedPlates.has(pl)) pl = plate();
    usedPlates.add(pl);
    const age = today.getFullYear() - year;
    return {
      id: `car_${cars.length + 1}`,
      ...stamp(since),
      clientId,
      vin: makeVin(maker, model, year, r.next),
      plate: pl,
      make: maker.make,
      model: model.model,
      year,
      engine: model.engine,
      gearbox: model.gearbox,
      color: r.pick(COLORS),
      mileage: Math.max(8000, age * r.int(12000, 22000) - r.int(0, 15000)),
      owners: [{ clientId, from: iso(since), to: null }],
    };
  };
  const TAGS = [L('постійний', 'regular'), TAG_DISCOUNT, 'VIP', TAG_FLEET, L('таксі', 'taxi'), L('рекомендував друзям', 'referred friends')];
  for (let i = 0; i < 170; i++) {
    const female = r.chance(0.38);
    const name = `${r.pick(female ? FIRST_F : FIRST_M)} ${r.pick(LAST)}`;
    const since = addDays(today, -r.int(30, 900));
    const c: Client = {
      id: `cl_${i + 1}`,
      ...stamp(since),
      kind: 'person',
      name,
      phone: phone(),
      email: r.chance(0.55) ? `${translit(name.split(' ')[0])}.${translit(name.split(' ')[1]).slice(0, 8)}@${r.pick(['gmail.com', 'ukr.net', 'i.ua', 'outlook.com'])}` : '',
      tags: r.chance(0.35) ? [r.pick(TAGS.filter((t) => t !== TAG_FLEET))] : [],
      notes: r.chance(0.15) ? r.pick(L(['Просить дзвонити після 18:00', 'Віддає перевагу оригінальним запчастинам', 'Зберігає шини в нас', 'Авто дружини теж обслуговується в нас'], ['Prefers calls after 18:00', 'Prefers genuine parts', 'Stores tyres with us', 'Their spouse’s car is serviced here too'])) : '',
      allowMessages: r.chance(0.85),
    };
    clients.push(c);
    cars.push(newCar(c.id, since));
    if (r.chance(0.12)) cars.push(newCar(c.id, addDays(since, r.int(10, 200))));
  }
  COMPANIES.forEach((name, i) => {
    const since = addDays(today, -r.int(200, 700));
    const c: Client = { id: `cl_c${i + 1}`, ...stamp(since), kind: 'company', name, phone: phone(), email: `fleet${i + 1}@${['pivdentrans', 'agroresurs', 'grebeniuk', 'kurier', 'budmaister', 'pharmlog'][i]}.ua`, tags: [TAG_FLEET], notes: L('Оплата за рахунком, відстрочка 14 днів', 'Pays by invoice, 14-day payment terms'), allowMessages: true };
    clients.push(c);
    for (let k = 0; k < r.int(3, 5); k++) cars.push(newCar(c.id, since));
  });
  // одне авто змінило власника — для історії власників
  const resold = cars[3];
  resold.owners = [{ clientId: clients[10].id, from: iso(addDays(today, -800)), to: iso(addDays(today, -260)) }, { clientId: resold.clientId, from: iso(addDays(today, -260)), to: null }];

  // ——— наряди за ~6 місяців і тиждень наперед
  const orders: Order[] = [];
  const approvals: Approval[] = [];
  const reminders: Reminder[] = [];
  const movements: StockMovement[] = [];
  const carMileage = new Map(cars.map((c) => [c.id, c.mileage - r.int(9000, 16000)]));
  let number = 1000;
  const lastVisit = new Map<string, number>();
  const receptionist = (b: string) => (b === 'br_pozniaky' ? L('Олена Кравченко', 'Olena Kravchenko') : L('Ірина Павленко', 'Iryna Pavlenko'));

  const mkWork = (code: string, rate: number, mech: string | null, state: OrderWork['state'], extra: Partial<OrderWork> = {}): OrderWork => {
    const w = workByCode.get(code)!;
    return {
      id: `w${number}${r.int(100, 999)}`,
      workId: w.id, name: w.name, hours: w.hours, rate, mechanicId: mech, state,
      actualMin: state === 'done' ? Math.round(w.hours * 60 * (0.72 + r.next() * 0.55)) : 0,
      runningSince: null, needsApproval: false, priority: 'must', decision: null, photos: [], ...extra,
    };
  };
  const mkPart = (p: Part, qty: number, state: { reserved: boolean; issued: boolean }, extra: Partial<OrderPart> = {}): OrderPart => ({
    id: `p${number}${r.int(100, 999)}`, partId: p.id, sku: p.sku, name: `${p.brand} ${p.name}`, qty, price: p.price, ...state, needsApproval: false, decision: null, ...extra,
  });

  const CODE_SETS: { codes: string[]; post: Post['kind'][]; w: number }[] = [
    { codes: ['ТО-01', 'ТО-02', 'ТО-03'], post: ['lift', 'express'], w: 6 },
    { codes: ['ТО-09', 'ТО-05', 'ТО-07'], post: ['lift'], w: 2 },
    { codes: ['ХД-01', 'ХД-03', 'ХД-06'], post: ['lift'], w: 3 },
    { codes: ['ГЛ-01', 'ГЛ-03'], post: ['lift', 'express'], w: 3 },
    { codes: ['ДВ-01', 'ДВ-02'], post: ['lift'], w: 1 },
    { codes: ['ЕЛ-01', 'ДВ-05'], post: ['diag'], w: 2 },
    { codes: ['ЕЛ-02', 'ЕЛ-03'], post: ['diag'], w: 1 },
    { codes: ['КН-01', 'КН-02', 'КН-03'], post: ['diag'], w: 2 },
    { codes: ['ШН-01', 'ШН-02'], post: ['tire'], w: 4 },
    { codes: ['ШН-03'], post: ['tire'], w: 1 },
    { codes: ['ХД-02', 'ХД-04'], post: ['lift'], w: 1 },
    { codes: ['ДВ-06'], post: ['lift'], w: 0.4 },
    { codes: ['КЗ-01', 'ЕЛ-04', 'ЕЛ-05'], post: ['express'], w: 1 },
  ];
  // рекомендації після діагностики, які йдуть на погодження
  const RECO: [string, Priority][] = [
    ['ГЛ-03', 'must'], ['ХД-03', 'recommended'], ['ТО-07', 'recommended'], ['ДВ-02', 'later'], ['КН-03', 'later'], ['ХД-05', 'recommended'], ['ТО-03', 'later'], ['ХД-02', 'recommended'],
  ];
  const pickSet = (kinds: Post['kind'][]) => {
    const opts = CODE_SETS.filter((x) => x.post.some((k) => kinds.includes(k)));
    const total = opts.reduce((s2, x) => s2 + x.w, 0);
    let t = r.next() * total;
    for (const x of opts) if ((t -= x.w) < 0) return x;
    return opts[0];
  };

  for (let d = -120; d <= 6; d++) {
    const day = addDays(today, d);
    const dow = day.getDay() || 7;
    for (const b of branches) {
      if (!b.workDays.includes(dow)) continue;
      const open = toMin(b.opensAt);
      const close = toMin(b.closesAt);
      for (const post of posts.filter((p) => p.branchId === b.id)) {
        // заповненість поста: у минулому ~60–75%, сьогодні й наперед — менше записів у далекі дні
        // щільність: тиждень навколо сьогодні — як у реальному сервісі; старіша історія — розріджена, щоб уміститися в localStorage
        // минуле — рівномірна помірна щільність (чесна аналітика й завантаження); сьогодні й тиждень наперед — повний розклад табло
        const fill = d < 0 ? 0.05 : d === 0 ? 0.5 : Math.max(0.15, 0.5 - d * 0.07);
        let cursor = open + r.pick([0, 0, 15, 30]);
        while (cursor < close - 45) {
          const set = pickSet([post.kind]);
          const chosen = set.codes.filter((_, i) => i === 0 || r.chance(0.55));
          const hours = chosen.reduce((s2, c) => s2 + workByCode.get(c)!.hours, 0);
          const duration = Math.max(30, Math.ceil((hours * 60) / 15) * 15 + (post.kind === 'diag' ? 15 : 0));
          if (cursor + duration > close) break;
          if (!r.chance(fill)) {
            cursor += r.pick([30, 45, 60]);
            continue;
          }
          const start = at(day, cursor);
          const end = cursor + duration;
          number++;
          // одне авто не приїжджає частіше ніж раз на ~3 тижні (окрім записів наперед)
          let car = r.pick(cars);
          for (let k = 0; k < 12 && (lastVisit.get(car.id) ?? -999) > d - 21; k++) car = r.pick(cars);
          lastVisit.set(car.id, d);
          const client = clients.find((c) => c.id === car.clientId)!;
          const mech = postMechanic[post.id];
          const rate = (code: string) => post.rate ?? catRate.get(workByCode.get(code)!.categoryId)!;

          // статус залежно від часу
          let status: OrderStatus;
          if (d < -2) status = r.chance(0.05) ? 'skasovano' : 'vydano';
          // частина авто з останніх двох днів лишається на ночі в роботі — канбан не порожній навіть зранку
          else if (d < 0) status = r.chance(0.55) ? 'vydano' : r.pick(['gotovo', 'gotovo', 'kontrol', 'v_roboti', 'v_roboti', 'pogodzhennia', 'diagnostyka'] as const);
          else if (d > 0) status = 'zapys';
          // завершені сьогодні: частину ще не забрали, частина чекає запчастин або відповіді клієнта
          else if (end <= nowMin - 60) status = r.chance(0.45) ? 'vydano' : r.pick(['gotovo', 'gotovo', 'kontrol', 'v_roboti', 'v_roboti', 'pogodzhennia', 'diagnostyka', 'pryiom'] as const);
          else if (end <= nowMin) status = 'kontrol';
          else if (cursor <= nowMin) status = r.pick(['v_roboti', 'v_roboti', 'diagnostyka', 'pogodzhennia']);
          else if (cursor <= nowMin + 30) status = 'pryiom';
          else status = 'zapys';

          const activeNow = d === 0 && cursor <= nowMin && end > nowMin;
          const idx = STATUS_FLOW.indexOf(status);
          const passed = (s2: OrderStatus) => status !== 'skasovano' && idx >= STATUS_FLOW.indexOf(s2);
          const doneWorks = passed('kontrol');
          const ow = chosen.map((c, i) =>
            mkWork(c, rate(c), mech, doneWorks ? 'done' : status === 'v_roboti' ? (i === 0 ? 'done' : i === 1 ? (activeNow ? 'in_progress' : 'paused') : 'todo') : 'todo', status === 'v_roboti' && i === 1 ? { actualMin: r.int(10, 30), runningSince: activeNow ? iso(at(day, Math.max(cursor, nowMin - 25))) : null } : {}),
          );
          const op: OrderPart[] = [];
          for (const c of chosen) {
            const candidates = (partsByWork.get(c) ?? []).filter((p) => !p.fits.length || p.fits.some((f) => `${car.make} ${car.model}`.startsWith(f)));
            if (!candidates.length || r.chance(0.25)) continue;
            const p = r.pick(candidates);
            const qty = c === 'ТО-05' ? 4 : c === 'ГЛ-03' && p.unit === 'шт' ? 2 : c === 'ХД-02' || c === 'ХД-03' ? 2 : 1;
            op.push(mkPart(p, qty, { reserved: passed('pryiom'), issued: passed('v_roboti') }));
          }

          // погодження після діагностики: частина нарядів отримує рекомендації
          let approvalId: string | null = null;
          const hasReco = status === 'pogodzhennia' || (post.kind !== 'tire' && passed('pogodzhennia') && r.chance(0.38));
          if (hasReco) {
            const items = r.shuffle(RECO).slice(0, r.int(1, 3));
            const answered = status !== 'pogodzhennia';
            for (const [code, priority] of items) {
              const decision = !answered ? null : priority === 'must' ? (r.chance(0.92) ? 'approved' : 'declined') : priority === 'recommended' ? (r.chance(0.6) ? 'approved' : 'declined') : r.chance(0.25) ? 'approved' : 'declined';
              const w = mkWork(code, rate(code), mech, decision === 'approved' && doneWorks ? 'done' : 'todo', { needsApproval: true, priority, decision });
              ow.push(w);
              const pcand = (partsByWork.get(code) ?? []).filter((p) => !p.fits.length || p.fits.some((f) => `${car.make} ${car.model}`.startsWith(f)));
              if (pcand.length) op.push(mkPart(r.pick(pcand), code === 'ХД-03' || code === 'ХД-02' ? 2 : 1, { reserved: decision === 'approved' && passed('v_roboti'), issued: decision === 'approved' && passed('v_roboti') }, { needsApproval: true, decision }));
              if (decision === 'declined' && d > -120) {
                const wk = workByCode.get(code)!;
                reminders.push({
                  id: `rm_${reminders.length + 1}`, ...stamp(start), source: 'deferred', clientId: client.id, carId: car.id, title: wk.name,
                  amount: Math.round(wk.hours * rate(code)), orderId: `or_${number}`, ruleId: null,
                  dueDate: iso(addDays(day, priority === 'must' ? 7 : priority === 'recommended' ? 30 : 90)), dueMileage: null,
                  status: r.chance(0.2) && d < -40 ? 'sent' : 'pending',
                });
              }
            }
            const apId = `ap_${number}`;
            approvalId = apId;
            approvals.push({
              id: apId, ...stamp(at(day, cursor + 30)), token: token(r.next), orderId: `or_${number}`, status: answered ? 'answered' : 'sent',
              items: ow.filter((w) => w.needsApproval).map((w) => ({ lineId: w.id, kind: 'work' as const, title: w.name, description: recoText(w.name), priority: w.priority, price: Math.round(w.hours * w.rate), photos: [], decision: w.decision })),
              message: L(
                `Вітаємо! Ми завершили діагностику ${car.make} ${car.model}. Перегляньте рекомендації та погодьте роботи.`,
                `Hello! We’ve finished diagnosing your ${car.make} ${car.model}. See the recommendations and approve the work.`,
              ),
              sentAt: iso(at(day, cursor + 30)), answeredAt: answered ? iso(at(day, cursor + 30 + r.int(10, 50))) : null, clientComment: '',
            });
          }

          // історія статусів
          const history: StatusChange[] = [];
          const steps = status === 'skasovano' ? ['zapys', 'skasovano'] : STATUS_FLOW.slice(0, idx + 1).filter((st) => st !== 'pogodzhennia' || hasReco);
          let t = addDays(start, -r.int(1, 6)).getTime() + r.int(9 * 60, 19 * 60) * 60000;
          steps.forEach((st, i) => {
            if (i === 1) t = start.getTime() - 10 * 60000;
            else if (i > 1) t += ((end - cursor) / Math.max(1, steps.length - 1)) * 60000;
            history.push({ from: (steps[i - 1] as OrderStatus) ?? null, to: st as OrderStatus, at: new Date(t).toISOString(), by: i === 0 ? receptionist(b.id) : st === 'v_roboti' || st === 'kontrol' ? employees.find((e) => e.id === mech)!.name : receptionist(b.id) });
          });

          const mileage = (carMileage.get(car.id) ?? car.mileage) + r.int(300, 2500);
          if (status !== 'zapys' && status !== 'skasovano') carMileage.set(car.id, mileage);
          const discountPct = client.tags.includes(TAG_DISCOUNT) ? 5 : client.kind === 'company' ? 3 : 0;
          const order: Order = {
            id: `or_${number}`, ...stamp(new Date(history[0].at)), number: `${ORDER_PREFIX}${number}`, branchId: b.id, clientId: client.id, carId: car.id, status,
            postId: post.id, start: iso(start), durationMin: duration, mechanicId: mech, complaint: r.pick(COMPLAINTS),
            mileage: passed('pryiom') ? mileage : null, works: ow, parts: op, discountPct, payments: [], history,
            intake: passed('pryiom') && d > -30 ? {
              mileage, fuel: r.pick([15, 25, 40, 50, 65, 80]), damages: r.chance(0.3) ? [{ id: `dm_${number}`, zone: r.pick(['bumper_front', 'door_fl', 'fender_rr', 'bumper_rear'] as const), kind: r.pick(['scratch', 'dent', 'chip'] as const), comment: L('Зафіксовано при прийомі', 'Recorded at intake'), photo: null }] : [],
              kit: { spare: r.chance(0.8), jack: r.chance(0.6), documents: true, keys: r.pick([1, 2]), rugs: r.chance(0.7), firstAid: r.chance(0.5) },
              complaints: '', signature: null, signedAt: iso(start), receivedBy: receptionist(b.id),
            } : null,
            approvalId, closedAt: status === 'vydano' ? history[history.length - 1].at : null, notes: '',
          };
          order.updatedAt = history[history.length - 1].at;
          // старі наряди зберігаємо компактно: створення й останній статус — уміщуємося в ліміт localStorage
          if (d < -21 && history.length > 2) order.history = [history[0], { ...history[history.length - 1], from: history[history.length - 2].to }];
          const totals = orderTotals(order);
          if (status === 'vydano') {
            const method = client.kind === 'company' ? 'transfer' : r.pick(['card', 'card', 'cash'] as const);
            const debt = client.kind === 'company' && d > -20 ? r.chance(0.5) : r.chance(0.03);
            const amount = debt ? Math.round(totals.total * r.pick([0, 0.5])) : totals.total;
            if (amount > 0) order.payments.push({ id: `pay_${number}`, method, amount, at: order.closedAt! });
          } else if (status === 'gotovo' && r.chance(0.3)) {
            order.payments.push({ id: `pay_${number}`, method: 'card', amount: Math.round(totals.total * 0.5), at: iso(start) });
          }
          orders.push(order);

          // рух складу: списання для виданих за останні 45 днів, резерви — для відкритих
          for (const p of op) {
            if (!p.partId) continue;
            const part = parts.find((x) => x.id === p.partId)!;
            if (p.issued && d > -21) movements.push({ id: `mv_${movements.length + 1}`, ...stamp(start), partId: part.id, type: 'out', qty: p.qty, branchId: b.id, toBranchId: null, orderId: order.id, note: L(`Видано в наряд ${order.number}`, `Issued to ${order.number}`) });
            if (p.reserved && !p.issued && status !== 'vydano' && status !== 'skasovano') {
              part.reserved[b.id] = (part.reserved[b.id] ?? 0) + p.qty;
              movements.push({ id: `mv_${movements.length + 1}`, ...stamp(start), partId: part.id, type: 'reserve', qty: p.qty, branchId: b.id, toBranchId: null, orderId: order.id, note: L(`Резерв під наряд ${order.number}`, `Reserved for ${order.number}`) });
            }
          }
          cursor = end + r.pick([0, 0, 15, 15, 30]);
        }
      }
    }
  }
  // пробіг авто — останній зафіксований
  for (const c of cars) c.mileage = Math.max(c.mileage, carMileage.get(c.id) ?? c.mileage);
  // резерв не може перевищувати залишок
  for (const p of parts) for (const b of branches) p.stock[b.id] = Math.max(p.stock[b.id], p.reserved[b.id]);

  // початкові надходження на склад
  for (const p of parts) for (const b of branches) {
    movements.unshift({ id: `mv_in_${p.id}_${b.id}`, ...stamp(addDays(today, -60)), partId: p.id, type: 'in', qty: p.stock[b.id] + 4, branchId: b.id, toBranchId: null, orderId: null, note: L('Надходження від постачальника', 'Received from supplier') });
  }
  movements.push({ id: 'mv_tr_1', ...stamp(addDays(today, -6)), partId: parts[4].id, type: 'transfer', qty: 3, branchId: 'br_pozniaky', toBranchId: 'br_vynohradar', orderId: null, note: L('Переміщення між філіями', 'Transfer between branches') });

  // поточний пробіг авто = пробіг на останньому прийомі
  for (const c of cars) c.mileage = carMileage.get(c.id) ?? c.mileage;

  const purchases: PurchaseOrder[] = [
    { id: 'pu_1', ...stamp(addDays(today, -21)), number: `${PURCHASE_PREFIX}0041`, supplierId: 'sp_1', branchId: 'br_pozniaky', status: 'received', lines: [{ partId: parts[4].id, qty: 20, cost: parts[4].cost }, { partId: parts[33].id, qty: 6, cost: parts[33].cost }], auto: false },
    { id: 'pu_2', ...stamp(addDays(today, -2)), number: `${PURCHASE_PREFIX}0042`, supplierId: 'sp_3', branchId: 'br_vynohradar', status: 'sent', lines: [{ partId: parts[0].id, qty: 10, cost: parts[0].cost }, { partId: parts[19].id, qty: 12, cost: parts[19].cost }], auto: false },
  ];

  const mailings: Mailing[] = [
    {
      id: 'ml_1', ...stamp(addDays(today, -26)), templateId: 'tp_2', channel: 'sms', title: L('Сезонна заміна шин — осінь', 'Seasonal tyre change — autumn'),
      recipients: clients.filter((c) => c.allowMessages).slice(0, 34).map((c) => ({ clientId: c.id, carId: cars.find((x) => x.clientId === c.id)?.id ?? null, phone: c.phone, text: fill(templates[1].text, c.name.split(' ')[0], '', '', '', s.serviceName) })),
    },
    {
      id: 'ml_2', ...stamp(addDays(today, -9)), templateId: 'tp_1', channel: 'viber', title: L('Нагадування про ТО', 'Service reminder'),
      recipients: clients.filter((c) => c.allowMessages).slice(20, 31).map((c) => ({ clientId: c.id, carId: cars.find((x) => x.clientId === c.id)?.id ?? null, phone: c.phone, text: fill(templates[0].text, c.name.split(' ')[0], L('авто', 'car'), '', L('заміна оливи', 'oil change'), s.serviceName) })),
    },
  ];

  const notifications: AppNotification[] = [
    { id: 'nt_1', ...stamp(addDays(now, 0)), kind: 'stock', title: L('Низький залишок', 'Low stock'), text: L('4 позиції на складі Позняків нижче мінімуму. Чернетку замовлення створено.', '4 items at the Pozniaky stockroom are below minimum. A purchase order draft has been created.'), link: '/sklad/zakupivli', read: false },
    { id: 'nt_2', ...stamp(new Date(now.getTime() - 50 * 60000)), kind: 'order', title: L('Авто готове до видачі', 'Car ready for pickup'), text: L('Кілька нарядів очікують клієнтів у статусі «Готово».', 'Several work orders are waiting for customers in “Ready”.'), link: '/naryady/kanban', read: false },
    { id: 'nt_3', ...stamp(addDays(today, -1)), kind: 'system', title: L('Демо-дані згенеровано', 'Demo data generated'), text: L('Усе зберігається в localStorage вашого браузера. Розділ «Дані» в налаштуваннях — експорт і скидання.', 'Everything is stored in your browser’s localStorage. Settings → Data lets you export or reset it.'), link: '/nalashtuvannia/dani', read: true },
  ];

  const activity: ActivityEntry[] = orders
    .filter((o) => o.updatedAt >= iso(addDays(today, -1)))
    .slice(-25)
    .reverse()
    .map((o, i) => ({ id: `ac_seed_${i}`, createdAt: o.updatedAt, updatedAt: o.updatedAt, entity: 'orders' as const, entityId: o.id, action: 'status' as const, summary: L(`Наряд ${o.number}: статус «${STATUS_LABEL[o.history[o.history.length - 1].to]}»`, `Work order ${o.number}: status “${STATUS_LABEL[o.history[o.history.length - 1].to]}”`) }));

  const views: SavedView[] = [
    { id: 'vw_1', ...stamp(now), table: 'clients', name: L('Автопарки', 'Fleets'), state: { sort: { key: 'spent', dir: 'desc' }, filters: { kind: ['company'] }, columns: [], query: '' } },
    { id: 'vw_2', ...stamp(now), table: 'clients', name: L('З боргом', 'With debt'), state: { sort: { key: 'debt', dir: 'desc' }, filters: { debt: ['yes'] }, columns: [], query: '' } },
  ];

  return {
    settings: [s], branches, posts, employees, clients, cars, orders, works, parts, movements, suppliers, purchases,
    approvals, reminders, rules, templates, mailings, activity, notifications, views,
  };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function token(rnd: () => number) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => abc[Math.floor(rnd() * abc.length)]).join('');
}

function recoText(title: string): string {
  const name = title.toLowerCase();
  if (/дисків|disc/.test(name)) return L('Знос дисків нижче допустимого, на поверхні борозни. Гальмівний шлях збільшено.', 'Disc wear is below the limit, with grooves on the surface. Braking distance has increased.');
  if (/стабілізатора|stabiliser/.test(name)) return L('Люфт стійок, стукіт на нерівностях. Не критично, але погіршує керованість.', 'The links have play and knock over bumps. Not critical, but it affects handling.');
  if (/гальмівної рідини|brake fluid/.test(name)) return L('Рідина вологою понад 3 %, рекомендована заміна за регламентом.', 'The fluid holds over 3% moisture; a scheduled change is recommended.');
  if (/ременя|drive belt/.test(name)) return L('На ремені тріщини, ресурс близько 5 000 км.', 'The belt is cracked, with about 5,000 km of life left.');
  if (/амортизатор|shock absorber/.test(name)) return L('Підтікання й послаблення амортизаторів, авто розгойдується.', 'The shock absorbers are leaking and worn; the car sways.');
  if (/сайлентблок|bush/.test(name)) return L('Розриви гуми сайлентблоків, можливий знос шин.', 'The bush rubber is torn, which can wear the tyres.');
  return L('Рекомендовано за результатами огляду.', 'Recommended after inspection.');
}

const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', '’': '' };
const translit = (s: string) => [...s.toLowerCase()].map((c) => TR[c] ?? c).join('');

/** Підставляє змінні шаблону повідомлення */
export function fill(text: string, name: string, car: string, plate: string, work: string, service: string, link = 'tork.ua/zapys') {
  return text
    .replace(/\{(ім’я|name)\}/g, name)
    .replace(/\{(авто|car)\}/g, car)
    .replace(/\{(номер|plate)\}/g, plate)
    .replace(/\{(робота|work)\}/g, work)
    .replace(/\{(сервіс|service)\}/g, service)
    .replace(/\{(посилання|link)\}/g, link)
    .replace(/\{(дата|date)\}/g, '');
}
