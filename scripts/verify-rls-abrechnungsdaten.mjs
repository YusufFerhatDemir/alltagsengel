#!/usr/bin/env node
/**
 * Regressionswaechter: Abrechnungsdaten und Audit-Trails.
 *
 * Hintergrund (Security-Final-Audit 14.08.2026):
 * Sechs abrechnungsnahe Tabellen trugen eine Lesepolicy `USING (true)` fuer
 * `authenticated`. Der einzige Gegenhalt war der RESTRICTIVE Org-Zaun
 * `organization_id = current_org_id()`. current_org_id() faellt aber fuer
 * jeden Nutzer OHNE Zeile in organization_members auf die Stamm-Org zurueck —
 * damit lag jeder Kunde und jeder Engel innerhalb des Zauns und konnte
 * Rechnungs-Snapshots, Positionen, Korrekturen und den Audit-Trail lesen.
 *
 * Ein Einzelfix reicht hier nicht: dieselbe Kombination kann jederzeit neu
 * entstehen. Dieser Lauf prueft den Zustand als Ganzes.
 *
 * Aufruf:  node scripts/verify-rls-abrechnungsdaten.mjs
 * Exit 1, sobald eine der Regeln verletzt ist.
 *
 * Liest ausschliesslich. Keine Schreiboperationen.
 */
import fs from 'node:fs';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const env = read('.env') + '\n' + read('.env.local');
const get = (k) => process.env[k] || (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();

const URL_ = get('NEXT_PUBLIC_SUPABASE_URL');
const SR = get('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_ || !SR) {
  console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

/**
 * Tabellen, deren Inhalt personenbezogene Abrechnungs- oder Gesundheitsdaten
 * Dritter enthaelt. Fuer sie darf es KEINE Lesepolicy `USING (true)` geben.
 */
const KEIN_OFFENES_LESEN = [
  'invoice_snapshots',
  'invoice_line_snapshots',
  'invoice_corrections',
  'billing_audit_trail',
  'billing_number_sequences',
  'billing_tariffs',
];

// Bewusst NICHT in der Liste: angel_availability. Die Kundenseite liest dort
// mit User-JWT freie Termine, um die Buchung zu ermoeglichen — das ist
// Marktplatz-Funktion, kein Leck (Begruendung in Migration 20260908020000).

/**
 * Audit-Trails. Ein Protokoll, in das jeder eingeloggte Nutzer schreiben darf,
 * ist als Nachweis wertlos — `WITH CHECK (true)` ist hier immer ein Befund.
 */
const KEIN_OFFENES_SCHREIBEN = [
  'billing_audit_trail',
  'assignment_audit_log',
  'service_record_audit_log',
];

const rpc = async (fn) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    console.error(`RPC ${fn} fehlgeschlagen (${r.status}). Migration 20260419_rls_matrix_rpcs.sql ausgerollt?`);
    process.exit(2);
  }
  return r.json();
};

const policies = await rpc('audit_rls_all_policies');
const status = await rpc('audit_rls_all_status');

const istOffen = (ausdruck) => (ausdruck || '').trim() === 'true';
const istIntern = (rollen) => /service_role/.test(String(rollen || ''));

const befunde = [];

for (const t of KEIN_OFFENES_LESEN) {
  const ps = policies.filter((p) => p.tablename === t);
  if (!ps.length) {
    befunde.push(`${t}: keine Policy gefunden — Tabelle umbenannt oder entfernt?`);
    continue;
  }
  for (const p of ps) {
    if (p.permissive === 'PERMISSIVE' && ['SELECT', 'ALL'].includes(p.cmd)
        && istOffen(p.qual) && !istIntern(p.roles)) {
      befunde.push(`${t}: offene Lesepolicy "${p.policyname}" (${p.cmd}, ${p.roles}) USING (true)`);
    }
  }
}

for (const t of KEIN_OFFENES_SCHREIBEN) {
  for (const p of policies.filter((x) => x.tablename === t)) {
    if (p.permissive === 'PERMISSIVE' && ['INSERT', 'UPDATE', 'ALL'].includes(p.cmd)
        && istOffen(p.with_check) && !istIntern(p.roles)) {
      befunde.push(`${t}: offene Schreibpolicy "${p.policyname}" (${p.cmd}, ${p.roles}) WITH CHECK (true)`);
    }
  }
}

for (const t of [...new Set([...KEIN_OFFENES_LESEN, ...KEIN_OFFENES_SCHREIBEN])]) {
  const s = status.find((x) => x.tablename === t);
  if (s && !s.rowsecurity) befunde.push(`${t}: RLS ist ABGESCHALTET`);
}

if (befunde.length) {
  console.error('FEHLER — Abrechnungsdaten stehen offen:\n');
  befunde.forEach((b) => console.error('  • ' + b));
  console.error('\nSiehe supabase/migrations/20260908020000_rls_abrechnungsdaten_und_auditschutz.sql');
  process.exit(1);
}

console.log(
  `OK — ${KEIN_OFFENES_LESEN.length} Abrechnungstabellen ohne offene Lesepolicy, ` +
  `${KEIN_OFFENES_SCHREIBEN.length} Audit-Trails nicht frei beschreibbar.`
);
