/* Irregularidades E.030 (Tablas N° 11 y 12 de la 2026), sistema estructural y bucle Ia·Ip -> R.
   Reglas portadas del prototipo con ETABS (irregularidades.py). */
(function (root) {
  "use strict";
  const S = root.Solver || require("./solver.js");
  const E = root.E030 || require("./e030.js");

  const TIPOS = [
    ["rigidez", "Piso blando (rigidez)", "Altura", 0.75],
    ["rigidez_ext", "Piso blando extremo (rigidez)", "Altura", 0.50],
    ["debil", "Piso débil (resistencia)", "Altura", 0.75],
    ["debil_ext", "Piso débil extremo (resistencia)", "Altura", 0.50],
    ["masa", "Masa o peso", "Altura", 0.90],
    ["geom_vert", "Geometría vertical", "Altura", 0.90],
    ["discont", "Discontinuidad en los sistemas resistentes", "Altura", 0.80],
    ["torsion", "Torsional", "Planta", 0.75],
    ["torsion_ext", "Torsional extrema", "Planta", 0.60],
    ["esquinas", "Esquinas entrantes", "Planta", 0.90],
    ["diafragma", "Discontinuidad del diafragma", "Planta", 0.85],
    ["no_paralelos", "Sistemas no paralelos", "Planta", 0.90],
  ];
  const EXTREMAS = ["rigidez_ext", "torsion_ext", "debil_ext"];
  const Fz = () => root.Fuerzas || require("./fuerzas.js");
  const Dz = () => root.Diseno || require("./diseno.js");

  /* Resistencia al corte de cada entrepiso (estimada con acero mínimo: columnas 1% y estribos Ø3/8" @ d/2;
     placas: Vc + Vs con 0,25% de acero horizontal), con la carga axial de CM + 25% CV. */
  function resistencias(model, B, fc, fy) {
    const D = Dz(), g = Fz().gravedad(B), sec = B.sec, N = B.N, out = Array.from({ length: N }, () => [0, 0]);
    const cache = new Map();
    for (const [e, f] of g.porElem) {
      if (e.type !== "col") continue;
      const s = sec[e.sec], Pg = (f.D.P[0] + 0.25 * f.L.P[0]) * 1000, h = model.stories[e.k - 1].h * 100;
      const key = e.sec + "|" + Math.round(Pg / 2000);
      let V;
      if (cache.has(key)) V = cache.get(key);
      else {
        const sl = D.seccionLocal(s), Ag = sl.Ag;
        if (e.wall != null) {
          const Lw = s.b * 100, t = s.h * 100;
          const hm = (B.z[N] - B.z[e.k - 1]) * 100, rel = hm / Lw, ac = rel <= 1.5 ? 0.8 : rel >= 2 ? 0.53 : 0.8 - 0.27 * (rel - 1.5) / 0.5;
          const al = Math.min(1, Math.max(1 / 3, Lw / (2 / 3 * hm)));
          const Vn = s.mat === "alb" ? 0.5 * s.vm * al * t * Lw + 0.23 * Math.max(0, Pg) : Lw * t * (ac * Math.sqrt(fc) + 0.0025 * fy); // albañilería: Vm (E.070)
          V = { plano: Vn, wall: true }; // placas: resistencia al corte (Vc + Vs con 0,25%)
        } else {
          const n = Math.max(sl.circ ? 6 : sl.poly.length, Math.ceil(0.01 * Ag / 2.84)), pos = D.barrasContorno(sl.poly, 6, n, sl.circ);
          const bars = pos.map(([y, z]) => [y, z, 2.84]), r = [];
          for (const eje of [0, 1]) {
            const ext = Math.max(...sl.poly.map(q => q[eje])) - Math.min(...sl.poly.map(q => q[eje])), otro = Math.max(...sl.poly.map(q => q[1 - eje])) - Math.min(...sl.poly.map(q => q[1 - eje]));
            const Mn = D.phiMn(D.curva(sl.fib, bars, eje, 1, fc, fy, Ag, sl.circ, true), Pg), d = ext - 6;
            const Vn = 0.53 * Math.sqrt(fc) * (1 + Math.max(0, Pg) / (140 * Ag)) * otro * d + 2 * 1.42 * fy;
            r.push(Math.min(Vn, 2 * Mn / (h - 60)));
          }
          V = { y: r[0], z: r[1] };
        }
        cache.set(key, V);
      }
      const c = Math.abs(Math.cos(e.ang || 0)), sn = Math.abs(Math.sin(e.ang || 0));
      if (V.wall) { out[e.k - 1][0] += c * V.plano; out[e.k - 1][1] += sn * V.plano; }
      else { out[e.k - 1][0] += c * V.y + sn * V.z; out[e.k - 1][1] += sn * V.y + c * V.z; }
    }
    return out.map(v => v.map(x => x / 1000)); // t
  }

  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // Esquinas entrantes: en cada esquina del rectángulo envolvente, el entrante vacío en X y en Y
  function esquinas(model, k) {
    const polys = model.slabs.filter(s => s.p1 <= k && k <= s.p2).map(s => s.nodes.map(n => model.nodes[n]));
    if (!polys.length) return null;
    const xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const Lx = x1 - x0, Ly = y1 - y0, n = 1000;
    const lleno = (x, y) => polys.some(p => inPoly(x, y, p));
    let peor = null;
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      const e = 1e-3 * (Lx + Ly);
      if (lleno(cx + sx * e, cy + sy * e)) continue;
      let ex = 0, ey = 0;
      for (let i = 1; i <= n; i++) { const x = cx + sx * i * Lx / n; if (lleno(x, cy + sy * e)) { ex = (i - 0.5) * Lx / n; break; } }
      for (let i = 1; i <= n; i++) { const y = cy + sy * i * Ly / n; if (lleno(cx + sx * e, y)) { ey = (i - 0.5) * Ly / n; break; } }
      if (!peor || ex * ey > peor.ex * peor.ey) peor = { ex, ey, Lx, Ly };
    }
    return peor;
  }

  function evaluar(model, r) {
    const q = r.q, B = r.B, N = B.N, L = B.levels;
    const res = {};
    TIPOS.forEach(([c, nombre, tabla, f]) => { res[c] = { clave: c, nombre, tabla, factor: f, presente: false, detalle: [] }; });
    const marcar = (c, t) => { res[c].presente = true; res[c].detalle.push(t); };
    const anotar = (c, t) => res[c].detalle.push(t);

    // estáticos: sin excentricidad (rigidez) y con ±5% (torsión)
    r.rigidez = []; r.torsion = [];
    for (const D of r.dirs) {
      const F = new Float64Array(3 * N);
      D.Fest.forEach((f, k) => { F[3 * k + D.d] = f; });
      const u = S.solveLateral(B, F);
      const V = []; let acc = 0; for (let k = N - 1; k >= 0; k--) { acc += D.Fest[k]; V[k] = acc; }
      L.forEach((Lv, k) => {
        const d = u[3 * k + D.d] - (k ? u[3 * (k - 1) + D.d] : 0);
        (r.rigidez[k] = r.rigidez[k] || { piso: Lv.name })[D.d ? "Ky" : "Kx"] = V[k] / d;
      });
      for (const sg of [1, -1]) {
        const Ft = Float64Array.from(F);
        L.forEach((Lv, k) => { Ft[3 * k + 2] = sg * D.Fest[k] * q.ecc * (D.d ? Lv.Lx : Lv.Ly); });
        const ut = S.solveLateral(B, Ft);
        for (let k = 1; k <= N; k++) {
          const pts = S.driftPoints(B, k), h = L[k - 1].h;
          const dr = pts.map(p => Math.abs(S.pointDisp(B, ut, k, p.x, p.y, D.d) - S.pointDisp(B, ut, k - 1, p.x, p.y, D.d)) / h);
          const mx = Math.max(...dr), av = (mx + Math.min(...dr)) / 2; // como ETABS: promedio de los extremos
          r.torsion.push({ piso: L[k - 1].name, dir: D.d ? "Y" : "X", max: mx, avg: av, ratio: mx / av, fd: D.fDeriva });
        }
      }
    }
    // piso blando
    for (const [d, key] of [["X", "Kx"], ["Y", "Ky"]]) for (let k = 0; k < N - 1; k++) {
      const ki = r.rigidez[k][key], sup = r.rigidez.slice(k + 1, k + 4).map(o => o[key]);
      const r1 = ki / sup[0], r3 = sup.length === 3 ? ki / (sup.reduce((a, b) => a + b) / 3) : null;
      const t = `${L[k].name} ${d}: K/Ksup = ${r1.toFixed(2)}` + (r3 ? `, K/Kprom3 = ${r3.toFixed(2)}` : "");
      if (r1 < 0.6 || (r3 != null && r3 < 0.7)) marcar("rigidez_ext", t);
      else if (r1 < 0.7 || (r3 != null && r3 < 0.8)) marcar("rigidez", t);
    }
    // masa (no se evalúa la azotea)
    for (let k = 0; k < N - 1; k++) for (const j of [k - 1, k + 1]) {
      if (j >= 0 && j < N - 1 && L[k].W > 1.5 * L[j].W) { marcar("masa", `${L[k].name}: ${L[k].W.toFixed(1)} t > 1,5 × ${L[j].W.toFixed(1)} t (${L[j].name})`); break; }
    }
    // geometría vertical: dimensión en planta del sistema resistente
    const dims = L.map(Lv => {
      const pts = [...B.pts.values()].filter(p => p.k === Lv.k);
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    });
    for (let k = 0; k < N - 2; k++) for (const [d, i] of [["X", 0], ["Y", 1]]) {
      const a = dims[k][i], b = dims[k + 1][i];
      if (Math.min(a, b) > 0 && Math.max(a, b) / Math.min(a, b) > 1.3) marcar("geom_vert", `${L[k].name}/${L[k + 1].name} en ${d}: ${Math.max(a, b).toFixed(1)} m vs ${Math.min(a, b).toFixed(1)} m (> 1,3)`);
    }
    // torsión: solo pisos con deriva inelástica > 50% de la permitida
    const peor = {};
    for (const t of r.torsion) {
      if (t.max * t.fd <= 0.5 * q.derivaLim) continue;
      if (!peor[t.dir] || t.ratio > peor[t.dir].ratio) peor[t.dir] = t;
    }
    if (!Object.keys(peor).length) anotar("torsion", "No aplica: ningún piso supera el 50% de la deriva permitida.");
    for (const t of Object.values(peor)) {
      const txt = `${t.piso} ${t.dir}: Δmax/Δprom = ${t.ratio.toFixed(2)}`;
      if (t.ratio > 1.5) marcar("torsion_ext", txt); else if (t.ratio > 1.3) marcar("torsion", txt); else anotar("torsion", txt + " (≤ 1,3)");
    }
    // esquinas entrantes
    for (let k = 1; k <= N; k++) {
      const e = esquinas(model, k);
      if (e && e.ex > 0.2 * e.Lx && e.ey > 0.2 * e.Ly) { marcar("esquinas", `${L[k - 1].name}: esquina de ${e.ex.toFixed(1)} × ${e.ey.toFixed(1)} m (> 20% de ${e.Lx.toFixed(1)} × ${e.Ly.toFixed(1)} m)`); break; }
    }
    // discontinuidad del diafragma: aberturas (vacíos, escaleras, paños sin losa) > 50% del área bruta
    const ab = model.aberturas;
    if (ab && ab.Abruta > 0) {
      const f = ab.Aab / ab.Abruta, t = `Aberturas ${ab.Aab.toFixed(1)} m² de ${ab.Abruta.toFixed(1)} m² (${(100 * f).toFixed(0)}%)`;
      if (f > 0.5) marcar("diafragma", t + " > 50% del área bruta."); else if (ab.Aab > 0) anotar("diafragma", t + " ≤ 50%.");
    }
    // piso débil: resistencia al corte del entrepiso < 80% (extremo < 65%) de la del entrepiso de arriba
    try {
      const res = resistencias(model, B, model.fc || Math.pow(model.E / 150000, 2), model.fy || 4200);
      r.resistencia = res.map((v, k) => ({ piso: L[k].name, X: v[0], Y: v[1] }));
      for (let k = 0; k < N - 1; k++) for (const [d, i] of [["X", 0], ["Y", 1]]) {
        const a = res[k][i], b = res[k + 1][i]; if (!(b > 0)) continue;
        const t = `${L[k].name} ${d}: ${a.toFixed(0)} t vs ${b.toFixed(0)} t arriba (${(100 * a / b).toFixed(0)}%)`;
        if (a < 0.65 * b) marcar("debil_ext", t); else if (a < 0.8 * b) marcar("debil", t);
      }
      if (!res.some((v, k) => k < N - 1 && (v[0] < 0.8 * res[k + 1][0] || v[1] < 0.8 * res[k + 1][1]))) anotar("debil", "Resistencias estimadas con acero mínimo: ningún entrepiso baja del 80% del de arriba.");
    } catch (err) { anotar("debil", "No se pudo estimar la resistencia: " + err.message); }
    // sistemas no paralelos: elementos a 30° o más de las direcciones de análisis que toman más del 10% del cortante
    {
      const desv = (a, b) => { const [x1, y1] = model.nodes[a], [x2, y2] = model.nodes[b]; let g = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) % 90; return Math.min(g, 90 - g); };
      const nodosNP = new Set(), vigasP = new Set();
      for (const v of model.beams) { if (desv(v.i, v.j) >= 30 - 1e-6) { nodosNP.add(v.i); nodosNP.add(v.j); } else { vigasP.add(v.i); vigasP.add(v.j); } }
      const murosNP = new Set((model.walls || []).map((w, i) => desv(w.i, w.j) >= 30 - 1e-6 ? i : -1).filter(i => i >= 0));
      if (nodosNP.size || murosNP.size) {
        for (const D of r.dirs) {
          const F = new Float64Array(3 * N); D.Fest.forEach((f, k) => { F[3 * k + D.d] = f; });
          const u = S.fullDisp(B, S.solveLateral(B, F));
          let vnp = 0, vt = 0;
          for (const e of B.elems) if (e.type === "col" && e.k === 1) {
            const v = Math.abs(S.elemForces(e, u)[D.d]); vt += v;
            const id = B.pts.get(e.a).id;
            if (e.wall != null ? murosNP.has(e.wall) : nodosNP.has(id) && !vigasP.has(id)) vnp += v;
          }
          const fr = vt ? vnp / vt : 0, t = `Dirección ${D.d ? "Y" : "X"}: los elementos no paralelos toman ${(100 * fr).toFixed(0)}% del cortante`;
          if (fr > 0.1) marcar("no_paralelos", t + " (> 10%)."); else anotar("no_paralelos", t + " (≤ 10%, no aplica).");
        }
      } else anotar("no_paralelos", "Todos los ejes forman menos de 30° con X o Y.");
    }
    // discontinuidad: columnas o placas que empiezan sobre el piso 1 sin nada debajo
    for (const c of model.columns) if (c.p1 > 1 && !model.columns.some(o => o.node === c.node && o.p1 <= c.p1 - 1 && c.p1 - 1 <= o.p2))
      marcar("discont", `Columna ${c.node} nace en el piso ${c.p1} sin columna debajo (revisar si toma > 10% del cortante).`);
    for (const w of model.walls || []) if (w.p1 > 1 && !(model.walls || []).some(o => o !== w && o.i === w.i && o.j === w.j && o.p2 >= w.p1 - 1))
      marcar("discont", `Placa ${w.i}-${w.j} nace en el piso ${w.p1} sin placa debajo.`);

    const lista = Object.values(res);
    const Ia = Math.min(1, ...lista.filter(v => v.presente && v.tabla === "Altura").map(v => v.factor));
    const Ip = Math.min(1, ...lista.filter(v => v.presente && v.tabla === "Planta").map(v => v.factor));
    return { lista, Ia, Ip };
  }

  function restricciones(q, irr, nPisos, hn) {
    const T = E.ART[q.norma], av = [];
    const hay = irr.lista.filter(v => v.presente).map(v => v.nombre);
    const ext = irr.lista.filter(v => v.presente && EXTREMAS.includes(v.clave)).map(v => v.nombre);
    const cat = q.categoria, z = q.zona;
    if ((cat === "A1" || cat === "A2") && z >= 2 && hay.length) av.push(`NO PERMITIDO (${T.restric}): la categoría ${cat} en zona ${z} no admite irregularidades (${hay.join(", ")}).`);
    else if ((cat === "A1" || cat === "A2") && z === 1 && ext.length) av.push(`NO PERMITIDO (${T.restric}): la categoría ${cat} en zona 1 no admite irregularidades extremas (${ext.join(", ")}).`);
    else if (cat === "B" && z >= 2 && ext.length) av.push(`NO PERMITIDO (${T.restric}): la categoría B en zona ${z} no admite irregularidades extremas (${ext.join(", ")}).`);
    else if (cat === "C" && z >= 3 && ext.length) av.push(`NO PERMITIDO (${T.restric}): la categoría C en zona ${z} no admite irregularidades extremas (${ext.join(", ")}). Hay que cambiar la estructuración.`);
    else if (cat === "C" && z === 2 && ext.length && !(nPisos <= 2 || hn <= 8)) av.push(`NO PERMITIDO (${T.restric}): en zona 2 la categoría C solo admite irregularidades extremas hasta 2 pisos u 8 m.`);
    const sis = [q.sistemaX, q.sistemaY];
    if ((cat === "A1" && z <= 2 || cat === "A2" && z >= 2) && sis.includes("PÓRTICOS"))
      av.push(`NO PERMITIDO (${T.sistema}): la categoría ${cat} en zona ${z} no admite pórticos de concreto; usa sistema dual o de muros.`);
    if (cat === "A1" && z >= 3) av.push("La categoría A1 en zonas 3 y 4 requiere aislamiento sísmico en la base.");
    return av;
  }

  /* Análisis completo: corre, evalúa irregularidades, recalcula con R = R0·Ia·Ip hasta que no cambie.
     opciones.autoIrreg (true), opciones.corregirSistema (false) */
  function analizarTodo(model, p, opciones = {}) {
    const auto = opciones.autoIrreg !== false;
    let pp = Object.assign({}, p), r, irr, hist = [];
    for (let it = 0; it < 4; it++) {
      r = E.analizar(model, pp);
      irr = evaluar(model, r);
      hist.push({ Rx: r.q.Rx, Ry: r.q.Ry, Ia: irr.Ia, Ip: irr.Ip });
      if (!auto) break;
      if (Math.abs((pp.Ia ?? 1) - irr.Ia) < 1e-9 && Math.abs((pp.Ip ?? 1) - irr.Ip) < 1e-9) break;
      pp = Object.assign({}, pp, { Ia: irr.Ia, Ip: irr.Ip, regular: irr.Ia * irr.Ip === 1 });
    }
    r.irreg = irr; r.historial = hist;
    r.restricciones = restricciones(r.q, irr, r.B.N, r.hn);
    r.sistema = r.dirs.map(D => ({ dir: D.d ? "Y" : "X", declarado: D.d ? r.q.sistemaY : r.q.sistemaX, calculado: D.sistemaCalc, fracMuros: D.fracMuros }));
    return r;
  }

  const Irreg = { resistencias, TIPOS, evaluar, restricciones, analizarTodo, esquinas };
  root.Irreg = Irreg;
  if (typeof module !== "undefined") module.exports = Irreg;
})(typeof window !== "undefined" ? window : globalThis);
