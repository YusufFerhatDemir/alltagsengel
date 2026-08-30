// ═══════════════════════════════════════════════════════════════════════
// Geraete-Merkmale der Sicherheitsspur
// ═══════════════════════════════════════════════════════════════════════
//
// WAS HIER ERHOBEN WIRD
// Ausschliesslich das, was der Browser ohnehin bei jedem Aufruf
// mitschickt: den User-Agent-Header, die vom Reverse-Proxy gesetzte
// IP-Adresse und — falls die native Huelle sie setzt — zwei optionale
// Kopfzeilen fuer Plattform und App-Version.
//
// WAS HIER NICHT ERHOBEN WIRD
//   * MAC-Adressen. Sie sind ueber HTTP nicht erreichbar; iOS und
//     Android geben sie auch nativ seit Jahren nicht mehr heraus.
//     `mac_address` traegt deshalb konstant 'not_available'. Kein
//     Ersatzwert, keine Herleitung, kein Platzhalter, der aussieht wie
//     eine Adresse.
//   * Browser-Fingerprinting. Kein Canvas-Hash, keine Schriftenliste,
//     keine Bildschirmaufloesung, kein WebGL, kein Zeitzonen-Abgleich.
//     Das waere ein zweites Datenschutzproblem als Loesung fuer ein
//     Sicherheitsproblem.
// ═══════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto'

export const MAC_NICHT_VERFUEGBAR = 'not_available' as const

export type Plattform = 'web' | 'ios' | 'android' | 'server' | 'unbekannt'

export interface GeraeteMerkmale {
  plattform: Plattform
  userAgent: string | null
  appVersion: string | null
  /** Wandert unveraendert nach security_audit_log.device_info. */
  deviceInfo: Record<string, unknown>
  /** Kurzform fuer Oberflaeche und Mail, z. B. „Safari auf iPhone". */
  bezeichnung: string
}

interface KopfzeilenLeser {
  get(name: string): string | null
}

/** Nimmt Request, Headers oder ein einfaches Objekt entgegen. */
export function alsKopfzeilen(
  quelle: Request | Headers | Record<string, string | undefined> | null | undefined,
): KopfzeilenLeser {
  if (!quelle) return { get: () => null }
  if (typeof (quelle as Headers).get === 'function') {
    const h = quelle as Headers
    return { get: (n) => h.get(n) }
  }
  if (typeof (quelle as Request).headers === 'object' && (quelle as Request).headers) {
    const h = (quelle as Request).headers
    return { get: (n) => h.get(n) }
  }
  const obj = quelle as Record<string, string | undefined>
  const klein: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) if (v != null) klein[k.toLowerCase()] = v
  return { get: (n) => klein[n.toLowerCase()] ?? null }
}

/**
 * Erste IP aus x-forwarded-for (Vercel/Proxy-Kette), sonst x-real-ip.
 *
 * Gleiche Regel wie lib/audit-log.ts: NIE aus dem Body lesen. Was im
 * Body steht, hat der Client geschrieben.
 */
export function ipAus(quelle: Request | Headers | Record<string, string | undefined> | null | undefined): string | null {
  const h = alsKopfzeilen(quelle)
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const erste = xff.split(',')[0]?.trim()
    if (erste && istIp(erste)) return erste
  }
  const real = h.get('x-real-ip')?.trim()
  if (real && istIp(real)) return real
  return null
}

/**
 * security_audit_log.ip_address ist vom Typ `inet`. Ein Wert, der keine
 * Adresse ist, laesst den INSERT scheitern — und damit ginge das ganze
 * Sicherheitsereignis verloren, weil ein Proxy Unsinn in die Kopfzeile
 * geschrieben hat. Deshalb wird vorher geprueft und im Zweifel NULL
 * geschrieben.
 */
export function istIp(wert: string): boolean {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/
  if (v4.test(wert)) return wert.split('.').every(t => Number(t) <= 255)
  // IPv6 grob, aber ohne Falschpositive auf beliebigem Text.
  return /^[0-9a-fA-F:]+$/.test(wert) && wert.includes(':') && wert.length <= 45
}

const BROWSER: ReadonlyArray<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const SYSTEM: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows NT/, 'Windows'],
  [/Linux/, 'Linux'],
]

function ersterTreffer(ua: string, tabelle: ReadonlyArray<[RegExp, string]>): string | null {
  for (const [muster, name] of tabelle) if (muster.test(ua)) return name
  return null
}

/**
 * Plattform. Kopfzeile schlaegt Heuristik: setzt die native Huelle
 * `x-app-plattform`, gilt dieser Wert. Sonst wird aus dem User-Agent
 * geschlossen — und ein WebView auf einem Mobilgeraet zaehlt als
 * mobile Plattform.
 */
export function plattformAus(ua: string | null, kopfzeile: string | null): Plattform {
  const k = kopfzeile?.trim().toLowerCase()
  if (k === 'ios' || k === 'android' || k === 'web') return k
  if (!ua) return 'unbekannt'
  if (/iPhone|iPad|iPod/.test(ua)) return /Capacitor|Alltagsengel/i.test(ua) || !/Safari/.test(ua) ? 'ios' : 'web'
  if (/Android/.test(ua)) return /Capacitor|Alltagsengel|; wv\)/i.test(ua) ? 'android' : 'web'
  return 'web'
}

/** Merkmale eines Aufrufs. Erhebt nichts, was nicht ohnehin ankommt. */
export function geraeteMerkmale(
  quelle: Request | Headers | Record<string, string | undefined> | null | undefined,
): GeraeteMerkmale {
  const h = alsKopfzeilen(quelle)
  const ua = h.get('user-agent')?.trim() || null
  const plattform = plattformAus(ua, h.get('x-app-plattform') ?? h.get('x-app-platform'))
  const appVersion = h.get('x-app-version')?.trim() || null

  const browser = ua ? ersterTreffer(ua, BROWSER) : null
  const system = ua ? ersterTreffer(ua, SYSTEM) : null

  const bezeichnung = [browser, system].filter(Boolean).join(' auf ') || 'Unbekanntes Gerät'

  return {
    plattform,
    userAgent: ua,
    appVersion,
    deviceInfo: {
      browser: browser ?? 'unbekannt',
      betriebssystem: system ?? 'unbekannt',
      plattform,
      // Ausdruecklich, nicht weggelassen: die Frage „habt ihr die
      // MAC-Adresse?" soll die Antwort in den Daten finden, nicht das
      // Schweigen einer fehlenden Spalte.
      mac_address: MAC_NICHT_VERFUEGBAR,
      ...(appVersion ? { app_version: appVersion } : {}),
    },
    bezeichnung,
  }
}

/**
 * Normalisierter User-Agent fuer den Geraete-Hash.
 *
 * Versionsnummern fliegen raus: sonst gilt jedes Browser-Update als
 * neues Geraet und die Meldung „unbekanntes Geraet" kaeme woechentlich
 * — nach der dritten Mail liest sie niemand mehr.
 */
export function normalisierterUserAgent(ua: string | null): string {
  if (!ua) return 'unbekannt'
  return ua
    .replace(/\d+(\.\d+)+/g, '')  // Versionsnummern
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 300)
}

/**
 * Geraete-Kennung: SHA-256 ueber Konto-ID, Plattform und
 * normalisierten User-Agent.
 *
 * Die Konto-ID geht mit ein, damit derselbe Browser bei zwei Konten
 * zwei verschiedene Kennungen ergibt — der Hash taugt so NICHT zum
 * kontouebergreifenden Wiedererkennen einer Person.
 */
export function geraeteHash(userId: string, plattform: string, ua: string | null): string {
  return createHash('sha256')
    .update(`${userId}|${plattform}|${normalisierterUserAgent(ua)}`)
    .digest('hex')
}
