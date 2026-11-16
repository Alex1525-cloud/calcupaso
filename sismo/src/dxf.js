/* Lector de DXF (AutoCAD: Guardar como -> DXF) e importación a un plano estructural.
   Lee LINE, LWPOLYLINE, POLYLINE, CIRCLE e INSERT (bloques) con sus capas. */
(function (root) {
  "use strict";
  const Pl = root.Plano || require("./plano.js");

  function pares(txt) {
    const l = txt.split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < l.length; i += 2) out.push([parseInt(l[i].trim(), 10), l[i + 1].trim()]);
    return out;
  }

  // Devuelve { unidades, capas: {nombre: n}, ent: [{tipo, capa, pts, cerrada, r}] } con los bloques ya expandidos
  function leer(txt) {
    const P = pares(txt);
    let i = 0, unidades = 0;
    const bloques = {}, ent = [];
    const leerEntidad = () => { // P[i] = [0, TIPO]; devuelve {tipo, datos: [[c, v]...]} y avanza
      const tipo = P[i][1], datos = []; i++;
      while (i < P.length && P[i][0] !== 0) { datos.push(P[i]); i++; }
      return { tipo, datos };
    };
    const num = (d, c, def = 0) => { const x = d.find(p => p[0] === c); return x ? parseFloat(x[1]) : def; };
    const str = (d, c, def = "") => { const x = d.find(p => p[0] === c); return x ? x[1] : def; };
    function convertir(e, lista) {
      const d = e.datos, capa = str(d, 8, "0");
      if (e.tipo === "LINE") lista.push({ tipo: "linea", capa, pts: [[num(d, 10), num(d, 20)], [num(d, 11), num(d, 21)]] });
      else if (e.tipo === "LWPOLYLINE") {
        const pts = []; let x = null;
        for (const [c, v] of d) { if (c === 10) x = parseFloat(v); else if (c === 20 && x != null) { pts.push([x, parseFloat(v)]); x = null; } }
        lista.push({ tipo: "poli", capa, pts, cerrada: (num(d, 70) & 1) === 1 });
      } else if (e.tipo === "CIRCLE") lista.push({ tipo: "circulo", capa, pts: [[num(d, 10), num(d, 20)]], r: num(d, 40) });
      else if (e.tipo === "INSERT") lista.push({ tipo: "insert", capa, bloque: str(d, 2), x: num(d, 10), y: num(d, 20), sx: num(d, 41, 1), sy: num(d, 42, 1), rot: num(d, 50) });
    }
    function seccion(nombre, destino) {
      // POLYLINE con VERTEX hasta SEQEND
      while (i < P.length && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) {
        if (P[i][0] !== 0) { i++; continue; }
        if (P[i][1] === "POLYLINE") {
          const cab = leerEntidad(), capa = str(cab.datos, 8, "0"), pts = [];
          while (i < P.length && P[i][1] === "VERTEX") { const v = leerEntidad(); pts.push([num(v.datos, 10), num(v.datos, 20)]); }
          if (i < P.length && P[i][1] === "SEQEND") leerEntidad();
          destino.push({ tipo: "poli", capa, pts, cerrada: (num(cab.datos, 70) & 1) === 1 });
        } else if (nombre === "BLOCKS" && P[i][1] === "BLOCK") {
          const b = leerEntidad(), lista = [];
          const bn = str(b.datos, 2), bx = num(b.datos, 10), by = num(b.datos, 20);
          while (i < P.length && !(P[i][0] === 0 && P[i][1] === "ENDBLK")) {
            if (P[i][1] === "POLYLINE") { seccionPoly(lista); continue; }
            const e = leerEntidad(); convertir(e, lista);
          }
          if (i < P.length) leerEntidad();
          bloques[bn] = { base: [bx, by], lista };
        } else convertir(leerEntidad(), destino);
      }
    }
    function seccionPoly(destino) {
      const cab = leerEntidad(), capa = str(cab.datos, 8, "0"), pts = [];
      while (i < P.length && P[i][1] === "VERTEX") { const v = leerEntidad(); pts.push([num(v.datos, 10), num(v.datos, 20)]); }
      if (i < P.length && P[i][1] === "SEQEND") leerEntidad();
      destino.push({ tipo: "poli", capa, pts, cerrada: (num(cab.datos, 70) & 1) === 1 });
    }
    while (i < P.length) {
      if (P[i][0] === 0 && P[i][1] === "SECTION") {
        i++; const nombre = P[i] && P[i][1]; i++;
        if (nombre === "HEADER") {
          while (i < P.length && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) {
            if (P[i][0] === 9 && P[i][1] === "$INSUNITS" && P[i + 1]) unidades = parseInt(P[i + 1][1], 10);
            i++;
          }
        } else if (nombre === "BLOCKS") seccion("BLOCKS", []);
        else if (nombre === "ENTITIES") seccion("ENTITIES", ent);
        else while (i < P.length && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) i++;
      }
      i++;
    }
    // expandir bloques (un nivel de anidamiento más, por si acaso)
    const expandir = (e, prof) => {
      const b = bloques[e.bloque]; if (!b || prof > 3) return [];
      const c = Math.cos(e.rot * Math.PI / 180), s = Math.sin(e.rot * Math.PI / 180);
      const T = ([x, y]) => { const u = (x - b.base[0]) * e.sx, v = (y - b.base[1]) * e.sy; return [e.x + u * c - v * s, e.y + u * s + v * c]; };
      const out = [];
      for (const o of b.lista) {
        if (o.tipo === "insert") { expandir(o, prof + 1).forEach(q => out.push(Object.assign(q, { capa: q.capa === "0" ? e.capa : q.capa }))); continue; }
        out.push({ tipo: o.tipo, capa: o.capa === "0" ? e.capa : o.capa, pts: o.pts.map(T), cerrada: o.cerrada, r: o.r ? o.r * Math.abs(e.sx) : undefined });
      }
      return out;
    };
    const todas = [];
    for (const e of ent) { if (e.tipo === "insert") todas.push(...expandir(e, 0)); else todas.push(e); }
    const capas = {};
    todas.forEach(e => { capas[e.capa] = (capas[e.capa] || 0) + 1; });
    return { unidades, capas, ent: todas };
  }

  function rolSugerido(capa) {
    const c = capa.toUpperCase();
    if (/PLACA|MURO|PL[-_ ]|WALL|PLACAS/.test(c)) return "placas";
    if (/COL/.test(c)) return "columnas";
    // capas tipo "S-CONCRETO" (columnas y vigas juntas): solo los rectángulos cerrados salen como columnas
    if (/CONCRETO|(^|[^A-Z])CONC([^A-Z]|$)|ESTRUC/.test(c) && !/FINO|ZAP|CIM|LOSA|ACHUR|HATCH|TEXTO|COTA|OCULT/.test(c)) return "columnas";
    if (/EJE|GRID|AXIS|AXES/.test(c)) return "ejes";
    if (/VIG|BEAM/.test(c)) return "vigas";
    return "ignorar";
  }
  const escalaUnidades = (u) => ({ 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 })[u] || null;
  function escalaProbable(d) { // si no hay $INSUNITS, adivina por el tamaño del dibujo
    const xs = d.ent.flatMap(e => e.pts.map(p => p[0])), ys = d.ent.flatMap(e => e.pts.map(p => p[1]));
    const L = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return L > 3000 ? 0.001 : L > 300 ? 0.01 : 1;
  }

  /* Escala sugerida. Muchos planos están dibujados "en la lámina" (p. ej. en mm a escala 1:50): se mira el
     tamaño de las columnas (rectángulos cerrados en capas de columnas) y se elige la escala 1:f que da
     columnas de tamaño usual y en medidas redondas (múltiplos de 5 cm). Devuelve {u: m por unidad, f}. */
  const ESCALAS = [1, 20, 25, 50, 75, 100, 125, 200];
  function escalaSugerida(d, roles) {
    const u = escalaUnidades(d.unidades) || escalaProbable(d);
    const lados = [];
    for (const e of d.ent) {
      if (roles[e.capa] !== "columnas" || e.tipo !== "poli" || e.pts.length < 4) continue;
      const cerr = e.cerrada || Pl.dist(e.pts[0], e.pts[e.pts.length - 1]) < 1e-9; if (!cerr) continue;
      const r = rectangulo(e.pts), a = Math.min(r.a, r.b), b = Math.max(r.a, r.b);
      if (a > 0 && b / a < 2.5) lados.push(a, b);
    }
    if (!lados.length) return { u, f: 1 };
    lados.sort((x, y) => x - y);
    const s = lados[Math.floor(lados.length / 2)];
    let mejor = { f: 1, p: Infinity };
    for (const f of ESCALAS) {
      const m = s * u * f, cm = m * 100;
      if (m < 0.15 || m > 1.5) continue;
      const pen = Math.abs(Math.log(m / 0.3)) + (Math.abs(cm / 5 - Math.round(cm / 5)) < 0.02 ? 0 : 0.5) + (f === 1 ? 0 : 0.05);
      if (pen < mejor.p) mejor = { f, p: pen };
    }
    return { u, f: mejor.f };
  }

  // Rectángulo (posiblemente girado) de una polilínea cerrada: centro, lados y ángulo
  function rectangulo(pts) {
    let q = pts.slice();
    if (q.length > 4 && Pl.dist(q[0], q[q.length - 1]) < 1e-6) q.pop();
    if (q.length !== 4) {
      const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
      return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, a: Math.max(...xs) - Math.min(...xs), b: Math.max(...ys) - Math.min(...ys), ang: 0, aprox: true };
    }
    const a = Pl.dist(q[0], q[1]), b = Pl.dist(q[1], q[2]);
    const ang = Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI;
    return { cx: q.reduce((s, p) => s + p[0], 0) / 4, cy: q.reduce((s, p) => s + p[1], 0) / 4, a, b, ang, aprox: false };
  }

  /* roles = {capa: "columnas"|"placas"|"ejes"|"vigas"|"ignorar"}; op = {escala, viga: [bw, h], vigasPorEjes, losas} */
  function importar(d, roles, op) {
    const k = op.escala, p = Pl.vacio(), avisos = [];
    const E = d.ent.filter(e => roles[e.capa] && roles[e.capa] !== "ignorar").map(e => Object.assign({}, e, { pts: e.pts.map(([x, y]) => [x * k, y * k]), r: e.r ? e.r * k : 0 }));
    let aprox = 0;
    for (const e of E) {
      const rol = roles[e.capa];
      if (rol === "columnas") {
        if (e.tipo === "circulo") { const s = Math.sqrt(Math.PI) * e.r; p.columnas.push({ id: Pl.nuevoId("c"), x: e.pts[0][0], y: e.pts[0][1], b: +s.toFixed(3), h: +s.toFixed(3), ang: 0 }); aprox++; continue; }
        if (e.tipo !== "poli" || e.pts.length < 3) continue;
        const r = rectangulo(e.pts); if (r.aprox) aprox++;
        if (Math.max(r.a, r.b) > 4 * Math.min(r.a, r.b) && Math.max(r.a, r.b) > 1.0) { // tan alargada que es una placa
          const ux = Math.cos(r.ang * Math.PI / 180), uy = Math.sin(r.ang * Math.PI / 180);
          const L = Math.max(r.a, r.b), t = Math.min(r.a, r.b), dx = r.a >= r.b ? ux : -uy, dy = r.a >= r.b ? uy : ux;
          p.placas.push({ id: Pl.nuevoId("p"), a: [r.cx - dx * L / 2, r.cy - dy * L / 2], b: [r.cx + dx * L / 2, r.cy + dy * L / 2], t: +t.toFixed(3) });
          continue;
        }
        // b va en la dirección del ángulo de la columna (X local)
        let ang = ((r.ang % 180) + 180) % 180, b = r.a, h = r.b;
        if (ang >= 45 && ang < 135) { ang -= 90; [b, h] = [h, b]; } else if (ang >= 135) ang -= 180;
        if (Math.abs(ang) < 0.5) ang = 0;
        p.columnas.push({ id: Pl.nuevoId("c"), x: r.cx, y: r.cy, b: +b.toFixed(3), h: +h.toFixed(3), ang: +ang.toFixed(2) });
      } else if (rol === "placas") {
        if (e.tipo === "poli" && e.cerrada || (e.tipo === "poli" && e.pts.length >= 4 && Pl.dist(e.pts[0], e.pts[e.pts.length - 1]) < 1e-6)) {
          const r = rectangulo(e.pts); if (r.aprox) aprox++;
          const ux = Math.cos(r.ang * Math.PI / 180), uy = Math.sin(r.ang * Math.PI / 180);
          const largo = Math.max(r.a, r.b), t = Math.min(r.a, r.b), dx = r.a >= r.b ? ux : -uy, dy = r.a >= r.b ? uy : ux;
          p.placas.push({ id: Pl.nuevoId("p"), a: [r.cx - dx * largo / 2, r.cy - dy * largo / 2], b: [r.cx + dx * largo / 2, r.cy + dy * largo / 2], t: +t.toFixed(3) });
        } else for (let i = 0; i + 1 < e.pts.length; i++) p.placas.push({ id: Pl.nuevoId("p"), a: e.pts[i], b: e.pts[i + 1], t: op.placaT || 0.25 });
      } else if (rol === "ejes" || rol === "vigas") {
        const segs = [];
        for (let i = 0; i + 1 < e.pts.length; i++) segs.push([e.pts[i], e.pts[i + 1]]);
        if (e.tipo === "poli" && e.cerrada && e.pts.length > 2) segs.push([e.pts[e.pts.length - 1], e.pts[0]]);
        for (const [a, b] of segs) {
          if (Pl.dist(a, b) < 0.05) continue;
          if (rol === "ejes") p.ejes.push({ id: Pl.nuevoId("e"), nombre: "", a, b });
          else p.vigas.push({ id: Pl.nuevoId("v"), a, b, bw: op.viga[0], h: op.viga[1] });
        }
      }
    }
    if (aprox) avisos.push(`${aprox} columna(s) no rectangulares o circulares se tomaron con un rectángulo equivalente.`);
    // vigas por ejes: une columnas y extremos de placas consecutivos que están sobre cada eje
    if (op.vigasPorEjes && p.ejes.length) {
      const apoyos = p.columnas.map(c => ({ q: [c.x, c.y], tol: Math.max(c.b, c.h) / 2 + 0.05 }));
      p.placas.forEach(w => { apoyos.push({ q: w.a, tol: 0.15 }, { q: w.b, tol: 0.15 }); });
      const hechas = new Set();
      for (const e of p.ejes) {
        const sobre = apoyos.map(o => ({ o, r: Pl.proyeccion(o.q, e.a, e.b) })).filter(x => x.r.d <= x.o.tol && x.r.t > -0.05 && x.r.t < 1.05).sort((a, b) => a.r.t - b.r.t);
        for (let i = 0; i + 1 < sobre.length; i++) {
          const a = sobre[i].o.q, b = sobre[i + 1].o.q;
          if (Pl.dist(a, b) < 0.3) continue;
          // no duplicar una viga sobre una placa
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (p.placas.some(w => { const r = Pl.proyeccion(mid, w.a, w.b); return r.d < 0.05 && r.t > 0 && r.t < 1; })) continue;
          const kk = [a, b].map(q => q.map(v => v.toFixed(2)).join(",")).sort().join("|");
          if (hechas.has(kk)) continue; hechas.add(kk);
          p.vigas.push({ id: Pl.nuevoId("v"), a: a.slice(), b: b.slice(), bw: op.viga[0], h: op.viga[1] });
        }
      }
    }
    // llevar el dibujo cerca del origen
    const xs0 = p.columnas.map(c => c.x).concat(p.placas.flatMap(w => [w.a[0], w.b[0]])), ys0 = p.columnas.map(c => c.y).concat(p.placas.flatMap(w => [w.a[1], w.b[1]]));
    const ex = Pl.extension(p), ox = xs0.length ? Math.min(...xs0) : ex.x0, oy = ys0.length ? Math.min(...ys0) : ex.y0;
    const mover = (q) => [+(q[0] - ox).toFixed(4), +(q[1] - oy).toFixed(4)];
    p.columnas.forEach(c => { [c.x, c.y] = mover([c.x, c.y]); });
    [...p.vigas, ...p.placas, ...p.ejes].forEach(s => { s.a = mover(s.a); s.b = mover(s.b); });
    if (op.losas) { const n = Pl.losasAutomaticas(p); if (!n) avisos.push("No se encontraron paños cerrados para las losas: revisa que las vigas formen recuadros."); }
    return { plano: p, avisos };
  }

  // DXF de ejemplo (para probar sin AutoCAD): ejes, columnas y placas en capas separadas, en cm
  function ejemplo() {
    const L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "5", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
    const linea = (capa, x1, y1, x2, y2) => L.push("0", "LINE", "8", capa, "10", x1, "20", y1, "11", x2, "21", y2);
    const rect = (capa, cx, cy, a, b) => L.push("0", "LWPOLYLINE", "8", capa, "90", "4", "70", "1",
      "10", cx - a / 2, "20", cy - b / 2, "10", cx + a / 2, "20", cy - b / 2, "10", cx + a / 2, "20", cy + b / 2, "10", cx - a / 2, "20", cy + b / 2);
    const xs = [0, 600, 1100, 1700], ys = [0, 500, 1000];
    xs.forEach(x => linea("EJES", x, -150, x, 1150)); ys.forEach(y => linea("EJES", -150, y, 1850, y));
    for (const x of xs) for (const y of ys) if (!((x === 600 || x === 1100) && y === 0)) rect("COLUMNAS", x, y, 50, 50);
    rect("PLACAS", 850, 0, 550, 25); // placa en el eje 1 entre B y C
    rect("PLACAS", 0, 500, 25, 300); rect("PLACAS", 1700, 500, 25, 300);
    L.push("0", "ENDSEC", "0", "EOF");
    return L.join("\n");
  }

  root.DXF = { leer, importar, rolSugerido, escalaUnidades, escalaProbable, escalaSugerida, ESCALAS, ejemplo };
  if (typeof module !== "undefined") module.exports = root.DXF;
})(typeof window !== "undefined" ? window : globalThis);
