const Pl = require("../src/plano.js"); const I = require("../src/irreg.js");
const p = Pl.desdeEjes([5,5,5],[5,5,5],{col:[0.6,0.6],viga:[0.3,0.6]});
const n0 = p.losas.length; p.losas = []; const n = Pl.losasAutomaticas(p);
console.log("losas", n0, "auto", n, p.losas.map(l=>Pl.areaPoly(l.pts).toFixed(1)).join(" "));
const {model} = Pl.aModelo(p, {n:4,h1:3.2,h:2.8}, 210, {cm:500,cmRoof:400,cv:200,cvRoof:100}, true);
const r = I.analizarTodo(model, {zona:4,suelo:"S2",categoria:"C"});
console.log("T1", r.modes[0].T.toFixed(4), "P", r.P.toFixed(2), "Vdin", r.dirs[0].Vdin.toFixed(2), "deriva", r.derivaMax.X.toFixed(5));
// viga que cruza sin nudo intermedio: una viga larga de 0 a 15 debe partirse en las columnas
const q = Pl.desdeEjes([5,5,5],[5,5,5],{col:[0.6,0.6],viga:[0.3,0.6]});
q.vigas = q.vigas.filter(v=>!(v.a[1]===v.b[1])); for (const y of [0,5,10,15]) q.vigas.push({id:"x"+y,a:[0,y],b:[15,y],bw:0.3,h:0.6});
const m2 = Pl.aModelo(q, {n:4,h1:3.2,h:2.8}, 210, {cm:500,cmRoof:400,cv:200,cvRoof:100}, true).model;
const r2 = I.analizarTodo(m2, {zona:4,suelo:"S2",categoria:"C"});
console.log("vigas largas -> T1", r2.modes[0].T.toFixed(4), "beams", m2.beams.length);
// losa en punto
console.log("losaEn", Pl.losaEn(q, 7, 7).map(v=>v.join(",")).join(" | "));
