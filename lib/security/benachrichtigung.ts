// ═══════════════════════════════════════════════════════════════════════
// Sicherheitsmeldungen per E-Mail
// ═══════════════════════════════════════════════════════════════════════
//
// WER BEKOMMT EINE MAIL
// Zwei Mengen, beide offen nachvollziehbar (siehe security_watchlist in
// der Migration):
//   1. PRIVILEGIERT — jedes Konto mit einer Verwaltungsrolle
//      (superadmin, admin, pdl, qm, buchhaltung). Ergibt sich aus
//      profiles.role, wird nicht gepflegt.
//   2. UEBERWACHT — jedes Konto in security_watchlist mit aktiv = true.
//
// Es gibt keine dritte, versteckte Menge und keine Sonderbehandlung
// einzelner Adressen. Wer eine Mail bekommt, laesst sich vollstaendig
// aus profiles.role und security_watchlist herleiten.
//
// WELCHE EREIGNISSE
// Genau die, die in lib/security/ereignisse.ts `meldepflichtig: true`
// tragen. Nichts anderes loest eine Mail aus.
//
// ABSENDER
// Immer `Alltagsengel <info@alltagsengel.care>` ueber sendRawEmail()
// (lib/notifications.ts) — die Adresse der eigenen Domain, kein
// persoenlicher Name, kein Freemail-Konto. Siehe CLAUDE.md, Abschnitt
// Kundenkommunikation.
//
// WARUM ES EINE STILLE ZEIT GIBT
// „Neue Anmeldung" ist meldepflichtig. Ohne Bremse bekaeme eine
// Verwaltungskraft, die sich dreimal taeglich anmeldet, drei Mails
// taeglich — und liest nach einer Woche keine mehr. Deshalb: pro Konto,
// Ereignistyp und Geraet hoechstens eine Meldung in SPERRFRIST_STUNDEN.
// Ereignisse mit Schweregrad 'critical' umgehen die Bremse; eine
// Rollenaenderung darf nie unterdrueckt werden.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { logger } from '@/lib/logger'
import { regelFuer, BEZEICHNUNG_SCHWEREGRAD, type Schweregrad } from './ereignisse'

const log = logger.child('security-meldung')

/** Ereignistyp des Versandnachweises (siehe ereignisse.ts). */
export const MELDE_NACHWEIS = 'security_notification_sent' as const

/** Rollen, die ohne Eintrag in der Ueberwachungsliste gemeldet werden. */
export const PRIVILEGIERTE_ROLLEN: readonly string[] = [
  'superadmin', 'admin', 'pdl', 'qm', 'buchhaltung',
]

/** Stille Zeit fuer nicht-kritische Meldungen. */
export const SPERRFRIST_STUNDEN = 12

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

interface KontoLage {
  privilegiert: boolean
  ueberwacht: boolean
  kontoEmail: string | null
  meldeEmail: string | null
  rolle: string | null
}

export async function kontoLage(admin: AdminClient, userId: string): Promise<KontoLage> {
  const lage: KontoLage = {
    privilegiert: false, ueberwacht: false,
    kontoEmail: null, meldeEmail: null, rolle: null,
  }

  const { data: profil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (profil?.role) {
    lage.rolle = profil.role as string
    lage.privilegiert = PRIVILEGIERTE_ROLLEN.includes(profil.role as string)
  }

  const { data: eintrag } = await admin
    .from('security_watchlist')
    .select('aktiv, melde_email')
    .eq('user_id', userId)
    .maybeSingle()
  if (eintrag?.aktiv) {
    lage.ueberwacht = true
    lage.meldeEmail = (eintrag.melde_email as string | null) ?? null
  }

  const { data: konto } = await admin.auth.admin.getUserById(userId)
  lage.kontoEmail = konto?.user?.email ?? null

  return lage
}

// ─────────────────────────────────────────────────────────────────────
// Stille Zeit
// ─────────────────────────────────────────────────────────────────────

/**
 * Wurde in der Sperrfrist schon dasselbe gemeldet?
 *
 * Gefragt wird die Spur selbst — es gibt keine zweite Tabelle, die den
 * Versand mitschreibt und mit der Wirklichkeit auseinanderlaufen kann.
 * Der Versand haengt am Metadaten-Merkmal `meldung_gesendet`.
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

function zeile(bezeichnung: string, wert: string | null): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;vertical-align:top">${esc(bezeichnung)}</td>
    <td style="padding:6px 0;font-size:13px;color:#111;word-break:break-word">${esc(wert && wert.trim() ? wert : '—')}</td>
  </tr>`
}

const FARBE: Record<Schweregrad, string> = {
  info: '#2D8F5E', warning: '#C9963C', critical: '#C0392B',
}

export function baueMeldung(
  k: MeldeKontext,
  organisationsName: string | null,
): { betreff: string; html: string; text: string } {
  const regel = regelFuer(k.eventType)
  const zeitpunkt = k.zeitpunkt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'medium',
  })
  const kanal = k.plattform === 'ios' || k.plattform === 'android'
    ? `App (${k.plattform})`
    : k.plattform === 'web' ? 'Web' : (k.plattform ?? 'unbekannt')

  const betreff = `Sicherheitshinweis: ${regel.bezeichnung}`

  const html = `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
    <div style="background:${FARBE[k.severity]};color:#fff;padding:16px 20px;font-size:15px;font-weight:600">
      ${esc(regel.bezeichnung)} · ${esc(BEZEICHNUNG_SCHWEREGRAD[k.severity])}
    </div>
    <div style="padding:20px">
      <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.5">
        an Ihrem Alltagsengel-Konto wurde ein sicherheitsrelevantes Ereignis
        aufgezeichnet. Wenn Sie das selbst waren, ist nichts zu tun.
        Andernfalls ändern Sie bitte umgehend Ihr Passwort und melden Sie
        sich bei der Administration.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;padding-top:8px">
        ${zeile('Benutzerkonto', k.userEmail)}
        ${zeile('Ereignis', `${regel.bezeichnung} (${k.eventType})`)}
        ${zeile('Datum / Uhrzeit', zeitpunkt)}
        ${zeile('Zugang', kanal)}
        ${zeile('IP-Adresse', k.ip)}
        ${zeile('Gerät', k.geraet)}
        ${zeile('User-Agent', k.userAgent)}
        ${zeile('Organisation', organisationsName ?? k.organizationId)}
        ${zeile('Ereignis-ID', k.ereignisId)}
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#888;line-height:1.5">
        Diese Nachricht wird automatisch erzeugt, weil Ihr Konto als
        privilegiert oder überwacht geführt wird. Sie enthält bewusst
        keine Passwörter, Tokens oder Sitzungsdaten. Die MAC-Adresse des
        Geräts liegt nicht vor und wird nicht erhoben.
      </p>
    </div>
    <div style="padding:14px 20px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#888">
      Herzliche Grüße<br />Ihr Team von Alltagsengel
    </div>
  </div>
</body></html>`

  const text = [
    `Sicherheitshinweis: ${regel.bezeichnung} (${BEZEICHNUNG_SCHWEREGRAD[k.severity]})`,
    '',
    'an Ihrem Alltagsengel-Konto wurde ein sicherheitsrelevantes Ereignis aufgezeichnet.',
    'Wenn Sie das selbst waren, ist nichts zu tun. Andernfalls ändern Sie bitte',
    'umgehend Ihr Passwort und melden Sie sich bei der Administration.',
    '',
    `Benutzerkonto:   ${k.userEmail ?? '—'}`,
    `Ereignis:        ${regel.bezeichnung} (${k.eventType})`,
    `Datum / Uhrzeit: ${zeitpunkt}`,
    `Zugang:          ${kanal}`,
    `IP-Adresse:      ${k.ip ?? '—'}`,
    `Gerät:           ${k.geraet ?? '—'}`,
    `User-Agent:      ${k.userAgent ?? '—'}`,
    `Organisation:    ${organisationsName ?? k.organizationId ?? '—'}`,
    `Ereignis-ID:     ${k.ereignisId ?? '—'}`,
    '',
    'Herzliche Grüße',
    'Ihr Team von Alltagsengel',
  ].join('\n')

  return { betreff, html, text }
}

// ─────────────────────────────────────────────────────────────────────
// Versand
// ─────────────────────────────────────────────────────────────────────

/**
 * Prueft die Regeln und versendet — oder sagt, warum nicht.
 *
 * Fail-soft: ein Fehlschlag beim Versand darf die ausloesende Handlung
 * nie abbrechen. Er wird protokolliert.
 */
export async function meldeSicherheitsereignis(k: MeldeKontext): Promise<MeldeErgebnis> {
  const nichts = (grund: string): MeldeErgebnis => ({ gesendet: false, grund, empfaenger: [] })

  try {
    if (!meldungenAktiv()) return nichts('SECURITY_MAIL_AKTIV=0')

    const regel = regelFuer(k.eventType)
    if (!regel.meldepflichtig) return nichts('Ereignistyp ist nicht meldepflichtig')
    if (!k.userId) return nichts('Kein Konto — kein Empfaenger')

    const admin = createAdminClient()
    const lage = await kontoLage(admin, k.userId)
    if (!lage.privilegiert && !lage.ueberwacht) {
      return nichts('Konto ist weder privilegiert noch ueberwacht')
    }

    const geraeteHash = typeof k.metadata?.geraet_hash === 'string'
      ? (k.metadata.geraet_hash as string)
      : null

    if (k.severity !== 'critical' && await inSperrfrist(admin, k.userId, k.eventType, geraeteHash)) {
      return nichts(`Sperrfrist (${SPERRFRIST_STUNDEN} h) laeuft noch`)
    }

    const empfaenger = [...new Set(
      [lage.meldeEmail ?? lage.kontoEmail ?? k.userEmail, sicherheitsPostfach()]
        .filter((e): e is string => !!e && e.includes('@')),
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

    const { betreff, html, text } = baueMeldung(k, orgName)

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
    // ist ein eigener Vorgang — wer spaeter fragt „ist jemand
    // informiert worden?", soll das an einer Zeile ablesen und nicht an
    // einem Feld im Vorfall.
    await admin.from('security_audit_log').insert({
      user_id: k.userId,
      user_email: k.userEmail,
      organization_id: k.organizationId,
      event_type: MELDE_NACHWEIS,
      event_category: 'security',
      severity: 'info',
      platform: k.plattform,
      metadata: {
        bezug_ereignis: k.ereignisId,
        bezug_event_type: k.eventType,
        empfaenger_anzahl: gesendet.length,
        ...(geraeteHash ? { geraet_hash: geraeteHash } : {}),
      },
    })

    return { gesendet: true, grund: 'versendet', empfaenger: gesendet }
  } catch (err) {
    log.errorWithException('Sicherheitsmeldung fehlgeschlagen', err, { eventType: k.eventType })
    return nichts('Unerwarteter Fehler')
  }
}
