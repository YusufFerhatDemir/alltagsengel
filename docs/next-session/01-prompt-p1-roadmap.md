# Prompt 1 — P1-Roadmap abarbeiten

**Zweck:** Diese Datei enthält den fertigen Prompt, den du in einer neuen Cowork-Session mit Claude Opus 4.7 + Extended Thinking High einfügst, um die vier offenen P1-Punkte abzuarbeiten.

---

## Anleitung zur Nutzung

1. Neue Session in Cowork starten (`+ New task`).
2. Ordner `alltagsengel` auswählen.
3. Modell: **Claude Opus 4.7**.
4. Extended Thinking: **High**.
5. Den Prompt-Block unten **1:1 kopieren** und als erste Nachricht einfügen.

---

## Der Prompt (zum Kopieren)

```
Projekt: AlltagsEngel.care (Next.js 14 App Router + Supabase + Capacitor)

KONTEXT LADEN (vor jeder Arbeit lesen):
1. docs/next-session/00-STATUS-HANDOVER.md (was fertig ist, was offen)
2. APP_AUDIT_360.md (P0/P1/P2-Priorisierung)
3. CLAUDE.md (Projekt-Regeln)
4. AUTH_AUDIT.md nur bei AUTH-003
5. RLS_AUDIT.md + docs/security/DSGVO_TODO.md nur bei RLS-Matrix

AUFGABE:
Arbeite die folgenden 4 P1-Punkte NACHEINANDER ab. Pro Punkt:
(a) kurze Analyse der betroffenen Dateien
(b) konkreter Umsetzungs-Plan (stichpunktartig)
(c) Umsetzung
(d) Verify-Step: npm run lint, tsc --noEmit, relevante Tests
(e) commit + push mit aussagekräftiger Message (DE oder TR)

PUNKT 1 — HIBP Password-Leak-Check (k-Anonymity)
Datei: lib/password-validation.ts
Ziel: Neue async Funktion checkPasswordBreach(password) die:
 - SHA-1 Hash des Passworts bildet (uppercase hex)
 - Erste 5 Zeichen an https://api.pwnedpasswords.com/range/{prefix} sendet
 - Response-Text zeilenweise parst (Format: "SUFFIX:COUNT")
 - true zurückgibt wenn volles Hash (ohne Prefix) in der Liste ist
 - Fail-Safe: bei Netzfehler throws NICHT, sondern logs console.warn und gibt false zurück
Integration: validatePasswordAsync() bekommt Optional-Parameter { checkBreach: boolean }, default true.
Bei Breach-Treffer: error "Dieses Passwort wurde in einem Datenleak gefunden. Bitte wähle ein anderes."
Test: lib/password-validation.test.ts oder eine neue Datei, mit Mock für fetch.

PUNKT 2 — AUTH-003 Rest: Soft-Delete + 30-Tage-Grace + Bestätigungsmail
Dateien: app/api/user/delete/route.ts, neue Supabase-Migration, alle RLS-Policies.
Ziel:
 - Spalte profiles.deleted_at (timestamptz) hinzufügen
 - Alle RLS-Policies auf profiles, visitors, angebote, buchungen, dokumente, chat_messages etc. um "AND deleted_at IS NULL" ergänzen (wo relevant)
 - Neue Tabelle account_deletion_tokens(user_id, token, expires_at, confirmed_at)
 - /api/user/delete: generiert Token, setzt deleted_at, versendet Bestätigungs-Mail mit Widerrufs-Link
 - /api/user/delete/undo?token=...: setzt deleted_at zurück auf NULL
 - Supabase Edge Function + pg_cron: täglicher Job der profiles mit deleted_at < now() - interval '30 days' hart löscht (inkl. Storage-Dateien, abhängige Tabellen via CASCADE)
Email-Template in lib/emails/ mit klarem Warnhinweis "Dein Konto wird in 30 Tagen gelöscht. Widerruf: <Link>".

FRAGE VORAB: Soll die Grace-Period 30 oder 60 Tage sein? (30 ist üblich, 60 seniorenfreundlicher)

PUNKT 3 — RLS-Policy-Matrix-Skript
Datei: scripts/rls-matrix.ts (neu)
Ziel: Skript das via Supabase MCP (mcp__7c09e07f-...-list_tables oder execute_sql auf pg_policies) alle RLS-Policies ausliest und docs/security/RLS_MATRIX.md als Markdown-Tabelle erzeugt.
Tabelle: Tabelle | RLS aktiv | Policy | Rolle | CMD | USING | WITH CHECK
Ausgabe zusätzlich als CSV unter docs/security/rls-matrix.csv.
npm-Script: "rls:matrix": "tsx scripts/rls-matrix.ts"

PUNKT 4 — Bundle-Size-Report
Vorab: PERF_REPORT.md lesen — evtl. gibt es schon Messwerte.
Befehle:
 - npm install --save-dev @next/bundle-analyzer (falls nicht vorhanden)
 - next.config.ts um BundleAnalyzerPlugin erweitern (konditional via ANALYZE=true)
 - ANALYZE=true npm run build
 - Report in docs/performance/BUNDLE_REPORT_2026-04.md schreiben mit: First-Load-JS pro Route, Top-10 größte Module, Empfehlungen
Ziele: Landing < 150 KB, App-Routen < 200 KB.
Bei Überschreitung: Lazy-Load für SocialProof, AppMockup, dynamischer Import für recharts/mammoth falls vorhanden.

ARBEITSWEISE:
- Nutze Agent-Teams für parallele Recherche (z.B. ein Agent liest alle Migrations, ein anderer alle Komponenten).
- Fragen stellen NUR wenn eine Entscheidung relevante Auswirkung hat (z.B. Grace-Period-Länge). Keine Fragen zu Trivialitäten.
- Nach jedem der 4 Punkte: commit + push mit aussagekräftiger DE/TR-Nachricht.
- Am Ende aller 4 Punkte: Zusammenfassung was fertig ist + was noch offen blieb.

EXPLIZIT NICHT ANFASSEN:
- Keine MFA / 2FA einbauen.
- Keine Session-Lock / Auto-Logout-Logik.
- Keine WhatsApp-Integration.
- Sentry DSN NICHT in Code schreiben (User setzt das selbst in Vercel-Env).
- JWT-Expiry NICHT in Supabase-Config ändern (User macht das im Dashboard).

LOS GEHT'S MIT PUNKT 1 (HIBP).
```

---

## Warum dieser Prompt so strukturiert ist

### Vorab-Kontext laden
Stell dir den Assistenten wie einen neuen Mitarbeiter vor, der am ersten Arbeitstag erst das Handbuch lesen muss, bevor er loslegt. Spart hinterher Missverständnisse.

### Ein Punkt nach dem anderen
Wie in der Küche: erst Vorspeise fertig machen, dann Hauptgang. Nicht vier Pfannen gleichzeitig auf dem Herd stehen lassen.

### Verify-Step nach jedem Punkt
Analog zum Handwerker, der nach jeder Wand prüft ob sie gerade steht, bevor er die nächste anfängt. Fehler früh sehen = weniger Aufwand.

### Explizite „NICHT"-Liste
Ältere Versionen des Assistenten haben wiederholt MFA vorgeschlagen, obwohl wir uns dagegen entschieden haben. Besser einmal klar hinschreiben, als zehnmal nein sagen.

### Nur eine einzige Frage vorab
Die Grace-Period-Entscheidung (30 vs. 60 Tage) beeinflusst Code und Nutzer-UX — daher Fragen-wert. Alles andere kann der Assistent selbst entscheiden.

---

## Zeitrahmen (grob)

| Punkt | Erwartete Dauer |
|---|---|
| 1. HIBP | 2-3 h |
| 2. Soft-Delete | 1-2 Tage |
| 3. RLS-Matrix | 3-4 h |
| 4. Bundle-Report | 2-4 h |
| **Gesamt** | **ca. 2-3 Arbeitstage** |

Realistisch für Opus 4.7 mit Extended Thinking: Punkt 1, 3, 4 alle in einer Session machbar. Punkt 2 verdient eine eigene Session wegen Komplexität (DB-Migration + Mail + Cron).
