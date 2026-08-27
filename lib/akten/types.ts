// ═══════════════════════════════════════════════════════════════
// Dokumentenmanagement + Akten — geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260809010000_dokumentenmanagement_akten.sql
// ═══════════════════════════════════════════════════════════════

// Konstanten sind die Quelle der Wahrheit — sowohl fuer den Typ (per
// `typeof …[number]`) als auch fuer die Laufzeit-Validierung an der
// API-Grenze (assertDokumentEnum in dokumente.ts). Ohne das laueft ein
// ungueltiger Wert aus dem Client ungeprueft bis zum DB-CHECK-Constraint
// durch und der Nutzer sieht nur eine sanitisierte 500-Antwort statt einer
// erklaerenden 400.
export const DOKUMENT_TYPEN = [
  'vertrag', 'verordnung', 'genehmigung', 'vollmacht',
  'abtretungserklaerung', 'pflegegradbescheid', 'kostentraegerzusage',
  'ausweis', 'fuehrerschein', 'fuehrungszeugnis', 'erste_hilfe',
  'qualifikation', 'zertifikat', 'schulung', 'leistungsnachweis',
  'rechnung', 'schriftverkehr', 'bescheinigung', 'kuendigung',
  'arbeitsvertrag', 'zusatzvereinbarung', 'datenschutzerklaerung',
  'einwilligung', 'foto', 'sonstiges',
] as const
export type DokumentTyp = typeof DOKUMENT_TYPEN[number]

export const DOKUMENT_KATEGORIEN = [
  'stammdaten', 'vertrag', 'pflege', 'abrechnung', 'personal',
  'qualifikation', 'genehmigung', 'korrespondenz', 'allgemein',
] as const
export type DokumentKategorie = typeof DOKUMENT_KATEGORIEN[number]

export const DOKUMENT_STATUS_WERTE = ['entwurf', 'aktiv', 'archiviert', 'gesperrt', 'abgelaufen'] as const
export type DokumentStatus = typeof DOKUMENT_STATUS_WERTE[number]

export const DOKUMENT_SICHTBARKEIT_WERTE = ['intern', 'kunde', 'engel', 'alle'] as const
export type DokumentSichtbarkeit = typeof DOKUMENT_SICHTBARKEIT_WERTE[number]

export interface AktenDokument {
  id: string
  organization_id: string
  client_id: string | null
  caregiver_id: string | null
  titel: string
  dokument_typ: DokumentTyp
  kategorie: DokumentKategorie
  dateiname: string
  dateipfad: string
  dateigroesse_bytes: number | null
  mime_type: string | null
  sha256_hash: string | null
  dokument_datum: string | null
  gueltig_von: string | null
  gueltig_bis: string | null
  ablaufdatum: string | null
  status: DokumentStatus
  sichtbarkeit: DokumentSichtbarkeit
  gesperrt: boolean
  gesperrt_grund: string | null
  gesperrt_am: string | null
  gesperrt_von: string | null
  aktuelle_version: number
  tags: string[]
  interne_bemerkung: string | null
  warnung_90_gesendet: boolean
  warnung_60_gesendet: boolean
  warnung_30_gesendet: boolean
  warnung_14_gesendet: boolean
  warnung_7_gesendet: boolean
  erstellt_von: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface AktenDokumentVersion {
  id: string
  organization_id: string
  dokument_id: string
  version: number
  dateiname: string
  dateipfad: string
  dateigroesse_bytes: number | null
  mime_type: string | null
  sha256_hash: string | null
  aenderungsgrund: string | null
  erstellt_von: string | null
  created_at: string
}

export type VertragsTyp =
  | 'dienstleistungsvertrag' | 'arbeitsvertrag' | 'freelancer_vertrag'
  | 'zusatzvereinbarung' | 'abtretungserklaerung' | 'vollmacht'
  | 'datenschutzerklaerung' | 'einwilligung' | 'kooperationsvertrag' | 'sonstiger'

export type VertragsStatus =
  | 'entwurf' | 'versendet' | 'unterschrieben' | 'aktiv'
  | 'gekuendigt' | 'beendet' | 'storniert'

export type SignaturTyp = 'handschriftlich' | 'digital' | 'signaturepad' | 'fernidentifikation'

export interface AktenVertrag {
  id: string
  organization_id: string
  client_id: string | null
  caregiver_id: string | null
  titel: string
  vertragstyp: VertragsTyp
  vertragsnummer: string | null
  status: VertragsStatus
  vertragsbeginn: string | null
  vertragsende: string | null
  kuendigungsfrist_tage: number | null
  auto_verlaengerung: boolean
  unterschrift_datum: string | null
  unterschrieben_von: string | null
  signatur_typ: SignaturTyp | null
  signatur_daten: Record<string, unknown> | null
  dokument_id: string | null
  vorlage_id: string | null
  pdf_url: string | null
  gesperrt: boolean
  bemerkung: string | null
  erstellt_von: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type KontaktRolle =
  | 'angehoeriger' | 'bevollmaechtigter' | 'betreuer' | 'notfallkontakt'
  | 'hausarzt' | 'facharzt' | 'pflegeberater' | 'sozialarbeiter' | 'sonstiger'

export type VollmachtTyp =
  | 'vorsorgevollmacht' | 'betreuungsvollmacht' | 'patientenverfuegung'
  | 'generalvollmacht' | 'bankvollmacht' | 'sonstige'

export interface AktenKontaktperson {
  id: string
  organization_id: string
  client_id: string
  rolle: KontaktRolle
  anrede: string | null
  vorname: string
  nachname: string
  telefon: string | null
  mobil: string | null
  email: string | null
  adresse: string | null
  plz: string | null
  ort: string | null
  vollmacht_typ: VollmachtTyp | null
  vollmacht_datum: string | null
  vollmacht_dokument_id: string | null
  bevorzugte_kontaktart: 'telefon' | 'mobil' | 'email' | 'post' | null
  erreichbar_von: string | null
  erreichbar_bis: string | null
  beziehung: string | null
  ist_hauptkontakt: boolean
  bemerkung: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ZugriffEntitaetTyp =
  | 'dokument' | 'vertrag' | 'kundenakte' | 'mitarbeiterakte' | 'verordnung' | 'kontaktperson'

export type ZugriffAktion =
  | 'angesehen' | 'heruntergeladen' | 'hochgeladen' | 'bearbeitet'
  | 'archiviert' | 'gesperrt' | 'entsperrt' | 'geloescht'
  | 'version_erstellt' | 'unterschrieben' | 'freigegeben'

export interface AktenZugriffLogEntry {
  id: string
  organization_id: string
  dokument_id: string | null
  vertrag_id: string | null
  entitaet_typ: ZugriffEntitaetTyp
  entitaet_id: string
  aktion: ZugriffAktion
  benutzer_id: string
  benutzer_rolle: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface AktenAblaufEintrag {
  organization_id: string
  dokument_id: string
  titel: string
  dokument_typ: DokumentTyp
  kategorie: DokumentKategorie
  client_id: string | null
  caregiver_id: string | null
  ablaufdatum: string
  dringlichkeit: '90_tage' | '60_tage' | '30_tage' | '14_tage' | '7_tage' | 'abgelaufen' | 'ok'
  tage_bis_ablauf: number
}

/** Storage-Bucket je nach Zuordnung des Dokuments. */
export function bucketForZuordnung(clientId: string | null, caregiverId: string | null): string {
  if (clientId) return 'kunden-dokumente'
  if (caregiverId) return 'mitarbeiter-dokumente'
  return 'documents'
}
