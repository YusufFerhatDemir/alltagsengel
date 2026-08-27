// ═══════════════════════════════════════════════════════════════════════
// Signaturen: welcher Dokumenttyp gehoert zu welchem Fachbereich?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND
// Alle Signatur-Routen verlangten pauschal `einsatz.lesen` bzw.
// `einsatz.schreiben`. Die Berechtigung traegt laut Rollenmatrix
// (lib/auth/rollen.ts) das „Einsatzgeschehen: Touren, Termine,
// Leistungsnachweise, Zeiterfassung" — und sie liegt bei pdl, qm UND
// buchhaltung. Die Tabelle signatur_dokumente fuehrt aber sechs Typen,
// darunter 'pflegebericht' (Gesundheitsdaten) und 'einwilligung' sowie
// 'vertrag' (Klienten-Stammdaten). Ueber den pauschalen Guard haette die
// Buchhaltung, die ausdruecklich KEINE Gesundheitsdaten sehen soll,
// Pflegeberichte und Einwilligungserklaerungen gelesen.
//
// REGEL
// Der Dokumenttyp bestimmt den Fachbereich, der Fachbereich die
// Berechtigung. Die Liste ist eine Erlaubnisliste: was hier nicht steht,
// bleibt der Administration vorbehalten. 'sonstiges' hat per Definition
// keinen erklaerten Inhalt und ist deshalb bewusst NICHT zugeordnet —
// einen Katalogtyp ohne Aussage einem Fachbereich zuzuschlagen hiesse
// raten, und geraten wird hier nicht (Grundsatz 1: verweigern ist der
// Normalfall).
// ═══════════════════════════════════════════════════════════════════════

import {
  wirksamDarf,
  wirksamIstAdministration,
  type Berechtigung,
} from '@/lib/auth/rollen'
import { SIGNATUR_DOKUMENT_TYPEN, type SignaturDokumentTyp } from './types'

export type Zugriffsart = 'lesen' | 'schreiben'

/** Fachbereich je Dokumenttyp. `null` = nur Administration. */
export const DOKUMENTTYP_BEREICH: Record<
  SignaturDokumentTyp,
  { lesen: Berechtigung; schreiben: Berechtigung } | null
> = {
  leistungsnachweis: { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  protokoll: { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  pflegebericht: { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  vertrag: { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  einwilligung: { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  sonstiges: null,
}

/**
 * Dokumenttypen, die diese Rollenlage sehen bzw. anlegen darf.
 *
 * Administration bekommt alle — einschliesslich 'sonstiges'. Alle uebrigen
 * Rollen bekommen genau die Typen ihres Fachbereichs. Eine leere Liste
 * bedeutet: kein Zugriff auf das Modul (die Routen antworten dann 403,
 * NICHT mit einer leeren Liste — eine leere Liste waere die stille
 * Falschauskunft „es gibt nichts", die dieses Projekt sich schon zweimal
 * eingefangen hat).
 */
export function sichtbareDokumenttypen(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
  art: Zugriffsart,
): SignaturDokumentTyp[] {
  if (wirksamIstAdministration(appRolle, profilRolle)) {
    return [...SIGNATUR_DOKUMENT_TYPEN]
  }
  return SIGNATUR_DOKUMENT_TYPEN.filter(typ => {
    const bereich = DOKUMENTTYP_BEREICH[typ]
    if (!bereich) return false
    return wirksamDarf(appRolle, profilRolle, bereich[art])
  })
}

/** Darf diese Rollenlage genau diesen Typ so verwenden? */
export function darfDokumenttyp(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
  typ: SignaturDokumentTyp,
  art: Zugriffsart,
): boolean {
  return sichtbareDokumenttypen(appRolle, profilRolle, art).includes(typ)
}
