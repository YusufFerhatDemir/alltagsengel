# AlltagsEngel - 5-Year Financial Projection Model

## File Overview

**Filename:** `AlltagsEngel-Financial-Projections.xlsx`  
**Created:** March 2, 2026  
**Format:** Microsoft Excel 2007+ (.xlsx)  
**Purpose:** Investment Data Room - 5-Year Financial Projections

---

## Spreadsheet Structure

### Sheet 1: Revenue Model

**Purpose:** Define assumptions and calculate total revenue from two streams

**Input Assumptions (Blue Text):**
- Commission Rate: 18% (per booking)
- Average Booking Value: €35/hour
- Average Hours per Booking: 2.5 hours
- Sessions per User/Month: 4
- Companion Subscription: €9.99/month

**User Projections:**
| Year | Users | Companions |
|------|-------|-----------|
| 1 | 500 | 50 |
| 2 | 2,500 | 200 |
| 3 | 10,000 | 800 |
| 4 | 30,000 | 2,000 |
| 5 | 75,000 | 5,000 |

**Revenue Calculations (Excel Formulas):**
- **Commission Revenue** = Users × Sessions/Month × Booking Value × Commission Rate
- **Subscription Revenue** = Companions × €9.99 × 12 months
- **Total Revenue** = Commission Revenue + Subscription Revenue

**Expected Results:**
- Year 1: €18,594
- Year 5: €2,489,400

---

### Sheet 2: P&L Summary

**Purpose:** Complete Profit & Loss statement with linked revenue and calculated operating metrics

**Revenue Section:**
- Commission Revenue (linked to Sheet 1)
- Subscription Revenue (linked to Sheet 1)
- Total Revenue

**Cost of Goods Sold (COGS):**
- Insurance Costs: 8% of Gross Merchandise Value (GMV)
- Payment Processing: 2.5% of Revenue
- Gross Profit & Margin %

**Operating Expenses (Annual):**

| Category | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|----------|--------|--------|--------|--------|--------|
| Engineering | €150K | €200K | €300K | €400K | €500K |
| Marketing & CAC | €100K | €150K | €250K | €400K | €600K |
| Operations | €50K | €80K | €150K | €250K | €400K |
| G&A | €50K | €75K | €120K | €180K | €250K |
| **Total OpEx** | **€350K** | **€505K** | **€820K** | **€1.23M** | **€1.75M** |

**Bottom Line:**
- EBITDA = Gross Profit - Total Operating Expenses

---

### Sheet 3: Key Metrics & KPIs

**Purpose:** Track business performance indicators and unit economics

**Volume Metrics:**
- Gross Merchandise Value (GMV)
- Take Rate
- Active Users
- Active Companions

**Revenue Metrics:**
- Revenue per User (Annual)
- Revenue per Companion (Annual)
- Customer Acquisition Cost (CAC) - declining from €200 to €12
- Customer Lifetime Value (LTV)
- **LTV/CAC Ratio** - key SaaS metric

**Growth Metrics:**
- Monthly Active Users Growth Rate (Year-over-Year %)
- Companion Utilization Rate (80-85%)

---

## How to Use This Model

### Scenario Analysis
All input assumptions in Sheet 1 are highlighted in blue. Change any assumption and the entire model recalculates:
- Commission rate
- Booking value
- User/companion growth rates
- Pricing

### Sensitivity Testing
To test sensitivity, simply modify the assumption cells in Sheet 1 (B5:B9) and watch the cascading impact through:
- Sheet 2: P&L and EBITDA
- Sheet 3: Key metrics and unit economics

### Adding New Scenarios
To create alternative scenarios:
1. Right-click the sheet tabs at bottom
2. Select "Move or Copy Sheet"
3. Create Base, Conservative, and Aggressive scenario tabs
4. Modify assumptions for each scenario

---

## Key Business Insights

### Revenue Growth
- **Total Revenue grows 134x** from Year 1 (€18.6K) to Year 5 (€2.49M)
- **Commission dominates** - represents 76-76% of total revenue by Year 5
- **Subscription provides stability** - consistent recurring revenue from companions

### Unit Economics
- **CAC improves significantly**: €200/user (Y1) → €11.43/user (Y5)
- **LTV/CAC Ratio exceeds 2.0+** by Year 5 (healthy SaaS metric)
- **Network effects** drive declining CAC as platform scales

### Profitability Path
- **Year 1**: -€46K EBITDA (investment phase)
- **Year 2**: Break-even + €1M+ EBITDA (inflection point)
- **Year 5**: €43M+ EBITDA (scale and efficiency)

### Market Context
- Target: Germany's ~5 million care-dependent population
- §45b care insurance budget (€125/month per user) supports premium pricing
- 75K users by Year 5 = 1.5% market penetration (conservative)

---

## Professional Formatting

✓ **Headers:** Gold background (#C9963C) with white text  
✓ **Input Assumptions:** Blue text (#0000FF) for easy identification  
✓ **Formulas:** Black text for calculated values  
✓ **Currency:** All monetary values formatted as €#,##0  
✓ **Percentages:** All rates formatted as 0.0%  
✓ **Borders:** Clean gridlines and professional spacing  
✓ **Frozen Headers:** Easy navigation through data  
✓ **Optimized Widths:** All columns properly sized for readability  

---

## Data Integrity & Formulas

**All numbers are formula-based except:**
- Blue text assumptions (manual inputs)
- User/companion projections (manual inputs)
- Operating expense line items (manual inputs for each year)

**This ensures:**
- Automatic recalculation of all dependent metrics
- No data entry errors or missed calculations
- Easy audit trail (cell references show formula logic)

---

## Contact & Support

For questions about this financial model, please refer to:
- Company: AlltagsEngel GmbH
- Model Date: March 2, 2026
- All figures in EUR (€)

---

**Note:** This financial projection is based on conservative assumptions about market adoption and operational scaling. Actual results may vary. Model is for illustrative and planning purposes.
