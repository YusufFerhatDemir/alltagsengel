/**
 * Feuert der Riegel auch beim EINFUEGEN?
 *
 * ── WARUM ES DIESEN LAUF GIBT ──────────────────────────────────────────
 * Ein Riegel besteht aus zwei Teilen: dem Funktionsrumpf UND der
 * Verdrahtung. `pg_proc.prosrc` zeigt nur den ersten. Beide P1-Befunde
 * vom 31.08.2026 sahen im Rumpf vollstaendig aus und waren es auch — sie
 * hingen nur an `BEFORE UPDATE`:
 *
 *   U11  trg_compute_signature_hash auf service_records
 *   R1   alle drei Riegel auf invoices
 *
 * Ein Audit, das Funktionen liest, findet so etwas nie. Dieser Lauf
 * fragt deshalb zweierlei, und beides gegen die echte Datenbank:
 *
 *   TEIL A  Wie ist verdrahtet? (pg_get_triggerdef, kein Schreibvorgang)
 *   TEIL B  Was passiert wirklich? (INSERT in einer Transaktion, die
 *           zurueckrollt)
 *
 * Teil B ist der eigentliche Nachweis. Teil A allein wuerde nur
 * behaupten; und umgekehrt sagt ein abgewiesener INSERT nicht, WARUM er
 * abgewiesen wurde — bei `state_settings` und `billing_tariffs` war es
 * gar nicht der Trigger, sondern ein CHECK bzw. die Belegpflicht. Beides
 * zaehlt, aber es soll dastehen, welches greift.
 *
 * ── DIESER LAUF SCHREIBT NICHTS ────────────────────────────────────────
 * Teil B laeuft in einem DO-Block, der am Ende ausdruecklich wirft. Damit
 * rollt die gesamte Transaktion zurueck — auch der Pruefklient. Am Ende
 * steht eine Gegenprobe, die das nachmisst statt es zu behaupten.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const ORG = '00000000-0000-4000-8000-000460629986'

async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`HTTP ${res.status}: ${msg.slice(0, 500)}`)
  return msg.slice(i + 7).replace(/\\n/g, '\n')
}

const ergebnisse = []
function pruefe(id, titel, bestanden, text) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  for (const z of String(text).split('\n')) console.log(`  ${z}`)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' TRIGGER-EINGANG — feuert der Riegel auch beim EINFUEGEN?')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

// ═══ TEIL A — Verdrahtung, lesend ══════════════════════════════════════
//
// Die vier Riegel, bei denen INSERT nachweislich eine Rolle spielt. Die
// Liste ist bewusst kurz und benannt: ein Lauf, der alle 90 UPDATE-only-
// Trigger meldet, ertrinkt in `set_updated_at`-Helfern, bei denen
// UPDATE-only genau richtig ist.
const VERDRAHTUNG = [
  { tabelle: 'service_records', trigger: 'trg_compute_signature_hash',
    befund: 'U11', was: 'Unterschriftssiegel' },
  { tabelle: 'invoices', trigger: 'trg_a_invoice_eingangsstatus',
    befund: 'R1', was: 'Eingangsstatus der Rechnung', nurInsert: true },
  { tabelle: 'abrechnungslaeufe', trigger: 'trg_a_lauf_eingangsstatus',
    befund: 'R2', was: 'Eingangsstatus des Abrechnungslaufs', nurInsert: true },
  { tabelle: 'client_vpkzp_usage', trigger: 'trg_vpkzp_usage_abgeleitet',
    befund: 'R3', was: 'VP/KZP-Verbrauch ist abgeleitet' },
]

const ausdruck = VERDRAHTUNG
  .map((e, i) => `'${i}=' || coalesce((SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
        WHERE t.tgrelid='public.${e.tabelle}'::regclass AND t.tgname='${e.trigger}'
          AND NOT t.tgisinternal), 'FEHLT')`)
  .join(` || '<<|>>' || `)

const roh = await orakel(
  `DO $ora$ DECLARE r text; BEGIN SELECT ${ausdruck} INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
)
const defs = Object.fromEntries(roh.split('<<|>>').map(s => {
  const k = s.indexOf('=')
  return [Number(s.slice(0, k)), s.slice(k + 1)]
}))

console.log('\n── TEIL A: Verdrahtung (lesend) ──────────────────────────────────')
for (const [i, e] of VERDRAHTUNG.entries()) {
  const def = defs[i] ?? 'FEHLT'
  const greift = e.nurInsert
    ? /BEFORE INSERT/.test(def) && !/UPDATE/.test(def)
    : /BEFORE INSERT OR UPDATE/.test(def)
  pruefe(`A${i + 1}`, `${e.tabelle}.${e.trigger} — ${e.was} (Befund ${e.befund})`,
    greift,
    def === 'FEHLT'
      ? `Trigger existiert nicht. Migration nicht angewendet.`
      : `${def}\n⇒ ${greift ? 'deckt das Einfuegen ab' : 'deckt das Einfuegen NICHT ab'}`)
}

// ═══ TEIL B — was wirklich passiert, schreibend und zurueckrollend ═════
//
// Fuenf INSERTs, jeder in seinem eigenen BEGIN/EXCEPTION-Block, damit ein
// abgewiesener den naechsten nicht mitreisst. Am Ende wirft der Block und
// die ganze Transaktion rollt zurueck.
const teilB = await orakel(`DO $probe$
DECLARE
  b text := '';
  v_klient uuid;
  v_kennung text := 'PRUEF-EINGANG-' || substr(md5(clock_timestamp()::text), 1, 8);
BEGIN
  INSERT INTO public.clients (customer_number, first_name, last_name, organization_id)
  VALUES (v_kennung, 'Pruefung', v_kennung, '${ORG}') RETURNING id INTO v_klient;

  BEGIN
    INSERT INTO public.invoices (organization_id, client_id, invoice_number, status,
                                 total_amount, period_start, period_end)
    VALUES ('${ORG}', v_klient, v_kennung || '-RE', 'bezahlt', 50.00,
            CURRENT_DATE - 30, CURRENT_DATE - 1);
    b := b || 'B1|DURCHGELASSEN' || chr(10);
  EXCEPTION WHEN OTHERS THEN b := b || 'B1|abgewiesen: ' || SQLERRM || chr(10); END;

  BEGIN
    INSERT INTO public.abrechnungslaeufe (organization_id, status, abrechnungsmonat, kostentraeger_ik)
    VALUES ('${ORG}', 'uebermittelt', '2019-07', '999999999');
    b := b || 'B2|DURCHGELASSEN' || chr(10);
  EXCEPTION WHEN OTHERS THEN b := b || 'B2|abgewiesen: ' || SQLERRM || chr(10); END;

  BEGIN
    -- Jahre 2024/2025 und NICHT 2019: client_vpkzp_usage_calendar_year_check
    -- verlangt >= 2024. Beim ersten Entwurf dieses Laufs stand hier 2019 —
    -- der INSERT wurde abgewiesen, und B3 meldete faelschlich OK. Gefangen
    -- hat das die Gegenprobe B4, die mit demselben Jahr ebenfalls scheiterte.
    -- Ein Riegel-Nachweis, der in Wahrheit an einem CHECK haengt, ist keiner.
    -- Der Klient ist frisch angelegt, es gibt also keine Kollision mit
    -- uq_client_vpkzp_usage (organization_id, client_id, calendar_year).
    INSERT INTO public.client_vpkzp_usage (organization_id, client_id, calendar_year,
                                           vp_days_used, kzp_days_used)
    VALUES ('${ORG}', v_klient, 2025, 56, 56);
    b := b || 'B3|DURCHGELASSEN' || chr(10);
  EXCEPTION WHEN OTHERS THEN b := b || 'B3|abgewiesen: ' || SQLERRM || chr(10); END;

  -- Gegenprobe zu B3: OHNE Verbrauch muss der Jahressatz entstehen duerfen.
  -- Ohne sie waere ein Riegel, der ALLE Anlagen blockiert, ebenfalls gruen.
  BEGIN
    INSERT INTO public.client_vpkzp_usage (organization_id, client_id, calendar_year)
    VALUES ('${ORG}', v_klient, 2024);
    b := b || 'B4|DURCHGELASSEN' || chr(10);
  EXCEPTION WHEN OTHERS THEN b := b || 'B4|abgewiesen: ' || SQLERRM || chr(10); END;

  -- Noch nicht entschieden, hier nur gemessen (siehe Migration
  -- 20261023000004, Abschnitt „Warum bookings hier nicht steht").
  BEGIN
    INSERT INTO public.bookings (organization_id, status, date, time, duration_hours, service)
    VALUES ('${ORG}', 'completed', CURRENT_DATE, '09:00', 1, 'Pruefung');
    b := b || 'B5|DURCHGELASSEN' || chr(10);
  EXCEPTION WHEN OTHERS THEN b := b || 'B5|abgewiesen: ' || SQLERRM || chr(10); END;

  RAISE EXCEPTION 'ORAKEL:%', b;
END $probe$;`)

const zeilen = teilB.split('\n').map(z => z.trim()).filter(Boolean)
const holen = id => zeilen.find(z => z.startsWith(`${id}|`))?.slice(id.length + 1) ?? '(nicht gemeldet)'

console.log('\n── TEIL B: was wirklich passiert (schreibend, rollt zurueck) ─────')

pruefe('B1', 'Rechnung laesst sich nicht direkt als bezahlt anlegen',
  holen('B1').startsWith('abgewiesen'),
  `${holen('B1')}\n`
  + (holen('B1').startsWith('abgewiesen') ? ''
     : 'OFFEN: 20261023000002_rechnung_eingangsstatus.sql fehlt. Solange sie\n'
       + 'fehlt, umgeht ein INSERT die Statusmaschine UND das Kassen-\n'
       + 'Freischaltungs-Gate.'))

pruefe('B2', 'Abrechnungslauf laesst sich nicht direkt als uebermittelt anlegen',
  holen('B2').startsWith('abgewiesen'),
  `${holen('B2')}\n`
  + (holen('B2').startsWith('abgewiesen') ? ''
     : 'OFFEN: 20261023000004 fehlt. Ein Lauf koennte „uebermittelt" sein,\n'
       + 'ohne je validiert, freigegeben, exportiert oder uebertragen worden\n'
       + 'zu sein — eine Behauptung nach § 105 SGB XI ohne Vorgang.'))

pruefe('B3', 'VP/KZP-Jahressatz laesst sich nicht mit Verbrauch anlegen',
  holen('B3').startsWith('abgewiesen'),
  `${holen('B3')}\n`
  + (holen('B3').startsWith('abgewiesen') ? ''
     : 'OFFEN: 20261023000004 fehlt. Vorbelegter Verbrauch verfaelscht die\n'
       + 'Kontingente in BEIDE Richtungen — zu hoch lehnt Leistungen zu\n'
       + 'Unrecht ab, zu niedrig zeigt Budget, das es nicht gibt.'))

pruefe('B4', 'Gegenprobe: ohne Verbrauch entsteht der Jahressatz weiterhin',
  holen('B4').startsWith('DURCHGELASSEN'),
  `${holen('B4')}\n`
  + 'Ohne diese Gegenprobe waere auch ein Riegel gruen, der JEDE Anlage\n'
  + 'blockiert — und damit die Fortschreibung selbst kaputt macht.')

// B5 ist bewusst KEINE Pruefung, sondern ein Bericht: die fachliche
// Entscheidung steht aus. Als Pruefung waere er dauerhaft rot und
// wuerde den Lauf entwerten.
console.log('\n[B5] BERICHT  Buchung direkt im Endstatus anlegen')
console.log(`  ${holen('B5')}`)
console.log('  Nicht bewertet: eine nachtraeglich erfasste, bereits erfolgte Buchung')
console.log('  ist ein plausibler Vorgang — anders als ein Lauf, der ohne Uebertragung')
console.log('  „uebermittelt" ist. Ob und in welchem Status die Nacherfassung erlaubt')
console.log('  sein soll, ist eine fachliche Entscheidung.')

// ═══ Gegenprobe: ist wirklich nichts stehen geblieben? ═════════════════
const rest = await orakel(`DO $ora$ DECLARE r text; BEGIN
  SELECT (SELECT count(*) FROM public.clients WHERE customer_number LIKE 'PRUEF-EINGANG-%')::text
      || ' Klienten | '
      || (SELECT count(*) FROM public.invoices WHERE invoice_number LIKE 'PRUEF-EINGANG-%')::text
      || ' Rechnungen | '
      || (SELECT count(*) FROM public.abrechnungslaeufe WHERE kostentraeger_ik = '999999999')::text
      || ' Laeufe | '
      || (SELECT count(*) FROM public.client_vpkzp_usage WHERE client_id IN (SELECT id FROM public.clients WHERE customer_number LIKE 'PRUEF-EINGANG-%'))::text
      || ' VP/KZP-Saetze'
  INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`)

console.log('\n── Gegenprobe: was ist stehen geblieben? ─────────────────────────')
console.log(`  ${rest}`)
console.log('  (jeweils 0 erwartet — der DO-Block rollt zurueck)')

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
