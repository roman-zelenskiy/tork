/**
 * Мок-декодер VIN: перевірка формату + розбір за кодом виробника (WMI, символи 1–3),
 * описовою частиною (VDS, символи 4–8) і модельним роком (символ 10).
 * База покриває популярні в Україні моделі; демо-автомобілі згенеровано з цих самих шаблонів.
 */

export interface VinModel {
  /** Символи 4–8, «*» — будь-який символ */
  vds: string;
  model: string;
  engine: string;
  gearbox: string;
  years: [number, number];
}

export interface VinMaker {
  wmi: string;
  make: string;
  country: string;
  models: VinModel[];
}

export const VIN_DB: VinMaker[] = [
  {
    wmi: 'TMB',
    make: 'Skoda',
    country: 'Чехія',
    models: [
      { vds: 'JJ7NE', model: 'Octavia A7', engine: '1.4 TSI, 150 к.с.', gearbox: 'DSG-7', years: [2013, 2019] },
      { vds: 'AG7NE', model: 'Octavia A7', engine: '1.6 TDI, 110 к.с.', gearbox: 'МКПП-5', years: [2013, 2019] },
      { vds: 'ER7NX', model: 'Octavia A8', engine: '2.0 TDI, 150 к.с.', gearbox: 'DSG-7', years: [2020, 2024] },
      { vds: 'JF7NS', model: 'Kodiaq', engine: '2.0 TSI, 190 к.с.', gearbox: 'DSG-7', years: [2017, 2023] },
      { vds: 'AB4NJ', model: 'Fabia', engine: '1.0 MPI, 75 к.с.', gearbox: 'МКПП-5', years: [2015, 2021] },
    ],
  },
  {
    wmi: 'WVW',
    make: 'Volkswagen',
    country: 'Німеччина',
    models: [
      { vds: 'ZZZ3C', model: 'Passat B8', engine: '2.0 TDI, 150 к.с.', gearbox: 'DSG-6', years: [2015, 2022] },
      { vds: 'ZZZ3A', model: 'Passat B7', engine: '1.8 TSI, 160 к.с.', gearbox: 'DSG-7', years: [2011, 2015] },
      { vds: 'ZZZAU', model: 'Golf VII', engine: '1.4 TSI, 125 к.с.', gearbox: 'МКПП-6', years: [2013, 2020] },
      { vds: 'ZZZ5N', model: 'Tiguan', engine: '2.0 TDI, 150 к.с.', gearbox: 'DSG-7', years: [2016, 2023] },
    ],
  },
  {
    wmi: 'JTD',
    make: 'Toyota',
    country: 'Японія',
    models: [
      { vds: 'BZ3EK', model: 'Camry XV70', engine: '2.5 Dual VVT-iE, 181 к.с.', gearbox: 'АКПП-8', years: [2018, 2023] },
      { vds: 'KB3FU', model: 'Corolla E210', engine: '1.6 Valvematic, 132 к.с.', gearbox: 'CVT', years: [2019, 2024] },
    ],
  },
  {
    wmi: 'JTM',
    make: 'Toyota',
    country: 'Японія',
    models: [{ vds: 'RFREV', model: 'RAV4 XA50', engine: '2.0 Dynamic Force, 173 к.с.', gearbox: 'CVT', years: [2019, 2024] }],
  },
  {
    wmi: 'VF1',
    make: 'Renault',
    country: 'Франція',
    models: [
      { vds: 'HSRCA', model: 'Duster', engine: '1.5 dCi, 109 к.с.', gearbox: 'МКПП-6', years: [2015, 2022] },
      { vds: 'BZ1B0', model: 'Megane IV', engine: '1.5 dCi, 110 к.с.', gearbox: 'EDC-6', years: [2016, 2022] },
      { vds: 'LBRBM', model: 'Logan', engine: '1.6 MPI, 82 к.с.', gearbox: 'МКПП-5', years: [2013, 2021] },
    ],
  },
  {
    wmi: 'KMH',
    make: 'Hyundai',
    country: 'Корея',
    models: [
      { vds: 'J381A', model: 'Tucson', engine: '2.0 MPI, 150 к.с.', gearbox: 'АКПП-6', years: [2016, 2021] },
      { vds: 'D341C', model: 'Elantra', engine: '1.6 MPI, 128 к.с.', gearbox: 'АКПП-6', years: [2016, 2020] },
    ],
  },
  {
    wmi: 'KNA',
    make: 'Kia',
    country: 'Корея',
    models: [
      { vds: 'PM814', model: 'Sportage', engine: '2.0 CRDi, 185 к.с.', gearbox: 'АКПП-6', years: [2016, 2022] },
      { vds: 'B2512', model: 'Ceed', engine: '1.6 GDi, 135 к.с.', gearbox: 'DCT-7', years: [2018, 2023] },
    ],
  },
  {
    wmi: 'SJN',
    make: 'Nissan',
    country: 'Велика Британія',
    models: [
      { vds: 'FAAJ1', model: 'Qashqai J11', engine: '1.2 DIG-T, 115 к.с.', gearbox: 'CVT', years: [2014, 2021] },
      { vds: 'FAAZE', model: 'Leaf ZE1', engine: 'електро, 40 кВт·год', gearbox: 'редуктор', years: [2018, 2023] },
    ],
  },
  {
    wmi: 'JMB',
    make: 'Mitsubishi',
    country: 'Японія',
    models: [{ vds: 'XTGF2', model: 'Outlander III', engine: '2.0 MIVEC, 146 к.с.', gearbox: 'CVT', years: [2013, 2021] }],
  },
  {
    wmi: 'WF0',
    make: 'Ford',
    country: 'Німеччина',
    models: [
      { vds: 'XXGCD', model: 'Focus III', engine: '1.6 Ti-VCT, 125 к.с.', gearbox: 'PowerShift-6', years: [2011, 2018] },
      { vds: 'XXTTG', model: 'Kuga II', engine: '2.0 TDCi, 150 к.с.', gearbox: 'АКПП-6', years: [2013, 2019] },
    ],
  },
  {
    wmi: 'JMZ',
    make: 'Mazda',
    country: 'Японія',
    models: [
      { vds: 'GJ1W6', model: '6 GJ', engine: '2.5 Skyactiv-G, 192 к.с.', gearbox: 'АКПП-6', years: [2013, 2022] },
      { vds: 'KF2W7', model: 'CX-5 KF', engine: '2.0 Skyactiv-G, 165 к.с.', gearbox: 'АКПП-6', years: [2017, 2024] },
    ],
  },
  {
    wmi: 'WBA',
    make: 'BMW',
    country: 'Німеччина',
    models: [
      { vds: '8E310', model: '3 Series G20', engine: '320d, 190 к.с.', gearbox: 'АКПП-8', years: [2019, 2024] },
      { vds: 'CV610', model: 'X5 G05', engine: '30d, 265 к.с.', gearbox: 'АКПП-8', years: [2018, 2024] },
    ],
  },
  {
    wmi: 'WAU',
    make: 'Audi',
    country: 'Німеччина',
    models: [{ vds: 'ZZZF2', model: 'A6 C8', engine: '2.0 TFSI, 245 к.с.', gearbox: 'S tronic-7', years: [2018, 2024] }],
  },
  {
    wmi: 'WDD',
    make: 'Mercedes-Benz',
    country: 'Німеччина',
    models: [{ vds: '2130C', model: 'E-Class W213', engine: 'E 220 d, 194 к.с.', gearbox: '9G-Tronic', years: [2016, 2023] }],
  },
  {
    wmi: 'Y6D',
    make: 'Daewoo',
    country: 'Україна',
    models: [{ vds: 'TF696', model: 'Lanos', engine: '1.5, 86 к.с.', gearbox: 'МКПП-5', years: [2005, 2013] }],
  },
  {
    wmi: 'KL1',
    make: 'Chevrolet',
    country: 'Корея',
    models: [{ vds: 'TD5DE', model: 'Aveo T300', engine: '1.6, 115 к.с.', gearbox: 'АКПП-6', years: [2012, 2016] }],
  },
];

/** Символ моделі року (позиція 10) — цикл 30 років */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function yearCode(year: number): string {
  return YEAR_CODES[(year - 2010 + 30 * 10) % 30];
}

function decodeYear(code: string, range: [number, number]): number | null {
  const idx = YEAR_CODES.indexOf(code);
  if (idx < 0) return null;
  // можливі роки: 1980+idx, 2010+idx, 2040+idx — беремо той, що потрапляє в роки випуску моделі
  for (const base of [2010, 1980, 2040]) {
    const y = base + idx;
    if (y >= range[0] - 1 && y <= range[1] + 1) return y;
  }
  return 2010 + idx <= new Date().getFullYear() + 1 ? 2010 + idx : 1980 + idx;
}

export type VinCheck = { ok: true } | { ok: false; error: string };

/** Формат VIN: 17 символів, латиниця й цифри без I, O, Q */
export function checkVin(raw: string): VinCheck {
  const vin = normalizeVin(raw);
  if (!vin) return { ok: false, error: 'Введіть VIN' };
  if (vin.length !== 17) return { ok: false, error: `VIN має 17 символів, зараз ${vin.length}` };
  if (/[IOQ]/.test(vin)) return { ok: false, error: 'У VIN не буває літер I, O і Q — перевірте, чи це не 1 і 0' };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { ok: false, error: 'Лише латинські літери й цифри' };
  return { ok: true };
}

export const normalizeVin = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

export interface VinDecoded {
  make: string;
  model: string;
  year: number | null;
  engine: string;
  gearbox: string;
  country: string;
}

export function decodeVin(raw: string): VinDecoded | null {
  const vin = normalizeVin(raw);
  if (!checkVin(vin).ok) return null;
  const maker = VIN_DB.find((m) => vin.startsWith(m.wmi));
  if (!maker) return null;
  const vds = vin.slice(3, 8);
  const model = maker.models.find((m) => [...m.vds].every((c, i) => c === '*' || c === vds[i]));
  if (!model) return { make: maker.make, model: '', year: null, engine: '', gearbox: '', country: maker.country };
  return {
    make: maker.make,
    model: model.model,
    year: decodeYear(vin[9], model.years),
    engine: model.engine,
    gearbox: model.gearbox,
    country: maker.country,
  };
}

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

/** Генерує VIN для демо-даних із шаблону моделі */
export function makeVin(maker: VinMaker, model: VinModel, year: number, rnd: () => number): string {
  const serial = Array.from({ length: 6 }, () => '0123456789'[Math.floor(rnd() * 10)]).join('');
  const plant = VIN_CHARS[Math.floor(rnd() * 23)];
  const check = '0123456789X'[Math.floor(rnd() * 11)];
  return `${maker.wmi}${model.vds}${check}${yearCode(year)}${plant}${serial}`;
}
