# AlltagsEngel.care — 360° App-Audit

**Stand:** 2026-04-17
**Methode:** Code-Review + Architektur-Analyse (kein Live-Testing in dieser Session)
**Scope:** Foundation (Security, Data, Perf) + Core-UX (User-Flows) + Growth (SEO, Conversion, Trust)

---

## Analogie zum Einstieg

Stell dir die App wie ein **Café** vor:

1. **Fundament** (Security, Datenbank, Auth) = Gebäudestatik + Küchenhygiene. Wenn das nicht stimmt, macht der ganze Rest keinen Spaß, egal wie gut der Kuchen schmeckt.
2. **Core-UX** (Flows Register → Buchung → Matching → Abrechnung) = Der Bestellprozess + die Bedienung. Auch mit bestem Kaffee kommt keiner wieder, wenn er 20 Minuten an der Kasse steht.
3. **Growth** (SEO, Analytics, Social-Proof, FAQ, CTA) = Schaufenster + Marketing. Bringt die Leute erst mal rein und überzeugt sie vor dem ersten Schluck.

Dieses Dokument ist die **Check-Liste**, die ich durch alle drei Ebenen gezogen habe — mit Prioritäten (P0 muss jetzt, P1 nächste Woche, P2 nice-to-have).

---

## Executive Summary

**Grün (solide gelöst):**
- SEO-Fundament steht: JSON-LD `LocalBusiness`-Schema, vollständige OpenGraph-Tags, Twitter-Card, Sitemap, robots.txt
- Consent-Mode v2 mit `denied`-Default korrekt implementiert (DSGVO-konform bis zur Zustimmung)
- Analytics-Stack komplett: GTM, Meta-Pixel, TikTok-Pixel — alle Consent-gated
- Landing-Page hat sticky CTA, 3-Step-Flow, Services, Preise, FAQ, SocialProof — Conversion-Basics da
- Auth P0-Fixes aus AUTH_AUDIT (AUTH-001/002/004/005) heute abgeschlossen: kein Klartext-Passwort per Mail, sanitized Error-Logs, Email-Enumeration-Prävention
- Sentry-Integration angeschlossen (DSN-Einrichtung siehe `SENTRY_SETUP.md`)

**Gelb (Lücken, die priorisiert werden sollten):**
- `AUTH-003`: Account-Löschung ohne Passwort-Re-Auth → akute Social-Engineering-Lücke, aber nicht triviale Ausnutzung
- Playwright-E2E-Tests lokal ausstehend (Sandbox konnte Chromium nicht installieren) → blockiert automatisches Regression-Monitoring
- Kein sichtbarer Prozess-Hinweis im Engel-Bereich (**heute behoben** mit EngelInfoBanner + `/engel/info`)
- Bundle-Size nicht gemessen (noch kein `next build --profile`-Report)

**Rot (sofort handeln):**
- Keine P0-Findings außerhalb der bereits abgeschlossenen Auth-Fixes.

---

## 1. Foundation — Security, Data, Performance

### 1.1 Authentication (Supabase)

| Finding | Status | Priorität |
|---|---|---|
| AUTH-001 Klartext-PW per Mail | ✅ behoben (Recovery-Link-Flow) | — |
| AUTH-002 Roh-Error-Objekte im Log | ✅ behoben (sanitized) | — |
| AUTH-004 Admin-Reset sendet PW | ✅ behoben (Recovery-Link) | — |
| AUTH-005 Email-Enumeration | ✅ behoben (unified errors + silent redirect) | — |
| AUTH-003 Delete-Account ohne Re-Auth | ⚠️ offen | P1 |
| AUTH-006..012 (s. AUTH_AUDIT.md) | ⚠️ teilweise offen | P1/P2 |

**Empfehlung:** AUTH-003 nächster Sprint. Ein Angreifer mit kurzem Gerät-Zugriff könnte sonst "Konto löschen" klicken und alle Engel-Daten/Dokumente unwiderruflich zerstören.

### 1.2 Data & Supabase

| Finding | Status | Priorität |
|---|---|---|
| RLS-Policies auf allen Tabellen? | unverifiziert in dieser Session | P1 |
| Profile-Email als Leak-Vektor? | abgesichert (kein PII an Sentry, `sendDefaultPii=false`) | — |
| Backups automatisch? | Supabase Pro = täglich, 7 Tage retention | ok |
| Rechte-Eskalation verhindert (admin/superadmin-Check)? | ✅ in `reset-password/route.ts` korrekt | — |

**Empfehlung:** In nächstem Sprint ein Script bauen, das alle RLS-Policies exportiert + als Matrix gegen die `tables.json` prüft (welche Tabelle ist ungeschützt?).

### 1.3 Performance

| Finding | Status | Priorität |
|---|---|---|
| `next build --profile` gemessen? | nein | P1 |
| Font-Optimierung (`next/font`) | ✅ verwendet | — |
| Image-Optimierung (`next/image`) | ✅ verwendet | — |
| First-Load-JS pro Route | nicht gemessen | P1 |
| Tree-Shaking (SocialProof, AppMockup) | unbekannt | P2 |

**Empfehlung:** `next build` lokal laufen und die First-Load-JS pro Route dokumentieren. Zielwerte: Landing <150 kB, App-Routes <200 kB.

### 1.4 Monitoring

| Finding | Status | Priorität |
|---|---|---|
| Sentry SDK installiert | ✅ | — |
| Sentry DSN eingerichtet | ⚠️ siehe `SENTRY_SETUP.md` — Aktion durch Nutzer | P0 (user-action) |
| PII-Filtering in Sentry | ✅ `sendDefaultPii: false`, header-stripping | — |
| Error-Boundary + Reset | ✅ app-wide | — |

---

## 2. Core-UX — User-Flows

### 2.1 Kunden-Flow

| Schritt | Status | Kommentar |
|---|---|---|
| Landing → CTA "Engel finden" | ✅ | sticky CTA auf mobile, 131€/Mo als Hook |
| Register → Rolle wählen | ✅ `/choose` | — |
| Register → Daten eingeben | ✅ | Email-Enumeration behoben |
| Login → Bestätigung fehlt-Case | ✅ | unified error |
| Buchung → Engel auswählen → bestätigen | ✅ | — |
| Abrechnung §45b | ✅ | 20€/h Engel, 32€/h Kunde |

### 2.2 Engel-Flow

| Schritt | Status | Kommentar |
|---|---|---|
| Register → Dokumente hochladen | ✅ | — |
| Verifizierung abwarten | ✅ | — |
| Online gehen | ✅ | Toggle in Home |
| Anfragen annehmen/ablehnen | ✅ | — |
| Prozess-/Datenschutz-Hinweis | ✅ **heute behoben** | EngelInfoBanner + `/engel/info` |

### 2.3 UX-Lücken (P1)

- **Admin**-Bereich hat noch keinen eigenen Info-Hinweis zum Datenzugriff-Umfang (sollten Admins ein Audit-Log haben?).
- Kunden-Profil zeigt bislang keinen Link zur Datenschutzerklärung innerhalb der App (nur im Footer der Landing).
- Newsletter-Signup + Referral-Widget sind vorhanden, aber nicht gemessen wie oft sie konvertieren.

---

## 3. Growth — SEO, Conversion, Trust

### 3.1 SEO

| Finding | Status |
|---|---|
| `<title>`, `<description>`, `canonical` | ✅ in `app/layout.tsx` |
| OpenGraph + Twitter-Card | ✅ |
| JSON-LD `LocalBusiness` | ✅ |
| `sitemap.ts`, `robots.ts` | vorhanden |
| hreflang (de/at/ch) | fehlt → P2 |
| Mobile-friendly viewport | ✅ |

### 3.2 Analytics

| Finding | Status |
|---|---|
| GTM | ✅ Consent-gated |
| Meta-Pixel | ✅ Consent-gated |
| TikTok-Pixel | ✅ Consent-gated |
| Server-Side-Events (Conversion API) | fehlt → P2 |

**Empfehlung:** Meta Conversion API nächster Sprint. Spart 10-20% Conversion-Tracking-Signal wegen iOS-ATT.

### 3.3 Conversion

- Sticky CTA mit "131€/Monat" als Hook ✅
- SocialProof-Komponente vorhanden ✅ (aber Daten dynamisch? nachprüfen)
- FAQ auf Landing mit 6 Items ✅
- 3-Step-Flow visualisiert ✅
- Trust-Signale: §45b-Badge, Versicherung, Zertifizierung → auf Engel-Seite jetzt explizit via `/engel/info`

### 3.4 Trust & Legal

| Finding | Status |
|---|---|
| `/datenschutz` | ✅ vollständig |
| `/impressum` | nicht geprüft — P1 |
| `/agb` | nicht geprüft — P1 |
| Cookie-Consent mit Opt-in | ✅ `CookieConsent`-Komponente |

---

## 4. Heute umgesetzt (Delta gegen letzten Stand)

- **`components/EngelInfoBanner.tsx`** — neu, dismissibler Hinweis mit 3-Step-Ablauf + Datenschutz-Micro-Copy, LocalStorage-Persistenz
- **`app/engel/info/page.tsx`** — neu, vollständige Erklärseite: Ablauf (5 Schritte), Datenschutz, Versicherung, Vergütung, Was-ja/was-nein, Kontakt
- **`app/engel/layout.tsx`** — Banner injiziert (additiv)
- **`app/engel/profil/page.tsx`** — Info-Sektion mit 2 Deep-Links (Info&Ablauf, Datenschutz)
- **`app/globals.css`** — ergänzte Styles (`.engel-info-banner-*`, `.info-step*`) — keine Überschreibungen bestehender Tokens
- **APP_AUDIT_360.md** (diese Datei)

---

## 5. Nächste Schritte (Priorisiert)

### P0 (diese Woche)
1. **Sentry-DSN setzen** in Vercel (siehe `SENTRY_SETUP.md`) — ohne DSN kein Monitoring
2. **Playwright lokal** auf deinem Mac: `npm run test:e2e:install && npm run test:e2e` — verifiziert AUTH-005/011 Regressions

### P1 (nächste 2 Wochen)
1. `AUTH-003` — Re-Auth vor Konto-Löschung (Passwort-Eingabe als Confirm-Schritt)
2. `next build --profile` Report + Bundle-Size-Optimierung (Ziel: Landing <150 kB)
3. RLS-Policy-Matrix: Script das alle Tabellen gegen ihre Policies prüft
4. `/impressum` + `/agb` gegen aktuelle Rechtsprechung prüfen

### P2 (Backlog)
1. hreflang de/at/ch
2. Meta Conversion API (Server-Side-Tracking)
3. Admin-Audit-Log (wer hat wann auf was zugegriffen)
4. SocialProof dynamisch statt statisch

---

## 6. Was wir bewusst *nicht* gemacht haben

Diese Session war **Code-Review + Additive-Implementation**, kein Live-Browser-Test.
Folgende Szenarien solltest du manuell durchklicken, bevor du "fertig" fühlst:

1. **Engel-Onboarding:** Neuer Account → Dokumente hochladen → warten auf Verify → online gehen → Info-Banner erscheint beim ersten Login, verschwindet nach "Verstanden", kommt nicht wieder.
2. **Link-Test:** Auf `/engel/home` den "Details & Versicherung →"-Link klicken → landet auf `/engel/info` → "←"-Back-Button funktioniert.
3. **Profil-Info-Section:** `/engel/profil` → scrolle runter zu "Info & Hilfe" → Beide Links funktionieren (Ablauf, Datenschutz).
4. **LocalStorage-Clear-Test:** DevTools → Application → Local Storage → `engel-info-banner-dismissed` löschen → Reload → Banner wieder da.

Wenn einer dieser 4 Steps scheitert, gib Bescheid — ich fixe direkt.
