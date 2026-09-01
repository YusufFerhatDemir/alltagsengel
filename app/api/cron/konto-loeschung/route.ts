import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { sendAccountHardDeletedEmail } from '@/lib/emails/account-deletion'
import { logger } from '@/lib/logger'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { withTracking } from '@/lib/monitoring/tracker'
import {
  fuehreKontoLoeschungAus,
  loeschStichtag,
  type LoeschClient,
  type LoeschKandidat,
  type LoeschUmgebung,
} from '@/lib/dsgvo/loeschung'

// ═══════════════════════════════════════════════════════════════════════
// CRON: ENDGUELTIGE KONTOLOESCHUNG (Art. 17 DSGVO)
// ═══════════════════════════════════════════════════════════════════════
//
// Nimmt Konten, deren Widerrufsfrist von 60 Tagen abgelaufen ist, und
// loescht sie nach dem Loeschkatalog (lib/dsgvo/loeschkatalog.ts).
//
// WARUM DIESE ROUTE EXISTIERT
// Die Loeschung lief bis Track 11 ausschliesslich ueber die Edge Function
// `account-hard-delete`, angestossen von einem pg_cron-Job. Der Job baut
// seine URL aus `current_setting('app.settings.supabase_url', true)`;
// diese GUC ist live NICHT gesetzt (nachgeprueft mit
// `npm run verify:loeschkette`). Der Aufruf ging damit gegen eine
// NULL-URL — die endgueltige Loeschung ist nie gelaufen. Hier stehen die
// Umgebungsvariablen ohnehin, der Tuersteher ist derselbe wie bei den
// acht anderen Cron-Routen, und der Ablauf ist ohne Datenbank pruefbar.
//
// STAPELGROESSE: 50 Konten je Lauf, wie bisher. Ein Konto, das blockiert
// oder scheitert, haelt die anderen nicht auf und kommt beim naechsten
// Lauf wieder dran.
//
// ANTWORT IMMER 200, auch wenn Konten blockiert sind: eine Blockade ist
// ein Betriebszustand, den ein Mensch aufloesen muss, keine Stoerung der
// Route. Vercel wuerde einen 5xx als fehlgeschlagenen Cron werten. Der
// Zustand steht im Rumpf und im Protokoll.
// ═══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const log = logger.child('cron:konto-loeschung')
const STAPELGROESSE = 50

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const admin = createAdminClient()
    const stichtag = loeschStichtag(new Date()).toISOString()

    const { data: kandidaten, error } = await admin
      .from('profiles')
      .select('id, first_name, last_name, deleted_at')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', stichtag)
      .limit(STAPELGROESSE)

    if (error) {
      log.error('Kandidaten konnten nicht geladen werden', { code: error.code, name: error.message })
      return NextResponse.json({ ok: false, grund: 'kandidaten_nicht_lesbar' }, { status: 500 })
    }

    // Mandant je Konto VOR dem Loeschen merken: organization_members
    // haengt per ON DELETE CASCADE am Konto (live geprueft, Pruefung H)
    // und ist danach weg. Ohne diesen Vorgriff traegt der
    // Protokolleintrag keinen Mandanten — und faellt ueber den
    // Spalten-Default current_org_id() in die Stamm-Organisation, weil
    // der Dienstschluessel kein auth.uid() hat (Track 6).
    const orgVonKonto = new Map<string, string>()
    const idListe = (kandidaten ?? []).map(k => k.id)
    if (idListe.length > 0) {
      const { data: mitgliedschaften, error: mitgliedschaftenFehler } = await admin
        .from('organization_members')
        .select('user_id, organization_id')
        .in('user_id', idListe)
      // Genau der Fall, den der Kommentar darueber verhindern soll: bei
      // verworfenem Fehler bleibt die Zuordnung leer, der
      // Protokolleintrag traegt keinen Mandanten und landet ueber
      // current_org_id() in der Stamm-Organisation. Der Nachweis, dass
      // ein Konto geloescht wurde, waere dann beim falschen Mandanten
      // abgelegt — und beim richtigen gar nicht.
      if (mitgliedschaftenFehler) {
        return NextResponse.json(
          {
            error: 'Mandantenzuordnung der Löschkandidaten nicht lesbar — der Lauf bricht ab, '
              + 'damit die Löschprotokolle nicht in der Stamm-Organisation landen.',
          },
          { status: 500 },
        )
      }
      for (const m of mitgliedschaften ?? []) {
        if (!orgVonKonto.has(m.user_id)) orgVonKonto.set(m.user_id, m.organization_id)
      }
    }

    const umgebung: LoeschUmgebung = {
      client: admin as unknown as LoeschClient,

      async loescheAuthKonto(userId) {
        const { error: authFehler } = await admin.auth.admin.deleteUser(userId)
        if (!authFehler) return { error: null }
        return {
          error: {
            message: authFehler.message,
            // Der GoTrue-Fehler traegt den Postgres-Code nicht als Feld;
            // ein Fremdschluesselkonflikt ist an der Meldung erkennbar.
            // Falsch positiv waere hier harmlos (Status 'blockiert' statt
            // 'fehler'), falsch negativ nicht — deshalb grosszuegig.
            code: /foreign key|violates foreign/i.test(authFehler.message) ? '23503' : undefined,
          },
        }
      },

      async holeEmail(userId) {
        const { data } = await admin.auth.admin.getUserById(userId)
        return data?.user?.email ?? null
      },

      async sendeBestaetigung(email, vorname, verbleibt) {
        await sendAccountHardDeletedEmail(email, vorname, verbleibt)
      },

      async protokolliere(ergebnis, email) {
        await admin.from('mis_audit_log').insert({
          // Ein Wert fuer alle drei Ausgaenge — der AUSGANG steht in
          // details.status. Grund: mis_audit_log.action traegt live einen
          // CHECK ueber eine feste Werteliste (nachgelesen mit
          // `npm run verify:loeschkette`, Pruefung G). Ein eigener Wert
          // fuer 'blockiert' wuerde den Insert scheitern lassen — und
          // gerade der blockierte Fall muss sichtbar bleiben.
          action: 'user_hard_delete_cron',
          actor_id: null,
          actor_role: 'system',
          target_id: ergebnis.userId,
          target_email: email,
          entity_type: 'profile',
          entity_id: ergebnis.userId,
          // Ohne Mitgliedschaft (reines Kunden- oder Engel-Konto) bleibt
          // die Stamm-Organisation — dieselbe Antwort, die
          // resolveActiveOrgId() dort gibt. Sie steht hier ausdruecklich
          // im Code, nicht als fail-open-Rueckfall der Datenbank.
          organization_id: orgVonKonto.get(ergebnis.userId) ?? DEFAULT_ORG_ID,
          details: {
            status: ergebnis.status,
            geloescht: ergebnis.geloescht,
            uebersprungen: ergebnis.uebersprungen,
            blockiert_durch: ergebnis.blockiertDurch ?? null,
            fehler: ergebnis.fehler ?? null,
          },
          ip_address: null,
          user_agent: 'cron/konto-loeschung',
        })
      },
    }

    const ergebnis = await fuehreKontoLoeschungAus(umgebung, (kandidaten ?? []) as LoeschKandidat[])

    // ── Lauf-Beleg ───────────────────────────────────────────────────
    // JEDER Lauf hinterlaesst eine Zeile, auch der mit null Kandidaten.
    //
    // WARUM: dass der Takt ueberhaupt schlaegt, war von aussen bisher
    // nicht nachweisbar. Die Kontozeilen entstehen nur, wenn es Kandidaten
    // gibt; ohne Kandidaten sieht ein stiller Ausfall genauso aus wie ein
    // erfolgreicher Lauf — und genau das war der Zustand, den der
    // pg_cron-Job mit seiner NULL-URL jahrelang erzeugt hat. Ein fehlendes
    // oder abweichendes CRON_SECRET in der Produktion faellt hier ebenso
    // auf: dann kommt der Lauf nie bis hierher, und der Beleg altert.
    //
    // `npm run verify:loeschkette` liest das Alter dieser Zeile (Pruefung
    // B). Ein Fehler beim Schreiben bricht den Lauf NICHT ab — geloescht
    // ist geloescht, und ein fehlender Beleg ist der harmlosere Ausgang
    // als eine abgebrochene Loeschung.
    const { error: belegFehler } = await admin.from('mis_audit_log').insert({
      action: 'user_hard_delete_cron',
      actor_id: null,
      actor_role: 'system',
      target_id: null,
      target_email: null,
      entity_type: 'cron_lauf',
      entity_id: null,
      organization_id: DEFAULT_ORG_ID,
      details: {
        status: 'lauf',
        stichtag,
        gepruefte: ergebnis.gepruefte,
        geloescht: ergebnis.geloescht,
        blockiert: ergebnis.blockiert,
        fehler: ergebnis.fehler,
      },
      ip_address: null,
      user_agent: 'cron/konto-loeschung',
    })
    if (belegFehler) {
      log.error('Lauf-Beleg nicht geschrieben', { code: belegFehler.code, name: belegFehler.message })
    }

    if (ergebnis.blockiert > 0 || ergebnis.fehler > 0) {
      log.error('Kontoloeschung unvollstaendig', {
        blockiert: ergebnis.blockiert,
        fehler: ergebnis.fehler,
      })
    }

    return NextResponse.json({
      ok: true,
      stichtag,
      gepruefte: ergebnis.gepruefte,
      geloescht: ergebnis.geloescht,
      blockiert: ergebnis.blockiert,
      fehler: ergebnis.fehler,
      konten: ergebnis.konten,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
