// ═══════════════════════════════════════════════════════════════
// PflegeCoach — pflegefachliche Freigabe von Inhalten
//
// DAS PROBLEM, DAS DIESES MODUL LÖST
// Bis hierher war `pruefstatus: 'fachlich_freigegeben'` ein Wort in
// lib/coach/inhalte.ts. Wer es hinschrieb, hatte damit die Freigabe erteilt —
// ohne Prüferin oder Prüfer, ohne Qualifikation, ohne Datum, ohne Protokoll,
// und ohne jeden Bezug auf DIE FASSUNG, die geprüft wurde. Ein Text konnte
// nach der Freigabe beliebig geändert werden und trug den Freigabevermerk
// weiter.
//
// DIE REGEL
// Freigegeben ist ein Inhalt nur, wenn im Register unten ein Eintrag steht,
// der (a) vollständig ist und (b) einen Inhaltsstempel trägt, der zur
// AKTUELLEN Fassung passt. Ändert sich der Text, passt der Stempel nicht mehr
// und der Inhalt fällt automatisch auf 'entwurf' zurück — mit sichtbarem
// Hinweis in der Oberfläche.
//
// FAIL-CLOSED
// Das Register ist leer. Alle zwölf Module tragen damit weiterhin 'entwurf',
// und genau das ist der wahre Zustand (AK-QI-01): die pflegefachliche Prüfung
// hat nicht stattgefunden. Sie kann intern nicht ersetzt werden — sie braucht
// eine Pflegefachkraft. Was intern möglich war, ist dies: dafür zu sorgen,
// dass die Freigabe, wenn sie kommt, nachweisbar und an eine bestimmte
// Textfassung gebunden ist.
//
// KEIN KRYPTOGRAFISCHER ANSPRUCH
// Der Inhaltsstempel schützt nicht gegen Manipulation — wer das Register
// ändern kann, kann auch den Stempel neu berechnen. Er schützt gegen das
// VERSEHEN: die Formulierung, die nach der Prüfung "nur schnell noch"
// verbessert wurde. Deshalb bewusst eine reine Rechenoperation ohne
// node:crypto: die Inhaltsseiten sind Client-Komponenten, und ein
// Node-Import würde dort das Bündel brechen.
// ═══════════════════════════════════════════════════════════════

import {
  UEBUNGEN, WISSEN_MODULE, WOHNRAUM_CHECK,
  type PruefStatus, type Uebung, type WissensModul,
} from './inhalte'

export type InhaltsArt = 'uebung' | 'wissen' | 'checkliste'

export const INHALTS_ART_LABELS: Record<InhaltsArt, string> = {
  uebung: 'Übung',
  wissen: 'Wissensmodul',
  checkliste: 'Checkliste',
}

/**
 * Ein Freigabevermerk.
 *
 * `prueferRolle` und `prueferQualifikation` stehen bewusst getrennt: die Rolle
 * sagt, wer im Haus verantwortet, die Qualifikation sagt, warum diese Person
 * pflegefachlich prüfen darf. Ein Vermerk ohne Qualifikation ist kein
 * pflegefachlicher Vermerk.
 */
export interface InhaltFreigabe {
  modulId: string
  art: InhaltsArt
  /** Stempel der geprüften Fassung — aus `inhaltsStempel()`. */
  inhaltsStempel: string
  /** Funktion im Haus, kein persönlicher Name. */
  prueferRolle: string
  /** Berufsbezeichnung/Registrierung, die die Prüfung trägt. */
  prueferQualifikation: string
  /** Datum der Prüfung, JJJJ-MM-TT. */
  geprueftAm: string
  /** Wo das Prüfprotokoll liegt. */
  protokoll: string
}

/**
 * FAIL-CLOSED — es liegt keine pflegefachliche Freigabe vor.
 *
 * Zum Eintragen: `npx tsx scripts/coach-inhalte-stempel.ts` liefert die
 * Stempel der aktuellen Fassungen. Ein Eintrag ohne passenden Stempel wirkt
 * nicht — das ist Absicht.
 */
export const INHALTE_FREIGABEN: InhaltFreigabe[] = []

/**
 * Stabiler Stempel über den fachlich relevanten Inhalt.
 *
 * Bewusst über eine kanonische, sortierte Darstellung: eine umgestellte
 * Objekt-Eigenschaft ist keine inhaltliche Änderung und soll die Freigabe
 * nicht ungültig machen.
 */
export function inhaltsStempel(inhalt: unknown): string {
  const kanonisch = (wert: unknown): unknown => {
    if (Array.isArray(wert)) return wert.map(kanonisch)
    if (wert && typeof wert === 'object') {
      return Object.fromEntries(
        Object.entries(wert as Record<string, unknown>)
          // Der Prüfstatus selbst gehört nicht in den Stempel: sonst änderte
          // die Freigabe den Stempel und machte sich damit selbst ungültig.
          .filter(([k]) => k !== 'pruefstatus')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, kanonisch(v)]),
      )
    }
    return wert
  }
  return stempelVonText(JSON.stringify(kanonisch(inhalt)))
}

/**
 * Vier unabhängige FNV-1a-Läufe mit verschiedenen Startwerten, aneinander
 * gehängt: 32 Hexstellen. Ein einzelner 32-Bit-Lauf kollidierte bei zwölf
 * Modulen zwar praktisch nie, aber der Stempel wird von Menschen abgeschrieben
 * und soll erkennbar ein Stempel sein, keine kurze Zahl.
 */
function stempelVonText(text: string): string {
  const STARTWERTE = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
  return STARTWERTE.map(start => {
    let h = start >>> 0
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i) & 0xff
      h = Math.imul(h, 0x01000193) >>> 0
      h ^= (text.charCodeAt(i) >>> 8) & 0xff
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }).join('')
}

/** Mängel eines Vermerks. Leer = wirksam (sofern der Stempel passt). */
export function pruefeFreigabe(freigabe: InhaltFreigabe): string[] {
  const maengel: string[] = []
  if (!freigabe.modulId?.trim()) maengel.push('modulId fehlt.')
  if (!/^[0-9a-f]{32}$/.test(freigabe.inhaltsStempel ?? '')) maengel.push('Inhaltsstempel fehlt oder ist unlesbar.')
  if (!freigabe.prueferRolle?.trim()) maengel.push('Prüfende Rolle fehlt.')
  if (!freigabe.prueferQualifikation?.trim()) {
    maengel.push('Pflegefachliche Qualifikation fehlt — ohne sie ist der Vermerk keine Fachprüfung.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(freigabe.geprueftAm ?? '')) maengel.push('Prüfdatum fehlt oder hat nicht das Format JJJJ-MM-TT.')
  if (!freigabe.protokoll?.trim()) maengel.push('Protokollverweis fehlt — eine Freigabe ohne Protokoll ist eine Behauptung.')
  return maengel
}

export interface FreigabeBefund {
  modulId: string
  art: InhaltsArt
  status: PruefStatus
  /** Warum nicht freigegeben — null, wenn freigegeben. */
  grund: string | null
  /** Stempel der aktuellen Fassung, für den Eintrag ins Register. */
  aktuellerStempel: string
}

function beurteile(
  modulId: string,
  art: InhaltsArt,
  inhalt: unknown,
  register: InhaltFreigabe[],
): FreigabeBefund {
  const aktuellerStempel = inhaltsStempel(inhalt)
  const eintrag = register.find(f => f.modulId === modulId && f.art === art)

  if (!eintrag) {
    return { modulId, art, status: 'entwurf', grund: 'Keine pflegefachliche Freigabe hinterlegt.', aktuellerStempel }
  }

  const maengel = pruefeFreigabe(eintrag)
  if (maengel.length > 0) {
    return { modulId, art, status: 'entwurf', grund: `Freigabevermerk unvollständig: ${maengel.join(' ')}`, aktuellerStempel }
  }

  if (eintrag.inhaltsStempel !== aktuellerStempel) {
    return {
      modulId, art, status: 'entwurf', aktuellerStempel,
      grund: 'Der Inhalt wurde nach der Freigabe geändert — der Vermerk gilt für eine andere Fassung.',
    }
  }

  return { modulId, art, status: 'fachlich_freigegeben', grund: null, aktuellerStempel }
}

/** Der Prüfstatus einer Übung — aus dem Register, nicht aus dem Literal. */
export function pruefstatusUebung(u: Uebung, register: InhaltFreigabe[] = INHALTE_FREIGABEN): PruefStatus {
  return beurteile(u.id, 'uebung', u, register).status
}

/** Der Prüfstatus eines Wissensmoduls — aus dem Register, nicht aus dem Literal. */
export function pruefstatusWissen(m: WissensModul, register: InhaltFreigabe[] = INHALTE_FREIGABEN): PruefStatus {
  return beurteile(m.id, 'wissen', m, register).status
}

/** Vollständige Sicht über alle Inhalte — für Prüfdossier, Bericht und Test. */
export function freigabeUebersicht(register: InhaltFreigabe[] = INHALTE_FREIGABEN): FreigabeBefund[] {
  return [
    ...UEBUNGEN.map(u => beurteile(u.id, 'uebung', u, register)),
    ...WISSEN_MODULE.map(m => beurteile(m.id, 'wissen', m, register)),
    beurteile('wohnraum-check', 'checkliste', WOHNRAUM_CHECK, register),
  ]
}

export interface FreigabeStand {
  gesamt: number
  freigegeben: number
  entwurf: number
  /** true nur, wenn jeder Inhalt einen wirksamen Vermerk trägt. */
  vollstaendig: boolean
}

export function freigabeStand(register: InhaltFreigabe[] = INHALTE_FREIGABEN): FreigabeStand {
  const befunde = freigabeUebersicht(register)
  const freigegeben = befunde.filter(b => b.status === 'fachlich_freigegeben').length
  return {
    gesamt: befunde.length,
    freigegeben,
    entwurf: befunde.length - freigegeben,
    vollstaendig: freigegeben === befunde.length && befunde.length > 0,
  }
}
