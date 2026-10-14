import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type StorageProblem = 'unavailable' | 'quota' | null;

/** Помилка запису: сховище недоступне (приватний режим, заборона) або переповнене */
export class StorageError extends Error {
  constructor(public readonly reason: 'unavailable' | 'quota') {
    super(
      reason === 'quota'
        ? 'Сховище браузера заповнене. Видаліть фото чи старі наряди або експортуйте дані й почніть з чистої бази.'
        : 'Браузер не дозволяє зберігати дані. Зміни діятимуть лише до закриття вкладки.',
    );
  }
}

/**
 * Обгортка над localStorage. Працює лише в браузері; на сервері (SSR) — порожня пам’ять.
 * Якщо сховище недоступне, дані живуть у пам’яті вкладки, а інтерфейс показує попередження.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly memory = new Map<string, string>();
  private availableCache: boolean | null = null;

  /** Остання проблема зі сховищем — для банера в оболонці */
  readonly problem = signal<StorageProblem>(null);

  available(): boolean {
    if (!this.browser) return false;
    if (this.availableCache !== null) return this.availableCache;
    try {
      const k = '__tork_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      this.availableCache = true;
    } catch {
      this.availableCache = false;
      this.problem.set('unavailable');
    }
    return this.availableCache;
  }

  readRaw(key: string): string | null {
    if (this.available()) {
      try {
        return localStorage.getItem(key);
      } catch {
        /* читаємо з пам’яті */
      }
    }
    return this.memory.get(key) ?? null;
  }

  read<T>(key: string, fallback: T): T {
    const raw = this.readRaw(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** Записує значення; при переповненні кидає StorageError, дані лишаються в пам’яті вкладки */
  write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    if (!this.available()) throw new StorageError('unavailable');
    try {
      localStorage.setItem(key, raw);
      if (this.problem() === 'quota') this.problem.set(null);
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      this.problem.set(quota ? 'quota' : 'unavailable');
      throw new StorageError(quota ? 'quota' : 'unavailable');
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    if (!this.available()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* немає доступу — нічого не робимо */
    }
  }

  /** Розмір значення ключа в байтах (localStorage зберігає UTF-16 — 2 байти на символ) */
  bytes(key: string): number {
    return (this.readRaw(key)?.length ?? 0) * 2;
  }

  /** Усі ключі з префіксом tork: */
  keys(): string[] {
    if (!this.available()) return [...this.memory.keys()].filter((k) => k.startsWith('tork:'));
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('tork:')) out.push(k);
    }
    return out;
  }
}
