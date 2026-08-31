#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * RLS-VOLLMATRIX — jede Rolle gegen jede Tabelle mit Bestand
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Gebaut, um NACH dem Anwenden der offenen Migrationen sofort laufen zu
 * koennen und in einem Lauf zu beantworten: haelt die Mandantengrenze,
 * sieht `anon` irgendwo etwas, und laesst sich eine fremde Zeile ueber
 * ihre Kennung ziehen.
 *
 * ── WAS HIER PASS UND WAS FAIL IST ────────────────────────────────────
 *
 * Nicht jede Messung ist eine Pruefung. Drei Aussagen sind HART — eine
 * Verletzung ist ein Befund, unabhaengig von jeder Fachentscheidung:
 *
 *   A) `anon` sieht auf KEINER Tabelle eine Zeile.
 *   B) Keine Rolle sieht eine Zeile eines FREMDEN Mandanten.
 *   C) Keine Rolle zieht eine fremde Zeile ueber ihre Kennung (IDOR).
 *
 * Die vierte Messung — wer sieht im EIGENEN Mandanten wie viel — ist
 * dagegen eine Fachentscheidung. Sie wird ausgewiesen, aber nur dort als
 * PASS/FAIL gewertet, wo eine Entscheidung DECLARIERT ist
 * (`lib/auth/rls-lesepolicies.ts`). Ueberall sonst steht sie als Zahl da.
 * Eine Zahl zu einer Bewertung zu erklaeren, fuer die es keine Vorgabe
 * gibt, waere erfundene Strenge.
 *
 * ── WARUM LEERE TABELLEN NICHT BESTEHEN ───────────────────────────────
 *
 * Live haben 87 von 325 Tabellen ueberhaupt Zeilen. Auf einer leeren
 * Tabelle liefert JEDE Rolle 0 — auch eine ohne jede Policy. Solche
 * Tabellen als „bestanden" zu zaehlen wuerde die Statistik auffuellen und
 * genau das verbergen, was sie messen soll. Sie erscheinen deshalb als
 * NICHT MESSBAR und gehen in keine PASS-Quote ein.
 *
 * Dasselbe gilt fuer die Mandantengrenze: sie ist nur dort messbar, wo
 * ueberhaupt Zeilen in mehr als einer Organisation liegen — live sind das
 * 5 Tabellen. „289 Tabellen mandantengetrennt geprueft" waere eine
 * Falschaussage; geprueft sind 5, der Rest ist unbelegt.
 *
 * ── DIE ROLLE `office` GIBT ES NICHT ──────────────────────────────────
 *
 * Der CHECK auf `profiles.role` kennt: kunde, engel, fahrer, angehoerige,
 * pdl, qm, buchhaltung, admin, superadmin. Ein `office`/`buero` ist
 * ausdruecklich KEINE Rolle — `buero` stand nur in `is_internal_staff()`
 * und wird mit Migration 20261021000004 auch dort entfernt. Geprueft
 * werden deshalb die neun echten Rollen plus `anon`; die Verwaltungssicht,
 * die man mit „office" meint, ist `buchhaltung` bzw. `qm`.
 *
 * ── WIE IMPERSONIERT WIRD ─────────────────────────────────────────────
 *
 * Wie in scripts/audit-rls-rollen.mjs und verify-rls-lesepolicies.mjs:
 *
 *     SET LOCAL ROLE authenticated;
 *     SELECT set_config('request.jwt.claims', '{"sub":"…"}', true);
 *
 * Das ist derselbe Weg, den PostgREST geht — `auth.uid()` liest genau
 * diesen GUC. Ein Ergebnis hier beweist also eine SERVERSEITIGE Sperre und
 * nicht einen ausgegrauten Knopf.
 *
 * Live gibt es kein Konto mit pdl/qm/buchhaltung. Das Skript setzt einem
 * echten Konto die zu pruefende Rolle INNERHALB der Transaktion. Alles
 * laeuft im Lese-Orakel `public._run_sql`, dessen Block IMMER mit
 * RAISE EXCEPTION endet: die Transaktion rollt in jedem Fall zurueck, die
 * Rollenaenderung eingeschlossen. Es bleibt nichts stehen.
 *
 * ── PRUEFUNG A LAEUFT NICHT UEBER DAS ORAKEL ──────────────────────────
 *
 * `anon` wird von AUSSEN geprueft, mit echten HTTPS-Aufrufen und dem
 * oeffentlichen Schluessel — also auf demselben Weg, den ein Fremder
 * nehmen wuerde. Eine Messung im Orakel wuerde die Rolle nur nachstellen;
 * hier wird sie benutzt.
 *
 * Aufruf:  npm run verify:rls-matrix
 *          npm run verify:rls-matrix -- --json
 * Exit 0 = kein harter Befund, 1 = mindestens einer, 2 = nichts geprueft.
 */

import { apiHeaders, envWert, publishableKey, secretKey } from './lib/supabase-keys.mjs'
import { RLS_LESEPOLICIES, rollenMitLeserecht } from '../lib/auth/rls-lesepolicies.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const OEFFENTLICH = publishableKey()

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const alsJson = process.argv.includes('--json')

/** Die neun Rollen aus dem CHECK auf profiles.role. `anon` laeuft getrennt. */
const ROLLEN = [
  'kunde', 'angehoerige', 'engel', 'fahrer',
  'buchhaltung', 'qm', 'pdl', 'admin', 'superadmin',
]

const FELD = '<<|>>'
const SATZ = '<<||>>'

/**
 * Tabellen, die `anon` AUSDRUECKLICH lesen darf — mit Begruendung.
 *
 * Wie `NICHT_AUTOMATISCH` im Aufbewahrungskatalog: „ist in Ordnung" soll
 * eine hinterlegte Entscheidung sein und kein stilles Weglassen. Ein
 * Eintrag hier verlangt drei Dinge, alle live nachgeprueft:
 *
 *   1. Die Tabelle fuehrt KEINE Personendaten.
 *   2. Es gibt eine ausdrueckliche Policy `… TO anon` — die Lesbarkeit ist
 *      also gewollt und nicht die Folge einer fehlenden Policy.
 *   3. Die oeffentliche Seite braucht sie ohne Anmeldung.
 *
 * Fehlt eine der drei, gehoert die Tabelle nicht in diese Liste.
 */
const OEFFENTLICH_ERLAUBT = [
  {
    tabelle: 'bundeslaender',
    begruendung:
      'Die 16 Bundeslaender mit ISO-Code und Sortierung (code, bezeichnung, iso_code, sort_order). '
      + 'Keine Personendaten. Policy bundeslaender_read/SELECT/anon ist ausdruecklich gesetzt. '
      + 'Die oeffentliche Seite braucht die Liste fuer die Bundesland-Auswahl vor jeder Anmeldung.',
  },
  {
    tabelle: 'plz_bundesland_regeln',
    begruendung:
      '215 Zuordnungen PLZ-Praefix → Bundesland (praefix, bundesland, sicher). Keine Personendaten. '
      + 'Policy plz_regeln_read/SELECT/anon ist ausdruecklich gesetzt. Traegt das Hessen-Gating der '
      + 'oeffentlichen Kassenabrechnung, das vor der Anmeldung greifen muss.',
  },
]
const istOeffentlichErlaubt = (t) => OEFFENTLICH_ERLAUBT.some(e => e.tabelle === t)

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
  if (i === -1) return { fehler: `HTTP ${res.status} ${msg.slice(0, 400)}` }
  return { text: msg.slice(i + 7).replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}

const q = (rumpf) => `DO $ora$ DECLARE r text; BEGIN ${rumpf} RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`

const befunde = []
const befund = (schwere, id, text) => befunde.push({ schwere, id, text })

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' RLS-VOLLMATRIX — jede Rolle gegen jede Tabelle mit Bestand')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════\n')

// ── Vorlauf: was ist ueberhaupt messbar? ──────────────────────────────
const vorlauf = await orakel(q(`
  DECLARE t record; n bigint; o int; mitBestand text := ''; mehrOrg text := '';
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', t.tablename) INTO n;
      IF n > 0 THEN
        mitBestand := mitBestand || t.tablename || '${FELD}' || n || '${SATZ}';
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=t.tablename
                      AND column_name='organization_id') THEN
          EXECUTE format('SELECT count(DISTINCT organization_id) FROM public.%I', t.tablename) INTO o;
          IF o > 1 THEN mehrOrg := mehrOrg || t.tablename || '${SATZ}'; END IF;
        END IF;
      END IF;
    END LOOP;
    r := mitBestand || '<<|SPLIT|>>' || mehrOrg
      || '<<|SPLIT|>>' || (SELECT id::text FROM public.profiles
                            WHERE role='kunde' AND deleted_at IS NULL ORDER BY id LIMIT 1)
      || '<<|SPLIT|>>' || (SELECT count(*)::text FROM public.organizations)
      || '<<|SPLIT|>>' || (SELECT count(*)::text FROM pg_tables WHERE schemaname='public');
  END;`))

if (vorlauf.fehler) { console.error('Vorlauf fehlgeschlagen: ' + vorlauf.fehler); process.exit(2) }

const [rohBestand, rohMehrOrg, TESTKONTO, ORG_ANZAHL, TAB_GESAMT] = vorlauf.text.split('<<|SPLIT|>>')
if (!TESTKONTO) { console.error('Kein Testkonto gefunden — nichts geprueft.'); process.exit(2) }

const MIT_BESTAND = rohBestand.split(SATZ).filter(Boolean).map(z => {
  const [tabelle, zeilen] = z.split(FELD)
  return { tabelle, zeilen: Number(zeilen) }
})
const MEHR_ORG = rohMehrOrg.split(SATZ).filter(Boolean)

console.log(`Tabellen gesamt                      ${TAB_GESAMT}`)
console.log(`davon mit Bestand (messbar)          ${MIT_BESTAND.length}`)
console.log(`davon leer (NICHT messbar)           ${Number(TAB_GESAMT) - MIT_BESTAND.length}`)
console.log(`Organisationen                       ${ORG_ANZAHL}`)
console.log(`Tabellen mit Zeilen in >1 Mandant    ${MEHR_ORG.length}  ${MEHR_ORG.join(', ')}`)
console.log(`Testkonto (Rolle nur in der Transaktion) ${TESTKONTO}\n`)

const tabellenListe = MIT_BESTAND.map(t => `'${t.tabelle}'`).join(',')
const ergebnis = { anon: {}, rollen: {}, mandant: {}, idor: {}, anonSchreiben: [] }

// ══════════════════════════════════════════════════════════════════════
// A) anon von AUSSEN — echte HTTPS-Aufrufe mit dem oeffentlichen Schluessel
// ══════════════════════════════════════════════════════════════════════
console.log('── A) anon, von aussen ueber die echte REST-Schnittstelle ──────────')

if (!OEFFENTLICH) {
  console.log('   UEBERSPRUNGEN: kein oeffentlicher Schluessel gesetzt.')
  befund('MITTEL', 'A-0',
    'Ohne NEXT_PUBLIC_SUPABASE_ANON_KEY/PUBLISHABLE_KEY wurde die anon-Sicht NICHT '
    + 'geprueft. Dieser Lauf ist fuer Pruefung A kein Nachweis.')
} else {
  let anonOffen = 0
  let anonErklaert = 0
  for (const { tabelle } of MIT_BESTAND) {
    // 206 = Erfolg mit Teilbereich, 200 [] ist mehrdeutig — deshalb wird die
    // ZEILENZAHL ausgewertet und nicht der Statuscode (Projekt-Memory:
    // „PostgREST-Audit-Methodik").
    const r = await fetch(`${URL_BASIS}/rest/v1/${tabelle}?select=*&limit=1`, {
      headers: apiHeaders(OEFFENTLICH, { Prefer: 'count=exact' }),
    })
    let zeilen = 0
    if (r.ok) {
      try { zeilen = (await r.json()).length } catch { zeilen = 0 }
    }
    const erlaubt = istOeffentlichErlaubt(tabelle)
    const verdikt = zeilen === 0 ? 'PASS' : (erlaubt ? 'PASS (erklaert oeffentlich)' : 'FAIL')
    ergebnis.anon[tabelle] = { status: r.status, zeilen, erlaubt, verdikt }
    if (zeilen > 0 && !erlaubt) {
      anonOffen++
      befund('HOCH', `A-${tabelle}`,
        `anon liest ${tabelle} von aussen (HTTP ${r.status}, mindestens ${zeilen} Zeile). `
        + 'Die Tabelle steht NICHT in der Erlaubnisliste — entweder fehlt eine Policy, oder die '
        + 'Oeffentlichkeit ist gewollt und gehoert dann mit Begruendung in OEFFENTLICH_ERLAUBT.')
    } else if (zeilen > 0) {
      anonErklaert++
    }
  }
  console.log(`   ${MIT_BESTAND.length - anonOffen - anonErklaert}/${MIT_BESTAND.length} Tabellen liefern anon 0 Zeilen`)
  console.log(`   ${anonErklaert} ausdruecklich oeffentlich (Nachschlagedaten ohne Personenbezug)`)
  for (const e of OEFFENTLICH_ERLAUBT) console.log(`     · ${e.tabelle}: ${e.begruendung}`)
  if (anonOffen > 0) console.log(`   ${anonOffen} NICHT ERKLAERT — siehe Befunde`)
}
console.log()

// ══════════════════════════════════════════════════════════════════════
// B) anon-Schreibrechte — has_table_privilege, NICHT information_schema
// ══════════════════════════════════════════════════════════════════════
console.log('── B) Schreibrechte von anon ───────────────────────────────────────')
// information_schema verschweigt PUBLIC-Grants und meldete hier schon einmal
// alles als dicht (Projekt-Memory: „information_schema luegt bei Rechten").
const schreib = await orakel(q(`
  DECLARE t record; s text := '';
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
      IF has_table_privilege('anon', format('public.%I', t.tablename), 'INSERT')
         OR has_table_privilege('anon', format('public.%I', t.tablename), 'UPDATE')
         OR has_table_privilege('anon', format('public.%I', t.tablename), 'DELETE') THEN
        s := s || t.tablename || '${SATZ}';
      END IF;
    END LOOP;
    r := s;
  END;`))
if (schreib.fehler) {
  console.log(`   FEHLER: ${schreib.fehler}`)
} else {
  const offen = schreib.text.split(SATZ).filter(Boolean)
  ergebnis.anonSchreiben = offen
  if (offen.length === 0) {
    console.log(`   PASS — anon hat auf keiner der ${TAB_GESAMT} Tabellen INSERT/UPDATE/DELETE`)
  } else {
    console.log(`   FAIL — ${offen.length} Tabellen mit Schreibrecht fuer anon`)
    befund('HOCH', 'B-1', `anon hat Schreibrechte auf: ${offen.join(', ')}`)
  }
}
console.log()

// ══════════════════════════════════════════════════════════════════════
// C) Lesematrix + D) Mandantengrenze — je Rolle EIN Orakel-Aufruf
// ══════════════════════════════════════════════════════════════════════
console.log('── C) Lesematrix und D) Mandantengrenze je Rolle ───────────────────')

for (const rolle of ROLLEN) {
  const res = await orakel(q(`
    DECLARE t record; n bigint; fremd bigint; global bigint; eigene uuid; s text := ''; vorher text;
    BEGIN
      vorher := current_user;
      -- Erst die Anspruchsdaten LEEREN, dann die Rolle setzen.
      -- trg_prevent_role_escalation weist die Selbstbefoerderung sonst ab
      -- („Rollenwechsel nicht erlaubt"): der Trigger prueft den Aufrufer
      -- ueber auth.uid(), und auth.uid() liest genau diesen GUC. Ohne diese
      -- Zeile war nur "kunde" messbar — weil das die Rolle ist, die das
      -- Testkonto ohnehin traegt, der UPDATE dort also nichts aenderte.
      PERFORM set_config('request.jwt.claims', '', true);
      UPDATE public.profiles SET role = '${rolle}' WHERE id = '${TESTKONTO}'::uuid;
      PERFORM set_config('request.jwt.claims', '{"sub":"${TESTKONTO}","role":"authenticated"}', true);
      SET LOCAL ROLE authenticated;

      BEGIN eigene := public.current_org_id(); EXCEPTION WHEN OTHERS THEN eigene := NULL; END;

      FOR t IN SELECT unnest(ARRAY[${tabellenListe}]) AS tabelle LOOP
        -- n = -1 bedeutet: die Zaehlung warf. Das hat ZWEI sehr
        -- verschiedene Ursachen, und sie duerfen nicht zusammenfallen:
        --   -1 mit entzogenem SELECT  = die Tabelle ist auf RECHTEEBENE zu.
        --                               Das ist STAERKER als RLS, nicht
        --                               schwaecher — ein PASS.
        --   -1 mit vorhandenem SELECT = etwas anderes ging schief; die
        --                               Tabelle ist in dieser Rolle
        --                               tatsaechlich UNGEPRUEFT.
        BEGIN
          EXECUTE format('SELECT count(*) FROM public.%I', t.tabelle) INTO n;
        EXCEPTION WHEN OTHERS THEN
          IF has_table_privilege('authenticated', format('public.%I', t.tabelle), 'SELECT')
          THEN n := -1; ELSE n := -2; END IF;
        END;

        -- FREMD und GLOBAL sind zwei verschiedene Dinge.
        --
        -- "organization_id IS NULL" heisst NICHT „gehoert einem anderen
        -- Mandanten", sondern „gehoert keinem" — eine mandantenuebergreifende
        -- Nachschlagezeile. Ein erster Entwurf pruefte
        -- "IS DISTINCT FROM eigene", und weil NULL davon erfasst wird,
        -- meldete er billing_landesregeln (1 Zeile, organization_id NULL)
        -- als Mandantenleck. Das war ein Fehler DES PRUEFERS: die Zeile
        -- gehoert keinem fremden Mandanten, sie ist global.
        --
        -- Beide Zahlen werden getrennt gefuehrt: "fremd" ist der Befund,
        -- "global" nur eine Beobachtung.
        fremd := -1; global := -1;
        IF eigene IS NOT NULL AND EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name=t.tabelle
                AND column_name='organization_id') THEN
          BEGIN
            EXECUTE format(
              'SELECT count(*) FROM public.%I WHERE organization_id IS NOT NULL AND organization_id <> %L',
              t.tabelle, eigene) INTO fremd;
            EXECUTE format(
              'SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t.tabelle) INTO global;
          EXCEPTION WHEN OTHERS THEN fremd := -1; global := -1; END;
        END IF;

        s := s || t.tabelle || '${FELD}' || n || '${FELD}' || fremd || '${FELD}' || global || '${SATZ}';
      END LOOP;

      EXECUTE format('SET LOCAL ROLE %I', vorher);
      r := coalesce(eigene::text, 'KEINE') || '<<|SPLIT|>>' || s;
    END;`))

  if (res.fehler) {
    console.log(`   ${rolle.padEnd(12)} FEHLER: ${res.fehler}`)
    befund('MITTEL', `C-${rolle}`, `Rolle ${rolle} konnte nicht gemessen werden: ${res.fehler}`)
    continue
  }

  const [eigeneOrg, roh] = res.text.split('<<|SPLIT|>>')
  const zeilen = roh.split(SATZ).filter(Boolean).map(z => {
    const [tabelle, sichtbar, fremd, global] = z.split(FELD)
    return { tabelle, sichtbar: Number(sichtbar), fremd: Number(fremd), global: Number(global) }
  })

  ergebnis.rollen[rolle] = { eigeneOrg, tabellen: zeilen }

  const sieht = zeilen.filter(z => z.sichtbar > 0).length
  const gesperrt = zeilen.filter(z => z.sichtbar === 0).length
  const fehler = zeilen.filter(z => z.sichtbar === -1).length
  const entzogen = zeilen.filter(z => z.sichtbar === -2).map(z => z.tabelle)

  // ── D) Mandantengrenze: die HARTE Aussage ──
  const lecks = zeilen.filter(z => z.fremd > 0)
  for (const l of lecks) {
    befund('HOCH', `D-${rolle}-${l.tabelle}`,
      `Rolle ${rolle} sieht in ${l.tabelle} ${l.fremd} Zeile(n) eines FREMDEN Mandanten `
      + `(eigener Mandant: ${eigeneOrg}). Die Mandantengrenze haelt dort nicht.`)
  }
  ergebnis.mandant[rolle] = { eigeneOrg, lecks: lecks.map(l => ({ tabelle: l.tabelle, fremd: l.fremd })) }

  // Eine Tabelle, deren Zaehlung wirft, ist NICHT geprueft. Nur die Anzahl
  // auszuweisen wuerde sie verschwinden lassen — der Name gehoert dazu,
  // sonst steht im Bericht eine Luecke, die niemand nachschlagen kann.
  const fehlerTabellen = zeilen.filter(z => z.sichtbar === -1).map(z => z.tabelle)
  if (fehlerTabellen.length > 0) {
    befund('NIEDRIG', `C-fehler-${rolle}`,
      `Rolle ${rolle}: ${fehlerTabellen.length} Tabelle(n) nicht messbar (Zaehlung warf): `
      + `${fehlerTabellen.join(', ')}. Diese Tabellen sind in dieser Rolle UNGEPRUEFT.`)
  }
  const globale = zeilen.filter(z => z.global > 0).length
  const marke = lecks.length === 0 ? 'PASS' : `FAIL (${lecks.length})`
  console.log(
    `   ${rolle.padEnd(12)} sieht ${String(sieht).padStart(3)} · gesperrt ${String(gesperrt).padStart(3)}`
    + `${entzogen.length ? ` · Recht entzogen ${entzogen.length}` : ''}`
    + `${fehler ? ` · UNGEPRUEFT ${fehler} (${fehlerTabellen.join(',')})` : ''}   Mandantengrenze: ${marke}`
    + `${globale ? `   (${globale} Tab. mit globalen Zeilen, org=NULL)` : ''}`)
}
console.log()
console.log('   „Recht entzogen" = SELECT ist authenticated gar nicht gewaehrt (staerker als RLS).')
console.log('   „UNGEPRUEFT" = die Zaehlung warf, obwohl SELECT vorhanden ist — echte Luecke.')
console.log()

// ══════════════════════════════════════════════════════════════════════
// E) IDOR — eine FREMDE Zeile ueber ihre Kennung ziehen
// ══════════════════════════════════════════════════════════════════════
console.log('── E) IDOR: fremde Zeile ueber ihre Kennung ────────────────────────')

if (MEHR_ORG.length === 0) {
  console.log('   NICHT MESSBAR: keine Tabelle hat Zeilen in mehr als einer Organisation.')
} else {
  for (const tabelle of MEHR_ORG) {
    // Eine Zeile, die NICHT im Mandanten des Testkontos liegt.
    const ziel = await orakel(q(`
      DECLARE eigene uuid; k text;
      BEGIN
        -- "profiles" hat KEINE Spalte organization_id (Projekt-Memory).
        -- Ein erster Entwurf las sie dort und lief in eine Ausnahme, die
        -- als „keine fremde Zeile gefunden" erschien — Pruefung E haette
        -- damit dauerhaft still nichts geprueft.
        --
        -- Der Mandant des Testkontos steht in organization_members; ist er
        -- dort nicht, faellt current_org_id() auf die Stamm-Organisation
        -- zurueck (fail-open, ebenfalls dokumentiert).
        SELECT organization_id INTO eigene
          FROM public.organization_members WHERE user_id='${TESTKONTO}'::uuid LIMIT 1;
        IF eigene IS NULL THEN
          SELECT id INTO eigene FROM public.organizations ORDER BY created_at LIMIT 1;
        END IF;
        EXECUTE format(
          'SELECT id::text FROM public.%I WHERE organization_id IS NOT NULL '
          || 'AND organization_id <> %L LIMIT 1', '${tabelle}', eigene) INTO k;
        r := coalesce(k, 'KEINE');
      END;`))

    if (ziel.fehler || ziel.text === 'KEINE') {
      console.log(`   ${tabelle.padEnd(24)} keine fremde Zeile gefunden — nicht messbar`)
      continue
    }
    const fremdeId = ziel.text.trim()

    // E1 — von aussen als anon
    let anonTreffer = 0
    if (OEFFENTLICH) {
      const r = await fetch(`${URL_BASIS}/rest/v1/${tabelle}?id=eq.${fremdeId}&select=id`, {
        headers: apiHeaders(OEFFENTLICH),
      })
      if (r.ok) { try { anonTreffer = (await r.json()).length } catch { anonTreffer = 0 } }
    }

    // E2 — unter jeder Rolle
    const treffer = []
    for (const rolle of ROLLEN) {
      const res = await orakel(q(`
        DECLARE n bigint; vorher text;
        BEGIN
          vorher := current_user;
          PERFORM set_config('request.jwt.claims', '', true);
          UPDATE public.profiles SET role='${rolle}' WHERE id='${TESTKONTO}'::uuid;
          PERFORM set_config('request.jwt.claims', '{"sub":"${TESTKONTO}","role":"authenticated"}', true);
          SET LOCAL ROLE authenticated;
          BEGIN
            EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', '${tabelle}', '${fremdeId}') INTO n;
          EXCEPTION WHEN OTHERS THEN n := -1; END;
          EXECUTE format('SET LOCAL ROLE %I', vorher);
          r := n::text;
        END;`))
      const n = res.fehler ? -1 : Number(res.text.trim())
      if (n > 0) treffer.push(rolle)
    }

    ergebnis.idor[tabelle] = { fremdeId, anonTreffer, rollenMitTreffer: treffer }

    const ok = anonTreffer === 0 && treffer.length === 0
    console.log(`   ${tabelle.padEnd(24)} ${ok ? 'PASS' : 'FAIL'}  (anon ${anonTreffer}, Rollen: ${treffer.join(',') || 'keine'})`)
    if (anonTreffer > 0) {
      befund('HOCH', `E-anon-${tabelle}`,
        `anon zieht die fremde Zeile ${fremdeId} aus ${tabelle} ueber ihre Kennung.`)
    }
    for (const rolle of treffer) {
      befund('HOCH', `E-${rolle}-${tabelle}`,
        `Rolle ${rolle} zieht die fremde Zeile ${fremdeId} aus ${tabelle} ueber ihre Kennung (IDOR).`)
    }
  }
}
console.log()

// ══════════════════════════════════════════════════════════════════════
// F) Declarierte Leseentscheidungen — nur wo es eine Vorgabe GIBT
// ══════════════════════════════════════════════════════════════════════
console.log('── F) Declarierte Lesepolicies (lib/auth/rls-lesepolicies.ts) ──────')
let fPass = 0, fFail = 0, fLeer = 0
for (const p of RLS_LESEPOLICIES) {
  const bestand = MIT_BESTAND.find(t => t.tabelle === p.tabelle)
  if (!bestand) { fLeer++; continue }
  const berechtigt = rollenMitLeserecht(p.recht)
  for (const rolle of ROLLEN) {
    const mess = ergebnis.rollen[rolle]?.tabellen.find(t => t.tabelle === p.tabelle)
    if (!mess || mess.sichtbar < 0) continue // -1 ungeprueft, -2 Recht entzogen
    const sollSehen = berechtigt.includes(rolle)
    const siehtWas = mess.sichtbar > 0
    if (sollSehen && !siehtWas) {
      fFail++
      befund('MITTEL', `F-${rolle}-${p.tabelle}`,
        `${rolle} hat ${p.recht} und sieht in ${p.tabelle} dennoch 0 von ${bestand.zeilen} Zeilen. `
        + 'Entweder fehlt die Lesepolicy live (Migration 20261022000000) oder sie greift nicht.')
    } else if (!sollSehen && siehtWas) {
      fFail++
      befund('HOCH', `F-${rolle}-${p.tabelle}`,
        `${rolle} hat ${p.recht} NICHT, sieht in ${p.tabelle} aber ${mess.sichtbar} Zeile(n).`)
    } else {
      fPass++
    }
  }
}
console.log(`   ${fPass} Paare wie vorgesehen · ${fFail} abweichend · ${fLeer} Tabellen leer (nicht messbar)`)
console.log()

// ══════════════════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════════')
const hart = befunde.filter(b => b.schwere === 'HOCH')
if (befunde.length === 0) {
  console.log(' KEIN BEFUND.')
} else {
  console.log(` ${befunde.length} BEFUND(E), davon ${hart.length} HOCH:\n`)
  for (const b of befunde) console.log(`  [${b.schwere}] ${b.id}\n      ${b.text}`)
}
console.log('═══════════════════════════════════════════════════════════════════')

if (alsJson) {
  console.log('\n' + JSON.stringify({ erzeugt: new Date().toISOString(), ergebnis, befunde }, null, 2))
}

process.exit(hart.length > 0 ? 1 : 0)
