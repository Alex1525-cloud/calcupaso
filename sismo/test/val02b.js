const E = require("../src/e030.js"); const {grid}=require("./casos.js");
const r = E.analizar(grid(0.6,[0.3,0.6]), {zona:4,suelo:"S2",categoria:"C",sistemaX:"PÓRTICOS"});
console.log("P",r.P.toFixed(2), r.dirs.map(d=>[d.T.toFixed(4),d.C,d.k,d.Vest.toFixed(2),d.Vdin.toFixed(2),d.factorEscala.toFixed(3)].join(" ")));
console.table(r.derivas.map(d=>({piso:d.piso,inX:d.inX.toFixed(5),inY:d.inY.toFixed(5),ratio:d.ratioX.toFixed(3)})));
