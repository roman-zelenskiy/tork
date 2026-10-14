/**
 * Моделі даних «Торка». Кожна сутність зберігається окремим ключем localStorage
 * як JSON-масив об’єктів з id, createdAt, updatedAt (див. ENTITY_KEYS).
 */

export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type Id = string;

// ——— організація

export interface Branch extends Entity {
  name: string;
  address: string;
  phone: string;
  /** Робочий час, «HH:MM» */
  opensAt: string;
  closesAt: string;
  /** Робочі дні тижня: 1 — понеділок … 7 — неділя */
  workDays: number[];
}

export type PostKind = 'lift' | 'diag' | 'tire' | 'body' | 'express';

export interface Post extends Entity {
  branchId: Id;
  name: string;
  kind: PostKind;
  /** Ставка нормо-години поста; якщо не задана — береться ставка категорії робіт */
  rate: number | null;
  active: boolean;
}

export type EmployeeRole = 'mechanic' | 'receptionist' | 'manager' | 'storekeeper';

export interface Employee extends Entity {
  branchId: Id;
  name: string;
  role: EmployeeRole;
  phone: string;
  /** Категорії робіт, які виконує механік */
  skills: Id[];
  /** Відсоток від вартості закритих нормо-годин */
  payPercent: number;
  /** Фіксована частина зарплати за місяць */
  baseSalary: number;
  active: boolean;
}

// ——— клієнти й авто

export type ClientKind = 'person' | 'company';

export interface Client extends Entity {
  kind: ClientKind;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  notes: string;
  /** Згода на SMS/Viber-нагадування */
  allowMessages: boolean;
}

export interface CarOwnership {
  clientId: Id;
  from: string;
  to: string | null;
}

export interface Car extends Entity {
  clientId: Id;
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  engine: string;
  gearbox: string;
  color: string;
  mileage: number;
  owners: CarOwnership[];
}

// ——— довідник нормо-годин

export interface WorkCategory {
  id: Id;
  name: string;
  /** Ставка нормо-години, ₴ */
  rate: number;
}

export interface Work extends Entity {
  code: string;
  name: string;
  categoryId: Id;
  /** Норматив, години */
  hours: number;
  /** Для яких марок (порожньо — для всіх) */
  makes: string[];
}

// ——— склад

export interface Part extends Entity {
  sku: string;
  brand: string;
  name: string;
  crossNumbers: string[];
  /** Застосовність: «Skoda Octavia», «VW Golf» … */
  fits: string[];
  unit: 'шт' | 'л' | 'компл' | 'м';
  /** Закупівельна й роздрібна ціна, ₴ */
  cost: number;
  price: number;
  /** Залишок по філіях */
  stock: Record<Id, number>;
  /** Зарезервовано під наряди по філіях */
  reserved: Record<Id, number>;
  minStock: number;
  supplierId: Id | null;
}

export type MovementType = 'in' | 'out' | 'transfer' | 'reserve' | 'release' | 'writeoff';

export interface StockMovement extends Entity {
  partId: Id;
  type: MovementType;
  qty: number;
  branchId: Id;
  /** Для переміщення — філія-отримувач */
  toBranchId: Id | null;
  orderId: Id | null;
  note: string;
}

export interface Supplier extends Entity {
  name: string;
  phone: string;
  email: string;
  deliveryDays: number;
  notes: string;
}

export type PurchaseStatus = 'draft' | 'sent' | 'received';

export interface PurchaseOrder extends Entity {
  number: string;
  supplierId: Id;
  branchId: Id;
  status: PurchaseStatus;
  lines: { partId: Id; qty: number; cost: number }[];
  /** Створено автоматично через низький залишок */
  auto: boolean;
}

// ——— наряди

export const ORDER_STATUSES = [
  'zapys',
  'pryiom',
  'diagnostyka',
  'pogodzhennia',
  'v_roboti',
  'kontrol',
  'gotovo',
  'vydano',
  'skasovano',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type WorkState = 'todo' | 'in_progress' | 'paused' | 'done';
export type Priority = 'must' | 'recommended' | 'later';
export type Decision = 'approved' | 'declined' | null;

export interface OrderWork {
  id: Id;
  workId: Id | null;
  name: string;
  hours: number;
  rate: number;
  mechanicId: Id | null;
  state: WorkState;
  /** Фактичний час, хв (сума відрізків роботи) */
  actualMin: number;
  /** Початок поточного відрізка, якщо механік зараз працює */
  runningSince: string | null;
  /** Потребує погодження клієнтом (додано після діагностики) */
  needsApproval: boolean;
  priority: Priority;
  decision: Decision;
  photos: string[];
  /** Пояснення для клієнта (рекомендації погодження) */
  note?: string;
}

export interface OrderPart {
  id: Id;
  partId: Id | null;
  sku: string;
  name: string;
  qty: number;
  price: number;
  /** Зарезервовано на складі / видано в роботу (списано) */
  reserved: boolean;
  issued: boolean;
  needsApproval: boolean;
  decision: Decision;
}

export type PayMethod = 'cash' | 'card' | 'transfer';

export interface Payment {
  id: Id;
  method: PayMethod;
  amount: number;
  at: string;
}

export interface StatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  by: string;
}

export type BodyZone =
  | 'bumper_front'
  | 'bumper_rear'
  | 'hood'
  | 'roof'
  | 'trunk'
  | 'windshield'
  | 'rear_window'
  | 'fender_fl'
  | 'fender_fr'
  | 'fender_rl'
  | 'fender_rr'
  | 'door_fl'
  | 'door_fr'
  | 'door_rl'
  | 'door_rr'
  | 'mirror_l'
  | 'mirror_r'
  | 'wheel_fl'
  | 'wheel_fr'
  | 'wheel_rl'
  | 'wheel_rr'
  | 'headlight_l'
  | 'headlight_r'
  | 'taillight_l'
  | 'taillight_r';

export type DamageKind = 'scratch' | 'dent' | 'chip' | 'crack';

export interface Damage {
  id: Id;
  zone: BodyZone;
  kind: DamageKind;
  comment: string;
  /** Стиснене фото, data URL (JPEG) */
  photo: string | null;
}

export interface IntakeAct {
  mileage: number;
  /** Рівень пального, 0–100 % */
  fuel: number;
  damages: Damage[];
  kit: { spare: boolean; jack: boolean; documents: boolean; keys: number; rugs: boolean; firstAid: boolean };
  complaints: string;
  /** Підпис клієнта на canvas, data URL PNG */
  signature: string | null;
  signedAt: string | null;
  receivedBy: string;
}

export interface Order extends Entity {
  number: string;
  branchId: Id;
  clientId: Id;
  carId: Id;
  status: OrderStatus;
  /** Запис на табло: пост, початок і тривалість */
  postId: Id | null;
  start: string | null;
  durationMin: number;
  /** Відповідальний механік запису */
  mechanicId: Id | null;
  complaint: string;
  mileage: number | null;
  works: OrderWork[];
  parts: OrderPart[];
  discountPct: number;
  payments: Payment[];
  history: StatusChange[];
  intake: IntakeAct | null;
  approvalId: Id | null;
  closedAt: string | null;
  notes: string;
}

// ——— погодження, нагадування, повідомлення

export type ApprovalStatus = 'sent' | 'answered' | 'cancelled';

export interface ApprovalItem {
  /** id рядка роботи/запчастини наряду */
  lineId: Id;
  kind: 'work' | 'part';
  title: string;
  description: string;
  priority: Priority;
  price: number;
  photos: string[];
  decision: Decision;
}

export interface Approval extends Entity {
  token: string;
  orderId: Id;
  status: ApprovalStatus;
  items: ApprovalItem[];
  message: string;
  sentAt: string;
  answeredAt: string | null;
  /** Коментар клієнта до відповіді */
  clientComment: string;
}

export type ReminderSource = 'deferred' | 'rule';
export type ReminderStatus = 'pending' | 'sent' | 'booked' | 'dismissed';

export interface Reminder extends Entity {
  source: ReminderSource;
  clientId: Id;
  carId: Id;
  title: string;
  /** Для відкладених робіт — орієнтовна сума */
  amount: number;
  orderId: Id | null;
  ruleId: Id | null;
  dueDate: string | null;
  dueMileage: number | null;
  status: ReminderStatus;
}

export interface ReminderRule extends Entity {
  name: string;
  /** Інтервал за пробігом і часом; спрацьовує те, що настане раніше */
  everyKm: number | null;
  everyMonths: number | null;
  /** Сезонне правило (шини): місяці, коли нагадувати */
  seasonMonths: number[];
  /** Код роботи з довідника, за якою визначається останнє виконання */
  workCode: string;
  templateId: Id | null;
  active: boolean;
}

export type Channel = 'sms' | 'viber';

export interface MessageTemplate extends Entity {
  name: string;
  channel: Channel;
  /** Змінні: {ім’я}, {авто}, {номер}, {робота}, {дата}, {посилання}, {сервіс} */
  text: string;
}

export interface Mailing extends Entity {
  templateId: Id | null;
  channel: Channel;
  title: string;
  recipients: { clientId: Id; carId: Id | null; phone: string; text: string }[];
}

// ——— журнал, сповіщення, налаштування

export type EntityKey = keyof typeof ENTITY_KEYS;

export interface ActivityEntry extends Entity {
  entity: EntityKey;
  entityId: Id;
  action: 'create' | 'update' | 'delete' | 'status' | 'stock' | 'message' | 'import';
  summary: string;
}

export interface AppNotification extends Entity {
  kind: 'approval' | 'stock' | 'order' | 'system';
  title: string;
  text: string;
  link: string | null;
  read: boolean;
}

export interface SavedView extends Entity {
  table: string;
  name: string;
  state: { sort: { key: string; dir: 'asc' | 'desc' } | null; filters: Record<string, string[]>; columns: string[]; query: string };
}

export interface Settings extends Entity {
  serviceName: string;
  phone: string;
  email: string;
  site: string;
  currency: 'UAH';
  categories: WorkCategory[];
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  /** Активна філія за замовчуванням */
  branchId: Id | null;
  /** Крок табло, хв */
  slotMin: number;
}

/** Ключі localStorage для кожної сутності — читабельні в DevTools → Application → Local Storage */
export const ENTITY_KEYS = {
  branches: 'tork:branches',
  posts: 'tork:posts',
  employees: 'tork:employees',
  clients: 'tork:clients',
  cars: 'tork:cars',
  orders: 'tork:orders',
  works: 'tork:works',
  parts: 'tork:parts',
  movements: 'tork:stock-movements',
  suppliers: 'tork:suppliers',
  purchases: 'tork:purchase-orders',
  approvals: 'tork:approvals',
  reminders: 'tork:reminders',
  rules: 'tork:reminder-rules',
  templates: 'tork:message-templates',
  mailings: 'tork:mailings',
  activity: 'tork:activity-log',
  notifications: 'tork:notifications',
  views: 'tork:saved-views',
  settings: 'tork:settings',
} as const;

export interface EntityMap {
  branches: Branch;
  posts: Post;
  employees: Employee;
  clients: Client;
  cars: Car;
  orders: Order;
  works: Work;
  parts: Part;
  movements: StockMovement;
  suppliers: Supplier;
  purchases: PurchaseOrder;
  approvals: Approval;
  reminders: Reminder;
  rules: ReminderRule;
  templates: MessageTemplate;
  mailings: Mailing;
  activity: ActivityEntry;
  notifications: AppNotification;
  views: SavedView;
  settings: Settings;
}

export const META_KEY = 'tork:meta';
export const SCHEMA_VERSION = 7;
