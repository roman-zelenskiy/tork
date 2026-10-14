import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';
import { formatPlate } from '../../core/data/plates';
import { orderTotals, partPrice, workPrice } from '../../core/domain/order-math';
import { ZONE_LABEL, DAMAGE_LABEL } from '../../core/domain/body';
import { TorkTitleStrategy } from '../../core/ui/title.strategy';
import { I } from '../../shared/icons';
import { Icon } from '../../shared/ui/icon';
import { EmptyState } from '../../shared/ui/states';
import { RadioGroup } from '../../shared/ui/checkbox';
import { Option } from '../../shared/ui/option';
import { fmtDate, fmtDateTime, fmtHours, fmtKm, fmtMoney, fmtPhone } from '../../shared/format';
import { BodyDiagram } from '../intake/body-diagram';

type Form = 'naryad' | 'akt-pryiomu' | 'akt-robit';
const TITLES: Record<Form, string> = { naryad: 'Замовлення-наряд', 'akt-pryiomu': 'Акт прийому-передачі автомобіля', 'akt-robit': 'Акт виконаних робіт' };

/** Друковані форми A4. Друк — системний діалог браузера (можна зберегти в PDF) */
@Component({
  selector: 'tk-print-page',
  imports: [RouterLink, Icon, EmptyState, RadioGroup, BodyDiagram],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!db.ready()) {
      <div class="skeleton mx-auto h-[1000px] max-w-[794px]"></div>
    } @else if (!order()) {
      <tk-empty art="orders" title="Наряд не знайдено"><a routerLink="/naryady" class="btn">До нарядів</a></tk-empty>
    } @else {
      @let o = order()!;
      @let t = totals()!;
      <div class="no-print mx-auto mb-4 flex max-w-[794px] flex-wrap items-center gap-2">
        <a [routerLink]="['/naryady', o.id]" class="btn btn-ghost"><svg [lucideIcon]="I.arrowLeft" aria-hidden="true"></svg>{{ o.number }}</a>
        <tk-radio-group variant="segmented" ariaLabel="Форма" [options]="forms" [value]="forma()" (changed)="setForm($event)" />
        <button type="button" class="btn btn-primary ml-auto" (click)="print()"><svg [lucideIcon]="I.printer" aria-hidden="true"></svg>Друкувати</button>
      </div>

      <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:overflow-visible">
      <article class="print-area paper mx-auto w-[794px] max-w-none bg-white p-10 sm:w-auto sm:max-w-[794px] text-[12.5px] leading-[1.5] text-[#1d1b17] shadow-pop sm:p-12">
        <header class="flex items-start justify-between gap-6 border-b-2 border-[#1d1b17] pb-4">
          <div>
            <div class="text-lg font-bold">{{ s()?.serviceName ?? 'Торк' }}</div>
            <div class="text-[11.5px] text-[#55504a]">{{ branch()?.name }}, {{ branch()?.address }}<br />{{ branch()?.phone }} · {{ s()?.email }}</div>
          </div>
          <div class="text-right">
            <h1 class="m-0 text-[15px] font-bold">{{ title() }}</h1>
            <div>№&nbsp;<span class="font-mono">{{ o.number }}</span></div>
            <div class="text-[11.5px] text-[#55504a]">від {{ date(o.start ?? o.createdAt) }}</div>
          </div>
        </header>

        <section class="mt-4 grid grid-cols-2 gap-6">
          <div>
            <div class="pt-label">Замовник</div>
            <div class="font-semibold">{{ client()?.name }}</div>
            <div>{{ phone(client()?.phone ?? '') }}</div>
          </div>
          <div>
            <div class="pt-label">Автомобіль</div>
            <div class="font-semibold">{{ car()?.make }} {{ car()?.model }}, {{ car()?.year }}</div>
            <div>Держномер <span class="font-mono">{{ plate() }}</span>, VIN <span class="font-mono">{{ car()?.vin }}</span></div>
            <div>Пробіг: {{ o.mileage ? km(o.mileage) : '—' }}</div>
          </div>
        </section>

        @if (forma() === 'akt-pryiomu') {
          @let a = o.intake;
          <section class="mt-5 grid grid-cols-[220px_1fr] gap-6">
            <div><tk-body-diagram [damages]="a?.damages ?? []" [readonly]="true" /></div>
            <div>
              <div class="pt-label">Пошкодження</div>
              @if (a?.damages?.length) {
                <ol class="m-0 pl-4">
                  @for (d of a!.damages; track d.id) {
                    <li>{{ dmg(d.kind) }}: {{ zone(d.zone).toLowerCase() }}{{ d.comment ? ' — ' + d.comment : '' }}</li>
                  }
                </ol>
              } @else {
                <p class="m-0">Видимих пошкоджень не виявлено.</p>
              }
              <div class="pt-label mt-4">Стан</div>
              <p class="m-0">Пробіг {{ a ? km(a.mileage) : '______' }}, рівень пального {{ a ? a.fuel + '%' : '____' }}.</p>
              <div class="pt-label mt-4">Комплектність</div>
              <p class="m-0">
                Документи {{ yn(a?.kit?.documents) }}, запасне колесо {{ yn(a?.kit?.spare) }}, домкрат {{ yn(a?.kit?.jack) }},
                аптечка {{ yn(a?.kit?.firstAid) }}, килимки {{ yn(a?.kit?.rugs) }}, ключів: {{ a?.kit?.keys ?? '—' }}.
              </p>
              <div class="pt-label mt-4">Скарги клієнта</div>
              <p class="m-0">{{ a?.complaints || o.complaint || '—' }}</p>
            </div>
          </section>
          <p class="mt-5 text-[11px] text-[#55504a]">
            Клієнт підтверджує зазначений стан автомобіля й комплектність, погоджується на проведення діагностики.
            Особисті речі в автомобілі сервіс не приймає на зберігання.
          </p>
        } @else {
          <section class="mt-5">
            <div class="pt-label">Роботи</div>
            <table class="pt-table">
              <thead><tr><th class="w-8">№</th><th>Найменування</th><th class="w-16 text-right">Н/г</th><th class="w-20 text-right">Ціна</th><th class="w-24 text-right">Сума</th></tr></thead>
              <tbody>
                @for (w of works(); track w.id; let i = $index) {
                  <tr><td>{{ i + 1 }}</td><td>{{ w.name }}</td><td class="text-right">{{ hours(w.hours) }}</td><td class="text-right">{{ money(w.rate) }}</td><td class="text-right">{{ money(wp(w)) }}</td></tr>
                } @empty {
                  <tr><td colspan="5">—</td></tr>
                }
              </tbody>
            </table>
          </section>
          <section class="mt-4">
            <div class="pt-label">Запчастини й матеріали</div>
            <table class="pt-table">
              <thead><tr><th class="w-8">№</th><th>Найменування</th><th class="w-28">Артикул</th><th class="w-12 text-right">К-сть</th><th class="w-20 text-right">Ціна</th><th class="w-24 text-right">Сума</th></tr></thead>
              <tbody>
                @for (p of parts(); track p.id; let i = $index) {
                  <tr><td>{{ i + 1 }}</td><td>{{ p.name }}</td><td class="font-mono">{{ p.sku }}</td><td class="text-right">{{ p.qty }}</td><td class="text-right">{{ money(p.price) }}</td><td class="text-right">{{ money(pp(p)) }}</td></tr>
                } @empty {
                  <tr><td colspan="6">—</td></tr>
                }
              </tbody>
            </table>
          </section>
          <section class="mt-4 ml-auto w-72">
            <div class="flex justify-between"><span>Роботи</span><span>{{ money(t.works) }}</span></div>
            <div class="flex justify-between"><span>Запчастини</span><span>{{ money(t.parts) }}</span></div>
            @if (t.discount) {
              <div class="flex justify-between"><span>Знижка {{ o.discountPct }}%</span><span>−{{ money(t.discount) }}</span></div>
            }
            <div class="mt-1 flex justify-between border-t border-[#1d1b17] pt-1 text-[14px] font-bold"><span>Разом до сплати</span><span>{{ money(t.total) }}</span></div>
            <div class="flex justify-between"><span>Сплачено</span><span>{{ money(t.paid) }}</span></div>
            @if (t.debt) {
              <div class="flex justify-between font-semibold"><span>Залишок</span><span>{{ money(t.debt) }}</span></div>
            }
          </section>
          @if (forma() === 'akt-robit') {
            <p class="mt-5 text-[11px] text-[#55504a]">
              Роботи виконано в повному обсязі й у строк. Замовник претензій щодо обсягу, якості й строків не має.
              Гарантія на роботи — 3 місяці або 5 000 км, на запчастини — згідно з гарантією виробника.
            </p>
          }
          @if (declined().length) {
            <section class="mt-4">
              <div class="pt-label">Рекомендації, від яких клієнт відмовився</div>
              <p class="m-0">{{ declined().join('; ') }}.</p>
            </section>
          }
        }

        <footer class="mt-10 grid grid-cols-2 gap-10">
          <div>
            <div class="pt-label">Від сервісу</div>
            <div class="mt-8 border-t border-[#1d1b17] pt-1 text-[11px]">{{ o.intake?.receivedBy || 'Майстер-приймальник' }}</div>
          </div>
          <div>
            <div class="pt-label">Замовник</div>
            @if (o.intake?.signature && forma() === 'akt-pryiomu') {
              <img [src]="o.intake!.signature" alt="Підпис клієнта" class="-mb-2 h-14" />
            } @else {
              <div class="h-8"></div>
            }
            <div class="border-t border-[#1d1b17] pt-1 text-[11px]">{{ client()?.name }}{{ o.intake?.signedAt && forma() === 'akt-pryiomu' ? ', ' + dt(o.intake!.signedAt!) : '' }}</div>
          </div>
        </footer>
      </article>
      </div>
    }
  `,
  styles: `
    .pt-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #55504a;
      margin-bottom: 4px;
    }
    .pt-table {
      width: 100%;
      border-collapse: collapse;
    }
    .pt-table th,
    .pt-table td {
      border: 1px solid #bdb7ac;
      padding: 4px 6px;
      vertical-align: top;
    }
    .pt-table th {
      background: #f1eee8;
      text-align: left;
      font-weight: 600;
    }
    @media print {
      .paper {
        box-shadow: none;
      }
    }
  `,
})
export class PrintPage {
  protected readonly I = I;
  protected readonly db = inject(DbService);
  private readonly titles = inject(TorkTitleStrategy);
  readonly id = input.required<string>();
  readonly forma = input<Form, string | undefined>('naryad', { transform: (v) => (v === 'akt-pryiomu' || v === 'akt-robit' ? v : 'naryad') });

  protected readonly forms: Option<Form>[] = [
    { value: 'naryad', label: 'Наряд' },
    { value: 'akt-pryiomu', label: 'Акт прийому' },
    { value: 'akt-robit', label: 'Акт робіт' },
  ];
  protected readonly money = fmtMoney;
  protected readonly hours = fmtHours;
  protected readonly km = fmtKm;
  protected readonly date = fmtDate;
  protected readonly dt = fmtDateTime;
  protected readonly phone = fmtPhone;
  protected readonly wp = workPrice;
  protected readonly pp = partPrice;

  protected readonly order = computed(() => this.db.orders.get(this.id()));
  protected readonly totals = computed(() => (this.order() ? orderTotals(this.order()!) : null));
  protected readonly client = computed(() => this.db.clients.get(this.order()?.clientId));
  protected readonly car = computed(() => this.db.cars.get(this.order()?.carId));
  protected readonly branch = computed(() => this.db.branches.get(this.order()?.branchId));
  protected readonly s = computed(() => this.db.settings());
  protected readonly plate = computed(() => (this.car() ? formatPlate(this.car()!.plate) : ''));
  protected readonly title = computed(() => TITLES[this.forma()]);
  protected readonly works = computed(() => this.order()?.works.filter((w) => w.decision !== 'declined') ?? []);
  protected readonly parts = computed(() => this.order()?.parts.filter((p) => p.decision !== 'declined') ?? []);
  protected readonly declined = computed(() => this.order()?.works.filter((w) => w.decision === 'declined').map((w) => w.name) ?? []);

  constructor() {
    effect(() => {
      const o = this.order();
      if (o) this.titles.set(`${TITLES[this.forma()]} ${o.number}`);
    });
  }

  private readonly router = inject(Router);
  protected setForm(f: Form): void {
    void this.router.navigate([], { queryParams: { forma: f }, replaceUrl: true });
  }
  protected zone(z: keyof typeof ZONE_LABEL): string {
    return ZONE_LABEL[z];
  }
  protected dmg(k: keyof typeof DAMAGE_LABEL): string {
    return DAMAGE_LABEL[k];
  }
  protected yn(v: boolean | undefined): string {
    return v === undefined ? '—' : v ? 'є' : 'немає';
  }
  protected print(): void {
    window.print();
  }
}
