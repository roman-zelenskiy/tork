import { BodyZone, DamageKind } from '../data/models';

export const ZONE_LABEL: Record<BodyZone, string> = {
  bumper_front: 'Передній бампер',
  bumper_rear: 'Задній бампер',
  hood: 'Капот',
  roof: 'Дах',
  trunk: 'Кришка багажника',
  windshield: 'Лобове скло',
  rear_window: 'Заднє скло',
  fender_fl: 'Крило переднє ліве',
  fender_fr: 'Крило переднє праве',
  fender_rl: 'Крило заднє ліве',
  fender_rr: 'Крило заднє праве',
  door_fl: 'Двері передні ліві',
  door_fr: 'Двері передні праві',
  door_rl: 'Двері задні ліві',
  door_rr: 'Двері задні праві',
  mirror_l: 'Дзеркало ліве',
  mirror_r: 'Дзеркало праве',
  wheel_fl: 'Колесо переднє ліве',
  wheel_fr: 'Колесо переднє праве',
  wheel_rl: 'Колесо заднє ліве',
  wheel_rr: 'Колесо заднє праве',
  headlight_l: 'Фара ліва',
  headlight_r: 'Фара права',
  taillight_l: 'Ліхтар лівий',
  taillight_r: 'Ліхтар правий',
};

export const DAMAGE_LABEL: Record<DamageKind, string> = {
  scratch: 'Подряпина',
  dent: 'Вм’ятина',
  chip: 'Скол',
  crack: 'Тріщина',
};

/** Кольори маркерів пошкоджень на схемі */
export const DAMAGE_COLOR: Record<DamageKind, string> = {
  scratch: 'var(--s-pog)',
  dent: 'var(--s-work)',
  chip: 'var(--s-qc)',
  crack: 'var(--danger)',
};
