'use client'
import Link from 'next/link'

/* ════════════════════════════════════════════
   AlltagsEngel — Markenidentität & Corporate Design
   Interactive Brand Guidelines Page
   ════════════════════════════════════════════ */

const C = {
  coal: '#1A1612', coal2: '#252118', coal3: '#332E24', coal4: '#443C2E',
  gold: '#C9963C', gold2: '#DBA84A', gold3: '#ECC870',
  goldPale: 'rgba(201,150,60,0.12)', goldLt: 'rgba(201,150,60,0.25)',
  ink: '#F7F2EA', ink2: '#C4B8A8', ink3: '#9A8C7C', ink4: '#7A6E5E', ink5: '#5A4E3E',
  green: '#5CB882', red: '#D04B3B',
  border: 'rgba(255,255,255,0.08)',
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.ink4, textTransform: 'uppercase' as const, marginBottom: 12 }}>{children}</div>
)

const GoldSep = () => <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${C.gold}, transparent)`, borderRadius: 1, margin: '16px 0' }} />

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: C.coal2, borderRadius: 18, padding: 24,
    border: `1.5px solid ${C.border}`,
    boxShadow: '0 2px 14px rgba(26,22,18,0.15)',
    ...style,
  }}>{children}</div>
)

const ColorSwatch = ({ hex, name, rgb, usage }: { hex: string; name: string; rgb: string; usage: string }) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
    <div style={{
      width: 56, height: 56, borderRadius: 14, background: hex,
      border: `1px solid rgba(255,255,255,0.1)`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      flexShrink: 0,
    }} />
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{name}</div>
      <div style={{ fontSize: 12, color: C.gold, fontFamily: 'monospace', marginTop: 2 }}>{hex}</div>
      <div style={{ fontSize: 11, color: C.ink4, marginTop: 1 }}>{rgb}</div>
      <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{usage}</div>
    </div>
  </div>
)

const TypoRow = ({ el, font, size, weight, color, colorName, sample }: { el: string; font: string; size: string; weight: string; color: string; colorName: string; sample: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
    <div style={{ width: 100, flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink4 }}>{el}</div>
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: size, fontWeight: weight as any, color: color, fontFamily: font.includes('Cormorant') ? "'Cormorant Garamond', serif" : "'Jost', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sample}</div>
    </div>
    <div style={{ width: 140, flexShrink: 0, textAlign: 'right' as const }}>
      <div style={{ fontSize: 10, color: C.ink4 }}>{font} · {size} · {weight}</div>
      <div style={{ fontSize: 10, color: C.ink5 }}>{colorName}</div>
    </div>
  </div>
)

const DoItem = ({ type, text }: { type: 'do' | 'dont'; text: string }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
    <span style={{ fontSize: 14, flexShrink: 0 }}>{type === 'do' ? '✅' : '❌'}</span>
    <span style={{ fontSize: 13, color: type === 'do' ? C.ink2 : C.ink3, lineHeight: 1.5 }}>{text}</span>
  </div>
)

export default function BrandPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#111009', fontFamily: "'Jost', sans-serif" }}>

      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: C.coal, padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,150,60,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto' }}>
          <Link href="/investor" style={{ fontSize: 12, color: C.ink4, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
            ← Zurück zum Data Room
          </Link>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '8px 18px', borderRadius: 100, background: C.goldPale, border: `1px solid rgba(201,150,60,0.15)`, marginLeft: 'auto', marginRight: 'auto' }}>
            <span style={{ fontSize: 18 }}>🎨</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: C.gold, textTransform: 'uppercase' as const }}>Corporate Design</span>
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 700, color: C.ink, lineHeight: 1.15, marginBottom: 8 }}>
            Markenidentität
          </h1>
          <p style={{ fontSize: 14, color: C.ink3 }}>
            AlltagsEngel UG · Version 1.0 — März 2026
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ─── 1. Markenkern ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Markenkern</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Mission, Vision & Werte</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, marginBottom: 8 }}>MISSION</div>
              <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.6 }}>Alltagsbegleitung zugänglicher, sicherer und menschlicher machen</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, marginBottom: 8 }}>VISION</div>
              <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.6 }}>Die führende Plattform für Alltagsbegleitung in Deutschland</div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
            {[
              { icon: '🤝', title: 'Vertrauen', desc: 'Der Kern unserer Marke' },
              { icon: '💛', title: 'Wärme', desc: 'Empathische Herangehensweise' },
              { icon: '⭐', title: 'Professionalität', desc: 'Hohe Standards in Qualität' },
              { icon: '🛡️', title: 'Sicherheit', desc: 'Schutz und Zuverlässigkeit' },
            ].map(v => (
              <Card key={v.title} style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{v.title}</div>
                <div style={{ fontSize: 11, color: C.ink3, marginTop: 4 }}>{v.desc}</div>
              </Card>
            ))}
          </div>

          {/* Slogan */}
          <Card style={{ marginTop: 16, textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.ink4, marginBottom: 12 }}>SLOGAN</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontStyle: 'italic', color: C.gold, lineHeight: 1.3 }}>
              Mit Herz für dich da
            </div>
          </Card>

          {/* Markenpersönlichkeit */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 16, justifyContent: 'center' }}>
            {['Premium', 'Vertrauensvoll', 'Warm', 'Empathisch'].map(p => (
              <span key={p} style={{ fontSize: 12, fontWeight: 600, color: C.gold2, background: C.goldPale, border: `1px solid ${C.goldLt}`, borderRadius: 100, padding: '6px 16px' }}>{p}</span>
            ))}
          </div>
        </section>

        {/* ─── 2. Farbpalette ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Farbpalette</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Farben & Verwendung</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', marginBottom: 16 }}>GOLD-PALETTE</div>
              <ColorSwatch hex="#C9963C" name="Gold Primär" rgb="RGB 201, 150, 60" usage="CTAs, Akzente, Highlights" />
              <ColorSwatch hex="#DBA84A" name="Gold 2" rgb="RGB 219, 168, 74" usage="Sekundäre Goldfarbe" />
              <ColorSwatch hex="#ECC870" name="Gold Pale" rgb="RGB 236, 200, 112" usage="Helle Hintergründe" />
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>DUNKLE PALETTE</div>
              <ColorSwatch hex="#1A1612" name="Coal" rgb="RGB 26, 22, 18" usage="Haupthintergrund" />
              <ColorSwatch hex="#252118" name="Dark 2" rgb="RGB 37, 33, 24" usage="Sekundärer Hintergrund" />
              <ColorSwatch hex="#332E24" name="Dark 3" rgb="RGB 51, 46, 36" usage="Akzent dunkle Farbe" />
              <ColorSwatch hex="#443C2E" name="Dark 4" rgb="RGB 68, 60, 46" usage="Helle Dunkel-Variante" />
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>HELLE & AKZENT</div>
              <ColorSwatch hex="#F7F2EA" name="Ink" rgb="RGB 247, 242, 234" usage="Primärtext auf dunkel" />
              <ColorSwatch hex="#C4B8A8" name="Ink 2" rgb="RGB 196, 184, 168" usage="Sekundärer Text" />
              <ColorSwatch hex="#9A8C7C" name="Ink 3" rgb="RGB 154, 140, 124" usage="Tertiärer Text" />
              <ColorSwatch hex="#5CB882" name="Grün" rgb="RGB 92, 184, 130" usage="Erfolg, Bestätigung" />
              <ColorSwatch hex="#D04B3B" name="Rot" rgb="RGB 208, 75, 59" usage="Fehler, Warnung" />
            </Card>
          </div>

          {/* Color bar preview */}
          <div style={{ display: 'flex', borderRadius: 14, overflow: 'hidden', marginTop: 16, height: 48 }}>
            {[C.coal, C.coal2, C.coal3, C.coal4, C.gold, C.gold2, C.gold3, C.ink, C.ink2, C.ink3, C.green, C.red].map((c, i) => (
              <div key={i} style={{ flex: 1, background: c }} />
            ))}
          </div>
        </section>

        {/* ─── 3. Typografie ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Typografie</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Schriften & Hierarchie</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, marginBottom: 12 }}>PRIMÄRSCHRIFT</div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 42, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>Jost</div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: C.ink3, marginTop: 8 }}>Moderne, geometrische Sans-Serif für UI und Texte</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' as const }}>
                {['Regular', 'Medium', 'SemiBold', 'Bold'].map(w => (
                  <span key={w} style={{ fontSize: 11, color: C.ink4, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '3px 8px' }}>{w}</span>
                ))}
              </div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 16, color: C.ink2, marginTop: 16, lineHeight: 1.6 }}>
                ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
                abcdefghijklmnopqrstuvwxyz<br />
                0123456789
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, marginBottom: 12 }}>SERIFENSCHRIFT</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>Cormorant Garamond</div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: C.ink3, marginTop: 8 }}>Elegante Serifenschrift für Akzente und Premium-Elemente</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' as const }}>
                {['Regular', 'Bold'].map(w => (
                  <span key={w} style={{ fontSize: 11, color: C.ink4, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '3px 8px' }}>{w}</span>
                ))}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: C.ink2, marginTop: 16, lineHeight: 1.6 }}>
                ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
                abcdefghijklmnopqrstuvwxyz<br />
                0123456789
              </div>
            </Card>
          </div>

          {/* Typo Hierarchy Table */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>TYPOGRAPHISCHE HIERARCHIE</div>
            <TypoRow el="Überschrift 1" font="Cormorant" size="32px" weight="700" color={C.gold} colorName="Gold" sample="AlltagsEngel Premium" />
            <TypoRow el="Überschrift 2" font="Jost" size="24px" weight="600" color={C.coal} colorName="Coal" sample="Alltagsbegleitung mit Herz" />
            <TypoRow el="Überschrift 3" font="Jost" size="18px" weight="600" color={C.ink} colorName="Ink" sample="Zertifizierte Engel in Ihrer Nähe" />
            <TypoRow el="Fließtext" font="Jost" size="14px" weight="400" color={C.ink} colorName="Ink" sample="Wir verbinden Pflegebedürftige mit qualifizierten Alltagsbegleitern." />
            <TypoRow el="Sekundärtext" font="Jost" size="12px" weight="400" color={C.ink2} colorName="Ink 2" sample="Verfügbar in Frankfurt am Main und Umgebung" />
            <TypoRow el="Untertext" font="Jost" size="10px" weight="400" color={C.ink3} colorName="Ink 3" sample="© 2026 AlltagsEngel UG" />
            <TypoRow el="Button" font="Jost" size="14px" weight="500" color={C.ink} colorName="Coal/White" sample="JETZT BUCHEN" />
          </Card>

          {/* Typo Rules */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>RICHTLINIEN</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Zeilenabstand', value: 'Min. 1,4× der Schriftgröße' },
                { label: 'Buchstabenlaufweite', value: 'Bei Überschriften: 2–4px' },
                { label: 'Zeilenlänge', value: '60–80 Zeichen optimal' },
                { label: 'Großbuchstaben', value: 'Nur für Logo, Labels & Akzente' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>{r.label}</div>
                  <div style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>{r.value}</div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ─── 4. Logo ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Logo & App-Icon</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Logo-System</h2>

          {/* Logo Demo */}
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👼</div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 32, fontWeight: 700, color: C.ink, letterSpacing: 4 }}>ALLTAGSENGEL</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontStyle: 'italic', color: C.gold, marginTop: 4 }}>Mit Herz für dich da</div>
              <div style={{ fontSize: 11, color: C.ink4, marginTop: 4, letterSpacing: '0.08em' }}>PREMIUM ALLTAGSBEGLEITUNG</div>
            </div>
            <GoldSep />
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 8 }}>Vertikale Variante (Standard)</div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>👼</span>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: 2 }}>ALLTAGSENGEL</span>
              </div>
              <div style={{ fontSize: 11, color: C.ink4 }}>Horizontal</div>
            </Card>
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👼</div>
              <div style={{ fontSize: 11, color: C.ink4 }}>Icon only</div>
            </Card>
            <Card style={{ textAlign: 'center', padding: 24, background: C.gold }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>👼</div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, fontWeight: 700, color: C.coal, letterSpacing: 2 }}>ALLTAGSENGEL</div>
              <div style={{ fontSize: 11, color: C.coal3, marginTop: 4 }}>Invertiert</div>
            </Card>
          </div>

          {/* Schutzzone */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>SCHUTZZONE & MINDESTGRÖSSE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Schutzzone</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Min. 0,5 cm Abstand um das gesamte Logo</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Mindestgröße</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>2 cm Breite (vertikal) · 3 cm (horizontal)</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Icon only</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Min. 1 cm × 1 cm für App-Icon</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Favicon</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Min. 32 × 32 px für Web-Browser</div>
              </div>
            </div>
          </Card>

          {/* Do's & Don'ts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: '0.08em', marginBottom: 12 }}>DO&apos;S</div>
              <DoItem type="do" text="Verwende das Logo auf vordefinierten Hintergründen" />
              <DoItem type="do" text="Verwende das Logo mit ausreichend Schutzzone" />
              <DoItem type="do" text="Verwende autorisierte Farben und offizielle Logo-Datei" />
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: '0.08em', marginBottom: 12 }}>DON&apos;TS</div>
              <DoItem type="dont" text="Verzerren oder ungleichmäßig skalieren" />
              <DoItem type="dont" text="Zu nah an anderen Elementen platzieren" />
              <DoItem type="dont" text="Farben ohne Genehmigung ändern" />
              <DoItem type="dont" text="Das Logo selbst nachzeichnen" />
            </Card>
          </div>
        </section>

        {/* ─── 5. Tonalität ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Tonalität & Sprache</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Markenstimme</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { icon: '💛', title: 'Warm', desc: 'Wir sprechen mit Empathie und Verständnis. Unsere Kommunikation ist freundlich und einladend.' },
              { icon: '⭐', title: 'Professionell', desc: 'Wir sind zuverlässig, sachlich und kompetent in unseren Aussagen.' },
              { icon: '🤝', title: 'Vertrauensvoll', desc: 'Wir sind transparent und ehrlich. Sicherheit und Datenschutz haben Priorität.' },
            ].map(v => (
              <Card key={v.title}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{v.title}</div>
                <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>{v.desc}</div>
              </Card>
            ))}
          </div>

          {/* Ansprache */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>ANSPRACHE & ADRESSIERUNG</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Kunden</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Ansprache mit &quot;Sie&quot;</div>
                <div style={{ fontSize: 11, color: C.ink4 }}>Formell, respektvoll</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Engel (Helfer)</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Ansprache mit &quot;Du&quot;</div>
                <div style={{ fontSize: 11, color: C.ink4 }}>Nahbar, kollegial</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Marketing/PR</div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>Flexible Ansprache</div>
                <div style={{ fontSize: 11, color: C.ink4 }}>Je nach Kontext</div>
              </div>
            </div>
          </Card>

          {/* Kommunikationsbeispiele */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, letterSpacing: '0.08em', marginBottom: 16 }}>KOMMUNIKATIONSBEISPIELE</div>
            {[
              { scenario: 'Willkommen', text: 'Willkommen bei AlltagsEngel! Mit Herz für Sie da — hier finden Sie zuverlässige Unterstützung für den Alltag.' },
              { scenario: 'Erfolg', text: 'Großartig! Ihr Profil ist vollständig. Sie sind bereit, die richtige Hilfe zu finden.' },
              { scenario: 'Fehler', text: 'Entschuldigung! Etwas ist schiefgelaufen. Wir kümmern uns darum.' },
            ].map(ex => (
              <div key={ex.scenario} style={{ padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>{ex.scenario}</div>
                <div style={{ fontSize: 13, color: C.ink2, marginTop: 4, fontStyle: 'italic' }}>&quot;{ex.text}&quot;</div>
              </div>
            ))}
          </Card>

          {/* Sprache Do's Don'ts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: '0.08em', marginBottom: 12 }}>SPRACHE — DO&apos;S</div>
              <DoItem type="do" text="Sei klar und verständlich" />
              <DoItem type="do" text="Sei persönlich und menschlich" />
              <DoItem type="do" text="Fokussiere auf den Nutzen" />
              <DoItem type="do" text="Verwende aktive Sprache" />
              <DoItem type="do" text="Sei positiv und motivierend" />
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: '0.08em', marginBottom: 12 }}>SPRACHE — DON&apos;TS</div>
              <DoItem type="dont" text="Unnötig komplexe Begriffe verwenden" />
              <DoItem type="dont" text="Zu formell oder roboterhaft sein" />
              <DoItem type="dont" text="Nur Features aufzählen" />
              <DoItem type="dont" text="Passive Satzstrukturen nutzen" />
              <DoItem type="dont" text="Negative oder ängstliche Sprache nutzen" />
            </Card>
          </div>
        </section>

        {/* ─── 6. Anwendungsbeispiele ─── */}
        <section style={{ marginBottom: 64 }}>
          <SectionLabel>Anwendungsbeispiele</SectionLabel>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.ink, marginBottom: 24 }}>Design in Aktion</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', marginBottom: 12 }}>APP-UI · DARK MODE</div>
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.8 }}>
                Hintergrund: Coal (#1A1612)<br />
                Text: Ink (#F7F2EA) primär, Ink 2 sekundär<br />
                Akzente: Gold (#C9963C) für Buttons & Links<br />
                Divider: Dark 3 (#332E24)<br />
                Success: Green (#5CB882)<br />
                Error: Red (#D04B3B)
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', marginBottom: 12 }}>SOCIAL MEDIA</div>
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.8 }}>
                Instagram: 1080×1080px, Gold-Akzente<br />
                LinkedIn: Coal/Gold Farbschema<br />
                Stories: Jost Bold + Gold CTAs<br />
                Farbmodus: Bevorzugt Dark Mode
              </div>
            </Card>
            <Card style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', marginBottom: 12 }}>VISITENKARTE</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 200, height: 120, borderRadius: 8, background: C.coal, border: `1px solid ${C.coal4}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>👼</span>
                  <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 700, color: C.ink, letterSpacing: 2 }}>ALLTAGSENGEL</div>
                  <div style={{ fontSize: 8, color: C.gold }}>Mit Herz für dich da</div>
                </div>
                <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.8 }}>
                  Format: 85×55mm (Standard)<br />
                  Vorderseite: Logo + Name + Titel<br />
                  Rückseite: Kontaktdaten<br />
                  Farben: Coal + Gold + Cream<br />
                  Schrift: Jost 10pt, Cormorant 14pt
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* ─── 7. Kontakt ─── */}
        <section>
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 8 }}>AlltagsEngel UG</div>
            <div style={{ fontSize: 13, color: C.ink4, marginBottom: 16 }}>(haftungsbeschränkt)</div>
            <div style={{ fontSize: 13, color: C.ink3, lineHeight: 2 }}>
              Schiller Str. 31, 60313 Frankfurt am Main<br />
              Geschäftsführer: Yusuf Ferhat Demir<br />
              info@alltagsengel.care · www.alltagsengel.de
            </div>
            <div style={{ marginTop: 20, fontSize: 11, color: C.ink5 }}>
              Bei Fragen zur Markenidentität kontaktieren Sie die Marketing-Abteilung.
            </div>
          </Card>
        </section>

      </div>

      {/* Footer */}
      <div style={{ background: C.coal, borderTop: '1px solid rgba(201,150,60,0.1)', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: C.ink5 }}>© 2026 AlltagsEngel UG · Markenidentität v1.0</div>
      </div>
    </div>
  )
}
