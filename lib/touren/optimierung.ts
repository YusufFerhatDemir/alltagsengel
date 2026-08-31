// ═══════════════════════════════════════════════════════════════════
// TOURENPLANUNG — Reihenfolge-Vorschlag (Routenoptimierung)
// ═══════════════════════════════════════════════════════════════════
// Bisher konnte das Modul Fahrtzeit nur MESSEN (lib/touren/fahrtzeit.ts)
// und eine bestehende Reihenfolge auf Plausibilitaet pruefen
// (lib/touren/planung.ts). Was fehlte, war der Schritt davor: welche
// Reihenfolge waere die guenstigste? Die Disposition hat das bisher im
// Kopf gemacht.
//
// Drei Regeln entscheiden hier alles — sie sind der Grund, warum diese
// Datei nicht einfach ein Traveling-Salesman-Loeser ist:
//
//  1) EIN TERMIN IST EINE ZUSAGE, KEINE VARIABLE.
//     Jeder Stop ist ein mit dem Klienten vereinbarter Besuchstermin.
//     Ohne ausdrueckliche Angabe, wie weit er verschoben werden darf,
//     wird er NICHT verschoben (`flexibel_minuten` fehlt ⇒ 0 ⇒ fest).
//     Fail-closed: die teuerste Optimierung ist die, die dem Klienten
//     seinen Termin wegnimmt.
//
//  2) WAS SCHON LAEUFT, WIRD NICHT UMSORTIERT.
//     Stops jenseits von GEPLANT (UNTERWEGS/BEIM_KLIENTEN/
//     ABGESCHLOSSEN/AUSGEFALLEN) sind Vergangenheit oder Gegenwart. Sie
//     behalten ihre Position; die freien Stops werden nur auf die
//     verbleibenden Plaetze verteilt. Eine Route umzuschreiben, die zur
//     Haelfte gefahren ist, waere kein Vorschlag, sondern eine
//     Faelschung des Verlaufs.
//
//  3) EINE UNBEKANNTE STRECKE IST KEINE KURZE STRECKE.
//     `fahrtZwischenPlz` liefert null, wenn eine PLZ nicht im amtlichen
//     Bestand steht. Wer das als 0 Minuten weiterrechnet, bekommt eine
//     Reihenfolge, die genau die unbekannten Wege bevorzugt. Deshalb:
//     fehlt eine Strecke, wird NICHT optimiert, sondern abgelehnt — mit
//     Nennung der betroffenen Stops.
//
// Diese Datei schreibt nichts. Sie liefert einen Vorschlag; das
// Uebernehmen bleibt der bestehende Weg (PATCH /api/tours/[id]/stops
// mit `reihenfolge`), der weiterhin Vollstaendigkeit und Zugehoerigkeit
// der Stop-IDs prueft.
//
// Nicht in Client-Komponenten importieren: fahrtzeit.ts zieht
// lib/plz-coords (~180 KB) nach.
// ═══════════════════════════════════════════════════════════════════

import { zeitZuMinuten, minutenZuZeit } from '@/lib/availability'
import { fahrtZwischenPlz } from '@/lib/touren/fahrtzeit'

/** Stops in diesem Status sind bereits angelaufen und bleiben, wo sie sind. */
const NICHT_VERSCHIEBBAR = ['UNTERWEGS', 'BEIM_KLIENTEN', 'ABGESCHLOSSEN', 'AUSGEFALLEN']

/**
 * Obergrenze fuer die vollstaendige Suche. Ueberschreitet die Zahl der
 * geprueften Teilrouten diesen Wert, bricht die exakte Suche ab und das
 * Ergebnis kommt aus der lokalen Verbesserung — dann als 'HEURISTIK'
 * ausgewiesen, nicht als exakt. Eine Tour hat real 4–12 Stops; der Wert
 * traegt das mit grossem Abstand und deckelt zugleich den Extremfall,
 * damit eine Route-Handler-Anfrage nicht in die Laufzeitgrenze rennt.
 */
export const SUCH_BUDGET = 400_000

export interface OptiStop {
  id: string
  /** aktuelle Position (1-basiert, wie tour_stops.position) */
  position: number
  plz: string | null
  status?: string | null
  clientName?: string | null
  geplante_ankunft: string | null
  geplantes_ende: string | null
  /**
   * Zulaessige Abweichung der Ankunft in Minuten, nach frueher UND
   * spaeter. Fehlt der Wert, gilt 0 — der Termin steht fest.
   */
  flexibel_minuten?: number | null
}

export interface OptiEingabe {
  stops: OptiStop[]
  /** PLZ des Startpunkts (Standort/Wohnort der Kraft). Ohne Angabe zaehlt die erste Anfahrt nicht mit. */
  startPlz?: string | null
  /** Rueckfahrt zum Startpunkt in die Bewertung aufnehmen. */
  rueckfahrt?: boolean
}

export interface RouteKosten {
  fahrzeitMinuten: number
  distanzKm: number
}

export interface OptiAnkunft {
  stopId: string
  position: number
  ankunft: string
  ende: string
  /** Anfahrt zu diesem Stop in Minuten (null = Tourstart ohne Startpunkt) */
  fahrzeitMinuten: number | null
  /** Wartezeit vor dem Termin, weil die Kraft frueher ankaeme. */
  wartezeitMinuten: number
}

export type OptiAblehnungsGrund =
  | 'ZU_WENIG_STOPS'
  | 'PLZ_FEHLT'
  | 'ZEITEN_UNVOLLSTAENDIG'
  | 'KEINE_ZULAESSIGE_REIHENFOLGE'

export interface OptiAblehnung {
  moeglich: false
  grund: OptiAblehnungsGrund
  text: string
  betroffeneStops: string[]
}

export interface OptiVorschlag {
  moeglich: true
  /** Stop-IDs in vorgeschlagener Reihenfolge — direkt als `reihenfolge` verwendbar. */
  reihenfolge: string[]
  /** true, wenn die bestehende Reihenfolge bereits die guenstigste ist. */
  unveraendert: boolean
  vorher: RouteKosten
  nachher: RouteKosten
  ersparnisMinuten: number
  ersparnisKm: number
  ankuenfte: OptiAnkunft[]
  /** IDs der Stops, die nicht verschoben werden durften (Status oder fester Termin). */
  verankert: string[]
  verfahren: 'EXAKT' | 'HEURISTIK'
  /** Zahl der frei verschiebbaren Stops. */
  freieStops: number
}

export type OptiErgebnis = OptiVorschlag | OptiAblehnung

// ═══════════════════════════════════════════════════════════════════
// Innerer Zustand
// ═══════════════════════════════════════════════════════════════════

interface VorbereiteterStop {
  id: string
  plz: string
  clientName: string | null
  ankunftSoll: number
  dauer: number
  fensterVon: number
  fensterBis: number
  verankert: boolean
}

/**
 * Einsatzdauer eines Stops. Ein Ende vor der Ankunft ist im
 * Nachtdienst normal (22:00–02:00) und wird ueber Mitternacht
 * gerechnet — dieselbe Regel wie im Dienstplan. Ende = Ankunft
 * bleibt 0 und wird von der Vorbereitung als unvollstaendig
 * abgewiesen, nicht hier stillschweigend zu 24 h aufgeblasen.
 */
function dauerMinuten(ankunft: number, ende: number): number {
  return ende > ankunft ? ende - ankunft : ende + 1440 - ankunft
}

/** Fahrzeit zwischen zwei PLZ; null bleibt null (siehe Regel 3). */
function leg(vonPlz: string | null, nachPlz: string): { min: number; km: number } | null {
  if (vonPlz === null) return { min: 0, km: 0 }
  const f = fahrtZwischenPlz(vonPlz, nachPlz)
  return f ? { min: f.fahrzeitMinuten, km: f.distanzKm } : null
}

// ═══════════════════════════════════════════════════════════════════
// Bewertung einer Reihenfolge
// ═══════════════════════════════════════════════════════════════════

interface Bewertung {
  zulaessig: boolean
  fahrzeit: number
  distanz: number
  ende: number
  ankuenfte: { ankunft: number; ende: number; fahrzeit: number | null; wartezeit: number }[]
  /** Position, an der die Reihenfolge unzulaessig wurde (fuer die Meldung). */
  bruchIndex: number
}

const UNZULAESSIG: Bewertung = {
  zulaessig: false, fahrzeit: Infinity, distanz: Infinity, ende: Infinity,
  ankuenfte: [], bruchIndex: -1,
}

/**
 * Simuliert eine Reihenfolge ab `startZeit` (Abfahrt am Startpunkt).
 * Zu frueh eintreffen ist erlaubt (die Kraft wartet), zu spaet nicht —
 * daran scheitert die Reihenfolge.
 */
function bewerte(
  reihenfolge: VorbereiteterStop[],
  startPlz: string | null,
  startZeit: number,
  rueckfahrt: boolean,
): Bewertung {
  let t = startZeit
  let fahrzeit = 0
  let distanz = 0
  let vorherPlz: string | null = startPlz
  const ankuenfte: Bewertung['ankuenfte'] = []

  for (let i = 0; i < reihenfolge.length; i++) {
    const stop = reihenfolge[i]
    const l = leg(vorherPlz, stop.plz)
    if (l === null) return UNZULAESSIG
    fahrzeit += l.min
    distanz += l.km
    const frueheste = t + l.min
    const ankunft = Math.max(frueheste, stop.fensterVon)
    if (ankunft > stop.fensterBis) {
      return { ...UNZULAESSIG, bruchIndex: i }
    }
    const ende = ankunft + stop.dauer
    ankuenfte.push({
      ankunft,
      ende,
      fahrzeit: vorherPlz === null ? null : l.min,
      wartezeit: Math.max(0, ankunft - frueheste),
    })
    t = ende
    vorherPlz = stop.plz
  }

  if (rueckfahrt && startPlz !== null && vorherPlz !== null) {
    const zurueck = leg(vorherPlz, startPlz)
    if (zurueck === null) return UNZULAESSIG
    fahrzeit += zurueck.min
    distanz += zurueck.km
  }

  return { zulaessig: true, fahrzeit, distanz, ende: t, ankuenfte, bruchIndex: -1 }
}

/**
 * Ist a besser als b? Zuerst Fahrzeit, dann Distanz, dann frueheres
 * Tourende. Der dritte Schluessel macht das Ergebnis bei gleichwertigen
 * Routen reproduzierbar statt von der Aufzaehlungsreihenfolge abhaengig.
 */
function besser(a: Bewertung, b: Bewertung): boolean {
  if (!a.zulaessig) return false
  if (!b.zulaessig) return true
  if (a.fahrzeit !== b.fahrzeit) return a.fahrzeit < b.fahrzeit
  if (a.distanz !== b.distanz) return a.distanz < b.distanz
  return a.ende < b.ende
}

// ═══════════════════════════════════════════════════════════════════
// Vorbereitung
// ═══════════════════════════════════════════════════════════════════

function vorbereite(stops: OptiStop[]): VorbereiteterStop[] | OptiAblehnung {
  const ohnePlz: string[] = []
  const ohneZeit: string[] = []
  const fertig: VorbereiteterStop[] = []

  for (const stop of [...stops].sort((a, b) => a.position - b.position)) {
    const plz = typeof stop.plz === 'string' ? stop.plz.trim() : ''
    const ankunft = zeitZuMinuten(stop.geplante_ankunft)
    const ende = zeitZuMinuten(stop.geplantes_ende)

    if (ankunft === null || ende === null || ankunft === ende) {
      ohneZeit.push(stop.id)
      continue
    }
    // Regel 3: die PLZ muss nicht nur dastehen, sie muss auch im
    // Bestand auffindbar sein. `fahrtZwischenPlz(plz, plz)` faellt bei
    // gleicher PLZ in den Pauschalzweig und wuerde eine erfundene PLZ
    // durchwinken — deshalb gegen eine ANDERE PLZ pruefen.
    if (plz === '' || fahrtZwischenPlz(plz, plz === '60311' ? '10115' : '60311') === null) {
      ohnePlz.push(stop.id)
      continue
    }

    const flex = stop.flexibel_minuten
    const flexibel = typeof flex === 'number' && Number.isFinite(flex) && flex > 0
      ? Math.floor(flex)
      : 0
    const statusVerankert = NICHT_VERSCHIEBBAR.includes(String(stop.status ?? 'GEPLANT'))

    fertig.push({
      id: stop.id,
      plz,
      clientName: stop.clientName ?? null,
      ankunftSoll: ankunft,
      dauer: dauerMinuten(ankunft, ende),
      fensterVon: ankunft - flexibel,
      fensterBis: ankunft + flexibel,
      // Ein Stop ohne Spielraum kann seinen Platz ohnehin nicht
      // tauschen — er wird gleich als verankert gefuehrt, damit die
      // Suche ihn nicht sinnlos permutiert.
      verankert: statusVerankert || flexibel === 0,
    })
  }

  if (ohnePlz.length > 0) {
    return {
      moeglich: false,
      grund: 'PLZ_FEHLT',
      text: `Ohne bekannte Postleitzahl laesst sich keine Fahrzeit berechnen — `
        + `${ohnePlz.length} Stop(s) haben keine oder eine unbekannte PLZ. `
        + `Eine unbekannte Strecke als kurze Strecke zu behandeln wuerde genau `
        + `diese Stops nach vorne sortieren.`,
      betroffeneStops: ohnePlz,
    }
  }
  if (ohneZeit.length > 0) {
    return {
      moeglich: false,
      grund: 'ZEITEN_UNVOLLSTAENDIG',
      text: `${ohneZeit.length} Stop(s) haben keine vollstaendige geplante Zeit `
        + `(Ankunft und Ende, Ende ungleich Ankunft).`,
      betroffeneStops: ohneZeit,
    }
  }
  // ── Tagesuebergang ────────────────────────────────────────────────
  // Die Simulation rechnet in fortlaufenden Minuten ab Tourbeginn, die
  // Zeitfenster stehen aber als Tageszeit (`time`) in der Datenbank. Bei
  // einer Nachttour laeuft der Zeiger nach 22:00 + 4 h auf 26:00,
  // waehrend der Folgestop sein Fenster bei 03:00 = 180 hat — jeder
  // Vergleich haette den Stop als "nicht mehr erreichbar" abgewiesen und
  // die ganze Nachttour als unfahrbar gemeldet.
  //
  // Der Bezugspunkt ist die geplante Ankunft des ERSTEN Stops: was davor
  // liegt, gehoert zum Folgetag. Bewusst am bestehenden Plan festgemacht
  // und nicht am jeweiligen Kandidaten — sonst haenge die Tageszuordnung
  // an der Reihenfolge, und dieselbe Tour bekaeme je nach Vorschlag
  // andere Fenster.
  const referenz = fertig[0].ankunftSoll
  for (const stop of fertig) {
    if (stop.ankunftSoll < referenz) {
      stop.ankunftSoll += 1440
      stop.fensterVon += 1440
      stop.fensterBis += 1440
    }
  }

  return fertig
}

// ═══════════════════════════════════════════════════════════════════
// Suche
// ═══════════════════════════════════════════════════════════════════

interface SuchErgebnis {
  reihenfolge: VorbereiteterStop[]
  bewertung: Bewertung
  verfahren: 'EXAKT' | 'HEURISTIK'
}

/**
 * Vollstaendige Suche ueber die Belegung der freien Plaetze mit Schnitt:
 * ein Teilweg, dessen Fahrzeit die bisher beste Gesamtfahrzeit bereits
 * erreicht, wird nicht weiterverfolgt. Gibt null zurueck, wenn das
 * Suchbudget aufgebraucht ist (dann uebernimmt die lokale Verbesserung).
 */
function sucheExakt(
  geruest: (VorbereiteterStop | null)[],
  frei: VorbereiteterStop[],
  startPlz: string | null,
  startZeit: number,
  rueckfahrt: boolean,
  obergrenze: Bewertung,
): { beste: Bewertung; reihenfolge: VorbereiteterStop[] } | null {
  const freiePlaetze: number[] = []
  geruest.forEach((s, i) => { if (s === null) freiePlaetze.push(i) })

  let beste = obergrenze
  let besteReihe: VorbereiteterStop[] | null = null
  let budget = SUCH_BUDGET
  const belegt = new Array(frei.length).fill(false)
  const aktuell = geruest.slice()

  const rekursion = (platzNr: number, fahrzeitBisher: number): boolean => {
    if (--budget < 0) return false
    if (beste.zulaessig && fahrzeitBisher >= beste.fahrzeit) return true

    if (platzNr === freiePlaetze.length) {
      const kandidat = bewerte(aktuell as VorbereiteterStop[], startPlz, startZeit, rueckfahrt)
      if (besser(kandidat, beste)) {
        beste = kandidat
        besteReihe = (aktuell as VorbereiteterStop[]).slice()
      }
      return true
    }

    const platz = freiePlaetze[platzNr]
    for (let i = 0; i < frei.length; i++) {
      if (belegt[i]) continue
      belegt[i] = true
      aktuell[platz] = frei[i]
      // Teil-Fahrzeit: nur die Strecke ZU diesem Platz, sofern der
      // Vorgaenger schon feststeht. Das reicht als Schnittgrenze und
      // kommt ohne zweite Simulation aus.
      const vorher = platz === 0 ? startPlz : (aktuell[platz - 1]?.plz ?? null)
      const l = vorher === null ? { min: 0 } : leg(vorher, frei[i].plz)
      const weiter = rekursion(platzNr + 1, fahrzeitBisher + (l?.min ?? 0))
      belegt[i] = false
      aktuell[platz] = null
      if (!weiter) return false
    }
    return true
  }

  const vollstaendig = rekursion(0, 0)
  if (!vollstaendig) return null
  return besteReihe === null ? { beste, reihenfolge: [] } : { beste, reihenfolge: besteReihe }
}

/**
 * Lokale Verbesserung fuer grosse Touren: vertauscht paarweise zwei
 * freie Stops und behaelt jede Verbesserung, bis keine mehr gefunden
 * wird. Anker bleiben unberuehrt, weil nur freie Plaetze getauscht
 * werden.
 */
function sucheHeuristisch(
  start: (VorbereiteterStop | null)[],
  frei: VorbereiteterStop[],
  startPlz: string | null,
  startZeit: number,
  rueckfahrt: boolean,
): { beste: Bewertung; reihenfolge: VorbereiteterStop[] } {
  const freiePlaetze: number[] = []
  start.forEach((s, i) => { if (s === null) freiePlaetze.push(i) })

  const aktuell = start.slice()
  freiePlaetze.forEach((platz, i) => { aktuell[platz] = frei[i] })

  let beste = bewerte(aktuell as VorbereiteterStop[], startPlz, startZeit, rueckfahrt)
  let verbessert = true
  // Deckel gegen Endlosschleifen bei gleichwertigen Tauschen.
  let runden = 0
  while (verbessert && runden++ < 50) {
    verbessert = false
    for (let a = 0; a < freiePlaetze.length; a++) {
      for (let b = a + 1; b < freiePlaetze.length; b++) {
        const pa = freiePlaetze[a]
        const pb = freiePlaetze[b]
        const tmp = aktuell[pa]
        aktuell[pa] = aktuell[pb]
        aktuell[pb] = tmp
        const kandidat = bewerte(aktuell as VorbereiteterStop[], startPlz, startZeit, rueckfahrt)
        if (besser(kandidat, beste)) {
          beste = kandidat
          verbessert = true
        } else {
          aktuell[pb] = aktuell[pa]
          aktuell[pa] = tmp
        }
      }
    }
  }
  return { beste, reihenfolge: aktuell as VorbereiteterStop[] }
}

// ═══════════════════════════════════════════════════════════════════
// Einstieg
// ═══════════════════════════════════════════════════════════════════

/**
 * Schlaegt eine guenstigere Reihenfolge fuer die Stops einer Tour vor.
 *
 * Schreibt nichts. Das Ergebnis ist entweder eine begruendete Ablehnung
 * oder ein Vorschlag samt Vorher/Nachher-Bilanz und den daraus
 * folgenden Ankunftszeiten.
 */
export function optimiereReihenfolge(eingabe: OptiEingabe): OptiErgebnis {
  const stops = Array.isArray(eingabe.stops) ? eingabe.stops : []
  if (stops.length < 2) {
    return {
      moeglich: false,
      grund: 'ZU_WENIG_STOPS',
      text: 'Eine Reihenfolge braucht mindestens zwei Stops.',
      betroffeneStops: stops.map((s) => s.id),
    }
  }

  const vorbereitet = vorbereite(stops)
  if (!Array.isArray(vorbereitet)) return vorbereitet

  const startPlzRoh = typeof eingabe.startPlz === 'string' ? eingabe.startPlz.trim() : ''
  const startPlz = startPlzRoh === '' ? null : startPlzRoh
  if (startPlz !== null && fahrtZwischenPlz(startPlz, startPlz === '60311' ? '10115' : '60311') === null) {
    return {
      moeglich: false,
      grund: 'PLZ_FEHLT',
      text: `Die Start-PLZ ${startPlz} steht nicht im amtlichen Bestand — `
        + `die Anfahrt zum ersten Stop laesst sich nicht berechnen.`,
      betroffeneStops: [],
    }
  }
  const rueckfahrt = eingabe.rueckfahrt === true

  // Abfahrtszeit am Startpunkt: so, dass der erste Stop des BESTEHENDEN
  // Plans punktgenau erreicht wird. Damit vergleicht der Vorschlag gegen
  // denselben Tagesbeginn und behauptet keine Ersparnis, die nur daher
  // kommt, dass die Kraft frueher losfaehrt.
  const ersterAlt = vorbereitet[0]
  const anfahrtAlt = startPlz === null ? { min: 0 } : leg(startPlz, ersterAlt.plz)
  if (anfahrtAlt === null) {
    return {
      moeglich: false,
      grund: 'PLZ_FEHLT',
      text: `Die Anfahrt von ${startPlz} zum ersten Stop laesst sich nicht berechnen.`,
      betroffeneStops: [ersterAlt.id],
    }
  }
  const startZeit = ersterAlt.ankunftSoll - anfahrtAlt.min

  const vorherBewertung = bewerte(vorbereitet, startPlz, startZeit, rueckfahrt)

  const frei = vorbereitet.filter((s) => !s.verankert)
  const geruest: (VorbereiteterStop | null)[] = vorbereitet.map((s) => (s.verankert ? s : null))

  if (!vorherBewertung.zulaessig && frei.length < 2) {
    // Kein Spielraum UND der bestehende Plan ist nicht fahrbar: das
    // sofort melden, statt mit `unveraendert: true` einen unfahrbaren
    // Plan als in Ordnung zu bestaetigen.
    return unfahrbar(vorbereitet, vorherBewertung)
  }

  if (frei.length < 2) {
    return {
      moeglich: true,
      reihenfolge: vorbereitet.map((s) => s.id),
      unveraendert: true,
      vorher: kosten(vorherBewertung),
      nachher: kosten(vorherBewertung),
      ersparnisMinuten: 0,
      ersparnisKm: 0,
      ankuenfte: ankuenfteAus(vorbereitet, vorherBewertung),
      verankert: vorbereitet.filter((s) => s.verankert).map((s) => s.id),
      verfahren: 'EXAKT',
      freieStops: frei.length,
    }
  }

  // Der bestehende Plan ist die Messlatte: ein Vorschlag muss ihn
  // schlagen, nicht nur zulaessig sein.
  const exakt = sucheExakt(geruest, frei, startPlz, startZeit, rueckfahrt, vorherBewertung)
  let ergebnis: SuchErgebnis
  if (exakt !== null) {
    ergebnis = exakt.reihenfolge.length === 0
      ? { reihenfolge: vorbereitet, bewertung: vorherBewertung, verfahren: 'EXAKT' }
      : { reihenfolge: exakt.reihenfolge, bewertung: exakt.beste, verfahren: 'EXAKT' }
  } else {
    const h = sucheHeuristisch(geruest, frei, startPlz, startZeit, rueckfahrt)
    ergebnis = besser(h.beste, vorherBewertung)
      ? { reihenfolge: h.reihenfolge, bewertung: h.beste, verfahren: 'HEURISTIK' }
      : { reihenfolge: vorbereitet, bewertung: vorherBewertung, verfahren: 'HEURISTIK' }
  }

  if (!ergebnis.bewertung.zulaessig) {
    // Weder der bestehende Plan noch irgendeine zulaessige Umsortierung
    // erfuellt alle Zeitfenster. Das ist ein Planungsfehler, keine
    // Optimierungsfrage — und wird als solcher gemeldet, statt ihn mit
    // einer erfundenen Reihenfolge zu ueberdecken.
    return unfahrbar(vorbereitet, vorherBewertung)
  }

  const unveraendert = ergebnis.reihenfolge.every((s, i) => s.id === vorbereitet[i].id)

  return {
    moeglich: true,
    reihenfolge: ergebnis.reihenfolge.map((s) => s.id),
    unveraendert,
    vorher: kosten(vorherBewertung),
    nachher: kosten(ergebnis.bewertung),
    ersparnisMinuten: vorherBewertung.zulaessig
      ? vorherBewertung.fahrzeit - ergebnis.bewertung.fahrzeit
      : 0,
    ersparnisKm: vorherBewertung.zulaessig
      ? Math.round((vorherBewertung.distanz - ergebnis.bewertung.distanz) * 10) / 10
      : 0,
    ankuenfte: ankuenfteAus(ergebnis.reihenfolge, ergebnis.bewertung),
    verankert: vorbereitet.filter((s) => s.verankert).map((s) => s.id),
    verfahren: ergebnis.verfahren,
    freieStops: frei.length,
  }
}

/** Meldung fuer einen Plan, den kein zulaessiger Weg erfuellt. */
function unfahrbar(stops: VorbereiteterStop[], vorher: Bewertung): OptiAblehnung {
  const bruch = vorher.bruchIndex
  const stop = bruch >= 0 ? stops[bruch] : null
  return {
    moeglich: false,
    grund: 'KEINE_ZULAESSIGE_REIHENFOLGE',
    text: stop
      ? `Kein Weg erfuellt alle Zeitfenster: Stop ${bruch + 1}`
        + `${stop.clientName ? ` (${stop.clientName})` : ''} ist um `
        + `${minutenZuZeit(stop.fensterBis % 1440)} nicht mehr erreichbar.`
      : 'Kein Weg erfuellt alle Zeitfenster der Tour.',
    betroffeneStops: stop ? [stop.id] : stops.map((s) => s.id),
  }
}

function kosten(b: Bewertung): RouteKosten {
  if (!b.zulaessig) return { fahrzeitMinuten: 0, distanzKm: 0 }
  return { fahrzeitMinuten: b.fahrzeit, distanzKm: Math.round(b.distanz * 10) / 10 }
}

function ankuenfteAus(reihe: VorbereiteterStop[], b: Bewertung): OptiAnkunft[] {
  if (!b.zulaessig) return []
  return reihe.map((stop, i) => ({
    stopId: stop.id,
    position: i + 1,
    ankunft: minutenZuZeit(b.ankuenfte[i].ankunft % 1440),
    ende: minutenZuZeit(b.ankuenfte[i].ende % 1440),
    fahrzeitMinuten: b.ankuenfte[i].fahrzeit,
    wartezeitMinuten: b.ankuenfte[i].wartezeit,
  }))
}
