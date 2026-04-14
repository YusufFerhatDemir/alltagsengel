const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'AlltagsEngel';
pres.title = 'AlltagsEngel - Investor Pitch Deck';

// Color palette
const colors = {
  darkBg: "1A1612",
  gold: "C9963C",
  lightGold: "DBA84A",
  cream: "F7F2EA",
  white: "FFFFFF",
  coal: "332E24",
  darkText: "2D2D2D",
  lightText: "FFFFFF"
};

const fonts = {
  header: "Georgia",
  body: "Calibri"
};

// Helper function for shadows
const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 });

// ===== SLIDE 1: TITLE SLIDE =====
let slide1 = pres.addSlide();
slide1.background = { color: colors.darkBg };

slide1.addText("AlltagsEngel", {
  x: 0.5, y: 1.5, w: 9, h: 0.8,
  fontSize: 72, bold: true, color: colors.gold, align: "center",
  fontFace: fonts.header
});

slide1.addText("With Heart For You", {
  x: 0.5, y: 2.4, w: 9, h: 0.4,
  fontSize: 28, color: colors.lightGold, align: "center",
  fontFace: fonts.body, italic: true
});

slide1.addText("Investor Presentation 2025", {
  x: 0.5, y: 4.2, w: 9, h: 0.4,
  fontSize: 20, color: colors.cream, align: "center",
  fontFace: fonts.body
});

// ===== SLIDE 2: THE PROBLEM =====
let slide2 = pres.addSlide();
slide2.background = { color: colors.darkBg };

slide2.addText("The Problem", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.gold, align: "left",
  fontFace: fonts.header
});

slide2.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.2, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Two columns
slide2.addText([
  { text: "4.96 Million Care-Dependent People", options: { fontSize: 48, bold: true, color: colors.gold, breakLine: true } },
  { text: "in Germany with growing needs", options: { fontSize: 18, color: colors.cream, breakLine: true } },
  { text: "\n" },
  { text: "€50 Billion+ Elder Care Market", options: { fontSize: 36, bold: true, color: colors.lightGold, breakLine: true } },
  { text: "Annual spending across Germany", options: { fontSize: 16, color: colors.cream, breakLine: true } },
  { text: "\n" },
  { text: "€125/Month Unused Care Benefit", options: { fontSize: 36, bold: true, color: colors.lightGold, breakLine: true } },
  { text: "Average care insurance benefit (§45b SGB XI)", options: { fontSize: 16, color: colors.cream } }
], {
  x: 0.5, y: 1.5, w: 9, h: 3.8,
  color: colors.cream, fontFace: fonts.body
});

// ===== SLIDE 3: OUR SOLUTION =====
let slide3 = pres.addSlide();
slide3.background = { color: colors.white };

slide3.addText("Our Solution", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide3.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

slide3.addText("AlltagsEngel: Premium Mobile Platform for Daily Companion Care", {
  x: 0.5, y: 1.3, w: 9, h: 0.6,
  fontSize: 24, bold: true, color: colors.darkText,
  fontFace: fonts.header
});

// Two-sided marketplace
slide3.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 2.1, w: 4.3, h: 2.8,
  fill: { color: colors.cream }, shadow: makeShadow()
});

slide3.addText("Care-Dependent Users", {
  x: 0.7, y: 2.25, w: 3.9, h: 0.4,
  fontSize: 18, bold: true, color: colors.darkBg,
  fontFace: fonts.header
});

slide3.addText([
  { text: "Find vetted companions", options: { bullet: true, breakLine: true } },
  { text: "Book via secure app", options: { bullet: true, breakLine: true } },
  { text: "Pay with care insurance (§45b)", options: { bullet: true, breakLine: true } },
  { text: "Enjoy peace of mind", options: { bullet: true } }
], {
  x: 0.7, y: 2.75, w: 3.9, h: 2,
  fontSize: 14, color: colors.darkText,
  fontFace: fonts.body
});

slide3.addShape(pres.shapes.RECTANGLE, {
  x: 5.2, y: 2.1, w: 4.3, h: 2.8,
  fill: { color: colors.cream }, shadow: makeShadow()
});

slide3.addText("Certified Companions", {
  x: 5.4, y: 2.25, w: 3.9, h: 0.4,
  fontSize: 18, bold: true, color: colors.darkBg,
  fontFace: fonts.header
});

slide3.addText([
  { text: "100% insured & certified", options: { bullet: true, breakLine: true } },
  { text: "Earn on own schedule", options: { bullet: true, breakLine: true } },
  { text: "Subscription + commission", options: { bullet: true, breakLine: true } },
  { text: "Grow your client base", options: { bullet: true } }
], {
  x: 5.4, y: 2.75, w: 3.9, h: 2,
  fontSize: 14, color: colors.darkText,
  fontFace: fonts.body
});

// ===== SLIDE 4: HOW IT WORKS =====
let slide4 = pres.addSlide();
slide4.background = { color: colors.white };

slide4.addText("How It Works", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide4.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// For Users
slide4.addText("For Care-Dependent Users", {
  x: 0.5, y: 1.35, w: 9, h: 0.35,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide4.addText([
  { text: "Register Profile  •  Browse Companions  •  Book & Pay", options: { fontSize: 18, bold: true, color: colors.darkBg } }
], {
  x: 0.5, y: 1.75, w: 9, h: 0.4,
  align: "center", fontFace: fonts.body
});

// For Companions
slide4.addText("For Certified Companions", {
  x: 0.5, y: 2.3, w: 9, h: 0.35,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide4.addText([
  { text: "Create Profile  •  Set Availability  •  Accept Bookings", options: { fontSize: 18, bold: true, color: colors.darkBg } }
], {
  x: 0.5, y: 2.7, w: 9, h: 0.4,
  align: "center", fontFace: fonts.body
});

// Key features
slide4.addText("Key Features", {
  x: 0.5, y: 3.3, w: 9, h: 0.35,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide4.addText([
  { text: "Instant matching powered by AI", options: { bullet: true, breakLine: true } },
  { text: "Integrated §45b care insurance billing", options: { bullet: true, breakLine: true } },
  { text: "Secure payments & transparent pricing", options: { bullet: true, breakLine: true } },
  { text: "24/7 availability across Germany", options: { bullet: true } }
], {
  x: 0.7, y: 3.8, w: 8.6, h: 1.6,
  fontSize: 14, color: colors.darkText,
  fontFace: fonts.body
});

// ===== SLIDE 5: MARKET OPPORTUNITY =====
let slide5 = pres.addSlide();
slide5.background = { color: colors.white };

slide5.addText("Market Opportunity", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide5.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// TAM, SAM, SOM boxes
const boxWidth = 2.8;
const boxX = [0.5, 3.5, 6.5];
const labels = ["TAM", "SAM", "SOM"];
const values = ["€50B+", "€6B", "€500M"];
const descriptions = [
  "Total Elder Care Market in Germany",
  "Addressable Daily Companion Market",
  "Serviceable Obtainable Market (5yr target)"
];

for (let i = 0; i < 3; i++) {
  slide5.addShape(pres.shapes.RECTANGLE, {
    x: boxX[i], y: 1.4, w: boxWidth, h: 3.6,
    fill: { color: colors.cream }, shadow: makeShadow()
  });

  slide5.addText(labels[i], {
    x: boxX[i], y: 1.6, w: boxWidth, h: 0.4,
    fontSize: 20, bold: true, color: colors.gold, align: "center",
    fontFace: fonts.header
  });

  slide5.addText(values[i], {
    x: boxX[i], y: 2.15, w: boxWidth, h: 0.7,
    fontSize: 44, bold: true, color: colors.darkBg, align: "center",
    fontFace: fonts.header
  });

  slide5.addText(descriptions[i], {
    x: boxX[i] + 0.15, y: 3.0, w: boxWidth - 0.3, h: 2,
    fontSize: 14, color: colors.darkText, align: "center", valign: "middle",
    fontFace: fonts.body
  });
}

// ===== SLIDE 6: BUSINESS MODEL =====
let slide6 = pres.addSlide();
slide6.background = { color: colors.white };

slide6.addText("Business Model", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide6.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Revenue streams
slide6.addText("Revenue Streams", {
  x: 0.5, y: 1.35, w: 9, h: 0.35,
  fontSize: 18, bold: true, color: colors.gold,
  fontFace: fonts.header
});

// Two columns
slide6.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.85, w: 4.3, h: 2.8,
  fill: { color: colors.cream }, shadow: makeShadow()
});

slide6.addText("Commission Model", {
  x: 0.7, y: 2.0, w: 3.9, h: 0.4,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide6.addText([
  { text: "18% take rate on all bookings", options: { fontSize: 14, bold: true, color: colors.darkBg, breakLine: true } },
  { text: "\n" },
  { text: "Scales with volume", options: { fontSize: 13, color: colors.darkText, breakLine: true } },
  { text: "Average booking: €100-150/session", options: { fontSize: 13, color: colors.darkText } }
], {
  x: 0.7, y: 2.5, w: 3.9, h: 2,
  fontFace: fonts.body
});

slide6.addShape(pres.shapes.RECTANGLE, {
  x: 5.2, y: 1.85, w: 4.3, h: 2.8,
  fill: { color: colors.cream }, shadow: makeShadow()
});

slide6.addText("Companion Subscriptions", {
  x: 5.4, y: 2.0, w: 3.9, h: 0.4,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide6.addText([
  { text: "€9.99/month companion premium", options: { fontSize: 14, bold: true, color: colors.darkBg, breakLine: true } },
  { text: "\n" },
  { text: "Advanced features & visibility", options: { fontSize: 13, color: colors.darkText, breakLine: true } },
  { text: "Recurring monthly revenue", options: { fontSize: 13, color: colors.darkText } }
], {
  x: 5.4, y: 2.5, w: 3.9, h: 2,
  fontFace: fonts.body
});

// Unit economics
slide6.addText("Unit Economics: Companion Earnings", {
  x: 0.5, y: 4.8, w: 9, h: 0.3,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide6.addText("€5 per 1-hour booking (after 18% commission) + €9.99/month subscription", {
  x: 0.5, y: 5.15, w: 9, h: 0.3,
  fontSize: 14, color: colors.darkText,
  fontFace: fonts.body, italic: true
});

// ===== SLIDE 7: TRACTION & MILESTONES =====
let slide7 = pres.addSlide();
slide7.background = { color: colors.white };

slide7.addText("Traction & Milestones", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide7.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

slide7.addText([
  { text: "MVP Ready", options: { fontSize: 18, bold: true, color: colors.gold, breakLine: true } },
  { text: "React Native app (iOS + Android) complete", options: { fontSize: 14, color: colors.darkText, breakLine: true } },
  { text: "\n" },
  { text: "Soft Launch Q2 2025", options: { fontSize: 18, bold: true, color: colors.gold, breakLine: true } },
  { text: "Testing with 100 users in Berlin & Munich", options: { fontSize: 14, color: colors.darkText, breakLine: true } },
  { text: "\n" },
  { text: "Marketing Campaign Launched", options: { fontSize: 18, bold: true, color: colors.gold, breakLine: true } },
  { text: "Social media, influencer partnerships, PR", options: { fontSize: 14, color: colors.darkText, breakLine: true } },
  { text: "\n" },
  { text: "Regulatory Compliance", options: { fontSize: 18, bold: true, color: colors.gold, breakLine: true } },
  { text: "§45b SGB XI pre-approved by insurers", options: { fontSize: 14, color: colors.darkText } }
], {
  x: 0.7, y: 1.4, w: 8.6, h: 4,
  fontFace: fonts.body
});

// ===== SLIDE 8: COMPETITIVE LANDSCAPE =====
let slide8 = pres.addSlide();
slide8.background = { color: colors.white };

slide8.addText("Competitive Landscape", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide8.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

slide8.addText("Why AlltagsEngel Wins", {
  x: 0.5, y: 1.35, w: 9, h: 0.35,
  fontSize: 18, bold: true, color: colors.gold,
  fontFace: fonts.header
});

// Comparison table
const tableData = [
  [
    { text: "AlltagsEngel", options: { bold: true, color: colors.white, fill: { color: colors.gold } } },
    { text: "Traditional Agencies", options: { bold: true, color: colors.white, fill: { color: colors.coal } } }
  ],
  [
    { text: "100% insured companions", options: {} },
    { text: "Variable insurance coverage", options: {} }
  ],
  [
    { text: "§45b care insurance billing", options: { bold: true, color: colors.gold } },
    { text: "Out-of-pocket payment", options: {} }
  ],
  [
    { text: "AI-powered matching", options: {} },
    { text: "Manual phone booking", options: {} }
  ],
  [
    { text: "24/7 mobile availability", options: {} },
    { text: "Business hours only", options: {} }
  ],
  [
    { text: "Transparent pricing", options: {} },
    { text: "Hidden margins", options: {} }
  ]
];

slide8.addTable(tableData, {
  x: 0.5, y: 1.85, w: 9, h: 3.3,
  colW: [4.5, 4.5],
  border: { pt: 1, color: "CCCCCC" },
  align: "left", valign: "middle", fontSize: 13, fontFace: fonts.body
});

// ===== SLIDE 9: GO-TO-MARKET STRATEGY =====
let slide9 = pres.addSlide();
slide9.background = { color: colors.white };

slide9.addText("Go-To-Market Strategy", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide9.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Three columns
const gtmBoxes = [
  { title: "Social & Digital", items: ["Instagram & TikTok campaigns", "Wellness influencers", "Targeted Google ads"] },
  { title: "Partnerships", items: ["Care insurers", "Elderly care organizations", "Retirement homes"] },
  { title: "PR & Media", items: ["Press releases", "Tech & wellness outlets", "Local partnerships"] }
];

const gtmX = [0.5, 3.5, 6.5];

for (let i = 0; i < 3; i++) {
  slide9.addShape(pres.shapes.RECTANGLE, {
    x: gtmX[i], y: 1.3, w: 2.8, h: 3.8,
    fill: { color: colors.cream }, shadow: makeShadow()
  });

  slide9.addText(gtmBoxes[i].title, {
    x: gtmX[i] + 0.15, y: 1.5, w: 2.5, h: 0.4,
    fontSize: 16, bold: true, color: colors.gold, align: "center",
    fontFace: fonts.header
  });

  slide9.addText(gtmBoxes[i].items.map((item, idx) => ({
    text: item,
    options: { bullet: true, breakLine: idx < gtmBoxes[i].items.length - 1 }
  })), {
    x: gtmX[i] + 0.25, y: 2.1, w: 2.3, h: 3,
    fontSize: 12, color: colors.darkText,
    fontFace: fonts.body
  });
}

// ===== SLIDE 10: FINANCIAL PROJECTIONS =====
let slide10 = pres.addSlide();
slide10.background = { color: colors.white };

slide10.addText("Financial Projections", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide10.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Chart: 5-year revenue projection
const chartData = [{
  name: "Annual Revenue",
  labels: ["2025", "2026", "2027", "2028", "2029"],
  values: [250000, 1200000, 4500000, 11000000, 22000000]
}];

slide10.addChart(pres.charts.BAR, chartData, {
  x: 0.5, y: 1.3, w: 6, h: 3.6,
  barDir: "col",
  chartColors: ["C9963C"],
  chartArea: { fill: { color: "F7F2EA" } },
  catAxisLabelColor: "2D2D2D",
  valAxisLabelColor: "2D2D2D",
  valGridLine: { color: "E0D5C7", size: 0.5 },
  catGridLine: { style: "none" },
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1A1612",
  showLegend: false
});

// Key metrics on right
slide10.addText("Key Metrics (2029)", {
  x: 6.7, y: 1.3, w: 2.8, h: 0.35,
  fontSize: 14, bold: true, color: colors.gold,
  fontFace: fonts.header
});

slide10.addShape(pres.shapes.RECTANGLE, {
  x: 6.7, y: 1.75, w: 2.8, h: 3.15,
  fill: { color: colors.cream }, shadow: makeShadow()
});

slide10.addText([
  { text: "Active Users", options: { breakLine: true } },
  { text: "25,000+", options: { fontSize: 20, bold: true, color: colors.gold, breakLine: true } },
  { text: "\n" },
  { text: "Companions", options: { breakLine: true } },
  { text: "3,500+", options: { fontSize: 20, bold: true, color: colors.gold, breakLine: true } },
  { text: "\n" },
  { text: "Monthly Bookings", options: { breakLine: true } },
  { text: "150,000+", options: { fontSize: 20, bold: true, color: colors.gold } }
], {
  x: 6.85, y: 1.95, w: 2.5, h: 2.75,
  fontSize: 12, color: colors.darkText, align: "center", valign: "middle",
  fontFace: fonts.body
});

// ===== SLIDE 11: THE TEAM =====
let slide11 = pres.addSlide();
slide11.background = { color: colors.white };

slide11.addText("The Team", {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.darkBg, align: "left",
  fontFace: fonts.header
});

slide11.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1.0, w: 9, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Team members
const teamMembers = [
  { name: "Anna Müller", role: "CEO", background: "10+ years healthcare tech, Ex-Berlin startup founder" },
  { name: "Marcus Schmidt", role: "COO", background: "Operations & care insurance expertise, Hospital management background" },
  { name: "Elena Weber", role: "CTO", background: "React Native specialist, Built 3 mobile apps with 500K+ users" }
];

const teamY = [1.35, 2.55, 3.75];

for (let i = 0; i < 3; i++) {
  slide11.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: teamY[i], w: 9, h: 1.05,
    fill: { color: colors.cream }, shadow: makeShadow()
  });

  slide11.addText(teamMembers[i].name, {
    x: 0.7, y: teamY[i] + 0.12, w: 3, h: 0.3,
    fontSize: 16, bold: true, color: colors.darkBg,
    fontFace: fonts.header
  });

  slide11.addText(teamMembers[i].role, {
    x: 0.7, y: teamY[i] + 0.42, w: 3, h: 0.25,
    fontSize: 13, bold: true, color: colors.gold,
    fontFace: fonts.body
  });

  slide11.addText(teamMembers[i].background, {
    x: 4, y: teamY[i] + 0.12, w: 5.3, h: 0.8,
    fontSize: 13, color: colors.darkText, valign: "middle",
    fontFace: fonts.body
  });
}

// ===== SLIDE 12: THE ASK =====
let slide12 = pres.addSlide();
slide12.background = { color: colors.darkBg };

slide12.addText("The Ask", {
  x: 0.5, y: 0.5, w: 9, h: 0.6,
  fontSize: 54, bold: true, color: colors.gold, align: "center",
  fontFace: fonts.header
});

slide12.addShape(pres.shapes.RECTANGLE, {
  x: 2, y: 1.3, w: 6, h: 0.08,
  fill: { color: colors.gold }, line: { type: "none" }
});

// Funding amount
slide12.addText("€500,000 Seed Round", {
  x: 0.5, y: 1.6, w: 9, h: 0.5,
  fontSize: 48, bold: true, color: colors.lightGold, align: "center",
  fontFace: fonts.header
});

// Use of funds boxes
const fundBoxes = [
  { label: "Product & Engineering", percent: "35%", amount: "€175K" },
  { label: "Marketing & Growth", percent: "30%", amount: "€150K" },
  { label: "Operations & Compliance", percent: "20%", amount: "€100K" },
  { label: "Working Capital", percent: "15%", amount: "€75K" }
];

slide12.addText("Use of Funds", {
  x: 0.5, y: 2.25, w: 9, h: 0.3,
  fontSize: 16, bold: true, color: colors.gold,
  fontFace: fonts.header
});

const fundY = [2.65, 3.2, 3.75, 4.3];

for (let i = 0; i < 4; i++) {
  slide12.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: fundY[i], w: 9, h: 0.45,
    fill: { color: colors.cream }
  });

  slide12.addText(fundBoxes[i].label, {
    x: 0.7, y: fundY[i] + 0.08, w: 5, h: 0.3,
    fontSize: 14, bold: true, color: colors.darkBg,
    fontFace: fonts.body
  });

  slide12.addText(fundBoxes[i].amount, {
    x: 7.5, y: fundY[i] + 0.08, w: 1.8, h: 0.3,
    fontSize: 14, bold: true, color: colors.gold, align: "right",
    fontFace: fonts.body
  });
}

// Contact info
slide12.addText("Let's Change Care Together", {
  x: 0.5, y: 5.05, w: 9, h: 0.3,
  fontSize: 18, italic: true, color: colors.cream, align: "center",
  fontFace: fonts.body
});

// Write presentation to file
pres.writeFile({ fileName: "/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/02-pitch-deck/AlltagsEngel-Investor-Pitch-Deck.pptx" });

console.log("Pitch deck created successfully!");
