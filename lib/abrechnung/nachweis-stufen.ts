/**
 * Die drei Statusspalten eines Leistungsnachweises — und wann sie
 * zusammenpassen.
 *
 * ── DIE AUSGANGSFRAGE ─────────────────────────────────────────────────
 * `service_records` führt DREI Zustände nebeneinander:
 *
 *   status          draft · incomplete · complete · signed · invoiced
 *   proof_status    ENTWURF · ABGESCHLOSSEN · UNTERSCHRIEBEN · ABGERECHNET · STORNIERT
 *   billing_status  OFFEN · KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET ·
 *                   ZUGEORDNET · ABGERECHNET · STORNIERT
 *
 * Live stehen 28 von 30 Zeilen auf `proof_status='ENTWURF'`, obwohl sie
 * `signed` oder `invoiced` sind. Die naheliegende Erklärung wäre: der
 * Abrechnungsweg schreibt `status` direkt und vergisst die zweite Spalte.
 *
 * ── WAS DIE PROBE AM 14.09.2026 ERGEBEN HAT ───────────────────────────
 * Diese Erklärung ist falsch — jedenfalls für neue Nachweise. Ein Lauf
 * gegen die Produktionsdatenbank hat auf einem unterschriebenen,
 * gesperrten, abgerechneten Nachweis DREI Schreibversuche abgesetzt:
 *
 *   proof_status='ABGERECHNET'                    → P0001 abgewiesen
 *   billing_status='ABGERECHNET'                  → P0001 abgewiesen
 *   beide zusammen                                → P0001 abgewiesen
 *
 * Jedes Mal: „Leistungsnachweis ist gesperrt -- Aenderungen sind nicht
 * mehr moeglich."
 *
 * Der Grund ist `prevent_locked_record_change` (zuletzt Migration
 * `20260829200000`). Auf einer Zeile mit `is_locked = true` lässt die
 * Sperre genau ZWEI Dinge durch:
 *
 *   1. `proof_status = 'STORNIERT'` — der Widerruf,
 *   2. `status`: signed/complete → invoiced, bei sonst UNVERÄNDERTER
 *      Zeile (`to_jsonb(OLD) = to_jsonb(NEW)` ohne status/updated_at und
 *      ohne generierte Spalten).
 *
 * Punkt 2 ist der entscheidende: sobald neben `status` noch irgendeine
 * andere Spalte anders ist, greift die Sperre. `proof_status` ist eine
 * andere Spalte.
 *
 * ── DIE FOLGE ─────────────────────────────────────────────────────────
 * `proof_status='ABGERECHNET'` ist für einen unterschriebenen Nachweis
 * **strukturell unerreichbar**. Nicht schwer erreichbar — unerreichbar.
 * Die Unterschrift sperrt die Zeile, und danach darf die Spalte nur noch
 * auf STORNIERT.
 *
 * Der Endstand eines korrekt durchlaufenen NEUEN Nachweises ist also:
 *
 *   status = 'invoiced'  ·  proof_status = 'UNTERSCHRIEBEN'
 *
 * Das ist keine Drift, sondern der vorgesehene Zustand. Wer ihn als
 * Abweichung meldet, erzeugt bei jedem sauber abgerechneten Nachweis
 * einen Fehlalarm.
 *
 * ── DER WIDERSPRUCH, DER BLEIBT ───────────────────────────────────────
 * Der Sync-Trigger aus `20260901010000` bildet `ABGERECHNET → invoiced`
 * ab. Diese Abbildung kann unter der Sperre nie zum Zug kommen. Zwei
 * angewendete Migrationen widersprechen sich also: die eine sieht einen
 * Wert vor, die andere macht ihn unerreichbar.
 *
 * Aufzulösen wäre das nur an der Sperre selbst (DDL) und nur mit einer
 * fachlichen Entscheidung darüber, ob `proof_status` den Abrechnungsstand
 * überhaupt führen soll. Beides steht hier nicht zur Debatte. Diese Datei
 * hält den Widerspruch fest, statt ihn zu verdecken.
 *
 * ── WAS DIESE DATEI IST UND WAS NICHT ─────────────────────────────────
 * Sie ändert **nichts** an Daten. Sie sagt nur, welche Kombination
 * stimmig ist. Die Werte und die Abbildung stammen aus den Migrationen,
 * nicht aus dem Anwendungscode; ein Test hält sie dort gegen.
 */

/** `service_records.status` — was die Abrechnung steuert. */
export const STATUS_RANG: Record<string, number> = {
  draft: 0,
  incomplete: 1,
  complete: 2,
  signed: 3,
  invoiced: 4,
}

/** `service_records.proof_status` — der Erfassungsstand. */
export const PROOF_STATUS = [
  'ENTWURF', 'ABGESCHLOSSEN', 'UNTERSCHRIEBEN', 'ABGERECHNET', 'STORNIERT',
] as const
export type ProofStatus = (typeof PROOF_STATUS)[number]

/** `service_records.billing_status` — der Abrechnungsweg. */
export const BILLING_STATUS = [
  'OFFEN', 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET',
  'ZUGEORDNET', 'ABGERECHNET', 'STORNIERT',
] as const
export type BillingStatus = (typeof BILLING_STATUS)[number]

/**
 * Die Abbildung des Triggers, eins zu eins.
 *
 * `STORNIERT` hat bewusst KEIN Gegenstück: ein Widerruf läuft über
 * `billing_status`, nicht über `status`. Der Trigger lässt `status` in
 * diesem Fall unverändert stehen.
 */
export const PROOF_ZU_STATUS: Record<ProofStatus, string | null> = {
  ENTWURF: 'draft',
  ABGESCHLOSSEN: 'complete',
  UNTERSCHRIEBEN: 'signed',
  ABGERECHNET: 'invoiced',
  STORNIERT: null,
}

/**
 * Der höchste `proof_status`, den ein Nachweis tatsächlich erreichen
 * kann.
 *
 * Die Unterschrift setzt `is_locked`; ab da weist
 * `prevent_locked_record_change` jede Änderung an dieser Spalte ab —
 * außer auf STORNIERT. Am 14.09.2026 gegen die Produktionsdatenbank
 * belegt (P0001 auf drei Schreibversuche).
 */
export const PROOF_ENDSTAND_UNTER_SPERRE: ProofStatus = 'UNTERSCHRIEBEN'

/**
 * `proof_status`-Werte, die der CHECK zulässt, die Sperre aber
 * unerreichbar macht.
 *
 * Steht so ein Wert doch in einer Zeile, ist er entweder aus der Zeit vor
 * der Sperre oder an ihr vorbei geschrieben worden — beides ist eine
 * Angabe über die Herkunft der Zeile, kein laufender Vorgang.
 */
export const PROOF_UNERREICHBAR: readonly ProofStatus[] = ['ABGERECHNET']

export function istProofStatus(w: unknown): w is ProofStatus {
  return typeof w === 'string' && (PROOF_STATUS as readonly string[]).includes(w)
}

export function istBillingStatus(w: unknown): w is BillingStatus {
  return typeof w === 'string' && (BILLING_STATUS as readonly string[]).includes(w)
}

export function statusRang(status: string | null | undefined): number {
  if (!status) return -1
  return STATUS_RANG[status] ?? -1
}

/**
 * Was der Trigger aus einem `proof_status` machen WÜRDE.
 *
 * Gibt den bisherigen Wert zurück, wenn der Zielrang nicht höher liegt —
 * der Trigger setzt nie zurück.
 */
export function statusNachTrigger(
  proof: string | null | undefined,
  bisher: string | null | undefined,
): string | null {
  if (!istProofStatus(proof)) return bisher ?? null
  const ziel = PROOF_ZU_STATUS[proof]
  if (!ziel) return bisher ?? null
  return statusRang(ziel) > statusRang(bisher) ? ziel : (bisher ?? null)
}

export interface Nachweiszustand {
  status?: string | null
  proof_status?: string | null
  billing_status?: string | null
}

export interface Stimmigkeit {
  stimmig: boolean
  /** Klartext je Abweichung — leer, wenn alles zusammenpasst. */
  abweichungen: string[]
}

/**
 * Passen die drei Spalten zusammen?
 *
 * ── DIE REGELN ────────────────────────────────────────────────────────
 * 1. Alle drei Werte müssen im jeweiligen Wertebereich liegen.
 * 2. `status` darf nicht HINTER dem liegen, was `proof_status` bedeutet.
 *    Diese Richtung dürfte der Sync-Trigger gar nicht zulassen.
 * 3. `status` darf dem `proof_status` genau EINEN Schritt voraus sein,
 *    und nur oben: `invoiced` bei `UNTERSCHRIEBEN`. Das ist der
 *    Abrechnungsvermerk, den die Sperre als einzige Änderung durchlässt —
 *    `proof_status` kann dabei gar nicht mitgezogen werden.
 *    Jeder größere Vorsprung ist echte Drift: dann ist ein Nachweis
 *    abgerechnet worden, der nie unterschrieben war.
 * 4. `STORNIERT` gehört zusammen: steht es in einer der beiden Spalten,
 *    muss es in der anderen stehen — sonst gilt ein Widerruf halb.
 *
 * KEINE Regel ist `invoiced` + `billing_status='OFFEN'`. Auch diese
 * Spalte ist nach der Unterschrift gesperrt; OFFEN ist dort der
 * vorgesehene Endstand, nicht ein vergessener Eintrag.
 */
export function pruefeStimmigkeit(z: Nachweiszustand): Stimmigkeit {
  const ab: string[] = []
  const { status, proof_status: proof, billing_status: billing } = z

  if (status != null && statusRang(status) < 0) {
    ab.push(`status „${status}" ist kein bekannter Wert`)
  }
  if (proof != null && !istProofStatus(proof)) {
    ab.push(`proof_status „${proof}" ist kein bekannter Wert`)
  }
  if (billing != null && !istBillingStatus(billing)) {
    ab.push(`billing_status „${billing}" ist kein bekannter Wert`)
  }
  if (ab.length > 0) return { stimmig: false, abweichungen: ab }

  if (istProofStatus(proof) && proof !== 'STORNIERT') {
    const erwartet = PROOF_ZU_STATUS[proof]
    if (erwartet && statusRang(status) < statusRang(erwartet)) {
      ab.push(`status „${status}" liegt hinter proof_status „${proof}" (erwartet mindestens „${erwartet}")`)
    }
    if (erwartet && statusRang(status) > statusRang(erwartet) && !istAbrechnungsvermerk(status, proof)) {
      ab.push(`proof_status „${proof}" hinkt status „${status}" hinterher`)
    }
  }

  const stornoProof = proof === 'STORNIERT'
  const stornoBilling = billing === 'STORNIERT'
  if (stornoProof !== stornoBilling && (stornoProof || stornoBilling)) {
    ab.push('Storno steht nur in einer der beiden Spalten — ein Widerruf gilt sonst halb')
  }

  return { stimmig: ab.length === 0, abweichungen: ab }
}

/**
 * Der eine erlaubte Vorsprung: abgerechnet, aber `proof_status` steht
 * noch auf der Unterschrift.
 *
 * Genau diesen Zustand erzeugt der Abrechnungsweg, und genau diesen lässt
 * die Sperre zu. Alles darüber hinaus wäre an der Unterschrift vorbei
 * abgerechnet.
 */
export function istAbrechnungsvermerk(
  status: string | null | undefined,
  proof: string | null | undefined,
): boolean {
  return status === 'invoiced' && proof === PROOF_ENDSTAND_UNTER_SPERRE
}

/**
 * Die Stationen der Geldweg-Prüfung, mit dem Zustand, den ein Nachweis
 * dort haben muss.
 *
 * `scripts/verify-geldweg-live.mjs` fährt diese Kette gegen die echte
 * Datenbank. Bis zum 13.09.2026 hat sie `proof_status` an Station 5 nur
 * ANGEZEIGT, nicht geprüft. Diese Tabelle sagt, was dort stehen soll —
 * und für `abgerechnet` ist das `UNTERSCHRIEBEN`, nicht `ABGERECHNET`.
 */
export interface StationsErwartung {
  station: string
  status: string
  proof_status: ProofStatus
  /** `null` = an dieser Station nicht festgelegt. */
  billing_status: BillingStatus | null
}

export const GELDWEG_STATIONEN: readonly StationsErwartung[] = [
  { station: 'nachweis', status: 'draft', proof_status: 'ENTWURF', billing_status: 'OFFEN' },
  { station: 'unterschrift', status: 'signed', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' },
  // Die Sperre laesst hier nur den Statuswechsel durch. Die beiden
  // anderen Spalten bleiben stehen, wo die Unterschrift sie hinterlassen
  // hat — das ist der Endstand, nicht ein Rueckstand.
  { station: 'abgerechnet', status: 'invoiced', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' },
]
