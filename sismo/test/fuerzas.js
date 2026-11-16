const Pl = require("../src/plano.js"); const I = require("../src/irreg.js"); const F = require("../src/fuerzas.js");
const casos = [["1 paño 5x5, 1 piso", [5], [5], 1], ["3x3 paños, 4 pisos", [5,5,5], [5,5,5], 4], ["paños 6x4", [6,6], [4,4], 3]];
for (const [nom, ex, ey, n] of casos) {
  const p = Pl.desdeEjes(ex, ey, {col:[0.6,0.6],viga:[0.3,0.6]});
  const {model} = Pl.aModelo(p, {n, h1:3, h:3}, 210, {cm:500,cmRoof:400,cv:200,cvRoof:100}, true);
  const r = I.analizarTodo(model, {zona:4,suelo:"S2",categoria:"C"});
  const t0 = Date.now(), f = F.calcular(r), ms = Date.now() - t0;
  const c = r.B.cargas, pesoD = c.PP + c.CM, pesoL = c.CV + c.CVT;
  console.log(nom, `| reacciones CM ${f.totD.toFixed(2)} vs pesos ${pesoD.toFixed(2)} | CV ${f.totL.toFixed(2)} vs ${pesoL.toFixed(2)} | sinViga ${f.sinViga} | ${ms} ms`);
  if (Math.abs(f.totD - pesoD) > 0.01 * pesoD || Math.abs(f.totL - pesoL) > 0.01 * pesoL) { console.log("  ERROR: no cierra el equilibrio"); process.exitCode = 1; }
  // cortante basal sísmico: suma de cortantes de columnas del piso 1 ≈ Vdin escalado (CQC no es aditivo: solo orden de magnitud)
  const vigas = f.elems.filter(o => o.e.type === "beam" && o.e.k === 1);
  const v = vigas[0], M = v.D.M, L = v.e.L;
  console.log("  viga piso 1:", "L", L.toFixed(2), "M CM izq/centro/der", M[0].toFixed(2), M[4].toFixed(2), M[8].toFixed(2), "| sismo X izq", v.SX.M[0].toFixed(2), "| env. izq", JSON.stringify(F.envolvente(v, "M", 0)));
  const col = f.elems.find(o => o.e.type === "col" && o.e.k === 1);
  console.log("  columna piso 1: P CM", col.D.P[0].toFixed(2), "P CV", col.L.P[0].toFixed(2), "M3 SX abajo", col.SX.M3[0].toFixed(2), "M2 SY abajo", col.SY.M2[0].toFixed(2));
}
// viga biempotrada aislada: carga uniforme -> M extremos = -wL²/12, centro = +wL²/24
const S = require("../src/solver.js");
