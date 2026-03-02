'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

/* ════════════════════════════════════════════
   AlltagsEngel — Investor Pitch Deck (Web)
   Full-screen scroll-based presentation
   Mobile-responsive with hamburger nav
   ════════════════════════════════════════════ */

interface Slide {
  id: string
  label: string
  title: string
  content: React.ReactNode
}

const C = {
  coal: '#1A1612', coal2: '#252118', coal3: '#332E24', coal4: '#443C2E',
  gold: '#C9963C', gold2: '#DBA84A', gold3: '#ECC870',
  goldPale: 'rgba(201,150,60,0.12)', goldLt: 'rgba(201,150,60,0.25)',
  ink: '#F7F2EA', ink2: '#C4B8A8', ink3: '#9A8C7C', ink4: '#7A6E5E', ink5: '#5A4E3E',
  green: '#5CB882', red: '#D04B3B',
  border: 'rgba(255,255,255,0.08)', border2: 'rgba(255,255,255,0.12)',
}

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="pitch-card" style={{
    background: C.coal2, borderRadius: 18, padding: 24,
    border: `1.5px solid ${C.border}`,
    boxShadow: '0 2px 14px rgba(26,22,18,0.15)',
    ...style,
  }}>{children}</div>
)

const StatBox = ({ value, label, sub }: { value: string; label: string; sub?: string }) => (
  <div style={{ textAlign: 'center' }}>
    <div className="stat-value" style={{ fontSize: 36, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 4 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>{sub}</div>}
  </div>
)

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: C.gold2, background: C.goldPale, border: `1px solid ${C.goldLt}`, borderRadius: 7, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{children}</span>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.ink4, textTransform: 'uppercase' as const, marginBottom: 12 }}>{children}</div>
)

const GoldSep = () => <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${C.gold}, transparent)`, borderRadius: 1, margin: '16px 0' }} />

const FeatureRow = ({ icon, title, desc }: { icon: string; title: string; desc: string }) => (
  <div className="feature-row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
    <div style={{ width: 44, height: 44, borderRadius: 13, background: C.goldPale, border: `1px solid rgba(201,150,60,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>{desc}</div>
    </div>
  </div>
)

const TeamCard = ({ initials, name, role, skill, color }: { initials: string; name: string; role: string; skill: string; color: string }) => (
  <Card style={{ textAlign: 'center', padding: 20 }}>
    <div style={{ width: 52, height: 52, borderRadius: 16, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 18, fontWeight: 700, color: C.coal, fontFamily: "'Cormorant Garamond', serif" }}>{initials}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{name}</div>
    <div style={{ fontSize: 12, color: C.gold, fontWeight: 600, marginTop: 2 }}>{role}</div>
    <div style={{ fontSize: 11, color: C.ink4, marginTop: 6 }}>{skill}</div>
  </Card>
)

const CheckRow = ({ label, ae, trad, other }: { label: string; ae: boolean; trad: boolean; other: boolean }) => (
  <div className="check-row" style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 13, color: C.ink2 }}>{label}</div>
    <div style={{ textAlign: 'center', fontSize: 16 }}>{ae ? '✅' : '❌'}</div>
    <div style={{ textAlign: 'center', fontSize: 16 }}>{trad ? '✅' : '❌'}</div>
    <div style={{ textAlign: 'center', fontSize: 16 }}>{other ? '✅' : '❌'}</div>
  </div>
)

const TimelineItem = ({ year, title, desc, done }: { year: string; title: string; desc: string; done: boolean }) => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: done ? C.gold : C.coal3, border: `2px solid ${done ? C.gold : C.ink4}` }} />
      <div style={{ width: 2, height: 40, background: C.coal3 }} />
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: done ? C.gold : C.ink4, letterSpacing: '0.05em' }}>{year}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{desc}</div>
    </div>
  </div>
)

const FundBar = ({ pct, label, amount, color }: { pct: number; label: string; amount: string; color: string }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>{amount}</span>
    </div>
    <div style={{ height: 8, borderRadius: 4, background: C.coal3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color, transition: 'width 0.8s ease' }} />
    </div>
  </div>
)

/* ─── Slide Definitions ─── */
function buildSlides(): Slide[] {
  return [
    {
      id: 'title', label: 'Start', title: '',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,150,60,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 14, color: C.ink4, marginBottom: 24 }}>👼</div>
            <h1 className="hero-title" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 56, fontWeight: 700, color: C.ink, letterSpacing: 6, marginBottom: 8 }}>ALLTAGSENGEL</h1>
            <p className="hero-sub" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontStyle: 'italic', color: C.gold, marginBottom: 8 }}>Mit Herz für dich da</p>
            <GoldSep />
            <p style={{ fontSize: 12, color: C.ink4, marginTop: 8, letterSpacing: '0.08em' }}>PREMIUM ALLTAGSBEGLEITUNG</p>
            <div className="hero-stats" style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 48, flexWrap: 'wrap' as const }}>
              <StatBox value="100%" label="Versichert" />
              <StatBox value="§45b" label="Integriert" />
              <StatBox value="24/7" label="Verfügbar" />
            </div>
            <p style={{ fontSize: 11, color: C.ink5, marginTop: 48 }}>Investor Pitch Deck · März 2026</p>
          </div>
        </div>
      ),
    },
    {
      id: 'problem', label: 'Problem', title: 'Der Pflegemarkt braucht digitale Innovation',
      content: (
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 24 }}>
          <Card><StatBox value="€4,4 Mrd." label="Ungenutzte §45b-Mittel" sub="Von €7,44 Mrd. werden nur 40% abgerufen" /></Card>
          <Card><StatBox value="0" label="Digitale Plattform" sub="Analoge Vermittlung, lange Wartezeiten" /></Card>
          <Card><StatBox value="Ø 14 Tage" label="Wartezeit" sub="Keine standardisierte Qualitätssicherung" /></Card>
        </div>
      ),
    },
    {
      id: 'solution', label: 'Lösung', title: 'AlltagsEngel — Die Plattform für Alltagsbegleitung',
      content: (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 24 }}>
          <div>
            <FeatureRow icon="⚡" title="Sofortige Vermittlung" desc="Zertifizierte Alltagsbegleiter in Ihrer Nähe — Buchung in unter 2 Minuten" />
            <FeatureRow icon="🏥" title="§45b Integration" desc="Direkte Abrechnung mit allen Pflegekassen. €125/Monat pro Pflegebedürftigem" />
            <FeatureRow icon="⭐" title="Qualitätsgarantie" desc="Alle Engel sind nach §53b SGB XI zertifiziert und werden bewertet" />
            <FeatureRow icon="📱" title="Dual-App" desc="Eigene Oberfläche für Kunden und Engel. iOS & Android" />
          </div>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.coal3, minHeight: 260 }}>
            <div style={{ width: 120, height: 220, borderRadius: 20, background: C.coal, border: `2px solid ${C.coal4}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ fontSize: 28 }}>👼</div>
              <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: 2 }}>ALLTAGSENGEL</div>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: C.gold, opacity: 0.3 }} />
              <div style={{ width: 60, height: 4, borderRadius: 2, background: C.ink4, opacity: 0.2 }} />
              <div style={{ width: 60, height: 4, borderRadius: 2, background: C.ink4, opacity: 0.2 }} />
            </div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 12 }}>React Native · Expo · Supabase</div>
          </Card>
        </div>
      ),
    },
    {
      id: 'market', label: 'Markt', title: 'Ein Markt mit €50 Mrd.+ Potenzial',
      content: (
        <div>
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
            <Card style={{ textAlign: 'center', borderColor: 'rgba(201,150,60,0.2)' }}>
              <div style={{ fontSize: 11, color: C.ink4, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>TAM</div>
              <StatBox value="€50 Mrd.+" label="Dt. Pflegemarkt" />
            </Card>
            <Card style={{ textAlign: 'center', borderColor: 'rgba(201,150,60,0.15)' }}>
              <div style={{ fontSize: 11, color: C.ink4, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>SAM</div>
              <StatBox value="€7,44 Mrd." label="§45b Jahresbudget" />
            </Card>
            <Card style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.ink4, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>SOM</div>
              <StatBox value="€150 Mio." label="5-Jahres-Ziel" />
            </Card>
          </div>
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>
              <strong style={{ color: C.ink }}>4,96 Mio.</strong> Pflegebedürftige in Deutschland — Tendenz steigend (+3% p.a.). Nur <strong style={{ color: C.gold }}>40%</strong> der verfügbaren §45b-Mittel werden aktuell abgerufen. Das sind <strong style={{ color: C.gold }}>€4,4 Mrd.</strong> ungenutztes Potenzial jedes Jahr.
            </div>
          </Card>
        </div>
      ),
    },
    {
      id: 'business', label: 'Geschäftsmodell', title: 'Zwei Einnahmequellen, starke Unit Economics',
      content: (
        <div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
            <Card style={{ textAlign: 'center' }}>
              <div className="big-num" style={{ fontSize: 48, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>18%</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>Provision pro Buchung</div>
              <GoldSep />
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>
                Ø €40 Buchungswert = <strong style={{ color: C.gold }}>€7,20</strong> Provision pro Buchung
              </div>
            </Card>
            <Card style={{ textAlign: 'center' }}>
              <div className="big-num" style={{ fontSize: 48, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>€9,99</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>Premium-Abo / Monat</div>
              <GoldSep />
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>
                Premium-Features für Engel: Profilboost, Priorität & Analytics
              </div>
            </Card>
          </div>
          <Card style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.ink3 }}>Ø Kundenbudget durch §45b</div>
            <div className="big-num" style={{ fontSize: 36, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif", marginTop: 4 }}>€125 / Monat</div>
            <div style={{ fontSize: 12, color: C.ink4, marginTop: 4 }}>= €1.500 / Jahr pro Pflegebedürftigem über Pflegekasse</div>
          </Card>
        </div>
      ),
    },
    {
      id: 'product', label: 'Produkt', title: 'Eine App, zwei Welten',
      content: (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>👤</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Für Kunden</span>
            </div>
            <FeatureRow icon="🔍" title="Engel finden" desc="Filter nach Service, Standort & Bewertung" />
            <FeatureRow icon="📅" title="Sofort buchen" desc="Verfügbarkeit in Echtzeit" />
            <FeatureRow icon="💳" title="§45b abrechnen" desc="Direkte Kassenabrechnung" />
            <FeatureRow icon="⭐" title="Bewerten" desc="Transparentes Rating-System" />
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>👼</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Für Engel</span>
            </div>
            <FeatureRow icon="📋" title="Profil erstellen" desc="Qualifikationen & Services verwalten" />
            <FeatureRow icon="📩" title="Anfragen erhalten" desc="Push-Benachrichtigungen in Echtzeit" />
            <FeatureRow icon="💰" title="Verdienst tracken" desc="Dashboard mit Umsatzübersicht" />
            <FeatureRow icon="📈" title="Wachsen" desc="Premium-Abo für mehr Sichtbarkeit" />
          </Card>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            {['React Native', 'Expo SDK', 'Supabase', 'PostgreSQL', 'iOS', 'Android'].map(t => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'competition', label: 'Wettbewerb', title: 'Klare Differenzierung im Markt',
      content: (
        <Card style={{ marginTop: 24, overflowX: 'auto' }}>
          <div style={{ minWidth: 340 }}>
            <div className="check-row" style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', padding: '12px 0', borderBottom: `2px solid ${C.gold}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Feature</div>
              <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.gold }}>Alltags-<br />Engel</div>
              <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.ink4 }}>Trad.<br />Agenturen</div>
              <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.ink4 }}>Andere<br />Plattf.</div>
            </div>
            <CheckRow label="Digitale Buchung" ae={true} trad={false} other={true} />
            <CheckRow label="§45b Integration" ae={true} trad={false} other={false} />
            <CheckRow label="Qualitätssicherung" ae={true} trad={true} other={false} />
            <CheckRow label="Preistransparenz" ae={true} trad={false} other={true} />
            <CheckRow label="Bewertungssystem" ae={true} trad={false} other={false} />
            <CheckRow label="Echtzeit-Verfügbarkeit" ae={true} trad={false} other={false} />
            <CheckRow label="Mobile App" ae={true} trad={false} other={true} />
          </div>
        </Card>
      ),
    },
    {
      id: 'traction', label: 'Traktion', title: 'Vom Konzept zur Marktreife',
      content: (
        <div style={{ marginTop: 24 }}>
          <TimelineItem year="Q3 2025" title="Konzept & Marktvalidierung" desc="Problemvalidierung, Interviews mit 50+ Pflegebedürftigen" done={true} />
          <TimelineItem year="Q4 2025" title="MVP-Entwicklung" desc="Core-Features: Buchung, Profile, Matching-Algorithmus" done={true} />
          <TimelineItem year="Q1 2026" title="Beta-Launch Frankfurt" desc="Erste Engel onboarded, Testbuchungen erfolgreich" done={true} />
          <TimelineItem year="Q2 2026" title="Öffentlicher Launch" desc="Go-to-Market Frankfurt, Marketing-Kampagne, PR" done={false} />
          <TimelineItem year="Q3 2026" title="Erste 500 Nutzer" desc="Wachstumsphase: Partnerschaften mit Pflegediensten" done={false} />
          <TimelineItem year="Q1 2027" title="Expansion" desc="Rollout in 3 weitere Städte: Berlin, München, Hamburg" done={false} />
        </div>
      ),
    },
    {
      id: 'team', label: 'Team', title: 'Erfahrung trifft Leidenschaft',
      content: (
        <div className="grid-team" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 24 }}>
          <TeamCard initials="YD" name="Yusuf F. Demir" role="Gründer & CEO" skill="Strategie & Vision" color={C.gold} />
          <TeamCard initials="LL" name="Laura Leeman" role="Teamleiterin" skill="Pflege & Qualität" color={C.gold2} />
          <TeamCard initials="MY" name="Mehmet Yilmaz" role="CTO" skill="Technologie & Produkt" color={C.gold3} />
          <TeamCard initials="SW" name="Sophie Weber" role="Marketing" skill="Growth & Kommunikation" color={C.green} />
          <TeamCard initials="AH" name="Anna Hoffmann" role="Assistenz" skill="Kunden & Operations" color={C.ink3} />
        </div>
      ),
    },
    {
      id: 'finance', label: 'Finanzen', title: 'Profitabel ab Jahr 2',
      content: (
        <div>
          <Card style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>5-Jahres-Prognose</span>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 11, color: C.gold }}>● Umsatz</span>
                <span style={{ fontSize: 11, color: C.green }}>● Nettogewinn</span>
              </div>
            </div>
            {[
              { year: 'Jahr 1', rev: '€180K', profit: '-€222K', revPct: 2.5, profitPct: 0, loss: true },
              { year: 'Jahr 2', rev: '€720K', profit: '€78K', revPct: 10, profitPct: 3, loss: false },
              { year: 'Jahr 3', rev: '€1,8M', profit: '€468K', revPct: 25, profitPct: 18, loss: false },
              { year: 'Jahr 4', rev: '€3,6M', profit: '€1,08M', revPct: 50, profitPct: 42, loss: false },
              { year: 'Jahr 5', rev: '€7,2M', profit: '€2,52M', revPct: 100, profitPct: 98, loss: false },
            ].map((y, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{y.year}</span>
                  <span style={{ fontSize: 12, color: C.ink3 }}>{y.rev} / <span style={{ color: y.loss ? C.red : C.green }}>{y.profit}</span></span>
                </div>
                <div style={{ display: 'flex', gap: 4, height: 8 }}>
                  <div style={{ height: '100%', width: `${y.revPct}%`, borderRadius: 4, background: C.gold, minWidth: 4, transition: 'width 1s ease' }} />
                  {!y.loss && <div style={{ height: '100%', width: `${y.profitPct}%`, borderRadius: 4, background: C.green, minWidth: y.profitPct > 0 ? 4 : 0, transition: 'width 1s ease' }} />}
                </div>
              </div>
            ))}
          </Card>
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            <Card style={{ textAlign: 'center', padding: 16 }}><StatBox value="€33,5K" label="Monatl. Kosten" /></Card>
            <Card style={{ textAlign: 'center', padding: 16 }}><StatBox value="Jahr 2" label="Break-Even" /></Card>
            <Card style={{ textAlign: 'center', padding: 16 }}><StatBox value="€2,52M" label="Gewinn Jahr 5" /></Card>
          </div>
        </div>
      ),
    },
    {
      id: 'funding', label: 'Investment', title: '€500.000 Seed-Runde',
      content: (
        <div style={{ marginTop: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div className="big-num" style={{ fontSize: 64, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>€500K</div>
            <div style={{ fontSize: 14, color: C.ink3 }}>Pre-Seed / Seed-Finanzierung</div>
          </div>
          <Card>
            <FundBar pct={40} label="Team & Recruiting" amount="€200.000" color={C.gold} />
            <FundBar pct={30} label="Marketing & Growth" amount="€150.000" color={C.gold2} />
            <FundBar pct={15} label="Technologie" amount="€75.000" color={C.gold3} />
            <FundBar pct={15} label="Betrieb & Reserve" amount="€75.000" color={C.ink3} />
          </Card>
        </div>
      ),
    },
    {
      id: 'vision', label: 'Vision', title: 'Die Zukunft der Alltagsbegleitung',
      content: (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="vision-quote" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontStyle: 'italic', color: C.gold, lineHeight: 1.4, maxWidth: 600, margin: '0 auto' }}>
            &bdquo;Jeder Mensch verdient einen Engel an seiner Seite.&ldquo;
          </div>
          <GoldSep />
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 40, maxWidth: 700, margin: '40px auto 0' }}>
            <Card style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>2027</div>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, marginTop: 8 }}>10.000+ Nutzer</div>
              <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Marktführer Frankfurt</div>
            </Card>
            <Card style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>2028</div>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, marginTop: 8 }}>5 Bundesländer</div>
              <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Marktführer Deutschland</div>
            </Card>
            <Card style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>2030</div>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, marginTop: 8 }}>Europa</div>
              <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Internationale Expansion</div>
            </Card>
          </div>
        </div>
      ),
    },
    {
      id: 'contact', label: 'Kontakt', title: '',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,150,60,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 500 }}>
            <h2 className="hero-title" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, fontWeight: 700, color: C.ink, letterSpacing: 4 }}>ALLTAGSENGEL</h2>
            <p style={{ fontSize: 16, color: C.ink3, marginTop: 16, marginBottom: 32, lineHeight: 1.6 }}>
              Lassen Sie uns gemeinsam<br />die Pflege revolutionieren.
            </p>
            <Card style={{ display: 'inline-block', padding: '28px 40px', textAlign: 'left', maxWidth: '100%' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Yusuf Ferhat Demir</div>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 600, marginBottom: 16 }}>Gründer & CEO</div>
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 2 }}>
                <a href="mailto:info@alltagsengel.care" style={{ color: C.ink3, textDecoration: 'none' }}>✉️ info@alltagsengel.care</a><br />
                <a href="https://www.alltagsengel.de" target="_blank" rel="noopener" style={{ color: C.ink3, textDecoration: 'none' }}>🌐 www.alltagsengel.de</a><br />
                📍 Schiller Str. 31, 60313 Frankfurt am Main
              </div>
            </Card>
            <div style={{ marginTop: 24 }}>
              <a href="mailto:info@alltagsengel.care" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '16px 40px', borderRadius: 14,
                background: `linear-gradient(135deg, ${C.gold2} 0%, ${C.gold} 55%, #9A7020 100%)`,
                color: C.coal, fontWeight: 700, fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 4px 28px rgba(201,150,60,0.35)',
              }}>
                JETZT GESPRÄCH VEREINBAREN
              </a>
            </div>
          </div>
        </div>
      ),
    },
  ]
}

/* ─── Main Component ─── */
export default function PitchDeck() {
  const slides = buildSlides()
  const [current, setCurrent] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = slideRefs.current.indexOf(entry.target as HTMLDivElement)
            if (idx >= 0) setCurrent(idx)
          }
        })
      },
      { threshold: 0.4 }
    )
    slideRefs.current.forEach(ref => { if (ref) observer.observe(ref) })
    return () => observer.disconnect()
  }, [])

  const scrollTo = (idx: number) => {
    slideRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <>
      <style>{`
        /* ─── Mobile Responsive ─── */
        .pitch-sidebar {
          position: fixed; left: 0; top: 0; bottom: 0; width: 180px;
          background: ${C.coal2}; border-right: 1px solid ${C.border};
          padding: 24px 0; display: flex; flex-direction: column;
          z-index: 100; overflow-y: auto; transition: transform 0.3s ease;
        }
        .pitch-main {
          margin-left: 180px; flex: 1; max-width: 900px; padding: 0 48px;
        }
        .pitch-progress {
          position: fixed; top: 0; left: 180px; right: 0; height: 3px;
          background: ${C.coal2}; z-index: 99;
        }
        .hamburger { display: none; }
        .overlay { display: none; }
        .mobile-header { display: none; }

        @media (max-width: 768px) {
          .pitch-sidebar {
            transform: ${menuOpen ? 'translateX(0)' : 'translateX(-100%)'};
            width: 220px;
          }
          .pitch-main {
            margin-left: 0; padding: 0 20px; padding-top: 60px;
          }
          .pitch-progress {
            left: 0; top: 56px;
          }
          .mobile-header {
            display: flex !important; align-items: center; justify-content: space-between;
            position: fixed; top: 0; left: 0; right: 0; height: 56px;
            background: ${C.coal2}; border-bottom: 1px solid ${C.border};
            padding: 0 16px; z-index: 101;
          }
          .hamburger { display: block !important; }
          .overlay {
            display: ${menuOpen ? 'block' : 'none'};
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 99;
          }
          .hero-title { font-size: 32px !important; letter-spacing: 3px !important; }
          .hero-sub { font-size: 18px !important; }
          .big-num { font-size: 36px !important; }
          .vision-quote { font-size: 20px !important; }
          .stat-value { font-size: 28px !important; }
          .grid-2 { grid-template-columns: 1fr !important; gap: 12px !important; }
          .grid-3 { grid-template-columns: 1fr !important; gap: 12px !important; }
          .grid-team { grid-template-columns: repeat(2, 1fr) !important; }
          .pitch-card { padding: 16px !important; border-radius: 14px !important; }
          .check-row { grid-template-columns: 1fr 48px 48px 48px !important; }
          .check-row div { font-size: 11px !important; }
          .feature-row { gap: 12px !important; }
        }
        @media (max-width: 420px) {
          .pitch-main { padding: 0 12px; padding-top: 60px; }
          .hero-title { font-size: 26px !important; letter-spacing: 2px !important; }
          .big-num { font-size: 28px !important; }
          .grid-team { grid-template-columns: 1fr !important; }
          .hero-stats { gap: 16px !important; }
        }
      `}</style>

      <div style={{ background: C.coal, minHeight: '100vh', fontFamily: "'Jost', sans-serif", display: 'flex' }}>
        {/* Mobile Header */}
        <div className="mobile-header" style={{ display: 'none' }}>
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} style={{
            display: 'none', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8,
          }}>
            <div style={{ width: 22, height: 2, background: C.gold, marginBottom: 5, borderRadius: 1, transition: 'all 0.3s', transform: menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
            <div style={{ width: 22, height: 2, background: C.gold, marginBottom: 5, borderRadius: 1, transition: 'all 0.3s', opacity: menuOpen ? 0 : 1 }} />
            <div style={{ width: 22, height: 2, background: C.gold, borderRadius: 1, transition: 'all 0.3s', transform: menuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
          </button>
          <Link href="/investor" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.gold }}>ALLTAGSENGEL</span>
          </Link>
          <span style={{ fontSize: 10, color: C.ink4 }}>Slide {current + 1}/{slides.length}</span>
        </div>

        {/* Overlay for mobile */}
        <div className="overlay" onClick={() => setMenuOpen(false)} />

        {/* Sidebar Navigation */}
        <nav className="pitch-sidebar">
          <Link href="/investor" style={{ textDecoration: 'none', padding: '0 20px', marginBottom: 24, display: 'block' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.gold, marginBottom: 2 }}>ALLTAGSENGEL</div>
            <div style={{ fontSize: 10, color: C.ink4 }}>Investor Pitch Deck</div>
          </Link>
          {slides.map((s, i) => (
            <button key={s.id} onClick={() => scrollTo(i)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 20px', border: 'none', background: 'transparent',
              cursor: 'pointer', width: '100%', textAlign: 'left',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: current === i ? C.gold : C.coal4,
                boxShadow: current === i ? '0 0 8px rgba(201,150,60,0.4)' : 'none',
                transition: 'all 0.3s',
              }} />
              <span style={{
                fontSize: 12, fontWeight: current === i ? 600 : 400,
                color: current === i ? C.ink : C.ink4,
                transition: 'all 0.2s',
              }}>{s.label}</span>
            </button>
          ))}
          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.ink5 }}>&copy; 2026 AlltagsEngel UG</div>
            <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', fontSize: 9, color: C.ink5, marginTop: 8, display: 'block' }}>
              Powered by <span style={{ fontWeight: 700, color: C.gold }}>DRIPFY.APP</span>
            </a>
          </div>
        </nav>

        {/* Main Content */}
        <main className="pitch-main">
          {slides.map((s, i) => (
            <div
              key={s.id}
              ref={el => { slideRefs.current[i] = el }}
              style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 0' }}
            >
              {s.title && (
                <div>
                  <SectionLabel>{s.label}</SectionLabel>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>{s.title}</h2>
                </div>
              )}
              {s.content}
            </div>
          ))}
        </main>

        {/* Progress bar */}
        <div className="pitch-progress">
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.gold2})`,
            width: `${((current + 1) / slides.length) * 100}%`,
            transition: 'width 0.3s ease', borderRadius: '0 2px 2px 0',
          }} />
        </div>
      </div>
    </>
  )
}
