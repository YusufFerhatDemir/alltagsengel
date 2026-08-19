// ═══════════════════════════════════════════════════════════════════════
// Security-Audit 2026-08-19 — HOCH-1: die 82 Tabellen ohne organization_id
//
// scripts/org-id-klassifizierung.json ordnet jede dieser Tabellen einer
// Klasse zu. Diese Suite haelt die Einordnung vollstaendig, ueberschneidungs-
// frei und deckungsgleich mit dem, was die Migrationen tatsaechlich anfassen.
//
// Der Live-Abgleich (kommt eine neue Tabelle ohne organization_id dazu?)
// laeuft ueber `npx tsx scripts/rls-matrix.ts` gegen Production — hier wird
// gegen den festgehaltenen Bestand aus dem Audit geprueft, damit die Suite
// ohne Netz und ohne Service-Role-Key laeuft.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WURZEL = process.cwd()
const klass = JSON.parse(readFileSync(join(WURZEL, 'scripts/org-id-klassifizierung.json'), 'utf8'))

const KLASSEN = Object.keys(klass).filter(k => !k.startsWith('_'))

// Bestand laut Audit 2026-08-19 (OpenAPI-Introspektion gegen Production,
// 321 Relationen, davon 82 ohne organization_id).
const BESTAND_82 = [
  '_sql_parts', 'account_deletion_tokens', 'action_fingerprints', 'analytics_events',
  'angel_availability', 'angel_reviews', 'angels', 'app_settings', 'approved_locations',
  'audit_logs', 'billing_feiertage', 'billing_gesetzliche_obergrenzen',
  'billing_landesregel_keys', 'billing_leistungsarten', 'billing_rechtsgrundlagen',
  'billing_tarifquellen', 'bundeslaender', 'chat_messages', 'coach_activities',
  'coach_activity_log', 'coach_anspruchspruefungen', 'coach_assessments', 'coach_audit_log',
  'coach_bestellungen', 'coach_consents', 'coach_freischaltungen', 'coach_goals',
  'coach_measurements', 'coach_nutzungsereignisse', 'coach_pseudonym_key',
  'coach_rechnungen', 'coach_reports', 'coach_shares', 'coach_users', 'coach_zahlungen',
  'content_blocks', 'conversions', 'fcm_tokens', 'geo_events', 'kf_booking_reviews',
  'kf_feature_flags', 'kf_partner_availability', 'kf_partners', 'kf_pricing_audit',
  'kf_pricing_config', 'kf_pricing_costs', 'kf_pricing_regions', 'kf_pricing_rules',
  'kf_pricing_surcharges', 'kf_pricing_tiers', 'kf_review_rules',
  'kf_service_doc_requirements', 'krankenfahrt_providers', 'krankenfahrt_reviews',
  'krankenfahrten', 'lead_inquiries', 'login_rate_limits', 'messages', 'mis_auth_log',
  'mis_dataroom_access', 'mis_dataroom_sections', 'mis_document_categories',
  'mis_privacy_audit_log', 'mis_privacy_consents', 'mis_privacy_records',
  'mis_privacy_requests', 'newsletter_subscribers', 'notfall_access_attempts',
  'notifications', 'offline_queue', 'organizations', 'page_views', 'partner_visits',
  'plz_bundesland_regeln', 'profiles', 'push_subscriptions', 'referrals', 'reviews',
  'sync_conflicts', 'visitor_locations', 'visitors', 'whatsapp_conversations',
]

function alle(): string[] {
  return KLASSEN.flatMap(k => klass[k] as string[])
}

describe('Klassifizierung der Tabellen ohne organization_id', () => {
  it('der geprüfte Bestand umfasst genau 82 Tabellen', () => {
    expect(new Set(BESTAND_82).size).toBe(82)
  })

  it('jede Tabelle ist genau einer Klasse zugeordnet', () => {
    const liste = alle()
    const doppelt = liste.filter((t, i) => liste.indexOf(t) !== i)
    expect(doppelt, `Mehrfach zugeordnet: ${doppelt.join(', ')}`).toEqual([])
  })

  it('die Klassifizierung deckt den Bestand vollstaendig ab', () => {
    const fehlt = BESTAND_82.filter(t => !alle().includes(t))
    expect(fehlt, `Nicht klassifiziert: ${fehlt.join(', ')}`).toEqual([])
  })

  it('die Klassifizierung enthaelt keine unbekannten Tabellen', () => {
    const zuviel = alle().filter(t => !BESTAND_82.includes(t))
    expect(zuviel, `Unbekannt: ${zuviel.join(', ')}`).toEqual([])
  })

  it('nichts bleibt unentschieden', () => {
    expect(klass.offen, `Noch offen: ${(klass.offen as string[]).join(', ')}`).toEqual([])
  })

  it('jede Klasse ist begruendet', () => {
    for (const k of KLASSEN) {
      expect(klass._klassen[k], `Keine Begruendung fuer Klasse "${k}"`).toBeTruthy()
    }
  })
})

describe('Migrationen decken die handlungsbeduerftigen Klassen ab', () => {
  const analyticsMigration = readFileSync(
    join(WURZEL, 'supabase/migrations/20260922010000_analytics_org_scope.sql'), 'utf8')
  const hoch1Migration = readFileSync(
    join(WURZEL, 'supabase/migrations/20260922020000_hoch1_mandantentrennung.sql'), 'utf8')

  it('jede analytics-Tabelle steht in der Analytics-Migration', () => {
    for (const t of klass.analytics as string[]) {
      expect(analyticsMigration, `${t} fehlt in 20260922010000`).toContain(`'${t}'`)
    }
  })

  it('jede org_fence-Tabelle steht in der HOCH-1-Migration', () => {
    for (const t of klass.org_fence as string[]) {
      expect(hoch1Migration, `${t} fehlt in 20260922020000`).toContain(`'${t}'`)
    }
  })

  it('fuer jede admin_policy_verengt-Tabelle ist die Behandlung belegt', () => {
    // Entweder wird die Policy in dieser Migration verengt, oder die Tabelle
    // ist bereits ueber buchung_in_aktiver_org() gefenced (reviews/angel_reviews)
    // bzw. hat gar keine Admin-Policy (chat_messages) — beides steht als
    // Begruendung im Kopf der Migration.
    for (const t of klass.admin_policy_verengt as string[]) {
      expect(hoch1Migration, `${t} weder verengt noch begruendet`).toContain(t)
    }
  })

  it('die HOCH-1-Migration verengt die Admin-Policies mit einem Org-Nachweis', () => {
    expect(hoch1Migration).toContain('nutzer_in_aktiver_org')
    expect(hoch1Migration).toMatch(/is_admin\(\) AND public\.nutzer_in_aktiver_org/)
  })

  it('current_org_id() loest auch ueber caregivers und clients auf', () => {
    expect(hoch1Migration).toContain('FROM public.caregivers cg')
    expect(hoch1Migration).toContain('FROM public.clients cl')
  })

  it('zu beiden Migrationen gibt es ein Rollback', () => {
    for (const datei of [
      'supabase/migrations/20260922010001_rollback_analytics_org_scope.sql',
      'supabase/migrations/20260922020001_rollback_hoch1_mandantentrennung.sql',
      'supabase/migrations/20260922000001_rollback_revoke_anon_cron_funktionen.sql',
    ]) {
      expect(readFileSync(join(WURZEL, datei), 'utf8').length).toBeGreaterThan(0)
    }
  })
})
