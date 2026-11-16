// Fase 6: diafragma flexible (membrana de la losa) y aberturas grandes
const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js"); const S = require("../src/solver.js");
const cargas = { cm: 200, cmRoof: 100, cv: 200, cvRoof: 100, cvEsc: 200 };
function correr(p, losa, diafragma) {
  const { model } = Pl.aModelo(Object.assign({}, p, { losaTipo: losa, diafragma }), { n: 4, h1: 3, h: 3 }, 210, cargas, true);
  const t = Date.now(), r = I.analizarTodo(model, { zona: 4, suelo: "S2", categoria: "C" });
  return { r, ms: Date.now() - t };
}
const p = Pl.desdeEjes([5, 5, 5], [5, 5, 5], { col: [0.5, 0.5], viga: [0.3, 0.6] });
for (const losa of [{ tipo: "maciza", h: 0.2 }, { tipo: "aligerada1", h: 0.2 }]) {
  const a = correr(p, losa, "rigido"), b = correr(p, losa, "flexible");
  const f = F.calcular(b.r);
  console.log(`${losa.tipo}: T1 rígido ${a.r.modes[0].T.toFixed(4)} · flexible ${b.r.modes[0].T.toFixed(4)} (${(100 * (b.r.modes[0].T / a.r.modes[0].T - 1)).toFixed(2)}%) · masa UX ${(100 * b.r.modes.reduce((s, m) => s + m.UX, 0)).toFixed(1)}% · Vdin X ${a.r.dirs[0].Vdin.toFixed(1)} → ${b.r.dirs[0].Vdin.toFixed(1)} · deriva ${a.r.derivaMax.X.toFixed(4)} → ${b.r.derivaMax.X.toFixed(4)} · equilibrio CM ${f.totD.toFixed(2)} vs ${(b.r.B.cargas.PP + b.r.B.cargas.CM).toFixed(2)} · ${b.ms} ms`);
}
// planta en L larga (40 x 5 m) con placas solo en los extremos: el diafragma flexible se nota
const q = Pl.desdeEjes([5, 5, 5, 5, 5, 5, 5, 5], [5], { col: [0.4, 0.4], viga: [0.25, 0.5] });
q.placas = [{ a: [0, 0], b: [0, 5], t: 0.25 }, { a: [40, 0], b: [40, 5], t: 0.25 }];
for (const losa of [{ tipo: "maciza", h: 0.15 }, { tipo: "aligerada1", h: 0.2 }]) {
  const a = correr(q, losa, "rigido"), b = correr(q, losa, "flexible");
  const ux = b.r.modes.find(m => m.UY > 0.3);
  console.log(`edificio largo ${losa.tipo}: T(Y) rígido ${a.r.dirs[1].T.toFixed(4)} · flexible ${b.r.dirs[1].T.toFixed(4)} · deriva Y ${a.r.derivaMax.Y.toFixed(4)} → ${b.r.derivaMax.Y.toFixed(4)} · ${b.ms} ms`);
}
// abertura grande: vacío en el paño central
const v = JSON.parse(JSON.stringify(p)); v.losas.forEach(l => { const cx = l.pts.reduce((s, z) => s + z[0], 0) / l.pts.length, cy = l.pts.reduce((s, z) => s + z[1], 0) / l.pts.length; if (Math.abs(cx - 7.5) < 1 && Math.abs(cy - 7.5) < 1) l.tipo = "vacio"; });
const c = correr(v, { tipo: "aligerada1", h: 0.2 }, "flexible");
console.log("con vacío central (flexible): T1", c.r.modes[0].T.toFixed(4), "· aberturas:", c.r.irreg.lista.filter(x => x.presente).map(x => x.nombre).join(", ") || "ninguna", "· CR piso 1", ...((z) => [z.xcr.toFixed(2), z.ycr.toFixed(2)])(S.centros(c.r.B)[0]));
// losa muy gruesa: el diafragma flexible tiende al rígido (edificio cuadrado)
{ const a = correr(p, { tipo: "maciza", h: 0.2 }, "rigido"), b = correr(p, { tipo: "maciza", h: 0.2 }, "flexible");
  const ca = S.centros(a.r.B)[0], cb = S.centros(b.r.B)[0];
  console.log("CR rígido", ca.xcr.toFixed(3), ca.ycr.toFixed(3), "· flexible", cb.xcr.toFixed(3), cb.ycr.toFixed(3)); }
// fuerzas y diseño con diafragma flexible y placas-lámina
{ const D = require("../src/diseno.js");
  const b = correr(q, { tipo: "maciza", h: 0.15 }, "flexible"); const f = F.calcular(b.r);
  const d = D.disenar(b.r, f, { fc: 210, fy: 4200, qadm: 2, Df: 1.5 });
  console.log("largo flexible: equilibrio CM", f.totD.toFixed(2), "vs", (b.r.B.cargas.PP + b.r.B.cargas.CM).toFixed(2), "· vigas", d.vigas.length, "placas", d.placas.length, "zapatas", d.zapatas.length); }
