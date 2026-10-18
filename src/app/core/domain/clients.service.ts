import { Injectable, inject } from '@angular/core';
import { DbService } from '../data/db.service';
import { Car, Client } from '../data/models';
import { formatPlate } from '../data/plates';
import { plural } from '../../shared/format';
import { L } from '../i18n';

export interface CascadeInfo {
  cars: number;
  orders: number;
}

/** Операції з клієнтами й авто, що зачіпають кілька сутностей (каскадне видалення, зміна власника) */
@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly db = inject(DbService);

  cascadeInfo(clientIds: string[]): CascadeInfo {
    const set = new Set(clientIds);
    return {
      cars: this.db.cars.items().filter((c) => set.has(c.clientId)).length,
      orders: this.db.orders.items().filter((o) => set.has(o.clientId)).length,
    };
  }

  cascadeText(info: CascadeInfo): string {
    const parts: string[] = [];
    if (info.cars) parts.push(`${info.cars} ${plural(info.cars, ['авто', 'авто', 'авто'], ['car', 'cars'])}`);
    if (info.orders) parts.push(`${info.orders} ${plural(info.orders, ['наряд', 'наряди', 'нарядів'], ['work order', 'work orders'])}`);
    return parts.length
      ? L(
          `Разом із клієнтом буде видалено ${parts.join(' і ')}, а також їхні погодження й нагадування.`,
          `This also deletes the customer’s ${parts.join(' and ')}, with their approvals and reminders.`,
        )
      : L('Клієнт не має авто й нарядів.', 'The customer has no cars or work orders.');
  }

  /** Видаляє клієнтів з усіма пов’язаними записами; повертає функцію відновлення для «Скасувати» */
  async deleteClients(ids: string[]): Promise<() => Promise<void>> {
    const set = new Set(ids);
    const names = ids.map((id) => this.db.clients.get(id)?.name).filter(Boolean);
    const carIds = this.db.cars.items().filter((c) => set.has(c.clientId)).map((c) => c.id);
    const orderIds = this.db.orders.items().filter((o) => set.has(o.clientId)).map((o) => o.id);
    const orderSet = new Set(orderIds);
    const apprIds = this.db.approvals.items().filter((a) => orderSet.has(a.orderId)).map((a) => a.id);
    const remIds = this.db.reminders.items().filter((r) => set.has(r.clientId)).map((r) => r.id);

    const summary = names.length === 1 ? L(`Видалено клієнта ${names[0]}`, `Customer ${names[0]} deleted`) : L(`Видалено клієнтів: ${names.length}`, `Customers deleted: ${names.length}`);
    const [reminders, approvals, orders, cars, clients] = [
      await this.db.reminders.removeMany(remIds),
      await this.db.approvals.removeMany(apprIds),
      await this.db.orders.removeMany(orderIds),
      await this.db.cars.removeMany(carIds),
      await this.db.clients.removeMany(ids, { log: summary }),
    ];
    return async () => {
      await this.db.clients.restoreMany(clients, { log: names.length === 1 ? L(`Відновлено клієнта ${names[0]}`, `Customer ${names[0]} restored`) : L(`Відновлено клієнтів: ${names.length}`, `Customers restored: ${names.length}`) });
      await this.db.cars.restoreMany(cars);
      await this.db.orders.restoreMany(orders);
      await this.db.approvals.restoreMany(approvals);
      await this.db.reminders.restoreMany(reminders);
    };
  }

  async deleteCar(car: Car): Promise<() => Promise<void>> {
    const orderIds = this.db.orders.items().filter((o) => o.carId === car.id).map((o) => o.id);
    const orderSet = new Set(orderIds);
    const apprIds = this.db.approvals.items().filter((a) => orderSet.has(a.orderId)).map((a) => a.id);
    const remIds = this.db.reminders.items().filter((r) => r.carId === car.id).map((r) => r.id);
    const label = `${formatPlate(car.plate)} ${car.make} ${car.model}`;
    const reminders = await this.db.reminders.removeMany(remIds);
    const approvals = await this.db.approvals.removeMany(apprIds);
    const orders = await this.db.orders.removeMany(orderIds);
    const removed = await this.db.cars.remove(car.id, { log: L(`Видалено авто ${label}`, `Car ${label} deleted`) });
    return async () => {
      if (removed) await this.db.cars.restore(removed, { log: L(`Відновлено авто ${label}`, `Car ${label} restored`) });
      await this.db.orders.restoreMany(orders);
      await this.db.approvals.restoreMany(approvals);
      await this.db.reminders.restoreMany(reminders);
    };
  }

  /** Передача авто новому власнику з історією володіння */
  async transferCar(car: Car, to: Client): Promise<void> {
    const now = new Date().toISOString();
    const owners = car.owners.map((o) => (o.to === null ? { ...o, to: now } : o));
    owners.push({ clientId: to.id, from: now, to: null });
    await this.db.cars.update(car.id, { clientId: to.id, owners }, { log: L(`Авто ${formatPlate(car.plate)} передано: ${to.name}`, `Car ${formatPlate(car.plate)} transferred to ${to.name}`) });
  }

  /** Унікальність телефону, VIN і номера */
  findByPhone(phone: string, exceptId?: string): Client | undefined {
    return phone ? this.db.clients.items().find((c) => c.phone === phone && c.id !== exceptId) : undefined;
  }
  findByVin(vin: string, exceptId?: string): Car | undefined {
    return vin ? this.db.cars.items().find((c) => c.vin === vin && c.id !== exceptId) : undefined;
  }
  findByPlate(plate: string, exceptId?: string): Car | undefined {
    return plate ? this.db.cars.items().find((c) => c.plate === plate && c.id !== exceptId) : undefined;
  }

  allTags(): string[] {
    const set = new Set<string>();
    for (const c of this.db.clients.items()) c.tags.forEach((t) => set.add(t));
    return [...set].sort((a, b) => a.localeCompare(b, 'uk'));
  }
}
