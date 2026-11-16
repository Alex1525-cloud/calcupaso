const S = require("../src/solver.js");
function grid(col, beam, rz=0, sin=[]) {
  const xs=[0,5,10,15], ys=[0,5,10,15], nodes={}, L="ABCD";
  xs.forEach((x,i)=>ys.forEach((y,j)=>nodes[L[i]+(j+1)]=[x,y]));
  const columns=Object.keys(nodes).map(n=>({node:n,sec:"C",p1:1,p2:4}));
  const beams=[], slabs=[];
  const bset=new Set(), used=new Set();
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){ if(sin.some(([a,b])=>a===i&&b===j)) continue;
    const q=[L[i]+(j+1),L[i+1]+(j+1),L[i+1]+(j+2),L[i]+(j+2)]; slabs.push({nodes:q,p1:1,p2:4}); q.forEach(n=>used.add(n));
    for(const [a,b] of [[0,1],[3,2],[0,3],[1,2]]){const k=[q[a],q[b]].sort().join(); if(!bset.has(k)){bset.add(k); beams.push({i:q[a],j:q[b],sec:"V",p1:1,p2:4});}}
  }
  columns.splice(0, columns.length, ...columns.filter(c=>used.has(c.node)));
  for(const n of Object.keys(nodes)) if(!used.has(n)) delete nodes[n];
  return {stories:[{name:"Piso1",h:3.2},{name:"Piso2",h:2.8},{name:"Piso3",h:2.8},{name:"Piso4",h:2.8}],
    E:15000*Math.sqrt(210)*10, nu:0.2, gamma:2.4, nodes, sections:{C:{type:"col",b:col,h:col},V:{type:"beam",b:beam[0],h:beam[1]}},
    columns, beams, slabs, loads:{cm:0.5,cmRoof:0.4,cv:0.2,cvRoof:0.1}, massFactors:{cm:1,cv:0.25,cvRoof:0.25}, rigidZone:rz};
}
module.exports={grid};
if(require.main===module){
 for (const rz of [0,0.5,1]){
  const t=Date.now(); const B=S.buildModel(grid(0.6,[0.3,0.6],rz)); const M=S.modal(B,12);
  console.log("rz",rz,"P",B.levels.reduce((a,l)=>a+l.W,0).toFixed(2),"PP",B.cargas.PP.toFixed(2), M.slice(0,6).map(m=>m.T.toFixed(4)).join(" "), (Date.now()-t)+"ms");
  console.log(M.slice(0,3).map(m=>[m.UX,m.UY,m.RZ].map(v=>(100*v).toFixed(1)).join("/")).join("  "));
 }
}
module.exports.placas = function(t, col, beam, walls) {
  const m = module.exports.grid(col, beam); m.sections.M={type:"wall",b:t};
  m.walls = walls.map(([i,j])=>({i,j,sec:"M",p1:1,p2:4})); return m;
};
