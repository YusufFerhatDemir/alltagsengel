# Phase 11 — Secrets & Env Beweis

**Gemessen am 30.08.2026**

## Committed Files Audit

| Repo | .env committed? | .env.example? |
|------|----------------|---------------|
| Alltagsengel | NEIN | .env.example, native/.env.example |
| ChairMatch | NEIN | .env.example |
| efy care | NEIN | app/.env.example |

**Kein einziges .env-File mit echten Secrets ist committed.**

## Precommit-Guard (scripts/precommit-guard.sh)

Blockiert automatisch:

1. `.env`-Dateien (außer `.env.example`)
2. `node_modules/`
3. Service-Account-JSON (`*-service-account*.json`, `*firebase-adminsdk*.json`)
4. Zertifikate (`*.pem`, `*.p12`, `*.keystore`)
5. Build-Outputs (`*.apk`, `*.aab`, `*.ipa`, `*.mobileprovision`)
6. Secret-Patterns im Diff:
   - `AKIA…` (AWS)
   - `sk_live_…` (Stripe)
   - `sk-proj-…` (OpenAI)
   - `re_…` (Resend)
   - `sb_secret_…` (Supabase)
   - Bearer-Tokens längerer Art

## Registrierte Env-Variablen (lib/env/register.ts)

50+ Variablen registriert. **Nur Namen, KEINE Werte im Code.**

### Infrastruktur
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, RESEND_API_KEY, CRON_SECRET

### Admin
ADMIN_ALLOWED_EMAILS, ADMIN_ALERT_EMAIL

### Billing-Sicherheit
RECHNUNGSVERSAND_AUTOMATISCH, MAHNVERSAND_AUTOMATISCH, VERSAND_NICHT_PRODUKTION_ERLAUBT, CAMT_IMPORT_MODE, PILOT_ERSTVERSAND_FREIGEGEBEN

### Compliance
PERIMETER_AUFBEWAHRUNG_AKTIV, ITSG_ZERTIFIZIERT, SGB_V_302_FREIGABE, KIM_AKTIV, VITALS_GRENZWERT_ALARME_AKTIV, ALLTAGSENGEL_IK

### DiPA/Coach (16 Variablen)
COACH_DIPA_MODUS, COACH_PREISE_FREIGEGEBEN, COACH_FREISCHALTUNG_PFLICHT, COACH_MFA_PFLICHT, COACH_NUTZUNGSNACHWEIS_AKTIV, COACH_PREIS_MONATLICH_CENT, COACH_PREIS_JAEHRLICH_CENT, COACH_TESTPHASE_*, COACH_STRIPE_*, COACH_CODE_PEPPER, COACH_STEUERNUMMER, COACH_UST_*

### Stripe
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_SCALE

### Push/Messaging
NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN

### Verschlüsselung
SECON_ZERT_PASSWORT, SECON_SFTP_PASSWORT_

## Bewertung

**PRODUCTION VERIFIED** — Keine Secrets committed, Precommit-Guard aktiv, alle Variablen nur als Namen registriert.
