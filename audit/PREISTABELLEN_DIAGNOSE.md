# Preistabellen-Diagnose

**Datum:** 2026-08-07
**Typ:** Read-only-Analyse (keine Aenderungen)
**Branch:** feature/unified-invoice-creation

---

## Ergebnis: Drei parallele Preissysteme

Alltagsengel betreibt aktuell drei unabhaengige Preistabellen, die in verschiedenen Teilen des Systems genutzt werden und NICHT synchronisiert sind.

---

## 1. `service_pricing` — Leistungserfassung (Native App)

**Genutzt von:**
- `native/src/app/einsatz/leistung-erfassen.tsx` — Stundensatz fuer Einsatzerfassung
- `app/api/pricing/route.ts` — Zentrale Preisauskunft fuer Web + Native
- `app/api/pricing/calculate/route.ts` — Betragsberechnung

**Spalten (14):**
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | uuid | PK |
| service_type | text | z.B. "alltagsbegleitung" |
| budget_type | text | z.B. "entlastung", "private" |
| description | text | Freitext |
| hourly_rate | numeric | Stundensatz in Euro |
| min_hours | numeric | Mindestzeit |
| billing_unit | text | "stunde" / "einsatz" |
| valid_from | date | Gueltig ab |
| valid_until | date | Gueltig bis (nullable) |
| is_active | boolean | Aktiv-Flag |
| organization_id | uuid | Mandanten-Filter |
| notes | text | Notizen |
| created_at | timestamp | |
| updated_at | timestamp | |

**Logik:** Einfacher Stundensatz × Dauer. Keine Zuschlaege, keine Kostentraeger-Spezifitaet, kein Bundesland-Matching.

**Bewertung:** Geeignet fuer die initiale Leistungserfassung durch Betreuungskraefte (Schnell-Kalkulation). NICHT geeignet fuer die korrekte Kassenabrechnung.

---

## 2. `leistungspreise` — Admin-Verwaltung

**Genutzt von:**
- `app/admin/leistungspreise/page.tsx` — Admin-UI zur Preisverwaltung
- Kein Code-Pfad fuehrt von leistungspreise zur Rechnungserstellung

**Spalten (9):**
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | uuid | PK |
| bundesland | text | z.B. "hessen" |
| leistungsart | text | z.B. "alltagsbegleitung" |
| preis_cent | integer | Preis in Cent |
| gueltig_ab | date | Gueltig ab |
| gueltig_bis | date | Gueltig bis (nullable) |
| organization_id | uuid | Mandanten-Filter |
| created_at | timestamp | |
| updated_at | timestamp | |

**Logik:** Bundesland + Leistungsart → Cent-Preis. Keine Zuschlaege, keine Kostentraeger-Spezifitaet.

**Bewertung:** Manuell verwaltete Referenztabelle. Wird von KEINEM aktiven Code-Pfad fuer Berechnungen genutzt. Dient aktuell nur als Nachschlagewerk fuer Administratoren.

---

## 3. `billing_tariffs` — Billing-Engine (Kassenabrechnung)

**Genutzt von:**
- `lib/billing/core/price-resolver.ts` — `resolvePrice()` + `calculateLineTotal()`
- `app/api/billing/tariffs/route.ts` — CRUD-API fuer Tarife

**Spalten (19):**
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | uuid | PK |
| organization_id | uuid | Mandanten-Filter |
| kostentraeger_ik | text | IK-Nummer des Kostentraegers |
| leistungsart | text | z.B. "alltagsbegleitung" |
| rechtsgrundlage | text | z.B. "§45b SGB XI" |
| bundesland | text | z.B. "hessen" |
| vertragsgebiet | text | Regional-Info |
| vertrag_referenz | text | Vertragsnummer |
| qualifikation | text | Qualifikation der Kraft |
| verguetungsart | text | Einheit / Pauschale |
| preis_cent | integer | Preis in Cent |
| einheit | text | "stunde" / "einsatz" |
| zuschlag_wochenende_prozent | numeric | Wochenend-Aufschlag |
| zuschlag_feiertag_prozent | numeric | Feiertags-Aufschlag |
| zuschlag_nacht_prozent | numeric | Nacht-Aufschlag |
| nacht_von | time | Nachtzeit-Beginn |
| nacht_bis | time | Nachtzeit-Ende |
| kombinations_abschlag_prozent | numeric | Kombinations-Abschlag |
| gueltig_ab | date | Gueltig ab |
| gueltig_bis | date | Gueltig bis (nullable) |

**Logik:** Spezifitaets-Score (Kostentraeger +10, Bundesland +5, Qualifikation +3, Vertrag +2). Zuschlaege fuer Wochenende, Feiertag, Nacht (kumulativ). Rechtsgrundlagen-basiert.

**Bewertung:** Das einzige System, das fuer korrekte Kassenabrechnung nach SGB XI geeignet ist. Unterstuetzt alle Anforderungen: Kostentraeger-spezifische Preise, regionale Unterschiede, Zuschlaege, Rechtsgrundlagen.

---

## Datenfluss-Analyse

```
Leistungserfassung (Native App)
  └─ service_pricing.hourly_rate × Dauer → service_records.amount
       │
       ├─ [ALT: Direkt-Insert] → invoices + invoice_items (Browser-Betraege)
       │
       └─ [NEU: Billing-Engine] → createInvoiceDraft()
            └─ Nimmt service_records.amount (NICHT resolvePrice!)
               └─ invoices + invoice_items (DB-Betraege)
```

### Kritische Beobachtung

`createInvoiceDraft()` in `invoice-engine.ts` verwendet aktuell **NICHT** den Price-Resolver (`resolvePrice`). Stattdessen uebernimmt es `amount` direkt aus `service_records`:

```typescript
// invoice-engine.ts, Zeile 159
const totalAmount = records.reduce((sum, r) => sum + Number(r.amount || 0), 0);
```

Das bedeutet: Der Betrag wird durch `service_pricing` bestimmt (bei der Leistungserfassung), nicht durch `billing_tariffs` (bei der Rechnungserstellung). Die Billing-Engine aggregiert nur, was bereits in der DB steht.

---

## Risiken

| Risiko | Schwere | Beschreibung |
|--------|---------|-------------|
| Preis-Inkonsistenz | HOCH | service_pricing und billing_tariffs koennen unterschiedliche Preise enthalten |
| Kein Soll/Ist-Abgleich | MITTEL | Kein automatischer Vergleich zwischen Erfassungspreis und Abrechnungspreis |
| leistungspreise verwaist | NIEDRIG | Admin-Tabelle ohne Anbindung an Geschaeftslogik |
| Zuschlaege ignoriert | HOCH | Wochenend-/Feiertags-/Nachtzuschlaege aus billing_tariffs werden bei der Rechnungserstellung nicht angewendet |
| Kein Audit bei Preisaenderungen | MITTEL | Preisaenderungen in service_pricing/leistungspreise haben keinen Audit-Trail |

---

## Empfehlung (NICHT in dieser PR umgesetzt)

### Phase 1 — Kurzfristig (naechste PR)
1. `resolvePrice()` in `createInvoiceDraft()` integrieren: Beim Erstellen einer Rechnung den Tarif aus `billing_tariffs` aufloesen und mit `service_records.amount` vergleichen (Soll/Ist-Abgleich)
2. Bei Abweichung > Toleranz: Warnung im Rechnungsentwurf

### Phase 2 — Mittelfristig
1. `service_pricing` als Schnell-Kalkulation beibehalten (Native App)
2. `billing_tariffs` als verbindliche Abrechnungsgrundlage etablieren
3. `leistungspreise` als Referenztabelle beibehalten oder mit `billing_tariffs` zusammenfuehren

### Phase 3 — Langfristig
1. Einheitliches Preissystem: `billing_tariffs` als Single Source of Truth
2. `service_pricing` liest aus `billing_tariffs` (View oder Sync)
3. `leistungspreise` als Admin-View auf `billing_tariffs`

---

## Sicherheitshinweis

Diese Diagnose ist rein lesend. Es wurden keine Tabellen geaendert, keine Daten migriert, keine Preise konsolidiert.
