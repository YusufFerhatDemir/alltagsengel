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

    // Logo as heart icon
    s.addImage({ data: ic.heart, x: 0.8, y: 1.5, w: 0.8, h: 0.8 });

    // Main title
    s.addText("AlltagsEngel", {
      x: 0.8, y: 2.4, w: 12, h: 1.4,
      fontFace: FONT_H, fontSize: 80, color: CREAM, italic: true,
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
      { text: "Yusuf Cilcioglu", options: { bold: true, color: CREAM, breakLine: true } },
      { text: "Gründer & CEO · AlltagsEngel UG (i.G.)", options: { color: MUTED } }
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
    addTitle(s, "125 € im Monat. Jeden Monat. Ungenutzt.");

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

    addFooter(s, 2, totalSlides);
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDE 3 — DIE LÖSUNG
  // ═══════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: CREAM };
    addEyebrow(s, "UNSERE LÖSUNG");
    addTitle(s, "Eine App. Ein Login. Alles, was Pflege braucht.");

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
    s.addImage({ data: ic.heart, x: phoneX + phoneW/2 - 0.4, y: phoneY + 0.7, w: 0.8, h: 0.8 });
    s.addText("AlltagsEngel", {
      x: phoneX, y: phoneY + 1.65, w: phoneW, h: 0.4,
      fontFace: FONT_H, fontSize: 20, color: COAL, italic: true, align: "center", margin: 0
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
      { icon: ic.car,   t: "Krankenfahrten & Taxi", b: "Zum Arzt, zur Reha, zur Dialyse. Rezept hochladen, Fahrt buchen, AlltagsEngel kümmert sich um die Abrechnung." },
      { icon: ic.box,   t: "Pflegeboxen (§40)",     b: "42 €/Monat Pflegehilfsmittel-Pauschale — automatischer Monatsversand, kein Papierkram für die Angehörigen." },
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
        icon: ic.userMd,
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
        sub: "Alltagshelfer & Pflegekräfte",
        icon: ic.heart,
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
        icon: ic.car,
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
        fontFace: FONT_H, fontSize: 20, color: GOLD_LT, italic: true, align: "center", margin: 0
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
      { icon: ic.car,   t: "Krankenfahrten",    price: "~8 €/Fahrt", sub: "Pauschale auf Kassen-Erstattung · skalierbar mit Flotte", pct: "25%" },
      { icon: ic.box,   t: "Pflegeboxen §40",   price: "~12 €/Box", sub: "42 € Kassen-Pauschale · Partner-Modell mit ProCare", pct: "15%" },
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
      { date: "Q4 2025", t: "Idee & UG i.G.", done: true,
        b: "Marktrecherche, UG-Gründung, erste Prototypen" },
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
        fontFace: FONT_H, fontSize: 22, color: c.active ? CREAM : COAL, italic: true, margin: 0
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
      fontFace: FONT_H, fontSize: 22, color: CREAM, italic: true, margin: 0
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
    s.addText("Pflege-Fokus →", {
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
      fontFace: FONT_H, fontSize: 22, color: COAL, italic: true, margin: 0
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
    s.addImage({ data: ic.tie, x: fx + fw/2 - 0.55, y: fy + 0.65, w: 1.1, h: 1.1 });

    s.addText("Yusuf Cilcioglu", {
      x: fx, y: fy + 2.15, w: fw, h: 0.5,
      fontFace: FONT_H, fontSize: 24, color: CREAM, italic: true, align: "center", margin: 0
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
      fontFace: FONT_H, fontSize: 18, color: COAL, italic: true, margin: 0
    });

    const hires = [
      { t: "Head of Operations", ic: ic.cogs, b: "Stadt-Launches, Engel-Rekrutierung, Qualität" },
      { t: "Care-Manager (x2)", ic: ic.heart, b: "Persönlicher Kunden-Kontakt, Retention" },
      { t: "Growth Marketer", ic: ic.chart, b: "Paid Social, SEO, Senioren-Zielgruppe" },
      { t: "Partner-Manager", ic: ic.shake, b: "Kassen, Sanitätshäuser, ProCare/PROLIFE" },
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
        fontFace: FONT_B, fontSize: 9, color: MUTED, italic: true, margin: 0 });

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
      fontFace: FONT_H, fontSize: 96, color: CREAM, italic: true, margin: 0
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
      fontFace: FONT_H, fontSize: 17, color: COAL, bold: true, italic: true,
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

    s.addText("DANKE.", {
      x: 0.8, y: 1.0, w: 12, h: 1.2,
      fontFace: FONT_H, fontSize: 80, color: CREAM, italic: true, margin: 0
    });
    s.addText("Lass uns die Pflege in Deutschland neu bauen.", {
      x: 0.8, y: 2.4, w: 12, h: 0.7,
      fontFace: FONT_H, fontSize: 28, color: GOLD_LT, italic: true, margin: 0
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
      { ic: ic.tie,    l: "Yusuf Cilcioglu — Gründer & CEO" },
      { ic: ic.phone,  l: "+49 178 338 2825" },
      { ic: ic.shake,  l: "y.cilcioglu@googlemail.com" },
      { ic: ic.home,   l: "AlltagsEngel UG (i.G.) · Frankfurt am Main" },
      { ic: ic.star_l, l: "alltagsengel.care" },
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
        fontFace: FONT_B, fontSize: 9, color: MUTED, italic: true, charSpacing: 2, margin: 0 });
  }

  // ═══════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════
  await pres.writeFile({ fileName: "AlltagsEngel_PitchDeck_2026.pptx" });
  console.log("✓ Pitch Deck erstellt: AlltagsEngel_PitchDeck_2026.pptx");
}

main().catch(err => { console.error(err); process.exit(1); });
