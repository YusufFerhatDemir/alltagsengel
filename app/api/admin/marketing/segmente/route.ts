import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { SEGMENTE, engagementScore, engagementStufe } from '@/lib/marketing/segmente'
import { VORLAGEN } from '@/lib/marketing/vorlagen'
import { ladeMarketingKontakte } from '@/lib/marketing/empfaenger'
import { ladeEinwilligungsLage, pruefeEmpfaenger } from '@/lib/marketing/einwilligung'
import { AUSSCHLUSS_GRUENDE, type AusschlussGrund } from '@/lib/marketing/typen'
import { leseMarketingFreigabe } from '@/lib/marketing/freigabe'

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTÜBERSICHT — Katalog, Zählung und Einwilligungslage
//
// Die Antwort zeigt je Segment ZWEI Zahlen: wie viele Personen darin
// stehen, und wie viele davon angeschrieben werden dürfen. Die Differenz
// ist aufgeschlüsselt.
//
// Das ist der ganze Punkt: „312 im Segment, 0 versandfähig, davon 312 ohne
// Einwilligung" ist eine vollständige Aussage. „0 Empfänger" allein wäre
// von einem Fehler nicht zu unterscheiden — und genau so sähe eine
// unerreichbare Einwilligungstabelle aus.
//
// Die Kontakte werden EINMAL geladen und für alle Segmente
// wiederverwendet. Ein Ladevorgang je Segment wären zwanzig Läufe über
// dieselben Tabellen.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()
    const heute = new Date()

    const kontakte = await ladeMarketingKontakte(supabase, auth.ctx.organizationId)

    // Einwilligungslage je Einwilligungsart, EINMAL statt je Segment.
    const artenImKatalog = [...new Set(SEGMENTE.map((s) => s.consentTyp))]
    const lagen = new Map<string, Awaited<ReturnType<typeof ladeEinwilligungsLage>>>()
    for (const art of artenImKatalog) {
      lagen.set(
        art,
        await ladeEinwilligungsLage(
          supabase,
          auth.ctx.organizationId,
          kontakte.map((k) => k.email),
          art,
        ),
      )
    }

    const segmente = SEGMENTE.map((segment) => {
      const imSegment = kontakte.filter((k) => segment.passt(k, heute))
      const geprueft = pruefeEmpfaenger(imSegment, lagen.get(segment.consentTyp)!)

      const ausschluesse = Object.fromEntries(
        AUSSCHLUSS_GRUENDE.map((g) => [g, 0]),
      ) as Record<AusschlussGrund, number>
      let versandfaehig = 0
      for (const e of geprueft) {
        if (e.versandfaehig) versandfaehig += 1
        else ausschluesse[e.grund] += 1
      }

      return {
        key: segment.key,
        name: segment.name,
        beschreibung: segment.beschreibung,
        zielgruppe: segment.zielgruppe,
        consentTyp: segment.consentTyp,
        imSegment: imSegment.length,
        versandfaehig,
        ausschluesse,
        // Welche Vorlagen zu diesem Segment passen — die Oberfläche soll
        // keine unzulässige Kombination anbieten können.
        passendeVorlagen: VORLAGEN.filter((v) => v.consentTyp === segment.consentTyp).map((v) => ({
          templateKey: v.templateKey,
          name: v.name,
        })),
      }
    })

    // Engagement-Verteilung über alle echten Kontakte — die Kennzahl, mit
    // der sich die Reihenfolge der Ansprache begründen lässt.
    const echte = kontakte.filter((k) => !k.istTestkonto && !k.istGeloescht && k.email)
    const engagement = { hoch: 0, mittel: 0, niedrig: 0, kalt: 0 }
    for (const k of echte) engagement[engagementStufe(engagementScore(k, heute))] += 1

    return NextResponse.json({
      segmente,
      bestand: {
        kontakteGesamt: kontakte.length,
        echteKontakte: echte.length,
        testkonten: kontakte.filter((k) => k.istTestkonto).length,
        nachRolle: echte.reduce<Record<string, number>>((o, k) => {
          o[k.rolle] = (o[k.rolle] ?? 0) + 1
          return o
        }, {}),
        engagement,
      },
      freigabe: leseMarketingFreigabe(),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
