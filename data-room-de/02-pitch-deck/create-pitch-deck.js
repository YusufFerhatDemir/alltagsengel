const PptxGenJS = require("pptxgenjs");

// Initialize presentation
const prs = new PptxGenJS();

// Configure presentation
prs.defineLayout({ name: "16x9", width: 10, height: 5.625 });
prs.layout = "16x9";

// Brand colors
const colors = {
  dark: "1A1612",
  gold: "C9963C",
  cream: "F7F2EA",
  white: "FFFFFF",
  lightGray: "E8E4DE",
  darkText: "2D2620",
};

// Helper function to create shadow effect
const getShadow = () => ({
  type: "outer",
  angle: 45,
  blur: 8,
  offset: 3,
  opacity: 0.3,
  color: "000000",
});

// Helper function for title slide
const addTitleSlide = (prs, title, subtitle, image = null) => {
  const slide = prs.addSlide();

  // Dark background
  slide.background = { color: colors.dark };

  // Add gold accent bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.15,
    h: 5.625,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  // Title
  slide.addText(title, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.2,
    fontSize: 54,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "left",
  });

  // Subtitle
  slide.addText(subtitle, {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.8,
    fontSize: 28,
    color: colors.cream,
    fontFace: "Arial",
    align: "left",
  });
};

// Helper function for content slide
const addContentSlide = (prs, title, subtitle = null) => {
  const slide = prs.addSlide();

  // Light background
  slide.background = { color: colors.cream };

  // Title bar with dark background
  slide.addShape(prs.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.8,
    fill: { color: colors.dark },
    line: { type: "none" },
  });

  // Gold accent line
  slide.addShape(prs.ShapeType.rect, {
    x: 0,
    y: 0.8,
    w: 10,
    h: 0.05,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  // Title
  slide.addText(title, {
    x: 0.5,
    y: 0.2,
    w: 9,
    h: 0.6,
    fontSize: 40,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "left",
    valign: "middle",
  });

  // Subtitle if provided
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.4,
      fontSize: 16,
      color: colors.darkText,
      fontFace: "Arial",
      align: "left",
      italic: true,
    });
  }

  return slide;
};

// ============ SLIDE 1: TITLE SLIDE ============
addTitleSlide(
  prs,
  "AlltagsEngel",
  "Mit Herz für dich da\n\nInvestor Pitch Deck 2026"
);

// ============ SLIDE 2: THE PROBLEM ============
const slide2 = addContentSlide(prs, "Das Problem", "Altenpflege-Lücke in Deutschland");

// Content area
slide2.addText("Herausforderungen im Pflegemarkt:", {
  x: 0.5,
  y: 1.2,
  w: 9,
  h: 0.4,
  fontSize: 18,
  bold: true,
  color: colors.dark,
  fontFace: "Arial",
});

const problems = [
  "4,96 Millionen pflegebedürftige Menschen in Deutschland",
  "§45b-Budget wird nur zu 40% ausgeschöpft (€7,44B vorhanden, nur €3B genutzt)",
  "Mangel an zugänglichen Plattformen für Alltagsbegleiter",
  "Traditionelle Agenturen sind teuer und ineffizient",
  "Digitale Lücke zwischen Senioren und Betreuungsangeboten",
];

let yPos = 1.8;
problems.forEach((problem) => {
  slide2.addShape(prs.ShapeType.ellipse, {
    x: 0.6,
    y: yPos + 0.08,
    w: 0.12,
    h: 0.12,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  slide2.addText(problem, {
    x: 1,
    y: yPos,
    w: 8.5,
    h: 0.28,
    fontSize: 14,
    color: colors.darkText,
    fontFace: "Arial",
    align: "left",
  });

  yPos += 0.6;
});

// Add stat box
slide2.addShape(prs.ShapeType.roundRect, {
  x: 5.5,
  y: 3.8,
  w: 4,
  h: 1.4,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide2.addText("€7,44B", {
  x: 5.7,
  y: 3.95,
  w: 3.6,
  h: 0.5,
  fontSize: 36,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "center",
});

slide2.addText("Ungenutzte §45b-Budget pro Jahr", {
  x: 5.7,
  y: 4.5,
  w: 3.6,
  h: 0.6,
  fontSize: 12,
  color: colors.cream,
  fontFace: "Arial",
  align: "center",
});

// ============ SLIDE 3: THE SOLUTION ============
const slide3 = addContentSlide(prs, "Unsere Lösung", "Eine digitale Plattform mit Herz");

slide3.addText("AlltagsEngel verbindet:", {
  x: 0.5,
  y: 1.2,
  w: 9,
  h: 0.4,
  fontSize: 18,
  bold: true,
  color: colors.dark,
});

// Two-column layout
// Left column - Kunden
slide3.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 1.8,
  w: 4.2,
  h: 3.2,
  fill: { color: colors.lightGray },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide3.addText("👥 Senioren & Pflegebedürftige", {
  x: 0.7,
  y: 1.95,
  w: 3.8,
  h: 0.4,
  fontSize: 16,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
});

const customerBenefits = [
  "Einfache Buchung von Alltagsbegleitern",
  "Sicherheit durch zertifizierte Fachkräfte",
  "Kostenlos durch §45b-Versicherung",
  "24/7 Kundensupport auf Deutsch",
];

let y = 2.5;
customerBenefits.forEach((benefit) => {
  slide3.addText("✓ " + benefit, {
    x: 0.9,
    y: y,
    w: 3.6,
    h: 0.35,
    fontSize: 12,
    color: colors.darkText,
    fontFace: "Arial",
  });
  y += 0.5;
});

// Right column - Engel
slide3.addShape(prs.ShapeType.roundRect, {
  x: 5.3,
  y: 1.8,
  w: 4.2,
  h: 3.2,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide3.addText("💪 Zertifizierte Alltagsbegleiter", {
  x: 5.5,
  y: 1.95,
  w: 3.8,
  h: 0.4,
  fontSize: 16,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
});

const engageBenefits = [
  "Flexible Arbeit mit eigenem Zeitplan",
  "Faire Bezahlung pro Einsatz",
  "Einfache Verwaltung von Buchungen",
  "Sichere Zahlungsabwicklung",
];

y = 2.5;
engageBenefits.forEach((benefit) => {
  slide3.addText("✓ " + benefit, {
    x: 5.5,
    y: y,
    w: 3.8,
    h: 0.35,
    fontSize: 12,
    color: colors.cream,
    fontFace: "Arial",
  });
  y += 0.5;
});

// ============ SLIDE 4: MARKET OPPORTUNITY ============
const slide4 = addContentSlide(prs, "Marktpotenzial", "Gigantischer Wachstumsmarkt");

// Market sizing boxes
const marketData = [
  { label: "TAM", value: "€50B+", desc: "Gesamtmarkt Altenpflege" },
  { label: "SAM", value: "€7,44B", desc: "§45b-Budget" },
  { label: "SOM", value: "€150M", desc: "Realistisches Jahr 5 Ziel" },
];

let marketXPos = 0.5;
marketData.forEach((data, idx) => {
  slide4.addShape(prs.ShapeType.roundRect, {
    x: marketXPos,
    y: 1.2,
    w: 3,
    h: 1.5,
    fill: { color: idx === 1 ? colors.gold : colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.1,
    shadow: getShadow(),
  });

  slide4.addText(data.label, {
    x: marketXPos + 0.15,
    y: 1.3,
    w: 2.7,
    h: 0.3,
    fontSize: 12,
    color: idx === 1 ? colors.dark : colors.dark,
    fontFace: "Arial",
    align: "center",
    bold: true,
  });

  slide4.addText(data.value, {
    x: marketXPos + 0.15,
    y: 1.7,
    w: 2.7,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: idx === 1 ? colors.dark : colors.gold,
    fontFace: "Arial Black",
    align: "center",
  });

  slide4.addText(data.desc, {
    x: marketXPos + 0.15,
    y: 2.3,
    w: 2.7,
    h: 0.35,
    fontSize: 11,
    color: colors.darkText,
    fontFace: "Arial",
    align: "center",
    italic: true,
  });

  marketXPos += 3.2;
});

// Market insights
slide4.addText("Markttrends:", {
  x: 0.5,
  y: 3,
  w: 9,
  h: 0.3,
  fontSize: 16,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
});

const trends = [
  "Demografischer Wandel: Zahl der über 65-Jährigen steigt kontinuierlich",
  "Nur 40% des §45b-Budgets wird derzeit genutzt → Massive Wachstumschance",
  "Trend zu häuslicher Betreuung statt Pflegeheim",
  "Fachkräftemangel in traditionellen Agenturen",
];

y = 3.5;
trends.forEach((trend) => {
  slide4.addShape(prs.ShapeType.ellipse, {
    x: 0.6,
    y: y + 0.08,
    w: 0.1,
    h: 0.1,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  slide4.addText(trend, {
    x: 0.95,
    y: y,
    w: 8.55,
    h: 0.28,
    fontSize: 12,
    color: colors.darkText,
    fontFace: "Arial",
  });

  y += 0.5;
});

// ============ SLIDE 5: BUSINESS MODEL ============
const slide5 = addContentSlide(prs, "Geschäftsmodell", "Skalierbar und nachhaltig");

slide5.addText("Mehrere Einnahmequellen:", {
  x: 0.5,
  y: 1.2,
  w: 9,
  h: 0.3,
  fontSize: 16,
  bold: true,
  color: colors.dark,
});

// Revenue streams
const streams = [
  {
    title: "18% Kommission pro Buchung",
    desc: "Verdient auf jede Vermittlung zwischen Kunde und Engel",
    icon: "💰",
  },
  {
    title: "Premium Abos (€9,99/Monat)",
    desc: "Optional für Senioren mit erweiterten Features und Priorität",
    icon: "⭐",
  },
  {
    title: "B2B-Partnerschaften",
    desc: "Integration mit Pflegeeinrichtungen und Versicherungen",
    icon: "🤝",
  },
];

y = 1.7;
streams.forEach((stream) => {
  slide5.addShape(prs.ShapeType.roundRect, {
    x: 0.5,
    y: y,
    w: 9,
    h: 0.9,
    fill: { color: colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.08,
    shadow: getShadow(),
  });

  slide5.addText(stream.icon + " " + stream.title, {
    x: 0.8,
    y: y + 0.08,
    w: 8.4,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: colors.dark,
    fontFace: "Arial Black",
  });

  slide5.addText(stream.desc, {
    x: 0.8,
    y: y + 0.45,
    w: 8.4,
    h: 0.35,
    fontSize: 12,
    color: colors.darkText,
    fontFace: "Arial",
  });

  y += 1.2;
});

// Financial snapshot
slide5.addShape(prs.ShapeType.roundRect, {
  x: 6.5,
  y: 4.3,
  w: 3,
  h: 1,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
  shadow: getShadow(),
});

slide5.addText("Monatliche Betriebskosten", {
  x: 6.7,
  y: 4.4,
  w: 2.6,
  h: 0.3,
  fontSize: 11,
  color: colors.cream,
  fontFace: "Arial",
  align: "center",
});

slide5.addText("~€33.500", {
  x: 6.7,
  y: 4.75,
  w: 2.6,
  h: 0.45,
  fontSize: 24,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "center",
});

// ============ SLIDE 6: PRODUCT & TECHNOLOGY ============
const slide6 = addContentSlide(prs, "Produkt & Technologie", "Modernes Tech-Stack, einfache UX");

slide6.addText("Plattform-Features:", {
  x: 0.5,
  y: 1.2,
  w: 4.5,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
});

const features = [
  "Intelligente Vermittlung",
  "Sichere Kommunikation",
  "Automatische Rechnungsstellung",
  "Bewertungssystem",
  "24/7 Support",
];

y = 1.6;
features.forEach((feature) => {
  slide6.addShape(prs.ShapeType.ellipse, {
    x: 0.6,
    y: y + 0.08,
    w: 0.1,
    h: 0.1,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  slide6.addText(feature, {
    x: 0.95,
    y: y,
    w: 4,
    h: 0.25,
    fontSize: 12,
    color: colors.darkText,
  });

  y += 0.55;
});

slide6.addText("Technologie:", {
  x: 0.5,
  y: 4.1,
  w: 4.5,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
});

const techStack = [
  { label: "Frontend:", value: "React Native (Expo)" },
  { label: "Backend:", value: "Supabase" },
  { label: "Plattformen:", value: "iOS & Android" },
];

y = 4.5;
techStack.forEach((tech) => {
  slide6.addText(tech.label, {
    x: 0.5,
    y: y,
    w: 1.5,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
  });

  slide6.addText(tech.value, {
    x: 2,
    y: y,
    w: 2.8,
    h: 0.25,
    fontSize: 11,
    color: colors.darkText,
  });

  y += 0.35;
});

// Right side - Two-sided marketplace visual
slide6.addShape(prs.ShapeType.roundRect, {
  x: 5.5,
  y: 1,
  w: 4,
  h: 4.3,
  fill: { color: colors.lightGray },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide6.addText("Zwei-Seiten-Marketplace", {
  x: 5.7,
  y: 1.2,
  w: 3.6,
  h: 0.35,
  fontSize: 14,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
  align: "center",
});

// Marketplace diagram
slide6.addShape(prs.ShapeType.roundRect, {
  x: 5.8,
  y: 1.7,
  w: 1.6,
  h: 0.6,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
});

slide6.addText("SENIOREN", {
  x: 5.8,
  y: 1.75,
  w: 1.6,
  h: 0.5,
  fontSize: 11,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// Arrow
slide6.addShape(prs.ShapeType.rect, {
  x: 6.2,
  y: 2.5,
  w: 1.4,
  h: 0.1,
  fill: { color: colors.gold },
  line: { type: "none" },
});

// Marketplace center
slide6.addShape(prs.ShapeType.ellipse, {
  x: 6.2,
  y: 2.75,
  w: 1.4,
  h: 0.7,
  fill: { color: colors.gold },
  line: { type: "none" },
});

slide6.addText("PLATTFORM", {
  x: 6.2,
  y: 2.8,
  w: 1.4,
  h: 0.6,
  fontSize: 10,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// Arrow down
slide6.addShape(prs.ShapeType.rect, {
  x: 6.9,
  y: 3.45,
  w: 0.1,
  h: 0.7,
  fill: { color: colors.gold },
  line: { type: "none" },
});

slide6.addShape(prs.ShapeType.roundRect, {
  x: 5.8,
  y: 4.2,
  w: 1.6,
  h: 0.6,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
});

slide6.addText("ENGEL", {
  x: 5.8,
  y: 4.25,
  w: 1.6,
  h: 0.5,
  fontSize: 11,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// Benefits list on right
slide6.addText("Vorteile der Plattform:", {
  x: 5.8,
  y: 4.95,
  w: 3.6,
  h: 0.25,
  fontSize: 11,
  bold: true,
  color: colors.dark,
});

// ============ SLIDE 7: TRACTION & MILESTONES ============
const slide7 = addContentSlide(prs, "Traktion & Meilensteine", "Entwicklungsstand und Roadmap");

// Current status
slide7.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 1.2,
  w: 4.3,
  h: 1.8,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide7.addText("Aktueller Stand", {
  x: 0.7,
  y: 1.35,
  w: 3.9,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
});

const current = [
  "✓ MVP entwickelt",
  "✓ Team zusammengestellt",
  "✓ Marktvalidierung",
  "✓ Partnerschaften in Planung",
];

y = 1.75;
current.forEach((item) => {
  slide7.addText(item, {
    x: 0.9,
    y: y,
    w: 3.5,
    h: 0.28,
    fontSize: 12,
    color: colors.cream,
    fontFace: "Arial",
  });
  y += 0.35;
});

// Timeline - next 12 months
slide7.addText("Nächste 12 Monate:", {
  x: 5.2,
  y: 1.2,
  w: 4.3,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
});

const timeline = [
  { q: "Q2 2026", items: ["Closed Beta Launch", "Erste Senioren onboarden"] },
  { q: "Q3 2026", items: ["Open Beta in Frankfurt", "Marketing ramp-up"] },
  { q: "Q4 2026", items: ["Expansion zu 2 Städten", "Break-even path"] },
  { q: "Q1 2027", items: ["Series A Vorbereitung", "5 Städte aktiv"] },
];

y = 1.65;
timeline.forEach((period) => {
  slide7.addShape(prs.ShapeType.roundRect, {
    x: 5.2,
    y: y,
    w: 4.3,
    h: 0.75,
    fill: { color: colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.08,
  });

  slide7.addText(period.q, {
    x: 5.4,
    y: y + 0.05,
    w: 0.8,
    h: 0.25,
    fontSize: 12,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
  });

  slide7.addText(period.items.join(" • "), {
    x: 6.3,
    y: y + 0.08,
    w: 3,
    h: 0.6,
    fontSize: 11,
    color: colors.darkText,
    fontFace: "Arial",
  });

  y += 0.85;
});

// Key metrics
slide7.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 3.2,
  w: 9,
  h: 1.9,
  fill: { color: colors.lightGray },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide7.addText("Frühe Erfolgsmetriken", {
  x: 0.8,
  y: 3.35,
  w: 8.4,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
});

const metrics = [
  { label: "Registrierte Nutzer", value: "50+", unit: "" },
  { label: "Abgeschlossene Buchungen", value: "20+", unit: "" },
  { label: "Durchschn. Rating", value: "4,8", unit: "/5" },
  { label: "Customer Satisfaction", value: "95%", unit: "" },
];

let metricXPos = 0.8;
metrics.forEach((metric) => {
  slide7.addText(metric.label, {
    x: metricXPos,
    y: 3.75,
    w: 2,
    h: 0.25,
    fontSize: 10,
    color: colors.darkText,
    fontFace: "Arial",
    align: "center",
  });

  slide7.addText(metric.value, {
    x: metricXPos,
    y: 4.05,
    w: 2,
    h: 0.4,
    fontSize: 20,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "center",
  });

  slide7.addText(metric.unit, {
    x: metricXPos,
    y: 4.45,
    w: 2,
    h: 0.2,
    fontSize: 10,
    color: colors.darkText,
    fontFace: "Arial",
    align: "center",
  });

  metricXPos += 2.25;
});

// ============ SLIDE 8: COMPETITION ============
const slide8 = addContentSlide(prs, "Wettbewerbsanalyse", "Einzigartige Positionierung");

slide8.addText("Vorteile gegenüber Wettbewerbern:", {
  x: 0.5,
  y: 1.2,
  w: 9,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
});

const advantages = [
  {
    title: "vs. Traditionelle Agenturen",
    points: [
      "Digitale Plattform (schneller, transparenter)",
      "Niedrigere Kosten durch Technologie",
      "Bessere Nutzererfahrung",
    ],
  },
  {
    title: "vs. Andere Startups",
    points: [
      "Team mit echter Pflegeerfahrung",
      "Fokus auf §45b-Markt",
      "Deutschland-zentriert (lokale Compliance)",
    ],
  },
];

y = 1.65;
advantages.forEach((category) => {
  slide8.addShape(prs.ShapeType.roundRect, {
    x: 0.5,
    y: y,
    w: 9,
    h: 1.4,
    fill: { color: colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.08,
    shadow: getShadow(),
  });

  slide8.addText(category.title, {
    x: 0.8,
    y: y + 0.1,
    w: 8.4,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: colors.dark,
    fontFace: "Arial Black",
  });

  let innerY = y + 0.45;
  category.points.forEach((point) => {
    slide8.addShape(prs.ShapeType.ellipse, {
      x: 1,
      y: innerY + 0.05,
      w: 0.08,
      h: 0.08,
      fill: { color: colors.gold },
      line: { type: "none" },
    });

    slide8.addText(point, {
      x: 1.25,
      y: innerY,
      w: 7.8,
      h: 0.25,
      fontSize: 11,
      color: colors.darkText,
      fontFace: "Arial",
    });

    innerY += 0.3;
  });

  y += 1.6;
});

// Competitive advantage
slide8.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 4.85,
  w: 9,
  h: 0.65,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
  shadow: getShadow(),
});

slide8.addText("💡 Einzigartige Position: Die einzige Plattform mit Fokus auf §45b-Finanzierung in Deutschland", {
  x: 0.8,
  y: 4.92,
  w: 8.4,
  h: 0.5,
  fontSize: 12,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "left",
  valign: "middle",
});

// ============ SLIDE 9: TEAM ============
const slide9 = addContentSlide(prs, "Unser Team", "Erfahrung, Leidenschaft und Komplementarität");

const team = [
  {
    name: "Yusuf Ferhat Demir",
    role: "Gründer & Geschäftsführer",
    details: "Strategie & Business Development",
  },
  {
    name: "Mehmet Yilmaz",
    role: "CTO",
    details: "Full-Stack Developer, 32 Jahre",
  },
  {
    name: "Laura Leeman",
    role: "Teamleiterin",
    details: "Pflegeerfahrung, Yoga-Zertifikat, EN/DE",
  },
  {
    name: "Sophie Weber",
    role: "Marketing Managerin",
    details: "Social Media & Growth, 26 Jahre",
  },
  {
    name: "Anna Hoffmann",
    role: "Assistenz & Support",
    details: "Kundenbetreuung, 24 Jahre",
  },
];

// Grid layout
let col = 0;
let row = 0;

team.forEach((member, idx) => {
  const xStart = 0.5 + col * 4.6;
  const yStart = 1.2 + row * 1.8;

  slide9.addShape(prs.ShapeType.roundRect, {
    x: xStart,
    y: yStart,
    w: 4.3,
    h: 1.6,
    fill: { color: colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.08,
    shadow: getShadow(),
  });

  slide9.addText(member.name, {
    x: xStart + 0.2,
    y: yStart + 0.1,
    w: 3.9,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: colors.dark,
    fontFace: "Arial Black",
  });

  slide9.addText(member.role, {
    x: xStart + 0.2,
    y: yStart + 0.5,
    w: 3.9,
    h: 0.25,
    fontSize: 11,
    color: colors.gold,
    fontFace: "Arial Black",
    bold: true,
  });

  slide9.addText(member.details, {
    x: xStart + 0.2,
    y: yStart + 0.85,
    w: 3.9,
    h: 0.65,
    fontSize: 10,
    color: colors.darkText,
    fontFace: "Arial",
  });

  col++;
  if (col === 2) {
    col = 0;
    row++;
  }
});

// Gesamtbudget info
slide9.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 4.7,
  w: 9,
  h: 0.75,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
});

slide9.addText("Gesamtes Teambudget: ~€16.000/Monat | Voll motiviert und an der Sache", {
  x: 0.8,
  y: 4.78,
  w: 8.4,
  h: 0.6,
  fontSize: 12,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "left",
  valign: "middle",
});

// ============ SLIDE 10: FINANCIAL PLAN ============
const slide10 = addContentSlide(prs, "Finanzplan", "5-Jahres-Projektion mit ambitioniertem Wachstum");

// Financial data
const years = [
  { year: "Jahr 1", revenue: "€180K", profit: "-€222K", color: colors.lightGray },
  { year: "Jahr 2", revenue: "€720K", profit: "€78K", color: colors.lightGray },
  { year: "Jahr 3", revenue: "€1,8M", profit: "€468K", color: colors.gold },
  { year: "Jahr 4", revenue: "€3,6M", profit: "€1,08M", color: colors.gold },
  { year: "Jahr 5", revenue: "€7,2M", profit: "€2,52M", color: colors.gold },
];

// Create year boxes
let yearXPos = 0.5;
years.forEach((y_data) => {
  slide10.addShape(prs.ShapeType.roundRect, {
    x: yearXPos,
    y: 1.2,
    w: 1.8,
    h: 2.5,
    fill: { color: y_data.color },
    line: { type: "none" },
    rectRadius: 0.08,
    shadow: getShadow(),
  });

  slide10.addText(y_data.year, {
    x: yearXPos + 0.1,
    y: 1.35,
    w: 1.6,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: colors.dark,
    fontFace: "Arial Black",
    align: "center",
  });

  // Revenue
  slide10.addShape(prs.ShapeType.roundRect, {
    x: yearXPos + 0.15,
    y: 1.75,
    w: 1.5,
    h: 0.6,
    fill: { color: colors.dark },
    line: { type: "none" },
    rectRadius: 0.06,
  });

  slide10.addText(y_data.revenue, {
    x: yearXPos + 0.15,
    y: 1.8,
    w: 1.5,
    h: 0.5,
    fontSize: 13,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "center",
    valign: "middle",
  });

  slide10.addText("Umsatz", {
    x: yearXPos + 0.15,
    y: 2.4,
    w: 1.5,
    h: 0.2,
    fontSize: 9,
    color: colors.darkText,
    fontFace: "Arial",
    align: "center",
  });

  // Profit
  slide10.addShape(prs.ShapeType.roundRect, {
    x: yearXPos + 0.15,
    y: 2.7,
    w: 1.5,
    h: 0.6,
    fill: { color: colors.dark },
    line: { type: "none" },
    rectRadius: 0.06,
  });

  slide10.addText(y_data.profit, {
    x: yearXPos + 0.15,
    y: 2.75,
    w: 1.5,
    h: 0.5,
    fontSize: 12,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "center",
    valign: "middle",
  });

  slide10.addText("Netto", {
    x: yearXPos + 0.15,
    y: 3.35,
    w: 1.5,
    h: 0.2,
    fontSize: 9,
    color: colors.darkText,
    fontFace: "Arial",
    align: "center",
  });

  yearXPos += 1.9;
});

// Key financial metrics
slide10.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 3.9,
  w: 9,
  h: 1.5,
  fill: { color: colors.lightGray },
  line: { type: "none" },
  rectRadius: 0.08,
  shadow: getShadow(),
});

slide10.addText("Finanzielle Highlights", {
  x: 0.8,
  y: 4.05,
  w: 8.4,
  h: 0.25,
  fontSize: 13,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
});

const highlights = [
  "Break-even in Jahr 2 (€78K Netto)",
  "Jahr 5: €7,2M Umsatz & €2,52M Netto",
  "Kumulative Profitabilität: €3,48M über 5 Jahre",
  "Weg zur 40% Bruttomarge: Skalierung reduziert Akquisitionskosten",
];

y = 4.4;
highlights.forEach((highlight) => {
  slide10.addShape(prs.ShapeType.ellipse, {
    x: 0.95,
    y: y + 0.08,
    w: 0.1,
    h: 0.1,
    fill: { color: colors.gold },
    line: { type: "none" },
  });

  slide10.addText(highlight, {
    x: 1.3,
    y: y,
    w: 8,
    h: 0.25,
    fontSize: 11,
    color: colors.darkText,
    fontFace: "Arial",
  });

  y += 0.3;
});

// ============ SLIDE 11: FUNDING ASK ============
const slide11 = addContentSlide(prs, "Investitionsrunde", "€500.000 Seed Round");

// Main ask
slide11.addShape(prs.ShapeType.roundRect, {
  x: 1.5,
  y: 1.2,
  w: 7,
  h: 0.8,
  fill: { color: colors.gold },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide11.addText("€500.000", {
  x: 1.7,
  y: 1.35,
  w: 6.6,
  h: 0.5,
  fontSize: 44,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// Use of funds
slide11.addText("Verwendung der Investition:", {
  x: 0.5,
  y: 2.2,
  w: 9,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.dark,
});

const fundAllocation = [
  { item: "Team & Gehälter", percent: "40%", amount: "€200K" },
  { item: "Marketing & Customer Acquisition", percent: "30%", amount: "€150K" },
  { item: "Technologie & Infrastructure", percent: "15%", amount: "€75K" },
  { item: "Betriebsausgaben & Reserven", percent: "15%", amount: "€75K" },
];

y = 2.65;
fundAllocation.forEach((fund) => {
  slide11.addShape(prs.ShapeType.roundRect, {
    x: 0.5,
    y: y,
    w: 9,
    h: 0.55,
    fill: { color: colors.lightGray },
    line: { type: "none" },
    rectRadius: 0.08,
  });

  slide11.addText(fund.item, {
    x: 0.8,
    y: y + 0.08,
    w: 4,
    h: 0.4,
    fontSize: 12,
    bold: true,
    color: colors.dark,
    fontFace: "Arial Black",
  });

  slide11.addText(fund.percent + " — " + fund.amount, {
    x: 7.2,
    y: y + 0.08,
    w: 2.3,
    h: 0.4,
    fontSize: 12,
    bold: true,
    color: colors.gold,
    fontFace: "Arial Black",
    align: "right",
  });

  y += 0.7;
});

// Impact statement
slide11.addShape(prs.ShapeType.roundRect, {
  x: 0.5,
  y: 4.7,
  w: 9,
  h: 0.8,
  fill: { color: colors.dark },
  line: { type: "none" },
  rectRadius: 0.08,
  shadow: getShadow(),
});

slide11.addText("Mit €500K werden wir 5 Millionen Euro Umsatz in 5 Jahren erreichen und 10.000+ Senioren helfen.", {
  x: 0.8,
  y: 4.78,
  w: 8.4,
  h: 0.65,
  fontSize: 12,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// ============ SLIDE 12: CONTACT / CLOSING ============
const slide12 = prs.addSlide();
slide12.background = { color: colors.dark };

// Gold accent bar
slide12.addShape(prs.ShapeType.rect, {
  x: 0,
  y: 0,
  w: 0.15,
  h: 5.625,
  fill: { color: colors.gold },
  line: { type: "none" },
});

// Main content
slide12.addText("Lass uns zusammen die Altenpflege revolutionieren.", {
  x: 0.5,
  y: 1.2,
  w: 9,
  h: 0.7,
  fontSize: 36,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
  align: "left",
});

slide12.addText("Mit Herz für dich da.", {
  x: 0.5,
  y: 2,
  w: 9,
  h: 0.4,
  fontSize: 24,
  color: colors.cream,
  fontFace: "Arial",
  italic: true,
  align: "left",
});

// Contact information
slide12.addText("Kontakt:", {
  x: 0.5,
  y: 2.65,
  w: 9,
  h: 0.3,
  fontSize: 14,
  bold: true,
  color: colors.gold,
  fontFace: "Arial Black",
});

const contactInfo = [
  "Yusuf Ferhat Demir (Gründer & Geschäftsführer)",
  "AlltagsEngel UG (haftungsbeschränkt)",
  "Schiller Str. 31, 60313 Frankfurt am Main",
  "📧 Email: info@alltagsengel.de",
  "🌐 Website: www.alltagsengel.de",
];

y = 3.05;
contactInfo.forEach((info) => {
  slide12.addText(info, {
    x: 0.5,
    y: y,
    w: 9,
    h: 0.25,
    fontSize: 12,
    color: colors.cream,
    fontFace: "Arial",
  });
  y += 0.3;
});

// CTA
slide12.addShape(prs.ShapeType.roundRect, {
  x: 2.5,
  y: 4.4,
  w: 5,
  h: 0.7,
  fill: { color: colors.gold },
  line: { type: "none" },
  rectRadius: 0.1,
  shadow: getShadow(),
});

slide12.addText("Lasst uns ein Gespräch führen", {
  x: 2.5,
  y: 4.45,
  w: 5,
  h: 0.6,
  fontSize: 18,
  bold: true,
  color: colors.dark,
  fontFace: "Arial Black",
  align: "center",
  valign: "middle",
});

// Save presentation
const outputPath =
  "/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room-de/02-pitch-deck/AlltagsEngel-Investor-Pitch-Deck.pptx";
prs.writeFile({ fileName: outputPath });

console.log("✓ Pitch Deck erfolgreich erstellt: " + outputPath);
