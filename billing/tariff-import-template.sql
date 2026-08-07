-- ════════════════════════════════════════════════════════════════════════════
-- TARIF-IMPORT-TEMPLATE v2
-- Datum: 2026-08-07
-- Branch: feature/tariff-stammdaten-v2
--
-- AENDERUNGEN gegenueber v1:
--   - NEU: tarifquelle (Pflichtfeld) — Herkunft des Tarifs
--   - P7: Privat/Kasse-Trennung beachten
--   - Erweiterte Checkliste
--
-- ANLEITUNG:
-- 1. Zeilen mit "FACHLICH_ZU_LIEFERN" durch echte Werte ersetzen
-- 2. Fuer jede Leistungsart/Rechtsgrundlage/Kostentraeger-Kombination
--    einen Eintrag erstellen
-- 3. Preise in CENT (ganzzahlig, z.B. 3500 = 35.00 EUR)
-- 4. Zuschlaege in PROZENT (z.B. 25.00 = 25%), Default 0
-- 5. gueltig_ab = Datum ab dem der Tarif gilt
-- 6. gueltig_bis = NULL fuer unbefristete Tarife
-- 7. tarifquelle = Woher kommt dieser Preis? (siehe Katalog unten)
--
-- WICHTIG:
-- - Keine erfundenen Preise verwenden!
-- - Leistungsarten muessen aus dem Katalog (billing_leistungsarten) stammen
-- - Rechtsgrundlagen muessen aus dem Katalog (billing_rechtsgrundlagen) stammen
-- - Tarifquellen muessen aus dem Katalog (billing_tarifquellen) stammen
-- - IK-Nummern muessen gueltige Pruefziffern haben (§293 SGB V)
-- - Privattarife: rechtsgrundlage='privat' + tarifquelle IN (PRIVATE_PREISLISTE, MANUELL_FREIGEGEBEN)
-- - Kassentarife: rechtsgrundlage IN (§45b/§39/§36) + tarifquelle NICHT PRIVATE_PREISLISTE
-- ════════════════════════════════════════════════════════════════════════════

-- ── Erlaubte Leistungsarten (aus billing_leistungsarten) ──
-- alltagsbegleitung, betreuung_45a, verhinderungspflege, hauswirtschaft,
-- einkaufsservice, begleitservice, nachtbetreuung, wochenendbetreuung,
-- krankenfahrt, demenzbetreuung, wegepauschale, sonstige

-- ── Erlaubte Rechtsgrundlagen (aus billing_rechtsgrundlagen) ──
-- §45b SGB XI    → Entlastungsleistungen (131 EUR/Monat seit 2025)
-- §39 SGB XI     → Verhinderungspflege
-- §36 SGB XI     → Haeusliche Pflegehilfe
-- privat         → Privatzahler (ohne Kasse)

-- ── Erlaubte Tarifquellen (NEU, aus billing_tarifquellen) ──
-- PRIVATE_PREISLISTE       → Interne Preisliste fuer Privatzahler
-- ANERKENNUNGSBESCHEID     → Preis aus Anerkennungsbescheid (Landesbehoerde)
-- VERGUETUNGSVEREINBARUNG  → Verguetungsvereinbarung mit Pflegekasse
-- KASSENVEREINBARUNG       → Rahmenvertrag / Kassenvereinbarung
-- MANUELL_FREIGEGEBEN      → Manuell geprueft und freigegeben

-- ── Erlaubte Verguetungsarten ──
-- zeit_stunde, zeit_minute, leistungskomplex, pauschale, wegepauschale, zuschlag

-- ════════════════════════════════════════════════════════════════════════════
-- STAMM-ORG UUID: 00000000-0000-4000-8000-000460629986
-- (Alltagsengel UG, IK 460629986)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 1: KASSENTARIFE (§45b SGB XI — Entlastungsleistungen)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id,
  leistungsart,
  rechtsgrundlage,
  tarifquelle,                      -- NEU in v2
  verguetungsart,
  preis_cent,
  einheit,
  bundesland,
  kostentraeger_ik,
  gueltig_ab,
  gueltig_bis,
  zuschlag_wochenende_prozent,
  zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent,
  nacht_von,
  nacht_bis,
  ist_aktiv,
  created_by
) VALUES
  -- ── Alltagsbegleitung (§45b, Hessen, generisch) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',         -- ANERKENNUNGSBESCHEID oder VERGUETUNGSVEREINBARUNG
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN: Preis in Cent
    'Stunde',
    'hessen',
    NULL,                           -- generischer Tarif (ohne IK)
    'FACHLICH_ZU_LIEFERN',         -- Gueltig ab (z.B. '2026-01-01')
    NULL,                           -- unbefristet
    0,                              -- kein Wochenendzuschlag
    0,                              -- kein Feiertagszuschlag
    0,                              -- kein Nachtzuschlag
    '20:00',
    '06:00',
    TRUE,
    NULL
  ),

  -- ── Hauswirtschaft (§45b, Hessen, generisch) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'hauswirtschaft',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',         -- ANERKENNUNGSBESCHEID oder VERGUETUNGSVEREINBARUNG
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Begleitservice (§45b, Hessen, generisch) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'begleitservice',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Einkaufsservice (§45b, Hessen, generisch) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'einkaufsservice',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Demenzbetreuung (§45b, Hessen, generisch) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'demenzbetreuung',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  ),

  -- ── Wegepauschale (§45b, Hessen) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'wegepauschale',
    '§45b SGB XI',
    'FACHLICH_ZU_LIEFERN',         -- ANERKENNUNGSBESCHEID oder MANUELL_FREIGEGEBEN
    'wegepauschale',
    0,                              -- FACHLICH_ZU_LIEFERN: Betrag in Cent pro Fahrt
    'Fahrt',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE,
    NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 2: KASSENTARIFE (§39 SGB XI — Verhinderungspflege)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- ── Alltagsbegleitung (§39, Hessen) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    '§39 SGB XI',
    'FACHLICH_ZU_LIEFERN',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- ── Verhinderungspflege (§39, Hessen) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'verhinderungspflege',
    '§39 SGB XI',
    'FACHLICH_ZU_LIEFERN',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 3: PRIVATTARIFE (rechtsgrundlage='privat')
-- P7: Privattarife MUESSEN tarifquelle PRIVATE_PREISLISTE oder
--     MANUELL_FREIGEGEBEN haben.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- ── Alltagsbegleitung (privat, Hessen) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    'privat',
    'PRIVATE_PREISLISTE',           -- Privattarif → PRIVATE_PREISLISTE
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN: Privatpreis in Cent
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- ── Hauswirtschaft (privat, Hessen) ──
  (
    '00000000-0000-4000-8000-000460629986',
    'hauswirtschaft',
    'privat',
    'PRIVATE_PREISLISTE',
    'zeit_stunde',
    0,                              -- FACHLICH_ZU_LIEFERN
    'Stunde',
    'hessen',
    NULL,
    'FACHLICH_ZU_LIEFERN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 4: IK-SPEZIFISCHE TARIFE (Beispielstruktur)
-- Fuer kassenspezifische Preise mit abweichendem Satz
-- ────────────────────────────────────────────────────────────────────────────

-- INSERT INTO public.billing_tariffs (
--   organization_id, leistungsart, rechtsgrundlage, tarifquelle,
--   verguetungsart, preis_cent, einheit, bundesland,
--   kostentraeger_ik, gueltig_ab, gueltig_bis,
--   zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
--   zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
-- ) VALUES (
--   '00000000-0000-4000-8000-000460629986',
--   'alltagsbegleitung',
--   '§45b SGB XI',
--   'VERGUETUNGSVEREINBARUNG',    -- oder KASSENVEREINBARUNG
--   'zeit_stunde',
--   0,                            -- FACHLICH_ZU_LIEFERN: IK-spezifischer Preis
--   'Stunde',
--   'hessen',
--   'FACHLICH_ZU_LIEFERN',       -- 9-stellige IK-Nummer mit gueltiger Pruefziffer
--   'FACHLICH_ZU_LIEFERN',       -- Gueltig ab
--   NULL,
--   0, 0, 0,
--   '20:00', '06:00',
--   TRUE, NULL
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- CHECKLISTE VOR IMPORT:
-- ════════════════════════════════════════════════════════════════════════════
-- [ ] Alle "FACHLICH_ZU_LIEFERN" durch echte Werte ersetzt
-- [ ] Alle Preise in Cent (ganzzahlig, keine Kommazahlen)
-- [ ] Alle IK-Nummern auf Pruefziffer geprueft (§293 SGB V)
-- [ ] Alle Leistungsarten im Katalog vorhanden
-- [ ] Alle Rechtsgrundlagen im Katalog vorhanden
-- [ ] Alle Tarifquellen im Katalog vorhanden (NEU in v2)
-- [ ] gueltig_ab Datum korrekt
-- [ ] Keine zeitlichen Ueberlappungen fuer gleiche Kombination
-- [ ] organization_id = 00000000-0000-4000-8000-000460629986
-- [ ] Migration auf Staging-Branch getestet
-- [ ] Yusuf hat echte Tarif-Werte freigegeben
-- [ ] P7-Trennung beachtet: Privattarife → PRIVATE_PREISLISTE
-- [ ] P7-Trennung beachtet: Kassentarife → NICHT PRIVATE_PREISLISTE
