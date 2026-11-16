// Compara el motor con los resultados de ETABS 22 (casos de etabs_auto). Uso: node test/validacion.js
const I = require("../src/irreg.js"); const { grid, placas } = require("./casos.js");
const P = { zona: 4, suelo: "S2", categoria: "C" };
const W4 = [["B1","C1"],["B4","C4"],["A2","A3"],["D2","D3"]];
const casos = [
  ["02b pórticos 60x60", grid(0.6,[0.3,0.6]), { ...P }, { T1: 0.382, T3: 0.334, P: 787.59, Vx: 121.83, Vd: 104.10, dX: 0.0055, Ip: 1 }],
  ["01 pórticos 40x40 (S=1.05)", grid(0.4,[0.25,0.5]), { ...P, S: 1.05, norma: "2018" }, { T1: 0.610, T3: 0.531, P: 660.80, Vx: 95.90, Vd: 84.70, dX: 0.0127, Ip: 1 }],
  ["03 planta en L", grid(0.4,[0.25,0.5],0,[[1,1],[2,1],[1,2],[2,2]]), { ...P }, { T1: 0.563, T3: 0.512, P: 393.77, Vx: 67.68, Vd: 59.05, dX: 0.0147, Ip: 0.9 }],
  ["02c placas (muros)", placas(0.25,0.4,[0.25,0.5],W4), { ...P, sistemaX: "MUROS" }, { T1: 0.172, T3: 0.118, P: 780.79, Vx: 161.04, Vd: 124.15, dX: 0.0011, Ip: 1 }],
  ["02d placas (dual)", placas(0.20,0.5,[0.25,0.5],W4), { ...P, sistemaX: "DUAL" }, { T1: 0.169, T3: 0.116, P: 788.47, Vx: 139.39, Vd: 109.39, dX: 0.0010, Ip: 1 }],
  ["04 torsión (placas en un borde)", placas(0.20,0.4,[0.25,0.5],[["A1","A2"],["A3","A4"]]), { ...P, sistemaX: "DUAL" }, { T1: 0.611, T3: 0.192, P: 708.79, Vx: 205.05, Vd: 179.69, dX: 0.0148, Ip: 0.6 }],
];
const fmt = (a, b, d) => `${a.toFixed(d)} | ${b.toFixed(d)} | ${(100 * (a - b) / b).toFixed(1)}%`;
let md = "| Caso | Magnitud | SismoPaso | ETABS 22 | Diferencia |\n|---|---|---|---|---|\n";
const ancha = [];
for (const [n, m, p, e] of casos) {
  const r = I.analizarTodo(Object.assign({}, m, { wallModel: "lamina" }), p);
  if (m.walls && m.walls.length) { const ra = I.analizarTodo(m, p); ancha.push(`| ${n} | ${fmt(ra.modes[0].T, e.T1, 3)} | ${fmt(r.modes[0].T, e.T1, 3)} |`); }
  const v = { T1: r.modes[0].T, T3: r.modes[2].T, P: r.P, Vx: r.dirs[0].Vest, Vd: r.dirs[0].Vdin, dX: r.derivaMax.X, Ip: r.irreg.Ip };
  const rows = [["T1 (s)", "T1", 3], ["T3 (s)", "T3", 3], ["Peso sísmico (t)", "P", 2], ["V estático X (t)", "Vx", 2], ["V dinámico X (t)", "Vd", 2], ["Deriva máx. X", "dX", 4], ["Ip", "Ip", 2]];
  rows.forEach(([lbl, k, d], i) => { md += `| ${i ? "" : n} | ${lbl} | ${fmt(v[k], e[k], d)} |\n`; });
}
md += "\nPlacas: columna ancha (modelo anterior) frente a lámina (modelo actual), periodo T1:\n\n| Caso | Columna ancha | ETABS 22 | Dif. | Lámina | ETABS 22 | Dif. |\n|---|---|---|---|---|---|---|\n" + ancha.join("\n") + "\n";
console.log(md);
