/**
 * Zugangsmittel der Kassenabrechnung — Inventar, Status und Rotation.
 *
 * DIE REGEL, DIE DIESES MODUL DURCHSETZT
 * Geheimnisse liegen an genau zwei Orten:
 *
 *   · privater Storage-Bucket "abrechnung"  — Dateien: PKCS#12-Zertifikat,
 *                                             SSH-Private-Keys
 *   · Env-Variable in Vercel                — Passwörter: SECON_ZERT_PASSWORT
 *
 * In der Datenbank steht ausschliesslich, DASS und WANN etwas hinterlegt oder
 * ausgetauscht wurde — Fingerprint, Ablaufdatum, Ablageort. Nie der Wert.
 * `pruefeKeinSchluesselmaterial()` ist die Sperre davor, und die
 * CHECK-Constraints auf `abrechnung_credential_rotationen` sind die Sperre
 * dahinter. Zwei unabhängige Sperren, weil ein Geheimnis, das einmal in einer
 * Tabelle steht, in jedem Backup, jedem Export und jedem Support-Dump steht.
 *
 * WAS DIESES MODUL NICHT TUT
 * Es liest keine Geheimnisse aus und gibt keine zurück. `credentialStatus()`
 * beantwortet "vorhanden ja/nein, gültig bis wann" — mehr braucht weder die
 * Oberfläche noch der Health-Check, und mehr in eine API-Antwort zu legen,
 * hiesse es über einen dritten Weg zu verteilen.
 *
 * ROTATION
 * Rotation heisst hier: das neue Zugangsmittel wird hinterlegt, während das
 * alte noch gilt. Für Zertifikate trägt das bereits `zertifikate.ts` (Pfad und
 * Zeile enthalten den Fingerprint, eine Rotation überschreibt den Vorgänger
 * nicht). Dieses Modul ergänzt das Protokoll darüber und die Frist-Ampel, an
 * der auffällt, dass eine Rotation ansteht — ein abgelaufenes Zertifikat wird
 * sonst am Monatsende bemerkt, wenn die Abrechnung raus muss.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { ZERTIFIKAT_BUCKET, bewerteZertifikat, tageBis, type ZertifikatAmpel } from './zertifikate'
import type { BetriebsKanal } from './betriebsmodus'

export type CredentialArt = 'bucket' | 'env'

export interface CredentialDefinition {
  id: string
  label: string
  art: CredentialArt
  /**
   * Ablageort: Bucket-Pfad (Muster) oder Name der Env-Variable.
   * null = steht erst mit dem externen Vertrag fest.
   */
  ort: string | null
  /** Für welchen Kanal es gebraucht wird. */
  kanal: BetriebsKanal | 'alle'
  /** Ist es echtes Schlüsselmaterial? Empfänger-Zertifikate sind öffentlich. */
  geheim: boolean
  /** Ohne dieses Zugangsmittel kann der Kanal nicht senden. */
  pflicht: boolean
  /** Es gibt mehrere davon (z. B. je Datenannahmestelle). */
  mehrfach: boolean
  /** Wo es herkommt — die Antwort auf "und woher bekomme ich das?". */
  beschaffung: string
  /**
   * Der Ablageort steht noch nicht fest, weil er von einem externen Vertrag
   * abhängt. Solche Einträge werden als offen gemeldet, NIE als erledigt.
   */
  externOffen: boolean
}

/**
 * Der vollständige Bedarf. Wer diese Liste abarbeitet, hat alle Geheimnisse
 * hinterlegt, die die Kassenabrechnung braucht.
 */
export const CREDENTIAL_KATALOG: CredentialDefinition[] = [
  {
    id: 'secon_absender_zertifikat',
    label: 'ITSG-Zertifikat (PKCS#12, eigener Absender)',
    art: 'bucket',
    ort: `${ZERTIFIKAT_BUCKET}:zertifikate/<organisation>/absender-<ik>-<fingerprint>.p12`,
    kanal: 'alle',
    geheim: true,
    pflicht: true,
    mehrfach: false,
    beschaffung: 'ITSG Trust Center — kostenpflichtig, mehrere Tage Vorlauf, setzt IK-Nummer voraus',
    externOffen: false,
  },
  {
    id: 'secon_zert_passwort',
    label: 'Passwort des PKCS#12-Zertifikats',
    art: 'env',
    ort: 'SECON_ZERT_PASSWORT',
    kanal: 'alle',
    geheim: true,
    pflicht: true,
    mehrfach: false,
    beschaffung: 'Wird beim Erzeugen des Zertifikatsantrags selbst vergeben — in Vercel als Env-Variable setzen',
    externOffen: false,
  },
  {
    id: 'sftp_ssh_key',
    label: 'SSH-Private-Key je Datenannahmestelle',
    art: 'bucket',
    ort: `${ZERTIFIKAT_BUCKET}:sftp-keys/<datenannahmestelle-id>.key`,
    kanal: 'sftp_105',
    geheim: true,
    pflicht: true,
    mehrfach: true,
    beschaffung: 'Schlüsselpaar selbst erzeugen, öffentlichen Teil bei der Datenannahmestelle registrieren',
    externOffen: false,
  },
  {
    id: 'empfaenger_zertifikate',
    label: 'Empfänger-Zertifikate der Annahmestellen',
    art: 'bucket',
    ort: 'abrechnung_zertifikate (Cache, öffentliches ITSG-Verzeichnis)',
    kanal: 'alle',
    geheim: false,
    pflicht: true,
    mehrfach: true,
    beschaffung: 'Öffentlich unter trustcenter-data.itsg.de — wird automatisch geladen und zwischengespeichert',
    externOffen: false,
  },
  {
    id: 'kim_provider_zugang',
    label: 'KIM-Provider-Zugang (Postfach, Konnektor)',
    art: 'env',
    ort: null,
    kanal: 'kim',
    geheim: true,
    pflicht: true,
    mehrfach: false,
    beschaffung: 'gematik-Zulassung + KIM-Provider-Vertrag. Welche Zugangsdaten in welcher Form '
      + 'gebraucht werden, steht erst mit dem Provider fest — deshalb ist hier bewusst kein '
      + 'Ablageort vorgegeben.',
    externOffen: true,
  },
]

// ── Guard: kein Schlüsselmaterial in die Datenbank ──────────────

/**
 * Muster, die auf Schlüsselmaterial hindeuten.
 *
 * Bewusst grob: ein falscher Alarm kostet eine Fehlermeldung, ein übersehener
 * Treffer legt einen Private Key in eine Tabelle.
 */
const SCHLUESSEL_MUSTER: Array<{ muster: RegExp; was: string }> = [
  { muster: /-----BEGIN [^-]*PRIVATE KEY-----/, was: 'PEM-Private-Key' },
  { muster: /-----BEGIN CERTIFICATE-----/, was: 'PEM-Zertifikat' },
  { muster: /PuTTY-User-Key-File/, was: 'PuTTY-Schlüsseldatei' },
  { muster: /ssh-(rsa|ed25519|dss) [A-Za-z0-9+/]{100,}/, was: 'OpenSSH-Schlüssel' },
  // PKCS#12/DER beginnt base64-kodiert praktisch immer mit "MII".
  { muster: /\bMII[A-Za-z0-9+/]{80,}/, was: 'DER/PKCS#12-Blob' },
]

export class SchluesselmaterialError extends Error {
  readonly code = 'SCHLUESSELMATERIAL_IN_DB'

  constructor(feld: string, was: string) {
    super(
      `Schlüsselmaterial abgewiesen: das Feld "${feld}" enthält ${was}. `
      + 'Geheimnisse gehören in den privaten Storage-Bucket oder in eine Env-Variable, '
      + 'niemals in eine Datenbankspalte — dort stünden sie in jedem Backup und jedem Export. '
      + 'In die Datenbank gehört nur der Fingerprint.',
    )
    this.name = 'SchluesselmaterialError'
  }
}

/**
 * Wirft, wenn ein Wert wie Schlüsselmaterial aussieht.
 *
 * Vor jedem Schreibvorgang aufrufen, der Freitext eines Benutzers in eine
 * Spalte legt (Notiz, Ablageort, Fingerprint). Wirft, statt zu bereinigen: ein
 * stillschweigend gekürzter Private Key wäre ein Wert, den jemand für
 * gespeichert hält.
 *
 * @throws SchluesselmaterialError
 */
export function pruefeKeinSchluesselmaterial(
  wert: string | null | undefined,
  feld: string,
): void {
  if (!wert) return
  for (const { muster, was } of SCHLUESSEL_MUSTER) {
    if (muster.test(wert)) throw new SchluesselmaterialError(feld, was)
  }
}

// ── Status ──────────────────────────────────────────────────────

export interface CredentialStatus {
  id: string
  label: string
  art: CredentialArt
  ort: string | null
  kanal: BetriebsKanal | 'alle'
  pflicht: boolean
  geheim: boolean
  externOffen: boolean
  beschaffung: string
  /** Wie viele Exemplare hinterlegt sind (bei mehrfachen Zugangsmitteln). */
  vorhanden: number
  /** Wie viele erwartet werden. null = unbekannt (z. B. keine Stelle angelegt). */
  erwartet: number | null
  ampel: ZertifikatAmpel
  /** Frühestes Ablaufdatum der hinterlegten Exemplare. */
  laeuftAbAm: string | null
  tageBisAblauf: number | null
  /** Zeitpunkt der letzten protokollierten Rotation. */
  letzteRotationAm: string | null
  hinweis: string
  /** Was fehlt — je Exemplar benannt, damit klar ist, wo nachzutragen ist. */
  offenePunkte: string[]
}

function envGesetzt(name: string): boolean {
  const wert = process.env[name]
  return typeof wert === 'string' && wert.length > 0
}

/**
 * Status aller Zugangsmittel einer Organisation.
 *
 * Liefert niemals Werte — nur Zählungen, Fristen und Ampeln.
 */
export async function credentialStatus(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CredentialStatus[]> {
  // ── Warum diese drei Abfragen ihren Fehler mitnehmen ────────────────
  // Diese Funktion beantwortet die Frage „welche Zugangsmittel fehlen?".
  // Verworfene Fehler machten daraus lauter Fehlanzeigen: „kein
  // Absenderzertifikat hinterlegt", „kein SSH-Key" — dieselben Saetze, die
  // ein sauber gelesener leerer Bestand erzeugt. Die Seite haette also zum
  // Handeln aufgefordert (Zertifikat beim ITSG Trust Center beantragen),
  // obwohl die Zugangsmittel laengst da waren.
  const { data: zertifikate, error: zertFehler } = await supabase
    .from('abrechnung_zertifikate')
    .select('ik_nummer, typ, fingerprint, gueltig_bis')
    .eq('organization_id', organizationId)

  // Datenannahmestellen, für die ein SSH-Key gebraucht wird.
  const { data: stellen, error: stellenFehler } = await supabase
    .from('datenannahmestellen')
    .select('id, name, sftp_host, sftp_user, sftp_key_url, aktiv')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .is('deleted_at', null)

  const { data: rotationen, error: rotationenFehler } = await supabase
    .from('abrechnung_credential_rotationen')
    .select('credential_id, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  const leseFehler = zertFehler ?? stellenFehler ?? rotationenFehler
  if (leseFehler) {
    throw new Error(
      `Zugangsmittel nicht lesbar: ${leseFehler.message}. `
      + `Ein nicht lesbarer Bestand ist kein fehlender Bestand.`
    )
  }

  const letzteRotation = new Map<string, string>()
  for (const r of rotationen ?? []) {
    if (!letzteRotation.has(r.credential_id)) letzteRotation.set(r.credential_id, r.created_at)
  }

  const heute = new Date()

  return CREDENTIAL_KATALOG.map((def): CredentialStatus => {
    const basis = {
      id: def.id,
      label: def.label,
      art: def.art,
      ort: def.ort,
      kanal: def.kanal,
      pflicht: def.pflicht,
      geheim: def.geheim,
      externOffen: def.externOffen,
      beschaffung: def.beschaffung,
      letzteRotationAm: letzteRotation.get(def.id) ?? null,
    }

    if (def.externOffen) {
      return {
        ...basis,
        vorhanden: 0,
        erwartet: null,
        ampel: 'rot',
        laeuftAbAm: null,
        tageBisAblauf: null,
        hinweis: 'Extern blockiert — Ablageort und Format der Zugangsdaten stehen erst '
          + 'mit dem Provider-Vertrag fest. Wird nicht als erledigt gezählt.',
        offenePunkte: [def.beschaffung],
      }
    }

    if (def.art === 'env' && def.ort) {
      const gesetzt = envGesetzt(def.ort)
      return {
        ...basis,
        vorhanden: gesetzt ? 1 : 0,
        erwartet: 1,
        ampel: gesetzt ? 'gruen' : 'rot',
        laeuftAbAm: null,
        tageBisAblauf: null,
        hinweis: gesetzt
          ? `Env-Variable ${def.ort} ist gesetzt (Wert wird nie angezeigt)`
          : `Env-Variable ${def.ort} fehlt`,
        offenePunkte: gesetzt ? [] : [`${def.ort} in Vercel setzen`],
      }
    }

    if (def.id === 'secon_absender_zertifikat') {
      const absender = (zertifikate ?? []).filter(z => z.typ === 'absender')
      const gueltige = absender
        .filter(z => z.gueltig_bis && tageBis(z.gueltig_bis, heute) >= 0)
        .sort((a, b) => (a.gueltig_bis! < b.gueltig_bis! ? 1 : -1))
      const aktiv = gueltige[0] ?? null
      const bewertung = bewerteZertifikat(aktiv?.gueltig_bis ?? null, heute)

      return {
        ...basis,
        vorhanden: gueltige.length,
        erwartet: 1,
        ampel: aktiv ? bewertung.ampel : 'rot',
        laeuftAbAm: aktiv?.gueltig_bis ?? null,
        tageBisAblauf: bewertung.tage,
        hinweis: aktiv
          ? bewertung.hinweis
            ?? `Gültig bis ${aktiv.gueltig_bis}${gueltige.length > 1 ? ` (${gueltige.length - 1} Ersatzzertifikat(e) hinterlegt)` : ''}`
          : 'Kein gültiges Absender-Zertifikat hinterlegt',
        offenePunkte: aktiv
          ? bewertung.ampel === 'gelb'
            ? ['Nachfolgezertifikat beim ITSG Trust Center beantragen und hochladen']
            : []
          : ['PKCS#12-Zertifikat hochladen (Admin → Abrechnung → Einstellungen)'],
      }
    }

    if (def.id === 'sftp_ssh_key') {
      // Erwartet wird ein Key je aktiver Stelle mit SFTP-Zugang. Stellen ohne
      // Host sind nicht angebunden und brauchen keinen.
      const relevant = (stellen ?? []).filter(s => s.aktiv && s.sftp_host)
      const mitKey = relevant.filter(s => s.sftp_key_url)
      const ohneKey = relevant.filter(s => !s.sftp_key_url)

      return {
        ...basis,
        vorhanden: mitKey.length,
        erwartet: relevant.length,
        ampel: relevant.length === 0 ? 'rot' : ohneKey.length === 0 ? 'gruen' : 'gelb',
        laeuftAbAm: null,
        tageBisAblauf: null,
        hinweis: relevant.length === 0
          ? 'Keine aktive Datenannahmestelle mit SFTP-Zugang angelegt'
          : `${mitKey.length} von ${relevant.length} Annahmestelle(n) mit hinterlegtem Key`,
        offenePunkte: relevant.length === 0
          ? ['Datenannahmestelle mit Host, Benutzer und Verzeichnis anlegen']
          : ohneKey.map(s => `SSH-Key für "${s.name}" hochladen`),
      }
    }

    // empfaenger_zertifikate
    const empfaenger = (zertifikate ?? []).filter(z => z.typ === 'empfaenger')
    const abgelaufen = empfaenger.filter(z => !z.gueltig_bis || tageBis(z.gueltig_bis, heute) < 0)
    const frist = empfaenger
      .map(z => z.gueltig_bis)
      .filter((d): d is string => !!d)
      .sort()[0] ?? null

    return {
      ...basis,
      vorhanden: empfaenger.length - abgelaufen.length,
      erwartet: null,
      ampel: empfaenger.length === 0 ? 'gelb' : abgelaufen.length > 0 ? 'gelb' : 'gruen',
      laeuftAbAm: frist,
      tageBisAblauf: frist ? tageBis(frist, heute) : null,
      hinweis: empfaenger.length === 0
        ? 'Noch kein Empfänger-Zertifikat geladen — wird beim ersten Versand automatisch geholt'
        : `${empfaenger.length - abgelaufen.length} gültig, ${abgelaufen.length} abgelaufen`,
      offenePunkte: [],
    }
  })
}

export interface CredentialUebersicht {
  eintraege: CredentialStatus[]
  /** Alle Pflicht-Zugangsmittel grün? */
  vollstaendig: boolean
  /** Punkte, die im Haus erledigt werden können. */
  offenIntern: string[]
  /** Punkte, die von einem Dritten abhängen. */
  offenExtern: string[]
  /** Nächste anstehende Frist. */
  naechsterAblauf: { id: string; label: string; am: string; tage: number } | null
}

export async function credentialUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CredentialUebersicht> {
  const eintraege = await credentialStatus(supabase, organizationId)

  const fristen = eintraege
    .filter(e => e.laeuftAbAm && e.tageBisAblauf !== null)
    .sort((a, b) => (a.tageBisAblauf ?? 0) - (b.tageBisAblauf ?? 0))

  return {
    eintraege,
    vollstaendig: eintraege.filter(e => e.pflicht).every(e => e.ampel === 'gruen'),
    offenIntern: eintraege.filter(e => !e.externOffen).flatMap(e => e.offenePunkte),
    offenExtern: eintraege.filter(e => e.externOffen).flatMap(e => e.offenePunkte),
    naechsterAblauf: fristen[0]
      ? {
          id: fristen[0].id,
          label: fristen[0].label,
          am: fristen[0].laeuftAbAm!,
          tage: fristen[0].tageBisAblauf!,
        }
      : null,
  }
}

// ── Rotationsprotokoll ──────────────────────────────────────────

export type RotationEreignis = 'hinterlegt' | 'rotiert' | 'entfernt' | 'geprueft'

export interface RotationEingabe {
  organizationId: string
  credentialId: string
  ereignis: RotationEreignis
  actorId: string
  fingerprintNeu?: string | null
  fingerprintAlt?: string | null
  gueltigBis?: string | null
  ablageOrt?: string | null
  bezugId?: string | null
  bezugLabel?: string | null
  notiz?: string | null
}

/**
 * Schreibt einen Eintrag ins Rotationsprotokoll.
 *
 * Prüft jedes Freitextfeld gegen Schlüsselmaterial, BEVOR geschrieben wird —
 * der Datenbank-Constraint würde es zwar ebenfalls abweisen, aber mit einer
 * Meldung, die niemandem sagt, was falsch war.
 *
 * Wirft bei Schlüsselmaterial (das ist ein Programmierfehler und muss laut
 * scheitern), nicht aber bei einem Schreibfehler: eine fehlende Protokollzeile
 * darf keine Zertifikatsrotation abbrechen, die bereits stattgefunden hat.
 */
export async function protokolliereRotation(
  supabase: SupabaseClient,
  eingabe: RotationEingabe,
): Promise<{ ok: boolean; fehler: string | null }> {
  pruefeKeinSchluesselmaterial(eingabe.fingerprintNeu, 'fingerprint_neu')
  pruefeKeinSchluesselmaterial(eingabe.fingerprintAlt, 'fingerprint_alt')
  pruefeKeinSchluesselmaterial(eingabe.ablageOrt, 'ablage_ort')
  pruefeKeinSchluesselmaterial(eingabe.notiz, 'notiz')

  const definition = CREDENTIAL_KATALOG.find(d => d.id === eingabe.credentialId)
  if (!definition) {
    throw new Error(
      `Unbekanntes Zugangsmittel "${eingabe.credentialId}". `
      + `Bekannt: ${CREDENTIAL_KATALOG.map(d => d.id).join(', ')}`,
    )
  }

  let fehler: string | null = null

  const { error } = await supabase.from('abrechnung_credential_rotationen').insert({
    organization_id: eingabe.organizationId,
    credential_id: eingabe.credentialId,
    art: definition.art,
    kanal: definition.kanal,
    bezug_id: eingabe.bezugId ?? null,
    bezug_label: eingabe.bezugLabel ?? null,
    ereignis: eingabe.ereignis,
    // Fingerprints gekürzt: zur Wiedererkennung reichen 64 Zeichen, und ein
    // kürzerer Wert ist einer weniger, der versehentlich mehr enthält.
    fingerprint_neu: eingabe.fingerprintNeu?.slice(0, 64) ?? null,
    fingerprint_alt: eingabe.fingerprintAlt?.slice(0, 64) ?? null,
    gueltig_bis: eingabe.gueltigBis ?? null,
    ablage_ort: eingabe.ablageOrt ?? definition.ort,
    notiz: eingabe.notiz ?? null,
    ausgefuehrt_von: eingabe.actorId,
  })

  if (error) fehler = error.message

  try {
    await logBillingAction(supabase, {
      entityType: 'abrechnung_credential',
      organizationId: eingabe.organizationId,
      entityId: eingabe.credentialId,
      action: `credential_${eingabe.ereignis}`,
      newState: {
        credential_id: eingabe.credentialId,
        ereignis: eingabe.ereignis,
        fingerprint_neu: eingabe.fingerprintNeu?.slice(0, 64) ?? null,
        gueltig_bis: eingabe.gueltigBis ?? null,
        bezug: eingabe.bezugLabel ?? null,
      },
      actorId: eingabe.actorId,
    })
  } catch (err) {
    fehler = fehler ? `${fehler}; Audit: ${(err as Error).message}` : `Audit: ${(err as Error).message}`
  }

  return { ok: !fehler, fehler }
}

export interface RotationZeile {
  id: string
  credentialId: string
  label: string
  ereignis: RotationEreignis
  fingerprintNeu: string | null
  fingerprintAlt: string | null
  gueltigBis: string | null
  ablageOrt: string | null
  bezugLabel: string | null
  notiz: string | null
  createdAt: string
}

export async function ladeRotationen(
  supabase: SupabaseClient,
  organizationId: string,
  filter: { credentialId?: string; limit?: number } = {},
): Promise<RotationZeile[]> {
  let query = supabase
    .from('abrechnung_credential_rotationen')
    .select('id, credential_id, ereignis, fingerprint_neu, fingerprint_alt, gueltig_bis, ablage_ort, bezug_label, notiz, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 100, 300))

  if (filter.credentialId) query = query.eq('credential_id', filter.credentialId)

  const { data } = await query

  return (data ?? []).map(z => ({
    id: z.id,
    credentialId: z.credential_id,
    label: CREDENTIAL_KATALOG.find(d => d.id === z.credential_id)?.label ?? z.credential_id,
    ereignis: z.ereignis,
    fingerprintNeu: z.fingerprint_neu,
    fingerprintAlt: z.fingerprint_alt,
    gueltigBis: z.gueltig_bis,
    ablageOrt: z.ablage_ort,
    bezugLabel: z.bezug_label,
    notiz: z.notiz,
    createdAt: z.created_at,
  }))
}
