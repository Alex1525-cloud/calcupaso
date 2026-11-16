/* Irregularidades E.030 (Tablas N° 11 y 12 de la 2026), sistema estructural y bucle Ia·Ip -> R.
   Reglas portadas del prototipo con ETABS (irregularidades.py). */
(function (root) {
  "use strict";
  const S = root.Solver || require("./solver.js");
  const E = root.E030 || require("./e030.js");

  const TIPOS = [
    ["rigidez", "Piso blando (rigidez)", "Altura", 0.75],
    ["rigidez_ext", "Piso blando extremo (rigidez)", "Altura", 0.50],
    ["masa", "Masa o peso", "Altura", 0.90],
    ["geom_vert", "Geometría vertical", "Altura", 0.90],
    ["discont", "Discontinuidad en los sistemas resistentes", "Altura", 0.80],
    ["torsion", "Torsional", "Planta", 0.75],
    ["torsion_ext", "Torsional extrema", "Planta", 0.60],
    ["esquinas", "Esquinas entrantes", "Planta", 0.90],
    ["diafragma", "Discontinuidad del diafragma", "Planta", 0.85],
  ];
  const EXTREMAS = ["rigidez_ext", "torsion_ext"];

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

  const Irreg = { TIPOS, evaluar, restricciones, analizarTodo, esquinas };
  root.Irreg = Irreg;
  if (typeof module !== "undefined") module.exports = Irreg;
})(typeof window !== "undefined" ? window : globalThis);
