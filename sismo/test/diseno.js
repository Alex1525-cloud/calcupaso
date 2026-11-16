const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js"); const Dz = require("../src/diseno.js");
// 1) flexión: viga 30x60, Mu = 20 t·m, f'c 210 -> As ≈ 10,5 cm² (cálculo a mano)
console.log("As(20 t·m, 30x60) =", Dz.asFlexion(20e5, 30, 54, 210, 4200).toFixed(2), "cm² (a mano ≈ 10,57)");
// 2) columna 40x40 con 8 Ø 3/4": P0 y punto de flexión pura vs a mano
const s = { b: 0.4, h: 0.4 }, sl = Dz.seccionLocal(s), pos = Dz.barrasContorno(sl.poly, 6, 8, false);
const cv = Dz.curva(sl.fib, pos.map(([y, z]) => [y, z, 2.84]), 0, 1, 210, 4200, sl.Ag, false);
console.log("P0 =", (cv.P0 / 1000).toFixed(1), "t (a mano 0,85·210·(1600−22,7)+4200·22,7 = 376,9 t)", "| φPn máx =", (cv.cap / 1000).toFixed(1), "t (0,8·0,7·P0 = 211,1)");
console.log("φMn con P = 0:", (cv.pts.find(p => p[0] >= 0) ? 0 : 0) || "", "φMn(P≈0) ≈", (cv.pts.reduce((b, p) => Math.abs(p[0]) < Math.abs(b[0]) ? p : b)[1] / 1e5).toFixed(2), "t·m");
for (const [nom, sx, sy, placas] of [["pórticos 3x3, 4 pisos", "PÓRTICOS", "PÓRTICOS", false], ["con placas", "DUAL", "DUAL", true]]) {
  const p = Pl.desdeEjes([5,5,5],[5,5,5],{col:[0.6,0.6],viga:[0.3,0.6],placaT:0.25});
  if (placas) { p.placas.push({ id: "w1", a: [5, 0], b: [10, 0], t: 0.25 }, { id: "w2", a: [5, 15], b: [10, 15], t: 0.25 }, { id: "w3", a: [0, 5], b: [0, 10], t: 0.25 }, { id: "w4", a: [15, 5], b: [15, 10], t: 0.25 }); }
  const { model } = Pl.aModelo(Object.assign({}, p, { losaTipo: { tipo: "aligerada1", h: 0.2 } }), { n: 4, h1: 3.2, h: 2.8 }, 210, { cm: 200, cmRoof: 100, cv: 200, cvRoof: 100, cvEsc: 200 }, true);
  const r = I.analizarTodo(model, { zona: 4, suelo: "S2", categoria: "C", sistemaX: sx, sistemaY: sy });
  const t0 = Date.now(), fz = F.calcular(r), d = Dz.disenar(r, fz, { fc: 210, fy: 4200, qadm: 1.5, Df: 1.5, porticos: sx === "PÓRTICOS" });
  console.log(`\n${nom}: ${Date.now() - t0} ms · vigas ${d.vigas.length} (fallan ${d.vigas.filter(v => v.falla).length}) · columnas ${d.columnas.length} (fallan ${d.columnas.filter(v => v.falla).length}) · placas ${d.placas.length} · zapatas ${d.zapatas.length}`);
  const v = d.vigas.find(v => v.k === 1); console.log(" viga", v.donde, "Mu", JSON.stringify(v.Mu, (k, x) => typeof x === "number" ? +x.toFixed(2) : x), "sup", v.barras.supI.txt, "inf", v.barras.infC.txt, "Vu", v.Vu.toFixed(1), v.est.txt);
  const c = d.columnas.filter(c => c.k === 1).sort((a, b) => b.Pu - a.Pu)[0]; console.log(" columna", c.donde, "Pu", c.Pu.toFixed(1), c.txt, "ratio", c.ratio && c.ratio.toFixed(2), c.est && c.est.txt, c.nota);
  if (d.placas.length) { const w = d.placas.find(w => w.k === 1); console.log(" placa", w.donde, "Mu", w.Mu.toFixed(1), "Pu", w.Pu.toFixed(1), "núcleos", w.txtN, "horiz", w.txtH, "vert", w.txtV, "amp", w.amp.toFixed(2), "confinar", w.confinar, w.nota); }
  const z = d.zapatas.sort((a, b) => b.Ps - a.Ps)[0]; console.log(" zapata", z.donde, `${z.Ly} × ${z.Lz} × ${z.hz} m, Ps ${z.Ps.toFixed(1)} t, qn ${z.qn.toFixed(1)} t/m²`, z.ay.txt, z.az.txt, z.traslape ? "traslapa" : "", z.nota);
}
