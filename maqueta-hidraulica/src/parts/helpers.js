/* Geometrías de detalle: torneado, prisma hexagonal biselado, caja redondeada */
var GEO_CACHE = {};
function cached(key, make) { return GEO_CACHE[key] || (GEO_CACHE[key] = make()); }
function lathe(pts, seg) { return new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg || 40); }
function latheMesh(pts, mat, seg) { return mesh(lathe(pts, seg), mat); }
/* prisma hexagonal a lo largo de Y, centrado; af = entre caras */
function hexGeo(af, len, bev) {
  return cached('hex' + af.toFixed(5) + '_' + len.toFixed(5), function () {
    var R = af / Math.sqrt(3), s = new T.Shape();
    for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3, x = Math.cos(a) * R, y = Math.sin(a) * R; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    s.closePath();
    var b = bev == null ? Math.min(af * 0.08, len * 0.2) : bev;
    var g = new T.ExtrudeGeometry(s, { depth: Math.max(1e-4, len - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(len - 2 * b) / 2); g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    return g;
  });
}
function hexMesh(af, len, mat) { return mesh(hexGeo(af, len), mat); }
function rbox(w, h, d, r, mat, x, y, z, parent) {
  var g = cached('rb' + [w, h, d, r].map(function (v) { return v.toFixed(5); }).join('_'), function () {
    return T.RoundedBoxGeometry ? new T.RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new T.BoxGeometry(w, h, d);
  });
  var m = mesh(g, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m;
}
/* coloca un objeto con su eje Y local en la dirección dir */
function alignY(o, dir, pos) { o.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); if (pos) o.position.copy(pos); return o; }
/* casquillo de accesorio PVC: boca biselada en y=0, cuerpo hacia +y */
function hubGeo(r, L) {
  return cached('hub' + r.toFixed(5) + '_' + L.toFixed(5), function () {
    return lathe([[r * 1.005, 0], [r * 1.12, 0.0006], [r * 1.19, 0.0022], [r * 1.2, 0.004], [r * 1.2, L - 0.002], [r * 1.215, L - 0.0012], [r * 1.215, L]], 40);
  });
}
function addThreads(parent, r, y0, y1, mat) {
  var n = Math.max(3, Math.round((y1 - y0) / 0.0016));
  for (var i = 0; i <= n; i++) {
    var t = mesh(cached('thr' + r.toFixed(5), function () { return new T.TorusGeometry(r, 0.00045, 6, 28); }), mat, false, false);
    t.rotation.x = Math.PI / 2; t.position.y = y0 + (y1 - y0) * i / n; parent.add(t);
  }
}
