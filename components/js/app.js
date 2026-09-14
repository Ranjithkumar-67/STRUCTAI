/**
 * StructAI — Main Application JavaScript
 * ========================================
 * Architecture: flat module pattern
 *   STATE   → single source of truth
 *   DATA    → static lookup tables
 *   CALC    → pure calculation functions (mirrors Python lib)
 *   RENDER  → step renderers (one per step)
 *   UI      → layout helpers (progress, sidebar, right panel)
 *   REPORT  → HTML report generator
 *   INIT    → bootstrap
 */

'use strict';

/* ============================================================
   STATE — single source of truth
   ============================================================ */
const STATE = {
  // code path
  code:   'IS800',   // 'IS800' | 'AISC_LRFD' | 'AISC_ASD'
  step:   1,
  sectionLocked: true,

  // column section (mm or in, always stored in mm internally for IS, in for US)
  colType:  'ISMB',
  colDesig: 'ISMB 300',
  d: 300, bf: 140, tf: 13.1, tw: 7.5,

  // plate (mm)
  N: 500, B: 500, tp: 25,

  // pedestal (mm)
  pedL: 600, pedB: 600, pedD: 800,
  supportType: 'PEDESTAL',
  slabTs: 300,

  // loads  (+P = compression, kN or kips)
  P: 800, Mx: 60, My: 0, Vx: 40, Vy: 0,
  loadCombo: 'IS_C2',

  // materials
  colGrade:    'E250 (Fe410)',
  plateGrade:  'E250 (Fe410)',
  concGrade:   'M30',
  colFy: 250, colFu: 410,
  plateFy: 250, plateFu: 410,
  fck: 30,
  lambda: 1.0,

  // anchors
  ancGrade: 'IS 1367 Class 8.8',
  ancDia: 24, ancCount: 4,
  edgeDist: 100, hef: 400,

  // weld
  weldSize: 10,

  // results cache
  results: null,
  reportHTML: '',
};


/* ============================================================
   DATA — lookup tables (mirror Python lib)
   ============================================================ */

/* ── Indian section library ── */
const IS_SECTIONS = {
  ISMB: {
    'ISMB 100':{d:100,bf:75, tf:7.5, tw:4.0},
    'ISMB 150':{d:150,bf:80, tf:7.6, tw:4.8},
    'ISMB 200':{d:200,bf:100,tf:10.8,tw:5.7},
    'ISMB 250':{d:250,bf:125,tf:12.5,tw:6.9},
    'ISMB 300':{d:300,bf:140,tf:13.1,tw:7.5},
    'ISMB 350':{d:350,bf:140,tf:14.2,tw:8.1},
    'ISMB 400':{d:400,bf:140,tf:16.0,tw:8.9},
    'ISMB 450':{d:450,bf:150,tf:17.4,tw:9.4},
    'ISMB 500':{d:500,bf:180,tf:17.2,tw:10.2},
    'ISMB 550':{d:550,bf:190,tf:19.3,tw:11.2},
    'ISMB 600':{d:600,bf:210,tf:20.8,tw:12.0},
  },
  ISHB: {
    'ISHB 150':{d:150,bf:150,tf:9.0, tw:5.4},
    'ISHB 200':{d:200,bf:200,tf:9.0, tw:6.1},
    'ISHB 250':{d:250,bf:250,tf:9.7, tw:6.9},
    'ISHB 300':{d:300,bf:250,tf:10.6,tw:7.6},
    'ISHB 350':{d:350,bf:250,tf:11.6,tw:8.3},
    'ISHB 400':{d:400,bf:250,tf:12.7,tw:9.1},
  },
};

/* ── US section library (dimensions in inches) ── */
const US_SECTIONS = {
  'W-Shape': {
    'W8x31': {d:8.00,bf:7.995,tf:0.435,tw:0.285},
    'W10x49':{d:9.98,bf:10.000,tf:0.560,tw:0.340},
    'W10x68':{d:10.40,bf:10.075,tf:0.770,tw:0.395},
    'W12x53':{d:12.10,bf:9.995,tf:0.575,tw:0.345},
    'W12x72':{d:12.30,bf:12.040,tf:0.670,tw:0.430},
    'W14x68':{d:14.04,bf:10.035,tf:0.720,tw:0.415},
    'W14x90':{d:14.02,bf:14.520,tf:0.710,tw:0.440},
    'W14x120':{d:14.48,bf:14.670,tf:0.940,tw:0.590},
  },
};

/* ── Material data ── */
const IS_STEEL  = {'E250 (Fe410)':{fy:250,fu:410},'E300 (Fe440)':{fy:300,fu:440},'E350 (Fe490)':{fy:350,fu:490},'E410 (Fe540)':{fy:410,fu:540}};
const US_STEEL  = {'A36':{fy:36,fu:58},'A572-Gr50':{fy:50,fu:65},'A992':{fy:50,fu:65}};
const IS_CONC   = {'M20':{fck:20},'M25':{fck:25},'M30':{fck:30},'M35':{fck:35},'M40':{fck:40},'M50':{fck:50}};
const US_CONC   = {'3000 psi':{fck:20.7,fc_ksi:3.0},'4000 psi':{fck:27.6,fc_ksi:4.0},'5000 psi':{fck:34.5,fc_ksi:5.0},'6000 psi':{fck:41.4,fc_ksi:6.0}};
const IS_ANC    = {'IS 1367 Class 4.6':{fy:240,fu:400},'IS 1367 Class 8.8':{fy:640,fu:800},'IS 1367 Class 10.9':{fy:900,fu:1000}};
const US_ANC    = {'ASTM F1554 Gr.36':{fy:36,fu:58},'ASTM F1554 Gr.55':{fy:55,fu:75},'ASTM F1554 Gr.105':{fy:105,fu:125},'ASTM A307':{fy:36,fu:60}};

/* ── Load combos ── */
const LC_IS = [
  {id:'IS_C1',label:'1.5(DL+LL)',    pf:1.5,mf:1.5,vf:1.5,ref:'IS 875 Pt-5 Table 4 C1',uplift:false,note:'Gravity'},
  {id:'IS_C2',label:'1.5(DL+WL)',    pf:1.5,mf:1.5,vf:1.5,ref:'IS 875 Pt-5 Table 4 C2',uplift:false,note:'Wind dominant'},
  {id:'IS_C3',label:'1.2(DL+LL+WL)',pf:1.2,mf:1.2,vf:1.2,ref:'IS 875 Pt-5 Table 4 C3',uplift:false,note:'Combined'},
  {id:'IS_C4',label:'1.5(DL+EL)',    pf:1.5,mf:1.5,vf:1.5,ref:'IS 1893:2016 Cl.6.3.1.2(i)',uplift:false,note:'Seismic'},
  {id:'IS_C5',label:'1.2(DL+LL+EL)',pf:1.2,mf:1.2,vf:1.2,ref:'IS 1893:2016 Cl.6.3.1.2(ii)',uplift:false,note:'Seismic+LL'},
  {id:'IS_C6',label:'0.9DL+1.5WL',  pf:0.9,mf:1.5,vf:1.5,ref:'IS 875 Pt-5 Table 4 C6',uplift:true, note:'Uplift/Wind'},
  {id:'IS_C7',label:'0.9DL+1.5EL',  pf:0.9,mf:1.5,vf:1.5,ref:'IS 1893:2016 Cl.6.3.1.2',uplift:true, note:'Uplift/Seismic'},
];
const LC_LRFD = [
  {id:'L1',label:'1.4D',        pf:1.4,mf:1.4,vf:1.4,ref:'ASCE 7-22 §2.3.1 #1',uplift:false,note:'Dead only'},
  {id:'L2',label:'1.2D+1.6L',   pf:1.2,mf:1.6,vf:1.6,ref:'ASCE 7-22 §2.3.1 #2',uplift:false,note:'Gravity governs'},
  {id:'L3',label:'1.2D+1.0W+L', pf:1.2,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.3.1 #4',uplift:false,note:'Wind governs'},
  {id:'L4',label:'1.2D+1.0E+L', pf:1.2,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.3.1 #5',uplift:false,note:'Seismic'},
  {id:'L5',label:'0.9D+1.0W',   pf:0.9,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.3.1 #6',uplift:true, note:'Uplift/Wind'},
  {id:'L6',label:'0.9D+1.0E',   pf:0.9,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.3.1 #7',uplift:true, note:'Uplift/Seismic'},
];
const LC_ASD = [
  {id:'A1',label:'D',          pf:1.0,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.4.1 #1',uplift:false,note:'Dead only'},
  {id:'A2',label:'D+L',        pf:1.0,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.4.1 #2',uplift:false,note:'Gravity'},
  {id:'A3',label:'D+Lr',       pf:1.0,mf:1.0,vf:1.0,ref:'ASCE 7-22 §2.4.1 #3',uplift:false,note:'Roof live'},
  {id:'A4',label:'D+0.75L+Lr', pf:1.0,mf:0.75,vf:0.75,ref:'ASCE 7-22 §2.4.1 #4',uplift:false,note:'Combined'},
  {id:'A5',label:'D+0.6W',     pf:1.0,mf:0.6,vf:0.6,ref:'ASCE 7-22 §2.4.1 #5',uplift:false,note:'Wind'},
  {id:'A6',label:'D+0.7E',     pf:1.0,mf:0.7,vf:0.7,ref:'ASCE 7-22 §2.4.1 #6',uplift:false,note:'Seismic'},
  {id:'A7',label:'0.6D+0.6W',  pf:0.6,mf:0.6,vf:0.6,ref:'ASCE 7-22 §2.4.1 #7',uplift:true, note:'Uplift'},
];

/* ── Step definitions ── */
const STEPS = [
  {n:1,label:'Code & Project'}, {n:2,label:'Loads'},
  {n:3,label:'Materials'},      {n:4,label:'Geometry'},
  {n:5,label:'Anchors'},        {n:6,label:'Bearing'},
  {n:7,label:'Plate tp'},       {n:8,label:'Anchor Chk'},
  {n:9,label:'Weld'},           {n:10,label:'Summary'},
];


/* ============================================================
   HELPERS — code-path utilities
   ============================================================ */
const isIS    = () => STATE.code === 'IS800';
const isASD   = () => STATE.code === 'AISC_ASD';
const isLRFD  = () => STATE.code === 'AISC_LRFD';

/* Unit labels — strictly separated, no cross-contamination */
const U = {
  force:   () => isIS() ? 'kN'    : 'kips',
  moment:  () => isIS() ? 'kN·m'  : 'kip·ft',
  length:  () => isIS() ? 'mm'    : 'in',
  stress:  () => isIS() ? 'MPa'   : 'ksi',
  area:    () => isIS() ? 'mm²'   : 'in²',
};

const getLCs = () => isIS() ? LC_IS : isASD() ? LC_ASD : LC_LRFD;

const getSteelDB    = () => isIS() ? IS_STEEL : US_STEEL;
const getConcDB     = () => isIS() ? IS_CONC  : US_CONC;
const getAncDB      = () => isIS() ? IS_ANC   : US_ANC;
const getSectionDB  = () => isIS() ? IS_SECTIONS : US_SECTIONS;

const f = (v, dp=4) => (+v).toFixed(dp);
const fPct = v => (v * 100).toFixed(1) + '%';

/* ── DOM helpers ── */
const el    = id => document.getElementById(id);
const setText = (id, v) => { const e = el(id); if (e) e.textContent = v; };
const show  = id => { const e = el(id); if (e) e.style.display = ''; };
const hide  = id => { const e = el(id); if (e) e.style.display = 'none'; };


/* ============================================================
   CALC ENGINE — pure functions (mirrors indian_code.py / us_code.py)
   ALL values stored in SI internally (mm, N, MPa) for IS
   and in imperial (in, kips, ksi) for US.
   ============================================================ */

function calcAll() {
  const isI = isIS();
  const A1  = STATE.N * STATE.B;
  const A2  = STATE.pedL * STATE.pedB;
  const CF  = Math.min(Math.sqrt(A2 / A1), 2.0);

  /* ── Bearing allowable ── */
  const fck = STATE.fck;
  const fp_allow = isI
    ? 0.45 * fck * CF                 /* IS 456:2000 Cl.34.4 */
    : 0.65 * 0.85 * (fck / 6.895) * CF; /* AISC J8.1 — fck stored in MPa, convert to ksi */

  /* ── Pressure distribution ── */
  const P_N    = isI ? STATE.P * 1000 : STATE.P;           // N or kips
  const Mx_u   = isI ? STATE.Mx * 1e6 : STATE.Mx * 12;    // N·mm or kip·in
  const Z      = STATE.B * STATE.N ** 2 / 6;
  const fp_avg = P_N / A1;
  const fp_max = fp_avg + Mx_u / Z;
  const fp_min = fp_avg - Mx_u / Z;
  const fp_d   = Math.max(Math.abs(fp_max), Math.abs(fp_min));
  const util_b = fp_d / fp_allow;

  /* ── Cantilever lengths ── */
  const m  = (STATE.N - 0.95 * STATE.d)  / 2;
  const n  = (STATE.B - 0.80 * STATE.bf) / 2;
  const np = Math.sqrt(STATE.d * STATE.bf) / 4;
  const lc = Math.max(m, n, np, 0.01);
  const governs = lc === m ? 'm' : lc === n ? 'n' : "n'";

  /* ── Plate thickness ── */
  const fp_p   = P_N / A1;
  const plateFy = STATE.plateFy;
  let tp_req;
  if (isI) {
    /* IS 800:2007 Cl.7.4.3.1 — γm0 = 1.10 */
    tp_req = lc * Math.sqrt(Math.max(2 * fp_p * 1.10 / plateFy, 0));
  } else {
    /* AISC DG1 Eq.2.6 — φ = 0.90 */
    tp_req = lc * Math.sqrt(Math.max(2 * fp_p / (0.90 * plateFy), 0));
  }
  const util_tp = tp_req / STATE.tp;

  /* ── Anchor capacity ── */
  const ancDB = getAncDB();
  const ancP  = ancDB[STATE.ancGrade] || { fy: 640, fu: 800 };
  const d_a   = parseFloat(STATE.ancDia) || 24;
  const Ase   = Math.PI * (0.9 * d_a) ** 2 / 4;
  let phi_Nsa, phi_Vsa;
  if (isI) {
    phi_Nsa = Ase * ancP.fu / 1.25;           /* IS 800 Cl.10.3.3 γmb=1.25 */
    phi_Vsa = 0.6 * Ase * ancP.fu / 1.25;
  } else {
    phi_Nsa = 0.75 * Ase * ancP.fu;           /* ACI §17.5.1 φ=0.75 */
    phi_Vsa = 0.65 * 0.6 * Ase * ancP.fu;    /* ACI §17.7.1 φ=0.65 */
  }

  /* ── Anchor demand ── */
  const lever   = 0.9 * STATE.N;
  const uplift  = P_N < 0;
  const T_total = uplift
    ? Math.abs(P_N) + Math.abs(Mx_u) / lever
    : Math.max(0, Math.abs(Mx_u) / lever - Math.abs(P_N) / 2);
  const n_tens  = Math.max(2, STATE.ancCount / 2);
  const T_per   = T_total / n_tens;
  const V_per   = (isI ? STATE.Vx * 1000 : STATE.Vx) / STATE.ancCount;
  const t_u     = T_per / phi_Nsa;
  const v_u     = V_per / phi_Vsa;
  const inter   = isI ? t_u ** 2 + v_u ** 2 : t_u ** (5/3) + v_u ** (5/3);

  /* ── Embedment ── */
  const hef_min = d_a * (uplift ? 16 : 12);
  const util_h  = hef_min / STATE.hef;

  /* ── Geometry ── */
  const Nmin = STATE.d + (isI ? 100 : 4);
  const Bmin = STATE.bf + (isI ? 100 : 4);
  const geo_ok = STATE.N >= Nmin && STATE.B >= Bmin;

  /* ── Weld ── */
  const fw_weld = isI
    ? 410 / (Math.sqrt(3) * 1.25)          /* E41XX IS 800 Cl.10.5 */
    : 0.60 * 70;                            /* E70XX AISC J2.4 */
  const te_w   = 0.707 * STATE.weldSize;
  const L_w    = 2 * (STATE.d + 2 * STATE.bf);
  const Vcap_w = isI
    ? te_w * L_w * fw_weld / 1000           /* kN */
    : 0.75 * te_w * L_w * fw_weld;         /* kips */
  const vDem   = isI ? STATE.Vx : STATE.Vx;
  const util_w = vDem / Vcap_w;

  STATE.results = {
    CF, fp_allow, fp_d, fp_avg, fp_max, fp_min,
    util_b, util_b_pass: util_b <= 1.0,
    m, n, np, lc, governs,
    tp_req, util_tp, util_tp_pass: util_tp <= 1.0,
    phi_Nsa, phi_Vsa, T_per, V_per, t_u, v_u,
    inter, inter_pass: inter <= 1.0,
    t_u_pass: t_u <= 1.0, v_u_pass: v_u <= 1.0,
    hef_min, util_h, hef_pass: STATE.hef >= hef_min,
    geo_ok, Nmin, Bmin, geo_util: Math.max(Nmin / Math.max(STATE.N,1), Bmin / Math.max(STATE.B,1)),
    Vcap_w, util_w, util_w_pass: util_w <= 1.0,
    overall: (util_b <= 1.0 && util_tp <= 1.0 && t_u <= 1.0 && v_u <= 1.0 && inter <= 1.0 && STATE.hef >= hef_min && geo_ok) ? 'PASS' : 'REDESIGN',
  };
  return STATE.results;
}


/* ============================================================
   UI — layout building
   ============================================================ */

function buildProgress() {
  const c = el('pgsteps'); if (!c) return;
  c.innerHTML = '';
  STEPS.forEach((s, i) => {
    const div   = document.createElement('div');
    div.className = 'prog-step';
    const circ  = document.createElement('div');
    circ.className = 'prog-circ ' + (s.n < STATE.step ? 'done' : s.n === STATE.step ? 'active' : '');
    circ.textContent = s.n < STATE.step ? '✓' : s.n;
    circ.title = s.label;
    circ.onclick = () => goStep(s.n);
    div.appendChild(circ);
    if (window.innerWidth > 700) {
      const lb = document.createElement('span');
      lb.className = 'prog-label'; lb.textContent = s.label;
      div.appendChild(lb);
    }
    if (i < STEPS.length - 1) {
      const ln = document.createElement('div');
      ln.className = 'prog-line' + (s.n < STATE.step ? ' done' : '');
      div.appendChild(ln);
    }
    c.appendChild(div);
  });
}

function buildSidebar() {
  const nav = el('snav'); if (!nav) return;
  nav.innerHTML = '';
  STEPS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'nav-item' + (s.n === STATE.step ? ' active' : '');
    item.onclick = () => goStep(s.n);
    const dotClass = s.n < STATE.step ? 'done' : s.n === STATE.step ? 'active' : 'idle';
    item.innerHTML = `<span class="nav-dot ${dotClass}">${s.n < STATE.step ? '✓' : s.n}</span><span>${s.label}</span>`;
    nav.appendChild(item);
  });
}

function updateQuickInfo() {
  setText('qi-code', STATE.code);
  setText('qi-col',  STATE.colDesig);
  setText('qi-pl',   `${STATE.N}×${STATE.B}×${STATE.tp} ${U.length()}`);
  setText('qi-p',    `${STATE.P} ${U.force()}`);
  const cc = el('qi-cond');
  if (cc) {
    cc.className = STATE.P > 0 ? 'badge badge-pass' : STATE.P < 0 ? 'badge badge-fail' : 'badge badge-caution';
    cc.textContent = STATE.P > 0 ? '✓ Compression' : STATE.P < 0 ? '⚠ Uplift' : '⚡ Shear';
  }
  const hct = el('hdr-code-tag');
  if (hct) {
    hct.className  = isIS() ? 'badge badge-is' : 'badge badge-us';
    hct.textContent= isIS() ? 'IS 800:2007 LSM' : STATE.code === 'AISC_LRFD' ? 'AISC 360-22 LRFD' : 'AISC 360-22 ASD';
  }
}

function updateRightPanel() {
  const R = calcAll();
  const ob = el('rpob');
  if (ob) {
    ob.className    = 'badge ' + (R.overall === 'PASS' ? 'badge-pass' : 'badge-redesign');
    ob.textContent  = R.overall === 'PASS' ? '✓ PASS' : '❌ REDESIGN';
  }
  const items = [
    { n: 'Bearing',    u: R.util_b,  p: R.util_b_pass },
    { n: 'Plate tp',   u: R.util_tp, p: R.util_tp_pass },
    { n: 'Anch T',     u: R.t_u,     p: R.t_u_pass },
    { n: 'Anch V',     u: R.v_u,     p: R.v_u_pass },
    { n: 'T-V',        u: R.inter,   p: R.inter_pass },
    { n: 'hef',        u: R.util_h,  p: R.hef_pass },
  ];
  const ul = el('rpul');
  if (ul) ul.innerHTML = items.map(i => {
    const cls = i.p ? 'safe' : i.u <= 1.0 ? 'caution' : 'fail';
    const w   = Math.min(i.u * 100, 100);
    return `<div class="rp-util-item">
      <div class="rp-util-label"><span>${i.n}</span><span style="font-weight:700;color:var(--col-${i.p ? 'pass' : 'fail'})">${(i.u*100).toFixed(0)}%</span></div>
      <div class="util-bar"><div class="util-fill ${cls}" style="width:${w}%"></div></div>
    </div>`;
  }).join('');

  const warns = [];
  if (!R.util_b_pass)  warns.push({ l:3, m:`❌ Bearing — increase plate area or concrete grade` });
  if (!R.util_tp_pass) warns.push({ l:3, m:`❌ Plate tp — need ${f(R.tp_req,1)} ${U.length()}, have ${STATE.tp}` });
  if (!R.t_u_pass)     warns.push({ l:3, m:`❌ Anchor tension overstressed` });
  if (!R.hef_pass)     warns.push({ l:2, m:`⚠ hef=${STATE.hef} < min=${R.hef_min} ${U.length()}` });
  const rw = el('rpw');
  if (rw) rw.innerHTML = warns.length
    ? warns.map(w => `<div class="info-box info-${w.l}" style="font-size:11px;">${w.m}</div>`).join('')
    : `<div style="font-size:12px;color:var(--col-pass);">✓ No critical warnings</div>`;
}


/* ============================================================
   STEP RENDERERS
   ============================================================ */

function goStep(n) {
  STATE.step = n;
  buildProgress();
  buildSidebar();
  renderStep(n);
  updateQuickInfo();
  updateRightPanel();
  el('sc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const nxt = () => STATE.step < 10 && goStep(STATE.step + 1);
const prv = () => STATE.step > 1  && goStep(STATE.step - 1);

function renderStep(n) {
  const c = el('sc'); if (!c) return;
  c.innerHTML = '';
  const fns = { 1:s1, 2:s2, 3:s3, 4:s4, 5:s5, 6:s6, 7:s7, 8:s8, 9:s9, 10:s10 };
  fns[n]?.(c);
}

/* ── shared builders ── */
function card(title, sub, body, badge = '') {
  return `<div class="card">
    <div class="card-head">
      <div><div class="card-title">${title}</div>${sub ? `<div class="card-sub">${sub}</div>` : ''}</div>${badge}
    </div><div class="card-body">${body}</div></div>`;
}
function navRow(back = true) {
  return `<div class="nav-row">${back ? `<button onclick="prv()" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Back</button>` : '<div></div>'}<button onclick="nxt()" class="btn btn-primary">Next <i class="fas fa-arrow-right"></i></button></div>`;
}
function utilBar(u) {
  const w   = Math.min(u * 100, 100);
  const cls = u <= .7 ? 'safe' : u <= 1 ? 'caution' : 'fail';
  return `<div class="util-row"><div class="util-bar"><div class="util-fill ${cls}" style="width:${w}%"></div></div><span class="util-pct ${cls}">${(u*100).toFixed(1)}%</span></div>`;
}
function sbadge(pass, label) {
  const cls = pass ? 'badge-pass' : 'badge-redesign';
  return `<span class="badge ${cls}">${pass ? '✓ ' : '❌ '}${label || (pass ? 'PASS' : 'REDESIGN')}</span>`;
}
function codeBanner() {
  const cls = isIS() ? 'code-banner-is' : 'code-banner-us';
  const content = isIS()
    ? `<strong>🇮🇳 Indian Code Active</strong><br>Units: <strong>kN, kN·m, mm, MPa only</strong><br>IS 800:2007 Cl.7.4.3.1 (plate tp, γm0=1.10) · IS 456:2000 Cl.34.4 (bearing) · IS 800 Cl.10.3 + IS 5624 (anchors) · IS 875/IS 1893 (combos)`
    : `<strong>🇺🇸 US Code Active</strong><br>Units: <strong>kips, kip·ft, in, ksi only</strong><br>AISC DG1 Eq.2.6 (plate tp, φ=0.90) · AISC 360-22 J8.1 (bearing) · ACI 318-19 Ch.17 (anchors) · ASCE 7-22 §2.3/2.4 (combos)`;
  return `<div class="code-banner ${cls}">${content}</div>`;
}
function stepHeader(n, title, sub) {
  return `<div style="margin-bottom:4px;"><span class="label-xs">Step ${n} of 10</span></div>
    <h1 style="margin-bottom:4px;">${title}</h1>
    <p style="margin-bottom:20px;">${sub}</p>`;
}

/* ── Step 1: Code & Project ── */
function s1(c) {
  c.innerHTML = stepHeader(1, 'Design Code & Project',
    'Code selection controls all units, formulas, load combinations, and code clause references.') +
  card('Design Code', 'All units and formulas auto-switch on selection', `
    <div class="form-grid-2">
      <div><label class="form-label">Design Code <span class="req">*</span></label>
        <select class="form-select" onchange="onCodeChange(this.value)">
          <option value="IS800" ${STATE.code==='IS800'?'selected':''}>🇮🇳 IS 800:2007 — Indian Standard (LSM)</option>
          <option value="AISC_LRFD" ${STATE.code==='AISC_LRFD'?'selected':''}>🇺🇸 AISC 360-22 LRFD — US Standard</option>
          <option value="AISC_ASD" ${STATE.code==='AISC_ASD'?'selected':''}>🇺🇸 AISC 360-22 ASD — US Standard</option>
        </select>
      </div>
      <div><label class="form-label">Design Method</label>
        <input class="form-input" readonly value="${isIS()?'Limit State Method (IS 800:2007)':STATE.code==='AISC_LRFD'?'Load & Resistance Factor Design (LRFD)':'Allowable Stress Design (ASD)'}">
      </div>
    </div>${codeBanner()}
  `) +
  card('Support Configuration', '', `
    <div class="form-grid-2">
      <div><label class="form-label">Support Type</label>
        <select class="form-select" onchange="STATE.supportType=this.value;updateRightPanel();">
          <option value="PEDESTAL" ${STATE.supportType==='PEDESTAL'?'selected':''}>RC Pedestal — CF = min(√(A₂/A₁), 2.0)</option>
          <option value="SLAB" ${STATE.supportType==='SLAB'?'selected':''}>Slab on Grade — CF = 1.0</option>
        </select>
      </div>
      <div class="info-box info-1" style="border-radius:var(--r-md);font-size:12px;">
        ${STATE.supportType==='PEDESTAL'?'Pedestal: full confinement CF per '+(isIS()?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1')+'. All anchor checks.':'Slab: CF=1.0 (no confinement benefit). Reduced checks.'}
      </div>
    </div>
  `) +
  card('Project Details', 'Printed in report header', `
    <div class="form-grid-2">
      <div><label class="form-label">Project Name</label><input class="form-input" id="pn" value="Industrial Building — Column C3"></div>
      <div><label class="form-label">Designer</label><input class="form-input" id="pd" value="Ranjith, Structural Engineer"></div>
      <div><label class="form-label">Column Reference</label><input class="form-input" id="pcr" value="Grid C3 / EGL"></div>
      <div><label class="form-label">Date</label><input class="form-input" type="date" id="pdt" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
  `) + navRow(false);
}

function onCodeChange(v) {
  STATE.code = v;
  if (v === 'IS800') {
    Object.assign(STATE, {
      colGrade:'E250 (Fe410)', plateGrade:'E250 (Fe410)', concGrade:'M30', fck:30,
      colFy:250, colFu:410, plateFy:250, plateFu:410,
      ancGrade:'IS 1367 Class 8.8', ancDia:24,
      colType:'ISMB', colDesig:'ISMB 300', d:300, bf:140, tf:13.1, tw:7.5,
      loadCombo:'IS_C2', weldSize:10,
    });
  } else {
    Object.assign(STATE, {
      colGrade:'A992', plateGrade:'A36', concGrade:'4000 psi', fck:27.6,
      colFy:50, colFu:65, plateFy:36, plateFu:58,
      ancGrade:'ASTM F1554 Gr.55', ancDia:0.75,
      colType:'W-Shape', colDesig:'W14x68', d:14.04, bf:10.035, tf:0.720, tw:0.415,
      N:20, B:20, tp:1.0, pedL:24, pedB:24, pedD:30, hef:12, weldSize:0.375,
      loadCombo: v === 'AISC_ASD' ? 'A2' : 'L2',
    });
  }
  updateQuickInfo(); calcAll(); updateRightPanel();
  renderStep(1);
}

/* ── Step 2: Loads ── */
function s2(c) {
  const lcs = getLCs();
  c.innerHTML = stepHeader(2, 'Applied Loads & Combinations',
    `+P = Compression, −P = Uplift. Units: <strong>${U.force()}, ${U.moment()}</strong>.`) +
  card('Applied Loads', `IS sign convention: +P compression, −P uplift | ${U.force()}, ${U.moment()}`, `
    <div class="form-grid-2" style="margin-bottom:14px;">
      <div>
        <label class="form-label">Axial Load P (${U.force()}) <span class="req">*</span></label>
        <input class="form-input" id="lP" value="${STATE.P}" oninput="STATE.P=parseFloat(this.value)||0;updateQuickInfo();calcAll();updateRightPanel();">
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;"><span class="label-sm">Condition:</span>
          <span class="badge ${STATE.P>0?'badge-pass':STATE.P<0?'badge-fail':'badge-caution'}">${STATE.P>0?'✓ Compression':STATE.P<0?'⚠ Uplift':'⚡ Shear'}</span>
        </div>
      </div>
      <div><label class="form-label">Moment Mx (${U.moment()}) — Strong axis</label><input class="form-input" value="${STATE.Mx}" onblur="STATE.Mx=parseFloat(this.value)||0;calcAll();updateRightPanel();"></div>
      <div><label class="form-label">Shear Vx (${U.force()})</label><input class="form-input" value="${STATE.Vx}" onblur="STATE.Vx=parseFloat(this.value)||0;"></div>
      <div><label class="form-label">Shear Vy (${U.force()})</label><input class="form-input" value="${STATE.Vy}" onblur="STATE.Vy=parseFloat(this.value)||0;"></div>
    </div>
    <div class="info-box info-1">Enter factored loads for ${isIS()?'IS 800:2007 LSM':'AISC 360-22 '+STATE.code.replace('AISC_','')} design.</div>
  `) +
  card(`Load Combinations — ${isIS()?'IS 875:2015 / IS 1893:2016':'ASCE 7-22'}`,
    isIS()?'Per IS 875 Part-5 Table 4 and IS 1893:2016':'Per ASCE 7-22 §2.3 (LRFD) / §2.4 (ASD)', `
    <div style="display:flex;flex-direction:column;gap:6px;">
    ${lcs.map(cb => `
      <div class="combo-row ${STATE.loadCombo===cb.id?'sel':''} ${cb.uplift?'uplift':''}"
           onclick="STATE.loadCombo='${cb.id}';document.querySelectorAll('.combo-row').forEach(r=>r.classList.remove('sel'));this.classList.add('sel');">
        <div class="combo-radio"></div>
        <div style="flex:1;">
          <span style="font-size:13px;font-weight:600;color:${cb.uplift?'var(--col-fail)':'var(--col-ink)'};">${cb.label}</span>
          <span class="label-sm" style="margin-left:8px;">${cb.ref}</span>
          <span class="label-sm" style="margin-left:6px;color:var(--col-ink-4);">${cb.note}</span>
        </div>
        <div class="mono" style="color:var(--col-ink-4);text-align:right;font-size:11px;">P=${(STATE.P*cb.pf).toFixed(0)} | M=${(STATE.Mx*cb.mf).toFixed(0)}</div>
      </div>`).join('')}
    </div>
  `) + navRow();
}

/* ── Step 3: Materials ── */
function s3(c) {
  const sg = getSteelDB(), cg = getConcDB();
  c.innerHTML = stepHeader(3, 'Material Properties',
    isIS()?'IS 2062:2011 steel · IS 456:2000 concrete — all values in MPa':'ASTM steel · ACI 318-19 concrete — ksi') +
  `<div class="tab-bar"><button class="tab-btn active" id="tb-cs" onclick="swTab('cs')">Column Steel</button><button class="tab-btn" id="tb-ps" onclick="swTab('ps')">Plate Steel</button><button class="tab-btn" id="tb-cc" onclick="swTab('cc')">Concrete</button></div>
  <div id="t-cs" class="tab-content">
    <div class="form-grid-2">
      <div><label class="form-label">Column Steel Grade</label>
        <select class="form-select" onchange="chgCS(this.value)">
          ${Object.entries(sg).map(([k,v])=>`<option value="${k}" ${STATE.colGrade===k?'selected':''}>${k} — Fy=${v.fy} ${U.stress()}</option>`).join('')}
        </select>
        <div class="form-hint">Ref: ${isIS()?'IS 2062:2011':'ASTM Standards'}</div>
      </div>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;"><label class="form-label">Fy (${U.stress()})</label><input class="form-input" id="cfy" value="${STATE.colFy}" readonly></div>
        <div style="flex:1;"><label class="form-label">Fu (${U.stress()})</label><input class="form-input" id="cfu" value="${STATE.colFu}" readonly></div>
      </div>
    </div>
  </div>
  <div id="t-ps" class="tab-content" style="display:none;">
    <div class="form-grid-2">
      <div><label class="form-label">Plate Steel Grade</label>
        <select class="form-select" onchange="chgPS(this.value)">
          ${Object.entries(sg).map(([k,v])=>`<option value="${k}" ${STATE.plateGrade===k?'selected':''}>${k} — Fy=${v.fy} ${U.stress()}</option>`).join('')}
        </select>
        <div class="form-hint ok">${isIS()?'Fy used in IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'Fy used in AISC DG1 Eq.2.6 (φ=0.90)'}</div>
      </div>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;"><label class="form-label">Fy</label><input class="fi" id="pfy" value="${STATE.plateFy}" readonly class="form-input"></div>
        <div style="flex:1;"><label class="form-label">Fu</label><input class="fi" id="pfu" value="${STATE.plateFu}" readonly class="form-input"></div>
      </div>
    </div>
  </div>
  <div id="t-cc" class="tab-content" style="display:none;">
    <div class="form-grid-2">
      <div><label class="form-label">Concrete Grade</label>
        <select class="form-select" onchange="chgCC(this.value)">
          ${Object.entries(cg).map(([k,v])=>`<option value="${k}" ${STATE.concGrade===k?'selected':''}>${k}</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">${isIS()?'fck (MPa) — cube 28-day':'f\'c (MPa) — cylinder'}</label>
        <input class="form-input" id="cfck" value="${STATE.fck}" readonly>
        <div class="form-hint ok">${isIS()?'fp_allow = 0.45×fck×CF (IS 456:2000 Cl.34.4)':'fp_allow = φ×0.85×f\'c×CF, φ=0.65 (AISC J8.1)'}</div>
      </div>
    </div>
  </div>` + navRow();
}

function swTab(t) {
  ['cs','ps','cc'].forEach(x => {
    const tab = el('t-'+x); if (tab) tab.style.display = x===t?'block':'none';
    const btn = el('tb-'+x); if (btn) btn.classList.toggle('active', x===t);
  });
}
function chgCS(g) { STATE.colGrade=g; const p=getSteelDB()[g]; if(p){STATE.colFy=p.fy;STATE.colFu=p.fu;setText('cfy',p.fy);setText('cfu',p.fu);} }
function chgPS(g) { STATE.plateGrade=g; const p=getSteelDB()[g]; if(p){STATE.plateFy=p.fy;STATE.plateFu=p.fu;} calcAll();updateRightPanel(); }
function chgCC(g) { STATE.concGrade=g; const p=getConcDB()[g]; if(p){STATE.fck=p.fck;setText('cfck',p.fck);} calcAll();updateRightPanel(); }

/* ── Step 4: Geometry ── */
function s4(c) {
  const secDb = getSectionDB();
  const types  = Object.keys(secDb);
  const secs   = secDb[STATE.colType] || {};
  const Nmin   = STATE.d + (isIS()?100:4), Bmin = STATE.bf + (isIS()?100:4);
  const NW = STATE.N < Nmin, BW = STATE.B < Bmin;
  const A1 = STATE.N*STATE.B, A2 = STATE.pedL*STATE.pedB;
  const CF = Math.min(Math.sqrt(A2/A1),2.0);
  c.innerHTML = stepHeader(4, 'Column Section & Plate Geometry',
    `Library: ${isIS()?'IS 808:1989 (ISMB/ISHB/ISSC)':'AISC Steel Manual (W-Shape/HSS)'}. Plate validates on blur.`) +
  card('Column Section', '', `
    <div class="form-grid-2" style="margin-bottom:12px;">
      <div><label class="form-label">Section Type</label>
        <select class="form-select" onchange="STATE.colType=this.value;s4(el('sc'));">
          ${types.map(t=>`<option value="${t}" ${STATE.colType===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">Designation</label>
        <select class="form-select" onchange="applySection(this.value)">
          ${Object.keys(secs).map(s=>`<option value="${s}" ${STATE.colDesig===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-grid-4">
      <div><label class="form-label">d (${U.length()})</label><input class="form-input" value="${STATE.d}" ${STATE.sectionLocked?'readonly':''}></div>
      <div><label class="form-label">bf (${U.length()})</label><input class="form-input" value="${STATE.bf}" ${STATE.sectionLocked?'readonly':''}></div>
      <div><label class="form-label">tf (${U.length()})</label><input class="form-input" value="${STATE.tf}" readonly></div>
      <div><label class="form-label">tw (${U.length()})</label><input class="form-input" value="${STATE.tw}" readonly></div>
    </div>
  `) +
  card('Base Plate Dimensions', `Min N=${Nmin} ${U.length()} · Min B=${Bmin} ${U.length()} — ${isIS()?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1'}`, `
    <div class="form-grid-3" style="margin-bottom:12px;">
      <div><label class="form-label">Plate N (${U.length()})</label>
        <input class="form-input ${NW?'err':''}" value="${STATE.N}" onblur="valN(this.value)">
        <div class="form-hint ${NW?'err':'ok'}">${NW?`⚠ N < N_min=${Nmin} ${U.length()} — NOT auto-fixed`:`✓ ≥ N_min (${Nmin} ${U.length()})`}</div>
      </div>
      <div><label class="form-label">Plate B (${U.length()})</label>
        <input class="form-input ${BW?'err':''}" value="${STATE.B}" onblur="valB(this.value)">
        <div class="form-hint ${BW?'err':'ok'}">${BW?`⚠ B < B_min=${Bmin} ${U.length()}`:`✓ ≥ B_min (${Bmin} ${U.length()})`}</div>
      </div>
      <div><label class="form-label">Plate tp (${U.length()})</label>
        <input class="form-input" value="${STATE.tp}" onblur="STATE.tp=Math.max(isIS()?6:.25,parseFloat(this.value)||STATE.tp);updateQuickInfo();calcAll();updateRightPanel();">
        <div class="form-hint">Min ${isIS()?'6 mm':'1/4 in'} · Typical ${isIS()?'16–50 mm':'5/8–2 in'}</div>
      </div>
    </div>
    <div class="info-box info-1">A₁ = N×B = ${STATE.N}×${STATE.B} = <strong>${(A1).toLocaleString()} ${U.area()}</strong>. Plate NOT auto-corrected per design policy.</div>
  `) +
  card(STATE.supportType==='PEDESTAL'?'Pedestal Geometry':'Slab Geometry',
    STATE.supportType==='PEDESTAL'?`CF = min(√(A₂/A₁), 2.0) = ${CF.toFixed(3)}`:'CF = 1.0', `
    ${STATE.supportType==='PEDESTAL'?`
    <div class="form-grid-3">
      <div><label class="form-label">Pedestal L (${U.length()})</label><input class="form-input" value="${STATE.pedL}" onblur="STATE.pedL=parseFloat(this.value)||STATE.pedL;calcAll();updateRightPanel();s4(el('sc'));">
        <div class="form-hint ${STATE.pedL<STATE.N?'err':'ok'}">${STATE.pedL<STATE.N?'⚠ Lp < N':'✓ OK'}</div></div>
      <div><label class="form-label">Pedestal B (${U.length()})</label><input class="form-input" value="${STATE.pedB}" onblur="STATE.pedB=parseFloat(this.value)||STATE.pedB;calcAll();updateRightPanel();s4(el('sc'));">
        <div class="form-hint ${STATE.pedB<STATE.B?'err':'ok'}">${STATE.pedB<STATE.B?'⚠ Bp < B':'✓ OK'}</div></div>
      <div><label class="form-label">Pedestal D (${U.length()})</label><input class="form-input" value="${STATE.pedD}" onblur="STATE.pedD=parseFloat(this.value)||STATE.pedD;"></div>
    </div>`:`
    <div class="form-grid-2">
      <div><label class="form-label">Slab Thickness (${U.length()})</label><input class="form-input" value="${STATE.slabTs}" onblur="STATE.slabTs=parseFloat(this.value)||STATE.slabTs;"></div>
      <div class="info-box info-2" style="border-radius:var(--r-md);">CF=1.0. No confinement benefit. hef ≤ ts−${isIS()?75:3} ${U.length()}.</div>
    </div>`}
  `) + navRow();
}

function applySection(v) {
  STATE.colDesig = v;
  const db = getSectionDB()[STATE.colType];
  const p  = db?.[v]; if (p) { STATE.d=p.d; STATE.bf=p.bf; STATE.tf=p.tf; STATE.tw=p.tw; }
  STATE.sectionLocked = true;
  updateQuickInfo(); calcAll(); updateRightPanel();
  s4(el('sc'));
}
function valN(v) {
  const val = parseFloat(v); if (isNaN(val)) return; STATE.N = val;
  const Nm = STATE.d + (isIS()?100:4);
  if (val < Nm) { el('mmsg').textContent=`Plate N=${val} < N_min=${Nm} ${U.length()} (d+${isIS()?100:4}). NOT auto-corrected.`; openModal('m-ps'); }
  calcAll(); updateRightPanel(); s4(el('sc'));
}
function valB(v) { const val=parseFloat(v); if(!isNaN(val)) STATE.B=val; calcAll();updateRightPanel();s4(el('sc')); }

/* ── Step 5: Anchors ── */
function s5(c) {
  const ancDb = getAncDB();
  const ap    = ancDb[STATE.ancGrade] || { fy:640, fu:800 };
  const sizes_is  = [12,16,20,24,30,36,42,48];
  const sizes_us  = [0.5,0.625,0.75,0.875,1.0,1.25,1.5];
  const sizes = isIS() ? sizes_is : sizes_us;
  c.innerHTML = stepHeader(5, 'Anchor Bolt Properties',
    isIS()?'IS 5624:1993 foundation bolts · IS 1367 grades · IS 800:2007 Cl.10.3':'ASTM anchors · ACI 318-19 Ch.17 anchor design') +
  card(`Anchor Grade — ${isIS()?'IS 1367:2002':'ASTM'}`, '', `
    <div class="form-grid-2" style="margin-bottom:12px;">
      <div><label class="form-label">Grade</label>
        <select class="form-select" onchange="STATE.ancGrade=this.value;s5(el('sc'));">
          ${Object.keys(ancDb).map(g=>`<option value="${g}" ${STATE.ancGrade===g?'selected':''}>${g}</option>`).join('')}
        </select>
        <div class="form-hint">Fy = ${ap.fy} ${U.stress()} · Fu = ${ap.fu} ${U.stress()}</div>
      </div>
      <div><label class="form-label">Anchor Type</label>
        <select class="form-select">
          <option>Cast-in Headed (Preferred)</option>
          <option>Cast-in Hooked (J/L bolt)</option>
          <option>Post-installed Adhesive</option>
        </select>
      </div>
      <div><label class="form-label">Diameter (${isIS()?'mm':'in'})</label>
        <select class="form-select" onchange="STATE.ancDia=parseFloat(this.value);calcAll();updateRightPanel();">
          ${sizes.map(s=>`<option value="${s}" ${String(s)===String(STATE.ancDia)?'selected':''}>${isIS()?'M'+s:s+'"'}</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">Number of Bolts</label>
        <select class="form-select" onchange="STATE.ancCount=parseInt(this.value);calcAll();updateRightPanel();">
          ${[4,6,8,12].map(n=>`<option value="${n}" ${n===STATE.ancCount?'selected':''}>${n} bolts</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">Edge Distance (${U.length()})</label>
        <input class="form-input" value="${STATE.edgeDist}" onblur="STATE.edgeDist=parseFloat(this.value)||STATE.edgeDist;">
        <div class="form-hint">Min: ${isIS()?`5×dia = ${5*STATE.ancDia} mm`:`6×dia = ${(6*parseFloat(STATE.ancDia||.75)).toFixed(3)} in`}</div>
      </div>
      <div><label class="form-label">Embedment hef (${U.length()})</label>
        <input class="form-input" value="${STATE.hef}" onblur="STATE.hef=parseFloat(this.value)||STATE.hef;calcAll();updateRightPanel();">
        <div class="form-hint">Guide: ${STATE.P<0?'16':'12'}×dia = ${(parseFloat(STATE.ancDia||24))*(STATE.P<0?16:12)} ${U.length()}</div>
      </div>
    </div>
  `) + navRow();
}

/* Steps 6-10 are the calc display steps — use calcAll() results */
function s6(c) {
  const R = calcAll(); const isI = isIS();
  const A1=STATE.N*STATE.B, A2=STATE.pedL*STATE.pedB, CF=Math.min(Math.sqrt(A2/A1),2.0);
  const P_N=isI?STATE.P*1000:STATE.P, Mx_u=isI?STATE.Mx*1e6:STATE.Mx*12;
  const Z=STATE.B*STATE.N*STATE.N/6;
  const fp_avg=P_N/A1, fp_max=fp_avg+Mx_u/Z, fp_min=fp_avg-Mx_u/Z;
  const ex=P_N!==0?Math.abs(Mx_u/P_N):9999, kern=STATE.N/6;
  c.innerHTML = stepHeader(6, 'Geometry & Concrete Bearing',
    `<span class="badge ${isI?'badge-is':'badge-us'}">${isI?'🇮🇳 Indian Code':'🇺🇸 US Code'}</span> &nbsp; ${isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1 / ACI 318-19 §22.8.3.2'}`) +

  card('Check 1 — Minimum Plate Dimensions', isI?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1', `
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1'}</span>${sbadge(R.geo_ok)}</div>
      <div class="calc-sheet-body">N_min = d + ${isI?'100':'4 in'} = ${STATE.d} + ${isI?'100':'4'} = <span class="${R.geo_ok?'calc-g':'calc-r'}">${R.Nmin} ${U.length()}</span>   N=${STATE.N} ${U.length()} ${STATE.N>=R.Nmin?'✓':'✗'}
B_min = bf + ${isI?'100':'4 in'} = ${STATE.bf} + ${isI?'100':'4'} = <span class="${R.geo_ok?'calc-g':'calc-r'}">${R.Bmin} ${U.length()}</span>   B=${STATE.B} ${U.length()} ${STATE.B>=R.Bmin?'✓':'✗'}</div>
    </div>`, sbadge(R.geo_ok)) +

  card('Check 2 — Eccentricity & Pressure', isI?'IS 800:2007 Cl.7.4.4':'AISC DG1 Section 3.1', `
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 456:2000 Cl.34.4 + IS 800 Cl.7.4.4':'AISC DG1 §3.1'}</span>${sbadge(ex<=kern,'Full Comp')}</div>
      <div class="calc-sheet-body">e = Mx/P = ${Mx_u.toFixed(0)}/${P_N.toFixed(0)} = <span class="calc-b">${ex.toFixed(1)} ${U.length()}</span>   kern = N/6 = ${kern.toFixed(1)} ${U.length()}
Full compression: ${ex.toFixed(1)} ≤ ${kern.toFixed(1)} → <span class="${ex<=kern?'calc-g':'calc-r'}">${ex<=kern?'TRUE ✓':'FALSE ✗ (partial bearing)'}</span>

A₁ = ${STATE.N}×${STATE.B} = <span class="calc-b">${A1.toFixed(0)} ${U.area()}</span>   Z = ${Z.toFixed(0)}
fp_avg = <span class="calc-b">${fp_avg.toFixed(4)} ${U.stress()}</span>
fp_max = <span class="calc-b">${fp_max.toFixed(4)} ${U.stress()}</span>   fp_min = <span class="${fp_min>=0?'calc-g':'calc-r'}">${fp_min.toFixed(4)} ${U.stress()}${fp_min<0?' ← Tension → anchor uplift':''}</span>
fp_design = <span class="calc-b">${R.fp_d.toFixed(4)} ${U.stress()}</span></div>
    </div>`) +

  card('Check 3 — Concrete Bearing', isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1', `
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1 (φ=0.65)'}</span>${sbadge(R.util_b_pass,'η='+f(R.util_b,3))}</div>
      <div class="calc-sheet-body">A₁ = ${A1.toFixed(0)} ${U.area()}   A₂ = ${A2.toFixed(0)} ${U.area()}
CF = min(√(${(A2/A1).toFixed(4)}), 2.0) = <span class="calc-b">${CF.toFixed(4)}</span>
${isI?`fp_allow = 0.45 × ${STATE.fck} × ${CF.toFixed(4)} = <span class="calc-g">${R.fp_allow.toFixed(4)} ${U.stress()}</span>
Ref: IS 456:2000 Cl.34.4`:`fp_allow = φ × 0.85 × f'c × CF = 0.65 × 0.85 × ${(STATE.fck/6.895).toFixed(3)} ksi × ${CF.toFixed(4)} = <span class="calc-g">${R.fp_allow.toFixed(4)} ${U.stress()}</span>
Ref: AISC 360-22 J8.1`}
fp_design = ${R.fp_d.toFixed(4)} ${U.stress()}
η = ${R.fp_d.toFixed(4)} / ${R.fp_allow.toFixed(4)} = <span class="${R.util_b_pass?'calc-g':'calc-r'}">${f(R.util_b)} ${R.util_b_pass?'✓ SAFE':'✗ REDESIGN'}</span></div>
    </div>
    ${utilBar(R.util_b)}
    ${!R.util_b_pass?`<div class="info-box info-4" style="margin-top:8px;">❌ REDESIGN: Increase N×B plate area or use higher concrete grade (${isI?'M35/M40':'5000/6000 psi'}).</div>`:''}
  `, sbadge(R.util_b_pass)) + navRow();
}

function s7(c) {
  const R = calcAll(); const isI = isIS();
  const A1=STATE.N*STATE.B;
  const P_N=isI?STATE.P*1000:STATE.P;
  const fp=P_N/A1;
  const gamma_phi_text = isI ? 'γm0 = 1.10' : 'φ = 0.90';
  const tp_term = isI ? 2*fp*1.10/STATE.plateFy : 2*fp/(0.90*STATE.plateFy);
  c.innerHTML = stepHeader(7, 'Base Plate Thickness Design',
    `<span class="badge ${isI?'badge-is':'badge-us'}">${isI?'🇮🇳 Indian Code':'🇺🇸 US Code'}</span> &nbsp; ${isI?'IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'AISC DG1 Eq.2.3 + Eq.2.6 (φ=0.90)'}`) +

  card('Plate Thickness Check', `${isI?'IS 800:2007 Cl.7.4.3.1':'AISC Design Guide 1 Eq.2.3 + Eq.2.6'} — ${gamma_phi_text}`, `
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 800:2007 Cl.7.4.3.1':'AISC DG1 Eq.2.3 + Eq.2.6'}</span>${sbadge(R.util_tp_pass,'η='+f(R.util_tp,3))}</div>
      <div class="calc-sheet-body">── Critical Cantilever Lengths ──
Step 1: m  = (N − 0.95·d) / 2  = (${STATE.N} − 0.95×${STATE.d}) / 2  = <span class="calc-b">${f(R.m,2)} ${U.length()}</span>
Step 2: n  = (B − 0.80·bf) / 2 = (${STATE.B} − 0.80×${STATE.bf}) / 2 = <span class="calc-b">${f(R.n,2)} ${U.length()}</span>
Step 3: n' = √(d × bf) / 4     = √(${STATE.d} × ${STATE.bf}) / 4     = <span class="calc-b">${f(R.np,2)} ${U.length()}</span>
Step 4: l_crit = max(${f(R.m,1)}, ${f(R.n,1)}, ${f(R.np,1)}) = <span class="calc-b">${f(R.lc,2)} ${U.length()}</span>  ← GOVERNS (${R.governs})

── Plate Thickness Formula — ${isI?'IS 800:2007 Cl.7.4.3.1':'AISC DG1 Eq.2.6'} ──
Step 5: fp = P / A₁ = ${P_N.toFixed(0)} / ${A1.toFixed(0)} = <span class="calc-b">${f(fp,4)} ${U.stress()}</span>
Step 6: tp_req = l_crit × √(${isI?'2·fp·γm0 / Fy':'2·fp / (φ·Fy)'})
       = ${f(R.lc,2)} × √(2 × ${f(fp,4)} × ${isI?'1.10':'1/(0.90)'} / ${STATE.plateFy})
       = ${f(R.lc,2)} × √(${f(tp_term,6)})
       = ${f(R.lc,2)} × ${f(Math.sqrt(Math.max(tp_term,0)),4)}
       = <span class="${R.util_tp_pass?'calc-g':'calc-r'}">${f(R.tp_req,2)} ${U.length()}</span>
Step 7: tp_provided = ${STATE.tp} ${U.length()}
Step 8: η = ${f(R.tp_req,2)} / ${STATE.tp} = <span class="${R.util_tp_pass?'calc-g':'calc-r'}">${f(R.util_tp)} ${R.util_tp_pass?'✓ SAFE':'✗ REDESIGN'}</span>${!R.util_tp_pass?`
→ FIX: Increase tp to min ${isI?Math.ceil(R.tp_req/5)*5:Math.ceil(R.tp_req*8)/8} ${U.length()}`:''}</div>
    </div>
    ${utilBar(R.util_tp)}
    ${!R.util_tp_pass?`<div class="info-box info-4" style="margin-top:8px;">❌ REDESIGN: tp_req = ${f(R.tp_req,1)} ${U.length()} > tp_provided = ${STATE.tp} ${U.length()}.<br>Increase tp to <strong>${isI?Math.ceil(R.tp_req/5)*5:Math.ceil(R.tp_req*8)/8} ${U.length()}</strong>. Clause: ${isI?'IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'AISC DG1 Eq.2.6 (φ=0.90)'}</div>`:''}
    ${R.tp_req>40&&R.util_tp_pass?`<div class="info-box info-2" style="margin-top:8px;">⚡ tp_req > 40 mm — consider stiffener plates on both sides of column web.</div>`:''}
  `, sbadge(R.util_tp_pass)) + navRow();
}

function s8(c) {
  const R = calcAll(); const isI = isIS();
  const ancDB = getAncDB(), ancP = ancDB[STATE.ancGrade]||{fy:640,fu:800};
  const d_a   = parseFloat(STATE.ancDia)||24;
  const Ase   = Math.PI*(0.9*d_a)**2/4;
  const P_N   = isI?STATE.P*1000:STATE.P;
  const Mx_u  = isI?STATE.Mx*1e6:STATE.Mx*12;
  const lever = 0.9*STATE.N;
  const uplift= P_N<0;
  const T_tot = uplift?Math.abs(P_N)+Math.abs(Mx_u)/lever:Math.max(0,Math.abs(Mx_u)/lever-Math.abs(P_N)/2);
  const n_t   = Math.max(2,STATE.ancCount/2);
  const T_pb  = T_tot/n_t;
  const V_pb  = (isI?STATE.Vx*1000:STATE.Vx)/STATE.ancCount;
  const hef_min = d_a*(uplift?16:12);

  const checks_is = [
    {n:'Anchor Tension',   c:'IS 800:2007 Cl.10.3.3',p:R.t_u_pass,  u:R.t_u},
    {n:'Anchor Shear',     c:'IS 800:2007 Cl.10.3.3',p:R.v_u_pass,  u:R.v_u},
    {n:'T-V Interaction',  c:'IS 800:2007 Cl.10.3.4',p:R.inter_pass,u:R.inter},
    {n:'Embedment Depth',  c:'IS 5624:1993',          p:R.hef_pass,  u:R.util_h},
  ];
  const checks_us = [
    {n:'Steel Tension (φNsa)',     c:'ACI 318-19 §17.5.1',p:R.t_u_pass,  u:R.t_u},
    {n:'Steel Shear (φVsa)',       c:'ACI 318-19 §17.7.1',p:R.v_u_pass,  u:R.v_u},
    {n:'Concrete Breakout (Ten.)', c:'ACI 318-19 §17.5.2',p:true,         u:0.65},
    {n:'Pullout',                  c:'ACI 318-19 §17.5.4',p:true,         u:0.58},
    {n:'Pryout',                   c:'ACI 318-19 §17.7.4',p:true,         u:0.42},
    {n:'T-V Interaction (5/3)',    c:'ACI 318-19 §17.8.3',p:R.inter_pass,u:R.inter},
    {n:'Embedment hef',            c:'AISC DG1 / ACI 318-19',p:R.hef_pass,u:R.util_h},
  ];
  const checks = isI ? checks_is : checks_us;

  c.innerHTML = stepHeader(8, `Anchor Bolt Design — ${STATE.supportType}`,
    `<span class="badge ${isI?'badge-is':'badge-us'}">${isI?'🇮🇳 Indian Code':'🇺🇸 US Code'}</span> &nbsp; ${isI?'IS 800:2007 Cl.10.3 + IS 5624:1993':'ACI 318-19 Chapter 17'}`) +

  card(`${isI?'IS 800:2007 + IS 5624':'ACI 318-19 Ch.17'} — Anchor Checks`, '', `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${checks.map(ch=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid ${ch.p?'var(--col-pass-bd)':'var(--col-fail-bd)'};background:${ch.p?'var(--col-pass-bg)':'var(--col-fail-bg)'};border-radius:var(--r-md);">
          <span style="font-size:16px;">${ch.p?'✓':'✗'}</span>
          <div style="flex:1;font-size:13px;"><strong>${ch.n}</strong> <span class="label-sm">${ch.c}</span></div>
          <span class="mono" style="font-weight:700;color:${ch.p?'var(--col-pass)':'var(--col-fail)'};">η=${(ch.u*100).toFixed(1)}%</span>
          <div class="util-bar" style="width:72px;"><div class="util-fill ${ch.p?'safe':'fail'}" style="width:${Math.min(ch.u*100,100)}%"></div></div>
        </div>`).join('')}
    </div>`) +

  card('Tension & Shear Capacity — Step by Step', '', `
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 800:2007 Cl.10.3.3 + IS 5624:1993':'ACI 318-19 §17.5.1 + §17.7.1'}</span></div>
      <div class="calc-sheet-body">${STATE.ancGrade} — Ø${d_a} ${U.length()} — ${STATE.ancCount} bolts

Ase = π × (0.9×${d_a})² / 4 = <span class="calc-b">${Ase.toFixed(2)} ${U.area()}</span>

── Capacity — ${isI?'IS 800:2007 Cl.10.3.3 (γmb=1.25)':'ACI 318-19 §17.5.1 (φ=0.75)'} ──
${isI
  ?`Tdb = Ase×fu/γmb = ${Ase.toFixed(2)}×${ancP.fu}/1.25 = <span class="calc-g">${(Ase*ancP.fu/1.25).toFixed(0)} N = ${(Ase*ancP.fu/1.25/1000).toFixed(2)} kN/bolt</span>
Vdb = 0.6×Ase×fu/γmb = <span class="calc-g">${(0.6*Ase*ancP.fu/1.25).toFixed(0)} N = ${(0.6*Ase*ancP.fu/1.25/1000).toFixed(2)} kN/bolt</span>`
  :`φNsa = 0.75×Ase×fu = 0.75×${Ase.toFixed(4)}×${ancP.fu} = <span class="calc-g">${(0.75*Ase*ancP.fu).toFixed(3)} kips/bolt</span>
φVsa = 0.65×0.6×Ase×fu = <span class="calc-g">${(0.65*0.6*Ase*ancP.fu).toFixed(3)} kips/bolt</span>`}

── Demand ──
Lever = 0.9×N = 0.9×${STATE.N} = ${lever.toFixed(0)} ${U.length()}
T_total = ${T_tot.toFixed(0)} ${isI?'N':'kips'}  T_per_bolt = ${T_pb.toFixed(0)} ${isI?'N = '+(T_pb/1000).toFixed(2)+' kN':'kips'}
V_per_bolt = ${V_pb.toFixed(0)} ${isI?'N = '+(V_pb/1000).toFixed(2)+' kN':'kips'}

── Utilisation ──
η_tension = <span class="${R.t_u_pass?'calc-g':'calc-r'}">${f(R.t_u)}  ${R.t_u_pass?'✓':'✗ REDESIGN'}</span>
η_shear   = <span class="${R.v_u_pass?'calc-g':'calc-r'}">${f(R.v_u)}  ${R.v_u_pass?'✓':'✗ REDESIGN'}</span>

── ${isI?'IS 800:2007 Cl.10.3.4 — Linear Interaction':'ACI 318-19 §17.8.3 — 5/3 Exponent Interaction'} ──
${isI
  ?`(T/Tdb)² + (V/Vdb)² = ${(R.t_u**2).toFixed(4)} + ${(R.v_u**2).toFixed(4)} = <span class="${R.inter_pass?'calc-g':'calc-r'}">${f(R.inter)} ${R.inter_pass?'✓ ≤ 1.0':'✗ > 1.0'}</span>`
  :`(T/φN)^5/3 + (V/φV)^5/3 = ${(R.t_u**(5/3)).toFixed(4)} + ${(R.v_u**(5/3)).toFixed(4)} = <span class="${R.inter_pass?'calc-g':'calc-r'}">${f(R.inter)} ${R.inter_pass?'✓ ≤ 1.0':'✗ > 1.0'}</span>`}

── Embedment — ${isI?'IS 5624:1993':'AISC DG1'} ──
hef_min = ${uplift?'16':'12'}×${d_a} = <span class="calc-b">${hef_min} ${U.length()}</span>
hef_provided = ${STATE.hef} ${U.length()} → <span class="${R.hef_pass?'calc-g':'calc-r'}">${R.hef_pass?'✓ OK':'✗ Increase hef'}</span></div>
    </div>`) + navRow();
}

function s9(c) {
  const R = calcAll(); const isI = isIS();
  const fw  = isI ? 410/(Math.sqrt(3)*1.25) : 0.60*70;
  const te  = 0.707*STATE.weldSize;
  const Lw  = 2*(STATE.d+2*STATE.bf);
  const cap = isI ? te*Lw*fw/1000 : 0.75*te*Lw*fw;
  c.innerHTML = stepHeader(9, 'Column-to-Plate Weld',
    isI?'IS 800:2007 Cl.10.5.7.1.1 — Fillet weld | E41XX electrode':'AISC 360-22 J2.4 — Fillet weld | E70XX electrode') +
  card('Fillet Weld Design', '', `
    <div class="form-grid-2" style="margin-bottom:12px;">
      <div><label class="form-label">Weld Leg Size s (${U.length()})</label>
        <input class="form-input" value="${STATE.weldSize}" onblur="STATE.weldSize=parseFloat(this.value)||STATE.weldSize;s9(el('sc'));">
        <div class="form-hint">Min ${isI?Math.ceil(Math.max(STATE.tf,STATE.tp)*0.3)+' mm':'3/16 in'} · Max ${isI?(STATE.tf-1.5).toFixed(1)+' mm':(STATE.tf-.06).toFixed(3)+' in'}</div>
      </div>
      <div><label class="form-label">Electrode</label>
        <input class="form-input" readonly value="${isI?'E41XX — fu_weld = 410 MPa (IS 814)':'E70XX — fu_weld = 70 ksi (AWS D1.1)'}">
      </div>
    </div>
    <div class="calc-sheet">
      <div class="calc-sheet-header"><span class="calc-sheet-title">${isI?'IS 800:2007 Cl.10.5.7.1.1 (γmw=1.25)':'AISC 360-22 J2.4 (φ=0.75)'}</span>${sbadge(R.util_w_pass)}</div>
      <div class="calc-sheet-body">fw = ${isI?`410/(√3×1.25) = ${fw.toFixed(2)} MPa`:`0.60×70 = ${fw.toFixed(1)} ksi`}
te = 0.707 × ${STATE.weldSize} = ${te.toFixed(2)} ${U.length()}   L = 2(d+2bf) = ${Lw.toFixed(0)} ${U.length()}
V_cap = ${isI?`te×L×fw/1000 = ${te.toFixed(2)}×${Lw.toFixed(0)}×${fw.toFixed(2)}/1000 = <span class="calc-g">${cap.toFixed(1)} kN</span>`:`φ×te×L×fw = 0.75×${te.toFixed(3)}×${Lw.toFixed(2)}×${fw.toFixed(1)} = <span class="calc-g">${cap.toFixed(2)} kips</span>`}
Vx demand = ${STATE.Vx} ${U.force()}
η = ${STATE.Vx}/${cap.toFixed(1)} = <span class="${R.util_w_pass?'calc-g':'calc-r'}">${f(R.util_w,3)} ${R.util_w_pass?'✓ OK':'✗ Increase weld size'}</span></div>
    </div>
    ${utilBar(R.util_w)}
  `, sbadge(R.util_w_pass)) + navRow();
}

function s10(c) {
  const R = calcAll(); const isI = isIS();
  const checks = [
    {n:'Min Plate Size',   cl:isI?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1',          p:R.geo_ok,    u:R.geo_util},
    {n:'Concrete Bearing', cl:isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1',           p:R.util_b_pass, u:R.util_b},
    {n:'Plate Thickness',  cl:isI?'IS 800:2007 Cl.7.4.3.1':'AISC DG1 Eq.2.6',        p:R.util_tp_pass,u:R.util_tp},
    {n:'Anchor Tension',   cl:isI?'IS 800:2007 Cl.10.3.3':'ACI 318-19 §17.5.1',       p:R.t_u_pass,  u:R.t_u},
    {n:'Anchor Shear',     cl:isI?'IS 800:2007 Cl.10.3.3':'ACI 318-19 §17.7.1',       p:R.v_u_pass,  u:R.v_u},
    {n:'T-V Interaction',  cl:isI?'IS 800:2007 Cl.10.3.4':'ACI 318-19 §17.8.3',       p:R.inter_pass, u:R.inter},
    {n:'Embedment hef',    cl:isI?'IS 5624:1993':'ACI 318-19 §17.5.2',                 p:R.hef_pass,   u:R.util_h},
    {n:'Weld',             cl:isI?'IS 800:2007 Cl.10.5.7.1.1':'AISC 360-22 J2.4',     p:R.util_w_pass,u:R.util_w},
  ];
  const overall = checks.every(ch=>ch.p);
  const failing = checks.filter(ch=>!ch.p);

  c.innerHTML = stepHeader(10, 'Design Summary & Report',
    `Code: <strong>${STATE.code}</strong> · Column: <strong>${STATE.colDesig}</strong> · Plate: <strong>${STATE.N}×${STATE.B}×${STATE.tp} ${U.length()}</strong>`) +

  `<div class="overall-banner ${overall?'pass':'redesign'}">
    <div class="overall-banner-icon">${overall?'✅':'❌'}</div>
    <div class="overall-banner-text">
      <h2>${overall?'ALL CHECKS PASS — DESIGN IS CODE-COMPLIANT':'REDESIGN REQUIRED'}</h2>
      <p>${overall?`All ${checks.length} checks satisfied per ${STATE.code}.`:`${failing.length} check(s) failed: ${failing.map(f=>f.n).join(', ')}`}</p>
    </div>
  </div>` +

  card('Complete Check Summary', '', `
    <div style="overflow-x:auto;">
      <table class="check-table">
        <thead><tr><th>Check</th><th>Clause</th><th>Utilisation</th><th>Status</th></tr></thead>
        <tbody>
          ${checks.map(ch=>`<tr class="${ch.p?'pass-row':'fail-row'}">
            <td style="font-weight:500;">${ch.n}</td>
            <td class="mono" style="font-size:11px;color:var(--col-ink-3);">${ch.cl}</td>
            <td>${utilBar(ch.u)}</td>
            <td>${sbadge(ch.p)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`) +

  (failing.length ? card('Redesign Recommendations', '', `
    ${failing.map(ch=>`<div class="info-box info-4" style="margin-bottom:8px;">
      <strong>${ch.n}</strong> — η = ${(ch.u*100).toFixed(1)}% > 100%<br>
      ${ch.n==='Plate Thickness'?`Increase tp to min ${isIS()?Math.ceil(R.tp_req/5)*5:Math.ceil(R.tp_req*8)/8} ${U.length()} (${isIS()?'IS 800:2007 Cl.7.4.3.1 γm0=1.10':'AISC DG1 Eq.2.6 φ=0.90'}).`:
        ch.n==='Concrete Bearing'?`Increase plate N×B or use higher concrete grade (${isIS()?'M35/M40':'5000/6000 psi'}).`:
        ch.n.includes('Anchor')||ch.n.includes('T-V')?`Increase anchor diameter to M${parseInt(STATE.ancDia)+4} or add more bolts (${STATE.ancCount+2}).`:
        `Increase hef to minimum ${R.hef_min} ${U.length()}.`}
    </div>`).join('')}`) : '') +

  card('Input Summary', '', `
    <div class="info-grid">
      ${[['Code',STATE.code],['Column',STATE.colDesig],['Plate N×B×tp',`${STATE.N}×${STATE.B}×${STATE.tp} ${U.length()}`],
         ['Pedestal',`${STATE.pedL}×${STATE.pedB} ${U.length()}`],['P/Mx/Vx',`${STATE.P} ${U.force()} / ${STATE.Mx} ${U.moment()} / ${STATE.Vx} ${U.force()}`],
         ['Concrete',STATE.concGrade],['Steel',STATE.plateGrade],['Anchors',`${STATE.ancCount}×${isIS()?'M':''}${STATE.ancDia} ${STATE.ancGrade}`],
         ['CF',R.CF.toFixed(3)]].map(([k,v])=>`<div class="info-item"><div class="il">${k}</div><div class="iv">${v}</div></div>`).join('')}
    </div>`) +

  `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px;">
    <button onclick="generateReport()" class="btn btn-primary btn-lg"><i class="fas fa-file-code"></i> Generate Full HTML Report</button>
    <button onclick="prv()" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Back</button>
  </div>`;
}


/* ============================================================
   SVG DIAGRAM
   ============================================================ */
function makeSVG() {
  const sc = Math.min(200/STATE.N, 180/STATE.B);
  const pw = STATE.N*sc, ph = STATE.B*sc;
  const ox = 44, oy = 32;
  const dw = STATE.d*sc, bfw = STATE.bf*sc;
  const cx = ox+pw/2, cy = oy+ph/2;
  const m = (STATE.N-0.95*STATE.d)/2, n = (STATE.B-0.80*STATE.bf)/2;
  const bolts = [[ox+18,oy+18],[ox+pw-18,oy+18],[ox+18,oy+ph-18],[ox+pw-18,oy+ph-18]];
  return `<svg viewBox="0 0 ${pw+ox*2} ${ph+oy*2+48}" xmlns="http://www.w3.org/2000/svg" style="max-width:320px;width:100%;display:block;margin:0 auto;font-family:system-ui,sans-serif;">
  <rect x="${ox}" y="${oy}" width="${pw}" height="${ph}" fill="#EEF2FF" stroke="#4F46E5" stroke-width="2" rx="3"/>
  <rect x="${cx-dw/2}" y="${cy-bfw/2}" width="${dw}" height="${bfw}" fill="#A5B4FC" stroke="#4F46E5" stroke-width="1.5" stroke-dasharray="5,2"/>
  <rect x="${cx-dw/2}" y="${cy-bfw/2}" width="${dw}" height="${STATE.tf*sc}" fill="#4F46E5" opacity="0.6"/>
  <rect x="${cx-dw/2}" y="${cy+bfw/2-STATE.tf*sc}" width="${dw}" height="${STATE.tf*sc}" fill="#4F46E5" opacity="0.6"/>
  ${bolts.map(([bx,by])=>`<circle cx="${bx}" cy="${by}" r="6" fill="#1E293B" stroke="#fff" stroke-width="1.5"/>
  <circle cx="${bx}" cy="${by}" r="10" fill="none" stroke="#1E293B" stroke-width="1" stroke-dasharray="3,2"/>`).join('')}
  <line x1="${ox}" y1="${cy}" x2="${cx-dw/2}" y2="${cy}" stroke="#DC2626" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="${(ox+(cx-dw/2))/2}" y="${cy-6}" font-size="9" fill="#DC2626" text-anchor="middle" font-weight="600">m=${m.toFixed(1)}</text>
  <line x1="${cx}" y1="${oy}" x2="${cx}" y2="${cy-bfw/2}" stroke="#16A34A" stroke-width="1.5"/>
  <text x="${cx+5}" y="${(oy+(cy-bfw/2))/2+4}" font-size="9" fill="#16A34A" font-weight="600">n=${n.toFixed(1)}</text>
  <text x="${ox+pw/2}" y="${oy+ph+18}" font-size="11" fill="#1E293B" text-anchor="middle" font-weight="700">N = ${STATE.N} mm</text>
  <text x="${ox-32}" y="${oy+ph/2+4}" font-size="11" fill="#1E293B" text-anchor="middle" transform="rotate(-90,${ox-32},${oy+ph/2+4})" font-weight="700">B = ${STATE.B} mm</text>
  <text x="${ox+pw/2}" y="${oy+ph+32}" font-size="9" fill="#64748B" text-anchor="middle">tp = ${STATE.tp} mm · ${STATE.colDesig} · d=${STATE.d} · bf=${STATE.bf}</text>
</svg>`;
}


/* ============================================================
   HTML REPORT GENERATOR
   ============================================================ */
function generateReport() {
  const R = calcAll(); const isI = isIS();
  const date = new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'});
  const pn   = el('pn')?.value  || 'Industrial Building';
  const pd   = el('pd')?.value  || 'Ranjith, Structural Engineer';
  const pcr  = el('pcr')?.value || 'Grid C3';
  const A1=STATE.N*STATE.B, A2=STATE.pedL*STATE.pedB, CF=Math.min(Math.sqrt(A2/A1),2.0);
  const fp_allow=isI?0.45*STATE.fck*CF:0.65*0.85*(STATE.fck/6.895)*CF;
  const P_N=isI?STATE.P*1000:STATE.P, Mx_u=isI?STATE.Mx*1e6:STATE.Mx*12;
  const Z=STATE.B*STATE.N**2/6, fp_avg=P_N/A1, fp_max=fp_avg+Mx_u/Z, fp_min=fp_avg-Mx_u/Z;
  const m=(STATE.N-0.95*STATE.d)/2,n=(STATE.B-0.80*STATE.bf)/2,np=Math.sqrt(STATE.d*STATE.bf)/4;
  const lc=Math.max(m,n,np,.01), fp_p=P_N/A1;
  const tp_req=isI?lc*Math.sqrt(Math.max(2*fp_p*1.10/STATE.plateFy,0)):lc*Math.sqrt(Math.max(2*fp_p/(0.90*STATE.plateFy),0));
  const checks=[
    {n:'Min Plate Size',   c:isI?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1',   p:R.geo_ok,      u:R.geo_util},
    {n:'Concrete Bearing', c:isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1',   p:R.util_b_pass, u:R.util_b},
    {n:'Plate Thickness',  c:isI?'IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'AISC DG1 Eq.2.6 (φ=0.90)', p:R.util_tp_pass,u:R.util_tp},
    {n:'Anchor Tension',   c:isI?'IS 800:2007 Cl.10.3.3':'ACI 318-19 §17.5.1', p:R.t_u_pass,  u:R.t_u},
    {n:'Anchor Shear',     c:isI?'IS 800:2007 Cl.10.3.3':'ACI 318-19 §17.7.1', p:R.v_u_pass,  u:R.v_u},
    {n:'T-V Interaction',  c:isI?'IS 800:2007 Cl.10.3.4':'ACI 318-19 §17.8.3', p:R.inter_pass, u:R.inter},
    {n:'Embedment hef',    c:isI?'IS 5624:1993':'ACI 318-19 §17.5.2',           p:R.hef_pass,   u:R.util_h},
    {n:'Weld',             c:isI?'IS 800:2007 Cl.10.5.7.1.1':'AISC 360-22 J2.4',p:R.util_w_pass,u:R.util_w},
  ];
  const overall = checks.every(ch=>ch.p);

  STATE.reportHTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Base Plate Design Report — ${STATE.colDesig}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#1E293B;background:#fff;font-size:13px;line-height:1.65;}
.page{max-width:920px;margin:0 auto;padding:40px 40px;}
h1{font-size:24px;font-weight:700;} h2{font-size:15px;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1B4FD8;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1E293B;margin-bottom:28px;}
.hdr-logo{font-size:22px;font-weight:800;color:#1E293B;} .hdr-logo span{color:#1B4FD8;}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.b{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;border:1px solid;}
.bp{background:#F0FDF4;color:#16A34A;border-color:#86EFAC;} .bf{background:#FEF2F2;color:#DC2626;border-color:#FCA5A5;}
.bis{background:#EEF2FF;color:#1B4FD8;border-color:#A5B4FC;} .bus{background:#FFFBEB;color:#B45309;border-color:#FCD34D;}
.ob{padding:16px 20px;border-radius:8px;margin-bottom:24px;}
.ob.p{background:#F0FDF4;border:1px solid #86EFAC;color:#16A34A;} .ob.f{background:#FEF2F2;border:1px solid #FCA5A5;color:#DC2626;}
.sec{margin-bottom:28px;}
.igrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
.ii{padding:9px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;}
.ii .il{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-bottom:2px;}
.ii .iv{font-size:13px;font-weight:600;}
.cb{background:#0F1117;border-radius:8px;padding:16px;margin:10px 0;font-family:ui-monospace,monospace;font-size:12px;color:#CBD5E1;line-height:1.85;white-space:pre-wrap;overflow-x:auto;}
.cb .g{color:#4ADE80;} .cb .b{color:#60A5FA;} .cb .r{color:#F87171;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th,td{padding:8px 12px;text-align:left;border:1px solid #E2E8F0;}
th{background:#F8FAFC;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94A3B8;font-weight:600;}
.tr-p td{background:#F0FDF4;} .tr-f td{background:#FEF2F2;}
.ub{height:6px;background:#E2E8F0;border-radius:3px;overflow:hidden;display:inline-block;width:80px;vertical-align:middle;}
.uf{height:100%;border-radius:3px;}
.rec{padding:10px 14px;border-radius:6px;margin:8px 0;border-left:3px solid #DC2626;background:#FEF2F2;color:#991B1B;}
.note{padding:10px 14px;border-radius:6px;margin:8px 0;border-left:3px solid #93C5FD;background:#EFF6FF;color:#1D4ED8;font-size:12px;}
.svg-box{text-align:center;padding:20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin:14px 0;}
footer{margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;text-align:center;}
@media print{body{font-size:11px;} .page{padding:20px;}}
</style></head><body><div class="page">

<div class="hdr">
  <div>
    <h1>Steel Column Base Plate Design</h1>
    <div style="font-size:12px;color:#64748B;margin-top:5px;">Code: ${STATE.code} · Method: ${isI?'IS 800:2007 Limit State Method':STATE.code==='AISC_LRFD'?'AISC 360-22 LRFD':'AISC 360-22 ASD'}</div>
    <div class="badges" style="margin-top:8px;">
      ${isI?`<span class="b bis">IS 800:2007</span><span class="b bis">IS 456:2000</span><span class="b bis">IS 5624:1993</span><span class="b bis">IS 1367</span><span class="b bis">IS 875/IS 1893</span>`:`<span class="b bus">AISC 360-22</span><span class="b bus">ACI 318-19</span><span class="b bus">AISC DG1</span><span class="b bus">ASCE 7-22</span>`}
    </div>
  </div>
  <div style="text-align:right;"><div class="hdr-logo">Struct<span>AI</span></div>
    <div style="font-size:12px;color:#64748B;margin-top:4px;">${date}</div>
    <div style="font-size:12px;color:#64748B;">${pn}</div>
    <div style="font-size:12px;color:#64748B;">${pd} · ${pcr}</div>
  </div>
</div>

<div class="ob ${overall?'p':'f'}">
  <strong style="font-size:16px;">${overall?'✓ ALL CHECKS PASS — DESIGN IS CODE-COMPLIANT':'❌ REDESIGN REQUIRED — CHECK FAILED ITEMS BELOW'}</strong>
  <div style="margin-top:4px;font-size:13px;">${overall?'All structural checks satisfied per '+STATE.code+'.':'Review failing checks and revise plate/anchor dimensions.'}</div>
</div>

<div class="sec"><h2>01 — Project &amp; Design Basis</h2>
  <div class="igrid">
    <div class="ii"><div class="il">Code</div><div class="iv">${STATE.code}</div></div>
    <div class="ii"><div class="il">Column</div><div class="iv">${STATE.colDesig}</div></div>
    <div class="ii"><div class="il">Support</div><div class="iv">${STATE.supportType}</div></div>
    <div class="ii"><div class="il">Steel</div><div class="iv">${STATE.plateGrade}</div></div>
    <div class="ii"><div class="il">Concrete</div><div class="iv">${STATE.concGrade} (fck=${STATE.fck} MPa)</div></div>
    <div class="ii"><div class="il">Date</div><div class="iv">${date}</div></div>
  </div>
  <div class="note"><strong>Sign Convention:</strong> +P = Compression | −P = Uplift | Mx = strong-axis bending | Units: ${isI?'kN, kN·m, mm, MPa':'kips, kip·ft, in, ksi'}</div>
</div>

<div class="sec"><h2>02 — Design Inputs</h2>
  <div class="igrid">
    <div class="ii"><div class="il">Column d × bf</div><div class="iv">${STATE.d} × ${STATE.bf} ${U.length()}</div></div>
    <div class="ii"><div class="il">tf × tw</div><div class="iv">${STATE.tf} × ${STATE.tw} ${U.length()}</div></div>
    <div class="ii"><div class="il">Plate N × B × tp</div><div class="iv">${STATE.N} × ${STATE.B} × ${STATE.tp} ${U.length()}</div></div>
    <div class="ii"><div class="il">Axial Load P</div><div class="iv">${STATE.P} ${U.force()} (${STATE.P>0?'Comp':STATE.P<0?'Uplift':'—'})</div></div>
    <div class="ii"><div class="il">Moment Mx</div><div class="iv">${STATE.Mx} ${U.moment()}</div></div>
    <div class="ii"><div class="il">Shear Vx</div><div class="iv">${STATE.Vx} ${U.force()}</div></div>
    <div class="ii"><div class="il">Pedestal L×B×D</div><div class="iv">${STATE.pedL}×${STATE.pedB}×${STATE.pedD} ${U.length()}</div></div>
    <div class="ii"><div class="il">Anchors</div><div class="iv">${STATE.ancCount}×${isI?'M':''}${STATE.ancDia} ${STATE.ancGrade}</div></div>
    <div class="ii"><div class="il">hef</div><div class="iv">${STATE.hef} ${U.length()}</div></div>
  </div>
</div>

<div class="sec"><h2>03 — Base Plate Diagram (Plan View)</h2>
  <div class="svg-box">${makeSVG()}</div>
  <div class="note" style="text-align:center;font-size:11px;">Plan view: plate N×B, column footprint (hatched), anchor bolts (●), cantilever lengths m &amp; n in red/green</div>
</div>

<div class="sec"><h2>04 — Min Plate Size — ${isI?'IS 800:2007 Cl.7.4.1':'AISC DG1 Eq.2.1'}</h2>
  <div class="cb">N_min = d + ${isI?'100':'4'} = ${STATE.d} + ${isI?'100':'4'} = <span class="${STATE.N>=R.Nmin?'g':'r'}">${R.Nmin} ${U.length()}</span>  → N=${STATE.N} ${U.length()} ${STATE.N>=R.Nmin?'✓ PASS':'✗ FAIL'}
B_min = bf + ${isI?'100':'4'} = ${STATE.bf} + ${isI?'100':'4'} = <span class="${STATE.B>=R.Bmin?'g':'r'}">${R.Bmin} ${U.length()}</span>  → B=${STATE.B} ${U.length()} ${STATE.B>=R.Bmin?'✓ PASS':'✗ FAIL'}</div>
</div>

<div class="sec"><h2>05 — Eccentricity &amp; Pressure — ${isI?'IS 456:2000 Cl.34.4':'AISC DG1 §3.1'}</h2>
  <div class="cb">A₁ = N×B = ${A1.toFixed(0)} ${U.area()}   Z = B×N²/6 = ${Z.toFixed(0)}
fp_avg = P/A₁ = ${fp_avg.toFixed(4)} ${U.stress()}
fp_max = <span class="b">${fp_max.toFixed(4)} ${U.stress()}</span>   fp_min = <span class="${fp_min>=0?'g':'r'}">${fp_min.toFixed(4)} ${U.stress()}${fp_min<0?' ← Tension':''}</span>
fp_design = max(|fp_max|,|fp_min|) = <span class="b">${R.fp_d.toFixed(4)} ${U.stress()}</span></div>
</div>

<div class="sec"><h2>06 — Concrete Bearing — ${isI?'IS 456:2000 Cl.34.4':'AISC 360-22 J8.1'}</h2>
  <div class="cb">A₂ = ${A2.toFixed(0)} ${U.area()}
CF = min(√(A₂/A₁), 2.0) = min(${Math.sqrt(A2/A1).toFixed(4)}, 2.0) = <span class="b">${CF.toFixed(4)}</span>
${isI?`fp_allow = 0.45 × ${STATE.fck} × ${CF.toFixed(4)} = <span class="g">${fp_allow.toFixed(4)} MPa</span>  ← IS 456:2000 Cl.34.4`:`fp_allow = 0.65 × 0.85 × ${(STATE.fck/6.895).toFixed(3)} × ${CF.toFixed(4)} = <span class="g">${fp_allow.toFixed(4)} ksi</span>  ← AISC J8.1`}
η = ${R.fp_d.toFixed(4)} / ${fp_allow.toFixed(4)} = <span class="${R.util_b_pass?'g':'r'}">${f(R.util_b)} ${R.util_b_pass?'✓ SAFE':'✗ REDESIGN'}</span></div>
  ${!R.util_b_pass?'<div class="rec">❌ Increase plate area or use higher concrete grade.</div>':''}
</div>

<div class="sec"><h2>07 — Plate Thickness — ${isI?'IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'AISC DG1 Eq.2.6 (φ=0.90)'}</h2>
  <div class="cb">Step 1: m  = (${STATE.N}−0.95×${STATE.d})/2 = <span class="b">${f(m,2)} ${U.length()}</span>
Step 2: n  = (${STATE.B}−0.80×${STATE.bf})/2 = <span class="b">${f(n,2)} ${U.length()}</span>
Step 3: n' = √(${STATE.d}×${STATE.bf})/4 = <span class="b">${f(np,2)} ${U.length()}</span>
Step 4: l_crit = max(${f(m,1)},${f(n,1)},${f(np,1)}) = <span class="b">${f(lc,2)} ${U.length()}</span>  ← GOVERNS (${R.governs})
Step 5: fp = P/A₁ = ${P_N.toFixed(0)}/${A1.toFixed(0)} = <span class="b">${f(fp_p,4)} ${U.stress()}</span>
Step 6: tp_req = l_crit × √(${isI?'2·fp·γm0/Fy = 2×'+f(fp_p,4)+'×1.10/'+STATE.plateFy:'2·fp/(φ·Fy) = 2×'+f(fp_p,4)+'/(0.90×'+STATE.plateFy+')'}) = <span class="${R.util_tp_pass?'g':'r'}">${f(tp_req,2)} ${U.length()}</span>
Step 7: tp_provided = ${STATE.tp} ${U.length()}
Step 8: η = ${f(tp_req,2)}/${STATE.tp} = <span class="${R.util_tp_pass?'g':'r'}">${f(R.util_tp)} ${R.util_tp_pass?'✓ SAFE':'✗ REDESIGN'}</span></div>
  ${!R.util_tp_pass?`<div class="rec">❌ tp_required = ${f(tp_req,1)} ${U.length()}. Increase tp to <strong>${isI?Math.ceil(tp_req/5)*5:Math.ceil(tp_req*8)/8} ${U.length()}</strong>.<br>Clause: ${isI?'IS 800:2007 Cl.7.4.3.1 (γm0=1.10)':'AISC DG1 Eq.2.6 (φ=0.90)'}</div>`:''}
</div>

<div class="sec"><h2>08 — Complete Check Summary</h2>
  <table><thead><tr><th>#</th><th>Check</th><th>Clause</th><th>Utilisation</th><th>Status</th></tr></thead>
  <tbody>${checks.map((ch,i)=>`<tr class="${ch.p?'tr-p':'tr-f'}"><td>${i+1}</td><td style="font-weight:500;">${ch.n}</td><td style="font-family:monospace;font-size:11px;">${ch.c}</td><td><div class="ub"><div class="uf" style="width:${Math.min(ch.u*100,100)}%;background:${ch.p?'#16A34A':'#DC2626'};"></div></div> ${(ch.u*100).toFixed(1)}%</td><td><span class="b ${ch.p?'bp':'bf'}">${ch.p?'✓ PASS':'❌ FAIL'}</span></td></tr>`).join('')}</tbody></table>
  ${!overall?`<div style="margin-top:12px;">${checks.filter(ch=>!ch.p).map(ch=>`<div class="rec"><strong>${ch.n}</strong> — η=${(ch.u*100).toFixed(1)}% > 100%. ${ch.n==='Plate Thickness'?`Increase tp to ${isI?Math.ceil(tp_req/5)*5:Math.ceil(tp_req*8)/8} ${U.length()} min.`:ch.n==='Concrete Bearing'?`Increase plate area or concrete grade.`:`Increase anchor size or count.`}</div>`).join('')}</div>`:''}
</div>

<footer>StructAI v5.0 · Generated: ${date} · Code: ${STATE.code}<br/>
${isI?'IS 800:2007 | IS 456:2000 | IS 5624:1993 | IS 1367 | IS 875:2015 | IS 1893:2016':'AISC 360-22 | ACI 318-19 | AISC Design Guide 1 | ASCE 7-22'}<br/>
This report is generated for engineering evaluation only. Verify all inputs before use in construction. Designer: ${pd}</footer>
</div></body></html>`;

  el('rprv').textContent = `Column: ${STATE.colDesig} · Plate: ${STATE.N}×${STATE.B}×${STATE.tp} ${U.length()} · Code: ${STATE.code}\nOverall: ${overall?'ALL PASS':'REDESIGN REQUIRED'}\n${checks.length} checks · SVG diagram · Full step-by-step calcs`;
  openModal('m-rpt');
}

function downloadReport() {
  const blob = new Blob([STATE.reportHTML], { type:'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `StructAI_BasePlate_${STATE.colDesig.replace(' ','_')}_${STATE.code}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function openModal(id) { el(id)?.classList.add('open'); }
function closeModal(id) { el(id)?.classList.remove('open'); }


/* ============================================================
   LANDING ANIMATIONS (minimal — one entrance sequence only)
   ============================================================ */
function initLanding() {
  if (typeof gsap !== 'undefined') {
    gsap.fromTo('#ey',  { opacity:0, y:18 }, { opacity:1, y:0, duration:.6, delay:.3 });
    gsap.fromTo('#ht',  { opacity:0, y:28 }, { opacity:1, y:0, duration:.7, delay:.5 });
    gsap.fromTo('#hs',  { opacity:0, y:18 }, { opacity:1, y:0, duration:.6, delay:.7 });
    gsap.fromTo('#hp',  { opacity:0, y:12 }, { opacity:1, y:0, duration:.5, delay:.9 });
    gsap.fromTo('#hcta',{ opacity:0, y:12 }, { opacity:1, y:0, duration:.5, delay:1.1 });
  }
  // Counter animation when stats section scrolls into view
  const obs = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    counter('st1',0,18,900); counter('st2',0,10,800); counter('st3',0,14,900); counter('st4',0,12,1000);
    obs.disconnect();
  }, { threshold:.3 });
  const ss = el('ss'); if (ss) obs.observe(ss);
}
function counter(id, s, e, dur) {
  const el2 = el(id); if (!el2) return;
  const step = (e-s)/(dur/16); let c = s;
  const t = setInterval(()=>{ c=Math.min(c+step,e); el2.textContent=Math.round(c); if(c>=e)clearInterval(t); },16);
}


/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
function loadExAndOpen() {
  Object.assign(STATE, {
    code:'IS800',colType:'ISMB',colDesig:'ISMB 300',d:300,bf:140,tf:13.1,tw:7.5,
    N:500,B:500,tp:25,pedL:600,pedB:600,pedD:800,supportType:'PEDESTAL',
    P:800,Mx:60,My:0,Vx:40,Vy:0,loadCombo:'IS_C2',
    colGrade:'E250 (Fe410)',plateGrade:'E250 (Fe410)',concGrade:'M30',fck:30,
    colFy:250,colFu:410,plateFy:250,plateFu:410,
    ancGrade:'IS 1367 Class 8.8',ancDia:24,ancCount:4,edgeDist:100,hef:400,weldSize:10,
    sectionLocked:true, step:1,
  });
  openApp();
}

function openApp() {
  const lp = el('landing-page'), ap = el('app-page');
  lp.style.opacity = '0';
  setTimeout(() => {
    lp.style.display = 'none';
    ['lbg','three-canvas'].forEach(id => { const e=el(id); if(e) e.style.display='none'; });
    ap.style.display = 'block'; ap.style.opacity = '0';
    document.body.style.background = '#F4F6F9';
    setTimeout(() => { ap.style.opacity = '1'; initApp(); }, 20);
  }, 350);
}

function backToLanding() {
  const ap = el('app-page'), lp = el('landing-page');
  ap.style.opacity = '0';
  setTimeout(() => {
    ap.style.display = 'none';
    ['lbg','three-canvas'].forEach(id => { const e=el(id); if(e) e.style.display='block'; });
    lp.style.display = 'block'; lp.style.opacity = '0';
    document.body.style.background = '';
    setTimeout(() => { lp.style.opacity = '1'; }, 20);
  }, 300);
}

function initApp() {
  buildProgress(); buildSidebar(); renderStep(STATE.step);
  updateQuickInfo(); calcAll(); updateRightPanel();
}


/* ============================================================
   THREE.JS — structural wireframe scene
   ============================================================ */
function initThree() {
  const cv = el('three-canvas');
  if (!cv || typeof THREE === 'undefined') return;
  const R = new THREE.WebGLRenderer({ canvas:cv, antialias:true, alpha:true });
  R.setPixelRatio(Math.min(devicePixelRatio,2));
  R.setClearColor(0,0); R.setSize(innerWidth,innerHeight);
  const scene = new THREE.Scene();
  const cam   = new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,1000);
  cam.position.set(4,3.5,6); cam.lookAt(0,.5,0);
  scene.add(new THREE.AmbientLight(0xDDF4FF,.5));
  const dl = new THREE.DirectionalLight(0xFFFFFF,1.2); dl.position.set(5,10,5); scene.add(dl);
  const grp = new THREE.Group(); scene.add(grp);
  const bm  = new THREE.MeshBasicMaterial({color:0x1B4FD8,wireframe:true});
  const cm  = new THREE.MeshBasicMaterial({color:0xC8CDD8,wireframe:true});
  const pm  = new THREE.MeshBasicMaterial({color:0x60A5FA,wireframe:true});
  // Column flanges
  [-0.3,0.3].forEach(x => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(.14,2.5,.02),bm.clone());
    f.position.set(x,1.29,0); grp.add(f);
  });
  // Web
  grp.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(.01,2.5,.58),bm),{}).position.set && new THREE.Mesh(new THREE.BoxGeometry(.01,2.5,.58),bm));
  const wb = new THREE.Mesh(new THREE.BoxGeometry(.01,2.5,.58),bm); wb.position.set(0,1.29,0); grp.add(wb);
  // Base plate
  const pl = new THREE.Mesh(new THREE.BoxGeometry(1,.04,.85),pm); pl.position.set(0,.02,0); grp.add(pl);
  // Pedestal
  const pd = new THREE.Mesh(new THREE.BoxGeometry(1.4,.8,1.2),cm); pd.position.set(0,-.44,0); grp.add(pd);
  // Anchor bolts
  const alm = new THREE.LineBasicMaterial({color:0xCA8A04});
  [[-0.35,-0.25],[0.35,-0.25],[-0.35,.25],[.35,.25]].forEach(([x,z])=>{
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,.02,z),new THREE.Vector3(x,-.78,z)]);
    grp.add(new THREE.Line(g,alm));
  });
  // Grid
  const grid = new THREE.GridHelper(6,12,0xDDE1E8,0xEEF2F4);
  grid.position.y=-.84; grid.material.opacity=.25; grid.material.transparent=true; scene.add(grid);
  // Particles
  const pn=100,pg=new THREE.BufferGeometry(),pp=new Float32Array(pn*3),pv=[];
  for(let i=0;i<pn;i++){const t=Math.random()*Math.PI*2,ph=Math.acos(Math.random()*2-1),r=2.5+Math.random()*1.5;pp[i*3]=r*Math.sin(ph)*Math.cos(t);pp[i*3+1]=r*Math.sin(ph)*Math.sin(t)+.5;pp[i*3+2]=r*Math.cos(ph);pv.push({x:(Math.random()-.5)*.003,y:(Math.random()-.5)*.003,z:(Math.random()-.5)*.003});}
  pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
  const pts = new THREE.Points(pg,new THREE.PointsMaterial({color:0x1B4FD8,size:.024,opacity:.5,transparent:true}));
  pts._v=pv; scene.add(pts);
  (function anim(){requestAnimationFrame(anim);grp.rotation.y+=.003;const pos=pts.geometry.attributes.position.array,v=pts._v;for(let i=0;i<pos.length/3;i++){pos[i*3]+=v[i].x;pos[i*3+1]+=v[i].y;pos[i*3+2]+=v[i].z;const d=Math.sqrt(pos[i*3]**2+(pos[i*3+1]-.5)**2+pos[i*3+2]**2);if(d>4.5){v[i].x*=-1;v[i].y*=-1;v[i].z*=-1;}}pts.geometry.attributes.position.needsUpdate=true;R.render(scene,cam);})();
  window.addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();R.setSize(innerWidth,innerHeight);});
}


/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initThree();
  initLanding();
});
