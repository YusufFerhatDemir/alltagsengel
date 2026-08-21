#!/usr/bin/env node
/**
 * Abdeckungsbericht: Welche deutschen Texte stehen noch OHNE data-i18n
 * im Markup? Ergänzt chairmatch-i18n-check.mjs (das prüft nur, ob die
 * bereits erfassten Keys stimmen).
 *
 * Kein Exit-Code-Fehler — dies ist ein Bericht, keine Schranke.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const ROOT = path.resolve(args[0] || 'chairmatch-landing');
const DE = /[ÄÖÜäöüß]|\b(und|oder|der|die|das|für|mit|dein|deine|du|wir|nicht|kein|keine|ist|sind|ohne|auf|bei|von|zum|zur|ein|eine|jetzt|mehr|Sie|Ihre|wie|was|so)\b/;

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); }
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(ROOT);

let coveredTotal = 0, openTotal = 0;
const rows = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const body = (raw.match(/<body[\s\S]*<\/body>/i) || [''])[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Tags mit data-i18n samt Inhalt entfernen -> übrig bleibt Unerfasstes.
  const stripped = body.replace(
    /<(\w+)(?:[^>"]|"[^"]*"|'[^']*')*?\bdata-i18n(?:-html)?="[^"]+"(?:[^>"]|"[^"]*"|'[^']*')*?>[\s\S]*?<\/\1>/g,
    ''
  // Platzhalter, deren Text lead-form.js zur Laufzeit aus dem Katalog setzt.
  ).replace(/<(\w+)[^>]*\bdata-i18n-runtime\b[^>]*>[\s\S]*?<\/\1>/g, '');

  const nodes = t => t.split(/<[^>]+>/).map(x => x.replace(/&\w+;/g, ' ').trim())
                      .filter(x => x.length > 2 && DE.test(x));

  const open = nodes(stripped);
  const covered = nodes(body).length - open.length;
  coveredTotal += covered; openTotal += open.length;
  rows.push([path.relative(ROOT, file), covered, open]);
}

rows.sort((a, b) => b[2].length - a[2].length);
console.log('DATEI'.padEnd(46), 'ERFASST', 'OFFEN');
for (const [f, c, open] of rows) {
  console.log(f.padEnd(46), String(c).padStart(6), String(open.length).padStart(6));
}
const pct = Math.round(coveredTotal / (coveredTotal + openTotal) * 100);
console.log('─'.repeat(62));
console.log(`Summe: ${coveredTotal} erfasst / ${openTotal} offen  →  ${pct}% Abdeckung`);

if (process.argv.includes('--details')) {
  console.log('\nOffene Texte:');
  for (const [f, , open] of rows) {
    if (!open.length) continue;
    console.log(`\n  ${f}`);
    for (const s of open.slice(0, 6)) console.log(`    · ${s.slice(0, 100)}`);
    if (open.length > 6) console.log(`    … ${open.length - 6} weitere`);
  }
}
