'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { PricingTier, PricingSurcharge } from '@/lib/types/pricing'

interface FaqItem {
  q: string
  a: string
}

// faqs kommt aus page.tsx — dasselbe Array speist dort das FAQPage-Schema
// (Google-Richtlinie: nur sichtbar gerenderte FAQs auszeichnen).
export default function KrankenfahrtenContent({ faqs = [] }: { faqs?: FaqItem[] }) {
  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [surcharges, setSurcharges] = useState<PricingSurcharge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pricing/calculate')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setTiers(data.tiers || [])
          setSurcharges(data.surcharges || [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const minPrice = tiers.length > 0
    ? Math.min(...tiers.map(t => Number(t.min_price)))
    : 15

  const baseTier = tiers.find(t => t.slug === 'sitzend') || tiers[0]

  return (
    <div className="screen info-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Krankenfahrten</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🚗</div>
          <h2 className="info-hero-title">Krankenfahrten-Vermittlung</h2>
          <p className="info-hero-sub">Sicher und zuverlässig zum Arzt — die Preise richten sich nach Region, Fahrtart und Hilfebedarf</p>
        </div>

        <section className="info-card">
          <h3>Was sind Krankenfahrten?</h3>
          <p>
            Krankenfahrten sind Fahrten zu ambulanten medizinischen Behandlungen — zum Hausarzt,
            Facharzt, ins Krankenhaus, zur Dialyse, Chemo- oder Strahlentherapie. Anders als beim
            qualifizierten Krankentransport ist während der Fahrt keine medizinisch-fachliche
            Betreuung nötig: Gefahren wird sitzend im Pkw, bei Bedarf mit Tragestuhl oder im
            Rollstuhl. Alltagsengel vermittelt qualifizierte Fahrer in Frankfurt und dem gesamten
            Rhein-Main-Gebiet, die Sie pünktlich abholen, bis zur Tür begleiten und sicher wieder
            nach Hause bringen.
          </p>
          <p style={{ marginTop: 12 }}>
            Der entscheidende Unterschied zur normalen Taxifahrt: Mit einer ärztlichen
            <strong> Verordnung einer Krankenbeförderung (Muster 4)</strong> übernimmt die
            gesetzliche Krankenkasse die Kosten nach <strong>§60 SGB V</strong> — Sie zahlen nur
            die gesetzliche Zuzahlung von 10 % (mindestens 5 €, höchstens 10 € pro Fahrt).
          </p>
        </section>

        <section className="info-card">
          <h3>Wann zahlt die Krankenkasse die Krankenfahrt?</h3>
          <p>
            Die Kostenübernahme nach §60 SGB V ist an klare Voraussetzungen geknüpft. Fahrten zu
            <strong> stationären Behandlungen</strong> (Einweisung und Entlassung) übernimmt die
            Kasse grundsätzlich. Bei Fahrten zu <strong>ambulanten Behandlungen</strong> gilt: Sie
            werden nur in besonderen Fällen bezahlt — dafür dann aber zuverlässig:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><strong>Pflegegrad 4 oder 5:</strong> Fahrten zu ambulanten Behandlungen gelten
              ohne Einzelgenehmigung als genehmigt — die Verordnung genügt.</li>
            <li><strong>Pflegegrad 3 mit dauerhafter Mobilitätsbeeinträchtigung:</strong> ebenfalls
              genehmigungsfrei.</li>
            <li><strong>Schwerbehindertenausweis mit Merkzeichen aG, Bl oder H:</strong>
              genehmigungsfrei.</li>
            <li><strong>Serienfahrten:</strong> Dialyse, Chemotherapie, Strahlentherapie und
              vergleichbare Behandlungsserien mit hoher Frequenz — mit vorheriger Genehmigung
              der Kasse.</li>
            <li><strong>Vergleichbare Härtefälle:</strong> wenn der Arzt eine zwingende medizinische
              Notwendigkeit bescheinigt und die Kasse vorher genehmigt.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Wichtig: Die Verordnung stellt Ihr behandelnder Arzt <strong>vor der Fahrt</strong> aus.
            Wie Sie die Verordnung bekommen und was darauf stehen muss, erklärt unser Ratgeber
            <Link href="/blog/krankenfahrt-verordnung-erhalten"> Krankenfahrt-Verordnung erhalten</Link>.
            Alle Details zur Abrechnung finden Sie im Ratgeber
            <Link href="/blog/krankenfahrt-kostenuebernahme"> Kostenübernahme bei Krankenfahrten</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>Zuzahlung: Das zahlen Sie selbst</h3>
          <p>
            Übernimmt die Krankenkasse die Fahrt, bleibt eine gesetzliche Zuzahlung von
            <strong> 10 % des Fahrpreises, mindestens 5 € und höchstens 10 € pro Fahrt</strong> —
            Hin- und Rückfahrt zählen als zwei Fahrten. Kinder und Jugendliche unter 18 Jahren
            sind von der Zuzahlung befreit. Wer die <strong>Belastungsgrenze</strong> von 2 %
            des Bruttoeinkommens (1 % bei chronisch Kranken) erreicht, kann sich für den Rest
            des Jahres von allen Zuzahlungen befreien lassen — der Befreiungsausweis der
            Krankenkasse gilt dann auch für Krankenfahrten.
          </p>
          <p style={{ marginTop: 12 }}>
            Ohne Verordnung fahren Sie als <strong>Selbstzahler</strong>. Die Preise richten sich
            nach Region, Fahrtart und Hilfebedarf — transparent kalkuliert, ohne versteckte
            Kosten. Viele Kunden kombinieren Krankenfahrten mit einer
            <Link href="/alltagsbegleitung"> Alltagsbegleitung</Link>: Der Engel begleitet Sie dann
            auch in die Praxis, wartet während der Behandlung und hilft anschließend beim Einkauf.
            Die Begleitung ist über den <Link href="/entlastungsbetrag">Entlastungsbetrag
            (131 €/Monat)</Link> abrechenbar.
          </p>
        </section>

        <section className="info-card">
          <h3>Typische Fahrtziele</h3>
          <ul className="info-list">
            <li><strong>Dialysefahrten</strong> — regelmäßige Serienfahrten, meist 3× pro Woche, mit Dauergenehmigung der Kasse</li>
            <li><strong>Onkologie</strong> — Chemo- und Strahlentherapie, planbare Behandlungszyklen</li>
            <li><strong>Facharzttermine</strong> — Kardiologie, Orthopädie, Augenarzt, Zahnarzt</li>
            <li><strong>Krankenhaus</strong> — Aufnahme, Entlassung, ambulante OPs, Nachsorge</li>
            <li><strong>Therapien</strong> — Physiotherapie, Ergotherapie, Reha-Nachsorge</li>
            <li><strong>Sanitätshaus &amp; Apotheke</strong> — als Selbstzahler oder kombiniert mit Alltagsbegleitung</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Krankenfahrt, Krankentransport oder Rettungswagen?</h3>
          <p>
            Die drei Begriffe werden oft verwechselt — für die Abrechnung ist der Unterschied aber
            entscheidend. Die <strong>Krankenfahrt</strong> ist die einfachste Stufe: Sie sind
            gehfähig oder sitzend transportierbar und brauchen unterwegs keine medizinische
            Betreuung. Gefahren wird im Pkw oder Taxi — genau das vermittelt Alltagsengel.
          </p>
          <p style={{ marginTop: 12 }}>
            Der <strong>qualifizierte Krankentransport</strong> (KTW) kommt zum Einsatz, wenn
            während der Fahrt eine fachliche Betreuung oder eine liegende Beförderung medizinisch
            notwendig ist — etwa nach Operationen oder bei schweren Erkrankungen. Ihn führen
            Transportdienste mit speziell ausgestatteten Fahrzeugen durch; der Arzt kreuzt das auf
            der Verordnung entsprechend an. Der <strong>Rettungswagen</strong> schließlich ist
            ausschließlich für Notfälle da und wird über die 112 alarmiert — nie über eine
            Verordnung.
          </p>
          <p style={{ marginTop: 12 }}>
            Faustregel: Wer im normalen Auto sitzen kann, braucht eine Krankenfahrt — die
            günstigste und flexibelste Variante, mit Verordnung von der Kasse bezahlt.
          </p>
        </section>

        <section className="info-card">
          <h3>So läuft Ihre Fahrt mit Alltagsengel ab</h3>
          <p>
            Nach der Buchung erhalten Sie eine Bestätigung mit allen Details. Am Fahrttag gilt:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><strong>Pünktliche Abholung an der Haustür:</strong> Der Fahrer klingelt, hilft
              beim Anziehen der Jacke, trägt die Tasche und begleitet Sie zum Fahrzeug — kein
              Warten am Straßenrand.</li>
            <li><strong>Sichere Fahrt:</strong> Hilfe beim Ein- und Aussteigen, Anschnallen und
              Verstauen von Gehhilfen oder Rollator sind selbstverständlich.</li>
            <li><strong>Begleitung bis zur Anmeldung:</strong> Auf Wunsch begleitet Sie der Fahrer
              bis in die Praxis oder Klinik und meldet Sie an.</li>
            <li><strong>Rückfahrt nach Vereinbarung:</strong> Entweder wartet der Fahrer, oder Sie
              melden sich nach der Behandlung — die Rückfahrt ist Teil der Buchung.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Wer mehr Unterstützung braucht — etwa jemanden, der während der Behandlung dabei
            bleibt, mit dem Arzt spricht und danach noch den Einkauf erledigt — kombiniert die
            Krankenfahrt mit einer <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>. Die
            Begleitung läuft über den <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>,
            die Fahrt über die Verordnung: zwei Töpfe, ein Termin.
          </p>
        </section>

        <section className="info-card">
          <h3>Die Verordnung (Muster 4) verstehen</h3>
          <p>
            Die „Verordnung einer Krankenbeförderung" — das rosafarbene <strong>Muster 4</strong> —
            ist das zentrale Dokument für die Kostenübernahme. Ihr Arzt trägt darauf drei Dinge
            ein: den <strong>Grund der Beförderung</strong> (z. B. hochfrequente Behandlung wie
            Dialyse, dauerhafte Mobilitätsbeeinträchtigung, stationäre Behandlung), das
            <strong> Beförderungsmittel</strong> (für Krankenfahrten: „Taxi/Mietwagen") und den
            <strong> Behandlungsort</strong> mit Hin- und/oder Rückfahrt.
          </p>
          <p style={{ marginTop: 12 }}>
            Prüfen Sie vor der Fahrt kurz, ob alle Felder ausgefüllt und unterschrieben sind —
            unvollständige Verordnungen sind der häufigste Grund für Rückfragen der Kasse. Bei
            Serienbehandlungen kann der Arzt gleich die gesamte Behandlungsserie verordnen, dann
            genügt ein einziges Formular für alle Fahrten. In der Alltagsengel-App laden Sie die
            Verordnung einmal als Foto hoch; sie wird automatisch jeder Fahrt der Serie
            zugeordnet.
          </p>
        </section>

        <section className="info-card">
          <h3>Beispielrechnung: Das kostet eine Krankenfahrt</h3>
          <p>
            <strong>Mit Verordnung:</strong> Frau B. fährt von Offenbach zur Dialyse nach
            Frankfurt, dreimal pro Woche. Die Krankenkasse übernimmt die Fahrtkosten vollständig;
            Frau B. zahlt pro Fahrt nur die gesetzliche Zuzahlung zwischen 5 und 10 €. Da sie
            chronisch krank ist, erreicht sie früh im Jahr die Belastungsgrenze von 1 % ihres
            Bruttoeinkommens — ab dann fährt sie komplett zuzahlungsfrei.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Als Selbstzahler:</strong> Herr T. möchte ohne Verordnung zum Zahnarzt in
            der Nachbarstadt. Er zahlt den Grundpreis plus Kilometerpauschale seiner Region —
            transparent vor der Buchung angezeigt, ohne Nacht- oder Wartezuschläge tagsüber.
            Für die Begleitung in die Praxis nutzt er zusätzlich seinen
            <Link href="/entlastungsbetrag"> Entlastungsbetrag</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>Häufige Fehler bei der Verordnung — und wie Sie sie vermeiden</h3>
          <ul className="info-list">
            <li><strong>Verordnung erst nach der Fahrt geholt:</strong> Die Verordnung muss
              grundsätzlich <em>vor</em> der Fahrt ausgestellt werden. Fragen Sie beim
              Terminvereinbaren in der Praxis direkt danach.</li>
            <li><strong>Genehmigung vergessen:</strong> Serienfahrten (z. B. Dialyse) und
              Härtefälle müssen vor Fahrtantritt von der Kasse genehmigt werden — bei Pflegegrad
              4/5, Pflegegrad 3 mit Mobilitätsbeeinträchtigung und Merkzeichen aG/Bl/H entfällt
              dieser Schritt.</li>
            <li><strong>Falsches Transportmittel angekreuzt:</strong> Für die sitzende Beförderung
              genügt „Taxi/Mietwagen" — ein unnötig verordneter KTW kann zu Rückfragen der Kasse
              führen.</li>
            <li><strong>Quittungen weggeworfen:</strong> Wenn Sie in Vorleistung gehen, brauchen
              Sie Verordnung und Fahrtbelege für die Erstattung. In der Alltagsengel-App sind alle
              Fahrten automatisch dokumentiert.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Privat Versicherte und Beihilfeberechtigte reichen die Rechnung je nach Tarif bei
            ihrer Versicherung ein — die Erstattungsregeln entsprechen meist denen der
            gesetzlichen Kassen. Im Zweifel klären wir das vorab in einer kostenlosen Beratung.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen</h3>
          <ul className="info-list">
            <li>Fahrten zu Ärzten, Kliniken und Therapien</li>
            <li>Begleitung für mobilitätseingeschränkte Personen</li>
            <li>Pünktliche Abholung und Rückfahrt</li>
            <li>Abrechnung über Verordnung möglich</li>
            <li>Verfügbarkeit nach Region und Partnernetz</li>
          </ul>
        </section>

        {/* Transportarten */}
        <section className="info-card">
          <h3>Transportarten &amp; Preise</h3>
          {loading ? (
            <p style={{ color: 'var(--gray)', fontSize: 13 }}>Preise werden geladen...</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tiers.map(tier => (
                  <div key={tier.slug} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{tier.icon || '🚐'}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{tier.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                          {Number(tier.per_km_rate).toFixed(2).replace('.', ',')} €/km
                          {Number(tier.surcharge_amount) > 0 && ` · +${Number(tier.surcharge_amount).toFixed(0)}€ Zuschlag`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                        ab {Number(tier.min_price).toFixed(0)} €
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray)' }}>Grundpreis {Number(tier.base_price).toFixed(0)} €</div>
                    </div>
                  </div>
                ))}
              </div>

              {surcharges.filter(s => !['night_premium','holiday_premium'].includes(s.slug)).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>Zusatzleistungen</div>
                  {surcharges.filter(s => !['night_premium','holiday_premium'].includes(s.slug)).map(sc => (
                    <div key={sc.slug} className="info-price-row">
                      <span className="info-price-label">{sc.name}</span>
                      <span className="info-price-val">
                        {sc.surcharge_type === 'fixed' ? `+${Number(sc.value).toFixed(0)} €` : `+${Number(sc.value).toFixed(0)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {surcharges.filter(s => ['night_premium','holiday_premium'].includes(s.slug)).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>Automatische Zuschläge</div>
                  {surcharges.filter(s => ['night_premium','holiday_premium'].includes(s.slug)).map(sc => (
                    <div key={sc.slug} className="info-price-row">
                      <span className="info-price-label">{sc.name}</span>
                      <span className="info-price-val">+{Number(sc.value).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="info-price-note">
            Die Preise richten sich nach Region, Fahrtart, Hilfebedarf, Dokumentenstatus und Partnerverfügbarkeit.
            Bei ärztlicher Verordnung übernimmt die Krankenkasse die Kosten ganz oder teilweise.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich als Kunde bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Buchen Sie eine Krankenfahrt mit Datum und Ziel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Ein Fahrer wird Ihnen zugeteilt und holt Sie ab</div>
            </div>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT FAHRT BUCHEN</Link>
        </div>

        <section className="info-card">
          <h3>Krankenfahrten in Ihrer Stadt</h3>
          <ul className="info-list">
            <li><Link href="/krankenfahrten/frankfurt">Krankenfahrt Frankfurt am Main</Link></li>
            <li><Link href="/krankenfahrten/offenbach">Krankenfahrt Offenbach am Main</Link></li>
            <li><Link href="/krankenfahrten/wiesbaden">Krankenfahrt Wiesbaden</Link></li>
            <li><Link href="/krankenfahrten/darmstadt">Krankenfahrt Darmstadt</Link></li>
            <li><Link href="/krankenfahrten/hanau">Krankenfahrt Hanau</Link></li>
            <li><Link href="/krankenfahrten/bad-homburg">Krankenfahrt Bad Homburg</Link></li>
            <li><Link href="/krankenfahrten/mainz">Krankenfahrt Mainz</Link></li>
            <li><Link href="/krankenfahrten/aschaffenburg">Krankenfahrt Aschaffenburg</Link></li>
            <li><Link href="/krankenfahrten/frankfurt-hoechst">Krankenfahrt Frankfurt-Höchst</Link></li>
            <li><Link href="/krankenfahrten/neu-isenburg">Krankenfahrt Neu-Isenburg</Link></li>
            <li><Link href="/krankenfahrten/friedberg-wetterau">Krankenfahrt Friedberg (Wetterau)</Link></li>
            <li><Link href="/krankenfahrten/rodgau">Krankenfahrt Rodgau</Link></li>
          </ul>
        </section>

        {faqs.length > 0 && (
          <section className="info-card">
            <h3>Häufige Fragen zu Krankenfahrten</h3>
            {faqs.map((f) => (
              <details key={f.q} className="info-faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        )}

        <section className="info-card">
          <h3>Weitere Leistungen</h3>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung — 131€/Monat über Entlastungsbetrag</Link></li>
            <li><Link href="/hygienebox">Pflegebox — kostenlose Pflegehilfsmittel (42€/Monat)</Link></li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag — 131 €/Monat ab Pflegegrad 1 (§45b)</Link></li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege — Ersatzpflege bis 3.539 €/Jahr (§39)</Link></li>
            <li><Link href="/finanzierung">Finanzierung — bis zu 5.111 €/Jahr, nach Pflegegrad erklärt</Link></li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag — 131 €/Monat für Begleitung nutzen</Link></li>
            <li><Link href="/blog/krankenfahrt-kostenuebernahme">Ratgeber: Krankenfahrt Kostenübernahme</Link></li>
            <li><Link href="/blog/krankenfahrt-verordnung-erhalten">Ratgeber: Verordnung (Muster 4) erhalten</Link></li>
            <li><Link href="/blog/krankenfahrt-buchen-frankfurt">Ratgeber: Krankenfahrt in Frankfurt buchen</Link></li>
            <li><Link href="/faq">Häufige Fragen zu Pflegeleistungen</Link></li>
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
