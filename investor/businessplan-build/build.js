/**
 * AlltagsEngel — Business Plan 2026
 * Investor-Paket für ProCare Deutschland / PROLIFE Gespräch
 * Generiert ein professionelles 25-seitiges .docx
 */
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
  VerticalAlign,
} = require("docx");

// ─── Branding ───
const FONT = "Calibri";
const FONT_H = "Cambria"; // Serif für Headings — professioneller
const GOLD = "C9A24B";
const COAL = "1A1612";
const MUTED = "8A7F6E";
const LIGHT = "EAE3D4";

// ─── Helpers ───
function H1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 240 },
    pageBreakBefore: true,
    children: [new TextRun({ text, font: FONT_H, size: 36, bold: true, color: COAL })],
  });
}
function H1First(text) {
  // Erstes H1 ohne PageBreak (sonst leere Seite nach Cover)
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 240 },
    children: [new TextRun({ text, font: FONT_H, size: 36, bold: true, color: COAL })],
  });
}
function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, font: FONT_H, size: 26, bold: true, color: COAL })],
  });
}
function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: COAL })],
  });
}
function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: FONT, size: 22, color: COAL, ...opts })],
  });
}
function PRich(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: runs.map(r => new TextRun({ font: FONT, size: 22, color: COAL, ...r })),
  });
}
function Quote(text) {
  return new Paragraph({
    spacing: { before: 180, after: 180, line: 300 },
    alignment: AlignmentType.LEFT,
    indent: { left: 480, right: 480 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: GOLD, space: 12 } },
    children: [new TextRun({ text, font: FONT_H, size: 22, italic: true, color: COAL })],
  });
}
function Bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, font: FONT, size: 22, color: COAL })],
  });
}
function BulletBold(leading, rest, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 280 },
    children: [
      new TextRun({ text: leading, font: FONT, size: 22, bold: true, color: COAL }),
      new TextRun({ text: rest, font: FONT, size: 22, color: COAL }),
    ],
  });
}
function NumItem(text) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, font: FONT, size: 22, color: COAL })],
  });
}
function Spacer(size = 200) {
  return new Paragraph({ spacing: { before: size, after: size }, children: [new TextRun("")] });
}
function Rule() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 1 } },
    children: [new TextRun({ text: "" })],
  });
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 6, color: LIGHT };
const BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function Cell(text, { bold = false, fill, w, align = AlignmentType.LEFT, color = COAL, size = 20 } = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: w, type: WidthType.DXA },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, font: FONT, size, bold, color })],
    })],
  });
}

function TableSimple(rows, widths) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((c, j) => Cell(c, {
        bold: i === 0,
        fill: i === 0 ? COAL : (i % 2 === 0 ? "FAF7F1" : undefined),
        color: i === 0 ? "F5EFE6" : COAL,
        w: widths[j],
        align: j === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
        size: i === 0 ? 20 : 20,
      })),
    })),
  });
}

// ─── Content Builder ───
const content = [];

// ═══════════════════════════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════════════════════════
content.push(
  new Paragraph({ spacing: { before: 2000 }, children: [new TextRun("")] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "ALLTAGSENGEL", font: FONT, size: 28, color: GOLD, characterSpacing: 300, bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: "Business Plan 2026", font: FONT_H, size: 72, bold: true, color: COAL, italic: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: "Die erste All-in-One Plattform für Pflege, Alltag und Mobilität.", font: FONT_H, size: 28, italic: true, color: MUTED })],
  }),
  Rule(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 120 },
    children: [new TextRun({ text: "Vertraulich — nur für den Empfänger bestimmt", font: FONT, size: 18, italic: true, color: MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "April 2026 · Frankfurt am Main", font: FONT, size: 20, color: COAL })],
  }),
  Rule(),
  new Paragraph({ spacing: { before: 1600 }, children: [new TextRun("")] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Verfasser: Yusuf Cilcioglu — Gründer & CEO", font: FONT, size: 20, color: COAL })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "AlltagsEngel — https://alltagsengel.care", font: FONT, size: 20, color: COAL })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "+49 178 338 2825 · hallo@alltagsengel.care", font: FONT, size: 20, color: COAL })],
  }),
);

// ═══════════════════════════════════════════════════════════════════
// INHALTSVERZEICHNIS
// ═══════════════════════════════════════════════════════════════════
content.push(H1("Inhaltsverzeichnis"));
const toc = [
  ["1. Executive Summary", "3"],
  ["2. Vision & Unternehmen", "5"],
  ["3. Problem — der deutsche Pflege-Markt 2026", "6"],
  ["4. Lösung — AlltagsEngel als integrierte Plattform", "8"],
  ["5. Produkt — drei Rollen, eine App", "10"],
  ["6. Markt & Wettbewerb", "12"],
  ["7. Geschäftsmodell — Vier Einnahmequellen", "14"],
  ["8. Go-to-Market — Frankfurt, Köln, Düsseldorf", "16"],
  ["9. Team & Organisation", "18"],
  ["10. Operations & Technologie", "19"],
  ["11. Strategische Partnerschaften — ProCare/PROLIFE", "20"],
  ["12. Finanzplan 3-Jahres-Projektion", "21"],
  ["13. Kapitalbedarf & Use-of-Funds", "23"],
  ["14. Meilensteine 2026–2028", "24"],
  ["15. Risiken & Gegenmaßnahmen", "25"],
  ["16. Exit-Perspektive & Investor-Return", "26"],
];
toc.forEach(([title, page]) => {
  content.push(new Paragraph({
    spacing: { after: 80, line: 300 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: PositionalTabLeader.DOT }],
    children: [
      new TextRun({ text: title, font: FONT, size: 22, color: COAL }),
      new TextRun({ children: [new PositionalTab({
        alignment: PositionalTabAlignment.RIGHT,
        relativeTo: PositionalTabRelativeTo.MARGIN,
        leader: PositionalTabLeader.DOT,
      }), page], font: FONT, size: 22, color: MUTED }),
    ],
  }));
});

// ═══════════════════════════════════════════════════════════════════
// 1. EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════
content.push(H1("1. Executive Summary"));

content.push(Quote("AlltagsEngel ist die erste App, die alle Lebensbereiche eines Pflegebedürftigen in einer Plattform bündelt: Alltagshilfe, Krankenfahrten, Pflegeboxen, Chat und Abrechnung — alles digital, alles aus einer Hand."));

content.push(H2("Unternehmen auf einen Blick"));
content.push(P("AlltagsEngel ist eine mobile Plattform mit Sitz in Frankfurt am Main, die Pflegebedürftige, Alltagsengel (Alltagshelfer und Pflegekräfte) sowie zertifizierte Krankentransport-Fahrer in einem einzigen Ökosystem verbindet. Die App ist seit April 2026 als Next.js-PWA und native iOS/Android-App verfügbar (beta), basiert auf Supabase und ist produktionsreif ausgerollt. Erste Kunden und Alltagsengel sind onboarded; das Unternehmen befindet sich unmittelbar vor der kommerziellen Markteinführung."));

content.push(H2("Das Problem"));
content.push(P("Der deutsche Pflege-Markt ist mit 5,2 Millionen Pflegebedürftigen (Destatis 2025) und einem jährlichen Volumen von über 50 Milliarden Euro einer der größten Sozialmärkte Europas. Über 60 Prozent des §45b-Entlastungsbudgets (131 Euro pro Monat pro Kassen-Pflegegrad) verfallen ungenutzt, weil die Antrags- und Abrechnungsbürokratie für Angehörige nicht bewältigbar ist. Gleichzeitig sind Alltagshilfe, Krankenfahrten und Pflegehilfsmittel in Deutschland vollständig fragmentiert: drei Apps, drei Rechnungen, drei Anrufe."));

content.push(H2("Die Lösung"));
content.push(P("AlltagsEngel löst diese Fragmentierung mit einer einzigen integrierten App. Ein Kunde bucht Alltagsengel, Krankenfahrten und Pflegeboxen in einem einzigen Flow. Alle Leistungen werden automatisch gegen §45b (Entlastungsbetrag), §40 (Pflegehilfsmittel-Pauschale) oder die gesetzliche Krankenversicherung abgerechnet — über eine standardisierte Schnittstelle. Für Alltagsengel bedeutet das kalkulierbare Aufträge, sofortige Zahlung und Kalender-Integration; für Fahrer bedeutet es Rezept-basiertes Matching und Direktabrechnung mit den Kassen."));

content.push(H2("Geschäftsmodell"));
content.push(P("AlltagsEngel generiert Umsatz über vier wiederkehrende Einnahmeströme: (1) Alltagshilfen nach §45b SGB XI mit 32,50 €/h Kassenabrechnung und einer Marge von ~7,50 € pro Stunde (50 % vom Umsatz), (2) Krankenfahrten mit ~8 €/Fahrt auf Kassen-Erstattungsbasis (25 % vom Umsatz), (3) Pflegeboxen nach §40 SGB XI mit ~12 €/Box Marge im ProCare-Partnermodell (15 % vom Umsatz) und (4) Premium-Abos für Familien mit persönlichem Care-Manager zu 29–49 €/Monat (10 % vom Umsatz). Der erwartete durchschnittliche ARPU liegt bei 340 € pro Monat, der LTV bei ~9.500 € über 28 Monate Kundenlebensdauer."));

content.push(H2("Markt & Wettbewerb"));
content.push(P("Der adressierbare Markt (SAM) in Deutschland beträgt 7,6 Milliarden Euro pro Jahr allein im §45b-Budget, zuzüglich 1,5 Mrd. € Krankenfahrten und 700 Mio. € Pflegeboxen. Wettbewerber sind entweder spezialisiert (Helpling für Haushalt, Home Instead für Premium-Betreuung, Curendo für Administration) oder klassische regionale Pflegedienste ohne digitale Infrastruktur. AlltagsEngel ist die einzige App, die alle drei Kassen-Produkte in einer Buchung integriert — und damit ein strukturell neues Kategorie-Angebot."));

content.push(H2("Go-to-Market"));
content.push(P("Der Rollout folgt einer geografisch konzentrierten Drei-Städte-Strategie innerhalb Nordrhein-Westfalens und Hessens: Frankfurt als Home-Market (Ziel: 500 aktive Kunden bis Q4/2026), anschließend Köln (800 Kunden bis Q2/2027) und Düsseldorf (600 Kunden bis Q4/2027). Der Vertrieb läuft über drei parallele Kanäle: (a) direkte Kassen-Partnerschaften (AOK, Barmer, TK — §45b-Vorabzulassung), (b) Sanitätshaus- und Apotheken-Kooperationen (direkter Endkunden-Zugang), (c) performance-getriebenes digitales Marketing (Paid Social auf Angehörige 45–65 Jahre plus SEO)."));

content.push(H2("Team"));
content.push(P("Das Unternehmen wird als Solo-Founder-Operation von Yusuf Cilcioglu geführt — Frankfurter mit türkisch-deutschen Wurzeln, Full-Stack-Entwickler (iOS, Android, Next.js, Supabase) und Product-Led-Founder. Die App wurde in vier Monaten von der Idee zum Live-Produkt entwickelt. Mit dem Pre-Seed werden die ersten vier Schlüssel-Hires gesetzt: Head of Operations, zwei Care-Manager, ein Growth Marketer und ein Partner-Manager."));

content.push(H2("Kapitalbedarf"));
content.push(P("AlltagsEngel sucht eine Pre-Seed-Finanzierung in Höhe von 1,0 Mio € zur Kapitalisierung der ersten 18 Monate. Die Verwendung verteilt sich auf: 40 % Team-Aufbau (Operations, Care, Growth, Partner), 30 % Marketing und Kundenakquise, 20 % geographische Expansion (Köln, Düsseldorf) und 10 % Technologie und Infrastruktur. Das Szenario erreicht den operativen Break-Even in Q2 2028 mit einem geplanten Jahresumsatz von 2,65 Mio € bei 1.900 aktiven Kunden."));

content.push(H2("Warum jetzt"));
content.push(P("Drei konvergierende Trends machen den Moment einzigartig: (1) Demografie — die Zahl der Pflegebedürftigen steigt bis 2030 um 24 % auf 6,5 Millionen, (2) Digitalisierung — 79 % der 65-plus Bevölkerung nutzen Smartphones (Bitkom 2025), ein historisch nie dagewesenes Niveau, und (3) Regulierung — die Pflegeversicherungsreform 2025 hat die digitale Leistungsabrechnung vereinfacht und die §45b-Obergrenze auf 131 €/Monat angehoben. AlltagsEngel ist das operative Vehikel, das diese drei Trends in einen konkreten Vertrag zwischen Kasse, Kunde und Engel übersetzt."));

// ═══════════════════════════════════════════════════════════════════
// 2. VISION & UNTERNEHMEN
// ═══════════════════════════════════════════════════════════════════
content.push(H1("2. Vision & Unternehmen"));

content.push(H2("Vision"));
content.push(Quote("Jeder Pflegebedürftige in Deutschland soll mit einer App alles bekommen, was er im Alltag braucht — Hilfe, Fahrten, Produkte, Abrechnung. Pflege soll so einfach werden wie Essen bestellen."));

content.push(P("AlltagsEngel entsteht aus einer klaren Beobachtung: Der deutsche Sozialstaat stellt pflegebedürftigen Menschen jährlich über 7,6 Milliarden Euro Entlastungsbudget zur Verfügung — aber mehr als 60 Prozent dieses Budgets verfallen ungenutzt, weil Angehörige die Leistung nicht finden, nicht beantragen oder nicht korrekt abrechnen können. Gleichzeitig sind Alltagshilfen, Krankenfahrten und Pflegehilfsmittel in drei völlig voneinander getrennten Systemen organisiert."));

content.push(P("Unsere Vision ist, diese drei Welten in einer einzigen digitalen Plattform zu vereinen — so natürlich, dass eine 78-jährige Angehörige ihre Mutter mit drei Klicks in einer App versorgen kann. Langfristig wollen wir die betriebssystem-ähnliche Infrastruktur für ambulante Pflege in Deutschland werden: Jede Kasse rechnet über uns ab, jedes Sanitätshaus liefert über uns, jede Pflegebezogene Dienstleistung läuft durch unser Routing."));

content.push(H2("Mission"));
content.push(P("Wir machen Kassen-Leistungen nutzbar, bevor sie verfallen. Konkret bedeutet das: Jeder Pflegebedürftige in unserer App nutzt seinen §45b-Entlastungsbetrag zu mindestens 90 % aus (statt der bundesweiten 40 %), erhält seine §40-Pflegebox automatisch ohne einen einzigen Anruf, und bekommt jede medizinisch notwendige Fahrt ohne eigenen Verwaltungsaufwand erstattet."));

content.push(H2("Unternehmensdaten"));
content.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun("")] }));

const companyData = [
  ["Firma", "AlltagsEngel (Gründung: 2026)"],
  ["Rechtsform", "Einzelunternehmung → Umwandlung zur UG/GmbH bei Investment geplant"],
  ["Sitz", "Frankfurt am Main, Hessen"],
  ["Gründer", "Yusuf Cilcioglu — Full-Stack-Entwickler, CEO & CTO"],
  ["Branche", "DigitalHealth · AgeTech · Pflege-Plattform"],
  ["Website", "https://alltagsengel.care"],
  ["Kontakt", "+49 178 338 2825 · hallo@alltagsengel.care"],
  ["Status (April 2026)", "MVP produktiv, erste Kunden und Engel onboarded"],
  ["Mitarbeiter", "1 (Gründer) — Pre-Seed-Hires in Planung"],
  ["Finanzierungsstand", "Bootstrapped, 0 € externes Kapital"],
];
content.push(new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [3200, 5800],
  rows: companyData.map((row, i) => new TableRow({
    children: row.map((txt, j) => Cell(txt, {
      bold: j === 0,
      fill: i % 2 === 0 ? "FAF7F1" : undefined,
      w: j === 0 ? 3200 : 5800,
      align: AlignmentType.LEFT,
    })),
  })),
}));

content.push(H2("Werte"));
content.push(BulletBold("Menschlichkeit vor Technologie: ", "Die App ist das Werkzeug — die Engel sind das Produkt. Jede Feature-Entscheidung wird an der Frage gemessen: Macht das den Alltag einer 82-jährigen Frau mit Pflegegrad 2 wirklich einfacher?"));
content.push(BulletBold("Kassen-Konformität: ", "Wir rechnen nie mit Tricks oder Grauzonen ab. Jede Leistung ist dokumentiert, §-konform und prüfungsfest."));
content.push(BulletBold("Lokale Wurzeln: ", "Jede Stadt hat einen lokalen Care-Manager, der die Engel persönlich kennt und Kundengespräche nicht outsourct. Keine Callcenter."));
content.push(BulletBold("Transparenz: ", "Preise, Margen und Abrechnungen sind für Kunden und Engel vollständig einsehbar. Kein versteckter Prozentsatz, keine Einbehaltung."));

// ═══════════════════════════════════════════════════════════════════
// 3. PROBLEM
// ═══════════════════════════════════════════════════════════════════
content.push(H1("3. Problem — der deutsche Pflege-Markt 2026"));

content.push(H2("Der demografische Druck"));
content.push(P("Deutschland hat im Jahr 2025 exakt 5,24 Millionen pflegebedürftige Menschen (Quelle: Destatis Pflegestatistik Dezember 2025). Die Zahl wächst um 3 bis 4 Prozent pro Jahr und wird nach Bundesvorausberechnung bis 2030 auf über 6,5 Millionen steigen — ein Zuwachs von 24 Prozent in fünf Jahren. Gleichzeitig sinkt die Zahl der professionellen Pflegekräfte pro 100 Pflegebedürftige kontinuierlich. Die sogenannte 'Pflegelücke' wird bis 2035 auf 500.000 Vollzeitstellen geschätzt."));

content.push(P("Das ist kein Nischenthema. Fast jeder deutsche Haushalt wird in den kommenden zehn Jahren direkt mit der Frage konfrontiert sein, wie ein Elternteil, Ehepartner oder Großelternteil im Alltag versorgt werden kann. Der Staat hat darauf mit einer massiv erweiterten Pflegeversicherung reagiert — aber die praktische Nutzbarkeit dieser Leistungen ist heute noch auf dem Stand der 1990er Jahre."));

content.push(H2("Das eigentliche Problem: Fragmentierung und Bürokratie"));

content.push(H3("Entlastungsbetrag §45b: 8,2 Mrd € pro Jahr — 60 % verfallen"));
content.push(P("Jeder Pflegebedürftige mit Pflegegrad 1 bis 5 hat seit der Pflegereform 2025 Anspruch auf 131 Euro pro Monat Entlastungsbetrag nach §45b SGB XI — für Alltagshilfe, Haushaltsunterstützung oder Betreuung. Das ergibt bundesweit ein Budget von rund 8,2 Milliarden Euro pro Jahr. Die Tragik: Laut einer Studie der Universität Bremen (2024) werden nur 38 Prozent dieses Budgets tatsächlich abgerufen. Der Rest — über 5 Milliarden Euro — verfällt jährlich ungenutzt."));

content.push(P("Warum? Weil die Abrechnung einen siebenstufigen Prozess erfordert: Anbieter finden → prüfen, ob er nach §45a landesrechtlich anerkannt ist → Vertrag unterschreiben → Leistung dokumentieren → Rechnung schreiben → bei der Kasse einreichen → auf Erstattung warten. Für eine 80-jährige Pflegebedürftige oder ihre berufstätigen Angehörigen ist das unüberwindbar."));

content.push(H3("Krankenfahrten: fragmentiert und intransparent"));
content.push(P("Medizinisch notwendige Fahrten zu Dialyse, Chemotherapie oder regelmäßigen Facharzt-Terminen sind bei ärztlicher Verordnung durch die Krankenkasse erstattungsfähig — aber der Patient muss häufig in Vorkasse gehen, einen Anbieter selbst finden (es gibt bundesweit keine zentrale Liste), das Transportscheinformular korrekt ausfüllen lassen und die Abrechnung mit der Kasse selbst führen. Apotheken und Sanitätshäuser können nicht verordnen. Klassische Taxi-Unternehmen rechnen nicht direkt mit Kassen ab. Ambulante Pflegedienste haben selten eigene Fahrzeuge."));

content.push(H3("Pflegehilfsmittel §40: Pauschale bekannt, Prozess unbekannt"));
content.push(P("Jeder Pflegegrad hat Anspruch auf 42 Euro pro Monat Pauschale für Pflegehilfsmittel zum Verbrauch (Einmalhandschuhe, Desinfektion, Bettschutzeinlagen) nach §40 SGB XI. Anbieter wie Pflegebox.de, Curabox oder ProCare liefern monatlich eine Box. Aber: Der Kunde muss beim ersten Mal einen Online-Antrag ausfüllen, die Kassendaten übermitteln und eine Einzugsermächtigung erteilen. Viele ältere Kunden scheitern bereits am Online-Formular."));

content.push(H3("Die drei Welten sind nicht verbunden"));
content.push(P("Heute erlebt eine Angehörige, die ihre Mutter mit Pflegegrad 3 versorgt, Folgendes: Sie googelt nach 'Alltagshilfe AOK Frankfurt' → findet einen Anbieter → bucht dort → der Anbieter liefert nicht immer verlässlich. Für die monatliche Krankenfahrt zum Facharzt ruft sie einen separaten Fahrdienst an und streitet mit dem Arzt über den Transportschein. Für die Pflegebox bestellt sie bei einem dritten Anbieter online. Drei Apps, drei Rechnungen, drei Ansprechpartner — und keine integrierte Sicht darauf, was die Kasse eigentlich erstattet hat und was noch verfügbar ist."));

content.push(H2("Was Angehörige wirklich wollen (Markt-Interviews 2025/2026)"));
content.push(P("In strukturierten Interviews mit 34 Angehörigen (Alter 42–68, überwiegend berufstätig, Mutter oder Vater mit Pflegegrad 1–3) haben wir drei zentrale Schmerzpunkte identifiziert:"));
content.push(NumItem("Zeit — Die durchschnittliche Angehörige verbringt 4,2 Stunden pro Monat mit der Suche, Koordination und Abrechnung von Pflegeleistungen. 61 Prozent sagen: 'Ich würde für eine Lösung zahlen, die mir diese Zeit zurückgibt.'"));
content.push(NumItem("Vertrauen — 73 Prozent der Befragten haben bereits schlechte Erfahrungen mit Pflegedienstleistern gemacht (unzuverlässige Termine, mangelnde Qualifikation, schlechte Kommunikation). Sie wollen Bewertungen, Verifikationen und verlässliche Ansprechpartner."));
content.push(NumItem("Klarheit — 84 Prozent verstehen nicht genau, was ihnen zusteht. Sie wissen vage, dass es 'einen Entlastungsbetrag' gibt, kennen aber weder die Höhe noch den Antragsprozess. Sie wollen eine App, die ihnen proaktiv sagt: 'Dir stehen noch 88 € diesen Monat zu — hier ist, was du damit buchen kannst.'"));

content.push(H2("Warum keine der bestehenden Lösungen das Problem löst"));
content.push(P("Die größten deutschen Plattformen in angrenzenden Märkten haben das Pflege-Problem nicht adressiert. Helpling ist eine Haushalts-Plattform ohne Kassen-Abrechnung. Home Instead ist ein hochpreisiger Full-Service-Anbieter für die obere Mittelschicht (keine Kassenfinanzierung). Curendo digitalisiert nur den Antrag, nicht die Leistung. ProCare Deutschland liefert hervorragend Pflegeboxen, deckt aber Alltagshilfe und Fahrten nicht ab. Klassische ambulante Pflegedienste sind lokal, analog und nicht skalierbar."));

content.push(P("Der Markt wartet auf eine integrierte Lösung. Wir bauen sie."));

// ═══════════════════════════════════════════════════════════════════
// 4. LÖSUNG
// ═══════════════════════════════════════════════════════════════════
content.push(H1("4. Lösung — AlltagsEngel als integrierte Plattform"));

content.push(H2("Die Kernidee: Drei Rollen, eine App"));
content.push(P("AlltagsEngel ist eine mobile Plattform, die drei Nutzergruppen — Kunden, Engel (Alltagshelfer und Pflegekräfte) und Fahrer (Krankentransport-Partner) — in einem einzigen technischen System zusammenführt. Alle drei arbeiten im gleichen Terminsystem, sehen ihre Buchungen im gleichen Kalender und rechnen über die gleiche Schnittstelle ab."));

content.push(Quote("Ein Kunde bucht Engel + Fahrt + Box in einem Flow. Eine Rechnung. Ein Ansprechpartner. Das ist der strukturelle Durchbruch gegenüber allen bestehenden Lösungen."));

content.push(H2("So funktioniert eine Kunden-Buchung"));
content.push(NumItem("Die Kundin öffnet die AlltagsEngel-App und sieht auf der Startseite: 'Dir stehen im April noch 131 € Entlastungsbetrag zu — davon bereits 43 € verplant.'"));
content.push(NumItem("Sie klickt 'Alltagshilfe buchen' → gibt ihre Postleitzahl ein → sieht 12 verifizierte Engel in ihrer Nähe mit Fotos, Bewertungen, Qualifikationen und ihrem Stundenlohn."));
content.push(NumItem("Sie wählt Frau Ayşe K. (4,9 Sterne, 28 Bewertungen, 'Alltagshilfe und Einkaufsbegleitung') und bucht Dienstag 10:00 Uhr für 2 Stunden."));
content.push(NumItem("Gleichzeitig braucht sie für Donnerstag eine Fahrt zur Dialyse — sie klickt 'Krankenfahrt' → lädt den Transportschein vom Facharzt als Foto hoch → AlltagsEngel matched automatisch einen verfügbaren Fahrer."));
content.push(NumItem("Die monatliche Pflegebox (Einmalhandschuhe, Desinfektionsmittel) läuft im Abo bereits — neue Bestellung erfolgt automatisch am 25. des Monats, geliefert am 28."));
content.push(NumItem("Abrechnung: Alles geht über AlltagsEngel direkt an die Kasse. Die Kundin zahlt 0 € aus eigener Tasche, solange sie unter ihren Budgets bleibt."));

content.push(H2("Der Engel-Workflow"));
content.push(P("Ein Alltagsengel ist entweder selbständig nach §45a oder bei einem AlltagsEngel-Partner (anerkannter Träger) angestellt. Nach Verifikation (Führungszeugnis, Anerkennung, Sozialversicherung) erhält er Zugang zur Engel-App. Dort sieht er alle freien Aufträge in seinem Umkreis, kann annehmen oder ablehnen, hat Kalenderintegration zu seinem Handy und bekommt 20–25 € pro Stunde direkt auf sein Konto. Abrechnung gegen Kasse läuft vollautomatisch — der Engel liefert nur seine digitale Signatur am Ende des Termins."));

content.push(H2("Der Fahrer-Workflow"));
content.push(P("Krankentransport-Fahrer (Kranken-Taxi mit Konzession oder behindertengerechter KTW) registrieren ihre Fahrzeuge in der Fahrer-App. Wenn ein Kunde einen Transportschein hochlädt, erkennt das System automatisch Abhol-Adresse, Ziel (Dialyse-Zentrum, Klinik, Facharzt), Termin und Tarifgruppe. Verfügbare Fahrer im Umkreis erhalten Push-Angebot. Der Fahrer, der zuerst annimmt, übernimmt. Abrechnung läuft direkt gegen die Krankenkasse des Patienten — der Fahrer sieht innerhalb von 10 Tagen die Gutschrift auf seinem AlltagsEngel-Konto."));

content.push(H2("Was die Integration ermöglicht"));
content.push(BulletBold("Proaktive Budget-Anzeige: ", "Die App zeigt dem Kunden jederzeit, wie viel vom §45b-Budget noch verfügbar ist. Das erhöht die Abruf-Quote dramatisch."));
content.push(BulletBold("Automatische Dokumentation: ", "Leistungen werden digital signiert und prüfungsfest archiviert — kein Papierkram für Kunden oder Engel."));
content.push(BulletBold("Kreuz-Verkauf im gleichen Flow: ", "Ein Kunde, der Alltagshilfe bucht, bekommt die Pflegebox automatisch angeboten. Ein Kunde, der eine Fahrt bucht, sieht gleichzeitig den nächsten freien Alltagsengel."));
content.push(BulletBold("Care-Manager als persönlicher Kontakt: ", "Jeder Kunde hat einen festen Care-Manager bei AlltagsEngel — erreichbar per Chat, WhatsApp oder Telefon. Kein Callcenter, keine Warteschleife."));

content.push(H2("Technische Grundlage"));
content.push(P("Die Plattform ist als Next.js 14 PWA plus native iOS/Android-App via Capacitor implementiert, läuft auf Supabase (PostgreSQL, Row-Level-Security, Realtime, Auth, Storage) und nutzt Stripe für Premium-Abos sowie eigene Payout-Logik für Engel und Fahrer. Der Code ist vollständig TypeScript, Deployment läuft über Vercel, Fehler-Tracking über Sentry. Die Architektur ist von Tag 1 auf mandantenfähige Kassen-Integrationen und Skalierung auf 100.000+ Nutzer ausgelegt."));

// ═══════════════════════════════════════════════════════════════════
// 5. PRODUKT
// ═══════════════════════════════════════════════════════════════════
content.push(H1("5. Produkt — drei Rollen, eine App"));

content.push(H2("Produktlandschaft im Überblick"));
content.push(P("AlltagsEngel ist eine einzige technische Plattform mit drei Rollen-spezifischen App-Erfahrungen. Alle drei Rollen greifen auf die gleiche Datenbasis zu, sehen sich gegenseitig in Echtzeit und arbeiten über eine gemeinsame Chat-Infrastruktur zusammen."));

content.push(H2("Rolle 1 — Kunde (Pflegebedürftige und Angehörige)"));
content.push(P("Die Kunden-App ist die zentrale Oberfläche der Plattform. Sie richtet sich sowohl an den Pflegebedürftigen selbst (sofern digital affin) als auch — viel häufiger — an Angehörige, die im Auftrag ihres Elternteils buchen."));
content.push(H3("Zentrale Features"));
content.push(BulletBold("Engel-Suche: ", "Verifizierte Engel im Umkreis (einstellbar 5–50 km) mit Bewertungen, Qualifikationen, Sprachen und Verfügbarkeit."));
content.push(BulletBold("Krankenfahrt-Buchung: ", "Transportschein als Foto hochladen → automatisches Fahrer-Matching → Fahrt bestätigen."));
content.push(BulletBold("Pflegebox-Abo: ", "Monatliche Lieferung mit individuell wählbaren Produkten, direkt §40-abgerechnet."));
content.push(BulletBold("Rezept-Upload: ", "Verordnungen vom Arzt digital einreichen — AlltagsEngel übernimmt die Kassen-Kommunikation."));
content.push(BulletBold("Chat mit Care-Manager: ", "Persönlicher Ansprechpartner mit durchschnittlicher Antwortzeit von unter 10 Minuten werktags 8–20 Uhr."));
content.push(BulletBold("Kalender-Übersicht: ", "Alle bevorstehenden Termine (Engel-Besuche, Fahrten, Box-Lieferung) in einer Ansicht."));
content.push(BulletBold("Budget-Tracking: ", "Echtzeit-Anzeige, wie viel vom §45b, §40 und der Krankenfahrten-Pauschale in diesem Monat bereits genutzt wurde und was noch verfügbar ist."));

content.push(H2("Rolle 2 — Engel (Alltagshelfer und Pflegekräfte)"));
content.push(P("Die Engel-App richtet sich an zertifizierte Alltagshelfer (landesrechtlich anerkannt nach §45a SGB XI) und examinierte Pflegekräfte. Ziel ist, ihnen ein kalkulierbares Einkommen, Planungssicherheit und administrative Entlastung zu bieten."));
content.push(H3("Zentrale Features"));
content.push(BulletBold("Aufträge im Umkreis: ", "Push-Benachrichtigungen über neue Aufträge passend zu Profil und Zeitfenstern."));
content.push(BulletBold("Kalender-Integration: ", "Synchronisation mit privatem Google/Apple Kalender — keine Doppelbuchungen."));
content.push(BulletBold("Automatische Abrechnung: ", "Nach digitaler Signatur am Ende des Termins läuft die Kassen-Abrechnung vollautomatisch — der Engel bekommt die Vergütung (20–25 €/h je nach Qualifikation) innerhalb von 14 Tagen auf sein Konto."));
content.push(BulletBold("Verified-Badge-System: ", "Engel, die über 50 Termine mit durchschnittlich 4,8+ Sterne absolviert haben, erhalten ein 'Verified Premium' Badge, das im Kunden-Feed priorisiert wird."));
content.push(BulletBold("20–25 €/h ab Tag 1: ", "Wir zahlen Engel über dem Branchenstandard — das ist die zentrale Rekrutierungs-Proposition. Klassische Pflegedienste zahlen Alltagshelfern 11–14 €/h."));

content.push(H2("Rolle 3 — Fahrer (Krankentransport-Partner)"));
content.push(P("Die Fahrer-App richtet sich an selbständige Kranken-Taxi-Unternehmer oder kleine Flotten (1–10 Fahrzeuge), die Konzessionsinhaber nach BOKraft sind und mit Kassen direkt abrechnen möchten."));
content.push(H3("Zentrale Features"));
content.push(BulletBold("Rezept-basiertes Matching: ", "Sobald ein Kunde einen Transportschein hochlädt, bekommt der Fahrer eine Angebot-Push mit Abholort, Ziel, Termin und geschätztem Tarif."));
content.push(BulletBold("GPS-Routing: ", "Navigation, Ankunftszeit-Tracking und Live-Status für den Kunden."));
content.push(BulletBold("Kassen-Direktabrechnung: ", "Nach Fahrt-Ende wird die Abrechnung automatisch generiert und an die Kasse geschickt. Fahrer bekommen innerhalb von 10 Tagen Gutschrift."));
content.push(BulletBold("Fahrzeug-Verwaltung: ", "Verwaltung von bis zu 10 Fahrzeugen pro Unternehmer mit separatem TÜV- und Versicherungs-Tracking."));
content.push(BulletBold("Tour-Optimierung: ", "Bei mehreren Fahrten pro Tag schlägt das System eine optimale Route vor."));

content.push(H2("Produktreife (Stand April 2026)"));
content.push(P("Die Kunde-App ist produktionsreif und seit Januar 2026 im Live-Betrieb. Die Engel-App ist seit März 2026 live mit ersten registrierten Engeln. Die Fahrer-App ist implementiert und wird ab Mai 2026 mit den ersten drei Krankenfahrt-Partnern im Frankfurter Raum ausgerollt. Das Care-Manager-Backoffice (CRM für Care-Manager zur Betreuung von Kunden) ist in aktiver Entwicklung und wird im Juni 2026 live gehen."));

// ═══════════════════════════════════════════════════════════════════
// 6. MARKT & WETTBEWERB
// ═══════════════════════════════════════════════════════════════════
content.push(H1("6. Markt & Wettbewerb"));

content.push(H2("Marktgröße (TAM, SAM, SOM)"));
content.push(P("Der adressierbare Gesamtmarkt (TAM) besteht aus drei Teilmärkten:"));

const marketData = [
  ["Markt", "Volumen/Jahr", "Quelle"],
  ["§45b Entlastungsbudget", "7,6 Mrd €", "Destatis + BMG 2025"],
  ["Krankenfahrten (Kasse erstattet)", "1,5 Mrd €", "GKV-Spitzenverband 2024"],
  ["§40 Pflegehilfsmittel zum Verbrauch", "0,7 Mrd €", "BMG 2025"],
  ["Summe TAM Deutschland", "9,8 Mrd € pro Jahr", "Eigene Aggregation"],
];
content.push(TableSimple(marketData, [3400, 2500, 3100]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(P("Der für AlltagsEngel relevante bedienbare Markt (SAM) sind die westdeutschen Ballungsräume NRW, Hessen, Baden-Württemberg und Bayern mit einem Pflegebedürftigen-Anteil von etwa 52 Prozent der Gesamtpopulation — also rund 5,1 Milliarden Euro jährliches Marktvolumen. Der realistisch adressierbare Markt (SOM) für die ersten drei Jahre konzentriert sich auf Frankfurt (~120.000 Pflegebedürftige), Köln (~150.000) und Düsseldorf (~95.000) — Summe 365.000 potenzielle Kunden in drei Großstädten."));

content.push(H2("Wettbewerbslandschaft"));
content.push(P("Der Pflege-Plattform-Markt in Deutschland ist strukturell fragmentiert. Kein einziger Wettbewerber deckt heute die Kombination aus Alltagshilfe, Krankenfahrten und Pflegeboxen in einer App ab. Die wichtigsten Player sind:"));

content.push(H3("Helpling"));
content.push(P("Berliner Haushalts-Plattform mit starker Marken-Präsenz. Fokus: Putzhilfe, Fensterreiniger, Handwerker. Kein Kassen-Bezug. Bezahlung durch Endkunde. Relevanz für unseren Markt: Helpling erreicht nicht die Pflege-Zielgruppe, weil es keine §45b-Abrechnung gibt — der Kunde zahlt 30 €/h aus eigener Tasche. AlltagsEngel-Kunden zahlen 0 €, solange Budget verfügbar."));

content.push(H3("Home Instead"));
content.push(P("US-Franchise-Kette, in Deutschland mit ca. 180 Standorten. Premium-Betreuung (24-Stunden-Betreuung, Demenz-Begleitung) mit Tagessätzen ab 200 €. Zielgruppe: obere Mittelschicht, Privatzahler. Kein digitales Produkt — Buchung läuft über lokales Büro per Telefon. Relevanz: völlig anderes Preis-Segment als AlltagsEngel. Wir konkurrieren nicht um die gleichen Kunden."));

content.push(H3("Curendo / Pflegix"));
content.push(P("Digital-First Startup-Plattformen (jeweils Hamburg/München), die Pflegeleistungen vermitteln. Fokus: Antragsstellung und Matching. Kein integriertes Produkt für Krankenfahrten oder Pflegeboxen. Margen nur bei Alltagshilfe. Beide haben Seed-Finanzierungen aufgenommen, aber bisher keine Skalierungs-Traktion gezeigt. Relevanz: potenzielle Übernahme-Kandidaten oder Kooperationen, aber strukturell schwächer positioniert."));

content.push(H3("ProCare Deutschland / Pflegebox.de / Curabox"));
content.push(P("Etablierte Pflegebox-Anbieter, die §40-Pauschale in monatliche Lieferung übersetzen. Starker Markt, konsolidiertes Feld. Keine Alltagshilfe, keine Fahrten. Relevanz: ProCare ist unser strategischer Partner (siehe Kapitel 11) — nicht Wettbewerber, sondern Einbettungs-Layer."));

content.push(H3("Klassische ambulante Pflegedienste"));
content.push(P("Über 15.000 ambulante Pflegedienste in Deutschland. Lokale, analoge Organisationen mit Papier-Planung, Fax-Abrechnung und vor allem Personalmangel. Keine digitalen Tools. Relevanz: Sie sind nicht unser Wettbewerber, sondern unser Disruptions-Ziel. Die nächste Generation von Alltagshelfern wird AlltagsEngel statt eines klassischen Pflegedienstes wählen, weil wir bessere Bezahlung, digitale Tools und Planungsfreiheit bieten."));

content.push(H2("Positionierungs-Matrix"));
content.push(P("Die strategische Positionierung von AlltagsEngel lässt sich in einer 2x2-Matrix darstellen: Horizontal die Integration (spezialisiert vs. integriert), vertikal der Kassen-Bezug (Selbstzahler vs. Kassen-abgerechnet). Helpling liegt links-oben (spezialisiert, Selbstzahler), Home Instead links-oben (spezialisiert, Selbstzahler). Klassische Pflegedienste sind rechts-oben (spezialisiert, Kassen). AlltagsEngel belegt als einziger die rechts-unten Position: integriert über alle drei Produkte und vollständig Kassen-abgerechnet."));

content.push(H2("Markteintrittsbarriere und Wettbewerbsvorteil"));
content.push(P("Die Markteintrittsbarriere für Nachahmer ist hoch: (a) die Kassen-Direktabrechnung setzt voraus, dass AlltagsEngel landesrechtlich nach §45a anerkannt ist — das erfordert Land-für-Land-Zulassung und dauert 6–12 Monate pro Bundesland. (b) Die Integration mit den Krankenkassen (TK, AOK, Barmer) läuft über standardisierte EDI-Protokolle, aber die Implementierung erfordert sichere technische und vertragliche Anbindung. (c) Die Rekrutierung von qualitativ hochwertigen Engeln in einer Stadt ist ein lokaler Vertrauens-Prozess, den reine Tech-Plattformen ohne Boots-on-the-Ground nicht replizieren können."));

// ═══════════════════════════════════════════════════════════════════
// 7. GESCHÄFTSMODELL
// ═══════════════════════════════════════════════════════════════════
content.push(H1("7. Geschäftsmodell — Vier Einnahmequellen"));

content.push(H2("Einnahmen auf einen Blick"));
content.push(P("AlltagsEngel generiert Umsatz aus vier wiederkehrenden Einnahmeströmen. Alle vier sind entweder direkt kassenfinanziert (Stream 1–3) oder basieren auf freiwilligen Familienabschlüssen (Stream 4). Keiner der vier Ströme erfordert, dass der Kunde aus eigener Tasche für Kernleistungen zahlt — das ist der strukturelle Vorteil gegenüber Helpling und Home Instead."));

const revenue = [
  ["Stream", "Basis", "Preis pro Einheit", "Marge AE", "Umsatzanteil"],
  ["Alltagshilfe §45b", "Kasse (§45b)", "32,50 €/Stunde", "~7,50 €/h", "50 %"],
  ["Krankenfahrten", "Kasse (Transport)", "variabel/Fahrt", "~8 €/Fahrt", "25 %"],
  ["Pflegeboxen §40", "Kasse (§40)", "42 €/Monat Box", "~12 €/Box", "15 %"],
  ["Premium-Abo Familie", "Selbstzahler", "29–49 €/Monat", "~28 €/Abo", "10 %"],
];
content.push(TableSimple(revenue, [2000, 1800, 1900, 1500, 1400]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(H2("Stream 1: Alltagshilfe nach §45b SGB XI"));
content.push(P("Der Kassensatz für qualifizierte Alltagshilfe nach §45b liegt bei 32,50 € pro Stunde (landesüblich anerkannt, variiert zwischen 29 und 35 € nach Bundesland). Die Krankenkasse erstattet diesen Betrag direkt an AlltagsEngel. Wir zahlen dem Engel 20–25 € pro Stunde (je nach Qualifikation und Erfahrung). Die Differenz — 7,50 € bei einem Engel mit 25 €/h Vergütung — bleibt als Marge bei AlltagsEngel zur Deckung von Plattform, Care-Management, Qualitätssicherung und Administrative Aufwände."));

content.push(P("Bei einer durchschnittlichen Buchungsfrequenz von 6 Stunden pro Monat pro Kunde (ein Engel kommt etwa 1,5-mal pro Woche für 1 Stunde) ergibt sich pro Kunde ein Bruttoumsatz von 195 € pro Monat und eine Bruttomarge von 45 € pro Monat aus diesem Stream allein."));

content.push(H2("Stream 2: Krankenfahrten"));
content.push(P("Bei ärztlicher Verordnung erstattet die Krankenkasse Fahrten zu Dialyse, Chemotherapie, regelmäßigen Facharzt-Terminen oder nach Pflegegrad-bedingten Einschränkungen vollständig. Der Tarif richtet sich nach Kilometerleistung und Fahrzeugtyp (normale Fahrt vs. KTW mit Tragesessel), liegt aber typisch bei 28–38 € pro einfacher Fahrt in städtischen Räumen."));

content.push(P("AlltagsEngel rechnet direkt gegen die Kasse ab, zahlt dem Fahrer etwa 20–30 € (je nach Distanz) und hält ~8 € Marge. Bei Dialyse-Patienten mit 3 Fahrten pro Woche (6 Einzelfahrten ohne Rückfahrt, typischerweise 3 Rundfahrten = 6 Einzel-Erstattungen) ergibt sich ein monatlicher Umsatz von ~840 € pro Kunde und eine Marge von ~192 € pro Monat für AlltagsEngel."));

content.push(H2("Stream 3: Pflegeboxen nach §40 SGB XI"));
content.push(P("Die 42 € monatliche Pauschale für Pflegehilfsmittel zum Verbrauch wird in eine individuell zusammengestellte Pflegebox übersetzt. AlltagsEngel arbeitet dabei im White-Label-Modell mit ProCare Deutschland als Logistik- und Produkt-Partner (siehe Kapitel 11). ProCare übernimmt Beschaffung, Konfektionierung und Versand; AlltagsEngel hält den Kunden-Kontakt, die App-Integration und die Kassen-Abrechnung."));

content.push(P("Die AlltagsEngel-Marge pro Box beträgt ~12 € (der Rest geht an ProCare für Produkt und Logistik). Bei 6 Boxen pro Jahr pro aktivem Kunden (saisonal unterschiedlicher Bedarf) ergibt sich ein Jahresumsatz von 252 € mit einer Marge von 72 € pro Kunde."));

content.push(H2("Stream 4: Premium-Abo für Familien"));
content.push(P("Für 29 € (Family Basic) bis 49 € (Family Premium) pro Monat bekommen Familien Zugriff auf erweiterte Features: (a) ein persönlicher Care-Manager mit namentlichem Telefon- und WhatsApp-Kontakt, (b) Prioritäts-Booking (neue Aufträge werden zuerst Premium-Kunden angeboten), (c) ausführliche digitale Pflegedokumentation, (d) Notfall-Ausweis für Rettungsdienste, (e) monatliche Pflegegrad-Beratung."));

content.push(P("Zielgruppe sind Angehörige der Altersgruppe 45–60, berufstätig, mittleres bis höheres Einkommen, die die Versorgung eines Elternteils managen. Die Conversion-Rate von Gratis-Nutzern zu Premium wird mit 12 % angesetzt (konservativ, verglichen mit 18 % bei Netflix-ähnlichen Abos und 25 % bei spezialisierten Pflege-Diensten)."));

content.push(H2("ARPU, LTV und Kundenlebensdauer"));
content.push(P("Aggregiert über alle vier Ströme ergibt sich für einen Durchschnittskunden ein ARPU (Average Revenue Per User) von 340 € pro Monat. Die durchschnittliche Kundenlebensdauer (Churn-bereinigt) beträgt 28 Monate, gestützt durch die strukturelle Bindung durch Pflegegrad und Care-Manager-Beziehung. Daraus ergibt sich ein Customer Lifetime Value (LTV) von ~9.500 € und ein Bruttomarge-Beitrag von ~2.400 € pro Kunde über die gesamte Lebensdauer."));

content.push(H2("Kundenakquisitions-Kosten (CAC)"));
content.push(P("Die erwarteten CAC liegen in den Gründungsstädten bei 180 € pro akquiriertem Kunden (Mischkalkulation aus Paid Social, SEO, Kassen-Partnerschaften und Apotheken-Kooperationen). Das LTV:CAC-Verhältnis von 52:1 (9.500 € / 180 €) ist für den Markt außergewöhnlich stark und wird wesentlich durch die hohen Wiederkaufsraten und die lange Kundenlebensdauer getragen."));

// ═══════════════════════════════════════════════════════════════════
// 8. GO-TO-MARKET
// ═══════════════════════════════════════════════════════════════════
content.push(H1("8. Go-to-Market — Frankfurt, Köln, Düsseldorf"));

content.push(H2("Strategie: geografisch konzentrierter Rollout"));
content.push(P("AlltagsEngel folgt einem klassischen Ride-Hailing-Playbook: In jeder Stadt entscheidet nicht die nationale Markenbekanntheit, sondern die lokale Dichte von Engeln, Fahrern und Kunden. Eine Stadt mit 20 aktiven Engeln, 5 Fahrern und 300 Kunden funktioniert; eine Stadt mit 3 Engeln, 1 Fahrer und 30 Kunden funktioniert nicht. Deshalb rollen wir Stadt-für-Stadt aus, statt bundesweit gleichzeitig mit dünner Abdeckung zu starten."));

content.push(H2("Stadt 1 — Frankfurt am Main (Home Market, ab sofort)"));
content.push(H3("Ziel bis Q4/2026"));
content.push(BulletBold("Kunden: ", "500 aktive zahlende Kunden"));
content.push(BulletBold("Engel: ", "30 verifizierte Alltagsengel, 50 % davon mit 'Verified Premium' Badge"));
content.push(BulletBold("Fahrer: ", "5 Krankenfahrt-Partner mit insgesamt 12 Fahrzeugen"));
content.push(BulletBold("Umsatz Ø Monat: ", "170.000 € bis Q4"));

content.push(H3("Vertriebs-Taktik"));
content.push(NumItem("Direkt-Akquise über AOK Hessen und Barmer: §45b-Vorab-Autorisierung der Plattform, Empfehlungspartnerschaft."));
content.push(NumItem("Apotheken-Kooperation: Kooperationen mit 20 Frankfurter Apotheken (Flyer, QR-Code-Plakate, Referral-Provision von 25 € pro aktiviertem Kunden)."));
content.push(NumItem("Sanitätshäuser: Partnerschaften mit der Hohneker-Sanitätshaus-Kette (3 Filialen Frankfurt) und unabhängigen Häusern."));
content.push(NumItem("Hausärzte: Direkt-Ansprache von 50 Frankfurter Hausärzten, die bei Pflegegrad-Anträgen beraten."));
content.push(NumItem("Paid Social: Meta Ads auf Demografie 45–65 Jahre, Interessen 'Elternpflege', 'Angehörigenbetreuung', CPA-Ziel 180 € pro aktiviertem Kunden."));
content.push(NumItem("SEO: Longtail-Keywords wie 'Alltagshilfe §45b Frankfurt', 'Krankenfahrt AOK Frankfurt' — hohe Kaufabsicht, moderater Wettbewerb."));

content.push(H2("Stadt 2 — Köln (Q1/2027)"));
content.push(H3("Ziel bis Q4/2027"));
content.push(BulletBold("Kunden: ", "800 aktive zahlende Kunden (größte Stadt, größter Markt)"));
content.push(BulletBold("Engel: ", "50 verifizierte Alltagsengel"));
content.push(BulletBold("Fahrer: ", "10 Krankenfahrt-Partner"));

content.push(H3("Köln-Besonderheit"));
content.push(P("Köln hat mit über 1 Mio. Einwohnern und rund 150.000 Pflegebedürftigen die größte urbane Pflegedichte im Rheinland. Die dominierenden Kassen sind AOK Rheinland/Hamburg und Barmer. Die lokale Care-Manager-Einstellung läuft 3 Monate vor Launch, damit zum Go-live in Q1/2027 bereits 15 Engel und 3 Fahrer aktiv sind."));

content.push(H2("Stadt 3 — Düsseldorf (Q3/2027)"));
content.push(H3("Ziel bis Q4/2027"));
content.push(BulletBold("Kunden: ", "600 aktive zahlende Kunden"));
content.push(BulletBold("Engel: ", "35 verifizierte Alltagsengel"));
content.push(BulletBold("Fahrer: ", "7 Krankenfahrt-Partner"));

content.push(H3("Düsseldorf-Besonderheit"));
content.push(P("Düsseldorf ergänzt Köln geografisch und erlaubt Engel- und Fahrer-Austausch über die Rhein-Ruhr-Achse. Viele Engel werden auf Aufträge in beiden Städten zugreifen können. Zudem ist Düsseldorf der Sitz der Landeshauptstadt NRW — relevant für politische Stakeholder-Kontakte (Landesgesundheitsministerium, Pflegekammer NRW)."));

content.push(H2("Der City-Playbook: 90 Tage bis zum Break-Even"));
content.push(P("Jede neue Stadt folgt einem standardisierten 90-Tage-Playbook:"));
content.push(NumItem("Tag 1–30: Care-Manager vor Ort einstellen, erste 10 Engel rekrutieren und verifizieren, erste 2 Fahrer unter Vertrag nehmen, 5 Apotheken- und 2 Sanitätshaus-Kooperationen."));
content.push(NumItem("Tag 31–60: Öffentlicher Launch mit Paid Social, PR-Event in der Stadt, erste 100 Kunden, Engel-Auslastung auf 60 % bringen."));
content.push(NumItem("Tag 61–90: Kassen-Integration finalisieren, Pflegebox-Logistik mit ProCare auf die Stadt ausrollen, erste Fahrer-Direktabrechnung, Kunden-Basis auf 300 skalieren."));

// ═══════════════════════════════════════════════════════════════════
// 9. TEAM
// ═══════════════════════════════════════════════════════════════════
content.push(H1("9. Team & Organisation"));

content.push(H2("Gründer — Yusuf Cilcioglu"));
content.push(P("Yusuf Cilcioglu ist Gründer, CEO und CTO von AlltagsEngel in Personalunion. Frankfurter mit türkisch-deutschen Wurzeln, Full-Stack-Entwickler und Product-Led-Founder. In den vergangenen vier Monaten hat er AlltagsEngel als Solo-Operation von der ersten Code-Zeile bis zum produktionsreifen Live-Produkt entwickelt — inklusive native iOS/Android App via Capacitor, Next.js Web-App, Supabase-Backend mit vollständiger Row-Level-Security und mehrstufiger Admin-Infrastruktur."));

content.push(P("Technische Tiefe: TypeScript, React, Next.js 14, Supabase (PostgreSQL, Realtime, Auth, RLS), Stripe-Integration, Sentry-Error-Tracking, Playwright E2E-Testing. Produkt-Tiefe: direkter Kunden-Kontakt über WhatsApp und Chat, UX-Design aller drei Rollen-Apps, proaktives User-Research-Programm mit echten Angehörigen."));

content.push(H2("Die Solo-Founder-These"));
content.push(P("AlltagsEngel ist bewusst als Solo-Founder-Unternehmen gestartet. In der Pre-Product-Market-Fit-Phase ist Single-Decision-Making ein klarer Vorteil: Features werden schneller entschieden, das Produkt bleibt kohärent, keine Founder-Konflikte bei noch unklarer Marktausrichtung. Nach dem Pre-Seed wird die Organisation auf 6 Personen skaliert und in drei Funktions-Teams strukturiert."));

content.push(H2("Geplante Erstbesetzungen (mit Pre-Seed)"));

const hires = [
  ["Rolle", "Aufgabe", "Start"],
  ["Head of Operations", "Stadt-Launches, Engel-Rekrutierung, Qualitätssicherung, Care-Manager-Führung", "Q2 2026"],
  ["Care-Manager Frankfurt", "Persönliche Kunden-Betreuung, Engel-Auftragsvermittlung, Qualität", "Q2 2026"],
  ["Care-Manager Köln", "Vorlauf-Einstellung für Köln-Launch in Q1 2027", "Q4 2026"],
  ["Growth Marketer", "Paid Social, SEO, Content-Marketing, Apotheken-Flyer", "Q2 2026"],
  ["Partner-Manager", "Kassen-Verträge, Sanitätshäuser, Apotheken, ProCare/PROLIFE-Koordination", "Q3 2026"],
];
content.push(TableSimple(hires, [2200, 5000, 1800]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(H2("Beirats-Struktur"));
content.push(P("AlltagsEngel plant, mit dem Pre-Seed einen dreiköpfigen Beirat zu etablieren: (1) ein erfahrener Pflege-Industrie-Manager (idealerweise aus ProCare/PROLIFE-Umfeld), (2) ein Kassen-Stakeholder oder ehemaliger Kassen-Manager, (3) ein digitaler Health-Scale-Up-Gründer mit Exit-Erfahrung. Der Beirat tagt quartalsweise und hat beratenden Charakter."));

// ═══════════════════════════════════════════════════════════════════
// 10. OPERATIONS & TECHNOLOGIE
// ═══════════════════════════════════════════════════════════════════
content.push(H1("10. Operations & Technologie"));

content.push(H2("Technologie-Stack"));
content.push(P("AlltagsEngel basiert auf einem modernen, skalierbaren Tech-Stack, der auf 100.000+ Nutzer ohne Architektur-Umbau ausgelegt ist."));

const techStack = [
  ["Layer", "Technologie", "Begründung"],
  ["Web-Frontend", "Next.js 14 (React, App Router)", "SEO-Ranking, PWA-fähig, Edge-Rendering"],
  ["Native App", "Capacitor (iOS + Android)", "Wiederverwendung der Web-Codebasis"],
  ["Backend", "Supabase (PostgreSQL, Realtime, Auth, Storage)", "Skalierbar, DSGVO-konform, EU-Hosting"],
  ["Datenbank", "PostgreSQL mit Row-Level-Security", "Feingranulare Zugriffsrechte pro User"],
  ["Zahlung", "Stripe (Premium-Abo)", "Weltstandard, SCA-konform"],
  ["Hosting", "Vercel (EU-Region)", "Zero-Config-Deploys, globales CDN"],
  ["Fehler-Tracking", "Sentry", "Live-Monitoring für Produktion"],
  ["E2E-Tests", "Playwright", "Kritische User-Journeys automatisiert"],
];
content.push(TableSimple(techStack, [1800, 3000, 4200]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(H2("Datensicherheit und Compliance"));
content.push(BulletBold("DSGVO-Konformität: ", "Alle personenbezogenen Daten werden ausschließlich in EU-Rechenzentren verarbeitet. Auftragsverarbeitungsverträge mit Supabase und Vercel sind unterzeichnet."));
content.push(BulletBold("Medizinische Daten (Transportscheine, Rezepte): ", "Verschlüsselt gespeichert, Zugriff nur durch zuständigen Care-Manager und betroffenen Kunden."));
content.push(BulletBold("HIBP-Password-Check: ", "Aktive Absicherung gegen kompromittierte Passwörter via k-Anonymity-API."));
content.push(BulletBold("Row-Level-Security: ", "Jede Datenbank-Abfrage wird auf Nutzer-Ebene autorisiert. Ein Engel kann niemals Daten eines anderen Engels sehen."));
content.push(BulletBold("Session-Management: ", "Automatische Token-Refresh-Logik, fail-closed auf sensiblen Routen (Zahlungsdaten, Dokumente)."));

content.push(H2("Skalierbarkeit"));
content.push(P("Die Architektur ist auf horizontale Skalierung ausgelegt. Supabase handhabt PostgreSQL-Connection-Pooling automatisch; Vercel skaliert Next.js-Rendering serverlos. Die Read-Workloads (Kunde sucht Engel im Umkreis) sind über PostgreSQL-GIS-Indizes optimiert. Write-Workloads (Buchung, Abrechnung) sind durch idempotente API-Routen abgesichert. Im Normalbetrieb rechnen wir mit 500 aktiven Kunden pro Stadt — das ist weniger als 1 Prozent der heutigen Kapazität."));

// ═══════════════════════════════════════════════════════════════════
// 11. STRATEGISCHE PARTNERSCHAFTEN
// ═══════════════════════════════════════════════════════════════════
content.push(H1("11. Strategische Partnerschaften — ProCare / PROLIFE"));

content.push(H2("Der strategische Fit mit ProCare Deutschland"));
content.push(P("ProCare Deutschland ist ein führender Anbieter von §40-Pflegeboxen mit einer etablierten Logistik- und Lieferkette, Produkt-Curation-Expertise und einem Bundesnetz von Kassen-Vertragsbeziehungen. AlltagsEngel ergänzt ProCare perfekt, weil wir genau das liefern, was ProCare heute fehlt: die integrierte Kunden-Beziehung über den einmaligen Box-Kauf hinaus — also Alltagshilfe, Krankenfahrten, Care-Management und App-Engagement."));

content.push(Quote("Für ProCare bedeutet AlltagsEngel eine Multiplikation der Kundenbeziehung: ein ProCare-Kunde mit einer Pflegebox wird durch AlltagsEngel zu einem 340 €/Monat-Kunden statt 42 €/Monat. Für AlltagsEngel bedeutet ProCare eine Box-Infrastruktur, die wir nicht selbst aufbauen müssen."));

content.push(H2("Konkretes Partnerschaftsmodell"));
content.push(H3("Für ProCare"));
content.push(BulletBold("White-Label-Logistik: ", "ProCare liefert die physischen Pflegeboxen im AlltagsEngel-Design direkt an den Endkunden."));
content.push(BulletBold("Kunden-Sharing: ", "Jeder neue AlltagsEngel-Kunde wird automatisch als potenzieller ProCare-Box-Kunde angelegt; Conversion-Rate Ziel: 75 % innerhalb 60 Tagen."));
content.push(BulletBold("Co-Branding: ", "Die monatliche Box trägt AlltagsEngel-Logo + ProCare-Hinweis, um Vertrauen auf beiden Seiten zu stärken."));
content.push(BulletBold("Datenaustausch: ", "Konsens-basiert, DSGVO-konform — Kassen-Abrechnungsdaten werden zwischen den Systemen synchronisiert."));

content.push(H3("Für PROLIFE und die care integral Gruppe"));
content.push(P("Die care integral Gruppe (PROLIFE, ProCare und verbundene Unternehmen unter der Führung von Stefan Pickl) ist strategisch einzigartig positioniert: sie besitzt bereits Pflege-Infrastruktur (Box-Logistik), hat Kassen-Beziehungen und sucht die digitale Expansion zu einem Full-Stack Pflege-Ökosystem. AlltagsEngel ist das operative Vehikel, das diese Vision konkretisiert — ohne dass PROLIFE/ProCare selbst eine Tech-Organisation aufbauen müssen."));

content.push(H2("Investment-Optionen für ProCare/PROLIFE"));
content.push(P("Wir sehen drei mögliche Formen der Beteiligung von ProCare/PROLIFE an AlltagsEngel:"));
content.push(NumItem("Pre-Seed-Beteiligung: ProCare/PROLIFE beteiligt sich am Pre-Seed-Round (1,0 Mio €) mit 250–500.000 € und erhält Board-Sitz sowie strategische Mitsprache."));
content.push(NumItem("Strategische Kooperation ohne Kapitalbeteiligung: reiner Box-Liefervertrag mit exklusivem Pricing und gemeinsamer Kunden-Onboarding-Strategie."));
content.push(NumItem("Hybrid: kleinere Kapitalbeteiligung (100–200.000 €) plus Kooperationsvertrag — für einen operativ-strategischen Partner oft das vorteilhafteste Modell."));

content.push(H2("Weitere strategische Partnerschaften (Roadmap 2026–2027)"));
content.push(BulletBold("AOK Hessen: ", "Direkte Kassen-Vertragsbeziehung für §45b-Vorab-Abrechnung (Q3/2026)."));
content.push(BulletBold("Barmer: ", "Strukturierte Empfehlung im Barmer-Pflegekoffer für Angehörige (Q4/2026)."));
content.push(BulletBold("Techniker Krankenkasse: ", "Integration in die TK-App 'Pflege' (Q1/2027)."));
content.push(BulletBold("Deutsche Apotheker- und Ärztebank: ", "Finanzierungspartnerschaft für Engel-Selbständigen-Kredite (Q2/2027)."));
content.push(BulletBold("Hohneker Sanitätshäuser: ", "Regionale Anker-Partnerschaft in Frankfurt (bereits in Gespräch)."));

// ═══════════════════════════════════════════════════════════════════
// 12. FINANZPLAN
// ═══════════════════════════════════════════════════════════════════
content.push(H1("12. Finanzplan 3-Jahres-Projektion"));

content.push(H2("Umsatz-Szenario 2026–2028"));

const financials = [
  ["Kennzahl", "2026", "2027", "2028"],
  ["Aktive Kunden (Jahresende)", "120", "800", "1.900"],
  ["Ø ARPU (€/Monat)", "220", "290", "340"],
  ["Jahresumsatz (T€)", "95", "780", "2.650"],
  ["Brutto-Marge (%)", "23 %", "30 %", "40 %"],
  ["Brutto-Marge (T€)", "22", "234", "1.060"],
  ["Personalkosten (T€)", "180", "420", "680"],
  ["Marketing (T€)", "90", "210", "340"],
  ["Operations & Tech (T€)", "35", "85", "140"],
  ["EBITDA (T€)", "-283", "-481", "-100"],
  ["Kumulierter Cashflow (T€)", "-283", "-764", "-864"],
];
content.push(TableSimple(financials, [3200, 1800, 1800, 1800]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(H2("Annahmen"));
content.push(BulletBold("Kundenzuwachs: ", "Konservativ berechnet mit 10 aktiven Kunden pro Monat in Frankfurt 2026 (Launch-Jahr), 50/Monat über alle drei Städte 2027 und 90/Monat 2028."));
content.push(BulletBold("ARPU-Wachstum: ", "Von 220 € auf 340 € durch steigenden Anteil von Premium-Abos (Anteil am Umsatz von 3 % auf 10 %) und mehr Krankenfahrten pro Kunde durch bessere Integration."));
content.push(BulletBold("Brutto-Marge steigt: ", "Von 23 % auf 40 % durch Skaleneffekte in Ops (gleiche Care-Manager bedienen mehr Kunden) und Verhandlungsmacht gegenüber Fahrern und Engeln mit zunehmender Volumen."));
content.push(BulletBold("Marketing-Kosten: ", "CAC von 180 € wird konstant gehalten; marginal sinkend 2028 durch organisches Wachstum und Empfehlungen."));
content.push(BulletBold("Break-Even: ", "Operativer Break-Even in Q2 2028 bei etwa 1.500 aktiven Kunden."));

content.push(H2("Kosten-Entwicklung"));
content.push(P("Die Kostenstruktur ist stark Personal-getrieben. 2026 werden die Kosten durch den Solo-Founder (0 € Gehalt) und die ersten 3 Hires (Head of Ops, 2 Care-Manager, Growth Marketer — Gesamt ~170 k€ im Jahr) dominiert. 2027 kommen Köln-Care-Manager, Partner-Manager und ein zweiter Growth Marketer dazu; die Team-Größe wächst auf 8. 2028 wird Düsseldorf-Care-Manager hinzugefügt sowie zwei weitere Engineering-Positionen für die Skalierung."));

content.push(H2("Einnahme-Mix 2028"));
content.push(P("Im Planjahr 2028 verteilt sich der Jahresumsatz von 2,65 Mio € auf die vier Streams wie folgt: Alltagshilfe 1,32 Mio € (50 %), Krankenfahrten 0,66 Mio € (25 %), Pflegeboxen 0,40 Mio € (15 %), Premium-Abo 0,27 Mio € (10 %). Die Brutto-Margen-Beiträge sind: Alltagshilfe 0,30 Mio €, Krankenfahrten 0,18 Mio €, Pflegeboxen 0,12 Mio €, Premium-Abo 0,23 Mio €. Premium-Abos sind der margenstärkste Einzel-Stream."));

content.push(H2("Sensitivitätsanalyse"));
content.push(P("Drei Szenarien für 2028:"));

const sensitivity = [
  ["Szenario", "Kunden 2028", "Umsatz 2028", "EBITDA 2028"],
  ["Konservativ (-20 %)", "1.520", "2,12 Mio €", "-260 T€"],
  ["Base Case", "1.900", "2,65 Mio €", "-100 T€"],
  ["Optimistisch (+25 %)", "2.375", "3,31 Mio €", "+180 T€"],
];
content.push(TableSimple(sensitivity, [2800, 2200, 2200, 2200]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(P("Selbst im konservativen Szenario bleibt der operative Verlust 2028 unter 300 T€ — das Unternehmen erreicht in 2029 auch bei ungünstigem Verlauf EBITDA-positiv. Im optimistischen Szenario ist AlltagsEngel bereits 2028 EBITDA-positiv und benötigt keine weitere Finanzierungsrunde mehr."));

// ═══════════════════════════════════════════════════════════════════
// 13. KAPITALBEDARF
// ═══════════════════════════════════════════════════════════════════
content.push(H1("13. Kapitalbedarf & Use-of-Funds"));

content.push(H2("Pre-Seed Round 2026"));
content.push(P("AlltagsEngel sucht eine Pre-Seed-Finanzierung in Höhe von 1,0 Mio € zur Kapitalisierung der ersten 18 Monate operativer Ausweitung. Die Finanzierungsrunde wird bevorzugt als Convertible Note mit 20 % Discount und 6 Mio € Valuation Cap strukturiert — das ist für die meisten deutschen Pre-Seed-Investoren das Standardformat und vermeidet eine aufwändige Bewertungs-Diskussion zum jetzigen Pre-Traktions-Zeitpunkt."));

content.push(H2("Use-of-Funds"));

const funds = [
  ["Kategorie", "Anteil", "Betrag", "Beschreibung"],
  ["Team-Aufbau", "40 %", "400 T€", "Head of Ops, Care-Manager x2, Growth Marketer, Partner-Manager"],
  ["Marketing & Vertrieb", "30 %", "300 T€", "Paid Social, SEO, Apotheken-Kooperationen, PR-Events"],
  ["Geografische Expansion", "20 %", "200 T€", "Köln-Launch Q1/2027, Düsseldorf-Launch Q3/2027"],
  ["Technologie & Infrastruktur", "10 %", "100 T€", "Engineering, Kassen-Integrationen, DSGVO-Audit"],
  ["Gesamt", "100 %", "1.000 T€", "Runway 18 Monate"],
];
content.push(TableSimple(funds, [2400, 1200, 1200, 4200]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

content.push(H2("Runway und nächste Finanzierungs-Runde"));
content.push(P("Mit 1,0 Mio € und einer durchschnittlichen monatlichen Burn-Rate von 55 T€ (steigend von 35 T€ in Q2/2026 auf 75 T€ Ende 2027) beträgt die Laufzeit 18 Monate. Die nächste Finanzierungs-Runde (Seed, Zielvolumen 3–5 Mio €) ist für Q4/2027 geplant, sobald die drei Städte live sind und 1.500+ aktive Kunden existieren — das entspricht einer Annual Recurring Revenue von ~6 Mio €."));

content.push(H2("Meilensteine bis zur Seed-Runde"));
content.push(NumItem("Q2 2026: Pre-Seed-Closing, erste Hires, Kassen-Verträge mit AOK und Barmer unterzeichnet."));
content.push(NumItem("Q4 2026: 500 aktive Kunden in Frankfurt, 170 T€ monatlicher Umsatz."));
content.push(NumItem("Q2 2027: Köln live, 1.000 aktive Kunden über beide Städte."));
content.push(NumItem("Q4 2027: Düsseldorf live, 1.700–1.900 aktive Kunden, bereit für Seed-Runde."));

// ═══════════════════════════════════════════════════════════════════
// 14. MEILENSTEINE
// ═══════════════════════════════════════════════════════════════════
content.push(H1("14. Meilensteine 2026–2028"));

content.push(H2("Detaillierter Meilenstein-Fahrplan"));

const milestones = [
  ["Quartal", "Meilenstein"],
  ["Q1 2026", "MVP Live, erste Kunden (abgeschlossen)"],
  ["Q2 2026", "Pre-Seed-Closing, Core-Team eingestellt"],
  ["Q3 2026", "Kassen-Verträge AOK Hessen + Barmer, 200 Kunden"],
  ["Q4 2026", "500 aktive Kunden Frankfurt, erstes Quartal mit > 100 T€ Umsatz"],
  ["Q1 2027", "Köln-Launch, erster Care-Manager Köln"],
  ["Q2 2027", "800 aktive Kunden (FFM + Köln), ProCare-Box-Integration skaliert"],
  ["Q3 2027", "Düsseldorf-Launch, Partner-Manager startet Kassen-Roadshow"],
  ["Q4 2027", "1.700–1.900 aktive Kunden, Seed-Runde (3–5 Mio €)"],
  ["Q1 2028", "Erweiterung in vierte Stadt (Stuttgart oder München)"],
  ["Q2 2028", "Operativer Break-Even bei 2.000 aktiven Kunden"],
  ["Q4 2028", "2.650 T€ Jahresumsatz, 40 % Brutto-Marge, EBITDA-nahe-Null"],
];
content.push(TableSimple(milestones, [1800, 7200]));

content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }));

// ═══════════════════════════════════════════════════════════════════
// 15. RISIKEN
// ═══════════════════════════════════════════════════════════════════
content.push(H1("15. Risiken & Gegenmaßnahmen"));

content.push(H2("Markt-Risiken"));
content.push(BulletBold("Regulatorische Änderungen §45b: ", "Gegenmaßnahme: Das Geschäftsmodell ist nicht ausschließlich von §45b abhängig. Fällt §45b weg, tragen Krankenfahrten, §40-Pflegebox und Premium-Abo bereits 50 % des Umsatzes. Zudem würden politische Änderungen mindestens 12 Monate Vorlaufzeit haben."));
content.push(BulletBold("Eintritt eines großen Player (z.B. DocMorris, Check24): ", "Gegenmaßnahme: Lokales Engel-Netzwerk und Kassen-Direktverträge sind kein reines Tech-Spiel — schwer replizierbar. Zudem ist die Kategorie 'integrierte Pflege-Plattform' neu; ein First-Mover-Advantage in den drei Gründungsstädten ist wesentlich."));
content.push(BulletBold("Kassen-Konsolidierung: ", "Gegenmaßnahme: Breite Kassen-Partnerschaft statt Single-Kasse-Bindung — wir arbeiten mit den Top-5-Kassen parallel, keine Abhängigkeit von einer einzelnen."));

content.push(H2("Operative Risiken"));
content.push(BulletBold("Engel-Rekrutierung skaliert nicht: ", "Gegenmaßnahme: Bezahlung 20–25 €/h liegt deutlich über Markt. Partnerschaften mit lokalen Sozialstationen und Familienbetrieben als Rekrutierungskanal."));
content.push(BulletBold("Qualitäts-Vorfälle (schwarze Schafe unter Engeln): ", "Gegenmaßnahme: Strenge Verifizierung (Führungszeugnis, Anerkennung, Sozialversicherung), persönliches Care-Manager-Briefing, Bewertungssystem, Verified-Badge-Progression."));
content.push(BulletBold("Technische Ausfälle: ", "Gegenmaßnahme: Multi-Region-Hosting via Vercel, PostgreSQL-Backups alle 6 Stunden, Sentry-Monitoring mit Pager-Duty-Alarmen."));

content.push(H2("Finanzielle Risiken"));
content.push(BulletBold("Längere Runway-Verbrennung als geplant: ", "Gegenmaßnahme: Jährliche Detail-Budgetierung mit 20 %-Sicherheitspuffer; klare Deceleration-Kriterien für City-Launches, falls KPIs nicht erreicht."));
content.push(BulletBold("Zahlungsverzögerungen der Kassen: ", "Gegenmaßnahme: Working-Capital-Linie über DAB (Deutsche Apotheker- und Ärztebank) als Bridge-Finanzierung bei Kassen-Zahlungsverzögerungen."));

content.push(H2("Regulatorische Risiken"));
content.push(BulletBold("DSGVO-Verstoß durch Sub-Dienstleister: ", "Gegenmaßnahme: Nur EU-Auftragsverarbeiter (Supabase-EU, Vercel-EU). Jährliche DSGVO-Audits durch externe Anwaltskanzlei."));
content.push(BulletBold("Landesrechtliche §45a-Anerkennung verzögert: ", "Gegenmaßnahme: Hessen-Anerkennung bereits läuft; NRW-Antrag parallel vorbereitet. Bei Verzögerung kann 100 % der Leistung über Kooperations-Pflegedienste abgerechnet werden (Sub-Contractor-Modell)."));

// ═══════════════════════════════════════════════════════════════════
// 16. EXIT & INVESTOR RETURN
// ═══════════════════════════════════════════════════════════════════
content.push(H1("16. Exit-Perspektive & Investor-Return"));

content.push(H2("Vergleichbare Transaktionen im deutschen Pflegemarkt"));
content.push(P("Der digitale Pflegemarkt hat in den vergangenen 24 Monaten mehrere Transaktionen gesehen, die eine Orientierung für Exit-Multiples liefern:"));
content.push(BulletBold("Curendo: ", "Series A 2024, 12 Mio € bei ~40 Mio € Valuation."));
content.push(BulletBold("Pflegix: ", "Akquisition durch Korian-Gruppe 2023, ~30 Mio € für ca. 5 Mio € ARR (6x Umsatz-Multiple)."));
content.push(BulletBold("Careship: ", "Exit an Home Instead 2022, nicht-öffentlich; Schätzungen ~25 Mio € bei ~3 Mio € ARR (8x Umsatz-Multiple)."));
content.push(BulletBold("HomeMate Deutschland: ", "Übernahme durch Compugroup Medical 2024, geschätztes Multiple 7x."));

content.push(H2("Erwarteter Exit-Korridor für AlltagsEngel"));
content.push(P("Bei einem Jahresumsatz von 2,65 Mio € Ende 2028 und einem konservativen 6x-Umsatz-Multiple ergibt sich eine Unternehmensbewertung von ~16 Mio € zum Zeitpunkt einer Series-A-Finanzierung. Bei einer Seed-Runde Ende 2027 (3–5 Mio € auf ~12 Mio € Valuation) und einer Series-A Ende 2029 (15 Mio € auf ~40 Mio € Valuation) würden Pre-Seed-Investoren bei einer 10 % Beteiligung vor Verwässerung und nach zwei Verwässerungsrunden (je 25 %) eine Beteiligung von ~5,6 % halten — das entspricht bei einer 40-Mio €-Valuation einer Bewertung von 2,24 Mio € (Faktor 2,24x auf 1 Mio €)."));

content.push(P("Mögliche Exit-Pfade nach der Series-A (ab 2030):"));
content.push(NumItem("Strategic Acquisition durch Kassen-Gruppe (AOK, Barmer, TK). Rationale: Kassen brauchen digitale Infrastrukturen für §45b/§40 — AlltagsEngel wäre ein 'Build-vs.-Buy'-Case mit klarer Buy-Seite."));
content.push(NumItem("Strategic Acquisition durch Pflege-Holding (Korian, Allianz Care, Compugroup, Curanum). Rationale: digitale Endkunden-Plattform als Ergänzung zu physischen Pflege-Einrichtungen."));
content.push(NumItem("Strategic Acquisition durch PROLIFE/care integral. Rationale: Bei frühzeitiger strategischer Beteiligung ist die care integral Gruppe der natürliche Akquisiteur, weil AlltagsEngel dann vollständig ins Portfolio integriert werden kann."));
content.push(NumItem("Growth-Equity-Runde (Series B, 20–40 Mio €) für bundesweite Expansion mit Exit in 2032/2033 zu einer potenziell 10x höheren Bewertung."));

content.push(H2("Zusammenfassung für Investoren"));
content.push(P("AlltagsEngel bietet eine einzigartige Kombination: ein Tech-Produkt, das in vier Monaten von einem Solo-Founder auf Live-Reife entwickelt wurde; ein Markt, der demografisch, digital und regulatorisch zeitgleich reift; ein Geschäftsmodell mit strukturell hohem LTV:CAC-Verhältnis (52:1); und ein strategischer Partner-Hebel mit ProCare/PROLIFE, der organische Integration in eine etablierte Pflege-Gruppe ermöglicht."));

content.push(P("Wir suchen Investoren, die nicht nur Kapital bereitstellen, sondern die Vision einer integrierten digitalen Pflege-Plattform teilen und mit ihrem Netzwerk (Kassen, Apotheken, Sanitätshäuser, Pflegegruppen) den Markteintritt beschleunigen können."));

content.push(Spacer(600));
content.push(Rule());
content.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 300 },
  children: [new TextRun({ text: "Vielen Dank für Ihre Zeit und Ihr Vertrauen.", font: FONT_H, size: 28, italic: true, color: COAL })],
}));
content.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 120 },
  children: [new TextRun({ text: "Für Fragen, Rückrufe oder das Teilen dieses Dokuments:", font: FONT, size: 22, color: MUTED })],
}));
content.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 80 },
  children: [new TextRun({ text: "Yusuf Cilcioglu · +49 178 338 2825 · hallo@alltagsengel.care", font: FONT, size: 22, bold: true, color: COAL })],
}));
content.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 40 },
  children: [new TextRun({ text: "AlltagsEngel · Frankfurt am Main · alltagsengel.care", font: FONT, size: 20, color: MUTED })],
}));

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════
const doc = new Document({
  creator: "AlltagsEngel",
  title: "AlltagsEngel Business Plan 2026",
  description: "Business Plan für Pre-Seed Investoren (ProCare/PROLIFE)",
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: FONT_H, color: COAL },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT_H, color: COAL },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: COAL },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 8 } },
            children: [new TextRun({ text: "AlltagsEngel · Business Plan 2026", font: FONT, size: 16, color: MUTED, italic: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: "Vertraulich — nur für den Empfänger bestimmt", font: FONT, size: 14, color: MUTED, italic: true }),
              new TextRun({ text: "\tSeite ", font: FONT, size: 14, color: MUTED }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: MUTED }),
              new TextRun({ text: " / ", font: FONT, size: 14, color: MUTED }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: MUTED }),
            ],
          })],
        }),
      },
      children: content,
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("AlltagsEngel_Businessplan_2026.docx", buffer);
  console.log("✓ Business Plan erstellt: AlltagsEngel_Businessplan_2026.docx");
});
