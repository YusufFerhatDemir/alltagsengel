# Alltagsengel — E-Mail-Marketing-Strategie & Setup-Plan

> Stand: Juni 2026 | Status: Kein bestehendes E-Mail-Marketing | Bestehende Infrastruktur: Next.js 16, Supabase, Resend (transaktionale Mails)

---

## 1. Tool-Empfehlung: Brevo (ehemals Sendinblue)

### Vergleich der Free-Tiers

| Kriterium | **Brevo** | MailerLite | Mailchimp |
|-----------|-----------|------------|-----------|
| Kontakte (Free) | **100.000** | 1.000 | 500 |
| E-Mails/Monat | 300/Tag (~9.000/Mo) | 12.000 | 1.000 |
| Automation | Ja (bis 2.000 Kontakte) | Ja | Nur Basic |
| Templates | 40+ Drag-and-Drop | Keine im Free-Tier | Ja |
| A/B-Testing | Nein (ab Starter) | Ja | Nein |
| Landing Pages | Nein (ab Business) | Ja | Nein |
| CRM | Ja (integriert) | Nein | Nein |
| Serverstandort | **EU** | **EU** (Litauen) | USA |
| DSGVO-konform | **Ja** (AV-Vertrag inklusive) | Ja | Kritisch (US-Server) |
| Double Opt-In | Nativ integriert | Nativ integriert | Manuell konfigurierbar |
| Branding entfernen | Kostenpflichtig | Ab Growing-Plan | Nein im Free |
| API / Webhooks | Vollständig | Ja | Ja |
| Transaktions-Mails | Ja (gleiches Konto) | Separat (MailerSend) | Kostenpflichtig |

### Empfehlung: Brevo

**Warum Brevo für Alltagsengel optimal ist:**

1. **100.000 Kontakte kostenlos** — Alltagsengel wächst; bei MailerLite wäre nach 1.000 Kontakten Schluss.
2. **EU-Datenhaltung + DSGVO-Garantie** — Brevo wirbt explizit mit DSGVO-Konformität. Mailchimp speichert auf US-Servern.
3. **Integriertes CRM** — Kunden (Pflegebox), Leads und Engel in einem System verwaltbar.
4. **API-first** — Lässt sich direkt mit dem bestehenden Supabase-Backend verbinden (Webhooks bei Signup, Automationen bei Statusänderungen).
5. **Transaktions-Mails inklusive** — Resend könnte langfristig durch Brevo ersetzt werden (ein System statt zwei).

**Wachstumspfad:** Free → Starter (ab 9 €/Mo für 5.000 E-Mails) → Business (ab 18 €/Mo mit Landingpages und A/B-Tests).

---

## 2. E-Mail-Sequenzen

### 2.1 Welcome-Sequenz (Neue Pflegebox-Kunden)

**Ziel:** Onboarding, Vertrauen aufbauen, Erstbestellung bestätigen.

| Tag | Betreff | Inhalt |
|-----|---------|--------|
| 0 | „Willkommen bei Alltagsengel — Ihre Pflegebox ist unterwegs" | Bestellbestätigung, nächste Schritte, kurze Vorstellung des Teams. Link zu FAQ. |
| 2 | „So funktioniert Ihre Pflegebox — 3 einfache Schritte" | Erklärung Lieferrhythmus, Produktauswahl anpassen, Kontakt bei Fragen. |
| 7 | „Ist alles angekommen? Ihre ersten Pflegetipps" | Check-in, 3 saisonale Pflegetipps, Link zum Blog. |
| 14 | „Kennen Sie schon unsere Alltagshilfe?" | Cross-Selling: Haushaltshilfe, Begleitservice, Einkaufshilfe vorstellen. |
| 30 | „Ihr erster Monat mit Alltagsengel — wie war's?" | Feedback-Anfrage (einfache Sternebewertung), Empfehlungs-Aktion: „Empfehlen Sie uns und erhalten Sie ein Dankeschön." |

**Automation-Trigger:** `profiles.role = 'kunde'` AND `created_at = heute` → Brevo-Kontakt erstellen, Welcome-Automation starten.

### 2.2 Nurture-Sequenz (Leads ohne Conversion)

**Ziel:** Leads aus dem LeadForm (`lead_inquiries`-Tabelle), die noch nicht Kunden wurden, zum Abschluss führen.

| Tag | Betreff | Inhalt |
|-----|---------|--------|
| 1 | „Ihre Anfrage bei Alltagsengel — so geht es weiter" | Bestätigung der Anfrage, Ansprechbarkeit zeigen, FAQ verlinken. |
| 4 | „Pflegebox: 0 € Eigenanteil dank Pflegekasse" | Kostenübernahme erklären, Vertrauenssiegel, Kundenstimmen. |
| 10 | „Was unsere Familien sagen" | 2–3 Testimonials, Fotos (mit Einwilligung), konkreter CTA: „Jetzt unverbindlich beraten lassen". |
| 18 | „Noch Fragen? Wir sind für Sie da" | Persönlicher Ton, Kontaktmöglichkeiten (Telefon, WhatsApp, E-Mail), „Kein Druck — wir helfen gern." |
| 30 | „Letzte Erinnerung: Ihr Pflegeanspruch wartet" | Sanfte Dringlichkeit, Link zur Bestellung, Option Newsletter statt Kauf. |

**Automation-Trigger:** Neuer Eintrag in `lead_inquiries` → Brevo-Kontakt mit Tag `lead` → Nurture-Automation starten. Stoppt automatisch bei Conversion (`profiles.role = 'kunde'`).

### 2.3 Monatlicher Newsletter

**Versand:** Erster Donnerstag im Monat, 10:00 Uhr.

**Template-Struktur:**

```
┌─────────────────────────────────────────────┐
│  [Logo: Alltagsengel]                       │
│  Monatlicher Newsletter — [Monat Jahr]      │
├─────────────────────────────────────────────┤
│                                             │
│  Überschrift: Saisonaler Aufhänger          │
│  (z.B. „Sommer-Pflege: Hitze & Hydration") │
│                                             │
│  📋 PFLEGETIPP DES MONATS                   │
│  Kurzer Artikel (150 Wörter), Link zum Blog │
│                                             │
│  🆕 NEUES BEI ALLTAGSENGEL                  │
│  Neue Services, Expansionen, Verbesserungen │
│                                             │
│  👼 ENGEL DES MONATS                        │
│  Kurzes Portrait (anonymisiert oder mit     │
│  Einwilligung), Motivation, Zitat           │
│                                             │
│  💡 WUSSTEN SIE SCHON?                      │
│  Pflegekassen-Tipp, Gesetzesänderung,       │
│  nützlicher Hinweis                         │
│                                             │
│  [CTA: Jetzt Pflegebox bestellen]           │
│                                             │
├─────────────────────────────────────────────┤
│  Impressum | Abmelden | Datenschutz         │
│  Alltagsengel — Ihr Partner in der Pflege   │
│  [Adresse] | [USt-IdNr.]                    │
└─────────────────────────────────────────────┘
```

**Inhaltsplan (Beispiel Q3 2026):**

- **Juli:** Sommer-Pflegetipps, Hitzeprävention, neue Regionen
- **August:** Urlaub & Pflege — Verhinderungspflege erklären, Engel-Recruiting-Push
- **September:** Herbst-Vorbereitung, Grippeimpfung-Reminder, Pflegegrad-Antrag-Tipps

### 2.4 Reaktivierungs-Sequenz (Inaktive Kunden)

**Trigger:** Kein Login/Bestellung seit 60 Tagen.

| Tag | Betreff | Inhalt |
|-----|---------|--------|
| 0 | „Wir vermissen Sie, [Vorname]!" | Erinnerung an Services, neue Features seit letztem Besuch. |
| 7 | „Ihr Pflegeanspruch: Nutzen Sie ihn?" | Erinnerung an Pflegekassen-Budget, das verfällt. Konkrete Euro-Beträge. |
| 14 | „Exklusiv: Kostenlose Beratung für Bestandskunden" | Persönliches Beratungsangebot, Telefonnummer, Terminbuchung. |
| 30 | „Feedback: Was können wir besser machen?" | Kurze Umfrage (3 Fragen), ehrliches Interesse zeigen. Bei keiner Reaktion → Frequenz reduzieren. |

### 2.5 Engel-Recruiting-Mails

**Zielgruppe:** Potenzielle Alltagshelfer (Leads aus Bewerbungsformular `EngelBewerbungForm`).

| Tag | Betreff | Inhalt |
|-----|---------|--------|
| 0 | „Willkommen im Alltagsengel-Team!" | Bewerbungseingang bestätigen, nächste Schritte erklären, Zeitrahmen. |
| 3 | „Was erwartet Sie als Alltagsengel?" | Vorteile: flexible Zeiten, faire Vergütung, sinnvolle Arbeit. Erfahrungsbericht eines aktiven Engels. |
| 7 | „So sieht ein Tag als Alltagsengel aus" | Konkreter Tagesablauf, Vielfalt der Aufgaben, Unterstützung durch das Team. |
| 14 | „Noch Fragen? Wir sind für Sie da" | FAQ für Bewerber, Kontakt zum Recruiting-Team, CTA: Bewerbung abschließen. |

---

## 3. Lead Capture — Integration in die Next.js-App

### 3.1 Bestehendes Setup

Alltagsengel hat bereits:
- `NewsletterSignup`-Komponente (`/components/NewsletterSignup.tsx`) — E-Mail-Erfassung
- `LeadForm`-Komponente (`/components/LeadForm.tsx`) — Name, Telefon, PLZ, Service
- Supabase-Tabellen: `newsletter_subscribers`, `lead_inquiries`
- Resend-Integration für Bestätigungsmails
- UTM-Parameter-Tracking

### 3.2 Brevo-Integration (empfohlen)

**Architektur:**

```
Nutzer → NewsletterSignup / LeadForm
         ↓
  Next.js API Route (/api/newsletter, /api/lead-inquiry)
         ↓
  ┌──────┴──────┐
  │  Supabase   │ → Quelle der Wahrheit (Kontakte, Consent-Log)
  └──────┬──────┘
         ↓ (Webhook / Server-Action)
  ┌──────┴──────┐
  │   Brevo     │ → E-Mail-Automationen, Kampagnen, Tracking
  └─────────────┘
```

**Implementierungsschritte:**

1. **Brevo-API-Key** in `.env.local`:
```env
BREVO_API_KEY=xkeysib-...
```

2. **Brevo-Sync-Utility** erstellen (`/lib/brevo.ts`):
```typescript
// Kontakt zu Brevo synchronisieren
export async function syncToBrevo(contact: {
  email: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string>;
  listIds: number[];
}) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: contact.email,
      attributes: {
        VORNAME: contact.firstName,
        NACHNAME: contact.lastName,
        ...contact.attributes,
      },
      listIds: contact.listIds,
      updateEnabled: true,
    }),
  });
  return res.json();
}
```

3. **Bestehende API-Routes erweitern** — nach Supabase-Insert zusätzlich `syncToBrevo()` aufrufen.

4. **Double-Opt-In via Brevo** — Brevo's nativen DOI-Workflow nutzen:
   - Signup → Brevo erstellt Kontakt als „unbestätigt"
   - Brevo sendet Bestätigungsmail
   - Nutzer klickt → Kontakt wird „bestätigt"
   - Webhook zurück an Supabase: `newsletter_subscribers.confirmed = true`

### 3.3 Schema-Erweiterung (Supabase)

```sql
-- Erweiterung: newsletter_subscribers
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brevo_id TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent_ip TEXT,
  ADD COLUMN IF NOT EXISTS consent_text TEXT DEFAULT 'Newsletter-Anmeldung über Website';

-- Neue Tabelle: email_campaigns (Tracking)
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brevo_campaign_id TEXT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  recipients_count INT DEFAULT 0,
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 Zusätzliche Lead-Capture-Punkte

| Stelle | Typ | Trigger |
|--------|-----|---------|
| Homepage Hero | Inline-Formular | Bestehendes `NewsletterSignup` nutzen |
| Blog-Artikel (Footer) | Banner-Variante | `<NewsletterSignup variant="banner" />` |
| Pflegebox-Landingpage | Exit-Intent-Popup | Neues Popup-Komponente mit E-Mail-Feld |
| FAQ-Seite | Inline nach Antworten | „Noch Fragen? Newsletter abonnieren" |
| 404-Seite | Soft-CTA | „Finden Sie nicht, was Sie suchen? Wir helfen." |
| Pflegegrad-Rechner | Ergebnis-Gate | E-Mail eingeben für detailliertes Ergebnis (Lead Magnet) |

---

## 4. DSGVO-Compliance — Checkliste

### 4.1 Pflichtanforderungen

| Anforderung | Status | Umsetzung |
|-------------|--------|-----------|
| **Double Opt-In** | ⚠️ Teilweise (Resend sendet Willkommensmail, aber kein echtes DOI) | Brevo's DOI-Workflow implementieren |
| **Einwilligung dokumentieren** | ⚠️ Nur `subscribed_at` gespeichert | IP, Zeitstempel, Consent-Text speichern |
| **Impressum in jeder Mail** | ❌ Nicht vorhanden | Footer-Template mit vollständigem Impressum |
| **Abmeldelink** | ✅ Vorhanden (`/api/newsletter/unsubscribe`) | Bestehenden Link in alle Mails einbauen |
| **Datenschutzerklärung** | ⚠️ Prüfen | Link zur Datenschutzseite in Footer |
| **AV-Vertrag mit Brevo** | ❌ Noch nicht vorhanden | Bei Brevo-Registrierung abschließen (kostenlos) |
| **EU-Serverstandort** | ✅ Brevo = EU | Automatisch erfüllt |
| **Widerrufsrecht** | ⚠️ Technisch ja, nicht kommuniziert | In jeder Mail + Datenschutzseite erklären |

### 4.2 Double-Opt-In-Ablauf

```
1. Nutzer trägt E-Mail ein
   → Consent-Text anzeigen: „Ich möchte den Newsletter der Alltagsengel
     erhalten und stimme der Datenschutzerklärung zu."
   → Checkbox (nicht vorausgewählt!)

2. Formular absenden
   → Supabase: Kontakt mit confirmed_at = NULL speichern
   → Brevo: Kontakt als „unbestätigt" anlegen
   → Bestätigungsseite: „Bitte bestätigen Sie Ihre E-Mail-Adresse."

3. Bestätigungsmail (von Brevo)
   → Betreff: „Bitte bestätigen Sie Ihre Newsletter-Anmeldung"
   → Absender: Alltagsengel <info@alltagsengel.care>
   → Inhalt: Bestätigungslink, Hinweis auf Widerruf
   → Unterschrift: Alltagsengel (NIEMALS persönliche Namen)

4. Nutzer klickt Bestätigungslink
   → Brevo: Kontakt wird „bestätigt"
   → Webhook → Supabase: confirmed_at = now(), consent_ip = IP

5. Welcome-Mail wird ausgelöst (erst nach Bestätigung!)
```

### 4.3 Pflicht-Footer für jede E-Mail

```html
<!-- DSGVO-konformer Footer -->
<div style="border-top: 1px solid #332E24; padding-top: 20px; margin-top: 30px;">

  <p style="font-size: 12px; color: #A89C8C;">
    Sie erhalten diese E-Mail, weil Sie sich für den Newsletter
    der Alltagsengel angemeldet haben.
  </p>

  <p style="font-size: 12px; color: #A89C8C;">
    <a href="{{unsubscribe_url}}" style="color: #C9963C;">
      Newsletter abbestellen
    </a> |
    <a href="https://alltagsengel.care/datenschutz" style="color: #C9963C;">
      Datenschutzerklärung
    </a> |
    <a href="https://alltagsengel.care/impressum" style="color: #C9963C;">
      Impressum
    </a>
  </p>

  <p style="font-size: 12px; color: #A89C8C;">
    <strong>Alltagsengel</strong><br>
    [Straße und Hausnummer]<br>
    [PLZ Stadt]<br>
    Telefon: [Telefonnummer]<br>
    E-Mail: info@alltagsengel.care<br>
    USt-IdNr.: [USt-IdNr.]
  </p>

</div>
```

### 4.4 Aufbewahrungspflichten

- **Consent-Nachweis:** Mindestens 3 Jahre nach Abmeldung aufbewahren.
- **Abmeldungen:** Sofort umsetzen (max. 48 Stunden). IP + Zeitstempel loggen.
- **Löschanfragen (Art. 17 DSGVO):** Kontaktdaten vollständig löschen. Consent-Log darf anonymisiert bleiben.

---

## 5. Template-Design — Alltagsengel-Branding

### 5.1 Design-System für E-Mails

**Farbpalette:**

| Verwendung | Farbe | Hex |
|------------|-------|-----|
| Hintergrund | Coal | `#1A1612` |
| Card-Hintergrund | Coal 2 | `#252118` |
| Akzent / CTAs | Gold | `#C9963C` |
| Gold Hover | Gold 2 | `#DBA84A` |
| Fließtext | Ink | `#F7F2EA` |
| Sekundärtext | Ink 2 | `#D4C8B8` |
| Metadaten / Footer | Ink 3 | `#A89C8C` |
| Erfolg | Grün | `#5CB882` |
| Fehler / Dringend | Rot | `#D04B3B` |
| Trennlinien | Coal 3 | `#332E24` |

**Typografie:**

| Element | Schrift | Gewicht | Größe |
|---------|---------|---------|-------|
| Hauptüberschrift (H1) | Cormorant Garamond | 600 (SemiBold) | 28–32px |
| Zwischenüberschrift (H2) | Cormorant Garamond | 600 | 22–24px |
| Fließtext | Jost | 400 (Regular) | 16px |
| CTA-Button | Jost | 600 (SemiBold) | 16px |
| Footer / Meta | Jost | 300 (Light) | 12–13px |
| Preheader | Jost | 400 | 14px |

**Hinweis:** Webfonts sind in E-Mails unzuverlässig. Fallback-Stack:
- Cormorant Garamond → Georgia, 'Times New Roman', serif
- Jost → -apple-system, 'Segoe UI', Roboto, sans-serif

### 5.2 CTA-Button-Stil

```html
<a href="{{cta_url}}" style="
  display: inline-block;
  background-color: #C9963C;
  color: #1A1612;
  font-family: Jost, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-weight: 600;
  font-size: 16px;
  padding: 14px 32px;
  border-radius: 8px;
  text-decoration: none;
  text-align: center;
">
  Jetzt Pflegebox bestellen
</a>
```

### 5.3 Template-Varianten

**A) Newsletter-Template**

```
┌─────────────────────────────────────────────┐
│  BG: #1A1612 (Coal)                         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Logo (zentriert, max 180px breit)  │    │
│  │  Preheader-Text (Ink3, 14px, Jost)  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Hero-Bild (600px breit, optional)  │    │
│  │  ─── Gold-Linie (#C9963C, 2px) ─── │    │
│  │                                     │    │
│  │  H1: Cormorant Garamond, Gold       │    │
│  │  Body: Jost, Ink, 16px              │    │
│  │  [CTA-Button: Gold BG, Coal Text]   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──── Card (BG: #252118) ────────────┐    │
│  │  H2: Cormorant, Ink                 │    │
│  │  Text: Jost, Ink2                   │    │
│  │  Link: Gold, underline              │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──── Card (BG: #252118) ────────────┐    │
│  │  H2: Cormorant, Ink                 │    │
│  │  Text: Jost, Ink2                   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ──── Trennlinie (#332E24) ──────────────  │
│                                             │
│  Footer: Ink3, Jost Light, 12px            │
│  [Abmelden] | [Datenschutz] | [Impressum]  │
│  Alltagsengel — Adresse — USt-IdNr.        │
│                                             │
└─────────────────────────────────────────────┘
```

**B) Transaktionsmail-Template (Welcome, Bestätigungen)**

Minimalistisch: Logo → Goldene Überschrift → Kurzer Text → CTA-Button → Footer. Keine Sidebar, keine Bilder. Max. 200 Wörter.

**C) Reaktivierungs-Template**

Wie Newsletter, aber mit auffälligerem Hero: Volle Breite Gold-Gradient-Header (#C9963C → #DBA84A), weißer Text, emotionaler Aufhänger.

### 5.4 Unterschrift in allen Templates

```
Herzliche Grüße
Ihr Team von Alltagsengel
```

**NIEMALS persönliche Namen.** Absender immer: `Alltagsengel <info@alltagsengel.care>`.

---

## 6. Umsetzungs-Roadmap

### Phase 1: Setup (Woche 1–2)

- [ ] Brevo-Konto erstellen (Free-Plan)
- [ ] AV-Vertrag (Auftragsverarbeitungsvertrag) mit Brevo abschließen
- [ ] API-Key generieren, in `.env.local` hinterlegen
- [ ] Brevo-Listen anlegen: `Kunden`, `Leads`, `Newsletter`, `Engel-Bewerber`
- [ ] Double-Opt-In-Template in Brevo konfigurieren
- [ ] Absender-Domain verifizieren (`alltagsengel.care` → SPF, DKIM, DMARC)

### Phase 2: Integration (Woche 2–3)

- [ ] `/lib/brevo.ts` implementieren (Sync-Utility)
- [ ] API-Routes erweitern: Newsletter-Signup → Brevo-Sync
- [ ] API-Routes erweitern: Lead-Inquiry → Brevo-Sync
- [ ] Supabase-Schema erweitern (Consent-Felder, Brevo-ID)
- [ ] Webhook-Endpoint: `/api/brevo/webhook` für DOI-Bestätigungen
- [ ] Bestehende Kontakte aus `newsletter_subscribers` zu Brevo importieren

### Phase 3: Templates & Sequenzen (Woche 3–4)

- [ ] E-Mail-Templates in Brevo erstellen (Newsletter, Transaktional, Reaktivierung)
- [ ] Welcome-Sequenz einrichten (5 Mails)
- [ ] Nurture-Sequenz einrichten (5 Mails)
- [ ] Engel-Recruiting-Sequenz einrichten (4 Mails)
- [ ] Footer mit Impressum + Abmeldelink in alle Templates einbauen

### Phase 4: Launch & Optimierung (Woche 4–5)

- [ ] Test-Versand an internes Team
- [ ] Ersten Newsletter versenden
- [ ] Reaktivierungs-Sequenz aktivieren
- [ ] UTM-Parameter für alle Links konfigurieren (`utm_source=brevo&utm_medium=email&utm_campaign=...`)
- [ ] Tracking: Öffnungsrate, Klickrate, Abmelderate monitoren

### Phase 5: Skalierung (ab Monat 2)

- [ ] Exit-Intent-Popup auf Landingpages
- [ ] Lead Magnet: Pflegegrad-Rechner mit E-Mail-Gate
- [ ] A/B-Tests für Betreffzeilen (ab Starter-Plan)
- [ ] Segmentierung nach Region, Pflegegrad, Service-Typ
- [ ] Automatische Geburtstags-/Jubiläums-Mails

---

## 7. KPIs & Erfolgsmessung

| KPI | Ziel (3 Monate) | Benchmark Pflege-Branche |
|-----|------------------|--------------------------|
| Listenwachstum | +200 Kontakte/Monat | — |
| Öffnungsrate | >35% | 25–30% (Healthcare) |
| Klickrate | >5% | 3–4% |
| Abmelderate | <0.5% | <1% |
| Conversion (Lead → Kunde) | >8% | 5–10% |
| Newsletter → Website-Traffic | >15% des Gesamt-Traffics | — |

---

## 8. Rechtliche Risiken & Vermeidung

| Risiko | Strafe | Vermeidung |
|--------|--------|------------|
| E-Mail ohne Einwilligung | Bis 300.000 € (UWG §7) | Nur bestätigte DOI-Kontakte anschreiben |
| Fehlendes Impressum | Abmahnung (~1.500–5.000 €) | Vollständiges Impressum in jedem Footer |
| Kein Abmeldelink | DSGVO-Verstoß + Abmahnung | Ein-Klick-Abmeldung in jeder Mail |
| Fehlender AV-Vertrag | DSGVO-Bußgeld | Bei Brevo-Setup sofort abschließen |
| Consent nicht nachweisbar | Beweislastumkehr (Art. 7 DSGVO) | IP, Zeitstempel, Text speichern |

---

*Erstellt: Juni 2026 | Nächste Überprüfung: September 2026*
*Unterschrift aller E-Mails: **Alltagsengel** — niemals persönliche Namen.*
