/* Interfaz de SismoPaso: datos -> modelo -> análisis -> resultados y asistente. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const KEY = "sismopaso.proyecto.v1";

  const EJEMPLO = {
    nombre: "Edificio de prueba 4 pisos (col. 60x60, vigas 30x60)", uso: "vivienda", zona: 4, suelo: "S2", vs30: null, categoria: "C",
    sistemaX: "PÓRTICOS", sistemaY: "PÓRTICOS", dir30: false, norma: "2026",
    ejesX: [5, 5, 5], ejesY: [5, 5, 5], pisos: { n: 4, h1: 3.2, h: 2.8 },
    secc: { col: [0.6, 0.6], viga: [0.3, 0.6], placaT: 0.25 }, fc: 210,
    cargas: { cm: 500, cmRoof: 400, cv: 200, cvRoof: 100 }, vacios: [], placas: [],
  };
  let st = clon(EJEMPLO), modo = "pano", ultimo = null;

  function clon(o) { return JSON.parse(JSON.stringify(o)); }
  function guardarLocal() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ } }
  function leerLocal() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  // ------------------------------------------------------------ modelo para el solver
  function nombreNodo(i, j) { return (i < 26 ? LETRAS[i] : "A" + LETRAS[i - 26]) + (j + 1); }
  function construirModelo(s) {
    const xs = [0], ys = [0];
    s.ejesX.forEach(l => xs.push(xs[xs.length - 1] + l)); s.ejesY.forEach(l => ys.push(ys[ys.length - 1] + l));
    const n = s.pisos.n, vac = new Set(s.vacios);
    const nodes = {}, columns = [], beams = [], slabs = [], walls = [];
    const usados = new Set(), vb = new Set();
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      if (vac.has(i + "," + j)) continue;
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => { const id = nombreNodo(a, b); nodes[id] = [xs[a], ys[b]]; usados.add(id); return id; });
      slabs.push({ nodes: q, p1: 1, p2: n });
      for (const [a, b] of [[0, 1], [3, 2], [0, 3], [1, 2]]) { const k = [q[a], q[b]].sort().join(); if (!vb.has(k)) { vb.add(k); beams.push({ i: q[a], j: q[b], sec: "V", p1: 1, p2: n }); } }
    }
    for (const id of usados) columns.push({ node: id, sec: "C", p1: 1, p2: n });
    for (const p of s.placas) {
      const [t, i, j] = p.split(/[:,]/); const a = +i, b = +j;
      const ni = nombreNodo(a, b), nj = t === "h" ? nombreNodo(a + 1, b) : nombreNodo(a, b + 1);
      if (!nodes[ni] || !nodes[nj]) continue;
      walls.push({ i: ni, j: nj, sec: "M", p1: 1, p2: n });
    }
    const stories = Array.from({ length: n }, (_, k) => ({ name: "Piso" + (k + 1), h: k ? s.pisos.h : s.pisos.h1 }));
    const fmCV = (s.categoria === "C") ? 0.25 : 0.5;
    return {
      stories, E: 15000 * Math.sqrt(s.fc) * 10, nu: 0.2, gamma: 2.4, nodes,
      sections: { C: { type: "col", b: s.secc.col[0], h: s.secc.col[1] }, V: { type: "beam", b: s.secc.viga[0], h: s.secc.viga[1] }, M: { type: "wall", b: s.secc.placaT } },
      columns, beams, slabs, walls,
      loads: { cm: s.cargas.cm / 1000, cmRoof: s.cargas.cmRoof / 1000, cv: s.cargas.cv / 1000, cvRoof: s.cargas.cvRoof / 1000 },
      massFactors: { cm: 1, cv: fmCV, cvRoof: 0.25 },
    };
  }
  const cotas = (s) => { const z = [0]; for (let k = 0; k < s.pisos.n; k++) z.push(z[k] + (k ? s.pisos.h : s.pisos.h1)); return z; };

  // ------------------------------------------------------------ formulario
  const CAMPOS = ["nombre", "uso", "zona", "suelo", "vs30", "categoria", "sistemaX", "sistemaY", "dir30", "ejesX", "ejesY", "nPisos", "h1", "h", "colB", "colH", "vigB", "vigH", "placaT", "fc", "cm", "cmRoof", "cv", "cvRoof"];
  function aForm() {
    $("nombre").value = st.nombre; $("uso").value = st.uso; $("zona").value = st.zona; $("suelo").value = st.suelo; $("vs30").value = st.vs30 ?? "";
    $("categoria").value = st.categoria; $("sistemaX").value = st.sistemaX; $("sistemaY").value = st.sistemaY; $("dir30").checked = !!st.dir30;
    $("ejesX").value = st.ejesX.join(", "); $("ejesY").value = st.ejesY.join(", ");
    $("nPisos").value = st.pisos.n; $("h1").value = st.pisos.h1; $("h").value = st.pisos.h;
    $("colB").value = st.secc.col[0]; $("colH").value = st.secc.col[1]; $("vigB").value = st.secc.viga[0]; $("vigH").value = st.secc.viga[1];
    $("placaT").value = st.secc.placaT; $("fc").value = st.fc;
    $("cm").value = st.cargas.cm; $("cmRoof").value = st.cargas.cmRoof; $("cv").value = st.cargas.cv; $("cvRoof").value = st.cargas.cvRoof;
    pistas();
  }
  const num = (id, def) => { const v = parseFloat(String($(id).value).replace(",", ".")); return isFinite(v) ? v : def; };
  const lista = (id, def) => { const v = $(id).value.split(/[;,\s]+/).map(x => parseFloat(x)).filter(x => x > 0); return v.length ? v : def; };
  function deForm(ev) {
    const prevUso = st.uso;
    st.nombre = $("nombre").value; st.uso = $("uso").value; st.zona = +$("zona").value; st.suelo = $("suelo").value;
    st.vs30 = $("vs30").value === "" ? null : num("vs30", null);
    st.categoria = $("categoria").value; st.sistemaX = $("sistemaX").value; st.sistemaY = $("sistemaY").value; st.dir30 = $("dir30").checked;
    const ex = lista("ejesX", st.ejesX), ey = lista("ejesY", st.ejesY);
    if (ex.length !== st.ejesX.length || ey.length !== st.ejesY.length) { st.vacios = []; st.placas = []; }
    st.ejesX = ex; st.ejesY = ey;
    st.pisos = { n: Math.max(1, Math.min(30, Math.round(num("nPisos", 4)))), h1: num("h1", 3), h: num("h", 2.8) };
    st.secc = { col: [num("colB", 0.4), num("colH", 0.4)], viga: [num("vigB", 0.25), num("vigH", 0.5)], placaT: num("placaT", 0.25) };
    st.fc = num("fc", 210);
    st.cargas = { cm: num("cm", 500), cmRoof: num("cmRoof", 400), cv: num("cv", 200), cvRoof: num("cvRoof", 100) };
    if (ev && ev.target && ev.target.id === "uso" && st.uso !== prevUso) { // el asistente llena CV y categoría según el uso
      const u = Asistente.USOS[st.uso]; st.cargas.cv = u.cv; st.categoria = u.cat; aForm();
    }
    guardarLocal(); pistas(); dibujarPlanta(); redibujar3D(); marcarDesactualizado();
  }
  function pistas() {
    const q = E030.parametros({ norma: "2026", zona: st.zona, suelo: st.suelo, vs30: st.vs30, categoria: st.categoria, sistemaX: st.sistemaX, sistemaY: st.sistemaY });
    const u = Asistente.USOS[st.uso];
    let h = `Z = ${q.Z} · U = ${q.U} · S = ${q.S == null ? "—" : q.S.toFixed(2)} · Tp = ${q.Tp == null ? "—" : q.Tp.toFixed(2)} s · TL = ${q.TL == null ? "—" : q.TL.toFixed(2)} s · R0 = ${q.R0x} / ${q.R0y}`;
    if (q.notaSuelo) h += `<br>${q.notaSuelo}`;
    if (u.cat !== st.categoria) h += `<br>Ojo: para «${u.nombre}» lo usual es la categoría ${u.cat}.`;
    if (st.categoria === "A1" && st.zona >= 3) h += "<br>La categoría A1 en zonas 3 y 4 requiere aislamiento sísmico.";
    $("hintProyecto").innerHTML = h;
    $("hintCargas").innerHTML = `${u.nota}<br>CM sugerida: losa aligerada (≈300 kg/m² para h = 0,20) + piso terminado 100 + tabiquería 100. Para el peso sísmico se toma 100% CM + ${st.categoria === "C" ? 25 : 50}% CV (25% en azotea), E.030 art. 31.`;
  }

  // ------------------------------------------------------------ planta interactiva (SVG)
  function dibujarPlanta() {
    const svg = $("planta");
    const xs = [0], ys = [0];
    st.ejesX.forEach(l => xs.push(xs[xs.length - 1] + l)); st.ejesY.forEach(l => ys.push(ys[ys.length - 1] + l));
    const W = xs[xs.length - 1], H = ys[ys.length - 1], esc = 84 / Math.max(W, H), ox = 10 + (84 - W * esc) / 2, oy = 8 + (84 - H * esc) / 2;
    const X = (x) => ox + x * esc, Y = (y) => oy + (H - y) * esc;
    const vac = new Set(st.vacios), pl = new Set(st.placas);
    let s = "";
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++)
      s += `<rect class="pano${vac.has(i + "," + j) ? " vacio" : ""}" data-p="${i},${j}" x="${X(xs[i])}" y="${Y(ys[j + 1])}" width="${(xs[i + 1] - xs[i]) * esc}" height="${(ys[j + 1] - ys[j]) * esc}"/>`;
    xs.forEach((x, i) => { s += `<line class="eje" x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(H)}"/><text x="${X(x) - 1}" y="${Y(H) - 2.5}">${LETRAS[i]}</text>`; });
    ys.forEach((y, j) => { s += `<line class="eje" x1="${X(0)}" y1="${Y(y)}" x2="${X(W)}" y2="${Y(y)}"/><text x="${X(0) - 5}" y="${Y(y) + 1}">${j + 1}</text>`; });
    for (const p of pl) {
      const [t, i, j] = p.split(/[:,]/).map((v, k) => k ? +v : v);
      if (t === "h" && i < xs.length - 1) s += `<line class="placa" x1="${X(xs[i])}" y1="${Y(ys[j])}" x2="${X(xs[i + 1])}" y2="${Y(ys[j])}"/>`;
      if (t === "v" && j < ys.length - 1) s += `<line class="placa" x1="${X(xs[i])}" y1="${Y(ys[j])}" x2="${X(xs[i])}" y2="${Y(ys[j + 1])}"/>`;
    }
    if (modo === "placa") {
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length; j++) s += `<line class="borde" data-e="h:${i},${j}" x1="${X(xs[i]) + 1}" y1="${Y(ys[j])}" x2="${X(xs[i + 1]) - 1}" y2="${Y(ys[j])}"/>`;
      for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length - 1; j++) s += `<line class="borde" data-e="v:${i},${j}" x1="${X(xs[i])}" y1="${Y(ys[j]) - 1}" x2="${X(xs[i])}" y2="${Y(ys[j + 1]) + 1}"/>`;
    }
    const m = construirModelo(st);
    for (const c of m.columns) { const [x, y] = m.nodes[c.node]; s += `<rect class="col" x="${X(x) - 1.1}" y="${Y(y) - 1.1}" width="2.2" height="2.2"/>`; }
    svg.innerHTML = s;
  }
  $("planta").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.p && modo === "pano") {
      const k = t.dataset.p, v = new Set(st.vacios);
      v.has(k) ? v.delete(k) : v.add(k);
      if (v.size >= st.ejesX.length * st.ejesY.length) return;
      st.vacios = [...v];
    } else if (t.dataset.e) {
      const k = t.dataset.e, v = new Set(st.placas);
      v.has(k) ? v.delete(k) : v.add(k); st.placas = [...v];
      if (st.placas.length && st.sistemaX === "PÓRTICOS" && st.sistemaY === "PÓRTICOS") { st.sistemaX = st.sistemaY = "DUAL"; aForm(); }
    } else return;
    guardarLocal(); dibujarPlanta(); redibujar3D(); marcarDesactualizado();
  });
  document.querySelectorAll(".modo button").forEach(b => b.addEventListener("click", () => {
    modo = b.dataset.modo; document.querySelectorAll(".modo button").forEach(o => o.classList.toggle("on", o === b)); dibujarPlanta();
  }));
  document.querySelectorAll("#steps button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#steps button").forEach(o => o.classList.toggle("on", o === b));
    document.querySelectorAll(".step").forEach(s => s.classList.toggle("hidden", s.dataset.step !== b.dataset.step));
    if (b.dataset.step === "2") dibujarPlanta();
  }));

  // ------------------------------------------------------------ 3D
  function redibujar3D() { try { Visor.dibujar(construirModelo(st), cotas(st)); actualizarVista(); } catch (e) { console.error(e); } }
  function actualizarVista() {
    const v = $("modoVista").value, sel = $("selModo").value;
    Visor.colorNormal();
    $("leyenda").innerHTML = "";
    if (!ultimo) { Visor.modo(null); return; }
    if (v === "deriva") {
      Visor.colorDeriva(ultimo.derivas, ultimo.q.derivaLim);
      $("leyenda").innerHTML = `Deriva vs límite:<i style="background:var(--ok)"></i>≤ 80%<i style="background:var(--warn)"></i>80–100%<i style="background:var(--bad)"></i>> 100%`;
    }
    if (sel !== "") {
      const m = ultimo.modes[+sel];
      Visor.modo(ultimo.B.levels, m.phi, $("escala").value / 50);
      $("leyenda").innerHTML += (v === "deriva" ? "<br>" : "") + `Modo ${m.n}: T = ${m.T.toFixed(3)} s · UX ${(100 * m.UX).toFixed(0)}% · UY ${(100 * m.UY).toFixed(0)}% · RZ ${(100 * m.RZ).toFixed(0)}%`;
    } else Visor.modo(null);
  }
  $("modoVista").addEventListener("change", actualizarVista);
  $("selModo").addEventListener("change", actualizarVista);
  $("escala").addEventListener("input", actualizarVista);
  $("btnVista").addEventListener("click", () => Visor.vistaInicial());

  // ------------------------------------------------------------ análisis
  function marcarDesactualizado() { if (ultimo) $("estado").textContent = "Cambiaste datos: vuelve a analizar para actualizar los resultados."; }
  function analizar() {
    deForm();
    $("estado").textContent = "Calculando…";
    setTimeout(() => {
      try {
        const t = performance.now();
        const model = construirModelo(st);
        const p = { norma: "2026", zona: st.zona, suelo: st.suelo, vs30: st.vs30, categoria: st.categoria, sistemaX: st.sistemaX, sistemaY: st.sistemaY, dir30: st.dir30 };
        const q0 = E030.parametros(p);
        if (q0.S == null) throw new Error(q0.notaSuelo);
        const r = Irreg.analizarTodo(model, p);
        r.model = model; r.st = clon(st);
        ultimo = r;
        $("estado").textContent = `Listo en ${((performance.now() - t) / 1000).toFixed(2)} s · ${Object.keys(model.nodes).length} nudos en planta, ${r.B.elems.length} elementos.`;
        mostrar(r);
        $("selModo").innerHTML = `<option value="">Sin animación</option>` + r.modes.map((m, i) => `<option value="${i}">Modo ${m.n} · T = ${m.T.toFixed(3)} s</option>`).join("");
        $("selModo").value = "0"; $("modoVista").value = "deriva";
        actualizarVista();
      } catch (e) {
        console.error(e);
        $("estado").innerHTML = `<span style="color:var(--bad)">No se pudo analizar: ${e.message}</span>`;
      }
    }, 20);
  }
  $("btnAnalizar").addEventListener("click", analizar);

  // ------------------------------------------------------------ resultados
  const f = (v, d = 3) => (v == null || !isFinite(v)) ? "—" : v.toFixed(d);
  const pct = (v) => (100 * v).toFixed(1) + "%";
  function tarjeta(lbl, val, sub, cls = "") { return `<div class="card ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`; }
  function mensajes(lista) {
    return lista.map(m => `<div class="msg ${m.tipo}"><b>${m.titulo}</b>${m.texto}${m.art ? `<div class="art">${m.art}</div>` : ""}</div>`).join("");
  }
  function mostrar(r) {
    const q = r.q, dX = r.dirs[0], dY = r.dirs[1], lim = q.derivaLim;
    const rec = Asistente.despues(st, r);
    r.recomendaciones = rec;
    const okX = r.derivaMax.X <= lim, okY = r.derivaMax.Y <= lim;
    let h = `<div class="cards">
      ${tarjeta("Periodo T1", f(r.modes[0].T) + " s", `Tx = ${f(dX.T)} s · Ty = ${f(dY.T)} s`)}
      ${tarjeta("Peso sísmico P", f(r.P, 1) + " t", `${r.B.N} pisos · ${f(r.P / r.B.N, 1)} t por piso`)}
      ${tarjeta("Cortante basal X", f(dX.Vest, 1) + " t", `estático · dinámico ${f(dX.Vdin, 1)} t`)}
      ${tarjeta("Cortante basal Y", f(dY.Vest, 1) + " t", `estático · dinámico ${f(dY.Vdin, 1)} t`)}
      ${tarjeta("Deriva máx. X", f(r.derivaMax.X, 4), okX ? `cumple (≤ ${lim})` : `NO cumple (> ${lim})`, okX ? "ok" : "bad")}
      ${tarjeta("Deriva máx. Y", f(r.derivaMax.Y, 4), okY ? `cumple (≤ ${lim})` : `NO cumple (> ${lim})`, okY ? "ok" : "bad")}
      ${tarjeta("R en X / Y", `${f(q.Rx, 2)} / ${f(q.Ry, 2)}`, `R0·Ia·Ip · Ia = ${r.irreg.Ia} · Ip = ${r.irreg.Ip}`, r.irreg.Ia * r.irreg.Ip < 1 ? "warn" : "")}
    </div>
    <div class="box"><h3>Asistente: lo que te recomiendo <span class="tag ${r.cumple && !r.restricciones.length ? "ok" : "bad"}">${r.cumple && !r.restricciones.length ? "CUMPLE" : "REVISAR"}</span></h3>
      <div class="asis">${mensajes(rec)}</div></div>
    <div class="grid2">
      <div class="box"><h3>Derivas inelásticas</h3><p class="explica">${Asistente.EXPLICA.deriva}</p>
        <div class="bars">${barras(r)}</div>
        <div class="scroll"><table><thead><tr><th>Piso</th><th>h (m)</th><th>X elást.</th><th>X inelást.</th><th>Y elást.</th><th>Y inelást.</th></tr></thead><tbody>
        ${r.derivas.slice().reverse().map(d => `<tr><td>${d.piso}</td><td>${f(d.h, 2)}</td><td>${f(d.elX, 5)}</td><td>${f(d.inX, 4)}</td><td>${f(d.elY, 5)}</td><td>${f(d.inY, 4)}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="aviso">Factor: ${q.regular ? "0,75" : "0,85"}·R = ${f(dX.fDeriva, 2)} (X) y ${f(dY.fDeriva, 2)} (Y). Incluye la excentricidad accidental de 5% (${E030.ART[q.norma].ecc}).</p>
      </div>
      <div class="box"><h3>Cortante y fuerzas por piso</h3><p class="explica">${Asistente.EXPLICA.V}</p>
        <div class="scroll"><table><thead><tr><th>Piso</th><th>Peso (t)</th><th>F est. X (t)</th><th>V din. X (t)</th><th>F est. Y (t)</th><th>V din. Y (t)</th></tr></thead><tbody>
        ${r.B.levels.map((L, k) => `<tr><td>${L.name}</td><td>${f(L.W, 1)}</td><td>${f(dX.Fest[k], 2)}</td><td>${f(dX.shearDin[k], 2)}</td><td>${f(dY.Fest[k], 2)}</td><td>${f(dY.shearDin[k], 2)}</td></tr>`).reverse().join("")}
        </tbody></table></div>
        <table style="margin-top:10px"><thead><tr><th>Dirección</th><th>T (s)</th><th>C</th><th>k</th><th>ZUCS/R</th><th>Vdin/Vest</th><th>Escala</th></tr></thead><tbody>
        ${r.dirs.map(D => `<tr><td>${D.d ? "Y" : "X"}</td><td>${f(D.T)}</td><td>${f(D.C)}</td><td>${f(D.k)}</td><td>${f(D.coef, 4)}</td><td>${pct(D.Vdin / D.Vest)}</td><td>${f(D.factorEscala)}</td></tr>`).join("")}
        </tbody></table>
      </div>
    </div>
    <div class="grid2">
      <div class="box"><h3>Modos de vibración</h3><p class="explica">${Asistente.EXPLICA.modos} Toca una fila para animarla.</p>
        <div class="scroll"><table id="tablaModos"><thead><tr><th>Modo</th><th>T (s)</th><th>UX</th><th>UY</th><th>RZ</th><th>ΣUX</th><th>ΣUY</th></tr></thead><tbody>
        ${r.modes.map((m, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${m.n}</td><td>${f(m.T)}</td><td>${pct(m.UX)}</td><td>${pct(m.UY)}</td><td>${pct(m.RZ)}</td><td>${pct(m.SumUX)}</td><td>${pct(m.SumUY)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="box"><h3>Irregularidades (E.030)</h3><p class="explica">${Asistente.EXPLICA.irreg}</p>
        <div class="scroll"><table><thead><tr><th>Irregularidad</th><th>Tipo</th><th>Factor</th><th>¿Hay?</th></tr></thead><tbody>
        ${r.irreg.lista.map(v => `<tr title="${v.detalle.join("; ").replace(/"/g, "'")}"><td>${v.nombre}</td><td>${v.tabla}</td><td>${v.factor}</td><td>${v.presente ? '<span class="tag warn">Sí</span>' : "No"}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="aviso">No evaluadas aún en el prototipo: piso débil (resistencia), discontinuidad del diafragma por aberturas y sistemas no paralelos.</p>
      </div>
    </div>
    <div class="grid2">
      <div class="box"><h3>Combinaciones de diseño (E.060, art. 9.2)</h3>
        <table><tbody>${Asistente.combinaciones(q).map((c, i) => `<tr><td>U${i + 1}</td><td style="text-align:left">${c}</td></tr>`).join("")}</tbody></table>
        <p class="aviso">SX y SY son el sismo dinámico${dX.factorEscala > 1 || dY.factorEscala > 1 ? ` escalado (× ${f(dX.factorEscala)} en X, × ${f(dY.factorEscala)} en Y)` : ""}. ${q.dir30 ? "Con 100% + 30% (arts. 33.3 y 43)." : "Activa el 100% + 30% en el paso 1 para la E.030-2026 (arts. 33.3 y 43)."}</p>
      </div>
      <div class="box"><h3>Parámetros usados</h3>
        <table class="wrap"><tbody>
          <tr><td>Norma</td><td>E.030-2026 (RM 183-2026-VIVIENDA)</td></tr>
          <tr><td>Z · U · S</td><td>${q.Z} · ${q.U} · ${f(q.S, 2)}</td></tr>
          <tr><td>Tp · TL</td><td>${f(q.Tp, 2)} s · ${f(q.TL, 2)} s</td></tr>
          <tr><td>Sistema X · Y</td><td>${q.sistemaX} (R0 = ${q.R0x}) · ${q.sistemaY} (R0 = ${q.R0y})</td></tr>
          <tr><td>Ec</td><td>15000·√f'c = ${f(15000 * Math.sqrt(st.fc), 0)} kg/cm²</td></tr>
          <tr><td>Masa</td><td>100% CM + ${st.categoria === "C" ? 25 : 50}% CV, 25% CV azotea</td></tr>
          <tr><td>Modelo</td><td>Secciones brutas, base empotrada, diafragma rígido</td></tr>
          <tr><td>Periodo inicial hn/CT</td><td>${f(r.hn, 2)} / ${q.CT} = ${f(r.Tini)} s</td></tr>
        </tbody></table>
      </div>
    </div>
    <p class="aviso">Prototipo educativo: verifica los resultados antes de usarlos en un proyecto real. No reemplaza el criterio ni la firma de un ingeniero.</p>`;
    $("resultados").innerHTML = h;
    document.querySelectorAll("#tablaModos tbody tr").forEach(tr => tr.addEventListener("click", () => {
      $("selModo").value = tr.dataset.i; actualizarVista();
      document.querySelectorAll("#tablaModos tr").forEach(o => o.classList.toggle("sel", o === tr));
      document.querySelector(".visor-wrap").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
  }
  function barras(r) {
    const lim = r.q.derivaLim, mx = Math.max(lim * 1.25, r.derivaMax.X, r.derivaMax.Y);
    const color = (v) => v > lim ? "var(--bad)" : v > 0.8 * lim ? "var(--warn)" : "var(--ok)";
    return r.derivas.slice().reverse().map(d => ["X", "Y"].map(dir => {
      const v = d["in" + dir];
      return `<div class="bar"><span>${d.piso} ${dir}</span><div class="track"><div class="fill" style="width:${100 * v / mx}%;background:${color(v)}"></div><div class="lim" style="left:${100 * lim / mx}%"></div></div><span>${v.toFixed(4)}</span></div>`;
    }).join("")).join("");
  }

  // ------------------------------------------------------------ predimensionamiento
  $("btnPredim").addEventListener("click", () => {
    deForm();
    const tips = Asistente.predim(st);
    $("predim").innerHTML = tips.map((m, i) => `<div class="msg"><b>${m.titulo}</b>${m.texto}<div class="art">${m.art}</div><button class="small" data-i="${i}" style="margin-top:6px">Usar este valor</button></div>`).join("");
    $("predim").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const a = tips[+b.dataset.i].aplicar;
      if (a.colB) st.secc.col = [a.colB, a.colH];
      if (a.vigB) st.secc.viga = [a.vigB, a.vigH];
      if (a.losaH) { const p = Asistente.pesoAligerado(a.losaH); st.cargas.cm = p + 200; st.cargas.cmRoof = p + 100; }
      aForm(); guardarLocal(); redibujar3D(); marcarDesactualizado();
      b.textContent = "Aplicado ✓";
    }));
  });

  // ------------------------------------------------------------ informe imprimible
  $("btnInforme").addEventListener("click", () => {
    if (!ultimo) { $("estado").textContent = "Primero analiza el edificio para generar el informe."; return; }
    const r = ultimo, img = Visor.captura();
    $("informe").innerHTML = `<h1>${r.st.nombre || "Proyecto"}</h1>
      <p>Análisis sísmico con la Norma E.030-2026 · SismoPaso (prototipo educativo) · ${new Date().toLocaleDateString("es-PE")}</p>
      <img src="${img}" style="max-width:100%;max-height:300px">
      ${document.getElementById("resultados").innerHTML}`;
    window.print();
  });

  // ------------------------------------------------------------ guardar / abrir / ejemplo / tema
  $("btnGuardar").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(st, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (st.nombre || "proyecto").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + ".sismopaso.json"; a.click();
  });
  $("fileAbrir").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { st = Object.assign(clon(EJEMPLO), JSON.parse(await file.text())); aForm(); guardarLocal(); dibujarPlanta(); redibujar3D(); ultimo = null; $("resultados").innerHTML = '<div class="vacio">Proyecto abierto. Pulsa <b>Analizar sismo</b>.</div>'; }
    catch (err) { $("estado").textContent = "No se pudo leer el archivo."; }
    e.target.value = "";
  });
  $("btnEjemplo").addEventListener("click", () => { st = clon(EJEMPLO); aForm(); guardarLocal(); dibujarPlanta(); redibujar3D(); analizar(); });
  $("btnTema").addEventListener("click", () => {
    const d = document.documentElement, oscuro = d.dataset.theme ? d.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    d.dataset.theme = oscuro ? "light" : "dark"; Visor.tema(); redibujar3D();
  });

  // ------------------------------------------------------------ inicio
  $("uso").innerHTML = Object.entries(Asistente.USOS).map(([k, u]) => `<option value="${k}">${u.nombre}</option>`).join("");
  const guardado = leerLocal(); if (guardado) st = Object.assign(clon(EJEMPLO), guardado);
  aForm();
  CAMPOS.forEach(id => $(id).addEventListener("change", deForm));
  Visor.init($("visor"));
  dibujarPlanta(); redibujar3D();
  analizar();
})();
