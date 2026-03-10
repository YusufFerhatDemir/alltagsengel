import { useState } from "react";

// ─── Brand Tokens ───
const COAL = "#1A1612";
const GOLD = "#C9963C";
const CREAM = "#F7F2EA";
const LIGHT_BG = "#F5F0E8";
const DARK_TEXT = "#332E24";
const GREY = "#9A8C7C";
const DARK_CARD = "#2A2520";
const WHITE = "#FFFFFF";

// ─── Icons (SVG inline) ───
const icons = {
  dashboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  ),
  company: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  ),
  pitch: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
  ),
  brand: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
  ),
  market: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
  ),
  finance: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  ),
  product: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  ),
  gtm: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
  ),
  legal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  ),
  metrics: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  ),
  back: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
  ),
  external: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
  ),
};

// ─── KPI Card ───
function KpiCard({ label, value, sub, accent = false }) {
  return (
    <div style={{
      background: accent ? GOLD : DARK_CARD,
      borderRadius: 12, padding: "18px 16px",
      flex: "1 1 140px", minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: accent ? WHITE : GREY, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? WHITE : GOLD, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: accent ? "rgba(255,255,255,0.7)" : GREY, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Section Header ───
function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: CREAM, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{title}</h2>
      {sub && <p style={{ fontSize: 13, color: GREY, margin: "4px 0 0" }}>{sub}</p>}
      <div style={{ width: 60, height: 3, background: GOLD, borderRadius: 2, marginTop: 8 }} />
    </div>
  );
}

// ─── Info Row ───
function InfoRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${DARK_CARD}` }}>
      <span style={{ fontSize: 13, color: GREY }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? GOLD : CREAM }}>{value}</span>
    </div>
  );
}

// ─── Table Component ───
function DataTable({ headers, rows, highlightLast }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${DARK_CARD}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>{headers.map((h, i) => (
            <th key={i} style={{ background: COAL, color: GOLD, padding: "10px 12px", textAlign: i === 0 ? "left" : "right", borderBottom: `2px solid ${GOLD}`, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? DARK_CARD : COAL }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                padding: "9px 12px",
                textAlign: ci === 0 ? "left" : "right",
                color: (highlightLast && ri === rows.length - 1) ? GOLD : CREAM,
                fontWeight: (highlightLast && ri === rows.length - 1) ? 700 : 400,
                whiteSpace: "nowrap",
              }}>{cell}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ─── Progress Bar ───
function ProgressBar({ label, pct, color = GOLD }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: CREAM }}>{label}</span>
        <span style={{ color: GOLD, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: DARK_CARD }}>
        <div style={{ height: 6, borderRadius: 3, background: color, width: `${pct}%`, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// PAGE CONTENT COMPONENTS
// ═══════════════════════════════════════════

function DashboardPage() {
  return (
    <div>
      <SectionHeader title="Executive Dashboard" sub="AlltagsEngel Management Information System" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <KpiCard label="TAM" value="€50 Mrd.+" sub="Dt. Altenpflegemarkt" />
        <KpiCard label="SAM" value="€7,84 Mrd." sub="§45b Budget" accent />
        <KpiCard label="Ungenutzt" value="60%" sub="€4,5 Mrd./Jahr" />
        <KpiCard label="Entlastung" value="€131/Mo." sub="Ab 2026" accent />
      </div>

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Demografischer Rückenwind</h3>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: GREY, marginBottom: 4 }}>Pflegebedürftige 2023</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: CREAM }}>4,96 Mio.</div>
          </div>
          <div style={{ flex: "0 0 40px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 24, color: GOLD }}>→</span>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: GREY, marginBottom: 4 }}>Prognose 2035</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: GOLD }}>6,5 Mio.</div>
          </div>
          <div style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center" }}>
            <div style={{ background: GOLD, borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: WHITE }}>+31%</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 16px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>5-Jahres-Umsatzprognose</h3>
        {[
          { y: "Jahr 1", v: "€18,6K", pct: 1 },
          { y: "Jahr 2", v: "€150K", pct: 6 },
          { y: "Jahr 3", v: "€600K", pct: 24 },
          { y: "Jahr 4", v: "€1,7 Mio.", pct: 68 },
          { y: "Jahr 5", v: "€4,4 Mio.", pct: 100 },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ width: 50, fontSize: 11, color: GREY, flexShrink: 0 }}>{r.y}</span>
            <div style={{ flex: 1, height: 20, borderRadius: 4, background: COAL, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 4,
                background: i === 4 ? `linear-gradient(90deg, ${GOLD}, ${GOLD})` : `linear-gradient(90deg, ${DARK_TEXT}, ${GREY})`,
                width: `${Math.max(r.pct, 3)}%`,
                transition: "width 0.8s ease",
              }} />
            </div>
            <span style={{ width: 70, fontSize: 12, fontWeight: i === 4 ? 700 : 400, color: i === 4 ? GOLD : CREAM, textAlign: "right", flexShrink: 0 }}>{r.v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Provision" value="18%" sub="Pro Buchung" />
        <KpiCard label="Begleiter-Abo" value="€9,99/Mo." sub="Premium Features" />
        <KpiCard label="Bruttomarge" value="60-65%" sub="Zielkorridor" />
        <KpiCard label="Seed-Runde" value="€500K" sub="Pre-Launch" accent />
      </div>
    </div>
  );
}

function CompanyPage() {
  return (
    <div>
      <SectionHeader title="Unternehmensübersicht" sub="AlltagsEngel-Company-Overview.docx — 13 KB" />
      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 16, margin: "0 0 4px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>AlltagsEngel</h3>
        <p style={{ color: GREY, fontSize: 13, margin: "0 0 16px", fontStyle: "italic" }}>Premium Alltagsbegleitung — Mit Herz für dich da</p>
        <p style={{ color: CREAM, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          AlltagsEngel ist ein digitaler Marktplatz, der pflegebedürftige Menschen in Deutschland mit zertifizierten
          Alltagsbegleitern verbindet. Die Plattform nutzt den gesetzlichen Entlastungsbetrag (§45b SGB XI) als
          eingebauten Umsatzmotor — €131/Monat pro Anspruchsberechtigtem, direkt von der Pflegekasse bezahlt.
        </p>
      </div>
      <InfoRow label="Rechtsform" value="GmbH (in Gründung)" />
      <InfoRow label="Gründer" value="Yusuf Cilcioglu" highlight />
      <InfoRow label="Standort" value="Deutschland" />
      <InfoRow label="Branche" value="HealthTech / Elder Care" />
      <InfoRow label="Phase" value="Pre-Launch / Seed" highlight />
      <InfoRow label="Tech-Stack" value="React Native (Expo SDK 54) + Supabase" />
      <InfoRow label="Zielmarkt" value="4,96 Mio. Pflegebedürftige" />

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Zweiseitiger Marktplatz</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, background: COAL, borderRadius: 10, padding: 16, border: `1px solid ${GOLD}` }}>
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>KUNDE (PFLEGEBEDÜRFTIGE)</div>
            <ul style={{ margin: 0, paddingLeft: 16, color: CREAM, fontSize: 12, lineHeight: 1.8 }}>
              <li>Zertifizierte Begleiter finden</li>
              <li>Sofort per App buchen</li>
              <li>100% über §45b abgedeckt</li>
              <li>Verifizierte Bewertungen</li>
            </ul>
          </div>
          <div style={{ flex: 1, minWidth: 200, background: COAL, borderRadius: 10, padding: 16, border: `1px solid ${GREY}` }}>
            <div style={{ fontSize: 12, color: CREAM, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ENGEL (ALLTAGSBEGLEITER)</div>
            <ul style={{ margin: 0, paddingLeft: 16, color: CREAM, fontSize: 12, lineHeight: 1.8 }}>
              <li>Kontinuierlicher Kundenstrom</li>
              <li>82% faire Vergütung</li>
              <li>Voller Versicherungsschutz</li>
              <li>Automatisierte Verwaltung</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PitchDeckPage() {
  return (
    <div>
      <SectionHeader title="Investoren Pitch Deck" sub="2 Versionen verfügbar" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 240, background: DARK_CARD, borderRadius: 12, padding: 20, border: `1px solid ${GREY}` }}>
          <div style={{ fontSize: 11, color: GREY, letterSpacing: 1, marginBottom: 6 }}>KURZVERSION</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: CREAM, marginBottom: 4 }}>12 Slides — Englisch</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 12 }}>PPTX (223 KB) + PDF (152 KB)</div>
          <div style={{ fontSize: 12, color: CREAM, lineHeight: 1.7 }}>Kompakte Investorenpräsentation mit den wichtigsten Kernaussagen.</div>
        </div>
        <div style={{ flex: 1, minWidth: 240, background: DARK_CARD, borderRadius: 12, padding: 20, border: `2px solid ${GOLD}` }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, marginBottom: 6 }}>DETAILLIERT — NEU 2026</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, marginBottom: 4 }}>16 Slides — Deutsch</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 12 }}>PPTX (460 KB) — €131 Entlastungsbetrag</div>
          <div style={{ fontSize: 12, color: CREAM, lineHeight: 1.7 }}>Ausführliche Version mit Unit Economics, Schwungrad-Modell und Risikoanalyse.</div>
        </div>
      </div>

      <h3 style={{ color: GOLD, fontSize: 15, margin: "20px 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Slide-Übersicht (Detaillierte Version)</h3>
      <DataTable
        headers={["Nr.", "Slide", "Kerninhalt"]}
        rows={[
          ["1", "Titel", "AlltagsEngel — Mit Herz verbunden"],
          ["2", "Das Problem", "4,96 Mio. / €4,5 Mrd. ungenutzt / 60%"],
          ["3", "Unsere Lösung", "Zweiseitiger Marktplatz"],
          ["4", "So funktioniert's", "4 Schritte: Download → Betreuen"],
          ["5", "Marktchance", "TAM/SAM/SOM Pyramide"],
          ["6", "Warum jetzt?", "§45b: €131/Mo. — Rechtsanspruch"],
          ["7", "Geschäftsmodell", "18% Provision + Abo + Unit Econ."],
          ["8", "Wettbewerb", "Vergleichsmatrix (6 Kriterien)"],
          ["9", "Traktion", "Meilensteine in 3 Phasen"],
          ["10", "Go-To-Market", "Digital / Partner / Community"],
          ["11", "Finanzprognosen", "5-Jahres-Tabelle + Diagramm"],
          ["12", "Einheitsökonomie", "CAC/LTV + Schwungrad"],
          ["13", "Risiken", "4 Risiken mit Gegenmaßnahmen"],
          ["14", "Team", "CEO + CTO + COO"],
          ["15", "Unser Angebot", "€500K Seed mit Mittelverwendung"],
          ["16", "Abschluss", "Kontakt & Vertraulichkeit"],
        ]}
      />
    </div>
  );
}

function BrandPage() {
  return (
    <div>
      <SectionHeader title="Markenidentität" sub="AlltagsEngel-Brand-Identity-Guidelines.pdf — 23 KB" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { name: "Coal", hex: "#1A1612", light: true },
          { name: "Gold", hex: "#C9963C", light: false },
          { name: "Cream", hex: "#F7F2EA", light: false },
          { name: "Dark Card", hex: "#2A2520", light: true },
        ].map((c, i) => (
          <div key={i} style={{
            flex: "1 1 100px", minWidth: 100, height: 100, borderRadius: 12,
            background: c.hex, display: "flex", flexDirection: "column",
            justifyContent: "flex-end", padding: 10,
            border: `1px solid ${c.light ? GREY : "transparent"}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.light ? CREAM : COAL }}>{c.name}</div>
            <div style={{ fontSize: 10, color: c.light ? GREY : DARK_TEXT }}>{c.hex}</div>
          </div>
        ))}
      </div>

      <InfoRow label="Primärfont (UI)" value="Jost" highlight />
      <InfoRow label="Sekundärfont (Serif)" value="Cormorant Garamond" />
      <InfoRow label="Slogan" value="Mit Herz für dich da" highlight />
      <InfoRow label="Tonalität" value="Premium, vertrauensvoll, warm" />
      <InfoRow label="App-Sprache" value="Deutsch" />

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Wertversprechen</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["100% Versichert", "§45b Integriert", "24/7 Verfügbar"].map((v, i) => (
            <div key={i} style={{
              flex: "1 1 130px", background: COAL, borderRadius: 10, padding: "14px 12px",
              border: `1px solid ${GOLD}`, textAlign: "center",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketPage() {
  return (
    <div>
      <SectionHeader title="Marktanalyse & Geschäftsmodell" sub="AlltagsEngel-Market-Analysis.docx — 18 KB — 10 Abschnitte" />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <KpiCard label="TAM" value="€50 Mrd.+" sub="Gesamter Pflegemarkt" />
        <KpiCard label="SAM" value="€7,84 Mrd." sub="§45b Budget" accent />
        <KpiCard label="SOM (J5)" value="€500 Mio." sub="6,7% Durchdringung" />
      </div>

      <h3 style={{ color: GOLD, fontSize: 15, margin: "20px 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Dokumentabschnitte</h3>
      {[
        "Executive Summary",
        "Marktübersicht (Größe, Demografie, §45b-Tailwind)",
        "Zielgruppen (Familien, Pflegebedürftige, Begleiter)",
        "Wettbewerbslandschaft (Vergleichstabelle + 5 Vorteile)",
        "Geschäftsmodell (Umsatzströme, Unit Economics, Flywheel)",
        "Marktdimensionierung (TAM / SAM / SOM)",
        "Regulatorisches Umfeld (§45b, §53b, DSGVO)",
        "Risikoanalyse & Gegenmaßnahmen",
        "Fazit & Strategische Empfehlungen",
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${DARK_CARD}` }}>
          <span style={{ width: 24, height: 24, borderRadius: 12, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: WHITE, flexShrink: 0 }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: CREAM }}>{s}</span>
        </div>
      ))}

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Wettbewerbsvergleich</h3>
        <DataTable
          headers={["Merkmal", "Trad. Dienste", "Informell", "AlltagsEngel"]}
          rows={[
            ["Digitale Buchung", "Eingeschränkt", "Keine", "Volle Plattform"],
            ["§45b-Integration", "Manuell", "Keine", "Automatisiert"],
            ["Qualitätssicherung", "Variabel", "Keine", "Verifiziert"],
            ["Preistransparenz", "Undurchsichtig", "Informell", "100% transparent"],
            ["Verfügbarkeit", "Geschäftszeiten", "Ad hoc", "24/7 Echtzeit"],
            ["Kassenabrechnung", "Papierbasiert", "Keine", "Voll automatisiert"],
          ]}
          highlightLast
        />
      </div>
    </div>
  );
}

function FinancePage() {
  return (
    <div>
      <SectionHeader title="Finanzprognosen" sub="AlltagsEngel-Financial-Projections.xlsx — 3 Blätter" />

      <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>5-Jahres-Prognose</h3>
      <DataTable
        headers={["Kennzahl", "Jahr 1", "Jahr 2", "Jahr 3", "Jahr 4", "Jahr 5"]}
        rows={[
          ["Aktive Nutzer", "500", "2.500", "10.000", "30.000", "75.000"],
          ["Aktive Begleiter", "50", "200", "800", "2.000", "5.000"],
          ["Monatl. Buchungen", "2K", "10K", "40K", "120K", "300K"],
          ["Provisionsumsatz", "€12K", "€126K", "€504K", "€1,5M", "€3,8M"],
          ["Abo-Umsatz", "€6K", "€24K", "€96K", "€240K", "€600K"],
          ["Gesamtumsatz", "€18K", "€150K", "€600K", "€1,7M", "€4,4M"],
          ["Bruttomarge", "60%", "62%", "63%", "64%", "65%"],
        ]}
        highlightLast
      />

      <h3 style={{ color: GOLD, fontSize: 15, margin: "24px 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Unit Economics Entwicklung</h3>
      <DataTable
        headers={["Jahr", "CAC", "LTV", "LTV/CAC"]}
        rows={[
          ["Jahr 1", "€200", "€146", "0,7x"],
          ["Jahr 2", "€60", "€290", "4,8x"],
          ["Jahr 3", "€25", "€440", "17,6x"],
          ["Jahr 5", "€12", "€730", "60,8x"],
        ]}
        highlightLast
      />

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginTop: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 16px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Mittelverwendung (Seed €500K)</h3>
        <ProgressBar label="Produkt & Technik" pct={35} />
        <ProgressBar label="Marketing & Wachstum" pct={30} />
        <ProgressBar label="Operations & Compliance" pct={20} />
        <ProgressBar label="Betriebskapital" pct={15} />
      </div>
    </div>
  );
}

function ProductPage() {
  return (
    <div>
      <SectionHeader title="Produkt & Technologie" sub="AlltagsEngel-Product-Technology-Overview.pdf — 17 KB" />
      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Tech-Stack</h3>
        {[
          { label: "Frontend", value: "React Native (Expo SDK 54)" },
          { label: "Backend", value: "Supabase (PostgreSQL, Auth, Realtime)" },
          { label: "Matching", value: "KI-gestütztes Begleiter-Matching" },
          { label: "Datenschutz", value: "DSGVO/BDSG-konform" },
          { label: "Hosting", value: "Vercel (Web) + Supabase Cloud" },
          { label: "Plattformen", value: "iOS + Android + Web" },
        ].map((r, i) => <InfoRow key={i} label={r.label} value={r.value} highlight={i % 2 === 0} />)}
      </div>

      <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>App-Architektur</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["Splash", "Rollenauswahl", "Registrierung", "Home", "Buchungen", "Chat", "Profil"].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ background: i < 3 ? GOLD : COAL, borderRadius: 8, padding: "8px 14px", border: `1px solid ${i < 3 ? GOLD : GREY}` }}>
              <span style={{ fontSize: 11, color: i < 3 ? WHITE : CREAM, fontWeight: 600 }}>{s}</span>
            </div>
            {i < 6 && <span style={{ color: GREY, fontSize: 16 }}>→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GtmPage() {
  return (
    <div>
      <SectionHeader title="Go-To-Market-Strategie" sub="AlltagsEngel-Go-To-Market-Strategy.docx — 13 KB" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { title: "Digital & Social", color: GOLD, items: ["Instagram & TikTok", "Google Ads (Pflege-Keywords)", "Facebook (35-55 Demo)", "SEO-Blog-Content"] },
          { title: "Partnerschaften", color: COAL, border: GREY, items: ["Pflegekassen", "Seniorenorganisationen", "Pflegeheime & Kliniken", "Kommunale Sozialdienste"] },
          { title: "Community", color: COAL, border: GOLD, items: ["Botschafter-Programm", "Empfehlungsboni", "Podcast & Newsletter", "Regionale PR"] },
        ].map((col, i) => (
          <div key={i} style={{
            flex: "1 1 200px", background: col.color === GOLD ? GOLD : DARK_CARD,
            borderRadius: 12, padding: 16,
            border: col.border ? `1px solid ${col.border}` : "none",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: col.color === GOLD ? WHITE : GOLD, marginBottom: 10, letterSpacing: 1 }}>{col.title}</div>
            <ul style={{ margin: 0, paddingLeft: 16, color: col.color === GOLD ? WHITE : CREAM, fontSize: 12, lineHeight: 2 }}>
              {col.items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ background: DARK_CARD, borderRadius: 12, padding: 20 }}>
        <h3 style={{ color: GOLD, fontSize: 15, margin: "0 0 12px", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Launch-Phasen</h3>
        {[
          { phase: "Soft Launch", when: "Q2 2026", where: "Berlin & München", target: "100 Beta-Nutzer" },
          { phase: "Expansion", when: "Q3-Q4 2026", where: "Hamburg, Köln, Frankfurt", target: "1.000+ Nutzer" },
          { phase: "Skalierung", when: "2027", where: "Bundesweit", target: "10.000+ Nutzer" },
        ].map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${COAL}` : "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: i === 0 ? GOLD : COAL, border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i === 0 ? WHITE : GOLD, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: CREAM }}>{p.phase}</div>
              <div style={{ fontSize: 11, color: GREY }}>{p.when} — {p.where} — Ziel: {p.target}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalPage() {
  return (
    <div>
      <SectionHeader title="Rechtliches & Compliance" sub="AlltagsEngel-Legal-Compliance-Summary.docx — 17 KB" />
      {[
        { title: "§45b SGB XI — Entlastungsbetrag", desc: "Gesetzlicher Anspruch auf €131/Monat für Alltagsbegleitung. Politisch stabil, überparteilicher Konsens.", status: "Aktiv" },
        { title: "§53b SGB XI — Begleiter-Zertifizierung", desc: "160 Stunden Qualifizierung. AlltagsEngel verifiziert Zertifikate automatisch.", status: "Integriert" },
        { title: "DSGVO / BDSG — Datenschutz", desc: "Volle DSGVO-Konformität. Privacy by Design. Erweiterte Gesundheitsdaten-Schutzmaßnahmen.", status: "Konform" },
        { title: "Plattformhaftung", desc: "Umfassende Plattform-Haftpflichtversicherung. Begleiter-Haftpflicht. Versicherungsgesicherte Mediation.", status: "Abgedeckt" },
      ].map((item, i) => (
        <div key={i} style={{ background: DARK_CARD, borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `3px solid ${GOLD}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: CREAM }}>{item.title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: COAL, padding: "3px 10px", borderRadius: 10, letterSpacing: 1 }}>{item.status}</span>
          </div>
          <p style={{ fontSize: 12, color: GREY, margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
        </div>
      ))}
    </div>
  );
}

function MetricsPage() {
  return (
    <div>
      <SectionHeader title="Wichtige Kennzahlen" sub="Zusammenfassung aller KPIs" />
      <DataTable
        headers={["Kategorie", "Kennzahl", "Wert"]}
        rows={[
          ["Markt", "TAM (Gesamtmarkt)", "€50+ Mrd."],
          ["Markt", "SAM (§45b Budget)", "€7,84 Mrd."],
          ["Markt", "Ungenutztes Budget", "~60% (€4,5 Mrd.)"],
          ["Markt", "Entlastungsbetrag 2026", "€131/Monat"],
          ["Demografie", "Pflegebedürftige (2023)", "4,96 Mio."],
          ["Demografie", "Prognose 2035", "6,5 Mio. (+31%)"],
          ["Geschäftsmodell", "Plattform-Provision", "18%"],
          ["Geschäftsmodell", "Begleiter-Abo", "€9,99/Mo."],
          ["Geschäftsmodell", "Bruttomarge", "60-65%"],
          ["Jahr 5", "Aktive Nutzer", "75.000"],
          ["Jahr 5", "Gesamtumsatz", "€2,49 Mio."],
          ["Jahr 5", "CAC", "€12"],
          ["Jahr 5", "LTV/CAC", "60x+"],
          ["Finanzierung", "Seed-Runde", "€500.000"],
        ]}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// NAVIGATION DATA
// ═══════════════════════════════════════════

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: icons.dashboard, component: DashboardPage },
  { id: "company", label: "Unternehmen", icon: icons.company, component: CompanyPage },
  { id: "pitch", label: "Pitch Deck", icon: icons.pitch, component: PitchDeckPage },
  { id: "brand", label: "Markenidentität", icon: icons.brand, component: BrandPage },
  { id: "market", label: "Marktanalyse", icon: icons.market, component: MarketPage },
  { id: "finance", label: "Finanzen", icon: icons.finance, component: FinancePage },
  { id: "product", label: "Produkt & Tech", icon: icons.product, component: ProductPage },
  { id: "gtm", label: "Go-To-Market", icon: icons.gtm, component: GtmPage },
  { id: "legal", label: "Recht & Compliance", icon: icons.legal, component: LegalPage },
  { id: "metrics", label: "Kennzahlen", icon: icons.metrics, component: MetricsPage },
];

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

export default function MISPortal() {
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ActiveComponent = navItems.find(n => n.id === activePage)?.component || DashboardPage;

  return (
    <div style={{
      display: "flex", minHeight: "100vh", fontFamily: "'Jost', 'Segoe UI', system-ui, sans-serif",
      background: COAL, color: CREAM,
    }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 240, background: "#141110", borderRight: `1px solid ${DARK_CARD}`,
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "fixed", top: 0, bottom: 0, left: sidebarOpen ? 0 : -240,
        zIndex: 100, transition: "left 0.3s ease",
        ...(typeof window !== "undefined" && window.innerWidth >= 768 ? { position: "sticky", left: 0 } : {}),
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 16px", borderBottom: `1px solid ${DARK_CARD}` }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: 1 }}>AlltagsEngel</div>
          <div style={{ fontSize: 10, color: GREY, marginTop: 2, letterSpacing: 2 }}>MANAGEMENT INFORMATION SYSTEM</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActivePage(item.id); setSidebarOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                background: activePage === item.id ? DARK_CARD : "transparent",
                color: activePage === item.id ? GOLD : GREY,
                fontSize: 13, fontWeight: activePage === item.id ? 600 : 400,
                marginBottom: 2, textAlign: "left", fontFamily: "inherit",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (activePage !== item.id) { e.currentTarget.style.background = DARK_CARD; e.currentTarget.style.color = CREAM; } }}
              onMouseLeave={e => { if (activePage !== item.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = GREY; } }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${DARK_CARD}`, textAlign: "center" }}>
          <div style={{ fontSize: 9, color: GREY, letterSpacing: 1, marginBottom: 4 }}>VERTRAULICH</div>
          <div style={{ fontSize: 9, color: GREY }}>März 2026 — v2.0</div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${DARK_CARD}` }}>
            <div style={{ fontSize: 9, color: GREY, letterSpacing: 0.5 }}>powered by</div>
            <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{
              fontSize: 13, fontWeight: 700, color: GOLD, textDecoration: "none", letterSpacing: 2,
            }}>DRIPFY.APP</a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          padding: "14px 20px", borderBottom: `1px solid ${DARK_CARD}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, background: COAL, zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "none", border: "none", color: GOLD, cursor: "pointer", padding: 4,
                display: typeof window !== "undefined" && window.innerWidth >= 768 ? "none" : "block",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <span style={{ fontSize: 14, color: CREAM, fontWeight: 600 }}>
              {navItems.find(n => n.id === activePage)?.label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a
              href="https://alltagsengel.vercel.app/kunde/home"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                color: GOLD, textDecoration: "none", padding: "6px 12px",
                borderRadius: 6, border: `1px solid ${GOLD}`,
              }}
            >
              App öffnen {icons.external}
            </a>
          </div>
        </header>

        {/* Page Content */}
        <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
          <ActiveComponent />

          {/* Bottom footer on every page */}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${DARK_CARD}`, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: GREY, letterSpacing: 1 }}>
              AlltagsEngel UG — Investor Data Room — VERTRAULICH
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 9, color: GREY }}>powered by </span>
              <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: GOLD, textDecoration: "none", letterSpacing: 1 }}>DRIPFY.APP</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
