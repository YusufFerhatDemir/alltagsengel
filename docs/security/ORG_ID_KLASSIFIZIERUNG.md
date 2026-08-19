# Klassifizierung: die 82 Tabellen ohne `organization_id`

**Datum:** 2026-08-19
**Anlass:** Security-Audit 2026-08-19, Befund **HOCH-1**
**Quelle der Wahrheit:** `scripts/org-id-klassifizierung.json`
**Gegenprobe:** `__tests__/security/org-id-klassifizierung.test.ts` — hält die Einordnung vollständig (82/82), überschneidungsfrei und deckungsgleich mit dem, was die Migrationen anfassen.

---

## Warum die Frage überhaupt gestellt wird

`organization_id` ist in diesem Schema kein Ordnungsmerkmal, sondern der Anker der Mandantentrennung: Nur auf Tabellen mit dieser Spalte kann der RESTRICTIVE `org_fence` greifen (`organization_id = current_org_id()`). Fehlt sie, entscheidet allein die permissive Policy — und die lautete auf 52 dieser Tabellen schlicht `is_admin()`.

**Eine Spalte auf Vorrat ist aber kein Gewinn.** Bei systemweiten Referenzdaten (Feiertage, Bundesländer, Preisstufen) wäre sie toter Ballast, der bei jedem Insert mitgeschleppt und bei jeder Abfrage mitgefiltert werden müsste — mit dem realen Risiko, dass ein vergessener Filter Referenzdaten *unsichtbar* macht. Deshalb wird jede der 82 Tabellen einzeln eingeordnet, nicht pauschal behandelt.

---

## Ergebnis in Zahlen

| Klasse | Anzahl | Handlung |
|---|---:|---|
| `referenz` — systemweite Referenz-/Regelwerksdaten | 24 | **keine** — `organization_id` wäre Ballast |
| `technisch` — an `auth.uid()` oder ein Gerät gebunden | 8 | **keine** — Zugriff läuft über die Nutzer-Bindung |
| `analytics` — Tracking/Analytics | 7 | Spalte + `org_fence` → `20260922010000` |
| `coach` — PflegeCoach (pseudonymisiert) | 16 | **bewusst keine** — siehe unten |
| `org_fence` — personenbezogen, servergeschrieben | 18 | Spalte + `org_fence` → `20260922020000` |
| `admin_policy_verengt` — personenbezogen, nutzergeschrieben | 9 | Admin-Policy auf Org-Nachweis verengt → `20260922020000` |
| **Summe** | **82** | |

**34 Tabellen brauchen kein `organization_id`** (referenz + technisch + coach = 48 … davon sind die 16 Coach-Tabellen eine bewusste Ausnahme, siehe dort).
**34 Tabellen bekommen einen echten Mandanten-Fence** (analytics 7 + org_fence 18 + 9 über verengte Admin-Policies).

---

## `referenz` (24) — systemweite Referenz-/Regelwerksdaten

`_sql_parts`, `app_settings`, `billing_feiertage`, `billing_gesetzliche_obergrenzen`, `billing_landesregel_keys`, `billing_leistungsarten`, `billing_rechtsgrundlagen`, `billing_tarifquellen`, `bundeslaender`, `content_blocks`, `kf_feature_flags`, `kf_pricing_audit`, `kf_pricing_config`, `kf_pricing_costs`, `kf_pricing_regions`, `kf_pricing_rules`, `kf_pricing_surcharges`, `kf_pricing_tiers`, `kf_review_rules`, `kf_service_doc_requirements`, `mis_dataroom_sections`, `mis_document_categories`, `organizations`, `plz_bundesland_regeln`

**Begründung.** Der Inhalt ist für jeden Mandanten identisch und enthält keinen Personenbezug: gesetzliche Sätze, Feiertage, PLZ-Regeln, Preisstufen des Krankenfahrten-Produkts, Marketing-Textbausteine, Dokumentkategorien. Ein Mandanten-Fence würde hier Daten verbergen, die alle Mandanten sehen *sollen*.

Zwei Sonderfälle:

* **`organizations`** *ist* die Mandantentabelle. Eine `organization_id` auf ihr wäre zirkulär.
* **`_sql_parts`** ist ein Werkzeug-Rest ohne jede Policy (nur `service_role`), begründet in `20260817010000`.

**Restrisiko:** Schreibrechte auf diese Tabellen sind mandantenübergreifend wirksam — ein Mandant könnte Referenzdaten für alle ändern. Das ist heute kein Problem, weil Schreiben ausschließlich `is_admin()` bzw. `service_role` vorbehalten ist und produktiv nur die Stamm-Organisation existiert. Vor dem ersten Fremdmandanten muss entschieden werden, ob diese Tabellen für Mandanten-Admins schreibgeschützt werden (Empfehlung: ja, nur `superadmin`).

---

## `technisch` (8) — an Nutzer oder Gerät gebunden

`account_deletion_tokens`, `action_fingerprints`, `coach_pseudonym_key`, `fcm_tokens`, `login_rate_limits`, `offline_queue`, `push_subscriptions`, `sync_conflicts`

**Begründung.** Die Zeilen gehören einem Gerät, einer Session oder einem Einmal-Token — der Zugriff wird über `auth.uid()` bzw. `service_role` entschieden, nicht über eine Organisation. `login_rate_limits` ist IP-basiert und existiert gerade *vor* jeder Authentifizierung; ein Org-Bezug wäre dort nicht ermittelbar. `coach_pseudonym_key` hat bewusst **keine** Policy (`20260826010000`) — eine `organization_id` daneben wäre eine Re-Identifizierungshilfe.

---

## `analytics` (7) — erledigt in `20260922010000`

`analytics_events`, `conversions`, `geo_events`, `page_views`, `partner_visits`, `visitor_locations`, `visitors`

Spalte + Backfill Stamm-Org + `DEFAULT current_org_id()` + `NOT NULL` + Index + RESTRICTIVE `org_fence`. Zusätzlich sind dort die drei offenen `INSERT … WITH CHECK (true)`-Policies entfallen (Befund NIEDRIG-3); alle Schreibpfade laufen jetzt über ratenbegrenzte Server-Routen mit Service-Role-Key.

---

## `coach` (16) — bewusst ohne `organization_id`

`coach_activities`, `coach_activity_log`, `coach_anspruchspruefungen`, `coach_assessments`, `coach_audit_log`, `coach_bestellungen`, `coach_consents`, `coach_freischaltungen`, `coach_goals`, `coach_measurements`, `coach_nutzungsereignisse`, `coach_rechnungen`, `coach_reports`, `coach_shares`, `coach_users`, `coach_zahlungen`

**Begründung.** Der PflegeCoach hat einen eigenen, *pseudonymisierten* Mandantenkontext: alle Zeilen hängen an `coach_user_id`, die Zuordnung zur realen Person liegt ausschließlich in `coach_pseudonym_key` (nur `service_role`, keine Policy). Genau diese Trennung ist der Grund, warum die Daten als Art.-9-Daten überhaupt so gehalten werden dürfen.

Eine `organization_id` an jeder Coach-Zeile würde diese Trennung aufweichen: Sie wäre ein zusätzliches, nicht-pseudonymes Merkmal, über das sich Datensätze gruppieren und damit leichter re-identifizieren lassen.

**Offene fachliche Frage (nicht technisch entscheidbar):** `coach_bestellungen`, `coach_zahlungen`, `coach_rechnungen` und `coach_freischaltungen` sind kaufmännische Belege und unterliegen handels-/steuerrechtlichen Zuordnungspflichten. Sobald PflegeCoach von mehr als einem Mandanten verkauft wird, braucht es dort eine Mandantenzuordnung — dann aber als eigener Beleg-Kontext, nicht als Spalte an den Gesundheitsdaten. Das ist eine Produktentscheidung, keine Migration.

---

## `org_fence` (18) — Spalte + RESTRICTIVE Fence, `20260922020000`

`approved_locations`, `audit_logs`, `kf_booking_reviews`, `kf_partner_availability`, `kf_partners`, `krankenfahrt_providers`, `krankenfahrt_reviews`, `krankenfahrten`, `lead_inquiries`, `mis_auth_log`, `mis_dataroom_access`, `mis_privacy_audit_log`, `mis_privacy_consents`, `mis_privacy_records`, `mis_privacy_requests`, `newsletter_subscribers`, `notfall_access_attempts`, `whatsapp_conversations`

**Begründung.** Personenbezogen, und die Zeilen entstehen server- oder adminseitig — die Organisation ist zum Schreibzeitpunkt bekannt und stabil. Damit ist ein RESTRICTIVE Fence sauber: `DEFAULT current_org_id()` setzt die Org beim Insert, der Fence schneidet jede Abfrage darauf zu.

Besonders relevant: die vier `mis_privacy_*`-Tabellen führen **DSGVO-Anfragen und Einwilligungen**. Dass ein fremder Mandanten-Admin diese sehen konnte, war der schwerwiegendste Einzelfall unter HOCH-1. `audit_logs`, `mis_auth_log` und `notfall_access_attempts` sind Sicherheitsprotokolle — auch die gehören strikt in den eigenen Mandanten.

---

## `admin_policy_verengt` (9) — Admin-Policy mit Org-Nachweis, `20260922020000`

`angel_availability`, `angel_reviews`, `angels`, `chat_messages`, `messages`, `notifications`, `profiles`, `referrals`, `reviews`

**Warum hier kein Fence.** Diese Zeilen erzeugen die **Endnutzer selbst** — bei der Registrierung, beim Schreiben einer Nachricht, beim Abgeben einer Bewertung. Ein Profil entsteht dabei regelmäßig *vor* der zugehörigen `clients`- oder `caregivers`-Zeile. Ein RESTRICTIVE Fence auf `organization_id` würde diese Nutzer aus den eigenen Zeilen aussperren, sobald sich ihre Org-Zuordnung nachträglich ergibt — bei `profiles` wäre das ein vollständiger Aussperr-Fehler: kein Profil lesbar, keine Anmeldung nutzbar.

**Stattdessen** wird nur die org-blinde Admin-Policy verengt, die Selbstzugriffs-Policies bleiben unangetastet:

```sql
USING (is_admin() AND public.nutzer_in_aktiver_org(<nutzerspalte>))
```

Das ist exakt das Muster, das bei `reviews`/`angel_reviews` bereits stand (`is_admin() AND buchung_in_aktiver_org(booking_id)`) — der Audit nennt es selbst als Vorlage. Diese beiden Tabellen bleiben deshalb unverändert; `chat_messages` hat gar keine Admin-Policy (nur Fahrt-Beteiligte) und braucht ebenfalls nichts.

**Voraussetzung dafür war eine Korrektur an `current_org_id()`:** Die Funktion kannte bisher nur `organization_members` — eine Tabelle, die 2026-08-01 ausschließlich mit den damaligen Plattform-Admins befüllt wurde. Engel und Kundschaft haben dort keine Zeile und landeten ausnahmslos im Stamm-Org-Fallback; jeder Fence wäre für sie wirkungslos gewesen. `current_org_id()` löst jetzt auf wie `resolveUserOrgId()` in der Anwendung: JWT → `organization_members` → `caregivers` → `clients` → Stamm-Org.

### Dokumentierter Restpunkt

`nutzer_in_aktiver_org(p_user)` gibt **true** zurück, wenn der Nutzer *überhaupt keine* Org-Bindung hat. Ohne diesen Zweig wären frisch registrierte Nutzer für jeden Admin unsichtbar und die Nutzerverwaltung direkt nach der Registrierung blind.

**Folge:** Bindungslose Nutzer sind bis zu ihrer ersten Zuordnung für Admins aller Mandanten sichtbar. Das ist der bewusst gewählte, kleinere Fehler — und der Weg, ihn zu schließen, ist organisatorisch: Neuregistrierungen sollten bei der Anlage direkt eine Org-Bindung erhalten (`organization_members` bei Personal, `clients`/`caregivers` bei Kundschaft und Engeln). Der PGlite-Test hält diesen Restpunkt ausdrücklich fest, damit er nicht unbemerkt zur Annahme wird.

---

## Was diese Einordnung *nicht* leistet

1. **Kein Live-Angriffsnachweis.** Die Wirkung ist auf einer echten PostgreSQL-Instanz gemessen (PGlite, `__tests__/security/hoch1-mandantentrennung-pglite.test.ts`, 27 Fälle inklusive Vorher-Zustand) — nicht per Impersonation gegen Production. Solange die Migrationen nicht live angewendet sind, gilt der Befund in Production unverändert.
2. **Keine Aussage über Schreibrechte auf Referenzdaten.** Siehe Restrisiko unter `referenz`.
3. **Keine Entscheidung zum PflegeCoach-Beleg-Kontext.** Siehe offene Frage unter `coach`.
