# Alltagsengel — Unabhängiger Re-Check, 19.08.2026

Frisch erhoben. **Keine Zahl aus einem früheren Bericht übernommen** — jeder Wert
in diesem Dokument stammt aus einem Lauf an diesem Tag gegen den Arbeitsbaum bzw.
gegen die Live-Datenbank.

## Rahmenbedingung, die das Ergebnis einordnet

Während dieses Re-Checks **arbeitete eine parallele Session aktiv im selben Repo.**
Nachweisbar: Commit `73c9ccc` („DiPA 14 Punkte + Simulationscheck") entstand
*mitten* im Lauf, dazu ~60 Dateien mit nicht-committeten Änderungen im
Arbeitsbaum (u. a. `app/api/visitor-alert/route.ts`, `components/PageTracker.tsx`,
`lib/*/api-auth.ts`, `app/api/reviews/route.ts`).

Konsequenz, ehrlich benannt:

* Die Testzahlen wurden **zweimal** erhoben und haben sich zwischen den Läufen
  geändert (5 Fehler → 1 Fehler), weil die Parallel-Session einen der Fehler
  selbst behoben hat. Es gilt der **zweite** Lauf.
* TypeScript, Lint und Build stammen aus dem **ersten** Zeitfenster und sind
  damit ein Snapshot, kein Dauerzustand.
* Es wurde bewusst **kein `deploy.sh`** mit `git add -A` ausgeführt — das hätte
  die In-Flight-Arbeit der anderen Session mitcommittet.

---

## Teil 1 — Die 12 Pflichtprüfungen

| # | Prüfpunkt | Ergebnis | Details | Status |
|---|-----------|----------|---------|--------|
| 1 | TypeScript | **0 Fehler** | `npx tsc --noEmit`, Exit 0, keine `error TS`-Zeile | **PASS** |
| 2 | Lint (App-Code) | **2 338 Probleme** (1 990 Fehler, 348 Warnungen) | `npx eslint app lib components hooks __tests__ types supabase`. Dominant: `no-explicit-any` 1 616, `no-unused-vars` 288, `react/no-unescaped-entities` 147 | **WARN** |
| 2b | Lint (`npm run lint`, wie konfiguriert) | **66 109 Probleme** (9 701 Fehler, 56 408 Warnungen) | Konfigurationsfehler, siehe B-1 | **FAIL** |
| 3 | Tests | **1 fehlgeschlagen / 3 157 bestanden / 38 übersprungen** (3 196), 159 Dateien | `npx vitest run`, zweiter Lauf. Der eine Fehler war ein veralteter Test, in diesem Re-Check behoben → danach **0 Fehler** | **PASS** (nach Fix) |
| 4 | Build | **Erfolg**, Exit 0 | `npm run build` (Turbopack). Compile 28,1 s. **579 statische Seiten**, 740 Zeilen Routen-Tabelle | **PASS** |
| 5 | Client-Side Writes | **8 echte Schreibaufrufe in 5 Dateien** | von 351 `'use client'`-Dateien nutzen 144 den Browser-Supabase-Client; 3 weitere Treffer waren `Set.delete/add`, keine DB-Writes. Details B-3 | **WARN** |
| 6 | Server Actions | **59 Dateien, 153 exportierte Funktionen** | 0 Inline-`'use server'` in Funktionsrümpfen — alles auf Dateiebene, sauber | **PASS** |
| 7 | Audit-Logging | **55 / 58 schreibende Action-Dateien loggen**; die 3 Ausnahmen schreiben *selbst* in `mis_auth_log` | Abdeckung faktisch 100 %. Aber: ein Aufrufer nimmt die Identität vom Client, siehe A-2 | **WARN** |
| 8 | Silent Catches | **164 Treffer, davon 139 `logAuditEvent(...).catch(() => {})`**, 2 in Tests, **23 echt still** | Die 23 liegen alle in Tracking/Telemetrie/UI. Der eigentliche Befund sind die 139, siehe A-3 | **WARN** |
| 9 | RLS (live) | **298 Tabellen, 872 Policies, RLS auf allen aktiv** | `npm run rls:matrix -- --check` gegen Produktion. 2 Tabellen ohne Policy: `_sql_parts`, `coach_pseudonym_key` — beide fail-closed (nur `service_role`), gewollt | **PASS** |
| 10 | org_fence / Guards | **345 / 385 API-Routen** mit Guard-Helfer | 21 Routen ohne Guard *und* ohne Auth. Nach Einzelprüfung: alle entweder bewusst öffentlich oder mit Guard in der Service-Schicht. Details B-2 | **PASS** |
| 11 | Secrets | **kein hartkodiertes Geheimnis** | 2 535 getrackte Dateien, 11 Muster (JWT, `sb_secret`, OpenAI, Resend, Stripe, AWS, GCP, GitHub, PEM, Passwort-Literale). 9 Treffer = 8 Test-Fixtures + 1 Firebase-Client-Key. Keine `.env` in Git, keine Historie-Treffer | **PASS** |
| 12 | Migration-Drift | **kein echter Drift** | 197 Migrationen (ohne Rollback) gegen Live-Schema. 639 statische `CREATE POLICY`, davon 67 live nicht unter dem Namen; 58 später explizit gedroppt, die restlichen **9 existieren live unter neuem Namen mit identischer Semantik** (einzeln nachgewiesen). 0 fehlende Tabellen | **PASS** |

### Zu Prüfung 12 — was „live umbenannt" konkret heißt

| Migration erwartete | live vorhanden | gleich? |
|---|---|---|
| `payments.payments_org_fence` | `org_fence_payments` — `organization_id = current_org_id()` | ja |
| `payment_allocations.alloc_org_fence` | `org_fence_payment_allocations` | ja |
| `payment_differences.diff_org_fence` | `org_fence_payment_differences` | ja |
| `dunning_entries.dunning_org_fence` | `org_fence_dunning_entries` | ja |
| `app_settings.app_settings_admin_all` | `app_settings_read` + `app_settings_update` | enger, siehe C-1 |
| `datenannahmestellen.…_admin_all` | `admin_das` + `org_fence_das` | ja |
| `fcm_tokens.fcm_tokens_eigene` | `Users can manage own fcm tokens` | ja |
| `push_subscriptions.…_eigene` | `Users can manage own subscriptions` | ja |
| `referrals.referrals_beteiligte_lesen` | 3 Policies (Admin / eigene / System-Insert) | ja |

---

## Teil 2 — Code-Review der geforderten Geschäftsflüsse

Geprüft wurde die **Logik**, nicht die Existenz.

| Fluss | Ergebnis | Status |
|---|---|---|
| **Kundenanlage** | `POST /api/admin/clients` → `requireAdmin()` + `getActiveOrgId()`; Feld-Allowlist gegen Mass-Assignment; `care_level` wird validiert und **auf `pflegegrad` gespiegelt** (deckt die bekannte Doppelspalte ab); `logAuditEvent`; Auto-Budget wird angelegt. UI unter `/admin/clients` ruft die Route real auf. Fallback bei `clients_status_check` (23514) ist dokumentiert. | **PASS** |
| **Mitarbeiteranlage** | `POST /api/personal/stammdaten` → `requirePersonalAdmin()` auf GET/POST/PATCH; Service-Schicht `lib/personal/stammdaten.ts:erstelleStammdaten`. UI `/admin/personal` hat „+ Neuen Mitarbeiter anlegen" mit echtem Formular. Anlage erfolgt ohne Einsatzfreigabe — korrekt getrennt. | **PASS** |
| **Einsatzplanung** | `POST/PATCH /api/einsatzplanung` → Admin-only; `pruefeClientFreigabe`, `pruefeEinsatzfreigabe` (inkl. abgelaufener Qualifikationen), `pruefeBudget` (VP-Variante bei Verhinderungspflege), Doppelbelegung → 409, org_fence auf allen Queries, `organization_id`/`id`/`created_by` aus dem Update-Body gestrippt, Audit-Log. `force_override` wird separat in `billing_audit_trail` protokolliert. | **PASS** |
| **Leistungsnachweis-Erfassung** | `/api/leistungsnachweis/crud` → Auth + Admin, Org-Zwang (403 ohne Org), Klient-Zugehörigkeit geprüft, **`tarifLeistungsart()`-Validierung mit 422** (schließt den Vokabular-Bruch service_type ↔ leistungsart), `mitStatusSync` hält `status` und `proof_status` konsistent. Rechnung verlangt `proof_status = 'UNTERSCHRIEBEN'` oder `signature_hash` — sonst `MISSING_SIGNATURE`, auch bei Privatkunden. | **PASS** |
| **Budget-Berechnung (131 €)** | Konstanten korrekt und **versioniert**: 2024 = 125 €/1 500 €, ab 2025 = **131 €/Monat, 1 572 €/Jahr**, §42a kombiniert 3 539 €. `budgetVersionFuerJahr()` ist fail-closed (wirft statt zu raten). `pruefeBudget()` ist ebenfalls fail-closed bei Lesefehler. **Aber: der Rechnungsweg prüft überhaupt kein Budget** → A-1. | **FAIL** |
| **Rechnungserstellung** | RPC `create_invoice_draft_atomic` (v9): Org-Zugehörigkeit des Klienten, Unterschriftspflicht, `tarif_status = 'verified'` erzwungen, `MISSING_VALID_TARIFF` / `AMBIGUOUS_TARIFF` mit Audit-Eintrag *vor* dem `RAISE`, Preis kommt aus `billing_tariffs` (nicht aus `service_records.amount`, Abweichung wird protokolliert), Checksummen im Audit-Trail. Solide — mit der Lücke aus A-1. | **WARN** |
| **Engel-Portal** | Alle geprüften Actions (`home`, `aufgaben`, `verfuegbarkeit`, `urlaub`, `chat`, `register`) haben `requireEngel()` mit Rollen-Whitelist, ermitteln die Org aus Mitgliedschaft/`caregivers`/`clients` und nutzen die RPC **`eigene_caregiver_ids()`** statt eines `caregivers`-Joins — genau der Weg, der die stille RLS-Blockade vermeidet. Audit-Log durchgängig. | **PASS** |

---

## Teil 3 — Befunde

### A — Substanziell

**A-1 · Der Rechnungsweg prüft das Budget nicht. (schwerwiegend)**

`create_invoice_draft_atomic` (`supabase/migrations/20260914000000_audit_persistenz_v9.sql`)
enthält **null** Referenzen auf `client_budgets`. Auch `lib/billing/core/invoice-engine.ts`: null.
Die Aufteilung am Ende lautet schlicht:

```
IF v_rec.budget_type = 'private' THEN v_private_total := …
ELSE                                   v_budget_total  := …
```

Es gibt also weder eine Deckelung auf 131 €/Monat noch auf 1 572 €/Jahr, noch
einen automatischen Übertrag des überschießenden Anteils in `private_amount`.
Eine Rechnung über 400 € gegen §45b für einen Monat wird anstandslos als
Kassenanteil erzeugt.

`pruefeBudget()` existiert und ist gut gebaut — sitzt aber nur im **Planungs**-Pfad
(`/api/einsatzplanung`, `/api/tours`, `/api/leistungsnachweis/crud`), und dort
zusätzlich mit `force_override` übersteuerbar. Zwischen Planung und Rechnung
liegt keine erneute Prüfung.

Zweiter Teil desselben Befunds: `pruefeBudget()` rechnet **jahresbasiert**
(`ENTLASTUNG_JAEHRLICH_EUR` + carryover). Der monatliche Anspruch aus §45b wird
nirgends durchgesetzt — `client_budgets.monthly_amount` (Default 131.0) wird im
gesamten Code **nur gelesen und angezeigt**, nie geprüft. Rechtlich entstehen
die 131 € pro Monat und sind erst danach übertragbar; wer im Januar 1 572 €
abrechnet, greift auf noch nicht entstandene Ansprüche zu.

**A-2 · `/mis/analytics` schreibt fremdbestimmte Identitäten ins Audit-Log.**

`app/mis/analytics/actions.ts` übernimmt `user_id`, `user_email`, `user_name`
und `status` **unverändert aus dem Client-Body** und schreibt sie nach
`mis_auth_log`. Nur `requireAuthenticated()` steht davor — jeder eingeloggte
Nutzer kann Audit-Zeilen unter fremdem Namen erzeugen.

Die Schwester-Funktion `app/mis/actions.ts:logMISAuthEvent` macht es richtig:
sie leitet `user_id`/`user_email` aus der Session und den Namen aus `profiles` ab.
Die zweite Implementierung sollte demselben Muster folgen.

**A-3 · 139 Audit-Schreibvorgänge verschlucken ihren eigenen Fehler.**

Das Muster `await logAuditEvent({…}).catch(() => {})` steht **139×** im Code.
Fällt der Audit-Insert aus (RLS, Constraint, Netzwerk), läuft die
Geschäftsoperation weiter und **niemand erfährt, dass die Spur fehlt**.

Positiv-Gegenbeispiel im selben Repo: `app/api/einsatzplanung/route.ts` nutzt
`.catch(err => console.error('[einsatzplanung] Audit-Log fehlgeschlagen:', err))`.
Das ist das Minimum — es macht den Ausfall wenigstens sichtbar. Für §630f BGB /
DSGVO Art. 30 wäre ein zentraler Zähler oder ein Alarm angemessen.

**A-4 · DSGVO-Hard-Delete schluckt das Löschen der Dokumente.**

`supabase/functions/account-hard-delete/index.ts:126`:

```
await admin.from('documents').delete().eq('user_id', userId).then(() => {}).catch(() => {})
```

Der Kommentar zwei Zeilen darüber sagt: *„documents-Tabelle: existiert derzeit
nicht in Produktion."* Diese Annahme ist überholt — die Tabelle existiert. Damit
gilt: schlägt das Löschen der personenbezogenen Dokumente fehl, wird der Fehler
verworfen und der Hard-Delete meldet trotzdem Erfolg. Alle anderen Deletes in
derselben Funktion laufen ohne `.catch`.

### B — Beobachtungen

**B-1 · ESLint lintet 880 MB Build-Artefakte.**

`eslint.config.mjs` ignoriert `.next/**`, aber **nicht** `.next-old/**` (349 MB)
und nicht `.claude/worktrees/**` (531 MB). Beide sind in `.gitignore` — ESLint 9
liest `.gitignore` jedoch nicht. Ergebnis: von 66 109 gemeldeten Problemen
stammen ~63 800 aus minifiziertem Fremdcode (allein 41 208 `no-unused-expressions`).

Der reale App-Wert ist **2 338**. Der Lint-Lauf ist in diesem Zustand als
CI-Gate wertlos und dauert unnötig lang. Fix: beide Pfade in `globalIgnores([…])`.

**B-2 · Die 21 Routen ohne Guard — einzeln geprüft, alle erklärbar.**

Der Datei-Scan meldet 21 von 385 Routen ohne Guard-Aufruf *in der Route selbst*.
Nach Einzelprüfung:

* **Guard in der Service-Schicht:** `billing/tariffs/[id]/verifizierung` und
  `billing/leistungspreise/[id]/verifizierung` delegieren an
  `lib/billing/tarif-verifizierung-service.ts`, das `requireOpsAdmin()` in
  *beiden* Handlern aufruft. Kein Loch.
* **Eigener Mechanismus:** `push/send` prüft einen `x-service-key`-Header gegen
  den Service-Role-Key. (Anmerkung: einfacher `!==`-Vergleich, nicht
  zeitkonstant — theoretisch, praktisch irrelevant bei einem 200+-Zeichen-Key.)
* **Bewusst öffentlich:** `kontakt`, `newsletter` (+`unsubscribe`),
  `lead-inquiry`, `coach/anfrage`, `beratung-chat`, `pricing/calculate`,
  `track`, `track-conversion`, `analytics/capi`, `analytics/vitals`,
  `client-ip`, `google-reviews`, `coach/tarife`, `expansion/status`,
  `auth/send-reset`, `user/delete/undo` (Token-basiert). Die Formular- und
  Chat-Endpunkte haben `rateLimit` + `escapeHtml`.
* **Einziger echter Wermutstropfen:** `visitor-alert` — unauthentifiziert,
  `createAdminClient()`, schreibt `visitor_locations`, legt Notifications für
  `organization_members` an und versendet Mail. Schutz ist eine **In-Memory-Map**
  als 1-h-IP-Cooldown; auf Serverless gilt die pro Instanz, nicht global.
  Empfänger ist fest verdrahtet, alle Felder werden HTML-escaped — der Schaden
  bleibt also auf Rauschen begrenzt. Für einen Persistenz-Ratelimit-Umbau reicht
  das aber nicht als Dauerlösung.

**B-3 · Client-seitige Schreibzugriffe — 8 Stück, davon 3 relevant.**

| Datei | Schreibvorgang | Bewertung |
|---|---|---|
| `components/OnboardingFlow.tsx:107,120,128` | `profiles.update`, `care_recipients.update({pflegegrad})`, `care_recipients.insert` | **relevantester Fall**: schreibt `pflegegrad` direkt aus dem Browser — an der `care_level`-Führung und am Server-Sync vorbei |
| `components/admin/CareNotesPanel.tsx:114` | `care_notes.insert` | Pflegenotiz aus dem Browser, ohne `logAuditEvent` |
| `components/NotificationBell.tsx:129,138` | `notifications.update({is_read})` | unkritisch, RLS-gedeckt |
| `components/PageTracker.tsx:76`, `hooks/useTrackVisit.ts:49` | `page_views.insert`, `visitor_locations.insert` | Telemetrie, unkritisch |

Verhältnis insgesamt gut: 144 Client-Dateien nutzen Supabase, nur 5 schreiben.

**B-4 · 62 lokal definierte Guard-Funktionen in `app/`.**

`requireEngel()`, `requireStaff()`, `requireAdmin()` usw. sind **62×** direkt in
Route-/Action-Dateien nachgebaut, statt aus `lib/*/api-auth.ts` importiert zu
werden — obwohl es dort bereits 29 zentrale `require*`-Helfer gibt. Jede Kopie
kann eigenständig veralten. Kein akuter Fehler, aber die wahrscheinlichste
Ursache des *nächsten* Auth-Befunds.

**B-5 · Testabhängigkeit von Quelltext-Greps.**

Der einzige verbliebene Testfehler war `expect(src).toContain('datei.inhalt.length')`
— ein Test, der den *Wortlaut* der Implementierung prüft. Der Code wurde auf den
benannten Helfer `byteLaengeLatin1()` refaktoriert (semantisch identisch: ein Byte
je Zeichen), der Test blieb stehen. In diesem Re-Check korrigiert: er prüft jetzt
den Helfer *und* seine beiden Aufrufstellen, statt einer Zeichenkette.

### C — Nebenbei

* **C-1** `app_settings` hat live nur `SELECT` und `UPDATE` — kein `INSERT`,
  kein `DELETE`. Neue Einstellungen sind nur über `service_role` anlegbar.
  Wahrscheinlich Absicht; hier nur festgehalten.
* **C-2** `android/app/google-services.json:18` enthält einen Google-API-Key.
  Das ist die Firebase-Client-Konfiguration und gehört ins APK — **kein Leak**.
  Voraussetzung: Der Key ist in der Google Cloud Console auf Paket-Name +
  SHA-1 beschränkt. Bitte einmalig verifizieren.
* **C-3** `datenannahmestellen.org_fence_das` erlaubt `organization_id IS NULL`
  — geteilte Stammdaten über Mandanten hinweg. Plausibel, aber es ist die
  einzige Stelle mit diesem Muster.

---

## Was in diesem Re-Check geändert wurde

Genau eine Datei, bewusst minimal, um der Parallel-Session nicht ins Gehege zu kommen:

* `__tests__/security/p0-gegenpruefung-fixes.test.ts` — Quelltext-Grep-Test an
  den refaktorierten Helfer `byteLaengeLatin1()` gezogen (B-5). Danach:
  10/10 in der Datei, Gesamtsuite ohne Fehler.

**Nicht** geändert: `docs/security/RLS_MATRIX.md` und `rls-matrix.csv` wurden vom
`--check`-Lauf neu generiert (einzige inhaltliche Differenz: der Zeitstempel).

---

## Fazit

Die technische Grundlage ist in gutem Zustand: **0 TypeScript-Fehler, grüner
Build mit 579 Seiten, 3 157 grüne Tests, RLS auf allen 298 Live-Tabellen mit
872 Policies, kein Secret im Code, kein echter Migration-Drift, 345 von 385
API-Routen mit Guard.** Die geprüften Geschäftsflüsse sind durchweg mit
Org-Fence, Rollenprüfung und Audit-Log gebaut; die Anlage-Wege für Kunden und
Mitarbeiter funktionieren samt UI.

Der eine Befund, der Geld kostet, ist **A-1**: Die Budgetkonstanten sind
vorbildlich versioniert und fail-closed — und werden im Rechnungsweg nicht
angewendet. Weder die 131 €/Monat noch die 1 572 €/Jahr begrenzen, was gegen
§45b in Rechnung gestellt wird. Vor echtem Kassenbetrieb ist das die erste zu
schließende Lücke; alles andere in diesem Bericht ist Härtung.
