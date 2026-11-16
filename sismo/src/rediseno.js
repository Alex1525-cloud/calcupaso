/* Rediseño sugerido: después del análisis, busca secciones que cumplan la deriva (aumentando columnas y vigas
   en la dirección que falla, re-analizando cada vez) o que sobren (reduciendo columnas mientras cumpla), y
   revisa el predimensionamiento por cargas de gravedad (peralte de vigas, espesor de losa, área de columnas).
   Las reglas de predimensionamiento son prácticas usuales en Perú, no artículos de norma, y así se dicen. */
(function (root) {
  "use strict";
  const Pl = root.Plano;
  const r05 = (x) => Math.ceil(x / 0.05 - 1e-9) * 0.05;
  const red = (x) => +x.toFixed(2);
  const clon = (o) => JSON.parse(JSON.stringify(o));
  const MIN_COL = 0.25, MAX_COL = 1.20, MAX_VIGA = 1.00, MIN_VIGA_B = 0.25;

  // lados de la columna en X y en Y globales (según su giro)
  function ladosXY(c) {
    if (c.forma === "circ") return { x: "b", y: "b" };
    const a = ((c.ang || 0) % 180 + 180) % 180, bEnX = a < 45 || a >= 135;
    return bEnX ? { x: "b", y: "h" } : { x: "h", y: "b" };
  }
  function crecer(c, dirs, paso) {
    const L = ladosXY(c);
    if (c.forma === "circ") { c.b = c.h = red(Math.min(MAX_COL, Math.max(MIN_COL, c.b + paso))); return; }
    for (const d of dirs) c[L[d]] = red(Math.min(MAX_COL, Math.max(MIN_COL, c[L[d]] + paso)));
    if ((c.forma === "L" || c.forma === "T") && c.t) c.t = red(Math.min(c.t, c.b, c.h));
  }
  const dirViga = (v) => Math.abs(v.b[0] - v.a[0]) >= Math.abs(v.b[1] - v.a[1]) ? "x" : "y";

  // resumen de cambios: "0.40 × 0.40 → 0.50 × 0.55 (12 columnas)"
  function resumen(antes, despues) {
    const out = [];
    const etqC = (c) => (c.forma === "circ" ? `Ø ${c.b.toFixed(2)}` : `${c.b.toFixed(2)} × ${c.h.toFixed(2)}`) + (c.forma === "L" || c.forma === "T" ? ` (${c.forma})` : "");
    const grupos = {};
    antes.columnas.forEach((c, i) => { const d = despues.columnas[i]; const a = etqC(c), b = etqC(d); if (a !== b) { const k = a + "→" + b; grupos[k] = (grupos[k] || 0) + 1; } });
    for (const k in grupos) { const [a, b] = k.split("→"); out.push({ elem: "Columnas", antes: a, despues: b, n: grupos[k] }); }
    const gv = {};
    antes.vigas.forEach((v, i) => { const d = despues.vigas[i]; if (v.bw !== d.bw || v.h !== d.h) { const k = `${dirViga(v).toUpperCase()}|${v.bw.toFixed(2)} × ${v.h.toFixed(2)}|${d.bw.toFixed(2)} × ${d.h.toFixed(2)}`; gv[k] = (gv[k] || 0) + 1; } });
    for (const k in gv) { const [dd, a, b] = k.split("|"); out.push({ elem: `Vigas en ${dd}`, antes: a, despues: b, n: gv[k] }); }
    return out;
  }

  /* Rigidez: si la deriva no cumple, crece columnas (y vigas paralelas) 5 cm en la dirección que falla hasta cumplir.
     correr(plano) -> resultado del análisis. Devuelve { plano, r, ok, iter, cambios } o null si ya cumple. */
  function porDeriva(plano0, correr, lim, r0) {
    if (r0.derivaMax.X <= lim && r0.derivaMax.Y <= lim) return null;
    let p = clon(plano0), r = r0, it = 0;
    for (; it < 14; it++) {
      const fx = r.derivaMax.X > lim, fy = r.derivaMax.Y > lim;
      if (!fx && !fy) break;
      const dirs = [fx && "x", fy && "y"].filter(Boolean);
      const tope = p.columnas.every(c => dirs.every(d => c[ladosXY(c)[d]] >= MAX_COL));
      if (tope) break;
      p.columnas.forEach(c => crecer(c, dirs, 0.05));
      if (it % 2 === 1) p.vigas.forEach(v => { if (dirs.includes(dirViga(v))) v.h = red(Math.min(MAX_VIGA, r05(v.h + 0.05))); });
      r = correr(p);
    }
    const ok = r.derivaMax.X <= lim && r.derivaMax.Y <= lim;
    return { plano: p, r, ok, iter: it, cambios: resumen(plano0, p) };
  }

  /* Economía: si la deriva usa menos del 50% del límite, reduce columnas 5 cm mientras siga bajo el 85%. */
  function porEconomia(plano0, correr, lim, r0) {
    if (Math.max(r0.derivaMax.X, r0.derivaMax.Y) > 0.5 * lim) return null;
    let p = clon(plano0), mejor = null;
    for (let it = 0; it < 10; it++) {
      const q = clon(p); let cambio = false;
      q.columnas.forEach(c => { const L = ladosXY(c); for (const d of ["x", "y"]) if (c[L[d]] - 0.05 >= MIN_COL - 1e-9) { if (c.forma === "circ") { c.b = c.h = red(c.b - 0.05); cambio = true; break; } c[L[d]] = red(c[L[d]] - 0.05); cambio = true; } });
      if (!cambio) break;
      const r = correr(q);
      if (Math.max(r.derivaMax.X, r.derivaMax.Y) > 0.85 * lim || r.restricciones.length) break;
      p = q; mejor = { plano: p, r, ok: true, cambios: resumen(plano0, p) };
    }
    return mejor && mejor.cambios.length ? mejor : null;
  }

  /* Gravedad (prácticas de predimensionamiento): vigas h ≈ L/12 (mínimo L/14), b ≥ 0,25; losas según su tipo;
     columnas con área ≥ P/(0,45 f'c) (interiores) o P/(0,35 f'c) (perímetro), P = carga de servicio × área tributaria × pisos. */
  function gravedad(st) {
    const p = st.plano, out = [], tl = st.losa || { tipo: "aligerada1", h: 0.20 };
    // vigas
    const vigasCortas = [];
    for (const v of p.vigas) {
      const L = Pl.dist(v.a, v.b), hmin = L / 14, hs = r05(L / 12);
      if (v.h + 1e-9 < hmin || v.bw < MIN_VIGA_B - 1e-9) vigasCortas.push({ v, L, hs });
    }
    if (vigasCortas.length) {
      const peor = vigasCortas.sort((a, b) => b.L - a.L)[0];
      out.push({ tipo: "warn", titulo: `Vigas con poco peralte (${vigasCortas.length})`,
        texto: `La luz mayor es ${peor.L.toFixed(2)} m con viga ${peor.v.bw.toFixed(2)} × ${peor.v.h.toFixed(2)}. Práctica usual: h ≈ L/10 a L/12 → ${peor.hs.toFixed(2)} m, y b ≥ 0,25 m (E.060, art. 21.5 para vigas sismorresistentes).`,
        aplicar: (q) => { for (const { v } of vigasCortas) { const o = q.vigas.find(x => x.id === v.id); if (o) { const L = Pl.dist(o.a, o.b); o.h = Math.max(o.h, r05(L / 12)); o.bw = Math.max(o.bw, MIN_VIGA_B); } } } });
    }
    // losas
    const malas = [];
    for (const l of p.losas) {
      const tipo = l.tipo || tl.tipo; if (tipo === "vacio") continue;
      const T = Pl.TIPOS_LOSA[tipo], h = l.h || (l.tipo && l.tipo !== tl.tipo ? T.h[1] || T.h[0] : tl.h);
      const xs = l.pts.map(q => q[0]), ys = l.pts.map(q => q[1]);
      const a = Math.max(...xs) - Math.min(...xs), b = Math.max(...ys) - Math.min(...ys), Lmin = Math.min(a, b), Lmax = Math.max(a, b);
      let hmin = tipo === "aligerada2" ? Math.max(Lmin / 40, 2 * (a + b) / 180) : tipo === "maciza" ? (Lmax / Lmin > 2 ? Lmin / 30 : Lmin / 40) : Lmin / T.div;
      if (h + 1e-9 < hmin) {
        const sig = T.h.find(x => x + 1e-9 >= hmin);
        const alt = tipo === "aligerada1" && Lmax / Lmin <= 2 && Pl.TIPOS_LOSA.aligerada2 && h + 1e-9 >= Math.max(Lmin / 40, 2 * (a + b) / 180) ? " o cambia ese paño a aligerada en dos direcciones con el mismo espesor" : "";
        malas.push({ l, tipo, h, hmin, sig, Lmin, alt });
      }
    }
    if (malas.length) {
      const m = malas.sort((x, y) => y.Lmin - x.Lmin)[0];
      out.push({ tipo: "warn", titulo: `Losa delgada para su luz (${malas.length} paño${malas.length > 1 ? "s" : ""})`,
        texto: `Paño de ${m.Lmin.toFixed(2)} m de luz menor con ${Pl.TIPOS_LOSA[m.tipo].nombre.toLowerCase()} h = ${m.h.toFixed(2)}: se recomienda h ≥ ${m.hmin.toFixed(2)} m (${Pl.TIPOS_LOSA[m.tipo].nota})` + (m.sig ? `. Usa h = ${m.sig.toFixed(2)}` : `. Ese tipo no llega: usa losa maciza o nervada, o agrega una viga para partir el paño`) + `${m.alt}.`,
        aplicar: (q) => { for (const { l, sig } of malas) { const o = q.losas.find(x => x.id === l.id); if (o && sig) o.h = sig; } } });
    }
    // columnas: área por carga axial de servicio
    const wServ = (Pl.pesoLosa(tl.tipo, tl.h) + st.cargas.cm + st.cargas.cv) / 1000; // t/m² (aprox., piso típico)
    const trib = new Map(p.columnas.map(c => [c.id, { A: 0, n: 0 }]));
    for (const l of p.losas) {
      const A = Math.abs(Pl.areaPoly(l.pts)), cs = p.columnas.filter(c => l.pts.some(q => Pl.dist(q, [c.x, c.y]) < 0.02));
      cs.forEach(c => { const t = trib.get(c.id); t.A += A / Math.max(cs.length, 1); t.n++; });
    }
    const chicas = [];
    for (const c of p.columnas) {
      const t = trib.get(c.id); if (!t.A) continue;
      const P = wServ * t.A * st.pisos.n * 1000, k = t.n >= 4 ? 0.45 : 0.35; // kg
      const Areq = P / (k * st.fc) / 1e4; // m²
      const A = c.forma === "circ" ? Math.PI * c.b * c.b / 4 : c.forma === "L" || c.forma === "T" ? (Pl.propsColumna(c) || { A: c.b * c.h }).A : c.b * c.h;
      if (A + 1e-9 < Areq) chicas.push({ c, Areq, lado: Math.max(MIN_COL, r05(Math.sqrt(Areq))) });
    }
    if (chicas.length) {
      const m = chicas.sort((a, b) => b.Areq - a.Areq)[0];
      out.push({ tipo: "warn", titulo: `Columnas chicas por carga axial (${chicas.length})`,
        texto: `La más cargada necesita ≈ ${(m.Areq * 1e4).toFixed(0)} cm² (P de servicio / ${m.c && trib.get(m.c.id).n >= 4 ? "0,45" : "0,35"}·f'c, práctica usual) → ${m.lado.toFixed(2)} × ${m.lado.toFixed(2)} m como mínimo.`,
        aplicar: (q) => { for (const { c, lado } of chicas) { const o = q.columnas.find(x => x.id === c.id); if (o) { if (o.forma === "circ") o.b = o.h = Math.max(o.b, r05(lado * 1.13)); else { o.b = Math.max(o.b, lado); o.h = Math.max(o.h, lado); } } } } });
    }
    return out;
  }

  root.Rediseno = { porDeriva, porEconomia, gravedad, resumen, ladosXY };
})(window);
