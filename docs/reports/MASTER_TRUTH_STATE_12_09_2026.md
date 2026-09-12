# MASTER TRUTH STATE — 12.09.2026

**Erstellt:** 12.09.2026 | **Methode:** Ausschließlich Primärquellen (DB-Abfragen, git log, Live-Tests, Supabase MCP)
**Regel:** Keine alten Reports als Beweis. Jeder Wert in diesem Dokument wurde heute gemessen.

---

## 1. ALLTAGSENGEL

### 1.1 Codebasis
- **Letzter Commit:** `e22d0f09` — Priority Inbox, UTM-Fix, Marketing-Vorlagen, Ledger-Korrektur
- **Tests:** 10.315 vitest + 2.770 node:test = **13.085 grün**
- **Deploy:** Vercel auto-deploy auf main aktiv

### 1.2 Supabase (Project: nnwyktkqibdjxgimjyuq)
- **Tabellen:** 328
- **RLS Policies:** 1.063
- **SECURITY DEFINER Funktionen:** 131
- **Anon-Lesezugriff auf state_waitlist:** 0 Zeilen (RLS wirkt)
- **Anon-ausführbare Funktionen:** ~56 App-Funktionen + ~150 btree_gist Extension-Funktionen
  - App-Funktionen sind überwiegend Trigger-Funktionen (prevent_*, set_updated_at*, trg_*) und RLS-Helper
  - Gleiche Situation wie efy care: Entzug würde RLS-Policies von 200→42501 brechen
  - **KEIN Sicherheitsrisiko:** Trigger-Funktionen sind nur über INSERT/UPDATE/DELETE erreichbar, nicht direkt über PostgREST
- **Migration angewendet:** `20261104000000_state_waitlist_stufe_termin` — Status 'termin' im CHECK erlaubt

### 1.3 Heutige Änderungen (Commit e22d0f09)
1. **Priority Inbox** (`/admin/posteingang`): ROT >72h / ORANGE >48h / GELB >24h Farbsystem
2. **UTM-Attribution repariert:** Alle 6 Formulare nutzen jetzt `useUtm()` Hook
3. **16 E-Mail-Templates** in `email_templates` Tabelle geseedet, alle bestehen §45a- und 131€-Prüfung
4. **Marketing-Vorlagen:** `ANERKENNUNG_45A_LIEGT_VOR = false` Feature-Flag in `lib/marketing/vorlagen.ts:504`
5. **Ledger-Korrektur:** Entlastungsbetrag auf 131€ normiert

### 1.4 Vorherige Commits (11.09.2026, verifiziert)
- `57804545` — Schema.org, Geo-Koordinaten (26 Städte), /leistungen
- `841e08a3` — §45a-Bereinigung (49 Dateien), Chatbot-Prompt, Schutztest
- `1ac19a20` — Drip-Mail-Anrede, Preise entfernt, "150+" korrigiert

### 1.5 Offene Leads
- **50 offene Leads in state_waitlist** (gemessen über Admin-Inbox)
- **45 davon älter als 72h** (ROT)
- **Ältester Lead:** 58 Tage (1.404 Stunden) ohne Reaktion

### 1.6 SEO
- **26 Städte** mit korrekten Geo-Koordinaten und Bundesländern in `lib/seo/stadt-geo.ts`
- **/leistungen** Seite mit OfferCatalog Schema.org
- **§45a-Schutztest** prüft 37 Seiten auf verbotene Kassenversprechen

---

## 2. CHAIRMATCH

### 2.1 Codebasis
- **Letzter Commit:** `c507e9b` — CI gate fix, soft-404 measurement, listing read-error fix
- **Tests:** 1.830 grün
- **Deploy:** Vercel auto-deploy auf main aktiv

### 2.2 Supabase (Project: pwdbjqfpgumyfktbfswg)
- **Tabellen:** 81
- **RLS Policies:** 205
- **SECURITY DEFINER Funktionen:** 14
- **spatial_ref_sys:** REVOKE fehlgeschlagen — Tabelle gehört `supabase_admin`, postgres-Rolle kann nicht entziehen
  - **USER_ACTION_REQUIRED:** REVOKE im Supabase Dashboard SQL Editor ausführen
- **Service Role Key:** Rotiert, `.env.prod` Key gibt 401. psql-Passwort ebenfalls tot.
  - **USER_ACTION_REQUIRED:** Neuen Key im Supabase Dashboard holen

### 2.3 Heutige Änderungen (Commit c507e9b)
1. **CI-Bypass behoben:** Beide auto-merge Workflows (`auto-create-pr.yml`, `auto-merge.yml`) hatten keine CI-Abhängigkeit. Fix: `needs: verify` in beiden
2. **Deliberate-Failure-Probe:** Branch mit absichtlichem Fehler bewies, dass CI jetzt blockt
3. **Soft-404 Messung:** Hypothese über `loading.tsx` als Soft-404-Ursache widerlegt durch `next build`
4. **Listing Read-Error Fix:** `loadListing` gibt jetzt `gefunden`/`fehlt`/`lesefehler` zurück statt nur null
5. **Sitemap:** 153 URLs, alle HTTP 200

### 2.4 Offene Punkte
- **169 Euro-Literale** auf 20 öffentlichen Seiten, nur 7 mit `BUSINESS_DECISION_REQUIRED` Marker
- **12 orphaned `claude/*` Branches** — nicht gelöscht (könnten unreleased Work enthalten)
- **4 pending Migrations** — brauchen DB-Zugang (Service Key rotiert)

---

## 3. EFY CARE

### 3.1 Codebasis
- **Branch:** `haertung/anon-ausfuehrungsrechte` (2 Commits, Push ausstehend)
- **Tests:** 2.462 grün
- **Deploy:** Noch kein Produktiv-Deploy

### 3.2 Supabase (Project: nsfbwhpjesmathsrqkfi)
- **Tabellen:** 48
- **RLS Policies:** 121
- **Anon-Perimeter-Test (scripts/anon-perimeter.mjs):**
  - Lesen ohne Anmeldung: 48/48 Tabellen gezäunt, 0 Zeilen
  - Schreiben ohne Anmeldung: 46/46 Tabellen gezäunt (42501)
  - Funktionen: 24 von 69 waren anon-ausführbar

### 3.3 Migration 20260912010000 (angewendet via MCP)
**8 Funktionen entzogen** (REVOKE ALL ... FROM public, anon):
1. `single_membership_org()` — SECURITY DEFINER, gibt Org des Aufrufers zurück
2. `is_org_admin_roh(uuid)` — SECURITY DEFINER, Admin-Check ohne Sperr-Prüfung
3. `dienstplan_zaehlt(text)` — Trigger-only (dienstplan_erzwingen)
4. `gesetzlicher_monatsbetrag(text)` — Trigger-only (budget_konto_erzwingen)
5. `nachweis_pfade_ok(uuid, text[])` — Trigger-only (leistungsnachweis_erzwingen)
6. `redact_audit_payload(jsonb)` — Trigger-only (audit_admin_action)
7. `storage_pfad_ok(uuid, text)` — Trigger-only (qm/rechnungspaket_pfad_erzwingen)
8. `vorgabe_hoechstsaetze()` — Trigger-only (create_default_hoechstsaetze)

**16 Funktionen bewusst offen gelassen:** In RLS Policies verwendet, Entzug würde 42501 statt leerer Ergebnisse erzeugen.

**CI-Pin:** `__tests__/shadow-db/anon-ausfuehrungsrechte.test.ts` nagelt die Menge fest — neue Funktionen ohne REVOKE brechen die CI.

**Wichtig:** Erster Anlauf mit `REVOKE ... FROM anon` allein änderte NICHTS — PUBLIC-Grant persistierte. Fix: `FROM public, anon`.

### 3.4 Offene Punkte
- **Apple Developer 403:** Team J6H5J2XVL7 blockiert
- **sync_conflicts Screen:** Server ready, UI fehlt (nächstes unblockiertes Feature)

---

## 4. GENEHMIGUNG / DOKUMENTENMATRIX

### 4.1 Status
Dokumentenmatrix erstellt (`dokumente_matrix_12_09_2026.md` in Downloads).

### 4.2 Identifizierte Lücken

| Dokument | Status |
|---|---|
| Gewerbeanmeldung | Nachfrage nötig — Text vorbereitet, nicht gesendet |
| Betriebshaftpflicht | Fehlend |
| Führungszeugnis Sabrina | Abgelaufen |
| FZ/AV Rukiye | Fehlend |
| Datenschutzkonzept | Fehlend |
| Schulungskonzept | Fehlend |
| IK-Nummer | 460629986, gültig ab 16.07.2026 |
| D-U-N-S | 316856461, verifiziert |

---

## 5. SECURITY-ZUSAMMENFASSUNG (alle 3 Projekte)

| Projekt | Tabellen | RLS Policies | SEC DEFINER | Anon-Lesen | Anon-Schreiben | Aktion heute |
|---|---|---|---|---|---|---|
| Alltagsengel | 328 | 1.063 | 131 | 0 Zeilen | Blocked | Migration termin-Status |
| ChairMatch | 81 | 205 | 14 | Gezäunt | Blocked | CI-Bypass gefixt |
| efy care | 48 | 121 | — | 0 Zeilen | 42501 | 8 Funktionen entzogen |

### Verbleibendes Risiko
- **ChairMatch spatial_ref_sys:** Anon kann PostGIS-Referenztabelle lesen (kein Geschäftsdaten-Risiko, aber unsauber)
- **Alltagsengel ~56 App-Trigger-Funktionen:** Anon-EXECUTE offen, aber nur über Trigger erreichbar — kein direkter PostgREST-Aufruf möglich
- **efy care 16 RLS-Helper-Funktionen:** Bewusst offen, dokumentiert, CI-gepinnt

---

## 6. STEHENDE VERBOTE (aktiv, unverändert)

- GOOGLE_ADS_AUTOMATIC_ACTIVATION = FORBIDDEN
- FIRST_REAL_INVOICE_APPROVED = false
- Stripe = BLOCKED_EXTERNAL_STRIPE / DEFERRED
- ANERKENNUNG_45A_LIEGT_VOR = false
- Keine Preise erfinden → PRICE_DECISION_REQUIRED
- Keine Vercel-Prod-Flags ohne Genehmigung
- deploy.sh für alle Commits
- DejaVuSans für PDFs
- 131€/Monat Entlastungsbetrag
- Strato für Business-Mail, Gmail für privat
- Icons (Schild/Engel/Auto) heilig
- Keine persönlichen Namen in Kundenkommunikation
- Keine Termine vor 13:00
- E-Mails erst zeigen, dann senden

---

## 7. USER_ACTION_REQUIRED

1. **ChairMatch Supabase Dashboard:** Service Role Key + DB-Passwort erneuern
2. **ChairMatch Supabase Dashboard:** `REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, public` im SQL Editor
3. **Bankkarten-Scan (Dok 14):** CVV sichtbar — Datei sicher löschen
4. **efy care Apple Developer:** Team J6H5J2XVL7 Zugang klären

---

## 8. OFFENE AUFGABEN (Prioritätsreihenfolge)

1. **Kunden:** 50 offene Leads bearbeiten (45 davon ROT, ältester 58 Tage)
2. **Bewerber:** Manal + Violeta Groening Termine, Mohamed Semmami bearbeiten
3. **Kunden-Anfragen:** Sarune Veitaite + Birgit Fritzsch beantworten
4. **Marketing:** Pipeline operativ machen (Priority Inbox gebaut)
5. **SEO:** Blog-Zahlen aktualisieren (Verhinderungspflege 3.184€→3.539€)
6. **Genehmigung:** Fehlende Dokumente beschaffen
7. **Preise:** Engel-Vergütung klären (20€ vs 15-25€ vs 18-24€) → PRICE_DECISION_REQUIRED
8. **ChairMatch:** 169 Euro-Literale mit BUSINESS_DECISION_REQUIRED markieren
9. **efy care:** sync_conflicts UI bauen
10. **Regionale Expansion:** Noch nicht begonnen

---

*Dieser Report wurde ausschließlich aus Primärquellen erstellt: Supabase MCP execute_sql, git log, npm test, Live-HTTP-Probes. Keine alten Reports als Evidenz.*
