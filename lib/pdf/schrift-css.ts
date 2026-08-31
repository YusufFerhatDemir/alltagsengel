// ═══════════════════════════════════════════════════════════════════
// PDF-Schriften fuer die HTML-Druckvorlagen
// ═══════════════════════════════════════════════════════════════════
// Das Projekt hat zwei Wege zum PDF, und nur einer war in Ordnung:
//
//  · pdf-lib (lib/pdf/briefkopf.ts, rechnung-paket.ts,
//    mahnung-pdf-datei.ts, app/api/leistungsnachweis/route.ts):
//    liest die TTF aus public/fonts und BETTET sie ein. Richtig.
//
//  · HTML + window.print() (Leistungsnachweis, Mahnung): schrieb
//    `font-family: 'DejaVu Sans', …` und lud die Schrift nie. DejaVu ist
//    weder auf macOS noch auf Windows eine Systemschrift — der Browser
//    ist also stillschweigend auf die naechste Angabe der Liste
//    gefallen, auf Arial oder Helvetica. Genau der Rueckfall, den die
//    Kommentare beider Dateien ausschliessen wollten ("tuerkische/
//    deutsche Sonderzeichen bleiben korrekt").
//
// Ein CSS-Name ist keine Schrift. Erst @font-face laedt eine.
//
// Warum das mehr ist als Kosmetik: der Leistungsnachweis geht an die
// Pflegekasse und traegt Klientennamen. Faellt die Schrift zurueck,
// aendern sich Metrik und Zeilenumbrueche des Kassenformulars, und
// Zeichen ausserhalb von WinAnsi (ğ, ş, İ) haengen an dem, was die
// Ersatzschrift zufaellig mitbringt.
// ═══════════════════════════════════════════════════════════════════

/**
 * Schriftschnitte, die unter /public/fonts liegen und von
 * `lib/pilot/voraussetzungen.ts` als Pflicht gefuehrt werden.
 */
export const PDF_SCHRIFT_DATEIEN = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'] as const

/**
 * Schriftfamilie fuer die Druckvorlagen. Die Ersatzangaben bleiben
 * stehen — sie greifen nur noch, wenn das Laden der TTF scheitert
 * (Offline-Kopie, blockiertes Netz), und dann ist ein lesbares
 * Dokument besser als keines.
 */
export const PDF_SCHRIFT_FAMILIE =
  `'DejaVu Sans', 'DejaVu Sans Condensed', 'Helvetica Neue', Arial, sans-serif`

/**
 * @font-face-Bloecke, die 'DejaVu Sans' tatsaechlich laden.
 *
 * @param basisUrl Praefix vor `/fonts/…`. Leer (Standard) ergibt einen
 *   wurzelrelativen Pfad — richtig fuer das Druck-iframe, das die
 *   Herkunft der Seite erbt. Fuer eine HTML-Datei, die der Nutzer
 *   herunterlaedt und spaeter von der Platte oeffnet, muss die
 *   Herkunft mitgegeben werden (`window.location.origin`), sonst
 *   zeigt der wurzelrelative Pfad ins Dateisystem.
 */
export function dejaVuFontFaceCss(basisUrl = ''): string {
  const basis = basisUrl.replace(/\/+$/, '')
  return `
  @font-face {
    font-family: 'DejaVu Sans';
    src: url('${basis}/fonts/DejaVuSans.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'DejaVu Sans';
    src: url('${basis}/fonts/DejaVuSans-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }`
}
