/** Штучна затримка фейкового API: 100–300 мс, як у реального бекенда */
export const delay = (min = 100, max = 300) =>
  new Promise<void>((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Короткий ідентифікатор з префіксом сутності: «cl_lx2k8f…» */
export function newId(prefix: string): string {
  let rand = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${Date.now().toString(36)}${rand.slice(0, 6)}`;
}

export const nowIso = () => new Date().toISOString();

/** Детермінований генератор для демо-даних */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T>(arr: T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const round2 = (v: number) => Math.round(v * 100) / 100;
