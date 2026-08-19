/**
 * DTA-Versandpipeline (§ 105 SGB XI) — der Weg von der erzeugten Datei zur
 * Datenannahmestelle.
 *
 * Bis hierher endete die Kette bei `exportiereLauf()`: EDIFACT erzeugt,
 * validiert, im Bucket abgelegt, DAKOTA-Auftrag auf 'bereit_zur_uebermittlung'.
 * Danach passierte nichts mehr — `sendePerSFTP()` in transport.ts hatte keinen
 * einzigen Aufrufer. Dieses Modul ist dieser Aufrufer.
 *
 * REIHENFOLGE DER SPERREN — bewusst so und nicht anders:
 *
 *   1. Doppelversand-Schutz  — ein bereits übermittelter Auftrag geht nicht
 *                              erneut hinaus. Doppelte Lieferung = doppelte
 *                              Forderung bei der Kasse.
 *   2. Readiness (intern)    — pruefeVersandbereitschaft(); prüft Stammdaten,
 *                              Zertifikate, Anerkennung, Routing.
 *   3. Nutzdaten             — Datei aus dem Bucket, sonst gibt es nichts zu
 *                              senden.
 *   4. SECON-Verschlüsselung — unverschlüsselt geht NIE etwas hinaus.
 *   5. GATE (extern)         — ITSG_ZERTIFIZIERT. Die letzte Sperre vor der
 *                              Leitung.
 *   6. Übertragung           — erst jetzt SFTP.
 *
 * Das Gate steht bewusst NACH der Erzeugung und Verschlüsselung: so lässt sich
 * die gesamte Pipeline heute schon echt durchspielen — mit echten Dateien,
 * echter Verschlüsselung, echten Prüfungen — und es fehlt am Ende genau ein
 * Schritt, der von aussen kommt. Stünde das Gate vorne, wäre unbewiesen, ob
 * der Rest funktioniert.
 *
 * WIEDERHOLUNG UND FEHLERQUEUE (Schritt 6)
 * Die Übertragung wird bei vorübergehenden Netzfehlern bis zu dreimal mit
 * wachsendem Abstand wiederholt — aber nur, solange die Wiederholung folgenlos
 * ist. Sobald die Auftragsdatei oben liegt, kann die Annahmestelle die
 * Verarbeitung begonnen haben; ab da wird nicht mehr automatisch wiederholt,
 * sondern in die Dead-Letter-Queue eingestellt (lib/abrechnung/dead-letter.ts).
 * Ein endgültig gescheiterter Versand verschwindet dadurch nicht im
 * Auftragsstatus, sondern steht auf einer Liste mit Bearbeiter und Abschluss.
 *
 * TESTMODUS: `testmodus: true` durchläuft 1–4 vollständig und hält vor 5 an.
 * Ergebnis ist ein echter Dateihash und eine echte Grössenangabe — nur eben
 * ohne Leitung. Der Auftragsstatus bleibt dabei unverändert.
 *
 * Nur serverseitig verwenden (Node runtime, Service-Role-Client).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeContentHash } from '../billing/core/audit'
import { ExternGesperrtError, istFreigegeben, pruefeFreigabe } from './externe-freigaben'
import { pruefeVersandbereitschaft, VersandGesperrtError } from './versand-guard'
import { sendePerSFTP, pruefeAntworten, type TransportConfig, type DakotaFreigabe } from './transport'
import { verschluesseln } from './secon'
import { ladeAbsenderZertifikat, ladeEmpfaengerZertifikat, ZERTIFIKAT_BUCKET } from './zertifikate'
import { protokolliereVersand } from './versand-protokoll'
import { mitWiederholung, MAX_VERSUCHE } from './retry'
import { inDeadLetter } from './dead-letter'
import { parseSlgaDatei } from './slga-parser'
import { patcheAuftragsdatei, AUFTRAGSDATEI_LAENGE } from './auftragsdatei'
import { importiereRuecklaeufer } from './ruecklaeufer'
import { modulAktiv } from '../expansion/state-settings'

const DTA_BUCKET = 'abrechnung'

/** Auftragsstatus, aus denen ein Versand starten darf. */
const VERSENDBARE_STATUS = [
  'bereit_zur_uebermittlung',
  'verschluesselt',
  'externer_zugang_fehlt',
  'technischer_fehler',
] as const

export interface VersandOptionen {
  /** Id aus dta_dakota_auftraege. */
  auftragId: string
  organizationId: string
  actorId: string
  /**
   * true = Datei erzeugen und verschlüsseln, aber NICHT übertragen.
   * Der Auftragsstatus bleibt unverändert.
   */
  testmodus?: boolean
}

export interface VersandDetail {
  auftragId: string
  laufId: string | null
  empfaengerIk: string | null
  /** Endstatus des Auftrags nach diesem Versuch. */
  status: string
  /** true nur, wenn tatsächlich Bytes bei der Annahmestelle angekommen sind. */
  uebertragen: boolean
  /** Wo die Pipeline angehalten hat — null, wenn sie durchlief. */
  gestoppt: 'extern' | 'intern' | 'testmodus' | null
  /** Klartext, warum gestoppt wurde. */
  grund: string | null
  /** Was zu tun ist, damit es beim nächsten Mal durchläuft. */
  naechsterSchritt: string | null
  /** Wie viele Übertragungsversuche unternommen wurden (0 = gar nicht erst gesendet). */
  versuche: number
  /** Gesetzt, wenn der Versand in der Fehlerqueue gelandet ist. */
  deadLetterId: string | null
  dateiName: string | null
  dateiHash: string | null
  dateiGroesseBytes: number | null
  verschluesselt: boolean
  protokoll: string[]
}

// ── Hilfsfunktionen ─────────────────────────────────────────────

function jetzt(): string {
  return new Date().toISOString()
}

async function ladeAusBucket(
  supabase: SupabaseClient,
  pfad: string,
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(DTA_BUCKET).download(pfad)
  if (error || !data) {
    throw new Error(`Datei "${pfad}" nicht im Bucket "${DTA_BUCKET}": ${error?.message ?? 'unbekannt'}`)
  }
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Zählt den Versuch auf dem Auftrag mit — unabhängig vom Ausgang.
 *
 * `versand_versuche` ist die Zahl, an der später auffällt, dass eine
 * Annahmestelle systematisch ablehnt. Ein Versuch, der am Gate scheitert,
 * zählt bewusst mit: er hat stattgefunden.
 */
async function zaehleVersuch(
  supabase: SupabaseClient,
  auftragId: string,
  organizationId: string,
  aktuelleVersuche: number,
  weitereFelder: Record<string, unknown> = {},
): Promise<void> {
  await supabase
    .from('dta_dakota_auftraege')
    .update({
      versand_versuche: (aktuelleVersuche ?? 0) + 1,
      letzter_versuch_am: jetzt(),
      updated_at: jetzt(),
      ...weitereFelder,
    })
    .eq('id', auftragId)
    .eq('organization_id', organizationId)
}

/**
 * Setzt den Lauf auf 'uebermittelt', sobald ALLE seine Aufträge draussen sind.
 *
 * Teilübermittlung ist kein Erfolg: solange auch nur eine Datei fehlt, ist die
 * Lieferung an die Kasse unvollständig und der Lauf darf nicht als übermittelt
 * gelten — sonst erscheint eine halbe Abrechnung als ganze.
 */
async function aktualisiereLaufStatus(
  supabase: SupabaseClient,
  laufId: string,
  organizationId: string,
): Promise<'uebermittelt' | 'unvollstaendig'> {
  const { data: auftraege } = await supabase
    .from('dta_dakota_auftraege')
    .select('id, status')
    .eq('lauf_id', laufId)
    .eq('organization_id', organizationId)

  const alle = auftraege ?? []
  const offen = alle.filter(a => a.status !== 'uebermittelt' && a.status !== 'quittiert')

  if (alle.length > 0 && offen.length === 0) {
    await supabase
      .from('abrechnungslaeufe')
      .update({ status: 'uebermittelt', uebermittelt_am: jetzt() })
      .eq('id', laufId)
      .eq('organization_id', organizationId)
    return 'uebermittelt'
  }

  await supabase
    .from('abrechnungslaeufe')
    .update({ status: 'uebermittlung_laeuft' })
    .eq('id', laufId)
    .eq('organization_id', organizationId)
  return 'unvollstaendig'
}

// ── Hauptpipeline: ein DAKOTA-Auftrag ───────────────────────────

/**
 * Überträgt einen DAKOTA-Auftrag an seine Datenannahmestelle.
 *
 * Wirft nur bei Programmierfehlern und bei verweigertem Doppelversand.
 * Fachliche Sperren (Readiness, fehlendes Zertifikat, geschlossenes Gate)
 * kommen als Ergebnis mit `gestoppt` zurück — sie sind der erwartete Zustand,
 * kein Ausnahmefall, und die Oberfläche soll sie erklären statt sie als
 * Absturz zu zeigen.
 */
export async function versendeDakotaAuftrag(
  supabase: SupabaseClient,
  optionen: VersandOptionen,
): Promise<VersandDetail> {
  const { auftragId, organizationId, actorId, testmodus = false } = optionen
  const start = Date.now()
  const protokoll: string[] = []
  const kanal = 'sftp_105' as const

  const log = (zeile: string) => protokoll.push(`[${jetzt()}] ${zeile}`)

  // ── 1. Auftrag laden + Doppelversand-Schutz ───────────────────
  const { data: auftrag } = await supabase
    .from('dta_dakota_auftraege')
    .select('id, lauf_id, organization_id, datenannahmestelle_id, empfaenger_ik, absender_ik, logischer_dateiname, physikalischer_dateiname, nutzdaten_url, auftragsdatei_url, status, versand_versuche')
    .eq('id', auftragId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!auftrag) {
    throw new Error('DAKOTA-Auftrag nicht gefunden oder gehört zu einer anderen Organisation')
  }

  if (auftrag.status === 'uebermittelt' || auftrag.status === 'quittiert') {
    throw new Error(
      `Auftrag ist bereits im Status "${auftrag.status}" — ein zweiter Versand würde bei der Kasse `
      + 'eine doppelte Forderung erzeugen. Für eine erneute Lieferung einen Korrekturlauf anlegen.',
    )
  }

  if (!VERSENDBARE_STATUS.includes(auftrag.status as typeof VERSENDBARE_STATUS[number])) {
    throw new Error(
      `Auftrag im Status "${auftrag.status}" kann nicht versendet werden. `
      + `Erlaubt: ${VERSENDBARE_STATUS.join(', ')}`,
    )
  }

  const basis = {
    auftragId,
    laufId: auftrag.lauf_id as string | null,
    empfaengerIk: auftrag.empfaenger_ik as string | null,
  }

  const abbruch = async (
    art: 'extern' | 'intern' | 'testmodus',
    phase: 'vorbereitung' | 'verschluesselung' | 'gate',
    grund: string,
    naechsterSchritt: string | null,
    extras: Partial<VersandDetail> = {},
  ): Promise<VersandDetail> => {
    log(`GESTOPPT (${art}): ${grund}`)

    // Testläufe verändern den Auftragsstatus nicht — sonst sähe ein
    // Probelauf für die Oberfläche aus wie ein gescheiterter Versand.
    if (art !== 'testmodus') {
      const neuerStatus = art === 'extern' ? 'externer_zugang_fehlt' : auftrag.status
      await zaehleVersuch(supabase, auftragId, organizationId, auftrag.versand_versuche ?? 0, {
        status: neuerStatus,
        fehler_code: art === 'extern' ? 'EXTERN_GESPERRT' : 'INTERN_UNVOLLSTAENDIG',
        fehler_meldung: grund.slice(0, 1000),
      })
    }

    await protokolliereVersand(supabase, {
      organizationId,
      kanal,
      phase,
      ergebnis: art === 'testmodus' ? 'testmodus' : art === 'extern' ? 'gestoppt_extern' : 'gestoppt_intern',
      laufId: basis.laufId,
      dakotaAuftragId: auftragId,
      protokoll: protokoll.join('\n'),
      fehlerCode: art === 'extern' ? 'EXTERN_GESPERRT' : art === 'intern' ? 'INTERN_UNVOLLSTAENDIG' : null,
      fehlerMeldung: art === 'testmodus' ? null : grund,
      dateiName: extras.dateiName ?? auftrag.logischer_dateiname,
      dateiHash: extras.dateiHash ?? null,
      dateiGroesseBytes: extras.dateiGroesseBytes ?? null,
      verschluesselt: extras.verschluesselt ?? false,
      empfaengerIk: basis.empfaengerIk,
      dauerMs: Date.now() - start,
      actorId,
    })

    return {
      ...basis,
      status: art === 'testmodus' ? auftrag.status : art === 'extern' ? 'externer_zugang_fehlt' : auftrag.status,
      uebertragen: false,
      gestoppt: art,
      grund,
      naechsterSchritt,
      // Ein Abbruch VOR der Leitung ist kein Übertragungsversuch: die Zahl
      // zählt, was tatsächlich an der Annahmestelle probiert wurde.
      versuche: 0,
      deadLetterId: null,
      dateiName: extras.dateiName ?? auftrag.logischer_dateiname,
      dateiHash: extras.dateiHash ?? null,
      dateiGroesseBytes: extras.dateiGroesseBytes ?? null,
      verschluesselt: extras.verschluesselt ?? false,
      protokoll,
    }
  }

  log(`Auftrag ${auftragId} — Datei ${auftrag.logischer_dateiname} an IK ${auftrag.empfaenger_ik}${testmodus ? ' (TESTMODUS)' : ''}`)

  // ── 2. Lauf laden (Bundesland für die DAKOTA-Freigabe) ────────
  const { data: lauf } = auftrag.lauf_id
    ? await supabase
        .from('abrechnungslaeufe')
        .select('id, bundesland, status, abrechnungsmonat')
        .eq('id', auftrag.lauf_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    : { data: null }

  // ── 3. Readiness (intern) ────────────────────────────────────
  // Im Testmodus bewusst ebenfalls geprüft, aber nicht blockierend: der
  // Probelauf soll gerade zeigen, was noch fehlt.
  try {
    await pruefeVersandbereitschaft(supabase, organizationId)
    log('Readiness: alle Pflichtpunkte grün')
  } catch (err) {
    if (!(err instanceof VersandGesperrtError)) throw err
    log(`Readiness offen: ${err.gruende.join(' · ')}`)
    if (!testmodus) {
      return abbruch(
        'intern',
        'vorbereitung',
        err.message,
        'Offene Readiness-Punkte schliessen → Admin → Kassenabrechnung → Readiness',
      )
    }
  }

  // ── 4. Nutzdaten + Auftragsdatei laden ───────────────────────
  if (!auftrag.nutzdaten_url || auftrag.nutzdaten_url.startsWith('UPLOAD_FEHLER')) {
    return abbruch(
      'intern',
      'vorbereitung',
      `Nutzdatendatei fehlt (nutzdaten_url = ${auftrag.nutzdaten_url ?? 'NULL'})`,
      'Lauf erneut exportieren — die EDIFACT-Datei liegt nicht im Bucket',
    )
  }

  let nutzdaten: Buffer
  let auftragsdatei: Buffer
  try {
    nutzdaten = await ladeAusBucket(supabase, auftrag.nutzdaten_url)
    log(`Nutzdaten geladen: ${nutzdaten.length} Bytes`)
    auftragsdatei = auftrag.auftragsdatei_url
      ? await ladeAusBucket(supabase, auftrag.auftragsdatei_url)
      : Buffer.alloc(0)
    if (auftragsdatei.length === 0) {
      return abbruch(
        'intern',
        'vorbereitung',
        'Auftragsdatei fehlt — ohne sie startet die Annahmestelle die Verarbeitung nicht',
        'Lauf erneut exportieren',
      )
    }
    log(`Auftragsdatei geladen: ${auftragsdatei.length} Bytes`)
  } catch (err) {
    return abbruch('intern', 'vorbereitung', (err as Error).message, 'Lauf erneut exportieren')
  }

  // ── 5. SECON-Verschlüsselung ─────────────────────────────────
  // Unverschlüsselt verlässt NICHTS das Haus: die Datei enthält
  // Versichertennummern, Diagnosen-nahe Leistungsarten und Beträge.
  let nutzlast = nutzdaten
  let verschluesselt = false
  try {
    const { p12, passwort } = await ladeAbsenderZertifikat(auftrag.absender_ik, organizationId)
    const empfaenger = await ladeEmpfaengerZertifikat(auftrag.empfaenger_ik, { organizationId })
    nutzlast = await verschluesseln(nutzdaten, {
      absender_ik: auftrag.absender_ik,
      absender_zertifikat: p12,
      absender_passwort: passwort,
      empfaenger_zertifikat: Buffer.from(empfaenger.zertifikat_pem, 'utf8'),
    })
    verschluesselt = true
    log(`SECON-verschlüsselt: ${nutzdaten.length} → ${nutzlast.length} Bytes`)
  } catch (err) {
    const grund = `SECON-Verschlüsselung nicht möglich: ${(err as Error).message}`
    log(grund)
    if (!testmodus) {
      return abbruch(
        'intern',
        'verschluesselung',
        grund + ' — unverschlüsselt wird nichts übertragen',
        'ITSG-Zertifikat hochladen, SECON_ZERT_PASSWORT setzen und Empfänger-Zertifikat laden',
        { dateiGroesseBytes: nutzdaten.length },
      )
    }
  }

  // ── 5b. Auftragsdatei an die Nutzlast angleichen ─────────────
  // Der Auftragssatz entstand beim Export, also vor der Verschluesselung.
  // Er meldete deshalb die Klartextgroesse und "keine Verschluesselung",
  // waehrend tatsaechlich eine PKCS#7-Nutzlast anderer Groesse uebertragen
  // wird. Die Annahmestelle prueft genau diese Felder gegen die gelieferte
  // Datei — ohne den Nachtrag ist die Lieferung formal falsch.
  if (auftragsdatei.length === AUFTRAGSDATEI_LAENGE) {
    try {
      auftragsdatei = Buffer.from(
        patcheAuftragsdatei(auftragsdatei.toString('latin1'), {
          dateigroesse_uebertragung: nutzlast.length,
          verschluesselt,
          gesendet_am: new Date(),
          physikalischer_dateiname: auftrag.physikalischer_dateiname || undefined,
        }),
        'latin1',
      )
      log(`Auftragsdatei nachgetragen: ${nutzlast.length} Bytes, verschluesselt=${verschluesselt}`)
    } catch (err) {
      return abbruch(
        'intern',
        'vorbereitung',
        `Auftragsdatei laesst sich nicht an die Nutzlast angleichen: ${(err as Error).message}`,
        'Lauf erneut exportieren — der gespeicherte Auftragssatz ist beschaedigt',
        { dateiGroesseBytes: nutzlast.length },
      )
    }
  } else {
    return abbruch(
      'intern',
      'vorbereitung',
      `Auftragsdatei hat ${auftragsdatei.length} statt ${AUFTRAGSDATEI_LAENGE} Bytes`,
      'Lauf erneut exportieren — der Auftragssatz hat nicht die vorgeschriebene feste Laenge',
      { dateiGroesseBytes: nutzlast.length },
    )
  }

  const dateiHash = await computeContentHash({
    datei: auftrag.logischer_dateiname,
    bytes: nutzlast.length,
    inhalt: nutzlast.toString('base64').slice(0, 4096),
  })

  await protokolliereVersand(supabase, {
    organizationId,
    kanal,
    phase: 'verschluesselung',
    ergebnis: verschluesselt ? 'erfolg' : 'gestoppt_intern',
    laufId: basis.laufId,
    dakotaAuftragId: auftragId,
    protokoll: protokoll.join('\n'),
    dateiName: auftrag.logischer_dateiname,
    dateiHash,
    dateiGroesseBytes: nutzlast.length,
    verschluesselt,
    empfaengerIk: basis.empfaengerIk,
    dauerMs: Date.now() - start,
    actorId,
  })

  // ── 6. Testmodus: hier ist Schluss ───────────────────────────
  if (testmodus) {
    return abbruch(
      'testmodus',
      'gate',
      'Testmodus: Datei wurde erzeugt und geprüft, aber bewusst nicht übertragen',
      istFreigegeben('itsg_zertifiziert')
        ? 'Ohne testmodus erneut aufrufen, um tatsächlich zu übertragen'
        : `Externe Freigabe fehlt weiterhin (ITSG_ZERTIFIZIERT)`,
      { dateiHash, dateiGroesseBytes: nutzlast.length, verschluesselt, dateiName: auftrag.logischer_dateiname },
    )
  }

  // ── 7. GATE: externe Freigabe ────────────────────────────────
  try {
    pruefeFreigabe('itsg_zertifiziert', `Auftrag ${auftragId} an IK ${auftrag.empfaenger_ik}`)
    log('Gate ITSG_ZERTIFIZIERT: offen')
  } catch (err) {
    if (!(err instanceof ExternGesperrtError)) throw err
    return abbruch(
      'extern',
      'gate',
      err.message,
      `Nach Vorliegen von ITSG-Zertifikat und SFTP-Zugang: ${err.envVariable}=true setzen`,
      { dateiHash, dateiGroesseBytes: nutzlast.length, verschluesselt, dateiName: auftrag.logischer_dateiname },
    )
  }

  // ── 8. Transportkonfiguration ────────────────────────────────
  const { data: annahmestelle } = auftrag.datenannahmestelle_id
    ? await supabase
        .from('datenannahmestellen')
        .select('id, name, ik_nummer, sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis, sftp_key_url, aktiv')
        .eq('id', auftrag.datenannahmestelle_id)
        .maybeSingle()
    : await supabase
        .from('datenannahmestellen')
        .select('id, name, ik_nummer, sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis, sftp_key_url, aktiv')
        .eq('ik_nummer', auftrag.empfaenger_ik)
        .eq('aktiv', true)
        .maybeSingle()

  if (!annahmestelle?.sftp_host || !annahmestelle.sftp_user) {
    return abbruch(
      'intern',
      'gate',
      `Kein SFTP-Zugang für Datenannahmestelle ${annahmestelle?.name ?? auftrag.empfaenger_ik} hinterlegt`,
      'Zugangsdaten unter Admin → Annahmestellen eintragen',
      { dateiHash, dateiGroesseBytes: nutzlast.length, verschluesselt },
    )
  }

  let sftpKey: Buffer | undefined
  if (annahmestelle.sftp_key_url) {
    try {
      const { data: keyDatei } = await supabase.storage
        .from(ZERTIFIKAT_BUCKET)
        .download(annahmestelle.sftp_key_url)
      if (keyDatei) sftpKey = Buffer.from(await keyDatei.arrayBuffer())
    } catch {
      // Kein Abbruch: die Transportschicht meldet den fehlenden Zugang selbst
      // mit einer präziseren Meldung.
    }
  }

  if (!sftpKey) {
    return abbruch(
      'intern',
      'gate',
      `SSH-Key für ${annahmestelle.name} nicht lesbar — ohne Key keine Anmeldung`,
      'Private Key erneut hochladen (Admin → Annahmestellen)',
      { dateiHash, dateiGroesseBytes: nutzlast.length, verschluesselt },
    )
  }

  const transportConfig: TransportConfig = {
    datenannahmestelle: annahmestelle.name,
    sftp_host: annahmestelle.sftp_host,
    sftp_port: annahmestelle.sftp_port || 22,
    sftp_user: annahmestelle.sftp_user,
    sftp_key: sftpKey,
    sftp_verzeichnis: annahmestelle.sftp_verzeichnis || '/upload',
    antwort_verzeichnis: annahmestelle.antwort_verzeichnis || '/download',
  }

  // ── 9. Bundesland-Freischaltung (DAKOTA) ─────────────────────
  const bundesland = lauf?.bundesland ?? null
  const freigabe: DakotaFreigabe = {
    organization_id: organizationId,
    bundesland: bundesland ?? 'unbekannt',
    dakota_export_enabled: bundesland
      ? await modulAktiv('dakota_export_enabled', bundesland, organizationId)
      : false,
  }

  if (!freigabe.dakota_export_enabled) {
    return abbruch(
      'intern',
      'gate',
      `DAKOTA-Übermittlung für Bundesland "${freigabe.bundesland}" nicht freigeschaltet`,
      'Admin → Expansion Deutschland → dakota_export_enabled aktivieren',
      { dateiHash, dateiGroesseBytes: nutzlast.length, verschluesselt },
    )
  }

  // ── 10. Übertragung ──────────────────────────────────────────
  await supabase
    .from('dta_dakota_auftraege')
    .update({ status: 'uebermittlung_laeuft', updated_at: jetzt() })
    .eq('id', auftragId)
    .eq('organization_id', organizationId)

  // Wiederholversuche mit wachsendem Abstand — aber nur, solange eine
  // Wiederholung folgenlos ist. Sobald die Auftragsdatei oben liegt, kann die
  // Annahmestelle die Verarbeitung begonnen haben; ab da entscheidet ein
  // Mensch über die Dead-Letter-Queue. Siehe lib/abrechnung/retry.ts.
  const versandStart = new Date().toISOString()
  const wiederholung = await mitWiederholung(
    (versuch) => {
      if (versuch > 1) log(`Wiederholung ${versuch} von ${MAX_VERSUCHE}`)
      return sendePerSFTP(
        nutzlast,
        auftragsdatei,
        transportConfig,
        freigabe,
        {
          nutzdaten: auftrag.physikalischer_dateiname || auftrag.logischer_dateiname,
          auftrag: `${auftrag.physikalischer_dateiname || auftrag.logischer_dateiname}.AUF`,
        },
      )
    },
    {
      bewerte: (e) => ({ erfolg: e.erfolg, phase: e.phase, fehler: e.fehler }),
      aufWiederholung: (zeile) => {
        log(
          `Versuch ${zeile.versuch}: ${zeile.erfolg ? 'erfolgreich' : 'gescheitert'} `
          + `(Phase ${zeile.phase}, ${zeile.dauerMs} ms)`
          + (zeile.fehler ? ` — ${zeile.fehler}` : '')
          + (zeile.abbruchgrund ? ` — ${zeile.abbruchgrund}` : ''),
        )
      },
    },
  )

  const ergebnis = wiederholung.ergebnis
  protokoll.push(ergebnis.protokoll)

  const endStatus = ergebnis.erfolg ? 'uebermittelt' : 'technischer_fehler'

  // Jeder Wiederholversuch zählt einzeln mit: an dieser Zahl fällt später auf,
  // dass eine Annahmestelle systematisch Verbindungen abweist.
  await zaehleVersuch(
    supabase, auftragId, organizationId,
    (auftrag.versand_versuche ?? 0) + wiederholung.versuche - 1,
    {
      status: endStatus,
      nutzdaten_hash: dateiHash,
      nutzdaten_groesse_bytes: nutzlast.length,
      verschluesselt,
      uebermittelt_am: ergebnis.erfolg ? jetzt() : null,
      fehler_code: ergebnis.erfolg ? null : 'TRANSPORT',
      fehler_meldung: ergebnis.erfolg ? null : ergebnis.protokoll.slice(-1000),
    },
  )

  if (!ergebnis.erfolg && basis.laufId) {
    await supabase.from('dta_fehlerprotokoll').insert({
      organization_id: organizationId,
      lauf_id: basis.laufId,
      dakota_auftrag_id: auftragId,
      // 'transport' ist der einzige zulässige Wert für diese Phase —
      // chk_fp_quelle kennt kein 'uebermittlung'.
      fehler_quelle: 'transport',
      fehler_kategorie: 'verbindung',
      fehler_code: 'TRANSPORT',
      fehler_meldung: `Übertragung an ${annahmestelle.name} fehlgeschlagen`,
      original_meldung: ergebnis.protokoll.slice(0, 2000),
      schweregrad: 'kritisch',
      bearbeitungsstatus: 'neu',
    })
  }

  let laufErgebnis: 'uebermittelt' | 'unvollstaendig' | null = null
  if (ergebnis.erfolg && basis.laufId) {
    laufErgebnis = await aktualisiereLaufStatus(supabase, basis.laufId, organizationId)
  }

  const { protokollId } = await protokolliereVersand(supabase, {
    organizationId,
    kanal,
    phase: 'uebertragung',
    ergebnis: ergebnis.erfolg ? 'erfolg' : 'fehler',
    laufId: basis.laufId,
    dakotaAuftragId: auftragId,
    protokoll: protokoll.join('\n'),
    fehlerCode: ergebnis.erfolg ? null : 'TRANSPORT',
    fehlerMeldung: ergebnis.erfolg
      ? null
      : `Übertragung nach ${wiederholung.versuche} Versuch(en) fehlgeschlagen — ${wiederholung.aufgegeben?.text ?? 'Protokoll beachten'}`,
    dateiName: auftrag.logischer_dateiname,
    dateiHash,
    dateiGroesseBytes: nutzlast.length,
    verschluesselt,
    empfaengerIk: basis.empfaengerIk,
    zielHost: annahmestelle.sftp_host,
    dauerMs: Date.now() - start,
    actorId,
  })

  // Endgültig gescheitert: sichtbar machen. Ohne diesen Eintrag bliebe der
  // Auftrag in 'technischer_fehler' liegen und fiele erst auf, wenn die Kasse
  // eine fehlende Lieferung anmahnt.
  let deadLetterId: string | null = null
  if (!ergebnis.erfolg) {
    const dl = await inDeadLetter(supabase, {
      organizationId,
      kanal,
      grund: wiederholung.aufgegeben?.grund ?? 'dauerhafter_fehler',
      laufId: basis.laufId,
      dakotaAuftragId: auftragId,
      versandProtokollId: protokollId,
      fehlerCode: 'TRANSPORT',
      fehlerMeldung: ergebnis.fehler ?? 'Übertragung fehlgeschlagen',
      letztePhase: ergebnis.phase,
      versuche: wiederholung.versuche,
      ersterVersuchAm: versandStart,
      dateiName: auftrag.logischer_dateiname,
      dateiHash,
      empfaengerIk: basis.empfaengerIk,
      notiz: wiederholung.aufgegeben?.text ?? null,
      actorId,
    })
    deadLetterId = dl.id
    if (dl.id) log(`Dead-Letter-Eintrag ${dl.neu ? 'angelegt' : 'fortgeschrieben'}: ${dl.id}`)
  }

  return {
    ...basis,
    status: endStatus,
    uebertragen: ergebnis.erfolg,
    gestoppt: null,
    grund: ergebnis.erfolg
      ? null
      : `Übertragung fehlgeschlagen (${wiederholung.versuche} Versuch(e))`,
    naechsterSchritt: ergebnis.erfolg
      ? laufErgebnis === 'uebermittelt'
        ? 'Auf Quittung/Rückmeldung der Kasse warten (Antwortabruf)'
        : 'Verbleibende Aufträge dieses Laufs übertragen'
      : deadLetterId
        ? 'Liegt in der Fehlerqueue (Admin → Kassenabrechnung → Betrieb) — Ursache prüfen und wiedervorlegen'
        : 'Protokoll prüfen, Ursache beheben, erneut versenden',
    versuche: wiederholung.versuche,
    deadLetterId,
    dateiName: auftrag.logischer_dateiname,
    dateiHash,
    dateiGroesseBytes: nutzlast.length,
    verschluesselt,
    protokoll,
  }
}

// ── Ganzen Lauf versenden ───────────────────────────────────────

export interface LaufVersandErgebnis {
  laufId: string
  auftraege: VersandDetail[]
  uebertragen: number
  gestoppt: number
  fehlgeschlagen: number
  laufStatus: string
}

/**
 * Überträgt alle offenen Aufträge eines Laufs, nacheinander.
 *
 * Bewusst sequenziell: Datenannahmestellen begrenzen parallele SFTP-Sitzungen,
 * und ein halb paralleler Abbruch macht den Zustand schwerer zu lesen als eine
 * langsamere, geordnete Reihe.
 */
export async function versendeLauf(
  supabase: SupabaseClient,
  laufId: string,
  organizationId: string,
  actorId: string,
  testmodus = false,
): Promise<LaufVersandErgebnis> {
  const { data: lauf } = await supabase
    .from('abrechnungslaeufe')
    .select('id, status')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!lauf) throw new Error('Abrechnungslauf nicht gefunden oder gehört zu einer anderen Organisation')

  const { data: auftraege } = await supabase
    .from('dta_dakota_auftraege')
    .select('id, status')
    .eq('lauf_id', laufId)
    .eq('organization_id', organizationId)
    .in('status', VERSENDBARE_STATUS as unknown as string[])
    .order('created_at')

  if (!auftraege?.length) {
    throw new Error(
      `Keine versandbereiten Aufträge zu diesem Lauf (Lauf-Status "${lauf.status}"). `
      + 'Zuerst exportieren.',
    )
  }

  const ergebnisse: VersandDetail[] = []
  for (const a of auftraege) {
    ergebnisse.push(
      await versendeDakotaAuftrag(supabase, { auftragId: a.id, organizationId, actorId, testmodus }),
    )
  }

  const { data: aktualisiert } = await supabase
    .from('abrechnungslaeufe')
    .select('status')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  return {
    laufId,
    auftraege: ergebnisse,
    uebertragen: ergebnisse.filter(e => e.uebertragen).length,
    gestoppt: ergebnisse.filter(e => e.gestoppt !== null).length,
    fehlgeschlagen: ergebnisse.filter(e => !e.uebertragen && e.gestoppt === null).length,
    laufStatus: aktualisiert?.status ?? lauf.status,
  }
}

// ── Antwortabruf ────────────────────────────────────────────────

export interface AntwortAbrufErgebnis {
  annahmestelle: string
  dateien: number
  importiert: number
  duplikate: number
  fehler: string[]
}

export interface AntwortAbrufGesamt {
  gestoppt: 'extern' | null
  grund: string | null
  ergebnisse: AntwortAbrufErgebnis[]
  importiertGesamt: number
}

/**
 * Holt Antwortdateien (Quittungen, Fehlerprotokolle, Abrechnungsergebnisse)
 * aus den Antwortverzeichnissen aller aktiven Datenannahmestellen und
 * importiert sie über den regulären Rückläuferweg.
 *
 * Steht hinter demselben Gate wie der Versand: ohne ITSG-Zugang gibt es kein
 * Antwortverzeichnis, das abgerufen werden könnte.
 *
 * Die Dateien bleiben auf dem Server der Annahmestelle liegen — nichts wird
 * dort gelöscht. Die Dublettenerkennung von `importiereRuecklaeufer()` (Hash
 * über den Inhalt) sorgt dafür, dass ein wiederholter Abruf keine zweite
 * Rückmeldung erzeugt.
 */
export async function holeAntworten(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<AntwortAbrufGesamt> {
  try {
    pruefeFreigabe('itsg_zertifiziert', 'Antwortabruf')
  } catch (err) {
    if (!(err instanceof ExternGesperrtError)) throw err
    await protokolliereVersand(supabase, {
      organizationId,
      kanal: 'sftp_105',
      phase: 'antwortabruf',
      ergebnis: 'gestoppt_extern',
      fehlerCode: 'EXTERN_GESPERRT',
      fehlerMeldung: err.message,
      actorId,
    })
    return { gestoppt: 'extern', grund: err.message, ergebnisse: [], importiertGesamt: 0 }
  }

  const { data: stellen } = await supabase
    .from('datenannahmestellen')
    .select('id, name, ik_nummer, sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis, sftp_key_url')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('aktiv', true)
    .not('sftp_host', 'is', null)
    .is('deleted_at', null)

  const ergebnisse: AntwortAbrufErgebnis[] = []
  let importiertGesamt = 0

  for (const stelle of stellen ?? []) {
    const start = Date.now()
    const eintrag: AntwortAbrufErgebnis = {
      annahmestelle: stelle.name,
      dateien: 0,
      importiert: 0,
      duplikate: 0,
      fehler: [],
    }

    try {
      if (!stelle.sftp_user || !stelle.sftp_key_url) {
        throw new Error('Zugangsdaten unvollständig (Benutzer oder SSH-Key fehlt)')
      }

      const { data: keyDatei } = await supabase.storage
        .from(ZERTIFIKAT_BUCKET)
        .download(stelle.sftp_key_url)
      if (!keyDatei) throw new Error('SSH-Key nicht lesbar')

      const antworten = await pruefeAntworten({
        datenannahmestelle: stelle.name,
        sftp_host: stelle.sftp_host,
        sftp_port: stelle.sftp_port || 22,
        sftp_user: stelle.sftp_user,
        sftp_key: Buffer.from(await keyDatei.arrayBuffer()),
        antwort_verzeichnis: stelle.antwort_verzeichnis || '/download',
      })

      eintrag.dateien = antworten.length

      for (const antwort of antworten) {
        try {
          // Originaldatei zuerst sichern — der Import darf nie der einzige
          // Ort sein, an dem die Rückmeldung existiert.
          const pfad = `ruecklaeufer/${organizationId}/${antwort.dateiname}`
          await supabase.storage
            .from(DTA_BUCKET)
            .upload(pfad, antwort.inhalt, { upsert: true, contentType: 'application/octet-stream' })

          const rohtext = new TextDecoder('iso-8859-1').decode(antwort.inhalt)
          const { importe } = parseSlgaDatei(rohtext, organizationId, actorId, antwort.dateiname, pfad)

          if (importe.length === 0) {
            // Nicht parsbar heisst nicht "ignorieren": als 'sonstige' ablegen,
            // damit ein Mensch sie sieht.
            const ergebnis = await importiereRuecklaeufer(supabase, {
              organizationId,
              ruecklaeuferTyp: 'sonstige',
              originalMeldung: rohtext,
              quelldateiName: antwort.dateiname,
              quelldateiUrl: pfad,
              kostentraegerIk: stelle.ik_nummer ?? undefined,
              actorId,
            })
            if (ergebnis.status === 'duplikat') eintrag.duplikate++
            else eintrag.importiert++
            continue
          }

          for (const params of importe) {
            const ergebnis = await importiereRuecklaeufer(supabase, params)
            if (ergebnis.status === 'duplikat') eintrag.duplikate++
            else eintrag.importiert++
          }
        } catch (err) {
          eintrag.fehler.push(`${antwort.dateiname}: ${(err as Error).message}`)
        }
      }

      importiertGesamt += eintrag.importiert
    } catch (err) {
      eintrag.fehler.push((err as Error).message)
    }

    await protokolliereVersand(supabase, {
      organizationId,
      kanal: 'sftp_105',
      phase: 'antwortabruf',
      ergebnis: eintrag.fehler.length > 0 ? 'fehler' : 'erfolg',
      externeReferenz: stelle.id,
      protokoll: `Antwortabruf ${stelle.name}: ${eintrag.dateien} Datei(en), `
        + `${eintrag.importiert} importiert, ${eintrag.duplikate} Duplikat(e)`,
      fehlerMeldung: eintrag.fehler.join('; ') || null,
      empfaengerIk: stelle.ik_nummer,
      zielHost: stelle.sftp_host,
      dauerMs: Date.now() - start,
      actorId,
    })

    ergebnisse.push(eintrag)
  }

  return { gestoppt: null, grund: null, ergebnisse, importiertGesamt }
}
