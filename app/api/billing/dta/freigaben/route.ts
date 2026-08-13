import { NextResponse } from 'next/server'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { freigabeUebersicht } from '@/lib/abrechnung/externe-freigaben'
import { sgbVKanalStatus } from '@/lib/abrechnung/sgb-v/versand'
import { kimKanalStatus } from '@/lib/kim/adapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/dta/freigaben
 *
 * Der Stand der drei extern beschaffbaren Freigaben und was jeweils noch fehlt.
 * Beantwortet die Frage "was können wir heute, und was hängt an wem?".
 *
 * Meldet ausschliesslich Ja/Nein pro Schalter — niemals Werte von Secrets.
 */
export async function GET() {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  const uebersicht = freigabeUebersicht()

  return NextResponse.json({
    ...uebersicht,
    kanaele: {
      // § 105 hängt allein am ITSG-Gate — Erzeugung und Verschlüsselung sind fertig.
      sgb_xi_105: {
        versandMoeglich: uebersicht.freigaben.find(f => f.id === 'itsg_zertifiziert')?.freigegeben ?? false,
        blocker: uebersicht.freigaben.find(f => f.id === 'itsg_zertifiziert')?.freigegeben
          ? []
          : ['Feature-Gate ITSG_ZERTIFIZIERT steht auf false'],
      },
      sgb_v_302: sgbVKanalStatus(),
      kim: kimKanalStatus(),
    },
  })
}
