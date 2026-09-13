/**
 * Dublettenerkennung für Leads.
 *
 * ── WARUM DAS NICHT AUTOMATISCH ZUSAMMENFÜHRT ─────────────────────────
 * Dieses Modul **findet** Dubletten und führt sie nicht zusammen. Zwei
 * Zeilen mit derselben Telefonnummer können eine doppelt abgeschickte
 * Anfrage sein — oder Mutter und Tochter unter einem Festnetzanschluss,
 * oder zwei Bewerberinnen aus demselben Haushalt. Ein Zusammenführen wäre
 * unumkehrbar und träfe im Zweifel die falsche Person.
 *
 * Die Verwaltung entscheidet, das Modul legt vor.
 *
 * ── DIE DREI MERKMALE SIND UNTERSCHIEDLICH STARK ──────────────────────
 * E-Mail ist das stärkste (technisch eindeutig), Telefon das zweite
 * (Haushaltsanschlüsse teilen sich eine Nummer), Name das schwächste
 * (Namensvettern sind häufiger, als man denkt). Deshalb trägt jeder Fund
 * seine Stärke mit — eine Liste, die alle drei gleich behandelt, erzeugt
 * Misstrauen gegen ihre eigenen starken Treffer.
 *
 * Rein rechnend, kein Datenbankzugriff.
 */

export type Merkmal = 'email' | 'telefon' | 'name'

export const MERKMAL_META: Record<Merkmal, { label: string; staerke: number; hinweis: string }> = {
  email: { label: 'E-Mail', staerke: 3, hinweis: 'Technisch eindeutig — mit hoher Wahrscheinlichkeit dieselbe Person' },
  telefon: { label: 'Telefon', staerke: 2, hinweis: 'Kann ein geteilter Haushaltsanschluss sein' },
  name: { label: 'Name', staerke: 1, hinweis: 'Schwächstes Merkmal — Namensgleichheit kommt vor' },
}

export interface DublettenZeile {
  id: string
  name?: string | null
  email?: string | null
  telefon?: string | null
}

export interface Dublette {
  merkmal: Merkmal
  /** Der normalisierte Wert, an dem die Zeilen hängen. Nie roh angezeigt. */
  schluessel: string
  ids: string[]
}

/** Kleinschreibung, Rand-Leerraum weg. Leer ergibt `null`. */
function text(w: string | null | undefined): string | null {
  const t = (w ?? '').trim().toLowerCase()
  return t.length > 0 ? t : null
}

/**
 * Telefonnummern auf Ziffern reduzieren, damit `+49 6181 …` und
 * `06181/…` als dieselbe Nummer erkannt werden. Die deutsche
 * Länderkennung wird auf die führende Null normiert.
 *
 * Unter acht Ziffern wird nicht verglichen: Durchwahlfragmente und
 * abgeschnittene Eingaben erzeugen sonst Treffer, die keine sind.
 */
export function telefonSchluessel(w: string | null | undefined): string | null {
  const roh = (w ?? '').replace(/[^\d+]/g, '')
  if (!roh) return null
  let z = roh.startsWith('+49') ? `0${roh.slice(3)}` : roh.startsWith('0049') ? `0${roh.slice(4)}` : roh
  z = z.replace(/\D/g, '')
  return z.length >= 8 ? z : null
}

/** Name ohne Mehrfach-Leerzeichen — „Erika  Müller" und „Erika Müller". */
export function nameSchluessel(w: string | null | undefined): string | null {
  const t = text(w)
  return t ? t.replace(/\s+/g, ' ') : null
}

const SCHLUESSEL: Record<Merkmal, (z: DublettenZeile) => string | null> = {
  email: z => text(z.email),
  telefon: z => telefonSchluessel(z.telefon),
  name: z => nameSchluessel(z.name),
}

/**
 * Alle Dublettengruppen, stärkstes Merkmal zuerst.
 *
 * Ein Paar, das sich E-Mail **und** Name teilt, erscheint zweimal — einmal
 * je Merkmal. Das ist Absicht: die Verwaltung soll sehen, worauf der
 * Verdacht beruht, nicht nur dass einer besteht.
 */
export function findeDubletten(zeilen: readonly DublettenZeile[]): Dublette[] {
  const raus: Dublette[] = []
  for (const merkmal of ['email', 'telefon', 'name'] as const) {
    const nach = new Map<string, string[]>()
    for (const z of zeilen) {
      const k = SCHLUESSEL[merkmal](z)
      if (!k) continue
      const liste = nach.get(k)
      if (liste) liste.push(z.id)
      else nach.set(k, [z.id])
    }
    for (const [schluessel, ids] of nach) {
      if (ids.length > 1) raus.push({ merkmal, schluessel, ids })
    }
  }
  return raus.sort((a, b) =>
    MERKMAL_META[b.merkmal].staerke - MERKMAL_META[a.merkmal].staerke
    || b.ids.length - a.ids.length)
}

/**
 * Wie viele Zeilen stehen in **mindestens einer** Gruppe?
 *
 * Nicht die Summe der Gruppengrößen: eine Zeile, die über E-Mail und Name
 * auffällt, ist eine Zeile. Diese Zahl nennt man einer Person.
 */
export function betroffeneZeilen(dubletten: readonly Dublette[]): number {
  const ids = new Set<string>()
  for (const d of dubletten) for (const id of d.ids) ids.add(id)
  return ids.size
}

/** Die Gruppen, in denen eine bestimmte Zeile steht. */
export function dublettenVon(dubletten: readonly Dublette[], id: string): Dublette[] {
  return dubletten.filter(d => d.ids.includes(id))
}
