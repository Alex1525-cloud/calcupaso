/* Interfaz de SismoPaso: planta tipo CAD -> modelo -> análisis -> resultados y asistente. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEY = "sismopaso.proyecto.v2";

  const EJEMPLO = {
    nombre: "Edificio de prueba 4 pisos (col. 60x60, vigas 30x60)", uso: "vivienda", zona: 4, suelo: "S2", vs30: null, categoria: "C",
    sistemaX: "PÓRTICOS", sistemaY: "PÓRTICOS", dir30: false,
    pisos: { n: 4, h1: 3.2, h: 2.8 }, luces: { x: [5, 5, 5], y: [5, 5, 5] },
    secc: { col: [0.6, 0.6], colAng: 0, viga: [0.3, 0.6], placaT: 0.25 }, fc: 210,
    cargas: { cm: 500, cmRoof: 400, cv: 200, cvRoof: 100 }, plano: null,
  };
  const nuevoEjemplo = () => { const e = clon(EJEMPLO); e.plano = Plano.desdeEjes(e.luces.x, e.luces.y, e.secc); return e; };
  let st = nuevoEjemplo(), ultimo = null, vistaActual = "planta";

  function clon(o) { return JSON.parse(JSON.stringify(o)); }
  function guardarLocal() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ } }
  function leerLocal() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function cargar(o) { // admite proyectos guardados con el formato anterior (grilla)
    const s = Object.assign(clon(EJEMPLO), o);
    if (!s.plano || !s.plano.columnas) s.plano = Plano.desdeEjes(o.ejesX || s.luces.x, o.ejesY || s.luces.y, s.secc);
    if (o.ejesX) s.luces = { x: o.ejesX, y: o.ejesY };
    return s;
  }

  // ------------------------------------------------------------ modelo para el solver
  const construirModelo = (s) => Plano.aModelo(s.plano, s.pisos, s.fc, s.cargas, s.categoria === "C").model;
  const cotas = (s) => { const z = [0]; for (let k = 0; k < s.pisos.n; k++) z.push(z[k] + (k ? s.pisos.h : s.pisos.h1)); return z; };
  function colTipica() {
    const cnt = {}; st.plano.columnas.forEach(c => { const k = c.b + "x" + c.h; cnt[k] = (cnt[k] || 0) + 1; });
    const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    return k ? k.split("x").map(Number) : st.secc.col;
  }

  // ------------------------------------------------------------ formulario
  const CAMPOS = ["nombre", "uso", "zona", "suelo", "vs30", "categoria", "sistemaX", "sistemaY", "dir30", "nPisos", "h1", "h", "colB", "colH", "colAng", "vigB", "vigH", "placaT", "fc", "cm", "cmRoof", "cv", "cvRoof", "ejesX", "ejesY"];
  function aForm() {
    $("nombre").value = st.nombre; $("uso").value = st.uso; $("zona").value = st.zona; $("suelo").value = st.suelo; $("vs30").value = st.vs30 ?? "";
    $("categoria").value = st.categoria; $("sistemaX").value = st.sistemaX; $("sistemaY").value = st.sistemaY; $("dir30").checked = !!st.dir30;
    $("ejesX").value = st.luces.x.join(", "); $("ejesY").value = st.luces.y.join(", ");
    $("nPisos").value = st.pisos.n; $("h1").value = st.pisos.h1; $("h").value = st.pisos.h;
    $("colB").value = st.secc.col[0]; $("colH").value = st.secc.col[1]; $("colAng").value = st.secc.colAng || 0;
    $("vigB").value = st.secc.viga[0]; $("vigH").value = st.secc.viga[1];
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
    st.luces = { x: lista("ejesX", st.luces.x), y: lista("ejesY", st.luces.y) };
    st.pisos = { n: Math.max(1, Math.min(30, Math.round(num("nPisos", 4)))), h1: num("h1", 3), h: num("h", 2.8) };
    st.secc = { col: [num("colB", 0.4), num("colH", 0.4)], colAng: num("colAng", 0), viga: [num("vigB", 0.25), num("vigH", 0.5)], placaT: num("placaT", 0.25) };
    st.fc = num("fc", 210);
    st.cargas = { cm: num("cm", 500), cmRoof: num("cmRoof", 400), cv: num("cv", 200), cvRoof: num("cvRoof", 100) };
    if (ev && ev.target && ev.target.id === "uso" && st.uso !== prevUso) { // el asistente llena CV y categoría según el uso
      const u = Asistente.USOS[st.uso]; st.cargas.cv = u.cv; st.categoria = u.cat; aForm();
    }
    guardarLocal(); pistas(); cambioModelo();
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
    const p = st.plano;
    $("hintPlano").innerHTML = `${p.columnas.length} columnas · ${p.vigas.length} vigas · ${p.placas.length} placas · ${p.losas.length} losas`;
  }

  // ------------------------------------------------------------ editor CAD
  function cambioModelo() { pistas(); revisar(); if (vistaActual === "3d") redibujar3D(); else necesita3D = true; marcarDesactualizado(); }
  let necesita3D = true;
  function revisar() {
    const r = Plano.revisar(st.plano);
    $("revision").innerHTML = r.err.map(t => `<div class="msg bad">${t}</div>`).join("") + r.av.map(t => `<div class="msg warn">${t}</div>`).join("");
    return r;
  }
  CAD.init($("cad"), $("cmd"), $("cadEstado"), {
    plano: () => st.plano,
    reemplazar: (p) => { st.plano = p; },
    cambio: () => { guardarLocal(); cambioModelo(); },
    props: () => ({ colB: st.secc.col[0], colH: st.secc.col[1], colAng: st.secc.colAng || 0, vigB: st.secc.viga[0], vigH: st.secc.viga[1], placaT: st.secc.placaT }),
    herramienta: (h) => document.querySelectorAll("#cadBar [data-h]").forEach(b => b.classList.toggle("on", b.dataset.h === h)),
    seleccion: mostrarSeleccion,
    aviso: (t) => { $("estado").textContent = t; },
    losasAuto: () => losasAuto(),
  });
  document.querySelectorAll("#cadBar [data-h]").forEach(b => b.addEventListener("click", () => CAD.herramienta(b.dataset.h)));
  let ortoOn = false, imanOn = true;
  $("cadOrto").addEventListener("click", () => { ortoOn = !ortoOn; CAD.orto(ortoOn); $("cadOrto").classList.toggle("on", ortoOn); });
  $("cadIman").addEventListener("click", () => { imanOn = !imanOn; CAD.iman(imanOn); $("cadIman").classList.toggle("on", imanOn); });
  $("cadDeshacer").addEventListener("click", () => CAD.deshacer());
  $("cadRehacer").addEventListener("click", () => CAD.rehacer());
  $("cadZoom").addEventListener("click", () => CAD.zoomExtension());
  function losasAuto() {
    let n = 0; CAD.cambiar(p => { n = Plano.losasAutomaticas(p); });
    $("estado").textContent = n ? `Se crearon ${n} losas.` : "No hay paños cerrados nuevos (las losas ya existen o las vigas no forman recuadros).";
  }
  $("btnLosas").addEventListener("click", () => { mostrarVista("planta"); losasAuto(); });
  $("btnGenerar").addEventListener("click", () => {
    deForm();
    CAD.cambiar(p => { const n = Plano.desdeEjes(st.luces.x, st.luces.y, st.secc); Object.assign(p, n); });
    mostrarVista("planta"); CAD.zoomExtension();
  });

  // propiedades del elemento seleccionado
  function buscarEl(id) { for (const k of ["columnas", "vigas", "placas", "losas", "ejes"]) { const o = st.plano[k].find(x => x.id === id); if (o) return [k, o]; } return [null, null]; }
  function mostrarSeleccion(ids) {
    const box = $("propSel");
    if (!ids.length) { box.innerHTML = "Usa la herramienta Seleccionar (S) en la planta para editar una columna, viga o placa."; return; }
    const els = ids.map(buscarEl).filter(x => x[0]);
    const tipos = [...new Set(els.map(x => x[0]))];
    irPaso("3");
    if (tipos.length !== 1) { box.innerHTML = `${els.length} elementos de distinto tipo. <button class="small" id="propBorrar">Borrar</button>`; $("propBorrar").onclick = () => CAD.borrarSel(); return; }
    const [k, o] = els[0], n = els.length > 1 ? ` (${els.length})` : "";
    const campos = { columnas: [["b", "b (m)"], ["h", "h (m)"], ["ang", "Giro (°)"]], vigas: [["bw", "b (m)"], ["h", "h (m)"]], placas: [["t", "Espesor (m)"]], losas: [], ejes: [["nombre", "Nombre"]] }[k];
    const nombre = { columnas: "Columna", vigas: "Viga", placas: "Placa", losas: "Losa", ejes: "Eje" }[k];
    let info = "";
    if (k === "columnas") info = `en (${o.x.toFixed(2)}, ${o.y.toFixed(2)})`;
    if (k === "vigas" || k === "placas" || k === "ejes") info = `L = ${Plano.dist(o.a, o.b).toFixed(2)} m`;
    if (k === "losas") info = `A = ${Math.abs(Plano.areaPoly(o.pts)).toFixed(2)} m²`;
    box.innerHTML = `<div class="prop"><b>${nombre}${n}</b> <span class="hint">${els.length === 1 ? info : "se cambian todas"}</span>
      <div class="row3">${campos.map(([c, l]) => `<label>${l}<input data-c="${c}" type="${c === "nombre" ? "text" : "number"}" step="0.05" value="${o[c] ?? ""}"></label>`).join("")}</div>
      <div class="btns"><button class="small" id="propBorrar">Borrar</button></div></div>`;
    box.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const c = inp.dataset.c, v = c === "nombre" ? inp.value : parseFloat(inp.value);
      if (c !== "nombre" && !(v >= (c === "ang" ? -360 : 0.05))) return;
      CAD.cambiar(p => ids.forEach(id => { for (const kk of ["columnas", "vigas", "placas", "ejes"]) { const e = p[kk].find(x => x.id === id); if (e && c in e || (e && c === "ang")) e[c] = v; } }));
    }));
    $("propBorrar").onclick = () => CAD.borrarSel();
  }
  const aTodas = (k, fn) => CAD.cambiar(p => p[k].forEach(fn));
  $("btnTodasCol").addEventListener("click", () => { deForm(); aTodas("columnas", c => { c.b = st.secc.col[0]; c.h = st.secc.col[1]; }); $("estado").textContent = "Sección aplicada a todas las columnas."; });
  $("btnTodasVig").addEventListener("click", () => { deForm(); aTodas("vigas", v => { v.bw = st.secc.viga[0]; v.h = st.secc.viga[1]; }); $("estado").textContent = "Sección aplicada a todas las vigas."; });
  $("btnTodasPla").addEventListener("click", () => { deForm(); aTodas("placas", w => { w.t = st.secc.placaT; }); $("estado").textContent = "Espesor aplicado a todas las placas."; });

  // ------------------------------------------------------------ pasos y pestañas
  function irPaso(n) {
    document.querySelectorAll("#steps button").forEach(o => o.classList.toggle("on", o.dataset.step === n));
    document.querySelectorAll(".step").forEach(s => s.classList.toggle("hidden", s.dataset.step !== n));
  }
  document.querySelectorAll("#steps button").forEach(b => b.addEventListener("click", () => { irPaso(b.dataset.step); if (b.dataset.step === "2" || b.dataset.step === "3") mostrarVista("planta"); }));
  function mostrarVista(v) {
    vistaActual = v;
    document.querySelectorAll(".tabs-vista button").forEach(b => b.classList.toggle("on", b.dataset.vista === v));
    $("cadWrap").classList.toggle("hidden", v !== "planta"); $("visorWrap").classList.toggle("hidden", v !== "3d");
    if (v === "3d" && necesita3D) redibujar3D();
    if (v === "planta") CAD.dibujar();
  }
  document.querySelectorAll(".tabs-vista button").forEach(b => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));

  // ------------------------------------------------------------ importar DXF
  let dxfLeido = null;
  const abrirDlgDxf = () => { $("dxfInfo").innerHTML = ""; $("btnDxfImportar").disabled = true; dxfLeido = null; $("dlgDxf").showModal(); };
  $("btnDxf").addEventListener("click", abrirDlgDxf);
  // botón de arriba: abre la ventana y de frente el selector de archivo
  // botón de arriba: es un <label> con su propio selector de archivo (abre la carpeta en todos los navegadores)
  $("filePlanoTop").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; abrirDlgDxf(); leerArchivoPlano(f); });
  $("btnDxfCancelar").addEventListener("click", () => $("dlgDxf").close());
  let cargaDwg = null;
  function lectorDwg() { // el lector DWG (~1 MB) se descarga solo la primera vez que se abre un DWG
    if (window.DWGLector) return Promise.resolve(window.DWGLector);
    if (!cargaDwg) cargaDwg = new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = "lib/dwg.js?v=20261116d"; sc.onload = () => ok(window.DWGLector); sc.onerror = () => { cargaDwg = null; mal(new Error("No se pudo descargar el lector de DWG. Revisa tu conexión.")); }; document.head.appendChild(sc); });
    return cargaDwg;
  }
  $("fileDxf").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) leerArchivoPlano(f); });
  async function leerArchivoPlano(f) {
    const buf = await f.arrayBuffer(), cab = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(6, buf.byteLength)));
    if (/^AC1\d\d\d/.test(cab)) {
      $("dxfInfo").innerHTML = `<p>Leyendo el DWG ${f.name}…</p>`;
      try {
        const L = await lectorDwg();
        await new Promise(r => setTimeout(r, 30));
        const d = L.leer(buf);
        prepararDxf(d, f.name + (d.version ? ` (formato ${d.version})` : ""));
      } catch (err) { console.error(err); $("dxfInfo").innerHTML = `<div class="msg bad">No pude leer este DWG: puede estar dañado o usar algo que el lector aún no soporta. En AutoCAD usa <b>Guardar como → DXF</b> y súbelo así.</div>`; $("btnDxfImportar").disabled = true; }
    } else prepararDxf(new TextDecoder().decode(buf), f.name);
  }
  $("btnDxfEjemplo").addEventListener("click", () => prepararDxf(DXF.ejemplo(), "ejemplo.dxf"));
  function prepararDxf(entrada, nombre) {
    try {
      const d = typeof entrada === "string" ? DXF.leer(entrada) : entrada;
      if (!d.ent.length) throw new Error("No encontré líneas, polilíneas ni bloques en el espacio modelo del archivo.");
      dxfLeido = d;
      const rolesIni = {}; for (const c in d.capas) rolesIni[c] = DXF.rolSugerido(c);
      const esc = DXF.escalaSugerida(d, rolesIni);
      const filas = Object.entries(d.capas).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<tr><td>${c.replace(/</g, "&lt;")}</td><td>${n}</td><td><select data-capa="${encodeURIComponent(c)}">
        ${[["columnas", "Columnas"], ["placas", "Placas"], ["ejes", "Ejes"], ["vigas", "Vigas (eje de la viga)"], ["ignorar", "Ignorar"]].map(([v, t]) => `<option value="${v}" ${DXF.rolSugerido(c) === v ? "selected" : ""}>${t}</option>`).join("")}</select></td></tr>`).join("");
      $("dxfInfo").innerHTML = `<p><b>${nombre}</b>: ${d.ent.length} entidades en ${Object.keys(d.capas).length} capas.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><label>Unidades del dibujo <select id="dxfEsc">${[[1, "metros"], [0.01, "centímetros"], [0.001, "milímetros"]].map(([v, t]) => `<option value="${v}" ${v === esc.u ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Escala del dibujo <select id="dxfFac">${[...new Set([...DXF.ESCALAS, esc.f])].sort((a, b) => a - b).map(f => `<option value="${f}" ${f === esc.f ? "selected" : ""}>${f === 1 ? "1:1 (tamaño real)" : "1:" + f}</option>`).join("")}</select></label></div>
        ${esc.texto ? `<p class="hint">Escala leída del plano: «${esc.texto.replace(/</g, "&lt;")}».</p>` : ""}
        <div id="dxfResumen" class="msg"></div>
        <div class="scroll"><table class="wrap"><thead><tr><th>Capa</th><th>Objetos</th><th>Qué es</th></tr></thead><tbody>${filas}</tbody></table></div>
        <label class="check"><input id="dxfVigas" type="checkbox" checked> Crear vigas sobre los ejes, de columna a columna (${st.secc.viga[0]} × ${st.secc.viga[1]} m)</label>
        <label class="check"><input id="dxfLosas" type="checkbox" checked> Crear losas en los paños cerrados</label>
        <p class="hint">Las columnas se leen de polilíneas cerradas (rectángulos, también girados) o bloques; las placas, de rectángulos delgados. Revisa el resultado en la planta: puedes corregir todo con el editor.</p>`;
      $("dxfInfo").querySelectorAll("select, input").forEach(x => x.addEventListener("change", resumenDxf));
      resumenDxf();
      $("btnDxfImportar").disabled = false;
    } catch (err) { $("dxfInfo").innerHTML = `<div class="msg bad">${err.message}</div>`; $("btnDxfImportar").disabled = true; }
  }
  const rolesDxf = () => { const roles = {}; $("dxfInfo").querySelectorAll("select[data-capa]").forEach(s => { roles[decodeURIComponent(s.dataset.capa)] = s.value; }); return roles; };
  const escalaDxf = () => +$("dxfEsc").value * +$("dxfFac").value;
  // vista previa de lo que saldrá, para comprobar la escala antes de importar
  function resumenDxf() {
    const el = $("dxfResumen"); if (!el || !dxfLeido) return;
    try {
      const rr = DXF.importar(dxfLeido, rolesDxf(), { escala: escalaDxf(), viga: st.secc.viga, placaT: st.secc.placaT, vigasPorEjes: $("dxfVigas").checked, losas: false }), p = rr.plano;
      const sinEjes = !Object.values(rolesDxf()).includes("ejes");
      if (!p.columnas.length && !p.placas.length) { el.className = "msg bad"; el.innerHTML = "Con estas capas no sale ninguna columna ni placa: marca como <strong>Columnas</strong> la capa donde están dibujadas." + (sinEjes ? " Tampoco hay capa de ejes: ¿es una lámina de detalles? Sube la planta (encofrado o techo)." : ""); return; }
      const cuenta = {}; p.columnas.forEach(c => { const k = `${f2(c.b)} × ${f2(c.h)}`; cuenta[k] = (cuenta[k] || 0) + 1; });
      const tipica = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0];
      // tamaño de la estructura (caras exteriores de columnas y placas; los ejes suelen salirse del edificio)
      const xs = [], ys = [];
      p.columnas.forEach(c => { const r = Math.max(c.b, c.h) / 2; xs.push(c.x - r, c.x + r); ys.push(c.y - r, c.y + r); });
      p.placas.forEach(w => { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]); });
      const ax = Math.max(...xs) - Math.min(...xs), ay = Math.max(...ys) - Math.min(...ys);
      const raro = p.columnas.length && (+tipica.split(" × ")[0] < 0.15 || +tipica.split(" × ")[0] > 1.5) || Math.max(ax, ay) > 200 || Math.max(ax, ay) < 2;
      el.className = "msg " + (raro ? "bad" : "ok");
      el.innerHTML = `Saldrán <strong>${p.columnas.length} columnas</strong>${p.columnas.length ? ` (la mayoría de ${tipica} m)` : ""}, ${p.placas.length} placas y ${p.vigas.length} vigas, en una planta de <strong>${f2(ax)} × ${f2(ay)} m</strong>.` +
        (raro ? " Estas medidas no parecen reales: cambia las unidades o la escala del dibujo." : " Si las medidas no coinciden con tu plano, cambia la escala.") +
        (rr.avisos.length ? " <br>" + rr.avisos.join(" ") : "") +
        (sinEjes ? " <br>Ojo: no hay capa de <strong>Ejes</strong>. Si la lámina es de detalles o cortes, mejor sube la planta de encofrado o de techo." : "");
    } catch (e) { el.className = "msg bad"; el.textContent = e.message; }
  }
  const f2 = (v) => (+v).toFixed(2);
  $("btnDxfImportar").addEventListener("click", () => {
    if (!dxfLeido) return;
    const roles = rolesDxf();
    const r = DXF.importar(dxfLeido, roles, { escala: escalaDxf(), viga: st.secc.viga, placaT: st.secc.placaT, vigasPorEjes: $("dxfVigas").checked, losas: $("dxfLosas").checked });
    if (!r.plano.columnas.length && !r.plano.placas.length) { $("dxfInfo").insertAdjacentHTML("afterbegin", `<div class="msg bad">No salió ninguna columna ni placa: revisa qué capa es de columnas.</div>`); return; }
    CAD.cambiar(p => Object.assign(p, r.plano));
    $("dlgDxf").close(); mostrarVista("planta"); CAD.zoomExtension();
    const p = r.plano;
    $("estado").textContent = `Importado: ${p.columnas.length} columnas, ${p.placas.length} placas, ${p.vigas.length} vigas y ${p.losas.length} losas. ${r.avisos.join(" ")}`;
    if (p.placas.length && st.sistemaX === "PÓRTICOS") { st.sistemaX = st.sistemaY = "DUAL"; aForm(); }
  });

  // ------------------------------------------------------------ 3D
  function redibujar3D() { try { Visor.dibujar(construirModelo(st), cotas(st)); necesita3D = false; actualizarVista(); } catch (e) { console.error(e); } }
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
  function analizar(cambiarVista = true) {
    deForm();
    const rv = revisar();
    if (rv.err.length) { $("estado").innerHTML = `<span style="color:var(--bad)">${rv.err.join(" ")}</span>`; return; }
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
        ultimo = r; st.colTipica = colTipica();
        $("estado").textContent = `Listo en ${((performance.now() - t) / 1000).toFixed(2)} s · ${Object.keys(model.nodes).length} nudos en planta, ${r.B.elems.length} elementos.`;
        mostrar(r);
        $("selModo").innerHTML = `<option value="">Sin animación</option>` + r.modes.map((m, i) => `<option value="${i}">Modo ${m.n} · T = ${m.T.toFixed(3)} s</option>`).join("");
        $("selModo").value = "0"; $("modoVista").value = "deriva";
        if (cambiarVista) mostrarVista("3d"); else necesita3D = true;
        redibujar3D();
      } catch (e) {
        console.error(e);
        $("estado").innerHTML = `<span style="color:var(--bad)">No se pudo analizar: ${e.message}</span>`;
      }
    }, 20);
  }
  $("btnAnalizar").addEventListener("click", () => analizar(true));


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
      $("selModo").value = tr.dataset.i; mostrarVista("3d"); actualizarVista();
      document.querySelectorAll("#tablaModos tr").forEach(o => o.classList.toggle("sel", o === tr));
      document.querySelector(".tabs-vista").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    $("predim").innerHTML = tips.map((m, i) => `<div class="msg ${m.tipo === "warn" ? "warn" : ""}"><b>${m.titulo}</b>${m.texto}<div class="art">${m.art}</div>${m.aplicar ? `<button class="small" data-i="${i}" style="margin-top:6px">Usar en todo el edificio</button>` : ""}</div>`).join("");
    $("predim").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const a = tips[+b.dataset.i].aplicar;
      if (a.colB) { st.secc.col = [a.colB, a.colH]; aTodas("columnas", c => { c.b = a.colB; c.h = a.colH; }); }
      if (a.vigB) { st.secc.viga = [a.vigB, a.vigH]; aTodas("vigas", v => { v.bw = a.vigB; v.h = a.vigH; }); }
      if (a.losaH) { const p = Asistente.pesoAligerado(a.losaH); st.cargas.cm = p + 200; st.cargas.cmRoof = p + 100; }
      aForm(); guardarLocal(); cambioModelo();
      b.textContent = "Aplicado ✓";
    }));
  });

  // ------------------------------------------------------------ informe imprimible
  $("btnInforme").addEventListener("click", () => {
    if (!ultimo) { $("estado").textContent = "Primero analiza el edificio para generar el informe."; return; }
    const r = ultimo; mostrarVista("3d");
    setTimeout(() => {
      const img = Visor.captura();
      $("informe").innerHTML = `<h1>${r.st.nombre || "Proyecto"}</h1>
        <p>Análisis sísmico con la Norma E.030-2026 · SismoPaso (prototipo educativo) · ${new Date().toLocaleDateString("es-PE")}</p>
        <img src="${img}" style="max-width:100%;max-height:300px">
        ${$("resultados").innerHTML}`;
      window.print();
    }, 300);
  });

  // ------------------------------------------------------------ guardar / abrir / ejemplo / tema
  $("btnGuardar").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(st, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (st.nombre || "proyecto").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + ".sismopaso.json"; a.click();
  });
  $("fileAbrir").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { st = cargar(JSON.parse(await file.text())); aForm(); guardarLocal(); ultimo = null; cambioModelo(); CAD.zoomExtension(); $("resultados").innerHTML = '<div class="vacio">Proyecto abierto. Pulsa <b>Analizar sismo</b>.</div>'; }
    catch (err) { $("estado").textContent = "No se pudo leer el archivo."; }
    e.target.value = "";
  });
  $("btnEjemplo").addEventListener("click", () => { st = nuevoEjemplo(); aForm(); guardarLocal(); CAD.zoomExtension(); cambioModelo(); analizar(false); });
  // tema claro/oscuro y paleta de colores (se recuerdan en este navegador)
  const LOOK = "sismopaso.look";
  const look = (() => { try { return JSON.parse(localStorage.getItem(LOOK)) || {}; } catch (e) { return {}; } })();
  const aplicarLook = (repintar) => {
    const d = document.documentElement;
    if (look.tema) d.dataset.theme = look.tema; else delete d.dataset.theme;
    d.dataset.pal = look.pal || "azul";
    document.querySelectorAll("#palpop [data-pal]").forEach(b => b.setAttribute("aria-pressed", b.dataset.pal === d.dataset.pal));
    try { localStorage.setItem(LOOK, JSON.stringify(look)); } catch (e) { }
    if (repintar) { Visor.tema(); redibujar3D(); CAD.dibujar(); }
  };
  aplicarLook(false);
  $("btnTema").addEventListener("click", () => {
    const d = document.documentElement, oscuro = d.dataset.theme ? d.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    look.tema = oscuro ? "light" : "dark"; aplicarLook(true);
  });
  const pop = $("palpop"), pb = $("palbtn"), verPop = (o) => { pop.hidden = !o; pb.setAttribute("aria-expanded", o); };
  pb.addEventListener("click", (e) => { e.stopPropagation(); verPop(pop.hidden); });
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) verPop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") verPop(false); });
  pop.querySelectorAll("[data-pal]").forEach(b => b.addEventListener("click", () => { look.pal = b.dataset.pal; aplicarLook(true); verPop(false); }));

  // ------------------------------------------------------------ inicio
  $("uso").innerHTML = Object.entries(Asistente.USOS).map(([k, u]) => `<option value="${k}">${u.nombre}</option>`).join("");
  const guardado = leerLocal(); if (guardado) st = cargar(guardado);
  aForm();
  CAMPOS.forEach(id => $(id).addEventListener("change", deForm));
  Visor.init($("visor"));
  requestAnimationFrame(() => { CAD.zoomExtension(); revisar(); analizar(false); });
})();
