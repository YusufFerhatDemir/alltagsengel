# Supabase Auth-Hardening — manuelle Dashboard-Schritte

**Stand:** 2026-04-17
**Ziel:** Die Härtungen, die **nicht** per Code möglich sind (Supabase-Dashboard-only), zentral dokumentieren.

---

## Analogie

Code-Änderungen sind wie das Türschloss der Wohnung — liegen in deinem Repo.
Dashboard-Settings sind wie der Zahlencode der Hauseingangstür — die drehst du
manuell auf dem Supabase-Dashboard. Beide müssen zusammen passen, sonst ist
die Absicherung nur halb.

---

## 1. AUTH-010 — Email Link Expiry auf 1 Stunde

**Warum:** Supabase-Default ist 24h. Reset-Mail im Postfach bleibt einen
Tag lang exploit-fähig (geklautes Laptop, Phishing-Klick, Mail-Client-Hijack).

**Wo:**
Supabase-Dashboard → Project `nnwyktkqibdjxgimjyuq` → **Authentication** →
**Providers** → **Email** → *Email OTP Expiration* / *Magic Link Expiry*.

**Setzen auf:**
- Email OTP Expiration: **3600** Sekunden (1h)
- Magic Link (falls separat) ebenfalls **3600** Sekunden

**Verifikation:**
Nach Speichern per Passwort-Reset testen: Link erhalten, 65 Minuten warten,
Link klicken → sollte `Token expired` zeigen.

---

## 2. Rate-Limits (optional, Supabase-seitig)

Supabase hat eigenes Rate-Limiting pro Projekt:
- Dashboard → **Authentication** → **Rate Limits**
- Empfohlene Werte (komplementär zu unserem App-Level-Limiter):
  - **Sign up:** 30 / Stunde / IP
  - **Sign in:** 30 / Stunde / IP
  - **Password recovery:** 5 / Stunde / Email

Diese Limits stapeln sich mit unserem eigenen Limiter (`app/api/auth/check-rate-limit/route.ts`).

---

## 3. Leaked-Password-Protection aktivieren

Dashboard → **Authentication** → **Providers** → **Email** → **"Prevent use of leaked passwords"** → **Enable**.

Das checkt neue Passwörter gegen HaveIBeenPwned via k-anonymisierten
SHA1-Range-Lookup. Greift ab sofort für `signUp` + `updateUser`.

**Entspricht AUTH-011** aus dem Auth-Audit (dort war HIBP als TODO markiert —
durch Supabase-native Option einfach zu aktivieren, kein eigener Code nötig).

---

## 4. Site-URL + Redirect-URLs explizit whitelisten

Dashboard → **Authentication** → **URL Configuration**:
- **Site URL:** `https://alltagsengel.care`
- **Redirect URLs** (Whitelist):
  - `https://alltagsengel.care/auth/callback`
  - `https://alltagsengel.care/auth/callback/*`
  - `https://*.vercel.app/auth/callback` (für Preview-Deploys)
  - `http://localhost:3000/auth/callback` (für lokale Dev)

Ohne diese Whitelist könnten Angreifer ein Open-Redirect ausnutzen und
OAuth-Tokens auf fremde Domains umleiten.

---

## 5. Email-Template-Audit

Dashboard → **Authentication** → **Email Templates**:

| Template | Check |
|---|---|
| Confirm signup | Nutzen wir eigenes Resend-Template? → dann Supabase-Default deaktivieren, um Doppelmails zu vermeiden |
| Invite | Nur relevant wenn wir Invites nutzen |
| Magic Link | Deaktivieren wenn wir nur Passwort-Login wollen |
| Change Email Address | Prüfen dass Link-Expiry ≤ 1h |
| Reset Password | Unser Code nutzt `generateLink` + eigenes Template. Supabase-Default-Mail kann deaktiviert werden, damit User keine zwei Mails bekommt |

---

## 6. Auditing / Logs

Dashboard → **Authentication** → **Users** → Filter z.B. "Recently failed" —
gibt einen schnellen Überblick über Brute-Force-Muster.

Für dauerhafte Auth-Logs empfehle ich Supabase Log-Drain an Axiom oder
BetterStack zu hängen (siehe Supabase Docs → Project Settings → Log Drains).

---

## Checkliste (zum Abhaken nach Ausführung)

- [ ] Email-OTP-Expiry auf 3600s gesetzt
- [ ] Rate-Limits auf empfohlene Werte justiert
- [ ] "Prevent use of leaked passwords" aktiviert
- [ ] Redirect-URL-Whitelist gepflegt
- [ ] Doppelmail-Check (unser Template vs Supabase-Default)
- [ ] Log-Drain eingerichtet (optional, aber empfohlen)

Nach Abhaken: dieses Markdown-File mit Datum + Status im Commit festhalten.
