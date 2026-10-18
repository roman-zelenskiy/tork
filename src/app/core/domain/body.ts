import { BodyZone, DamageKind } from '../data/models';
import { L } from '../i18n';

export const ZONE_LABEL: Record<BodyZone, string> = {
  bumper_front: L('Передній бампер', 'Front bumper'),
  bumper_rear: L('Задній бампер', 'Rear bumper'),
  hood: L('Капот', 'Bonnet'),
  roof: L('Дах', 'Roof'),
  trunk: L('Кришка багажника', 'Boot lid'),
  windshield: L('Лобове скло', 'Windscreen'),
  rear_window: L('Заднє скло', 'Rear window'),
  fender_fl: L('Крило переднє ліве', 'Front left wing'),
  fender_fr: L('Крило переднє праве', 'Front right wing'),
  fender_rl: L('Крило заднє ліве', 'Rear left wing'),
  fender_rr: L('Крило заднє праве', 'Rear right wing'),
  door_fl: L('Двері передні ліві', 'Front left door'),
  door_fr: L('Двері передні праві', 'Front right door'),
  door_rl: L('Двері задні ліві', 'Rear left door'),
  door_rr: L('Двері задні праві', 'Rear right door'),
  mirror_l: L('Дзеркало ліве', 'Left mirror'),
  mirror_r: L('Дзеркало праве', 'Right mirror'),
  wheel_fl: L('Колесо переднє ліве', 'Front left wheel'),
  wheel_fr: L('Колесо переднє праве', 'Front right wheel'),
  wheel_rl: L('Колесо заднє ліве', 'Rear left wheel'),
  wheel_rr: L('Колесо заднє праве', 'Rear right wheel'),
  headlight_l: L('Фара ліва', 'Left headlight'),
  headlight_r: L('Фара права', 'Right headlight'),
  taillight_l: L('Ліхтар лівий', 'Left tail light'),
  taillight_r: L('Ліхтар правий', 'Right tail light'),
};

export const DAMAGE_LABEL: Record<DamageKind, string> = {
  scratch: L('Подряпина', 'Scratch'),
  dent: L('Вм’ятина', 'Dent'),
  chip: L('Скол', 'Chip'),
  crack: L('Тріщина', 'Crack'),
};

/** Кольори маркерів пошкоджень на схемі */
export const DAMAGE_COLOR: Record<DamageKind, string> = {
  scratch: 'var(--s-pog)',
  dent: 'var(--s-work)',
  chip: 'var(--s-qc)',
  crack: 'var(--danger)',
};
