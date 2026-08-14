# Logging- und Audit-Konzept — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Struktur und Reichweite des Audit-Protokolls (`coach_audit_log`) — deckt DiPA-Matrix SEC-07 ab (Auditierbarkeit der Zugriffe).

---

## 1. Status

DiPA-Matrix SEC-07, Klasse **A**, Status **ERLEDIGT**. Nachweis:
`coach_audit_log` (append-only, Metadaten ohne Werte); Testgruppe P7 in
`supabase/shadow/50_pflegecoach_tests.sql`. **Offener Punkt laut Matrix:**
„Auswertung/Alarmierung einrichten" (siehe §6).

## 2. Die zentrale Entscheidung: keine Datenwerte im Protokoll

Ein Protokoll über Zugriffe auf Gesundheitsdaten hat ein eingebautes Problem:
Protokolliert man die Inhalte mit, entsteht eine zweite Kopie genau der
Daten, die man schützen wollte — und eine, die nicht gelöscht werden darf,
weil sie Nachweis sein soll.

**Entscheidung:** Das Protokoll enthält **keine Datenwerte**. Es beantwortet
*wer hat wann welche Zeile in welcher Tabelle wie verändert und welche Felder
betraf das* — nicht *was stand drin*. Konsequenz: Aus dem Protokoll lässt
sich ein früherer Zustand nicht rekonstruieren — es ist ein Nachweis von
Vorgängen, keine Versionsgeschichte. Für Nachvollziehbarkeit von Zugriffen
und Löschungen genügt das; für eine Wiederherstellung überschriebener Werte
ausdrücklich nicht.

## 3. Tabellenstruktur (`coach_audit_log`)

Aus `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`:

| Feld | Inhalt |
|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY`, Primärschlüssel |
| `coach_user_id` | Eigentümer der betroffenen Daten (`NULL` bei gelöschtem Profil) |
| `actor_user_id` | `auth.uid()` des Handelnden (`NULL` = Systemkontext) |
| `tabelle` | betroffene Tabelle |
| `aktion` | `INSERT`, `UPDATE` oder `DELETE` (CHECK-Constraint) |
| `zeilen_id` | betroffene Zeile |
| `geaenderte_felder` | `text[]`, **nur bei UPDATE**: Feld**namen**, keine Werte; `updated_at` wird dabei ausgenommen |
| `created_at` | Zeitstempel, `DEFAULT now()` |

Index: `idx_coach_audit_log_user (coach_user_id, created_at DESC)`.

## 4. Wo protokolliert wird

Trigger `coach_audit_trigger()` auf allen elf nutzer-eigenen Tabellen:
`coach_users`, `coach_consents`, `coach_shares`, `coach_assessments`,
`coach_goals`, `coach_activities`, `coach_activity_log`,
`coach_measurements`, `coach_reports`, `coach_freischaltungen`,
`coach_anspruchspruefungen`.

**Zwei bewusste Ausnahmen:**

| Tabelle | Warum kein Trigger |
|---|---|
| `coach_nutzungsereignisse` | keine Eigentümer-Spalte, kein Primärschlüssel vom passenden Typ; enthält selbst nur Metadaten ohne Personenbezug — ein Protokoll über ein Protokoll wäre unnötig |
| `coach_pseudonym_key` | für niemanden lesbar; es gibt keinen Zugriff, der protokollierbar wäre |

Für die reinen Betriebstabellen (`coach_freischaltcodes`,
`coach_abrechnungswege`, `eul_*`) gibt es kein eigenes Coach-Protokoll — sie
unterliegen den Protokollierungsregeln des Betriebsbereichs. Das ist eine
Lücke im Nachweis, kein Schutzproblem, da sie keine Gesundheitsdaten
enthalten.

## 5. Warum ein Datenbank-Trigger statt Anwendungscode

Ein Protokoll, das die Anwendung schreibt, wird bei der nächsten neuen Route
vergessen. Der Trigger hängt an der Tabelle: Jeder Schreibvorgang wird
protokolliert — unabhängig davon, ob er aus einer Produktroute, einem
Wartungsvorgang oder der Datenbankkonsole kommt. Die Trigger-Funktion läuft
mit `SECURITY DEFINER` und festem `search_path = public`, damit der Eintrag
auch gelingt, wenn die schreibende Sitzung selbst keine Rechte auf die
Protokolltabelle hat (hat sie ausdrücklich nicht, siehe §7).

## 6. Unveränderlichkeit und Zugriff

| Wer | Lesen | Schreiben | Ändern | Löschen |
|---|---|---|---|---|
| Nutzende Person | nur eigene Einträge | – | – | – |
| Person mit Freigabe | – | – | – | – |
| Verwaltung | – | – | – | – |
| Trigger (`SECURITY DEFINER`) | – | ja | – | – |

Doppelt abgesichert: eine einzige Lese-Policy (`coach_audit_log_select_self`)
**und** zusätzlicher Grant-Entzug: `REVOKE ALL … FROM anon`,
`REVOKE INSERT, UPDATE, DELETE … FROM authenticated`. Ein Protokoll, das der
Protokollierte ändern kann, ist keines.

Bei Löschung eines Profils bleiben die Protokolleinträge bestehen (keine
Werte, `coach_user_id` zeigt auf eine nicht mehr existierende Zeile) — der
Löschvorgang selbst wird protokolliert und bleibt damit belegbar. Details:
`audit/dipa/loeschkonzept.md`.

## 7. Was NICHT protokolliert wird

| Vorgang | Protokolliert? | Bewertung |
|---|---|---|
| Lesezugriffe | nein | vollständige Lese-Protokollierung wäre bei jedem Seitenaufruf ein Vielfaches der Nutzdaten und selbst ein Datenschutzproblem; Zugriff ohnehin auf die eigene Person begrenzt |
| Lesezugriffe durch Personen mit Freigabe | nein | **diskussionswürdig** — offener Punkt (§8) |
| Anmeldeversuche, erfolglose Anmeldungen | nein im Produkt | liegt auf Ebene der Plattform-Authentifizierung |
| Datenwerte | nein | Kernentscheidung, §2 |

## 8. Offener Punkt: Auswertung/Alarmierung (SEC-07, DiPA-Matrix)

Die DiPA-Matrix führt SEC-07 als ERLEDIGT für das Protokoll selbst, aber mit
der ausdrücklichen nächsten Aktion: **„Auswertung/Alarmierung einrichten"**.
Aktueller Stand laut `audit/dipa/logging_audit_konzept.md`: **Das Protokoll
ist derzeit ein reines Nachschlagewerk, keine Überwachung.** Es gibt keine
automatisierte Auswertung auf auffällige Zugriffsmuster. Dieser Punkt ist
zugleich als eine der fünf größten Lücken im ISMS-Geltungsbereich benannt
(siehe `audit/dipa/isms_scope_vorbereitung.md`, SEC-05).

## 9. Weitere offene Punkte

| Punkt | Bewertung |
|---|---|
| Kein Protokoll über Lesezugriffe von Personen mit Freigabe | prüfenswert; über ein gezieltes Protokoll in der Leseroute umsetzbar, ohne allgemeine Lese-Protokollierung |
| Kein Coach-eigenes Protokoll auf den Betriebstabellen | Lücke im Nachweis, kein Schutzproblem |
| Keine Aufbewahrungsfrist für das Protokoll festgelegt | wächst unbegrenzt; Regelfrist offen (`audit/dipa/loeschkonzept.md` §6) |
| **Keine Auswertung des Protokolls auf auffällige Muster (siehe §8)** | derzeit reines Nachschlagewerk |
| Aufbewahrung/Einsehbarkeit der Laufzeitprotokolle (Anwendungsebene) nicht dokumentiert | gehört ins AVV-Dossier (DS-04) |
| Keine Prüfung des Protokollverhaltens gegen die Produktionsdatenbank | Testgruppe P7 prüft gegen eine aus dem Repository aufgebaute Datenbank, nicht gegen Produktion |

---

## Quellen

* `audit/dipa/logging_audit_konzept.md`
* `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql` (Teil 12, `coach_audit_log` + Trigger)
* `supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql` (Teil 9, Erweiterung)
* `supabase/shadow/50_pflegecoach_tests.sql` (Prüfgruppe P7)
* `docs/DIPA_MATRIX_FINAL.md` (SEC-07)
* `audit/dipa/isms_scope_vorbereitung.md`
