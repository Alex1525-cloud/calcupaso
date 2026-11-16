const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js"); const Dz = require("../src/diseno.js"); const ISE = require("../src/ise.js");
const correr = (p, opc = {}, prm = {}) => {
  const { model } = Pl.aModelo(Object.assign({}, p, { losaTipo: { tipo: "aligerada1", h: 0.2 } }), { n: 3, h1: 2.6, h: 2.6 }, 210, { cm: 200, cmRoof: 100, cv: 200, cvRoof: 100, cvEsc: 200 }, true);
  Object.assign(model, opc); return [model, I.analizarTodo(model, Object.assign({ zona: 4, suelo: "S2", categoria: "C" }, prm))];
};
// 1) vivienda de albañilería: muros en el perímetro y uno central en cada dirección
const p = Pl.desdeEjes([4, 4], [4, 4], { col: [0.25, 0.25], viga: [0.25, 0.20], placaT: 0.13 });
for (const [a, b] of [[[0, 0], [8, 0]], [[0, 8], [8, 8]], [[0, 0], [0, 8]], [[8, 0], [8, 8]], [[4, 0], [4, 8]], [[0, 4], [8, 4]]]) p.placas.push({ id: "m" + a + b, a, b, t: 0.13, mat: "alb", fm: 65, vm: 8.1 });
const [m1, r1] = correr(p, {}, { sistemaX: "ALBAÑILERÍA", sistemaY: "ALBAÑILERÍA" });
const fz = F.calcular(r1), d = Dz.disenar(r1, fz, { fc: 210, fy: 4200, qadm: 1.0, Df: 1.0, porticos: false });
console.log("albañilería: T1", r1.modes[0].T.toFixed(3), "límite deriva", r1.q.derivaLim, "deriva", r1.derivaMax.X.toFixed(5), "sistema calc.", r1.dirs.map(D => D.sistemaCalc).join("/"), "| muros", d.muros.length, "fallan", d.muros.filter(m => m.falla).length);
const mu = d.muros.find(m => m.k === 1); console.log(" muro", mu.donde, "σ", mu.sigma.toFixed(2), "/", mu.sigAdm.toFixed(2), "Ve", mu.Ve.toFixed(2), "Vm", mu.Vm.toFixed(2), mu.nota);
console.log(" global piso 1:", d.albGlobal.filter(g => g.piso === "Piso1").map(g => `${g.dir}: ΣVm ${g.Vm.toFixed(1)} vs VE ${g.VE.toFixed(1)}`).join(" · "));
const cc = d.zapatas.find(z => z.ciclopeo); console.log(" cimiento corrido", cc.donde, `B = ${cc.Lz} m, h = ${cc.hz} m, Df = ${cc.Df}`, cc.nota);
// 2) ISE: el periodo crece y la base se mueve
const q = Pl.desdeEjes([5, 5, 5], [5, 5, 5], { col: [0.5, 0.5], viga: [0.3, 0.6] });
const [m2, r2] = correr(q);
const rs = ISE.resortes(m2, { qadm: 1.5, Df: 1.5, suelo: "S2", fc: 210, fy: 4200 });
const [, r3] = correr(q, { springs: rs.springs });
console.log("ISE S2: G", rs.G.toFixed(0), "t/m² · T1 empotrado", r2.modes[0].T.toFixed(4), "→ con resortes", r3.modes[0].T.toFixed(4), `(+${(100 * (r3.modes[0].T / r2.modes[0].T - 1)).toFixed(1)}%)`, "· deriva", r2.derivaMax.X.toFixed(5), "→", r3.derivaMax.X.toFixed(5), "· zapata típica", rs.info[5].Ly + "×" + rs.info[5].Lz, "Kz", rs.info[5].Kz.toFixed(0));
const rs4 = ISE.resortes(m2, { qadm: 0.8, Df: 1.5, suelo: "S3", fc: 210, fy: 4200 }); const [, r4] = correr(q, { springs: rs4.springs });
console.log("ISE S3: T1", r4.modes[0].T.toFixed(4), `(+${(100 * (r4.modes[0].T / r2.modes[0].T - 1)).toFixed(1)}%)`);
const f3 = F.calcular(r3); console.log(" equilibrio con resortes: CM", f3.totD.toFixed(2), "vs", (r3.B.cargas.PP + r3.B.cargas.CM).toFixed(2));
