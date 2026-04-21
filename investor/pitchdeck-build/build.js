// AlltagsEngel — Investor Pitch Deck
// Zielgruppe: ProCare Deutschland (Timo Scharpenberg) + PROLIFE homecare (Stefan Pickl)
// Pre-Seed 1,0 Mio EUR | Frankfurt → Köln → Düsseldorf

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaHeart, FaHandsHelping, FaMobileAlt, FaEuroSign, FaChartLine, FaMapMarkedAlt,
  FaUsers, FaRocket, FaShieldAlt, FaStar, FaBuilding, FaHandshake, FaPhone,
  FaCheckCircle, FaExclamationTriangle, FaLightbulb, FaClock, FaCar,
  FaBoxOpen, FaCalendarAlt, FaUserMd, FaHome, FaStethoscope, FaUserTie,
  FaCogs, FaBullseye, FaCrown
} = require("react-icons/fa");

// ═══════════════════════════════════════════════════════════
// BRAND PALETTE — AlltagsEngel Premium
// ═══════════════════════════════════════════════════════════
const COAL     = "1A1612";   // Deep charcoal (primary dark)
const COAL_2   = "2A241D";   // Softer charcoal
const CREAM    = "F5EFE6";   // Warm cream (light bg)
const CREAM_2  = "FAF6EF";   // Softer cream
const GOLD     = "C9A24B";   // Signature gold
const GOLD_LT  = "E0C687";   // Light gold
const ROSE     = "B85042";   // Warm terracotta accent
const SAGE     = "7A8B73";   // Sage (supportive)
const MUTED    = "8A7F6E";   // Muted text
const WHITE    = "FFFFFF";

// Fonts (stable: Georgia = pre-installed on all Windows/Mac PowerPoint)
const FONT_H = "Georgia";
const FONT_B = "Calibri";

// ═══════════════════════════════════════════════════════════
// ICON HELPERS
// ═══════════════════════════════════════════════════════════
function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconToBase64Png(IconComponent, color, size = 512) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5"
  pres.author = "AlltagsEngel UG";
  pres.title = "AlltagsEngel — Investor Pitch Deck";
  pres.company = "AlltagsEngel";

  const W = 13.333;
  const H = 7.5;

  // Pre-render icons we'll reuse (as base64 pngs)
  const ic = {};
  const iconSet = {
    heart:    [FaHeart, `#${GOLD}`],
    hands:    [FaHandsHelping, `#${GOLD}`],
    mobile:   [FaMobileAlt, `#${GOLD}`],
    euro:     [FaEuroSign, `#${GOLD}`],
    chart:    [FaChartLine, `#${GOLD}`],
    map:      [FaMapMarkedAlt, `#${GOLD}`],
    users:    [FaUsers, `#${GOLD}`],
    rocket:   [FaRocket, `#${GOLD}`],
    shield:   [FaShieldAlt, `#${GOLD}`],
    star:     [FaStar, `#${GOLD}`],
    building: [FaBuilding, `#${GOLD}`],
    shake:    [FaHandshake, `#${GOLD}`],
    phone:    [FaPhone, `#${GOLD}`],
    check:    [FaCheckCircle, `#${GOLD}`],
    warn:     [FaExclamationTriangle, `#${ROSE}`],
    bulb:     [FaLightbulb, `#${GOLD}`],
    clock:    [FaClock, `#${GOLD}`],
    car:      [FaCar, `#${GOLD}`],
    box:      [FaBoxOpen, `#${GOLD}`],
    cal:      [FaCalendarAlt, `#${GOLD}`],
    userMd:   [FaUserMd, `#${GOLD}`],
    home:     [FaHome, `#${GOLD}`],
    stetho:   [FaStethoscope, `#${GOLD}`],
    tie:      [FaUserTie, `#${GOLD}`],
    cogs:     [FaCogs, `#${GOLD}`],
    bull:     [FaBullseye, `#${GOLD}`],
    crown:    [FaCrown, `#${GOLD}`],
    // Light variants for dark backgrounds
    heart_l:  [FaHeart, `#${CREAM}`],
    star_l:   [FaStar, `#${CREAM}`],
    check_l:  [FaCheckCircle, `#${CREAM}`],
    shake_l:  [FaHandshake, `#${CREAM}`],
  };
  for (const [key, [Icon, color]] of Object.entries(iconSet)) {
    ic[key] = await iconToBase64Png(Icon, color, 512);
  }

  // ═══════════════════════════════════════════════════════════
  // APP-ICONS (Gold-Gradient wie in der AlltagsEngel-App)
  // Quelle: components/Icons.tsx
  // ═══════════════════════════════════════════════════════════
  const GOLD_GRAD = `
    <defs>
      <linearGradient id="g1" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#F8E064"/>
        <stop offset="45%" stop-color="#DBA84A"/>
        <stop offset="100%" stop-color="#B8882E"/>
      </linearGradient>
      <linearGradient id="g1L" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#FCF0A0"/>
        <stop offset="50%" stop-color="#E8C850"/>
        <stop offset="100%" stop-color="#C9963C"/>
      </linearGradient>
    </defs>`;
  const appSvg = (inner, size = 512) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${GOLD_GRAD}${inner}</svg>`;

  // App-Icons als SVG-Strings (Gold-Variante)
  const appIcons = {
    // IconKrankenfahrtGold - Krankenwagen
    app_car:
      `<rect x="1" y="10" width="15" height="8" rx="1.5" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M16 13h4.5l2.5 3v2h-7v-5z" fill="url(#g1L)" stroke="#A07428" stroke-width="0.4"/>
       <circle cx="5.5" cy="19.5" r="2" fill="url(#g1)" stroke="#A07428" stroke-width="0.5"/>
       <circle cx="18.5" cy="19.5" r="2" fill="url(#g1)" stroke="#A07428" stroke-width="0.5"/>
       <path d="M8.5 13v4M6.5 15h4" fill="none" stroke="#1A1612" stroke-width="2" stroke-linecap="round"/>`,
    // IconHygieneboxGold - Pflegebox
    app_box:
      `<rect x="2" y="9" width="20" height="12" rx="2" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <rect x="1" y="5" width="22" height="5" rx="1.5" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M10 5V3.5a2 2 0 014 0V5" fill="none" stroke="#A07428" stroke-width="1.2" stroke-linecap="round"/>
       <path d="M9 14.5l2 2 4-4" fill="none" stroke="#1A1612" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    // IconWingsGold - Engel mit Heiligenschein
    app_angel:
      `<circle cx="12" cy="5.5" r="3.2" fill="url(#g1)"/>
       <path d="M12 8.5c-4 0-6.5 2-7.5 5.5 1 2.5 4 4 7.5 4s6.5-1.5 7.5-4c-1-3.5-3.5-5.5-7.5-5.5z" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M4.5 8.5C2.5 9.5 1.5 12 2.5 15" fill="none" stroke="url(#g1L)" stroke-width="2" stroke-linecap="round"/>
       <path d="M19.5 8.5c2 1 3 3.5 2 6.5" fill="none" stroke="url(#g1L)" stroke-width="2" stroke-linecap="round"/>
       <circle cx="12" cy="5.5" r="1.2" fill="url(#g1L)" opacity="0.6"/>`,
    // IconMedicalGold - Arzt/Kreuz (für Kunde)
    app_med:
      `<rect x="3" y="3" width="18" height="18" rx="4" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M12 7.5v9M7.5 12h9" fill="none" stroke="#1A1612" stroke-width="2.2" stroke-linecap="round"/>`,
    // IconHandshakeGold
    app_shake:
      `<path d="M2 12a5 5 0 015-5h2l3 3 3-3h2a5 5 0 015 5v0a5 5 0 01-5 5H7a5 5 0 01-5-5z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M7.5 11.5l3 3L16.5 8.5" fill="none" stroke="#1A1612" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    // IconHomeGold
    app_home:
      `<path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4" stroke-linejoin="round"/>
       <rect x="9" y="14" width="6" height="7.5" rx="0.5" fill="#1A1612"/>`,
    // IconStarGold
    app_star:
      `<path d="M12 2l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17l-5.8 2.9 1.1-6.47L2.6 8.85l6.5-.95z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4" stroke-linejoin="round"/>`,
    // Person (Founder-Silhouette) — clean bust im Gold-Gradient
    app_tie:
      `<circle cx="12" cy="7.5" r="3.8" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M4.5 20.5c0-4.2 3.4-7.5 7.5-7.5s7.5 3.3 7.5 7.5v.5h-15v-.5z" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>`,
    // Hand mit Herz — abgeleitet aus public/assets/hilfe-icon.svg
    app_hand:
      `<path d="M12 6.5c-.6-.7-1.6-1.2-2.6-1.2-1.7 0-3 1.3-3 3 0 2.5 2.4 4.4 5.6 6.6 3.2-2.2 5.6-4.1 5.6-6.6 0-1.7-1.3-3-3-3-1 0-2 .5-2.6 1.2z" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M5.5 14.5c-.5.4-1 1.1-1 2 0 .6.4 1 1 1h4l3.5 2.5c.5.3 1 .3 1.5 0l3-2c.5-.3.5-1 0-1.4l-3-2c-.5-.3-1.2-.4-1.7-.1l-1.3.6c-.5-.7-1.5-1.2-2.5-1.2-.7 0-1.4.2-2 .6l-1.5 0z" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>`,
    // Krone — Premium-Abo / Crown
    app_premium:
      `<path d="M3 8.5l3 4 3-6 3 5 3-5 3 6 3-4-1.5 9h-15z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4" stroke-linejoin="round"/>
       <rect x="4.5" y="18" width="15" height="2.5" rx="0.4" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>
       <circle cx="12" cy="6.5" r="1" fill="url(#g1L)"/>
       <circle cx="6" cy="8" r="0.8" fill="url(#g1L)"/>
       <circle cx="18" cy="8" r="0.8" fill="url(#g1L)"/>`,
    // 3 Personen — Users / Markt
    app_users:
      `<circle cx="8" cy="8" r="2.5" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <circle cx="16" cy="8" r="2.5" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <circle cx="12" cy="6" r="2.8" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M3 19c.5-3 2.5-5 5-5s4.5 2 5 5" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M11 19c.5-3 2.5-5 5-5s4.5 2 5 5" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <path d="M6 21c1-4 3.5-6 6-6s5 2 6 6" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>`,
    // Trend-Chart nach oben
    app_chart:
      `<rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="#A07428" stroke-width="0.6"/>
       <path d="M5 17l4-5 3 3 6-8" fill="none" stroke="url(#g1)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="5" cy="17" r="1" fill="url(#g1L)"/>
       <circle cx="9" cy="12" r="1" fill="url(#g1L)"/>
       <circle cx="12" cy="15" r="1" fill="url(#g1L)"/>
       <circle cx="18" cy="7" r="1.3" fill="url(#g1L)"/>`,
    // Map-Pin — Standort
    app_map:
      `<path d="M12 2c-3.9 0-7 3-7 6.8 0 5 7 13.2 7 13.2s7-8.2 7-13.2c0-3.8-3.1-6.8-7-6.8z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <circle cx="12" cy="9" r="2.8" fill="url(#g1L)" stroke="#A07428" stroke-width="0.3"/>`,
    // Euro
    app_euro:
      `<circle cx="12" cy="12" r="10" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M16 8.5c-1-1-2.3-1.5-3.7-1.5-2.5 0-4.5 1.8-5 4.5h-1m9.7 4.5c-1 1-2.3 1.5-3.7 1.5-2.5 0-4.5-1.8-5-4.5h-1m1.5-2.5h6m-6 1.5h6" fill="none" stroke="#1A1612" stroke-width="1.6" stroke-linecap="round"/>`,
    // Smartphone
    app_mobile:
      `<rect x="6" y="2" width="12" height="20" rx="2.4" fill="url(#g1)" stroke="#A07428" stroke-width="0.5"/>
       <rect x="7.4" y="4" width="9.2" height="14" rx="0.5" fill="#1A1612"/>
       <circle cx="12" cy="20" r="0.7" fill="#1A1612"/>
       <rect x="9" y="6.5" width="6" height="0.8" rx="0.2" fill="url(#g1L)"/>
       <rect x="9" y="9" width="6" height="0.8" rx="0.2" fill="url(#g1L)" opacity="0.7"/>
       <rect x="9" y="11.5" width="4" height="0.8" rx="0.2" fill="url(#g1L)" opacity="0.5"/>`,
    // Häkchen — Gold-Variante
    app_check:
      `<circle cx="12" cy="12" r="10" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#1A1612" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Häkchen — Creme-Variante (für dunkle Backgrounds)
    app_check_l:
      `<circle cx="12" cy="12" r="10" fill="url(#g1L)" stroke="#F5EFE6" stroke-width="0.6"/>
       <path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#1A1612" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Uhr
    app_clock:
      `<circle cx="12" cy="12" r="10" fill="url(#g1)" stroke="#A07428" stroke-width="0.4"/>
       <path d="M12 6v6l4 2.5" fill="none" stroke="#1A1612" stroke-width="2" stroke-linecap="round"/>
       <circle cx="12" cy="12" r="0.9" fill="#1A1612"/>`,
    // Zahnrad
    app_cogs:
      `<path d="M12 2l1.6 2.4 2.8-.8 1 2.7 2.8.6-.4 2.9 2.2 1.8-1.6 2.4 1 2.7-2.7 1.1.4 2.9-2.9.4-1 2.7-2.8-.8L12 22l-1.6-2.4-2.8.8-1-2.7-2.8-.6.4-2.9L2 12.2l1.6-2.4-1-2.7L5.3 6 4.9 3.1l2.9-.4 1-2.7 2.8.8z" fill="url(#g1)" stroke="#A07428" stroke-width="0.3"/>
       <circle cx="12" cy="12" r="3.5" fill="url(#g1L)" stroke="#A07428" stroke-width="0.4"/>
       <circle cx="12" cy="12" r="1.6" fill="#1A1612"/>`,
    // Telefon-Hörer
    app_phone:
      `<path d="M5 3.5C5 2.7 5.7 2 6.5 2h3c.7 0 1.3.5 1.4 1.2l.6 3.4c.1.6-.2 1.2-.7 1.5l-2 1.3c1.4 2.7 3.6 5 6.3 6.4l1.3-2.1c.3-.5.9-.8 1.5-.7l3.4.6c.7.1 1.2.7 1.2 1.4v3c0 .8-.7 1.5-1.5 1.5C10.4 20 4 13.6 4 5c-.5-.5-.5-1 1-1.5z" fill="url(#g1)" stroke="#A07428" stroke-width="0.4" stroke-linejoin="round"/>`,
  };
  for (const [key, inner] of Object.entries(appIcons)) {
    const svg = appSvg(inner, 512);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    ic[key] = "image/png;base64," + pngBuffer.toString("base64");
  }

  // ═══════════════════════════════════════════════════════════
  // ALIAS-MAPPING: Alle FontAwesome-Generic-Icons im Slide-Code
  // werden auf die echten App-Icons (Gold-Gradient) umgemappt.
  // So muss kein einzelner Slide-Aufruf angepasst werden, und das
  // Pitch Deck nutzt durchgängig die AlltagsEngel-Bildsprache.
  // ic.warn bleibt rot (semantisch sinnvoll für Probleme).
  // ═══════════════════════════════════════════════════════════
  ic.hands     = ic.app_hand;
  ic.heart     = ic.app_hand;
  ic.heart_l   = ic.app_check_l;
  ic.users     = ic.app_users;
  ic.chart     = ic.app_chart;
  ic.map       = ic.app_map;
  ic.euro      = ic.app_euro;
  ic.mobile    = ic.app_mobile;
  ic.check     = ic.app_check;
  ic.check_l   = ic.app_check_l;
  ic.clock     = ic.app_clock;
  ic.cogs      = ic.app_cogs;
  ic.phone     = ic.app_phone;
  ic.crown     = ic.app_premium;
  ic.cal       = ic.app_premium;
  ic.shake     = ic.app_shake;
  ic.shake_l   = ic.app_shake;
  ic.star      = ic.app_star;
  ic.star_l    = ic.app_star;
  ic.shield    = ic.app_med;
  ic.bull      = ic.app_star;
  ic.tie       = ic.app_tie;
  ic.home      = ic.app_home;
  ic.box       = ic.app_box;
  ic.car       = ic.app_car;
  ic.userMd    = ic.app_med;
  ic.stetho    = ic.app_med;
  ic.building  = ic.app_home;
  ic.bulb      = ic.app_premium;
  ic.rocket    = ic.app_premium;

  // ═══════════════════════════════════════════════════════════
  // REUSABLE ELEMENTS
  // ═══════════════════════════════════════════════════════════
  function addFooter(slide, pageNum, total) {
    // Thin gold line near bottom
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: H - 0.4, w: 0.6, h: 0.02,
      fill: { color: GOLD }, line: { type: "none" }
    });
    slide.addText("ALLTAGSENGEL", {
      x: 1.25, y: H - 0.55, w: 3, h: 0.3,
      fontFace: FONT_B, fontSize: 9, color: MUTED, bold: true,
      charSpacing: 4, margin: 0
    });
    slide.addText(`${pageNum} / ${total}`, {
      x: W - 1.3, y: H - 0.55, w: 0.8, h: 0.3,
      fontFace: FONT_B, fontSize: 9, color: MUTED, align: "right", margin: 0
    });
  }

  // Logo-Mark (Engel) oben rechts auf jeder Slide — Brand-Signatur
  function addBrandLogo(slide) {
    slide.addImage({ path: "logo-mark.png", x: W - 1.3, y: 0.3, w: 0.85, h: 0.47 });
  }

  function addEyebrow(slide, text, y = 0.55) {
    slide.addText(text, {
      x: 0.7, y, w: 8, h: 0.3,
      fontFace: FONT_B, fontSize: 11, color: GOLD, bold: true,
      charSpacing: 6, margin: 0
    });
  }

  function addTitle(slide, text, opts = {}) {
    slide.addText(text, {
      x: 0.7, y: 0.95, w: 12, h: 1.1,
      fontFace: FONT_H, fontSize: 38, color: COAL, bold: false,
      margin: 0, ...opts
    });
  }

  const totalSlides = 14;

  // ═══════════════════════════════════════════════════════════
  // SLIDE 1 — COVER
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: COAL };

    // Gold accent bar (left side)
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: H,
      fill: { color: GOLD }, line: { type: "none" }
    });

    // Decorative gold ring (large, right side)
    s.addShape(pres.shapes.OVAL, {
      x: W - 4.5, y: -1.5, w: 6, h: 6,
      fill: { color: GOLD, transparency: 85 }, line: { type: "none" }
    });
    s.addShape(pres.shapes.OVAL, {
      x: W - 3.5, y: 4.5, w: 4, h: 4,
      fill: { color: ROSE, transparency: 88 }, line: { type: "none" }
    });

    // Eyebrow
    s.addText("INVESTOR PITCH | PRE-SEED 2026", {
      x: 0.8, y: 0.8, w: 8, h: 0.4,
      fontFace: FONT_B, fontSize: 12, color: GOLD, bold: true,
      charSpacing: 8, margin: 0
    });

    // Official AlltagsEngel Logo-Mark (Engel mit Heiligenschein, gold auf schwarz)
    s.addImage({ path: "logo-mark.png", x: 0.8, y: 1.4, w: 1.6, h: 0.88 });

    // Main title
    s.addText("AlltagsEngel", {
      x: 0.8, y: 2.5, w: 12, h: 1.4,
      fontFace: FONT_H, fontSize: 80, color: CREAM, italic: false,
      margin: 0
    });

    // Tagline
    s.addText("Die digitale Alltagshilfe für Deutschlands 5 Mio. Pflegebedürftige.", {
      x: 0.8, y: 3.9, w: 12, h: 0.8,
      fontFace: FONT_H, fontSize: 28, color: CREAM_2, italic: false,
      margin: 0
    });

    // Sub-tagline
    s.addText("§45b SGB XI · Krankenfahrten · Pflegeboxen · Monats-Abo", {
      x: 0.8, y: 4.8, w: 12, h: 0.5,
      fontFace: FONT_B, fontSize: 16, color: GOLD_LT, margin: 0,
      charSpacing: 3
    });

    // Bottom block
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.8, y: H - 1.6, w: 0.3, h: 0.02,
      fill: { color: GOLD }, line: { type: "none" }
    });
    s.addText([
      { text: "Yusuf Ferhat Demir", options: { bold: true, color: CREAM, breakLine: true } },
      { text: "Gründer & CEO · AlltagsEngel UG (haftungsbeschränkt) · HRB 140351", options: { color: MUTED } }
    ], {
      x: 0.8, y: H - 1.4, w: 8, h: 0.9, fontFace: FONT_B, fontSize: 14, margin: 0
    });

    s.addText("Vertraulich | Frankfurt · April 2026", {
      x: W - 4.5, y: H - 0.9, w: 4, h: 0.3,
      fontFace: FONT_B, fontSize: 10, color: MUTED, align: "right",
      charSpacing: 3, margin: 0
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 2 — DAS PROBLEM
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "DAS PROBLEM");
    addTitle(s, "131 € im Monat. Jeden Monat. Ungenutzt.");

    s.addText(
      "Jeder der 5,2 Mio. Pflegebedürftigen in Deutschland hat Anspruch auf §45b SGB XI — 131 € monatlich für Alltagshilfen von der Kasse bezahlt. Doch über 60 % verfallen Jahr für Jahr ungenutzt.",
      { x: 0.7, y: 2.15, w: 11.9, h: 1.1,
        fontFace: FONT_B, fontSize: 15, color: COAL_2, margin: 0 }
    );

    // 3 problem cards
    const cardY = 3.55;
    const cardH = 3.1;
    const cardW = 3.9;
    const gap = 0.2;
    const startX = 0.7;

    const cards = [
      {
        icon: ic.warn,
        num: "60%",
        title: "Verfallsquote §45b",
        body: "Leistungen werden nicht abgerufen — zu komplex, zu bürokratisch, keine digitale Schnittstelle."
      },
      {
        icon: ic.clock,
        num: "3–6 Wo.",
        title: "Wartezeit auf Hilfe",
        body: "Traditionelle Pflegedienste haben Wartelisten. Angehörige sind verzweifelt, Kunden allein."
      },
      {
        icon: ic.cogs,
        num: "∞",
        title: "Fragmentiertes System",
        body: "Kasse, Sanitätshaus, Fahrdienst, Hilfe, Box — alles getrennt. Ein Chaos für pflegende Angehörige."
      }
    ];

    cards.forEach((c, i) => {
      const x = startX + i * (cardW + gap);
      // Card shadow bg
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: cardY, w: cardW, h: cardH,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.75 },
        shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 }
      });
      // Gold top accent bar
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: cardY, w: cardW, h: 0.08,
        fill: { color: GOLD }, line: { type: "none" }
      });
      // Icon
      s.addImage({ data: c.icon, x: x + 0.4, y: cardY + 0.4, w: 0.6, h: 0.6 });
      // Big number
      s.addText(c.num, {
        x: x + 0.4, y: cardY + 1.15, w: cardW - 0.8, h: 0.8,
        fontFace: FONT_H, fontSize: 48, color: COAL, bold: true, margin: 0
      });
      // Title
      s.addText(c.title, {
        x: x + 0.4, y: cardY + 1.95, w: cardW - 0.8, h: 0.4,
        fontFace: FONT_B, fontSize: 14, color: ROSE, bold: true,
        charSpacing: 2, margin: 0
      });
      // Body
      s.addText(c.body, {
        x: x + 0.4, y: cardY + 2.35, w: cardW - 0.8, h: 0.7,
        fontFace: FONT_B, fontSize: 11, color: MUTED, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 2, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 3 — DIE LÖSUNG
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "UNSERE LÖSUNG");
    addTitle(s, "Eine App. Ein Login. Alles für Alltag und Entlastung.");

    // Left: big phone visual area (placeholder rectangle)
    const phoneX = 0.7, phoneY = 2.3, phoneW = 3.4, phoneH = 4.7;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: phoneX, y: phoneY, w: phoneW, h: phoneH,
      fill: { color: COAL }, line: { color: GOLD, width: 2 },
      rectRadius: 0.25
    });
    // Screen inside
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: phoneX + 0.15, y: phoneY + 0.3, w: phoneW - 0.3, h: phoneH - 0.6,
      fill: { color: CREAM_2 }, line: { type: "none" }, rectRadius: 0.1
    });
    s.addImage({ data: ic.app_angel, x: phoneX + phoneW/2 - 0.4, y: phoneY + 0.7, w: 0.8, h: 0.8 });
    s.addText("AlltagsEngel", {
      x: phoneX, y: phoneY + 1.65, w: phoneW, h: 0.4,
      fontFace: FONT_H, fontSize: 20, color: COAL, italic: false, align: "center", margin: 0
    });
    s.addText("Hilfe · Fahrt · Pflegebox", {
      x: phoneX, y: phoneY + 2.1, w: phoneW, h: 0.3,
      fontFace: FONT_B, fontSize: 11, color: MUTED, align: "center", margin: 0
    });
    // Mini tiles in the phone
    ["Engel finden", "Krankenfahrt", "Pflegebox", "Abrechnen"].forEach((label, i) => {
      const r = Math.floor(i / 2);
      const c = i % 2;
      const tx = phoneX + 0.4 + c * 1.25;
      const ty = phoneY + 2.65 + r * 0.85;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: tx, y: ty, w: 1.1, h: 0.7,
        fill: { color: GOLD, transparency: 85 },
        line: { color: GOLD, width: 0.5 }, rectRadius: 0.08
      });
      s.addText(label, {
        x: tx, y: ty + 0.1, w: 1.1, h: 0.5,
        fontFace: FONT_B, fontSize: 9, color: COAL, bold: true, align: "center", valign: "middle", margin: 0
      });
    });

    // Right: 4 feature rows
    const featX = 4.7;
    const features = [
      { icon: ic.hands, t: "Alltagshilfen nach §45b", b: "Vom Einkaufen bis zum Arzttermin — zertifizierte Engel, direkt in der App gebucht und von der Kasse abgerechnet." },
      { icon: ic.app_car,   t: "Krankenfahrten & Taxi", b: "Zum Arzt, zur Reha, zur Dialyse. Rezept hochladen, Fahrt buchen, AlltagsEngel kümmert sich um die Abrechnung." },
      { icon: ic.app_box,   t: "Pflegeboxen (§40)",     b: "42 €/Monat Pflegehilfsmittel-Pauschale — automatischer Monatsversand, kein Papierkram für die Angehörigen." },
      { icon: ic.cal,   t: "Monats-Abo Premium",    b: "Koordinierter Komplett-Service mit festem Engel, Priorisierung und persönlichem Care-Manager." },
    ];
    features.forEach((f, i) => {
      const y = 2.3 + i * 1.1;
      // Gold icon circle
      s.addShape(pres.shapes.OVAL, {
        x: featX, y, w: 0.85, h: 0.85,
        fill: { color: GOLD, transparency: 80 }, line: { color: GOLD, width: 1 }
      });
      s.addImage({ data: f.icon, x: featX + 0.17, y: y + 0.17, w: 0.5, h: 0.5 });
      // Title
      s.addText(f.t, {
        x: featX + 1.05, y: y, w: 7.3, h: 0.4,
        fontFace: FONT_H, fontSize: 18, color: COAL, bold: false, margin: 0
      });
      // Body
      s.addText(f.b, {
        x: featX + 1.05, y: y + 0.42, w: 7.3, h: 0.7,
        fontFace: FONT_B, fontSize: 11.5, color: COAL_2, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 3, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 4 — WARUM JETZT
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "WARUM JETZT");
    addTitle(s, "Der perfekte Moment — demografisch, digital, regulatorisch.");

    // 4 big stat callouts
    const stats = [
      { num: "5,2 Mio.",  lbl: "Pflegebedürftige in Deutschland 2025", ic: ic.users },
      { num: "+7,6 Mrd €", lbl: "Jährliches §45b-Budget (60 % verfällt)", ic: ic.euro },
      { num: "79 %",      lbl: "der 65+ smartphone-affin (Bitkom 2025)", ic: ic.mobile },
      { num: "+24 %",     lbl: "Pflegebedürftige bis 2030 (Destatis)",    ic: ic.chart },
    ];
    stats.forEach((s2, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.7 + col * 6.2;
      const y = 2.35 + row * 2.3;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 5.95, h: 2.05,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.75 },
        shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.06 }
      });
      // Left gold bar
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 0.09, h: 2.05, fill: { color: GOLD }, line: { type: "none" }
      });
      // Icon
      s.addImage({ data: s2.ic, x: x + 0.4, y: y + 0.35, w: 0.7, h: 0.7 });
      // Number
      s.addText(s2.num, {
        x: x + 1.35, y: y + 0.25, w: 4.4, h: 0.95,
        fontFace: FONT_H, fontSize: 44, color: COAL, bold: true, margin: 0
      });
      // Label
      s.addText(s2.lbl, {
        x: x + 1.35, y: y + 1.2, w: 4.4, h: 0.7,
        fontFace: FONT_B, fontSize: 12, color: MUTED, margin: 0
      });
    });

    // (Quote entfernt — verursachte Overlap mit Stat-Karten)
    addBrandLogo(s);
    addFooter(s, 4, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 5 — PRODUKT (Drei Zielgruppen)
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "DAS PRODUKT");
    addTitle(s, "Eine Plattform, drei Rollen, vollständig integriert.");

    const cols = [
      {
        title: "Kunde",
        sub: "Pflegebedürftige & Angehörige",
        icon: ic.app_med,
        bullets: [
          "Engel finden & buchen",
          "Krankenfahrten beantragen",
          "Pflegebox monatlich",
          "Rezepte hochladen",
          "Chat mit Care-Manager"
        ]
      },
      {
        title: "Engel",
        sub: "Alltagshelfer & Engel",
        icon: ic.app_angel,
        bullets: [
          "Aufträge im Umkreis",
          "Kalender-Integration",
          "Automatische Abrechnung",
          "Verified-Badge System",
          "20–25 €/h ab Tag 1"
        ]
      },
      {
        title: "Fahrer",
        sub: "Krankentransport-Partner",
        icon: ic.app_car,
        bullets: [
          "Rezept-basiertes Matching",
          "GPS-Routing",
          "Kassen-Direktabrechnung",
          "Fahrzeug-Verwaltung",
          "Tour-Optimierung"
        ]
      },
    ];

    const colW = 3.9, colH = 4.0, gap = 0.15;
    cols.forEach((c, i) => {
      const x = 0.7 + i * (colW + gap);
      const y = 2.25;
      // Card
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: colW, h: colH,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.75 },
        shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 }
      });
      // Top dark header band
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: colW, h: 1.2, fill: { color: COAL }, line: { type: "none" }
      });
      // Icon
      s.addImage({ data: c.icon, x: x + colW/2 - 0.35, y: y + 0.2, w: 0.7, h: 0.7 });
      // Role name
      s.addText(c.title, {
        x, y: y + 0.9, w: colW, h: 0.35,
        fontFace: FONT_H, fontSize: 20, color: GOLD_LT, italic: false, align: "center", margin: 0
      });
      s.addText(c.sub, {
        x, y: y + 1.25, w: colW, h: 0.3,
        fontFace: FONT_B, fontSize: 10.5, color: MUTED, align: "center",
        charSpacing: 2, margin: 0
      });
      // Bullets — jede Zeile mit eigenem bullet:true
      const bulletText = c.bullets.map((b, idx) => ({
        text: b,
        options: { bullet: { code: "25CF", indent: 12 }, breakLine: idx < c.bullets.length - 1 }
      }));
      s.addText(bulletText, {
        x: x + 0.4, y: y + 1.75, w: colW - 0.8, h: 2.1,
        fontFace: FONT_B, fontSize: 11.5, color: COAL_2,
        paraSpaceAfter: 4, margin: 0
      });
    });

    // Bottom integration line (höher gesetzt, damit nicht mit Footer überlappt)
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 6.45, w: 11.9, h: 0.45,
      fill: { color: GOLD, transparency: 80 }, line: { type: "none" }
    });
    s.addText("INTEGRIERT: Ein Kunde bucht Engel + Fahrt + Box in einem Flow — alles abgerechnet über eine Schnittstelle.", {
      x: 0.9, y: 6.45, w: 11.5, h: 0.45,
      fontFace: FONT_B, fontSize: 12, color: COAL, bold: true, valign: "middle",
      charSpacing: 2, margin: 0
    });

    addBrandLogo(s);
    addFooter(s, 5, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 6 — BUSINESS MODEL (4 Revenue Streams)
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "GESCHÄFTSMODELL");
    addTitle(s, "Vier Einnahmequellen. Alle wiederkehrend.");

    const streams = [
      { icon: ic.hands, t: "Alltagshilfen §45b", price: "32,50 €/h", sub: "Kasse zahlt · Engel bekommt 20–25 € · Marge ~7,50 €", pct: "50%" },
      { icon: ic.app_car,   t: "Krankenfahrten",    price: "~8 €/Fahrt", sub: "Pauschale auf Kassen-Erstattung · skalierbar mit Flotte", pct: "25%" },
      { icon: ic.app_box,   t: "Pflegeboxen §40",   price: "~12 €/Box", sub: "42 € Kassen-Pauschale · Partner-Modell mit ProCare", pct: "15%" },
      { icon: ic.crown, t: "Premium-Abo",       price: "29–49 €/Mo", sub: "Direktzahlung · Familie · Priorität · persönl. Manager", pct: "10%" },
    ];

    streams.forEach((r, i) => {
      const y = 2.25 + i * 0.95;
      // Row bg
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.7, y, w: 11.9, h: 0.85,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.5 },
        shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 90, opacity: 0.05 }
      });
      // Icon circle
      s.addShape(pres.shapes.OVAL, {
        x: 0.95, y: y + 0.15, w: 0.7, h: 0.7,
        fill: { color: GOLD, transparency: 80 }, line: { color: GOLD, width: 1 }
      });
      s.addImage({ data: r.icon, x: 1.05, y: y + 0.25, w: 0.5, h: 0.5 });
      // Title
      s.addText(r.t, {
        x: 1.85, y: y + 0.12, w: 4, h: 0.4,
        fontFace: FONT_H, fontSize: 20, color: COAL, margin: 0
      });
      s.addText(r.sub, {
        x: 1.85, y: y + 0.52, w: 7.5, h: 0.4,
        fontFace: FONT_B, fontSize: 10.5, color: MUTED, margin: 0
      });
      // Price
      s.addText(r.price, {
        x: 9.5, y: y + 0.12, w: 2, h: 0.4,
        fontFace: FONT_B, fontSize: 14, color: COAL, bold: true, align: "right", margin: 0
      });
      // % bar
      s.addShape(pres.shapes.RECTANGLE, {
        x: 9.5, y: y + 0.6, w: 2.9, h: 0.18,
        fill: { color: "EAE3D4" }, line: { type: "none" }
      });
      const pctNum = parseInt(r.pct);
      s.addShape(pres.shapes.RECTANGLE, {
        x: 9.5, y: y + 0.6, w: 2.9 * (pctNum/100), h: 0.18,
        fill: { color: GOLD }, line: { type: "none" }
      });
      s.addText(`${r.pct} vom Umsatz`, {
        x: 11.6, y: y + 0.55, w: 1, h: 0.3,
        fontFace: FONT_B, fontSize: 9, color: MUTED, align: "right", margin: 0
      });
    });

    // Bottom highlight (höher gesetzt, damit nicht mit Footer überlappt)
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 6.45, w: 11.9, h: 0.5,
      fill: { color: COAL }, line: { type: "none" }
    });
    s.addText("Ø ARPU (Kunde): 340 €/Monat | Ø Kundenlebensdauer: 28 Monate | LTV: ~9.500 €", {
      x: 0.7, y: 6.45, w: 11.9, h: 0.5,
      fontFace: FONT_B, fontSize: 13, color: GOLD_LT, bold: true, align: "center", valign: "middle",
      charSpacing: 2, margin: 0
    });

    addBrandLogo(s);
    addFooter(s, 6, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 7 — TRACTION / STATUS
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "STATUS QUO");
    addTitle(s, "Launch-ready. Erster Kunde an Bord.");

    // Timeline
    const milestones = [
      { date: "Q4 2025", t: "Idee & UG-Gründung", done: true,
        b: "Marktrecherche, UG (haftungsbeschränkt) eingetragen — HRB 140351, erste Prototypen" },
      { date: "Q1 2026", t: "MVP Build", done: true,
        b: "iOS + Android Native App, Web-Plattform, Supabase-Backend, RLS-Security" },
      { date: "April 2026", t: "Live Launch", done: true,
        b: "Apps im App Store & Play Store, Marketing-Launch, erste Kundin (Sabrina) an Bord" },
      { date: "Q3 2026", t: "Traction Frankfurt", done: false,
        b: "100 aktive Kunden · 20 verifizierte Engel · Erste Krankenfahrten" },
      { date: "2027",    t: "Expansion NRW", done: false,
        b: "Köln · Düsseldorf · Partnerschaft mit ProCare & PROLIFE" },
    ];

    const tlY = 2.5;
    const tlH = 4.3;
    // Vertical line
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1.7, y: tlY + 0.3, w: 0.04, h: tlH - 0.6,
      fill: { color: GOLD, transparency: 60 }, line: { type: "none" }
    });

    milestones.forEach((m, i) => {
      const y = tlY + i * 0.85;
      // Dot
      s.addShape(pres.shapes.OVAL, {
        x: 1.55, y: y + 0.15, w: 0.34, h: 0.34,
        fill: { color: m.done ? GOLD : CREAM },
        line: { color: GOLD, width: 2 }
      });
      if (m.done) {
        s.addImage({ data: ic.check_l, x: 1.62, y: y + 0.22, w: 0.2, h: 0.2 });
      }
      // Date
      s.addText(m.date, {
        x: 0.4, y: y + 0.1, w: 1.1, h: 0.4,
        fontFace: FONT_B, fontSize: 11, color: m.done ? GOLD : MUTED, bold: true,
        align: "right", charSpacing: 2, margin: 0
      });
      // Title
      s.addText(m.t, {
        x: 2.05, y: y + 0.05, w: 10.5, h: 0.4,
        fontFace: FONT_H, fontSize: 17, color: m.done ? COAL : MUTED, bold: false, margin: 0
      });
      // Body
      s.addText(m.b, {
        x: 2.05, y: y + 0.42, w: 10.5, h: 0.4,
        fontFace: FONT_B, fontSize: 11, color: MUTED, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 7, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 8 — GO-TO-MARKET
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "GO-TO-MARKET");
    addTitle(s, "Dominanz-Strategie: Stadt für Stadt.");

    // Left: 3 cities stacked
    const citiesX = 0.7;
    const cities = [
      { name: "Frankfurt am Main", pop: "Start-Stadt 2026", kpi: "Ziel: 500 Kunden · 80 Engel", active: true, rank: "1" },
      { name: "Köln",              pop: "Expansion 2027",  kpi: "Ziel: 800 Kunden · 120 Engel", active: false, rank: "2" },
      { name: "Düsseldorf",        pop: "Expansion 2027",  kpi: "Ziel: 600 Kunden · 90 Engel",  active: false, rank: "3" },
    ];
    cities.forEach((c, i) => {
      const y = 2.3 + i * 1.55;
      s.addShape(pres.shapes.RECTANGLE, {
        x: citiesX, y, w: 6.5, h: 1.4,
        fill: { color: c.active ? COAL : WHITE },
        line: { color: c.active ? GOLD : "EAE3D4", width: c.active ? 2 : 0.75 },
        shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.08 }
      });
      // Rank circle
      s.addShape(pres.shapes.OVAL, {
        x: citiesX + 0.25, y: y + 0.3, w: 0.8, h: 0.8,
        fill: { color: GOLD }, line: { type: "none" }
      });
      s.addText(c.rank, {
        x: citiesX + 0.25, y: y + 0.3, w: 0.8, h: 0.8,
        fontFace: FONT_H, fontSize: 30, color: COAL, bold: true,
        align: "center", valign: "middle", margin: 0
      });
      // Name
      s.addText(c.name, {
        x: citiesX + 1.3, y: y + 0.25, w: 5, h: 0.5,
        fontFace: FONT_H, fontSize: 22, color: c.active ? CREAM : COAL, italic: false, margin: 0
      });
      // Sub
      s.addText(c.pop, {
        x: citiesX + 1.3, y: y + 0.75, w: 5, h: 0.3,
        fontFace: FONT_B, fontSize: 11, color: c.active ? GOLD_LT : MUTED,
        charSpacing: 2, margin: 0
      });
      // KPI
      s.addText(c.kpi, {
        x: citiesX + 1.3, y: y + 1.02, w: 5, h: 0.3,
        fontFace: FONT_B, fontSize: 11, color: c.active ? CREAM_2 : COAL_2, bold: true, margin: 0
      });
    });

    // Right: GTM Playbook box
    const rightX = 7.5;
    s.addShape(pres.shapes.RECTANGLE, {
      x: rightX, y: 2.3, w: 5.1, h: 4.5,
      fill: { color: COAL }, line: { type: "none" }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: rightX, y: 2.3, w: 0.09, h: 4.5,
      fill: { color: GOLD }, line: { type: "none" }
    });
    s.addText("GTM-PLAYBOOK", {
      x: rightX + 0.4, y: 2.5, w: 4.5, h: 0.35,
      fontFace: FONT_B, fontSize: 11, color: GOLD, bold: true, charSpacing: 4, margin: 0
    });
    s.addText("Pro Stadt in 90 Tagen", {
      x: rightX + 0.4, y: 2.85, w: 4.5, h: 0.5,
      fontFace: FONT_H, fontSize: 22, color: CREAM, italic: false, margin: 0
    });
    const steps = [
      { n: "01", t: "Lokale Engel rekrutieren", b: "Facebook-Gruppen · Minijob-Börsen · AWO/Caritas" },
      { n: "02", t: "Sanitätshaus-Allianzen",    b: "Ko-Marketing · Flyer · QR-Codes im Laden" },
      { n: "03", t: "Kassen-Abrechnung aktiv",   b: "Abrechnungsstelle freigeschaltet · §45b live" },
      { n: "04", t: "Paid Acquisition",           b: "Meta Ads · Google · TV-regional (Senioren-Prime)" },
    ];
    steps.forEach((st, i) => {
      const y = 3.55 + i * 0.75;
      s.addText(st.n, {
        x: rightX + 0.4, y, w: 0.7, h: 0.5,
        fontFace: FONT_H, fontSize: 22, color: GOLD, bold: true, margin: 0
      });
      s.addText(st.t, {
        x: rightX + 1.1, y: y - 0.02, w: 3.9, h: 0.35,
        fontFace: FONT_B, fontSize: 13, color: CREAM, bold: true, margin: 0
      });
      s.addText(st.b, {
        x: rightX + 1.1, y: y + 0.32, w: 3.9, h: 0.35,
        fontFace: FONT_B, fontSize: 10, color: MUTED, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 8, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 9 — MARKT & WETTBEWERB
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "MARKT & WETTBEWERB");
    addTitle(s, "Wir besetzen die Lücke zwischen Helpling und Pflegedienst.");

    // 2x2 matrix visualization
    const mX = 0.7, mY = 2.4, mW = 6.5, mH = 4.2;
    // Axes bg
    s.addShape(pres.shapes.RECTANGLE, {
      x: mX, y: mY, w: mW, h: mH,
      fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.75 }
    });
    // Axes
    s.addShape(pres.shapes.LINE, {
      x: mX + mW/2, y: mY + 0.2, w: 0, h: mH - 0.4,
      line: { color: MUTED, width: 1, dashType: "dash" }
    });
    s.addShape(pres.shapes.LINE, {
      x: mX + 0.2, y: mY + mH/2, w: mW - 0.4, h: 0,
      line: { color: MUTED, width: 1, dashType: "dash" }
    });
    // Axis labels
    s.addText("Kassen-abgerechnet →", {
      x: mX, y: mY + mH - 0.3, w: mW, h: 0.3,
      fontFace: FONT_B, fontSize: 10, color: MUTED, align: "center", margin: 0
    });
    s.addText("Digital →", {
      x: mX - 0.3, y: mY + 0.05, w: mW, h: 0.3,
      fontFace: FONT_B, fontSize: 10, color: MUTED, margin: 0
    });
    // Competitors
    const comps = [
      { name: "Helpling",   x: 0.22, y: 0.22, fill: "DDDDDD" }, // top-left: digital, low care
      { name: "HomeInstead", x: 0.72, y: 0.78, fill: "DDDDDD" }, // bottom-right: analog, high care
      { name: "Classic Pflegedienst", x: 0.78, y: 0.85, fill: "DDDDDD" },
      { name: "Curendo",    x: 0.30, y: 0.35, fill: "DDDDDD" },
      { name: "AlltagsEngel", x: 0.72, y: 0.25, fill: GOLD, primary: true }, // top-right: digital + high care
    ];
    comps.forEach(c => {
      const cx = mX + c.x * mW - 0.6;
      const cy = mY + c.y * mH - 0.25;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: cy, w: 1.4, h: 0.5,
        fill: { color: c.fill },
        line: { color: c.primary ? COAL : "BBBBBB", width: c.primary ? 1.5 : 0.5 },
        rectRadius: 0.08,
        shadow: c.primary ? { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.2 } : undefined
      });
      s.addText(c.name, {
        x: cx, y: cy, w: 1.4, h: 0.5,
        fontFace: FONT_B, fontSize: 10, color: c.primary ? COAL : "666666",
        bold: c.primary, align: "center", valign: "middle", margin: 0
      });
    });

    // Right: key diff points
    const rX = 7.8;
    s.addText("Was uns unterscheidet", {
      x: rX, y: 2.4, w: 5.1, h: 0.5,
      fontFace: FONT_H, fontSize: 22, color: COAL, italic: false, margin: 0
    });
    const diffs = [
      { t: "Kassen-Integriert",  b: "Direktabrechnung mit §45b, §40 und Krankenkassen — keine Vorkasse für den Kunden." },
      { t: "Vollstack statt Punkt", b: "Hilfe + Fahrt + Box in einer App. Konkurrenz bietet nur eine Vertikale." },
      { t: "Mobile-First (native)", b: "iOS + Android + Web — Live-Server-Updates ohne Store-Release." },
      { t: "Care-Manager pro Kunde", b: "Menschliche Ansprechperson, WhatsApp-Kontakt, kein Chatbot-Labyrinth." },
    ];
    diffs.forEach((d, i) => {
      const y = 3.05 + i * 0.93;
      s.addImage({ data: ic.check, x: rX, y: y + 0.1, w: 0.32, h: 0.32 });
      s.addText(d.t, {
        x: rX + 0.45, y, w: 4.6, h: 0.35,
        fontFace: FONT_B, fontSize: 12.5, color: COAL, bold: true, margin: 0
      });
      s.addText(d.b, {
        x: rX + 0.45, y: y + 0.33, w: 4.6, h: 0.55,
        fontFace: FONT_B, fontSize: 10.5, color: MUTED, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 9, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 10 — TEAM
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "TEAM");
    addTitle(s, "Solo-Founder. Hands-on. Shipping seit Tag 1.");

    // Founder card (center-left)
    const fx = 0.7, fy = 2.35, fw = 5.2, fh = 4.5;
    s.addShape(pres.shapes.RECTANGLE, {
      x: fx, y: fy, w: fw, h: fh,
      fill: { color: COAL }, line: { color: GOLD, width: 1.5 }
    });
    s.addShape(pres.shapes.OVAL, {
      x: fx + fw/2 - 0.8, y: fy + 0.4, w: 1.6, h: 1.6,
      fill: { color: GOLD, transparency: 80 }, line: { color: GOLD, width: 1.5 }
    });
    // Founder-Avatar: Initialen "YFD" in Gold auf Coal-Kreis (eleganter als generisches Person-Icon)
    s.addText("YFD", {
      x: fx + fw/2 - 0.8, y: fy + 0.5, w: 1.6, h: 1.4,
      fontFace: FONT_H, fontSize: 38, color: GOLD, bold: false, italic: false,
      align: "center", valign: "middle", margin: 0
    });

    s.addText("Yusuf Ferhat Demir", {
      x: fx, y: fy + 2.15, w: fw, h: 0.5,
      fontFace: FONT_H, fontSize: 24, color: CREAM, italic: false, align: "center", margin: 0
    });
    s.addText("GRÜNDER · CEO · CTO", {
      x: fx, y: fy + 2.65, w: fw, h: 0.3,
      fontFace: FONT_B, fontSize: 10.5, color: GOLD, align: "center", charSpacing: 4, margin: 0
    });
    s.addText([
      { text: "Frankfurt-basiert, türkisch-deutsche Wurzeln", options: { bullet: { code: "25CF", indent: 12 }, breakLine: true } },
      { text: "Product-Led: Idee zu Live-App in 4 Monaten", options: { bullet: { code: "25CF", indent: 12 }, breakLine: true } },
      { text: "Full-Stack: iOS, Android, Next.js, Supabase", options: { bullet: { code: "25CF", indent: 12 }, breakLine: true } },
      { text: "Community-First: WhatsApp, direkter Kontakt", options: { bullet: { code: "25CF", indent: 12 } } },
    ], {
      x: fx + 0.35, y: fy + 3.1, w: fw - 0.5, h: 1.35,
      fontFace: FONT_B, fontSize: 10.5, color: CREAM_2, margin: 0, paraSpaceAfter: 2
    });

    // Right: what we need
    const rX = 6.4, rY = 2.35;
    s.addText("Nächste Schlüssel-Hires (mit dem Pre-Seed)", {
      x: rX, y: rY, w: 6.2, h: 0.5,
      fontFace: FONT_H, fontSize: 18, color: COAL, italic: false, margin: 0
    });

    const hires = [
      { t: "Head of Operations", ic: ic.cogs, b: "Stadt-Launches, Engel-Rekrutierung, Qualität" },
      { t: "Care-Manager (x2)", ic: ic.app_angel, b: "Persönlicher Kunden-Kontakt, Retention" },
      { t: "Growth Marketer", ic: ic.chart, b: "Paid Social, SEO, Senioren-Zielgruppe" },
      { t: "Partner-Manager", ic: ic.app_shake, b: "Kassen, Sanitätshäuser, ProCare/PROLIFE" },
    ];
    hires.forEach((h, i) => {
      const y = 2.9 + i * 0.95;
      // Card
      s.addShape(pres.shapes.RECTANGLE, {
        x: rX, y, w: 6.2, h: 0.85,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.5 },
        shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 90, opacity: 0.06 }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: rX, y, w: 0.07, h: 0.85, fill: { color: GOLD }, line: { type: "none" }
      });
      s.addImage({ data: h.ic, x: rX + 0.35, y: y + 0.2, w: 0.45, h: 0.45 });
      s.addText(h.t, {
        x: rX + 1.0, y: y + 0.08, w: 5, h: 0.35,
        fontFace: FONT_B, fontSize: 13, color: COAL, bold: true, margin: 0
      });
      s.addText(h.b, {
        x: rX + 1.0, y: y + 0.42, w: 5, h: 0.35,
        fontFace: FONT_B, fontSize: 10.5, color: MUTED, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 10, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 11 — FINANCIALS
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "FINANZPLAN");
    addTitle(s, "3-Jahres-Plan: Vom Launch zur NRW-Dominanz.");

    // Chart
    s.addChart(pres.charts.BAR, [
      { name: "Umsatz (T€)",    labels: ["2026", "2027", "2028"], values: [95,  780, 2650] },
      { name: "Brutto-Marge (T€)", labels: ["2026", "2027", "2028"], values: [22,  234, 1060] },
    ], {
      x: 0.7, y: 2.3, w: 7, h: 4.3,
      barDir: "col",
      chartColors: [GOLD, COAL],
      chartArea: { fill: { color: WHITE }, roundedCorners: false, border: { color: "EAE3D4", pt: 1 } },
      plotArea: { fill: { color: WHITE } },
      showLegend: true, legendPos: "b", legendFontSize: 10, legendColor: COAL_2,
      catAxisLabelColor: COAL_2, catAxisLabelFontSize: 11,
      valAxisLabelColor: MUTED, valAxisLabelFontSize: 9,
      valGridLine: { color: "EAE3D4", size: 0.5, style: "dash" },
      catGridLine: { style: "none" },
      showValue: true, dataLabelPosition: "outEnd", dataLabelColor: COAL, dataLabelFontSize: 10,
      showTitle: true, title: "Umsatz & Brutto-Marge (Szenario)", titleFontFace: FONT_H, titleFontSize: 14, titleColor: COAL,
    });

    // KPI stack right
    const rX = 8.1;
    const kpis = [
      { n: "2.650 T€", l: "Umsatz 2028" },
      { n: "3 Städte", l: "NRW abgedeckt bis Q4/2027" },
      { n: "1.900",    l: "Aktive Kunden Ø 2028" },
      { n: "340 €",    l: "ARPU pro Monat" },
      { n: "Q2 2028",  l: "Operativer Break-Even" },
    ];
    kpis.forEach((k, i) => {
      const y = 2.3 + i * 0.85;
      s.addShape(pres.shapes.RECTANGLE, {
        x: rX, y, w: 4.5, h: 0.75,
        fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.5 }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: rX, y, w: 0.06, h: 0.75, fill: { color: GOLD }, line: { type: "none" }
      });
      s.addText(k.n, {
        x: rX + 0.2, y: y + 0.05, w: 4.3, h: 0.4,
        fontFace: FONT_H, fontSize: 22, color: COAL, bold: true, margin: 0
      });
      s.addText(k.l, {
        x: rX + 0.2, y: y + 0.45, w: 4.3, h: 0.3,
        fontFace: FONT_B, fontSize: 10, color: MUTED, margin: 0
      });
    });

    // Footnote
    s.addText("Basisszenario · Konservativ · Detaillierter Financial-Model (Excel) separat im Due-Diligence-Paket.",
      { x: 0.7, y: 6.75, w: 11.9, h: 0.3,
        fontFace: FONT_B, fontSize: 9, color: MUTED, italic: false, margin: 0 });

    addBrandLogo(s);
    addFooter(s, 11, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 12 — DER ASK
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: COAL };

    // Gold accent left
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: H, fill: { color: GOLD }, line: { type: "none" }
    });

    s.addText("DER ASK", {
      x: 0.8, y: 0.8, w: 8, h: 0.4,
      fontFace: FONT_B, fontSize: 12, color: GOLD, bold: true, charSpacing: 8, margin: 0
    });
    s.addText("1,0 Mio €", {
      x: 0.8, y: 1.4, w: 12, h: 1.8,
      fontFace: FONT_H, fontSize: 96, color: CREAM, italic: false, margin: 0
    });
    s.addText("Pre-Seed · Wandeldarlehen oder Equity · 18–24 Monate Runway", {
      x: 0.8, y: 3.1, w: 12, h: 0.5,
      fontFace: FONT_B, fontSize: 16, color: GOLD_LT, charSpacing: 2, margin: 0
    });

    // Use of funds — 4 buckets
    const useY = 3.95;
    const uses = [
      { pct: 40, lbl: "Team-Aufbau",      desc: "Ops, Care, Growth, Partner", ic: ic.users },
      { pct: 30, lbl: "Marketing & CAC",  desc: "Paid Social, TV-regional, SEO", ic: ic.chart },
      { pct: 20, lbl: "Expansion NRW",    desc: "Köln + Düsseldorf Launches", ic: ic.map },
      { pct: 10, lbl: "Technologie & Ops",desc: "Abrechnungs-Engine, KI-Matching", ic: ic.cogs },
    ];
    uses.forEach((u, i) => {
      const x = 0.8 + i * 3.12;
      const w = 2.9;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: useY, w, h: 2.3,
        fill: { color: COAL_2 }, line: { color: GOLD, width: 0.75 }
      });
      s.addImage({ data: u.ic, x: x + w/2 - 0.3, y: useY + 0.3, w: 0.6, h: 0.6 });
      s.addText(`${u.pct} %`, {
        x, y: useY + 1.0, w, h: 0.6,
        fontFace: FONT_H, fontSize: 34, color: GOLD, bold: true, align: "center", margin: 0
      });
      s.addText(u.lbl, {
        x: x + 0.15, y: useY + 1.62, w: w - 0.3, h: 0.35,
        fontFace: FONT_B, fontSize: 12, color: CREAM, bold: true, align: "center", margin: 0
      });
      s.addText(u.desc, {
        x: x + 0.15, y: useY + 1.93, w: w - 0.3, h: 0.35,
        fontFace: FONT_B, fontSize: 10, color: MUTED, align: "center", margin: 0
      });
    });

    // Milestones after funding
    s.addText("Nach Seed: 1.900 Kunden · 2,6 Mio € Umsatz · Break-Even Q2/2028 · Series-A ready",
      { x: 0.8, y: 6.7, w: 12, h: 0.4,
        fontFace: FONT_B, fontSize: 12, color: GOLD_LT, charSpacing: 2, margin: 0 });

    addBrandLogo(s);
    addFooter(s, 12, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 13 — WARUM PROCARE (Strategic Fit)
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "STRATEGIC FIT");
    addTitle(s, "Warum ProCare + AlltagsEngel perfekt passen.");

    // Two-column complement diagram
    const leftX = 0.7, rightX = 7.1, colW = 5.5, colY = 2.35, colH = 3.3;

    // ProCare / PROLIFE side
    s.addShape(pres.shapes.RECTANGLE, {
      x: leftX, y: colY, w: colW, h: colH,
      fill: { color: WHITE }, line: { color: "EAE3D4", width: 0.75 }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: leftX, y: colY, w: colW, h: 0.6, fill: { color: COAL }, line: { type: "none" }
    });
    s.addText("ProCare · PROLIFE · care integral", {
      x: leftX, y: colY, w: colW, h: 0.6,
      fontFace: FONT_B, fontSize: 13, color: GOLD, bold: true,
      align: "center", valign: "middle", charSpacing: 3, margin: 0
    });
    const pc = [
      "180 Mitarbeiter, Hessen/Schleswig-Holstein",
      "Pflegehilfsmittel-Logistik, forma-care",
      "Verträge mit allen Krankenkassen",
      "Stoma, Wunde, Inkontinenz, Ernährung",
      "Apotheken- & Sanitätshaus-Netzwerk",
    ];
    pc.forEach((p, i) => {
      const y = colY + 0.9 + i * 0.45;
      s.addImage({ data: ic.check, x: leftX + 0.3, y: y + 0.05, w: 0.25, h: 0.25 });
      s.addText(p, {
        x: leftX + 0.7, y, w: colW - 1, h: 0.35,
        fontFace: FONT_B, fontSize: 12, color: COAL_2, margin: 0
      });
    });

    // AlltagsEngel side
    s.addShape(pres.shapes.RECTANGLE, {
      x: rightX, y: colY, w: colW, h: colH,
      fill: { color: WHITE }, line: { color: GOLD, width: 1.5 }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: rightX, y: colY, w: colW, h: 0.6, fill: { color: GOLD }, line: { type: "none" }
    });
    s.addText("AlltagsEngel", {
      x: rightX, y: colY, w: colW, h: 0.6,
      fontFace: FONT_H, fontSize: 17, color: COAL, bold: true, italic: false,
      align: "center", valign: "middle", margin: 0
    });
    const ae = [
      "Digitale Plattform · iOS + Android + Web",
      "§45b-Direktkontakt zum Endkunden",
      "Alltagshilfen, Krankenfahrten, Abo",
      "Care-Manager-Beziehung pro Haushalt",
      "Performance-Marketing & Daten-First",
    ];
    ae.forEach((p, i) => {
      const y = colY + 0.9 + i * 0.45;
      s.addImage({ data: ic.check, x: rightX + 0.3, y: y + 0.05, w: 0.25, h: 0.25 });
      s.addText(p, {
        x: rightX + 0.7, y, w: colW - 1, h: 0.35,
        fontFace: FONT_B, fontSize: 12, color: COAL_2, margin: 0
      });
    });

    // Center "+" symbol
    s.addShape(pres.shapes.OVAL, {
      x: (leftX + colW) - 0.2, y: colY + colH/2 - 0.3, w: 0.6, h: 0.6,
      fill: { color: COAL }, line: { color: GOLD, width: 2 }
    });
    s.addText("+", {
      x: (leftX + colW) - 0.2, y: colY + colH/2 - 0.3, w: 0.6, h: 0.6,
      fontFace: FONT_H, fontSize: 28, color: GOLD, bold: true,
      align: "center", valign: "middle", margin: 0
    });

    // Bottom synergy callouts
    const syn = [
      { t: "Pflegebox-Direktversand", b: "ProCare-Produkte im AlltagsEngel-Abo — 42 €/Mo pro Kunde, 1.900 Kunden = 957 T€/Jahr" },
      { t: "Kassen-Abrechnungs-Rails", b: "PROLIFE's existierende Kassen-Verträge beschleunigen §45b-Rollout um 12–18 Monate" },
      { t: "Homecare-Cross-Sell",      b: "Stoma/Wundversorgung in AlltagsEngel-App vermittelbar — pflegende Angehörige als Eingangstor" },
    ];
    syn.forEach((sy, i) => {
      const x = 0.7 + i * 4.05;
      const y = 6.0;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.85, h: 0.95,
        fill: { color: GOLD, transparency: 85 }, line: { color: GOLD, width: 0.75 }
      });
      s.addText(sy.t, {
        x: x + 0.15, y: y + 0.08, w: 3.65, h: 0.3,
        fontFace: FONT_B, fontSize: 11, color: COAL, bold: true, margin: 0
      });
      s.addText(sy.b, {
        x: x + 0.15, y: y + 0.38, w: 3.65, h: 0.55,
        fontFace: FONT_B, fontSize: 9.5, color: COAL_2, margin: 0
      });
    });

    addBrandLogo(s);
    addFooter(s, 13, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 14 — KONTAKT / CLOSING
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: COAL };

    // Large gold ring decorations
    s.addShape(pres.shapes.OVAL, {
      x: -2, y: 4, w: 6, h: 6,
      fill: { color: GOLD, transparency: 88 }, line: { type: "none" }
    });
    s.addShape(pres.shapes.OVAL, {
      x: W - 3, y: -2, w: 5, h: 5,
      fill: { color: GOLD, transparency: 90 }, line: { type: "none" }
    });

    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: H, fill: { color: GOLD }, line: { type: "none" }
    });

    // AlltagsEngel Logo-Mark oben rechts (diskret, als Brand-Signatur)
    s.addImage({ path: "logo-mark.png", x: W - 1.8, y: 0.5, w: 1.0, h: 0.55 });

    s.addText("DANKE.", {
      x: 0.8, y: 1.0, w: 12, h: 1.2,
      fontFace: FONT_H, fontSize: 80, color: CREAM, italic: false, margin: 0
    });
    s.addText("Lass uns Alltagshilfe und Entlastung neu bauen.", {
      x: 0.8, y: 2.4, w: 12, h: 0.7,
      fontFace: FONT_H, fontSize: 28, color: GOLD_LT, italic: false, margin: 0
    });

    // Divider
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.8, y: 3.35, w: 0.5, h: 0.03,
      fill: { color: GOLD }, line: { type: "none" }
    });

    // Contact block
    s.addText("KONTAKT", {
      x: 0.8, y: 3.55, w: 8, h: 0.3,
      fontFace: FONT_B, fontSize: 11, color: GOLD, bold: true, charSpacing: 6, margin: 0
    });

    const contact = [
      { ic: ic.app_tie,    l: "Yusuf Ferhat Demir — Gründer & CEO" },
      { ic: ic.phone,  l: "+49 178 338 2825" },
      { ic: ic.app_shake,  l: "info@alltagsengel.care" },
      { ic: ic.app_home,   l: "AlltagsEngel UG (haftungsbeschränkt) · HRB 140351 · Neue Mainzer Straße 66-68, 60311 Frankfurt a. M." },
      { ic: ic.app_star, l: "alltagsengel.care" },
    ];
    contact.forEach((c, i) => {
      const y = 4.0 + i * 0.45;
      s.addImage({ data: c.ic, x: 0.8, y: y + 0.03, w: 0.3, h: 0.3 });
      s.addText(c.l, {
        x: 1.25, y, w: 11, h: 0.4,
        fontFace: FONT_B, fontSize: 14, color: CREAM, margin: 0
      });
    });

    // Bottom disclaimer
    s.addText("Vertraulich · Für ProCare Deutschland & PROLIFE homecare GmbH · April 2026",
      { x: 0.8, y: H - 0.8, w: 12, h: 0.3,
        fontFace: FONT_B, fontSize: 9, color: MUTED, italic: false, charSpacing: 2, margin: 0 });
  }

  // ═══════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════
  await pres.writeFile({ fileName: "AlltagsEngel_PitchDeck_2026.pptx" });
  console.log("✓ Pitch Deck erstellt: AlltagsEngel_PitchDeck_2026.pptx");
}

main().catch(err => { console.error(err); process.exit(1); });
