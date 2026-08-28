# AE Track 8 — Tourenplanung + Einsatzdokumentation Audit

**Datum:** 2026-08-28
**Methode:** Quelltextlesung aller Touren-, Einsatz-, Dienstplan- und Leistungsnachweis-Wege; RLS-Policies und DB-Trigger aus Migrationen; Zustandsmaschinen gegen den Live-CHECK gehalten.

---

## Befund

### B1 (P1): DELETE /api/tours/[id] umging die Tour-Zustandsmaschine

**Datei:** `app/api/tours/[id]/route.ts`, Zeilen 178-201 (alt)

**WAS:** Der DELETE-Handler setzte `status: 'STORNIERT'` direkt per Update, ohne den Ist-Stand der Tour zu laden und gegen `assertTourUebergang()` zu pruefen.

**WARUM das ein Problem ist:** `TOUR_UEBERGAENGE` definiert `ABGESCHLOSSEN: []` — ein Endzustand ohne erlaubte Folgezustaende. An den Stops einer abgeschlossenen Tour haengen Leistungsnachweise und moeglicherweise Rechnungen. Der PATCH-Handler auf derselben Route prueft diesen Uebergang korrekt (laedt `bestand.status`, ruft `assertTourUebergang` auf). Nur der DELETE-Handler liess ihn aus.

**WIE es schadet:**
1. Eine ABGESCHLOSSENE Tour mit signierten/abgerechneten Nachweisen wird auf STORNIERT gesetzt.
2. `storniereTourEinsaetze` storniert alle nicht-ABGESCHLOSSENEN Einsaetze (noch offene Stops).
3. Die Tour verschwindet aus der aktiven Tourenansicht (Filter auf Status).
4. Schwerer: STORNIERT → GEPLANT ist ein erlaubter Uebergang — ueber PATCH koennte die Tour danach wieder geoeffnet werden. Eine abgeschlossene Tour waere dann im Status GEPLANT, waehrend ihre Stops ABGESCHLOSSEN und ihre Nachweise signiert/abgerechnet sind — ein inkonsistenter Zustand.

**FIX:** DELETE laedt jetzt den Bestand und ruft `assertTourUebergang(bestand.status, 'STORNIERT')` auf. Bei ABGESCHLOSSENER Tour antwortet die Route 422 mit der Fehlermeldung der Zustandsmaschine. Derselbe Code-Pfad wie PATCH, keine neue Regel.

**Tests:** 37 neue Tests in `lib/touren/__tests__/tour-state-machine.test.ts`:
- Vollstaendige Abdeckung aller erlaubten und verbotenen Tour-Uebergaenge
- Vollstaendige Abdeckung aller Stop-Uebergaenge
- assertTourOffen-Erlaubnisliste
- **GEGENPROBE 1:** Die ALTE Regel (direktes STORNIERT ohne Statuscheck) auf eine ABGESCHLOSSENE Tour — assertTourUebergang faengt den Fall.
- **GEGENPROBE 2:** Die Kette DELETE→PATCH haette eine abgeschlossene Tour ueber STORNIERT→GEPLANT zurueckgedreht — Schritt 1 scheitert jetzt an der Zustandsmaschine.
- **GEGENPROBE 3:** Abgeschlossener Stop darf nicht auf GEPLANT zurueckgesetzt werden (Leistungsnachweis-Bindung).

---

## Negativbefunde (ausdruecklich kein Fehler)

### N1: Fahrtzeiten/Kilometer sind server-berechnet, nicht aus dem Request-Body

`lib/touren/fahrtzeit.ts` berechnet Fahrtzeiten offline aus PLZ-Koordinaten (~8300 deutsche PLZ in `lib/plz-coords.ts`), Haversine-Distanz, Umwegfaktor 1.3 und einem Geschwindigkeitsmodell (22/35/55 km/h nach Entfernung). `reichereFahrtzeitenAn()` wird in `POST /api/tours` server-seitig aufgerufen. Kein Feld aus dem Request-Body geht in die Berechnung ein. Der Puffer (3 Min/Stop) ist ebenfalls eine Konstante.

### N2: org_fence auf allen Tour-Lese- und Schreibwegen

Jede Tour-Route (`GET`, `POST`, `PATCH`, `DELETE`, Stops, Vertretung, Templates) filtert mit `.eq('organization_id', auth.ctx.organizationId)`. Der RLS-Policy `tours_org_fence` (RESTRICTIVE) liegt zusaetzlich auf der Tabelle. `POST /api/tours` setzt `organization_id: auth.ctx.organizationId` explizit im Insert (Zeile 247). Templates nutzen `fenceFremdschluessel()` fuer caregiver_id und client_ids (Track-7-Fix).

### N3: is_locked schuetzt service_records nach Signatur

Der DB-Trigger `compute_signature_hash` setzt `is_locked=true` bei `proof_status='UNTERSCHRIEBEN'`. `prevent_locked_record_change` blockiert danach ALLE Updates. Ausnahmen: Admin-Unlock und Admin-Storno. `prevent_finalized_service_record_mutation` schuetzt zusaetzlich `start_time`, `end_time`, `service_type`, `amount` nach `status='signed'/'invoiced'`. `duration_minutes` ist GENERATED — nicht direkt aenderbar.

### N4: GPS-Validierung ist server-seitig

`/api/native/geo-events` laeuft auf dem Server, berechnet Haversine-Distanz zu `approved_locations` und erzeugt bei Abweichung einen `review_errors`-Eintrag (Soft-Block, severity=warning). Die Entscheidung, keinen Hard-Block zu setzen, ist dokumentiert und gewollt — Pflegedienste arbeiten nicht ausschliesslich an festen Standorten.

### N5: Doppelbelegungspruefung funktioniert ueber Tagesgrenzen

`check_assignment_overlap` (Migration 20261012000000) und `check_doppelbelegung` (Migration 20261011000000) handhaben Nachtdienste korrekt: Zeitberechnung in Minuten seit Mitternacht mit `+1440` bei Tageswechsel, Suche ueber `datum-1` bis `datum+1`. Die Anwendungslogik in `lib/einsatzplanung/konflikte.ts` spiegelt diese Logik. Beide Migrationen sind LIVE.

### N6: ArbZG-Trigger loggt Verstoesse (bewusst nicht blockierend)

`arbeitszeit_verstoesse` (Migration 20260920060000) prueft zwei Regeln: max. 10h/Tag (section 3 ArbZG) und min. 11h Ruhezeit (section 5 ArbZG). Verstoesse werden in `arbeitszeit_verstoesse` eingetragen und in der PDL-Ansicht angezeigt. Bewusst KEIN Blocker — die Entscheidung liegt bei der PDL, weil section 7 ArbZG Ausnahmen fuer Bereitschaft und Notdienst vorsieht (der Trigger nimmt `bereitschaft` und `notdienst` bereits aus). Der Trigger feuert nur auf `dienstplan_eintraege`, nicht auf `assignments` oder `tours` — das sind getrennte Systeme (Personalplanung vs. Einsatzplanung), die bewusst nicht gekoppelt sind.

### N7: Dienstplan-Eintraege: caregiverId wird transitiv mandantengeprueft

Die POST- und PATCH-Route fuer `/api/personal/dienstplan/eintraege` ruft `pruefeEinsatzfreigabe()` auf, die intern `sammleVoraussetzungen()` aufruft — diese fragt `caregivers` mit `.eq('organization_id', organizationId)` ab und wirft 404 bei Nichtfund. `client_id` und `schicht_id` werden in der Route direkt gegen die Organisation geprueft. Kein Cross-Tenant-Weg.

### N8: Vertretung hat vollstaendigen Rollback

`POST /api/tours/[id]/vertretung` validiert den neuen Caregiver gegen die Organisation (Zeile 88-96), prueft Verfuegbarkeit (Zeile 110-117), und fuehrt Assignment-Umhaengung mit Rollback bei Teilfehler durch (`nimmZurueck()`, Zeile 163-176). Audit-Trail bei force_override. Tour-Status ABGESCHLOSSEN/STORNIERT wird abgelehnt (Zeile 81-83).

### N9: service_records aus Tourenplanung erhalten organization_id

Bei Stop-Abschluss mit `leistungsnachweis_anlegen: true` setzt `saveServiceRecord` die organization_id explizit aus `auth.ctx.organizationId` (Zeile 287 in stops/route.ts). Track-6-Fix.

### N10: Leistungsart und Budget-Topf aus dem Einsatz, nicht fest verdrahtet

`nachweisWerteAusEinsatz()` leitet `service_type` und `budget_type` aus dem Assignment ab. Fehlt die Leistungsart, antwortet die Route fail-closed mit Klartext (Zeile 275-282 in stops/route.ts). Vorher standen `'Alltagsbegleitung'` und `'entlastung'` fest verdrahtet — eine Haushaltshilfe wurde zum Alltagsbegleitungstarif abgerechnet.

### N11: Dienstplan-Endzustaende schuetzen Kernfelder

`updateEintrag()` in `lib/personal/dienstplan.ts` blockiert Aenderungen an `schichtId`, `caregiverId`, `clientId`, `assignmentId`, `startZeit`, `endZeit`, `pauseMinuten`, `typ` auf Eintraegen im Status `abgeschlossen` oder `ausgefallen` (Zeile 331-338). `deleteEintrag()` lehnt das Loeschen von Eintraegen in diesen Zustaenden ab. Dieser Guard liegt bewusst im Code, nicht als DB-Trigger — die Migration enthaelt keinen Status-Guard auf `dienstplan_eintraege`.

---

## Testzahlen

- 37 neue Tests (node:test)
- 2 Gegenproben die die ALTE Regel ausfuehren
- Bestehende Tests: unveraendert

---

## Geaenderte Dateien

| Datei | Aenderung |
|---|---|
| `app/api/tours/[id]/route.ts` | DELETE-Handler: Bestand laden, `assertTourUebergang` pruefen |
| `lib/touren/__tests__/tour-state-machine.test.ts` | 37 Tests fuer Tour- und Stop-Zustandsmaschine |
