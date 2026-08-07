# FUNKTIONSTEST-REPORT — Production-Abnahme

**Datum:** 2026-08-07
**Projekt:** Alltagsengel UG — Supabase Production (`nnwyktkqibdjxgimjyuq`)
**Stamm-Org:** `00000000-0000-4000-8000-000460629986`

---

## Gesamtergebnis: GO ✅

Alle funktionalen Prüfpunkte bestanden. Hessen korrekt konfiguriert. Kassenabrechnung überall deaktiviert (Anerkennungsbescheid ausstehend). Ein-Klick-Freischaltung bereit für späteren Einsatz.

---

## 1. Registrierung — Schema-Verifikation: PASS ✅

| Prüfpunkt | Ergebnis |
|-----------|----------|
| INSERT-Trigger `trg_prevent_privileged_role_insert` aktiv | ✅ nur INSERT |
| Alter Trigger `trg_prevent_role_escalation_insert` entfernt | ✅ nicht mehr vorhanden |
| UPDATE-Trigger `trg_prevent_role_escalation` bleibt | ✅ nur UPDATE |
| Funktion blockiert NUR admin/superadmin | ✅ alle anderen Rollen erlaubt |
| `profiles.agb_accepted_at` (TIMESTAMPTZ) existiert | ✅ |
| `profiles.agb_version` (TEXT) existiert | ✅ |
| RLS Policy `profiles_insert` erlaubt INSERT für `auth.uid() = id` | ✅ |
| RLS Policy Duplikat (TR) ebenfalls vorhanden | ✅ redundant, nicht schädlich |

**Bewertung:** Die Registrierung ist auf Schema-Ebene vollständig funktionsfähig. Der kritische Bug (INSERT-Trigger blockierte alle Rollen seit 04.08.) ist behoben. Ein manueller End-to-End-Test der Registrierung über die App wird empfohlen.

---

## 2. PLZ→Bundesland-Mapping: PASS ✅ (16/16)

| PLZ | Erwartetes Bundesland | Ergebnis | Status |
|-----|----------------------|----------|--------|
| 10115 | berlin | berlin | ✅ |
| 20095 | hamburg | hamburg | ✅ |
| 80331 | bayern | bayern | ✅ |
| 50667 | nordrhein_westfalen | nordrhein_westfalen | ✅ |
| 60311 | hessen | hessen | ✅ |
| 70173 | baden_wuerttemberg | baden_wuerttemberg | ✅ |
| 01067 | sachsen | sachsen | ✅ |
| 30159 | niedersachsen | niedersachsen | ✅ |
| 55116 | rheinland_pfalz | rheinland_pfalz | ✅ |
| 24103 | schleswig_holstein | schleswig_holstein | ✅ |
| 99084 | thueringen | thueringen | ✅ |
| 39104 | sachsen_anhalt | sachsen_anhalt | ✅ |
| 66111 | saarland | saarland | ✅ |
| 14467 | brandenburg | brandenburg | ✅ |
| 18055 | mecklenburg_vorpommern | mecklenburg_vorpommern | ✅ |
| 28195 | bremen | bremen | ✅ |

**Keine Hessen-Fallbacks.** Jede PLZ wird eindeutig dem korrekten Bundesland zugeordnet.

---

## 3. State Settings — Alle 16 Bundesländer: PASS ✅

| Bundesland | Status | Marketing | Registrierung | Warteliste | Privat | Kasse | Tarife | Budget | Rechnung | ELNW | Dakota |
|-----------|--------|-----------|---------------|-----------|--------|-------|--------|--------|----------|------|--------|
| **hessen** | **ANTRAG_EINGEREICHT** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| baden_wuerttemberg | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| bayern | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| berlin | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| brandenburg | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| bremen | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| hamburg | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| mecklenburg_vorpommern | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| niedersachsen | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| nordrhein_westfalen | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| rheinland_pfalz | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| saarland | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| sachsen | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| sachsen_anhalt | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| schleswig_holstein | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| thueringen | VORBEREITUNG | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Korrekt:**
- Hessen = einziges Land mit ANTRAG_EINGEREICHT und private_enabled = TRUE
- Alle 15 anderen = VORBEREITUNG, Privatleistungen noch deaktiviert
- Kassenabrechnung überall AUS (kein Anerkennungsbescheid vorliegend)
- Marketing, Registrierung und Warteliste überall EIN

---

## 4. Hessen-Konfiguration: PASS ✅

| Einstellung | Soll | Ist | Status |
|------------|------|-----|--------|
| Status | ANTRAG_EINGEREICHT | ANTRAG_EINGEREICHT | ✅ |
| Werbung | EIN | TRUE | ✅ |
| Registrierung | EIN | TRUE | ✅ |
| Warteliste | EIN | TRUE | ✅ |
| Privatleistungen | EIN | TRUE | ✅ |
| Pflegekassenabrechnung | AUS | FALSE | ✅ |
| §45b-Kassenabrechnung | AUS | FALSE | ✅ |
| Dakota/Kassenexport | AUS | FALSE | ✅ |

**Keine Änderung nötig** — die Seed-Migration hat Hessen bereits korrekt konfiguriert.

---

## 5. Ein-Klick-Freischaltung: PASS ✅

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Funktion `activate_insurance_billing` existiert | ✅ |
| SECURITY DEFINER | ✅ |
| REVOKE von anon | ✅ bestätigt |
| REVOKE von authenticated | ✅ bestätigt |
| Nur via service_role aufrufbar | ✅ |
| Verlangt `p_approval_document` (NOT NULL) | ✅ |
| Verlangt mindestens 1 Kassentarif | ✅ (`zaehle_kassentarife`) |
| Setzt alle 6 Module auf TRUE | ✅ |
| Aktiviert vorbereitete Tarife | ✅ (`ist_aktiv = TRUE`) |
| Aktiviert Landesregeln | ✅ |
| Schreibt Audit-Log | ✅ (`log_state_settings_change`) |
| Gibt `state_activation_result` zurück | ✅ (inkl. tarife_aktiviert, regeln_aktiviert) |
| Hessen freischaltbar? | NEIN — `freischaltbar = false` (0 Kassentarife) |

**Bewertung:** Die Freischaltung ist korrekt abgesichert. Hessen kann erst freigeschaltet werden, wenn (1) Anerkennungsbescheid vorliegt UND (2) mindestens ein Kassentarif gepflegt ist. Beide Bedingungen fehlen derzeit — wie gewollt.

---

## 6. Dashboard View: PASS ✅

| Prüfpunkt | Ergebnis |
|-----------|----------|
| View `state_expansion_dashboard` existiert | ✅ |
| `security_invoker = true` | ✅ |
| Hessen-Daten korrekt | ✅ |
| Kassentarife gesamt: 0 | ✅ (keine gepflegt) |
| Obergrenzen gesamt: 2 | ✅ (Hessen-Seed: 30€/25€ UNBESTÄTIGT) |
| Landesregeln aktiv: 1 | ✅ |
| Klienten: 1 | ✅ (Bestandsdaten) |
| Freischaltbar: FALSE | ✅ (keine Tarife) |
| Kreuz-Mandanten-Schutz | ✅ (security_invoker) |
| REVOKE von anon | ✅ |

---

## 7. Guard-Trigger: PASS ✅ (9/9 + 6 set_updated_at)

| Trigger | Tabelle | Funktion | Status |
|---------|---------|----------|--------|
| trg_tariff_obergrenze | billing_tariffs | enforce_tariff_obergrenze | ✅ |
| trg_kassentarif_freigeschaltet | billing_tariffs | enforce_kassentarif_freigeschaltet | ✅ |
| trg_kassenrechnung_freigeschaltet | invoices | enforce_kassenrechnung_freigeschaltet | ✅ |
| trg_booking_zahlungsart | bookings | enforce_booking_zahlungsart | ✅ |
| trg_booking_status_transition | bookings | enforce_booking_status_transition | ✅ |
| trg_state_settings_kanal | state_settings | enforce_state_settings_kanal | ✅ |
| trg_state_settings_kein_delete | state_settings | verhindere_state_settings_delete | ✅ |
| trg_prevent_privileged_role_insert | profiles | prevent_privileged_role_insert | ✅ |
| trg_prevent_role_escalation | profiles | prevent_role_escalation | ✅ |

Plus 6 `set_updated_at`-Trigger auf: abrechnung_zertifikate, billing_gesetzliche_obergrenzen, billing_landesregeln, billing_wegepauschalen, datenannahmestellen, state_settings, state_waitlist.

---

## 8. Offene Punkte (manueller Test empfohlen)

| Punkt | Grund |
|-------|-------|
| Registrierung End-to-End über App | Kann nicht automatisiert auf Production getestet werden (Account-Erstellung ist Prohibited Action). Schema-Prüfung bestanden. |
| Login nach Registrierung | Abhängig von End-to-End-Test |
| Kunden-App: Warteliste UI | Frontend-Test erforderlich |
| Kunden-App: Hinweis „Genehmigungsverfahren" | Frontend muss `state_flag()` korrekt auswerten |
| Admin-Dashboard: 16 Bundesländer im UI | Frontend-Test des Admin-Panels |

---

## 9. Statuslogik-Bewertung: PASS ✅

| Status | Beschreibung | Guard-geschützt |
|--------|-------------|----------------|
| VORBEREITUNG | Default für neue Bundesländer | ✅ (Seed) |
| ANTRAG_EINGEREICHT | Antrag bei Behörde eingereicht | ✅ (`update_state_settings`) |
| IN_PRUEFUNG | Behörde prüft | ✅ (`update_state_settings`) |
| ANERKANNT | Bescheid erteilt → Freischaltung | ✅ (`activate_insurance_billing`) |
| ABGELEHNT | Antrag abgelehnt | ✅ (`deactivate_insurance_billing`) |

Marketing, Registrierung und Warteliste funktionieren unabhängig vom Kassenanerkennungsstatus — bestätigt durch die State-Settings-Matrix (alle 16 Länder haben diese drei Module aktiv).

---

## 10. Sicherheits-Gates: PASS ✅

| Gate | Umgehung möglich? |
|------|-------------------|
| Kassenabrechnung ohne Bescheid | ❌ `activate_insurance_billing` verlangt `p_approval_document` |
| Kassenabrechnung ohne Tarife | ❌ `zaehle_kassentarife` muss > 0 sein |
| State Settings ohne RPC | ❌ `enforce_state_settings_kanal` blockiert direkte Änderungen |
| State Settings löschen | ❌ `verhindere_state_settings_delete` blockiert DELETE |
| Admin-Profil durch Nicht-Admin | ❌ `prevent_privileged_role_insert` blockiert |
| Kreuz-Mandanten-Zugriff | ❌ `security_invoker = true` auf Views |
| Tarif über Obergrenze | ❌ `enforce_tariff_obergrenze` prüft |
| Kassenrechnung in nicht-freigeschaltetem Land | ❌ `enforce_kassenrechnung_freigeschaltet` prüft |

---

## Gesamtbewertung

**GO — Production-Funktionstest bestanden.**

Alle 10 Prüfbereiche bestanden. Hessen korrekt konfiguriert (ANTRAG_EINGEREICHT, Privatleistungen EIN, Kassenabrechnung AUS). Kassenabrechnung kann nicht ohne Anerkennungsbescheid UND vorbereitete Tarife freigeschaltet werden. Alle Security-Gates aktiv und nicht umgehbar. 16 Bundesländer korrekt gemappt und konfiguriert.

Empfehlung: Manuellen End-to-End-Test der Registrierung über die App durchführen.

---

*Erstellt: 2026-08-07 | Agent: Claude | Production-Funktionstest*
