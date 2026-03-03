module.exports=[64166,a=>{"use strict";var b=a.i(63921),c=a.i(96896),d=a.i(19957),e=a.i(54481),f=a.i(45108);let g=[{icon:"chart",text:"Zeige mir die aktuellen Finanzkennzahlen",module:"finance"},{icon:"trending",text:"Wie groß ist unser adressierbarer Markt?",module:"market"},{icon:"shield",text:"Welche ISO 9001 Audits stehen an?",module:"quality"},{icon:"files",text:"Welche Dokumente brauchen eine Überprüfung?",module:"documents"},{icon:"users",text:"Wie viele aktive Engel haben wir?",module:"team"},{icon:"truck",text:"Status der Lieferantenbewertungen?",module:"supply-chain"},{icon:"banknote",text:"Was ist der aktuelle Entlastungsbetrag?",module:"market"},{icon:"target",text:"Erstelle einen Investorenbericht",module:"dataroom"}];function h(){let[a,h]=(0,c.useState)([{id:"1",role:"assistant",content:"Willkommen beim AlltagsEngel KI-Assistenten! Ich habe Zugriff auf alle MIS-Module und kann Ihnen bei Analysen, Berichten und Entscheidungen helfen.\n\nWas möchten Sie wissen?",timestamp:new Date}]),[i,j]=(0,c.useState)(""),[k,l]=(0,c.useState)(!1),m=(0,c.useRef)(null);function n(a){let b=a||i;if(!b.trim())return;let c={id:Date.now().toString(),role:"user",content:b,timestamp:new Date};h(a=>[...a,c]),j(""),l(!0),setTimeout(()=>{let a,{response:c,sources:d}=(a=b.toLowerCase()).includes("entlastung")||a.includes("§45b")||a.includes("131")?{response:`Der Entlastungsbetrag nach \xa745b SGB XI betr\xe4gt seit 2026:

• Monatlich: €131 pro Person
• J\xe4hrlich: €1.572 pro Person
• Anspruchsberechtigte: 4,96 Millionen (PG 1-5)
• Gesamtvolumen: €7,84 Mrd. p.a.

Ca. 60% dieses Budgets bleibt aktuell ungenutzt — das sind €4,7 Mrd. j\xe4hrlich. AlltagsEngel adressiert genau diese L\xfccke durch einfache digitale Buchung und \xa745b-Integration.`,sources:[{title:"Marktanalyse",module:"market"},{title:"Financial Projections",module:"finance"}]}:a.includes("finanz")||a.includes("umsatz")||a.includes("revenue")||a.includes("burn")?{response:`Aktuelle Finanzkennzahlen:

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
• Payback: 2,5 Monate`,sources:[{title:"Financial Projections",module:"finance"},{title:"Pitch Deck",module:"dataroom"}]}:a.includes("markt")||a.includes("tam")||a.includes("sam")||a.includes("wettbewerb")?{response:`Markt\xfcbersicht:

🌍 Marktgr\xf6\xdfe:
• TAM: €24,6 Mrd. (gesamter Pflegemarkt)
• SAM: €7,84 Mrd. (\xa745b Entlastungsbetrag)
• SOM (Jahr 5): €52 Mio.

🏆 Hauptwettbewerber:
• Careship — Plattform, keine \xa745b-Integration
• Pflege.de — Nur Vermittlung
• Home Instead — Premium, wenig digital

✅ Unser Vorteil: Einzige volldigitale Plattform mit direkter \xa745b-Abrechnung.`,sources:[{title:"Market Analysis",module:"market"}]}:a.includes("iso")||a.includes("qualität")||a.includes("audit")?{response:`ISO 9001 QMS-Status:

📋 10 definierte Prozesse:
• 4 Kernprozesse (Registrierung, Buchung, Zertifizierung, Zahlung)
• 2 Supportprozesse (Kundensupport, Datenschutz)
• 4 Managementprozesse (Dokumentenlenkung, Review, Lieferanten, KVP)

⚠️ Status: Aufbauphase
• Prozesslandkarte definiert
• Audit-Planung beginnt Q2 2026
• Zertifizierungsziel: Q4 2026`,sources:[{title:"Quality Processes",module:"quality"}]}:a.includes("dokument")||a.includes("data room")||a.includes("investor")?{response:`Data Room \xdcbersicht:

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

✅ Alle Dokumente sind finalisiert und bereit f\xfcr Investoren.`,sources:[{title:"Data Room Index",module:"dataroom"}]}:a.includes("engel")||a.includes("team")||a.includes("mitarbeiter")?{response:`Team-\xdcbersicht:

Die Benutzerdaten werden aus der Supabase-Datenbank geladen. Aktuelle Rollen:
• Admin — Systemadministratoren
• Engel — Zertifizierte Alltagsbegleiter
• Kunde — Pflegebed\xfcrftige und Angeh\xf6rige

F\xfcr detaillierte Team-Informationen besuchen Sie das Team-Modul im MIS.`,sources:[{title:"Profiles",module:"team"}]}:a.includes("bericht")||a.includes("report")?{response:`Ich kann folgende Berichte f\xfcr Sie erstellen:

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
— "Welche Audits stehen an?"`,sources:[]},e={id:(Date.now()+1).toString(),role:"assistant",content:c,timestamp:new Date,sources:d};h(a=>[...a,e]),l(!1)},1e3+1e3*Math.random())}return(0,c.useEffect)(()=>{m.current?.scrollIntoView({behavior:"smooth"})},[a]),(0,b.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20,height:"calc(100vh - 180px)"},children:[(0,b.jsx)(e.SectionHeader,{title:"KI-Assistent",subtitle:"Intelligente Suche, Analyse und Empfehlungen über alle MIS-Module",icon:"sparkles"}),(0,b.jsxs)("div",{style:{display:"flex",gap:20,flex:1,minHeight:0},children:[(0,b.jsxs)("div",{style:{flex:1,display:"flex",flexDirection:"column",background:d.BRAND.white,borderRadius:14,border:`1px solid ${d.BRAND.border}`,overflow:"hidden"},children:[(0,b.jsxs)("div",{style:{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16},children:[a.map(a=>(0,b.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"user"===a.role?"flex-end":"flex-start",gap:4},children:[(0,b.jsx)("div",{style:{maxWidth:"80%",padding:"12px 16px",borderRadius:14,background:"user"===a.role?d.BRAND.gold:d.BRAND.light,color:"user"===a.role?d.BRAND.white:d.BRAND.coal,fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"},children:a.content}),a.sources&&a.sources.length>0&&(0,b.jsx)("div",{style:{display:"flex",gap:4,flexWrap:"wrap",maxWidth:"80%"},children:a.sources.map((a,c)=>(0,b.jsx)(e.Badge,{label:`📄 ${a.title}`,color:d.BRAND.info,size:"sm"},c))}),(0,b.jsx)("span",{style:{fontSize:10,color:d.BRAND.muted},children:a.timestamp.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})})]},a.id)),k&&(0,b.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,color:d.BRAND.muted,fontSize:13},children:[(0,b.jsx)("span",{style:{color:d.BRAND.gold},children:(0,b.jsx)(f.MIcon,{name:"sparkles",size:16})}),"Analysiert..."]}),(0,b.jsx)("div",{ref:m})]}),(0,b.jsxs)("div",{style:{padding:"16px 20px",borderTop:`1px solid ${d.BRAND.border}`,display:"flex",gap:10},children:[(0,b.jsx)("input",{value:i,onChange:a=>j(a.target.value),onKeyDown:a=>"Enter"===a.key&&!a.shiftKey&&n(),placeholder:"Stellen Sie eine Frage zu Ihrem Unternehmen...",style:{flex:1,padding:"12px 16px",borderRadius:12,border:`1px solid ${d.BRAND.border}`,fontSize:14,fontFamily:"inherit",outline:"none",background:d.BRAND.light}}),(0,b.jsx)("button",{onClick:()=>n(),disabled:!i.trim(),style:{width:44,height:44,borderRadius:12,background:d.BRAND.gold,border:"none",cursor:i.trim()?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",color:d.BRAND.white,opacity:i.trim()?1:.5},children:(0,b.jsx)(f.MIcon,{name:"send",size:18})})]})]}),(0,b.jsxs)("div",{style:{width:300,display:"flex",flexDirection:"column",gap:12},children:[(0,b.jsx)(e.Card,{title:"Vorschläge",icon:"sparkles",children:(0,b.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6},children:g.map((a,c)=>(0,b.jsxs)("button",{onClick:()=>n(a.text),style:{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${d.BRAND.border}`,background:"none",cursor:"pointer",textAlign:"left",fontSize:12,color:d.BRAND.coal,fontFamily:"inherit",transition:"all 0.15s",lineHeight:1.4},onMouseEnter:a=>{a.currentTarget.style.background=d.BRAND.light,a.currentTarget.style.borderColor=d.BRAND.gold},onMouseLeave:a=>{a.currentTarget.style.background="",a.currentTarget.style.borderColor=d.BRAND.border},children:[(0,b.jsx)("span",{style:{color:d.BRAND.gold,flexShrink:0,marginTop:1},children:(0,b.jsx)(f.MIcon,{name:a.icon,size:14})}),a.text]},c))})}),(0,b.jsx)(e.Card,{title:"Fähigkeiten",icon:"brain",children:(0,b.jsx)("div",{style:{display:"flex",flexDirection:"column",gap:6,fontSize:12,color:d.BRAND.muted},children:["Dokumentensuche & Crawling","Finanzkennzahlen-Analyse","Markt- & Wettbewerbsanalyse","ISO 9001 Compliance-Check","Investorenberichte erstellen","Lieferketten-Übersicht","KPI-Trend-Analyse","Automatische Empfehlungen"].map(a=>(0,b.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[(0,b.jsx)("span",{style:{color:d.BRAND.success},children:(0,b.jsx)(f.MIcon,{name:"check",size:12})})," ",a]},a))})})]})]})]})}a.s(["default",()=>h])}];

//# sourceMappingURL=mnt_alltagsengel-app_app_mis_ai-assistant_page_tsx_84eff1d2._.js.map