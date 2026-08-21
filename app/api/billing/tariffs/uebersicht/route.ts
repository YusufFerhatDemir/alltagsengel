import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  berechneKennzahlen,
  bewerteAbrechenbarkeit,
  normalisiereStatus,
  type QuellTabelle,
} from '@/lib/billing/core/tarif-verifizierung'

interface UebersichtZeile {
  id: string
  quellTabelle: QuellTabelle
  leistungsart: string
  rechtsgrundlage: string | null
  bundesland: string | null
  preisCent: number
  einheit: string | null
  tarifStatus: string
  gueltigAb: string | null
  gueltigBis: string | null
  istAktiv: boolean
  verifiziertAm: string | null
  verifiziertVon: string | null
  verifizierungsQuelle: string | null
  belegId: string | null
  abrechenbar: boolean
  begruendung: string
}

/**
 * GET /api/billing/tariffs/uebersicht
 *
 * Beide Preisquellen in einer Antwort:
 *   billing_tariffs  — verbindliche Rechnungspreise (resolvePrice, RPC v6)
 *   leistungspreise  — Preisquelle des Monatsabschlusses
 *
 * Sie werden bewusst zusammen ausgeliefert. Wer nur eine der beiden Tabellen
 * ansieht, haelt das System fuer abrechenbar, obwohl der jeweils andere Weg
 * fail-closed blockiert — genau diese Luecke hat Migration 20260902000000
 * beschrieben.
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const orgId = auth.ctx.organizationId

  try {
    const admin = createAdminClient()
    const hinweise: string[] = []

    const [tarifeRes, preiseRes] = await Promise.all([
      admin
        .from('billing_tariffs')
        .select(
          'id, leistungsart, rechtsgrundlage, bundesland, preis_cent, einheit, verguetungsart, ' +
            'tarif_status, gueltig_ab, gueltig_bis, ist_aktiv, verifiziert_am, verifiziert_von, ' +
            'verifizierungs_quelle, beleg_id'
        )
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('rechtsgrundlage', { ascending: true })
        .order('leistungsart', { ascending: true }),
      admin
        .from('leistungspreise')
        .select(
          'id, leistungsart, bundesland, preis_cent, tarif_status, gueltig_ab, gueltig_bis, ' +
            'verifiziert_am, verifiziert_von, verifizierungs_quelle, beleg_id'
        )
        .or(`organization_id.eq.${orgId},organization_id.is.null`)
        .order('bundesland', { ascending: true })
        .order('leistungsart', { ascending: true }),
    ])

    const zeilen: UebersichtZeile[] = []

    // Fehlt die Migration 20260904000000, kennt PostgREST beleg_id nicht und
    // die ganze Abfrage schlaegt fehl. Dann ohne beleg_id nachladen: die
    // Uebersicht ist wichtiger als die Belegspalte, und der fehlende Beleg
    // wird als Hinweis ausgewiesen statt still verschwiegen.
    let tarife = (tarifeRes.data ?? []) as unknown as Record<string, unknown>[]
    if (tarifeRes.error) {
      const { data } = await admin
        .from('billing_tariffs')
        .select(
          'id, leistungsart, rechtsgrundlage, bundesland, preis_cent, einheit, verguetungsart, ' +
            'tarif_status, gueltig_ab, gueltig_bis, ist_aktiv, verifiziert_am, verifiziert_von, verifizierungs_quelle'
        )
        .eq('organization_id', orgId)
        .is('deleted_at', null)
      tarife = (data ?? []) as unknown as Record<string, unknown>[]
      hinweise.push(
        'Belegverwaltung noch nicht eingerichtet (Migration 20260904000000 nicht angewendet) — ' +
          'die Beleg-Spalte fehlt und Kassentarife können nicht freigegeben werden.'
      )
    }

    let preise = (preiseRes.data ?? []) as unknown as Record<string, unknown>[]
    if (preiseRes.error) {
      const { data } = await admin
        .from('leistungspreise')
        .select(
          'id, leistungsart, bundesland, preis_cent, tarif_status, gueltig_ab, gueltig_bis, ' +
            'verifiziert_am, verifiziert_von, verifizierungs_quelle'
        )
        .or(`organization_id.eq.${orgId},organization_id.is.null`)
      preise = (data ?? []) as unknown as Record<string, unknown>[]
    }

    for (const t of tarife) {
      const rechtsgrundlage = (t.rechtsgrundlage as string | null) ?? null
      const bewertung = bewerteAbrechenbarkeit({
        quellTabelle: 'billing_tariffs',
        tarifStatus: t.tarif_status,
        rechtsgrundlage,
      })
      zeilen.push({
        id: t.id as string,
        quellTabelle: 'billing_tariffs',
        leistungsart: (t.leistungsart as string) ?? '—',
        rechtsgrundlage,
        bundesland: (t.bundesland as string | null) ?? null,
        preisCent: Number(t.preis_cent ?? 0),
        einheit: (t.einheit as string | null) ?? (t.verguetungsart as string | null) ?? null,
        tarifStatus: normalisiereStatus(t.tarif_status),
        gueltigAb: (t.gueltig_ab as string | null) ?? null,
        gueltigBis: (t.gueltig_bis as string | null) ?? null,
        istAktiv: t.ist_aktiv !== false,
        verifiziertAm: (t.verifiziert_am as string | null) ?? null,
        verifiziertVon: (t.verifiziert_von as string | null) ?? null,
        verifizierungsQuelle: (t.verifizierungs_quelle as string | null) ?? null,
        belegId: (t.beleg_id as string | null) ?? null,
        abrechenbar: bewertung.abrechenbar,
        begruendung: bewertung.begruendung,
      })
    }

    for (const p of preise) {
      const bewertung = bewerteAbrechenbarkeit({
        quellTabelle: 'leistungspreise',
        tarifStatus: p.tarif_status,
      })
      zeilen.push({
        id: p.id as string,
        quellTabelle: 'leistungspreise',
        leistungsart: (p.leistungsart as string) ?? '—',
        rechtsgrundlage: null,
        bundesland: (p.bundesland as string | null) ?? null,
        preisCent: Number(p.preis_cent ?? 0),
        einheit: null,
        tarifStatus: normalisiereStatus(p.tarif_status),
        gueltigAb: (p.gueltig_ab as string | null) ?? null,
        gueltigBis: (p.gueltig_bis as string | null) ?? null,
        istAktiv: true,
        verifiziertAm: (p.verifiziert_am as string | null) ?? null,
        verifiziertVon: (p.verifiziert_von as string | null) ?? null,
        verifizierungsQuelle: (p.verifizierungs_quelle as string | null) ?? null,
        belegId: (p.beleg_id as string | null) ?? null,
        abrechenbar: bewertung.abrechenbar,
        begruendung: bewertung.begruendung,
      })
    }

    const minimal = zeilen.map(z => ({
      quellTabelle: z.quellTabelle,
      tarifStatus: z.tarifStatus,
      rechtsgrundlage: z.rechtsgrundlage,
      belegId: z.belegId,
    }))

    return NextResponse.json({
      zeilen,
      kennzahlen: {
        gesamt: berechneKennzahlen(minimal),
        rechnungstarife: berechneKennzahlen(minimal.filter(z => z.quellTabelle === 'billing_tariffs')),
        leistungspreise: berechneKennzahlen(minimal.filter(z => z.quellTabelle === 'leistungspreise')),
      },
      hinweise,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
