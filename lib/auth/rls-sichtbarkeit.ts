// ═══════════════════════════════════════════════════════════════════════
// Sieht die Rolle, für die eine Seite freigegeben ist, dort überhaupt etwas?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (29.08.2026): `/admin/nachweise` steht in der Navigation und ist
// über `BEREICHE` für `personal.lesen` freigegeben — also für `pdl` und
// `qm`. Die Seite liest `caregiver_qualifications` mit dem BROWSER-Client,
// also unter RLS. Auf dieser Tabelle steht live genau eine verwaltende
// Policy: `is_admin()`, und die ist auf `admin`/`superadmin` beschränkt.
//
// Für die Pflegedienstleitung kommt damit eine LEERE Liste zurück. Kein
// Fehler, keine Meldung — „Keine Nachweise vorhanden". Eine Seite, die
// Ablaufwarnungen zu Führungszeugnissen zeigen soll, sagt der Rolle, die
// sie braucht, dass alles in Ordnung sei.
//
// Das ist keine Frage dieser einen Seite, sondern eine Klasse. Wer eine
// Admin-Seite über den Browser-Client lesen lässt, verlässt sich auf RLS —
// und die RLS dieses Schemas kennt drei Wege für Verwaltungsrollen:
//
//   is_admin()            → nur admin, superadmin
//   is_internal_staff()   → admin, superadmin, pdl, buero
//   darf('bereich.recht') → jede Rolle, deren Matrix dieses Recht führt
//
// Fehlt für eine Tabelle der dritte Weg, sieht jede Rolle ausser der
// Administration nichts — obwohl der Seiten-Guard sie durchgelassen hat.
//
// Hier steht die reine Auswertung; die Live-Abfrage macht
// `scripts/lint-rls-sichtbarkeit.ts`. Getrennt, weil eine Regel, die nur
// gegen die Produktionsdatenbank läuft, in keinem Testlauf geprüft werden
// kann — und eine ungeprüfte Prüfung ist eine Behauptung.

import { BEREICHE, bereichFuerPfad } from './bereiche'
import { ROLLEN_MATRIX, VERWALTUNGSROLLEN, type Rolle, type Berechtigung } from './rollen'

/**
 * Rollen, die `is_admin()` live abdeckt. Am 29.08.2026 aus `pg_proc`
 * gelesen. Die Live-Fassung wird vom Skript gegengeprüft — die Annahme
 * steht also nicht ungeprüft im Raum.
 */
export const IS_ADMIN_ROLLEN = ['admin', 'superadmin'] as readonly Rolle[]

/** Rollen, die `is_internal_staff()` live abdeckt (ebenso gelesen). */
export const IS_STAFF_ROLLEN = ['admin', 'superadmin', 'pdl', 'buero'] as readonly Rolle[]

export interface Policy {
  tabelle: string
  name: string
  /** Der `qual`-Ausdruck aus `pg_policies`, Zeilenumbrüche entfernt. */
  qual: string
}

/**
 * Welche Verwaltungsrollen erreicht diese Policy?
 *
 * ERKENNT die drei bekannten Muster, WERTET NICHT AUS. Alles andere
 * (Eigene-Zeilen-Pfade wie `eigene_caregiver_ids()` oder
 * `clients.user_id = auth.uid()`) zählt bewusst NICHT als Lesepfad für
 * eine Verwaltungsrolle. Das ist die richtige Richtung des Zweifels: ein
 * übersehener Pfad erzeugt eine zu prüfende Meldung, ein zu grosszügiger
 * Schluss eine übersehene leere Seite.
 */
export function rollenDerPolicy(qual: string): Set<Rolle> {
  const erreicht = new Set<Rolle>()
  if (/\bis_admin\(\)/.test(qual)) IS_ADMIN_ROLLEN.forEach(r => erreicht.add(r))
  if (/\bis_internal_staff\(\)/.test(qual)) IS_STAFF_ROLLEN.forEach(r => erreicht.add(r))
  // Eine offene Anmeldeprüfung erreicht jede angemeldete Rolle.
  if (/auth\.uid\(\)\s+IS NOT NULL/.test(qual) || /auth\.role\(\)\s*=\s*'authenticated'/.test(qual)) {
    VERWALTUNGSROLLEN.forEach(r => erreicht.add(r))
  }
  for (const treffer of qual.matchAll(/darf\('([^']+)'/g)) {
    const recht = treffer[1] as Berechtigung
    for (const rolle of VERWALTUNGSROLLEN) {
      if ((ROLLEN_MATRIX[rolle] as readonly string[]).includes(recht)) erreicht.add(rolle)
    }
  }
  return erreicht
}

/** Welche Verwaltungsrollen können diese Tabelle unter RLS überhaupt lesen? */
export function rollenDerTabelle(policies: Policy[], tabelle: string): Set<Rolle> {
  const erreicht = new Set<Rolle>()
  for (const p of policies) {
    if (p.tabelle !== tabelle) continue
    rollenDerPolicy(p.qual).forEach(r => erreicht.add(r))
  }
  return erreicht
}

/**
 * Rollen, die der Seiten-Guard zum LESEN durchlässt.
 *
 * Dynamische Segmente werden entfernt: `bereichFuerPfad` sucht ohnehin den
 * längsten passenden Präfix, und `/admin/caregivers/[id]` erbt seine Regel
 * von `/admin/caregivers`.
 */
export function rollenDerSeite(route: string): Rolle[] {
  const bereich = bereichFuerPfad(route.replace(/\/\[[^\]]+\]/g, ''))
  if (!bereich) return []
  const regel = BEREICHE[bereich as keyof typeof BEREICHE]
  if (!regel?.lesen) return []
  return VERWALTUNGSROLLEN.filter(
    r => (ROLLEN_MATRIX[r] as readonly string[]).includes(regel.lesen as Berechtigung),
  )
}

export interface Befund {
  seite: string
  rolle: Rolle
  /** Tabellen, auf die diese Rolle auf dieser Seite blind ist. */
  tabellen: string[]
}

export interface Auswertung {
  befunde: Befund[]
  /** Tabellen ohne jede permissive Lese-Policy — nicht bewertet, nur gemeldet. */
  ohnePolicy: string[]
}

/**
 * Wertet aus, welche Seite welcher Rolle eine leere Ansicht liefert.
 *
 * `seiten` bildet die Route auf die Tabellen ab, die sie mit dem
 * Browser-Client liest. `policies` sind die live gelesenen permissiven
 * Lese-Policies.
 *
 * Die Administration wird ausgelassen — sie sieht per Definition alles,
 * und ein Befund über sie wäre nie einer.
 */
export function werteAus(seiten: Map<string, string[]>, policies: Policy[]): Auswertung {
  const befunde: Befund[] = []
  const ohnePolicy = new Set<string>()
  const proTabelle = new Map<string, Set<Rolle>>()

  for (const [seite, tabellen] of seiten) {
    for (const rolle of rollenDerSeite(seite)) {
      if (IS_ADMIN_ROLLEN.includes(rolle)) continue
      const blind = tabellen.filter(t => {
        if (!policies.some(p => p.tabelle === t)) {
          // Ohne jede Policy ist die Aussage eine andere: dann sieht auch
          // die Administration nichts, und die Ursache liegt woanders.
          ohnePolicy.add(`${seite} → ${t}`)
          return false
        }
        if (!proTabelle.has(t)) proTabelle.set(t, rollenDerTabelle(policies, t))
        return !proTabelle.get(t)!.has(rolle)
      })
      if (blind.length > 0) befunde.push({ seite, rolle, tabellen: blind })
    }
  }

  befunde.sort((x, y) => x.seite.localeCompare(y.seite) || x.rolle.localeCompare(y.rolle))
  return { befunde, ohnePolicy: [...ohnePolicy].sort() }
}
