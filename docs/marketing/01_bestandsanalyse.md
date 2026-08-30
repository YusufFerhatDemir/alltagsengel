# Bestandsanalyse — Marketing-/CRM-Grundlage

**Stand: 30.08.2026** · Supabase-Projekt `nnwyktkqibdjxgimjyuq` · gelesen über PostgREST mit dem Dienstschlüssel

Alle Zahlen sind an diesem Tag live gezählt. Sie sind eine Momentaufnahme —
vor jeder Aussage, die auf ihnen aufbaut, neu zählen (`npm run verify:marketing`).

---

## 1. Was es gab — und was nicht

Das Schema führt live **337 Tabellen**. Für Marketing relevant waren davon
neun. Es gab **keine** Tabelle für Einwilligung, Sperrliste, Kampagne oder
Zustellspur — die gesamte Schicht ist neu (Migration `20261019000000`).

Vorhanden war ausschließlich **Transaktionspost**: Rechnung, Mahnung,
Terminerinnerung, Passwortreset über `lib/notifications.ts` (Resend,
Absender `Alltagsengel <info@alltagsengel.care>`). Dazu ein
Newsletter-Anmeldeweg mit HMAC-Abmeldetoken, aber ohne Verteiler-Inhalt.

---

## 2. Der adressierbare Bestand

### `profiles` — 65 Zeilen, **alle mit E-Mail-Adresse**

Das ist die tragende Tabelle. Verteilung:

| Rolle | echt | Testkonten | Summe |
|---|---:|---:|---:|
| kunde | 26 | 8 | 34 |
| engel | 16 | 6 | 22 |
| fahrer | 0 | 5 | 5 |
| superadmin | 2 | 1 | 3 |
| admin | 0 | 1 | 1 |
| **Summe** | **44** | **21** | **65** |

* E-Mail-Abdeckung: **65 von 65** (100 %)
* PLZ hinterlegt: 45 von 65
* `onboarding_completed = true`: 46 von 65
* `deleted_at` gesetzt: 0

**Der echte adressierbare Bestand sind also 42 Personen** (26 Kundschaft +
16 Engel). Testkonten sind in jedem Segment ausgeschlossen — geprüft in
`lib/marketing/segmente.test.ts`.

### `angels` — 17 Zeilen

`angels.id` ist identisch mit `profiles.id`; alle 17 tragen dort die Rolle
`engel`. Die Tabelle hat **keine** eigene E-Mail-Spalte — die Adresse kommt
aus `profiles`.

Besonderheit: `is_certified` steht bei allen auf `false`, während
`qualification` belegt ist (z. B. „Altenpfleger/in"). Ein Segment
„qualifiziert", das nur auf `is_certified` prüft, wäre deshalb **leer**.
`lib/marketing/empfaenger.ts` wertet beides aus.

### `caregivers` — 2 Zeilen

Beide mit Adresse, beide `@alltagsengel.care` (Testdaten), beide
`einsatzfreigabe = false`, beide ohne Führungszeugnis-Datum. Trägt
`organization_id` und wird darüber gefiltert.

### `lead_inquiries` — 34 Zeilen · **KEINE E-Mail-Spalte**

> **Das ist der wichtigste Befund der Analyse.**

Die Tabelle führt `name`, `phone`, `plz`, `message`, `source`, `status` —
aber **keine Adresse**. Die 34 Anfragen über das Lead-Formular sind per
E-Mail **nicht erreichbar**.

Statusverteilung: 32 × `new`, 2 × `contacted`.

Folge: das Segment „Leads" füllt sich ausschließlich aus
`newsletter_subscribers`. Wer Leads per Mail erreichen will, braucht zuerst
eine Adressspalte **samt Einwilligungs-Kontrollkästchen am Formular** —
beides eine Änderung am Perimeter, nicht am Marketing. Ohne Einwilligung
wäre die Adresse ohnehin nicht verwendbar.

### `newsletter_subscribers` — 0 Zeilen

Der Verteiler ist leer. Der Anmeldeweg (`POST /api/newsletter`) funktioniert
und schreibt hierher.

### `mis_applicants` — 0 Zeilen

Das Bewerber-Segment ist leer. Die Tabelle trägt `email` und
`organization_id`, ist also anschlussfähig.

### `clients` — 4 Zeilen

3 von 4 mit Adresse, keine mit `user_id`. Werden **nicht** als
Marketingkontakte geladen: die Kundenakte ist die Pflegeakte, und ihre
Adresse ist für Vertragspost hinterlegt, nicht für Werbung. Kundschaft wird
über `profiles` erreicht.

### `bookings` — 10 Zeilen

Die Aktivitätsspur. 6 verschiedene Kundenkennungen, Zeitraum Februar bis
Juli 2026, überwiegend `accepted`/`cancelled`. Speist `anzahlBuchungen`,
`letzteBuchung` und `letzteAktivitaet`.

### `organizations` — 6 Zeilen

Eine echte (`Alltagsengel UG`, `00000000-0000-4000-8000-000460629986`) und
fünf Testmandanten (`E2E_TEST_*`).

---

## 3. Zwei Einschränkungen, die im Bau berücksichtigt sind

### `profiles` hat keine `organization_id`

Aus `profiles` abgeleitete Kontakte lassen sich **nicht** nach Mandant
trennen. `organization_members` enthält nur 3 Zeilen (alle `owner`) und ist
keine Zuordnung für Kundschaft und Engel.

Die Antwort ist fail-closed: `ladeMarketingKontakte()` lädt profile-basierte
Kontakte **ausschließlich für die Stamm-Organisation**. Ein anderer Mandant
bekommt aus `profiles` nichts — lieber ein leeres Segment als die
Adressliste eines fremden Mandanten.

### Es gibt keine Öffnungs- und Klickerfassung

`email_campaign_logs` führt die Spalten `opened_at` und `clicked_at`, aber
**nichts füllt sie**. Das bräuchte einen Resend-Webhook. Bis dahin zeigt das
Cockpit dort ehrliche Nullen — keine geschätzten Werte.

---

## 4. Was daraus für den ersten Versand folgt

`marketing_consents` ist **leer**. Nach § 7 Abs. 2 Nr. 2 UWG und Art. 7
Abs. 1 DSGVO heißt das:

> **Es gibt derzeit keinen einzigen Empfänger, der eine Werbemail bekommen darf.**

Das ist kein Fehler des Systems, sondern die richtige Antwort auf die
Datenlage. Jeder Trockenlauf wird deshalb `versandfähig: 0` melden, mit der
Aufschlüsselung „x ohne Einwilligung". Erst wenn Einwilligungen vorliegen —
über das Doppel-Opt-in am Formular oder vertraglich erteilt und eingetragen
— füllen sich die Segmente.

Die vorhandenen 42 Adressen sind **kein** Verteiler. Sie sind
Vertragspartner und Mitarbeitende; ihre Adressen wurden zur
Vertragsabwicklung erhoben, nicht zur Werbung.
