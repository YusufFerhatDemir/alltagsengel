/**
 * KIM / TI-Anbindung — Readiness (Block 18)
 *
 * Beantwortet eine Frage: Könnte diese Organisation heute etwas über KIM
 * versenden — und wenn nein, woran genau? Übernimmt dieselbe Trennung wie
 * lib/abrechnung/sgb-v/readiness.ts:
 *   INTERN — im Code/in der Datenbank lösbar (Konfiguration anlegen, Karten
 *            erfassen, Nachrichten vorbereiten)
 *   EXTERN — nur von aussen beschaffbar (gematik-Zulassung, KIM-Provider-
 *            Vertrag, Konnektor-Anbindung, Technische Anlage 5)
 *
 * Die Trennung ist hier besonders wichtig: der Versand selbst bleibt in
 * jedem Fall INTERN gesperrt (lib/kim/versand.ts), unabhängig davon, wie
 * grün alle anderen Punkte stehen — die eigentliche Implementierung eines
 * KIM-Clients/Konnektor-Zugriffs ist bewusst noch nicht geschrieben.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeKonfigurationen, findeAktiveKonfiguration } from './config'
import { ladeFormatVersionen, loeseVersionAuf } from './versionen'
import { ladeKarten, istEinsatzbereit } from './karten'
import { ladeNachrichten } from './nachrichten'
import { kimVersandImplementiert } from './versand'
import { heuteBerlin } from '@/lib/utils/timezone';

export type Ampel = 'gruen' | 'gelb' | 'rot'
export type BlockerArt = 'intern' | 'extern' | null

export interface KimReadinessPunkt {
  id: string
  label: string
  ampel: Ampel
  wert: string | null
  hinweis: string | null
  blocker: BlockerArt
}

export interface KimReadinessErgebnis {
  organizationId: string
  stichtag: string
  gesamt: Ampel
  /** true nur, wenn ausnahmslos alles grün ist — kann aktuell NIE grün sein, solange der Versand gesperrt ist. */
  versandbereit: boolean
  punkte: KimReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
}

function punkt(
  id: string,
  label: string,
  ampel: Ampel,
  wert: string | null,
  hinweis: string | null,
  blocker: BlockerArt
): KimReadinessPunkt {
  return { id, label, ampel, wert, hinweis, blocker }
}

export async function ermittleKimReadiness(
  supabase: SupabaseClient,
  organizationId: string,
  stichtag: string = heuteBerlin()
): Promise<KimReadinessErgebnis> {
  const punkte: KimReadinessPunkt[] = []

  // ── 1. Postfach-Konfiguration ──
  const konfigurationen = await ladeKonfigurationen(supabase, organizationId)
  const aktiveKonfig = findeAktiveKonfiguration(konfigurationen)

  if (konfigurationen.length === 0) {
    punkte.push(punkt(
      'konfiguration', 'KIM-Postfach-Konfiguration', 'rot', null,
      'Keine Konfiguration angelegt. Bezeichnung und (sobald vorhanden) Postfachadresse können bereits jetzt hinterlegt werden.',
      'intern',
    ))
  } else if (!aktiveKonfig) {
    punkte.push(punkt(
      'konfiguration', 'KIM-Postfach-Konfiguration', 'gelb',
      `${konfigurationen.length} hinterlegt, keine aktiv`,
      'Es existieren Konfigurationen, aber keine ist als aktiv markiert.',
      'intern',
    ))
  } else if (aktiveKonfig.freischaltungsstatus !== 'freigeschaltet') {
    punkte.push(punkt(
      'konfiguration', 'KIM-Postfach-Konfiguration', 'rot',
      `${aktiveKonfig.bezeichnung} (${aktiveKonfig.freischaltungsstatus})`,
      'Das aktive Postfach ist noch nicht freigeschaltet. Freischaltung erfolgt durch den KIM-Provider nach gematik-Zulassung.',
      'extern',
    ))
  } else {
    punkte.push(punkt(
      'konfiguration', 'KIM-Postfach-Konfiguration', 'gruen',
      aktiveKonfig.bezeichnung, null, null,
    ))
  }

  // ── 2. Formatversion + Spezifikation (Technische Anlage 5) ──
  const versionen = await ladeFormatVersionen(supabase, organizationId)
  const aufloesung = loeseVersionAuf(versionen, stichtag)

  punkte.push(punkt(
    'formatversion',
    'Geltende Formatversion (TA5)',
    aufloesung.kandidaten.length > 0 ? 'gruen' : 'rot',
    aufloesung.kandidaten[0]
      ? `${aufloesung.kandidaten[0].bezeichnung} (TA ${aufloesung.kandidaten[0].ta_version})`
      : null,
    aufloesung.kandidaten.length > 0 ? null : aufloesung.hinweis,
    aufloesung.kandidaten.length > 0 ? null : 'intern',
  ))

  const specOk = !!aufloesung.version?.spec_bestaetigt
  punkte.push(punkt(
    'spezifikation',
    'Technische Anlage 5 hinterlegt',
    specOk ? 'gruen' : 'rot',
    aufloesung.version?.spec_quelle ?? null,
    specOk
      ? null
      : 'Die Technische Anlage 5 (KIM-Client-Spezifikation) liegt nicht vor. Ohne sie wird kein Versand implementiert — Nachrichtenformate werden nicht geraten.',
    specOk ? null : 'extern',
  ))

  // ── 3. Kartenverwaltung (eHBA/SMC-B) ──
  const karten = await ladeKarten(supabase, organizationId)
  const einsatzbereit = karten.filter(k => istEinsatzbereit(k, stichtag))
  const smcB = einsatzbereit.filter(k => k.karten_typ === 'smc_b')

  if (karten.length === 0) {
    punkte.push(punkt(
      'karten', 'SMC-B/eHBA erfasst', 'rot', null,
      'Keine Karte erfasst. Institutionskarte (SMC-B) und Heilberufsausweise (eHBA) müssen bei einem gematik-zugelassenen Kartenherausgeber beantragt werden.',
      'extern',
    ))
  } else if (smcB.length === 0) {
    punkte.push(punkt(
      'karten', 'SMC-B/eHBA erfasst', 'gelb',
      `${karten.length} erfasst, keine einsatzbereite SMC-B`,
      'Eine einsatzbereite SMC-B (Institutionskarte, Status "aktiv", innerhalb der Gültigkeit) fehlt.',
      'extern',
    ))
  } else {
    punkte.push(punkt(
      'karten', 'SMC-B/eHBA erfasst', 'gruen',
      `${einsatzbereit.length}/${karten.length} einsatzbereit`, null, null,
    ))
  }

  // ── 4. Versand implementiert ──
  punkte.push(punkt(
    'versand',
    'KIM-Versand implementiert',
    kimVersandImplementiert() ? 'gruen' : 'rot',
    null,
    kimVersandImplementiert()
      ? null
      : 'Der Versand ist bewusst gesperrt, solange KIM-Client-Protokoll und Konnektor-Anbindung fehlen (s. lib/kim/versand.ts).',
    kimVersandImplementiert() ? null : 'intern',
  ))

  // ── 5. Wartende/gesperrte Nachrichten (informativ) ──
  const nachrichten = await ladeNachrichten(supabase, organizationId)
  const wartend = nachrichten.filter(n => n.status === 'wartend').length
  const gesperrt = nachrichten.filter(n => n.status === 'gesperrt').length

  punkte.push(punkt(
    'warteschlange',
    'Nachrichten-Warteschlange',
    gesperrt > 0 ? 'gelb' : 'gruen',
    `${nachrichten.length} gesamt · ${wartend} wartend · ${gesperrt} gesperrt`,
    gesperrt > 0
      ? 'Es liegen Nachrichten vor, deren Versandversuch abgewiesen wurde. Sie werden nicht automatisch erneut versucht.'
      : null,
    null,
  ))

  const zusammenfassung = {
    gruen: punkte.filter(p => p.ampel === 'gruen').length,
    gelb: punkte.filter(p => p.ampel === 'gelb').length,
    rot: punkte.filter(p => p.ampel === 'rot').length,
    gesamt: punkte.length,
  }

  const gesamt: Ampel = zusammenfassung.rot > 0 ? 'rot' : zusammenfassung.gelb > 0 ? 'gelb' : 'gruen'

  return {
    organizationId,
    stichtag,
    gesamt,
    versandbereit: gesamt === 'gruen' && kimVersandImplementiert(),
    punkte,
    zusammenfassung,
    offeneBlocker: {
      intern: punkte.filter(p => p.blocker === 'intern').map(p => p.label),
      extern: punkte.filter(p => p.blocker === 'extern').map(p => p.label),
    },
  }
}
