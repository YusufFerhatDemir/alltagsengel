// ═══════════════════════════════════════════════════════════════
// Transport-Layer: Übertragung verschlüsselter EDIFACT-Dateien an
// die Datenannahmestellen der Krankenkassen (DAVASO, BITMARCK,
// AOK-RZ, GKVNet/ITSG …).
//
// Aktuell: SFTP (ssh2-sftp-client). Ab Dez 2026: KIM.
// Pro Übertragung gehören zusammen:
//   - Nutzdatendatei  (SECON-verschlüsseltes EDIFACT)
//   - Auftragsdatei   (unverschlüsselt, Steuerinformationen nach
//                      Anlage 3 "Auftragsdatei" der Techn. Anlagen)
//
// Nur serverseitig verwenden (API-Routen, Node runtime).
// ═══════════════════════════════════════════════════════════════

import SftpClient from 'ssh2-sftp-client'

export interface TransportConfig {
  /** Name der Datenannahmestelle (z. B. 'DAVASO', 'BITMARCK', 'AOK-RZ') */
  datenannahmestelle: string
  sftp_host: string
  sftp_port: number
  sftp_user: string
  /** SSH Private Key (PEM) — bevorzugt. Alternativ sftp_passwort. */
  sftp_key?: Buffer
  sftp_passwort?: string
  /** Zielverzeichnis für Uploads (Standard: '/upload') */
  sftp_verzeichnis?: string
  /** Verzeichnis, in dem Antworten/Fehlerprotokolle liegen (Standard: '/download') */
  antwort_verzeichnis?: string
}

export interface SendeErgebnis {
  erfolg: boolean
  protokoll: string
}

const VERBINDUNGS_TIMEOUT_MS = 20_000

function sftpVerbindungsOptionen(config: TransportConfig): SftpClient.ConnectOptions {
  const opts: SftpClient.ConnectOptions = {
    host: config.sftp_host,
    port: config.sftp_port || 22,
    username: config.sftp_user,
    readyTimeout: VERBINDUNGS_TIMEOUT_MS,
    // Datenannahmestellen nutzen teils ältere Kex-/Cipher-Sets — Defaults
    // von ssh2 decken das ab; hier bewusst nichts einschränken.
  }
  if (config.sftp_key && config.sftp_key.length > 0) {
    opts.privateKey = config.sftp_key
  } else if (config.sftp_passwort) {
    opts.password = config.sftp_passwort
  } else {
    throw new Error(
      `SFTP ${config.datenannahmestelle}: weder SSH-Key noch Passwort konfiguriert`
    )
  }
  return opts
}

function zeitstempel(): string {
  return new Date().toISOString()
}

/**
 * Sendet Nutzdaten- und Auftragsdatei per SFTP an die Datenannahmestelle.
 * Konvention: Dateiname der Auftragsdatei = Nutzdatendatei + '.AUF'
 * (falls kein eigener Name übergeben wird).
 */
export async function sendePerSFTP(
  edifact_verschluesselt: Buffer,
  auftragsdatei: Buffer,
  config: TransportConfig,
  dateinamen?: { nutzdaten: string; auftrag?: string }
): Promise<SendeErgebnis> {
  const protokoll: string[] = []
  const sftp = new SftpClient()
  const zielVerzeichnis = (config.sftp_verzeichnis || '/upload').replace(/\/+$/, '')
  const nutzdatenName = dateinamen?.nutzdaten || `TSOL${Date.now()}`
  const auftragName = dateinamen?.auftrag || `${nutzdatenName}.AUF`

  try {
    protokoll.push(`[${zeitstempel()}] Verbinde zu ${config.sftp_host}:${config.sftp_port} (${config.datenannahmestelle})`)
    await sftp.connect(sftpVerbindungsOptionen(config))
    protokoll.push(`[${zeitstempel()}] Verbunden als ${config.sftp_user}`)

    // Zielverzeichnis prüfen/anlegen
    const existiert = await sftp.exists(zielVerzeichnis)
    if (!existiert) {
      await sftp.mkdir(zielVerzeichnis, true)
      protokoll.push(`[${zeitstempel()}] Verzeichnis ${zielVerzeichnis} angelegt`)
    }

    // WICHTIG: erst Nutzdaten, dann Auftragsdatei — viele Annahmestellen
    // starten die Verarbeitung, sobald die Auftragsdatei eintrifft.
    const nutzdatenPfad = `${zielVerzeichnis}/${nutzdatenName}`
    await sftp.put(edifact_verschluesselt, nutzdatenPfad)
    protokoll.push(`[${zeitstempel()}] Nutzdaten hochgeladen: ${nutzdatenPfad} (${edifact_verschluesselt.length} Bytes)`)

    const auftragPfad = `${zielVerzeichnis}/${auftragName}`
    await sftp.put(auftragsdatei, auftragPfad)
    protokoll.push(`[${zeitstempel()}] Auftragsdatei hochgeladen: ${auftragPfad} (${auftragsdatei.length} Bytes)`)

    // Upload verifizieren
    const stat = await sftp.stat(nutzdatenPfad)
    if (stat.size !== edifact_verschluesselt.length) {
      protokoll.push(`[${zeitstempel()}] WARNUNG: Größe auf Server (${stat.size}) ≠ lokal (${edifact_verschluesselt.length})`)
      return { erfolg: false, protokoll: protokoll.join('\n') }
    }
    protokoll.push(`[${zeitstempel()}] Übertragung erfolgreich abgeschlossen`)
    return { erfolg: true, protokoll: protokoll.join('\n') }
  } catch (e: any) {
    protokoll.push(`[${zeitstempel()}] FEHLER: ${e?.message || e}`)
    return { erfolg: false, protokoll: protokoll.join('\n') }
  } finally {
    await sftp.end().catch(() => {})
  }
}

/**
 * Prüft das Antwort-Verzeichnis der Datenannahmestelle auf neue Dateien
 * (Verarbeitungsbestätigungen, Fehlerprotokolle) und lädt sie herunter.
 * Die Dateien bleiben auf dem Server liegen (kein Löschen ohne Freigabe).
 */
export async function pruefeAntworten(
  config: TransportConfig
): Promise<Array<{ dateiname: string; inhalt: Buffer }>> {
  const sftp = new SftpClient()
  const verzeichnis = (config.antwort_verzeichnis || '/download').replace(/\/+$/, '')
  const ergebnisse: Array<{ dateiname: string; inhalt: Buffer }> = []

  try {
    await sftp.connect(sftpVerbindungsOptionen(config))
    const existiert = await sftp.exists(verzeichnis)
    if (!existiert) return []

    const eintraege = await sftp.list(verzeichnis)
    for (const eintrag of eintraege) {
      if (eintrag.type !== '-') continue // nur reguläre Dateien
      const pfad = `${verzeichnis}/${eintrag.name}`
      const inhalt = (await sftp.get(pfad)) as Buffer
      ergebnisse.push({ dateiname: eintrag.name, inhalt: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })
    }
    return ergebnisse
  } finally {
    await sftp.end().catch(() => {})
  }
}

/**
 * Verbindungstest ohne Datenübertragung (für den "Verbindung testen"-
 * Button im Admin): Verbinden, Verzeichnis listen, trennen.
 */
export async function testeVerbindung(config: TransportConfig): Promise<SendeErgebnis> {
  const protokoll: string[] = []
  const sftp = new SftpClient()
  try {
    protokoll.push(`[${zeitstempel()}] Teste ${config.datenannahmestelle} — ${config.sftp_host}:${config.sftp_port}`)
    await sftp.connect(sftpVerbindungsOptionen(config))
    protokoll.push(`[${zeitstempel()}] Login als ${config.sftp_user} erfolgreich`)
    const cwd = await sftp.cwd()
    protokoll.push(`[${zeitstempel()}] Arbeitsverzeichnis: ${cwd}`)
    const ziel = config.sftp_verzeichnis || '/'
    const existiert = await sftp.exists(ziel)
    protokoll.push(`[${zeitstempel()}] Zielverzeichnis ${ziel}: ${existiert ? 'vorhanden' : 'NICHT vorhanden'}`)
    return { erfolg: true, protokoll: protokoll.join('\n') }
  } catch (e: any) {
    protokoll.push(`[${zeitstempel()}] FEHLER: ${e?.message || e}`)
    return { erfolg: false, protokoll: protokoll.join('\n') }
  } finally {
    await sftp.end().catch(() => {})
  }
}

/**
 * Zukünftig: Übertragung per KIM (Kommunikation im Medizinwesen).
 * Pflicht für den Datenaustausch mit den Kassen voraussichtlich ab
 * Dezember 2026 — benötigt KIM-Clientmodul + Telematik-Anbindung.
 */
export async function sendePerKIM(
  _edifact_verschluesselt: Buffer,
  kim_adresse: string
): Promise<{ erfolg: boolean }> {
  throw new Error(
    `KIM-Übertragung an ${kim_adresse} ist noch nicht implementiert ` +
    '(geplant zur KIM-Pflicht ab Dezember 2026 — benötigt KIM-Clientmodul/Telematikinfrastruktur)'
  )
}
