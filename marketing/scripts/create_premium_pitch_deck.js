const PptxGenJs = require('pptxgenjs');

// Initialize presentation
const prs = new PptxGenJs();
prs.defineLayout({ name: 'LAYOUT1', width: 10, height: 5.625 });
prs.defineLayout({ name: 'LAYOUT2', width: 10, height: 5.625 });
prs.layout = 'LAYOUT1';

// COLOR PALETTE - Design Language
const colors = {
  coal: '1A1612',
  coal2: '252118',
  coal3: '332E24',
  coal4: '443C2E',
  gold: 'C9963C',
  gold2: 'DBA84A',
  goldPale: 'ECC870',
  ink: 'F7F2EA',
  ink2: 'C4B8A8',
  ink3: '9A8C7C',
  ink4: '7A6E5E',
  green: '5CB882',
  red: 'D04B3B',
  white: 'FFFFFF',
};

// TYPOGRAPHY HELPERS
const typography = {
  display: { name: 'Palatino Linotype', size: 36, bold: false },
  sectionLabel: { name: 'Calibri', size: 11, bold: true, charSpacing: 4 },
  title: { name: 'Palatino Linotype', size: 32, bold: false },
  subtitle: { name: 'Palatino Linotype', size: 18, bold: false, italic: true },
  body: { name: 'Calibri Light', size: 14, bold: false },
  bodySmall: { name: 'Calibri Light', size: 12, bold: false },
  cardTitle: { name: 'Calibri', size: 16, bold: true },
  cardText: { name: 'Calibri Light', size: 13, bold: false },
};

// SHADOW FACTORY - Always create new object
function getShadow() {
  return {
    type: 'outer',
    blur: 6,
    offset: 2,
    angle: 135,
    color: '000000',
    opacity: 0.15,
  };
}

// BORDER FACTORY
function getGoldBorder() {
  return {
    pt: 1,
    color: colors.coal4,
  };
}

// HELPER: Add dark background
function addDarkBackground(slide) {
  slide.background = { color: colors.coal };
}

// HELPER: Add section label
function addSectionLabel(slide, text, x = 0.3, y = 0.4) {
  slide.addText(text, {
    x: x,
    y: y,
    w: 9.4,
    h: 0.35,
    fontFace: 'Calibri',
    fontSize: 11,
    bold: true,
    color: colors.ink4,
    charSpacing: 4,
    align: 'left',
  });
}

// HELPER: Add title
function addTitle(slide, text, x = 0.3, y = 1.0) {
  slide.addText(text, {
    x: x,
    y: y,
    w: 9.4,
    h: 1.0,
    fontFace: 'Palatino Linotype',
    fontSize: 32,
    bold: false,
    color: colors.ink,
    align: 'left',
    valign: 'top',
  });
}

// HELPER: Add gold separator line
function addGoldSeparator(slide, x, y, width = 0.5) {
  slide.addShape(prs.ShapeType.rect, {
    x: x,
    y: y,
    w: width,
    h: 0.05,
    fill: { color: colors.gold },
    line: { type: 'none' },
  });
}

// HELPER: Rounded card
function addCard(slide, options) {
  const { x, y, w, h, backgroundColor = colors.coal2, borderColor = colors.coal4 } = options;

  slide.addShape(prs.ShapeType.roundRect, {
    x: x,
    y: y,
    w: w,
    h: h,
    fill: { color: backgroundColor },
    line: { pt: 1, color: borderColor },
    rectRadius: 0.15,
    shadow: getShadow(),
  });
}

// HELPER: Gold number badge
function addGoldBadge(slide, number, x, y) {
  slide.addText(number, {
    x: x,
    y: y,
    w: 0.8,
    h: 0.6,
    fontFace: 'Palatino Linotype',
    fontSize: 36,
    bold: false,
    color: colors.gold,
    align: 'center',
    valign: 'middle',
  });
}

// HELPER: Trust indicator row
function addTrustRow(slide, y) {
  const indicators = [
    { icon: '✓', text: '100% Versichert' },
    { icon: '§', text: '§45b Integriert' },
    { icon: '◆', text: '24/7 Verfügbar' },
  ];

  const spacing = 3.0;
  let currentX = 0.5;

  indicators.forEach((ind, idx) => {
    if (idx > 0) {
      slide.addText('|', {
        x: currentX - 0.3,
        y: y,
        w: 0.2,
        h: 0.3,
        fontSize: 12,
        color: colors.gold,
        align: 'center',
      });
    }

    slide.addText(ind.icon, {
      x: currentX,
      y: y,
      w: 0.3,
      h: 0.3,
      fontSize: 14,
      color: colors.gold,
      bold: true,
      align: 'center',
    });

    slide.addText(ind.text, {
      x: currentX + 0.35,
      y: y + 0.02,
      w: 2.3,
      h: 0.3,
      fontSize: 11,
      color: colors.ink3,
      align: 'left',
    });

    currentX += spacing;
  });
}

// ============================================
// SLIDE 1: TITLE
// ============================================
let slide = prs.addSlide();
addDarkBackground(slide);

// Gold glow circle background
slide.addShape(prs.ShapeType.ellipse, {
  x: 6.5,
  y: -1.0,
  w: 4.0,
  h: 4.0,
  fill: { color: colors.coal3, transparency: 85 },
  line: { type: 'none' },
});

// Heart icon area (gold rounded rectangle)
slide.addShape(prs.ShapeType.roundRect, {
  x: 4.2,
  y: 0.5,
  w: 0.55,
  h: 0.55,
  fill: { color: colors.gold },
  line: { type: 'none' },
  rectRadius: 0.08,
});

slide.addText('♥', {
  x: 4.2,
  y: 0.5,
  w: 0.55,
  h: 0.55,
  fontSize: 24,
  color: colors.coal,
  bold: true,
  align: 'center',
  valign: 'middle',
});

// Main title
slide.addText('ALLTAGSENGEL', {
  x: 0.5,
  y: 1.3,
  w: 9.0,
  h: 0.7,
  fontFace: 'Palatino Linotype',
  fontSize: 48,
  color: colors.ink,
  charSpacing: 6,
  bold: false,
  align: 'left',
  valign: 'top',
});

// Tagline
slide.addText('Mit Herz für dich da', {
  x: 0.5,
  y: 2.05,
  w: 9.0,
  h: 0.4,
  fontFace: 'Palatino Linotype',
  fontSize: 18,
  italic: true,
  color: colors.gold,
  align: 'left',
  valign: 'top',
});

// Subtitle
slide.addText('Premium Alltagsbegleitung', {
  x: 0.5,
  y: 2.5,
  w: 9.0,
  h: 0.35,
  fontFace: 'Calibri Light',
  fontSize: 11,
  color: colors.ink3,
  align: 'left',
  valign: 'top',
});

// Gold separator
addGoldSeparator(slide, 0.5, 2.95, 0.4);

// Trust indicators
addTrustRow(slide, 3.5);

// Footer
slide.addText('Investor Pitch Deck · März 2026', {
  x: 0.5,
  y: 5.0,
  w: 9.0,
  h: 0.3,
  fontSize: 9,
  color: colors.ink4,
  align: 'left',
});

// ============================================
// SLIDE 2: DAS PROBLEM
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'DAS PROBLEM');
addTitle(slide, 'Der Pflegemarkt braucht\ndigitale Innovation', 0.3, 0.95);

// Problem Card 1
addCard(slide, { x: 0.3, y: 2.0, w: 3.0, h: 2.2 });
addGoldBadge(slide, '€4,4B', 0.7, 2.15);
slide.addText('Ungenutzte Mittel', {
  x: 0.3,
  y: 2.95,
  w: 3.0,
  h: 0.3,
  fontFace: 'Calibri',
  fontSize: 14,
  bold: true,
  color: colors.ink,
  align: 'center',
});
slide.addText('€7,44B §45b Budget, nur 40% wird abgerufen', {
  x: 0.5,
  y: 3.35,
  w: 2.6,
  h: 1.0,
  fontFace: 'Calibri Light',
  fontSize: 12,
  color: colors.ink2,
  align: 'center',
  valign: 'top',
});

// Problem Card 2
addCard(slide, { x: 3.5, y: 2.0, w: 3.0, h: 2.2 });
addGoldBadge(slide, '⏱', 3.9, 2.15);
slide.addText('Analoge Prozesse', {
  x: 3.5,
  y: 2.95,
  w: 3.0,
  h: 0.3,
  fontFace: 'Calibri',
  fontSize: 14,
  bold: true,
  color: colors.ink,
  align: 'center',
});
slide.addText('Analoge Vermittlung, lange Wartezeiten, manuelles Matching', {
  x: 3.7,
  y: 3.35,
  w: 2.6,
  h: 1.0,
  fontFace: 'Calibri Light',
  fontSize: 12,
  color: colors.ink2,
  align: 'center',
  valign: 'top',
});

// Problem Card 3
addCard(slide, { x: 6.7, y: 2.0, w: 3.0, h: 2.2 });
addGoldBadge(slide, '⚠', 7.1, 2.15);
slide.addText('Qualitätsmangel', {
  x: 6.7,
  y: 2.95,
  w: 3.0,
  h: 0.3,
  fontFace: 'Calibri',
  fontSize: 14,
  bold: true,
  color: colors.ink,
  align: 'center',
});
slide.addText('Keine standardisierte Qualitätssicherung, Vertrauensdefizit', {
  x: 6.9,
  y: 3.35,
  w: 2.6,
  h: 1.0,
  fontFace: 'Calibri Light',
  fontSize: 12,
  color: colors.ink2,
  align: 'center',
  valign: 'top',
});

// ============================================
// SLIDE 3: DIE LÖSUNG
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'UNSERE LÖSUNG');
addTitle(slide, 'AlltagsEngel — Die Plattform\nfür Alltagsbegleitung', 0.3, 0.95);

// Left side - Features
const features = [
  { icon: '⚡', title: 'Sofortige Vermittlung', desc: 'Zertifizierte Begleiter in Ihrer Nähe' },
  { icon: '✓', title: '§45b Integration', desc: 'Direkte Abrechnung mit Pflegekassen' },
  { icon: '⭐', title: 'Qualitätsgarantie', desc: 'Geprüfte & bewertete Alltagsengel' },
];

let featureY = 2.1;
features.forEach((feature) => {
  // Gold icon circle
  slide.addShape(prs.ShapeType.ellipse, {
    x: 0.5,
    y: featureY,
    w: 0.4,
    h: 0.4,
    fill: { color: colors.gold },
    line: { type: 'none' },
  });

  slide.addText(feature.icon, {
    x: 0.5,
    y: featureY,
    w: 0.4,
    h: 0.4,
    fontSize: 16,
    color: colors.coal,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  slide.addText(feature.title, {
    x: 1.1,
    y: featureY,
    w: 3.5,
    h: 0.25,
    fontSize: 13,
    bold: true,
    color: colors.ink,
  });

  slide.addText(feature.desc, {
    x: 1.1,
    y: featureY + 0.28,
    w: 3.5,
    h: 0.3,
    fontSize: 11,
    color: colors.ink3,
  });

  featureY += 0.95;
});

// Right side - App mockup area (stylized)
addCard(slide, { x: 5.2, y: 2.0, w: 4.3, h: 3.0 });

slide.addText('App Interface', {
  x: 5.4,
  y: 2.2,
  w: 4.0,
  h: 0.4,
  fontSize: 16,
  bold: true,
  color: colors.gold,
  align: 'center',
});

// Mockup elements
slide.addShape(prs.ShapeType.rect, {
  x: 5.5,
  y: 2.8,
  w: 3.8,
  h: 0.5,
  fill: { color: colors.coal3 },
  line: { type: 'none' },
});

slide.addText('Engel in Ihrer Nähe finden', {
  x: 5.7,
  y: 2.85,
  w: 3.4,
  h: 0.4,
  fontSize: 12,
  color: colors.ink2,
  align: 'left',
});

slide.addShape(prs.ShapeType.rect, {
  x: 5.5,
  y: 3.5,
  w: 3.8,
  h: 0.5,
  fill: { color: colors.coal3 },
  line: { type: 'none' },
});

slide.addText('§45b Zuschuss automatisch abrechnen', {
  x: 5.7,
  y: 3.55,
  w: 3.4,
  h: 0.4,
  fontSize: 12,
  color: colors.ink2,
  align: 'left',
});

slide.addShape(prs.ShapeType.rect, {
  x: 5.5,
  y: 4.15,
  w: 3.8,
  h: 0.5,
  fill: { color: colors.coal3 },
  line: { type: 'none' },
});

slide.addText('Begleiter bewerten & überprüfen', {
  x: 5.7,
  y: 4.2,
  w: 3.4,
  h: 0.4,
  fontSize: 12,
  color: colors.ink2,
  align: 'left',
});

// ============================================
// SLIDE 4: MARKTPOTENZIAL
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'MARKTCHANCE');
addTitle(slide, 'Ein Markt mit €50 Mrd.+ Potenzial', 0.3, 0.95);

// Three stat callouts in a row
const stats = [
  { label: 'TAM', value: '€50B+', desc: 'Deutscher Pflegemarkt' },
  { label: 'SAM', value: '€7,44B', desc: '§45b jährliches Budget' },
  { label: 'SOM', value: '€150M', desc: '5-Jahres Ziel' },
];

let statX = 0.4;
stats.forEach((stat, idx) => {
  addCard(slide, { x: statX, y: 1.9, w: 2.8, h: 1.6 });

  slide.addText(stat.label, {
    x: statX + 0.2,
    y: 2.05,
    w: 2.4,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: colors.ink3,
    charSpacing: 3,
    align: 'center',
  });

  slide.addText(stat.value, {
    x: statX + 0.2,
    y: 2.35,
    w: 2.4,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: colors.gold,
    align: 'center',
  });

  slide.addText(stat.desc, {
    x: statX + 0.2,
    y: 2.95,
    w: 2.4,
    h: 0.5,
    fontSize: 11,
    color: colors.ink2,
    align: 'center',
    valign: 'middle',
  });

  statX += 3.1;
});

// Market note
slide.addText('4,96 Mio. Pflegebedürftige in Deutschland · Tendenz steigend', {
  x: 0.3,
  y: 3.7,
  w: 9.4,
  h: 0.4,
  fontSize: 12,
  color: colors.ink3,
  align: 'left',
  italic: true,
});

// Simple growth bar chart representation
const years = ['2024', '2025', '2026', '2027', '2028'];
let chartX = 0.4;
const maxHeight = 1.5;
const values = [0.2, 0.4, 0.6, 0.8, 1.0];

years.forEach((year, idx) => {
  const barHeight = maxHeight * values[idx];
  slide.addShape(prs.ShapeType.rect, {
    x: chartX + 0.15,
    y: 4.8 - barHeight,
    w: 0.5,
    h: barHeight,
    fill: { color: colors.gold },
    line: { type: 'none' },
  });

  slide.addText(year, {
    x: chartX,
    y: 4.95,
    w: 0.8,
    h: 0.25,
    fontSize: 9,
    color: colors.ink3,
    align: 'center',
  });

  chartX += 1.85;
});

// ============================================
// SLIDE 5: GESCHÄFTSMODELL
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'GESCHÄFTSMODELL');
addTitle(slide, 'Zwei Einnahmequellen,\nstarke Unit Economics', 0.3, 0.95);

// Revenue Model Card 1
addCard(slide, { x: 0.3, y: 2.0, w: 4.4, h: 2.4 });

slide.addText('18% Provision', {
  x: 0.5,
  y: 2.2,
  w: 4.0,
  h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.ink,
  align: 'left',
});

slide.addShape(prs.ShapeType.rect, {
  x: 0.5,
  y: 2.6,
  w: 4.0,
  h: 0.02,
  fill: { color: colors.gold },
  line: { type: 'none' },
});

slide.addText('Pro Buchung abgerechnet', {
  x: 0.5,
  y: 2.8,
  w: 4.0,
  h: 0.25,
  fontSize: 12,
  color: colors.ink2,
  align: 'left',
});

slide.addText('Ø €40 Buchungswert = €7,20 Provision pro Vermittlung', {
  x: 0.5,
  y: 3.15,
  w: 4.0,
  h: 0.6,
  fontSize: 12,
  color: colors.ink3,
  align: 'left',
  valign: 'top',
});

slide.addText('→ Skaliert mit Plattformwachstum', {
  x: 0.5,
  y: 3.85,
  w: 4.0,
  h: 0.4,
  fontSize: 11,
  italic: true,
  color: colors.gold,
  align: 'left',
});

// Revenue Model Card 2
addCard(slide, { x: 5.3, y: 2.0, w: 4.4, h: 2.4 });

slide.addText('€9,99/Monat Premium', {
  x: 5.5,
  y: 2.2,
  w: 4.0,
  h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.ink,
  align: 'left',
});

slide.addShape(prs.ShapeType.rect, {
  x: 5.5,
  y: 2.6,
  w: 4.0,
  h: 0.02,
  fill: { color: colors.gold },
  line: { type: 'none' },
});

slide.addText('Für zertifizierte Engel', {
  x: 5.5,
  y: 2.8,
  w: 4.0,
  h: 0.25,
  fontSize: 12,
  color: colors.ink2,
  align: 'left',
});

slide.addText('Erweiterte Funktionen, Profilverifizierung, Versicherungsschutz', {
  x: 5.5,
  y: 3.15,
  w: 4.0,
  h: 0.6,
  fontSize: 12,
  color: colors.ink3,
  align: 'left',
  valign: 'top',
});

slide.addText('→ Starke Retention & Upsell', {
  x: 5.5,
  y: 3.85,
  w: 4.0,
  h: 0.4,
  fontSize: 11,
  italic: true,
  color: colors.gold,
  align: 'left',
});

// Key metric
slide.addText('Ø €125/Monat pro Kunde durch §45b Zuschuss', {
  x: 0.3,
  y: 4.6,
  w: 9.4,
  h: 0.3,
  fontSize: 13,
  bold: true,
  color: colors.gold,
  align: 'center',
});

// ============================================
// SLIDE 6: PRODUKT & TECHNOLOGIE
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'PRODUKT & TECHNOLOGIE');
addTitle(slide, 'Eine App, zwei Welten', 0.3, 0.95);

// Customer side
addCard(slide, { x: 0.3, y: 2.0, w: 4.4, h: 2.5 });

slide.addText('Für Patienten', {
  x: 0.5,
  y: 2.15,
  w: 4.0,
  h: 0.35,
  fontSize: 15,
  bold: true,
  color: colors.gold,
  align: 'left',
});

const customerFeatures = ['Engel in Ihrer Nähe finden', 'Sofort buchen & starten', '§45b Zuschuss nutzen', 'Begleiter bewerten & rezensieren'];
let cfY = 2.65;
customerFeatures.forEach((feat) => {
  slide.addText('✓ ' + feat, {
    x: 0.7,
    y: cfY,
    w: 3.8,
    h: 0.28,
    fontSize: 11,
    color: colors.green,
    align: 'left',
  });
  cfY += 0.35;
});

// Service provider side
addCard(slide, { x: 5.3, y: 2.0, w: 4.4, h: 2.5 });

slide.addText('Für Engel (Dienstleister)', {
  x: 5.5,
  y: 2.15,
  w: 4.0,
  h: 0.35,
  fontSize: 15,
  bold: true,
  color: colors.gold,
  align: 'left',
});

const providerFeatures = ['Profil erstellen & zertifizieren', 'Anfragen automatisch verwalten', 'Verdienst tracking', 'Premium Features freischalten'];
let pfY = 2.65;
providerFeatures.forEach((feat) => {
  slide.addText('✓ ' + feat, {
    x: 5.7,
    y: pfY,
    w: 3.8,
    h: 0.28,
    fontSize: 11,
    color: colors.green,
    align: 'left',
  });
  pfY += 0.35;
});

// Tech stack
slide.addText('Technologie Stack:', {
  x: 0.3,
  y: 4.7,
  w: 9.4,
  h: 0.25,
  fontSize: 12,
  bold: true,
  color: colors.ink,
  align: 'left',
});

const techBadges = ['React Native', 'Expo', 'Supabase', 'iOS & Android'];
let techX = 0.3;
techBadges.forEach((tech) => {
  addCard(slide, { x: techX, y: 5.05, w: 2.1, h: 0.35 });
  slide.addText(tech, {
    x: techX,
    y: 5.05,
    w: 2.1,
    h: 0.35,
    fontSize: 11,
    bold: true,
    color: colors.gold,
    align: 'center',
    valign: 'middle',
  });
  techX += 2.35;
});

// ============================================
// SLIDE 7: WETTBEWERBSANALYSE
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'WETTBEWERBSANALYSE');
addTitle(slide, 'Klare Differenzierung im Markt', 0.3, 0.95);

// Comparison table header
const tableX = 0.4;
const tableY = 1.95;
const colWidth = 3.0;
const rowHeight = 0.4;

// Header row
const headers = ['Kriterium', 'AlltagsEngel', 'Tradizionale Agenturen', 'Andere Plattformen'];
let hX = tableX;
headers.forEach((header, idx) => {
  slide.addShape(prs.ShapeType.rect, {
    x: hX,
    y: tableY,
    w: colWidth,
    h: rowHeight,
    fill: { color: colors.coal4 },
    line: { pt: 1, color: colors.gold },
  });

  slide.addText(header, {
    x: hX + 0.1,
    y: tableY + 0.05,
    w: colWidth - 0.2,
    h: rowHeight - 0.1,
    fontSize: 10,
    bold: true,
    color: colors.gold,
    align: 'center',
    valign: 'middle',
  });

  hX += colWidth;
});

// Data rows
const rows = [
  ['Digitale Buchung', '✓', '✗', '◐'],
  ['§45b Integration', '✓', '✗', '✗'],
  ['Qualitätssicherung', '✓', '✓', '◐'],
  ['Preistransparenz', '✓', '✗', '✓'],
  ['Bewertungssystem', '✓', '✗', '✓'],
];

let dataY = tableY + rowHeight;
rows.forEach((row) => {
  let dataX = tableX;

  row.forEach((cell, idx) => {
    const bgColor = idx === 1 ? colors.coal3 : colors.coal2;
    const isBold = idx === 1;
    const textColor = cell === '✓' ? colors.green : cell === '✗' ? colors.red : colors.ink3;

    slide.addShape(prs.ShapeType.rect, {
      x: dataX,
      y: dataY,
      w: colWidth,
      h: rowHeight,
      fill: { color: bgColor },
      line: { pt: 0.5, color: colors.coal4 },
    });

    slide.addText(cell, {
      x: dataX + 0.1,
      y: dataY + 0.05,
      w: colWidth - 0.2,
      h: rowHeight - 0.1,
      fontSize: 10,
      bold: isBold,
      color: textColor,
      align: 'center',
      valign: 'middle',
    });

    dataX += colWidth;
  });

  dataY += rowHeight;
});

// ============================================
// SLIDE 8: TRAKTION & MEILENSTEINE
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'TRAKTION & MEILENSTEINE');
addTitle(slide, 'Vom Konzept zur Marktreife', 0.3, 0.95);

// Timeline
const milestones = [
  { period: 'Q3 2025', text: 'Konzept & Marktvalidierung', done: true },
  { period: 'Q4 2025', text: 'MVP-Entwicklung', done: true },
  { period: 'Q1 2026', text: 'Beta-Launch Frankfurt', done: true },
  { period: 'Q2 2026', text: 'Öffentlicher Launch', done: false },
  { period: 'Q3 2026', text: 'Erste 500 Nutzer', done: false },
  { period: 'Q1 2027', text: 'Expansion in 3 weitere Städte', done: false },
];

let timelineX = 0.5;
const timelineY = 2.1;
const timelineSpacing = 1.55;

milestones.forEach((milestone, idx) => {
  const dotColor = milestone.done ? colors.green : colors.gold;

  // Timeline dot
  slide.addShape(prs.ShapeType.ellipse, {
    x: timelineX + 0.35,
    y: timelineY,
    w: 0.3,
    h: 0.3,
    fill: { color: dotColor },
    line: { type: 'none' },
  });

  // Connecting line
  if (idx < milestones.length - 1) {
    slide.addShape(prs.ShapeType.rect, {
      x: timelineX + 0.65,
      y: timelineY + 0.13,
      w: 0.85,
      h: 0.04,
      fill: { color: colors.coal4 },
      line: { type: 'none' },
    });
  }

  // Text
  slide.addText(milestone.period, {
    x: timelineX - 0.1,
    y: timelineY + 0.45,
    w: 1.5,
    h: 0.25,
    fontSize: 9,
    bold: true,
    color: dotColor,
    align: 'center',
  });

  slide.addText(milestone.text, {
    x: timelineX - 0.2,
    y: timelineY + 0.75,
    w: 1.8,
    h: 0.5,
    fontSize: 9,
    color: colors.ink2,
    align: 'center',
    valign: 'top',
  });

  timelineX += timelineSpacing;
});

// ============================================
// SLIDE 9: TEAM
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'UNSER TEAM');
addTitle(slide, 'Erfahrung trifft Leidenschaft', 0.3, 0.95);

const team = [
  { initials: 'YD', name: 'Yusuf Ferhat Demir', role: 'Gründer & CEO', skill: 'Strategie & Vision' },
  { initials: 'LL', name: 'Laura Leeman', role: 'Teamleiterin', skill: 'Pflege & Qualität' },
  { initials: 'MY', name: 'Mehmet Yilmaz', role: 'CTO', skill: 'Technologie & Produkt' },
  { initials: 'SW', name: 'Sophie Weber', role: 'Marketing', skill: 'Growth & Kommunikation' },
  { initials: 'AH', name: 'Anna Hoffmann', role: 'Assistenz', skill: 'Kunden & Operations' },
];

let teamX = 0.35;
const teamY = 2.0;
const teamCardWidth = 1.85;

team.forEach((member) => {
  // Card
  addCard(slide, { x: teamX, y: teamY, w: teamCardWidth, h: 2.5 });

  // Initials circle
  slide.addShape(prs.ShapeType.ellipse, {
    x: teamX + 0.35,
    y: teamY + 0.2,
    w: 1.15,
    h: 1.15,
    fill: { color: colors.gold },
    line: { type: 'none' },
  });

  slide.addText(member.initials, {
    x: teamX + 0.35,
    y: teamY + 0.2,
    w: 1.15,
    h: 1.15,
    fontSize: 24,
    bold: true,
    color: colors.coal,
    align: 'center',
    valign: 'middle',
  });

  // Name
  slide.addText(member.name, {
    x: teamX + 0.1,
    y: teamY + 1.55,
    w: teamCardWidth - 0.2,
    h: 0.35,
    fontSize: 10,
    bold: true,
    color: colors.ink,
    align: 'center',
    valign: 'top',
  });

  // Role
  slide.addText(member.role, {
    x: teamX + 0.1,
    y: teamY + 1.9,
    w: teamCardWidth - 0.2,
    h: 0.25,
    fontSize: 9,
    color: colors.gold,
    align: 'center',
    valign: 'top',
  });

  // Skill
  slide.addText(member.skill, {
    x: teamX + 0.1,
    y: teamY + 2.15,
    w: teamCardWidth - 0.2,
    h: 0.3,
    fontSize: 8,
    color: colors.ink3,
    align: 'center',
    valign: 'top',
  });

  teamX += 1.95;
});

// ============================================
// SLIDE 10: FINANZPLAN
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'FINANZPLAN');
addTitle(slide, 'Profitabel ab Jahr 2', 0.3, 0.95);

// Chart area
const chartAreaX = 0.5;
const chartAreaY = 2.0;
const chartAreaW = 9.0;
const chartAreaH = 2.2;

slide.addShape(prs.ShapeType.rect, {
  x: chartAreaX,
  y: chartAreaY,
  w: chartAreaW,
  h: chartAreaH,
  fill: { color: colors.coal2 },
  line: { pt: 1, color: colors.coal4 },
});

// Chart data
const financialData = [
  { year: '2024', revenue: 180, profit: -222 },
  { year: '2025', revenue: 720, profit: 78 },
  { year: '2026', revenue: 1800, profit: 468 },
  { year: '2027', revenue: 3600, profit: 1080 },
  { year: '2028', revenue: 7200, profit: 2520 },
];

const maxRevenue = 7200;
const chartWidth = 8.5;
const barGroupWidth = chartWidth / financialData.length;

financialData.forEach((data, idx) => {
  const barX = chartAreaX + 0.3 + idx * barGroupWidth;
  const revenuePct = data.revenue / maxRevenue;
  const profitPct = Math.max(0, data.profit) / maxRevenue;

  const revenueHeight = revenuePct * chartAreaH * 0.8;
  const profitHeight = profitPct * chartAreaH * 0.8;

  // Revenue bar (gold)
  slide.addShape(prs.ShapeType.rect, {
    x: barX,
    y: chartAreaY + chartAreaH - revenueHeight - 0.2,
    w: barGroupWidth * 0.35,
    h: revenueHeight,
    fill: { color: colors.gold },
    line: { type: 'none' },
  });

  // Profit bar (green)
  slide.addShape(prs.ShapeType.rect, {
    x: barX + barGroupWidth * 0.35 + 0.05,
    y: chartAreaY + chartAreaH - profitHeight - 0.2,
    w: barGroupWidth * 0.35,
    h: profitHeight,
    fill: { color: colors.green },
    line: { type: 'none' },
  });

  // Year label
  slide.addText(data.year, {
    x: barX - 0.1,
    y: chartAreaY + chartAreaH + 0.05,
    w: barGroupWidth + 0.2,
    h: 0.25,
    fontSize: 9,
    color: colors.ink3,
    align: 'center',
  });
});

// Legend
slide.addText('■ Umsatz', {
  x: 0.5,
  y: 4.45,
  w: 2.0,
  h: 0.25,
  fontSize: 10,
  color: colors.gold,
});

slide.addText('■ Nettogewinn', {
  x: 2.7,
  y: 4.45,
  w: 2.0,
  h: 0.25,
  fontSize: 10,
  color: colors.green,
});

// Key metrics
const metrics = [
  { value: '€33.5K', label: 'Monatliche Kosten' },
  { value: 'Jahr 2', label: 'Break-Even' },
  { value: '€2,52M', label: 'Nettogewinn Y5' },
];

let metricX = 5.5;
metrics.forEach((metric) => {
  addCard(slide, { x: metricX, y: 4.3, w: 1.4, h: 0.9 });

  slide.addText(metric.value, {
    x: metricX + 0.05,
    y: 4.35,
    w: 1.3,
    h: 0.35,
    fontSize: 12,
    bold: true,
    color: colors.gold,
    align: 'center',
  });

  slide.addText(metric.label, {
    x: metricX + 0.05,
    y: 4.6,
    w: 1.3,
    h: 0.35,
    fontSize: 8,
    color: colors.ink3,
    align: 'center',
    valign: 'top',
  });

  metricX += 1.5;
});

// ============================================
// SLIDE 11: INVESTITIONSRUNDE
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'INVESTITIONSRUNDE');
addTitle(slide, '€500.000 Seed-Runde', 0.3, 0.95);

// Large amount callout
addCard(slide, { x: 3.5, y: 1.8, w: 3.0, h: 1.2 });

slide.addText('€500K', {
  x: 3.5,
  y: 1.9,
  w: 3.0,
  h: 0.8,
  fontSize: 48,
  bold: true,
  color: colors.gold,
  align: 'center',
  valign: 'middle',
});

// Use of funds - 4 boxes
const allocations = [
  { amount: '€200K', pct: '40%', label: 'Team &\nRecruiting' },
  { amount: '€150K', pct: '30%', label: 'Marketing &\nGrowth' },
  { amount: '€75K', pct: '15%', label: 'Technologie' },
  { amount: '€75K', pct: '15%', label: 'Betrieb &\nReserve' },
];

let allocX = 0.3;
allocations.forEach((alloc) => {
  addCard(slide, { x: allocX, y: 3.3, w: 2.25, h: 1.7 });

  slide.addText(alloc.amount, {
    x: allocX + 0.15,
    y: 3.45,
    w: 1.95,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: colors.gold,
    align: 'center',
  });

  slide.addText(alloc.pct, {
    x: allocX + 0.15,
    y: 3.8,
    w: 1.95,
    h: 0.3,
    fontSize: 12,
    color: colors.ink2,
    align: 'center',
  });

  slide.addText(alloc.label, {
    x: allocX + 0.15,
    y: 4.2,
    w: 1.95,
    h: 0.7,
    fontSize: 11,
    bold: true,
    color: colors.ink,
    align: 'center',
    valign: 'top',
  });

  allocX += 2.4;
});

// ============================================
// SLIDE 12: VISION
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'UNSERE VISION');
addTitle(slide, 'Die Zukunft der Alltagsbegleitung', 0.3, 0.95);

// Vision statement
slide.addText('Jeder Mensch verdient einen Engel an seiner Seite.', {
  x: 0.5,
  y: 2.2,
  w: 9.0,
  h: 0.8,
  fontFace: 'Palatino Linotype',
  fontSize: 28,
  italic: true,
  color: colors.gold,
  align: 'center',
  valign: 'middle',
});

// Vision goals
const visionGoals = [
  { year: '2027', goal: '10.000+ aktive Nutzer' },
  { year: '2028', goal: 'Marktführer in 5 Bundesländern' },
  { year: '2030', goal: 'Europaweite Expansion' },
];

let visionX = 0.5;
visionGoals.forEach((vg) => {
  addCard(slide, { x: visionX, y: 3.3, w: 3.0, h: 1.5 });

  slide.addText(vg.year, {
    x: visionX + 0.2,
    y: 3.45,
    w: 2.6,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: colors.gold,
    align: 'center',
  });

  slide.addText(vg.goal, {
    x: visionX + 0.2,
    y: 3.85,
    w: 2.6,
    h: 0.8,
    fontSize: 13,
    bold: true,
    color: colors.ink,
    align: 'center',
    valign: 'top',
  });

  visionX += 3.2;
});

// ============================================
// SLIDE 13: KONTAKT
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

// Gold glow circle
slide.addShape(prs.ShapeType.ellipse, {
  x: -0.5,
  y: -1.0,
  w: 3.5,
  h: 3.5,
  fill: { color: colors.coal3, transparency: 85 },
  line: { type: 'none' },
});

// Title
slide.addText('ALLTAGSENGEL', {
  x: 0.5,
  y: 0.6,
  w: 9.0,
  h: 0.6,
  fontFace: 'Palatino Linotype',
  fontSize: 40,
  color: colors.ink,
  charSpacing: 6,
  align: 'center',
});

// Tagline
slide.addText('Lassen Sie uns gemeinsam die Pflege revolutionieren.', {
  x: 1.0,
  y: 1.4,
  w: 8.0,
  h: 0.5,
  fontSize: 14,
  italic: true,
  color: colors.gold,
  align: 'center',
});

// Contact details
const contactDetails = [
  'Yusuf Ferhat Demir · Gründer & CEO',
  'info@alltagsengel.de',
  'www.alltagsengel.de',
  'Schiller Str. 31, 60313 Frankfurt am Main',
];

let contactY = 2.3;
contactDetails.forEach((detail) => {
  slide.addText(detail, {
    x: 1.0,
    y: contactY,
    w: 8.0,
    h: 0.3,
    fontSize: 11,
    color: colors.ink2,
    align: 'center',
  });
  contactY += 0.35;
});

// CTA Button
addCard(slide, { x: 3.0, y: 4.3, w: 4.0, h: 0.6 });

slide.addText('JETZT GESPRÄCH VEREINBAREN', {
  x: 3.0,
  y: 4.3,
  w: 4.0,
  h: 0.6,
  fontFace: 'Calibri',
  fontSize: 12,
  bold: true,
  color: colors.coal,
  align: 'center',
  valign: 'middle',
});

// ============================================
// SLIDE 14: ANHANG
// ============================================
slide = prs.addSlide();
addDarkBackground(slide);

addSectionLabel(slide, 'ANHANG');
addTitle(slide, 'Detaillierte Finanzübersicht', 0.3, 0.95);

// Financial table
const financialTable = [
  ['Jahr', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'],
  ['Umsatz', '€180K', '€720K', '€1,8M', '€3,6M', '€7,2M'],
  ['Kosten', '€402K', '€642K', '€1,33M', '€2,52M', '€4,68M'],
  ['EBITDA', '-€222K', '€78K', '€468K', '€1,08M', '€2,52M'],
  ['Nettogewinn', '-€222K', '€78K', '€468K', '€1,08M', '€2,52M'],
  ['Marge', '-123%', '11%', '26%', '30%', '35%'],
];

const tableStartX = 0.4;
const tableStartY = 1.95;
const cellWidth = 1.55;
const cellHeight = 0.35;

financialTable.forEach((row, rowIdx) => {
  let cellX = tableStartX;

  row.forEach((cell, colIdx) => {
    const isHeader = rowIdx === 0 || colIdx === 0;
    const bgColor = isHeader ? colors.coal4 : (rowIdx % 2 === 0 ? colors.coal2 : colors.coal3);
    const textColor = isHeader ? colors.gold : (rowIdx === 5 ? colors.gold : colors.ink2);

    slide.addShape(prs.ShapeType.rect, {
      x: cellX,
      y: tableStartY + rowIdx * cellHeight,
      w: cellWidth,
      h: cellHeight,
      fill: { color: bgColor },
      line: { pt: 0.5, color: colors.coal4 },
    });

    slide.addText(cell, {
      x: cellX + 0.05,
      y: tableStartY + rowIdx * cellHeight + 0.02,
      w: cellWidth - 0.1,
      h: cellHeight - 0.04,
      fontSize: 10,
      bold: isHeader,
      color: textColor,
      align: 'center',
      valign: 'middle',
    });

    cellX += cellWidth;
  });
});

// Footer note
slide.addText('Alle Werte in EUR. Prognose basiert auf konservativen Annahmen und 18% Provision + €9,99 Premium pro Engel.', {
  x: 0.4,
  y: 4.8,
  w: 9.2,
  h: 0.6,
  fontSize: 9,
  color: colors.ink3,
  italic: true,
  align: 'center',
  valign: 'top',
});

// ============================================
// SAVE PRESENTATION
// ============================================
const outputPath = '/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room-de/02-pitch-deck/AlltagsEngel-Investor-Pitch-Deck-v2.pptx';
prs.writeFile({ fileName: outputPath });

console.log('✓ Premium Pitch Deck erstellt:', outputPath);
