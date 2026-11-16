const I = require("../src/irreg.js"); const {grid,placas}=require("./casos.js");
function show(n,m,p){const r=I.analizarTodo(m,p);
 console.log("==",n,"P",r.P.toFixed(2),"T",r.modes.slice(0,3).map(m=>m.T.toFixed(3)).join(" "),"R",r.q.Rx,r.q.Ry,"Ia",r.irreg.Ia,"Ip",r.irreg.Ip);
 r.irreg.lista.filter(v=>v.presente||v.detalle.length).forEach(v=>console.log("  ",v.presente?"SI":"no",v.nombre,v.detalle.join("; ")));
 for(const d of r.dirs) console.log("  Vest",d.Vest.toFixed(2),"Vdin",d.Vdin.toFixed(2),"f",d.factorEscala.toFixed(3),"fd",d.fDeriva.toFixed(2),"sist",d.sistemaCalc,(100*d.fracMuros).toFixed(0)+"%");
 console.log("  deriva X",r.derivas.map(d=>d.inX.toFixed(4)).join(" "),"Y",r.derivas.map(d=>d.inY.toFixed(4)).join(" "));
 r.restricciones.forEach(t=>console.log("  !",t));}
const P={zona:4,suelo:"S2",categoria:"C"};
show("02b",grid(0.6,[0.3,0.6]),{...P});
show("03 L",grid(0.4,[0.25,0.5],0,[[1,1],[2,1],[1,2],[2,2]]),{...P});
show("04 torsion",placas(0.20,0.4,[0.25,0.5],[["A1","A2"],["A3","A4"]]),{...P,sistemaX:"DUAL"});
