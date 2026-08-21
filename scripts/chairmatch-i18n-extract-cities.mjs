#!/usr/bin/env node
/**
 * Liest die stadtspezifischen Texte aus chairmatch-landing/stadt/*.html
 * und schreibt sie als `city.local.<slug>` nach i18n/de.json.
 *
 * Nur Extraktion — das Instrumentieren der HTML-Dateien macht
 * chairmatch-i18n-instrument.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'chairmatch-landing');
const STADT = path.join(ROOT, 'stadt');
const CATALOG = path.join(ROOT, 'i18n', 'de.json');

const one = (html, re, label, file) => {
  const m = html.match(re);
  if (!m) throw new Error(`${file}: ${label} nicht gefunden`);
  return m[1].trim();
};

const local = {};
const files = fs.readdirSync(STADT).filter(f => f.endsWith('.html')).sort();

for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(STADT, file), 'utf8');

  // Anzeigename aus <h1>… <span>Stadt</span>
  const city = one(html, /<h1>Stuhlvermietung in <span>([^<]+)<\/span><\/h1>/, 'h1/city', file);

  // Erster Benefit-Block ist stadtspezifisch, die beiden folgenden sind generisch.
  const benefits = html.match(/<div class="benefit">[\s\S]*?<\/div>\s*<\/div>/);
  const uspTitle = one(html, /<div class="benefit-icon">[^<]*<\/div>\s*<h3>([^<]+)<\/h3>/, 'usp/title', file);
  const uspText = one(html, /<div class="benefit-icon">[^<]*<\/div>\s*<h3>[^<]+<\/h3>\s*<p>([\s\S]*?)<\/p>/, 'usp/text', file);

  // Drei trust-items; das dritte ("1 €") ist überall gleich.
  const trust = [...html.matchAll(
    /<div class="trust-item"><div class="trust-num">([^<]+)<\/div><div class="trust-label">([^<]+)<\/div><\/div>/g
  )];
  if (trust.length !== 3) throw new Error(`${file}: ${trust.length} trust-items statt 3`);

  // Nicht jede Stadtseite hat eine Kategorie-Unterzeile.
  const catSubtitle = html.match(/<p class="subtitle" style="margin-bottom:0">([\s\S]*?)<\/p>/);

  local[slug] = {
    city,
    heroSubtitle: one(html, /<p class="subtitle">([\s\S]*?)<\/p>/, 'hero/subtitle', file),
    // Formulierung schwankt zwischen "Stuhlmiete X" und "Stuhlmiete in X" —
    // deshalb wörtlich übernehmen statt aus einem Template zu erzeugen.
    catTitle: one(html, /<h2>(Stuhlmiete[^<]*alle Beauty-Sparten)<\/h2>/, 'cat/title', file),
    ...(catSubtitle ? { catSubtitle: catSubtitle[1].trim() } : {}),
    // Footer nennt teils den amtlichen Namen ("Offenbach am Main").
    footerCity: one(html, /<div style="margin-top:12px">© 2026 ChairMatch — ([^<]+)<\/div>/, 'footer/city', file),
    uspTitle,
    uspText,
    trust1Num: trust[0][1].trim(),
    trust1Label: trust[0][2].trim(),
    trust2Num: trust[1][1].trim(),
    trust2Label: trust[1][2].trim(),
    metaTitle: one(html, /<title>([^<]+)<\/title>/, 'meta/title', file),
    metaDescription: one(html, /<meta name="description" content="([^"]+)"/, 'meta/description', file),
  };
  if (benefits === null) throw new Error(`${file}: benefit-Block nicht gefunden`);
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
catalog.city = catalog.city || {};
catalog.city.local = local;
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');

console.log(`${files.length} Städte extrahiert -> ${path.relative(process.cwd(), CATALOG)}`);
console.log(Object.keys(local).join(', '));
