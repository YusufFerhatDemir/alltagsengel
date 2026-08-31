// ═══════════════════════════════════════════════════════════════════════
// Sicherheits- und Audit-System — der Einstieg
// ═══════════════════════════════════════════════════════════════════════
//
// Aufrufstellen benutzen ausschliesslich diese Datei. Sie setzt die drei
// Schritte zusammen, die zu jedem Sicherheitsereignis gehoeren:
//
//   1. schreiben      (lib/security/audit.ts)
//   2. bewerten       (Geraet neu? Anmeldeserie auffaellig?)
//   3. melden         (lib/security/benachrichtigung.ts)
//
// Alles ist fail-soft: keine dieser drei Stufen darf die ausloesende
// Handlung abbrechen. Eine Pflegekraft, die sich wegen eines Fehlers im
// Protokoll nicht anmelden kann, waere ein schlechterer Zustand als eine
// fehlende Protokollzeile.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { logSecurityEvent, type SicherheitsEreignis } from './audit'
import { meldeSicherheitsereignis } from './benachrichtigung'
import { geraeteMerkmale, ipAus } from './geraet'
import { regelFuer, hoechsterSchweregrad, istSchweregrad, type Schweregrad } from './ereignisse'
import { kennzeichen, type Provenienz } from './herkunft'

const log = logger.child('security')

export * from './ereignisse'
export {
  logSecurityEvent, bereinigeMetadaten, VERBOTENE_SCHLUESSEL, organisationFuerKonto,
} from './audit'
export type { SicherheitsEreignis, EreignisErgebnis } from './audit'
export {
  meldeSicherheitsereignis, meldungenAktiv, PRIVILEGIERTE_ROLLEN,
  SPERRFRIST_STUNDEN, MELDE_NACHWEIS, SICHERHEITSMELDUNG_ART,
  baueMeldung, meldetFuer, kontoLage, ergebnisAus,
} from './benachrichtigung'
export type { MeldeKontext, KontoLage } from './benachrichtigung'
export {
  ueberwachungFuer, ueberwachteKonten, leseWatchlist, setzeUeberwachung,
  leereZwischenspeicher,
} from './watchlist'
export type { WatchlistEintrag, WatchlistZeile, WatchlistEingabe } from './watchlist'
export * from './geraet'

// ─────────────────────────────────────────────────────────────────────
// Anmeldeserie
// ─────────────────────────────────────────────────────────────────────

/** Fehlversuche innerhalb des Fensters, ab denen es auffaellig ist. */
export const SERIE_SCHWELLE = 5
export const SERIE_FENSTER_MINUTEN = 15

/**
 * „Ungewoehnliche Login-Serie" aus der Aufgabenstellung.
 *
 * Gezaehlt werden fehlgeschlagene Anmeldungen im Fenster — je Konto UND
 * je IP-Adresse. Beides ist noetig: ein Angriff auf ein einzelnes Konto
 * faellt ueber das Konto auf, ein Durchprobieren vieler Konten von einer
 * Quelle nur ueber die IP.
 *
 * Die Pruefung ist eine AUSWERTUNG, keine Sperre. Gesperrt wird an
 * anderer Stelle (lib/rate-limit-persistent.ts) — dieses Modul stellt
 * fest und meldet, es entscheidet nicht ueber Zugang.
 */
export async function pruefeAnmeldeserie(
  email: string | null,
  ip: string | null,
): Promise<{ auffaellig: boolean; fehlversuche: number; ipFehlversuche: number }> {
  const leer = { auffaellig: false, fehlversuche: 0, ipFehlversuche: 0 }
  try {
    const admin = createAdminClient()
    const seit = new Date(Date.now() - SERIE_FENSTER_MINUTEN * 60_000).toISOString()

    let fehlversuche = 0
    if (email) {
      const { count } = await admin
        .from('security_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'login_failed')
        .eq('user_email', email)
        .gte('created_at', seit)
      fehlversuche = count ?? 0
    }

    let ipFehlversuche = 0
    if (ip) {
      const { count } = await admin
        .from('security_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'login_failed')
        .eq('ip_address', ip)
        .gte('created_at', seit)
      ipFehlversuche = count ?? 0
    }

    return {
      auffaellig: fehlversuche >= SERIE_SCHWELLE || ipFehlversuche >= SERIE_SCHWELLE,
      fehlversuche,
      ipFehlversuche,
    }
  } catch (err) {
    log.errorWithException('Anmeldeserie konnte nicht geprueft werden', err)
    return leer
  }
}

// ─────────────────────────────────────────────────────────────────────
// Der eine Aufruf
// ─────────────────────────────────────────────────────────────────────

export interface ErfassungsErgebnis {
  ereignisId: string | null
  /** Die abgeleitete Herkunft — echt oder nachgestellt. */
  provenienz: Provenienz | null
  geschrieben: boolean
  gemeldet: boolean
  meldeGrund: string
  neuesGeraet: boolean
  geraeteHash: string | null
  organizationId: string | null
  userEmail: string | null
}

export interface ErfassungsOptionen {
  /**
   * Meldung unterdruecken, obwohl der Katalog sie vorsaehe.
   *
   * Genau EIN Anwendungsfall: die Anmeldung auf einem neuen Geraet. Dort
   * traegt `unknown_device` die Meldung — das ist die Nachricht, auf die
   * es ankommt. Ohne diesen Schalter bekaeme die betroffene Person zwei
   * Mails im selben Moment, und die zweite entwertet die erste.
   */
  ohneMeldung?: boolean
}

/**
 * Schreibt ein Sicherheitsereignis und meldet es, wenn die Regeln es
 * verlangen.
 */
export async function erfasseSicherheitsereignis(
  ereignis: SicherheitsEreignis,
  optionen: ErfassungsOptionen = {},
): Promise<ErfassungsErgebnis> {
  const merkmale = geraeteMerkmale(ereignis.request ?? null)
  const ip = ipAus(ereignis.request ?? null)
  const regel = regelFuer(ereignis.eventType)
  const schweregrad: Schweregrad = istSchweregrad(ereignis.severity)
    ? hoechsterSchweregrad(regel.schweregrad, ereignis.severity)
    : regel.schweregrad

  const ergebnis = await logSecurityEvent(ereignis)

  if (optionen.ohneMeldung) {
    return {
      ereignisId: ergebnis.id,
      provenienz: ergebnis.provenienz ?? null,
      geschrieben: ergebnis.ok,
      gemeldet: false,
      meldeGrund: 'Meldung durch Aufrufer unterdrueckt',
      neuesGeraet: ergebnis.neuesGeraet ?? false,
      geraeteHash: ergebnis.geraeteHash ?? null,
      organizationId: ergebnis.organizationId ?? null,
      userEmail: ergebnis.userEmail ?? ereignis.userEmail ?? null,
    }
  }

  const gemeldet = await meldeSicherheitsereignis({
    ereignisId: ergebnis.id,
    eventType: ereignis.eventType,
    severity: schweregrad,
    userId: ereignis.userId ?? null,
    userEmail: ergebnis.userEmail ?? ereignis.userEmail ?? null,
    organizationId: ergebnis.organizationId ?? ereignis.organizationId ?? null,
    ip,
    userAgent: merkmale.userAgent,
    plattform: merkmale.plattform,
    geraet: merkmale.bezeichnung,
    appVersion: merkmale.appVersion,
    browser: typeof merkmale.deviceInfo.browser === 'string' ? merkmale.deviceInfo.browser : null,
    betriebssystem: typeof merkmale.deviceInfo.betriebssystem === 'string'
      ? merkmale.deviceInfo.betriebssystem : null,
    sessionReference: ereignis.sessionReference ?? null,
    zeitpunkt: new Date(),
    metadata: {
      ...(ereignis.metadata ?? {}),
      ...(ergebnis.geraeteHash ? { geraet_hash: ergebnis.geraeteHash } : {}),
      // Die ABGELEITETE Provenienz, nicht die des Aufrufers. Ohne sie
      // stuende in der Mail „HERKUNFT UNBELEGT", obwohl die Zeile in der
      // Datenbank sehr wohl eine traegt — die Meldung muss dasselbe
      // sagen wie die Spur.
      ...(ergebnis.provenienz ? kennzeichen(ergebnis.provenienz) : {}),
    },
  })

  return {
    ereignisId: ergebnis.id,
    provenienz: ergebnis.provenienz ?? null,
    geschrieben: ergebnis.ok,
    gemeldet: gemeldet.gesendet,
    meldeGrund: gemeldet.grund,
    neuesGeraet: ergebnis.neuesGeraet ?? false,
    geraeteHash: ergebnis.geraeteHash ?? null,
    organizationId: ergebnis.organizationId ?? null,
    userEmail: ergebnis.userEmail ?? ereignis.userEmail ?? null,
  }
}

/**
 * Anmeldung — der vollstaendige Vorgang.
 *
 * Ein Aufruf, bis zu drei Ereignisse: die Anmeldung selbst, bei einem
 * neuen Geraet `unknown_device`, bei einer auffaelligen Serie
 * `unusual_login_series`. Jedes steht als eigene Zeile in der Spur.
 *
 * Die Meldung geht bei einem neuen Geraet an `unknown_device`, nicht an
 * `login_success` — eine Nachricht statt zweier zur selben Anmeldung.
 */
export async function erfasseAnmeldung(opts: {
  userId: string | null
  email: string | null
  erfolgreich: boolean
  request?: Request | Headers | Record<string, string | undefined> | null
  sessionReference?: string | null
  metadata?: Record<string, unknown>
}): Promise<ErfassungsErgebnis> {
  const ip = ipAus(opts.request ?? null)
  const geraetePruefung = opts.erfolgreich && !!opts.userId

  // Erster Durchgang OHNE Meldung: ob gemeldet wird, entscheidet sich
  // erst, wenn feststeht, ob das Geraet neu ist.
  const haupt = await erfasseSicherheitsereignis(
    {
      eventType: opts.erfolgreich ? 'login_success' : 'login_failed',
      userId: opts.userId,
      userEmail: opts.email,
      request: opts.request,
      sessionReference: opts.sessionReference,
      metadata: opts.metadata,
      // Bei einem Fehlversuch gibt es kein bestaetigtes Konto, dem sich
      // ein Geraet zuordnen liesse.
      geraetePruefung,
    },
    { ohneMeldung: true },
  )

  if (opts.erfolgreich && opts.userId) {
    if (haupt.neuesGeraet) {
      const merkmale = geraeteMerkmale(opts.request ?? null)
      await erfasseSicherheitsereignis({
        eventType: 'unknown_device',
        userId: opts.userId,
        userEmail: opts.email,
        request: opts.request,
        sessionReference: opts.sessionReference,
        metadata: {
          bezug_ereignis: haupt.ereignisId,
          geraet: merkmale.bezeichnung,
          ...(haupt.geraeteHash ? { geraet_hash: haupt.geraeteHash } : {}),
        },
      })
    } else {
      // Bekanntes Geraet: die Anmeldung selbst wird gemeldet, gebremst
      // durch die Sperrfrist in lib/security/benachrichtigung.ts.
      const merkmale = geraeteMerkmale(opts.request ?? null)
      await meldeSicherheitsereignis({
        ereignisId: haupt.ereignisId,
        eventType: 'login_success',
        severity: 'info',
        userId: opts.userId,
        userEmail: haupt.userEmail ?? opts.email,
        organizationId: haupt.organizationId,
        ip,
        userAgent: merkmale.userAgent,
        plattform: merkmale.plattform,
        geraet: merkmale.bezeichnung,
        appVersion: merkmale.appVersion,
        browser: typeof merkmale.deviceInfo.browser === 'string' ? merkmale.deviceInfo.browser : null,
        betriebssystem: typeof merkmale.deviceInfo.betriebssystem === 'string'
          ? merkmale.deviceInfo.betriebssystem : null,
        sessionReference: opts.sessionReference ?? null,
        zeitpunkt: new Date(),
        metadata: {
          ...(haupt.geraeteHash ? { geraet_hash: haupt.geraeteHash } : {}),
          // Eine Anmeldung, die diesen Weg geht, kam aus einem echten
          // Aufruf — sonst gaebe es keine Geraetemerkmale. Die
          // Provenienz stammt trotzdem aus dem Schreibvorgang und nicht
          // aus dieser Annahme.
          ...(haupt.provenienz ? kennzeichen(haupt.provenienz) : {}),
        },
      })
    }
  }

  if (!opts.erfolgreich) {
    const serie = await pruefeAnmeldeserie(opts.email, ip)
    if (serie.auffaellig) {
      await erfasseSicherheitsereignis({
        eventType: 'unusual_login_series',
        userId: opts.userId,
        userEmail: opts.email,
        request: opts.request,
        metadata: {
          fehlversuche_konto: serie.fehlversuche,
          fehlversuche_ip: serie.ipFehlversuche,
          fenster_minuten: SERIE_FENSTER_MINUTEN,
          schwelle: SERIE_SCHWELLE,
        },
      })
    }
  }

  return haupt
}
