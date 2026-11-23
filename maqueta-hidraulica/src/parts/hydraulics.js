/* Tubería PVC con impresión, codos con casquillo, tees, válvula de bola, YF-S201 y transductor */
function pipeGeo(r, len) {
  var g = new T.CylinderGeometry(r, r, len, 32, 1, true), uv = g.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 0.30);
  return g;
}
function hubAt(r, L, mouth, dir) {
  var h = mesh(hubGeo(r, L), M.fit); alignY(h, dir, mouth); hyd.add(h); swapMats.push(h); return h;
}
function capAt(r, end, dir) {
  var L = Math.max(0.012, r * 1.4);
  var g = cached('cap' + r.toFixed(5), function () {
    return lathe([[r * 1.005, 0], [r * 1.12, 0.0006], [r * 1.2, 0.003], [r * 1.2, L - 0.004], [r * 1.17, L - 0.0012], [r * 1.08, L], [0, L + 0.0006]], 40);
  });
  var c = mesh(g, M.cap); alignY(c, dir, end.clone().addScaledVector(dir, -(L - 0.003))); hyd.add(c); swapMats.push(c);
}
function addRun(pts, sp, circ, opt) {
  opt = opt || {};
  var R = sp.De * 0.85, r = sp.De / 2, rw = sp.Di / 2 * 0.97, n = pts.length, dirs = [];
  for (var i = 0; i < n - 1; i++) dirs.push(pts[i + 1].clone().sub(pts[i]).normalize());
  var line = [pts[0].clone()], hubL = sp.De * 0.75;
  for (i = 0; i < n - 1; i++) {
    var a = pts[i].clone(), b = pts[i + 1].clone(), d = dirs[i];
    if (i > 0) a.addScaledVector(d, R);
    if (i < n - 2) b.addScaledVector(d, -R);
    var len = a.distanceTo(b);
    if (len > 1e-4) {
      var mid = a.clone().add(b).multiplyScalar(0.5);
      var p = mesh(pipeGeo(r, len), M.pvc); alignY(p, d, mid); hyd.add(p); swapMats.push(p);
      var w = new T.Mesh(new T.CylinderGeometry(rw, rw, len, 16), WATER[circ]); w.quaternion.copy(p.quaternion); w.position.copy(mid); hyd.add(w); waterMeshes.push(w);
    }
    line.push(b.clone());
    if (i < n - 2) {
      var d1 = d, d2 = dirs[i + 1], P = pts[i + 1];
      var C = P.clone().addScaledVector(d1, -R).addScaledVector(d2, R);
      var xa = d2.clone().negate(), ya = d1.clone(), za = new T.Vector3().crossVectors(xa, ya);
      var q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xa, ya, za));
      var el = mesh(cached('elb' + R.toFixed(5) + r.toFixed(5), function () { return new T.TorusGeometry(R, r * 1.13, 20, 24, Math.PI / 2); }), M.fit);
      el.quaternion.copy(q); el.position.copy(C); hyd.add(el); swapMats.push(el);
      var ew = new T.Mesh(new T.TorusGeometry(R, rw, 10, 16, Math.PI / 2), WATER[circ]); ew.quaternion.copy(q); ew.position.copy(C); hyd.add(ew); waterMeshes.push(ew);
      // casquillos: boca hacia el tubo, cuerpo hacia el codo
      hubAt(r, hubL, b.clone().addScaledVector(d1, -hubL), d1);
      var a2 = P.clone().addScaledVector(d2, R);
      hubAt(r, hubL, a2.clone().addScaledVector(d2, hubL), d2.clone().negate());
      for (var k = 1; k <= 8; k++) {
        var th = k / 8 * Math.PI / 2;
        line.push(C.clone().addScaledVector(xa, R * Math.cos(th)).addScaledVector(ya, R * Math.sin(th)));
      }
    }
  }
  if (opt.capEnd) capAt(r, pts[n - 1], dirs[n - 2]);
  if (opt.flow !== false) addFlow(line, sp, circ, opt.q || 'Q0');
  return line;
}
function addTee(p, axis, branch, sp) {
  var r = sp.De / 2, L = sp.De * 2.1, hubL = sp.De * 0.75, ax = axis.clone().normalize(), br = branch.clone().normalize();
  var body = mesh(cached('teeb' + r.toFixed(5), function () { return new T.CylinderGeometry(r * 1.13, r * 1.13, L, 32); }), M.fit);
  alignY(body, ax, p); hyd.add(body); swapMats.push(body);
  var bl = sp.De * 1.02, arm = mesh(cached('teea' + r.toFixed(5), function () { return new T.CylinderGeometry(r * 1.13, r * 1.13, bl, 32); }), M.fit);
  alignY(arm, br, p.clone().addScaledVector(br, bl / 2)); hyd.add(arm); swapMats.push(arm);
  hubAt(r, hubL, p.clone().addScaledVector(ax, L / 2), ax.clone().negate());
  hubAt(r, hubL, p.clone().addScaledVector(ax, -L / 2), ax);
  hubAt(r, hubL, p.clone().addScaledVector(br, bl), br.clone().negate());
  // filete de unión entre brazo y cuerpo
  var f = mesh(cached('teef' + r.toFixed(5), function () { return new T.TorusGeometry(r * 1.13, r * 0.09, 8, 32); }), M.fit);
  alignY(f, br, p.clone().addScaledVector(br, r * 1.08)); f.rotateX(Math.PI / 2); hyd.add(f); swapMats.push(f);
}
function addTape(p, dir, sp, mat) {
  var t = mesh(cached('tape' + sp.De.toFixed(5), function () { return new T.CylinderGeometry(sp.De / 2 + 0.0007, sp.De / 2 + 0.0007, 0.009, 32, 1, true); }), mat);
  alignY(t, dir, p); hyd.add(t);
}
/* válvula de bola de bronce con palanca de acero y empuñadura de vinilo */
function addValve(p, dir, sp, up, opening) {
  var s = sp.De / 0.021, g = new T.Group();
  g.add(latheMesh([[0.0096 * s, -0.017 * s], [0.0118 * s, -0.0145 * s], [0.0136 * s, -0.009 * s], [0.0149 * s, -0.003 * s], [0.0149 * s, 0.003 * s], [0.0136 * s, 0.009 * s], [0.0118 * s, 0.0145 * s], [0.0096 * s, 0.017 * s]], M.brass, 40));
  [-1, 1].forEach(function (k) {
    var h = hexMesh(0.0245 * s, 0.0105 * s, M.brass); h.position.y = k * 0.0215 * s; g.add(h);
    var c = mesh(new T.CylinderGeometry(0.0106 * s, 0.0106 * s, 0.005 * s, 32), M.brassDark); c.position.y = k * 0.0292 * s; g.add(c);
  });
  // cuello, prensaestopa y vástago
  var neck = mesh(new T.CylinderGeometry(0.0062 * s, 0.0072 * s, 0.009 * s, 28), M.brass); neck.rotation.x = Math.PI / 2; neck.position.z = 0.0155 * s; g.add(neck);
  var pn = hexMesh(0.0105 * s, 0.0045 * s, M.brassDark); pn.rotation.x = Math.PI / 2; pn.position.z = 0.0215 * s; g.add(pn);
  var st = mesh(new T.CylinderGeometry(0.0024 * s, 0.0024 * s, 0.006 * s, 16), M.steel); st.rotation.x = Math.PI / 2; st.position.z = 0.025 * s; g.add(st);
  var hp = new T.Group(); hp.position.set(0, 0, 0.0262 * s);
  var nut = hexMesh(0.0068 * s, 0.0032 * s, M.steel); nut.rotation.x = Math.PI / 2; nut.position.z = 0.0028 * s; hp.add(nut);
  rbox(0.0115 * s, 0.012 * s, 0.0022 * s, 0.0009 * s, M.steel, 0, 0.002 * s, 0, hp);
  var bar = rbox(0.0072 * s, 0.05 * s, 0.0022 * s, 0.001 * s, M.steel, 0, 0.026 * s, 0, hp);
  rbox(0.0102 * s, 0.033 * s, 0.0056 * s, 0.0025 * s, M.red, 0, 0.037 * s, 0, hp);
  hp.rotation.z = (1 - opening) * Math.PI / 2;
  g.add(hp);
  g.quaternion.copy(frame(dir, up)); g.position.copy(p);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  hyd.add(g); return g;
}
/* caudalímetro de efecto Hall YF-S201 (cuerpo de nailon negro) */
function addMeter(p, dir, sp, up) {
  var s = Math.max(1, sp.De / 0.021), g = new T.Group();
  g.add(latheMesh([[0.0105 * s, -0.016 * s], [0.0122 * s, -0.0145 * s], [0.0122 * s, 0.0145 * s], [0.0105 * s, 0.016 * s]], M.nylon, 36));
  [-1, 1].forEach(function (k) {
    var y0 = k * 0.016 * s, y1 = k * 0.03 * s;
    var th = mesh(new T.CylinderGeometry(0.0098 * s, 0.0098 * s, 0.014 * s, 28), M.nylon); th.position.y = (y0 + y1) / 2; g.add(th);
    addThreads(g, 0.0099 * s, Math.min(y0, y1) + 0.001, Math.max(y0, y1) - 0.001, M.nylon);
    var hx = hexMesh(0.026 * s, 0.006 * s, M.nylon); hx.position.y = k * 0.013 * s; g.add(hx);
  });
  // cámara de la turbina (eje = arriba local Z)
  var ch = latheMesh([[0, -0.012 * s], [0.0168 * s, -0.012 * s], [0.0175 * s, -0.009 * s], [0.0175 * s, 0.012 * s], [0.0168 * s, 0.0145 * s], [0, 0.0145 * s]], M.nylon, 48);
  ch.rotation.x = Math.PI / 2; ch.position.z = 0.004 * s; g.add(ch);
  var top = new T.Mesh(new T.CircleGeometry(0.0155 * s, 40), M.meterTop); top.position.z = 0.0186 * s + 0.0001; top.rotation.z = -Math.PI / 2; g.add(top);
  for (var i = 0; i < 4; i++) {
    var a = Math.PI / 4 + i * Math.PI / 2, sc = mesh(cached('scr', function () { return new T.CylinderGeometry(0.0016, 0.0016, 0.0012, 12); }), M.steel);
    sc.rotation.x = Math.PI / 2; sc.position.set(Math.cos(a) * 0.0145 * s, Math.sin(a) * 0.0145 * s, 0.0188 * s); g.add(sc);
  }
  // salida de cables con funda
  var boot = mesh(new T.CylinderGeometry(0.0036 * s, 0.0046 * s, 0.01 * s, 18), M.rubber); boot.rotation.z = Math.PI / 2; boot.position.set(0.021 * s, 0, 0.008 * s); g.add(boot);
  [0xd62828, 0x111111, 0xf2c200].forEach(function (c, k) {
    var wv = mesh(new T.CylinderGeometry(0.0009, 0.0009, 0.006 * s, 8), std(c, 0.5)); wv.rotation.z = Math.PI / 2; wv.position.set(0.028 * s, (k - 1) * 0.0018, 0.008 * s); g.add(wv);
  });
  g.quaternion.copy(frame(dir, up)); g.position.copy(p);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
  hyd.add(g);
  return g.localToWorld(V(0.031 * s, 0, 0.008 * s));
}
/* transductor de presión 0–1,2 MPa: rosca G1/4, cuerpo inoxidable y conector Packard */
function addPSensor(p, sp, up) {
  var g = new T.Group(), r0 = sp.De / 2;
  var boss = mesh(new T.CylinderGeometry(0.0062, 0.0068, r0 + 0.006, 20), M.fit); boss.position.y = (r0 + 0.006) / 2; g.add(boss); swapMats.push(boss);
  var hx = hexMesh(0.017, 0.0075, M.steel); hx.position.y = r0 + 0.011; g.add(hx);
  addThreads(g, 0.0062, r0 + 0.005, r0 + 0.0075, M.steel);
  g.add((function () { var b = latheMesh([[0.0065, 0], [0.0088, 0.0015], [0.0092, 0.004], [0.0092, 0.025], [0.0086, 0.028], [0.0072, 0.03]], M.steel, 36); b.position.y = r0 + 0.0148; return b; })());
  var ring = mesh(new T.TorusGeometry(0.0091, 0.0006, 6, 36), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = r0 + 0.022; g.add(ring);
  rbox(0.016, 0.014, 0.012, 0.002, M.black, 0, r0 + 0.052, 0, g);
  rbox(0.006, 0.004, 0.0035, 0.001, M.black, 0, r0 + 0.056, 0.0072, g);
  var cl = mesh(new T.CylinderGeometry(0.0034, 0.0042, 0.006, 16), M.rubber); cl.position.y = r0 + 0.0618; g.add(cl);
  alignY(g, up, p);
  g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  hyd.add(g);
  return p.clone().addScaledVector(up.clone().normalize(), r0 + 0.064);
}
