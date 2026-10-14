import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DbService } from '../data/db.service';

/**
 * Робочий контекст: активна філія (зберігається в налаштуваннях) і «зараз»,
 * що оновлюється щохвилини — для лінії поточного часу, «прострочено», таймерів механіків.
 */
@Injectable({ providedIn: 'root' })
export class AppContext {
  private readonly db = inject(DbService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly now = signal(Date.now());

  readonly branches = computed(() => this.db.branches.items());
  readonly branchId = computed(() => {
    const id = this.db.settings()?.branchId;
    const list = this.branches();
    return list.find((b) => b.id === id)?.id ?? list[0]?.id ?? null;
  });
  readonly branch = computed(() => this.db.branches.get(this.branchId()));

  constructor() {
    if (!this.browser) return;
    const t = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  async setBranch(id: string): Promise<void> {
    const s = this.db.settings();
    if (!s || s.branchId === id) return;
    await this.db.settingsRepo.update(s.id, { branchId: id }, { log: false });
  }
}
