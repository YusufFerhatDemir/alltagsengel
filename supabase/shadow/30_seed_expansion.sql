-- ════════════════════════════════════════════════════════════════════════════
-- Staging-Seed: Expansion Deutschland
-- Legt Klienten, Wartelisten-Eintraege und vorbereitete Tarife an, damit das
-- Admin-Dashboard und die Kundenstrecke mit echten Zahlen geprueft werden
-- koennen.
--
-- Laeuft NUR auf der Shadow-/Staging-DB. Alle Daten sind erfunden und tragen
-- @shadow.test-Adressen bzw. Kundennummern mit dem Praefix STG-.
--
-- Voraussetzung: 10_seed_two_orgs.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Die Stamm-Organisation, NICHT Testorg A: die Kundenstrecke und
-- /api/expansion/status lesen immer DEFAULT_ORG_ID. Ein Seed auf Testorg A
-- waere im Browser unsichtbar geblieben.
\set ORG_A '00000000-0000-4000-8000-000460629986'

-- ── Klienten in den im Abnahmeauftrag genannten Staedten ────────────────────
INSERT INTO public.clients (
  organization_id, customer_number, first_name, last_name,
  zip_code, city, status, care_level
) VALUES
  (:'ORG_A', 'STG-HE-01', 'Anna',    'Frankfurt',   '60311', 'Frankfurt am Main', 'active', 2),
  (:'ORG_A', 'STG-HE-02', 'Bernd',   'Wiesbaden',   '65183', 'Wiesbaden',         'active', 3),
  (:'ORG_A', 'STG-BY-01', 'Clara',   'Muenchen',    '80331', 'München',           'active', 2),
  (:'ORG_A', 'STG-NW-01', 'Dieter',  'Koeln',       '50667', 'Köln',              'active', 4),
  (:'ORG_A', 'STG-SL-01', 'Erika',   'Saarbruecken','66111', 'Saarbrücken',       'active', 2),
  (:'ORG_A', 'STG-BE-01', 'Frank',   'Berlin',      '10115', 'Berlin',            'active', 3),
  (:'ORG_A', 'STG-HH-01', 'Gerda',   'Hamburg',     '20095', 'Hamburg',           'active', 2),
  (:'ORG_A', 'STG-SN-01', 'Horst',   'Dresden',     '01067', 'Dresden',           'active', 1),
  (:'ORG_A', 'STG-BW-01', 'Ilse',    'Stuttgart',   '70173', 'Stuttgart',         'active', 3),
  (:'ORG_A', 'STG-NI-01', 'Jonas',   'Hannover',    '30159', 'Hannover',          'active', 2),
  (:'ORG_A', 'STG-TH-01', 'Karin',   'Erfurt',      '99084', 'Erfurt',            'active', 2),
  (:'ORG_A', 'STG-MV-01', 'Lars',    'Schwerin',    '19053', 'Schwerin',          'active', 3),
  -- Grenzfall: 21444 liegt in einer Leitregion, die die Landesgrenze
  -- ueberschreitet. Fuer diesen Klienten darf NIE eine Kassenrechnung
  -- freigegeben werden, egal welches Land freigeschaltet ist.
  (:'ORG_A', 'STG-XX-01', 'Moritz',  'Grenzfall',   '21444', 'Reindorf',          'active', 2),
  -- Datenlücke: ohne PLZ ist keine eindeutige Zuordnung moeglich.
  (:'ORG_A', 'STG-XX-02', 'Nina',    'OhnePlz',     NULL,    NULL,                'active', 2)
ON CONFLICT DO NOTHING;

-- ── Warteliste: unterschiedlich starke Nachfrage je Bundesland ──────────────
INSERT INTO public.state_waitlist (
  organization_id, bundesland, plz, email, name, interesse, quelle
) VALUES
  (:'ORG_A', 'bayern',              '80331', 'wl-by-1@shadow.test', 'Interessent BY 1', 'kasse',  'web'),
  (:'ORG_A', 'bayern',              '90402', 'wl-by-2@shadow.test', 'Interessent BY 2', 'kasse',  'native'),
  (:'ORG_A', 'bayern',              '93047', 'wl-by-3@shadow.test', 'Interessent BY 3', 'beides', 'web'),
  (:'ORG_A', 'nordrhein_westfalen', '50667', 'wl-nw-1@shadow.test', 'Interessent NW 1', 'kasse',  'web'),
  (:'ORG_A', 'nordrhein_westfalen', '40213', 'wl-nw-2@shadow.test', 'Interessent NW 2', 'kasse',  'web'),
  (:'ORG_A', 'berlin',              '10115', 'wl-be-1@shadow.test', 'Interessent BE 1', 'privat', 'web'),
  (:'ORG_A', 'saarland',            '66111', 'wl-sl-1@shadow.test', 'Interessent SL 1', 'kasse',  'web'),
  (:'ORG_A', 'hessen',              '60311', 'wl-he-1@shadow.test', 'Interessent HE 1', 'kasse',  'web')
ON CONFLICT (organization_id, bundesland, email) DO NOTHING;

-- ── Ausgangslage der Bundeslaender ──────────────────────────────────────────
-- Bewusst gemischt, damit im Dashboard ALLE fuenf Status sichtbar sind.
SELECT set_config('app.expansion_rpc', 'aktiv', TRUE);

UPDATE public.state_settings SET
  status = 'ANTRAG_EINGEREICHT', private_enabled = TRUE,
  antrag_eingereicht_am = CURRENT_DATE - 40,
  rechtsgrundlage_land = 'PfluV Hessen',
  approval_authority = 'Zuständige Landesbehörde Hessen (§45a SGB XI)',
  ansprechpartner_name = 'Alltagsengel',
  ansprechpartner_email = 'info@alltagsengel.care',
  notes = 'Anerkennungsverfahren läuft. Privatleistungen aktiv.'
WHERE organization_id = :'ORG_A' AND bundesland = 'hessen';

UPDATE public.state_settings SET
  status = 'IN_PRUEFUNG', private_enabled = TRUE,
  antrag_eingereicht_am = CURRENT_DATE - 90,
  notes = 'Behörde hat Rückfragen zur Qualifikation gestellt.'
WHERE organization_id = :'ORG_A' AND bundesland = 'bayern';

UPDATE public.state_settings SET
  status = 'ANTRAG_EINGEREICHT', private_enabled = TRUE,
  antrag_eingereicht_am = CURRENT_DATE - 20
WHERE organization_id = :'ORG_A' AND bundesland = 'nordrhein_westfalen';

UPDATE public.state_settings SET
  status = 'ABGELEHNT', private_enabled = TRUE, abgelehnt_am = CURRENT_DATE - 10,
  notes = 'Ablehnung wegen fehlendem Nachweis der Schulungsstunden. Widerspruch geprüft.'
WHERE organization_id = :'ORG_A' AND bundesland = 'saarland';

UPDATE public.state_settings SET
  private_enabled = TRUE
WHERE organization_id = :'ORG_A' AND bundesland IN ('berlin', 'hamburg');

SELECT set_config('app.expansion_rpc', '', TRUE);

-- ── Tarife: Schicht 2 (Kasse, vorbereitet) und Schicht 3 (Privat, aktiv) ────
-- Betraege sind Staging-Platzhalter, KEINE echten Vertragspreise.
INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, bundesland,
  verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
) VALUES
  -- Hessen: Kassentarif vorbereitet (inaktiv) → wird beim Klick scharf
  (:'ORG_A', 'betreuung_45a',   '§45b SGB XI', 'hessen', 'zeit_stunde', 2800,
   CURRENT_DATE - 30, 'MANUELL_FREIGEGEBEN', FALSE),
  (:'ORG_A', 'hauswirtschaft',  '§45b SGB XI', 'hessen', 'zeit_stunde', 2400,
   CURRENT_DATE - 30, 'MANUELL_FREIGEGEBEN', FALSE),
  -- Privattarif Hessen: laeuft unabhaengig von der Anerkennung
  (:'ORG_A', 'alltagsbegleitung', 'privat',    'hessen', 'zeit_stunde', 3200,
   CURRENT_DATE - 30, 'PRIVATE_PREISLISTE', TRUE),
  -- Bayern: Kassentarif vorbereitet
  (:'ORG_A', 'betreuung_45a',   '§45b SGB XI', 'bayern', 'zeit_stunde', 2900,
   CURRENT_DATE - 30, 'MANUELL_FREIGEGEBEN', FALSE)
  -- NRW und Saarland bewusst OHNE Tarif: das Dashboard muss „es fehlt:
  -- Kassentarife" anzeigen und die Freischaltung ablehnen.
ON CONFLICT DO NOTHING;

-- ── Landesregel fuer Hessen (vorbereitet, inaktiv) ──────────────────────────
INSERT INTO public.billing_landesregeln (
  bundesland, regel_key, regel_wert, rechtsgrundlage,
  quelle, gueltig_ab, ist_aktiv, organization_id
) VALUES
  ('hessen', 'min_einsatzdauer_minuten', '60'::JSONB, '§45b SGB XI',
   'Staging-Seed', CURRENT_DATE - 30, FALSE, :'ORG_A')
ON CONFLICT DO NOTHING;

SELECT 'Klienten'      AS was, count(*) FROM public.clients      WHERE organization_id = :'ORG_A'
UNION ALL
SELECT 'Warteliste',    count(*) FROM public.state_waitlist  WHERE organization_id = :'ORG_A'
UNION ALL
SELECT 'Tarife',        count(*) FROM public.billing_tariffs WHERE organization_id = :'ORG_A';
