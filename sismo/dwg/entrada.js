// Lector de DWG para SismoPaso: usa acad-ts (MIT, port de ACadSharp) y devuelve el mismo formato que DXF.leer.
// Se empaqueta con esbuild en ../lib/dwg.js (ver construir.sh). Se carga solo cuando el usuario abre un DWG.
import { DwgReader, Line, LwPolyline, Polyline, Circle, Insert, ACadVersion } from "@node-projects/acad-ts";

function convertir(e, T, capaPadre, out, prof) {
  const capa = (e.layer && e.layer.name !== "0") ? e.layer.name : (capaPadre || (e.layer ? e.layer.name : "0"));
  if (e instanceof Line) out.push({ tipo: "linea", capa, pts: [T(e.startPoint), T(e.endPoint)] });
  else if (e instanceof LwPolyline) out.push({ tipo: "poli", capa, pts: e.vertices.map(v => T(v.location)), cerrada: e.isClosed });
  else if (e instanceof Polyline) out.push({ tipo: "poli", capa, pts: [...e.vertices].map(v => T(v.location)), cerrada: e.isClosed });
  else if (e instanceof Circle) { const c = T(e.center), r = T({ x: e.center.x + e.radius, y: e.center.y }); out.push({ tipo: "circulo", capa, pts: [c], r: Math.hypot(r[0] - c[0], r[1] - c[1]) }); }
  else if (e instanceof Insert && e.block && prof < 4) {
    const b = e.block.blockEntity ? e.block.blockEntity.basePoint : { x: 0, y: 0 };
    const c = Math.cos(e.rotation), s = Math.sin(e.rotation), sx = e.xScale, sy = e.yScale, ip = e.insertPoint;
    const Ti = (p) => { const u = (p.x - b.x) * sx, v = (p.y - b.y) * sy; return T({ x: ip.x + u * c - v * s, y: ip.y + u * s + v * c }); };
    for (const h of e.block.entities) convertir(h, Ti, capa, out, prof + 1);
  }
}

export function leer(arrayBuffer) {
  const avisos = [];
  const doc = DwgReader.readFromStream(arrayBuffer, (s, ev) => { if (ev && ev.notificationType >= 2) avisos.push(ev.message); });
  const ent = [];
  const T = (p) => [p.x, p.y];
  for (const e of doc.modelSpace.entities) convertir(e, T, null, ent, 0);
  const capas = {};
  ent.forEach(e => { capas[e.capa] = (capas[e.capa] || 0) + 1; });
  return { unidades: Number(doc.header.insUnits) || 0, capas, ent, version: ACadVersion[doc.header.version] || String(doc.header.version), avisos };
}
