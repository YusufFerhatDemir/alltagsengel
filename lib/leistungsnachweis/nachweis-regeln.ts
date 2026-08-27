// ═══════════════════════════════════════════════════════════════════
// Leistungsnachweis — Unterschrift und Storno
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND 1 — „unterschrieben" ohne Unterschrift
// Der Signatur-Weg (/api/leistungsnachweis/crud, action:'sign') setzte
// proof_status='UNTERSCHRIEBEN' und schrieb die Unterschrift nur, WENN
// eine mitkam:
//
//     if (body.client_signature) signData.client_signature = …
//
// Ohne sie lief derselbe Weg trotzdem durch. Der DB-Trigger
// `compute_signature_hash()` (20260808200000) haengt daran zwei Folgen:
//
//   NEW.signature_hash := sha256(id|client|caregiver|…|client_signed_at)
//   NEW.is_locked      := true
//
// Der Hash wird also allein aus dem Statuswechsel gebildet — er belegt
// KEINE Unterschrift, sondern nur, dass jemand den Status gesetzt hat.
// Und die Rechnungs-RPC (`create_invoice_draft_atomic`, v9) prueft genau
// diese beiden Merkmale:
//
//     AND sr.proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN'
//     AND sr.signature_hash IS NULL     → MISSING_SIGNATURE
//
// Ein Nachweis ohne jede Unterschrift war damit abrechenbar — gegenueber
// dem Kunden wie gegenueber der Pflegekasse —, und zugleich durch
// is_locked=true nicht mehr korrigierbar. Die Unterschriftspflicht aus
// 20260911010000 haengt also vollstaendig daran, dass dieser Weg den
// Status nur mit echter Unterschrift setzt. Genau das tut er jetzt.
//
// BEFUND 2 — Storno abgerechneter Nachweise
// action:'cancel' setzte proof_status und billing_status ohne jede
// Vorpruefung auf 'STORNIERT' — auch bei einem Nachweis, der bereits auf
// einer Rechnung steht (billing_status 'ZUGEORDNET'/'ABGERECHNET',
// status 'invoiced'). Die Rechnung blieb bestehen, die Position darunter
// war storniert: die Forderung stand weiter offen, ihr Beleg nicht mehr.
// Rueckgaengig gemacht wird eine gestellte Rechnung ueber Gutschrift bzw.
// Korrekturrechnung, nicht ueber ein Storno am Nachweis.
// ═══════════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'

export interface UnterschriftsQuellen {
  /** Im Request mitgeschickte Unterschrift (Data-URL oder Klartext). */
  neueSignatur?: unknown
  /** Bereits am Datensatz hinterlegte Unterschrift. */
  bestandsSignatur?: string | null
  /**
   * Anzahl der Zeilen in `service_signatures` fuer diesen Nachweis mit
   * signer_role='client' — der Weg der Native-App, die die Unterschrift
   * als Bild getrennt ablegt und den proof_status NICHT selbst setzt.
   */
  digitaleSignaturen?: number
}

function nichtLeer(wert: unknown): boolean {
  return typeof wert === 'string' && wert.trim() !== ''
}

/**
 * Liegt fuer diesen Nachweis eine Unterschrift des Klienten vor?
 *
 * Ein Unterzeichner-NAME allein zaehlt bewusst nicht: er ist eine Angabe
 * ueber die Unterschrift, nicht die Unterschrift selbst.
 */
export function hatKlientenUnterschrift(quellen: UnterschriftsQuellen): boolean {
  if (nichtLeer(quellen.neueSignatur)) return true
  if (nichtLeer(quellen.bestandsSignatur)) return true
  return (quellen.digitaleSignaturen ?? 0) > 0
}

export function assertKlientenUnterschrift(quellen: UnterschriftsQuellen): void {
  if (hatKlientenUnterschrift(quellen)) return
  throw new UserFacingError(
    'Ohne Unterschrift des Klienten lässt sich der Nachweis nicht auf "unterschrieben" setzen. '
    + 'Die Datenbank vergibt bei diesem Statuswechsel den Signatur-Hash und sperrt den Nachweis — '
    + 'er gälte damit als unterschrieben und wäre abrechenbar, ohne dass jemand unterschrieben hat. '
    + 'Bitte die Unterschrift erfassen (Unterschriftsfeld oder Erfassung über die App).',
    422,
  )
}

/**
 * Abrechnungszustaende, aus denen ein Nachweis noch storniert werden darf —
 * Erlaubnisliste. Alles andere haengt bereits an einer Rechnung.
 *
 * Ein leerer/fehlender Wert steht fuer Altbestand von vor der Einfuehrung
 * der Spalte und ist erlaubt, SOLANGE der Nachweis nicht abgerechnet ist
 * (das prueft `assertStornierbar` zusaetzlich ueber `status`).
 */
export const STORNIERBARE_BILLING_STATUS = [
  'OFFEN',
  'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET',
  'STORNIERT',
] as const

export interface NachweisZustand {
  /** service_records.status — 'invoiced' heisst: steht auf einer Rechnung. */
  status?: string | null
  billing_status?: string | null
  proof_status?: string | null
}

export function assertStornierbar(zustand: NachweisZustand): void {
  if (zustand.status === 'invoiced' || zustand.proof_status === 'ABGERECHNET') {
    throw new UserFacingError(
      'Dieser Leistungsnachweis ist bereits abgerechnet. Ein Storno am Nachweis würde die '
      + 'Rechnung unberührt lassen — die Forderung bliebe offen, ihr Beleg nicht mehr. '
      + 'Bitte über Gutschrift bzw. Korrekturrechnung stornieren.',
      409,
    )
  }
  const billing = (zustand.billing_status ?? '').trim()
  if (billing === '') return
  if ((STORNIERBARE_BILLING_STATUS as readonly string[]).includes(billing)) return
  throw new UserFacingError(
    `Dieser Leistungsnachweis steht im Abrechnungsstatus "${billing}" und hängt damit an einer `
    + 'Rechnung. Bitte zuerst die Rechnung korrigieren (Gutschrift/Korrekturrechnung).',
    409,
  )
}
