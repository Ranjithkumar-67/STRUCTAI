"""
StructAI — Indian Code Calculation Library
===========================================
All formulas strictly per Indian Standards.

Units enforced throughout:
  Force    : kN
  Moment   : kN·m
  Length   : mm
  Stress   : MPa  (= N/mm²)
  Area     : mm²
  Load/m   : kN/m

Code references:
  IS 800:2007  General Construction in Steel — Limit State Method
  IS 456:2000  Plain and Reinforced Concrete
  IS 5624:1993 Foundation Bolts
  IS 1367:2002 Technical Supply Conditions for Threaded Fasteners
  IS 875:2015  Design Loads (Parts 1–5)
  IS 1893:2016 Earthquake Resistant Design
  IS 808:1989  Hot Rolled Steel Sections
  IS 2062:2011 Hot Rolled Structural Steel
  IS 816:1969  Metal Arc Welding
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Optional


# ─────────────────────────────────────────────
# UNIT LABELS (Indian Standard)
# ─────────────────────────────────────────────

UNITS = {
    "force":        "kN",
    "moment":       "kN·m",
    "shear":        "kN",
    "length":       "mm",
    "length_large": "m",
    "stress":       "MPa",
    "area":         "mm²",
    "pressure":     "MPa",
    "load_dist":    "kN/m",
}

# ─────────────────────────────────────────────
# PARTIAL SAFETY FACTORS  IS 800:2007 Table 5
# ─────────────────────────────────────────────
GAMMA_M0 = 1.10   # Cl.5.4.1 — yielding / plate bending
GAMMA_M1 = 1.25   # Cl.5.4.1 — ultimate / rupture
GAMMA_MB = 1.25   # Cl.10.3  — bolt capacity (γmb)
GAMMA_MW = 1.25   # Cl.10.5  — weld capacity (γmw)


# ─────────────────────────────────────────────
# MATERIAL DATA
# ─────────────────────────────────────────────

STEEL_GRADES: dict = {
    "E250 (Fe410)": {"fy": 250, "fu": 410, "E": 200000},
    "E300 (Fe440)": {"fy": 300, "fu": 440, "E": 200000},
    "E350 (Fe490)": {"fy": 350, "fu": 490, "E": 200000},
    "E410 (Fe540)": {"fy": 410, "fu": 540, "E": 200000},
    "E450 (Fe570)": {"fy": 450, "fu": 570, "E": 200000},
}

CONCRETE_GRADES: dict = {
    "M20": {"fck": 20}, "M25": {"fck": 25}, "M30": {"fck": 30},
    "M35": {"fck": 35}, "M40": {"fck": 40}, "M50": {"fck": 50},
}

ANCHOR_GRADES: dict = {
    "IS 1367 Class 4.6":  {"fy": 240,  "fu": 400},
    "IS 1367 Class 8.8":  {"fy": 640,  "fu": 800},
    "IS 1367 Class 10.9": {"fy": 900,  "fu": 1000},
}

# IS 808:1989 — all dimensions in mm
ISMB: dict = {
    "ISMB 100": {"d": 100, "bf": 75,  "tf": 7.5,  "tw": 4.0},
    "ISMB 150": {"d": 150, "bf": 80,  "tf": 7.6,  "tw": 4.8},
    "ISMB 200": {"d": 200, "bf": 100, "tf": 10.8, "tw": 5.7},
    "ISMB 250": {"d": 250, "bf": 125, "tf": 12.5, "tw": 6.9},
    "ISMB 300": {"d": 300, "bf": 140, "tf": 13.1, "tw": 7.5},
    "ISMB 350": {"d": 350, "bf": 140, "tf": 14.2, "tw": 8.1},
    "ISMB 400": {"d": 400, "bf": 140, "tf": 16.0, "tw": 8.9},
    "ISMB 450": {"d": 450, "bf": 150, "tf": 17.4, "tw": 9.4},
    "ISMB 500": {"d": 500, "bf": 180, "tf": 17.2, "tw": 10.2},
    "ISMB 550": {"d": 550, "bf": 190, "tf": 19.3, "tw": 11.2},
    "ISMB 600": {"d": 600, "bf": 210, "tf": 20.8, "tw": 12.0},
}
ISHB: dict = {
    "ISHB 150": {"d": 150, "bf": 150, "tf": 9.0,  "tw": 5.4},
    "ISHB 200": {"d": 200, "bf": 200, "tf": 9.0,  "tw": 6.1},
    "ISHB 250": {"d": 250, "bf": 250, "tf": 9.7,  "tw": 6.9},
    "ISHB 300": {"d": 300, "bf": 250, "tf": 10.6, "tw": 7.6},
    "ISHB 350": {"d": 350, "bf": 250, "tf": 11.6, "tw": 8.3},
    "ISHB 400": {"d": 400, "bf": 250, "tf": 12.7, "tw": 9.1},
}

# IS 875:2015 / IS 1893:2016 load combinations
LOAD_COMBOS: list = [
    {"id": "IS_C1", "label": "1.5(DL+LL)",    "pf": 1.5, "mf": 1.5, "vf": 1.5,
     "ref": "IS 875 Pt-5 Table 4 C1",     "uplift": False, "note": "Gravity"},
    {"id": "IS_C2", "label": "1.5(DL+WL)",    "pf": 1.5, "mf": 1.5, "vf": 1.5,
     "ref": "IS 875 Pt-5 Table 4 C2",     "uplift": False, "note": "Wind dominant"},
    {"id": "IS_C3", "label": "1.2(DL+LL+WL)", "pf": 1.2, "mf": 1.2, "vf": 1.2,
     "ref": "IS 875 Pt-5 Table 4 C3",     "uplift": False, "note": "Combined"},
    {"id": "IS_C4", "label": "1.5(DL+EL)",    "pf": 1.5, "mf": 1.5, "vf": 1.5,
     "ref": "IS 1893:2016 Cl.6.3.1.2(i)", "uplift": False, "note": "Seismic"},
    {"id": "IS_C5", "label": "1.2(DL+LL+EL)", "pf": 1.2, "mf": 1.2, "vf": 1.2,
     "ref": "IS 1893:2016 Cl.6.3.1.2(ii)","uplift": False, "note": "Seismic+LL"},
    {"id": "IS_C6", "label": "0.9DL+1.5WL",   "pf": 0.9, "mf": 1.5, "vf": 1.5,
     "ref": "IS 875 Pt-5 Table 4 C6",     "uplift": True,  "note": "Uplift/Wind"},
    {"id": "IS_C7", "label": "0.9DL+1.5EL",   "pf": 0.9, "mf": 1.5, "vf": 1.5,
     "ref": "IS 1893:2016 Cl.6.3.1.2",   "uplift": True,  "note": "Uplift/Seismic"},
]


# ─────────────────────────────────────────────
# DATA CONTAINERS
# ─────────────────────────────────────────────

@dataclass
class ColumnSection:
    designation: str
    d: float   # mm
    bf: float  # mm
    tf: float  # mm
    tw: float  # mm

    @classmethod
    def from_name(cls, name: str) -> "ColumnSection":
        db = {**ISMB, **ISHB}
        if name not in db:
            raise ValueError(f"Unknown section '{name}'. Options: {list(db)}")
        p = db[name]
        return cls(name, p["d"], p["bf"], p["tf"], p["tw"])


@dataclass
class PlateGeometry:
    N: float   # mm — length (parallel to web)
    B: float   # mm — width  (parallel to flanges)
    tp: float  # mm — thickness

    @property
    def area(self) -> float:       # mm²
        return self.N * self.B

    @property
    def Z_section(self) -> float:  # mm³
        return self.B * self.N ** 2 / 6


@dataclass
class PedestalGeometry:
    Lp: float                    # mm
    Bp: float                    # mm
    Dp: float                    # mm
    support_type: str = "PEDESTAL"  # PEDESTAL | SLAB

    @property
    def area(self) -> float:
        return self.Lp * self.Bp


@dataclass
class LoadCase:
    """
    Sign convention (IS 800:2007):
      P  > 0  compression
      P  < 0  uplift
      Mx     strong-axis bending  (kN·m)
      Vx     shear  (kN)
    """
    P:   float = 0.0    # kN
    Mx:  float = 0.0    # kN·m
    My:  float = 0.0    # kN·m
    Vx:  float = 0.0    # kN
    Vy:  float = 0.0    # kN
    combo_id: str = "IS_C2"

    @property
    def is_uplift(self) -> bool:
        return self.P < 0

    # Conversion helpers (internal N/mm² calculations)
    def P_N(self)    -> float: return self.P  * 1_000
    def Mx_Nmm(self) -> float: return self.Mx * 1_000_000


@dataclass
class AnchorBolt:
    grade:     str
    dia_mm:    float
    count:     int
    edge_mm:   float   # edge distance
    hef_mm:    float   # embedment depth

    @property
    def fy(self) -> float: return ANCHOR_GRADES[self.grade]["fy"]
    @property
    def fu(self) -> float: return ANCHOR_GRADES[self.grade]["fu"]
    @property
    def Ase(self) -> float:
        """Net tensile stress area (mm²)."""
        return math.pi * (0.9 * self.dia_mm) ** 2 / 4


@dataclass
class CheckResult:
    name:         str
    clause:       str
    demand:       float
    capacity:     float
    utilisation:  float
    pass_:        bool
    unit:         str = "MPa"
    note:         str = ""
    steps:        List[str] = field(default_factory=list)

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
# CHECK FUNCTIONS  (nested, single-purpose)
# ─────────────────────────────────────────────

def _min_plate_size(plate: PlateGeometry, col: ColumnSection) -> CheckResult:
    """IS 800:2007 Cl.7.4.1 — N_min = d+100, B_min = bf+100"""
    Nm = col.d  + 100
    Bm = col.bf + 100
    ok = plate.N >= Nm and plate.B >= Bm
    u  = max(Nm / max(plate.N, 1), Bm / max(plate.B, 1))
    return CheckResult(
        name="Min Plate Size", clause="IS 800:2007 Cl.7.4.1",
        demand=max(Nm, Bm), capacity=min(plate.N, plate.B),
        utilisation=u, pass_=ok, unit="mm",
        steps=[
            f"N_min = d + 100 = {col.d} + 100 = {Nm} mm",
            f"B_min = bf + 100 = {col.bf} + 100 = {Bm} mm",
            f"N={plate.N}mm → {'✓' if plate.N>=Nm else '✗'}  |  B={plate.B}mm → {'✓' if plate.B>=Bm else '✗'}",
        ],
    )


def _confinement_factor(plate: PlateGeometry, ped: PedestalGeometry) -> dict:
    """IS 456:2000 Cl.34.4 — CF = min(√(A2/A1), 2.0)"""
    A1 = plate.area
    A2 = ped.area if ped.support_type == "PEDESTAL" else A1
    CF = min(math.sqrt(A2 / A1), 2.0)
    return {
        "A1": A1, "A2": A2, "CF": CF,
        "steps": [
            f"A₁ = N×B = {plate.N}×{plate.B} = {A1:.0f} mm²",
            f"A₂ = Lp×Bp = {ped.Lp}×{ped.Bp} = {A2:.0f} mm²",
            f"CF = min(√({A2/A1:.4f}), 2.0) = min({math.sqrt(A2/A1):.4f}, 2.0) = {CF:.4f}",
        ],
    }


def _pressure_distribution(load: LoadCase, plate: PlateGeometry) -> dict:
    """IS 456:2000 Cl.34.4 — eccentric bearing pressure"""
    A1 = plate.area; Z = plate.Z_section
    P_N = load.P_N(); Mx = load.Mx_Nmm()
    fp_avg = P_N / A1
    fp_max = fp_avg + Mx / Z
    fp_min = fp_avg - Mx / Z
    fp_d   = max(abs(fp_max), abs(fp_min))
    ex     = abs(Mx / P_N) if P_N != 0 else float("inf")
    kern   = plate.N / 6
    return {
        "fp_avg": fp_avg, "fp_max": fp_max,
        "fp_min": fp_min, "fp_design": fp_d,
        "eccentricity": ex, "kern": kern,
        "full_compression": ex <= kern,
        "steps": [
            f"e = Mx/P = {Mx:.0f}/{P_N:.0f} = {ex:.1f} mm   kern = N/6 = {kern:.1f} mm",
            f"Full compression: {ex:.1f} ≤ {kern:.1f} → {'TRUE ✓' if ex<=kern else 'FALSE ✗'}",
            f"fp_avg = {fp_avg:.4f} MPa",
            f"fp_max = {fp_max:.4f} MPa  |  fp_min = {fp_min:.4f} MPa{'  (Tension → anchor uplift)' if fp_min<0 else ''}",
            f"fp_design = {fp_d:.4f} MPa",
        ],
    }


def _concrete_bearing(load: LoadCase, plate: PlateGeometry,
                      ped: PedestalGeometry, fck: float) -> CheckResult:
    """IS 456:2000 Cl.34.4 — fp_allow = 0.45 × fck × CF"""
    cf   = _confinement_factor(plate, ped)
    CF   = cf["CF"]
    fp_a = 0.45 * fck * CF
    pr   = _pressure_distribution(load, plate)
    fp_d = pr["fp_design"]
    u    = fp_d / fp_a
    return CheckResult(
        name="Concrete Bearing", clause="IS 456:2000 Cl.34.4",
        demand=fp_d, capacity=fp_a, utilisation=u, pass_=u <= 1.0, unit="MPa",
        steps=cf["steps"] + pr["steps"] + [
            f"fp_allow = 0.45 × {fck} × {CF:.4f} = {fp_a:.4f} MPa",
            f"η = {fp_d:.4f} / {fp_a:.4f} = {u:.4f}  {'✓ SAFE' if u<=1.0 else '✗ REDESIGN'}",
        ],
    )


def _cantilever_lengths(col: ColumnSection, plate: PlateGeometry) -> dict:
    """IS 800:2007 Cl.7.4.3.1 — m, n, n' cantilever lengths"""
    m  = (plate.N - 0.95 * col.d)  / 2
    n  = (plate.B - 0.80 * col.bf) / 2
    np = math.sqrt(col.d * col.bf)  / 4
    lc = max(m, n, np, 1.0)
    gv = "m" if lc == m else ("n" if lc == n else "n'")
    return {
        "m": m, "n": n, "n_prime": np, "l_crit": lc, "governs": gv,
        "steps": [
            f"Step 1: m  = (N − 0.95d)/2  = ({plate.N} − 0.95×{col.d})/2  = {m:.2f} mm",
            f"Step 2: n  = (B − 0.80bf)/2 = ({plate.B} − 0.80×{col.bf})/2 = {n:.2f} mm",
            f"Step 3: n' = √(d×bf)/4      = √({col.d}×{col.bf})/4         = {np:.2f} mm",
            f"Step 4: l_crit = max({m:.1f}, {n:.1f}, {np:.1f}) = {lc:.2f} mm  ← GOVERNS ({gv})",
        ],
    }


def _plate_thickness(load: LoadCase, plate: PlateGeometry,
                     col: ColumnSection, plate_fy: float) -> CheckResult:
    """IS 800:2007 Cl.7.4.3.1 — tp_req = l_crit × √(2·fp·γm0/Fy)"""
    A1  = plate.area
    fp  = load.P_N() / A1
    cv  = _cantilever_lengths(col, plate)
    lc  = cv["l_crit"]
    trm = 2 * fp * GAMMA_M0 / plate_fy
    tpr = lc * math.sqrt(max(trm, 0))
    u   = tpr / plate.tp
    extra = []
    if tpr > 40:
        extra.append("⚡ tp_req > 40 mm — consider stiffener plates on both sides of column web")
    return CheckResult(
        name="Plate Thickness", clause="IS 800:2007 Cl.7.4.3.1  (γm0=1.10)",
        demand=tpr, capacity=plate.tp, utilisation=u, pass_=u <= 1.0, unit="mm",
        note=f"tp_req={tpr:.1f} mm, provided={plate.tp} mm",
        steps=cv["steps"] + [
            f"Step 5: fp = P/A₁ = {load.P_N():.0f}/{A1:.0f} = {fp:.4f} MPa",
            f"Step 6: tp_req = l_crit × √(2·fp·γm0/Fy)",
            f"       = {lc:.2f} × √(2×{fp:.4f}×{GAMMA_M0}/{plate_fy})",
            f"       = {lc:.2f} × {math.sqrt(max(trm,0)):.4f} = {tpr:.2f} mm",
            f"Step 7: tp_provided = {plate.tp} mm",
            f"Step 8: η = {tpr:.2f}/{plate.tp} = {u:.4f}  {'✓ SAFE' if u<=1.0 else f'✗ REDESIGN — increase tp to {math.ceil(tpr/5)*5} mm'}",
        ] + extra,
    )


def _anchor_tension_demand(load: LoadCase, plate: PlateGeometry,
                           anc: AnchorBolt) -> dict:
    """Tension demand per bolt from combined P + Mx"""
    P_N  = load.P_N();  Mx = load.Mx_Nmm()
    lev  = 0.9 * plate.N
    upl  = P_N < 0
    T_tot = (abs(P_N) + abs(Mx) / lev) if upl else max(0, abs(Mx) / lev - abs(P_N) / 2)
    n_t  = max(2, anc.count // 2)
    T_pb = T_tot / n_t
    return {
        "lever": lev, "T_total": T_tot,
        "n_tension": n_t, "T_per_bolt": T_pb,
        "uplift": upl,
        "steps": [
            f"Lever = 0.9×N = 0.9×{plate.N} = {lev:.0f} mm",
            f"T_total = {T_tot:.0f} N = {T_tot/1000:.2f} kN  ({'uplift' if upl else 'moment dominant'})",
            f"T_per_bolt = {T_tot:.0f}/{n_t} = {T_pb:.0f} N = {T_pb/1000:.2f} kN",
        ],
    }


def _anchor_tension(load: LoadCase, plate: PlateGeometry,
                    anc: AnchorBolt) -> CheckResult:
    """IS 800:2007 Cl.10.3.3 — Tdb = Ase × fu / γmb"""
    cap = anc.Ase * anc.fu / GAMMA_MB
    dem = _anchor_tension_demand(load, plate, anc)
    T   = dem["T_per_bolt"]
    u   = T / cap
    return CheckResult(
        name="Anchor Tension", clause=f"IS 800:2007 Cl.10.3.3  (γmb={GAMMA_MB})",
        demand=T, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="N",
        steps=dem["steps"] + [
            f"Ase = π×(0.9×{anc.dia_mm})²/4 = {anc.Ase:.2f} mm²",
            f"Tdb = {anc.Ase:.2f}×{anc.fu}/{GAMMA_MB} = {cap:.0f} N = {cap/1000:.2f} kN",
            f"η = {T:.0f}/{cap:.0f} = {u:.4f}  {'✓' if u<=1.0 else '✗ REDESIGN'}",
        ],
    )


def _anchor_shear(load: LoadCase, anc: AnchorBolt) -> CheckResult:
    """IS 800:2007 Cl.10.3.3 — Vdb = 0.6 × Ase × fu / γmb"""
    cap = 0.6 * anc.Ase * anc.fu / GAMMA_MB
    dem = load.Vx * 1000 / anc.count
    u   = dem / cap if cap > 0 else 0
    return CheckResult(
        name="Anchor Shear", clause=f"IS 800:2007 Cl.10.3.3  (0.6·fu·Ase/γmb)",
        demand=dem, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="N",
        steps=[
            f"Vdb = 0.6×{anc.Ase:.2f}×{anc.fu}/{GAMMA_MB} = {cap:.0f} N = {cap/1000:.2f} kN",
            f"V_per_bolt = {load.Vx*1000:.0f}/{anc.count} = {dem:.0f} N",
            f"η = {dem:.0f}/{cap:.0f} = {u:.4f}  {'✓' if u<=1.0 else '✗'}",
        ],
    )


def _anchor_interaction(t_u: float, v_u: float) -> CheckResult:
    """IS 800:2007 Cl.10.3.4 — (T/Tdb)² + (V/Vdb)² ≤ 1.0"""
    val = t_u ** 2 + v_u ** 2
    return CheckResult(
        name="T-V Interaction", clause="IS 800:2007 Cl.10.3.4",
        demand=val, capacity=1.0, utilisation=val, pass_=val <= 1.0, unit="—",
        steps=[
            f"(T/Tdb)² + (V/Vdb)² = {t_u:.4f}² + {v_u:.4f}²",
            f"= {t_u**2:.4f} + {v_u**2:.4f} = {val:.4f}  {'✓ ≤ 1.0' if val<=1.0 else '✗ > 1.0'}",
        ],
    )


def _embedment_depth(anc: AnchorBolt, fck: float, uplift: bool) -> CheckResult:
    """IS 5624:1993 — hef_min = 12d (comp) or 16d (uplift)"""
    hmin = anc.dia_mm * (16 if uplift else 12)
    Nb   = 24 * math.sqrt(fck) * anc.hef_mm ** 1.5   # N
    u    = hmin / anc.hef_mm
    return CheckResult(
        name="Embedment Depth", clause="IS 5624:1993",
        demand=hmin, capacity=anc.hef_mm, utilisation=u,
        pass_=anc.hef_mm >= hmin, unit="mm",
        steps=[
            f"hef_min = {'16' if uplift else '12'}×{anc.dia_mm} = {hmin} mm",
            f"hef_provided = {anc.hef_mm} mm → {'✓ OK' if anc.hef_mm>=hmin else '✗ Increase'}",
            f"Nb = 24×√{fck}×{anc.hef_mm}^1.5 = {Nb:.0f} N = {Nb/1000:.2f} kN",
        ],
    )


def _weld(load: LoadCase, col: ColumnSection, s: float) -> CheckResult:
    """IS 800:2007 Cl.10.5.7.1.1 — fillet weld, E41XX"""
    fw  = 410.0 / (math.sqrt(3) * GAMMA_MW)   # MPa
    te  = 0.707 * s
    L   = 2 * (col.d + 2 * col.bf)
    cap = te * L * fw / 1000   # kN
    u   = load.Vx / cap if cap > 0 else 0
    return CheckResult(
        name="Weld (Column to Plate)", clause="IS 800:2007 Cl.10.5.7.1.1",
        demand=load.Vx, capacity=cap, utilisation=u, pass_=u <= 1.0, unit="kN",
        steps=[
            f"E41XX: fu_weld=410 MPa | fw = 410/(√3×{GAMMA_MW}) = {fw:.2f} MPa",
            f"te = 0.707×{s} = {te:.2f} mm | L = 2(d+2bf) = {L:.0f} mm",
            f"V_cap = {te:.2f}×{L:.0f}×{fw:.2f}/1000 = {cap:.1f} kN",
            f"η = {load.Vx}/{cap:.1f} = {u:.3f}  {'✓' if u<=1.0 else '✗'}",
        ],
    )


# ─────────────────────────────────────────────
# MASTER DESIGN RUNNER
# ─────────────────────────────────────────────

@dataclass
class IndianInput:
    """All inputs for Indian code base plate design."""
    col_desig:      str   = "ISMB 300"
    N_mm:           float = 500.0
    B_mm:           float = 500.0
    tp_mm:          float = 25.0
    ped_L_mm:       float = 600.0
    ped_B_mm:       float = 600.0
    ped_D_mm:       float = 800.0
    support_type:   str   = "PEDESTAL"
    P_kN:           float = 800.0    # + compression  − uplift
    Mx_kNm:         float = 60.0
    Vx_kN:          float = 40.0
    plate_grade:    str   = "E250 (Fe410)"
    concrete_grade: str   = "M30"
    anchor_grade:   str   = "IS 1367 Class 8.8"
    anchor_dia_mm:  float = 24.0
    anchor_count:   int   = 4
    edge_dist_mm:   float = 100.0
    hef_mm:         float = 400.0
    weld_size_mm:   float = 10.0
    combo_id:       str   = "IS_C2"


def run_design(inp: IndianInput) -> dict:
    """
    Execute all Indian code checks in sequence.
    Returns fully serialisable result dict.
    """
    col   = ColumnSection.from_name(inp.col_desig)
    plate = PlateGeometry(inp.N_mm, inp.B_mm, inp.tp_mm)
    ped   = PedestalGeometry(inp.ped_L_mm, inp.ped_B_mm, inp.ped_D_mm, inp.support_type)
    load  = LoadCase(P=inp.P_kN, Mx=inp.Mx_kNm, Vx=inp.Vx_kN, combo_id=inp.combo_id)
    sg    = STEEL_GRADES[inp.plate_grade]
    cg    = CONCRETE_GRADES[inp.concrete_grade]
    anc   = AnchorBolt(inp.anchor_grade, inp.anchor_dia_mm,
                       inp.anchor_count, inp.edge_dist_mm, inp.hef_mm)

    c_geo  = _min_plate_size(plate, col)
    c_bear = _concrete_bearing(load, plate, ped, cg["fck"])
    c_tp   = _plate_thickness(load, plate, col, sg["fy"])
    c_at   = _anchor_tension(load, plate, anc)
    c_av   = _anchor_shear(load, anc)
    c_ai   = _anchor_interaction(c_at.utilisation, c_av.utilisation)
    c_hef  = _embedment_depth(anc, cg["fck"], load.is_uplift)
    c_wld  = _weld(load, col, inp.weld_size_mm)

    checks  = [c_geo, c_bear, c_tp, c_at, c_av, c_ai, c_hef, c_wld]
    overall = all(c.pass_ for c in checks)

    return {
        "code":         "IS800",
        "method":       "Limit State Method (IS 800:2007)",
        "units":        UNITS,
        "input":        inp.__dict__,
        "section":      {"d": col.d, "bf": col.bf, "tf": col.tf, "tw": col.tw},
        "checks":       [c.to_dict() for c in checks],
        "overall":      "PASS" if overall else "REDESIGN",
        "failing":      [c.name for c in checks if not c.pass_],
        "tp_req_mm":    round(c_tp.demand, 2),
        "fp_allow_MPa": round(c_bear.capacity, 4),
        "CF":           round(_confinement_factor(plate, ped)["CF"], 4),
    }


# ── quick self-test ──────────────────────────
if __name__ == "__main__":
    result = run_design(IndianInput())
    print("\n" + "="*62)
    print("  StructAI — IS 800:2007 LSM  |  Built-in Example")
    print("="*62)
    print(f"  Column   : ISMB 300  |  Plate : 500×500×25 mm")
    print(f"  Loads    : P=800 kN  |  Mx=60 kN·m  |  Vx=40 kN")
    print(f"  Concrete : M30       |  Pedestal : 600×600 mm")
    print(f"  Anchors  : 4×M24 IS 1367 Class 8.8  |  hef=400 mm")
    print("-"*62)
    print(f"  Overall  : {result['overall']}")
    print("-"*62)
    for ch in result["checks"]:
        icon = "✓" if ch["status"] == "PASS" else "✗"
        print(f"  {icon}  {ch['name']:<28s}  η={ch['utilisation_pct']:6.1f}%")
    print("-"*62)
    print(f"  tp_req = {result['tp_req_mm']} mm  |  provided = 25 mm")
    print(f"  CF = {result['CF']}  |  fp_allow = {result['fp_allow_MPa']} MPa")
    if result["failing"]:
        print(f"\n  ✗ FAILING: {', '.join(result['failing'])}")
    print()
