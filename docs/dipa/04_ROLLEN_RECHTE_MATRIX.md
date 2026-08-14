# Rollen- und Rechte-Matrix — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Wer (Nutzer, Admin, Service-Role, anon) darf auf welche `coach_*`-Tabelle in welcher Form zugreifen — konsolidiert aus dem Rollenkonzept und direkt gegen die RLS-Policies in `supabase/migrations/` verifiziert.

---

## 1. Der tragende Grundsatz

**Die Datenbank ist die Zugriffswahrheit, nicht die Anwendung.** Jede
Produktroute unter `app/api/coach/**` arbeitet mit dem Session-Client der
angemeldeten Person (`lib/coach/api-auth.ts`) — nie mit `service_role`. Was Row
Level Security nicht erlaubt, kommt auch dann nicht heraus, wenn eine Route
eine Prüfung vergisst.

**Produktgrenze — explizit:** Für die Gesundheitsdatentabellen des PflegeCoach
existiert **keine Admin-Policy**. Kein Administrator, kein Support, kein
Betriebskonto hat Lesezugriff auf Gesundheitsdaten. Das ist durch das Fehlen
jeder entsprechenden Policy technisch erzwungen — geprüft in
`lib/coach/produktgrenze.test.ts` (Strukturtest über den Quelltext) und
`supabase/shadow/50_pflegecoach_tests.sql` (68/68 bestanden, Prüfgruppe P3:
„Verwaltungskonto sieht 0 Zeilen").

## 2. Technische Rollen der Datenbank

| Rolle | Bedeutung | Zugriff auf `coach_*`-Gesundheitsdaten |
|---|---|---|
| `anon` | nicht angemeldet | **vollständig entzogen** — per `REVOKE ALL … FROM anon` auf Grant-Ebene, nicht nur über Policies |
| `authenticated` | angemeldete Sitzung | nur, was die jeweilige Policy erlaubt (eigene Zeilen + über `coach_shares` freigegebene) |
| `service_role` | Systemkontext | technisch weitreichend, im Produktpfad aber nur an zwei begründeten Stellen eingesetzt (§5) — **nie** auf Gesundheitsdatentabellen für Leseoperationen der Nutzeroberfläche |
| Admin (`is_admin()`) | Verwaltungsrolle der Plattform | **kein Zugriff auf Gesundheitsdatentabellen** — nur auf die vier reinen Betriebstabellen (§4) |

## 3. Rechtematrix je Gesundheitsdatentabelle

Verifiziert gegen `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`
und `20260826010000_dipa_freischaltung_nachweise_eul.sql` (`CREATE POLICY`,
`REVOKE`, `GRANT`).

**E** = Eigentümer (betroffene Person) · **F** = Person mit gültiger Freigabe (`coach_shares`) · **Admin** = Verwaltungsrolle · **anon** = nicht angemeldet

| Tabelle | E | F | Admin | anon | Policy-Namen (Auszug) | Besonderheit |
|---|---|---|---|---|---|---|
| `coach_users` | alle Rechte | – | **–** | – | `coach_users_self` | bleibt auch bei Freigabe privat |
| `coach_consents` | lesen, anlegen, ändern | – | – | – | `coach_consents_select_self`, `_insert_self`, `_update_self` | kein Löschen — Policy fehlt **und** `REVOKE DELETE … FROM authenticated` |
| `coach_shares` | alle Rechte (Eigentümer) | lesen (nur eigene Freigabe) | – | – | `coach_shares_owner_all`, `coach_shares_grantee_select` | Empfangende sehen, dass sie freigeschaltet sind |
| `coach_assessments`, `coach_goals`, `coach_activities`, `coach_activity_log`, `coach_measurements` | alle Rechte | lesen | – | – | generisch erzeugtes Policy-Paar (`*_owner_all`, `*_share_select`) | `WITH CHECK` verhindert untergeschobene Fremdzuordnung |
| `coach_reports` | lesen, anlegen | lesen | – | – | `coach_reports_select_self`, `_insert_self`, `_share_select` | unveränderlich: `REVOKE UPDATE, DELETE … FROM authenticated` |
| `coach_audit_log` | lesen (nur eigene) | – | – | – | `coach_audit_log_select_self` | Schreiben nur durch den Trigger (`SECURITY DEFINER`); `REVOKE INSERT, UPDATE, DELETE … FROM authenticated`, `REVOKE ALL … FROM anon` |
| `coach_freischaltungen` | lesen | – | – | – | `coach_freischaltungen_select_self` | Schreiben nur im Systemkontext; `REVOKE INSERT, UPDATE, DELETE … FROM authenticated` |
| `coach_anspruchspruefungen` | alle Rechte | – | – | – | `coach_anspruchspruefungen_owner_all` | reine Selbstauskunft |
| `coach_nutzungsereignisse` | lesen, anlegen, löschen (über eigenes Pseudonym) | – | nur aggregiert, über Ausnahmeroute §5 | – | `coach_nutzungsereignisse_self_select`, `_self_insert`, `_self_delete` | kein Ändern (`REVOKE UPDATE`); enthält kein Fremdschlüssel auf `coach_users` |
| `coach_pseudonym_key` | – | – | **–** | – | keine Policy | RLS aktiv **ohne jede Policy**, alle Grants entzogen — für niemanden lesbar |

## 4. Rechtematrix — reine Betriebstabellen (kein Gesundheitsdatenbezug)

Diese vier Tabellen enthalten **keine** Gesundheitsdaten und **keinen**
Verweis auf `coach_users`. Für sie gilt das übliche Plattformmuster: eine
Admin-Policy plus eine restriktive Mandantengrenze (`org_fence`, beide
Bedingungen müssen gleichzeitig erfüllt sein).

| Tabelle | Admin (`is_admin()`) | Mandantengrenze | anon |
|---|---|---|---|
| `coach_freischaltcodes` | alle Rechte | `org_fence_coach_freischaltcodes` (RESTRICTIVE) | entzogen |
| `coach_abrechnungswege` | alle Rechte | `org_fence_coach_abrechnungswege` (RESTRICTIVE) | entzogen |
| `eul_erbringungen` | alle Rechte | `org_fence_eul_erbringungen` (RESTRICTIVE) | entzogen |
| `eul_qualifikationen` | alle Rechte | `org_fence_eul_qualifikationen` (RESTRICTIVE) | entzogen |

`coach_freischaltcodes` enthält nur Hashes und Pseudonyme, keine Beträge in
`coach_abrechnungswege`, keine Coach-Inhalte in den `eul_*`-Tabellen.

## 5. Rechtematrix — Selbstzahler-Abrechnung (Produkt A, `coach_bestellungen`/`_zahlungen`/`_rechnungen`)

Ergänzung aus Migration `20260907000000_coach_selbstzahler.sql` (Produkt A,
nicht DiPA-Modus, aber dieselben `coach_*`-Tabellen und dasselbe Muster):

| Tabelle | E (Nutzer) | Admin | anon | Besonderheit |
|---|---|---|---|---|
| `coach_bestellungen` | nur lesen (`coach_bestellungen_select_self`) | **keine Policy gefunden** | entzogen | Schreiben ausschließlich über `service_role` (Stripe-Webhook), `REVOKE INSERT, UPDATE, DELETE … FROM authenticated` |
| `coach_zahlungen` | nur lesen | **keine Policy gefunden** | entzogen | dito |
| `coach_rechnungen` | nur lesen | **keine Policy gefunden** | entzogen | Rechnungsnummer über `coach_naechste_rechnungsnummer()`, ausführbar nur durch `service_role` |

Auch für die Abrechnungstabellen von Produkt A gibt es **keine** Admin-Policy —
das „kein Admin-Zugriff"-Muster ist also nicht auf Gesundheitsdaten beschränkt,
sondern durchgängig für alle `coach_*`-Tabellen umgesetzt.

## 6. Die zwei begründeten Ausnahmen vom Session-Grundsatz

Beide kommen an Gesundheitsdaten nicht heran:

| Route | Warum Systemkontext | Beschränkung |
|---|---|---|
| `POST /api/coach/freischaltung` | Nutzende dürfen `coach_freischaltcodes` nicht lesen (sonst wären gültige Codes auslesbar) und sich nicht selbst eintragen | ausschließlich `coach_freischaltcodes` und `coach_freischaltungen`; Identität weiterhin aus `requireCoachUser()` |
| `GET /api/dipa/nachweise` | `coach_nutzungsereignisse` hat bewusst keine Verwaltungs-Policy, für die Evaluation müssen die Zeilen dennoch gelesen werden | nur diese eine Tabelle (kein Personenbezug); Route liefert ausschließlich Aggregate, nie Einzelzeilen/Pseudonyme, unter 5 Teilnehmenden gar nichts; zusätzliches Tor `requireOpsAdmin()` |

## 7. Rollen der Produktoberfläche (Inhaltssteuerung, keine Zugriffsrechte)

`coach_users.rolle` (CHECK-Constraint, drei Werte): `pflegebeduerftig`,
`angehoerig`, `pflegedienst`. **Wichtig:** Diese Rolle verleiht **keine
Rechte an fremden Daten** — sie steuert nur angezeigte Inhalte. Zugriff auf
fremde Daten entsteht ausschließlich über `coach_shares`.

## 8. Nachweis

| Geprüfte Eigenschaft | Test |
|---|---|
| Eigene Zeilen sichtbar, fremde nicht | P1 |
| Fremdzuordnung beim Schreiben abgewehrt | P2 |
| Verwaltungskonto sieht 0 Zeilen | P3 |
| Nicht angemeldeter Zugriff abgewehrt (Grant-Ebene) | P4 |
| Freigabe wirkt nur lesend; `coach_users` bleibt privat | P5 |
| Unveränderlichkeit von Berichten und Einwilligungen | P6 |
| Audit-Protokoll ist append-only | P7 |
| Widerruf beendet Zugriff sofort | P8 |
| Erweiterte Prüfungen für die 8 Tabellen aus `20260826010000` (u. a. Pseudonym-Isolation, `coach_pseudonym_key` für niemanden lesbar) | P9-Gruppe |

**Gesamtergebnis:** `supabase/shadow/50_pflegecoach_tests.sql`, **68/68
Prüfungen bestanden (Stand 14.08.2026)**, real gemessen gegen eine aus dem
Repository aufgebaute Datenbank (DiPA-Matrix QS-04). Ergänzend:
`lib/coach/produktgrenze.test.ts` sichert strukturell, dass jede schreibende
Coach-Route die Pflicht-Einwilligung prüft und dass keine neue Route diese
Prüfung vergisst.

## 9. Offene Punkte

| Punkt | Status |
|---|---|
| Verwaltungs-UI für Freigaben (`coach_shares`) | offen — GAP-SHARES-UI |
| Organisatorische Begrenzung des Datenbank-Administrationszugriffs (Vier-Augen-Prinzip bei Migrationen etc.) | offen — technisch nicht durch Policies lösbar, gehört ins Sicherheitskonzept des Betriebs |
| Rollenkonzept gegen den maßgeblichen Anforderungstext (DiPAV/BfArM-Leitfaden) geprüft | offen — kein Katalogeintrag als geprüft markiert (REG-01) |

---

## Quellen

* `audit/dipa/rollen_rechtekonzept.md`
* `lib/coach/produktgrenze.test.ts`
* `lib/coach/api-auth.ts`
* `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`
* `supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql`
* `supabase/migrations/20260907000000_coach_selbstzahler.sql`
* `supabase/shadow/50_pflegecoach_tests.sql`
* `docs/DIPA_MATRIX_FINAL.md` (SEC-06, SEC-08)
