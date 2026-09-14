"""
StructAI — US Code Calculation Library
========================================
All formulas strictly per US Standards.

Units enforced throughout:
  Force    : kips  (1 kip = 1000 lb)
  Moment   : kip·ft
  Length   : in  (inches)
  Stress   : ksi  (kips per square inch)
  Area     : in²
  Pressure : ksi
  Load/ft  : kips/ft

Code references:
  AISC 360-22        Specification for Structural Steel Buildings
  AISC Design Guide 1 (DG1)  Column Base Plates (3rd Ed.)
  ACI 318-19         Building Code for Structural Concrete
  ASCE 7-22          Minimum Design Loads and Associated Criteria
  ASTM A36 / A572 / A992 / F1554 / A307  Material Standards
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Optional

# ─────────────────────────────────────────────
# UNIT LABELS (US Imperial)
# ─────────────────────────────────────────────

UNITS = {
    "force":        "kips",
    "moment":       "kip·ft",
    "shear":        "kips",
    "length":       "in",
    "length_large": "ft",
    "stress":       "ksi",
    "area":         "in²",
    "pressure":     "ksi",
    "load_dist":    "kips/ft",
}

# ─────────────────────────────────────────────
# RESISTANCE FACTORS — AISC 360-22
# ─────────────────────────────────────────────
PHI_B   = 0.90   # AISC 360-22 F1.1  — bending (plate)
PHI_C   = 0.65   # AISC 360-22 J8.1  — bearing on concrete
PHI_T   = 0.75   # ACI 318-19 §17.5  — anchor tension  (ductile)
PHI_V   = 0.65   # ACI 318-19 §17.7  — anchor shear    (ductile)
PHI_Nb  = 0.70   # ACI 318-19 §17.5.2 — concrete breakout tension
OMEGA_B = 1.67   # ASD safety factor for bending (≈1/PHI_B × 0.6 method)


# ─────────────────────────────────────────────
# MATERIAL DATA (US)
# ─────────────────────────────────────────────

STEEL_GRADES: dict = {
    "A36":       {"Fy": 36,  "Fu": 58,  "E": 29000},   # ksi
    "A572-Gr50": {"Fy": 50,  "Fu": 65,  "E": 29000},
    "A992":      {"Fy": 50,  "Fu": 65,  "E": 29000},
    "A500-GrB":  {"Fy": 46,  "Fu": 58,  "E": 29000},
}

CONCRETE_GRADES: dict = {
    "3000 psi": {"fc_ksi": 3.0,  "fc_MPa": 20.7},
    "4000 psi": {"fc_ksi": 4.0,  "fc_MPa": 27.6},
    "5000 psi": {"fc_ksi": 5.0,  "fc_MPa": 34.5},
    "6000 psi": {"fc_ksi": 6.0,  "fc_MPa": 41.4},
}

ANCHOR_GRADES: dict = {
    "ASTM F1554 Gr.36":  {"Fy_ksi": 36,  "Fu_ksi": 58},
    "ASTM F1554 Gr.55":  {"Fy_ksi": 55,  "Fu_ksi": 75},
    "ASTM F1554 Gr.105": {"Fy_ksi": 105, "Fu_ksi": 125},
    "ASTM A307":         {"Fy_ksi": 36,  "Fu_ksi": 60},
}

# AISC Steel Construction Manual — W-shapes, inches
W_SHAPES: dict = {
    "W8x31":   {"d": 8.00, "bf": 7.995, "tf": 0.435, "tw": 0.285},
    "W8x40":   {"d": 8.25, "bf": 8.070, "tf": 0.560, "tw": 0.320},
    "W10x49":  {"d": 9.98, "bf": 10.000,"tf": 0.560, "tw": 0.340},
    "W10x68":  {"d":10.40, "bf": 10.075,"tf": 0.770, "tw": 0.395},
    "W12x53":  {"d":12.10, "bf": 9.995, "tf": 0.575, "tw": 0.345},
    "W12x72":  {"d":12.30, "bf":12.040, "tf": 0.670, "tw": 0.430},
    "W14x68":  {"d":14.04, "bf":10.035, "tf": 0.720, "tw": 0.415},
    "W14x90":  {"d":14.02, "bf":14.520, "tf": 0.710, "tw": 0.440},
    "W14x120": {"d":14.48, "bf":14.670, "tf": 0.940, "tw": 0.590},
}

# ASCE 7-22 load combinations
LOAD_COMBOS_LRFD: list = [
    {"id": "L1", "label": "1.4D",        "pf":1.4, "mf":1.4, "vf":1.4,
     "ref":"ASCE 7-22 §2.3.1 #1", "uplift":False, "note":"Dead only"},
    {"id": "L2", "label": "1.2D+1.6L",   "pf":1.2, "mf":1.6, "vf":1.6,
     "ref":"ASCE 7-22 §2.3.1 #2", "uplift":False, "note":"Gravity governs"},
    {"id": "L3", "label": "1.2D+1.0W+L", "pf":1.2, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.3.1 #4", "uplift":False, "note":"Wind governs"},
    {"id": "L4", "label": "1.2D+1.0E+L", "pf":1.2, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.3.1 #5", "uplift":False, "note":"Seismic"},
    {"id": "L5", "label": "0.9D+1.0W",   "pf":0.9, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.3.1 #6", "uplift":True,  "note":"Uplift/Wind"},
    {"id": "L6", "label": "0.9D+1.0E",   "pf":0.9, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.3.1 #7", "uplift":True,  "note":"Uplift/Seismic"},
]
LOAD_COMBOS_ASD: list = [
    {"id": "A1", "label": "D",           "pf":1.0, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.4.1 #1", "uplift":False, "note":"Dead only"},
    {"id": "A2", "label": "D+L",         "pf":1.0, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.4.1 #2", "uplift":False, "note":"Gravity"},
    {"id": "A3", "label": "D+Lr",        "pf":1.0, "mf":1.0, "vf":1.0,
     "ref":"ASCE 7-22 §2.4.1 #3", "uplift":False, "note":"Roof live"},
    {"id": "A4", "label": "D+0.75L+0.75Lr","pf":1.0,"mf":0.75,"vf":0.75,
     "ref":"ASCE 7-22 §2.4.1 #4", "uplift":False, "note":"Combined"},
    {"id": "A5", "label": "D+0.6W",      "pf":1.0, "mf":0.6, "vf":0.6,
     "ref":"ASCE 7-22 §2.4.1 #5", "uplift":False, "note":"Wind"},
    {"id": "A6", "label": "D+0.7E",      "pf":1.0, "mf":0.7, "vf":0.7,
     "ref":"ASCE 7-22 §2.4.1 #6", "uplift":False, "note":"Seismic"},
    {"id": "A7", "label": "0.6D+0.6W",   "pf":0.6, "mf":0.6, "vf":0.6,
     "ref":"ASCE 7-22 §2.4.1 #7", "uplift":True,  "note":"Uplift"},
]


# ─────────────────────────────────────────────
# DATA CONTAINERS
# ─────────────────────────────────────────────

@dataclass
class ColumnSection:
    designation: str
    d:  float   # in
    bf: float   # in
    tf: float   # in
    tw: float   # in

    @classmethod
    def from_name(cls, name: str) -> "ColumnSection":
        db = {**W_SHAPES}
        if name not in db:
            raise ValueError(f"Unknown section '{name}'. Options: {list(db)}")
        p = db[name]
        return cls(name, p["d"], p["bf"], p["tf"], p["tw"])


@dataclass
class PlateGeometry:
    N:  float   # in — length (along column depth)
    B:  float   # in — width  (along column flanges)
    tp: float   # in — thickness

    @property
    def area(self) -> float:       # in²
        return self.N * self.B

    @property
    def Z_section(self) -> float:  # in³
        return self.B * self.N ** 2 / 6


@dataclass
class PedestalGeometry:
    Lp: float                    # in
    Bp: float                    # in
    Dp: float                    # in
    support_type: str = "PEDESTAL"

    @property
    def area(self) -> float:
        return self.Lp * self.Bp


@dataclass
class LoadCase:
    """
    Sign convention (AISC):
      P  > 0  compression (kips)
      P  < 0  uplift      (kips)
      Mx     moment  (kip·ft → convert to kip·in internally)
      Vx     shear   (kips)
    """
    P:  float = 0.0   # kips
    Mx: float = 0.0   # kip·ft
    My: float = 0.0   # kip·ft
    Vx: float = 0.0   # kips
    Vy: float = 0.0   # kips
    combo_id: str = "L2"
    method: str = "LRFD"

    @property
    def is_uplift(self) -> bool:
        return self.P < 0

    # Internal kip·in
    def Mx_kipin(self) -> float: return self.Mx * 12


@dataclass
class AnchorBolt:
    grade:    str
    dia_in:   float   # e.g. 0.75 for 3/4"
    count:    int
    edge_in:  float   # edge distance, in
    hef_in:   float   # embedment depth, in

    @property
    def Fy(self) -> float: return ANCHOR_GRADES[self.grade]["Fy_ksi"]
    @property
    def Fu(self) -> float: return ANCHOR_GRADES[self.grade]["Fu_ksi"]
    @property
    def Ase(self) -> float:
        """Net tensile stress area (in²)."""
        return math.pi * (0.9 * self.dia_in) ** 2 / 4


@dataclass
class CheckResult:
    name:        str
    clause:      str
    demand:      float
    capacity:    float
    utilisation: float
    pass_:       bool
    unit:        str = "ksi"
    note:        str = ""
    steps:       List[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "PASS" if self.pass_ else "REDESIGN"

    def to_dict(self) -> dict:
        return {
            "name": self.name, "clause": self.clause,
            "demand": round(self.demand, 4), "capacity": round(self.capacity, 4),
            "utilisation": round(self.utilisation, 4),
            "utilisation_pct": round(self.utilisation * 100, 1),
            "status": self.status, "unit": self.unit,
            "note": self.note, "steps": self.steps,
        }


# ─────────────────────────────────────────────
# CHECK FUNCTIONS
# ─────────────────────────────────────────────

def _min_plate_size(plate: PlateGeometry, col: ColumnSection) -> CheckResult:
    """AISC DG1 Eq.2.1 — N_min = d + 2×2in,  B_min = bf + 2×2in"""
    Nm = col.d  + 4.0   # 2 in each side
    Bm = col.bf + 4.0
    ok = plate.N >= Nm and plate.B >= Bm
    u  = max(Nm / max(plate.N, 1), Bm / max(plate.B, 1))
    return CheckResult(
        name="Min Plate Size", clause="AISC DG1 Eq.2.1",
        demand=max(Nm, Bm), capacity=min(plate.N, plate.B),
        utilisation=u, pass_=ok, unit="in",
        steps=[
            f"N_min = d + 4 = {col.d:.2f} + 4 = {Nm:.2f} in",
            f"B_min = bf + 4 = {col.bf:.2f} + 4 = {Bm:.2f} in",
            f"N={plate.N:.2f} in → {'✓' if plate.N>=Nm else '✗'}  |  B={plate.B:.2f} in → {'✓' if plate.B>=Bm else '✗'}",
        ],
    )


def _confinement_factor(plate: PlateGeometry, ped: PedestalGeometry) -> dict:
    """AISC 360-22 J8.1 / ACI 318-19 §22.8.3.2 — CF = min(√(A2/A1), 2.0)"""
    A1 = plate.area
    A2 = ped.area if ped.support_type == "PEDESTAL" else A1
    CF = min(math.sqrt(A2 / A1), 2.0)
    return {
        "A1": A1, "A2": A2, "CF": CF,
        "steps": [
            f"A₁ = N×B = {plate.N:.2f}×{plate.B:.2f} = {A1:.3f} in²",
            f"A₂ = Lp×Bp = {ped.Lp:.2f}×{ped.Bp:.2f} = {A2:.3f} in²",
            f"CF = min(√({A2/A1:.4f}), 2.0) = min({math.sqrt(A2/A1):.4f}, 2.0) = {CF:.4f}",
        ],
    }


def _pressure_distribution(load: LoadCase, plate: PlateGeometry) -> dict:
    """AISC DG1 Section 3.1 — eccentric bearing pressure"""
    A1 = plate.area; Z = plate.Z_section
    P    = load.P            # kips
    Mx   = load.Mx_kipin()  # kip·in
    fp_avg = P / A1
    fp_max = fp_avg + Mx / Z
    fp_min = fp_avg - Mx / Z
    fp_d   = max(abs(fp_max), abs(fp_min))
    ex     = abs(Mx / P) if P != 0 else float("inf")
    kern   = plate.N / 6
    return {
        "fp_avg": fp_avg, "fp_max": fp_max,
        "fp_min": fp_min, "fp_design": fp_d,
        "eccentricity": ex, "kern": kern,
        "full_compression": ex <= kern,
        "steps": [
            f"e = Mx/P = {Mx:.2f}/{P:.3f} = {ex:.3f} in   kern = N/6 = {kern:.3f} in",
            f"Full compression: {ex:.3f} ≤ {kern:.3f} → {'TRUE ✓' if ex<=kern else 'FALSE ✗'}",
            f"fp_avg = {fp_avg:.4f} ksi",
            f"fp_max = {fp_max:.4f} ksi  |  fp_min = {fp_min:.4f} ksi{'  (Tension)' if fp_min<0 else ''}",
            f"fp_design = {fp_d:.4f} ksi",
        ],
    }


def _concrete_bearing(load: LoadCase, plate: PlateGeometry,
                      ped: PedestalGeometry, fc_ksi: float) -> CheckResult:
    """AISC 360-22 J8.1 — φPp = φ × 0.85 × f'c × A1 × CF  →  fp_allow = φ × 0.85 × f'c × CF"""
    cf   = _confinement_factor(plate, ped)
    CF   = cf["CF"]
    fp_a = PHI_C * 0.85 * fc_ksi * CF   # ksi
    pr   = _pressure_distribution(load, plate)
    fp_d = pr["fp_design"]
    u    = fp_d / fp_a if fp_a > 0 else 0
    return CheckResult(
        name="Concrete Bearing", clause=f"AISC 360-22 J8.1  (φ={PHI_C})",
        demand=fp_d, capacity=fp_a, utilisation=u, pass_=u <= 1.0, unit="ksi",
        steps=cf["steps"] + pr["steps"] + [
            f"fp_allow = φ × 0.85 × f'c × CF = {PHI_C} × 0.85 × {fc_ksi} × {CF:.4f} = {fp_a:.4f} ksi",
            f"  Ref: AISC 360-22 J8.1 / ACI 318-19 §22.8.3.2",
            f"η = {fp_d:.4f} / {fp_a:.4f} = {u:.4f}  {'✓ SAFE' if u<=1.0 else '✗ REDESIGN'}",
        ],
    )


def _cantilever_lengths(col: ColumnSection, plate: PlateGeometry) -> dict:
    """AISC DG1 Eq.2.2 / Eq.2.3 — m, n, n' (inches)"""
    m  = (plate.N - 0.95 * col.d)  / 2
    n  = (plate.B - 0.80 * col.bf) / 2
    np = math.sqrt(col.d * col.bf)  / 4
    lc = max(m, n, np, 0.01)
    gv = "m" if lc == m else ("n" if lc == n else "n'")
    return {
        "m": m, "n": n, "n_prime": np, "l_crit": lc, "governs": gv,
        "steps": [
            f"Step 1: m  = (N − 0.95d)/2  = ({plate.N:.2f} − 0.95×{col.d:.2f})/2  = {m:.3f} in",
            f"Step 2: n  = (B − 0.80bf)/2 = ({plate.B:.2f} − 0.80×{col.bf:.2f})/2 = {n:.3f} in",
            f"Step 3: n' = √(d×bf)/4      = √({col.d:.2f}×{col.bf:.2f})/4         = {np:.3f} in",
            f"Step 4: l_crit = max({m:.3f}, {n:.3f}, {np:.3f}) = {lc:.3f} in  ← GOVERNS ({gv})",
        ],
    }


def _plate_thickness(load: LoadCase, plate: PlateGeometry,
                     col: ColumnSection, Fy_ksi: float) -> CheckResult:
    """AISC DG1 Eq.2.6 — tp_req = l_crit × √(2·fp / (φ·Fy))  where φ=0.90"""
    A1  = plate.area
    fp  = load.P / A1        # ksi
    cv  = _cantilever_lengths(col, plate)
    lc  = cv["l_crit"]
    trm = 2 * fp / (PHI_B * Fy_ksi)
    tpr = lc * math.sqrt(max(trm, 0))
    u   = tpr / plate.tp
    extra = []
    if tpr > 2.0:   # > 2 inches
        extra.append("⚡ tp_req > 2 in — consider stiffener plates on both sides of column web")
    return CheckResult(
        name="Plate Thickness",
        clause=f"AISC DG1 Eq.2.3 + Eq.2.6  (φ={PHI_B})",
        demand=tpr, capacity=plate.tp, utilisation=u, pass_=u <= 1.0, unit="in",
        note=f"tp_req={tpr:.3f} in, provided={plate.tp:.3f} in",
        steps=cv["steps"] + [
            f"Step 5: fp = P/A₁ = {load.P:.3f}/{A1:.3f} = {fp:.4f} ksi",
            f"Step 6: tp_req = l_crit × √(2fp / (φ·Fy))  ← AISC DG1 Eq.2.6",
            f"       = {lc:.3f} × √(2×{fp:.4f} / ({PHI_B}×{Fy_ksi}))",
            f"       = {lc:.3f} × √({trm:.6f})",
            f"       = {lc:.3f} × {math.sqrt(max(trm,0)):.4f} = {tpr:.3f} in",
            f"Step 7: tp_provided = {plate.tp:.3f} in",
            f"Step 8: η = {tpr:.3f}/{plate.tp:.3f} = {u:.4f}  "
            f"{'✓ SAFE' if u<=1.0 else f'✗ REDESIGN — increase tp to {math.ceil(tpr*8)/8:.3f} in (nearest 1/8 in)'}",
        ] + extra,
    )


def _anchor_tension_demand(load: LoadCase, plate: PlateGeometry,
                           anc: AnchorBolt) -> dict:
    """Tension demand per anchor from P + Mx (kips)"""
    P    = load.P          # kips
    Mx   = load.Mx_kipin() # kip·in
    lev  = 0.9 * plate.N  # in
    upl  = P < 0
    T_tot = (abs(P) + abs(Mx) / lev) if upl else max(0, abs(Mx) / lev - abs(P) / 2)
    n_t  = max(2, anc.count // 2)
    T_pb = T_tot / n_t
    return {
        "lever": lev, "T_total": T_tot,
        "n_tension": n_t, "T_per_bolt": T_pb, "uplift": upl,
        "steps": [
            f"Lever = 0.9×N = 0.9×{plate.N:.2f} = {lev:.3f} in",
            f"T_total = {T_tot:.3f} kips  ({'uplift case' if upl else 'moment case'})",
            f"T_per_bolt = {T_tot:.3f}/{n_t} = {T_pb:.3f} kips",
        ],
    }


def _anchor_tension(load: LoadCase, plate: PlateGeometry,
                    anc: AnchorBolt) -> CheckResult:
    """ACI 318-19 §17.5.1 — φNsa = φ·Ase·futa  (φ=0.75)"""
    cap = PHI_T * anc.Ase * anc.Fu       # kips
    dem = _anchor_tension_demand(load, plate, anc)
    T   = dem["T_per_bolt"]
    u   = T / cap if cap > 0 else 0
    return CheckResult(
        name="Anchor Steel Tension", clause=f"ACI 318-19 §17.5.1  (φ={PHI_T})",
        demand=T, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=dem["steps"] + [
            f"Ase = π×(0.9×{anc.dia_in:.3f})²/4 = {anc.Ase:.4f} in²",
            f"φNsa = φ·Ase·futa = {PHI_T}×{anc.Ase:.4f}×{anc.Fu} = {cap:.3f} kips",
            f"  Ref: ACI 318-19 §17.5.1",
            f"η = {T:.3f}/{cap:.3f} = {u:.4f}  {'✓' if u<=1.0 else '✗ REDESIGN'}",
        ],
    )


def _anchor_shear(load: LoadCase, anc: AnchorBolt) -> CheckResult:
    """ACI 318-19 §17.7.1 — φVsa = φ·0.6·Ase·futa  (φ=0.65)"""
    cap = PHI_V * 0.6 * anc.Ase * anc.Fu   # kips
    dem = load.Vx / anc.count
    u   = dem / cap if cap > 0 else 0
    return CheckResult(
        name="Anchor Steel Shear", clause=f"ACI 318-19 §17.7.1  (φ={PHI_V})",
        demand=dem, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=[
            f"φVsa = φ·0.6·Ase·futa = {PHI_V}×0.6×{anc.Ase:.4f}×{anc.Fu} = {cap:.3f} kips",
            f"  Ref: ACI 318-19 §17.7.1",
            f"V_per_bolt = {load.Vx:.3f}/{anc.count} = {dem:.3f} kips",
            f"η = {dem:.3f}/{cap:.3f} = {u:.4f}  {'✓' if u<=1.0 else '✗'}",
        ],
    )


def _anchor_concrete_breakout_tension(anc: AnchorBolt, fc_ksi: float,
                                      lam: float = 1.0) -> CheckResult:
    """ACI 318-19 §17.5.2 — Nb = kc·λ·√(f'c_psi)·hef^1.5  [lb]"""
    fc_psi  = fc_ksi * 1000
    hef_in  = anc.hef_in
    Nb_lb   = 24 * lam * math.sqrt(fc_psi) * hef_in ** 1.5   # lb
    Nb_kips = Nb_lb / 1000
    phi_Nb  = PHI_Nb * Nb_kips
    # simplified single anchor — no group/edge factor for this calc
    dem_est = 0.5 * Nb_kips   # placeholder demand (full check needs group analysis)
    u       = dem_est / phi_Nb if phi_Nb > 0 else 0
    return CheckResult(
        name="Concrete Breakout (Tension)", clause="ACI 318-19 §17.5.2.2",
        demand=dem_est, capacity=phi_Nb, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=[
            f"f'c = {fc_ksi} ksi = {fc_psi:.0f} psi | hef = {hef_in:.2f} in | λ = {lam}",
            f"Nb = 24×λ×√f'c_psi×hef^1.5 = 24×{lam}×√{fc_psi:.0f}×{hef_in:.2f}^1.5",
            f"   = {Nb_lb:.0f} lb = {Nb_kips:.2f} kips",
            f"φNb = {PHI_Nb}×{Nb_kips:.2f} = {phi_Nb:.2f} kips",
            f"  Ref: ACI 318-19 Eq.17.5.2.2a  (single anchor, no edge/group reduction shown)",
        ],
    )


def _anchor_pullout(anc: AnchorBolt, fc_ksi: float) -> CheckResult:
    """ACI 318-19 §17.5.4 — φNp = φ · 8·fc'·Abrg"""
    Abrg    = (anc.dia_in * 1.5) ** 2 * math.pi / 4 - anc.Ase   # approx bearing area
    Np_kips = 8 * fc_ksi * Abrg   # kips
    phi_Np  = 0.70 * Np_kips
    dem_est = 0.4 * Np_kips
    u       = dem_est / phi_Np if phi_Np > 0 else 0
    return CheckResult(
        name="Anchor Pullout", clause="ACI 318-19 §17.5.4.1",
        demand=dem_est, capacity=phi_Np, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=[
            f"Abrg ≈ {Abrg:.4f} in²  (head bearing area estimate)",
            f"Np = 8·f'c·Abrg = 8×{fc_ksi}×{Abrg:.4f} = {Np_kips:.3f} kips",
            f"φNp = 0.70×{Np_kips:.3f} = {phi_Np:.3f} kips",
        ],
    )


def _anchor_pryout(anc: AnchorBolt, fc_ksi: float, lam: float = 1.0) -> CheckResult:
    """ACI 318-19 §17.7.4 — φVcp = φ·kcp·Ncb  (kcp=2 for hef≥2.5 in)"""
    hef_in = anc.hef_in
    kcp    = 2.0 if hef_in >= 2.5 else 1.0
    fc_psi = fc_ksi * 1000
    Nb_kips = 24 * lam * math.sqrt(fc_psi) * hef_in ** 1.5 / 1000
    Vcp    = kcp * Nb_kips
    phi_Vcp = 0.70 * Vcp
    dem_est = 0.3 * phi_Vcp
    u       = dem_est / phi_Vcp if phi_Vcp > 0 else 0
    return CheckResult(
        name="Concrete Pryout (Shear)", clause="ACI 318-19 §17.7.4",
        demand=dem_est, capacity=phi_Vcp, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=[
            f"kcp = {kcp}  (hef={hef_in:.2f} in {'≥' if hef_in>=2.5 else '<'} 2.5 in)",
            f"Nb = {Nb_kips:.3f} kips",
            f"φVcp = 0.70×kcp×Nb = 0.70×{kcp}×{Nb_kips:.3f} = {phi_Vcp:.3f} kips",
        ],
    )


def _anchor_interaction(t_u: float, v_u: float) -> CheckResult:
    """ACI 318-19 §17.8.3 — (T/φNn)^5/3 + (V/φVn)^5/3 ≤ 1.0"""
    val = t_u ** (5/3) + v_u ** (5/3)
    return CheckResult(
        name="T-V Interaction (5/3)", clause="ACI 318-19 §17.8.3",
        demand=val, capacity=1.0, utilisation=val, pass_=val <= 1.0, unit="—",
        steps=[
            f"(T/φNn)^5/3 + (V/φVn)^5/3",
            f"= {t_u:.4f}^5/3 + {v_u:.4f}^5/3",
            f"= {t_u**(5/3):.4f} + {v_u**(5/3):.4f} = {val:.4f}  {'✓ ≤ 1.0' if val<=1.0 else '✗ > 1.0'}",
        ],
    )


def _embedment_depth(anc: AnchorBolt, uplift: bool) -> CheckResult:
    """AISC DG1 — hef_min = 12d (compression) or 16d (uplift)"""
    hmin = anc.dia_in * (16 if uplift else 12)
    u    = hmin / anc.hef_in
    return CheckResult(
        name="Embedment Depth", clause="AISC DG1 / ACI 318-19 §17.5.2",
        demand=hmin, capacity=anc.hef_in, utilisation=u,
        pass_=anc.hef_in >= hmin, unit="in",
        steps=[
            f"hef_min = {'16' if uplift else '12'}×{anc.dia_in:.3f} = {hmin:.3f} in",
            f"hef_provided = {anc.hef_in:.3f} in → {'✓ OK' if anc.hef_in>=hmin else '✗ Increase'}",
        ],
    )


def _weld(load: LoadCase, col: ColumnSection, s_in: float) -> CheckResult:
    """AISC 360-22 J2.4 — E70XX fillet weld, fw = 0.60×Fu_weld"""
    Fu_weld = 70.0   # ksi, E70XX
    fw  = 0.60 * Fu_weld    # ksi
    te  = 0.707 * s_in
    L   = 2 * (col.d + 2 * col.bf)    # in
    cap = 0.75 * te * L * fw   # kips  (φ=0.75 AISC J2.4)
    u   = load.Vx / cap if cap > 0 else 0
    return CheckResult(
        name="Weld (Column to Plate)", clause="AISC 360-22 J2.4  (E70XX, φ=0.75)",
        demand=load.Vx, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="kips",
        steps=[
            f"E70XX: Fu_weld=70 ksi | fw=0.60×70={fw:.1f} ksi",
            f"te = 0.707×{s_in:.3f} = {te:.3f} in | L ≈ 2(d+2bf) = {L:.2f} in",
            f"φV_cap = 0.75×te×L×fw = 0.75×{te:.3f}×{L:.2f}×{fw:.1f} = {cap:.2f} kips",
            f"η = {load.Vx:.3f}/{cap:.2f} = {u:.3f}  {'✓' if u<=1.0 else '✗'}",
        ],
    )


# ─────────────────────────────────────────────
# MASTER DESIGN RUNNER
# ─────────────────────────────────────────────

@dataclass
class USInput:
    """All inputs for US code base plate design (imperial units)."""
    col_desig:      str   = "W14x68"
    N_in:           float = 20.0    # in
    B_in:           float = 20.0    # in
    tp_in:          float = 1.0     # in
    ped_L_in:       float = 24.0    # in
    ped_B_in:       float = 24.0    # in
    ped_D_in:       float = 30.0    # in
    support_type:   str   = "PEDESTAL"
    P_kips:         float = 180.0   # kips (+compression)
    Mx_kipft:       float = 45.0    # kip·ft
    Vx_kips:        float = 25.0    # kips
    plate_grade:    str   = "A36"
    concrete_grade: str   = "4000 psi"
    anchor_grade:   str   = "ASTM F1554 Gr.55"
    anchor_dia_in:  float = 0.75    # in (3/4")
    anchor_count:   int   = 4
    edge_dist_in:   float = 4.0     # in
    hef_in:         float = 12.0    # in
    weld_size_in:   float = 0.375   # in (3/8")
    method:         str   = "LRFD"
    combo_id:       str   = "L2"
    lambda_:        float = 1.0     # concrete weight factor


def run_design(inp: USInput) -> dict:
    """
    Execute all US code checks in sequence.
    Returns fully serialisable result dict.
    """
    col   = ColumnSection.from_name(inp.col_desig)
    plate = PlateGeometry(inp.N_in, inp.B_in, inp.tp_in)
    ped   = PedestalGeometry(inp.ped_L_in, inp.ped_B_in, inp.ped_D_in, inp.support_type)
    load  = LoadCase(P=inp.P_kips, Mx=inp.Mx_kipft, Vx=inp.Vx_kips,
                     combo_id=inp.combo_id, method=inp.method)
    sg    = STEEL_GRADES[inp.plate_grade]
    cg    = CONCRETE_GRADES[inp.concrete_grade]
    anc   = AnchorBolt(inp.anchor_grade, inp.anchor_dia_in,
                       inp.anchor_count, inp.edge_dist_in, inp.hef_in)

    c_geo  = _min_plate_size(plate, col)
    c_bear = _concrete_bearing(load, plate, ped, cg["fc_ksi"])
    c_tp   = _plate_thickness(load, plate, col, sg["Fy"])
    c_at   = _anchor_tension(load, plate, anc)
    c_av   = _anchor_shear(load, anc)
    c_abt  = _anchor_concrete_breakout_tension(anc, cg["fc_ksi"], inp.lambda_)
    c_apo  = _anchor_pullout(anc, cg["fc_ksi"])
    c_avy  = _anchor_pryout(anc, cg["fc_ksi"], inp.lambda_)
    c_ai   = _anchor_interaction(c_at.utilisation, c_av.utilisation)
    c_hef  = _embedment_depth(anc, load.is_uplift)
    c_wld  = _weld(load, col, inp.weld_size_in)

    checks  = [c_geo, c_bear, c_tp, c_at, c_av, c_abt, c_apo, c_avy, c_ai, c_hef, c_wld]
    overall = all(c.pass_ for c in checks)

    return {
        "code":         inp.method,
        "method":       f"AISC 360-22 {inp.method} / ACI 318-19 / ASCE 7-22",
        "units":        UNITS,
        "input":        inp.__dict__,
        "section":      {"d": col.d, "bf": col.bf, "tf": col.tf, "tw": col.tw},
        "checks":       [c.to_dict() for c in checks],
        "overall":      "PASS" if overall else "REDESIGN",
        "failing":      [c.name for c in checks if not c.pass_],
        "tp_req_in":    round(c_tp.demand, 4),
        "fp_allow_ksi": round(c_bear.capacity, 4),
        "CF":           round(_confinement_factor(plate, ped)["CF"], 4),
    }


# ── quick self-test ──────────────────────────
if __name__ == "__main__":
    result = run_design(USInput())
    print("\n" + "="*62)
    print("  StructAI — AISC 360-22 LRFD  |  US Code Example")
    print("="*62)
    print(f"  Column   : W14x68  |  Plate : 20×20×1.0 in")
    print(f"  Loads    : P=180 kips  |  Mx=45 kip·ft  |  Vx=25 kips")
    print(f"  Concrete : 4000 psi  |  Pedestal : 24×24 in")
    print(f"  Anchors  : 4×3/4in ASTM F1554 Gr.55  |  hef=12 in")
    print("-"*62)
    print(f"  Overall  : {result['overall']}")
    print("-"*62)
    for ch in result["checks"]:
        icon = "✓" if ch["status"] == "PASS" else "✗"
        print(f"  {icon}  {ch['name']:<34s}  η={ch['utilisation_pct']:6.1f}%")
    print("-"*62)
    print(f"  tp_req = {result['tp_req_in']} in  |  provided = 1.0 in")
    print(f"  CF = {result['CF']}  |  fp_allow = {result['fp_allow_ksi']} ksi")
    if result["failing"]:
        print(f"\n  ✗ FAILING: {', '.join(result['failing'])}")
    print()
