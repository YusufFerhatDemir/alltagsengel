# Security-/DSGVO-Delta-Review — Phase 5 (24.08.2026)

Gegenprobe nach den Härtungen aus Phase 4 / 4.5. Geprüft wurde gegen die
**Produktions-Datenbank und die Live-API**, nicht gegen das Repo.

Verwendete Läufe:

```
node scripts/verify-security-delta-phase4.mjs             # RLS / anon-Grants / SECDEF / org_fence
node scripts/verify-security-delta-phase4-detail.mjs      # Policy-Ausdrücke im Klartext
node scripts/verify-security-delta-phase4-grantcheck.mjs  # ACL vs. echter anon-Aufruf
node scripts/verify-anon-exposure.mjs                     # 331 Relationen als anon gelesen
```

---

## 1 · Was bestätigt wurde (kein Befund)

| Prüfpunkt | Ergebnis |
|---|---|
| RLS aktiv | 308/308 `public`-Tabellen. 3 Tabellen mit RLS und 0 Policies (`_sql_parts`, `api_rate_limits`, `coach_pseudonym_key`) — das ist dicht, nicht offen: nur `service_role` erreicht sie. |
| anon-Schreibrechte | **0** — kein INSERT/UPDATE/DELETE/TRUNCATE auf keiner der 308 Tabellen. Das Ergebnis aus Phase 4 (225 → 0) hält, keine neue Tabelle hat Rechte zurückbekommen. |
| anon-Lesbarkeit real | `verify-anon-exposure.mjs`: 331 Relationen, 6 bewusst öffentlich, **0 ungewollte Zeilen**. anon-`SELECT`-Grants bestehen auf 225 Tabellen, aber RLS blockt sie tatsächlich (Beleg: 401 `permission denied for function current_org_id`, nicht `200 []`). |
| SECURITY DEFINER für anon | **0** ausführbar. 35 für `authenticated`, davon 10 reine Trigger-Funktionen. Alle mit gesetztem `search_path`. |
| org_fence | 244 Policies, **alle RESTRICTIVE**. |
| service_role-Client | 44 Fundstellen, alle serverseitig. Keine einzige in einer `'use client'`-Datei. `lib/supabase/admin.ts` trägt `import 'server-only'` **und** einen Runtime-`window`-Guard. Kein zweiter `createClient()` mit Secret-Key. Kein `NEXT_PUBLIC_*`-Name trägt ein Geheimnis. |
| Storage-Buckets | 13 Buckets, **alle `public: false`**. RLS auf `storage.objects` aktiv, 15 Policies. |
| Webhook-Signaturen | Stripe (`constructEvent`, fail-closed via throw), Coach-Stripe (fail-closed bei fehlendem Secret), WhatsApp (HMAC-SHA256 **mit `timingSafeEqual`**, fail-closed). |
| Audit-INSERT-Policies | Keine einzige `INSERT`-Policy im Schema ohne `WITH CHECK`. `billing_tariff_audit` verlangt `is_admin() AND organization_id = current_org_id()`. |
| CSV-Injection (Ops-Audit, §302-Export) | `lib/utils/csv.ts::csvZelle` — Formel-Riegel und Quotierung vorhanden. |
| DSGVO-Pfade | Auskunft (`lib/dsgvo/auskunft.ts`, `/api/user/export`, `/api/coach/export`), Löschung (`/api/user/delete` + Widerruf-Token, `/api/coach/loeschung`), Audit-Trail (`logAuditEventOrWarn` als Pflichtmuster) vorhanden. |

---

## 2 · Gefunden und gefixt (Commit `6049fd7`)

### P1-1 · Cron-Bearer fail-open bei nicht gesetztem `CRON_SECRET`

`app/api/cron/drip` und `app/api/cron/indexnow` verglichen ohne Null-Riegel:

```ts
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)   // ← fehlt: !process.env.CRON_SECRET
```

Ist `CRON_SECRET` nicht gesetzt, lautet der Vergleichswert wörtlich
`"Bearer undefined"` — diesen Header kann jeder schicken. Fünf der sieben
Cron-Routen hatten den Riegel (mit Kommentar, der genau diesen Fehler
beschreibt), zwei nicht. Eine kopierte Prüfung driftet.

**Fix:** `lib/api/cron-auth.ts` — ein Helfer, fail-closed, Konstantzeit-
Vergleich (`timingSafeEqual` + Längenprüfung). Angewandt auf alle 7 Cron-Routen,
`/api/drip` und `/api/ops/workflow/processing` (dort als `istCronGeheimnis()`,
weil die Route den Header `x-cron-secret` nutzt und bei Misserfolg auf eine
Superadmin-Prüfung zurückfällt statt 401 zu antworten).

Damit erledigt sich auch **P2**: keine der neun Stellen verglich vorher in
Konstantzeit.

*Live verifiziert:* 30 Anfragen gegen `alltagsengel.care` mit
`Bearer undefined` / `Bearer ` / `Bearer falsch` / ohne Header → **alle 401**.

### P1-2 · Pfad-Traversal im Rückläufer-Upload

`app/api/billing/dta/ruecklaeufer/upload/route.ts` baute den Storage-Schlüssel
aus dem ungefilterten Upload-Dateinamen:

```ts
`ruecklaeufer/${organizationId}/${Date.now()}_${datei.name}`
```

Ein Name mit `../` verlässt damit die Organisationsablage. Es war die **einzige**
der zehn Upload-Routen ohne Bereinigung (die anderen nutzen ein lokales
`sanitizeFileName()`).

Gleichzeitig gefixt:
* **Kein Größenriegel** — `arrayBuffer()` zog die Datei vollständig in den
  Speicher der Serverless-Funktion, bevor der Bucket sie ablehnen konnte.
  Jetzt 10 MB (identisch zum Bucket-Limit), geprüft **vor** dem Einlesen.
* **`getPublicUrl()` auf einem privaten Bucket** — die erzeugte URL lief ins
  Leere und wurde als `quelldatei_url` persistiert, also ein Beleg-Link, der nie
  auflöst. Gespeichert wird jetzt der Storage-Pfad, wie es `lib/abrechnung/versand.ts`
  und der Parser-Test bereits taten.

### P2-1 · DATEV-CSV: Feldtrennung zerstörbar + kein Formel-Riegel

`lib/billing/datev/datev-format.ts::escapeText` kürzte **nach** dem Verdoppeln
der Anführungszeichen. Lag ein verdoppeltes Paar auf der Grenze 60, wurde es
mittendrin zerschnitten; übrig blieb ein einzelnes `"`, das das Feld vorzeitig
beendet und die restliche Buchungszeile in die falschen Spalten schiebt. Ein
Klientenname aus einem Kundenformular reicht als Auslöser.

Zusätzlich fehlte der Formel-Riegel (`= + - @` → CSV-Injection in Excel/DATEV).
Der Buchungstext trägt heute ein festes Präfix („Rechnung …") und war dadurch
**zufällig** geschützt — `KOST1`, `KOST2`, `belegnummer` und die Kopfzeilen-
Felder nicht.

**Fix:** erst kürzen, dann verdoppeln; Apostroph-Riegel wie in `lib/utils/csv.ts`,
auch in `escapeInner()` für die Kopfzeile.

### P2-2 · CAMT-Import ohne Größenriegel

`app/api/billing/camt/import/route.ts` las jede Uploadgröße per `file.text()`
vollständig ein; der Parser arbeitet danach mit Regexen über denselben String.
Jetzt 20 MB, geprüft vor dem Einlesen. (Kein XXE-Risiko: der Parser ist
regex-basiert und wertet keine XML-Entities aus.)

### Nachgezogen

`__tests__/security/anon-schreibpfade.test.ts` kannte als Guard-Muster nur den
Literal-String `CRON_SECRET` und hätte die Routen nach der Umstellung als
ungeschützt gemeldet. Muster um den Helfernamen erweitert.

**Regressionstests:** `lib/api/cron-auth.test.ts` (3 Tests),
`lib/billing/datev/datev-format.test.ts` (3 Tests). **Gegenprobe durchgeführt** —
gegen den alten `escapeText` fallen beide Zusicherungen um (2 fail / 1 pass);
der Test misst also den Fehler, nicht sich selbst.

---

## 3 · Offen (P2 / P3) — dokumentiert, nicht gefixt

Alles hier Genannte braucht entweder DDL im Supabase-SQL-Editor (kein
DDL-Zugang aus der Session, siehe `revoke-braucht-owner-rechte`) oder ist eine
bewusste Abwägung.

| # | Befund | Wo | Warum offen |
|---|---|---|---|
| **P2-a** | 5 Storage-Buckets ohne `file_size_limit` **und** ohne MIME-Allowlist: `abrechnung`, `documents`, `mis-documents`, `service-proofs`, `verordnungen`. Alle privat, aber ein berechtigter Nutzer kann beliebig große Dateien beliebigen Typs ablegen. | `storage.buckets` | DDL/Bucket-Konfiguration. Empfehlung: 20 MB + `{application/pdf,image/jpeg,image/png,image/webp}` analog `kunden-dokumente`. |
| ~~**P2-b**~~ | ~~dta-dateien org-blind~~ **GEFIXT** via `apply_migration` (20261003000002). Drei Policies ersetzt: `is_admin()` + `(storage.foldername(name))[2] = current_org_id()::text`. Live verifiziert. | `storage.objects` | ✅ Erledigt 2026-08-24 |
| **P2-c** | 7 Tabellen mit `organization_id`, aber ohne `org_fence`-Policy: `billing_tarif_belege`, `billing_tariff_audit`, `organization_members`, `organization_subscriptions`, `state_settings`, `state_settings_audit`, `state_waitlist`. Ihre permissiven Policies prüfen die Organisation überwiegend selbst — der RESTRICTIVE Riegel als zweite Schicht fehlt aber. | `pg_policies` | DDL. Reiner Tiefenschutz, keine offene Lücke: kein Lesepfad ohne Org-Bedingung gefunden. |
| **P2-d** | `state_waitlist` hat eine `INSERT`-Policy für `authenticated,anon` **ohne `WITH CHECK`**. Für `anon` wirkungslos (kein INSERT-Grant), für `authenticated` bedeutet es: beliebige Zeilen mit beliebiger `organization_id`. | `pg_policies` | DDL. |
| **P2-e** | Lange signierte URLs: 30 Tage für das Rechnungs-PDF (`lib/pdf/rechnung-paket.ts:453`), 7 Tage für Leistungsnachweis und Leistungsnachweis-Foto (`app/api/native/leistungsnachweis-upload/route.ts:99`, `lib/upload-service-proof.ts:78`). Eine solche URL ist ein Inhaber-Token auf ein Dokument mit Gesundheits- und Abrechnungsdaten. | Code | Bewusste Abwägung: die URLs gehen per Mail raus und müssen den Postfach-Alltag überleben. Verkürzen bricht den Versandweg — Entscheidung gehört zum Versandkonzept, nicht in einen Security-Fix. |
| **P2-f** | Keine Inhaltsprüfung bei Uploads. MIME-Allowlists (App **und** Bucket) prüfen den vom Client **behaupteten** Content-Type, nicht die Magic Bytes. Es gibt keine AV-Anbindung; `lib/kim/attachment-service.ts::virusScanPlaceholder()` meldet ausdrücklich „ungeprüft" statt „sauber". | Code | Braucht eine AV-Engine (externe Beschaffung). Der Platzhalter lügt wenigstens nicht. |
| **P3-a** | `lib/file-upload-validation.ts` hat **null Aufrufer**. Ein Modul, das wie eine Sicherheitsprüfung aussieht und keine ist, ist eine Falle für den nächsten Leser — es wirkt, als sei Upload-Validierung zentral gelöst. | `lib/` | Entweder verdrahten oder löschen. Bewusst nicht in diesem Lauf mitgenommen (Fremdänderung ohne Auftrag). |
| **P3-b** | `sanitizeFileName()` liegt in 6 Kopien (`lib/akten/dokumente.ts`, `lib/upload-document.ts`, `lib/upload-service-proof.ts`, `lib/wunden/fotos.ts`, `lib/kim/attachment-service.ts`, neu im DTA-Upload) mit drei leicht verschiedenen Regeln. Genau diese Vervielfältigung hat P1-2 verursacht: eine Stelle hatte keine. | `lib/` | Zusammenführen — eigener Umbau, kein Security-Fix. |

---

## 4 · Broken Access Control — Ergebnis

* **Horizontal (Mandant A → B):** kein Weg gefunden. `org_fence` ist auf 244
  Policies RESTRICTIVE, `current_org_id()` ist fail-**open** in Richtung
  Stamm-Organisation (bekannt, siehe `current-org-id-fail-open`) — das trennt
  Mandanten weiterhin, nur keine Rollen. ~~Ausnahme: P2-b (DTA-Storage,
  org-blind)~~ **Gefixt 2026-08-24** — kein offener horizontaler Pfad mehr.
* **Vertikal (User → Admin):** kein Weg gefunden. Die Rollenprüfung liegt
  durchgehend in den `require*()`-Guards der Service-Schicht; die 22 Routen ohne
  Auth-Marker in der Datei wurden einzeln geprüft und delegieren entweder
  (z. B. `tarif-verifizierung-service.ts` → `requireOpsAdmin('tarife.schreiben')`)
  oder sind absichtlich öffentlich (Preisliste, Kontakt, Newsletter, Health,
  Expansions-Status).
* **IDOR:** die geprüften ID-Routen laden über den Admin-Client **mit**
  `auth.ctx.organizationId` als Filter, nicht allein über die Pfad-ID.
