# Stripe-Setup Vorbereitung -- 3 Projekte, 1 Konto

> Stand: 2026-09-05 -- NUR Vorbereitung, kein Konto/Produkt erstellt.

---

## 1. Zentrale Stripe-Struktur

**Ein Stripe-Konto** fuer alle drei Projekte. Trennung ueber separate Produkte und Webhook-Endpunkte.

| Projekt | Typ | Stripe-Features |
|---|---|---|
| **Alltagsengel** | B2B SaaS (Organisationen) + B2C PflegeCoach | Subscriptions (recurring), Checkout, Portal, 2 getrennte Webhooks |
| **efy care** | B2B SaaS (Organisationen) | Subscriptions (recurring), Checkout, Portal, 1 Webhook |
| **ChairMatch** | B2B SaaS (Salons) + Marktplatz (Einzelzahlungen + Miete) | Subscriptions, One-Time Payments, Stripe Connect (Express), Refunds, Disputes, 1 Webhook |

**Reihenfolge:**
1. Testmode zuerst -- alle Produkte mit `sk_test_` anlegen
2. Webhook-Endpunkte registrieren
3. Secrets in Vercel / Supabase eintragen
4. Testlaeufe pro Projekt
5. Erst nach erfolgreichem Test: Live-Mode aktivieren und Keys tauschen

---

## 2. Benoetigte Products und Prices pro Projekt

### 2.1 Alltagsengel -- B2B-Abo (3 Tarife)

Code: `lib/stripe/config.ts` -- erwartet **3 Subscription-Produkte** mit monatlichem Preis.

| Plan | ENV-Variable | Typ | Preisvorschlag |
|---|---|---|---|
| **Starter** | `STRIPE_PRICE_STARTER` | recurring / month | TBD |
| **Pro** | `STRIPE_PRICE_PRO` | recurring / month | TBD |
| **Scale** | `STRIPE_PRICE_SCALE` | recurring / month | TBD |

Feature-Matrix (aus Code):
- Starter: max 50 Klienten, EDIFACT ja
- Pro: max 150 Klienten, EDIFACT + KI-Pruefung + eLeistungsnachweis
- Scale: unbegrenzt, alles + API-Zugriff

**Stripe-Produkte anlegen:**
1. Produkt "Alltagsengel Starter" -- 1 monatlicher Preis (EUR, recurring)
2. Produkt "Alltagsengel Pro" -- 1 monatlicher Preis (EUR, recurring)
3. Produkt "Alltagsengel Scale" -- 1 monatlicher Preis (EUR, recurring)

### 2.2 Alltagsengel -- PflegeCoach (2 Tarife, B2C)

Code: `lib/coach/pricing.ts` + `.env.example` -- **eigene** Stripe-Produkte, getrennt vom B2B-Abo.

| Tarif | ENV-Variable | Typ |
|---|---|---|
| Monatlich | `COACH_STRIPE_PRICE_MONATLICH` | recurring / month |
| Jaehrlich | `COACH_STRIPE_PRICE_JAEHRLICH` | recurring / year |

> ACHTUNG: Preise sind derzeit Platzhalter (`COACH_PREISE_FREIGEGEBEN=false`).
> Erst freischalten wenn kaufmaennisch entschieden.

**Stripe-Produkte anlegen:**
4. Produkt "PflegeCoach Monatlich" -- 1 monatlicher Preis
5. Produkt "PflegeCoach Jaehrlich" -- 1 jaehrlicher Preis

### 2.3 efy care (3 Tarife)

Code: `supabase/functions/_shared/stripe-config.ts` -- identische Tarifstruktur wie Alltagsengel B2B, aber **eigene** Price-IDs.

| Plan | ENV-Variable (Supabase Secret) | Typ |
|---|---|---|
| **Starter** | `STRIPE_PRICE_STARTER` | recurring / month |
| **Pro** | `STRIPE_PRICE_PRO` | recurring / month |
| **Scale** | `STRIPE_PRICE_SCALE` | recurring / month |

Feature-Matrix (aus Code):
- Starter: max 50 Klienten, EDIFACT ja
- Pro: max 150 Klienten, EDIFACT + KI-Pruefung + eLeistungsnachweis
- Scale: unbegrenzt, alles + API-Zugriff

**Stripe-Produkte anlegen:**
6. Produkt "efy care Starter" -- 1 monatlicher Preis
7. Produkt "efy care Pro" -- 1 monatlicher Preis
8. Produkt "efy care Scale" -- 1 monatlicher Preis

### 2.4 ChairMatch (3 Tarife + Einzelzahlungen)

Code: `src/lib/stripe.ts` + `scripts/stripe-setup.mjs` -- **anderes Tarifmodell** (Starter/Premium/Gold) mit monatlichen UND jaehrlichen Preisen.

| Plan | ENV-Variable | Typ | Monatlich | Jaehrlich (~17% Rabatt) |
|---|---|---|---|---|
| **Starter** | `STRIPE_PRICE_STARTER` | recurring | 29,00 EUR | 288,00 EUR (24 EUR/Mo) |
| **Premium** | `STRIPE_PRICE_PREMIUM` | recurring | 59,00 EUR | 588,00 EUR (49 EUR/Mo) |
| **Gold** | `STRIPE_PRICE_GOLD` | recurring | 99,00 EUR | 990,00 EUR (82,50 EUR/Mo) |

Zusaetzlich: **Einzelzahlungen** (One-Time, `price_data` dynamisch):
- Terminbuchungen (Betrag variabel, `mode: 'payment'`)
- Shop-Bestellungen (Betrag variabel, `mode: 'payment'`)
- Mietbuchungen (Stuhl/Liege/Raum, `mode: 'payment'`, 30 Min Ablauf)

**Stripe Connect (Express):** ChairMatch nutzt Connect fuer Salon-Auszahlungen. Salons werden als Express-Accounts angelegt (`stripe.accounts.create({ type: 'express' })`). Zahlungsmethoden: Card + SEPA.

**Stripe-Produkte anlegen:**
9. Produkt "ChairMatch Starter" -- monatlicher + jaehrlicher Preis
10. Produkt "ChairMatch Premium" -- monatlicher + jaehrlicher Preis
11. Produkt "ChairMatch Gold" -- monatlicher + jaehrlicher Preis

> TIPP: Das Script `chairmatch/scripts/stripe-setup.mjs` legt Produkte + Preise + Webhook automatisch an. Braucht nur `STRIPE_SECRET_KEY` in `.env.local`.

---

## 3. Webhook-Endpunkte

### 3.1 Alltagsengel -- B2B-Abo

| Feld | Wert |
|---|---|
| **URL** | `https://alltagsengel.care/api/stripe/webhook` |
| **Events** | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| **Secret-Variable** | `STRIPE_WEBHOOK_SECRET` |

### 3.2 Alltagsengel -- PflegeCoach

| Feld | Wert |
|---|---|
| **URL** | `https://alltagsengel.care/api/coach/webhook` |
| **Events** | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed` |
| **Secret-Variable** | `COACH_STRIPE_WEBHOOK_SECRET` |

> WICHTIG: Eigenes Signing Secret, NICHT dasselbe wie `STRIPE_WEBHOOK_SECRET`.

### 3.3 efy care

| Feld | Wert |
|---|---|
| **URL** | `https://nsfbwhpjesmathsrqkfi.supabase.co/functions/v1/stripe-webhook` |
| **Events** | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| **Secret-Variable** | `STRIPE_WEBHOOK_SECRET` (Supabase Function Secret) |

### 3.4 ChairMatch

| Feld | Wert |
|---|---|
| **URL** | `https://chairmatch.de/api/stripe/webhook` |
| **Events** | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated` |
| **Secret-Variable** | `STRIPE_WEBHOOK_SECRET` |

> ChairMatch hat die meisten Events wegen Marktplatz-Logik (Einzelzahlungen, Disputes, Connect).

---

## 4. Benoetigte ENV-Variablen / Supabase Secrets

### 4.1 Alltagsengel (Vercel)

| Variable | Wo setzen | Format | Beschreibung |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Vercel ENV (Production + Preview) | `sk_test_...` / `sk_live_...` | API-Geheimschluessel |
| `STRIPE_PUBLISHABLE_KEY` | Vercel ENV | `pk_test_...` / `pk_live_...` | Oeffentlicher Schluessel |
| `STRIPE_WEBHOOK_SECRET` | Vercel ENV | `whsec_...` | Signing Secret B2B-Webhook |
| `STRIPE_PRICE_STARTER` | Vercel ENV | `price_...` | Price-ID Starter |
| `STRIPE_PRICE_PRO` | Vercel ENV | `price_...` | Price-ID Pro |
| `STRIPE_PRICE_SCALE` | Vercel ENV | `price_...` | Price-ID Scale |
| `COACH_STRIPE_PRICE_MONATLICH` | Vercel ENV | `price_...` | Price-ID PflegeCoach monatlich |
| `COACH_STRIPE_PRICE_JAEHRLICH` | Vercel ENV | `price_...` | Price-ID PflegeCoach jaehrlich |
| `COACH_STRIPE_WEBHOOK_SECRET` | Vercel ENV | `whsec_...` | Signing Secret Coach-Webhook |

**Gesamt: 9 Variablen**

### 4.2 efy care (Supabase Function Secrets)

| Variable | Wo setzen | Format | Beschreibung |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `supabase secrets set --project-ref nsfbwhpjesmathsrqkfi` | `sk_test_...` / `sk_live_...` | API-Geheimschluessel |
| `STRIPE_WEBHOOK_SECRET` | Supabase Secrets | `whsec_...` | Signing Secret Webhook |
| `STRIPE_PRICE_STARTER` | Supabase Secrets | `price_...` | Price-ID efy Starter |
| `STRIPE_PRICE_PRO` | Supabase Secrets | `price_...` | Price-ID efy Pro |
| `STRIPE_PRICE_SCALE` | Supabase Secrets | `price_...` | Price-ID efy Scale |

Befehl zum Setzen aller Secrets auf einmal:
```
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_STARTER=price_... \
  STRIPE_PRICE_PRO=price_... \
  STRIPE_PRICE_SCALE=price_... \
  --project-ref nsfbwhpjesmathsrqkfi
```

**Gesamt: 5 Variablen**

> HINWEIS: efy care braucht KEINEN Publishable Key -- die Expo-App oeffnet Stripe Checkout per WebBrowser ueber die Edge Function.

### 4.3 ChairMatch (Vercel)

| Variable | Wo setzen | Format | Beschreibung |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Vercel ENV (Production + Preview) | `sk_test_...` / `sk_live_...` | API-Geheimschluessel |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel ENV | `pk_test_...` / `pk_live_...` | Oeffentlicher Schluessel (Client) |
| `STRIPE_WEBHOOK_SECRET` | Vercel ENV | `whsec_...` | Signing Secret Webhook |
| `STRIPE_PRICE_STARTER` | Vercel ENV | `price_...` | Price-ID Starter |
| `STRIPE_PRICE_PREMIUM` | Vercel ENV | `price_...` | Price-ID Premium |
| `STRIPE_PRICE_GOLD` | Vercel ENV | `price_...` | Price-ID Gold |

**Gesamt: 6 Variablen**

> WICHTIG: ChairMatch nutzt `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (mit NEXT_PUBLIC_ Prefix), Alltagsengel nutzt `STRIPE_PUBLISHABLE_KEY` (ohne Prefix). Nicht verwechseln.

---

## 5. Testmode-Konfiguration

### Schritt 1: Test-API-Keys holen
1. Stripe Dashboard oeffnen (https://dashboard.stripe.com)
2. Oben links: **"Test mode"** aktivieren (Toggle)
3. Developers -> API Keys -> Test-Keys kopieren:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

### Schritt 2: Test-Produkte anlegen
- Im Testmode Produkte und Preise erstellen (siehe Abschnitt 2)
- ODER fuer ChairMatch: `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs`

### Schritt 3: Webhook-Endpunkte im Testmode
- Fuer lokale Entwicklung: Stripe CLI nutzen (`stripe listen --forward-to localhost:3000/api/stripe/webhook`)
- Fuer Preview-Deployments: Webhook mit Preview-URL anlegen

### Schritt 4: Test-Zahlungen
- Karte: `4242 4242 4242 4242`, beliebiges Ablaufdatum, beliebige CVC
- SEPA: `DE89370400440532013000` (Test-IBAN)
- Fehlschlag-Test: `4000 0000 0000 0002` (Karte wird abgelehnt)

### Schritt 5: Live-Umstellung
1. Live-Keys (`sk_live_`, `pk_live_`) in Stripe holen
2. Live-Produkte und -Preise anlegen (separate IDs!)
3. Webhook-Endpunkte mit Live-Signing-Secret
4. Alle ENV-Variablen auf Live-Werte umstellen
5. Test-Checkout durchfuehren

---

## 6. Checkliste fuer heute Abend

### A. Stripe-Konto

- [ ] Stripe-Account erstellen unter https://dashboard.stripe.com/register
- [ ] Firma: "Alltagsengel UG" (oder das UG das alle drei betreibt)
- [ ] E-Mail: Firmen-E-Mail verwenden
- [ ] KYC / Identitaetspruefung starten (kann Tage dauern -- nicht blockierend fuer Testmode)

### B. Testmode aktivieren und Keys holen

- [ ] Test mode einschalten (Toggle oben links)
- [ ] `sk_test_...` kopieren
- [ ] `pk_test_...` kopieren

### C. Produkte und Preise anlegen (Testmode)

**Alltagsengel B2B:**
- [ ] Produkt "Alltagsengel Starter" anlegen -> monatlicher Preis -> `price_...` notieren
- [ ] Produkt "Alltagsengel Pro" anlegen -> monatlicher Preis -> `price_...` notieren
- [ ] Produkt "Alltagsengel Scale" anlegen -> monatlicher Preis -> `price_...` notieren

**Alltagsengel PflegeCoach:**
- [ ] Produkt "PflegeCoach Monatlich" anlegen -> monatlicher Preis -> `price_...` notieren
- [ ] Produkt "PflegeCoach Jaehrlich" anlegen -> jaehrlicher Preis -> `price_...` notieren

**efy care:**
- [ ] Produkt "efy care Starter" anlegen -> monatlicher Preis -> `price_...` notieren
- [ ] Produkt "efy care Pro" anlegen -> monatlicher Preis -> `price_...` notieren
- [ ] Produkt "efy care Scale" anlegen -> monatlicher Preis -> `price_...` notieren

**ChairMatch:**
- [ ] `STRIPE_SECRET_KEY=sk_test_... node chairmatch/scripts/stripe-setup.mjs` ausfuehren (legt automatisch 3 Produkte + 6 Preise + Webhook an)
- [ ] ODER manuell: Starter (29 EUR/Mo, 288 EUR/Jahr), Premium (59 EUR/Mo, 588 EUR/Jahr), Gold (99 EUR/Mo, 990 EUR/Jahr)

### D. Webhook-Endpunkte registrieren

Stripe Dashboard -> Developers -> Webhooks -> "Add endpoint":

- [ ] **Endpoint 1:** `https://alltagsengel.care/api/stripe/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Signing Secret notieren -> `STRIPE_WEBHOOK_SECRET` (Alltagsengel)

- [ ] **Endpoint 2:** `https://alltagsengel.care/api/coach/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
  - Signing Secret notieren -> `COACH_STRIPE_WEBHOOK_SECRET`

- [ ] **Endpoint 3:** `https://nsfbwhpjesmathsrqkfi.supabase.co/functions/v1/stripe-webhook`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Signing Secret notieren -> `STRIPE_WEBHOOK_SECRET` (efy care)

- [ ] **Endpoint 4:** `https://chairmatch.de/api/stripe/webhook` (ggf. vom Script angelegt)
  - Events: siehe Abschnitt 3.4 (alle 15 Events)
  - Signing Secret notieren -> `STRIPE_WEBHOOK_SECRET` (ChairMatch)

### E. Secrets eintragen

**Alltagsengel (Vercel -> Settings -> Environment Variables):**
- [ ] `STRIPE_SECRET_KEY` = `sk_test_...`
- [ ] `STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
- [ ] `STRIPE_WEBHOOK_SECRET` = `whsec_...` (Endpoint 1)
- [ ] `STRIPE_PRICE_STARTER` = `price_...`
- [ ] `STRIPE_PRICE_PRO` = `price_...`
- [ ] `STRIPE_PRICE_SCALE` = `price_...`
- [ ] `COACH_STRIPE_PRICE_MONATLICH` = `price_...`
- [ ] `COACH_STRIPE_PRICE_JAEHRLICH` = `price_...`
- [ ] `COACH_STRIPE_WEBHOOK_SECRET` = `whsec_...` (Endpoint 2)

**efy care (Supabase CLI):**
- [ ] Alle 5 Secrets setzen (siehe Befehl in Abschnitt 4.2)

**ChairMatch (Vercel -> Settings -> Environment Variables):**
- [ ] `STRIPE_SECRET_KEY` = `sk_test_...`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
- [ ] `STRIPE_WEBHOOK_SECRET` = `whsec_...` (Endpoint 4)
- [ ] `STRIPE_PRICE_STARTER` = `price_...`
- [ ] `STRIPE_PRICE_PREMIUM` = `price_...`
- [ ] `STRIPE_PRICE_GOLD` = `price_...`

### F. Redeploy ausloesen

- [ ] Alltagsengel: Vercel -> Deployments -> Redeploy (damit neue ENV-Vars greifen)
- [ ] ChairMatch: Vercel -> Deployments -> Redeploy
- [ ] efy care: Supabase Edge Functions redeployen (`supabase functions deploy --project-ref nsfbwhpjesmathsrqkfi`)

### G. Stripe Connect (nur ChairMatch)

- [ ] Stripe Connect aktivieren: Dashboard -> Connect -> Get started
- [ ] Express Accounts aktivieren (Standard fuer ChairMatch)
- [ ] Branding konfigurieren (Logo, Farben)

---

## Zusammenfassung

| | Produkte | Preise | Webhooks | ENV-Vars |
|---|---|---|---|---|
| **Alltagsengel B2B** | 3 | 3 (monatlich) | 1 | 6 |
| **Alltagsengel Coach** | 2 | 2 (monatl. + jaehrl.) | 1 | 3 |
| **efy care** | 3 | 3 (monatlich) | 1 | 5 |
| **ChairMatch** | 3 | 6 (monatl. + jaehrl.) | 1 | 6 |
| **GESAMT** | **11** | **14** | **4** | **20** |

Alle drei Projekte teilen sich `sk_test_` / `sk_live_` -- aber jedes bekommt **eigene** Price-IDs und **eigene** Webhook-Signing-Secrets.
