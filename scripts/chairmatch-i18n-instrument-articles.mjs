#!/usr/bin/env node
/**
 * Blogartikel: Rahmen (Navigation, Datum, Fußzeile, Sprachumschalter)
 * übersetzbar machen — der Fließtext bleibt bewusst deutsch.
 *
 * Deshalb bekommen diese Seiten KEIN hreflang="en": ein englisches
 * Alternate auf einen deutschen Artikel wäre ein falsches Signal an
 * Suchmaschinen. Stattdessen weist ein Hinweis Nicht-Deutschsprachige
 * darauf hin, dass der Text nur auf Deutsch vorliegt.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'chairmatch-landing');
const BLOG = path.join(ROOT, 'blog');
let failures = 0;

const ARTICLES = fs.readdirSync(BLOG).filter(f => f.endsWith('.html') && f !== 'index.html').sort();

for (const file of ARTICLES) {
  const full = path.join(BLOG, file);
  const s = { file, html: fs.readFileSync(full, 'utf8'), errors: [] };
  if (s.html.includes('data-i18n')) { console.log(`  – ${file} bereits instrumentiert`); continue; }

  const sub = (find, replace, times = 1, label = '') => {
    const parts = s.html.split(find);
    if (parts.length - 1 !== times) { s.errors.push(`"${label}" ${parts.length - 1}× statt ${times}×`); return; }
    s.html = parts.join(replace);
  };

  const canonical = s.html.match(/<link rel="canonical" href="([^"]+)">/);
  if (!canonical) { console.error(`  ✗ ${file}: kein canonical`); failures++; continue; }

  sub(canonical[0],
    `${canonical[0]}\n<link rel="alternate" hreflang="de" href="${canonical[1]}">\n` +
    `<link rel="alternate" hreflang="x-default" href="${canonical[1]}">\n` +
    `<meta property="og:locale" content="de_DE">`,
    1, 'hreflang');
  sub('</head>', '<script src="/i18n/i18n.js" defer></script>\n</head>', 1, 'runtime');

  sub('<a href="../index.html" class="brand">ChairMatch</a>',
    '<a href="../index.html" class="brand" data-i18n="common.brand">ChairMatch</a>', 1, 'brand');
  sub('<a href="index.html" class="back-link">Alle Artikel</a>',
    '<a href="index.html" class="back-link" data-i18n="blog.allArticles">Alle Artikel</a>', 1, 'back-link');

  sub('<span>06. Juni 2026</span>',
    '<time data-i18n-date="2026-06-06" data-i18n-date-style="long">06. Juni 2026</time>', 1, 'date');

  const rt = s.html.match(/<span>Lesezeit: ca\. (\d+) Minuten<\/span>/);
  if (!rt) s.errors.push('Lesezeit nicht gefunden');
  else sub(rt[0], `<span data-i18n="blog.readTimeApprox" data-i18n-count="${rt[1]}">${rt[0].slice(6, -7)}</span>`, 1, 'readtime');

  // Hinweis direkt unter der Artikel-Meta; nur außerhalb von Deutsch sichtbar.
  sub('<h1>', '<p class="cm-de-only" hidden data-i18n="blog.germanOnly" style="font-size:13px;color:var(--muted,#888);border-left:2px solid var(--accent,#D4A853);padding-left:10px;margin-bottom:16px">Dieser Artikel liegt nur auf Deutsch vor.</p>\n    <h1>', 1, 'hinweis');

  sub('<div class="f-brand">CHAIRMATCH</div>',
    '<div class="f-brand" data-i18n="common.brandUpper">CHAIRMATCH</div>', 1, 'f-brand');
  sub('<div>Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>',
    '<div data-i18n="common.tagline">Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>', 1, 'tagline');
  sub('<a href="../index.html">Startseite</a>',
    '<a href="../index.html" data-i18n="common.nav.home">Startseite</a>', 1, 'home');
  sub('<a href="index.html">Blog</a>',
    '<a href="index.html" data-i18n="common.nav.blog">Blog</a>', 1, 'blog');
  sub('<a href="mailto:info@chairmatch.de">Kontakt</a>',
    '<a href="mailto:info@chairmatch.de" data-i18n="common.nav.contact">Kontakt</a>', 1, 'kontakt');
  sub('<div style="margin-top:12px">&copy; 2026 ChairMatch &mdash; Frankfurt am Main</div>',
    '<div style="margin-top:12px" data-i18n="common.copyright" data-i18n-vars=\'{"year":"2026","location":"Frankfurt am Main"}\'>&copy; 2026 ChairMatch &mdash; Frankfurt am Main</div>\n  <div data-i18n-switcher style="margin-top:16px"></div>',
    1, 'copyright/switcher');

  if (s.errors.length) {
    console.error(`  ✗ ${file} — nicht geschrieben:`);
    for (const e of s.errors) console.error(`      ${e}`);
    failures += s.errors.length;
    continue;
  }
  fs.writeFileSync(full, s.html);
  console.log(`  ✓ ${file}`);
}

if (failures) { console.error(`\n${failures} Ersetzung(en) fehlgeschlagen.`); process.exit(1); }
console.log('\nBlogartikel-Rahmen instrumentiert.');
