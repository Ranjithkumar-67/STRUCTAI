# StructAI — Top-Level Application Architecture

**Version:** 5.0  
**Author:** Ranjith, Structural Engineer  
**Domain:** Steel Column Base Plate Design  
**Codes:** IS 800:2007 · IS 456:2000 · IS 5624:1993 · IS 1367 · IS 875/1893 | AISC 360-22 · ACI 318-19 · AISC DG1 · ASCE 7-22

---

## 1. Project Philosophy

> **One wrong formula reference on a base plate design means redesign, delay, and liability.**

StructAI solves three specific engineering pain points:

| Pain Point | Old Way | StructAI Way |
|---|---|---|
| Code mixing | IS and AISC formulas in same sheet | Strict separate code paths — zero cross-contamination |
| Wrong units | Unit confusion between kN/mm and kip/in | Code selection auto-locks units globally |
| No traceability | Excel black box | Every step traced: Formula → Substitution → Result → Clause |

---

## 2. File Structure

```
structai/
│
├── index.html              ← Shell: landing page + app page + modals (no logic)
│
├── css/
│   └── style.css           ← Complete design system: tokens, layout, components
│
├── js/
│   └── app.js              ← All application logic (STATE, DATA, CALC, RENDER, UI, REPORT)
│
├── lib/
│   ├── indian_code.py      ← Indian code calculation library (IS 800, IS 456, IS 5624 etc.)
│   └── us_code.py          ← US code calculation library (AISC 360-22, ACI 318-19, ASCE 7-22)
│
└── output/
    └── *.html              ← Downloaded HTML reports (generated at runtime)
```

**Total file count: 5 source files.**  
Everything runs in the browser from `index.html`. Python libs are standalone server/automation use.

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Client)                            │
│                                                                     │
│  ┌─────────────────┐    ┌──────────────────────────────────────┐   │
│  │   index.html    │    │              app.js                  │   │
│  │                 │    │                                      │   │
│  │  Landing Page   │    │  ┌─────────┐  ┌──────────────────┐  │   │
│  │  ─ Hero         │    │  │  STATE  │  │   DATA TABLES    │  │   │
│  │  ─ Features     │    │  │ (single │  │  IS_SECTIONS     │  │   │
│  │  ─ Stats        │    │  │  source │  │  US_SECTIONS     │  │   │
│  │                 │    │  │  truth) │  │  IS/US STEEL     │  │   │
│  │  App Page       │    │  └────┬────┘  │  IS/US CONC      │  │   │
│  │  ─ Header       │    │       │       │  IS/US ANCHORS   │  │   │
│  │  ─ Progress     │    │       ▼       │  LC_IS/LRFD/ASD  │  │   │
│  │  ─ Sidebar      │    │  ┌─────────┐  └──────────────────┘  │   │
│  │  ─ Main         │    │  │  CALC   │◄── pure functions      │   │
│  │  ─ Right Panel  │    │  │ calcAll │    (mirrors Python lib) │   │
│  │                 │    │  └────┬────┘                         │   │
│  │  Modals         │    │       │                              │   │
│  │  ─ Plate warn   │    │       ▼                              │   │
│  │  ─ Report dlg   │    │  ┌──────────────────────────────┐   │   │
│  └─────────────────┘    │  │    STEP RENDERERS (s1–s10)   │   │   │
│                         │  │  s1: Code & Project          │   │   │
│  ┌─────────────────┐    │  │  s2: Loads & Combos          │   │   │
│  │   css/style.css │    │  │  s3: Materials               │   │   │
│  │                 │    │  │  s4: Geometry                │   │   │
│  │  CSS Variables  │    │  │  s5: Anchors                 │   │   │
│  │  Layout System  │    │  │  s6: Bearing calc            │   │   │
│  │  Components     │    │  │  s7: Plate tp calc ← KEY     │   │   │
│  │  Typography     │    │  │  s8: Anchor checks           │   │   │
│  └─────────────────┘    │  │  s9: Weld check              │   │   │
│                         │  │  s10: Summary + Report       │   │   │
│  ┌─────────────────┐    │  └──────────────────────────────┘   │   │
│  │   Three.js      │    │                                      │   │
│  │  (landing BG)   │    │  ┌──────────────────────────────┐   │   │
│  │  Wireframe col  │    │  │   UI HELPERS                 │   │   │
│  │  Particle cloud │    │  │  buildProgress()             │   │   │
│  └─────────────────┘    │  │  buildSidebar()              │   │   │
│                         │  │  updateRightPanel()          │   │   │
│                         │  │  updateQuickInfo()           │   │   │
│                         │  └──────────────────────────────┘   │   │
│                         │                                      │   │
│                         │  ┌──────────────────────────────┐   │   │
│                         │  │   REPORT GENERATOR           │   │   │
│                         │  │  generateReport()            │   │   │
│                         │  │  makeSVG()                   │   │   │
│                         │  │  downloadReport()            │   │   │
│                         │  └──────────────────────────────┘   │   │
│                         └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│               PYTHON LIBRARY (Server / Automation)                  │
│                                                                     │
│  lib/indian_code.py              lib/us_code.py                     │
│  ─────────────────                ───────────────                   │
│  _min_plate_size()                _min_plate_size()                 │
│  _confinement_factor()            _confinement_factor()             │
│  _pressure_distribution()         _pressure_distribution()          │
│  _concrete_bearing()              _concrete_bearing()               │
│  _cantilever_lengths()            _cantilever_lengths()             │
│  _plate_thickness()    ◄── IS     _plate_thickness()    ◄── AISC   │
│    γm0 = 1.10                       φ = 0.90                        │
│  _anchor_tension()                _anchor_tension()                 │
│    IS 800 Cl.10.3.3                 ACI 318-19 §17.5.1              │
│    γmb = 1.25                       φ = 0.75                        │
│  _anchor_shear()                  _anchor_shear()                   │
│  _anchor_interaction()            _anchor_concrete_breakout()       │
│    (T/Tdb)²+(V/Vdb)²≤1            _anchor_pullout()                │
│  _embedment_depth()               _anchor_pryout()                  │
│  _weld()                          _anchor_interaction()             │
│    E41XX, IS 816                    (T/φN)^5/3+(V/φV)^5/3≤1        │
│  run_design(IndianInput)          _embedment_depth()                │
│                                   _weld()  E70XX, AISC J2.4         │
│                                   run_design(USInput)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management

Single flat `STATE` object in `app.js`. All functions read and write to it. No framework needed.

```javascript
const STATE = {
  // Code path (controls EVERYTHING)
  code: 'IS800',           // 'IS800' | 'AISC_LRFD' | 'AISC_ASD'

  // Navigation
  step: 1,                 // current step 1-10

  // Column section (all values stored in mm for IS, in for US)
  colType: 'ISMB',
  colDesig: 'ISMB 300',
  d: 300, bf: 140, tf: 13.1, tw: 7.5,

  // Plate (mm or in)
  N: 500, B: 500, tp: 25,

  // Pedestal
  pedL: 600, pedB: 600, pedD: 800,
  supportType: 'PEDESTAL',

  // Loads  (+P = compression, kN or kips)
  P: 800, Mx: 60, Vx: 40,
  loadCombo: 'IS_C2',

  // Materials
  plateFy: 250, plateFu: 410, fck: 30,

  // Anchors
  ancGrade: 'IS 1367 Class 8.8',
  ancDia: 24, ancCount: 4, hef: 400,

  // Weld
  weldSize: 10,

  // Results cache (updated by calcAll())
  results: null,
  reportHTML: '',
};
```

**Key rules:**
- `STATE.code` is the single gate for all code-path decisions
- `isIS()` helper checks `STATE.code === 'IS800'` — used everywhere
- Unit helpers `U.force()`, `U.moment()`, `U.length()`, `U.stress()` auto-return correct labels
- `calcAll()` is pure — reads STATE, returns result object, no side effects

---

## 5. Code Path Separation — The Core Rule

```
STATE.code === 'IS800'
      │
      ├── TRUE  → Indian Code Path
      │           Units:    kN, kN·m, mm, MPa
      │           Sections: IS 808:1989 (ISMB / ISHB)
      │           Bearing:  fp_allow = 0.45 × fck × CF           ← IS 456:2000 Cl.34.4
      │           Plate tp: l × √(2·fp·γm0/Fy)  γm0=1.10        ← IS 800:2007 Cl.7.4.3.1
      │           Anchor T: Ase × fu / γmb       γmb=1.25        ← IS 800:2007 Cl.10.3.3
      │           Anchor V: 0.6×Ase×fu / γmb                     ← IS 800:2007 Cl.10.3.3
      │           T-V:      (T/Tdb)² + (V/Vdb)² ≤ 1             ← IS 800:2007 Cl.10.3.4
      │           Combos:   IS 875 / IS 1893 (7 combos)
      │
      └── FALSE → US Code Path
                  Units:    kips, kip·ft, in, ksi
                  Sections: AISC Manual (W-Shape / HSS)
                  Bearing:  fp_allow = φ×0.85×f'c×CF   φ=0.65   ← AISC 360-22 J8.1
                  Plate tp: l × √(2fp/(φ·Fy))          φ=0.90   ← AISC DG1 Eq.2.6
                  Anchor T: φ×Ase×futa                 φ=0.75   ← ACI 318-19 §17.5.1
                  Anchor V: φ×0.6×Ase×futa             φ=0.65   ← ACI 318-19 §17.7.1
                  T-V:      (T/φNn)^5/3+(V/φVn)^5/3 ≤ 1        ← ACI 318-19 §17.8.3
                  Combos:   ASCE 7-22 §2.3 LRFD / §2.4 ASD
```

---

## 6. Calculation Function Map

All 18 check functions follow the same pattern:  
**Input → Named intermediate steps → CheckResult → Utilisation → Pass/Fail**

### 6.1 Indian Code Functions (`indian_code.py` / inline in `app.js`)

| # | Function | Formula | Clause |
|---|---|---|---|
| 1 | `_min_plate_size()` | N_min=d+100, B_min=bf+100 | IS 800:2007 Cl.7.4.1 |
| 2 | `_confinement_factor()` | CF = min(√(A₂/A₁), 2.0) | IS 456:2000 Cl.34.4 |
| 3 | `_pressure_distribution()` | fp = P/A₁ ± Mx/Z | IS 800:2007 Cl.7.4.4 |
| 4 | `_concrete_bearing()` | fp_allow = 0.45·fck·CF | IS 456:2000 Cl.34.4 |
| 5 | `_cantilever_lengths()` | m=(N−0.95d)/2, n=(B−0.80bf)/2, n'=√(d·bf)/4 | IS 800:2007 Cl.7.4.3 |
| 6 | `_plate_thickness()` | tp = l·√(2·fp·**γm0**/Fy), **γm0=1.10** | IS 800:2007 Cl.7.4.3.1 |
| 7 | `_anchor_tension_demand()` | T = max(0, Mx/lever − P/2) | IS 800:2007 Cl.7.4 |
| 8 | `_anchor_tension()` | Tdb = Ase·fu/**γmb**, **γmb=1.25** | IS 800:2007 Cl.10.3.3 |
| 9 | `_anchor_shear()` | Vdb = 0.6·Ase·fu/γmb | IS 800:2007 Cl.10.3.3 |
| 10 | `_anchor_interaction()` | **(T/Tdb)² + (V/Vdb)² ≤ 1.0** | IS 800:2007 Cl.10.3.4 |
| 11 | `_embedment_depth()` | hef_min = 12d (comp) / 16d (uplift) | IS 5624:1993 |
| 12 | `_weld()` | fw = fu/(√3·γmw), E41XX, γmw=1.25 | IS 800:2007 Cl.10.5.7.1.1 |

### 6.2 US Code Functions (`us_code.py` / inline in `app.js`)

| # | Function | Formula | Clause |
|---|---|---|---|
| 1 | `_min_plate_size()` | N_min=d+4in, B_min=bf+4in | AISC DG1 Eq.2.1 |
| 2 | `_confinement_factor()` | CF = min(√(A₂/A₁), 2.0) | AISC 360-22 J8.1 |
| 3 | `_pressure_distribution()` | fp = P/A₁ ± Mx/Z (ksi) | AISC DG1 §3.1 |
| 4 | `_concrete_bearing()` | fp_allow = **φ**·0.85·f'c·CF, **φ=0.65** | AISC 360-22 J8.1 |
| 5 | `_cantilever_lengths()` | m, n, n' (same formula, inches) | AISC DG1 Eq.2.2/2.3 |
| 6 | `_plate_thickness()` | tp = l·√(2fp/(**φ**·Fy)), **φ=0.90** | AISC DG1 Eq.2.6 |
| 7 | `_anchor_tension()` | φNsa = **φ**·Ase·futa, **φ=0.75** | ACI 318-19 §17.5.1 |
| 8 | `_anchor_shear()` | φVsa = **φ**·0.6·Ase·futa, **φ=0.65** | ACI 318-19 §17.7.1 |
| 9 | `_anchor_concrete_breakout_tension()` | Nb=24·λ·√f'c·hef^1.5 | ACI 318-19 §17.5.2.2a |
| 10 | `_anchor_pullout()` | φNp = 0.70·8·f'c·Abrg | ACI 318-19 §17.5.4.1 |
| 11 | `_anchor_pryout()` | φVcp = 0.70·kcp·Nb (kcp=2 for hef≥2.5in) | ACI 318-19 §17.7.4 |
| 12 | `_anchor_interaction()` | **(T/φNn)^5/3 + (V/φVn)^5/3 ≤ 1.0** | ACI 318-19 §17.8.3 |
| 13 | `_embedment_depth()` | hef_min = 12d / 16d | AISC DG1 |
| 14 | `_weld()` | φRn = 0.75·te·L·fw, E70XX, fw=0.60×70ksi | AISC 360-22 J2.4 |

---

## 7. Unit System — Strict Enforcement

Units are **never mixed**. A single helper object enforces them globally:

```javascript
// In app.js — unit labels change with STATE.code
const U = {
  force:   () => isIS() ? 'kN'    : 'kips',
  moment:  () => isIS() ? 'kN·m'  : 'kip·ft',
  length:  () => isIS() ? 'mm'    : 'in',
  stress:  () => isIS() ? 'MPa'   : 'ksi',
  area:    () => isIS() ? 'mm²'   : 'in²',
};
```

**Internal calculation conversions:**

| Quantity | IS800 Storage | IS800 Calculation | US Storage | US Calculation |
|---|---|---|---|---|
| Axial load | kN (STATE.P) | × 1000 → N | kips (STATE.P) | as-is (kips) |
| Moment | kN·m (STATE.Mx) | × 1,000,000 → N·mm | kip·ft (STATE.Mx) | × 12 → kip·in |
| Length | mm | mm | in | in |
| Stress | MPa (N/mm²) | MPa | ksi | ksi |
| Area | mm² | mm² | in² | in² |

---

## 8. Load Combinations — Code Mapped

### Indian Code (IS 875:2015 / IS 1893:2016)

| ID | Combination | Reference | Uplift |
|---|---|---|---|
| IS_C1 | 1.5(DL + LL) | IS 875 Pt-5 Table 4, C1 | No |
| IS_C2 | 1.5(DL + WL) | IS 875 Pt-5 Table 4, C2 | No |
| IS_C3 | 1.2(DL+LL+WL) | IS 875 Pt-5 Table 4, C3 | No |
| IS_C4 | 1.5(DL + EL) | IS 1893:2016 Cl.6.3.1.2(i) | No |
| IS_C5 | 1.2(DL+LL+EL) | IS 1893:2016 Cl.6.3.1.2(ii) | No |
| IS_C6 | 0.9DL + 1.5WL | IS 875 Pt-5 Table 4, C6 | **Yes** |
| IS_C7 | 0.9DL + 1.5EL | IS 1893:2016 Cl.6.3.1.2 | **Yes** |

### US Code LRFD (ASCE 7-22 §2.3.1)

| ID | Combination | Uplift |
|---|---|---|
| L1 | 1.4D | No |
| L2 | 1.2D + 1.6L | No |
| L3 | 1.2D + 1.0W + L | No |
| L4 | 1.2D + 1.0E + L | No |
| L5 | 0.9D + 1.0W | **Yes** |
| L6 | 0.9D + 1.0E | **Yes** |

### US Code ASD (ASCE 7-22 §2.4.1)

| ID | Combination | Uplift |
|---|---|---|
| A1–A6 | D, D+L, D+Lr, D+0.6W, D+0.7E ... | Varies |
| A7 | 0.6D + 0.6W | **Yes** |

---

## 9. CSS Design System

All visual tokens are CSS custom properties in `style.css`:

```css
:root {
  --col-accent:    #1B4FD8;  /* engineering steel blue */
  --col-pass:      #16A34A;  /* green — safe */
  --col-caution:   #CA8A04;  /* amber — marginal */
  --col-fail:      #DC2626;  /* red — fail */
  --col-is:        #1B4FD8;  /* Indian code badge */
  --col-us:        #B45309;  /* US code badge */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

**Component classes:**

| Class | Purpose |
|---|---|
| `.card` | White bordered content panel |
| `.calc-sheet` | Dark terminal-style calculation block |
| `.badge-is / .badge-us` | Code path flag badges (blue / amber) |
| `.badge-pass / .badge-fail / .badge-redesign` | Status badges |
| `.util-bar / .util-fill.safe/.caution/.fail` | Utilisation progress bars |
| `.combo-row / .combo-row.sel` | Clickable load combination rows |
| `.overall-banner.pass / .redesign` | Big status banner (Step 10) |
| `.info-box.info-1/2/3/4` | Warning boxes (blue/amber/red/dark) |
| `.check-table .pass-row / .fail-row` | Color-coded results table rows |

---

## 10. Step-by-Step Flow

```
Step 1  Code & Project
        ↓ onCodeChange() → resets STATE to correct code defaults, re-renders

Step 2  Loads & Combinations
        ↓ STATE.P / STATE.Mx / STATE.loadCombo updated live

Step 3  Materials
        ↓ Tab-switched: Column Steel | Plate Steel | Concrete
        ↓ chgPS() → updates plateFy → triggers calcAll()

Step 4  Geometry
        ↓ Section dropdown → applySection() → locks dims from IS808/AISC
        ↓ Plate N/B/tp → validates on blur → warns if < N_min/B_min
        ↓ Never auto-corrects. Modal if below minimum.

Step 5  Anchors
        ↓ Grade, diameter, count, edge distance, hef

Steps 6–9  Calculation Display (read-only)
        ↓ calcAll() runs → renders formatted calc sheets
        ↓ Each step shows: formula, substitution, result, utilisation bar, clause

Step 10 Summary & Report
        ↓ All 8 checks in table
        ↓ Overall PASS/REDESIGN banner
        ↓ Redesign recommendations (if failing)
        ↓ generateReport() → HTML with SVG diagram → download
```

---

## 11. HTML Report Structure

The downloadable report (`*.html`) contains:

```
01  Project & Design Basis    ← pn/pd/date, code, method
02  Design Inputs             ← all STATE values
03  Base Plate Diagram        ← SVG plan view: plate, column, anchors, m & n labels
04  Minimum Plate Size        ← IS 800 Cl.7.4.1 / AISC DG1 Eq.2.1
05  Eccentricity & Pressure   ← fp_avg, fp_max, fp_min, fp_design
06  Concrete Bearing          ← CF, fp_allow, η
07  Plate Thickness           ← 8-step trace: m, n, n', l_crit, fp, tp_req, η
08  Complete Check Summary    ← Table: all 8 checks, clause, η%, PASS/FAIL
```

SVG diagram shows:
- Plate outline (N × B)
- Column footprint (d × bf with flanges shaded)
- Anchor bolt circles with dashed hole rings
- Red dimension arrows for cantilever `m`
- Green dimension arrows for cantilever `n`

---

## 12. Python Library Usage

```python
from lib.indian_code import IndianInput, run_design

# Built-in example (ISMB 300, 800 kN, 60 kNm, M30)
result = run_design(IndianInput())

print(result['overall'])        # 'REDESIGN'
print(result['tp_req_mm'])      # 32.56 mm
print(result['CF'])             # 1.2

# Access individual check
for ch in result['checks']:
    print(f"{ch['name']}: η={ch['utilisation_pct']}% → {ch['status']}")
```

```python
from lib.us_code import USInput, run_design

# US example (W14x68, 180 kips, 45 kip·ft, 4000 psi)
result = run_design(USInput())
print(result['overall'])        # 'PASS'
print(result['tp_req_in'])      # 0.9977 in
```

**Each check result dict contains:**
```python
{
  "name":            "Plate Thickness",
  "clause":          "IS 800:2007 Cl.7.4.3.1  (γm0=1.10)",
  "demand":          32.56,           # tp_req in mm
  "capacity":        25.0,            # tp_provided
  "utilisation":     1.3024,
  "utilisation_pct": 130.2,
  "status":          "REDESIGN",
  "unit":            "mm",
  "note":            "tp_req=32.6 mm, provided=25 mm",
  "steps": [
    "Step 1: m  = (500 − 0.95×300)/2  = 107.50 mm",
    "Step 2: n  = (500 − 0.80×140)/2  = 194.00 mm",
    ...
    "Step 8: η = 32.56/25 = 1.3024  ✗ REDESIGN — increase tp to 35 mm"
  ]
}
```

---

## 13. Key Design Decisions

### Why separate code files not one universal file?
Indian and US codes have fundamentally different partial safety factor philosophies:
- IS 800 uses **material partial factors** (γm0, γmb, γmw on resistance side)
- AISC/ACI uses **resistance factors** (φ on capacity) and **load factors** on demand side

Merging them into one function with `if isIndian:` switches would produce a maintenance nightmare and increase audit risk. Separate files means a reviewer can audit the Indian file completely without touching the US file.

### Why store everything in mm internally for Indian code?
IS 800:2007 is entirely in N and mm. Storing in mm:
- Prevents conversion bugs at every formula (the most common source of errors)
- Formula `tp = l × √(2fp·γm0/Fy)` works directly in N and mm² giving mm answer
- Moment conversions are explicit: `STATE.Mx × 1e6` = kN·m → N·mm

### Why tp uses γm0=1.10 (not 1.0 or 1.25)?
IS 800:2007 Cl.7.4.3.1 specifically says:  
> "The thickness of base plate shall not be less than: `tp = l × √(2fp/fy_plate) × √γm0`"

γm0 = 1.10 applies to yielding of plate (Table 5, partial safety factor for material). This is why the original tool showed tp_req = 32.56 mm for the example, and why tp=25 mm fails.

### Why ACI 318-19 uses 5/3 exponent interaction, not IS linear?
ACI 318-19 §17.8.3 defines:
> `(Nua/φNn)^5/3 + (Vua/φVn)^5/3 ≤ 1.0`

The 5/3 exponent is empirical from anchor test data and is more conservative in the transition zone. IS 800:2007 Cl.10.3.4 uses the simpler linear-squared:
> `(T/Tdb)² + (V/Vdb)² ≤ 1.0`

These are not interchangeable and reflect different code philosophies.

### Why no auto-correction of plate dimensions?
Design policy decision: the engineer must confirm every revision. Silent auto-fix masks the problem, produces a misleading calculation, and removes the engineer's professional judgement from the loop. A warning modal is shown instead.

---

## 14. Future Roadmap

| Phase | Feature | Code References |
|---|---|---|
| v5.1 | Stiffener plate design | IS 800:2007 Cl.8.4 / AISC DG1 §4 |
| v5.2 | Grout pad check | IS 456:2000 / ACI 318-19 §26.12 |
| v5.3 | Multi-column comparison | — |
| v6.0 | API endpoint (Flask/FastAPI) | Returns JSON from Python libs |
| v6.1 | Moment connection base plates | IS 800:2007 Cl.12 / AISC DG1 Ch.4 |
| v6.2 | Seismic ductility checks | IS 1893:2016 / AISC 341-22 |
| v7.0 | SaaS subscription model | — |

---

## 15. Code Standards Quick Reference Card

| Check | Indian Clause | Indian Formula | US Clause | US Formula |
|---|---|---|---|---|
| Bearing | IS 456:2000 Cl.34.4 | 0.45·fck·CF | AISC 360-22 J8.1 | φ·0.85·f'c·CF (φ=0.65) |
| Plate tp | IS 800:2007 Cl.7.4.3.1 | l·√(2fp·γm0/Fy) γm0=1.10 | AISC DG1 Eq.2.6 | l·√(2fp/φFy) φ=0.90 |
| Anchor T | IS 800:2007 Cl.10.3.3 | Ase·fu/γmb γmb=1.25 | ACI 318-19 §17.5.1 | φ·Ase·futa φ=0.75 |
| Anchor V | IS 800:2007 Cl.10.3.3 | 0.6·Ase·fu/γmb | ACI 318-19 §17.7.1 | φ·0.6·Ase·futa φ=0.65 |
| T-V | IS 800:2007 Cl.10.3.4 | (T/Tdb)²+(V/Vdb)²≤1 | ACI 318-19 §17.8.3 | (T/φN)^5/3+(V/φV)^5/3≤1 |
| Embedment | IS 5624:1993 | 12d or 16d | ACI 318-19 §17.5.2 | Nb=24λ√f'c·hef^1.5 |
| Weld | IS 800:2007 Cl.10.5.7 | fw=fu/(√3·γmw) E41XX | AISC 360-22 J2.4 | fw=0.60·Fu E70XX φ=0.75 |
| Confinement | IS 456:2000 Cl.34.4 | CF=min(√(A2/A1),2.0) | AISC 360-22 J8.1 | CF=min(√(A2/A1),2.0) |
| Combos | IS 875 / IS 1893 | 7 combinations | ASCE 7-22 §2.3/2.4 | 6 LRFD / 7 ASD |

---

*StructAI v5.0 — Ranjith, Structural Engineer*  
*"Every formula. Every clause. Every unit. Code compliant."*
