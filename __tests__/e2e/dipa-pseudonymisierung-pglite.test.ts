/**
 * E2E: DiPA — Pseudonymisierung der Nutzungsnachweise auf echtem Postgres
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die Nutzungsnachweise sind die Datensammlung, an der die DiPAV den
 * Nutzennachweis hängt — und die einzige Stelle im PflegeCoach, an der
 * Daten für eine AUSWERTUNG entstehen statt für den Nutzer selbst. Der
 * Schutz besteht dort nicht aus einer Anwendungsprüfung, sondern aus vier
 * Datenbankentscheidungen:
 *
 *   1. Das Pseudonym ist ein HMAC über die Nutzer-ID mit einem Schlüssel,
 *      der in einer Tabelle liegt, die niemand lesen darf.
 *   2. `coach_pseudonym(uuid)` — die Fassung, mit der sich JEDES Pseudonym
 *      berechnen liesse — ist `authenticated` NICHT gegeben.
 *   3. `coach_mein_pseudonym()` nimmt keinen Parameter und liest die
 *      Nutzer-ID aus der Sitzung.
 *   4. Die RLS-Policies auf `coach_nutzungsereignisse` vergleichen gegen
 *      genau diese parameterlose Funktion.
 *
 * Punkt 2 ist der Kern. Wäre `coach_pseudonym(uuid)` für `authenticated`
 * ausführbar, könnte jeder angemeldete Nutzer das Pseudonym eines
 * beliebigen anderen berechnen — und die RLS-Policy, die auf
 * Pseudonym-Gleichheit prüft, gäbe ihm dessen Nachweisdaten heraus. Die
 * Trennung ist eine GRANT-Zeile. Genau solche Zeilen verschwinden beim
 * Umbauen, ohne dass irgendetwas rot wird — kein Typfehler, kein
 * fehlschlagender Anwendungstest, nur eine offene Tür.
 *
 * Deshalb läuft diese Suite gegen ein echtes Postgres und fragt die Rechte
 * mit `has_function_privilege` / `has_table_privilege` ab. Aus
 * memory/rechte-orakel-information-schema-luegt: `information_schema` zeigt
 * PUBLIC-Grants nicht, ein Audit darüber meldet alles als dicht.
 *
 * ═══ ZUM HMAC-ERSATZ ═══════════════════════════════════════════
 * PGlite bringt pgcrypto nicht mit. `extensions.hmac` ist deshalb in
 * helpers/coach-schema.ts nach RFC 2104 auf dem eingebauten `sha256(bytea)`
 * ausgeschrieben — und der erste Test unten weist mit einem Testvektor aus
 * RFC 4231 nach, dass diese Fassung dasselbe liefert wie eine echte
 * HMAC-Bibliothek. Ohne diesen Nachweis prüften alle Aussagen über
 * Determinismus und Unumkehrbarkeit nur eine plausibel aussehende
 * Funktion — das wäre die Nachbildung statt des Mechanismus.
 *
 * KEINE ZULASSUNGSAUSSAGE: geprüft ist die technische Wirkung der
 * Pseudonymisierung, nicht ihre datenschutzrechtliche Bewertung. Die
 * Erfassung ist in Produktion ohnehin aus (`COACH_NUTZUNGSNACHWEIS_AKTIV`
 * nicht gesetzt) und setzt zusätzlich die Einwilligung
 * 'wissenschaftliche_auswertung' des einzelnen Nutzers voraus.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baueNachweisSchema, legeNutzerAn } from './helpers/coach-schema'

const NUTZER_A = '00000000-0000-4000-8000-0000000000a1'
const NUTZER_B = '00000000-0000-4000-8000-0000000000b1'

let db: PGlite

/** Eine Abfrage in der Rolle `authenticated` mit gesetztem Sitzungs-Sub. */
async function alsNutzer<T extends Record<string, unknown>>(
  authId: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  const claims = JSON.stringify(authId ? { sub: authId, role: 'authenticated' } : { role: 'authenticated' })
  return db.transaction(async tx => {
    await tx.exec(
      `SET LOCAL ROLE authenticated;`
      + `SET LOCAL request.jwt.claims = '${claims.replace(/'/g, "''")}';`,
    )
    const r = await tx.query<T>(sql, params as never[])
    return r.rows
  }) as Promise<T[]>
}

async function einWert<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ w: T }>(sql, params as never[])
  return r.rows[0].w
}

/**
 * Schlüssel fest setzen — sonst ist jede Instanz anders und nichts
 * vergleichbar.
 *
 * Bewusst UPSERT und nicht UPDATE: Ein Test unten löscht die
 * Schlüsselzeile absichtlich. Schlüge er in der Mitte fehl, liefe ein
 * UPDATE danach ins Leere, `coach_mein_pseudonym()` gäbe NULL zurück und
 * JEDE folgende RLS-Prüfung schlüge fehl — vier Folgefehler, die nichts
 * mit ihrem eigenen Gegenstand zu tun haben. Genau das ist beim ersten
 * Lauf passiert.
 */
async function setzeSchluessel(hex: string): Promise<void> {
  await db.query(
    `INSERT INTO coach_pseudonym_key (id, schluessel) VALUES (1, decode($1,'hex'))
       ON CONFLICT (id) DO UPDATE SET schluessel = EXCLUDED.schluessel`,
    [hex],
  )
}

const SCHLUESSEL_1 = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const SCHLUESSEL_2 = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'

beforeAll(async () => {
  db = await baueNachweisSchema()
  await legeNutzerAn(db, NUTZER_A)
  await legeNutzerAn(db, NUTZER_B, 'angehoerig')
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`DELETE FROM coach_nutzungsereignisse;`)
  await setzeSchluessel(SCHLUESSEL_1)
})

// ═══════════════════════════════════════════════════════════════════
describe('Der HMAC ist echt — Nachweis vor jeder weiteren Aussage', () => {
  it('trifft den Testvektor aus RFC 4231 (Test Case 1)', () => {
    // Wäre der Ersatz in Wahrheit ein sha256(key || data), stimmte hier
    // nichts. Alles unten stützt sich auf diese eine Zeile.
    const erwartet = 'b0344c61d8db38535ca8afceaf0bf12b'
      + '881dc200c9833da726e9376c2e32cff7'
    const eigen = createHmac('sha256', Buffer.alloc(20, 0x0b))
      .update('Hi There').digest('hex')
    expect(eigen).toBe(erwartet)
  })

  it('die SQL-Fassung liefert dasselbe wie die Node-Bibliothek', async () => {
    const inSql = await einWert<string>(
      `SELECT encode(extensions.hmac(decode($1,'hex'), decode($2,'hex'), 'sha256'),'hex') AS w`,
      ['48692054686572650a', '0b'.repeat(20)],
    )
    const inNode = createHmac('sha256', Buffer.from('0b'.repeat(20), 'hex'))
      .update(Buffer.from('48692054686572650a', 'hex')).digest('hex')
    expect(inSql).toBe(inNode)
  })

  it('auch mit einem Schlüssel länger als die Blockgröße (der Sonderfall in RFC 2104)', async () => {
    const langerKey = 'aa'.repeat(131)
    const inSql = await einWert<string>(
      `SELECT encode(extensions.hmac($1::text::bytea, decode($2,'hex'), 'sha256'),'hex') AS w`,
      ['Testdaten', langerKey],
    )
    const inNode = createHmac('sha256', Buffer.from(langerKey, 'hex'))
      .update('Testdaten').digest('hex')
    expect(inSql).toBe(inNode)
  })

  it('weist ein anderes Verfahren ab, statt still sha256 zu nehmen', async () => {
    await expect(
      db.query(`SELECT extensions.hmac('x'::bytea, 'k'::bytea, 'md5')`),
    ).rejects.toThrow(/sha256/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Eigenschaften des Pseudonyms', () => {
  it('ist für denselben Nutzer stabil', async () => {
    // Ohne Stabilität wäre jede Auswertung über Wochen hinweg wertlos —
    // derselbe Nutzer erschiene in jeder Woche als jemand anderes.
    const a1 = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    const a2 = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    expect(a1).toBe(a2)
    expect(a1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('unterscheidet zwei Nutzer', async () => {
    const a = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    const b = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_B])
    expect(a).not.toBe(b)
  })

  it('enthält die Nutzer-ID nicht — auch nicht in Teilen', async () => {
    // Ein Pseudonym, aus dem sich die Kennung ablesen lässt, ist keins.
    const a = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    expect(a).not.toContain(NUTZER_A)
    expect(a).not.toContain(NUTZER_A.replace(/-/g, ''))
    // Auch kein längeres Bruchstück.
    expect(a).not.toContain('000460629986'.slice(0, 8))
    expect(a).not.toContain('4000')
  })

  it('für NULL gibt es kein Pseudonym', async () => {
    // Sonst bekäme eine Sitzung ohne `sub` ein gültiges Pseudonym — und
    // damit über die RLS-Policy Zugriff auf dessen Zeilen.
    const w = await einWert<string | null>(`SELECT coach_pseudonym(NULL) AS w`)
    expect(w).toBeNull()
  })

  it('ein anderer Schlüssel ergibt andere Pseudonyme — das Löschen anonymisiert', async () => {
    // Der Tabellenkommentar sagt: „Loeschen = irreversible Anonymisierung
    // aller Nachweisdaten." Das ist nur wahr, wenn die vorhandenen
    // Pseudonyme mit einem anderen Schlüssel nicht mehr reproduzierbar
    // sind. Genau das wird hier gemessen statt geglaubt.
    const vorher = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    await setzeSchluessel(SCHLUESSEL_2)
    const nachher = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    expect(nachher).not.toBe(vorher)

    // Und ohne Schlüsselzeile gibt es überhaupt kein Pseudonym mehr:
    // bestehende Zeilen sind dann keinem Nutzer mehr zuzuordnen.
    //
    // Die Funktion liefert dann NULL und nicht „keine Zeile": Ihr Rumpf
    // ist ein SELECT über coach_pseudonym_key, und eine skalare
    // SQL-Funktion ohne Trefferzeile ergibt in der Auswahlliste NULL.
    // Der Unterschied ist hier nicht kosmetisch — NULL wandert weiter in
    // die RLS-Policy, wo `pseudonym = NULL` weder wahr noch falsch ist
    // und deshalb sperrt. Das ist die richtige Richtung: kein Schlüssel,
    // kein Zugriff.
    await db.exec(`DELETE FROM coach_pseudonym_key`)
    const ohneSchluessel = await einWert<string | null>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    expect(ohneSchluessel).toBeNull()

    const [sitzung] = await alsNutzer<{ w: string | null }>(NUTZER_A, `SELECT coach_mein_pseudonym() AS w`)
    expect(sitzung.w).toBeNull()
  })

  it('coach_mein_pseudonym liefert genau das Pseudonym der Sitzung', async () => {
    const direkt = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_A])
    const [zeile] = await alsNutzer<{ w: string }>(NUTZER_A, `SELECT coach_mein_pseudonym() AS w`)
    expect(zeile.w).toBe(direkt)
  })

  it('ohne Sitzung liefert coach_mein_pseudonym nichts', async () => {
    const [zeile] = await alsNutzer<{ w: string | null }>(null, `SELECT coach_mein_pseudonym() AS w`)
    expect(zeile.w).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Rechte — die Trennung, die nur eine GRANT-Zeile ist', () => {
  async function darfFunktion(rolle: string, signatur: string): Promise<boolean> {
    return einWert<boolean>(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS w`, [rolle, signatur],
    )
  }
  async function darfTabelle(rolle: string, tabelle: string, recht: string): Promise<boolean> {
    return einWert<boolean>(
      `SELECT has_table_privilege($1, $2, $3) AS w`, [rolle, tabelle, recht],
    )
  }

  it('DER KERN: authenticated darf coach_pseudonym(uuid) NICHT ausführen', async () => {
    // Dürfte er es, liesse sich zu jeder Nutzer-ID das Pseudonym
    // berechnen — und die RLS-Policy, die auf Pseudonym-Gleichheit prüft,
    // gäbe dessen Nachweisdaten heraus.
    expect(await darfFunktion('authenticated', 'coach_pseudonym(uuid)')).toBe(false)
    expect(await darfFunktion('anon', 'coach_pseudonym(uuid)')).toBe(false)
  })

  it('der Systemkontext darf sie — sonst gäbe es keine Auswertung', async () => {
    // Gegenprobe: „niemand darf" wäre ebenfalls grün und wäre ein Defekt.
    expect(await darfFunktion('service_role', 'coach_pseudonym(uuid)')).toBe(true)
  })

  it('die parameterlose Fassung ist für authenticated offen, für anon nicht', async () => {
    expect(await darfFunktion('authenticated', 'coach_mein_pseudonym()')).toBe(true)
    expect(await darfFunktion('anon', 'coach_mein_pseudonym()')).toBe(false)
  })

  it('den Schlüssel darf weder anon noch authenticated lesen', async () => {
    for (const rolle of ['anon', 'authenticated']) {
      for (const recht of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(
          await darfTabelle(rolle, 'coach_pseudonym_key', recht),
          `${rolle} hat ${recht} auf coach_pseudonym_key`,
        ).toBe(false)
      }
    }
  })

  it('anon kommt an die Nachweise gar nicht heran', async () => {
    for (const recht of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(await darfTabelle('anon', 'coach_nutzungsereignisse', recht)).toBe(false)
    }
  })

  it('authenticated darf lesen, anlegen und löschen — aber nicht ändern', async () => {
    // Kein UPDATE: ein einmal erfasstes Ereignis nachträglich umzuschreiben
    // machte die Auswertung wertlos. Löschen bleibt offen (Art. 17 DSGVO).
    expect(await darfTabelle('authenticated', 'coach_nutzungsereignisse', 'SELECT')).toBe(true)
    expect(await darfTabelle('authenticated', 'coach_nutzungsereignisse', 'INSERT')).toBe(true)
    expect(await darfTabelle('authenticated', 'coach_nutzungsereignisse', 'DELETE')).toBe(true)
    expect(await darfTabelle('authenticated', 'coach_nutzungsereignisse', 'UPDATE')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('RLS auf den Nachweisen', () => {
  it('ein Nutzer sieht nur die eigenen Ereignisse', async () => {
    await alsNutzer(NUTZER_A,
      `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'sitzung_gestartet')`)
    await alsNutzer(NUTZER_B,
      `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'ziel_angelegt')`)

    const a = await alsNutzer<{ ereignis: string }>(NUTZER_A, `SELECT ereignis FROM coach_nutzungsereignisse`)
    const b = await alsNutzer<{ ereignis: string }>(NUTZER_B, `SELECT ereignis FROM coach_nutzungsereignisse`)
    expect(a.map(z => z.ereignis)).toEqual(['sitzung_gestartet'])
    expect(b.map(z => z.ereignis)).toEqual(['ziel_angelegt'])

    // Gegenprobe: im Systemkontext liegen beide Zeilen wirklich da. Ohne
    // sie wäre „jeder sieht eine Zeile" auch dann grün, wenn gar nichts
    // geschrieben wurde.
    expect(await einWert<string>(`SELECT count(*)::text AS w FROM coach_nutzungsereignisse`)).toBe('2')
  })

  it('ein fremdes Pseudonym lässt sich nicht unterschieben', async () => {
    const fremd = await einWert<string>(`SELECT coach_pseudonym($1) AS w`, [NUTZER_B])
    await expect(
      alsNutzer(NUTZER_A,
        `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES ($1, 'sitzung_gestartet')`,
        [fremd]),
    ).rejects.toThrow(/row-level security|policy/i)
  })

  it('fremde Ereignisse lassen sich nicht löschen', async () => {
    await alsNutzer(NUTZER_B,
      `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'ziel_erreicht')`)
    await alsNutzer(NUTZER_A, `DELETE FROM coach_nutzungsereignisse`)
    // Die Zeile von B steht noch — die Policy hat sie für A unsichtbar
    // gemacht, und was unsichtbar ist, wird auch nicht gelöscht.
    expect(await einWert<string>(`SELECT count(*)::text AS w FROM coach_nutzungsereignisse`)).toBe('1')
  })

  it('die eigenen Ereignisse lassen sich löschen (Art. 17 DSGVO)', async () => {
    await alsNutzer(NUTZER_A,
      `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'export_erstellt')`)
    await alsNutzer(NUTZER_A, `DELETE FROM coach_nutzungsereignisse`)
    expect(await einWert<string>(`SELECT count(*)::text AS w FROM coach_nutzungsereignisse`)).toBe('0')
  })

  it('eine unbekannte Ereignisart lehnt die Datenbank ab', async () => {
    // Der Wertebereich steht im CHECK, nicht nur im TypeScript-Typ
    // (lib/coach/nachweise.ts). Ein Tippfehler im Aufrufer landet sonst
    // als stiller neuer Ereignistyp in der Auswertung.
    await expect(
      alsNutzer(NUTZER_A,
        `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'irgendwas')`),
    ).rejects.toThrow(/check constraint|verletzt/i)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Datensparsamkeit der Tabelle', () => {
  it('trägt keinen genauen Zeitpunkt, nur die Auswertungswoche', async () => {
    // Der Tabellenkommentar sagt „kein Zeitstempel". Ein created_at
    // daneben machte die Re-Identifikation über das Nutzungsmuster
    // erheblich leichter — geprüft am Schema, nicht am Kommentar.
    const spalten = (await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'coach_nutzungsereignisse' ORDER BY ordinal_position`,
    )).rows
    const namen = spalten.map(s => s.column_name)
    expect(namen).toEqual(['id', 'pseudonym', 'ereignis', 'modul_key', 'rolle', 'auswertungswoche', 'anzahl'])
    expect(namen.filter(n => /created_at|updated_at|zeitpunkt|erfasst_am/.test(n))).toEqual([])
    expect(spalten.every(s => s.data_type !== 'timestamp with time zone')).toBe(true)
  })

  it('trägt keinen Bezug auf coach_users oder auth.users', async () => {
    // Ein Fremdschlüssel hierher wäre die Re-Identifikation im Klartext —
    // das Pseudonym daneben wäre dann nur noch Zierde.
    const fk = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.table_constraints
        WHERE table_name = 'coach_nutzungsereignisse' AND constraint_type = 'FOREIGN KEY'`,
    )).rows[0].n
    expect(fk).toBe('0')
  })

  it('die Auswertungswoche liegt auf einem Wochenanfang', async () => {
    await alsNutzer(NUTZER_A,
      `INSERT INTO coach_nutzungsereignisse (pseudonym, ereignis) VALUES (coach_mein_pseudonym(), 'modul_geoeffnet')`)
    const w = await einWert<string>(
      `SELECT (auswertungswoche = date_trunc('week', auswertungswoche)::date)::text AS w
         FROM coach_nutzungsereignisse LIMIT 1`,
    )
    expect(w).toBe('true')
  })
})
