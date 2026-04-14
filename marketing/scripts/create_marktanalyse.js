const { Document, Packer, Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle, AlignmentType } = require('docx');
const fs = require('fs');

const doc = new Document({
  sections: [{
    children: [
      // DECKBLATT
      new Paragraph({ text: '', spacing: { before: 600, after: 600 } }),
      new Paragraph({ text: 'Geschäftsmodell & Marktanalyse', alignment: AlignmentType.CENTER, bold: true, size: 56 * 2, color: 'C9963C', spacing: { after: 240 } }),
      new Paragraph({ text: 'AlltagsEngel UG', alignment: AlignmentType.CENTER, bold: true, size: 32 * 2, spacing: { after: 480 } }),
      new Paragraph({ text: 'VERTRAULICH', alignment: AlignmentType.CENTER, bold: true, size: 24 * 2, color: 'DC143C', spacing: { after: 240 } }),
      new Paragraph({ text: 'März 2025', alignment: AlignmentType.CENTER, size: 20 * 2, spacing: { after: 600 } }),
      new Paragraph({ text: '', spacing: { after: 800 } }),
      new Paragraph({ text: 'Schiller Str. 31', size: 20 * 2, spacing: { after: 0 } }),
      new Paragraph({ text: '60313 Frankfurt am Main', size: 20 * 2, spacing: { after: 120 } }),
      new Paragraph({ text: 'Geschäftsführer: Yusuf Ferhat Demir', size: 20 * 2, spacing: { after: 400, pageBreakBefore: true } }),

      // MARKTÜBERSICHT
      new Paragraph({ text: 'MARKTÜBERSICHT', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Pflegebedarf in Deutschland', bold: true, size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• 4,96 Mio. Pflegebedürftige in Deutschland (Destatis 2023)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Jährliches Wachstum: ~3-5% durch demografischen Wandel', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Bis 2030: Geschätzt 6+ Mio. Pflegebedürftige', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Pflegemarkt Deutschland: >€50 Mrd. jährlich', size: 22 * 2, spacing: { after: 240 } }),

      // §45b
      new Paragraph({ text: '§45b ENTLASTUNGSBETRAG — DAS HERZ DES GESCHÄFTSMODELLS', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: '§45b SGB XI: €125/Monat pro Pflegebedürftigem ab Pflegegrad 1', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Gesamtvolumen: 4,96 Mio. × €125 × 12 = €7,44 Mrd./Jahr', size: 22 * 2, bold: true, spacing: { after: 80 } }),
      new Paragraph({ text: 'Aktuell nur ~40% ausgeschöpft → €4,46 Mrd. ungenutzt', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Warum? Mangel an bekannten, zugänglichen Anbietern', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• AlltagsEngel macht dieses Budget digital zugänglich', size: 22 * 2, spacing: { after: 240 } }),

      // TAM/SAM/SOM
      new Paragraph({ text: 'TAM / SAM / SOM ANALYSE', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Table({
        width: { size: 100, type: WidthType.pct },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 20, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: 'C9963C' } }, shading: { fill: 'C9963C' }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: 'Kategorie', bold: true, size: 22 * 2, color: 'FFFFFF' })] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: 'C9963C' } }, shading: { fill: 'C9963C' }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: 'Definition', bold: true, size: 22 * 2, color: 'FFFFFF' })] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: 'C9963C' } }, shading: { fill: 'C9963C' }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: 'Wert', bold: true, size: 22 * 2, color: 'FFFFFF' })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ width: { size: 20, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('TAM')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('Gesamter Pflegemarkt DE')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: '€50+ Mrd.', bold: true })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ width: { size: 20, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('SAM')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('Alltagsbegleitung & Entlastungsleistungen')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: '€8-12 Mrd.', bold: true })] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ width: { size: 20, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('SOM')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph('Erreichbar in 5 Jahren (digital)')] }),
              new TableCell({ width: { size: 40, type: WidthType.pct }, borders: { all: { style: BorderStyle.single, size: 6, color: '000000' } }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [new Paragraph({ text: '€200-400 Mio.', bold: true })] })
            ]
          })
        ]
      }),
      new Paragraph({ text: '', spacing: { after: 240 } }),

      // WETTBEWERBSANALYSE
      new Paragraph({ text: 'WETTBEWERBSANALYSE', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Pflegehelden.de | Online-Vermittlung | Bekanntheit vs. Keine App, kein §45b', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Careship | Plattform | VC-finanziert vs. Fokus Pflege, teuer', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Lokale Sozialstationen | Traditionell | Vertrauen vs. Kein Digital', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Private Vermittler | Agentur | Persönlich vs. Teuer', size: 20 * 2, spacing: { after: 120 } }),
      new Paragraph({ text: 'AlltagsEngel | App-Plattform | §45b, Digital vs. Neuer Anbieter', size: 20 * 2, bold: true, color: 'C9963C', spacing: { after: 240 } }),

      // GESCHÄFTSMODELL
      new Paragraph({ text: 'GESCHÄFTSMODELL', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Einnahmequellen:', bold: true, size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Provision: 18% pro Buchung (€40 durchschnittlich = €7,20)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Premium-Abo: €9,99/Monat (bevorzugte Sichtbarkeit)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: '• Zukünftig: Direktabrechnung, Partnerschaften', size: 22 * 2, spacing: { after: 240 } }),

      // UNIT ECONOMICS
      new Paragraph({ text: 'UNIT ECONOMICS', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Buchungswert: €40 durchschnittlich', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Provision pro Buchung: €7,20 (18%)', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Buchungen/Monat: 4-8 pro Nutzer', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Umsatz pro Nutzer: €28,80-€57,60 monatlich', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Customer Acquisition Cost: €15-25', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Lifetime Value: €400-600', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'LTV/CAC Ratio: 16-40x (exzellent)', size: 20 * 2, spacing: { after: 240 } }),

      // SKALIERUNGSSTRATEGIE
      new Paragraph({ text: 'SKALIERUNGSSTRATEGIE', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Phase 1: Frankfurt & Rhein-Main (Monat 1-6)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Phase 2: Hessen flächendeckend (Monat 7-12)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Phase 3: Bayern, NRW, Baden-Württemberg (Jahr 2)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Phase 4: Bundesweit (Jahr 3)', size: 22 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Phase 5: DACH-Region (Jahr 4-5)', size: 22 * 2, spacing: { after: 240 } }),

      // RISIKEN
      new Paragraph({ text: 'RISIKEN & GEGENMAßNAHMEN', bold: true, size: 56 * 2, color: 'C9963C', spacing: { line: 360, before: 240, after: 120 } }),
      new Paragraph({ text: 'Regulatorische Änderungen (Mittel): Monitoring, flexible Anpassung', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Wettbewerber-Eintritt (Hoch): First-Mover, Netzwerkeffekte', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Engel-Mangel (Mittel): Attraktive Konditionen, Versicherung', size: 20 * 2, spacing: { after: 80 } }),
      new Paragraph({ text: 'Technische Probleme (Niedrig): Bewährter Tech-Stack, Testing', size: 20 * 2, spacing: { after: 300 } })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room-de/04-marktanalyse/AlltagsEngel-Marktanalyse.docx', buffer);
  console.log('Dokument erfolgreich erstellt!');
}).catch(err => {
  console.error('Fehler:', err);
  process.exit(1);
});
