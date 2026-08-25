/**
 * Tarifauflösung und Tarif-Freigabe auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Zwei Schichten, die zusammen entscheiden, ob überhaupt ein Preis auf
 * eine Rechnung kommt:
 *
 *   1. `resolvePrice()` (lib/billing/core/price-resolver.ts) — welcher
 *      Tarif gilt für Mandant, Leistungsart, Rechtsgrundlage, Bundesland
 *      und Datum, und ist er freigegeben?
 *   2. Der DB-Trigger `trg_verifizierung_belegpflicht` (20260904000000) —
 *      unter welchen Bedingungen darf `tarif_status` überhaupt auf
 *      'verified' wechseln?
 *
 * Schicht 2 wird WORTGLEICH aus der Migration gezogen (siehe
 * baueTarifVerifizierung). Laut Kopfkommentar von
 * lib/billing/core/tarif-verifizierung.ts ist sie die einzige nicht
 * umgehbare Durchsetzung — Route und Oberfläche existieren nur für
 * lesbare Fehlermeldungen. Ein Test gegen eine nachgebaute Regel würde
 * genau die Schicht prüfen, auf die es nicht ankommt.
 *
 * ── EINE GRENZE, DIE BENANNT GEHÖRT ────────────────────────────────────
 * Der Überschneidungs-Constraint `no_overlapping_tariffs` ist live ein
 * EXCLUDE USING gist und braucht btree_gist, das PGlite nicht hat.
 * baueTarifStammdaten() setzt an seine Stelle einen Stellvertreter-
 * Trigger mit derselben Fehlermeldung. Geprüft wird damit, wie sich die
 * AUFLÖSUNG bei zwei überlappenden Zeiträumen verhält — nicht, ob der
 * echte Constraint greift.
 *
 * PREISE: Alle `preis_cent`-Werte sind Testwerte innerhalb der
 * In-Memory-Instanz. Es wird kein Vergütungssatz und kein Kassentarif
 * behauptet — geprüft wird die Auswahl- und Freigabelogik, nicht die Höhe.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  baueMonatsabschlussTabellen,
  baueTarifStammdaten,
  baueTarifVerifizierung,
} from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { resolvePrice, TarifNichtVerifiziertError } from '@/lib/billing/core/price-resolver'
import {
  bewerteAbrechenbarkeit,
  pruefeStatusaenderung,
  normalisiereStatus,
} from '@/lib/billing/core/tarif-verifizierung'

const ORG_A = 'aaaaaaaa-0000-4000-8000-0000000074a1'
const ORG_B = 'bbbbbbbb-0000-4000-8000-0000000074a1'

/** Innerhalb des Gültigkeitszeitraums aller Basistarife. */
const DATUM = '2026-03-15'

let db: PGlite
let admin: SupabaseClient

async function sql(text: string, werte: unknown[] = []): Promise<void> {
  await db.query(text, werte as never[])
}

interface TarifOpts {
  id: string
  org?: string
  leistungsart?: string
  rechtsgrundlage?: string
  bundesland?: string | null
  kostentraegerIk?: string | null
  qualifikation?: string | null
  preisCent?: number
  gueltigAb?: string
  gueltigBis?: string | null
  status?: string
  quelle?: string | null
  bearbeiter?: string | null
  istAktiv?: boolean
  deletedAt?: string | null
}

/**
 * Legt einen Tarif an. Der Status wird NACH dem INSERT gesetzt, weil der
 * Belegpflicht-Trigger auch beim INSERT greift — genau so, wie er es live
 * tut. Zum Setzen von 'verified' ohne Beleg gibt es keinen Weg; dafür
 * dient `gibFrei()`.
 */
async function tarif(o: TarifOpts): Promise<void> {
  await sql(
    `INSERT INTO public.billing_tariffs
       (id, organization_id, leistungsart, rechtsgrundlage, bundesland,
        kostentraeger_ik, qualifikation, verguetungsart, preis_cent, einheit,
        gueltig_ab, gueltig_bis, ist_aktiv, deleted_at, tarif_status,
        verifizierungs_quelle, verifiziert_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'zeit_stunde',$8,'stunde',$9,$10,$11,$12,
             $13,$14,$15)`,
    [
      o.id, o.org ?? ORG_A, o.leistungsart ?? 'alltagsbegleitung',
      o.rechtsgrundlage ?? '§45b SGB XI', o.bundesland ?? null,
      o.kostentraegerIk ?? null, o.qualifikation ?? null,
      o.preisCent ?? 3000, o.gueltigAb ?? '2026-01-01', o.gueltigBis ?? null,
      o.istAktiv ?? true, o.deletedAt ?? null,
      o.status ?? 'unverified', o.quelle ?? null, o.bearbeiter ?? null,
    ],
  )
}

/** Beleg + Freigabe — der einzige Weg nach 'verified'. */
async function gibFrei(tarifId: string, org = ORG_A): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.billing_tarif_belege
       (organization_id, quell_tabelle, tariff_id, dateipfad, dateiname,
        mime_type, groesse_bytes, sha256, quelle, hochgeladen_von)
     VALUES ($1, 'billing_tariffs', $2, $3, 'nachweis.pdf', 'application/pdf',
             1024, 'testhash', 'Testquelle', 'Testlauf')
     RETURNING id`,
    [org, tarifId, `belege/${tarifId}.pdf`] as never[],
  )
  const belegId = rows[0].id
  await sql(
    `UPDATE public.billing_tariffs
        SET tarif_status = 'verified',
            verifizierungs_quelle = 'Testfreigabe im Integrationstest',
            verifiziert_von = 'Testlauf',
            verifiziert_am = now(),
            beleg_id = $2
      WHERE id = $1`,
    [tarifId, belegId],
  )
  return belegId
}

function anfrage(ueber: Partial<Parameters<typeof resolvePrice>[1]> = {}) {
  return {
    organizationId: ORG_A,
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    datum: DATUM,
    ...ueber,
  }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueMonatsabschlussTabellen(db)
  await baueTarifStammdaten(db)
  await baueTarifVerifizierung(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
})

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await sql(`
    TRUNCATE public.billing_tariff_audit, public.billing_tarif_belege,
             public.billing_tariffs, public.leistungspreise, public.organizations
    RESTART IDENTITY CASCADE
  `)
  await sql(
    `INSERT INTO public.organizations (id, name) VALUES ($1, 'Mandant A'), ($2, 'Mandant B')`,
    [ORG_A, ORG_B],
  )
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Mandantentrennung
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  it('ein Tarif eines fremden Mandanten wird nicht gefunden', async () => {
    const fremd = 'f0000001-0000-4000-8000-0000000074a1'
    await tarif({ id: fremd, org: ORG_B })
    await gibFrei(fremd, ORG_B)

    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(/Kein Tarif gefunden/)
    // Für den eigenen Mandanten liefert derselbe Aufruf einen Preis.
    await expect(resolvePrice(admin, anfrage({ organizationId: ORG_B })))
      .resolves.toMatchObject({ id: fremd })
  })

  it('ohne organizationId wird gar nicht erst gesucht', async () => {
    await expect(resolvePrice(admin, anfrage({ organizationId: '' })))
      .rejects.toThrow(/organizationId fehlt/)
  })

  it('zwei Mandanten mit demselben Tarifschlüssel bekommen ihren eigenen Preis', async () => {
    const a = 'f0000002-0000-4000-8000-0000000074a1'
    const b = 'f0000003-0000-4000-8000-0000000074a1'
    await tarif({ id: a, org: ORG_A, preisCent: 3000 })
    await tarif({ id: b, org: ORG_B, preisCent: 4100 })
    await gibFrei(a, ORG_A)
    await gibFrei(b, ORG_B)

    expect((await resolvePrice(admin, anfrage())).preis_cent).toBe(3000)
    expect((await resolvePrice(admin, anfrage({ organizationId: ORG_B }))).preis_cent).toBe(4100)
  })

  it('ein Beleg des falschen Mandanten trägt die Freigabe nicht', async () => {
    const t = 'f0000004-0000-4000-8000-0000000074a1'
    await tarif({ id: t, org: ORG_A })
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.billing_tarif_belege
         (organization_id, quell_tabelle, tariff_id, dateipfad, dateiname,
          mime_type, groesse_bytes, sha256, hochgeladen_von)
       VALUES ($1, 'billing_tariffs', $2, 'belege/fremd.pdf', 'fremd.pdf',
               'application/pdf', 512, 'hash', 'Testlauf') RETURNING id`,
      [ORG_B, t] as never[],
    )
    await expect(sql(
      `UPDATE public.billing_tariffs
          SET tarif_status='verified', verifizierungs_quelle='Testfreigabe lang genug',
              verifiziert_von='Testlauf', beleg_id=$2 WHERE id=$1`,
      [t, rows[0].id],
    )).rejects.toThrow(/anderen Organisation/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Bundesland / Region
// ═══════════════════════════════════════════════════════════════════════

describe('Bundesland und Region', () => {
  it('der bundeslandspezifische Tarif schlägt den allgemeinen', async () => {
    const allgemein = 'f0000010-0000-4000-8000-0000000074a1'
    const hessen = 'f0000011-0000-4000-8000-0000000074a1'
    await tarif({ id: allgemein, bundesland: null, preisCent: 3000 })
    await tarif({ id: hessen, bundesland: 'hessen', preisCent: 3300 })
    await gibFrei(allgemein)
    await gibFrei(hessen)

    const treffer = await resolvePrice(admin, anfrage({ bundesland: 'hessen' }))
    expect(treffer.id).toBe(hessen)
    expect(treffer.preis_cent).toBe(3300)
  })

  it('ein Tarif für ein ANDERES Bundesland wird nicht verwendet', async () => {
    const bayern = 'f0000012-0000-4000-8000-0000000074a1'
    await tarif({ id: bayern, bundesland: 'bayern' })
    await gibFrei(bayern)

    // Score -1: der Tarif ist spezifisch für ein anderes Bundesland.
    await expect(resolvePrice(admin, anfrage({ bundesland: 'hessen' })))
      .rejects.toThrow(/Kein passender Tarif/)
  })

  it('ohne Bundesland in der Anfrage greift nur der allgemeine Tarif', async () => {
    const allgemein = 'f0000013-0000-4000-8000-0000000074a1'
    const hessen = 'f0000014-0000-4000-8000-0000000074a1'
    await tarif({ id: allgemein, bundesland: null, preisCent: 3000 })
    await tarif({ id: hessen, bundesland: 'hessen', preisCent: 3300 })
    await gibFrei(allgemein)
    await gibFrei(hessen)

    expect((await resolvePrice(admin, anfrage())).id).toBe(allgemein)
  })

  it('der Kostenträger schlägt das Bundesland', async () => {
    const nurLand = 'f0000015-0000-4000-8000-0000000074a1'
    const mitIk = 'f0000016-0000-4000-8000-0000000074a1'
    await tarif({ id: nurLand, bundesland: 'hessen', preisCent: 3300 })
    await tarif({ id: mitIk, bundesland: null, kostentraegerIk: '460629986', preisCent: 3500 })
    await gibFrei(nurLand)
    await gibFrei(mitIk)

    const treffer = await resolvePrice(
      admin, anfrage({ bundesland: 'hessen', kostentraegerIk: '460629986' }),
    )
    // +10 (Kostenträger) schlägt +5 (Bundesland).
    expect(treffer.id).toBe(mitIk)
  })

  it('ein Tarif für einen anderen Kostenträger wird nicht verwendet', async () => {
    const fremdeKasse = 'f0000017-0000-4000-8000-0000000074a1'
    await tarif({ id: fremdeKasse, kostentraegerIk: '460629986' })
    await gibFrei(fremdeKasse)

    await expect(resolvePrice(admin, anfrage({ kostentraegerIk: '999999999' })))
      .rejects.toThrow(/Kein passender Tarif/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Gültigkeitszeitraum
// ═══════════════════════════════════════════════════════════════════════

describe('gueltig_ab / gueltig_bis', () => {
  it('ein Tarif, der erst später beginnt, gilt nicht', async () => {
    const t = 'f0000020-0000-4000-8000-0000000074a1'
    await tarif({ id: t, gueltigAb: '2026-04-01' })
    await gibFrei(t)
    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(/Kein Tarif gefunden/)
  })

  it('ein abgelaufener Tarif gilt nicht', async () => {
    const t = 'f0000021-0000-4000-8000-0000000074a1'
    await tarif({ id: t, gueltigAb: '2026-01-01', gueltigBis: '2026-02-28' })
    await gibFrei(t)
    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(/Kein gültiger Tarif/)
  })

  it('die Grenzen sind einschließend', async () => {
    const t = 'f0000022-0000-4000-8000-0000000074a1'
    await tarif({ id: t, gueltigAb: DATUM, gueltigBis: DATUM })
    await gibFrei(t)
    await expect(resolvePrice(admin, anfrage())).resolves.toMatchObject({ id: t })
  })

  it('gueltig_bis vor gueltig_ab weist die Datenbank ab', async () => {
    await expect(tarif({
      id: 'f0000023-0000-4000-8000-0000000074a1',
      gueltigAb: '2026-03-01', gueltigBis: '2026-02-01',
    })).rejects.toThrow(/valid_period/)
  })

  it('ein Datum ohne ISO-Format wird abgewiesen, statt still zu vergleichen', async () => {
    const t = 'f0000024-0000-4000-8000-0000000074a1'
    await tarif({ id: t })
    await gibFrei(t)
    for (const schlecht of ['15.03.2026', '2026-3-15', '', 'heute']) {
      await expect(resolvePrice(admin, anfrage({ datum: schlecht })))
        .rejects.toThrow(/kein ISO-Datum/)
    }
  })

  it('deaktivierte und gelöschte Tarife bleiben draußen', async () => {
    const inaktiv = 'f0000025-0000-4000-8000-0000000074a1'
    const geloescht = 'f0000026-0000-4000-8000-0000000074a1'
    await tarif({ id: inaktiv, istAktiv: false })
    await tarif({ id: geloescht, deletedAt: '2026-02-01T00:00:00Z', bundesland: 'hessen' })
    await gibFrei(inaktiv)
    await gibFrei(geloescht)

    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(/Kein Tarif gefunden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Überlappende Tarifzeiträume
// ═══════════════════════════════════════════════════════════════════════

describe('überlappende Zeiträume', () => {
  it('die Datenbank weist eine echte Überschneidung ab', async () => {
    await tarif({
      id: 'f0000030-0000-4000-8000-0000000074a1',
      gueltigAb: '2026-01-01', gueltigBis: '2026-06-30',
    })
    await expect(tarif({
      id: 'f0000031-0000-4000-8000-0000000074a1',
      gueltigAb: '2026-03-01', gueltigBis: '2026-09-30',
    })).rejects.toThrow(/no_overlapping_tariffs/)
  })

  it('lückenlose Anschlusszeiträume sind erlaubt und liefern den richtigen Preis', async () => {
    const alt = 'f0000032-0000-4000-8000-0000000074a1'
    const neu = 'f0000033-0000-4000-8000-0000000074a1'
    await tarif({ id: alt, gueltigAb: '2026-01-01', gueltigBis: '2026-02-28', preisCent: 3000 })
    await tarif({ id: neu, gueltigAb: '2026-03-01', gueltigBis: null, preisCent: 3200 })
    await gibFrei(alt)
    await gibFrei(neu)

    expect((await resolvePrice(admin, anfrage({ datum: '2026-02-15' }))).preis_cent).toBe(3000)
    expect((await resolvePrice(admin, anfrage({ datum: '2026-03-15' }))).preis_cent).toBe(3200)
  })

  it('bei gleichem Spezifitäts-Score gewinnt der jüngere gueltig_ab', async () => {
    // Zwei Tarife derselben Spezifität können nur nebeneinander stehen,
    // wenn der Überschneidungsschutz sie durchlässt — hier über die
    // Unterscheidung nach Bundesland umgangen und dann beide auf denselben
    // Anfragefall gebracht. Geprüft wird die Sortierregel des Resolvers.
    const frueh = 'f0000034-0000-4000-8000-0000000074a1'
    const spaet = 'f0000035-0000-4000-8000-0000000074a1'
    await tarif({ id: frueh, bundesland: 'hessen', gueltigAb: '2026-01-01', preisCent: 3000 })
    await tarif({ id: spaet, bundesland: 'bayern', gueltigAb: '2026-02-01', preisCent: 3900 })
    await gibFrei(frueh)
    await gibFrei(spaet)
    // Beide auf denselben Zustand ziehen (kein Bundesland), am Trigger vorbei:
    await sql(`UPDATE public.billing_tariffs SET bundesland = NULL`)

    expect((await resolvePrice(admin, anfrage())).id).toBe(spaet)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Fehlender Tarif und ungültige Beträge — fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('fail-closed', () => {
  it('ohne jeden Tarif gibt es keinen Preis, sondern einen Fehler', async () => {
    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(/Kein Tarif gefunden/)
  })

  it('ein nicht verifizierter Kassentarif blockiert die Abrechnung', async () => {
    await tarif({ id: 'f0000040-0000-4000-8000-0000000074a1', status: 'unverified' })
    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(TarifNichtVerifiziertError)
  })

  it('ein gesperrter Tarif blockiert — auch privat', async () => {
    const kasse = 'f0000041-0000-4000-8000-0000000074a1'
    const privat = 'f0000042-0000-4000-8000-0000000074a1'
    await tarif({ id: kasse, status: 'blocked' })
    await tarif({ id: privat, rechtsgrundlage: 'privat', status: 'blocked' })

    await expect(resolvePrice(admin, anfrage())).rejects.toThrow(TarifNichtVerifiziertError)
    await expect(resolvePrice(admin, anfrage({ rechtsgrundlage: 'privat' })))
      .rejects.toThrow(TarifNichtVerifiziertError)
  })

  it('ein unverifizierter PRIVATtarif ist abrechenbar — Privatpreise sind frei wählbar', async () => {
    const t = 'f0000043-0000-4000-8000-0000000074a1'
    await tarif({ id: t, rechtsgrundlage: 'privat', status: 'unverified', preisCent: 3500 })
    const treffer = await resolvePrice(admin, anfrage({ rechtsgrundlage: 'privat' }))
    expect(treffer.preis_cent).toBe(3500)
  })

  it('ein negativer Preis kommt gar nicht erst in die Tabelle', async () => {
    await expect(tarif({ id: 'f0000044-0000-4000-8000-0000000074a1', preisCent: -1 }))
      .rejects.toThrow(/positive_price/)
  })

  it('ein Preis mit Nachkommastellen wird auf die Cent-Spalte abgewiesen oder gerundet — nie stillschweigend verworfen', async () => {
    // preis_cent ist INTEGER. Postgres rundet einen numerischen Literalwert
    // kaufmännisch; entscheidend ist, dass nichts abgeschnitten wird.
    await sql(
      `INSERT INTO public.billing_tariffs
         (id, organization_id, leistungsart, rechtsgrundlage, verguetungsart,
          preis_cent, gueltig_ab)
       VALUES ($1, $2, 'alltagsbegleitung', 'privat', 'zeit_stunde', 3000.6, '2026-01-01')`,
      ['f0000045-0000-4000-8000-0000000074a1', ORG_A],
    )
    const { rows } = await db.query<{ preis_cent: number }>(
      `SELECT preis_cent FROM public.billing_tariffs WHERE id = $1`,
      ['f0000045-0000-4000-8000-0000000074a1'] as never[],
    )
    expect(rows[0].preis_cent).toBe(3001)
  })

  it('ein unbekannter Status gilt als unverified, nicht als Freigabe', () => {
    for (const wert of [null, undefined, '', 'freigegeben', 'VERIFIED', 42]) {
      expect(normalisiereStatus(wert)).toBe('unverified')
    }
  })

  it('ein Lesefehler auf billing_tariffs bricht ab, statt "kein Tarif" zu melden', async () => {
    const kaputt = {
      from: () => {
        const kette: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'lte', 'gte', 'is', 'in', 'not', 'or', 'order', 'limit']) {
          kette[m] = () => kette
        }
        kette.returns = async () => ({
          data: null,
          error: { message: 'connection terminated', code: '08006' },
        })
        return kette
      },
    } as unknown as SupabaseClient

    // Wichtig: die Meldung darf NICHT "Kein Tarif gefunden" lauten — sonst
    // sieht ein Datenbankausfall aus wie eine Lücke im Tarifwerk und der
    // Bearbeiter legt einen Tarif an, den es längst gibt.
    await expect(resolvePrice(kaputt, anfrage())).rejects.toThrow(/Tarifladen fehlgeschlagen/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Belegpflicht — der DB-Trigger als letzte Instanz
// ═══════════════════════════════════════════════════════════════════════

describe('Belegpflicht beim Übergang nach verified', () => {
  const T = 'f0000050-0000-4000-8000-0000000074a1'

  beforeEach(async () => { await tarif({ id: T }) })

  async function freigabeVersuch(felder: Record<string, unknown>) {
    const werte = { tarif_status: 'verified', ...felder }
    const spalten = Object.keys(werte)
    const sets = spalten.map((s, i) => `"${s}" = $${i + 2}`).join(', ')
    return sql(
      `UPDATE public.billing_tariffs SET ${sets} WHERE id = $1`,
      [T, ...spalten.map(s => werte[s])],
    )
  }

  it('ohne Rechtsquelle: abgelehnt', async () => {
    await expect(freigabeVersuch({ verifiziert_von: 'Testlauf' }))
      .rejects.toThrow(/verlangt eine Rechtsquelle/)
  })

  it('mit zu kurzer Rechtsquelle: abgelehnt', async () => {
    await expect(freigabeVersuch({ verifizierungs_quelle: 'abc', verifiziert_von: 'Testlauf' }))
      .rejects.toThrow(/verlangt eine Rechtsquelle/)
  })

  it('ohne Bearbeiter: abgelehnt', async () => {
    await expect(freigabeVersuch({ verifizierungs_quelle: 'Quelle lang genug' }))
      .rejects.toThrow(/verlangt einen Bearbeiter/)
  })

  it('ohne Beleg: abgelehnt', async () => {
    await expect(freigabeVersuch({
      verifizierungs_quelle: 'Quelle lang genug', verifiziert_von: 'Testlauf',
    })).rejects.toThrow(/Primaerbeleg/)
  })

  it('mit einem Beleg eines ANDEREN Tarifs: abgelehnt', async () => {
    const anderer = 'f0000051-0000-4000-8000-0000000074a1'
    await tarif({ id: anderer, bundesland: 'hessen' })
    const fremderBeleg = await gibFrei(anderer)

    await expect(freigabeVersuch({
      verifizierungs_quelle: 'Quelle lang genug',
      verifiziert_von: 'Testlauf',
      beleg_id: fremderBeleg,
    })).rejects.toThrow(/gehoert nicht zu Tarif/)
  })

  it('mit vollständigem Nachweis: erlaubt, und der Tarif ist danach abrechenbar', async () => {
    await gibFrei(T)
    const treffer = await resolvePrice(admin, anfrage())
    expect(treffer.tarif_status).toBe('verified')
    expect(bewerteAbrechenbarkeit({
      quellTabelle: 'billing_tariffs',
      tarifStatus: treffer.tarif_status,
      rechtsgrundlage: treffer.rechtsgrundlage,
    }).abrechenbar).toBe(true)
  })

  it('ein Privattarif braucht Quelle und Bearbeiter, aber keinen Beleg', async () => {
    const p = 'f0000052-0000-4000-8000-0000000074a1'
    await tarif({ id: p, rechtsgrundlage: 'privat' })
    await sql(
      `UPDATE public.billing_tariffs
          SET tarif_status='verified', verifizierungs_quelle='Eigene Preisliste 03/2026',
              verifiziert_von='Testlauf' WHERE id=$1`, [p])

    const { rows } = await db.query<{ tarif_status: string }>(
      `SELECT tarif_status FROM public.billing_tariffs WHERE id=$1`, [p] as never[])
    expect(rows[0].tarif_status).toBe('verified')
  })

  it('leistungspreise sind IMMER belegpflichtig — dort gibt es keine Rechtsgrundlage', async () => {
    const lp = 'f0000053-0000-4000-8000-0000000074a1'
    await sql(
      `INSERT INTO public.leistungspreise
         (id, organization_id, bundesland, leistungsart, preis_cent, gueltig_ab)
       VALUES ($1, $2, 'hessen', 'alltagsbegleitung', 3000, '2026-01-01')`, [lp, ORG_A])

    await expect(sql(
      `UPDATE public.leistungspreise
          SET tarif_status='verified', verifizierungs_quelle='Quelle lang genug',
              verifiziert_von='Testlauf' WHERE id=$1`, [lp],
    )).rejects.toThrow(/Primaerbeleg/)
  })

  it('Sperren und Zurücknehmen gehen immer — das ist die sichere Richtung', async () => {
    await gibFrei(T)
    await expect(sql(
      `UPDATE public.billing_tariffs SET tarif_status='blocked' WHERE id=$1`, [T],
    )).resolves.toBeUndefined()
    await expect(sql(
      `UPDATE public.billing_tariffs SET tarif_status='unverified' WHERE id=$1`, [T],
    )).resolves.toBeUndefined()
  })

  it('die Anwendungsprüfung sagt dasselbe wie der Trigger', () => {
    // Beide Schichten müssen dieselbe Regel tragen — sonst meldet die
    // Oberfläche "gespeichert" und die Datenbank wirft.
    const ohneQuelle = pruefeStatusaenderung({
      zielStatus: 'verified', quelle: 'abc', belegId: 'x',
      quellTabelle: 'billing_tariffs', rechtsgrundlage: '§45b SGB XI',
    })
    expect(ohneQuelle).toMatchObject({ ok: false })

    const ohneBeleg = pruefeStatusaenderung({
      zielStatus: 'verified', quelle: 'Vergütungsvereinbarung vom 01.03.2026',
      quellTabelle: 'billing_tariffs', rechtsgrundlage: '§45b SGB XI',
    })
    expect(ohneBeleg).toMatchObject({ ok: false })

    const privatOhneBeleg = pruefeStatusaenderung({
      zielStatus: 'verified', quelle: 'Eigene Preisliste 03/2026',
      quellTabelle: 'billing_tariffs', rechtsgrundlage: 'privat',
    })
    expect(privatOhneBeleg).toMatchObject({ ok: true })

    const belegAnSperre = pruefeStatusaenderung({
      zielStatus: 'blocked', quelle: 'Sperrgrund lang genug', belegId: 'x',
      quellTabelle: 'billing_tariffs', rechtsgrundlage: '§45b SGB XI',
    })
    expect(belegAnSperre).toMatchObject({ ok: false })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Der Org-Fence des Verifizierungs-Service — `.or(…)` auf leistungspreise
// ═══════════════════════════════════════════════════════════════════════

describe('Org-Fence auf leistungspreise (or-Ausdruck)', () => {
  /**
   * lib/billing/tarif-verifizierung-service.ts baut für leistungspreise
   * bewusst KEIN `.eq('organization_id', …)`, sondern
   *
   *   .or(`organization_id.eq.${org},organization_id.is.null`)
   *
   * Genau dieser Ausdruck war im PGlite-Shim nicht abbildbar — er ist
   * jetzt ergänzt und läuft hier gegen echtes SQL.
   *
   * ── EINE BEOBACHTUNG ZUR NULL-HÄLFTE ────────────────────────────────
   * Die Begründung im Service lautet, leistungspreise-Altbestand aus der
   * Zeit vor Phase 3 könne `organization_id IS NULL` tragen. Nach dem
   * Schema, das die Migrationen aufbauen, kann er das NICHT mehr: der
   * Phase-3-DO-Block (20260801) füllt die Spalte auf die Stamm-Org und
   * setzt anschließend NOT NULL — siehe den Ausschnitt in
   * baueKettenSchema(). Die `is.null`-Hälfte trifft damit auf diesem
   * Schema keine Zeile.
   *
   * Das ist hier ausdrücklich NICHT als Fehler notiert: ob die Spalte
   * auf der Produktionsdatenbank tatsächlich NOT NULL ist, lässt sich
   * aus dem Repo nicht feststellen, und ein zusätzlicher ODER-Zweig ist
   * kein Leck — er öffnet nur für herrenlose Zeilen, nicht für fremde.
   * Geprüft wird deshalb das, was in beiden Fällen gelten muss: eigene
   * Zeilen sichtbar, fremde nicht.
   */
  const EIGEN = 'e0000001-0000-4000-8000-0000000074a1'
  const EIGEN_2 = 'e0000002-0000-4000-8000-0000000074a1'
  const FREMD = 'e0000003-0000-4000-8000-0000000074a1'

  beforeEach(async () => {
    await sql(
      `INSERT INTO public.leistungspreise
         (id, organization_id, bundesland, leistungsart, preis_cent, gueltig_ab)
       VALUES ($1, $4, 'hessen', 'alltagsbegleitung', 3000, '2026-01-01'),
              ($2, $4, 'hessen', 'hauswirtschaft',    2500, '2026-01-01'),
              ($3, $5, 'hessen', 'begleitservice',    2800, '2026-01-01')`,
      [EIGEN, EIGEN_2, FREMD, ORG_A, ORG_B],
    )
  })

  async function sichtbar(org: string): Promise<string[]> {
    const { data, error } = await admin
      .from('leistungspreise')
      .select('id, organization_id, leistungsart, tarif_status, preis_cent')
      .or(`organization_id.eq.${org},organization_id.is.null`)
    expect(error).toBeNull()
    return (data ?? []).map(z => String(z.id)).sort()
  }

  it('sichtbar sind genau die eigenen Zeilen', async () => {
    expect(await sichtbar(ORG_A)).toEqual([EIGEN, EIGEN_2].sort())
  })

  it('die Zeile eines fremden Mandanten bleibt unsichtbar', async () => {
    expect(await sichtbar(ORG_A)).not.toContain(FREMD)
    expect(await sichtbar(ORG_B)).toEqual([FREMD])
  })

  it('die NULL-Hälfte des Ausdrucks öffnet nicht für fremde Mandanten', async () => {
    // Der zweite ODER-Zweig darf nur herrenlose Zeilen einschließen. Wäre
    // er zu weit gefasst, sähe ORG_A auch die Zeile von ORG_B — deshalb
    // steht die Gegenprobe hier neben dem Positivfall.
    const alleIds = (await db.query<{ id: string }>(
      `SELECT id FROM public.leistungspreise`,
    )).rows.map(r => String(r.id))
    expect(alleIds).toHaveLength(3)
    expect((await sichtbar(ORG_A)).length).toBe(2)
  })

  it('der Fence gilt auch beim Schreiben', async () => {
    const { data, error } = await admin
      .from('leistungspreise')
      .update({ verifizierungs_quelle: 'Versuch' })
      .eq('id', FREMD)
      .or(`organization_id.eq.${ORG_A},organization_id.is.null`)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])   // kein Treffer = keine Änderung

    const { rows } = await db.query<{ verifizierungs_quelle: string | null }>(
      `SELECT verifizierungs_quelle FROM public.leistungspreise WHERE id=$1`,
      [FREMD] as never[],
    )
    expect(rows[0].verifizierungs_quelle).toBeNull()
  })

  it('eine eigene Zeile lässt sich über denselben Ausdruck ändern', async () => {
    const { data, error } = await admin
      .from('leistungspreise')
      .update({ verifizierungs_quelle: 'Testquelle lang genug' })
      .eq('id', EIGEN)
      .or(`organization_id.eq.${ORG_A},organization_id.is.null`)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
