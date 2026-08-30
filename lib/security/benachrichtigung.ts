// ═══════════════════════════════════════════════════════════════════════
// Sicherheitsmeldungen per E-Mail
// ═══════════════════════════════════════════════════════════════════════
//
// WER BEKOMMT EINE MAIL — zwei Mengen, beide offen nachvollziehbar:
//
//   1. PRIVILEGIERT — jedes Konto mit einer Verwaltungsrolle
//      (superadmin, admin, pdl, qm, buchhaltung). Ergibt sich aus
//      profiles.role, wird nicht gepflegt. Meldesatz: die Ereignisse mit
//      `meldepflichtig: true` im Katalog.
//
//   2. UEBERWACHT — Eintrag in security_watchlist mit aktiv = true
//      (ACCOUNT_SECURITY_ALERTS). Meldesatz: UEBERWACHUNGS_EREIGNISSE —
//      eine OBERMENGE, die zusaetzlich das Alltaegliche mitnimmt (jede
//      Abmeldung, jeder Fehlversuch, jeder App-Start). Und ohne die
//      12-Stunden-Bremse, denn „jede Anmeldung" ist bei einem
//      ueberwachten Konto woertlich gemeint.
//
// Es gibt keine dritte, versteckte Menge und keine Sonderbehandlung
// einzelner Adressen im Code. Wer eine Mail bekommt, laesst sich
// vollstaendig aus profiles.role und security_watchlist herleiten.
//
// ABSENDER
// Immer `Alltagsengel <info@alltagsengel.care>` ueber sendRawEmail()
// (lib/notifications.ts) — die Adresse der eigenen Domain, kein
// persoenlicher Name. Siehe CLAUDE.md, Abschnitt Kundenkommunikation.
//
// WIEDERHOLUNG BEI FEHLSCHLAG
// Jeder Versand traegt einen Zustellkontext (Vorgangsart
// 'sicherheitsmeldung', Vorgangsbezug = die Ereignis-ID). Scheitert er,
// steht er in notification_delivery_log und der Wiederholungslauf
// (alle 5 Minuten) baut die Mail aus der Ereigniszeile neu auf —
// lib/notifications/vorgaenge/sicherheitsmeldung.ts. Ohne diesen
// Eintrag waere eine an einem Provider-Ausfall gescheiterte
// Sicherheitsmeldung endgueltig verloren.
//
// KEINE GEHEIMNISSE IN DER MAIL
// Der Inhalt entsteht ausschliesslich aus der Ereigniszeile, und die ist
// bereits gefiltert (lib/security/audit.ts, VERBOTENE_SCHLUESSEL).
// Zusaetzlich wird jeder Wert HTML-escaped: ein User-Agent ist ein Wert
// von aussen.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { logger } from '@/lib/logger'
import {
  regelFuer, ueberwachungspflichtig,
  BEZEICHNUNG_SCHWEREGRAD, type Schweregrad,
} from './ereignisse'
import { ueberwachungFuer, type WatchlistEintrag } from './watchlist'

const log = logger.child('security-meldung')

/** Ereignistyp des Versandnachweises (siehe ereignisse.ts). */
export const MELDE_NACHWEIS = 'security_notification_sent' as const

/** Vorgangsart fuer den Wiederholungslauf. */
export const SICHERHEITSMELDUNG_ART = 'sicherheitsmeldung' as const

/** Rollen, die ohne Eintrag in der Ueberwachungsliste gemeldet werden. */
export const PRIVILEGIERTE_ROLLEN: readonly string[] = [
  'superadmin', 'admin', 'pdl', 'qm', 'buchhaltung',
]

/** Stille Zeit fuer nicht-kritische Meldungen. */
export const SPERRFRIST_STUNDEN = 12

/**
 * Ereignisse, die als FEHLGESCHLAGEN gelten. Alles andere ist
 * erfolgreich — das Ereignis wurde ja aufgezeichnet, WEIL es
 * stattgefunden hat.
 */
const FEHLGESCHLAGEN: readonly string[] = [
  'login_failed', 'mfa_challenge_failed', 'blocked_action',
  'security_error', 'unusual_login_series', 'rate_limit_exceeded',
]

/**
 * Hauptschalter. Ohne gesetzten Wert sind die Meldungen AN — ein
 * Sicherheitssystem, das standardmaessig schweigt, ist keines. Zum
 * Abschalten `SECURITY_MAIL_AKTIV=0` setzen; ohne RESEND_API_KEY geht
 * ohnehin keine Mail raus (sendRawEmail meldet dann `uebersprungen`).
 */
export function meldungenAktiv(): boolean {
  const wert = process.env.SECURITY_MAIL_AKTIV?.trim().toLowerCase()
  return !(wert === '0' || wert === 'false' || wert === 'aus')
}

/**
 * Zusaetzliches Sicherheitspostfach. Bekommt JEDE ausgeloeste Meldung
 * zusaetzlich zum betroffenen Konto. Leer ⇒ keine Zweitzustellung.
 */
export function sicherheitsPostfach(): string | null {
  const wert = process.env.SECURITY_MELDE_POSTFACH?.trim()
  return wert && wert.includes('@') ? wert : null
}

export interface MeldeKontext {
  ereignisId: string | null
  eventType: string
  severity: Schweregrad
  userId: string | null
  userEmail: string | null
  organizationId: string | null
  ip: string | null
  userAgent: string | null
  plattform: string | null
  geraet: string | null
  zeitpunkt: Date
  metadata?: Record<string, unknown>
  /** Aus dem Profil, sofern vorhanden. Sonst wird es nachgeschlagen. */
  benutzerName?: string | null
  rolle?: string | null
  appVersion?: string | null
  browser?: string | null
  betriebssystem?: string | null
  sessionReference?: string | null
}

export interface MeldeErgebnis {
  gesendet: boolean
  grund: string
  empfaenger: string[]
}

type AdminClient = ReturnType<typeof createAdminClient>

// ─────────────────────────────────────────────────────────────────────
// Empfaenger
// ─────────────────────────────────────────────────────────────────────

export interface KontoLage {
  privilegiert: boolean
  ueberwachung: WatchlistEintrag | null
  kontoEmail: string | null
  name: string | null
  rolle: string | null
}

export async function kontoLage(admin: AdminClient, userId: string): Promise<KontoLage> {
  const lage: KontoLage = {
    privilegiert: false, ueberwachung: null,
    kontoEmail: null, name: null, rolle: null,
  }

  const { data: profil } = await admin
    .from('profiles')
    .select('role, first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle()

  if (profil) {
    lage.rolle = (profil.role as string) ?? null
    lage.privilegiert = PRIVILEGIERTE_ROLLEN.includes(lage.rolle ?? '')
    const name = [profil.first_name, profil.last_name].filter(Boolean).join(' ').trim()
    lage.name = name || null
    lage.kontoEmail = (profil.email as string) || null
  }

  lage.ueberwachung = await ueberwachungFuer(admin, userId)

  // profiles.email kann bei Altbestand leer sein; die Auth-Adresse ist
  // die verlaessliche.
  if (!lage.kontoEmail) {
    const { data: konto } = await admin.auth.admin.getUserById(userId)
    lage.kontoEmail = konto?.user?.email ?? null
  }

  return lage
}

/**
 * Die Entscheidung: meldet dieses Ereignis fuer dieses Konto?
 *
 * Ausdruecklich als eigene, reine Funktion — sie ist der Kern der
 * Meldekonfiguration und laesst sich so ohne Datenbank pruefen.
 */
export function meldetFuer(
  eventType: string,
  lage: Pick<KontoLage, 'privilegiert' | 'ueberwachung'>,
): { melden: boolean; grund: string } {
  // Ein Versandnachweis darf nie selbst eine Meldung ausloesen — sonst
  // schriebe jede Mail eine Zeile, die die naechste Mail ausloest.
  if (eventType === MELDE_NACHWEIS) {
    return { melden: false, grund: 'Versandnachweis meldet nicht' }
  }

  const ueberwacht = !!lage.ueberwachung?.aktiv

  if (ueberwacht && lage.ueberwachung!.alleEreignisse) {
    if (ueberwachungspflichtig(eventType)) {
      return { melden: true, grund: 'Konto ueberwacht (voller Meldesatz)' }
    }
    return { melden: false, grund: 'Ereignis nicht im Ueberwachungssatz' }
  }

  const regel = regelFuer(eventType)
  if (!regel.meldepflichtig) {
    return { melden: false, grund: 'Ereignistyp ist nicht meldepflichtig' }
  }
  if (ueberwacht) return { melden: true, grund: 'Konto ueberwacht (Katalogsatz)' }
  if (lage.privilegiert) return { melden: true, grund: 'Konto privilegiert' }
  return { melden: false, grund: 'Konto ist weder privilegiert noch ueberwacht' }
}

// ─────────────────────────────────────────────────────────────────────
// Stille Zeit
// ─────────────────────────────────────────────────────────────────────

/**
 * Wurde in der Sperrfrist schon dasselbe gemeldet?
 *
 * Gefragt wird die Spur selbst — es gibt keine zweite Tabelle, die den
 * Versand mitschreibt und mit der Wirklichkeit auseinanderlaufen kann.
 */
export async function inSperrfrist(
  admin: AdminClient,
  userId: string,
  eventType: string,
  geraeteHash: string | null,
): Promise<boolean> {
  try {
    const seit = new Date(Date.now() - SPERRFRIST_STUNDEN * 3600_000).toISOString()
    let abfrage = admin
      .from('security_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', MELDE_NACHWEIS)
      .eq('metadata->>bezug_event_type', eventType)
      .gte('created_at', seit)

    if (geraeteHash) abfrage = abfrage.eq('metadata->>geraet_hash', geraeteHash)

    const { count } = await abfrage
    return (count ?? 0) > 0
  } catch (err) {
    // Fehler in der Bremse duerfen keine Meldung verhindern: im Zweifel
    // lieber eine Mail zu viel als eine zu wenig.
    log.errorWithException('Sperrfrist-Pruefung fehlgeschlagen', err, { userId, eventType })
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mailinhalt
// ─────────────────────────────────────────────────────────────────────

function zeile(bezeichnung: string, wert: string | null | undefined): string {
  if (wert === null || wert === undefined || wert === '') return ''
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;vertical-align:top">${esc(bezeichnung)}</td>
    <td style="padding:6px 0;font-size:13px;color:#111;word-break:break-word">${esc(wert)}</td>
  </tr>`
}

const FARBE: Record<Schweregrad, string> = {
  info: '#2D8F5E', warning: '#C9963C', critical: '#C0392B',
}

/** SUCCESS/FAILED. `metadata.ergebnis` gewinnt, sonst der Ereignistyp. */
export function ergebnisAus(k: MeldeKontext): 'SUCCESS' | 'FAILED' {
  const aus = k.metadata?.ergebnis
  if (aus === 'FAILED' || aus === 'SUCCESS') return aus
  return FEHLGESCHLAGEN.includes(k.eventType) ? 'FAILED' : 'SUCCESS'
}

/** Betroffene Funktion/Seite, sofern der Aufrufer sie mitgegeben hat. */
function funktionAus(k: MeldeKontext): string | null {
  for (const feld of ['funktion', 'pfad', 'gegenstand', 'weg']) {
    const wert = k.metadata?.[feld]
    if (typeof wert === 'string' && wert.trim()) return wert.trim()
  }
  return null
}

function wertPaar(k: MeldeKontext): { vorher: string | null; nachher: string | null } {
  const alsText = (w: unknown): string | null => {
    if (w === null || w === undefined) return null
    if (typeof w === 'string') return w
    return JSON.stringify(w)
  }
  return {
    vorher: alsText(k.metadata?.vorher ?? k.metadata?.alte_rolle ?? k.metadata?.alter_wert),
    nachher: alsText(k.metadata?.nachher ?? k.metadata?.neue_rolle ?? k.metadata?.neuer_wert),
  }
}

export function baueMeldung(
  k: MeldeKontext,
  organisationsName: string | null,
): { betreff: string; html: string; text: string } {
  const regel = regelFuer(k.eventType)
  const utc = k.zeitpunkt.toISOString()
  const lokal = k.zeitpunkt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'medium',
  })
  const kanal = k.plattform === 'ios' || k.plattform === 'android'
    ? `App (${k.plattform})`
    : k.plattform === 'web' ? 'Web' : (k.plattform ?? 'unbekannt')
  const ergebnis = ergebnisAus(k)
  const funktion = funktionAus(k)
  const { vorher, nachher } = wertPaar(k)

  const betreff = `Sicherheitshinweis: ${regel.bezeichnung}`
    + (k.benutzerName ? ` — ${k.benutzerName}` : '')
    + (ergebnis === 'FAILED' ? ' (FEHLGESCHLAGEN)' : '')

  const zeilen = [
    zeile('Benutzername', k.benutzerName),
    zeile('Benutzerkonto', k.userEmail),
    zeile('Benutzer-ID', k.userId),
    zeile('Rolle', k.rolle),
    '<tr><td colspan="2" style="padding:8px 0 2px;border-top:1px solid #eee"></td></tr>',
    zeile('Ereignis', `${regel.bezeichnung} (${k.eventType})`),
    zeile('Ergebnis', ergebnis),
    zeile('Schweregrad', BEZEICHNUNG_SCHWEREGRAD[k.severity]),
    zeile('Zeit (UTC)', utc),
    zeile('Zeit (lokal)', lokal),
    zeile('Betroffene Funktion', funktion),
    zeile('Vorheriger Wert', vorher),
    zeile('Neuer Wert', nachher),
    '<tr><td colspan="2" style="padding:8px 0 2px;border-top:1px solid #eee"></td></tr>',
    zeile('Zugang', kanal),
    zeile('App-/Web-Version', k.appVersion),
    zeile('Browser', k.browser),
    zeile('Betriebssystem', k.betriebssystem),
    zeile('Gerät', k.geraet),
    zeile('User-Agent', k.userAgent),
    zeile('IP-Adresse', k.ip),
    '<tr><td colspan="2" style="padding:8px 0 2px;border-top:1px solid #eee"></td></tr>',
    zeile('Organisation', organisationsName ?? k.organizationId),
    zeile('Sitzungsbezug', k.sessionReference),
    zeile('Audit-Event-ID', k.ereignisId),
  ].filter(Boolean).join('')

  const html = `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
    <div style="background:${FARBE[k.severity]};color:#fff;padding:16px 20px;font-size:15px;font-weight:600">
      ${esc(regel.bezeichnung)} · ${esc(BEZEICHNUNG_SCHWEREGRAD[k.severity])} · ${esc(ergebnis)}
    </div>
    <div style="padding:20px">
      <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.5">
        an einem überwachten Alltagsengel-Konto wurde ein sicherheitsrelevantes
        Ereignis aufgezeichnet. War das nicht erwartbar, sperren Sie das Konto
        und setzen Sie das Passwort zurück.
      </p>
      <table style="width:100%;border-collapse:collapse">${zeilen}</table>
      <p style="margin:16px 0 0;font-size:12px;color:#888;line-height:1.5">
        Automatisch erzeugt, weil dieses Konto als privilegiert oder überwacht
        geführt wird. Enthält bewusst keine Passwörter, Tokens oder
        Sitzungsschlüssel. Die MAC-Adresse des Geräts liegt nicht vor und wird
        nicht erhoben.
      </p>
    </div>
    <div style="padding:14px 20px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#888">
      Herzliche Grüße<br />Ihr Team von Alltagsengel
    </div>
  </div>
</body></html>`

  const zeileT = (b: string, w: string | null | undefined) =>
    (w ? `${(b + ':').padEnd(22)}${w}\n` : '')
  const text =
    `Sicherheitshinweis: ${regel.bezeichnung} (${BEZEICHNUNG_SCHWEREGRAD[k.severity]}, ${ergebnis})\n\n`
    + 'an einem überwachten Alltagsengel-Konto wurde ein sicherheitsrelevantes\n'
    + 'Ereignis aufgezeichnet. War das nicht erwartbar, sperren Sie das Konto\n'
    + 'und setzen Sie das Passwort zurück.\n\n'
    + zeileT('Benutzername', k.benutzerName ?? null)
    + zeileT('Benutzerkonto', k.userEmail)
    + zeileT('Benutzer-ID', k.userId)
    + zeileT('Rolle', k.rolle ?? null)
    + zeileT('Ereignis', `${regel.bezeichnung} (${k.eventType})`)
    + zeileT('Ergebnis', ergebnis)
    + zeileT('Zeit (UTC)', utc)
    + zeileT('Zeit (lokal)', lokal)
    + zeileT('Funktion', funktion)
    + zeileT('Vorheriger Wert', vorher)
    + zeileT('Neuer Wert', nachher)
    + zeileT('Zugang', kanal)
    + zeileT('App-/Web-Version', k.appVersion ?? null)
    + zeileT('Browser', k.browser ?? null)
    + zeileT('Betriebssystem', k.betriebssystem ?? null)
    + zeileT('Gerät', k.geraet)
    + zeileT('User-Agent', k.userAgent)
    + zeileT('IP-Adresse', k.ip)
    + zeileT('Organisation', organisationsName ?? k.organizationId)
    + zeileT('Sitzungsbezug', k.sessionReference ?? null)
    + zeileT('Audit-Event-ID', k.ereignisId)
    + '\nHerzliche Grüße\nIhr Team von Alltagsengel\n'

  return { betreff, html, text }
}

// ─────────────────────────────────────────────────────────────────────
// Versand
// ─────────────────────────────────────────────────────────────────────

/**
 * Prueft die Regeln und versendet — oder sagt, warum nicht.
 *
 * Fail-soft: ein Fehlschlag beim Versand darf die ausloesende Handlung
 * nie abbrechen. Er wird protokolliert UND landet ueber den
 * Zustellkontext im Wiederholungslauf.
 */
export async function meldeSicherheitsereignis(k: MeldeKontext): Promise<MeldeErgebnis> {
  const nichts = (grund: string): MeldeErgebnis => ({ gesendet: false, grund, empfaenger: [] })

  try {
    if (!meldungenAktiv()) return nichts('SECURITY_MAIL_AKTIV=0')
    if (!k.userId) return nichts('Kein Konto — kein Empfaenger')

    const admin = createAdminClient()
    const lage = await kontoLage(admin, k.userId)

    const entscheidung = meldetFuer(k.eventType, lage)
    if (!entscheidung.melden) return nichts(entscheidung.grund)

    const geraeteHash = typeof k.metadata?.geraet_hash === 'string'
      ? (k.metadata.geraet_hash as string)
      : null

    // Die Sperrfrist entfaellt fuer kritische Ereignisse und fuer
    // ausdruecklich ueberwachte Konten — dort ist „jede Anmeldung"
    // woertlich gemeint.
    const bremseGilt = k.severity !== 'critical' && !lage.ueberwachung?.ohneSperrfrist
    if (bremseGilt && await inSperrfrist(admin, k.userId, k.eventType, geraeteHash)) {
      return nichts(`Sperrfrist (${SPERRFRIST_STUNDEN} h) laeuft noch`)
    }

    const empfaenger = [...new Set(
      [
        lage.ueberwachung?.meldeEmail ?? lage.kontoEmail ?? k.userEmail,
        sicherheitsPostfach(),
      ].filter((e): e is string => !!e && e.includes('@')),
    )]
    if (empfaenger.length === 0) return nichts('Keine Empfaengeradresse bekannt')

    let orgName: string | null = null
    if (k.organizationId) {
      const { data } = await admin
        .from('organizations')
        .select('name')
        .eq('id', k.organizationId)
        .maybeSingle()
      orgName = (data?.name as string | null) ?? null
    }

    const angereichert: MeldeKontext = {
      ...k,
      benutzerName: k.benutzerName ?? lage.name,
      rolle: k.rolle ?? lage.rolle,
      userEmail: k.userEmail ?? lage.kontoEmail,
    }

    const { betreff, html, text } = baueMeldung(angereichert, orgName)

    const gesendet: string[] = []
    for (const adresse of empfaenger) {
      const ergebnis = await sendRawEmail({
        to: adresse,
        subject: betreff,
        html,
        text,
        // Ereignis-ID als Idempotenzschluessel: ein Wiederholungslauf
        // erzeugt keine zweite Mail zu demselben Ereignis.
        ...(k.ereignisId ? { idempotenzSchluessel: `sec-${k.ereignisId}-${adresse}` } : {}),
        // Zustellspur + Wiederholungslauf. Ohne Organisation gibt es
        // keinen Mandanten, unter dem der Vorgang stehen koennte — dann
        // bleibt nur der Sofortversuch (dokumentiert in
        // docs/security/AUDIT_SYSTEM.md).
        ...(k.organizationId && k.ereignisId
          ? {
              zustellung: {
                organizationId: k.organizationId,
                vorgangArt: SICHERHEITSMELDUNG_ART,
                vorgangRef: k.ereignisId,
                vorgangEmpfaenger: k.userId,
              },
            }
          : {}),
      })
      if (ergebnis.ok) gesendet.push(adresse)
      else log.error('Sicherheitsmeldung nicht zugestellt', {
        grund: ergebnis.grund, eventType: k.eventType,
      })
    }

    if (gesendet.length === 0) return nichts('Versand fehlgeschlagen')

    // Der Versand bekommt eine EIGENE Zeile statt eines Vermerks an der
    // ausloesenden. Zwei Gruende: die Tabelle ist unveraenderlich (der
    // Trigger in der Migration laesst kein UPDATE zu), und die Meldung
    // ist ein eigener Vorgang — wer spaeter fragt „ist jemand informiert
    // worden?", soll das an einer Zeile ablesen und nicht an einem Feld
    // im Vorfall.
    await admin.from('security_audit_log').insert({
      user_id: k.userId,
      user_email: angereichert.userEmail,
      organization_id: k.organizationId,
      event_type: MELDE_NACHWEIS,
      event_category: 'security',
      severity: 'info',
      platform: k.plattform,
      metadata: {
        bezug_ereignis: k.ereignisId,
        bezug_event_type: k.eventType,
        empfaenger_anzahl: gesendet.length,
        melde_grund: entscheidung.grund,
        ...(geraeteHash ? { geraet_hash: geraeteHash } : {}),
      },
    })

    return { gesendet: true, grund: entscheidung.grund, empfaenger: gesendet }
  } catch (err) {
    log.errorWithException('Sicherheitsmeldung fehlgeschlagen', err, { eventType: k.eventType })
    return nichts('Unerwarteter Fehler')
  }
}
