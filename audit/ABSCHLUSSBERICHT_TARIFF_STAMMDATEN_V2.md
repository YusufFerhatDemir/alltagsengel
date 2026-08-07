# Abschlussbericht: Tariff-Stammdaten v2

**Datum:** 2026-08-07
**Branch:** `feature/tariff-stammdaten-v2`
**Basis:** `main` (Commit `81cc23b`)

---

## Zusammenfassung

Dieser Branch implementiert die 12 Punkte des Tarif-Stammdaten-Plans.
Alle Aenderungen sind auf dem Branch isoliert und wurden NICHT auf Production angewendet.

---

## Checkliste: 12-Punkte-Plan

| # | Punkt | Status | Details |
|---|-------|--------|---------|
| P1 | Tarifarchitektur finalisieren | ERLEDIGT | Multidimensionale Architektur bestaetigt: org, bundesland, leistungsart, rechtsgrundlage, kostentraeger_ik, verguetungsart, gueltig_ab/bis, ist_aktiv. NEU: tarifquelle-Spalte. |
| P2 | service_pricing klassifizieren | ERLEDIGT | COMMENT ON TABLE als INTERNAL/PRIVATE markiert. Preise 35/38/40 EUR sind NUR fuer Native-App-Schnellkalkulation, NICHT als Kassentarife. |
| P3 | Leistungsarten-Katalog | ERLEDIGT | 12 stabile Codes via FK-Constraint gesichert. Kein Freitext moeglich. |
| P4 | tarifquelle-Feld | ERLEDIGT | billing_tarifquellen Katalogtabelle (5 Werte) + FK auf billing_tariffs.tarifquelle. API-Validierung in route.ts. |
| P5 | Zuschlaege | ERLEDIGT | Default 0% in Schema + RPC. Zeitlich versionierbar ueber Tarif-Gueltigkeit. Keine Beispielwerte als Produktionswerte. |
| P6 | IK-spezifische Tarife | ERLEDIGT | Spezifitaets-Scoring (IK +10, BL +5). Fallback: IK-spezifisch → org-generisch → MISSING_VALID_TARIFF. |
| P7 | Privat/Kasse-Trennung | ERLEDIGT (KRITISCH) | **RPC-Fix:** `private` → `rechtsgrundlage='privat'` (nicht NULL). Exakter Match: Privattarife NUR fuer private, Kassentarife NUR fuer Kasse. CHECK-Constraint + API-Validierung. |
| P8 | Wegepauschale | ERLEDIGT | Struktur technisch vollstaendig (leistungsart='wegepauschale', verguetungsart='wegepauschale', einheit='Fahrt'). Betrag FACHLICH_ZU_LIEFERN. |
| P9 | Importvorlage | ERLEDIGT | tariff-import-template.sql v2 mit tarifquelle, P7-Regeln, Stamm-Org-UUID, Block-Struktur (Kasse §45b, Kasse §39, Privat, IK-spezifisch). |
| P10 | Tests | ERLEDIGT | 40 neue Tests in 13 Szenarien: budgetTypeToRechtsgrundlage, Zuschlaege, Nachtzeit, Wegepauschale, Tarifquelle-Katalog, Leistungsarten, Rechtsgrundlagen. |
| P11 | Production READ-ONLY | ERLEDIGT | Bestaetigtes Ergebnis: billing_tariffs=0, keine Migrationen (20260807120000/180000) auf Production, service_pricing=10 unveraendert, invoices=5 unveraendert. |
| P12 | Abschlussbericht | DIESER TEXT | |

---

## P7-Fix: Privat/Kasse-Trennungsluecke (KRITISCH)

### Problem (v3)
```sql
-- Alte RPC-Logik (Zeile 429-431):
v_rechtsgrundlage := CASE WHEN 'private' THEN NULL END;
-- WHERE: (v_rechtsgrundlage IS NULL AND p_budget_type = 'private')
-- → Matcht JEDEN Tarif, unabhaengig von bt.rechtsgrundlage!
```

Ein Kassentarif (z.B. §45b) konnte fuer eine Privatrechnung verwendet werden.

### Fix (v4)
```sql
-- Neue RPC-Logik:
v_rechtsgrundlage := CASE WHEN 'private' THEN 'privat' END;
-- WHERE: bt.rechtsgrundlage = v_rechtsgrundlage
-- → Nur Tarife mit rechtsgrundlage='privat' matchen private budget_types.
```

Zusaetzliche Absicherungen:
- CHECK-Constraint `chk_privat_kasse_trennung` auf billing_tariffs
- API-Validierung in tariffs/route.ts
- TypeScript-Funktion `budgetTypeToRechtsgrundlage()` mit Fehler bei unbekanntem budget_type
- Unbekannte budget_types werfen jetzt EXCEPTION statt NULL zuzuweisen

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `supabase/migrations/20260807180000_tariff_stammdaten_v2.sql` | NEU: billing_tarifquellen, tarifquelle-Spalte, P7-RPC-Fix, P2-Kommentar |
| `lib/billing/core/price-resolver.ts` | NEU: Tarifquelle-Type, budgetTypeToRechtsgrundlage(), tarifquelle auf BillingTarif |
| `app/api/billing/tariffs/route.ts` | NEU: Tarifquelle-Validierung, P7-Trennungspruefung |
| `billing/tariff-import-template.sql` | UEBERARBEITET: v2 mit tarifquelle, Stamm-Org, Block-Struktur |
| `__tests__/billing/tariff-stammdaten-v2.test.ts` | NEU: 40 Tests in 13 Szenarien |
| `audit/ABSCHLUSSBERICHT_TARIFF_STAMMDATEN_V2.md` | NEU: Dieser Bericht |

---

## Testergebnis

| Kategorie | Ergebnis |
|-----------|----------|
| Neue Tests (tariff-stammdaten-v2) | 40/40 bestanden |
| Billing-Tests gesamt | 269/269 bestanden |
| Gesamte Test-Suite | 531/531 bestanden, 29 skipped |
| TypeScript Typecheck | 0 Fehler |

---

## Production-Zustand (READ-ONLY, 2026-08-07)

| Tabelle | Zeilen | Status |
|---------|--------|--------|
| billing_tariffs | 0 | Leer (korrekt, keine Tarifdaten) |
| billing_tarifquellen | NICHT VORHANDEN | Migration nicht angewendet |
| billing_leistungsarten | NICHT VORHANDEN | Hardening-Migration nicht auf Production |
| billing_rechtsgrundlagen | NICHT VORHANDEN | Hardening-Migration nicht auf Production |
| service_pricing | 10 | Unveraendert (35/38/40 EUR, INTERNAL) |
| invoices | 5 | Unveraendert |
| Migrationen 20260807* | NICHT VORHANDEN | Korrekt |

---

## Offene fachliche Entscheidungen (FACHLICH_ZU_LIEFERN)

Bevor Tarife auf Production importiert werden koennen, muessen folgende Werte geliefert werden:

### 1. Kassentarife (§45b SGB XI — Entlastungsleistungen)
| Leistungsart | Preis (EUR) | Tarifquelle | Gueltig ab |
|---|---|---|---|
| alltagsbegleitung | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. VERGUETUNGSVEREINBARUNG | FACHLICH_ZU_LIEFERN |
| hauswirtschaft | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. VERGUETUNGSVEREINBARUNG | FACHLICH_ZU_LIEFERN |
| begleitservice | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. VERGUETUNGSVEREINBARUNG | FACHLICH_ZU_LIEFERN |
| einkaufsservice | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. VERGUETUNGSVEREINBARUNG | FACHLICH_ZU_LIEFERN |
| demenzbetreuung | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. VERGUETUNGSVEREINBARUNG | FACHLICH_ZU_LIEFERN |
| wegepauschale | FACHLICH_ZU_LIEFERN | ANERKENNUNGSBESCHEID o. MANUELL_FREIGEGEBEN | FACHLICH_ZU_LIEFERN |

### 2. Kassentarife (§39 SGB XI — Verhinderungspflege)
| Leistungsart | Preis (EUR) | Tarifquelle | Gueltig ab |
|---|---|---|---|
| alltagsbegleitung | FACHLICH_ZU_LIEFERN | wie oben | FACHLICH_ZU_LIEFERN |
| verhinderungspflege | FACHLICH_ZU_LIEFERN | wie oben | FACHLICH_ZU_LIEFERN |

### 3. Privattarife (rechtsgrundlage='privat')
| Leistungsart | Preis (EUR) | Tarifquelle | Gueltig ab |
|---|---|---|---|
| alltagsbegleitung | FACHLICH_ZU_LIEFERN | PRIVATE_PREISLISTE | FACHLICH_ZU_LIEFERN |
| hauswirtschaft | FACHLICH_ZU_LIEFERN | PRIVATE_PREISLISTE | FACHLICH_ZU_LIEFERN |

### 4. IK-spezifische Tarife (optional)
Wenn bestimmte Kassen abweichende Preise haben:
- IK-Nummer des Kostentraegers (9 Ziffern mit gueltiger Pruefziffer)
- Abweichender Preis
- Tarifquelle: VERGUETUNGSVEREINBARUNG oder KASSENVEREINBARUNG

### 5. Zuschlaege (optional)
Standardmaessig 0%. Nur setzen wenn tatsaechlich Zuschlaege vereinbart sind:
- zuschlag_wochenende_prozent
- zuschlag_feiertag_prozent
- zuschlag_nacht_prozent

---

## GO/NO-GO

### Merge nach main: BEDINGTES GO
**Bedingung:** Yusufs ausdrueckliche Freigabe.

Der Branch ist technisch vollstaendig:
- Alle Tests bestanden (531/531)
- Typecheck fehlerfrei
- P7-Sicherheitsluecke geschlossen
- Keine bestehenden Daten veraendert
- Keine erfundenen Preise

### Production-Deployment: NO-GO
**Grund:** Fachliche Tarif-Werte fehlen.

Vor dem Production-Deployment muss Yusuf liefern:
1. Echte Preise fuer alle Kassentarife (§45b, §39)
2. Echte Preise fuer Privattarife
3. Tarifquelle je Tarif (Anerkennungsbescheid, Verguetungsvereinbarung etc.)
4. Gueltig-ab-Datum
5. Optional: IK-spezifische Abweichungen
6. Optional: Zuschlaege

Erst wenn alle FACHLICH_ZU_LIEFERN-Felder befuellt sind, kann ein Production-Import erfolgen.

---

## Sicherheitshinweis

- Keine echten Patienten- oder Gesundheitsdaten verwendet
- Keine Tokens oder Passwoerter im Code oder Report
- Keine Production-Migration angewendet
- Keine bestehenden Rechnungen veraendert
- Keine erfundenen Preise als echte Stammdaten
- Production wurde ausschliesslich READ-ONLY geprueft (Schema + Zaehlungen)
