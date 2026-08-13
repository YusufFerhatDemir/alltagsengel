# Rollen- und Rechtekonzept — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus Migrationen und Routen abgeleitet
**Grundlage:** `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`,
`supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql`,
`lib/coach/api-auth.ts`
**Nachweis:** `supabase/shadow/50_pflegecoach_tests.sql`

---

## 1. Der tragende Grundsatz

**Die Datenbank ist die Zugriffswahrheit, nicht die Anwendung.**

Jede Produktroute arbeitet mit dem Client der angemeldeten Sitzung
(`lib/coach/api-auth.ts`). Sie setzt keine eigenen Rechte durch, sondern reicht
die Identität an die Datenbank durch. Was Row Level Security dort nicht erlaubt,
kommt auch dann nicht heraus, wenn ein Programmierfehler eine Prüfung in der
Anwendung vergisst.

Die Konsequenz, die dieses Konzept von üblichen Berechtigungskonzepten
unterscheidet: **Es gibt keine Rolle, die alles sehen darf.** Kein Administrator,
kein Support, kein Betriebskonto hat Lesezugriff auf die Gesundheitsdaten. Das
ist keine Lücke im Betriebskonzept, sondern die Produktgrenze — und sie ist
durch das Fehlen jeder entsprechenden Policy umgesetzt, nicht durch eine
Vereinbarung.

---

## 2. Rollen

### 2.1 Die drei Produktrollen

`coach_users.rolle`, per CHECK-Constraint auf drei Werte begrenzt:

| Rolle | Wer | Was die Rolle steuert |
|-------|-----|----------------------|
| `pflegebeduerftig` | Person mit Pflegebedarf in häuslicher Versorgung | angezeigte Inhalte und Hinweise |
| `angehoerig` | pflegende:r Angehörige:r oder ehrenamtlich Pflegende:r | zusätzlich Belastungs-Selbsteinschätzung und Entlastungswissen |
| `pflegedienst` | Mitarbeitende eines ambulanten Dienstes | ausschließlich lesende Sicht auf freigegebene Daten |

**Entscheidend:** Die Produktrolle verleiht **keine Rechte an fremden Daten**.
Sie ist eine Inhaltssteuerung. Wer welche fremden Daten sehen darf, entscheidet
allein die Freigabe (`coach_shares`). Ein Konto mit der Rolle `pflegedienst` und
ohne Freigabe sieht exakt so viel wie jedes andere Konto ohne Freigabe:
die eigenen Daten und sonst nichts.

### 2.2 Technische Rollen der Datenbank

| Rolle | Bedeutung | Zugriff auf `coach_*` |
|-------|-----------|----------------------|
| `anon` | nicht angemeldet | **vollständig entzogen** — auf Grant-Ebene, nicht nur über Policies |
| `authenticated` | angemeldete Sitzung | nur, was die Policies erlauben |
| `service_role` | Systemkontext | technisch weitreichend, im Produktpfad aber nur an zwei begründeten Stellen eingesetzt (§6) |

Der Entzug für `anon` ist ausdrücklich: `REVOKE ALL ON coach_users, … FROM anon`
in beiden Migrationen. Grund ist eine bekannte Falle der Plattform — neue
Tabellen und Funktionen im öffentlichen Schema sind sonst standardmäßig für
nicht angemeldete Zugriffe nutzbar.

### 2.3 Verwaltungsrolle

Für die **Betriebs**tabellen (`coach_freischaltcodes`, `coach_abrechnungswege`,
`eul_erbringungen`, `eul_qualifikationen`) gilt das übliche Muster der Plattform:
eine Policy für die Verwaltung plus eine restriktive Mandantengrenze. Beide
Bedingungen müssen erfüllt sein — die restriktive Policy kann durch die
Verwaltungs-Policy nicht überstimmt werden.

Diese Tabellen enthalten **keine** Gesundheitsdaten und keinen Verweis auf
`coach_users`.

---

## 3. Rechtematrix je Tabelle

**E** = Eigentümer (die betroffene Person) · **F** = Person mit gültiger Freigabe
· **V** = Verwaltung (mit Mandantengrenze) · **A** = nicht angemeldet

| Tabelle | E | F | V | A | Besonderheit |
|---------|---|---|---|---|--------------|
| `coach_users` | alle Rechte | **–** | – | – | bleibt auch bei Freigabe privat |
| `coach_consents` | lesen, anlegen, ändern | – | – | – | kein Löschen: Policy fehlt **und** Grant entzogen |
| `coach_shares` | alle Rechte (als Eigentümer) | lesen (nur die eigene Freigabe) | – | – | Empfangende sehen, dass sie freigeschaltet sind |
| `coach_assessments` | alle Rechte | lesen | – | – | |
| `coach_goals` | alle Rechte | lesen | – | – | |
| `coach_activities` | alle Rechte | lesen | – | – | |
| `coach_activity_log` | alle Rechte | lesen | – | – | |
| `coach_measurements` | alle Rechte | lesen | – | – | |
| `coach_reports` | lesen, anlegen | lesen | – | – | unveränderlich: kein Ändern, kein Löschen |
| `coach_audit_log` | lesen | – | – | – | Schreiben nur durch den Trigger |
| `coach_freischaltungen` | lesen | – | – | – | Schreiben nur im Systemkontext |
| `coach_anspruchspruefungen` | alle Rechte | – | – | – | reine Selbstauskunft |
| `coach_nutzungsereignisse` | lesen, anlegen, löschen (über das eigene Pseudonym) | – | nur aggregiert, §6 | – | kein Ändern |
| `coach_pseudonym_key` | – | – | **–** | – | RLS aktiv **ohne jede Policy**, Grants entzogen |
| `coach_freischaltcodes` | – | – | alle Rechte | – | enthält nur Hashes und Pseudonyme |
| `coach_abrechnungswege` | – | – | alle Rechte | – | Schlüssel ohne Beträge |
| `eul_erbringungen` | – | – | alle Rechte | – | Betriebsdaten; bestätigte Nachweise gesperrt |
| `eul_qualifikationen` | – | – | alle Rechte | – | Betriebsdaten |

### Das Muster hinter den Zeilen

Für die fünf Datentabellen (`assessments`, `goals`, `activities`,
`activity_log`, `measurements`) wird dasselbe Policy-Paar erzeugt:

```sql
-- Eigentümer: volle Rechte
USING      (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))

-- Freigabe: ausschließlich SELECT
USING (coach_user_id IN (
  SELECT s.owner_coach_user_id FROM coach_shares s
  WHERE s.grantee_user_id = auth.uid() AND s.widerrufen_am IS NULL))
```

Das `WITH CHECK` ist der Schutz gegen untergeschobene Fremdzuordnung: Selbst wenn
eine Route eine fremde `coach_user_id` aus dem Anfrage-Körper übernähme, würde
die Datenbank das Schreiben verweigern. Die Routen whitelisten zusätzlich und
setzen die Zuordnung immer aus dem Auth-Kontext — zwei unabhängige Sperren für
denselben Fehler.

---

## 4. Unveränderlichkeit — zweifach abgesichert

Drei Datenbestände sollen nicht nachträglich verändert werden können. Bei allen
dreien fehlt nicht nur die Policy, sondern das Recht ist zusätzlich auf
Grant-Ebene entzogen:

| Bestand | Was gesperrt ist | Warum |
|---------|-----------------|-------|
| `coach_consents` | Löschen | eine Einwilligung muss beweisbar bleiben — auch nach Widerruf |
| `coach_reports` | Ändern, Löschen | ein Bericht ist ein Zeitpunkt-Abbild; nachträglich geändert wäre er wertlos |
| `coach_audit_log` | Anlegen, Ändern, Löschen durch Nutzende | ein Protokoll, das der Protokollierte ändern kann, ist kein Protokoll |

Ein Widerruf ist deshalb kein Löschen, sondern das Setzen von `widerrufen_am` auf
der bestehenden Zeile.

---

## 5. Freigaben: Lebenszyklus

```
1. Einwilligung 'datenfreigabe' erteilen        → coach_consents
2. Freigabe anlegen                             → coach_shares (widerrufen_am = NULL)
3. Empfangende Person liest freigegebene Daten  → *_share_select greift
4. Widerruf                                     → widerrufen_am setzen
5. Zugriff endet sofort                         → Policy-Bedingung erfüllt sich nicht mehr
```

Eigenschaften:

* **kein Nachlauf** — keine Kopie, kein Zwischenspeicher, keine Karenzzeit
* **nur lesend** — es gibt keine Schreib-Policy für Empfangende
* **eine Freigabe je Paar** — UNIQUE `(owner_coach_user_id, grantee_user_id)`
* **sichtbar für beide Seiten** — Empfangende sehen ihre eigene Freigabezeile
* **Stammdaten bleiben privat** — `coach_users` ist von der Freigabe ausgenommen

**Offen:** Es gibt noch keine Oberfläche zum Einladen und Widerrufen
(GAP-SHARES-UI). Datenmodell, Zugriffsregeln und Einwilligungsart sind
vorhanden, die Bedienung fehlt.

---

## 6. Die zwei Ausnahmen vom Session-Grundsatz

Beide sind dokumentiert, begründet und kommen an Gesundheitsdaten nicht heran.

### 6.1 Code-Einlösung — `app/api/coach/freischaltung` (POST)

| Frage | Antwort |
|-------|---------|
| Warum Systemkontext? | Nutzende dürfen `coach_freischaltcodes` nicht lesen — sonst ließen sich gültige Codes auslesen. Und sie dürfen sich ihre Freischaltung nicht selbst eintragen — sonst wäre die Zugangsprüfung wertlos. |
| Worauf beschränkt? | ausschließlich `coach_freischaltcodes` und `coach_freischaltungen` |
| Wessen Identität? | weiterhin aus `requireCoachUser()`, nicht aus dem Anfrage-Körper |
| Gegen Doppel-Einlösung? | `UPDATE … WHERE status = 'ausgegeben'` — bei parallelen Versuchen gewinnt genau einer; schlägt der Folgeschritt fehl, wird der Code zurückgesetzt |

### 6.2 Kennzahlen-Auswertung — `app/api/dipa/nachweise` (GET)

| Frage | Antwort |
|-------|---------|
| Warum Systemkontext? | `coach_nutzungsereignisse` hat bewusst keine Verwaltungs-Policy; für die Evaluation müssen die Zeilen dennoch gelesen werden |
| Worauf beschränkt? | ausschließlich diese eine Tabelle — sie enthält keinen Personenbezug |
| Was verlässt die Route? | nur Aggregate; nie Einzelzeilen, nie Pseudonyme; unter fünf Teilnehmenden gar nichts |
| Zusätzliches Tor? | ja, `requireOpsAdmin()` |

**Die Aussage muss präzise lauten:** kein Systemkontext auf
`coach_*`-**Datentabellen** — nicht „kein Systemkontext im Coach-Code".

---

## 7. Pseudonym-Rechte

Zwei Funktionen, absichtlich getrennt:

| Funktion | Ausführbar durch | Zweck |
|----------|-----------------|-------|
| `coach_mein_pseudonym()` | angemeldete Sitzungen, Systemkontext | liefert **nur das eigene** Pseudonym; Grundlage aller Policies auf `coach_nutzungsereignisse` |
| `coach_pseudonym(uuid)` | **nur** Systemkontext | Pseudonym zu einer beliebigen Person — für Auswertungen |

Die parametrisierte Variante ist angemeldeten Sitzungen **entzogen**. Andernfalls
könnte jede Person das Pseudonym einer anderen berechnen und deren Nachweisdaten
lesen — die Policy `pseudonym = coach_mein_pseudonym()` allein würde das nicht
verhindern.

`coach_pseudonym_key` ist die einzige Tabelle des Produkts, die für **niemanden**
lesbar ist: Row Level Security aktiv, keine einzige Policy, alle Grants entzogen.
Nur die Funktionen mit Eigentümerrechten kommen heran.

---

## 8. Aufgabentrennung im Betrieb

| Aufgabe | Wer | Sieht dabei |
|---------|-----|-------------|
| Freischaltcodes ausgeben | Verwaltung | Code-Klartext genau einmal, danach nur Präfix und Status |
| Abrechnungswege konfigurieren | Verwaltung | Schlüssel und Beschreibung, **keine Beträge** |
| Kennzahlen ansehen | Verwaltung | nur Aggregate |
| eUL-Nachweise pflegen | Verwaltung | Leistungsart, Dauer, Erbringende — keine Coach-Inhalte |
| Fachliche Unterstützung eines Nutzers | **niemand** | es existiert kein Weg; Einsicht nur, wenn die Person selbst exportiert |
| Datenbankmigration | Technik | vollen Datenbankzugriff — dies ist die einzige Rolle mit faktischem Zugriff auf alles |

Die letzte Zeile ist der ehrliche Restpunkt: Wer die Datenbank administriert, kann
technisch alles lesen. Das gilt für jedes System dieser Bauart und lässt sich
nicht durch Policies auflösen, sondern nur organisatorisch begrenzen — durch
Zugriffsbeschränkung auf die Datenbankkonsole, Vier-Augen-Prinzip bei
Migrationen und Protokollierung. Diese organisatorischen Maßnahmen sind **nicht
dokumentiert** und gehören in das Sicherheitskonzept des Betriebs
(`docs/DIPA_EXTERNAL_ACTIONS.md`, Punkt EXT-06).

---

## 9. Nachweis

| Geprüfte Eigenschaft | Test |
|---------------------|------|
| Eigene Zeilen sichtbar, fremde nicht | P1 |
| Fremdzuordnung beim Schreiben abgewehrt | P2 |
| Verwaltungskonto sieht 0 Zeilen | P3 |
| Nicht angemeldeter Zugriff abgewehrt (Grant-Ebene) | P4 |
| Freigabe wirkt nur lesend; `coach_users` bleibt privat | P5 |
| Unveränderlichkeit von Berichten und Einwilligungen | P6 |
| Audit-Protokoll ist append-only | P7 |
| Widerruf beendet den Zugriff sofort | P8 |

Alle acht Gruppen sind in `supabase/shadow/50_pflegecoach_tests.sql` gegen eine
aus dem Repository aufgebaute Datenbank grün (39 Einzelprüfungen).

**Offen:** Für die sieben Tabellen aus `20260826010000` fehlen entsprechende
Tests (GAP-SHADOW-15). Zu prüfen wären mindestens: Pseudonym-Isolation zwischen
zwei Personen, kein Verwaltungszugriff auf `coach_freischaltungen`, kein
Selbst-Eintrag einer Freischaltung, kein Lesezugriff auf `coach_pseudonym_key`.

---

## 10. Offene Punkte

| Punkt | Status |
|-------|--------|
| Zweiter Faktor bei der Anmeldung | offen — GAP-MFA |
| Oberfläche für Freigaben | offen — GAP-SHARES-UI |
| Datenbanktests für die zweite Migration | offen — GAP-SHADOW-15 |
| Organisatorische Begrenzung des Datenbank-Administrationszugriffs | offen — EXT-06 |
| Rollenkonzept gegen den maßgeblichen Anforderungstext geprüft | offen — kein Katalogeintrag ist als geprüft markiert |
