const E = require("../src/e030.js"); const {grid,placas}=require("./casos.js");
function show(nombre, m, p){ const r=E.analizar(m,p);
 console.log("==",nombre,"P",r.P.toFixed(2),"T",r.modes.slice(0,6).map(m=>m.T.toFixed(3)).join(" "));
 console.log(r.modes.slice(0,3).map(m=>[m.UX,m.UY,m.RZ].map(v=>(100*v).toFixed(1)).join("/")).join("  "));
 for(const d of r.dirs) console.log(" dir",d.d,"T",d.T.toFixed(3),"C",d.C.toFixed(3),"k",d.k.toFixed(3),"Vest",d.Vest.toFixed(2),"Vdin",d.Vdin.toFixed(2),"f",d.factorEscala.toFixed(3),"muros",(100*d.fracMuros).toFixed(0)+"%");
 console.log(" derivas X", r.derivas.map(d=>d.inX.toFixed(4)).join(" "), " Y", r.derivas.map(d=>d.inY.toFixed(4)).join(" "), " ratioY", r.derivas.map(d=>d.ratioY.toFixed(2)).join(" "));
 return r;}
const W4=[["B1","C1"],["B4","C4"],["A2","A3"],["D2","D3"]];
show("01_base (S=1.05)", grid(0.4,[0.25,0.5]), {zona:4,suelo:"S2",categoria:"C",S:1.05,norma:"2018"});
show("02c muros", placas(0.25,0.4,[0.25,0.5],W4), {zona:4,suelo:"S2",categoria:"C",sistemaX:"MUROS"});
show("02d dual", placas(0.20,0.5,[0.25,0.5],W4), {zona:4,suelo:"S2",categoria:"C",sistemaX:"DUAL"});
show("04 torsion", placas(0.20,0.4,[0.25,0.5],[["A1","A2"],["A3","A4"]]), {zona:4,suelo:"S2",categoria:"C",sistemaX:"DUAL",Ip:0.6});
