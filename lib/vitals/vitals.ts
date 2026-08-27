// ═══════════════════════════════════════════════════════════════
// Vitalwerte — reine Bewertungs-/Validierungslogik (Grenzwert-Alarme).
//
// Bewusst OHNE Datenbankzugriff und ohne lib/audit-log-Import: dieses
// Modul wird auch aus Client-Komponenten importiert (VitalChart,
// admin/vitalwerte/[clientId]). Ein einziger transitiver Import von
// lib/supabase/admin.ts (z. B. über logAuditEvent) würde dank
// `server-only` dort den Build brechen. CRUD-Funktionen mit
// SupabaseClient/Audit-Log liegen deshalb in ./server.
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  VITAL_TYPEN,
  type AlarmBewertung,
  type AlarmStufe,
  type Grenzwerte,
  type VitalSign,
  type VitalSignThreshold,
  type VitalTyp,
} from './types'

// ── Validierung ──────────────────────────────────────────────────
// UserFacingError statt Error: diese Meldungen sind redaktionell für
// Endnutzer formuliert und sollen die Route auch erreichen. Ein einfacher
// Error würde vom API-Fehler-Sanitizer (lib/api/error-sanitizer) fail-closed
// zu "Interner Serverfehler" (500) verwischt — die konkrete, hilfreiche
// Meldung ginge verloren (s. lib/medikamente, lib/akten für dasselbe Muster).

/** Wirft bei unplausiblen Eingaben (Tippfehler-Schutz, kein Alarm). */
export function validierePlausibilitaet(typ: VitalTyp, wert: number, wertSekundaer?: number | null): void {
  const cfg = VITAL_TYPEN[typ]
  if (!Number.isFinite(wert)) throw new UserFacingError(`${cfg.label}: Wert fehlt oder ist keine Zahl.`)
  if (wert < cfg.plausibelMin || wert > cfg.plausibelMax) {
    throw new UserFacingError(`${cfg.label}: ${wert} ${cfg.einheit} liegt außerhalb des plausiblen Bereichs (${cfg.plausibelMin}–${cfg.plausibelMax}).`)
  }
  if (cfg.hatSekundaer) {
    if (wertSekundaer == null || !Number.isFinite(wertSekundaer)) {
      throw new UserFacingError(`${cfg.label}: ${cfg.labelSekundaer} ist ein Pflichtfeld.`)
    }
    const minSek = cfg.plausibelMinSekundaer ?? cfg.plausibelMin
    const maxSek = cfg.plausibelMaxSekundaer ?? cfg.plausibelMax
    if (wertSekundaer < minSek || wertSekundaer > maxSek) {
      throw new UserFacingError(`${cfg.label}: ${cfg.labelSekundaer} ${wertSekundaer} ${cfg.einheit} liegt außerhalb des plausiblen Bereichs (${minSek}–${maxSek}).`)
    }
    if (wertSekundaer >= wert) {
      throw new UserFacingError(`${cfg.label}: Diastolisch (${wertSekundaer}) muss unter systolisch (${wert}) liegen.`)
    }
  } else if (wertSekundaer != null) {
    throw new UserFacingError(`${cfg.label}: Ein Zweitwert ist nur beim Blutdruck erlaubt.`)
  }
}

/**
 * Wirft bei inkonsistenten Grenzwerten (min ≥ max, kritisch innerhalb warn)
 * UND bei Grenzwerten außerhalb des plausiblen Messbereichs.
 *
 * Der zweite Fall ist kein Schönheitsfehler: validierePlausibilitaet() kappt
 * jede Messung auf [plausibelMin, plausibelMax]. Ein max_critical oberhalb
 * von plausibelMax (z. B. Puls-Obergrenze 1000) kann folglich NIE erreicht
 * werden — der kritische Alarm für diese Richtung ist damit faktisch und
 * dauerhaft abgeschaltet, ohne dass das irgendwo sichtbar wäre (fail-open).
 */
export function validiereGrenzwerte(typ: VitalTyp, g: Grenzwerte): void {
  const cfg = VITAL_TYPEN[typ]
  const pruefeBereich = (wert: number | null | undefined, praefix: string, feld: string, bereichMin: number, bereichMax: number) => {
    if (wert != null && (wert < bereichMin || wert > bereichMax)) {
      throw new UserFacingError(
        `${praefix}: ${feld} (${wert}) liegt außerhalb des plausiblen Bereichs (${bereichMin}–${bereichMax}) und würde den Alarm nie auslösen.`,
      )
    }
  }
  const pruefe = (minW: number | null | undefined, maxW: number | null | undefined,
    minK: number | null | undefined, maxK: number | null | undefined, praefix: string,
    bereichMin: number, bereichMax: number) => {
    pruefeBereich(minW, praefix, 'Untere Warngrenze', bereichMin, bereichMax)
    pruefeBereich(maxW, praefix, 'Obere Warngrenze', bereichMin, bereichMax)
    pruefeBereich(minK, praefix, 'Untere kritische Grenze', bereichMin, bereichMax)
    pruefeBereich(maxK, praefix, 'Obere kritische Grenze', bereichMin, bereichMax)
    if (minW != null && maxW != null && minW >= maxW) {
      throw new UserFacingError(`${praefix}: Untere Warngrenze (${minW}) muss unter der oberen (${maxW}) liegen.`)
    }
    if (minK != null && maxK != null && minK >= maxK) {
      throw new UserFacingError(`${praefix}: Untere kritische Grenze (${minK}) muss unter der oberen (${maxK}) liegen.`)
    }
    if (minK != null && minW != null && minK > minW) {
      throw new UserFacingError(`${praefix}: Untere kritische Grenze (${minK}) darf nicht über der Warngrenze (${minW}) liegen.`)
    }
    if (maxK != null && maxW != null && maxK < maxW) {
      throw new UserFacingError(`${praefix}: Obere kritische Grenze (${maxK}) darf nicht unter der Warngrenze (${maxW}) liegen.`)
    }
  }
  pruefe(g.min_warn, g.max_warn, g.min_critical, g.max_critical, cfg.label, cfg.plausibelMin, cfg.plausibelMax)
  if (cfg.hatSekundaer) {
    pruefe(
      g.min_warn_secondary, g.max_warn_secondary, g.min_critical_secondary, g.max_critical_secondary,
      `${cfg.label} (${cfg.labelSekundaer})`,
      cfg.plausibelMinSekundaer ?? cfg.plausibelMin, cfg.plausibelMaxSekundaer ?? cfg.plausibelMax,
    )
  } else if (
    g.min_warn_secondary != null || g.max_warn_secondary != null
    || g.min_critical_secondary != null || g.max_critical_secondary != null
  ) {
    throw new UserFacingError(`${cfg.label}: Sekundär-Grenzwerte sind nur beim Blutdruck erlaubt.`)
  }
}

// ── Alarm-Bewertung (pure) ───────────────────────────────────────

function bewerteEinzelwert(
  wert: number, g: { min_warn?: number | null; max_warn?: number | null; min_critical?: number | null; max_critical?: number | null },
  label: string, einheit: string,
): { stufe: AlarmStufe; meldung: string | null } {
  if (g.min_critical != null && wert < g.min_critical) {
    return { stufe: 'kritisch', meldung: `${label} ${wert} ${einheit} unter kritischer Grenze (${g.min_critical})` }
  }
  if (g.max_critical != null && wert > g.max_critical) {
    return { stufe: 'kritisch', meldung: `${label} ${wert} ${einheit} über kritischer Grenze (${g.max_critical})` }
  }
  if (g.min_warn != null && wert < g.min_warn) {
    return { stufe: 'warnung', meldung: `${label} ${wert} ${einheit} unter Warngrenze (${g.min_warn})` }
  }
  if (g.max_warn != null && wert > g.max_warn) {
    return { stufe: 'warnung', meldung: `${label} ${wert} ${einheit} über Warngrenze (${g.max_warn})` }
  }
  return { stufe: 'ok', meldung: null }
}

/**
 * Bewertet eine Messung gegen den klientenspezifischen Grenzwert-Satz.
 * Fällt auf die Standard-Grenzwerte des Typs zurück, wenn keiner hinterlegt
 * (oder der hinterlegte deaktiviert) ist. Typen ohne Standard → immer 'ok'.
 */
export function bewerteMesswert(
  typ: VitalTyp,
  wert: number,
  wertSekundaer: number | null | undefined,
  grenzwert: (Grenzwerte & { enabled?: boolean }) | null | undefined,
): AlarmBewertung {
  const cfg = VITAL_TYPEN[typ]
  let grenzen: Grenzwerte | null = null
  let quelle: AlarmBewertung['quelle'] = 'keine'
  if (grenzwert && grenzwert.enabled !== false) {
    grenzen = grenzwert
    quelle = 'klient'
  } else if (cfg.standard) {
    grenzen = cfg.standard
    quelle = 'standard'
  }
  if (!grenzen) return { stufe: 'ok', meldungen: [], quelle }

  const ergebnisse = [bewerteEinzelwert(wert, grenzen, cfg.labelWert, cfg.einheit)]
  if (cfg.hatSekundaer && wertSekundaer != null) {
    ergebnisse.push(bewerteEinzelwert(wertSekundaer, {
      min_warn: grenzen.min_warn_secondary, max_warn: grenzen.max_warn_secondary,
      min_critical: grenzen.min_critical_secondary, max_critical: grenzen.max_critical_secondary,
    }, cfg.labelSekundaer ?? 'Zweitwert', cfg.einheit))
  }

  const meldungen = ergebnisse.map(e => e.meldung).filter((m): m is string => m !== null)
  const stufe: AlarmStufe = ergebnisse.some(e => e.stufe === 'kritisch')
    ? 'kritisch'
    : ergebnisse.some(e => e.stufe === 'warnung') ? 'warnung' : 'ok'
  return { stufe, meldungen, quelle }
}

// ── Alarm-Übersicht ──────────────────────────────────────────────

export interface KlientenAlarm {
  client_id: string
  type: VitalTyp
  messung: VitalSign
  bewertung: AlarmBewertung
}

/**
 * Bewertet je Klient und Vitaltyp die JÜNGSTE Messung im Zeitfenster.
 * Ältere Messungen lösen keinen aktiven Alarm mehr aus — es zählt der
 * letzte bekannte Zustand.
 */
export function berechneAktuelleAlarme(
  messungen: VitalSign[], grenzwerte: VitalSignThreshold[],
): KlientenAlarm[] {
  const grenzenIndex = new Map<string, VitalSignThreshold>()
  for (const g of grenzwerte) grenzenIndex.set(`${g.client_id}:${g.type}`, g)

  // Die jüngste Messung wird SELBST bestimmt, nicht aus der Reihenfolge der
  // Eingabe abgelesen.
  //
  // Vorher galt "die erste je (Klient, Typ) ist die jüngste" — richtig nur,
  // solange der Aufrufer measured_at-absteigend sortiert übergibt. Das ist
  // eine Zusage, die kein Compiler und kein Test einfordert: ein Aufrufer,
  // der nach `created_at` sortiert, aufsteigend sortiert oder mehrere
  // Abfragen zusammenfügt, bekam eine ÄLTERE Messung als „aktuellen
  // Zustand" bewertet. Bei einem kritischen Blutdruck ist das der
  // Unterschied zwischen Alarm und Ruhe — und es fällt nirgends auf.
  const juengste = new Map<string, VitalSign>()
  for (const m of messungen) {
    const key = `${m.client_id}:${m.type}`
    const bisher = juengste.get(key)
    if (!bisher || String(m.measured_at ?? '') > String(bisher.measured_at ?? '')) {
      juengste.set(key, m)
    }
  }

  const alarme: KlientenAlarm[] = []
  for (const [key, m] of juengste) {
    const bewertung = bewerteMesswert(
      m.type, Number(m.value),
      m.value_secondary != null ? Number(m.value_secondary) : null,
      grenzenIndex.get(key) ?? null,
    )
    if (bewertung.stufe !== 'ok') {
      alarme.push({ client_id: m.client_id, type: m.type, messung: m, bewertung })
    }
  }
  // Kritische zuerst, danach nach Messzeitpunkt absteigend
  return alarme.sort((a, b) => {
    if (a.bewertung.stufe !== b.bewertung.stufe) return a.bewertung.stufe === 'kritisch' ? -1 : 1
    return b.messung.measured_at.localeCompare(a.messung.measured_at)
  })
}
