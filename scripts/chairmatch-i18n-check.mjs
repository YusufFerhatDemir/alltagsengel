#!/usr/bin/env node
/**
 * Regressionsschutz für die ChairMatch-i18n.
 *
 * Prüft drei Dinge:
 *   1. Jeder im HTML referenzierte Key existiert in de.json.
 *   2. Der deutsche Katalogtext ist identisch mit dem Text, der im HTML
 *      steht — sonst würde die Seite beim Laden ihren eigenen Inhalt
 *      verändern (stiller SEO-Schaden).
 *   3. Alle weiteren Kataloge (en.json …) haben denselben Key-Satz wie de.json.
 *
 * Aufruf: node scripts/chairmatch-i18n-check.mjs [chairmatch-landing]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'chairmatch-landing');
const I18N = path.join(ROOT, 'i18n');

const load = f => JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8'));
const de = load('de.json');
const others = fs.readdirSync(I18N)
  .filter(f => f.endsWith('.json') && f !== 'de.json')
  .map(f => [f.replace('.json', ''), load(f)]);

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};
const deFlat = flatten(de);

/** Plural-Keys liegen nur als key_one/key_other vor. */
const resolve = key =>
  deFlat[key] ?? deFlat[`${key}_other`] ?? deFlat[`${key}_one`];

/**
 * HTML-Entities auflösen. Im Bestand stehen "&rarr;"/"&amp;"/"&copy;",
 * im Katalog die Zeichen selbst — gerendert ist beides identisch.
 */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rarr: '→', larr: '←', copy: '©', mdash: '—', ndash: '–', hellip: '…',
  laquo: '«', raquo: '»', euro: '€', deg: '°', times: '×',
};
function decode(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

const interpolate = (tpl, vars) =>
  tpl.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? String(vars[k]) : m));

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); }
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(ROOT);

const problems = [];
const used = new Set();

/** data-i18n-vars des Elements plus aller Vorfahren — hier: body + Element. */
function varsIn(html, tagAttrs) {
  const vars = {};
  const bodyVars = html.match(/<body[^>]*data-i18n-vars='([^']+)'/);
  if (bodyVars) Object.assign(vars, JSON.parse(bodyVars[1]));
  const own = tagAttrs.match(/data-i18n-vars='([^']+)'/);
  if (own) Object.assign(vars, JSON.parse(own[1]));
  const count = tagAttrs.match(/data-i18n-count="([^"]+)"/);
  if (count) vars.count = count[1];
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'string' && v.startsWith('@')) vars[k] = resolve(v.slice(1)) ?? v;
  }
  return vars;
}

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // ── data-i18n / data-i18n-html mit Textinhalt ────────────────────
  const re = /<(\w+)((?:[^>"]|"[^"]*"|'[^']*')*?\bdata-i18n(-html)?="([^"]+)"(?:[^>"]|"[^"]*"|'[^']*')*?)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, tag, attrs, isHtml, key, inner] = m;
    used.add(key);
    if (deFlat[`${key}_other`] !== undefined) { used.add(`${key}_one`); used.add(`${key}_other`); }
    const expected = resolve(key);
    if (expected === undefined) { problems.push(`${rel}: Key fehlt in de.json -> ${key}`); continue; }

    // Verschachtelte gleiche Tags kann die Regex nicht sauber greifen.
    if (inner.includes(`<${tag}`)) continue;

    const rendered = decode(interpolate(expected, varsIn(html, attrs)));
    const actual = decode(inner);
    if (rendered !== actual) {
      problems.push(
        `${rel}: Text weicht ab bei "${key}"\n` +
        `    HTML:    ${actual.slice(0, 110)}\n` +
        `    de.json: ${rendered.slice(0, 110)}`
      );
    }
  }

  // ── data-i18n-attr ───────────────────────────────────────────────
  for (const am of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of am[1].split(';')) {
      const [, key] = pair.split(/:(.+)/);
      if (!key) continue;
      used.add(key.trim());
      if (resolve(key.trim()) === undefined) problems.push(`${rel}: Key fehlt in de.json -> ${key.trim()}`);
    }
  }
}

// ── Key-Parität der übrigen Kataloge ───────────────────────────────
for (const [name, cat] of others) {
  const flat = flatten(cat);
  for (const key of Object.keys(deFlat)) {
    if (!(key in flat)) problems.push(`${name}.json: Key fehlt -> ${key}`);
  }
  for (const key of Object.keys(flat)) {
    if (!(key in deFlat)) problems.push(`${name}.json: Key unbekannt (nicht in de.json) -> ${key}`);
  }
}

const unused = Object.keys(deFlat).filter(k => !used.has(k));

console.log(`Dateien geprüft:   ${files.length}`);
console.log(`Keys in de.json:   ${Object.keys(deFlat).length}`);
console.log(`davon verwendet:   ${used.size}`);
console.log(`Kataloge:          de, ${others.map(([n]) => n).join(', ') || '—'}`);
if (unused.length) console.log(`ungenutzte Keys:   ${unused.length} (${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', …' : ''})`);

if (problems.length) {
  console.error(`\n${problems.length} Problem(e):`);
  for (const p of problems.slice(0, 40)) console.error(`  ✗ ${p}`);
  if (problems.length > 40) console.error(`  … und ${problems.length - 40} weitere`);
  process.exit(1);
}
console.log('\n✓ i18n konsistent');
