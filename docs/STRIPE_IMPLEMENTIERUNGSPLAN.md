# Stripe-Integration — Implementierungsplan

> Stand: 01.08.2026 · Gilt für **Alltagsengel** (`nnwyktkqibdjxgimjyuq`) und **efy care** (`nsfbwhpjesmathsrqkfi`)

---

## Ausgangslage

Die `organization_subscriptions`-Tabelle ist auf beiden Datenbanken live. Sie hat bereits `stripe_customer_id`, `stripe_subscription_id`, `current_period_start/end` und `features` JSONB. Die Feature-Matrix (`PLAN_FEATURES`) und Preise (`PLAN_LABELS`) sind in `lib/organizations/types.ts` definiert. Es existiert **kein einziger Stripe-Code** im Projekt — alles wird von Grund auf gebaut.

---

## 1. Stripe-Konto einrichten

### 1.1 Produkte & Preise anlegen

Im Stripe-Dashboard (oder per API-Seed-Script) **ein Produkt pro App** mit **je 3 Prices** anlegen. Der `free`-Tarif bekommt **kein Stripe-Produkt** — er ist der Default ohne Zahlung.

```
Produkt: "Alltagsengel SaaS" (bzw. "efy care SaaS")
├── Price: starter  → 99,00 €/Monat  → recurring, EUR, interval: month
├── Price: pro      → 199,00 €/Monat → recurring, EUR, interval: month
└── Price: scale    → 349,00 €/Monat → recurring, EUR, interval: month
```

Jeder Price bekommt ein `metadata`-Feld:
```json
{ "plan": "starter", "app": "alltagsengel" }
```

Die Price-IDs (`price_xxx`) werden als Env-Vars gespeichert.

### 1.2 Env-Variablen

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price-IDs (aus Stripe-Dashboard kopiert)
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_SCALE=price_xxx
```

Auf **Vercel** für Preview (Test-Keys) und Production (Live-Keys) separat setzen.

### 1.3 Customer Portal konfigurieren

Im Stripe-Dashboard unter **Settings → Customer Portal**:
- Plan-Wechsel erlauben (nur zwischen starter/pro/scale)
- Kündigung erlauben (sofort oder am Periodenende)
- Zahlungsmethoden-Änderung erlauben
- Rechnungshistorie anzeigen

---

## 2. Codestruktur

### 2.1 Neue Dateien

```
lib/stripe/
├── client.ts          ← Stripe-SDK-Instanz (serverseitig)
├── config.ts          ← Price-ID → Plan Mapping, Typ-Guards
├── helpers.ts         ← getOrCreateStripeCustomer(), syncSubscription()

app/api/stripe/
├── checkout/route.ts  ← Checkout Session erstellen
├── portal/route.ts    ← Customer Portal Session erstellen
└── webhook/route.ts   ← Webhook-Handler (alle Events)
```

### 2.2 npm-Paket

```bash
npm install stripe
```

---

## 3. Implementierung Schritt für Schritt

### Schritt 1: Stripe-Client (`lib/stripe/client.ts`)

```typescript
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY fehlt')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-18.acacia',
  typescript: true,
})
```

### Schritt 2: Config mit Price-Mapping (`lib/stripe/config.ts`)

```typescript
import type { BillingPlan } from '@/lib/organizations/types'

export const PRICE_TO_PLAN: Record<string, BillingPlan> = {
  [process.env.STRIPE_PRICE_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_PRO!]:     'pro',
  [process.env.STRIPE_PRICE_SCALE!]:   'scale',
}

export const PLAN_TO_PRICE: Partial<Record<BillingPlan, string>> = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro:     process.env.STRIPE_PRICE_PRO!,
  scale:   process.env.STRIPE_PRICE_SCALE!,
}
```

### Schritt 3: Hilfsfunktionen (`lib/stripe/helpers.ts`)

Zwei zentrale Funktionen:

**`getOrCreateStripeCustomer(orgId)`** — Prüft ob die Org bereits eine `stripe_customer_id` hat. Falls nicht, erstellt einen Stripe Customer mit der Org-ID als Metadata und speichert die ID in `organization_subscriptions`.

**`syncSubscriptionToDb(stripeSubscription)`** — Nimmt ein Stripe Subscription-Objekt, extrahiert Plan aus dem Price, schreibt `plan`, `status`, `stripe_subscription_id`, `current_period_start/end` und `features` (aus `PLAN_FEATURES`) in die DB. Wird vom Webhook aufgerufen. Nutzt den Supabase `service_role`-Client (bypassed RLS).

### Schritt 4: Checkout-Route (`app/api/stripe/checkout/route.ts`)

```typescript
// POST { orgId, plan }
// → Erstellt Stripe Checkout Session
// → Gibt sessionUrl zurück

export async function POST(req: Request) {
  // 1. Auth prüfen (Supabase Session)
  // 2. Org-Ownership prüfen (nur owner/admin darf upgraden)
  // 3. getOrCreateStripeCustomer(orgId)
  // 4. stripe.checkout.sessions.create({
  //      customer: stripeCustomerId,
  //      mode: 'subscription',
  //      line_items: [{ price: PLAN_TO_PRICE[plan], quantity: 1 }],
  //      success_url: `${origin}/mis/settings?checkout=success`,
  //      cancel_url:  `${origin}/mis/settings?checkout=cancel`,
  //      metadata: { orgId },
  //      subscription_data: { metadata: { orgId } },
  //      allow_promotion_codes: true,
  //    })
  // 5. return { url: session.url }
}
```

**Wichtig:** `metadata: { orgId }` sowohl auf der Session als auch auf `subscription_data` setzen, damit der Webhook die Org zuordnen kann.

### Schritt 5: Portal-Route (`app/api/stripe/portal/route.ts`)

```typescript
// POST { orgId }
// → Erstellt Stripe Billing Portal Session
// → Gibt portalUrl zurück

export async function POST(req: Request) {
  // 1. Auth + Ownership prüfen
  // 2. stripe_customer_id aus DB lesen
  // 3. stripe.billingPortal.sessions.create({
  //      customer: stripeCustomerId,
  //      return_url: `${origin}/mis/settings`,
  //    })
  // 4. return { url: session.url }
}
```

### Schritt 6: Webhook-Handler (`app/api/stripe/webhook/route.ts`)

Das Kernstück. Verarbeitet alle relevanten Events.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { syncSubscriptionToDb } from '@/lib/stripe/helpers'

// Body-Parser deaktivieren (Stripe braucht den Raw-Body)
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 400 })
  }

  switch (event.type) {
    // Neues Abo gestartet
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        await syncSubscriptionToDb(sub)
      }
      break
    }

    // Abo geändert (Upgrade/Downgrade/Verlängerung)
    case 'customer.subscription.updated': {
      await syncSubscriptionToDb(event.data.object)
      break
    }

    // Abo gekündigt/abgelaufen
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const orgId = sub.metadata.orgId
      // → Plan auf 'free' setzen, Features auf PLAN_FEATURES.free
      await downgradeToFree(orgId)
      break
    }

    // Zahlung fehlgeschlagen
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      // → Status auf 'past_due' setzen
      // → Optional: E-Mail an Org-Owner
      break
    }
  }

  // Immer 200 zurückgeben (Stripe wiederholt sonst)
  return NextResponse.json({ received: true })
}
```

**Idempotenz:** `syncSubscriptionToDb` macht einen `UPSERT` auf `organization_subscriptions` anhand von `organization_id`. Doppelte Webhook-Zustellungen sind damit unproblematisch.

---

## 4. Feature-Enforcement (Runtime)

Bisher ist die Feature-Matrix rein deklarativ. Für echte Wirksamkeit brauchen wir eine **Prüffunktion**:

```typescript
// lib/organizations/features.ts

import { createServerClient } from '@/lib/supabase/server'
import { PLAN_FEATURES } from '@/lib/organizations/types'

export async function checkFeature(orgId: string, feature: string): Promise<boolean> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('organization_subscriptions')
    .select('features')
    .eq('organization_id', orgId)
    .single()

  return !!data?.features?.[feature]
}

export async function checkClientLimit(orgId: string): Promise<{ allowed: boolean; current: number; max: number | null }> {
  const supabase = await createServerClient()

  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from('organization_subscriptions').select('features').eq('organization_id', orgId).single(),
    supabase.from('klienten').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
  ])

  const max = sub?.features?.max_klienten as number | null
  const current = count ?? 0

  return { allowed: max === null || current < max, current, max }
}
```

**Einsatzpunkte:**
- `POST /api/klienten` → `checkClientLimit()` vor dem Anlegen
- EDIFACT-Export → `checkFeature(orgId, 'edifact')`
- KI-Prüfung → `checkFeature(orgId, 'ki_pruefung')`
- eL-NW → `checkFeature(orgId, 'elnw')`
- API-Zugang → `checkFeature(orgId, 'api')` im API-Key-Middleware

---

## 5. Dual-App-Strategie (Alltagsengel + efy care)

Beide Apps teilen denselben Code. Die Unterscheidung erfolgt über Env-Vars:

```env
# alltagsengel.de (Vercel Production)
STRIPE_PRICE_STARTER=price_ae_starter
STRIPE_PRICE_PRO=price_ae_pro
STRIPE_PRICE_SCALE=price_ae_scale

# efycare.de (separates Vercel Project oder Branch)
STRIPE_PRICE_STARTER=price_efy_starter
STRIPE_PRICE_PRO=price_efy_pro
STRIPE_PRICE_SCALE=price_efy_scale
```

Im Stripe-Dashboard werden zwei separate Produkte angelegt, aber der Code ist identisch. Jede App hat ihren eigenen Webhook-Endpoint in Stripe registriert.

---

## 6. UI-Komponenten

### 6.1 Pricing-Seite / Upgrade-Button

In `app/mis/settings/page.tsx` (oder eigene `/pricing`-Route):

```
[Free ✓]  [Starter 99€]  [Pro 199€]  [Scale 349€]
           → Checkout      → Checkout   → Checkout
```

Klick auf einen bezahlten Plan → `POST /api/stripe/checkout` → Redirect zu Stripe.

### 6.2 Abo-Verwaltung

Wenn die Org bereits ein Stripe-Abo hat → Button „Abo verwalten" → `POST /api/stripe/portal` → Redirect zu Stripe Customer Portal. Dort kann der Kunde: Plan wechseln, kündigen, Zahlungsmethode ändern, Rechnungen einsehen.

### 6.3 Feature-Gates in der UI

```typescript
// Beispiel: EDIFACT-Button disabled wenn Feature nicht freigeschaltet
const sub = await getOrgSubscription(orgId)
const hasEdifact = sub?.features?.edifact === true

<Button disabled={!hasEdifact}>
  EDIFACT exportieren
  {!hasEdifact && <Badge>Pro</Badge>}
</Button>
```

---

## 7. Testing & Go-Live

### 7.1 Lokales Testing

```bash
# Stripe CLI installieren
brew install stripe/stripe-cli/stripe

# Webhook-Events an localhost weiterleiten
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Test-Events auslösen
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

### 7.2 Checkliste vor Go-Live

1. ✅ Test-Keys funktionieren end-to-end (Checkout → Webhook → DB-Update → Feature-Gate)
2. ✅ Webhook-Signatur wird geprüft
3. ✅ Idempotenz getestet (gleicher Event 2x senden → kein Doppel-Update)
4. ✅ Downgrade auf Free bei Kündigung funktioniert
5. ✅ `past_due`-Status wird korrekt gesetzt bei Zahlungsausfall
6. ✅ Customer Portal zeigt korrekte Pläne
7. ✅ Live-Keys in Vercel Production eingetragen
8. ✅ Webhook-Endpoint in Stripe Dashboard auf Production-URL umgestellt
9. ✅ `precommit-guard.sh` blockiert `sk_live_`-Leaks (bereits implementiert)

### 7.3 Reihenfolge der Umsetzung

```
Tag 1: Stripe-Client + Config + Helpers      → lib/stripe/*
Tag 2: Checkout-Route + Webhook-Handler       → app/api/stripe/*
Tag 3: Portal-Route + UI-Buttons              → Settings-Seite
Tag 4: Feature-Enforcement                    → checkFeature() + Gates
Tag 5: Stripe CLI Testing + Edge-Cases        → Lokale Tests
Tag 6: efy care Deployment                    → Zweites Vercel Project
```

---

## 8. Zusammenfassung

| Komponente | Zweck | Dateien |
|---|---|---|
| Stripe-Client | SDK-Instanz | `lib/stripe/client.ts` |
| Config | Price↔Plan Mapping | `lib/stripe/config.ts` |
| Helpers | Customer + Sync | `lib/stripe/helpers.ts` |
| Checkout | Neues Abo starten | `app/api/stripe/checkout/route.ts` |
| Portal | Self-Service | `app/api/stripe/portal/route.ts` |
| Webhook | Events verarbeiten | `app/api/stripe/webhook/route.ts` |
| Feature-Gate | Runtime-Prüfung | `lib/organizations/features.ts` |
| UI | Buttons + Gates | `app/mis/settings/page.tsx` |

**Stripe-Produkte:** 2 Produkte (AE + efy), je 3 Prices (starter/pro/scale). Free hat kein Stripe-Produkt.

**Kritische Events:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

**Kopplung Features↔Stripe:** Webhook empfängt Event → extrahiert Plan aus Price-ID → schreibt `PLAN_FEATURES[plan]` als JSONB in `organization_subscriptions.features` → Runtime-Code prüft `features`-Spalte.
