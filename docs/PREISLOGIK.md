# Preislogik — Alltagsengel

## Drei Preisschichten

### 1. B2C-Kundenpreis (Marketplace)
**Quelle:** `lib/pricing/b2c-constants.ts`

| Konstante | Wert | Zweck |
|---|---|---|
| `CUSTOMER_HOURLY_RATE` | 32 EUR/h | Preis, den der Endkunde im Kunden-UI sieht |
| `PLATFORM_FEE_FACTOR` | 0,085 (8,5%) | Plattformgebühr auf den Stundensatz |
| `ENGEL_HOURLY_RATE` | 20 EUR/h | Vergütung des Alltagsbegleiters (Engel) |

**Verwendung:** Kunden-UI (Buchungsseiten, Profilansicht, Kartenansicht, Engel-Registrierung).
**Nicht verwenden für:** Kassenabrechnung, Leistungsnachweise, Rechnungen an Kostenträger.

### 2. B2B-Organisationspreise (Interne Kalkulation)
**Quelle:** Tabelle `service_pricing` (10 Einträge)

| Leistungsart | Kassenpreis (§45b/§39) | Privatpreis |
|---|---|---|
| Alltagsbegleitung | 35,00 EUR/h | 40,00 EUR/h |
| Betreuung nach §45a | 35,00 EUR/h | — |
| Hauswirtschaft | 35,00 EUR/h | 38,00 EUR/h |
| Begleitservice | 35,00 EUR/h | 40,00 EUR/h |
| Einkaufsservice | 35,00 EUR/h | — |

**Verwendung:** Leistungserfassung (Native App Fallback), interne Berechnungen.

### 3. Billing-Tarife (Kassenabrechnung / Invoice Engine)
**Quelle:** Tabelle `billing_tariffs` (23 Einträge)

Der Price Resolver (`lib/billing/core/price-resolver.ts`) verwendet diese Tabelle für die formale Rechnungserstellung. Die Auflösung erfolgt nach Spezifität:

1. Kostenträger-IK + Bundesland + Qualifikation + Vertrag (spezifischster)
2. Ohne Qualifikation
3. Ohne Vertrag
4. Ohne Bundesland (= Basis-Tarif, aktuell einzige Stufe)
5. Ohne Kostenträger
6. Kein Match → Fehler

**Aktuelle Tarife (bundesland-agnostisch):**

| Rechtsgrundlage | Leistungsarten | Preis | Tarifquelle |
|---|---|---|---|
| §45b SGB XI (Entlastung) | alle 8 Leistungsarten | 35,00 EUR/h | MANUELL_FREIGEGEBEN |
| §39 SGB XI (Verhinderung) | 4 Kernleistungen | 35,00 EUR/h | MANUELL_FREIGEGEBEN |
| privat | alle 9 Leistungsarten | 38–45 EUR/h | PRIVATE_PREISLISTE |
| Wegepauschale | §45b + privat | 5,00 EUR/Einsatz | MANUELL_FREIGEGEBEN/PRIVATE |

## Preisfluss im E2E-Prozess

```
Kunde bucht (B2C)          → CUSTOMER_HOURLY_RATE (32 EUR)
                             + PLATFORM_FEE (8,5%)
                             = Kunde zahlt 34,72 EUR/h

Engel wird vergütet        → ENGEL_HOURLY_RATE (20 EUR/h)

Kassenabrechnung (B2B)     → billing_tariffs (35 EUR/h)
                             → resolvePrice() → Invoice Engine
                             → Leistungsnachweis-PDF
                             → DTA/DAKOTA Export

Leistungserfassung (App)   → service_pricing Fallback (35 EUR/h)
                             → Wenn kein billing_tariff-Eintrag vorhanden
```

## Warum 32 EUR ≠ 35 EUR?

Der B2C-Preis (32 EUR) ist der **Marketplace-Preis** — was der Kunde direkt an die Plattform zahlt. Der B2B-Kassenpreis (35 EUR) ist der **Abrechnungspreis** gegenüber der Pflegekasse. Die Differenz ist die Plattformmarge, die Alltagsengel aus der Differenz zwischen Kassenerstattung und Engel-Vergütung finanziert.

## Tarifquelle-Werte

| Wert | Bedeutung | Wann umschalten? |
|---|---|---|
| `MANUELL_FREIGEGEBEN` | Aktuell: Tarif aus eigener Kalkulation, noch kein Anerkennungsbescheid | Standard bis zur Anerkennung |
| `ANERKENNUNGSBESCHEID` | Tarif durch Landesbehörde bestätigt (§45a-Anerkennung) | Nach Anerkennung pro Bundesland |
| `PRIVATE_PREISLISTE` | Privatpreis ohne Kassenbezug | Bleibt |
| `KASSENVEREINBARUNG` | Tarif aus Vergütungsvereinbarung mit Kasse | Nur bei §36/§43 relevant |
| `VERGUETUNGSVEREINBARUNG` | Tarif aus individueller Vereinbarung | Bei Sonderkonditionen |

## Bundesland-Expansion

Wenn ein neues Bundesland freigeschaltet wird:
1. `state_settings` → `kassentarife_enabled = true`, `anerkannt_am` setzen
2. Optional: Bundesland-spezifische Tarife in `billing_tariffs` einfügen (höhere Spezifität)
3. Bestehende Basis-Tarife (bundesland = NULL) greifen als Fallback

Der Trigger `enforce_kassentarif_freigeschaltet()` blockiert `ANERKENNUNGSBESCHEID`-Tarife, solange das Bundesland nicht freigeschaltet ist. `MANUELL_FREIGEGEBEN`-Tarife funktionieren immer.
