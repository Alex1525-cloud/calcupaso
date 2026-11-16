/* Plano en planta con geometría libre (piso típico) y su conversión al modelo del solver.
   plano = { ejes: [{id, a:[x,y], b:[x,y]}], columnas: [{id, x, y, b, h, ang}], vigas: [{id, a, b, bw, h}],
             placas: [{id, a, b, t}], losas: [{id, pts: [[x,y]...]}] }   (m, grados) */
(function (root) {
  "use strict";
  const TOL = 0.01;
  let contador = 1;
  const nuevoId = (p) => p + (contador++).toString(36) + Math.random().toString(36).slice(2, 5);

  const vacio = () => ({ ejes: [], columnas: [], vigas: [], placas: [], losas: [] });

  // ---------------------------------------------------------------- geometría básica
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function proyeccion(p, a, b) { // parámetro t y distancia de p al segmento ab
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    const q = [a[0] + t * dx, a[1] + t * dy];
    return { t, d: dist(p, q), q };
  }
  function interseccion(a, b, c, d) { // de segmentos; devuelve punto o null
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  }
  function areaPoly(p) { let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; }
  function dentro(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // ---------------------------------------------------------------- generar un pórtico desde luces
  function desdeEjes(lx, ly, sec) {
    const p = vacio(), xs = [0], ys = [0];
    lx.forEach(l => xs.push(xs[xs.length - 1] + l)); ly.forEach(l => ys.push(ys[ys.length - 1] + l));
    const X = xs[xs.length - 1], Y = ys[ys.length - 1];
    xs.forEach((x, i) => p.ejes.push({ id: nuevoId("e"), nombre: String.fromCharCode(65 + i), a: [x, -1.5], b: [x, Y + 1.5] }));
    ys.forEach((y, j) => p.ejes.push({ id: nuevoId("e"), nombre: String(j + 1), a: [-1.5, y], b: [X + 1.5, y] }));
    for (const x of xs) for (const y of ys) p.columnas.push({ id: nuevoId("c"), x, y, b: sec.col[0], h: sec.col[1], ang: 0 });
    for (const y of ys) for (let i = 0; i < xs.length - 1; i++) p.vigas.push({ id: nuevoId("v"), a: [xs[i], y], b: [xs[i + 1], y], bw: sec.viga[0], h: sec.viga[1] });
    for (const x of xs) for (let j = 0; j < ys.length - 1; j++) p.vigas.push({ id: nuevoId("v"), a: [x, ys[j]], b: [x, ys[j + 1]], bw: sec.viga[0], h: sec.viga[1] });
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++)
      p.losas.push({ id: nuevoId("l"), pts: [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]] });
    return p;
  }

  // ---------------------------------------------------------------- caras cerradas (para losas automáticas)
  function segmentos(p) {
    // vigas y placas partidas en todas las intersecciones y nudos
    const base = p.vigas.map(v => [v.a, v.b]).concat(p.placas.map(w => [w.a, w.b]));
    const pts = [];
    base.forEach(s => pts.push(s[0], s[1]));
    p.columnas.forEach(c => pts.push([c.x, c.y]));
    for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
      const q = interseccion(base[i][0], base[i][1], base[j][0], base[j][1]); if (q) pts.push(q);
    }
    const out = [];
    for (const [a, b] of base) {
      const ts = [0, 1];
      for (const q of pts) { const r = proyeccion(q, a, b); if (r.d < TOL && r.t > 1e-6 && r.t < 1 - 1e-6) ts.push(r.t); }
      ts.sort((x, y) => x - y);
      for (let k = 0; k < ts.length - 1; k++) {
        if (ts[k + 1] - ts[k] < 1e-6) continue;
        const P = (t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        out.push([P(ts[k]), P(ts[k + 1])]);
      }
    }
    return out;
  }
  function caras(p) {
    const segs = segmentos(p);
    const vs = [], key = (q) => Math.round(q[0] / TOL) + "," + Math.round(q[1] / TOL), idx = new Map();
    const vid = (q) => { const k = key(q); if (!idx.has(k)) { idx.set(k, vs.length); vs.push(q); } return idx.get(k); };
    const adj = new Map();
    const add = (i, j) => { if (i === j) return; if (!adj.has(i)) adj.set(i, new Set()); adj.get(i).add(j); };
    for (const [a, b] of segs) { const i = vid(a), j = vid(b); add(i, j); add(j, i); }
    // ordenar vecinos por ángulo
    const ang = (i, j) => Math.atan2(vs[j][1] - vs[i][1], vs[j][0] - vs[i][0]);
    const vec = new Map(); for (const [i, s] of adj) vec.set(i, [...s].sort((a, b) => ang(i, a) - ang(i, b)));
    const usado = new Set(), out = [];
    for (const [i, ns] of vec) for (const j of ns) {
      if (usado.has(i + ">" + j)) continue;
      const cara = []; let a = i, b = j, guard = 0;
      while (!usado.has(a + ">" + b) && guard++ < 10000) {
        usado.add(a + ">" + b); cara.push(vs[a]);
        const lista = vec.get(b), k = lista.indexOf(a);
        const c = lista[(k - 1 + lista.length) % lista.length]; // siguiente en sentido horario = cara a la izquierda
        a = b; b = c;
      }
      if (cara.length >= 3 && areaPoly(cara) > 1e-3) out.push(cara);
    }
    return out; // caras interiores (antihorarias)
  }
  function losasAutomaticas(p) {
    const nuevas = caras(p).filter(c => !p.losas.some(l => { const [cx, cy] = centroide(c); return dentro(cx, cy, l.pts); }));
    nuevas.forEach(c => p.losas.push({ id: nuevoId("l"), pts: c }));
    return nuevas.length;
  }
  function losaEn(p, x, y) {
    const cs = caras(p).filter(c => dentro(x, y, c)).sort((a, b) => Math.abs(areaPoly(a)) - Math.abs(areaPoly(b)));
    return cs[0] || null;
  }
  function centroide(c) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length], f = a[0] * b[1] - b[0] * a[1]; A += f; cx += (a[0] + b[0]) * f; cy += (a[1] + b[1]) * f; }
    return A ? [cx / (3 * A), cy / (3 * A)] : c[0];
  }

  // ---------------------------------------------------------------- plano -> modelo del solver

  /* ---------- formas de columna y tipos de losa ---------- */
  // Contorno de la columna en ejes locales (u en la dirección de b, v en la de h), centrado en su centroide
  function contornoColumna(c) {
    const b = c.b, h = c.h, t = Math.min(c.t || 0.25, b, h), f = c.forma || "rect";
    let q;
    if (f === "circ") { q = []; for (let i = 0; i < 32; i++) { const a = 2 * Math.PI * i / 32; q.push([b / 2 * Math.cos(a), b / 2 * Math.sin(a)]); } return q; }
    if (f === "L") q = [[0, 0], [b, 0], [b, t], [t, t], [t, h], [0, h]];
    else if (f === "T") q = [[(b - t) / 2, 0], [(b + t) / 2, 0], [(b + t) / 2, h - t], [b, h - t], [b, h], [0, h], [0, h - t], [(b - t) / 2, h - t]];
    else q = [[0, 0], [b, 0], [b, h], [0, h]];
    const [cx, cy] = centroide(q);
    return q.map(([u, v]) => [u - cx, v - cy]);
  }
  const jRect = (a, b) => { const x = Math.max(a, b), y = Math.min(a, b); return x * y ** 3 * (1 / 3 - 0.21 * (y / x) * (1 - (y / x) ** 4 / 12)); };
  /* Propiedades para el motor: área, inercias principales (Iz: rigidez en la dirección de b girada phi grados), J y área de corte */
  function propsColumna(c) {
    const f = c.forma || "rect", b = c.b, h = c.h, t = Math.min(c.t || 0.25, b, h);
    if (f === "rect") return null; // el motor usa b·h directamente
    if (f === "circ") { const A = Math.PI * b * b / 4, I = Math.PI * b ** 4 / 64; return { A, Iz: I, Iy: I, J: 2 * I, As: 0.9 * A, phi: 0 }; }
    const q = contornoColumna(c);
    let A = 0, Suu = 0, Svv = 0, Suv = 0; // ∫u², ∫v², ∫uv respecto al centroide
    for (let i = 0; i < q.length; i++) {
      const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length], cr = x0 * y1 - x1 * y0;
      A += cr / 2; Suu += cr * (x0 * x0 + x0 * x1 + x1 * x1) / 12; Svv += cr * (y0 * y0 + y0 * y1 + y1 * y1) / 12; Suv += cr * (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) / 24;
    }
    if (A < 0) { A = -A; Suu = -Suu; Svv = -Svv; Suv = -Suv; }
    const m = (Suu + Svv) / 2, r = Math.hypot((Suu - Svv) / 2, Suv), phi = 0.5 * Math.atan2(2 * Suv, Suu - Svv);
    const J = f === "L" ? jRect(b, t) + jRect(t, h - t) : jRect(b, t) + jRect(t, h - t);
    return { A, Iz: m + r, Iy: m - r, J, As: 5 / 6 * A, phi: phi * 180 / Math.PI };
  }
  const FORMAS = { rect: "Rectangular", circ: "Circular", L: "En L", T: "En T" };
  // Losas: peso propio (kg/m²). Aligerada en una dirección según E.020; las demás, estimadas por geometría.
  const TIPOS_LOSA = {
    aligerada1: { nombre: "Aligerada en una dirección", h: [0.17, 0.20, 0.25, 0.30], div: 25, nota: "h ≥ L/25 (luz menor)" },
    aligerada2: { nombre: "Aligerada en dos direcciones", h: [0.17, 0.20, 0.25, 0.30], div: 40, nota: "h ≥ L/40 o perímetro/180" },
    maciza: { nombre: "Maciza (armada)", h: [0.12, 0.15, 0.17, 0.20, 0.25], div: 40, nota: "h ≥ L/40 en dos direcciones (L/30 si trabaja en una)" },
    nervada: { nombre: "Nervada (sin ladrillo)", h: [0.20, 0.25, 0.30, 0.35, 0.40], div: 21, nota: "h ≥ L/21" },
    colaborante: { nombre: "Placa colaborante (steel deck)", h: [0.11, 0.12, 0.14, 0.16], div: 32, nota: "h según catálogo; luz ≈ 32·h sin apuntalar" },
    escalera: { nombre: "Escalera (hueco con su peso)", h: [0.15, 0.17, 0.20], div: 25, nota: "garganta ≈ L/25" },
    vacio: { nombre: "Vacío / ducto (sin losa)", h: [0], div: 0, nota: "" },
  };
  function pesoLosa(tipo, h) {
    const al1 = (x) => x <= 0.17 ? 280 : x <= 0.20 ? 300 : x <= 0.25 ? 350 : 420;
    switch (tipo) {
      case "aligerada2": return Math.round(al1(h) * 1.18); // viguetas en ambos sentidos
      case "maciza": return Math.round(2400 * h);
      case "nervada": return Math.round(2400 * (0.05 + 0.10 * (h - 0.05) / 0.50));
      case "colaborante": return Math.round(2400 * (h - 0.03) + 10);
      case "escalera": return Math.round(2400 * (h / Math.cos(Math.PI / 6) + 0.17 / 2)); // garganta inclinada + pasos
      case "vacio": return 0;
      default: return al1(h);
    }
  }

  function aModelo(p, pisos, fc, cargas, catC) { // catC: fracción de CV en el peso sísmico (número) o true = categoría C
    const n = pisos.n;
    const nodes = {}, idx = new Map(); let k = 0;
    const key = (q) => Math.round(q[0] / TOL) + "," + Math.round(q[1] / TOL);
    const nodo = (q) => { const kk = key(q); if (!idx.has(kk)) { const id = "N" + (++k); idx.set(kk, id); nodes[id] = [+q[0].toFixed(4), +q[1].toFixed(4)]; } return idx.get(kk); };
    const sections = {}, secc = (tipo, b, h, c) => {
      const f = c && c.forma && c.forma !== "rect" ? c.forma : "";
      const nm = (tipo === "col" ? "C" + f : tipo === "beam" ? "V" : "M") + Math.round(b * 100) + (h ? "x" + Math.round(h * 100) : "") + (f === "L" || f === "T" ? "t" + Math.round((c.t || 0.25) * 100) : "");
      if (!sections[nm]) { sections[nm] = { type: tipo, b, h }; if (f) { sections[nm].forma = f; sections[nm].props = propsColumna(c); sections[nm].poly = contornoColumna(c); } }
      return nm;
    };
    const avisos = [];
    // puntos donde se parten vigas y placas: columnas, extremos e intersecciones
    const corte = [];
    p.columnas.forEach(c => corte.push([c.x, c.y]));
    p.vigas.forEach(v => corte.push(v.a, v.b)); p.placas.forEach(w => corte.push(w.a, w.b));
    const lineas = p.vigas.map(v => [v.a, v.b]).concat(p.placas.map(w => [w.a, w.b]));
    for (let i = 0; i < lineas.length; i++) for (let j = i + 1; j < lineas.length; j++) { const q = interseccion(lineas[i][0], lineas[i][1], lineas[j][0], lineas[j][1]); if (q) corte.push(q); }
    const partir = (a, b) => {
      const ts = [0, 1];
      for (const q of corte) { const r = proyeccion(q, a, b); if (r.d < TOL && r.t > 1e-6 && r.t < 1 - 1e-6) ts.push(r.t); }
      ts.sort((x, y) => x - y);
      const P = (t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], out = [];
      for (let i = 0; i < ts.length - 1; i++) if (ts[i + 1] - ts[i] > 1e-6) out.push([P(ts[i]), P(ts[i + 1])]);
      return out;
    };
    // rango de pisos de cada elemento (plantas distintas por piso); sin "pisos" va en todos
    const rango = (o) => { const r = o.pisos || [1, n]; return [Math.max(1, r[0]), Math.min(n, r[1])]; };
    const columns = p.columnas.filter(c => rango(c)[0] <= rango(c)[1]).map(c => { const nm = secc("col", c.b, c.h, c), pr = sections[nm].props; const [p1, p2] = rango(c); return { node: nodo([c.x, c.y]), sec: nm, p1, p2, ang: (c.ang || 0) + (pr ? pr.phi : 0), angDib: c.ang || 0 }; });
    const beams = [], vistos = new Set();
    for (const v of p.vigas) { const [p1, p2] = rango(v); if (p1 > p2) continue; for (const [a, b] of partir(v.a, v.b)) {
      const i = nodo(a), j = nodo(b), kk = [i, j].sort().join() + "#" + p1 + "-" + p2;
      if (i === j || vistos.has(kk)) continue; vistos.add(kk);
      beams.push({ i, j, sec: secc("beam", v.bw, v.h), p1, p2 });
    } }
    const walls = [];
    for (const w of p.placas) for (const [a, b] of (rango(w)[0] <= rango(w)[1] ? partir(w.a, w.b) : [])) {
      let sc = secc("wall", w.t);
      if (w.mat === "alb") { // albañilería confinada (E.070): Em = 500 f'm, Gm = 0,4 Em, γ = 1,8 t/m³
        const fm = w.fm || 65, nm = "A" + Math.round(w.t * 100) + "f" + fm;
        if (!sections[nm]) sections[nm] = { type: "wall", b: w.t, mat: "alb", fm, vm: w.vm || 8.1, E: 500 * fm * 10, G: 0.4 * 500 * fm * 10, gamma: 1.8 };
        sc = nm;
      }
      const [p1, p2] = rango(w); walls.push({ i: nodo(a), j: nodo(b), sec: sc, p1, p2 });
    }
    // losas: peso propio según su tipo (la CM del formulario es solo acabados + tabiquería); escalera con su CV; vacío sin losa
    // (planos antiguos sin losaTipo: la CM ya incluía la losa y no se suma nada)
    const tl = p.losaTipo || null, base = tl ? pesoLosa(tl.tipo, tl.h) : 0;
    const slabs = p.losas.filter(l => (l.tipo || (tl && tl.tipo)) !== "vacio").map(l => {
      const tipo = l.tipo || (tl ? tl.tipo : "aligerada1"), h = l.h || (tl && tipo === tl.tipo ? tl.h : (TIPOS_LOSA[tipo].h[1] || TIPOS_LOSA[tipo].h[0]));
      const extra = tl ? pesoLosa(tipo, h) : (l.tipo ? pesoLosa(tipo, h) - 300 : 0); // sin losaTipo: diferencia respecto a la aligerada de 0.20 incluida en la CM
      const [p1, p2] = rango(l); const o = { nodes: l.pts.map(nodo), p1, p2, cm: extra / 1000, tipo };
      if (tipo === "escalera") { o.cm += 0.1; o.cvAbs = (cargas.cvEsc || 200) / 1000; }
      return o;
    }).filter(o => o.p1 <= o.p2);
    // aberturas del diafragma (vacíos, escaleras y paños sin losa) para la irregularidad de la Tabla 12
    let Abruta = 0, Aab = 0;
    try {
      for (const c of caras(p)) {
        const A = Math.abs(areaPoly(c)), [cx, cy] = centroide(c); Abruta += A;
        const l = p.losas.find(o => dentro(cx, cy, o.pts)), tipo = l && (l.tipo || (tl && tl.tipo));
        if (!l || tipo === "vacio" || tipo === "escalera") Aab += A;
      }
    } catch (e) { /* planta sin recuadros */ }
    // nudos de vigas sin apoyo: el solver los resuelve, pero avisamos si una viga queda en voladizo de ambos lados
    const apoyos = new Set(columns.map(c => c.node).concat(walls.flatMap(w => [w.i, w.j])));
    if (!apoyos.size) avisos.push("No hay columnas ni placas.");
    const stories = Array.from({ length: n }, (_, i) => ({ name: "Piso" + (i + 1), h: i ? pisos.h : pisos.h1 }));
    return {
      model: {
        stories, fc, E: 15000 * Math.sqrt(fc) * 10, nu: 0.2, gamma: 2.4, nodes, sections, columns, beams, slabs, walls,
        loads: { cm: cargas.cm / 1000, cmRoof: cargas.cmRoof / 1000, cv: cargas.cv / 1000, cvRoof: cargas.cvRoof / 1000 },
        aberturas: { Abruta, Aab },
        massFactors: { cm: 1, cv: typeof catC === "number" ? catC : (catC ? 0.25 : 0.5), cvRoof: 0.25 },
      }, avisos,
    };
  }

  // Revisión rápida antes de analizar
  function revisar(p, n) {
    const err = [], av = [];
    if (n) for (let k = 1; k <= n; k++) { // con plantas distintas por piso, cada piso necesita losa
      const en = (o) => { const r = o.pisos || [1, n]; return r[0] <= k && k <= r[1]; };
      if (!p.losas.some(l => en(l) && l.tipo !== "vacio")) err.push(`El piso ${k} no tiene losa.`);
      else if (!p.columnas.some(en) && !p.placas.some(en)) err.push(`El piso ${k} no tiene columnas ni placas.`);
    }
    if (!p.columnas.length && !p.placas.length) err.push("Dibuja al menos columnas o placas.");
    if (!p.losas.length) err.push("No hay losas: usa «Losas automáticas» o la herramienta Losa.");
    // puntos de las vigas: ¿llegan a una columna, placa u otra viga?
    const apoyos = p.columnas.map(c => [c.x, c.y]);
    const sobre = (q) => apoyos.some(a => dist(a, q) < 0.05) || p.placas.some(w => proyeccion(q, w.a, w.b).d < 0.05 && proyeccion(q, w.a, w.b).t > -0.01 && proyeccion(q, w.a, w.b).t < 1.01) ||
      p.vigas.filter(v => proyeccion(q, v.a, v.b).d < 0.05).length > 1;
    const sueltas = p.vigas.filter(v => !sobre(v.a) && !sobre(v.b)).length;
    if (sueltas) av.push(`${sueltas} viga(s) no tocan ninguna columna, placa ni otra viga en sus extremos.`);
    return { err, av };
  }

  // Luces de las vigas (para el predimensionamiento)
  function luces(p) { return p.vigas.map(v => dist(v.a, v.b)).filter(l => l > 0.3); }
  function extension(p) {
    const xs = [], ys = [];
    p.columnas.forEach(c => { xs.push(c.x); ys.push(c.y); });
    [...p.vigas, ...p.placas, ...p.ejes].forEach(s => { xs.push(s.a[0], s.b[0]); ys.push(s.a[1], s.b[1]); });
    p.losas.forEach(l => l.pts.forEach(q => { xs.push(q[0]); ys.push(q[1]); }));
    if (!xs.length) return { x0: 0, y0: 0, x1: 15, y1: 15 };
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  root.Plano = { contornoColumna, propsColumna, FORMAS, TIPOS_LOSA, pesoLosa, vacio, nuevoId, desdeEjes, caras, losasAutomaticas, losaEn, aModelo, revisar, luces, extension, proyeccion, interseccion, dist, dentro, areaPoly, centroide };
  if (typeof module !== "undefined") module.exports = root.Plano;
})(typeof window !== "undefined" ? window : globalThis);
