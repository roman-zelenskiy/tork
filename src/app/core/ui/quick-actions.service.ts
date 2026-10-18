import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Dialogs } from './dialogs.service';
import { L } from '../i18n';

/**
 * Швидкі дії з будь-якого місця (палітра, топбар, гарячі клавіші).
 * Форми завантажуються ліниво — у початковий бандл не потрапляють.
 */
@Injectable({ providedIn: 'root' })
export class QuickActions {
  private readonly dialogs = inject(Dialogs);
  private readonly router = inject(Router);

  async newOrder(prefill: { clientId?: string; carId?: string; postId?: string; start?: string } = {}): Promise<void> {
    const { OrderCreateDialog } = await import('../../features/orders/order-create');
    const ref = this.dialogs.open(OrderCreateDialog, prefill, { size: 'lg', label: L('Новий наряд', 'New work order') });
    ref.closed.subscribe((id) => {
      if (typeof id === 'string') void this.router.navigate(['/naryady', id]);
    });
  }

  async newClient(): Promise<void> {
    const { ClientForm } = await import('../../features/clients/client-form');
    const ref = this.dialogs.open(ClientForm, {}, { drawer: true, label: L('Новий клієнт', 'New customer') });
    ref.closed.subscribe((id) => {
      if (typeof id === 'string') void this.router.navigate(['/kliyenty', id]);
    });
  }
}
