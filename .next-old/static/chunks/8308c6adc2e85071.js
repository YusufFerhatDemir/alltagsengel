(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,66888,e=>{"use strict";var n=e.i(41153),t=e.i(84617),i=e.i(80331),r=e.i(43803),l=e.i(36753);let s=[{icon:"chart",text:"Zeige mir die aktuellen Finanzkennzahlen",module:"finance"},{icon:"trending",text:"Wie groß ist unser adressierbarer Markt?",module:"market"},{icon:"shield",text:"Welche ISO 9001 Audits stehen an?",module:"quality"},{icon:"files",text:"Welche Dokumente brauchen eine Überprüfung?",module:"documents"},{icon:"users",text:"Wie viele aktive Engel haben wir?",module:"team"},{icon:"truck",text:"Status der Lieferantenbewertungen?",module:"supply-chain"},{icon:"banknote",text:"Was ist der aktuelle Entlastungsbetrag?",module:"market"},{icon:"target",text:"Erstelle einen Investorenbericht",module:"dataroom"}];function a(){let[e,a]=(0,t.useState)([{id:"1",role:"assistant",content:"Willkommen beim AlltagsEngel KI-Assistenten! Ich habe Zugriff auf alle MIS-Module und kann Ihnen bei Analysen, Berichten und Entscheidungen helfen.\n\nWas möchten Sie wissen?",timestamp:new Date}]),[o,d]=(0,t.useState)(""),[c,u]=(0,t.useState)(!1),g=(0,t.useRef)(null);function h(e){let n=e||o;if(!n.trim())return;let t={id:Date.now().toString(),role:"user",content:n,timestamp:new Date};a(e=>[...e,t]),d(""),u(!0),setTimeout(()=>{let e,{response:t,sources:i}=(e=n.toLowerCase()).includes("entlastung")||e.includes("§45b")||e.includes("131")?{response:`Der Entlastungsbetrag nach \xa745b SGB XI betr\xe4gt seit 2026:

• Monatlich: €131 pro Person
• J\xe4hrlich: €1.572 pro Person
• Anspruchsberechtigte: 4,96 Millionen (PG 1-5)
• Gesamtvolumen: €7,84 Mrd. p.a.

Ca. 60% dieses Budgets bleibt aktuell ungenutzt — das sind €4,7 Mrd. j\xe4hrlich. AlltagsEngel adressiert genau diese L\xfccke durch einfache digitale Buchung und \xa745b-Integration.`,sources:[{title:"Marktanalyse",module:"market"},{title:"Financial Projections",module:"finance"}]}:e.includes("finanz")||e.includes("umsatz")||e.includes("revenue")||e.includes("burn")?{response:`Aktuelle Finanzkennzahlen:

📊 5-Jahres-Prognose:
• 2026: €180K Umsatz (Start)
• 2027: €960K (Break-Even Q3)
• 2028: €3,2M
• 2029: €8,4M
• 2030: €18M

💰 Seed-Runde: €500K bei €2,5M Pre-Money
• Burn Rate: ~€12K/Monat
• Runway: ~42 Monate

📈 Unit Economics:
• CAC: €35 | LTV: €810 | Ratio: 23,1x
• Payback: 2,5 Monate`,sources:[{title:"Financial Projections",module:"finance"},{title:"Pitch Deck",module:"dataroom"}]}:e.includes("markt")||e.includes("tam")||e.includes("sam")||e.includes("wettbewerb")?{response:`Markt\xfcbersicht:

🌍 Marktgr\xf6\xdfe:
• TAM: €24,6 Mrd. (gesamter Pflegemarkt)
• SAM: €7,84 Mrd. (\xa745b Entlastungsbetrag)
• SOM (Jahr 5): €52 Mio.

🏆 Hauptwettbewerber:
• Careship — Plattform, keine \xa745b-Integration
• Pflege.de — Nur Vermittlung
• Home Instead — Premium, wenig digital

✅ Unser Vorteil: Einzige volldigitale Plattform mit direkter \xa745b-Abrechnung.`,sources:[{title:"Market Analysis",module:"market"}]}:e.includes("iso")||e.includes("qualität")||e.includes("audit")?{response:`ISO 9001 QMS-Status:

📋 10 definierte Prozesse:
• 4 Kernprozesse (Registrierung, Buchung, Zertifizierung, Zahlung)
• 2 Supportprozesse (Kundensupport, Datenschutz)
• 4 Managementprozesse (Dokumentenlenkung, Review, Lieferanten, KVP)

⚠️ Status: Aufbauphase
• Prozesslandkarte definiert
• Audit-Planung beginnt Q2 2026
• Zertifizierungsziel: Q4 2026`,sources:[{title:"Quality Processes",module:"quality"}]}:e.includes("dokument")||e.includes("data room")||e.includes("investor")?{response:`Data Room \xdcbersicht:

📁 11 Dokumente in 8 Sektionen:
• Executive Summary (PDF)
• Company Overview (DOCX)
• Pitch Deck DE (PPTX, 16 Folien)
• Brand Identity Guidelines (PDF)
• Market Analysis (DOCX)
• Financial Projections (XLSX)
• Product & Technology (PDF)
• Go-To-Market Strategy (DOCX)
• Legal & Compliance (DOCX)
• Data Room Index (PDF)

✅ Alle Dokumente sind finalisiert und bereit f\xfcr Investoren.`,sources:[{title:"Data Room Index",module:"dataroom"}]}:e.includes("engel")||e.includes("team")||e.includes("mitarbeiter")?{response:`Team-\xdcbersicht:

Die Benutzerdaten werden aus der Supabase-Datenbank geladen. Aktuelle Rollen:
• Admin — Systemadministratoren
• Engel — Zertifizierte Alltagsbegleiter
• Kunde — Pflegebed\xfcrftige und Angeh\xf6rige

F\xfcr detaillierte Team-Informationen besuchen Sie das Team-Modul im MIS.`,sources:[{title:"Profiles",module:"team"}]}:e.includes("bericht")||e.includes("report")?{response:`Ich kann folgende Berichte f\xfcr Sie erstellen:

1. 📊 Investorenbericht — KPIs, Finanzen, Markt
2. 📋 ISO 9001 Management Review
3. 💰 Monatlicher Finanzbericht
4. 📈 Markt- und Wettbewerbsanalyse
5. 👥 Team & HR Report
6. 🚚 Lieferantenbewertung

Welchen Bericht soll ich erstellen?`,sources:[]}:{response:`Vielen Dank f\xfcr Ihre Frage. Ich durchsuche das gesamte MIS:

• 📁 Dokumentenarchiv
• 💰 Finanzdaten
• 📊 Marktanalysen
• 🏗️ Qualit\xe4tsprozesse
• 🚚 Lieferkette

K\xf6nnten Sie Ihre Frage etwas spezifischer formulieren? Zum Beispiel:
— "Wie hoch ist der aktuelle Entlastungsbetrag?"
— "Zeige die 5-Jahres-Prognose"
— "Welche Audits stehen an?"`,sources:[]},r={id:(Date.now()+1).toString(),role:"assistant",content:t,timestamp:new Date,sources:i};a(e=>[...e,r]),u(!1)},1e3+1e3*Math.random())}return(0,t.useEffect)(()=>{g.current?.scrollIntoView({behavior:"smooth"})},[e]),(0,n.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20,height:"calc(100vh - 180px)"},children:[(0,n.jsx)(r.SectionHeader,{title:"KI-Assistent",subtitle:"Intelligente Suche, Analyse und Empfehlungen über alle MIS-Module",icon:"sparkles"}),(0,n.jsxs)("div",{style:{display:"flex",gap:20,flex:1,minHeight:0},children:[(0,n.jsxs)("div",{style:{flex:1,display:"flex",flexDirection:"column",background:i.BRAND.white,borderRadius:14,border:`1px solid ${i.BRAND.border}`,overflow:"hidden"},children:[(0,n.jsxs)("div",{style:{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16},children:[e.map(e=>(0,n.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"user"===e.role?"flex-end":"flex-start",gap:4},children:[(0,n.jsx)("div",{style:{maxWidth:"80%",padding:"12px 16px",borderRadius:14,background:"user"===e.role?i.BRAND.gold:i.BRAND.light,color:"user"===e.role?i.BRAND.white:i.BRAND.coal,fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"},children:e.content}),e.sources&&e.sources.length>0&&(0,n.jsx)("div",{style:{display:"flex",gap:4,flexWrap:"wrap",maxWidth:"80%"},children:e.sources.map((e,t)=>(0,n.jsx)(r.Badge,{label:`📄 ${e.title}`,color:i.BRAND.info,size:"sm"},t))}),(0,n.jsx)("span",{style:{fontSize:10,color:i.BRAND.muted},children:e.timestamp.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})})]},e.id)),c&&(0,n.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,color:i.BRAND.muted,fontSize:13},children:[(0,n.jsx)("span",{style:{color:i.BRAND.gold},children:(0,n.jsx)(l.MIcon,{name:"sparkles",size:16})}),"Analysiert..."]}),(0,n.jsx)("div",{ref:g})]}),(0,n.jsxs)("div",{style:{padding:"16px 20px",borderTop:`1px solid ${i.BRAND.border}`,display:"flex",gap:10},children:[(0,n.jsx)("input",{value:o,onChange:e=>d(e.target.value),onKeyDown:e=>"Enter"===e.key&&!e.shiftKey&&h(),placeholder:"Stellen Sie eine Frage zu Ihrem Unternehmen...",style:{flex:1,padding:"12px 16px",borderRadius:12,border:`1px solid ${i.BRAND.border}`,fontSize:14,fontFamily:"inherit",outline:"none",background:i.BRAND.light}}),(0,n.jsx)("button",{onClick:()=>h(),disabled:!o.trim(),style:{width:44,height:44,borderRadius:12,background:i.BRAND.gold,border:"none",cursor:o.trim()?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",color:i.BRAND.white,opacity:o.trim()?1:.5},children:(0,n.jsx)(l.MIcon,{name:"send",size:18})})]})]}),(0,n.jsxs)("div",{style:{width:300,display:"flex",flexDirection:"column",gap:12},children:[(0,n.jsx)(r.Card,{title:"Vorschläge",icon:"sparkles",children:(0,n.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6},children:s.map((e,t)=>(0,n.jsxs)("button",{onClick:()=>h(e.text),style:{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${i.BRAND.border}`,background:"none",cursor:"pointer",textAlign:"left",fontSize:12,color:i.BRAND.coal,fontFamily:"inherit",transition:"all 0.15s",lineHeight:1.4},onMouseEnter:e=>{e.currentTarget.style.background=i.BRAND.light,e.currentTarget.style.borderColor=i.BRAND.gold},onMouseLeave:e=>{e.currentTarget.style.background="",e.currentTarget.style.borderColor=i.BRAND.border},children:[(0,n.jsx)("span",{style:{color:i.BRAND.gold,flexShrink:0,marginTop:1},children:(0,n.jsx)(l.MIcon,{name:e.icon,size:14})}),e.text]},t))})}),(0,n.jsx)(r.Card,{title:"Fähigkeiten",icon:"brain",children:(0,n.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6,fontSize:12,color:i.BRAND.muted},children:["Dokumentensuche & Crawling","Finanzkennzahlen-Analyse","Markt- & Wettbewerbsanalyse","ISO 9001 Compliance-Check","Investorenberichte erstellen","Lieferketten-Übersicht","KPI-Trend-Analyse","Automatische Empfehlungen"].map(e=>(0,n.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[(0,n.jsx)("span",{style:{color:i.BRAND.success},children:(0,n.jsx)(l.MIcon,{name:"check",size:12})})," ",e]},e))})})]})]})]})}e.s(["default",()=>a])}]);