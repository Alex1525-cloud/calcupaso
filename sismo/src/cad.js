/* Editor de planta tipo CAD sobre SVG: zoom, encuadre, imán, orto, línea de comandos y deshacer. */
(function (root) {
  "use strict";
  const Pl = root.Plano;
  const NS = "http://www.w3.org/2000/svg";
  const C = {};
  let svg, capaDib, capaTmp, cmd, estadoEl, cb;
  let vista = { x: 7.5, y: 7.5, s: 30 }; // centro (m) y escala (px/m)
  let herr = "sel", inicio = null, cursor = [0, 0], snap = null, orto = false, iman = true;
  let sel = new Set(), deshacer = [], rehacer = [];
  const punteros = new Map(); let pinch = null, arrastre = null;

  const plano = () => cb.plano();
  const W = () => svg.clientWidth || 600, H = () => svg.clientHeight || 400;
  const aPx = ([x, y]) => [W() / 2 + (x - vista.x) * vista.s, H() / 2 - (y - vista.y) * vista.s];
  const aM = (px, py) => [vista.x + (px - W() / 2) / vista.s, vista.y - (py - H() / 2) / vista.s];
  const el = (tag, at, padre) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); (padre || capaDib).appendChild(e); return e; };
  const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2);

  C.init = function (svgEl, cmdEl, estado, callbacks) {
    svg = svgEl; cmd = cmdEl; estadoEl = estado; cb = callbacks;
    capaDib = document.createElementNS(NS, "g"); capaTmp = document.createElementNS(NS, "g");
    svg.appendChild(capaDib); svg.appendChild(capaTmp);
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const [mx, my] = rel(e); zoomEn(mx, my, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    svg.addEventListener("pointerdown", abajo); svg.addEventListener("pointermove", mover); svg.addEventListener("pointerup", arriba); svg.addEventListener("pointercancel", arriba);
    svg.addEventListener("contextmenu", (e) => { e.preventDefault(); cancelar(); });
    cmd.addEventListener("keydown", (e) => { if (e.key === "Enter") { comando(cmd.value.trim()); cmd.value = ""; e.preventDefault(); } else if (e.key === "Escape") { cancelar(); cmd.value = ""; } });
    document.addEventListener("keydown", teclas);
    new ResizeObserver(() => C.dibujar()).observe(svg);
  };
  const rel = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function zoomEn(px, py, f) {
    const a = aM(px, py); vista.s = Math.min(800, Math.max(2, vista.s * f));
    const b = aM(px, py); vista.x += a[0] - b[0]; vista.y += a[1] - b[1]; C.dibujar();
  }
  C.zoomExtension = function () {
    const e = Pl.extension(plano()), m = 2;
    vista.x = (e.x0 + e.x1) / 2; vista.y = (e.y0 + e.y1) / 2;
    vista.s = Math.min((W() - 40) / (e.x1 - e.x0 + 2 * m), (H() - 40) / (e.y1 - e.y0 + 2 * m)) || 30;
    C.dibujar();
  };

  // ------------------------------------------------------------ dibujo
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  C.dibujar = function () {
    if (!svg) return;
    capaDib.innerHTML = "";
    const p = plano();
    // grilla de fondo
    const paso = [0.5, 1, 5, 10, 50].find(s => s * vista.s >= 18) || 100;
    const [x0, y1] = aM(0, 0), [x1, y0] = aM(W(), H());
    for (let x = Math.ceil(x0 / paso) * paso; x <= x1; x += paso) { const [px] = aPx([x, 0]); el("line", { x1: px, y1: 0, x2: px, y2: H(), class: Math.abs(x % (paso * 5)) < 1e-6 ? "g2" : "g1" }); }
    for (let y = Math.ceil(y0 / paso) * paso; y <= y1; y += paso) { const [, py] = aPx([0, y]); el("line", { x1: 0, y1: py, x2: W(), y2: py, class: Math.abs(y % (paso * 5)) < 1e-6 ? "g2" : "g1" }); }
    // losas
    for (const l of p.losas) el("polygon", { points: l.pts.map(aPx).map(q => q.join(",")).join(" "), class: "losa" + (sel.has(l.id) ? " sel" : ""), "data-id": l.id });
    // ejes
    for (const e of p.ejes) {
      const a = aPx(e.a), b = aPx(e.b);
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "eje" + (sel.has(e.id) ? " sel" : "") });
      if (e.nombre) { el("circle", { cx: a[0], cy: a[1], r: 9, class: "burbuja" }); const t = el("text", { x: a[0], y: a[1] + 4, class: "burbuja-t" }); t.textContent = e.nombre; }
    }
    // vigas
    for (const v of p.vigas) { const a = aPx(v.a), b = aPx(v.b); el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "viga" + (sel.has(v.id) ? " sel" : ""), "stroke-width": Math.max(2, v.bw * vista.s) }); }
    // placas
    for (const w of p.placas) { const a = aPx(w.a), b = aPx(w.b); el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "placa" + (sel.has(w.id) ? " sel" : ""), "stroke-width": Math.max(3, w.t * vista.s) }); }
    // columnas
    for (const c of p.columnas) {
      const [cx, cy] = aPx([c.x, c.y]), bw = Math.max(5, c.b * vista.s), hh = Math.max(5, c.h * vista.s);
      el("rect", { x: cx - bw / 2, y: cy - hh / 2, width: bw, height: hh, class: "columna" + (sel.has(c.id) ? " sel" : ""), transform: `rotate(${-(c.ang || 0)} ${cx} ${cy})` });
    }
    // escala gráfica
    const L = [1, 2, 5, 10, 20, 50].find(s => s * vista.s >= 60) || 100;
    el("line", { x1: 14, y1: H() - 14, x2: 14 + L * vista.s, y2: H() - 14, class: "escala" });
    const t = el("text", { x: 14, y: H() - 20, class: "escala-t" }); t.textContent = L + " m";
    temporal();
  };
  function temporal() {
    capaTmp.innerHTML = "";
    const q = snap ? snap.q : cursor, [px, py] = aPx(q);
    if (inicio && ["viga", "placa", "eje"].includes(herr)) {
      const a = aPx(inicio); el("line", { x1: a[0], y1: a[1], x2: px, y2: py, class: "previa" }, capaTmp);
      const d = Pl.dist(inicio, q), ang = Math.atan2(q[1] - inicio[1], q[0] - inicio[0]) * 180 / Math.PI;
      const t = el("text", { x: (a[0] + px) / 2 + 8, y: (a[1] + py) / 2 - 8, class: "cota" }, capaTmp); t.textContent = `${fmt(d)} m < ${ang.toFixed(0)}°`;
    }
    if (herr === "col") { const pr = cb.props(), bw = Math.max(5, pr.colB * vista.s), hh = Math.max(5, pr.colH * vista.s); el("rect", { x: px - bw / 2, y: py - hh / 2, width: bw, height: hh, class: "previa-col" }, capaTmp); }
    if (snap) {
      if (snap.tipo === "punto") el("rect", { x: px - 6, y: py - 6, width: 12, height: 12, class: "iman" }, capaTmp);
      else if (snap.tipo === "cruce") { el("path", { d: `M${px - 6},${py - 6}L${px + 6},${py + 6}M${px - 6},${py + 6}L${px + 6},${py - 6}`, class: "iman" }, capaTmp); }
      else if (snap.tipo === "sobre") el("circle", { cx: px, cy: py, r: 5, class: "iman" }, capaTmp);
    }
    if (herr !== "sel") { el("line", { x1: px - 14, y1: py, x2: px + 14, y2: py, class: "cruz" }, capaTmp); el("line", { x1: px, y1: py - 14, x2: px, y2: py + 14, class: "cruz" }, capaTmp); }
    estado();
  }
  function estado() {
    const q = snap ? snap.q : cursor;
    const ayuda = {
      sel: "Toca un elemento para verlo o editarlo (Mayús = varios). Supr borra. Arrastra para mover la vista.",
      col: "Toca donde va la columna, o escribe x,y y Enter.",
      viga: inicio ? "Siguiente punto: toca, o escribe @dx,dy · @L<ángulo · una distancia. Esc termina." : "Primer punto de la viga.",
      placa: inicio ? "Siguiente punto de la placa (o @dx,dy, @L<ángulo, distancia). Esc termina." : "Primer punto de la placa.",
      losa: "Toca dentro de un recuadro cerrado por vigas o placas.",
      eje: inicio ? "Segundo punto del eje." : "Primer punto del eje.",
      borrar: "Toca el elemento que quieres borrar.",
    }[herr];
    estadoEl.innerHTML = `<span>X ${fmt(q[0])} · Y ${fmt(q[1])}</span><span>${orto ? "ORTO" : "orto"} (F8) · ${iman ? "IMÁN" : "imán"} (F3)</span><span class="ay">${ayuda}</span>`;
  }

  // ------------------------------------------------------------ imán
  function puntosClave(p) {
    const pts = [];
    p.columnas.forEach(c => pts.push([c.x, c.y]));
    [...p.vigas, ...p.placas, ...p.ejes].forEach(s => pts.push(s.a, s.b));
    p.losas.forEach(l => l.pts.forEach(q => pts.push(q)));
    return pts;
  }
  function iman_(q) {
    const p = plano(), tol = 12 / vista.s;
    let mejor = null;
    if (iman) {
      for (const k of puntosClave(p)) { const d = Pl.dist(k, q); if (d < tol && (!mejor || d < mejor.d)) mejor = { q: k.slice(), d, tipo: "punto" }; }
      if (!mejor) {
        const lin = [...p.ejes, ...p.vigas, ...p.placas];
        for (let i = 0; i < lin.length; i++) for (let j = i + 1; j < lin.length; j++) {
          const x = Pl.interseccion(lin[i].a, lin[i].b, lin[j].a, lin[j].b);
          if (x) { const d = Pl.dist(x, q); if (d < tol && (!mejor || d < mejor.d)) mejor = { q: x, d, tipo: "cruce" }; }
        }
      }
      if (!mejor) for (const s of [...p.ejes, ...p.vigas, ...p.placas]) {
        const r = Pl.proyeccion(q, s.a, s.b);
        if (r.d < tol * 0.6 && r.t >= 0 && r.t <= 1 && (!mejor || r.d < mejor.d)) mejor = { q: [+r.q[0].toFixed(3), +r.q[1].toFixed(3)], d: r.d, tipo: "sobre" };
      }
    }
    let r = mejor ? mejor : { q: iman ? [Math.round(q[0] / 0.05) * 0.05, Math.round(q[1] / 0.05) * 0.05] : q, tipo: "grilla" };
    if (orto && inicio && r.tipo !== "punto" && r.tipo !== "cruce") {
      const dx = r.q[0] - inicio[0], dy = r.q[1] - inicio[1];
      r = { q: Math.abs(dx) >= Math.abs(dy) ? [r.q[0], inicio[1]] : [inicio[0], r.q[1]], tipo: "grilla" };
    }
    return r;
  }

  // ------------------------------------------------------------ eventos
  function abajo(e) {
    svg.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, rel(e));
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: vista.s }; arrastre = null; return; }
    if (e.button === 1 || (herr === "sel" && e.button === 0) || e.pointerType === "touch") arrastre = { inicio: rel(e), vista: Object.assign({}, vista), movio: false, e };
    else if (e.button === 0) clic(rel(e), e);
  }
  function mover(e) {
    const m = rel(e);
    if (punteros.has(e.pointerId)) punteros.set(e.pointerId, m);
    if (pinch && punteros.size === 2) {
      const [a, b] = [...punteros.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const f = (pinch.s * d / pinch.d) / vista.s; zoomEn((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, f); return;
    }
    if (arrastre) {
      const dx = m[0] - arrastre.inicio[0], dy = m[1] - arrastre.inicio[1];
      if (Math.hypot(dx, dy) > 5) arrastre.movio = true;
      if (arrastre.movio) { vista.x = arrastre.vista.x - dx / vista.s; vista.y = arrastre.vista.y + dy / vista.s; C.dibujar(); return; }
    }
    cursor = aM(...m); snap = herr === "sel" || herr === "borrar" ? null : iman_(cursor); temporal();
  }
  function arriba(e) {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pinch = null;
    if (arrastre && !arrastre.movio && e.button !== 1) { const a = arrastre; arrastre = null; cursor = aM(...a.inicio); snap = herr === "sel" || herr === "borrar" ? null : iman_(cursor); clic(a.inicio, a.e); return; }
    arrastre = null;
  }
  function teclas(e) {
    const t = e.target, escribiendo = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") && t !== cmd;
    if (escribiendo || !svg || svg.closest(".hidden") || !svg.offsetParent) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); C.deshacer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); C.rehacer(); return; }
    if (e.key === "Escape") { cancelar(); return; }
    if (e.key === "F8") { e.preventDefault(); orto = !orto; temporal(); return; }
    if (e.key === "F3") { e.preventDefault(); iman = !iman; temporal(); return; }
    if ((e.key === "Delete" || e.key === "Supr") && t !== cmd) { borrarSel(); return; }
    // como en AutoCAD: lo que se escribe va a la línea de comandos
    if (t !== cmd && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { cmd.focus(); }
  }

  // ------------------------------------------------------------ acciones
  function guardarDeshacer() { deshacer.push(JSON.stringify(plano())); if (deshacer.length > 100) deshacer.shift(); rehacer = []; }
  C.deshacer = () => { if (!deshacer.length) return; rehacer.push(JSON.stringify(plano())); cb.reemplazar(JSON.parse(deshacer.pop())); sel.clear(); C.dibujar(); cb.cambio(); };
  C.rehacer = () => { if (!rehacer.length) return; deshacer.push(JSON.stringify(plano())); cb.reemplazar(JSON.parse(rehacer.pop())); C.dibujar(); cb.cambio(); };
  C.cambiar = (fn) => { guardarDeshacer(); fn(plano()); C.dibujar(); cb.cambio(); };
  function cancelar() { inicio = null; if (herr === "sel") { sel.clear(); cb.seleccion([]); } C.dibujar(); }
  C.herramienta = function (h) { herr = h; inicio = null; snap = null; cb.herramienta(h); C.dibujar(); };
  C.seleccion = () => [...sel];
  C.limpiarSeleccion = () => { sel.clear(); C.dibujar(); };
  C.orto = (v) => { orto = v; temporal(); }; C.iman = (v) => { iman = v; temporal(); };

  function poner(q) {
    const pr = cb.props(), p = plano();
    if (herr === "col") {
      if (p.columnas.some(c => Pl.dist([c.x, c.y], q) < 0.02)) { cb.aviso("Ya hay una columna ahí."); return; }
      C.cambiar(p => p.columnas.push({ id: Pl.nuevoId("c"), x: q[0], y: q[1], b: pr.colB, h: pr.colH, ang: pr.colAng || 0 }));
    } else if (herr === "viga" || herr === "placa" || herr === "eje") {
      if (!inicio) { inicio = q.slice(); temporal(); return; }
      if (Pl.dist(inicio, q) < 0.05) return;
      const a = inicio.slice(), b = q.slice();
      if (herr === "viga") C.cambiar(p => p.vigas.push({ id: Pl.nuevoId("v"), a, b, bw: pr.vigB, h: pr.vigH }));
      if (herr === "placa") C.cambiar(p => p.placas.push({ id: Pl.nuevoId("p"), a, b, t: pr.placaT }));
      if (herr === "eje") { C.cambiar(p => p.ejes.push({ id: Pl.nuevoId("e"), nombre: pr.ejeNombre || "", a, b })); inicio = null; temporal(); return; }
      inicio = b; temporal();
    } else if (herr === "losa") {
      if (p.losas.some(l => Pl.dentro(q[0], q[1], l.pts))) { cb.aviso("Ese paño ya tiene losa."); return; }
      const c = Pl.losaEn(p, q[0], q[1]);
      if (!c) { cb.aviso("No encontré un recuadro cerrado por vigas o placas en ese punto."); return; }
      C.cambiar(p => p.losas.push({ id: Pl.nuevoId("l"), pts: c }));
    }
  }
  function buscar(px, py) {
    const p = plano(), q = aM(px, py), tol = 7 / vista.s;
    for (const c of p.columnas) if (Pl.dist([c.x, c.y], q) < Math.max(c.b, c.h) / 2 + tol) return c.id;
    for (const w of p.placas) { const r = Pl.proyeccion(q, w.a, w.b); if (r.d < w.t / 2 + tol && r.t >= 0 && r.t <= 1) return w.id; }
    for (const v of p.vigas) { const r = Pl.proyeccion(q, v.a, v.b); if (r.d < v.bw / 2 + tol && r.t >= 0 && r.t <= 1) return v.id; }
    for (const e of p.ejes) { const r = Pl.proyeccion(q, e.a, e.b); if (r.d < tol && r.t >= 0 && r.t <= 1) return e.id; }
    const ls = p.losas.filter(l => Pl.dentro(q[0], q[1], l.pts));
    return ls.length ? ls[0].id : null;
  }
  function clic(m, e) {
    if (herr === "sel" || herr === "borrar") {
      const id = buscar(...m);
      if (herr === "borrar") { if (id) C.cambiar(p => quitar(p, new Set([id]))); return; }
      if (!e.shiftKey) sel.clear();
      if (id) sel.has(id) && e.shiftKey ? sel.delete(id) : sel.add(id);
      cb.seleccion([...sel]); C.dibujar(); return;
    }
    poner(snap ? snap.q : iman_(aM(...m)).q);
  }
  function quitar(p, ids) { for (const k of ["columnas", "vigas", "placas", "losas", "ejes"]) p[k] = p[k].filter(o => !ids.has(o.id)); }
  function borrarSel() { if (!sel.size) return; const ids = new Set(sel); C.cambiar(p => quitar(p, ids)); sel.clear(); cb.seleccion([]); }
  C.borrarSel = borrarSel;

  // ------------------------------------------------------------ línea de comandos (estilo AutoCAD)
  function comando(t) {
    if (!t) { if (inicio) cancelar(); return; }
    const low = t.toLowerCase();
    const alias = { c: "col", col: "col", columna: "col", v: "viga", viga: "viga", p: "placa", pl: "placa", placa: "placa", m: "placa", muro: "placa", l: "losa", losa: "losa",
      e: "eje", eje: "eje", s: "sel", sel: "sel", b: "borrar", borrar: "borrar", del: "borrar", erase: "borrar" };
    if (alias[low]) { C.herramienta(alias[low]); return; }
    if (low === "u" || low === "deshacer") { C.deshacer(); return; }
    if (low === "z" || low === "ze" || low === "zoom") { C.zoomExtension(); return; }
    if (low === "orto" || low === "f8") { orto = !orto; temporal(); return; }
    if (low === "la" || low === "losas") { cb.losasAuto(); return; }
    let q = null, m;
    const base = inicio || null;
    if ((m = t.match(/^@\s*(-?[\d.]+)\s*<\s*(-?[\d.]+)$/)) && base) { const L = +m[1], a = +m[2] * Math.PI / 180; q = [base[0] + L * Math.cos(a), base[1] + L * Math.sin(a)]; }
    else if ((m = t.match(/^@\s*(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/)) && base) q = [base[0] + +m[1], base[1] + +m[2]];
    else if ((m = t.match(/^(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/))) q = [+m[1], +m[2]];
    else if ((m = t.match(/^(-?[\d.]+)$/)) && base) { // distancia directa en la dirección del cursor
      const c = snap ? snap.q : cursor; let dx = c[0] - base[0], dy = c[1] - base[1];
      if (orto) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      const n = Math.hypot(dx, dy) || 1; q = [base[0] + +m[1] * dx / n, base[1] + +m[1] * dy / n];
    }
    if (!q) { cb.aviso(`No entendí «${t}». Prueba: C (columna), V (viga), P (placa), L (losa), E (eje), x,y · @dx,dy · @L<ángulo.`); return; }
    if (herr === "sel" || herr === "borrar") { cb.aviso("Primero elige una herramienta (C, V, P, L o E)."); return; }
    poner([+q[0].toFixed(4), +q[1].toFixed(4)]);
  }

  root.CAD = C;
})(window);
