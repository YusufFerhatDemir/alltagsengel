'use client'
// ═══════════════════════════════════════════════════════════════
// Pflegevisite — Übersicht, Arbeitsliste, Neuanlage
//
// Die Arbeitsliste steht BEWUSST oben, vor der Visitenliste: eine
// Pflegevisite ist erst dann Qualitätssicherung, wenn ihre Befunde
// abgestellt werden. Wer nur die Visiten sieht, hat einen Ordner —
// wer die offenen Abweichungen sieht, hat einen Vorgang.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import { AuswahlFeld, Karte, FeldRaster, TextFeld, pflegePrimaryBtn } from '@/components/admin/PflegeUI'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'
import {
  GESAMTBEWERTUNG_BEZEICHNUNG,
  PRUEFPUNKT_BEZEICHNUNG,
  VISITE_TYP_WERTE,
  type Pruefpunkt,
  type QmPflegevisite,
  type QmVisiteBefund,
  type VisiteStatus,
  type VisiteTyp,
} from '@/lib/qm/types'
import { heuteBerlin } from '@/lib/utils/timezone'

const TYP_LABEL: Record<VisiteTyp, string> = {
  regelvisite: 'Regelvisite',
  anlassvisite: 'Anlassvisite',
  einarbeitung: 'Einarbeitung',
  nachvisite: 'Nachvisite',
}

const STATUS_META: Record<VisiteStatus, { label: string; color: string }> = {
  geplant:       { label: 'Geplant',        color: '#64748b' },
  durchgefuehrt: { label: 'Durchgeführt',   color: '#0284c7' },
  ausgewertet:   { label: 'Ausgewertet',    color: '#7c3aed' },
  abgeschlossen: { label: 'Abgeschlossen',  color: '#16a34a' },
  abgesagt:      { label: 'Abgesagt',       color: '#a1a1aa' },
}

interface Kennzahlen {
  gesamt: number
  offen: number
  abgeschlossen: number
  ohneBeanstandung: number
  mitAbweichung: number
  offeneAbweichungen: number
  ueberfaelligeAbweichungen: number
}

interface OffeneAbweichung {
  befund: QmVisiteBefund
  visiteId: string
  clientId: string
  ueberfaellig: boolean
}

export default function AdminPflegevisitenPage() {
  const router = useRouter()
  const [visiten, setVisiten] = useState<QmPflegevisite[]>([])
  const [abweichungen, setAbweichungen] = useState<OffeneAbweichung[]>([])
  const [kennzahlen, setKennzahlen] = useState<Kennzahlen | null>(null)
  const [kunden, setKunden] = useState<PflegeUebersichtZeile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nurOffen, setNurOffen] = useState(false)

  const [neuClientId, setNeuClientId] = useState('')
  const [neuTyp, setNeuTyp] = useState<VisiteTyp>('regelvisite')
  const [neuDatum, setNeuDatum] = useState(heuteBerlin())
  const [neuAnlass, setNeuAnlass] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/qm/pflegevisiten').then(r => r.json()),
      fetch('/api/qm/pflegevisiten?abweichungen=true').then(r => r.json()),
      fetch('/api/qm/pflegevisiten?kennzahlen=true').then(r => r.json()),
      fetch('/api/pflege/uebersicht').then(r => r.json()),
    ])
      .then(([visitenRes, abwRes, kzRes, kundenRes]) => {
        // Die erste Fehlermeldung gewinnt — sie nennt in aller Regel die
        // Ursache aller vier (fehlende Berechtigung, Modul nicht
        // eingerichtet).
        const fehler = visitenRes.error || abwRes.error || kzRes.error
        if (fehler) { setError(fehler); return }
        setVisiten(visitenRes.visiten || [])
        setAbweichungen(abwRes.abweichungen || [])
        setKennzahlen(kzRes.kennzahlen ?? null)
        setKunden(kundenRes.uebersicht || [])
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const kundenName = useMemo(() => {
    const map = new Map<string, string>()
    for (const k of kunden) map.set(k.client_id, `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || '—')
    return map
  }, [kunden])

  const sichtbar = useMemo(
    () => nurOffen ? visiten.filter(v => v.status !== 'abgeschlossen' && v.status !== 'abgesagt') : visiten,
    [visiten, nurOffen],
  )

  async function visitePlanen() {
    if (!neuClientId) { setError('Bitte zuerst eine betreute Person auswählen.'); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/qm/pflegevisiten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: neuClientId,
          visiteTyp: neuTyp,
          geplantAm: neuDatum,
          anlass: neuAnlass.trim() || null,
        }),
      })
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      router.push(`/admin/pflegevisiten/${body.visite.id}`)
    } catch {
      setError('Anlegen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Pflegevisite</h1>
          <p className="admin-subtitle">
            Interne Qualitätsprüfung nach § 113 SGB XI · {visiten.length} Visiten
          </p>
        </div>
        <Link href="/admin/quality" style={{ textDecoration: 'none' }}>Zum Qualitäts-Dashboard →</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {kennzahlen && (
        <Karte titel="Prüfleistung">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Kennzahl label="Visiten gesamt" wert={kennzahlen.gesamt} />
            <Kennzahl label="offen" wert={kennzahlen.offen} />
            <Kennzahl label="abgeschlossen" wert={kennzahlen.abgeschlossen} />
            <Kennzahl label="ohne Beanstandung" wert={kennzahlen.ohneBeanstandung} />
            <Kennzahl label="mit Abweichung" wert={kennzahlen.mitAbweichung} />
            <Kennzahl
              label="offene Abweichungen"
              wert={kennzahlen.offeneAbweichungen}
              ton={kennzahlen.offeneAbweichungen > 0 ? 'warn' : undefined}
            />
            <Kennzahl
              label="Frist überschritten"
              wert={kennzahlen.ueberfaelligeAbweichungen}
              ton={kennzahlen.ueberfaelligeAbweichungen > 0 ? 'danger' : undefined}
            />
          </div>
        </Karte>
      )}

      <Karte titel={`Offene Abweichungen (${abweichungen.length})`}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Betreute Person</th>
              <th>Prüfpunkt</th>
              <th>Feststellung</th>
              <th>Frist</th>
              <th>Maßnahme</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={6}>Lade…</EmptyRow>}
            {!loading && abweichungen.length === 0 && (
              <EmptyRow colSpan={6}>Keine offenen Abweichungen.</EmptyRow>
            )}
            {abweichungen.map(a => (
              <tr key={a.befund.id}>
                <td>{kundenName.get(a.clientId) ?? a.clientId}</td>
                <td>{PRUEFPUNKT_BEZEICHNUNG[a.befund.pruefpunkt as Pruefpunkt] ?? a.befund.pruefpunkt}</td>
                <td>{a.befund.feststellung ?? '—'}</td>
                <td style={a.ueberfaellig ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                  {formatDate(a.befund.frist)}{a.ueberfaellig ? ' · überfällig' : ''}
                </td>
                <td>
                  {a.befund.massnahme_id
                    ? 'verknüpft'
                    : a.befund.massnahme_beantragt ? 'beantragt' : '—'}
                </td>
                <td><Link href={`/admin/pflegevisiten/${a.visiteId}`}>Zur Visite</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel="Visite planen">
        <FeldRaster>
          <AuswahlFeld
            label="Betreute Person"
            value={neuClientId}
            onChange={setNeuClientId}
            optionen={[
              ['', '— Person wählen —'] as [string, string],
              ...kunden.map(k => [
                k.client_id,
                `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || k.client_id,
              ] as [string, string]),
            ]}
          />
          <AuswahlFeld
            label="Art"
            value={neuTyp}
            onChange={v => setNeuTyp(v as VisiteTyp)}
            optionen={VISITE_TYP_WERTE.map(t => [t, TYP_LABEL[t]] as [string, string])}
          />
          <TextFeld label="Geplant am" value={neuDatum} onChange={setNeuDatum} type="date" />
          <TextFeld
            label={neuTyp === 'anlassvisite' ? 'Anlass (Pflichtangabe)' : 'Anlass (optional)'}
            value={neuAnlass}
            onChange={setNeuAnlass}
            placeholder="z. B. Beschwerde der Angehörigen vom 12.08."
            breit
          />
        </FeldRaster>
        <button style={pflegePrimaryBtn} onClick={visitePlanen} disabled={busy || !neuClientId}>
          {busy ? 'Wird geplant…' : 'Visite planen'}
        </button>
      </Karte>

      <div style={{ margin: '16px 0' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={nurOffen} onChange={e => setNurOffen(e.target.checked)} />
          Nur noch nicht abgeschlossene Visiten
        </label>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Betreute Person</th>
            <th>Geplant</th>
            <th>Durchgeführt</th>
            <th>Art</th>
            <th>Status</th>
            <th>Urteil</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && <EmptyRow colSpan={7}>Lade…</EmptyRow>}
          {!loading && sichtbar.length === 0 && (
            <EmptyRow colSpan={7}>Noch keine Pflegevisite geplant.</EmptyRow>
          )}
          {sichtbar.map(v => {
            const meta = STATUS_META[v.status] ?? { label: v.status, color: '#64748b' }
            return (
              <tr key={v.id}>
                <td>{kundenName.get(v.client_id) ?? v.client_id}</td>
                <td>{formatDate(v.geplant_am)}</td>
                <td>{v.durchgefuehrt_am ? formatDate(v.durchgefuehrt_am) : '—'}</td>
                <td>{TYP_LABEL[v.visite_typ] ?? v.visite_typ}</td>
                <td><StatusBadge label={meta.label} color={meta.color} /></td>
                <td>{v.gesamtbewertung ? GESAMTBEWERTUNG_BEZEICHNUNG[v.gesamtbewertung] ?? v.gesamtbewertung : '—'}</td>
                <td><Link href={`/admin/pflegevisiten/${v.id}`}>Öffnen</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Kennzahl({ label, wert, ton }: { label: string; wert: number; ton?: 'warn' | 'danger' }) {
  const farbe = ton === 'danger' ? '#dc2626' : ton === 'warn' ? '#d97706' : 'inherit'
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
    </div>
  )
}
