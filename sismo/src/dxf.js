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
      else if (e.tipo === "TEXT" || e.tipo === "MTEXT") {
        const txt = (str(d, 1) + d.filter(p => p[0] === 3).map(p => p[1]).join("")).trim();
        if (txt) lista.push({ tipo: "texto", capa, pts: [[num(d, 10), num(d, 20)]], txt });
      }
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
        out.push({ tipo: o.tipo, capa: o.capa === "0" ? e.capa : o.capa, pts: o.pts.map(T), cerrada: o.cerrada, r: o.r ? o.r * Math.abs(e.sx) : undefined, txt: o.txt });
      }
      return out;
    };
    const todas = [];
    for (const e of ent) { if (e.tipo === "insert") todas.push(...expandir(e, 0)); else todas.push(e); }
    const capas = {}, textos = [];
    const graf = todas.filter(e => { if (e.tipo !== "texto") return true; textos.push(e); return false; });
    graf.forEach(e => { capas[e.capa] = (capas[e.capa] || 0) + 1; });
    return { unidades, capas, ent: graf, textos };
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

  /* Las láminas suelen traer, además de la planta, cortes y detalles a otra escala. Si hay ejes, solo se
     toman columnas y placas dentro del recuadro de los ejes y pegadas a alguno de ellos. Devuelve una
     función que dice si una entidad (en unidades del dibujo) pertenece a la planta. */
  function filtroPlanta(d, roles) {
    const ejes = [];
    for (const e of d.ent) if (roles[e.capa] === "ejes" && e.tipo !== "circulo") for (let i = 0; i + 1 < e.pts.length; i++) { const g = [e.pts[i], e.pts[i + 1]]; g.ent = e; ejes.push(g); }
    let f_caja = null;
    if (!ejes.length) { const f = () => true; f.eje = () => true; f.caja = null; return f; }
    // la malla de la planta: ejes que se cruzan con otro (un eje suelto suele ser de un detalle)
    const malla = ejes.filter((e, i) => ejes.some((f, j) => j !== i && Pl.interseccion(e[0], e[1], f[0], f[1])));
    if (malla.length >= 2) ejes.splice(0, ejes.length, ...malla);
    const xs = ejes.flatMap(([a, b]) => [a[0], b[0]]), ys = ejes.flatMap(([a, b]) => [a[1], b[1]]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const usados = new Set(ejes.map(g => g.ent));
    f_caja = { x0, x1, y0, y1 };
    const f = (e) => {
      if (e.tipo === "circulo") { const [cx, cy] = e.pts[0]; return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && ejes.some(([a, b]) => Pl.proyeccion([cx, cy], a, b).d <= 1.5 * e.r); }
      const pxs = e.pts.map(p => p[0]), pys = e.pts.map(p => p[1]);
      const ax0 = Math.min(...pxs), ax1 = Math.max(...pxs), ay0 = Math.min(...pys), ay1 = Math.max(...pys);
      const c = [(ax0 + ax1) / 2, (ay0 + ay1) / 2], tam = Math.max(ax1 - ax0, ay1 - ay0);
      if (c[0] < x0 || c[0] > x1 || c[1] < y0 || c[1] > y1) return false;
      return ejes.some(([a, b]) => { const r = Pl.proyeccion(c, a, b); return r.d <= Math.max(tam / 2, Math.min(ax1 - ax0, ay1 - ay0)) && r.t > -0.02 && r.t < 1.02; });
    };
    f.eje = (e) => e.tipo === "circulo" || usados.has(e);
    f.caja = f_caja;
    return f;
  }

  // Texto de AutoCAD sin códigos de formato (MTEXT: \P, {\fArial|b1;...}, %%c)
  const limpiar = (t) => String(t).replace(/\\P/g, " ").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/\s+/g, " ").trim();
  const RX_ESC = /ESC(?:ALA)?\.?\s*:?\s*1\s*[:\/]\s*(\d{1,4})\b/i;
  const centroCaja = (c) => [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];

  /* Escala sugerida. Muchos planos están dibujados "en la lámina" (p. ej. en mm a escala 1:50): se mira el
     tamaño de las columnas (rectángulos cerrados en capas de columnas) y se elige la escala 1:f que da
     columnas de tamaño usual y en medidas redondas (múltiplos de 5 cm). Devuelve {u: m por unidad, f}. */
  const ESCALAS = [1, 20, 25, 50, 75, 100, 125, 200];
  function escalaSugerida(d, roles) {
    const u = escalaUnidades(d.unidades) || escalaProbable(d);
    const lados = [], enPlanta = filtroPlanta(d, roles);
    for (const e of d.ent) {
      if (roles[e.capa] !== "columnas" || e.tipo !== "poli" || e.pts.length < 4 || !enPlanta(e)) continue;
      const cerr = e.cerrada || Pl.dist(e.pts[0], e.pts[e.pts.length - 1]) < 1e-9; if (!cerr) continue;
      const r = rectangulo(e.pts), a = Math.min(r.a, r.b), b = Math.max(r.a, r.b);
      if (a > 0 && b / a < 2.5) lados.push(a, b);
    }
    lados.sort((x, y) => x - y);
    const s = lados.length ? lados[Math.floor(lados.length / 2)] : 0;
    // 1) escala escrita en la lámina ("ESC. 1:50"), la más cercana a la planta, si da columnas razonables
    const conEsc = (d.textos || []).map(t => ({ t, m: limpiar(t.txt).match(RX_ESC) })).filter(o => o.m);
    if (conEsc.length) {
      const c = enPlanta.caja ? centroCaja(enPlanta.caja) : null;
      if (c) conEsc.sort((a, b) => Pl.dist(a.t.pts[0], c) - Pl.dist(b.t.pts[0], c));
      const f = +conEsc[0].m[1], m = s * u * f;
      if (f > 0 && (!s || (m >= 0.1 && m <= 2))) return { u, f, texto: limpiar(conEsc[0].t.txt) };
    }
    if (!lados.length) return { u, f: 1 };
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
    const k = op.escala, p = Pl.vacio(), avisos = [], enPlanta = filtroPlanta(d, roles);
    let fuera = 0;
    const E = d.ent.filter(e => roles[e.capa] && roles[e.capa] !== "ignorar")
      .filter(e => { if (roles[e.capa] === "ejes") return enPlanta.eje(e); if (roles[e.capa] !== "columnas" && roles[e.capa] !== "placas") return true; if (enPlanta(e)) return true; if (e.tipo === "circulo" || e.cerrada || e.pts.length > 2) fuera++; return false; }).map(e => Object.assign({}, e, { pts: e.pts.map(([x, y]) => [x * k, y * k]), r: e.r ? e.r * k : 0 }));
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
    if (fuera) avisos.push(`Se dejaron de lado ${fuera} figura(s) fuera de los ejes (cortes o detalles de la lámina).`);
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
    // textos del plano: nombres de ejes, secciones de vigas ("V-101 (0.25x0.30)") y vacíos
    const leidos = { ejes: 0, vigas: 0, vacios: 0 };
    let TX = [];
    if (op.textos !== false && d.textos && d.textos.length) {
      const cj = enPlanta.caja, mg = cj ? 0.1 * Math.max(cj.x1 - cj.x0, cj.y1 - cj.y0) : 0;
      TX = d.textos.filter(t => !cj || (t.pts[0][0] >= cj.x0 - mg && t.pts[0][0] <= cj.x1 + mg && t.pts[0][1] >= cj.y0 - mg && t.pts[0][1] <= cj.y1 + mg))
        .map(t => ({ txt: limpiar(t.txt), p: [t.pts[0][0] * k, t.pts[0][1] * k] }));
      // nombres de ejes: texto corto dentro de una burbuja (círculo de la capa de ejes) en la punta de un eje
      const burbujas = E.filter(e => e.tipo === "circulo" && roles[e.capa] === "ejes");
      for (const t of TX) {
        if (!/^[A-Z0-9]{1,3}'?$/i.test(t.txt)) continue;
        const b = burbujas.find(c => Pl.dist(c.pts[0], t.p) <= 1.2 * c.r); if (!b) continue;
        let mejor = null, dm = 2.5 * b.r;
        for (const e of p.ejes) for (const q of [e.a, e.b]) { const dd = Pl.dist(q, b.pts[0]); if (dd <= dm) { dm = dd; mejor = e; } }
        if (mejor && !mejor.nombre) { mejor.nombre = t.txt.toUpperCase(); leidos.ejes++; }
      }
      // secciones de vigas: la etiqueta con medidas define el tipo; cada etiqueta se aplica a la viga más cercana
      const RX_V = /^(V[\w.-]*)\s*(?:\(?\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*\)?)?/;
      const tipos = {}, etiquetas = [];
      for (const t of TX) {
        const m = t.txt.match(RX_V); if (!m) continue;
        if (m[2]) { let b = parseFloat(m[2].replace(",", ".")), h = parseFloat(m[3].replace(",", ".")); if (b > 5) { b /= 100; h /= 100; } if (b > 0.08 && b < 2 && h > 0.08 && h < 3) tipos[m[1]] = [b, h]; }
        etiquetas.push({ nombre: m[1], p: t.p });
      }
      const hechas = new Set();
      for (const et of etiquetas) {
        const sec = tipos[et.nombre]; if (!sec) continue;
        let mejor = null, dm = 0.6;
        for (const v of p.vigas) { const r = Pl.proyeccion(et.p, v.a, v.b); if (r.t > -0.15 && r.t < 1.15 && r.d < dm) { dm = r.d; mejor = v; } }
        if (mejor) { mejor.bw = sec[0]; mejor.h = sec[1]; mejor.nombre = et.nombre; if (!hechas.has(mejor)) { hechas.add(mejor); leidos.vigas++; } }
      }
      // un tramo sin etiqueta toma la sección del tramo vecino en línea (misma viga continua)
      for (let vuelta = 0, cambio = hechas.size > 0; cambio && vuelta < 10; vuelta++) {
        cambio = false;
        for (const v of p.vigas) {
          if (v.nombre) continue;
          const u = [v.b[0] - v.a[0], v.b[1] - v.a[1]], L = Math.hypot(...u);
          const vec = p.vigas.find(w => w.nombre && [w.a, w.b].some(q => Pl.dist(q, v.a) < 0.05 || Pl.dist(q, v.b) < 0.05) &&
            Math.abs((u[0] * (w.b[1] - w.a[1]) - u[1] * (w.b[0] - w.a[0])) / (L * Pl.dist(w.a, w.b))) < 0.02);
          if (vec) { v.bw = vec.bw; v.h = vec.h; v.nombre = vec.nombre; leidos.vigas++; cambio = true; }
        }
      }
    }
    // llevar el dibujo cerca del origen
    const xs0 = p.columnas.map(c => c.x).concat(p.placas.flatMap(w => [w.a[0], w.b[0]])), ys0 = p.columnas.map(c => c.y).concat(p.placas.flatMap(w => [w.a[1], w.b[1]]));
    const ex = Pl.extension(p), ox = xs0.length ? Math.min(...xs0) : ex.x0, oy = ys0.length ? Math.min(...ys0) : ex.y0;
    const mover = (q) => [+(q[0] - ox).toFixed(4), +(q[1] - oy).toFixed(4)];
    p.columnas.forEach(c => { [c.x, c.y] = mover([c.x, c.y]); });
    [...p.vigas, ...p.placas, ...p.ejes].forEach(s => { s.a = mover(s.a); s.b = mover(s.b); });
    TX.forEach(t => { t.p = mover(t.p); });
    if (op.losas) {
      const n = Pl.losasAutomaticas(p);
      if (!n) avisos.push("No se encontraron paños cerrados para las losas: revisa que las vigas formen recuadros.");
      // un paño con el texto VACÍO, DUCTO o TRAGALUZ se queda sin losa
      const vac = TX.filter(t => /VAC[IÍ]O|DUCTO|TRAGALUZ|HUECO/i.test(t.txt));
      if (vac.length) { const antes = p.losas.length; p.losas = p.losas.filter(l => !vac.some(t => Pl.dentro(t.p[0], t.p[1], l.pts))); leidos.vacios = antes - p.losas.length; }
    }
    const partes = [];
    if (leidos.ejes) partes.push(`nombres de ${leidos.ejes} ejes`);
    if (leidos.vigas) partes.push(`secciones de ${leidos.vigas} vigas (de sus etiquetas)`);
    if (leidos.vacios) partes.push(`${leidos.vacios} vacío(s) sin losa`);
    if (partes.length) avisos.unshift("Leído de los textos del plano: " + partes.join(", ") + ".");
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

  root.DXF = { leer, importar, limpiar, rolSugerido, escalaUnidades, escalaProbable, escalaSugerida, ESCALAS, ejemplo };
  if (typeof module !== "undefined") module.exports = root.DXF;
})(typeof window !== "undefined" ? window : globalThis);
