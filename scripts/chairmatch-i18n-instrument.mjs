#!/usr/bin/env node
/**
 * Versieht die ChairMatch-Stadtseiten mit data-i18n-Attributen.
 *
 * Idempotent: bereits instrumentierte Dateien werden übersprungen.
 * Jede Ersetzung ist gezählt — weicht die Trefferzahl ab, bricht das
 * Skript mit Fehler ab, statt eine Datei halb umzuschreiben.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'chairmatch-landing');
const STADT = path.join(ROOT, 'stadt');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'de.json'), 'utf8'));

let failures = 0;

/** Ersetzt `find` genau `times` mal, sonst Fehler. */
function sub(state, find, replace, times = 1, label = '') {
  const parts = state.html.split(find);
  const hits = parts.length - 1;
  if (hits !== times) {
    state.errors.push(`"${label || find.slice(0, 50)}" ${hits}× statt ${times}×`);
    return;
  }
  state.html = parts.join(replace);
}

/** Wie sub(), aber ein fehlender Treffer ist erlaubt (optionale Blöcke). */
function subOptional(state, find, replace, label = '') {
  const parts = state.html.split(find);
  if (parts.length - 1 === 0) return false;
  if (parts.length - 1 > 1) { state.errors.push(`"${label}" mehrfach vorhanden`); return false; }
  state.html = parts.join(replace);
  return true;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

for (const file of fs.readdirSync(STADT).filter(f => f.endsWith('.html')).sort()) {
  const slug = file.replace(/\.html$/, '');
  const full = path.join(STADT, file);
  const state = { file, html: fs.readFileSync(full, 'utf8'), errors: [] };

  if (state.html.includes('data-i18n')) { console.log(`  – ${file} bereits instrumentiert`); continue; }

  const L = catalog.city.local[slug];
  if (!L) { console.error(`  ✗ ${file}: kein Katalog-Eintrag city.local.${slug}`); failures++; continue; }
  const K = `city.local.${slug}`;
  const canonical = `https://chairmatch.de/stadt/${slug}`;

  // ── <head>: Titel, Description, hreflang, Runtime ────────────────
  sub(state, `<title>${L.metaTitle}</title>`,
    `<title data-i18n="${K}.metaTitle">${L.metaTitle}</title>`, 1, 'title');

  sub(state, `<meta name="description" content="${L.metaDescription}">`,
    `<meta name="description" content="${L.metaDescription}" data-i18n-attr="content:${K}.metaDescription">`,
    1, 'meta description');

  sub(state, `<link rel="canonical" href="${canonical}">`,
    `<link rel="canonical" href="${canonical}">\n` +
    `<link rel="alternate" hreflang="de" href="${canonical}">\n` +
    `<link rel="alternate" hreflang="en" href="${canonical}?lang=en">\n` +
    `<link rel="alternate" hreflang="x-default" href="${canonical}">`,
    1, 'canonical/hreflang');

  sub(state, `<meta property="og:title" content="${L.metaTitle}">`,
    `<meta property="og:title" content="${L.metaTitle}" data-i18n-attr="content:${K}.metaTitle">`,
    1, 'og:title');

  sub(state, `<meta property="og:description" content="${L.metaDescription}">`,
    `<meta property="og:description" content="${L.metaDescription}" data-i18n-attr="content:${K}.metaDescription">\n` +
    `<meta property="og:locale" content="de_DE">\n` +
    `<meta property="og:locale:alternate" content="en_US">`,
    1, 'og:description');

  sub(state, '</head>',
    '<script src="/i18n/i18n.js" defer></script>\n</head>', 1, 'runtime-script');

  // ── <body>: Stadt-Variable für alle {city}-Keys darunter ─────────
  sub(state, '<body>',
    `<body data-i18n-vars='{"city":"@${K}.city"}' data-cm-city="${esc(L.city)}">`,
    1, 'body vars');

  // ── Hero ─────────────────────────────────────────────────────────
  sub(state, '<a href="https://chairmatch.de" class="hero-logo">ChairMatch</a>',
    '<a href="https://chairmatch.de" class="hero-logo" data-i18n="common.brand">ChairMatch</a>',
    1, 'hero-logo');

  sub(state, `<h1>Stuhlvermietung in <span>${L.city}</span></h1>`,
    `<h1 data-i18n-html="city.hero.title">Stuhlvermietung in <span>${L.city}</span></h1>`,
    1, 'h1');

  sub(state, `<p class="subtitle">${L.heroSubtitle}</p>`,
    `<p class="subtitle" data-i18n="${K}.heroSubtitle">${L.heroSubtitle}</p>`,
    1, 'hero subtitle');

  sub(state, '>JETZT STARTEN</button>',
    ' data-i18n="common.cta.start">JETZT STARTEN</button>', 1, 'cta start');

  sub(state, ' rel="noopener">WhatsApp</a>',
    ' rel="noopener" data-i18n="common.cta.whatsapp">WhatsApp</a>', 1, 'whatsapp');

  // ── Kategorien ───────────────────────────────────────────────────
  sub(state, `<span class="section-badge">Branchen in ${L.city}</span>`,
    `<span class="section-badge" data-i18n="city.categories.badge">Branchen in ${L.city}</span>`,
    1, 'cat badge');

  sub(state, `<h2>${L.catTitle}</h2>`,
    `<h2 data-i18n="${K}.catTitle">${L.catTitle}</h2>`, 1, 'cat title');

  // Nur 9 von 24 Seiten haben diese Zeile.
  if (L.catSubtitle) {
    sub(state, `<p class="subtitle" style="margin-bottom:0">${L.catSubtitle}</p>`,
      `<p class="subtitle" style="margin-bottom:0" data-i18n="${K}.catSubtitle">${L.catSubtitle}</p>`,
      1, 'cat subtitle');
  }

  for (const [de, key] of [['Barbershop', 'barbershop'], ['Friseur', 'hair'], ['Kosmetik', 'cosmetics'],
                           ['Ästhetik', 'aesthetics'], ['Nails', 'nails'], ['Massage', 'massage']]) {
    sub(state, `<div class="cat-name">${de}</div>`,
      `<div class="cat-name" data-i18n="cat.${key}">${de}</div>`, 1, `cat.${key}`);
  }

  // ── Vorteile ─────────────────────────────────────────────────────
  sub(state, '<span class="section-badge">Vorteile</span>',
    '<span class="section-badge" data-i18n="city.benefits.badge">Vorteile</span>', 1, 'benefit badge');

  sub(state, `<h2>Warum Stuhlvermietung in ${L.city}?</h2>`,
    `<h2 data-i18n="city.benefits.title">Warum Stuhlvermietung in ${L.city}?</h2>`, 1, 'benefit title');

  sub(state, `<h3>${L.uspTitle}</h3>`, `<h3 data-i18n="${K}.uspTitle">${L.uspTitle}</h3>`, 1, 'usp title');
  sub(state, `<p>${L.uspText}</p>`, `<p data-i18n="${K}.uspText">${L.uspText}</p>`, 1, 'usp text');

  sub(state, '<h3>Faire Konditionen</h3>',
    '<h3 data-i18n="city.benefits.fair.title">Faire Konditionen</h3>', 1, 'fair title');
  sub(state, '<p>Flexible Mietmodelle: tageweise, wöchentlich oder monatlich — du zahlst nur, was du brauchst.</p>',
    '<p data-i18n="city.benefits.fair.text">Flexible Mietmodelle: tageweise, wöchentlich oder monatlich — du zahlst nur, was du brauchst.</p>', 1, 'fair text');

  sub(state, '<h3>Sofort loslegen</h3>',
    '<h3 data-i18n="city.benefits.start.title">Sofort loslegen</h3>', 1, 'start title');
  sub(state, '<p>Kein eigener Salon nötig. Stuhl mieten, Kunden mitbringen und vom ersten Tag an selbstständig arbeiten.</p>',
    '<p data-i18n="city.benefits.start.text">Kein eigener Salon nötig. Stuhl mieten, Kunden mitbringen und vom ersten Tag an selbstständig arbeiten.</p>', 1, 'start text');

  // ── Trust-Zahlen ─────────────────────────────────────────────────
  sub(state, `<div class="trust-num">${L.trust1Num}</div><div class="trust-label">${L.trust1Label}</div>`,
    `<div class="trust-num" data-i18n="${K}.trust1Num">${L.trust1Num}</div><div class="trust-label" data-i18n="${K}.trust1Label">${L.trust1Label}</div>`,
    1, 'trust1');

  sub(state, `<div class="trust-num">${L.trust2Num}</div><div class="trust-label">${L.trust2Label}</div>`,
    `<div class="trust-num" data-i18n="${K}.trust2Num">${L.trust2Num}</div><div class="trust-label" data-i18n="${K}.trust2Label">${L.trust2Label}</div>`,
    1, 'trust2');

  sub(state, '<div class="trust-num">1 €</div>',
    '<div class="trust-num" data-i18n="common.donationAmount">1 €</div>', 1, 'trust donation amount');
  sub(state, '<div class="trust-label">pro Buchung für Kinder in Not</div>',
    '<div class="trust-label" data-i18n="city.trust.donation">pro Buchung für Kinder in Not</div>', 1, 'trust donation');

  // ── Kontaktformular ──────────────────────────────────────────────
  sub(state, '<span class="section-badge">Jetzt starten</span>',
    '<span class="section-badge" data-i18n="city.contact.badge">Jetzt starten</span>', 1, 'contact badge');

  sub(state, `<h2>Stuhlvermietung ${L.city} — kostenlos anfragen</h2>`,
    `<h2 data-i18n="city.contact.title">Stuhlvermietung ${L.city} — kostenlos anfragen</h2>`, 1, 'contact title');

  sub(state, `<p class="subtitle" style="margin-bottom:40px">Ob Salonbesitzer oder Beauty-Profi in ${L.city} — hinterlasse deine Daten und wir melden uns innerhalb von 24 Stunden.</p>`,
    `<p class="subtitle" style="margin-bottom:40px" data-i18n="city.contact.subtitle">Ob Salonbesitzer oder Beauty-Profi in ${L.city} — hinterlasse deine Daten und wir melden uns innerhalb von 24 Stunden.</p>`,
    1, 'contact subtitle');

  sub(state, '<h3 style="margin-bottom:4px;font-size:17px">🏪 Salonbesitzer</h3>',
    '<h3 style="margin-bottom:4px;font-size:17px" data-i18n="form.salon.title">🏪 Salonbesitzer</h3>', 1, 'salon title');
  sub(state, '<p style="color:var(--muted);font-size:13px;margin-bottom:16px">Stühle vermieten & verdienen</p>',
    '<p style="color:var(--muted);font-size:13px;margin-bottom:16px" data-i18n="form.salon.subtitle">Stühle vermieten & verdienen</p>', 1, 'salon subtitle');

  sub(state, '<h3 style="margin-bottom:4px;font-size:17px">🎨 Beauty-Profi</h3>',
    '<h3 style="margin-bottom:4px;font-size:17px" data-i18n="form.pro.title">🎨 Beauty-Profi</h3>', 1, 'pro title');
  sub(state, `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">Stuhl mieten in ${L.city}</p>`,
    `<p style="color:var(--muted);font-size:13px;margin-bottom:16px" data-i18n="form.pro.subtitleCity">Stuhl mieten in ${L.city}</p>`, 1, 'pro subtitle');

  sub(state, 'placeholder="Name *" class="form-input"',
    'placeholder="Name *" data-i18n-attr="placeholder:form.field.name" class="form-input"', 2, 'placeholder name');
  sub(state, 'placeholder="Telefon *" class="form-input"',
    'placeholder="Telefon *" data-i18n-attr="placeholder:form.field.phone" class="form-input"', 2, 'placeholder phone');
  sub(state, 'placeholder="Anzahl Stühle, Salon-Art..." rows="2" class="form-textarea"',
    'placeholder="Anzahl Stühle, Salon-Art..." data-i18n-attr="placeholder:form.field.message" rows="2" class="form-textarea"', 1, 'placeholder message');

  sub(state, '<option value="">Branche (optional)</option>',
    '<option value="" data-i18n="form.field.branch">Branche (optional)</option>', 1, 'branch option');
  for (const [de, key] of [['Friseur', 'hair'], ['Barbershop', 'barbershop'], ['Kosmetik', 'cosmetics'],
                           ['Nails', 'nails'], ['Massage', 'massage'], ['Ästhetik', 'aesthetics'], ['Sonstige', 'other']]) {
    sub(state, `<option value="${de}">${de}</option>`,
      `<option value="${de}" data-i18n="cat.${key}">${de}</option>`, 1, `option ${key}`);
  }

  sub(state, '>SALON LISTEN</button>', ' data-i18n="form.salon.submit">SALON LISTEN</button>', 1, 'salon submit');
  sub(state, '>STUHL FINDEN</button>', ' data-i18n="form.pro.submit">STUHL FINDEN</button>', 1, 'pro submit');

  // Erfolgs-Block übersetzbar + Fehler-Block ergänzen (fehlte komplett).
  sub(state,
    `        <div class="form-success" style="display:none;padding:24px 0;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">&#10003;</div>
          <p style="font-weight:700;margin-bottom:4px">Danke!</p>
          <p style="color:var(--muted);font-size:13px">Wir melden uns in 24h.</p>
        </div>`,
    `        <div class="form-error" role="alert" style="display:none;margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #7f1d1d;background:rgba(127,29,29,0.15)">
          <p data-error-title data-i18n="form.error.title" style="font-weight:700;font-size:13px;margin-bottom:2px">Das hat nicht geklappt.</p>
          <p data-error-text data-i18n-runtime style="color:var(--muted);font-size:13px">Deine Anfrage konnte nicht gesendet werden. Bitte prüfe deine Verbindung und versuche es erneut.</p>
        </div>
        <div class="form-success" style="display:none;padding:24px 0;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">&#10003;</div>
          <p style="font-weight:700;margin-bottom:4px" data-i18n="form.success.title">Danke!</p>
          <p style="color:var(--muted);font-size:13px" data-i18n="form.success.text">Wir melden uns in 24h.</p>
        </div>`,
    2, 'success/error block');

  sub(state, '<p style="color:var(--muted);font-size:12px;margin-top:16px">Deine Daten werden nur zur Kontaktaufnahme verwendet.</p>',
    '<p style="color:var(--muted);font-size:12px;margin-top:16px" data-i18n="form.privacy">Deine Daten werden nur zur Kontaktaufnahme verwendet.</p>', 1, 'privacy');

  // ── Ratgeber ─────────────────────────────────────────────────────
  // Zwei Schreibweisen im Bestand: "&" und "&amp;".
  if (!subOptional(state, '>Ratgeber &amp; Tipps</h2>', ' data-i18n="city.guides.title">Ratgeber &amp; Tipps</h2>', 'guides title')) {
    sub(state, '>Ratgeber & Tipps</h2>', ' data-i18n="city.guides.title">Ratgeber & Tipps</h2>', 1, 'guides title');
  }
  for (const [de, key] of [
    ['Stuhlmiete Preise 2026', 'blog.post.prices.short'],
    ['Was kostet ein Stuhl im Salon? Preisvergleich nach Stadt.', 'blog.post.prices.shortTeaser'],
    ['Selbstständig als Friseur', 'blog.post.selfemployed.short'],
    ['Stuhlmiete als Einstieg in die Selbstständigkeit.', 'blog.post.selfemployed.shortTeaser'],
    ['Leere Stühle monetarisieren', 'blog.post.vacancy.short'],
    ['So verdienen Salonbesitzer mit ungenutztem Platz.', 'blog.post.vacancy.shortTeaser'],
  ]) {
    sub(state, `>${de}</span>`, ` data-i18n="${key}">${de}</span>`, 1, key);
  }
  sub(state, '>Alle Artikel lesen &rarr;</a>', ' data-i18n="city.guides.all">Alle Artikel lesen &rarr;</a>', 1, 'guides all');

  // ── Footer + Sprachumschalter ────────────────────────────────────
  sub(state, '<div class="f-brand">CHAIRMATCH</div>\n  <div>Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>',
    '<div class="f-brand" data-i18n="common.brandUpper">CHAIRMATCH</div>\n  <div data-i18n="common.tagline">Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>',
    1, 'footer brand');

  sub(state, '<a href="https://chairmatch.de/impressum">Impressum</a>',
    '<a href="https://chairmatch.de/impressum" data-i18n="common.nav.imprint">Impressum</a>', 1, 'imprint');
  sub(state, '<a href="https://chairmatch.de/datenschutz">Datenschutz</a>',
    '<a href="https://chairmatch.de/datenschutz" data-i18n="common.nav.privacy">Datenschutz</a>', 1, 'privacy link');
  sub(state, '<a href="https://chairmatch.de">Startseite</a>',
    '<a href="https://chairmatch.de" data-i18n="common.nav.home">Startseite</a>', 1, 'home link');

  sub(state, `<div style="margin-top:12px">© 2026 ChairMatch — ${L.footerCity}</div>`,
    `<div style="margin-top:12px" data-i18n="common.copyright" data-i18n-vars='{"year":"2026","location":"@${K}.footerCity"}'>© 2026 ChairMatch — ${L.footerCity}</div>\n  <div data-i18n-switcher style="margin-top:16px"></div>`,
    1, 'copyright/switcher');

  // ── Inline-submitLead durch gemeinsames Modul ersetzen ───────────
  const scriptStart = state.html.indexOf('<script src="/js/supabase-config.js"></script>');
  const scriptEnd = state.html.indexOf('</script>', state.html.indexOf('async function submitLead'));
  if (scriptStart === -1 || scriptEnd === -1) {
    console.error(`  ✗ ${file}: Inline-submitLead nicht gefunden`); failures++;
  } else {
    state.html = state.html.slice(0, scriptStart) +
      '<script src="/js/supabase-config.js"></script>\n<script src="/js/lead-form.js" defer></script>' +
      state.html.slice(scriptEnd + '</script>'.length);
  }

  if (state.errors.length) {
    console.error(`  ✗ ${file} — nicht geschrieben:`);
    for (const e of state.errors) console.error(`      ${e}`);
    failures += state.errors.length;
    continue;
  }
  fs.writeFileSync(full, state.html);
  console.log(`  ✓ ${file}`);
}

if (failures) { console.error(`\n${failures} Ersetzung(en) fehlgeschlagen.`); process.exit(1); }
console.log('\nAlle Stadtseiten instrumentiert.');
