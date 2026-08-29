# Phase 10 — DiPA Beweis

**Gemessen am 30.08.2026, live aus Production-DB**

## DiPA-Tabellen in Production (19 coach_* Tabellen)

| Tabelle | Existiert |
|---------|-----------|
| coach_users | ✓ |
| coach_activities | ✓ |
| coach_activity_log | ✓ |
| coach_anspruchspruefungen | ✓ |
| coach_assessments | ✓ |
| coach_audit_log | ✓ |
| coach_bestellungen | ✓ |
| coach_consents | ✓ |
| coach_freischaltcodes | ✓ |
| coach_freischaltungen | ✓ |
| coach_goals | ✓ |
| coach_measurements | ✓ |
| coach_nutzungsereignisse | ✓ |
| coach_pseudonym_key | ✓ |
| coach_rechnungen | ✓ |
| coach_reports | ✓ |
| coach_shares | ✓ |
| coach_zahlungen | ✓ |
| coach_abrechnungswege | ✓ |

## Env-Variablen (registriert, Namen)

| Variable | Zweck |
|----------|-------|
| COACH_DIPA_MODUS | DiPA-Betriebsmodus |
| COACH_PREISE_FREIGEGEBEN | Preisfreigabe |
| COACH_FREISCHALTUNG_PFLICHT | Freischaltungspflicht |
| COACH_MFA_PFLICHT | MFA für Coach |
| COACH_NUTZUNGSNACHWEIS_AKTIV | Nutzungsnachweis |
| COACH_PREIS_MONATLICH_CENT | Monatspreis |
| COACH_PREIS_JAEHRLICH_CENT | Jahrespreis |
| COACH_TESTPHASE_MONATLICH_TAGE | Testphase |
| COACH_STRIPE_PRICE_MONATLICH | Stripe-Preis |
| COACH_STRIPE_PRICE_JAEHRLICH | Stripe-Preis |
| COACH_STRIPE_WEBHOOK_SECRET | Stripe Webhook |
| COACH_CODE_PEPPER | Code-Pepper |
| COACH_STEUERNUMMER | Steuernummer |
| COACH_UST_ID_NR | USt-ID |
| COACH_UST_SATZ | USt-Satz |
| COACH_UST_KLEINUNTERNEHMER | Kleinunternehmer |

## Regulatorische Blocker (extern)

| Kategorie | Offen | Zuständigkeit |
|-----------|-------|---------------|
| Klasse A — BfArM-Antrag | 1 | BfArM |
| Klasse A — GKV-SV Verhandlung | 1 | GKV-SV |
| Klasse A — BSI Konformität | 1 | BSI |
| Klasse B — Intern technisch | 0 | — (DONE) |
| Klasse C — GF-Entscheidungen | 4 | Geschäftsführung |

## Bewertung

**TECHNICALLY VERIFIED** — 19 DiPA-Tabellen in Production. Klasse B intern abgeschlossen (0 offen). Klasse A regulatorisch blockiert (BfArM, GKV-SV, BSI). Klasse C wartet auf GF-Entscheidungen. Verkauf nicht möglich (regulatorisch).
