/**
 * ═══════════════════════════════════════════════════════════════════════
 * Der Migrations-Pruefkatalog — EINE Quelle fuer zwei Verbraucher
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Zwei Stellen brauchen dieselbe Antwort auf „woran erkennt man, dass
 * Migration X live steht?":
 *
 *   · scripts/check-migrationen-live.mjs      — misst es
 *   · scripts/gen-migrationen-checkliste.mjs  — schreibt es in die
 *                                               Apply-Checkliste
 *
 * Die Liste stand urspruenglich in der ersten Datei. Sie fuer die zweite
 * abzuschreiben waere die naechste Liste, die auseinanderlaeuft — genau
 * der Fehler, den das Status-Vokabular der Rechnungen zweimal gemacht hat
 * und den der Aufbewahrungskatalog ausdruecklich vermeidet.
 *
 * Sie liegt deshalb hier, ohne Seiteneffekt: ein Import fuehrt KEINE
 * Pruefung aus.
 */

/**
 * Je Migration: der SQL-Ausdruck, der die Zahl der gefundenen Objekte
 * liefert, und wie viele es sein muessen. `was` steht im Bericht.
 */
export const KATALOG = [
  { datei: '20261006000000_sepa_batch_items_kein_doppelter_einzug',
    was: 'eindeutiger Index uq_sepa_batch_items_invoice_offen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_sepa_batch_items_invoice_offen'` },
  { datei: '20261007000000_pflege_risiko_dashboard_org_fence',
    was: 'org_fence-Policy auf den Risiko-Tabellen',
    soll: 1, mindestens: true,
    sql: `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'pflege_risik%' AND policyname LIKE '%org_fence%'` },
  { datei: '20261007000002_sis_abschluss_sperre_haertung',
    was: 'prevent_locked_sis_edit + prevent_locked_sis_child_edit',
    soll: 2,
    sql: `SELECT count(*) FROM pg_proc WHERE proname IN ('prevent_locked_sis_edit','prevent_locked_sis_child_edit')` },
  { datei: '20261008000000_vitalwerte_plausibilitaet_db_check',
    was: 'die vier Funktionen vitals_plausibel_*',
    soll: 4,
    sql: `SELECT count(*) FROM pg_proc WHERE proname LIKE 'vitals_plausibel%'` },
  { datei: '20261009000000_pflege_massnahmenplaene_ein_aktiver_plan',
    was: 'eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_pflege_massnahmenplaene_ein_aktiver_plan'` },
  { datei: '20261009000002_coach_freischaltung_bestellung_unique',
    was: 'Index idx_coach_freischaltungen_bestellung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='idx_coach_freischaltungen_bestellung'` },
  { datei: '20261009000004_pflege_anamnese_abschluss_sperre_haertung',
    was: 'prevent_locked_anamnese_edit',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='prevent_locked_anamnese_edit'` },
  { datei: '20261010000000_medikamente_abgesetzt_sperre_db',
    was: 'Trigger trg_locked_medikament auf medikamente',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_locked_medikament'` },
  { datei: '20261010000002_wund_kindtabellen_sperre_db',
    was: 'die drei Trigger trg_locked_wound_*',
    soll: 3,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_locked_wound_assessment','trg_locked_wound_treatment','trg_locked_wound_photo')` },
  { datei: '20261010000004_pflege_verlauf_backdating_sperre_db',
    was: 'Trigger trg_verlauf_periode_offen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_verlauf_periode_offen'` },
  { datei: '20261010000006_kim_audit_anhang_abgewiesen',
    // Der Constraint heisst 'aktion', nicht 'action'. Eine LIKE-Probe
    // meldete hier faelschlich „fehlt".
    was: "kim_audit_log_aktion_check kennt 'anhang_abgewiesen'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='kim_audit_log' AND c.conname='kim_audit_log_aktion_check'
             AND pg_get_constraintdef(c.oid) LIKE '%anhang_abgewiesen%'` },
  { datei: '20261011000000_dienstplan_nachtdienst_doppelbelegung',
    was: 'Trigger trg_check_doppelbelegung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_check_doppelbelegung'` },
  { datei: '20261011000001_medikament_eingaben_doppelgabe',
    was: 'eindeutiger Index uq_medikament_eingaben_gabe',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_medikament_eingaben_gabe'` },
  { datei: '20261012000000_assignment_overlap_nachtdienst',
    // Die alte Fassung verglich nur Minuten innerhalb EINES Tages. Der
    // Mitternachtsuebergang steckt im Versatz-Ausdruck; der ist das
    // Kennzeichen der neuen Fassung.
    was: 'check_assignment_overlap rechnet ueber Mitternacht (versatz * 1440)',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='check_assignment_overlap'
            AND pg_get_functiondef(oid) LIKE '%versatz * 1440%'` },
  { datei: '20261013000000_rechnung_stornierte_nachweise',
    was: 'create_invoice_draft_atomic schliesst Stornos aus',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='create_invoice_draft_atomic'
            AND pg_get_functiondef(oid) LIKE '%storn%'` },
  { datei: '20261013000002_budget_used_amount_statuswerte',
    was: 'rechne_budget_verbrauch_neu',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rechne_budget_verbrauch_neu'` },
  { datei: '20261014000000_rollenmatrix_bonus_verwalten',
    was: "rollen_matrix() kennt 'bonus.verwalten'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%bonus.verwalten%'` },
  { datei: '20261015000000_angels_policy_haertung',
    // Rechte NIE ueber information_schema pruefen — dort fehlen
    // PUBLIC-Grants, und die Antwort war faelschlich „kein Recht".
    was: 'angels: UPDATE nur auf den vier freigegebenen Spalten',
    soll: 1,
    sql: `SELECT count(*) WHERE NOT has_table_privilege('authenticated','public.angels','UPDATE')
            AND has_column_privilege('authenticated','public.angels','bio','UPDATE')
            AND NOT has_column_privilege('authenticated','public.angels','hourly_rate','UPDATE')` },
  { datei: '20261016000000_loeschkette_bookings_angel_fk',
    was: 'bookings-Fremdschluessel mit ON DELETE SET NULL',
    soll: 1, mindestens: true,
    sql: `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='bookings' AND c.contype='f' AND c.confdeltype='n'` },
  { datei: '20261017000000_abrechnungsintegritaet_leistungsnachweis',
    was: 'Trigger trg_a_unterschrift_beleg',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_a_unterschrift_beleg'` },
  { datei: '20261017000002_obergrenze_angebotstyp',
    was: 'angebotstyp_von_leistungsart',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='angebotstyp_von_leistungsart'` },
  { datei: '20261018000000_rollenmatrix_sicherheit_lesen',
    was: "rollen_matrix() kennt 'sicherheit.lesen'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%sicherheit.lesen%'` },
  { datei: '20261018000002_security_audit_log',
    was: 'log_security_event',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='log_security_event'` },
  { datei: '20261018000004_security_watchlist_kontoalarm',
    was: 'Trigger trg_security_audit_profil_aenderung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_security_audit_profil_aenderung'` },
  { datei: '20261019000000_marketing_crm',
    was: 'die sechs Marketing-Tabellen',
    soll: 6,
    sql: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
            AND table_name IN ('marketing_consents','email_suppression_list','email_templates',
                               'email_campaigns','email_campaign_logs','marketing_automations')` },
  { datei: '20261019000002_rollenmatrix_marketing_verwalten',
    was: "rollen_matrix() kennt 'marketing.verwalten'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%marketing.verwalten%'` },
  { datei: '20261019000004_audit_action_marketing',
    was: 'mis_audit_log_action_check kennt die Marketing-Aktionen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_constraint WHERE conname='mis_audit_log_action_check'
            AND pg_get_constraintdef(oid) LIKE '%marketing%'` },
  { datei: '20261020000000_standortfreigabe',
    was: 'location_sharing_settings + location_updates',
    soll: 2,
    sql: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
            AND table_name IN ('location_sharing_settings','location_updates')` },
  { datei: '20261021000000_campaign_logs_provider_id',
    was: 'email_campaign_logs.provider_id',
    soll: 1,
    sql: `SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
            AND table_name='email_campaign_logs' AND column_name='provider_id'` },
  { datei: '20261021000002_secdef_trigger_revoke',
    // Umgekehrte Zaehlrichtung: hier muss die Zahl auf NULL stehen.
    was: 'keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar',
    soll: 0,
    sql: `SELECT count(*) FROM pg_proc p WHERE p.prosecdef
            AND p.pronamespace='public'::regnamespace AND p.prorettype='trigger'::regtype
            AND has_function_privilege('anon', p.oid, 'EXECUTE')` },
  { datei: '20261021000004_is_internal_staff_ohne_buero',
    was: "is_internal_staff() nennt 'buero' nicht mehr",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='is_internal_staff'
            AND pg_get_functiondef(oid) NOT LIKE '%buero%'` },
  { datei: '20261022000000_rk_lesepolicies_verwaltungsrollen',
    was: 'die 24 Lesepolicies rk_<tabelle>_lesen',
    soll: 24,
    sql: `SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND policyname LIKE 'rk\\_%\\_lesen' AND cmd='SELECT'
            AND qual LIKE '%current_org_id()%'
            AND tablename IN ('absences','applications','bookings','care_notes','caregiver_bonuses',
              'caregiver_documents','caregiver_initials_history','caregiver_qualifications',
              'client_preferred_substitutes','cooperation_partners','datenannahmestellen',
              'dta_dakota_auftraege','einsatz_absagen','kostentraeger_kontakte','monthly_closings',
              'ocr_results','partner_visits','payment_allocations','payment_status','review_errors',
              'state_settings','substitution_requests','verordnung_leistungen','verordnungen')` },
]
