// ═══════════════════════════════════════════════════════════════════
// Pilot — Betriebs-Voraussetzungen für den kontrollierten Echtbetrieb
// ═══════════════════════════════════════════════════════════════════
//
// Beantwortet: darf heute ein ECHTER Kunde vollständig bearbeitet und
// abgerechnet werden — und wenn nein, woran genau liegt es?
//
// Abgrenzung zu lib/abrechnung/readiness.ts:
//   readiness.ts     → Kassenweg (DTA/SECON/SFTP an die Pflegekasse)
//   diese Datei      → Selbstzahler-/Rechnungsweg vom Kunden bis DATEV
//
// Der Pilot läuft bewusst OHNE Kassenweg: alle externen Voraussetzungen
// dort (ITSG-Zertifikat, SFTP-Zugang, Anerkennungsbescheid) fehlen noch.
// Ein Selbstzahler-Pilot ist dadurch nicht blockiert — er durchläuft die
// Kette vollständig. Der Kassenweg wird deshalb als bewusst gesperrter Weg
// ausgewiesen, nicht als roter Pflichtpunkt.
//
// PFLICHT vs. optional:
//   pflicht=true  → ohne diesen Punkt darf kein echter Kunde abgerechnet
//                   werden. Ein roter Pflichtpunkt setzt
//                   echtbetriebFreigegeben auf false.
//   pflicht=false → Vorwarnung oder Teilweg (z. B. SEPA-Lastschrift; ohne
//                   sie bleibt die Überweisung).
//
// KEINE Secrets: von Passwörtern und Schlüsseln wird ausschliesslich die
// Existenz gemeldet, nie der Wert.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { budgetVersionFuerJahrOderNull } from '@/lib/config/budget-constants'
import { pruefeGlaeubigerId } from '@/lib/billing/sepa/glaeubiger-id'
import { getDatevConfig, isDatevConfigComplete } from '@/lib/billing/datev/datev-config'
import { ZAHLUNGSZIEL_STANDARD_TAGE } from '@/lib/billing/core/zahlungsziel'
import { berlinParts } from '@/lib/utils/timezone'
import type {
  Ampel,
  BlockerArt,
  VoraussetzungErgebnis,
  VoraussetzungGruppe,
  VoraussetzungPunkt,
} from './types'

/** Schriften, ohne die Rechnungs-PDFs Umlaute als ■ setzen würden. */
const PFLICHT_SCHRIFTEN = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']

function punkt(
  id: string,
  label: string,
  gruppe: VoraussetzungGruppe,
  ampel: Ampel,
  wert: string | null,
  hinweis: string | null,
  blocker: BlockerArt,
  pflicht: boolean,
  aktion: { label: string; href: string } | null = null,
): VoraussetzungPunkt {
  return {
    id,
    label,
    gruppe,
    ampel,
    wert,
    hinweis: ampel === 'gruen' ? null : hinweis,
    blocker: ampel === 'gruen' ? null : blocker,
    pflicht,
    aktion: ampel === 'gruen' ? null : aktion,
  }
}

/** Prüft, ob die PDF-Schriften auf dem laufenden Server lesbar sind. */
async function schriftenVorhanden(): Promise<{ ok: boolean; fehlend: string[] }> {
  const fontDir = join(process.cwd(), 'public', 'fonts')
  const fehlend: string[] = []
  for (const datei of PFLICHT_SCHRIFTEN) {
    try {
      await readFile(join(fontDir, datei))
    } catch {
      fehlend.push(datei)
    }
  }
  return { ok: fehlend.length === 0, fehlend }
}

/**
 * Ermittelt die Betriebs-Voraussetzungen des Pilotbetriebs.
 *
 * Erwartet einen Client mit Lesezugriff auf die Organisation (in der Praxis
 * der Admin-Client hinter einem Admin-Guard).
 */
export async function ermittleVoraussetzungen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<VoraussetzungErgebnis> {
  const jahr = parseInt(berlinParts(new Date()).year, 10)

  const [
    orgRes,
    privatTarifRes,
    kassenTarifBlockiertRes,
    engelRes,
    nummernkreisRes,
    ohneFaelligkeitRes,
    stateRes,
    schriften,
  ] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, address, bundesland, iban, bic, sepa_creditor_id, ik_nummer')
      .eq('id', organizationId)
      .maybeSingle(),
    supabase
      .from('billing_tariffs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('rechtsgrundlage', 'privat')
      .eq('ist_aktiv', true)
      .eq('tarif_status', 'verified')
      .is('deleted_at', null),
    supabase
      .from('billing_tariffs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('ist_aktiv', true)
      .neq('tarif_status', 'verified')
      .is('deleted_at', null),
    supabase
      .from('caregivers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('einsatzfreigabe', true),
    supabase
      .from('billing_number_sequences')
      .select('prefix, year, last_number')
      .eq('organization_id', organizationId)
      .eq('year', jahr),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('due_date', null)
      .is('deleted_at', null),
    supabase
      .from('state_settings')
      .select('bundesland, status, kassenrechnung_enabled')
      .eq('organization_id', organizationId),
    schriftenVorhanden(),
  ])

  const org = orgRes.data
  const punkte: VoraussetzungPunkt[] = []

  // ── Organisation ────────────────────────────────────────────────
  punkte.push(punkt(
    'org_name', 'Firmenname hinterlegt', 'organisation',
    org?.name ? 'gruen' : 'rot',
    org?.name ?? null,
    'Ohne Firmenname trägt keine Rechnung einen gültigen Absender (§ 14 UStG).',
    'intern', true,
    { label: 'Einstellungen öffnen', href: '/admin/settings' },
  ))

  punkte.push(punkt(
    'org_anschrift', 'Geschäftsanschrift hinterlegt', 'organisation',
    org?.address ? 'gruen' : 'rot',
    org?.address ?? null,
    'Die vollständige Anschrift des leistenden Unternehmers ist Pflichtangabe auf jeder Rechnung (§ 14 Abs. 4 Nr. 1 UStG).',
    'intern', true,
    { label: 'Einstellungen öffnen', href: '/admin/settings' },
  ))

  // ── Stammdaten & Preise ─────────────────────────────────────────
  const privatTarife = privatTarifRes.count ?? 0
  punkte.push(punkt(
    'privattarife', 'Verifizierte Selbstzahler-Preise', 'stammdaten',
    privatTarife > 0 ? 'gruen' : 'rot',
    `${privatTarife} verifizierte Privat-Tarife`,
    'Ohne verifizierten Preis (tarif_status=verified) berechnet der Price-Resolver keinen Betrag — die Rechnung entsteht gar nicht erst.',
    'intern', true,
    { label: 'Tarife pflegen', href: '/admin/kassenabrechnung/tarife' },
  ))

  const blockierteTarife = kassenTarifBlockiertRes.count ?? 0
  punkte.push(punkt(
    'tarife_unverifiziert', 'Nicht verifizierte Tarife (gesperrt)', 'stammdaten',
    blockierteTarife === 0 ? 'gruen' : 'gelb',
    `${blockierteTarife} aktive Tarife ohne Verifizierung`,
    'Diese Tarife sind fail-closed gesperrt und erzeugen keine Rechnungspositionen. Das ist gewollt, solange der zugrunde liegende Vertragssatz nicht belegt ist — hier ist nichts zu reparieren, sondern zu belegen.',
    'extern', false,
    { label: 'Tarife prüfen', href: '/admin/kassenabrechnung/tarife' },
  ))

  const budgetVersion = budgetVersionFuerJahrOderNull(jahr)
  punkte.push(punkt(
    'budgetwerte', `Gesetzliche Budgetwerte ${jahr}`, 'stammdaten',
    budgetVersion ? 'gruen' : 'rot',
    budgetVersion
      ? `Entlastungsbetrag ${budgetVersion.entlastungMonatlich} €/Monat · VP+KZP ${budgetVersion.vpKzpKombiniert} €/Jahr`
      : null,
    `Für ${jahr} sind keine gesetzlichen Budgetwerte hinterlegt. Budgetprüfung und Rechnungsstellung laufen fail-closed und verweigern die Arbeit — Werte in lib/config/budget-constants.ts ergänzen.`,
    'intern', true,
    { label: 'Budgets ansehen', href: '/admin/budgets' },
  ))

  const engel = engelRes.count ?? 0
  punkte.push(punkt(
    'engel_freigegeben', 'Betreuungskräfte mit Einsatzfreigabe', 'stammdaten',
    engel > 0 ? 'gruen' : 'rot',
    `${engel} freigegeben`,
    'Ohne freigegebene Betreuungskraft kann kein Einsatz geplant und kein Leistungsnachweis erzeugt werden.',
    'intern', true,
    { label: 'Einsatzfreigabe öffnen', href: '/admin/einsatzfreigabe' },
  ))

  // ── Rechnungsstellung ───────────────────────────────────────────
  const nummernkreisFehler = nummernkreisRes.error
  const sequenzen = nummernkreisRes.data ?? []
  const reSequenz = sequenzen.find(s => s.prefix === 'RE')
  punkte.push(punkt(
    'nummernkreis', `Rechnungsnummernkreis ${jahr}`, 'abrechnung',
    nummernkreisFehler ? 'rot' : 'gruen',
    nummernkreisFehler
      ? null
      : reSequenz
        ? `RE-${jahr}, zuletzt vergeben: ${String(reSequenz.last_number).padStart(5, '0')}`
        : `RE-${jahr}, noch keine Nummer vergeben`,
    nummernkreisFehler
      ? `Der Nummernkreis ist nicht lesbar (${nummernkreisFehler.message}). Ohne ihn kann keine fortlaufende Rechnungsnummer vergeben werden (§ 14 Abs. 4 Nr. 4 UStG).`
      : null,
    'intern', true,
    { label: 'Rechnungen öffnen', href: '/admin/rechnungen' },
  ))

  const ohneFaelligkeit = ohneFaelligkeitRes.count ?? 0
  punkte.push(punkt(
    'zahlungsziel', 'Fälligkeit auf Rechnungen', 'abrechnung',
    ohneFaelligkeit === 0 ? 'gruen' : 'gelb',
    ohneFaelligkeit === 0
      ? `Standard ${ZAHLUNGSZIEL_STANDARD_TAGE} Tage`
      : `${ohneFaelligkeit} Rechnungen ohne Fälligkeitsdatum`,
    'Rechnungen ohne due_date fallen aus OPOS-Altersstruktur und Mahnlauf heraus — sie werden nie angemahnt. Altbestand nachziehen.',
    'intern', false,
    { label: 'Forderungen prüfen', href: '/admin/forderungen' },
  ))

  punkte.push(punkt(
    'pdf_schriften', 'PDF-Schriften (DejaVuSans)', 'abrechnung',
    schriften.ok ? 'gruen' : 'rot',
    schriften.ok ? 'DejaVuSans + Bold vorhanden' : `fehlt: ${schriften.fehlend.join(', ')}`,
    'Ohne die Schriftdateien wirft die PDF-Erzeugung. Ein stiller Helvetica-Fallback würde Umlaute zu ■ machen — das fällt erst dem Kunden auf der fertigen Rechnung auf.',
    'intern', true,
    null,
  ))

  // ── Zahlungsverkehr ─────────────────────────────────────────────
  punkte.push(punkt(
    'iban', 'Bankverbindung (IBAN) hinterlegt', 'zahlung',
    org?.iban ? 'gruen' : 'rot',
    org?.iban ? `${org.iban.slice(0, 8)}…` : null,
    'Ohne IBAN steht auf der Rechnung kein Zahlungsweg — der Kunde kann nicht überweisen.',
    'intern', true,
    { label: 'Einstellungen öffnen', href: '/admin/settings' },
  ))

  const ciPruefung = pruefeGlaeubigerId(org?.sepa_creditor_id)
  punkte.push(punkt(
    'sepa_glaeubiger_id', 'SEPA-Gläubiger-ID (nur für Lastschrift)', 'zahlung',
    ciPruefung.verwendbar ? 'gruen' : 'rot',
    // Bei Platzhalter/Formatfehler bewusst NICHT den Wert anzeigen, damit er
    // nicht versehentlich als "gepflegt" gelesen wird.
    ciPruefung.verwendbar ? 'echte Gläubiger-ID hinterlegt' : `Befund: ${ciPruefung.befund}`,
    `${ciPruefung.hinweis ?? ''} Der Pilot läuft ohne Lastschrift weiter — per Überweisung ist die Kette vollständig durchlaufbar.`.trim(),
    'extern', false,
    { label: 'SEPA-Bereich öffnen', href: '/admin/sepa' },
  ))

  // ── Buchhaltung ─────────────────────────────────────────────────
  let datevAmpel: Ampel = 'rot'
  let datevWert: string | null = null
  let datevHinweis: string | null = 'DATEV-Konfiguration nicht lesbar.'
  try {
    const datevConfig = await getDatevConfig(supabase, organizationId)
    const { ok, fehlend } = isDatevConfigComplete(datevConfig)
    datevAmpel = ok ? 'gruen' : 'rot'
    datevWert = ok
      ? `Berater ${datevConfig.beraternummer} · Mandant ${datevConfig.mandantennummer} · ${datevConfig.kontenrahmen}`
      : `fehlt: ${fehlend.join(', ')}`
    datevHinweis = ok
      ? null
      : 'Berater- und Mandantennummer kommen vom Steuerberater. Ohne sie verweigert der Export — der letzte Kettenschritt bleibt unerreichbar.'
  } catch (err) {
    datevHinweis = `DATEV-Konfiguration nicht lesbar: ${(err as Error).message}`
  }
  punkte.push(punkt(
    'datev_config', 'DATEV-Konfiguration', 'buchhaltung',
    datevAmpel, datevWert, datevHinweis,
    'extern', true,
    { label: 'DATEV-Export öffnen', href: '/admin/datev' },
  ))

  // ── Kassenweg (bewusst gesperrt) ────────────────────────────────
  const bundeslaender = stateRes.data ?? []
  const kassenAktiv = bundeslaender.filter(b => b.kassenrechnung_enabled)
  punkte.push(punkt(
    'kassenweg_status', 'Kassenabrechnung freigeschaltet', 'kassenweg',
    kassenAktiv.length > 0 ? 'gruen' : 'gelb',
    kassenAktiv.length > 0
      ? kassenAktiv.map(b => b.bundesland).join(', ')
      : `0 von ${bundeslaender.length} Bundesländern`,
    'Solange kein Bundesland freigeschaltet ist, wird NICHT an die Kassen übertragen. Der Pilot läuft als Selbstzahler-Betrieb — das ist die gewollte Betriebsart, kein Mangel.',
    'extern', false,
    { label: 'Kassen-Bereitschaft ansehen', href: '/admin/kassenabrechnung/readiness' },
  ))

  // ── Auswertung ──────────────────────────────────────────────────
  const rot = punkte.filter(p => p.ampel === 'rot')
  const gelb = punkte.filter(p => p.ampel === 'gelb')
  const gruen = punkte.filter(p => p.ampel === 'gruen')
  const pflichtRot = rot.filter(p => p.pflicht)

  const gesperrteWege: { weg: string; grund: string }[] = []
  if (kassenAktiv.length === 0) {
    gesperrteWege.push({
      weg: 'Kassenübertragung (DTA/SECON an die Pflegekasse)',
      grund: 'Kein Bundesland freigeschaltet. Externe Voraussetzungen (Anerkennung § 45a, ITSG-Zertifikat, SFTP-Zugang) fehlen — es wird bewusst nichts übertragen.',
    })
  }
  if (!ciPruefung.verwendbar) {
    gesperrteWege.push({
      weg: 'SEPA-Lastschrifteinzug',
      grund: ciPruefung.hinweis ?? 'Gläubiger-ID nicht verwendbar.',
    })
  }

  return {
    organizationId,
    organisation: org?.name ?? null,
    gesamt: pflichtRot.length > 0 ? 'rot' : gelb.length > 0 || rot.length > 0 ? 'gelb' : 'gruen',
    echtbetriebFreigegeben: pflichtRot.length === 0,
    punkte,
    zusammenfassung: {
      gruen: gruen.length,
      gelb: gelb.length,
      rot: rot.length,
      gesamt: punkte.length,
    },
    offeneBlocker: {
      intern: [...rot, ...gelb].filter(p => p.blocker === 'intern').map(p => p.label),
      extern: [...rot, ...gelb].filter(p => p.blocker === 'extern').map(p => p.label),
    },
    gesperrteWege,
  }
}
