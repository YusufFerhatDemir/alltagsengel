/**
 * Kassenabrechnungs-Readiness pro Organisation.
 *
 * Beantwortet eine einzige Frage: Kann diese Organisation heute echt gegen
 * die Kassen abrechnen — und wenn nein, woran genau liegt es?
 *
 * Bewusst getrennt in zwei Klassen von Blockern:
 *   - INTERN   — im Code/in der Datenbank lösbar (Stammdaten, Routing, Tarife)
 *   - EXTERN   — nur von aussen beschaffbar (ITSG-Zertifikat, SFTP-Zugang,
 *                Anerkennungsbescheid, Freischaltung durch das Bundesland)
 *
 * Diese Trennung ist der Kern: eine Ampel, die beides vermischt, verleitet
 * dazu, externe Voraussetzungen für erledigt zu halten.
 *
 * KEINE Secrets: weder Zertifikatsinhalte, noch SSH-Keys, noch Passwörter
 * verlassen diese Funktion. Wo ein Geheimnis relevant ist, wird ausschliesslich
 * seine Existenz als Ja/Nein gemeldet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { bewerteZertifikat, ABLAUF_WARNUNG_TAGE } from './zertifikate'
import { pruefeRouting } from './stammdaten'
import { heuteBerlin } from '@/lib/utils/timezone';

export type Ampel = 'gruen' | 'gelb' | 'rot'

export type BlockerArt = 'intern' | 'extern' | null

export interface ReadinessPunkt {
  id: string
  label: string
  ampel: Ampel
  /** Kurzwert für die Anzeige — niemals ein Geheimnis. */
  wert: string | null
  hinweis: string | null
  /** Wo der Blocker gelöst wird. `null`, wenn der Punkt grün ist. */
  blocker: BlockerArt
  /** Gruppe für die Darstellung. */
  gruppe: 'organisation' | 'stammdaten' | 'secon' | 'transport' | 'betrieb'
}

export interface ReadinessErgebnis {
  organizationId: string
  organisation: string | null
  ik_nummer: string | null
  /** Gesamtampel: rot, sobald ein Pflichtpunkt rot ist. */
  gesamt: Ampel
  /** true nur, wenn ausnahmslos alles grün ist. */
  versandbereit: boolean
  modus: 'produktion' | 'test'
  punkte: ReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
  betrieb: {
    letzterLauf: { id: string; status: string; abrechnungsmonat: string; erstellt_am: string } | null
    letzterVersand: { id: string; uebermittelt_am: string } | null
    letzterRuecklaeufer: { id: string; status: string; created_at: string } | null
    letzterPreflight: string | null
    letzterDryRun: string | null
    offeneAufgaben: number
    offeneFehler: number
  }
}

function punkt(
  id: string,
  label: string,
  gruppe: ReadinessPunkt['gruppe'],
  ampel: Ampel,
  wert: string | null,
  hinweis: string | null,
  blocker: BlockerArt,
): ReadinessPunkt {
  return { id, label, gruppe, ampel, wert, hinweis, blocker: ampel === 'gruen' ? null : blocker }
}

/**
 * Ermittelt die Readiness. Erwartet einen Client mit Lesezugriff auf die
 * Organisation (in der Praxis der Admin-Client hinter einem Admin-Guard).
 */
export async function ermittleReadiness(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ReadinessErgebnis> {
  const heute = heuteBerlin()

  const [orgRes, zertRes, dasRes, ktRes, stateRes, tarifRes, laufRes, rlRes, aufgabenRes, fehlerRes, auditRes] =
    await Promise.all([
      supabase.from('organizations').select('name, ik_nummer, bundesland').eq('id', organizationId).maybeSingle(),
      supabase.from('abrechnung_zertifikate').select('typ, ik_nummer, gueltig_bis').eq('organization_id', organizationId).order('gueltig_bis', { ascending: false }),
      supabase.from('datenannahmestellen').select('id, name, ik_nummer, aktiv, sftp_host, sftp_user, sftp_key_url, kim_adresse, organization_id').or(`organization_id.eq.${organizationId},organization_id.is.null`).is('deleted_at', null),
      supabase.from('dta_kostentraeger').select('id, ik_nummer, name, ist_aktiv, datenannahmestelle_id').eq('organization_id', organizationId).is('deleted_at', null),
      supabase.from('state_settings').select('bundesland, status, kassenrechnung_enabled, dakota_export_enabled, approval_document').eq('organization_id', organizationId),
      supabase.from('billing_tariffs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('ist_aktiv', true).is('deleted_at', null),
      supabase.from('abrechnungslaeufe').select('id, status, abrechnungsmonat, erstellt_am, uebermittelt_am').eq('organization_id', organizationId).is('deleted_at', null).order('erstellt_am', { ascending: false }).limit(20),
      supabase.from('dta_ruecklaeufer').select('id, status, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1),
      supabase.from('ops_aufgaben').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('kategorie', 'abrechnung').in('status', ['offen', 'in_bearbeitung']),
      supabase.from('dta_fehlerprotokoll').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('bearbeitungsstatus', ['neu', 'in_pruefung', 'korrektur_erforderlich']),
      supabase.from('billing_audit_trail').select('action, created_at').eq('organization_id', organizationId).in('action', ['preflight_ausgefuehrt', 'dry_run_ausgefuehrt']).order('created_at', { ascending: false }).limit(50),
    ])

  const punkte: ReadinessPunkt[] = []
  const org = orgRes.data
  const zerts = zertRes.data ?? []
  const annahmestellen = dasRes.data ?? []
  const kostentraeger = ktRes.data ?? []
  const bundeslaender = stateRes.data ?? []
  const laeufe = laufRes.data ?? []

  // ── Organisation ──────────────────────────────────────────────
  punkte.push(punkt(
    'ik_nummer', 'Eigene IK-Nummer (Absender)', 'organisation',
    org?.ik_nummer ? 'gruen' : 'rot',
    org?.ik_nummer ?? null,
    org?.ik_nummer ? null : 'Ohne eigene IK kann keine DTA-Datei adressiert werden — IK bei der ARGE·IK beantragen',
    'extern',
  ))

  punkte.push(punkt(
    'absenderdaten', 'Absenderdaten (Name, Anschrift)', 'organisation',
    org?.name ? 'gruen' : 'rot',
    org?.name ?? null,
    org?.name ? null : 'Organisationsname fehlt — er steht im NAM-Segment der Kassendatei',
    'intern',
  ))

  const anerkannt = bundeslaender.filter(b => b.status === 'ANERKANNT')
  const kassenAktiv = bundeslaender.filter(b => b.kassenrechnung_enabled)
  punkte.push(punkt(
    'kassenabrechnung_aktiv', 'Kassenabrechnung freigeschaltet', 'organisation',
    kassenAktiv.length > 0 ? 'gruen' : 'rot',
    kassenAktiv.length > 0 ? kassenAktiv.map(b => b.bundesland).join(', ') : `0 von ${bundeslaender.length} Bundesländern`,
    kassenAktiv.length > 0 ? null : 'In keinem Bundesland freigeschaltet — setzt die Anerkennung nach § 45a SGB XI voraus',
    'extern',
  ))

  punkte.push(punkt(
    'anerkennung', 'Anerkennungsbescheid hinterlegt', 'organisation',
    anerkannt.some(b => b.approval_document) ? 'gruen' : anerkannt.length > 0 ? 'gelb' : 'rot',
    anerkannt.length > 0 ? `${anerkannt.length} Bundesland/-länder ANERKANNT` : 'keine Anerkennung',
    anerkannt.some(b => b.approval_document) ? null : 'Bescheid der Landesbehörde hochladen — der Preflight verlangt ihn als Pflichtpunkt',
    'extern',
  ))

  // ── Stammdaten ────────────────────────────────────────────────
  const aktiveKt = kostentraeger.filter(k => k.ist_aktiv)
  punkte.push(punkt(
    'kostentraeger', 'Kostenträger-Stammdaten', 'stammdaten',
    aktiveKt.length > 0 ? 'gruen' : 'rot',
    `${aktiveKt.length} aktive Kostenträger`,
    aktiveKt.length > 0 ? null : 'Keine Kassen gepflegt — über /admin/kassenabrechnung/stammdaten anlegen oder importieren',
    'intern',
  ))

  const eigeneDas = annahmestellen.filter(d => d.organization_id === organizationId)
  const aktiveDas = annahmestellen.filter(d => d.aktiv)
  const mitTransport = aktiveDas.filter(d => (d.sftp_host && d.sftp_user) || d.kim_adresse)
  punkte.push(punkt(
    'datenannahmestellen', 'Datenannahmestellen', 'stammdaten',
    mitTransport.length > 0 ? 'gruen' : aktiveDas.length > 0 ? 'gelb' : 'rot',
    `${aktiveDas.length} aktiv (${eigeneDas.length} eigene), ${mitTransport.length} mit Transportweg`,
    mitTransport.length > 0
      ? null
      : aktiveDas.length > 0
        ? 'Angelegt, aber ohne SFTP-/KIM-Zugang — Zugangsdaten bei der Annahmestelle beantragen'
        : 'Keine Datenannahmestelle gepflegt',
    aktiveDas.length > 0 ? 'extern' : 'intern',
  ))

  let routingAmpel: Ampel = 'rot'
  let routingWert: string | null = null
  let routingHinweis: string | null = 'Routing nicht prüfbar'
  try {
    const routing = await pruefeRouting(supabase, organizationId)
    routingWert = `${routing.kostentraegerMitRouting} von ${routing.kostentraegerGesamt} Kostenträgern zugeordnet`
    if (routing.kostentraegerGesamt === 0) {
      routingAmpel = 'rot'
      routingHinweis = 'Keine Kostenträger vorhanden — Routing kann nicht bestehen'
    } else if (routing.ok) {
      routingAmpel = 'gruen'
      routingHinweis = null
    } else {
      routingAmpel = 'gelb'
      routingHinweis = routing.luecken.slice(0, 3).map(l => `${l.name}: ${l.grund}`).join(' · ')
    }
  } catch (err) {
    routingHinweis = `Routing-Prüfung fehlgeschlagen: ${(err as Error).message}`
  }
  punkte.push(punkt('routing', 'Kostenträger-Routing', 'stammdaten', routingAmpel, routingWert, routingHinweis, 'intern'))

  const tarifAnzahl = tarifRes.count ?? 0
  punkte.push(punkt(
    'tarife', 'Kassentarife hinterlegt', 'stammdaten',
    tarifAnzahl > 0 ? 'gruen' : 'rot',
    `${tarifAnzahl} aktive Tarife`,
    tarifAnzahl > 0 ? null : 'Ohne Tarife kann kein Betrag berechnet werden — Landesrahmenvertrag einpflegen',
    'intern',
  ))

  // ── SECON ─────────────────────────────────────────────────────
  const absender = zerts.find(z => z.typ === 'absender')
  const absenderBewertung = bewerteZertifikat(absender?.gueltig_bis ?? null)
  punkte.push(punkt(
    'secon_absender', 'SECON-Absenderzertifikat (ITSG)', 'secon',
    absender ? absenderBewertung.ampel : 'rot',
    absender ? `IK ${absender.ik_nummer}, gültig bis ${absender.gueltig_bis}` : null,
    absender
      ? absenderBewertung.hinweis
      : 'Kein Zertifikat hinterlegt — beim ITSG Trust Center beantragen (kostenpflichtig, mehrere Tage Vorlauf)',
    'extern',
  ))

  punkte.push(punkt(
    'secon_ablauf', `Zertifikatsgültigkeit (Warnschwelle ${ABLAUF_WARNUNG_TAGE} Tage)`, 'secon',
    !absender ? 'rot' : absenderBewertung.ampel,
    absenderBewertung.tage != null ? `${absenderBewertung.tage} Tage` : null,
    !absender ? 'Kein Zertifikat — keine Gültigkeit prüfbar' : absenderBewertung.hinweis,
    'extern',
  ))

  const empfaenger = zerts.filter(z => z.typ === 'empfaenger')
  const empfaengerGueltig = empfaenger.filter(z => z.gueltig_bis && z.gueltig_bis >= heute)
  punkte.push(punkt(
    'secon_empfaenger', 'Empfänger-Zertifikate', 'secon',
    empfaengerGueltig.length > 0 ? 'gruen' : 'rot',
    `${empfaengerGueltig.length} gültig (${empfaenger.length} gesamt)`,
    empfaengerGueltig.length > 0 ? null : 'Aus dem öffentlichen ITSG-Verzeichnis laden (Einstellungen → Empfänger-Zertifikate)',
    'intern',
  ))

  const seconPasswort = Boolean(process.env.SECON_ZERT_PASSWORT)
  punkte.push(punkt(
    'secon_passwort', 'Zertifikat-Passwort hinterlegt', 'secon',
    seconPasswort ? 'gruen' : 'rot',
    seconPasswort ? 'SECON_ZERT_PASSWORT gesetzt' : null, // bewusst nur Existenz
    seconPasswort ? null : 'Env-Variable SECON_ZERT_PASSWORT in Vercel setzen — ohne sie ist der Private Key nicht lesbar',
    'extern',
  ))

  // ── Transport ─────────────────────────────────────────────────
  const mitKey = mitTransport.filter(d => d.sftp_key_url)
  punkte.push(punkt(
    'uebertragungszugang', 'Übertragungszugang (SFTP/KIM)', 'transport',
    mitKey.length > 0 ? 'gruen' : mitTransport.length > 0 ? 'gelb' : 'rot',
    `${mitTransport.length} Transportwege, ${mitKey.length} mit SSH-Key`,
    mitKey.length > 0
      ? null
      : mitTransport.length > 0
        ? 'Kein SSH-Key hinterlegt — Schlüsselpaar erzeugen und öffentlichen Teil bei der Annahmestelle registrieren'
        : 'Kein Übertragungszugang konfiguriert',
    'extern',
  ))

  const dakotaAktiv = bundeslaender.filter(b => b.dakota_export_enabled)
  punkte.push(punkt(
    'dakota', 'DAKOTA-Übermittlung freigeschaltet', 'transport',
    dakotaAktiv.length > 0 ? 'gruen' : 'gelb',
    dakotaAktiv.length > 0 ? dakotaAktiv.map(b => b.bundesland).join(', ') : 'nicht freigeschaltet',
    dakotaAktiv.length > 0 ? null : 'Dateien können erzeugt, aber nicht übermittelt werden',
    'extern',
  ))

  // ── Betrieb ───────────────────────────────────────────────────
  const uebermittelt = laeufe.filter(l => l.uebermittelt_am)
  const letzterVersand = uebermittelt[0] ?? null
  punkte.push(punkt(
    'erstversand', 'Erstversand nachgewiesen', 'betrieb',
    letzterVersand ? 'gruen' : 'rot',
    letzterVersand ? `zuletzt ${letzterVersand.uebermittelt_am}` : 'nie übermittelt',
    letzterVersand ? null : 'Es wurde noch keine Datei an eine Kasse übermittelt — der Echtbetrieb ist unbewiesen',
    'extern',
  ))

  const auditEintraege = auditRes.data ?? []
  const letzterPreflight = auditEintraege.find(a => a.action === 'preflight_ausgefuehrt')?.created_at ?? null
  const letzterDryRun = auditEintraege.find(a => a.action === 'dry_run_ausgefuehrt')?.created_at ?? null

  const rot = punkte.filter(p => p.ampel === 'rot')
  const gelb = punkte.filter(p => p.ampel === 'gelb')
  const gruen = punkte.filter(p => p.ampel === 'gruen')

  return {
    organizationId,
    organisation: org?.name ?? null,
    ik_nummer: org?.ik_nummer ?? null,
    gesamt: rot.length > 0 ? 'rot' : gelb.length > 0 ? 'gelb' : 'gruen',
    versandbereit: rot.length === 0 && gelb.length === 0,
    modus: rot.length === 0 && dakotaAktiv.length > 0 ? 'produktion' : 'test',
    punkte,
    zusammenfassung: { gruen: gruen.length, gelb: gelb.length, rot: rot.length, gesamt: punkte.length },
    offeneBlocker: {
      intern: [...rot, ...gelb].filter(p => p.blocker === 'intern').map(p => p.label),
      extern: [...rot, ...gelb].filter(p => p.blocker === 'extern').map(p => p.label),
    },
    betrieb: {
      letzterLauf: laeufe[0]
        ? { id: laeufe[0].id, status: laeufe[0].status, abrechnungsmonat: laeufe[0].abrechnungsmonat, erstellt_am: laeufe[0].erstellt_am }
        : null,
      letzterVersand: letzterVersand ? { id: letzterVersand.id, uebermittelt_am: letzterVersand.uebermittelt_am } : null,
      letzterRuecklaeufer: rlRes.data?.[0] ?? null,
      letzterPreflight,
      letzterDryRun,
      offeneAufgaben: aufgabenRes.count ?? 0,
      offeneFehler: fehlerRes.count ?? 0,
    },
  }
}
