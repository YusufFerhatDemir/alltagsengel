# PflegeCoach — Zugangsstatus und Geschäftsmodell

**Stand:** 14.08.2026 · Grundlage: Code-Audit (Datei:Zeile-Belege) des am 14.08.2026 gebauten
Selbstzahler-Verkaufswegs und Geschäftsmodell-Korrektur vom selben Tag.

## Geschäftsmodell-Entscheidung (14.08.2026)

**PflegeCoach ist dauerhaft kostenlos für alle Endnutzer.**

- Kein Abonnement (monatlich/jährlich)
- Keine Stripe-Zahlung durch Nutzer
- Keine Paywall oder Zugangsschranke
- Monetarisierung ausschließlich über Pflegekassen-Erstattung nach tatsächlicher DiPA-Zulassung

**Wichtig:** Eine DiPA-Zulassung liegt derzeit NICHT vor. Bis zur tatsächlichen Zulassung wird
klar zwischen „kostenlos nutzbar" und „von Pflegekassen erstattungsfähig/zugelassen" unterschieden.
Kassenvergütung bleibt EXTERNAL_REQUIRED.

## Technischer Zugangs-Check

| # | Punkt | Status |
|---|---|---|
| 1 | Kostenloser Zugang für authentifizierte Nutzer | ✅ Kein Gate aktiv |
| 2 | `COACH_PREISE_FREIGEGEBEN` | ✅ `false` (Default) — kein Checkout möglich |
| 3 | `COACH_FREISCHALTUNG_PFLICHT` | ✅ `false` (Default) — kein Zugangs-Gate |
| 4 | `COACH_DIPA_MODUS` | ✅ `false` (Default) — keine DiPA-Funktionen aktiv |
| 5 | Produktseite erreichbar | ✅ `/pflegecoach/start` |
| 6 | Leistungsbeschreibung klar | ✅ `app/pflegecoach/start/page.tsx:164-197` |
| 7 | Datenschutzerklärung verlinkt | ✅ eigene Coach-Seite |
| 8 | AGB verlinkt | ✅ eigene Coach-AGB |
| 9 | noindex für geschützte Seiten | ✅ `app/pflegecoach/layout.tsx` |

## Selbstzahler-Infrastruktur (erhalten, aber deaktiviert)

Der Code enthält einen vollständigen Selbstzahler-Verkaufsweg, der als technische Infrastruktur
erhalten bleibt, aber **nicht für Endnutzer-Abonnements vorgesehen ist**:

| Komponente | Datei | Status |
|---|---|---|
| Preiskonfiguration (Platzhalter) | `lib/coach/pricing.ts` | Vorhanden, Verkauf fail-closed gesperrt |
| Checkout fail-closed | `istVerkaufBereit()`, 4 Sperren | ✅ Alle Sperren aktiv |
| Bestellbestätigung/Webhook | Danke-Seite mit Poll-Fenster | Vorhanden |
| Rechnungsnummer PC-YYYY-NNNNNN | `lib/coach/rechnung.ts` | Vorhanden |
| Widerrufsbelehrung verlinkt + versioniert | `WIDERRUFSBELEHRUNG_VERSION` | Vorhanden |
| Kaufstatus sichtbar | Konto-Seite | Vorhanden |
| Ein-Klick-Kündigung, §312k BGB | Kein Dark Pattern | Vorhanden |

Diese Komponenten blockieren keinen Nutzer (alle Gates deaktiviert) und werden nicht gelöscht,
da sie bei einer künftigen Umstellung (z.B. Pflegekassen-Integration) wiederverwendet werden könnten.

**Endnutzer-Abonnements sind nicht vorgesehen.** Die Platzhalter-Beträge in `lib/coach/pricing.ts`
(19 €/Monat, 190 €/Jahr) sind technische Testwerte und dürfen niemandem in Rechnung gestellt werden.

## Schalter-Kopplung (Punkt 12 — weiterhin relevant)

`schalteZugangFrei()` (`lib/coach/verkauf-server.ts:58-87`) und `istFreigeschaltet()`
(`lib/coach/freischaltung.ts:130-135`) sind korrekt implementiert, aber das Zugangs-Gate wird
nur ausgeführt wenn `COACH_FREISCHALTUNG_PFLICHT=true`. Da der PflegeCoach kostenlos ist,
bleibt dieser Schalter auf `false` — das Gate wird für niemanden geprüft, was dem gewünschten
Verhalten (freier Zugang für alle) entspricht.

## Admin-Zugriffsgrenze (Punkt 10)

Keine RLS-Policy gibt Admins Leserechte auf `coach_bestellungen`. Das ist eine bewusste
Design-Entscheidung (Privacy), keine Lücke. Operative Sicht über Stripe-Dashboard abgedeckt.

## Fazit

**Kostenloser Endnutzerzugang: JA** — bestätigt durch Code-Audit. Jeder authentifizierte,
einwilligende Nutzer hat vollen Zugang zum PflegeCoach ohne Zahlung. Es existiert keine
aktive Paywall, keine Bezahlschranke und kein Zugangs-Gate.
