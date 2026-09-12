/**
 * Priority Inbox — alle offenen Leads aus DREI Quellen in EINER Liste.
 *
 * WOZU
 * Warteliste (`state_waitlist`), Bewerbungen und Kundenanfragen (beide
 * `lead_inquiries`) liegen in drei Ansichten. Wer morgens wissen will, was
 * heute liegen bleibt, musste drei Seiten öffnen und selbst vergleichen.
 * Am 11.09.2026 lagen 32 Bewerbungen und 12 Anfragen über 72 h auf „neu" —
 * sichtbar war das nirgends an einer Stelle.
 *
 * AMPEL — dieselbe Leiter wie überall (lib/leads/follow-up.ts):
 *   ROT    dringend     > 72 h ohne Bearbeitung bzw. Wiedervorlage weit überfällig
 *   ORANGE eskaliert    > 48 h
 *   GELB   Erinnerung   > 24 h
 *   GRÜN   im Zeitplan
 *
 * Rein rechnend: kein Datenbank- und kein Browserzugriff. Die Seite
 * (app/admin/posteingang) reicht die gelesenen Zeilen herein, die Tests
 * dieselbe Form.
 */

import {
  FOLLOW_UP_META, followUpSeitEingang, followUpSeitWiedervorlage, stundenSeit,
  tagAlsZeitpunkt, zaehleFollowUps, type FollowUpStufe, type FollowUpZaehlung,
} from './follow-up'
import { stufeAusDbWert, wartelisteStufeMeta, WARTELISTE_OFFEN } from '@/lib/warteliste/katalog'
import { berechnePrioritaet, followUpFuer, wiedervorlageFuer, type WartelisteLead } from '@/lib/warteliste/prioritaet'
import {
  BEWERBER_ENDZUSTAENDE, bewerberStufe, followUpFuerBewerbung, stufeFuerBewerbung,
  wiedervorlageFuerBewerbung,
} from '@/lib/bewerbung/pipeline'

export type Ampel = 'schwarz' | 'rot' | 'orange' | 'gelb' | 'gruen'

export const AMPEL_META: Record<Ampel, { label: string; color: string; rang: number }> = {
  schwarz: { label: 'Verschleppt', color: '#7B1E14', rang: 4 },
  rot: { label: 'Dringend', color: '#D04B3B', rang: 3 },
  orange: { label: 'Eskaliert', color: '#FF7043', rang: 2 },
  gelb: { label: 'Erinnerung', color: '#E8A000', rang: 1 },
  gruen: { label: 'Im Zeitplan', color: '#5CB882', rang: 0 },
}

export function ampelFuer(stufe: FollowUpStufe): Ampel {
  if (stufe === 'verschleppt') return 'schwarz'
  if (stufe === 'dringend') return 'rot'
  if (stufe === 'eskalation') return 'orange'
  if (stufe === 'erinnerung') return 'gelb'
  return 'gruen'
}

export type LeadArt = 'warteliste' | 'bewerbung' | 'anfrage'

export const ART_META: Record<LeadArt, { label: string; ziel: string }> = {
  warteliste: { label: 'Warteliste', ziel: '/admin/waitlist' },
  bewerbung: { label: 'Bewerbung', ziel: '/admin/applications' },
  anfrage: { label: 'Kundenanfrage', ziel: '/mis/crm' },
}

export interface PosteingangEintrag {
  id: string
  art: LeadArt
  name: string
  kontakt: string | null
  /** Beschriftung der Bearbeitungsstufe in der jeweiligen Quelle. */
  stufe: string
  stufeLabel: string
  stufeFarbe: string
  eingang: string | null
  /** Letzte Bearbeitung, falls die Quelle sie führt. */
  zuletzt: string | null
  /** Nächste Wiedervorlage als ISO-Zeitpunkt; `null` bei NEU oder Endzustand. */
  wiedervorlage: string | null
  followUp: FollowUpStufe
  ampel: Ampel
  /** Stunden seit Eingang — Tiebreak und Anzeige. */
  stundenOffen: number
  /** Nur Warteliste: Priorität aus lib/warteliste/prioritaet.ts. */
  punkte: number
  /** Kurzhinweis, woran es hängt. */
  hinweis: string
  ziel: string
  /** Herkunft (`state_waitlist.quelle` bzw. `lead_inquiries.source`) — trägt die Kennzahlen „Rückrufe" und „Termine". */
  quelle: string | null
}

// ── Rohformen, wie die Seite sie liest ────────────────────────────────
export interface RohWarteliste extends Omit<WartelisteLead, 'stufe'> {
  /** Feine Stufe, falls die Seite sie schon übersetzt hat — sonst aus `status`. */
  stufe?: string
  name?: string | null
  email?: string | null
  telefon?: string | null
  status?: string | null
}

export interface RohLead {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  status?: string | null
  art?: string | null
  source?: string | null
  created_at: string | null
  updated_at?: string | null
  follow_up_date?: string | null
  bewerbung_daten?: unknown
}

function kontaktAus(email?: string | null, telefon?: string | null): string | null {
  return (email?.trim() || telefon?.trim()) ?? null
}

function stunden(iso: string | null, jetzt: Date): number {
  return Math.max(0, Math.floor(stundenSeit(iso, jetzt) ?? 0))
}

/** Wartelisteneintrag → Posteingangszeile. Endzustände fallen weg. */
export function ausWarteliste(z: RohWarteliste, jetzt: Date): PosteingangEintrag | null {
  const stufe = z.stufe ?? stufeAusDbWert(z.status)
  if (!WARTELISTE_OFFEN.includes(stufe)) return null
  const lead: WartelisteLead = { ...z, stufe }
  const followUp = followUpFuer(lead, jetzt)
  const meta = wartelisteStufeMeta(stufe)
  return {
    id: z.id,
    art: 'warteliste',
    name: (z.name || '').trim() || '—',
    kontakt: kontaktAus(z.email, z.telefon),
    stufe,
    stufeLabel: meta.label,
    stufeFarbe: meta.color,
    eingang: z.created_at,
    zuletzt: z.updated_at ?? null,
    wiedervorlage: stufe === 'neu' ? null : wiedervorlageFuer(lead),
    followUp,
    ampel: ampelFuer(followUp),
    stundenOffen: stunden(z.created_at, jetzt),
    punkte: berechnePrioritaet(lead, jetzt).punkte,
    hinweis: stufe === 'neu' ? 'Noch nicht kontaktiert' : `Stufe „${meta.label}"`,
    ziel: ART_META.warteliste.ziel,
    quelle: z.quelle ?? null,
  }
}

/** Bewerbung → Posteingangszeile. Endzustände fallen weg. */
export function ausBewerbung(z: RohLead, jetzt: Date): PosteingangEintrag | null {
  const { stufe } = stufeFuerBewerbung(z.bewerbung_daten, z.status)
  if (BEWERBER_ENDZUSTAENDE.includes(stufe)) return null
  const eingabe = {
    stufe, created_at: z.created_at, updated_at: z.updated_at ?? null,
    follow_up_date: z.follow_up_date ?? null,
  }
  const followUp = followUpFuerBewerbung(eingabe, jetzt)
  const meta = bewerberStufe(stufe)
  return {
    id: z.id,
    art: 'bewerbung',
    name: (z.name || '').trim() || '—',
    kontakt: kontaktAus(z.email, z.phone),
    stufe,
    stufeLabel: meta.label,
    stufeFarbe: meta.color,
    eingang: z.created_at,
    zuletzt: z.updated_at ?? null,
    wiedervorlage: stufe === 'neu' ? null : wiedervorlageFuerBewerbung(eingabe),
    followUp,
    ampel: ampelFuer(followUp),
    stundenOffen: stunden(z.created_at, jetzt),
    punkte: 0,
    hinweis: meta.aufgabe,
    ziel: ART_META.bewerbung.ziel,
    quelle: z.source ?? null,
  }
}

/**
 * Kundenanfrage → Posteingangszeile.
 *
 * `lead_inquiries` führt für Anfragen keine feine Stufe: es zählt der
 * CRM-Status. NEU läuft ab Eingang, sonst ab gesetzter Wiedervorlage —
 * ohne Wiedervorlage gibt es keine Uhr, und das steht dann auch so da.
 */
const ANFRAGE_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Neu', color: '#2196F3' },
  contacted: { label: 'Kontaktiert', color: '#E8A000' },
  qualified: { label: 'Qualifiziert', color: '#9C27B0' },
}

export function ausAnfrage(z: RohLead, jetzt: Date): PosteingangEintrag | null {
  const status = z.status || 'new'
  const meta = ANFRAGE_STATUS[status]
  if (!meta) return null
  const wiedervorlage = tagAlsZeitpunkt(z.follow_up_date ?? null)
  const followUp = status === 'new'
    ? followUpSeitEingang(z.created_at, jetzt)
    : followUpSeitWiedervorlage(wiedervorlage, jetzt)
  return {
    id: z.id,
    art: 'anfrage',
    name: (z.name || '').trim() || '—',
    kontakt: kontaktAus(z.email, z.phone),
    stufe: status,
    stufeLabel: meta.label,
    stufeFarbe: meta.color,
    eingang: z.created_at,
    zuletzt: z.updated_at ?? null,
    wiedervorlage: status === 'new' ? null : wiedervorlage,
    followUp,
    ampel: ampelFuer(followUp),
    stundenOffen: stunden(z.created_at, jetzt),
    punkte: 0,
    hinweis: status === 'new'
      ? `Anfrage über ${z.source || 'Website'} — noch nicht bearbeitet`
      : wiedervorlage ? 'Wiedervorlage gesetzt' : 'Ohne Wiedervorlage — Termin setzen',
    ziel: ART_META.anfrage.ziel,
    quelle: z.source ?? null,
  }
}

/**
 * Sortierung des Posteingangs: erst die Ampel, dann die Wartezeit.
 * Bei gleicher Lage gewinnt der ältere Lead — wer länger wartet, kommt
 * zuerst dran. Die Priorität der Warteliste entscheidet erst danach.
 */
export function sortierePosteingang(eintraege: readonly PosteingangEintrag[]): PosteingangEintrag[] {
  return [...eintraege].sort((a, b) =>
    AMPEL_META[b.ampel].rang - AMPEL_META[a.ampel].rang
    || b.stundenOffen - a.stundenOffen
    || b.punkte - a.punkte
    || a.name.localeCompare(b.name, 'de'))
}

export interface PosteingangZaehlung extends FollowUpZaehlung {
  gesamtOffen: number
  jeArt: Record<LeadArt, number>
  schwarz: number
  rot: number
  orange: number
  gelb: number
  /** Stunden, die der älteste offene Lead schon wartet. */
  aeltesteStunden: number
  /** Heute fällige Wiedervorlagen (Berliner Kalendertag). */
  heuteFaellig: number
  /** Offene Rückrufwünsche (`source='rueckruf'`). */
  rueckrufe: number
  /** Offene Terminwünsche (`source='terminbuchung'`). */
  termine: number
}

export function zaehlePosteingang(eintraege: readonly PosteingangEintrag[]): PosteingangZaehlung {
  const z = zaehleFollowUps(eintraege.map(e => e.followUp))
  const jeArt: Record<LeadArt, number> = { warteliste: 0, bewerbung: 0, anfrage: 0 }
  eintraege.forEach(e => { jeArt[e.art]++ })
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  return {
    ...z,
    gesamtOffen: eintraege.length,
    jeArt,
    schwarz: eintraege.filter(e => e.ampel === 'schwarz').length,
    rot: eintraege.filter(e => e.ampel === 'rot').length,
    orange: eintraege.filter(e => e.ampel === 'orange').length,
    gelb: eintraege.filter(e => e.ampel === 'gelb').length,
    aeltesteStunden: eintraege.reduce((m, e) => Math.max(m, e.stundenOffen), 0),
    heuteFaellig: eintraege.filter(e => (e.wiedervorlage ?? '').slice(0, 10) === heute).length,
    rueckrufe: eintraege.filter(e => /rueckruf|rückruf|callback/i.test(e.quelle ?? '')).length,
    termine: eintraege.filter(e => /termin/i.test(e.quelle ?? '')).length,
  }
}

/** Eine Zeile Klartext für Kopfzeile und Tages-Meldung. */
export function posteingangSatz(z: PosteingangZaehlung): string {
  if (z.gesamtOffen === 0) return 'Keine offenen Leads.'
  const teile = [
    z.schwarz ? `${z.schwarz} verschleppt (>7 Tage)` : null,
    z.rot ? `${z.rot} dringend` : null,
    z.orange ? `${z.orange} eskaliert` : null,
    z.gelb ? `${z.gelb} zur Erinnerung` : null,
  ].filter(Boolean)
  return teile.length === 0
    ? `${z.gesamtOffen} offen, alle im Zeitplan.`
    : `${z.gesamtOffen} offen — ${teile.join(', ')}.`
}

export { FOLLOW_UP_META }
