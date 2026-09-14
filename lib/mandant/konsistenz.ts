// ═══════════════════════════════════════════════════════════════════════
// Mandanten-Konsistenz der Bestandsdaten
// ═══════════════════════════════════════════════════════════════════════
//
// WOZU (Block 51, 14.09.2026)
//
// `lint:org-id` verhindert, dass ein NEUER Dienstschluessel-Insert die
// `organization_id` vergisst. Der Spalten-Default `current_org_id()` ist
// naemlich fail-open: beim Dienstschluessel gibt es keinen angemeldeten
// Nutzer, die Fallback-Kette laeuft ins Leere und endet in einer fest
// verdrahteten Stamm-Organisation.
//
// Was dabei ENTSTEHT, hat niemand gemessen: eine Zeile, deren
// `organization_id` nicht zu der ihres Fremdschluessels passt. Ein
// Leistungsnachweis beim Mandanten A, dessen Klient zu B gehoert. Der
// RESTRICTIVE `org_fence` versteckt so eine Zeile dann vor dem eigenen
// Mandanten UND zeigt sie dem fremden — die Wirkung geht in beide
// Richtungen, und beide sind still.
//
// Die Pruefung leitet ihre Liste aus dem SCHEMA ab: jede
// Fremdschluessel-Beziehung, bei der BEIDE Seiten `organization_id`
// tragen. Eine neue Tabelle ist damit automatisch dabei — eine
// handgepflegte Liste waere nach der naechsten Migration unvollstaendig.
//
// Am 14.09.2026 live gemessen: 283 Beziehungen, 0 mit Drift.
// ═══════════════════════════════════════════════════════════════════════

export interface DriftZeile {
  kind: string
  spalte: string
  eltern: string
  anzahl: number
}

export interface KonsistenzBefund {
  geprueft: number
  drift: DriftZeile[]
}

/**
 * Liest die Antwort des Lese-Orakels.
 *
 * Format je Zeile: `kind|spalte|eltern|anzahl`, danach eine Zeile
 * `GEPRUEFT|<n>`. Getrennt gehalten, damit „keine Drift gefunden" und
 * „nichts geprueft" unterscheidbar bleiben — ohne die zweite Zahl saehe
 * ein fehlgeschlagener Lauf aus wie ein makelloser Bestand.
 */
export function leseKonsistenzAntwort(nutzlast: string): KonsistenzBefund {
  const drift: DriftZeile[] = []
  let geprueft = 0
  for (const zeile of nutzlast.split('\n').map(z => z.trim()).filter(Boolean)) {
    const teile = zeile.split('|')
    if (teile[0] === 'GEPRUEFT') {
      geprueft = Number(teile[1]) || 0
      continue
    }
    if (teile.length < 4) continue
    const anzahl = Number(teile[3])
    if (!Number.isFinite(anzahl) || anzahl <= 0) continue
    drift.push({ kind: teile[0], spalte: teile[1], eltern: teile[2], anzahl })
  }
  return { geprueft, drift }
}

/**
 * Rot bei Drift — und ebenso, wenn nichts geprueft wurde.
 *
 * Null gepruefte Beziehungen heissen nicht „makelloses Schema", sondern
 * „die Abfrage ist nicht durchgelaufen". Ein Detektor, der bei Blindheit
 * gruen meldet, ist schlimmer als keiner (Block 50).
 */
export function istKonsistenzBefund(b: KonsistenzBefund): boolean {
  return b.drift.length > 0 || b.geprueft === 0
}

/** Die Meldung fuer den Prueflauf. */
export function konsistenzMeldung(b: KonsistenzBefund): string {
  if (b.geprueft === 0) {
    return 'Null Beziehungen geprueft. Das ist kein Freispruch, sondern eine '
      + 'nicht durchgelaufene Abfrage.'
  }
  if (b.drift.length === 0) {
    return `${b.geprueft} Fremdschluessel-Beziehungen geprueft, keine Zeile steht beim `
      + 'falschen Mandanten.'
  }
  const zeilen = b.drift.map(
    d => `  ✗ ${d.kind}.${d.spalte} -> ${d.eltern}: ${d.anzahl} Zeile(n) mit fremder organization_id`,
  )
  return [
    `${b.geprueft} Beziehungen geprueft, ${b.drift.length} mit Mandanten-Drift:`,
    ...zeilen,
    '',
    'Eine solche Zeile ist fuer den eigenen Mandanten unsichtbar (der',
    'RESTRICTIVE org_fence filtert sie weg) und fuer den fremden sichtbar.',
    'Beide Wirkungen sind still.',
  ].join('\n')
}
