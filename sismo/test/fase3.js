const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js");
const base = (fn) => { const p = Pl.desdeEjes([5,5,5],[5,5,5],{col:[0.5,0.5],viga:[0.3,0.6]}); if (fn) fn(p); return p; };
const correr = (p, opc = {}, pisos = { n: 4, h1: 3.2, h: 2.8 }, prm = {}) => {
  const { model } = Pl.aModelo(Object.assign({}, p, { losaTipo: { tipo: "aligerada1", h: 0.2 } }), pisos, 210, { cm: 200, cmRoof: 100, cv: 200, cvRoof: 100, cvEsc: 200 }, true);
  Object.assign(model, opc); return I.analizarTodo(model, Object.assign({ zona: 4, suelo: "S2", categoria: "C" }, prm));
};
const est = (r, c) => r.irreg.lista.find(v => v.clave === c);
let t = Date.now(); const r0 = correr(base()); console.log("base:", Date.now() - t, "ms · T1", r0.modes[0].T.toFixed(4), "deriva", r0.derivaMax.X.toFixed(5), "| débil:", est(r0, "debil").presente, est(r0, "debil").detalle.join(" "), "| resist piso1/2 X:", r0.resistencia.slice(0, 2).map(x => x.X.toFixed(0)).join("/"));
// P-Δ: periodo mayor y deriva mayor
const r1 = correr(base(), { pDelta: true }); console.log("con P-Δ: T1", r1.modes[0].T.toFixed(4), `(+${(100 * (r1.modes[0].T / r0.modes[0].T - 1)).toFixed(2)}%)`, "deriva", r1.derivaMax.X.toFixed(5));
// piso débil: piso 1 alto (4.5 m) y columnas del piso 1 más chicas -> no; usamos piso 1 de 5 m
const r2 = correr(base(), {}, { n: 4, h1: 5.5, h: 2.8 }); console.log("piso 1 de 5,5 m: débil", est(r2, "debil").presente || est(r2, "debil_ext").presente, [...est(r2, "debil").detalle, ...est(r2, "debil_ext").detalle].join(" | "));
// no paralelos: una placa a 45°
const r3 = correr(base(p => p.placas.push({ id: "w", a: [0, 0], b: [3, 3], t: 0.25 }))); console.log("placa a 45°:", est(r3, "no_paralelos").presente, est(r3, "no_paralelos").detalle.join(" | "));
// sismo vertical
const r4 = correr(base(), {}, undefined, {}); r4.params = { vertical: true }; const f4 = F.calcular(r4); console.log("vertical: Tv", f4.vertical.Tv.toFixed(3), "s · Cv", f4.vertical.Cv.toFixed(2), "· ev", f4.vertical.ev.toFixed(3));
