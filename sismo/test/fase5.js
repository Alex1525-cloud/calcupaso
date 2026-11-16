const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js");
// edificio con retranqueo: la crujía de x = 10..15 solo llega al piso 2
const p = Pl.desdeEjes([5, 5, 5], [5, 5, 5], { col: [0.5, 0.5], viga: [0.3, 0.6] });
const ret = (o, xs) => xs.every(x => x >= 10 - 1e-6) && xs.some(x => x > 10 + 1e-6);
p.columnas.forEach(c => { if (c.x > 10 + 1e-6) c.pisos = [1, 2]; });
p.vigas.forEach(v => { if (ret(v, [v.a[0], v.b[0]])) v.pisos = [1, 2]; });
p.losas.forEach(l => { if (ret(l, l.pts.map(q => q[0]))) l.pisos = [1, 2]; });
console.log("revisar:", JSON.stringify(Pl.revisar(p, 4)));
const { model } = Pl.aModelo(Object.assign({}, p, { losaTipo: { tipo: "aligerada1", h: 0.2 } }), { n: 4, h1: 3, h: 3 }, 210, { cm: 200, cmRoof: 100, cv: 200, cvRoof: 100, cvEsc: 200 }, true);
const r = I.analizarTodo(model, { zona: 4, suelo: "S2", categoria: "C" });
console.log("pesos por piso:", r.B.levels.map(L => L.W.toFixed(1)).join(" / "), "· T1", r.modes[0].T.toFixed(3));
console.log("irregularidades:", r.irreg.lista.filter(v => v.presente).map(v => v.nombre + ": " + v.detalle[0]).join(" | "));
const f = F.calcular(r); console.log("equilibrio CM", f.totD.toFixed(2), "vs", (r.B.cargas.PP + r.B.cargas.CM).toFixed(2), "· CV", f.totL.toFixed(2), "vs", (r.B.cargas.CV + r.B.cargas.CVT).toFixed(2));
// piso sin losa -> error
const q = JSON.parse(JSON.stringify(p)); q.losas.forEach(l => l.pisos = [1, 3]); console.log("sin losa en piso 4:", Pl.revisar(q, 4).err.join(" "));
