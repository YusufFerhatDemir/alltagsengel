-- ════════════════════════════════════════════════════════════════════════════
-- TARIF-IMPORT v3 — VORBEREITET (NICHT AUSFUEHREN ohne Yusufs Freigabe)
-- Datum: 2026-08-07
-- Status: Preise aus PfluV Hessen + Erhebungsbogen eingetragen.
--         ALLE mit FACHLICH_ZU_LIEFERN markierten Felder brauchen Yusufs OK.
--
-- QUELLEN:
--   - PfluV Hessen: max 30 EUR/h (Betreuung Nr.2), max 25 EUR/h (Alltag Nr.3)
--   - §45a-Erhebungsbogen-Alltagsengel S.12: 30/25 EUR beantragt
--   - §45a-Erhebungsbogen-Alltagsengel S.13: 5 EUR Fahrtkosten/Einsatz
--   - Anerkennungsbescheid: LIEGT NOCH NICHT VOR (Hessen: keine Antwort)
--
-- WARNUNG:
--   Die service_pricing-Werte (35/38/40 EUR) liegen UEBER den PfluV-Limits
--   und sind KEINE Kassentarife. Sie wurden hier NICHT uebernommen.
--
-- NICHT AUSFUEHREN bis:
--   [ ] Yusuf hat alle YUSUF_BESTAETIGEN-Felder geprueft
--   [ ] Tarifquelle geklaert (ANERKENNUNGSBESCHEID oder MANUELL_FREIGEGEBEN)
--   [ ] gueltig_ab Datum festgelegt
--   [ ] Privatpreise entschieden
--   [ ] Migration auf Staging getestet
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 1: KASSENTARIFE §45b — Betreuungsleistungen (PfluV Nr. 2, max 30 EUR)
-- Quelle: PfluV Hessen + Erhebungsbogen S.12
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- Alltagsbegleitung §45b (Betreuung Nr.2 → max 30 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',           -- ANERKENNUNGSBESCHEID (wenn vorliegend) oder MANUELL_FREIGEGEBEN
    'zeit_stunde',
    3000,                           -- 30,00 EUR (PfluV Hessen max Nr.2) — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',           -- Datum Anerkennungsbescheid oder Startdatum
    NULL,
    0, 0, 0,                        -- Zuschlaege: YUSUF_BESTAETIGEN (0% falls keine vereinbart)
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Betreuung_45a §45b (Betreuung Nr.2 → max 30 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'betreuung_45a',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    3000,                           -- 30,00 EUR — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Demenzbetreuung §45b (Betreuung Nr.2 → max 30 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'demenzbetreuung',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    3000,                           -- 30,00 EUR — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Begleitservice §45b (Betreuung Nr.2 → max 30 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'begleitservice',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    3000,                           -- 30,00 EUR — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 2: KASSENTARIFE §45b — Hauswirtschaft/Alltag (PfluV Nr. 3, max 25 EUR)
-- Quelle: PfluV Hessen + Erhebungsbogen S.12
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- Hauswirtschaft §45b (Alltag Nr.3 → max 25 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'hauswirtschaft',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    2500,                           -- 25,00 EUR (PfluV Hessen max Nr.3) — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Einkaufsservice §45b (Alltag Nr.3 → max 25 EUR/h)
  (
    '00000000-0000-4000-8000-000460629986',
    'einkaufsservice',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    2500,                           -- 25,00 EUR — YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 3: WEGEPAUSCHALE §45b
-- Quelle: Erhebungsbogen S.13 — 5 EUR/Einsatz Pauschale
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  (
    '00000000-0000-4000-8000-000460629986',
    'wegepauschale',
    '§45b SGB XI',
    'YUSUF_BESTAETIGEN',
    'wegepauschale',
    500,                            -- 5,00 EUR/Einsatz (Erhebungsbogen) — YUSUF_BESTAETIGEN
    'Fahrt',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 4: §39 VERHINDERUNGSPFLEGE
-- Quelle: KEINE — kein PfluV-Limit fuer §39.
-- Empfehlung: Gleiche Preise wie §45b (30/25 EUR), aber Yusuf muss bestaetigen.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- Alltagsbegleitung §39 (kein PfluV-Limit)
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    '§39 SGB XI',
    'YUSUF_BESTAETIGEN',           -- MANUELL_FREIGEGEBEN oder VERGUETUNGSVEREINBARUNG
    'zeit_stunde',
    3000,                           -- YUSUF_BESTAETIGEN: Gleich wie §45b (30 EUR)?
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Verhinderungspflege §39
  (
    '00000000-0000-4000-8000-000460629986',
    'verhinderungspflege',
    '§39 SGB XI',
    'YUSUF_BESTAETIGEN',
    'zeit_stunde',
    3000,                           -- YUSUF_BESTAETIGEN
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK 5: PRIVATTARIFE
-- Quelle: service_pricing (38/40 EUR) als Referenz.
-- KEINE PfluV-Grenze fuer Privatzahler.
-- P7: rechtsgrundlage='privat' → tarifquelle MUSS PRIVATE_PREISLISTE sein
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, tarifquelle,
  verguetungsart, preis_cent, einheit, bundesland,
  kostentraeger_ik, gueltig_ab, gueltig_bis,
  zuschlag_wochenende_prozent, zuschlag_feiertag_prozent,
  zuschlag_nacht_prozent, nacht_von, nacht_bis, ist_aktiv, created_by
) VALUES
  -- Alltagsbegleitung privat
  (
    '00000000-0000-4000-8000-000460629986',
    'alltagsbegleitung',
    'privat',
    'PRIVATE_PREISLISTE',
    'zeit_stunde',
    0,                              -- YUSUF_BESTAETIGEN: 3200 (32€)? 3500 (35€)? 4000 (40€)?
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Hauswirtschaft privat (service_pricing: 38 EUR)
  (
    '00000000-0000-4000-8000-000460629986',
    'hauswirtschaft',
    'privat',
    'PRIVATE_PREISLISTE',
    'zeit_stunde',
    0,                              -- YUSUF_BESTAETIGEN: 3800 (38€)?
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Begleitservice privat (service_pricing: 40 EUR)
  (
    '00000000-0000-4000-8000-000460629986',
    'begleitservice',
    'privat',
    'PRIVATE_PREISLISTE',
    'zeit_stunde',
    0,                              -- YUSUF_BESTAETIGEN: 4000 (40€)?
    'Stunde',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  ),

  -- Wegepauschale privat
  (
    '00000000-0000-4000-8000-000460629986',
    'wegepauschale',
    'privat',
    'PRIVATE_PREISLISTE',
    'wegepauschale',
    0,                              -- YUSUF_BESTAETIGEN: 500 (5€) wie Kasse?
    'Fahrt',
    'hessen',
    NULL,
    'YUSUF_BESTAETIGEN',
    NULL,
    0, 0, 0,
    '20:00', '06:00',
    TRUE, NULL
  )
;

-- ════════════════════════════════════════════════════════════════════════════
-- CHECKLISTE VOR AUSFUEHRUNG:
-- ════════════════════════════════════════════════════════════════════════════
-- [ ] Alle "YUSUF_BESTAETIGEN" durch echte Werte ersetzt
-- [ ] Tarifquelle entschieden (ANERKENNUNGSBESCHEID vs MANUELL_FREIGEGEBEN)
-- [ ] gueltig_ab Datum eingetragen
-- [ ] Privatpreise (Cent-Betraege) eingetragen
-- [ ] Zuschlaege geprueft (0% oder echte Werte)
-- [ ] organization_id = 00000000-0000-4000-8000-000460629986
-- [ ] Auf Staging-Branch getestet
-- [ ] Yusuf hat ausdruecklich GO gegeben
-- [ ] KEIN service_pricing-Wert blindlings uebernommen (PfluV-Limits!)
-- [ ] P7-Trennung beachtet: Privattarife → PRIVATE_PREISLISTE
-- ════════════════════════════════════════════════════════════════════════════
