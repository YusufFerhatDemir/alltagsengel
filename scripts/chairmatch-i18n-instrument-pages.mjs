#!/usr/bin/env node
/**
 * Instrumentiert die Einzelseiten (index, faq, blog/index) mit data-i18n.
 * Gleiche Regeln wie chairmatch-i18n-instrument.mjs: idempotent, und
 * eine Datei wird nur geschrieben, wenn jede Ersetzung genau passt.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'chairmatch-landing');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'de.json'), 'utf8'));
let failures = 0;

function open(rel) {
  const full = path.join(ROOT, rel);
  return { rel, full, html: fs.readFileSync(full, 'utf8'), errors: [] };
}
function sub(s, find, replace, times = 1, label = '') {
  const parts = s.html.split(find);
  if (parts.length - 1 !== times) {
    s.errors.push(`"${label || find.slice(0, 60)}" ${parts.length - 1}× statt ${times}×`);
    return;
  }
  s.html = parts.join(replace);
}
/** Text-Inhalt eines Tags mit data-i18n versehen: `>Text</tag` -> ` data-i18n=…>Text</tag` */
function text(s, snippet, key, times = 1) {
  sub(s, `>${snippet}<`, ` data-i18n="${key}">${snippet}<`, times, key);
}
function save(s) {
  if (s.errors.length) {
    console.error(`  ✗ ${s.rel} — nicht geschrieben:`);
    for (const e of s.errors) console.error(`      ${e}`);
    failures += s.errors.length;
    return;
  }
  fs.writeFileSync(s.full, s.html);
  console.log(`  ✓ ${s.rel}`);
}

/** hreflang + Runtime-Script in den <head>. */
function head(s, canonicalUrl, { addCanonical = false } = {}) {
  const alt =
    `<link rel="alternate" hreflang="de" href="${canonicalUrl}">\n` +
    `<link rel="alternate" hreflang="en" href="${canonicalUrl}?lang=en">\n` +
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}">\n` +
    `<meta property="og:locale" content="de_DE">\n` +
    `<meta property="og:locale:alternate" content="en_US">`;
  if (addCanonical) {
    sub(s, '<style>', `<link rel="canonical" href="${canonicalUrl}">\n${alt}\n<style>`, 1, 'canonical+hreflang');
  } else {
    sub(s, `<link rel="canonical" href="${canonicalUrl}">`,
      `<link rel="canonical" href="${canonicalUrl}">\n${alt}`, 1, 'hreflang');
  }
  sub(s, '</head>', '<script src="/i18n/i18n.js" defer></script>\n</head>', 1, 'runtime-script');
}

/** Gemeinsamer Footer-Block. */
function footer(s, { location, links }) {
  sub(s, '<div class="f-brand">CHAIRMATCH</div>',
    '<div class="f-brand" data-i18n="common.brandUpper">CHAIRMATCH</div>', 1, 'f-brand');
  sub(s, '<div>Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>',
    '<div data-i18n="common.tagline">Stuhlvermietung & Raumvermittlung für die Beauty-Branche</div>', 1, 'tagline');
  for (const [snippet, key] of links) text(s, snippet, key);
  const [open_, close] = s.html.includes('<div style="margin-top:12px">© 2026')
    ? ['© 2026 ChairMatch — ' + location, null] : ['&copy; 2026 ChairMatch &mdash; ' + location, null];
  sub(s, `<div style="margin-top:12px">${open_}</div>`,
    `<div style="margin-top:12px" data-i18n="common.copyright" data-i18n-vars='{"year":"2026","location":${JSON.stringify(location)}}'>${open_}</div>\n  <div data-i18n-switcher style="margin-top:16px"></div>`,
    1, 'copyright/switcher');
  if (close) { /* nichts */ }
}

/** Formularfelder + Erfolgs-/Fehlerblock, gemeinsam für index.html. */
function leadForm(s, { inputStyle, textareaStyle, selectStyle, successIndent }) {
  sub(s, `placeholder="Name *" style="${inputStyle}"`,
    `placeholder="Name *" data-i18n-attr="placeholder:form.field.name" style="${inputStyle}"`, 2, 'ph name');
  sub(s, `placeholder="Telefon *" style="${inputStyle}"`,
    `placeholder="Telefon *" data-i18n-attr="placeholder:form.field.phone" style="${inputStyle}"`, 2, 'ph phone');
  sub(s, `placeholder="Stadt *" style="${inputStyle}"`,
    `placeholder="Stadt *" data-i18n-attr="placeholder:form.field.city" style="${inputStyle}"`, 2, 'ph city');
  sub(s, `placeholder="Anzahl Stühle, Salon-Art..." rows="2" style="${textareaStyle}"`,
    `placeholder="Anzahl Stühle, Salon-Art..." data-i18n-attr="placeholder:form.field.message" rows="2" style="${textareaStyle}"`, 1, 'ph message');
  if (selectStyle) { /* Select-Optionen unten */ }

  text(s, 'Branche (optional)', 'form.field.branch');
  for (const [de, key] of [['Friseur', 'hair'], ['Barbershop', 'barbershop'], ['Kosmetik', 'cosmetics'],
                           ['Nails', 'nails'], ['Massage', 'massage'], ['Ästhetik', 'aesthetics'], ['Sonstige', 'other']]) {
    sub(s, `<option value="${de}">${de}</option>`, `<option value="${de}" data-i18n="cat.${key}">${de}</option>`, 1, `opt ${key}`);
  }

  text(s, 'SALON LISTEN', 'form.salon.submit');
  text(s, 'STUHL FINDEN', 'form.pro.submit');

  sub(s,
    `${successIndent}<div class="form-success" style="display:none;padding:24px 0;text-align:center">
${successIndent}  <div style="font-size:36px;margin-bottom:8px">&#10003;</div>
${successIndent}  <p style="font-weight:700;margin-bottom:4px">Danke!</p>
${successIndent}  <p style="color:var(--muted);font-size:13px">Wir melden uns in 24h.</p>
${successIndent}</div>`,
    `${successIndent}<div class="form-error" role="alert" style="display:none;margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #7f1d1d;background:rgba(127,29,29,0.15)">
${successIndent}  <p data-error-title data-i18n="form.error.title" style="font-weight:700;font-size:13px;margin-bottom:2px">Das hat nicht geklappt.</p>
${successIndent}  <p data-error-text data-i18n-runtime style="color:var(--muted);font-size:13px">Deine Anfrage konnte nicht gesendet werden. Bitte prüfe deine Verbindung und versuche es erneut.</p>
${successIndent}</div>
${successIndent}<div class="form-success" style="display:none;padding:24px 0;text-align:center">
${successIndent}  <div style="font-size:36px;margin-bottom:8px">&#10003;</div>
${successIndent}  <p style="font-weight:700;margin-bottom:4px" data-i18n="form.success.title">Danke!</p>
${successIndent}  <p style="color:var(--muted);font-size:13px" data-i18n="form.success.text">Wir melden uns in 24h.</p>
${successIndent}</div>`,
    2, 'success/error');
}

/** Inline-submitLead durch das gemeinsame Modul ersetzen. */
function externaliseLeadScript(s) {
  const start = s.html.indexOf('<script src="/js/supabase-config.js"></script>');
  const marker = s.html.indexOf('async function submitLead');
  if (start === -1 || marker === -1) { s.errors.push('Inline-submitLead nicht gefunden'); return; }
  const end = s.html.indexOf('</script>', marker);
  s.html = s.html.slice(0, start) +
    '<script src="/js/supabase-config.js"></script>\n<script src="/js/lead-form.js" defer></script>' +
    s.html.slice(end + '</script>'.length);
}

// ══════════════════════════════════════════════════════════════════
// index.html
// ══════════════════════════════════════════════════════════════════
{
  const s = open('index.html');
  if (s.html.includes('data-i18n')) console.log('  – index.html bereits instrumentiert');
  else {
    const M = catalog.meta.home;
    sub(s, `<title>${M.title}</title>`, `<title data-i18n="meta.home.title">${M.title}</title>`, 1, 'title');
    sub(s, `<meta name="description" content="${M.description}">`,
      `<meta name="description" content="${M.description}" data-i18n-attr="content:meta.home.description">`, 1, 'description');
    head(s, 'https://chairmatch.de/', { addCanonical: true });

    sub(s, '<body>', '<body data-i18n-vars=\'{"amount":"1 €"}\'>', 1, 'body vars');

    text(s, 'ChairMatch', 'common.brand');   // .hero-logo
    sub(s, '<h1>Dein <span>Stuhl</span>. Dein Business.<br>Deine Freiheit.</h1>',
      '<h1 data-i18n-html="home.hero.title">Dein <span>Stuhl</span>. Dein Business.<br>Deine Freiheit.</h1>', 1, 'h1');
    text(s, 'ChairMatch vermittelt Stuhlmiete und Raumvermietung für Beauty-Profis. Finde deinen Platz — flexibel, fair, ohne langfristige Bindung.', 'home.hero.subtitle');
    text(s, 'JETZT STARTEN', 'common.cta.start');
    text(s, "So funktioniert's", 'common.cta.howItWorks', 2);   // Button + Badge

    text(s, 'Branchen', 'home.categories.badge');
    text(s, 'Für jede Beauty-Sparte der passende Platz', 'home.categories.title');
    text(s, 'Ob Stuhl, Raum oder Kabine — ChairMatch bringt Anbieter und Profis zusammen.', 'home.categories.subtitle');
    for (const [de, key] of [['Barbershop', 'barbershop'], ['Friseur', 'hair'], ['Kosmetik', 'cosmetics'],
                             ['Ästhetik', 'aesthetics'], ['Nails', 'nails'], ['Massage', 'massage']]) {
      sub(s, `<div class="cat-name">${de}</div>`, `<div class="cat-name" data-i18n="cat.${key}">${de}</div>`, 1, `cat ${key}`);
    }

    text(s, 'In 3 Schritten zum eigenen Stuhl', 'home.steps.title');
    text(s, 'Profil erstellen', 'home.steps.s1.title');
    text(s, 'Registriere dich kostenlos und gib an, was du suchst: Stuhl, Raum oder Kabine.', 'home.steps.s1.text');
    text(s, 'Match finden', 'home.steps.s2.title');
    text(s, 'ChairMatch zeigt dir passende Angebote in deiner Stadt — mit Preis, Fotos und Bewertungen.', 'home.steps.s2.text');
    text(s, 'Buchen & loslegen', 'home.steps.s3.title');
    text(s, 'Buche direkt in der App. Flexibel kündbar, keine versteckten Kosten.', 'home.steps.s3.text');

    text(s, 'Zwei Seiten, ein Match', 'home.audience.badge');
    text(s, 'Für Salonbesitzer & Beauty-Profis', 'home.audience.title');
    text(s, 'Salonbesitzer', 'home.audience.owner.title');
    text(s, 'Leerer Stuhl kostet Geld. Vermiete ihn an qualifizierte Profis und verdiene, statt draufzuzahlen.', 'home.audience.owner.text');
    text(s, 'Beauty-Profis', 'home.audience.pro.title');
    text(s, 'Kein eigener Salon nötig. Miete einen Stuhl, bring deine Kunden mit und arbeite selbstständig.', 'home.audience.pro.text');

    text(s, 'Soziales Engagement', 'home.donate.badge');
    text(s, 'Mit jeder Buchung helfen wir', 'home.donate.title');
    sub(s, '<p class="subtitle">Von jeder Buchung bei ChairMatch fließt <strong style="color:var(--accent)">1 €</strong> direkt an Kinder und Familien in Not. Für die Zukunft der Kinder — nicht für Verwaltung.</p>',
      '<p class="subtitle" data-i18n-html="home.donate.subtitle">Von jeder Buchung bei ChairMatch fließt <strong style="color:var(--accent)">1 €</strong> direkt an Kinder und Familien in Not. Für die Zukunft der Kinder — nicht für Verwaltung.</p>',
      1, 'donate subtitle');
    text(s, '1 € pro Buchung', 'home.donate.c1.title');
    text(s, 'Jede Stuhlmiete und jede Raumbuchung hilft automatisch mit.', 'home.donate.c1.text');
    text(s, 'Für Kinderzukunft', 'home.donate.c2.title');
    text(s, 'Wir unterstützen Schulen, Kinder mit Behinderung und bedürftige Familien.', 'home.donate.c2.text');
    text(s, '100 % transparent', 'home.donate.c3.title');
    text(s, 'Wir verwalten die Spenden selbst und legen offen, wohin jeder Euro geht.', 'home.donate.c3.text');

    text(s, 'Deutschlandweit', 'home.cities.badge');
    text(s, 'ChairMatch in deiner Stadt', 'home.cities.title');
    text(s, 'Stuhlvermietung in über 20 Städten — und es werden mehr.', 'home.cities.subtitle');
    text(s, 'Häufige Fragen →', 'common.nav.faqArrow');

    text(s, 'Jetzt starten', 'home.contact.badge');
    text(s, 'Interesse? Melde dich kostenlos.', 'home.contact.title');
    text(s, 'Ob Salonbesitzer oder Beauty-Profi — hinterlasse deine Daten und wir melden uns innerhalb von 24 Stunden.', 'home.contact.subtitle');
    text(s, '🏪 Salonbesitzer', 'form.salon.title');
    text(s, 'Stühle vermieten & verdienen', 'form.salon.subtitle');
    text(s, '🎨 Beauty-Profi', 'form.pro.title');
    text(s, 'Stuhl mieten & loslegen', 'form.pro.subtitle');
    text(s, 'Deine Daten werden nur zur Kontaktaufnahme verwendet.', 'form.privacy');

    const INPUT = 'width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);font-size:14px;margin-bottom:10px;outline:none;box-sizing:border-box';
    const TEXTAREA = 'width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);font-size:14px;margin-bottom:12px;outline:none;resize:vertical;box-sizing:border-box';
    leadForm(s, { inputStyle: INPUT, textareaStyle: TEXTAREA, successIndent: '        ' });

    footer(s, {
      location: 'Frankfurt am Main',
      links: [['Impressum', 'common.nav.imprint'], ['Datenschutz', 'common.nav.privacy'],
              ['AGB', 'common.nav.terms'], ['Kontakt', 'common.nav.contact']],
    });
    externaliseLeadScript(s);
    save(s);
  }
}

// ══════════════════════════════════════════════════════════════════
// faq.html
// ══════════════════════════════════════════════════════════════════
{
  const s = open('faq.html');
  if (s.html.includes('data-i18n')) console.log('  – faq.html bereits instrumentiert');
  else {
    const M = catalog.meta.faq;
    sub(s, `<title>${M.title}</title>`, `<title data-i18n="meta.faq.title">${M.title}</title>`, 1, 'title');
    sub(s, `<meta name="description" content="${M.description}">`,
      `<meta name="description" content="${M.description}" data-i18n-attr="content:meta.faq.description">`, 1, 'description');
    sub(s, `<meta property="og:title" content="${M.title}">`,
      `<meta property="og:title" content="${M.title}" data-i18n-attr="content:meta.faq.title">`, 1, 'og:title');
    sub(s, `<meta property="og:description" content="${M.ogDescription}">`,
      `<meta property="og:description" content="${M.ogDescription}" data-i18n-attr="content:meta.faq.ogDescription">`, 1, 'og:description');
    head(s, 'https://chairmatch.de/faq');

    text(s, 'ChairMatch', 'common.brand');
    sub(s, '<h1>Häufige Fragen zur <span>Stuhlvermietung</span></h1>',
      '<h1 data-i18n-html="faq.hero.title">Häufige Fragen zur <span>Stuhlvermietung</span></h1>', 1, 'h1');
    text(s, 'Alles über Stuhlmiete, Preise, rechtliche Fragen und wie ChairMatch funktioniert.', 'faq.hero.subtitle');

    for (const [de, key] of [['Grundlagen', 'basics'], ['Preise & Kosten', 'pricing'],
                             ['Für Salonbesitzer', 'owners'], ['Für Freelancer', 'freelancers'],
                             ['Über ChairMatch', 'about']]) {
      sub(s, `<div class="faq-cat-title">${de}</div>`,
        `<div class="faq-cat-title" data-i18n="faq.cat.${key}">${de}</div>`, 1, `faq.cat.${key}`);
    }

    // Q&A: Reihenfolge im Markup entspricht faq.q1..q16 im Katalog.
    for (let i = 1; i <= 16; i++) {
      const q = catalog.faq[`q${i}`];
      sub(s, `<button class="faq-q" onclick="toggleFaq(this)">${q.q}</button>`,
        `<button class="faq-q" onclick="toggleFaq(this)" data-i18n="faq.q${i}.q">${q.q}</button>`, 1, `q${i}.q`);
      sub(s, `<div class="faq-a"><p>${q.a}</p></div>`,
        `<div class="faq-a"><p data-i18n="faq.q${i}.a">${q.a}</p></div>`, 1, `q${i}.a`);
    }

    text(s, 'Noch Fragen?', 'faq.cta.title');
    text(s, 'Schreib uns direkt — wir beraten dich kostenlos und unverbindlich.', 'faq.cta.text');
    text(s, 'WhatsApp schreiben', 'common.cta.whatsappWrite');

    footer(s, {
      location: 'Frankfurt am Main',
      links: [['Impressum', 'common.nav.imprint'], ['Datenschutz', 'common.nav.privacy'],
              ['Startseite', 'common.nav.home']],
    });
    save(s);
  }
}

// ══════════════════════════════════════════════════════════════════
// blog/index.html
// ══════════════════════════════════════════════════════════════════
{
  const s = open('blog/index.html');
  if (s.html.includes('data-i18n')) console.log('  – blog/index.html bereits instrumentiert');
  else {
    const M = catalog.meta.blog;
    sub(s, `<title>${M.title}</title>`, `<title data-i18n="meta.blog.title">${M.title}</title>`, 1, 'title');
    sub(s, `<meta name="description" content="${M.description}">`,
      `<meta name="description" content="${M.description}" data-i18n-attr="content:meta.blog.description">`, 1, 'description');
    sub(s, `<meta property="og:title" content="${M.title}">`,
      `<meta property="og:title" content="${M.title}" data-i18n-attr="content:meta.blog.title">`, 1, 'og:title');
    sub(s, `<meta property="og:description" content="${M.ogDescription}">`,
      `<meta property="og:description" content="${M.ogDescription}" data-i18n-attr="content:meta.blog.ogDescription">`, 1, 'og:description');
    head(s, 'https://chairmatch.de/blog');

    sub(s, '<a href="../index.html" class="brand">ChairMatch</a>',
      '<a href="../index.html" class="brand" data-i18n="common.brand">ChairMatch</a>', 1, 'nav brand');
    sub(s, '<a href="../index.html" class="back-link">Zur Startseite</a>',
      '<a href="../index.html" class="back-link" data-i18n="common.nav.backHome">Zur Startseite</a>', 1, 'back-link');
    text(s, 'ChairMatch Blog', 'blog.heroBadge');
    sub(s, '<h1>Wissen für <span>Beauty-Profis</span> und Salonbesitzer</h1>',
      '<h1 data-i18n-html="blog.heroTitle">Wissen für <span>Beauty-Profis</span> und Salonbesitzer</h1>', 1, 'h1');
    text(s, 'Praxiswissen zu Stuhlvermietung, Selbstständigkeit und den neuesten Trends in der Beauty-Branche.', 'blog.heroText');

    for (const [de, key] of [['Salonbesitzer', 'owner'], ['Freelancer', 'freelancer'], ['Trend', 'trend'],
                             ['Preise', 'pricing'], ['Gründung', 'founding']]) {
      const times = key === 'owner' ? 2 : 1;   // "Salonbesitzer" ist 2× Badge
      sub(s, `<span class="card-badge">${de}</span>`,
        `<span class="card-badge" data-i18n="blog.badge.${key}">${de}</span>`, times, `badge ${key}`);
    }

    // Datum + Lesezeit maschinenlesbar machen — Intl formatiert je Locale.
    sub(s, '<span>06. Juni 2026</span>',
      '<time data-i18n-date="2026-06-06" data-i18n-date-style="long">06. Juni 2026</time>', 6, 'dates');
    for (const min of [8, 9]) {
      const count = min === 8 ? 4 : 2;
      sub(s, `<span>${min} Min. Lesezeit</span>`,
        `<span data-i18n="blog.readTime" data-i18n-count="${min}">${min} Min. Lesezeit</span>`, count, `readtime ${min}`);
    }

    for (const [slug, key] of [['salonGuide', 'salonGuide'], ['freelancer', 'freelancer'], ['coworking', 'coworking'],
                               ['prices', 'prices'], ['selfemployed', 'selfemployed'], ['vacancy', 'vacancy']]) {
      const post = catalog.blog.post[key];
      sub(s, `<h2>${post.title}</h2>`, `<h2 data-i18n="blog.post.${key}.title">${post.title}</h2>`, 1, `${key}.title`);
      sub(s, `<p>${post.teaser}</p>`, `<p data-i18n="blog.post.${key}.teaser">${post.teaser}</p>`, 1, `${key}.teaser`);
    }
    sub(s, '<span class="read-more">Artikel lesen &rarr;</span>',
      '<span class="read-more" data-i18n="blog.readMore">Artikel lesen &rarr;</span>', 6, 'read-more');

    footer(s, {
      location: 'Frankfurt am Main',
      links: [['Startseite', 'common.nav.home'], ['Kontakt', 'common.nav.contact']],
    });
    save(s);
  }
}

if (failures) { console.error(`\n${failures} Ersetzung(en) fehlgeschlagen.`); process.exit(1); }
console.log('\nEinzelseiten instrumentiert.');
