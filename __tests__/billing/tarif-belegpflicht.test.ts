/**
 * Stream 3 — Tarif- und Abrechnungssicherheit
 *
 * Kernsatz: KEIN Tarif darf ohne belegte Freigabe abrechenbar werden.
 *
 * Geprueft wird dreifach, weil die Regel dreifach durchgesetzt wird:
 *   1. Regel-Ebene   — lib/billing/core/tarif-verifizierung.ts (Verhalten)
 *   2. Service-Ebene — lib/billing/tarif-verifizierung-service.ts (Statisch)
 *   3. DB-Ebene      — Migration 20260904000000 (Statisch)
 *
 * Nur (3) ist nicht umgehbar. Die Tests auf (1) und (2) stellen sicher, dass
 * Oberflaeche und API dasselbe sagen wie die Datenbank erzwingt — sonst
 * behauptet die Admin-Ansicht eine Freigabe, die der Rechnungsweg abweist.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  anforderungFuerStatus,
  berechneKennzahlen,
  bewerteAbrechenbarkeit,
  istPrivattarif,
  istTarifStatus,
  normalisiereStatus,
  pruefeBelegDatei,
  pruefeStatusaenderung,
  sanitizeBelegDateiname,
  BELEG_MAX_BYTES,
  QUELLE_MIN_LAENGE,
} from '@/lib/billing/core/tarif-verifizierung'

const repo = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const MIGRATION = 'supabase/migrations/20260904000000_tarif_belege_belegpflicht.sql'
const ROLLBACK = 'supabase/migrations/20260904000001_rollback_tarif_belege_belegpflicht.sql'

const GUELTIGE_QUELLE = 'Vergütungsvereinbarung AOK Hessen vom 01.03.2026'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Abrechenbarkeit — die Frage, die in der Uebersicht ganz vorne steht
// ═══════════════════════════════════════════════════════════════════════════

describe('Abrechenbarkeit: dieselbe Regel wie resolvePrice und RPC v6', () => {
  it('verifizierter Kassentarif ist abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({
      quellTabelle: 'billing_tariffs',
      tarifStatus: 'verified',
      rechtsgrundlage: '§45b SGB XI',
    })
    expect(r.abrechenbar).toBe(true)
  })

  it('unverifizierter Kassentarif ist NICHT abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({
      quellTabelle: 'billing_tariffs',
      tarifStatus: 'unverified',
      rechtsgrundlage: '§45b SGB XI',
    })
    expect(r.abrechenbar).toBe(false)
    expect(r.begruendung).toMatch(/[Nn]icht verifiziert/)
  })

  it('gesperrter Tarif ist nie abrechenbar — auch privat nicht', () => {
    expect(
      bewerteAbrechenbarkeit({
        quellTabelle: 'billing_tariffs',
        tarifStatus: 'blocked',
        rechtsgrundlage: 'privat',
      }).abrechenbar
    ).toBe(false)
    expect(
      bewerteAbrechenbarkeit({
        quellTabelle: 'billing_tariffs',
        tarifStatus: 'blocked',
        rechtsgrundlage: '§45b SGB XI',
      }).abrechenbar
    ).toBe(false)
  })

  it('Privattarife bleiben ohne Verifizierung abrechenbar (Preise frei waehlbar)', () => {
    expect(
      bewerteAbrechenbarkeit({
        quellTabelle: 'billing_tariffs',
        tarifStatus: 'unverified',
        rechtsgrundlage: 'privat',
      }).abrechenbar
    ).toBe(true)
  })

  it('leistungspreise gelten immer als Kassenweg — unverified ist nicht abrechenbar', () => {
    expect(
      bewerteAbrechenbarkeit({ quellTabelle: 'leistungspreise', tarifStatus: 'unverified' }).abrechenbar
    ).toBe(false)
    expect(
      bewerteAbrechenbarkeit({ quellTabelle: 'leistungspreise', tarifStatus: 'verified' }).abrechenbar
    ).toBe(true)
  })

  it('leistungspreise koennen nicht ueber rechtsgrundlage="privat" zum Privattarif erklaert werden', () => {
    // Die Tabelle hat die Spalte gar nicht — ein untergeschobener Wert darf
    // die Belegpflicht nicht aushebeln.
    expect(istPrivattarif({ quellTabelle: 'leistungspreise', rechtsgrundlage: 'privat' })).toBe(false)
    expect(
      bewerteAbrechenbarkeit({
        quellTabelle: 'leistungspreise',
        tarifStatus: 'unverified',
        rechtsgrundlage: 'privat',
      }).abrechenbar
    ).toBe(false)
  })

  it('fehlender oder unbekannter Status gilt als unverified (fail-closed)', () => {
    expect(normalisiereStatus(null)).toBe('unverified')
    expect(normalisiereStatus(undefined)).toBe('unverified')
    expect(normalisiereStatus('VERIFIED')).toBe('unverified')
    expect(normalisiereStatus('freigegeben')).toBe('unverified')
    expect(istTarifStatus('verified')).toBe(true)
    expect(istTarifStatus('sonstwas')).toBe(false)

    expect(
      bewerteAbrechenbarkeit({
        quellTabelle: 'billing_tariffs',
        tarifStatus: null,
        rechtsgrundlage: '§39 SGB XI',
      }).abrechenbar
    ).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Anforderungen an eine Freigabe
// ═══════════════════════════════════════════════════════════════════════════

describe('Freigabe verlangt Quelle und Beleg', () => {
  it('Kassentarif → Quelle UND Beleg', () => {
    const a = anforderungFuerStatus('verified', {
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: '§45b SGB XI',
    })
    expect(a.quelleErforderlich).toBe(true)
    expect(a.belegErforderlich).toBe(true)
  })

  it('Leistungspreis → Quelle UND Beleg (keine Privatausnahme)', () => {
    const a = anforderungFuerStatus('verified', { quellTabelle: 'leistungspreise' })
    expect(a.quelleErforderlich).toBe(true)
    expect(a.belegErforderlich).toBe(true)
  })

  it('Privattarif → Quelle ja, Beleg nein', () => {
    const a = anforderungFuerStatus('verified', {
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: 'privat',
    })
    expect(a.quelleErforderlich).toBe(true)
    expect(a.belegErforderlich).toBe(false)
  })

  it('Sperren verlangt eine Begruendung, aber nie einen Beleg', () => {
    const a = anforderungFuerStatus('blocked', {
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: '§45b SGB XI',
    })
    expect(a.quelleErforderlich).toBe(true)
    expect(a.belegErforderlich).toBe(false)
  })

  it('Freigabe zuruecknehmen ist immer moeglich', () => {
    const a = anforderungFuerStatus('unverified', { quellTabelle: 'leistungspreise' })
    expect(a.quelleErforderlich).toBe(false)
    expect(a.belegErforderlich).toBe(false)
  })
})

describe('pruefeStatusaenderung: was die API annimmt und was nicht', () => {
  const kasse = { quellTabelle: 'billing_tariffs' as const, rechtsgrundlage: '§45b SGB XI' }

  it('Freigabe mit Quelle und Beleg geht durch', () => {
    const r = pruefeStatusaenderung({
      ...kasse,
      zielStatus: 'verified',
      quelle: GUELTIGE_QUELLE,
      belegId: 'beleg-1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.zielStatus).toBe('verified')
      expect(r.belegId).toBe('beleg-1')
    }
  })

  it('Freigabe OHNE Beleg wird abgelehnt', () => {
    const r = pruefeStatusaenderung({ ...kasse, zielStatus: 'verified', quelle: GUELTIGE_QUELLE })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/Primärbeleg/)
  })

  it('Freigabe mit leerem Beleg-String wird abgelehnt (kein stilles Durchrutschen)', () => {
    const r = pruefeStatusaenderung({
      ...kasse,
      zielStatus: 'verified',
      quelle: GUELTIGE_QUELLE,
      belegId: '   ',
    })
    expect(r.ok).toBe(false)
  })

  it('Freigabe OHNE Quelle wird abgelehnt', () => {
    const r = pruefeStatusaenderung({ ...kasse, zielStatus: 'verified', quelle: 'AOK', belegId: 'b' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/Rechtsquelle/)
  })

  it(`eine Quelle unter ${QUELLE_MIN_LAENGE} Zeichen zaehlt nicht als Beleglage`, () => {
    const r = pruefeStatusaenderung({ ...kasse, zielStatus: 'verified', quelle: '   x  ', belegId: 'b' })
    expect(r.ok).toBe(false)
  })

  it('Privattarif-Freigabe braucht keinen Beleg', () => {
    const r = pruefeStatusaenderung({
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: 'privat',
      zielStatus: 'verified',
      quelle: 'Eigene Preisliste, Stand 01.01.2026',
    })
    expect(r.ok).toBe(true)
  })

  it('unbekannter Zielstatus wird abgelehnt', () => {
    for (const status of ['freigegeben', 'VERIFIED', '', null, undefined, 1]) {
      expect(pruefeStatusaenderung({ ...kasse, zielStatus: status, quelle: GUELTIGE_QUELLE }).ok).toBe(false)
    }
  })

  it('ein Beleg an einem NICHT-freigegebenen Status wird abgelehnt', () => {
    // Sonst suggeriert ein gesperrter Tarif eine Belegkette, die seinen
    // Status gar nicht traegt.
    const r = pruefeStatusaenderung({
      ...kasse,
      zielStatus: 'blocked',
      quelle: 'PfluV Hessen: 35 EUR/h ueberschreitet die Obergrenze',
      belegId: 'beleg-1',
    })
    expect(r.ok).toBe(false)
  })

  it('Sperren ohne Beleg geht durch', () => {
    const r = pruefeStatusaenderung({
      ...kasse,
      zielStatus: 'blocked',
      quelle: 'PfluV Hessen: 35 EUR/h ueberschreitet die Obergrenze',
    })
    expect(r.ok).toBe(true)
  })

  it('Freigabe zuruecknehmen geht ohne alles', () => {
    expect(pruefeStatusaenderung({ ...kasse, zielStatus: 'unverified' }).ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Beleg-Datei
// ═══════════════════════════════════════════════════════════════════════════

describe('Beleg-Upload: nur belegtaugliche Dateien', () => {
  it('PDF und Bilder sind zulaessig', () => {
    for (const typ of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(pruefeBelegDatei({ type: typ, size: 1024, name: 'beleg' }).ok).toBe(true)
    }
  })

  it('ausfuehrbare oder unbekannte Typen werden abgelehnt', () => {
    for (const typ of ['application/x-sh', 'text/html', 'application/octet-stream', '', null]) {
      expect(pruefeBelegDatei({ type: typ, size: 1024, name: 'x' }).ok).toBe(false)
    }
  })

  it('leere Dateien werden abgelehnt', () => {
    expect(pruefeBelegDatei({ type: 'application/pdf', size: 0, name: 'x' }).ok).toBe(false)
  })

  it('Dateien ueber 20 MB werden abgelehnt (identisch zum Bucket-Limit)', () => {
    expect(pruefeBelegDatei({ type: 'application/pdf', size: BELEG_MAX_BYTES, name: 'x' }).ok).toBe(true)
    expect(pruefeBelegDatei({ type: 'application/pdf', size: BELEG_MAX_BYTES + 1, name: 'x' }).ok).toBe(false)
  })

  it('Dateinamen werden fuer den Storage-Pfad entschaerft', () => {
    expect(sanitizeBelegDateiname('Vergütungsvereinbarung AOK.pdf')).toBe('Verguetungsvereinbarung_AOK.pdf')
    expect(sanitizeBelegDateiname('../../etc/passwd')).not.toContain('/')
    expect(sanitizeBelegDateiname('')).toBe('beleg')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Kennzahlen der Uebersicht
// ═══════════════════════════════════════════════════════════════════════════

describe('Kennzahlen: was der Admin oben auf der Seite sieht', () => {
  const zeilen = [
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'verified', rechtsgrundlage: 'privat', belegId: null },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'verified', rechtsgrundlage: '§45b SGB XI', belegId: 'b1' },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'verified', rechtsgrundlage: '§45b SGB XI', belegId: null },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'blocked', rechtsgrundlage: '§45b SGB XI', belegId: null },
    { quellTabelle: 'leistungspreise' as const, tarifStatus: 'unverified', belegId: null },
  ]

  it('zaehlt abrechenbar und nicht abrechenbar vollstaendig', () => {
    const k = berechneKennzahlen(zeilen)
    expect(k.gesamt).toBe(5)
    expect(k.abrechenbar + k.nichtAbrechenbar).toBe(5)
    expect(k.abrechenbar).toBe(3) // privat + zwei verifizierte Kassentarife
    expect(k.nichtAbrechenbar).toBe(2) // blocked + unverifizierter Leistungspreis
  })

  it('weist freigegebene Kassenpositionen ohne Beleg gesondert aus', () => {
    const k = berechneKennzahlen(zeilen)
    expect(k.verifiziertOhneBeleg).toBe(1)
  })

  it('zaehlt einen belegfreien Privattarif NICHT als Beleglücke', () => {
    const k = berechneKennzahlen([zeilen[0]])
    expect(k.verifiziertOhneBeleg).toBe(0)
  })

  it('Statuszaehler summieren sich auf die Gesamtzahl', () => {
    const k = berechneKennzahlen(zeilen)
    expect(k.verified + k.unverified + k.blocked).toBe(k.gesamt)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Datenbank-Ebene — die einzige nicht umgehbare Durchsetzung
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration 20260904000000: Belegpflicht in der Datenbank', () => {
  const sql = repo(MIGRATION)

  it('legt einen PRIVATEN Bucket an', () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets[\s\S]*?'tarif-belege'[\s\S]*?false/)
  })

  it('beschraenkt Belegformate auf PDF und Bilder', () => {
    expect(sql).toContain("ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']")
  })

  it('der Trigger haengt an BEIDEN Preistabellen', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_belegpflicht_billing_tariffs[\s\S]*?ON public\.billing_tariffs/)
    expect(sql).toMatch(/CREATE TRIGGER trg_belegpflicht_leistungspreise[\s\S]*?ON public\.leistungspreise/)
  })

  it('der Trigger laeuft BEFORE INSERT OR UPDATE — er kann die Freigabe verhindern, nicht nur protokollieren', () => {
    expect(sql).toMatch(/trg_belegpflicht_billing_tariffs\s+BEFORE INSERT OR UPDATE/)
    expect(sql).toMatch(/trg_belegpflicht_leistungspreise\s+BEFORE INSERT OR UPDATE/)
  })

  it('lehnt verified ohne Rechtsquelle ab', () => {
    expect(sql).toMatch(/length\(trim\(NEW\.verifizierungs_quelle\)\) < 5[\s\S]*?RAISE EXCEPTION/)
  })

  it('lehnt verified ohne Bearbeiter ab', () => {
    expect(sql).toMatch(/NEW\.verifiziert_von IS NULL[\s\S]*?RAISE EXCEPTION/)
  })

  it('lehnt kassenrelevante Freigaben ohne beleg_id ab', () => {
    expect(sql).toMatch(/NEW\.beleg_id IS NULL[\s\S]*?RAISE EXCEPTION/)
  })

  it('prueft, dass der Beleg zu GENAU dieser Zeile gehoert', () => {
    // Sonst gaebe ein einziger hochgeladener Beleg jeden beliebigen Tarif frei.
    expect(sql).toMatch(/v_beleg\.tariff_id IS DISTINCT FROM NEW\.id/)
    expect(sql).toMatch(/v_beleg\.leistungspreis_id IS DISTINCT FROM NEW\.id/)
  })

  it('prueft die Organisation des Belegs', () => {
    expect(sql).toMatch(/v_beleg\.organization_id IS DISTINCT FROM NEW\.organization_id/)
  })

  it('leistungspreise bekommen KEINE Privattarif-Ausnahme', () => {
    // v_ist_kasse wird nur fuer billing_tariffs ueberhaupt umgesetzt.
    expect(sql).toMatch(/IF TG_TABLE_NAME = 'billing_tariffs' THEN\s*\n\s*v_ist_kasse := /)
  })

  it('die Trigger-Funktion hat einen festen search_path', () => {
    expect(sql).toMatch(
      /FUNCTION public\.trg_verifizierung_belegpflicht[\s\S]*?SET search_path = public, pg_temp/
    )
  })

  it('der Audit-Trail haelt die Beleg-Referenz fest', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS beleg_id UUID/)
    expect(sql).toMatch(/FUNCTION public\.trg_billing_tariff_audit[\s\S]*?NEW\.beleg_id/)
  })

  it('leistungspreise bekommen einen Audit-Trail (hatten vorher keinen)', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_leistungspreis_audit[\s\S]*?ON public\.leistungspreise/)
    expect(sql).toMatch(/FUNCTION public\.trg_leistungspreis_audit[\s\S]*?SET search_path = public, pg_temp/)
  })

  it('die View auf belegfreie Freigaben laeuft mit security_invoker (sonst RLS-Umgehung)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_tarife_ohne_beleg\s*\nWITH \(security_invoker = true\)/)
  })

  it('entzieht anon jeden Zugriff auf Belege (Default-Privileges sind hier grosszuegig)', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.billing_tarif_belege FROM anon/)
    expect(sql).toMatch(/REVOKE ALL ON public\.v_tarife_ohne_beleg\s+FROM anon/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.trg_verifizierung_belegpflicht\(\) FROM PUBLIC, anon/)
  })

  it('hat keine INSERT/UPDATE/DELETE-Policy auf Belegen — geschrieben wird nur mit service_role', () => {
    expect(sql).toMatch(/CREATE POLICY tarif_belege_admin_read[\s\S]*?FOR SELECT/)
    expect(sql).not.toMatch(/CREATE POLICY[^\n]*billing_tarif_belege[\s\S]{0,200}FOR (INSERT|UPDATE|DELETE|ALL)/)
  })

  it('erfindet keine Preise und verifiziert nichts automatisch', () => {
    const anweisungen = sql.replace(/--[^\n]*/g, '')
    expect(anweisungen).not.toMatch(/UPDATE\s+(public\.)?billing_tariffs\s+SET/i)
    expect(anweisungen).not.toMatch(/UPDATE\s+(public\.)?leistungspreise\s+SET/i)
    expect(anweisungen).not.toMatch(/INSERT INTO\s+(public\.)?billing_tariffs/i)
    expect(anweisungen).not.toMatch(/INSERT INTO\s+(public\.)?leistungspreise/i)
  })

  it('laesst die 35-EUR-Tarife und den Entlastungsbetrag unangetastet', () => {
    const anweisungen = sql.replace(/--[^\n]*/g, '')
    expect(anweisungen).not.toContain('3500')
    expect(anweisungen).not.toContain('13100')
  })

  it('hat eine Rollback-Datei, die keine Nachweise vernichtet', () => {
    const rb = repo(ROLLBACK)
    expect(rb).toContain('DROP TRIGGER IF EXISTS trg_belegpflicht_billing_tariffs')
    expect(rb).toContain('DROP TRIGGER IF EXISTS trg_belegpflicht_leistungspreise')
    // Belegtabelle und Bucket bleiben bestehen — ein Rollback darf keine
    // Aufbewahrungspflicht verletzen.
    const aktiv = rb.replace(/--[^\n]*/g, '')
    expect(aktiv).not.toMatch(/DROP TABLE[\s\S]*billing_tarif_belege/)
    expect(aktiv).not.toMatch(/DELETE FROM storage\.buckets/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. API-Ebene
// ═══════════════════════════════════════════════════════════════════════════

describe('API: Freigabe- und Belegwege sind admin-gefenced', () => {
  it('der Beleg-Upload verlangt Admin-Rechte', () => {
    const src = repo('app/api/billing/tarif-belege/route.ts')
    expect(src).toMatch(/requireOpsAdmin/)
  })

  it('der Beleg-Upload prueft, dass die Zielzeile zum eigenen Mandanten gehoert', () => {
    const src = repo('app/api/billing/tarif-belege/route.ts')
    expect(src).toContain('zeileGehoertZurOrg')
    expect(src).toMatch(/zeileGehoertZurOrg\(admin, quellTabelle, zeilenId, auth\.ctx\.organizationId\)/)
  })

  it('der Beleg-Upload verifiziert NICHTS — Freigabe bleibt ein eigener Schritt', () => {
    const src = repo('app/api/billing/tarif-belege/route.ts')
    expect(src).not.toMatch(/tarif_status/)
    expect(src).toMatch(/noch NICHT freigegeben/)
  })

  it('Belege sind nur ueber kurzlebige signierte URLs erreichbar', () => {
    const src = repo('lib/billing/core/tarif-belege.ts')
    expect(src).toContain('createSignedUrl')
    expect(src).toMatch(/gueltigSekunden = 300/)
  })

  it('ein fehlgeschlagener Registrierungs-Insert raeumt die hochgeladene Datei wieder ab', () => {
    const src = repo('lib/billing/core/tarif-belege.ts')
    expect(src).toMatch(/if \(error \|\| !data\)[\s\S]*?storage[\s\S]*?\.remove\(\[dateipfad\]\)/)
  })

  it('der Service nimmt die Belegzuordnung bei Sperrung/Ruecknahme wieder weg', () => {
    const src = repo('lib/billing/tarif-verifizierung-service.ts')
    expect(src).toMatch(/beleg_id: pruefung\.zielStatus === 'verified' \? pruefung\.belegId : null/)
  })

  it('der Service prueft die Beleg-Zugehoerigkeit zusaetzlich zur Datenbank', () => {
    const src = repo('lib/billing/tarif-verifizierung-service.ts')
    expect(src).toContain("eq('quell_tabelle', quellTabelle)")
    expect(src).toMatch(/beleg\.organization_id !== ctx\.organizationId/)
  })

  it('fehlt die Migration, blockiert die Freigabe statt still durchzulaufen', () => {
    const src = repo('lib/billing/core/tarif-belege.ts')
    expect(src).toMatch(/beabsichtigt fail-closed/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. Regression: die JEWEILS LETZTE Definition muss fail-closed sein
//
// create_invoice_draft_atomic und zaehle_kassentarife werden von mehreren
// Migrationen nacheinander ersetzt. Fail-closed wurden sie erst in
// 20260831050000. Aeltere Fassungen ohne tarif_status-Filter liegen weiterhin
// im Repo (z. B. 20260808130000_expansion_phase2.sql) — wird eine davon
// spaeter erneut ausgefuehrt, ist die Sperre still wieder offen.
//
// Dieser Test faellt um, sobald irgendeine NEUERE Migration eine dieser
// Funktionen ohne Statusfilter definiert.
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: die neueste Definition der Rechnungs-RPCs filtert tarif_status', () => {
  const verzeichnis = 'supabase/migrations'
  const dateien = readdirSync(join(process.cwd(), verzeichnis))
    .filter(d => d.endsWith('.sql') && !d.includes('rollback'))
    .sort()

  function letzteDefinition(funktion: string): { datei: string; sql: string } | null {
    const muster = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${funktion}\\s*\\(`, 'i')
    let treffer: { datei: string; sql: string } | null = null
    for (const datei of dateien) {
      const sql = readFileSync(join(process.cwd(), verzeichnis, datei), 'utf8')
      if (muster.test(sql)) treffer = { datei, sql }
    }
    return treffer
  }

  it('create_invoice_draft_atomic: neueste Fassung verlangt verified fuer Kassentarife', () => {
    const letzte = letzteDefinition('create_invoice_draft_atomic')
    expect(letzte, 'keine Definition gefunden').not.toBeNull()
    expect(letzte!.sql).toMatch(/v_rechtsgrundlage <> 'privat' AND bt\.tarif_status = 'verified'/)
    expect(letzte!.sql).toMatch(/v_rechtsgrundlage = 'privat' AND bt\.tarif_status <> 'blocked'/)
  })

  it('zaehle_kassentarife: neueste Fassung zaehlt nur verifizierte Tarife', () => {
    const letzte = letzteDefinition('zaehle_kassentarife')
    expect(letzte, 'keine Definition gefunden').not.toBeNull()
    expect(letzte!.sql).toMatch(/t\.tarif_status = 'verified'/)
  })

  it('die fail-closed-Fassung ist juenger als jede Fassung ohne Statusfilter', () => {
    const ohneFilter = dateien.filter(d => {
      const sql = readFileSync(join(process.cwd(), verzeichnis, d), 'utf8')
      if (!/CREATE OR REPLACE FUNCTION public\.zaehle_kassentarife\s*\(/i.test(sql)) return false
      return !/t\.tarif_status = 'verified'/.test(sql)
    })
    const mitFilter = dateien.filter(d => {
      const sql = readFileSync(join(process.cwd(), verzeichnis, d), 'utf8')
      return (
        /CREATE OR REPLACE FUNCTION public\.zaehle_kassentarife\s*\(/i.test(sql) &&
        /t\.tarif_status = 'verified'/.test(sql)
      )
    })
    expect(mitFilter.length).toBeGreaterThan(0)
    const juengsteMitFilter = mitFilter[mitFilter.length - 1]
    for (const alt of ohneFilter) {
      expect(
        alt < juengsteMitFilter,
        `${alt} definiert zaehle_kassentarife ohne tarif_status-Filter und ist JUENGER als ${juengsteMitFilter} — bei Anwendung faellt die Fail-Closed-Sperre weg`
      ).toBe(true)
    }
  })
})

describe('UI: die Uebersicht behauptet nichts anderes als die Datenbank erzwingt', () => {
  const src = repo('app/admin/kassenabrechnung/tarife/page.tsx')

  it('benutzt dieselben Regeln wie API und Datenbank statt eigener Logik', () => {
    expect(src).toContain("from '@/lib/billing/core/tarif-verifizierung'")
    expect(src).toContain('anforderungFuerStatus')
  })

  it('zeigt beide Preisquellen', () => {
    expect(src).toContain('billing_tariffs')
    expect(src).toContain('leistungspreise')
  })

  it('bietet Filter nach Status, Abrechnungsart und Bundesland', () => {
    expect(src).toContain('Abrechnungsart')
    expect(src).toContain('Bundesland')
    expect(src).toMatch(/fStatus/)
  })

  it('sagt je Zeile, ob abgerechnet werden kann', () => {
    expect(src).toMatch(/z\.abrechenbar \? 'JA' : 'NEIN'/)
  })

  it('weist Freigaben ohne hinterlegten Beleg aus', () => {
    expect(src).toMatch(/verifiziertOhneBeleg/)
  })

  it('zeigt Historie und Belege im Detaildialog', () => {
    expect(src).toContain('Historie')
    expect(src).toContain('Primärbelege')
  })
})
