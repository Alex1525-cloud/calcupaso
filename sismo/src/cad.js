/* Editor de planta tipo CAD sobre SVG: zoom, encuadre, imán, orto, línea de comandos y deshacer. */
(function (root) {
  "use strict";
  const Pl = root.Plano;
  const NS = "http://www.w3.org/2000/svg";
  const C = {};
  let svg, capaDib, capaTmp, cmd, estadoEl, cb;
  let vista = { x: 7.5, y: 7.5, s: 30 }; // centro (m) y escala (px/m)
  let herr = "sel", inicio = null, cursor = [0, 0], snap = null, orto = false, iman = true;
  let sel = new Set(), deshacer = [], rehacer = [], marcas = [];
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
    for (const l of p.losas) {
      const pts = l.pts.map(aPx), tipo = l.tipo || "";
      el("polygon", { points: pts.map(q => q.join(",")).join(" "), class: "losa" + (tipo ? " " + tipo : "") + (sel.has(l.id) ? " sel" : ""), "data-id": l.id });
      if (tipo === "escalera" || tipo === "vacio") { // símbolo: escalones o aspa
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (tipo === "vacio") { el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "simb" }); el("line", { x1: x0, y1: y1, x2: x1, y2: y0, class: "simb" }); }
        else { const n = Math.max(3, Math.min(14, Math.round((x1 - x0) / 10))); for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n; el("line", { x1: x, y1: y0, x2: x, y2: y1, class: "simb" }); }
          el("path", { d: `M${x0 + 4},${(y0 + y1) / 2}L${x1 - 6},${(y0 + y1) / 2}M${x1 - 12},${(y0 + y1) / 2 - 5}L${x1 - 6},${(y0 + y1) / 2}L${x1 - 12},${(y0 + y1) / 2 + 5}`, class: "simb" }); }
      }
    }
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
      const [cx, cy] = aPx([c.x, c.y]), bw = Math.max(5, c.b * vista.s), hh = Math.max(5, c.h * vista.s), cls = "columna" + (sel.has(c.id) ? " sel" : "");
      if (c.forma === "circ") el("circle", { cx, cy, r: Math.max(3, c.b * vista.s / 2), class: cls });
      else if (c.forma === "L" || c.forma === "T") {
        const a = (c.ang || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
        const pts = Pl.contornoColumna(c).map(([u, v]) => aPx([c.x + u * co - v * si, c.y + u * si + v * co]));
        el("polygon", { points: pts.map(q => q.join(",")).join(" "), class: cls });
      } else el("rect", { x: cx - bw / 2, y: cy - hh / 2, width: bw, height: hh, class: cls, transform: `rotate(${-(c.ang || 0)} ${cx} ${cy})` });
    }
    // centro de masa y de rigidez (del último análisis)
    for (const m of marcas) {
      const [mx, my] = aPx(m.q);
      if (m.tipo === "cm") { el("circle", { cx: mx, cy: my, r: 7, class: "mk-cm" }); el("path", { d: `M${mx - 7},${my}h14M${mx},${my - 7}v14`, class: "mk-l" }); }
      else el("path", { d: `M${mx},${my - 8}L${mx + 7},${my + 5}L${mx - 7},${my + 5}Z`, class: "mk-cr" });
      const t = el("text", { x: mx + 10, y: my - 8, class: "mk-t" }); t.textContent = m.tipo.toUpperCase();
    }
    // pinzamientos del elemento seleccionado
    for (const g of grips()) { const [gx, gy] = aPx(g.q); el("rect", { x: gx - 5, y: gy - 5, width: 10, height: 10, class: "grip" }); }
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
      sel: "Toca para seleccionar (Mayús = varios). Arrastra un elemento para moverlo (lo unido se estira); arrastra los cuadritos para estirar un extremo. Flechas = 5 cm, @dx,dy = mover exacto. Arrastra el fondo para mover la vista.",
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
    if (herr === "sel" && e.button === 0) { // como en Revit: agarrar un elemento (o un pinzamiento) y moverlo
      const m = rel(e), g = buscarGrip(...m), id = g ? null : buscar(...m), o = id && objeto(id);
      if (g || (o && o.k !== "losas")) {
        if (id && !sel.has(id) && !e.shiftKey) { sel.clear(); sel.add(id); cb.seleccion([...sel]); }
        const q0 = aM(...m);
        arrastre = { tipo: g ? "grip" : "mover", grip: g, id, inicio: m, q0, base: JSON.stringify(plano()), ref: g ? g.q : puntoRef(o, q0), movio: false, e };
        return;
      }
    }
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
    if (arrastre && arrastre.tipo) {
      if (Math.hypot(m[0] - arrastre.inicio[0], m[1] - arrastre.inicio[1]) > 4) arrastre.movio = true;
      if (!arrastre.movio) return;
      arrastrar(aM(...m)); return;
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
    if (arrastre && arrastre.tipo) {
      const a = arrastre; arrastre = null; capaTmp.innerHTML = "";
      if (a.movio) { marcas = []; deshacer.push(a.base); if (deshacer.length > 100) deshacer.shift(); rehacer = []; C.dibujar(); cb.cambio(); cb.seleccion([...sel]); }
      else { if (!a.e.shiftKey) sel.clear(); if (a.id) sel.add(a.id); cb.seleccion([...sel]); C.dibujar(); }
      return;
    }
    if (arrastre && !arrastre.movio && e.button !== 1) { const a = arrastre; arrastre = null; cursor = aM(...a.inicio); snap = herr === "sel" || herr === "borrar" ? null : iman_(cursor); clic(a.inicio, a.e); return; }
    arrastre = null;
  }
  function teclas(e) {
    const t = e.target, escribiendo = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") && t !== cmd;
    if (escribiendo || !svg || svg.closest(".hidden") || !svg.getClientRects().length || document.querySelector("dialog[open]")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); C.deshacer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); C.rehacer(); return; }
    if (e.key === "Escape") { cancelar(); return; }
    if (e.key === "F8") { e.preventDefault(); orto = !orto; temporal(); return; }
    if (e.key === "F3") { e.preventDefault(); iman = !iman; temporal(); return; }
    if ((e.key === "Delete" || e.key === "Supr") && t !== cmd) { borrarSel(); return; }
    if (t !== cmd && sel.size && herr === "sel" && e.key.startsWith("Arrow")) { // empujar la selección 5 cm (Mayús: 50 cm)
      e.preventDefault(); const st = e.shiftKey ? 0.5 : 0.05;
      const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
      C.moverSeleccion(d); return;
    }
    // como en AutoCAD: lo que se escribe va a la línea de comandos
    if (t !== cmd && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { cmd.focus(); }
  }

  // ------------------------------------------------------------ acciones
  function guardarDeshacer() { deshacer.push(JSON.stringify(plano())); if (deshacer.length > 100) deshacer.shift(); rehacer = []; }
  C.deshacer = () => { if (!deshacer.length) return; rehacer.push(JSON.stringify(plano())); cb.reemplazar(JSON.parse(deshacer.pop())); sel.clear(); C.dibujar(); cb.cambio(); };
  C.rehacer = () => { if (!rehacer.length) return; deshacer.push(JSON.stringify(plano())); cb.reemplazar(JSON.parse(rehacer.pop())); C.dibujar(); cb.cambio(); };
  C.cambiar = (fn) => { guardarDeshacer(); fn(plano()); marcas = []; C.dibujar(); cb.cambio(); };
  function cancelar() { inicio = null; if (herr === "sel") { sel.clear(); cb.seleccion([]); } C.dibujar(); }
  C.herramienta = function (h) { herr = h; inicio = null; snap = null; cb.herramienta(h); C.dibujar(); };
  C.seleccion = () => [...sel];
  C.marcas = (m) => { marcas = m || []; C.dibujar(); };
  C.limpiarSeleccion = () => { sel.clear(); C.dibujar(); };
  C.orto = (v) => { orto = v; temporal(); }; C.iman = (v) => { iman = v; temporal(); };

  function poner(q) {
    const pr = cb.props(), p = plano();
    if (herr === "col") {
      if (p.columnas.some(c => Pl.dist([c.x, c.y], q) < 0.02)) { cb.aviso("Ya hay una columna ahí."); return; }
      C.cambiar(p => p.columnas.push({ id: Pl.nuevoId("c"), x: q[0], y: q[1], b: pr.colB, h: pr.colForma === "circ" ? pr.colB : pr.colH, ang: pr.colAng || 0, ...(pr.colForma && pr.colForma !== "rect" ? { forma: pr.colForma, t: pr.colT } : {}) }));
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

  // ------------------------------------------------------------ mover (tipo Revit)
  const TOLM = 0.01;
  function objeto(id) { const p = plano(); for (const k of ["columnas", "vigas", "placas", "ejes", "losas"]) { const o = p[k].find(x => x.id === id); if (o) return { k, o }; } return null; }
  function puntoRef(ob, q) { // punto del elemento que se "agarra": centro de la columna o el extremo más cercano
    if (ob.k === "columnas") return [ob.o.x, ob.o.y];
    const { a, b } = ob.o; return Pl.dist(a, q) <= Pl.dist(b, q) ? a.slice() : b.slice();
  }
  /* Desplaza los elementos ids en d. Lo que está unido (mismo punto) se estira con ellos: vigas, placas y losas
     siguen a sus columnas. Un eje se mueve solo en perpendicular y arrastra todo lo que está sobre él. */
  function desplazar(p, ids, d) {
    const pares = []; // [punto viejo, desplazamiento]
    const mueveEje = new Map();
    for (const id of ids) {
      for (const k of ["columnas", "vigas", "placas", "ejes"]) {
        const o = p[k].find(x => x.id === id); if (!o) continue;
        if (k === "columnas") pares.push([[o.x, o.y], d]);
        else if (k === "ejes") {
          const L = Pl.dist(o.a, o.b) || 1, n = [-(o.b[1] - o.a[1]) / L, (o.b[0] - o.a[0]) / L], s = d[0] * n[0] + d[1] * n[1], dn = [n[0] * s, n[1] * s];
          mueveEje.set(o, dn);
          const sobre = (q) => { const r = Pl.proyeccion(q, o.a, o.b); return r.d < TOLM && r.t > -0.05 && r.t < 1.05; };
          p.columnas.forEach(c => { if (sobre([c.x, c.y])) pares.push([[c.x, c.y], dn]); });
          [...p.vigas, ...p.placas].forEach(v => [v.a, v.b].forEach(q => { if (sobre(q)) pares.push([q.slice(), dn]); }));
          p.losas.forEach(l => l.pts.forEach(q => { if (sobre(q)) pares.push([q.slice(), dn]); }));
        } else pares.push([o.a.slice(), d], [o.b.slice(), d]);
      }
    }
    const nuevo = (q) => { for (const [v, dd] of pares) if (Pl.dist(v, q) < TOLM) return [+(q[0] + dd[0]).toFixed(4), +(q[1] + dd[1]).toFixed(4)]; return null; };
    p.columnas.forEach(c => { const q = nuevo([c.x, c.y]); if (q) [c.x, c.y] = q; });
    [...p.vigas, ...p.placas].forEach(v => { const a = nuevo(v.a), b = nuevo(v.b); if (a) v.a = a; if (b) v.b = b; });
    p.losas.forEach(l => { l.pts = l.pts.map(q => nuevo(q) || q); });
    mueveEje.forEach((dn, e) => { e.a = [+(e.a[0] + dn[0]).toFixed(4), +(e.a[1] + dn[1]).toFixed(4)]; e.b = [+(e.b[0] + dn[0]).toFixed(4), +(e.b[1] + dn[1]).toFixed(4)]; });
  }
  C.moverSeleccion = (d) => { if (!sel.size) return; const ids = [...sel]; C.cambiar(p => desplazar(p, ids, d)); cb.seleccion([...sel]); };
  C.moverIds = (ids, d) => C.cambiar(p => desplazar(p, ids, d));
  // pinzamientos: extremos de la viga, placa o eje seleccionado (estiran solo ese extremo)
  function grips() {
    if (sel.size !== 1) return [];
    const ob = objeto([...sel][0]); if (!ob || ob.k === "columnas" || ob.k === "losas") return [];
    return [{ id: ob.o.id, k: ob.k, extremo: "a", q: ob.o.a.slice() }, { id: ob.o.id, k: ob.k, extremo: "b", q: ob.o.b.slice() }];
  }
  function buscarGrip(px, py) { for (const g of grips()) { const [gx, gy] = aPx(g.q); if (Math.hypot(gx - px, gy - py) < 10) return g; } return null; }
  function arrastrar(q) {
    const a = arrastre, p = JSON.parse(a.base);
    // ajuste: imán a puntos que no se mueven, si no a la grilla de 5 cm; orto respecto al punto agarrado
    let r = [a.ref[0] + q[0] - a.q0[0], a.ref[1] + q[1] - a.q0[1]];
    if (orto) { const dx = r[0] - a.ref[0], dy = r[1] - a.ref[1]; r = Math.abs(dx) >= Math.abs(dy) ? [r[0], a.ref[1]] : [a.ref[0], r[1]]; }
    let tipoSnap = null;
    if (iman) {
      const tol = 12 / vista.s; let best = null;
      const fijos = puntosClave(p).filter(k => Pl.dist(k, a.ref) > TOLM);
      for (const k of fijos) { const dd = Pl.dist(k, r); if (dd < tol && (!best || dd < best.d)) best = { q: k, d: dd }; }
      if (best) { r = best.q.slice(); tipoSnap = "punto"; }
      else { const dx = Math.round((r[0] - a.ref[0]) / 0.05) * 0.05, dy = Math.round((r[1] - a.ref[1]) / 0.05) * 0.05; r = [a.ref[0] + dx, a.ref[1] + dy]; }
    }
    const d = [+(r[0] - a.ref[0]).toFixed(4), +(r[1] - a.ref[1]).toFixed(4)];
    if (a.tipo === "grip") {
      const o = p[a.grip.k].find(x => x.id === a.grip.id);
      if (o) o[a.grip.extremo] = [+(a.grip.q[0] + d[0]).toFixed(4), +(a.grip.q[1] + d[1]).toFixed(4)];
    } else desplazar(p, [...sel], d);
    cb.reemplazar(p); C.dibujar();
    const [px, py] = aPx(r);
    if (tipoSnap) el("rect", { x: px - 6, y: py - 6, width: 12, height: 12, class: "iman" }, capaTmp);
    const t = el("text", { x: px + 12, y: py - 12, class: "cota" }, capaTmp);
    t.textContent = a.tipo === "grip" ? `L = ${fmt(Pl.dist(...["a", "b"].map(k => p[a.grip.k].find(x => x.id === a.grip.id)[k])))} m` : `Δx ${fmt(d[0])} · Δy ${fmt(d[1])} m`;
  }

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
    if (herr === "sel" && sel.size && /^@/.test(t)) { // mover la selección: @dx,dy o @L<ángulo
      const m2 = t.match(/^@\s*(-?[\d.]+)\s*<\s*(-?[\d.]+)$/), m3 = t.match(/^@\s*(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/);
      const d = m2 ? [+m2[1] * Math.cos(m2[2] * Math.PI / 180), +m2[1] * Math.sin(m2[2] * Math.PI / 180)] : m3 ? [+m3[1], +m3[2]] : null;
      if (d) { C.moverSeleccion([+d[0].toFixed(4), +d[1].toFixed(4)]); cb.aviso(`Selección movida ${fmt(d[0])}, ${fmt(d[1])} m.`); return; }
    }
    if (herr === "sel" || herr === "borrar") { cb.aviso("Primero elige una herramienta (C, V, P, L o E), o selecciona algo y escribe @dx,dy para moverlo."); return; }
    poner([+q[0].toFixed(4), +q[1].toFixed(4)]);
  }

  root.CAD = C;
})(window);
