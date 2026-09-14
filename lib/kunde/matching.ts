/**
 * Welche Engel passen zu einer Kundenanfrage?
 *
 * ── WAS DIESE DATEI IST UND WAS NICHT ─────────────────────────────────
 * Ein **Vorschlag für einen Menschen**, keine automatische Zuteilung. Sie
 * ordnet niemanden zu, schreibt nichts und entscheidet nichts. Sie sagt:
 * „diese hier kommen in Frage, in dieser Reihenfolge, und das ist der
 * Grund." Die Entscheidung, wer zu einer Familie fährt, trifft die
 * Einsatzleitung.
 *
 * Deshalb auch zwei getrennte Listen im Ergebnis: wer in Frage kommt, und
 * wer NICHT — mit Grund. Eine Liste, aus der jemand kommentarlos fehlt,
 * lädt dazu ein, den Grund zu raten.
 *
 * ── HARTE TORE UND WEICHE PUNKTE ──────────────────────────────────────
 * Zwei verschiedene Dinge, und sie dürfen nicht vermischt werden:
 *
 *   TOR    Wer es nicht passiert, wird NICHT vorgeschlagen — egal wie gut
 *          er sonst passt. Fehlende Einsatzfreigabe ist kein Punktabzug.
 *   PUNKT  Alles andere. Entfernung, Qualifikation, Sprache, Fahrzeug.
 *          Ein Abzug heißt „passt schlechter", nie „geht nicht".
 *
 * Die Einsatzfreigabe ist das wichtigste Tor: sie bedeutet, dass
 * Führungszeugnis, Erste-Hilfe-Nachweis und Vertrag vorliegen. Ein
 * Vorschlag ohne sie wäre eine Einladung, an genau dieser Prüfung
 * vorbeizuplanen.
 *
 * ── DIE ENTFERNUNG IST EINE SCHÄTZUNG ─────────────────────────────────
 * `plzDistanceKm` rechnet Luftlinie aus Postleitzahl-Koordinaten, offline.
 * Für manche PLZ ist nur der Zonen-Mittelpunkt bekannt — dann stimmt die
 * Zahl auf einige Kilometer genau, nicht besser. Sie taugt zum Sortieren,
 * nicht als Fahrtzeit. Ist gar keine Koordinate bekannt, wird das gesagt
 * (`entfernungKm: null`) statt geraten.
 */

import { plzDistanceKm, matchPlzOffline, ENGEL_MATCH_RADIUS_KM } from '@/lib/plz-match'

/** Der Ausschnitt aus `caregivers`, den das Matching braucht. */
export interface EngelDaten {
  id: string
  name: string
  zip_code?: string | null
  /** Ausdrücklich bediente Postleitzahlen (text[] in der Datenbank). */
  einsatzgebiet_plz?: string[] | string | null
  /** Eigener Radius in km; fehlt er, gilt `ENGEL_MATCH_RADIUS_KM`. */
  einsatzgebiet_radius_km?: number | null
  qualification_level?: string | null
  qualifications?: string[] | string | null
  is_nurse?: boolean | null
  languages?: string[] | string | null
  has_vehicle?: boolean | null
  /** Das Tor: ohne sie wird niemand vorgeschlagen. */
  einsatzfreigabe?: boolean | null
  status?: string | null
  vertragsstatus?: string | null
  austrittsdatum?: string | null
}

/** Was die Anfrage verlangt. Alles außer der PLZ ist optional. */
export interface Bedarf {
  plz: string
  /** Freitext aus `lead_inquiries.service`, z. B. „Alltagsbegleitung". */
  leistung?: string | null
  /** Schlüssel aus `lib/leads/anfrage-felder.ts`. */
  pflegegrad?: string | null
  /** Gewünschte Sprache, klein geschrieben verglichen. */
  sprache?: string | null
  /** Fahrten nötig (Einkauf, Arztbesuch)? */
  brauchtFahrzeug?: boolean
  /** Stichtag für „ist die Person noch da". Voreinstellung: jetzt. */
  stichtag?: Date
}

export interface Treffer {
  engelId: string
  name: string
  /** 0 bis 100. Nur zum Sortieren gedacht, nicht als Prozentangabe. */
  punkte: number
  /** Luftlinie in km — `null`, wenn keine Koordinate bekannt ist. */
  entfernungKm: number | null
  /** Warum diese Person passt. Klartext für die Oberfläche. */
  gruende: string[]
  /** Was dagegen spricht, ohne auszuschließen. */
  huerden: string[]
}

export interface Ausschluss {
  engelId: string
  name: string
  grund: string
}

export interface MatchErgebnis {
  treffer: Treffer[]
  ausgeschlossen: Ausschluss[]
}

/** Höchster erreichbarer Punktwert — die Skala, nicht ein Versprechen. */
export const MAX_PUNKTE = 100

/** Ab hier gilt ein Vorschlag als gut genug zum Anrufen. */
export const SCHWELLE_GUT = 60

function alsListe(w: string[] | string | null | undefined): string[] {
  if (Array.isArray(w)) return w.filter(x => typeof x === 'string' && x.trim() !== '')
  if (typeof w === 'string' && w.trim() !== '') {
    // text[] kommt über PostgREST als Array; eine Komma-Liste ist der
    // Handeingabe-Fall aus der Stammdatenmaske.
    return w.split(',').map(x => x.trim()).filter(Boolean)
  }
  return []
}

/**
 * Gilt die Person zum Stichtag als einsetzbar?
 *
 * Fail-closed: was hier nicht ausdrücklich als in Ordnung erkannt wird,
 * gilt als nicht einsetzbar. Ein unbekannter Vertragsstatus ist kein
 * Freibrief.
 */
function torGrund(e: EngelDaten, stichtag: Date): string | null {
  if (e.einsatzfreigabe !== true) {
    return 'Keine Einsatzfreigabe — Führungszeugnis, Erste Hilfe oder Vertrag fehlen'
  }
  if (e.austrittsdatum) {
    const aus = new Date(`${e.austrittsdatum}T23:59:59`)
    if (!Number.isNaN(aus.getTime()) && aus.getTime() < stichtag.getTime()) {
      return `Ausgeschieden zum ${e.austrittsdatum}`
    }
  }
  // `status` führt in `caregivers` die Werte active/inactive; `vertragsstatus`
  // aktiv/ruhend/beendet. Beide dürfen nur durchlassen, was sie ausdrücklich
  // erlauben.
  if (e.status && !['active', 'aktiv'].includes(e.status)) {
    return `Status „${e.status}"`
  }
  if (e.vertragsstatus && !['aktiv', 'active'].includes(e.vertragsstatus)) {
    return `Vertragsstatus „${e.vertragsstatus}"`
  }
  return null
}

/**
 * Entfernung zwischen Anfrage und Engel.
 *
 * Eine ausdrücklich bediente PLZ schlägt jede Rechnung: wer sein
 * Einsatzgebiet selbst angegeben hat, weiß besser als eine Luftlinie, wo er
 * hinfährt.
 */
function entfernung(e: EngelDaten, bedarf: Bedarf): {
  km: number | null
  imGebiet: boolean
  ueberRadius: boolean
} {
  const gebiet = alsListe(e.einsatzgebiet_plz)
  const imGebiet = gebiet.includes(bedarf.plz)
  const km = e.zip_code ? plzDistanceKm(e.zip_code, bedarf.plz) : null
  const radius = e.einsatzgebiet_radius_km ?? ENGEL_MATCH_RADIUS_KM
  // Über dem Radius ist eine Aussage der Person selbst („so weit fahre ich
  // nicht"), keine Rechnung von uns — aber sie gilt nur, wenn sie die PLZ
  // nicht ausdrücklich in ihr Gebiet aufgenommen hat.
  //
  // `matchPlzOffline` statt eines eigenen Vergleichs: es rechnet dieselbe
  // Distanz, legt aber den Unschärfepuffer drauf, wenn für eine der beiden
  // Postleitzahlen nur der Zonenmittelpunkt bekannt ist. Ein blankes
  // `km > radius` wäre an der Grenze strenger als jede andere Stelle im
  // Haus — und ein Ausschluss ist die teure Richtung.
  const ueberRadius = !imGebiet && km !== null && !matchPlzOffline(e.zip_code!, bedarf.plz, radius)
  return { km, imGebiet, ueberRadius }
}

/**
 * Punkte für die Entfernung. Der größte Einzelposten — in der
 * Alltagsbegleitung entscheidet die Anfahrt darüber, ob ein Einsatz
 * überhaupt wirtschaftlich ist.
 */
function entfernungsPunkte(km: number | null, imGebiet: boolean): { punkte: number; text: string } {
  if (imGebiet) return { punkte: 50, text: 'Postleitzahl steht im eigenen Einsatzgebiet' }
  if (km === null) return { punkte: 15, text: 'Entfernung unbekannt — Postleitzahl nicht hinterlegt' }
  if (km <= 5) return { punkte: 50, text: `${Math.round(km)} km entfernt` }
  if (km <= 10) return { punkte: 42, text: `${Math.round(km)} km entfernt` }
  if (km <= 20) return { punkte: 32, text: `${Math.round(km)} km entfernt` }
  if (km <= 30) return { punkte: 20, text: `${Math.round(km)} km entfernt` }
  return { punkte: 8, text: `${Math.round(km)} km entfernt — weite Anfahrt` }
}

/**
 * Sucht passende Engel zu einem Bedarf.
 *
 * Sortiert absteigend nach Punkten, bei Gleichstand die kürzere Anfahrt
 * zuerst. Wer ein Tor nicht passiert, steht in `ausgeschlossen` — mit Grund.
 */
export function findePassendeEngel(engel: readonly EngelDaten[], bedarf: Bedarf): MatchErgebnis {
  const stichtag = bedarf.stichtag ?? new Date()
  const treffer: Treffer[] = []
  const ausgeschlossen: Ausschluss[] = []

  for (const e of engel) {
    const tor = torGrund(e, stichtag)
    if (tor) {
      ausgeschlossen.push({ engelId: e.id, name: e.name, grund: tor })
      continue
    }

    const { km, imGebiet, ueberRadius } = entfernung(e, bedarf)
    if (ueberRadius) {
      const radius = e.einsatzgebiet_radius_km ?? ENGEL_MATCH_RADIUS_KM
      ausgeschlossen.push({
        engelId: e.id,
        name: e.name,
        grund: `${Math.round(km as number)} km — außerhalb des eigenen Radius von ${radius} km`,
      })
      continue
    }

    const gruende: string[] = []
    const huerden: string[] = []
    let punkte = 0

    const ent = entfernungsPunkte(km, imGebiet)
    punkte += ent.punkte
    if (km === null && !imGebiet) huerden.push(ent.text)
    else gruende.push(ent.text)

    // ── Qualifikation ────────────────────────────────────────────────
    // Ab Pflegegrad 4 wird die Begleitung regelmäßig zur Pflegesituation.
    // Eine Pflegefachkraft ist dort ein Vorteil, KEINE Bedingung: die
    // Entscheidung, was der Fall braucht, trifft die Einsatzleitung nach
    // dem Erstgespräch, nicht eine Punkteformel.
    const hoherGrad = bedarf.pflegegrad === 'grad4' || bedarf.pflegegrad === 'grad5'
    if (e.is_nurse) {
      punkte += hoherGrad ? 25 : 12
      gruende.push('Pflegefachkraft')
    } else if (hoherGrad) {
      huerden.push(`Pflegegrad ${bedarf.pflegegrad === 'grad5' ? '5' : '4'} ohne Pflegefachkraft — im Erstgespräch klären`)
    }

    const quals = alsListe(e.qualifications)
    if (e.qualification_level || quals.length > 0) {
      punkte += 10
      gruende.push(e.qualification_level ? `Qualifikation: ${e.qualification_level}` : `${quals.length} Qualifikationsnachweis(e)`)
    } else {
      huerden.push('Keine Qualifikation hinterlegt')
    }

    // ── Leistung ─────────────────────────────────────────────────────
    if (bedarf.leistung) {
      const gesucht = bedarf.leistung.toLowerCase()
      if (quals.some(q => q.toLowerCase().includes(gesucht))) {
        punkte += 8
        gruende.push(`Erfahrung mit „${bedarf.leistung}"`)
      }
    }

    // ── Sprache ──────────────────────────────────────────────────────
    if (bedarf.sprache) {
      const gesucht = bedarf.sprache.toLowerCase()
      const sprachen = alsListe(e.languages).map(s => s.toLowerCase())
      if (sprachen.some(s => s.includes(gesucht))) {
        punkte += 7
        gruende.push(`Spricht ${bedarf.sprache}`)
      } else if (sprachen.length > 0) {
        huerden.push(`Spricht ${bedarf.sprache} nicht (hinterlegt: ${alsListe(e.languages).join(', ')})`)
      } else {
        huerden.push('Keine Sprachen hinterlegt')
      }
    }

    // ── Fahrzeug ─────────────────────────────────────────────────────
    if (bedarf.brauchtFahrzeug) {
      if (e.has_vehicle) {
        punkte += 5
        gruende.push('Eigenes Fahrzeug')
      } else {
        huerden.push('Kein Fahrzeug — Einkauf und Fahrten nur eingeschränkt')
      }
    }

    treffer.push({
      engelId: e.id,
      name: e.name,
      punkte: Math.min(punkte, MAX_PUNKTE),
      entfernungKm: km,
      gruende,
      huerden,
    })
  }

  treffer.sort((a, b) => {
    if (b.punkte !== a.punkte) return b.punkte - a.punkte
    // Bei Gleichstand die kürzere Anfahrt zuerst; unbekannte Entfernung
    // ganz nach hinten, weil sie nichts belegt.
    const ka = a.entfernungKm ?? Number.POSITIVE_INFINITY
    const kb = b.entfernungKm ?? Number.POSITIVE_INFINITY
    return ka - kb
  })

  return { treffer, ausgeschlossen }
}
