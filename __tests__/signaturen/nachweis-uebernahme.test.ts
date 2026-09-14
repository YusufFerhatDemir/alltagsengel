/**
 * Die Unterschrift erreicht den Leistungsnachweis.
 * @see lib/signaturen/nachweis-uebernahme.ts
 *
 * ── DAS FEHLENDE GLIED ────────────────────────────────────────────────
 * `signatur_dokumente` trägt seit jeher `referenz_tabelle` und
 * `referenz_id`. Beide wurden gespeichert — und von niemandem
 * ausgewertet. Eine Kundin konnte einen Leistungsnachweis unterschreiben,
 * und der Nachweis selbst blieb auf `proof_status='ENTWURF'` ohne Hash.
 *
 * Die Folge steht in `npm run verify:sammelrechnung`, Punkt S13c: am
 * 14.09.2026 lagen dreizehn Nachweise aus vier Monaten so da. Der
 * Sammelrechnungslauf überspringt genau die mit `UNTERSCHRIFT_FEHLT` —
 * die Leistung ist erbracht, eine Rechnung entsteht nicht.
 *
 * Geprüft wird hier die Entscheidung: WANN wird gestempelt, wann nicht,
 * und was passiert, wenn es schiefgeht. Dass die Trigger daraus Hash und
 * Sperre machen, prüft
 * `__tests__/e2e/manipulationsschutz-nachweis-pglite.test.ts` auf echtem
 * Postgres.
 */
import { describe, it, expect } from 'vitest'
import { uebernimmSignaturInNachweis, uebernimmOderMelde, NACHWEIS_TABELLE, SIGNER_ROLLEN } from '@/lib/signaturen/nachweis-uebernahme'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const NACHWEIS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const BASIS = {
  referenzTabelle: NACHWEIS_TABELLE,
  referenzId: NACHWEIS,
  signiertAm: '2026-09-14T09:00:00.000Z',
  signatarName: 'Erika Mustermann',
  organizationId: ORG,
}

/** @param zeile der gelesene Nachweis; `null` = nicht gefunden. */
function fake(zeile: Record<string, unknown> | null, getroffen: unknown[] = [{ id: NACHWEIS }]) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'service_records') return { data: null }
    return a.operation === 'update' ? { data: getroffen } : { data: zeile }
  })
}

describe('Wann gestempelt wird', () => {
  it('stempelt einen Nachweis ohne Beleg', async () => {
    const f = fake({ id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: null, is_locked: false })
    const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)

    expect(r).toEqual({ art: 'uebernommen', nachweisId: NACHWEIS })

    const update = f.auf('service_records').find(a => a.operation === 'update')
    const p = update?.payload as Record<string, unknown>
    // Beide Felder zusammen: `compute_signature_hash` rechnet nur, wenn
    // proof_status UND client_signed_at gesetzt sind. Einzeln entstuende
    // ein halber Zustand — unterschrieben ohne Hash und ohne Sperre.
    expect(p.proof_status).toBe('UNTERSCHRIEBEN')
    expect(p.client_signed_at).toBe(BASIS.signiertAm)

    // Block 36: der Name gehoert in die NAMENSSPALTE. Vorher stand er in
    // `client_signature` — dem Feld fuer das Unterschriftsbild, das die
    // Admin-Detailansicht als `<img src={…}>` rendert. Ein Klarname darin
    // ergibt ein kaputtes Bild.
    expect(p.client_signer_name).toBe('Erika Mustermann')

    // `client_signature` bleibt gesetzt — und das ist tragend, nicht
    // nachlaessig: `enforce_unterschrift_beleg` laesst
    // proof_status='UNTERSCHRIEBEN' nur durch, wenn ENTWEDER
    // client_signature mit client_signed_at vorliegt ODER eine Zeile in
    // service_signatures. Der Signaturdienst schreibt nicht nach
    // service_signatures — fuer ihn ist dieses Feld der einzige Beleg,
    // den der Trigger akzeptiert. Ein Entfernen riss beim Bau von
    // Block 36 die ganze Kette.
    expect(p.client_signature).toBe('Erika Mustermann')

    // 'KUNDE', nicht 'client': die Spalte traegt einen CHECK mit deutschem
    // Vokabular (KUNDE/ANGEHOERIGER/VERTRETER). Das Vokabular der
    // Native-Route ungeprueft durchzureichen liesse das GANZE Update am
    // CHECK scheitern — die Unterschrift erreichte den Nachweis dann gar
    // nicht mehr.
    expect(p.client_signer_role).toBe('KUNDE')

    expect(hatOrgFence(update, ORG)).toBe(true)
    expect(hatFilter(update, 'eq', 'id', NACHWEIS)).toBe(true)
  })

  it('schreibt nur Rollenwerte, die der CHECK der Spalte zulaesst', async () => {
    const f = fake({ id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: null, is_locked: false })
    await uebernimmSignaturInNachweis(f.client as never, BASIS)
    const p = f.auf('service_records').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(SIGNER_ROLLEN).toContain(p.client_signer_role as string)
  })

  it('rührt nichts an, wenn die Referenz nicht auf einen Nachweis zeigt', async () => {
    const f = fake(null)
    for (const ref of [null, undefined, 'clients', 'invoices']) {
      const r = await uebernimmSignaturInNachweis(f.client as never, { ...BASIS, referenzTabelle: ref })
      expect(r, String(ref)).toEqual({ art: 'kein_nachweis' })
    }
    expect(f.aufrufe).toHaveLength(0)
  })

  it('rührt nichts an, wenn die Kennung fehlt', async () => {
    const f = fake(null)
    const r = await uebernimmSignaturInNachweis(f.client as never, { ...BASIS, referenzId: null })
    expect(r).toEqual({ art: 'kein_nachweis' })
    expect(f.aufrufe).toHaveLength(0)
  })
})

describe('Wann NICHT gestempelt wird', () => {
  it('lässt einen bereits belegten Nachweis in Ruhe — auf beiden Wegen', async () => {
    // Idempotenz: ein zweiter Stempel liefe durch den Hash-Trigger mit
    // einem NEUEN Zeitstempel und änderte damit den Beleg.
    for (const zeile of [
      { id: NACHWEIS, proof_status: 'UNTERSCHRIEBEN', signature_hash: null, is_locked: false },
      { id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: 'abc123', is_locked: false },
    ]) {
      const f = fake(zeile)
      const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)
      expect(r, JSON.stringify(zeile)).toEqual({ art: 'bereits_belegt' })
      expect(f.auf('service_records').filter(a => a.operation === 'update')).toHaveLength(0)
    }
  })

  it('versucht es gar nicht erst auf einer gesperrten Zeile', async () => {
    // `prevent_locked_record_change` lässt dort nur STORNIERT durch. Der
    // Versuch würde mit P0001 scheitern — das vorher zu wissen ist
    // ehrlicher als ein Fehlschlag.
    const f = fake({ id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: null, is_locked: true })
    const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)
    expect(r).toEqual({ art: 'gesperrt' })
    expect(f.auf('service_records').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('meldet einen Nachweis, den es nicht gibt', async () => {
    // Mandantenfremd oder gelöscht: die Unterschrift zeigt ins Leere.
    const f = fake(null)
    const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)
    expect(r.art).toBe('fehlgeschlagen')
    expect((r as { grund: string }).grund).toMatch(/nicht gefunden/)
  })
})

describe('Wenn das Schreiben schiefgeht', () => {
  it('meldet einen Fehler beim Lesen', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null, error: { message: 'Verbindung weg' } }))
    const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)
    expect(r.art).toBe('fehlgeschlagen')
    expect((r as { grund: string }).grund).toMatch(/Verbindung weg/)
  })

  it('meldet einen Schreibvorgang, der keine Zeile trifft', async () => {
    // PostgREST meldet dabei KEINEN Fehler. Ohne diese Prüfung sähe es aus
    // wie Erfolg — und der Nachweis bliebe unabrechenbar.
    const f = fake({ id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: null, is_locked: false }, [])
    const r = await uebernimmSignaturInNachweis(f.client as never, BASIS)
    expect(r.art).toBe('fehlgeschlagen')
    expect((r as { grund: string }).grund).toMatch(/zwischenzeitlich verändert/)
  })

  it('vergleicht gegen den gelesenen Stand', async () => {
    const f = fake({ id: NACHWEIS, proof_status: 'ABGESCHLOSSEN', signature_hash: null, is_locked: false })
    await uebernimmSignaturInNachweis(f.client as never, BASIS)
    const update = f.auf('service_records').find(a => a.operation === 'update')
    expect(hatFilter(update, 'eq', 'proof_status', 'ABGESCHLOSSEN')).toBe(true)
  })

  it('vergleicht bei leerem proof_status mit `is`, nicht mit `eq`', async () => {
    // `.eq(spalte, null)` trifft in Postgres NICHTS.
    const f = fake({ id: NACHWEIS, proof_status: null, signature_hash: null, is_locked: false })
    await uebernimmSignaturInNachweis(f.client as never, BASIS)
    const update = f.auf('service_records').find(a => a.operation === 'update')
    expect(hatFilter(update, 'is', 'proof_status', null)).toBe(true)
  })
})

describe('uebernimmOderMelde', () => {
  it('wirft nicht, auch wenn die Übernahme scheitert', async () => {
    // Die Unterschrift IST zu diesem Zeitpunkt geleistet und im Prüfpfad.
    // Sie zurückzunehmen wäre falsch — der Fehlschlag gehört gemeldet.
    const f = erstelleFakeSupabase(() => { throw new Error('Datenbank weg') })
    const r = await uebernimmOderMelde(f.client as never, BASIS)
    expect(r.art).toBe('fehlgeschlagen')
    expect((r as { grund: string }).grund).toMatch(/Datenbank weg/)
  })

  it('gibt den Erfolg unverändert durch', async () => {
    const f = fake({ id: NACHWEIS, proof_status: 'ENTWURF', signature_hash: null, is_locked: false })
    const r = await uebernimmOderMelde(f.client as never, BASIS)
    expect(r).toEqual({ art: 'uebernommen', nachweisId: NACHWEIS })
  })
})
