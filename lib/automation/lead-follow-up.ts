/**
 * Kette 13 — Lead-Follow-up: kein Lead wird tagelang vergessen.
 *
 * WAS SIE PRÜFT
 *   1. Kunden-Warteliste (`state_waitlist`), offene Stufen
 *   2. Bewerbungen (`lead_inquiries`, BEWERBUNG_FILTER), offene Stufen
 *   3. Kundenanfragen (`lead_inquiries`, art='anfrage'), Status new bzw.
 *      mit gesetzter Wiedervorlage
 * Leiter aus lib/leads/follow-up.ts: 24 h Erinnerung, 48 h Eskalation,
 * 72 h Dringend — ab Eingang für NEU, ab Wiedervorlage für spätere Stufen.
 *
 * BEFUND BEI EINFÜHRUNG (11.09.2026, live gezählt): 31 Bewerbungen und
 * 12 Kundenanfragen standen seit mehr als 72 h auf `new`. Niemand wurde
 * daran erinnert — es gab keinen Weg, der das hätte tun können.
 *
 * WAS SIE TUT
 *   - In-App-Meldung (Glocke im Admin) an admin/superadmin, EINE je Tag
 *     und Empfänger, mit Zählung je Stufe und Link auf die gefilterte Liste
 *   - bei mindestens einer Eskalation/Dringend zusätzlich eine E-Mail an
 *     dieselben Empfänger (intern; Absender „Alltagsengel")
 *
 * EMPFÄNGER: bewusst NUR admin/superadmin, nicht BETRIEBS_EMPFAENGER_ROLLEN.
 * Warteliste und Bewerbungen liegen in BEREICHE auf `marketing.verwalten`
 * (NUR_ADMINISTRATION) — eine PDL bekäme eine Meldung, deren Link sie
 * nicht öffnen darf.
 *
 * KEIN VERSAND NACH AUSSEN. Die Kette schreibt keinen Lead an; ob und wie
 * nachgefasst wird, entscheidet ein Mensch in der Verwaltung.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification, sendEmailNotification } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { BEWERBUNG_FILTER } from '@/lib/admin/ops'
import {
  followUpSeitEingang, followUpSeitWiedervorlage, tagAlsZeitpunkt, zaehleFollowUps, berlinerTagPlus,
  type FollowUpStufe, type FollowUpZaehlung,
} from '@/lib/leads/follow-up'
import { stufeAusDbWert, WARTELISTE_STUFEN } from '@/lib/warteliste/katalog'
import { followUpFuer } from '@/lib/warteliste/prioritaet'
import { stufeFuerBewerbung, followUpFuerBewerbung } from '@/lib/bewerbung/pipeline'
import { rollentraegerDerOrg } from './org-empfaenger'
import { logger } from '@/lib/logger'

const log = logger.child('lead-follow-up')

export const LEAD_FOLLOW_UP_ROLLEN = ['admin', 'superadmin']

/** Kennung der In-App-Meldung — daran hängt der Tages-Dublettenschutz. */
export const LEAD_FOLLOW_UP_ART = 'lead_follow_up'

/** DB-Werte der Warteliste, die noch Arbeit brauchen. */
const WARTELISTE_OFFEN_DB = WARTELISTE_STUFEN
  .filter(s => ['neu', 'kontaktiert', 'termin', 'warteliste'].includes(s.key))
  .map(s => s.dbWert)

export interface LeadFollowUpErgebnis {
  warteliste: FollowUpZaehlung
  bewerbungen: FollowUpZaehlung
  anfragen: FollowUpZaehlung
  gesamt: FollowUpZaehlung
  empfaenger: number
  benachrichtigt: number
  perEmail: number
  bereitsHeute: number
  fehler: string[]
}

function summe(...z: FollowUpZaehlung[]): FollowUpZaehlung {
  return z.reduce(
    (a, b) => ({
      erinnerung: a.erinnerung + b.erinnerung,
      eskalation: a.eskalation + b.eskalation,
      dringend: a.dringend + b.dringend,
      gesamt: a.gesamt + b.gesamt,
    }),
    { erinnerung: 0, eskalation: 0, dringend: 0, gesamt: 0 },
  )
}

/**
 * Zählt — rein lesend. Getrennt von `erinnereAnLeadFollowUps`, damit
 * Tests und Diagnose die Zählung ohne Versand abrufen können.
 */
export async function zaehleLeadFollowUps(
  supabase: SupabaseClient,
  organizationId: string,
  jetzt: Date = new Date(),
): Promise<{ warteliste: FollowUpZaehlung; bewerbungen: FollowUpZaehlung; anfragen: FollowUpZaehlung; fehler: string[] }> {
  const fehler: string[] = []

  // ── 1. Warteliste ──────────────────────────────────────────────────
  const wl: FollowUpStufe[] = []
  {
    const { data, error } = await supabase
      .from('state_waitlist')
      .select('id, status, created_at, updated_at')
      .eq('organization_id', organizationId)
      .in('status', WARTELISTE_OFFEN_DB)
    if (error) fehler.push(`state_waitlist: ${error.message}`)
    for (const z of data ?? []) {
      wl.push(followUpFuer({ stufe: stufeAusDbWert(z.status), created_at: z.created_at, updated_at: z.updated_at }, jetzt))
    }
  }

  // ── 2. Bewerbungen ─────────────────────────────────────────────────
  const bw: FollowUpStufe[] = []
  {
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select('id, status, created_at, updated_at, follow_up_date, bewerbung_daten')
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .in('status', ['new', 'contacted', 'qualified'])
    if (error) fehler.push(`lead_inquiries (Bewerbungen): ${error.message}`)
    for (const z of data ?? []) {
      const { stufe } = stufeFuerBewerbung(z.bewerbung_daten, z.status)
      bw.push(followUpFuerBewerbung({
        stufe, created_at: z.created_at, updated_at: z.updated_at, follow_up_date: z.follow_up_date,
      }, jetzt))
    }
  }

  // ── 3. Kundenanfragen ──────────────────────────────────────────────
  // `source='engel-bewerbung'` steht bei den Altbeständen mit art='anfrage'
  // (Default) — das sind Bewerbungen und oben schon gezählt.
  const an: FollowUpStufe[] = []
  {
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select('id, status, created_at, follow_up_date, source')
      .eq('organization_id', organizationId)
      .eq('art', 'anfrage')
      .neq('source', 'engel-bewerbung')
      .in('status', ['new', 'contacted', 'qualified'])
    if (error) fehler.push(`lead_inquiries (Anfragen): ${error.message}`)
    for (const z of data ?? []) {
      if (z.status === 'new') an.push(followUpSeitEingang(z.created_at, jetzt))
      else an.push(followUpSeitWiedervorlage(tagAlsZeitpunkt(z.follow_up_date), jetzt))
    }
  }

  return {
    warteliste: zaehleFollowUps(wl),
    bewerbungen: zaehleFollowUps(bw),
    anfragen: zaehleFollowUps(an),
    fehler,
  }
}

async function heuteSchonGemeldet(supabase: SupabaseClient, userId: string, tag: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'reminder')
    .eq('data->>art', LEAD_FOLLOW_UP_ART)
    .eq('data->>tag', tag)
    .limit(1)
  // Fail-closed Richtung „nicht doppelt": lässt sich die Spur nicht lesen,
  // wird heute nicht erneut gemeldet — morgen läuft die Kette wieder, und
  // die Admin-Seiten zeigen die Lage ohnehin live.
  if (error) {
    log.warn(`Dublettenpruefung nicht moeglich (${error.message}) — Meldung ausgelassen.`)
    return true
  }
  return (data?.length ?? 0) > 0
}

function zeile(titel: string, z: FollowUpZaehlung): string {
  if (z.gesamt === 0) return `${titel}: nichts offen`
  const teile = [
    z.dringend ? `${z.dringend} dringend (>72 h)` : null,
    z.eskalation ? `${z.eskalation} eskaliert (>48 h)` : null,
    z.erinnerung ? `${z.erinnerung} Erinnerung (>24 h)` : null,
  ].filter(Boolean)
  return `${titel}: ${teile.join(', ')}`
}

/**
 * Ziel des Links: der Posteingang, gefiltert auf die dringendste Farbe.
 *
 * Vorher zeigte die Meldung in EINE der drei Fachlisten — wer drei rote
 * Bewerbungen und zwei rote Anfragen hatte, sah nach dem Klick nur die
 * eine Hälfte. /admin/posteingang führt alle drei Quellen zusammen.
 */
function linkFuer(gesamt: FollowUpZaehlung): string {
  if (gesamt.dringend > 0) return '/admin/posteingang?ampel=rot'
  if (gesamt.eskalation > 0) return '/admin/posteingang?ampel=orange'
  if (gesamt.erinnerung > 0) return '/admin/posteingang?ampel=gelb'
  return '/admin/posteingang'
}

export async function erinnereAnLeadFollowUps(
  supabase: SupabaseClient,
  organizationId: string,
  jetzt: Date = new Date(),
): Promise<LeadFollowUpErgebnis> {
  const gezaehlt = await zaehleLeadFollowUps(supabase, organizationId, jetzt)
  const gesamt = summe(gezaehlt.warteliste, gezaehlt.bewerbungen, gezaehlt.anfragen)
  const ergebnis: LeadFollowUpErgebnis = {
    ...gezaehlt,
    gesamt,
    empfaenger: 0,
    benachrichtigt: 0,
    perEmail: 0,
    bereitsHeute: 0,
  }

  if (gesamt.gesamt === 0) return ergebnis

  const empfaenger = await rollentraegerDerOrg(supabase, organizationId, LEAD_FOLLOW_UP_ROLLEN)
  ergebnis.empfaenger = empfaenger.length
  if (empfaenger.length === 0) {
    ergebnis.fehler.push('Keine Empfaenger mit Rolle admin/superadmin in der Organisation.')
    return ergebnis
  }

  const tag = berlinerTagPlus(jetzt, 0)
  const eskaliert = gesamt.eskalation + gesamt.dringend > 0
  const titel = gesamt.dringend > 0
    ? `Dringend: ${gesamt.dringend} Lead(s) seit über 72 h unbearbeitet`
    : gesamt.eskalation > 0
      ? `Eskalation: ${gesamt.eskalation} Lead(s) seit über 48 h unbearbeitet`
      : `Erinnerung: ${gesamt.erinnerung} Lead(s) seit über 24 h unbearbeitet`
  const zeilen = [
    zeile('Warteliste', gezaehlt.warteliste),
    zeile('Bewerbungen', gezaehlt.bewerbungen),
    zeile('Kundenanfragen', gezaehlt.anfragen),
  ]
  const link = linkFuer(gesamt)

  // E-Mail-Adressen nur holen, wenn eskaliert wird.
  const emails = new Map<string, { email: string; name: string }>()
  if (eskaliert) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('id', empfaenger)
    if (error) ergebnis.fehler.push(`profiles: ${error.message}`)
    for (const p of data ?? []) {
      if (p.email) {
        emails.set(p.id, {
          email: p.email,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Verwaltung',
        })
      }
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

  for (const userId of empfaenger) {
    if (await heuteSchonGemeldet(supabase, userId, tag)) {
      ergebnis.bereitsHeute++
      continue
    }
    const ok = await createNotification(supabase, {
      userId,
      type: 'reminder',
      title: titel,
      body: zeilen.join(' · '),
      link,
      data: {
        art: LEAD_FOLLOW_UP_ART,
        tag,
        warteliste: gezaehlt.warteliste,
        bewerbungen: gezaehlt.bewerbungen,
        anfragen: gezaehlt.anfragen,
      },
    })
    if (!ok) {
      ergebnis.fehler.push(`In-App-Meldung an ${userId} fehlgeschlagen`)
      continue
    }
    ergebnis.benachrichtigt++

    const ziel = emails.get(userId)
    if (eskaliert && ziel) {
      try {
        const gesendet = await sendEmailNotification(
          ziel.email,
          esc(ziel.name),
          `[Alltagsengel] ${titel}`,
          `
            <p style="font-size:16px;font-weight:600;color:#D04B3B;margin-bottom:6px;">${esc(titel)}</p>
            <ul style="padding-left:20px;font-size:14px;color:#333;">
              ${zeilen.map(z => `<li style="margin-bottom:6px;">${esc(z)}</li>`).join('')}
            </ul>
            <p style="font-size:14px;">Bitte die betroffenen Leads heute bearbeiten oder eine neue Wiedervorlage setzen.</p>
            <a href="${siteUrl}${link}"
               style="display:inline-block;padding:12px 26px;background:#C9963C;color:#1A1612;
                      text-decoration:none;border-radius:10px;font-weight:600;margin:12px 0;">
              ZUR LISTE
            </a>
          `,
        )
        if (gesendet) ergebnis.perEmail++
      } catch (err) {
        log.errorWithException('Eskalations-E-Mail fehlgeschlagen', err)
        ergebnis.fehler.push(`E-Mail an ${userId} fehlgeschlagen`)
      }
    }
  }

  return ergebnis
}
