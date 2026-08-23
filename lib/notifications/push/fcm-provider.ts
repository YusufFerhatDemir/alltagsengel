// ═══════════════════════════════════════════════════════════════════════
// FCM — Provider fuer den nativen Push-Kanal
// ═══════════════════════════════════════════════════════════════════════
//
// Spricht die FCM HTTP v1 API direkt an (REST + OAuth2 ueber
// google-auth-library). Das firebase-admin-SDK kommt bewusst NICHT zum
// Einsatz: es bringt gRPC und einen eigenen Prozess-Zustand mit, was in
// einer Serverless-Funktion jeden Kaltstart verteuert, ohne dass hier
// mehr als "eine Nachricht an einen Token" gebraucht wird.
// google-auth-library ist ohnehin schon Abhaengigkeit (lib/fcm.ts).
//
// DREI ARTEN VON FEHLSCHLAG, DIE HIER AUSEINANDERGEHALTEN WERDEN
//
//   1. Keine Zugangsdaten  → uebersprungen. Kein Fehlversuch, der Vorgang
//      bleibt offen und wird wiederholt, sobald der Schluessel da ist.
//   2. Voruebergehend (429, 5xx, Netz) → Wiederholung mit wachsender
//      Wartezeit; danach Fehlversuch.
//   3. Token endgueltig unerreichbar → Token loeschen, NICHT wiederholen.
//
// WARUM INVALID_ARGUMENT NICHT PAUSCHAL ALS TOTER TOKEN GILT
// Der bestehende Weg (lib/fcm.ts) loescht den Token, sobald irgendwo im
// Fehlertext 'INVALID_ARGUMENT' steht. FCM meldet damit aber auch eine
// fehlerhafte NUTZLAST — etwa einen Nicht-String im data-Block. Eine
// solche Panne wuerde dort reihum jeden Token im Bestand loeschen und den
// Kanal dauerhaft leerraeumen, obwohl kein einziges Geraet weg ist.
// Hier zaehlt INVALID_ARGUMENT nur dann als toter Token, wenn FCM die
// Beanstandung ausdruecklich auf das Feld `message.token` bezieht.
// ═══════════════════════════════════════════════════════════════════════

import { GoogleAuth } from 'google-auth-library'
import { logger } from '@/lib/logger'
import { entwerteToken, tokenKuerzel } from './token-store'
import type { PushNachricht, PushVersuch } from './typen'

const log = logger.child('push:fcm')

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const BASIS_URL = 'https://fcm.googleapis.com/v1/projects'

/** Hoechstzahl an Anlaeufen JE GERAET innerhalb eines Sendevorgangs. */
export const FCM_MAX_ANLAEUFE = 3
/** Wartezeit vor dem naechsten Anlauf (ms). Tests setzen sie auf 0. */
const WARTEZEIT_MS = [250, 1000] as const

// ───────────────────────────────────────────────────────────────────────
// Zugangsdaten
// ───────────────────────────────────────────────────────────────────────

export interface FcmZugang {
  clientEmail: string
  privateKey: string
  projectId: string
}

/**
 * Liest die Zugangsdaten aus der Umgebung.
 *
 * Zwei Schreibweisen werden unterstuetzt, weil beide in der Praxis
 * vorkommen: der komplette Service-Account als JSON in EINER Variable
 * (so vergibt die Firebase-Konsole ihn) und die drei Einzelwerte (so
 * liegt er heute in lib/fcm.ts). Der JSON-Weg gewinnt, wenn beides
 * gesetzt ist — er ist der vollstaendigere.
 *
 * `null` heisst: nicht konfiguriert. Das ist KEIN Fehler, sondern der
 * erwartete Zustand, solange der Schluessel nicht hinterlegt ist.
 */
export function leseZugang(env: NodeJS.ProcessEnv = process.env): FcmZugang | null {
  const roh = env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
  if (roh) {
    try {
      // Manche Hoster erlauben keine Zeilenumbrueche in Variablen; dann
      // liegt der Schluessel base64-kodiert vor.
      const text = roh.startsWith('{') ? roh : Buffer.from(roh, 'base64').toString('utf8')
      const j = JSON.parse(text) as Record<string, unknown>
      const clientEmail = typeof j.client_email === 'string' ? j.client_email : ''
      const privateKey = typeof j.private_key === 'string' ? j.private_key : ''
      const projectId =
        (typeof j.project_id === 'string' ? j.project_id : '') || env.FCM_PROJECT_ID || ''
      if (clientEmail && privateKey && projectId) {
        return { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n'), projectId }
      }
      log.warn('FIREBASE_SERVICE_ACCOUNT_KEY unvollstaendig — Einzelwerte werden geprueft')
    } catch {
      log.warn('FIREBASE_SERVICE_ACCOUNT_KEY ist kein lesbares JSON')
    }
  }

  const clientEmail = env.FCM_CLIENT_EMAIL?.trim()
  const privateKey = env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const projectId = env.FCM_PROJECT_ID?.trim() || 'alltagsengel-2bbe9'
  if (!clientEmail || !privateKey) return null
  return { clientEmail, privateKey, projectId }
}

/** Ist der Kanal ueberhaupt sendebereit? */
export function fcmKonfiguriert(env: NodeJS.ProcessEnv = process.env): boolean {
  return leseZugang(env) !== null
}

// Der OAuth2-Client wird ueber Aufrufe hinweg gehalten; das Token selbst
// verwaltet google-auth-library samt Ablauf. Der Cache haengt an der
// Kennung des Dienstkontos — aendert sich der Schluessel, wird er neu
// aufgebaut statt still mit dem alten weiterzulaufen.
let zwischenspeicher: { schluessel: string; auth: GoogleAuth } | null = null

async function holeAccessToken(zugang: FcmZugang): Promise<string | null> {
  const schluessel = `${zugang.projectId}:${zugang.clientEmail}`
  try {
    if (!zwischenspeicher || zwischenspeicher.schluessel !== schluessel) {
      zwischenspeicher = {
        schluessel,
        auth: new GoogleAuth({
          credentials: {
            client_email: zugang.clientEmail,
            private_key: zugang.privateKey,
          },
          projectId: zugang.projectId,
          scopes: [FCM_SCOPE],
        }),
      }
    }
    const client = await zwischenspeicher.auth.getClient()
    const antwort = await client.getAccessToken()
    return antwort?.token ?? null
  } catch (err) {
    log.errorWithException('FCM: Zugangstoken nicht erhaeltlich', err)
    zwischenspeicher = null
    return null
  }
}

/** Nur fuer Tests: erzwingt einen frischen OAuth-Client. */
export function _leereZugangsCache(): void {
  zwischenspeicher = null
}

// ───────────────────────────────────────────────────────────────────────
// Fehlerdeutung
// ───────────────────────────────────────────────────────────────────────

/** Endgueltig unerreichbare Geraete — Token loeschen, nicht wiederholen. */
const TOTE_ZUSTAENDE = new Set(['UNREGISTERED', 'NOT_FOUND', 'SENDER_ID_MISMATCH'])

export interface FcmFehlerdeutung {
  tokenTot: boolean
  wiederholbar: boolean
  text: string
}

/**
 * Deutet eine FCM-Fehlerantwort.
 *
 * Ausgewertet wird der strukturierte Teil der Antwort, nicht der rohe
 * Text: `error.status`, `error.details[].errorCode` und, nur fuer
 * INVALID_ARGUMENT, `details[].fieldViolations[].field`.
 */
export function deuteFcmFehler(status: number, koerper: string): FcmFehlerdeutung {
  let zustand = ''
  let errorCode = ''
  let tokenFeldBeanstandet = false
  let meldung = ''

  try {
    const j = JSON.parse(koerper) as {
      error?: {
        status?: string
        message?: string
        details?: Array<{
          errorCode?: string
          fieldViolations?: Array<{ field?: string }>
        }>
      }
    }
    zustand = j.error?.status ?? ''
    meldung = j.error?.message ?? ''
    for (const d of j.error?.details ?? []) {
      if (d.errorCode) errorCode = d.errorCode
      for (const v of d.fieldViolations ?? []) {
        if (typeof v.field === 'string' && /(^|\.)token$/.test(v.field)) {
          tokenFeldBeanstandet = true
        }
      }
    }
  } catch {
    /* Kein JSON — dann entscheidet allein der HTTP-Status. */
  }

  const text = meldung || `FCM antwortete mit ${status}`

  const tokenTot =
    status === 404 ||
    TOTE_ZUSTAENDE.has(zustand) ||
    TOTE_ZUSTAENDE.has(errorCode) ||
    // Siehe Kopfkommentar: nur mit ausdruecklichem Bezug auf das Token.
    ((zustand === 'INVALID_ARGUMENT' || errorCode === 'INVALID_ARGUMENT') &&
      tokenFeldBeanstandet)

  const wiederholbar = !tokenTot && (status === 429 || status >= 500)

  return { tokenTot, wiederholbar, text }
}

// ───────────────────────────────────────────────────────────────────────
// Senden
// ───────────────────────────────────────────────────────────────────────

function baueNachricht(token: string, n: PushNachricht) {
  const url = n.url || '/'
  const tag = n.tag || 'default'
  return {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      android: {
        priority: 'HIGH',
        notification: {
          icon: n.icon || 'ic_notification',
          tag,
          sound: 'default',
          channel_id: 'alltagsengel_default',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', 'thread-id': tag } },
      },
      webpush: {
        notification: { icon: n.icon || '/icon-192x192.png', tag },
        fcm_options: {
          link: url.startsWith('http') ? url : `https://alltagsengel.care${url}`,
        },
      },
      // FCM nimmt im data-Block ausschliesslich Strings entgegen.
      data: {
        title: n.title,
        body: n.body,
        url,
        tag,
        ...Object.fromEntries(
          Object.entries(n.data ?? {}).map(([k, v]) => [k, String(v)])
        ),
      },
    },
  }
}

export interface SendeOptionen {
  /** Ueberschreibt die Wartezeiten (Tests: 0). */
  wartezeitMs?: number
  maxAnlaeufe?: number
  /** Ungueltige Token nicht loeschen (Trockenlauf). */
  ohneTokenRotation?: boolean
  env?: NodeJS.ProcessEnv
}

async function warte(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise(r => setTimeout(r, ms))
}

/**
 * Sendet EINE Nachricht an EIN Geraet.
 *
 * Der Rueckgabewert trennt die drei Fehlschlagarten aus dem
 * Kopfkommentar; der Aufrufer entscheidet daraus, ob der Vorgang offen
 * bleibt, wiederholt wird oder erledigt ist.
 */
export async function sendPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  optionen: SendeOptionen & Partial<PushNachricht> = {}
): Promise<PushVersuch> {
  const env = optionen.env ?? process.env
  const zugang = leseZugang(env)
  if (!zugang) {
    log.info('FCM nicht konfiguriert — Push uebersprungen')
    return { ok: false, uebersprungen: true, fehler: 'FCM-Zugangsdaten fehlen' }
  }

  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, fehler: 'Kein Geraete-Token' }
  }

  const accessToken = await holeAccessToken(zugang)
  if (!accessToken) {
    // Zugangsdaten sind da, lassen sich aber nicht einloesen (falscher
    // Schluessel, Uhr schief, Google nicht erreichbar). Das ist ein
    // echter Fehlversuch, kein Ueberspringen — sonst faellt ein kaputter
    // Schluessel nie auf.
    return { ok: false, fehler: 'FCM-Zugangstoken nicht erhaeltlich' }
  }

  const nutzlast = baueNachricht(token.trim(), {
    title,
    body,
    data,
    url: optionen.url,
    tag: optionen.tag,
    icon: optionen.icon,
  })

  const maxAnlaeufe = optionen.maxAnlaeufe ?? FCM_MAX_ANLAEUFE
  let letzterFehler: unknown = 'FCM: kein Versuch ausgefuehrt'

  for (let anlauf = 1; anlauf <= maxAnlaeufe; anlauf++) {
    let antwort: Response
    try {
      antwort = await fetch(`${BASIS_URL}/${zugang.projectId}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nutzlast),
      })
    } catch (err) {
      // Netzfehler sind immer voruebergehend.
      letzterFehler = err
      if (anlauf < maxAnlaeufe) {
        await warte(optionen.wartezeitMs ?? WARTEZEIT_MS[Math.min(anlauf - 1, WARTEZEIT_MS.length - 1)])
        continue
      }
      return { ok: false, fehler: err }
    }

    if (antwort.ok) {
      let messageId: string | null = null
      try {
        const j = (await antwort.json()) as { name?: string }
        messageId = j.name ?? null
      } catch {
        /* FCM antwortet normalerweise mit {name}. Fehlt es, ist der
           Versand trotzdem raus — der Status sagt es. */
      }
      return { ok: true, messageId }
    }

    const koerper = await antwort.text().catch(() => '')
    const deutung = deuteFcmFehler(antwort.status, koerper)
    letzterFehler = deutung.text

    if (deutung.tokenTot) {
      log.info('FCM: Geraet endgueltig unerreichbar', {
        tokenKuerzel: tokenKuerzel(token),
        responseStatus: antwort.status,
      })
      if (!optionen.ohneTokenRotation) {
        await entwerteToken(token, deutung.text)
      }
      return { ok: false, tokenUngueltig: true, fehler: deutung.text }
    }

    if (!deutung.wiederholbar || anlauf === maxAnlaeufe) {
      log.warn('FCM: Versand fehlgeschlagen', {
        responseStatus: antwort.status,
        anlauf,
        wiederholbar: deutung.wiederholbar,
      })
      return { ok: false, fehler: deutung.text }
    }

    await warte(
      optionen.wartezeitMs ?? WARTEZEIT_MS[Math.min(anlauf - 1, WARTEZEIT_MS.length - 1)]
    )
  }

  return { ok: false, fehler: letzterFehler }
}
