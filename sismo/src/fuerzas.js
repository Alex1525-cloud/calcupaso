/* Fuerzas internas por elemento: cargas de gravedad (CM, CV) repartidas de las losas a las vigas,
   sismo espectral por modo combinado con CQC (escalado como el cortante basal) más la torsión accidental,
   y combinaciones de E.060 (cap. 9): 1,4CM+1,7CV; 1,25(CM+CV)±S; 0,9CM±S. Unidades: t y m. */
(function (root) {
  "use strict";
  const S = root.Solver || require("./solver.js");
  const E = root.E030 || require("./e030.js");
  const NEST = 9; // estaciones a lo largo de cada viga

  // ---- cargas equivalentes en los nudos (ejes locales), carga uniforme w y puntuales [s, P]
  function feqLocal(e, c) {
    const L = e.L, R = e.R, f = new Float64Array(12);
    const loc = (g) => [0, 1, 2].map(i => R[i][0] * g[0] + R[i][1] * g[1] + R[i][2] * g[2]);
    if (c.w) {
      const [wx, wy, wz] = loc(c.w);
      f[0] += wx * L / 2; f[6] += wx * L / 2; f[1] += wy * L / 2; f[7] += wy * L / 2; f[2] += wz * L / 2; f[8] += wz * L / 2;
      f[4] += -wz * L * L / 12; f[10] += wz * L * L / 12; f[5] += wy * L * L / 12; f[11] += -wy * L * L / 12;
    }
    for (const [s, g] of c.P || []) {
      const [px, py, pz] = loc(g), x = Math.min(Math.max(s / L, 0), 1);
      const N1 = 1 - 3 * x * x + 2 * x ** 3, N2 = L * (x - 2 * x * x + x ** 3), N3 = 3 * x * x - 2 * x ** 3, N4 = L * (-x * x + x ** 3);
      f[0] += px * (1 - x); f[6] += px * x; f[1] += py * N1; f[7] += py * N3; f[2] += pz * N1; f[8] += pz * N3;
      f[5] += py * N2; f[11] += py * N4; f[4] += -pz * N2; f[10] += -pz * N4;
    }
    return f;
  }
  const aGlobal = (R, fl) => { const g = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g[3 * b + i] += R[j][i] * fl[3 * b + j]; return g; };
  const aLocal = (R, fg) => { const l = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) l[3 * b + i] += R[i][j] * fg[3 * b + j]; return l; };

  // ---- reparto de cada paño de losa a sus bordes (intensidad de área tributaria en cada punto del borde)
  function repartoLosa(poly, tipo) {
    const n = poly.length, lados = [];
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; lados.push({ a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }); }
    let rect = n === 4;
    if (rect) for (let i = 0; i < 4; i++) { const u = lados[i], v = lados[(i + 1) % 4]; const dot = (u.b[0] - u.a[0]) * (v.b[0] - v.a[0]) + (u.b[1] - u.a[1]) * (v.b[1] - v.a[1]); if (Math.abs(dot) > 1e-3 * u.L * v.L) rect = false; }
    if (rect) {
      const a = lados[0].L, b = lados[1].L, corto = Math.min(a, b), largo = Math.max(a, b);
      const unaDir = ["aligerada1", "colaborante", "nervada"].includes(tipo) || (tipo === "maciza" && largo / corto > 2);
      const iLargo = a >= b ? 0 : 1; // lados 0 y 2 miden a; 1 y 3 miden b
      return lados.map((l, i) => {
        const otro = i % 2 ? a : b;
        if (unaDir) return Object.assign(l, { prof: () => i % 2 === iLargo ? corto / 2 : 0 });
        return Object.assign(l, { prof: (t) => Math.min(t, l.L - t, otro / 2) });
      });
    }
    // otros polígonos: triángulo desde el centroide hacia cada borde
    const P = S.polyProps(poly), cx = P.Sx / P.A, cy = P.Sy / P.A;
    return lados.map(l => {
      const ux = (l.b[0] - l.a[0]) / l.L, uy = (l.b[1] - l.a[1]) / l.L;
      const f = Math.min(Math.max((cx - l.a[0]) * ux + (cy - l.a[1]) * uy, 0.01 * l.L), 0.99 * l.L);
      const h = Math.abs((cx - l.a[0]) * uy - (cy - l.a[1]) * ux);
      return Object.assign(l, { prof: (t) => t < f ? h * t / f : h * (l.L - t) / (l.L - f) });
    });
  }

  // ---- arma las cargas de gravedad por elemento y en nudos
  function cargasGravedad(B) {
    const m = B.model, sec = B.sec, gam = m.gamma, ld = m.loads;
    const C = { D: new Map(), L: new Map() }, nodal = { D: new Map(), L: new Map() };
    const carga = (cs, e) => { if (!cs.has(e)) cs.set(e, { w: [0, 0, 0], P: [] }); return cs.get(e); };
    let sinViga = 0;
    const colAt = {}; // como en la masa: el peso de la viga va en su luz libre (sin el ancho de la columna)
    for (const e of B.elems) if (e.type === "col" && e.wall == null) { colAt[e.b] = e.sec; colAt[e.a] = colAt[e.a] || e.sec; }
    for (const e of B.elems) {
      if (e.type === "link") continue;
      const s = sec[e.sec], A = s.props ? s.props.A : s.b * s.h;
      let f = 1;
      if (e.type === "beam") {
        const ux = Math.abs(e.R[0][0]), uy = Math.abs(e.R[0][1]);
        const half = (kk) => { const cs = colAt[kk]; if (!cs) return 0; const c = sec[cs]; return 0.5 * (ux * c.b + uy * c.h); };
        f = Math.max(e.L - half(e.a) - half(e.b), 0) / e.L; e.ln = f * e.L;
      }
      carga(C.D, e).w[2] -= A * gam * f;
    }
    const porNivel = new Map();
    for (const e of B.elems) if (e.type !== "col") { const k = B.pts.get(e.a).k; if (!porNivel.has(k)) porNivel.set(k, []); porNivel.get(k).push(e); }
    const slabKey = (s) => s.nodes.slice().sort().join("|"), cover = new Set();
    for (const s of m.slabs) for (let k = s.p1; k <= s.p2; k++) cover.add(slabKey(s) + "#" + k);
    const aplicar = (k, x, y, cas, P) => {
      for (const e of porNivel.get(k) || []) {
        const a = B.pts.get(e.a), b = B.pts.get(e.b), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
        if (t < -1e-6 || t > 1 + 1e-6) continue;
        if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) > 0.02) continue;
        carga(C[cas], e).P.push([t * Math.sqrt(L2), [0, 0, -P]]); return;
      }
      let best = null, bd = Infinity; // sin viga: al nudo más cercano del nivel
      for (const p of B.pts.values()) if (p.k === k) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
      if (best) { if (bd > 0.05) sinViga++; nodal[cas].set(best, (nodal[cas].get(best) || 0) + P); }
    };
    const NP = 24;
    for (const s of m.slabs) {
      const poly = s.nodes.map(n => m.nodes[n]), lados = repartoLosa(poly, s.tipo);
      for (let k = s.p1; k <= s.p2; k++) {
        const roof = !cover.has(slabKey(s) + "#" + (k + 1));
        const wD = (roof ? ld.cmRoof : ld.cm) + (s.cm || 0), wL = s.cvAbs != null ? s.cvAbs : (roof ? ld.cvRoof : ld.cv) + (s.cv || 0);
        for (const l of lados) {
          const ds = l.L / NP;
          for (let i = 0; i < NP; i++) {
            const t = (i + 0.5) * ds, a = l.prof(t) * ds; if (!(a > 0)) continue;
            const x = l.a[0] + (l.b[0] - l.a[0]) * t / l.L, y = l.a[1] + (l.b[1] - l.a[1]) * t / l.L;
            aplicar(k, x, y, "D", wD * a); aplicar(k, x, y, "L", wL * a);
          }
        }
      }
    }
    return { C, nodal, sinViga };
  }

  // ---- resuelve un caso de gravedad con los diafragmas libres
  function resolverGravedad(B, cs, nodal) {
    const f = new Float64Array(B.ns + B.nm);
    for (const [e, c] of cs) {
      const fg = aGlobal(e.R, feqLocal(e, c));
      for (let i = 0; i < 12; i++) for (const t of e.map[i]) f[t.g] += t.c * fg[i];
    }
    for (const [p, P] of nodal) f[p.eq] -= P;
    const y = B.Kss.solve(f.slice(0, B.ns)), fm = f.slice(B.ns);
    for (let j = 0; j < B.nm; j++) { let s = 0; for (let r = 0; r < B.ns; r++) { const v = B.Ksm[r][j]; if (v) s += v * y[r]; } fm[j] -= s; }
    const um = S.solveLateral(B, fm);
    const u = new Float64Array(B.ns + B.nm);
    for (let r = 0; r < B.ns; r++) { let s = y[r]; for (let j = 0; j < B.nm; j++) s -= B.X[j][r] * um[j]; u[r] = s; }
    u.set(um, B.ns);
    return u;
  }

  const ue = (e, u) => e.map.map(l => l.reduce((a, t) => a + t.c * u[t.g], 0));
  function fuerzasLocales(e, u, c) {
    const d = ue(e, u), fg = e.Kg.map(r => r.reduce((a, v, j) => a + v * d[j], 0));
    const fl = aLocal(e.R, fg);
    if (c) { const q = feqLocal(e, c); for (let i = 0; i < 12; i++) fl[i] -= q[i]; }
    return fl;
  }

  /* Esfuerzos del elemento a partir de sus fuerzas locales en los extremos.
     Viga: M (positivo = tracción abajo) y V en estaciones; columna/placa: P (compresión +), V2, V3, M2, M3, T abajo y arriba. */
  function esfuerzos(e, fl, c) {
    if (e.type === "col") {
      return {
        P: [fl[0], -fl[6]], V2: [fl[1], -fl[7]], V3: [fl[2], -fl[8]], T: [fl[3], -fl[9]],
        M2: [fl[4], -fl[10]], M3: [fl[5], -fl[11]],
      };
    }
    const L = e.L, M = [], V = [];
    const R = e.R, wz = c && c.w ? R[2][0] * c.w[0] + R[2][1] * c.w[1] + R[2][2] * c.w[2] : 0;
    const P = c && c.P ? c.P.map(([s, g]) => [s, R[2][0] * g[0] + R[2][1] * g[1] + R[2][2] * g[2]]) : [];
    for (let i = 0; i < NEST; i++) {
      const x = L * i / (NEST - 1);
      let m = fl[4] + x * fl[2] + wz * x * x / 2, v = fl[2] + wz * x;
      for (const [s, pz] of P) if (s < x) { m += pz * (x - s); v += pz; }
      M.push(m); V.push(v);
    }
    return { M, V, T: [fl[3]] };
  }

  /* Análisis completo de fuerzas. r = resultado de E030.analizar (o Irreg.analizarTodo). */
  function calcular(r) {
    const B = r.B, q = r.q, modes = r.modes, N = B.N;
    const { C, nodal, sinViga } = cargasGravedad(B);
    const uD = resolverGravedad(B, C.D, nodal.D), uL = resolverGravedad(B, C.L, nodal.L);
    const elems = B.elems.filter(e => e.type !== "link");
    const out = elems.map(e => ({ e, D: esfuerzos(e, fuerzasLocales(e, uD, C.D.get(e)), C.D.get(e)), L: esfuerzos(e, fuerzasLocales(e, uL, C.L.get(e)), C.L.get(e)) }));
    // sismo por dirección
    const g = S.G, rampa = q.norma === "2026";
    for (const D of r.dirs) {
      const R = D.d ? q.Ry : q.Rx, esc = D.factorEscala || 1;
      const porModo = modes.map(m => {
        const Sa = q.Z * q.U * E.factorC(m.T, q.Tp, q.TL, rampa) * q.S / R * g;
        const Gm = D.d ? m.Gy : m.Gx;
        return S.fullDisp(B, m.phi.map(v => v * Gm * Sa / (m.w * m.w)));
      });
      // torsión accidental estática (momento = fuerza de piso × e), se suma en valor absoluto
      const Ft = new Float64Array(3 * N);
      B.levels.forEach((L, k) => { const Fi = D.shearDin[k] - (k + 1 < N ? D.shearDin[k + 1] : 0); Ft[3 * k + 2] = Fi * q.ecc * (D.d ? L.Lx : L.Ly); });
      const ut = S.fullDisp(B, S.solveLateral(B, Ft));
      out.forEach(o => {
        const pm = porModo.map(u => esfuerzos(o.e, fuerzasLocales(o.e, u)));
        const tt = esfuerzos(o.e, fuerzasLocales(o.e, ut));
        const res = {};
        for (const k in pm[0]) res[k] = pm[0][k].map((_, i) => esc * (S.cqc(pm.map(x => x[k][i]), modes, q.amort) + Math.abs(tt[k][i])));
        o[D.d ? "SY" : "SX"] = res;
      });
    }
    if (q.dir30) out.forEach(o => { const x = o.SX, y = o.SY, nx = {}, ny = {}; for (const k in x) { nx[k] = x[k].map((v, i) => Math.hypot(v, 0.3 * y[k][i])); ny[k] = y[k].map((v, i) => Math.hypot(v, 0.3 * x[k][i])); } o.SX = nx; o.SY = ny; });
    // reacciones en la base (fuerzas que el apoyo da a cada columna o placa del piso 1)
    const reacc = new Map();
    for (const o of out) if (o.e.type === "col" && o.e.k === 1) {
      const id = o.e.wall != null ? "placa" + o.e.wall : B.pts.get(o.e.a).id;
      reacc.set(id, { e: o.e, D: o.D.P[0], L: o.L.P[0], SX: o.SX.P[0], SY: o.SY.P[0],
        MD: [o.D.M2[0], o.D.M3[0]], ML: [o.L.M2[0], o.L.M3[0]], MSX: [o.SX.M2[0], o.SX.M3[0]], MSY: [o.SY.M2[0], o.SY.M3[0]] });
    }
    const totD = [...reacc.values()].reduce((a, x) => a + x.D, 0), totL = [...reacc.values()].reduce((a, x) => a + x.L, 0);
    return { elems: out, reacc, totD, totL, sinViga, combos: COMBOS };
  }

  // combinaciones E.060 (cap. 9): [nombre, fD, fL, fS, dirección del sismo]
  const COMBOS = [
    ["1,4CM + 1,7CV", 1.4, 1.7, 0, null],
    ["1,25(CM+CV) ± SX", 1.25, 1.25, 1, "SX"], ["1,25(CM+CV) ± SY", 1.25, 1.25, 1, "SY"],
    ["0,9CM ± SX", 0.9, 0, 1, "SX"], ["0,9CM ± SY", 0.9, 0, 1, "SY"],
  ];
  // envolvente de un esfuerzo (k, estación i): {max, min}
  function envolvente(o, k, i) {
    let mx = -Infinity, mn = Infinity;
    for (const [, fD, fL, fS, dS] of COMBOS) {
      const g = fD * o.D[k][i] + fL * o.L[k][i], s = dS ? fS * o[dS][k][i] : 0;
      mx = Math.max(mx, g + s); mn = Math.min(mn, g - s);
    }
    return { max: mx, min: mn };
  }

  const Fuerzas = { calcular, envolvente, COMBOS, repartoLosa, feqLocal, NEST };
  root.Fuerzas = Fuerzas;
  if (typeof module !== "undefined") module.exports = Fuerzas;
})(typeof window !== "undefined" ? window : globalThis);
