# AE NEXT EXECUTION — 12.09.2026

**Commits:** `b136c9d9` → `992adadb` → `HEAD`
**Prüfstand:** `tsc 0` · `ESLint 0` · 9 Lints 0 · `vitest 10.448` · `node:test 2.770` · `build 0`
**CI:** `b136c9d9` **grün** — einschließlich des neuen blockierenden `lint:pii`

---

## 1. Wächter-Test Migrationen — erledigt, kein KNOWN_ISSUE

Der Test `__tests__/pilot/pre-pilot-snapshot.test.ts` verlangt, dass die fünf jüngsten
Migrationsdateien in `lib/pilot/pre-pilot-snapshot.ts` registriert sind. Er war rot,
nachdem die beiden neuen Audit-Migrationen dazukamen — und ist **im selben Durchgang
registriert und grün geworden** (31/31), bevor `b136c9d9` committet wurde.

| Registry | Verzeichnis |
|---|---|
| `20261103000001_rollback_marketing_content_status.sql` | ✓ |
| `20261104000000_state_waitlist_stufe_termin.sql` | ✓ |
| `20261104000001_rollback_state_waitlist_stufe_termin.sql` | ✓ |
| `20261105000000_audit_action_lead_follow_up.sql` | ✓ |
| `20261105000001_rollback_audit_action_lead_follow_up.sql` | ✓ |

**Anmerkung zum Test selbst:** Er hat nicht nur gemeldet, dass etwas fehlt, sondern die
vollständige Sollliste ausgegeben. Ein Fehlschlag, der die Lösung mitliefert, kostet eine
Minute statt zwanzig — das ist der Unterschied zwischen einem Wächter und einem Ärgernis.

## 2. Arbeitskörbe sind jetzt bedienbar (`992adadb`)

Die sieben Körbe lagen seit `b136c9d9` in `lib/leads/koerbe.ts` mit 15 Tests und einem
Live-Beleg — aber in keiner Oberfläche. Eine Arbeitsliste, die niemand öffnen kann, ist
keine.

* **Hauptauswahl über der Ampelleiste:** Heute fällig · Überfällig · Dringend · Neu ·
  Terminwünsche · Rückrufe · Bewerber — mit Zählern und je einem Titel, der den Korb erklärt
* **Deep-Link `?korb=dringend`**, damit die Tagesmail in den richtigen Korb zeigen kann
* **Warnkasten, roter Rahmen, über der Liste:** liegt ein Vorgang in *keinem* Korb, steht
  das dort samt Knopf zum Anzeigen

Der Warnkasten ist der eigentliche Zweck. Vorgänge ohne Korb bleiben liegen, **weil** sie
in keiner Liste auftauchen — am 12.09.2026 waren es zwei, die so 56 Tage dalagen. Diese
Zahl gehört nach vorn, nicht in ein Log.

**Die Zähler summieren sich auf mehr als die Zahl der Vorgänge.** Kein Fehler: ein
Bewerber kann überfällig sein, ein Terminwunsch dringend. Wären die Körbe eine Aufteilung,
verschwände genau der Lead aus einem Korb, der in zwei liegt. Steht als Kommentar an der
Leiste.

### Prüfgrenze, ausdrücklich benannt

`/admin/posteingang` ist auth-gesichert und leitet zum Login. **Die Oberfläche wurde nicht
im Browser gesehen** — ich habe keine Zugangsdaten eingegeben. Belegt sind:

| Prüfung | Ergebnis |
|---|---|
| `tsc`, `ESLint`, `build` | 0 / 0 / 0 |
| Korblogik (`__tests__/leads/koerbe.test.ts`) | 15 Tests |
| `scripts/verify-koerbe-live.ts` gegen Produktionsdaten | **50/50 Vorgänge in ≥1 Korb, 0 ohne** |

Die Logik ist scharf geprüft, das Layout nicht. Für Letzteres braucht es einen Screenshot
oder eine Admin-Sitzung, die jemand selbst öffnet.

## 3. Ein Fehler aus der eigenen Härtung — gefunden und behoben

Die `.gitignore`-Härtung aus `b136c9d9` enthielt einen Denkfehler.

Die Muster standen **ohne Dateiendung** da (`*Fuehrungszeugnis*`) und trafen damit auch
`components/onboarding/bewerber/Schritt09Fuehrungszeugnis.tsx` — Quelltext. Als
Gegenmaßnahme standen Ausnahmen dahinter:

```
!*.tsx
!*.ts
```

**Diese Ausnahmen wirken nicht lokal.** Eine Negation in `.gitignore` gilt ab ihrer Zeile
für alles Folgende — und hebt damit *jede* vorherige Regel für TypeScript-Dateien auf.
Sichtbar wurde es an `next-env.d.ts`: seit Zeile 54 ignoriert, tauchte es plötzlich wieder
als ungetrackt auf.

**Behoben** durch spezifische Muster mit Dokumentendung und ohne jede Gegenausnahme:
`*[Ff]uehrungszeugnis*.pdf`, `*[Pp]ersonalausweis*.jpg`, `*[Kk]ontoauszug*.pdf` und so
weiter. Beidseitig gegengeprüft:

| Muss ignoriert sein | |
|---|---|
| `anerkennung-hessen/Erweitertes-Fuehrungszeugnis-Test.pdf` | ✓ |
| `Gescanntes Dokument 99.pdf` | ✓ |
| `docs/Kontoauszug_2026.pdf` | ✓ |
| `irgendwo/Personalausweis.jpg` | ✓ |
| `next-env.d.ts` | ✓ wieder |

| Darf **nicht** ignoriert sein | |
|---|---|
| `components/onboarding/bewerber/Schritt09Fuehrungszeugnis.tsx` | ✓ getrackt |
| `lib/leads/koerbe.ts` · `scripts/lint-pii-dateien.ts` | ✓ getrackt |

**Was daran lehrreich ist:** Eine Sicherheitsregel, die zu breit greift, wird mit einer
Ausnahme entschärft — und die Ausnahme reißt ein größeres Loch als die Regel geschlossen
hat. Spezifisch formulieren ist billiger als negieren.

## 4. Statusübersicht

### VERIFIED_LIVE

| Was | Beleg |
|---|---|
| Korbabdeckung | **50/50** Vorgänge in ≥1 Korb, **0 ohne** (vorher 2) |
| Lead-Bestand | 50 offen · 38 verschleppt · ältester 58 Tage |
| Follow-up-Kette | Lauf 05:29:51 UTC, Tagesdedupe greift, 0 Doppelmeldungen |
| Secrets im getrackten Baum | **0** über 5.174 Dateien, 5 Archive, 310 kompilierte Dateien |
| CI mit `lint:pii` | `b136c9d9` grün |

### VERIFIED_LOCAL

`lint:pii` mit Gegenprobe · 7 Körbe (15 Tests) · Marketing-DB-Adapter (14 Tests) ·
Audit-Trail verdrahtet · `.gitignore` beidseitig gegengeprüft · Build 0

### READY_TO_SEND — nichts versandt

Vier Gesprächsleitfäden · Richtigstellung an 10 Bundesländer · E-Mail-Entwurf Gewerbeamt

### BLOCKED_EXTERNAL

Migration `20261105000000` (braucht SQL-Editor) · Next-Upgrade auf 16.3.3+ ·
§45a-Bescheid Hessen (Frist **10.10.2026**) · Gewerbeamt-Bestätigung ·
Erhebungsbogen Frankfurt · Google Business Profile · Stripe (DEFERRED)

### BUSINESS_DECISION_REQUIRED

35 €/h vs. 40 €/h · Tarife gegen PfluV-Deckel 30/25 €/h · 30,00 €/Std. in Anlage-07 ·
`/pflegebox` ↔ `/hygienebox` · ChairMatch: 1.240 Preisliterale

### USER_ACTION_REQUIRED

| # | Punkt |
|---|---|
| 1 | **Entscheidung öffentliches Repository** — 8 PII-Fundstellen, 4 Dokumente, zwei Führungszeugnisse seit 10.08. online. Drei Wege in `SECURITY_REMEDIATION_12_09_2026.md` |
| 2 | **Vier Kunden anrufen** — Reichert (2× vergeblich), MantheyIckenroth, Büttner, Suhe |
| 3 | **Claudia Adjovi anrufen** |
| 4 | **Kartenscan löschen, Karte sperren** |
| 5 | **Migration `20261105000000` einspielen** — bis dahin meldet die Kette eine sichtbare AUDIT-LÜCKE |
| 6 | **11880 freischalten** — Birgit Fritzsch ist nicht in der Datenbank |
| 7 | Richtigstellung versenden · erweitertes FZ Sabrina · Versicherungsnehmer auf die UG |

## 5. Offen und bewusst nicht angefasst

| Punkt | Warum |
|---|---|
| Oberflächenprüfung `/admin/posteingang` | Login nötig, keine Zugangsdaten eingegeben |
| Historie-Bereinigung der PII-Dokumente | Unumkehrbar und außenwirksam — Entscheidung des Inhabers |
| Next-Upgrade | Bricht den Produktionsbuild; Weg in `NEXTJS_AVIF_RCE_12_09_2026.md` |
| Near-Duplicate-Descriptions der Stadtseiten | Behoben; offen bleiben 12 nachrangige SEO-Punkte aus dem Live-Check |
