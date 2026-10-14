// Генерує src/app/shared/icons.ts з даними лише потрібних іконок Lucide.
// Пакет @lucide/angular — один модуль з ~1600 компонентами з побічними ефектами,
// тож імпорт навіть однієї іконки тягне весь пакет (~440 КБ). Беремо лише SVG-вузли.
// Запуск: node scripts/gen-icons.mjs (список — scripts/icons.json: ключ → назва компонента Lucide)
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('node_modules/@lucide/angular/fesm2022/lucide-angular.mjs', 'utf8');
const wanted = JSON.parse(readFileSync('scripts/icons.json', 'utf8'));
const out = [];
for (const [key, comp] of Object.entries(wanted)) {
  const re = new RegExp(`var ${comp} = class ${comp} extends LucideIconBase \\{\\s*static icon = (\\{[\\s\\S]*?\\n\\t\\});`);
  const m = src.match(re);
  if (!m) throw new Error(`Іконку ${comp} не знайдено`);
  const icon = Function(`return ${m[1]}`)();
  const node = icon.node.map(([tag, attrs]) => {
    const { key: _k, ...rest } = attrs;
    return [tag, rest];
  });
  out.push(`  ${key}: ${JSON.stringify(node)},`);
}
const file = `// Згенеровано scripts/gen-icons.mjs з Lucide (ISC). Не редагуйте вручну — додайте іконку в scripts/icons.json.
export type IconNode = [string, Record<string, string | number>][];

export const I = {
${out.join('\n')}
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof I;
`;
writeFileSync('src/app/shared/icons.ts', file);
console.log(`icons.ts: ${Object.keys(wanted).length} іконок, ${(file.length / 1024).toFixed(1)} КБ`);
