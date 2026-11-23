// tablero de contrachapado con canto azul marino
(function () {
  var b = G.board;
  var top = rbox(b.w, b.t, b.d, 0.004, M.wood, 0, -b.t / 2, 0, world);
  var edge = rbox(b.w + 0.004, 0.012, 0.006, 0.002, M.board2, 0, -b.t / 2, b.d / 2 + 0.001, world);
  // placa con el nombre en el canto
  var c = mkCanvas(1024, 64, function (g, w, h) { g.fillStyle = '#1f3048'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8eef5'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('RED HIDRÁULICA · PVC 1/2"  ·  UNAB INGENIERÍA CIVIL', w / 2, 44); });
  var pl = new T.Mesh(new T.PlaneGeometry(0.42, 0.026), std(0xffffff, 0.4, 0.3, { map: texFrom(c) })); pl.position.set(0.2, -b.t / 2, b.d / 2 + 0.0045); world.add(pl);
})();

// soporte metálico del depósito (tubo cuadrado con pintura en polvo)
(function () {
  var t = G.tank, s = new T.Group(), h = t.y0 - 0.015, w = 0.32, tb = 0.02;
  for (var i = -1; i <= 1; i += 2) for (var j = -1; j <= 1; j += 2) {
    var x = t.x + i * (w / 2 - tb / 2), z = t.z + j * (w / 2 - tb / 2);
    rbox(tb, h - 0.008, tb, 0.0025, M.powder, x, (h - 0.008) / 2 + 0.008, z, s);
    var foot = mesh(new T.CylinderGeometry(0.012, 0.013, 0.008, 20), M.rubber); foot.position.set(x, 0.004, z); s.add(foot);
  }
  rbox(w, 0.012, w, 0.002, M.powder, t.x, h + 0.006, t.z, s);
  for (var k = -1; k <= 1; k += 2) {
    rbox(w - 0.03, 0.016, 0.016, 0.002, M.powder, t.x, 0.17, t.z + k * (w / 2 - 0.01), s);
    rbox(0.016, 0.016, w - 0.03, 0.002, M.powder, t.x + k * (w / 2 - 0.01), 0.17, t.z, s);
  }
  // tornillos de las esquinas
  for (i = -1; i <= 1; i += 2) for (j = -1; j <= 1; j += 2) { var bl = hexMesh(0.008, 0.004, M.steel); bl.position.set(t.x + i * (w / 2 - 0.01), h + 0.014, t.z + j * (w / 2 - 0.01)); s.add(bl); }
  world.add(s);
})();

// depósito de 20 L translúcido con tapa, asa y escala
var tankWaterTop;
(function () {
  var t = G.tank, g = new T.Group(), R = t.r, Hh = t.h;
  var shell = new T.Mesh(lathe([[0, 0.001], [R - 0.016, 0.001], [R - 0.006, 0.004], [R - 0.002, 0.012], [R - 0.001, 0.03], [R + 0.003, Hh - 0.035], [R + 0.003, Hh - 0.016], [R + 0.008, Hh - 0.012], [R + 0.009, Hh - 0.004], [R + 0.006, Hh]], 72), M.tankGlass);
  shell.position.set(t.x, t.y0, t.z); shell.renderOrder = 2; g.add(shell);
  [0.07, 0.16, 0.25].forEach(function (y) { var rib = new T.Mesh(new T.TorusGeometry(R - 0.0005 + y * 0.012, 0.0022, 8, 72), M.tankGlass); rib.rotation.x = Math.PI / 2; rib.position.set(t.x, t.y0 + y, t.z); g.add(rib); });
  var wh = 0.255;
  var water = new T.Mesh(lathe([[0, 0.004], [R - 0.018, 0.004], [R - 0.008, 0.007], [R - 0.004, 0.015], [R - 0.003, 0.03], [R - 0.0005, wh - 0.002], [R - 0.0045, wh], [0, wh]], 72), M.tankWater);
  water.position.set(t.x, t.y0, t.z); water.renderOrder = 1; g.add(water); tankWaterTop = water;
  var surf = new T.Mesh(new T.CircleGeometry(R - 0.004, 72), M.waterTop); surf.rotation.x = -Math.PI / 2; surf.position.set(t.x, t.y0 + wh - 0.0005, t.z); g.add(surf);
  // escala graduada impresa
  var sc = new T.Mesh(new T.CylinderGeometry(R + 0.0035, R + 0.0035, Hh - 0.06, 24, 1, true, -0.28, 0.56), M.scale);
  sc.position.set(t.x, t.y0 + 0.012 + (Hh - 0.06) / 2, t.z); sc.renderOrder = 3; g.add(sc);
  // tapa azul con estrías y tapón
  var lid = latheMesh([[0, 0.024], [R - 0.03, 0.024], [R - 0.02, 0.026], [R + 0.004, 0.024], [R + 0.011, 0.02], [R + 0.012, 0.004], [R + 0.009, -0.004], [R + 0.006, -0.004]], M.lid, 72);
  lid.position.set(t.x, t.y0 + Hh, t.z); g.add(lid);
  var ribs = new T.InstancedMesh(new T.BoxGeometry(0.0025, 0.014, 0.003), M.lid, 64), mm = new T.Matrix4(), q = new T.Quaternion();
  for (var i = 0; i < 64; i++) { var a = i / 64 * Math.PI * 2; q.setFromAxisAngle(UP, -a); mm.compose(V(t.x + Math.cos(a) * (R + 0.0125), t.y0 + Hh + 0.011, t.z + Math.sin(a) * (R + 0.0125)), q, V(1, 1, 1)); ribs.setMatrixAt(i, mm); }
  ribs.castShadow = true; g.add(ribs);
  var cap = latheMesh([[0, 0.042], [0.022, 0.042], [0.025, 0.039], [0.026, 0.024]], M.lid, 48); cap.position.set(t.x, t.y0 + Hh, t.z); g.add(cap);
  var grom = mesh(new T.TorusGeometry(0.014, 0.003, 10, 32), M.rubber); grom.rotation.x = Math.PI / 2; grom.position.set(t.x, t.y0 + Hh + 0.043, t.z); g.add(grom);
  // asa plegada hacia atrás
  [-1, 1].forEach(function (s) { var lug = rbox(0.014, 0.02, 0.01, 0.003, M.lid, t.x + s * (R + 0.011), t.y0 + Hh - 0.008, t.z, g); });
  var hp = [], k;
  for (k = 0; k <= 24; k++) { var th = k / 24 * Math.PI; hp.push(V(Math.cos(th) * (R + 0.013), Math.sin(th) * 0.095, 0)); }
  var handle = mesh(new T.TubeGeometry(new T.CatmullRomCurve3(hp), 60, 0.0042, 10, false), M.lid);
  var hg = new T.Group(); hg.add(handle);
  var grip = mesh(new T.CylinderGeometry(0.009, 0.009, 0.07, 20), M.black); grip.rotation.z = Math.PI / 2; grip.position.set(0, 0.095, 0); hg.add(grip);
  hg.position.set(t.x, t.y0 + Hh - 0.008, t.z); hg.rotation.x = -1.25; g.add(hg);
  // pasamuro de salida en el fondo
  var bk = new T.Group(); hexMesh(0.032, 0.008, M.fit).position.y = 0; bk.add(hexMesh(0.032, 0.008, M.fit));
  var bk2 = hexMesh(0.032, 0.006, M.fit); bk2.position.y = 0.012; bk.add(bk2);
  bk.position.set(-0.46, t.y0 - 0.002, t.z); g.add(bk);
  world.add(g);
})();

// bomba centrífuga de 12 V
(function () {
  var p = G.pump, g = new T.Group();
  // soporte en L con pernos
  rbox(0.13, 0.005, 0.08, 0.0015, M.powder, p.x + 0.008, 0.0025, p.z, g);
  rbox(0.005, 0.03, 0.06, 0.0015, M.powder, p.x - 0.012, 0.017, p.z, g);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { var b = hexMesh(0.007, 0.004, M.steel); b.position.set(p.x + 0.008 + c[0] * 0.055, 0.007, p.z + c[1] * 0.032); g.add(b); });
  // motor con aletas
  var motor = new T.Group();
  motor.add(latheMesh([[0, -0.042], [0.024, -0.042], [0.029, -0.038], [0.031, -0.032], [0.031, 0.034], [0.029, 0.038], [0.02, 0.041], [0, 0.041]], M.pump, 48));
  var fins = new T.InstancedMesh(new T.BoxGeometry(0.0018, 0.06, 0.005), M.pumpDark, 18), mm = new T.Matrix4(), q = new T.Quaternion();
  for (var i = 0; i < 18; i++) { var a = i / 18 * Math.PI * 2; q.setFromAxisAngle(UP, -a); mm.compose(V(Math.cos(a) * 0.0335, 0, Math.sin(a) * 0.0335), q, V(1, 1, 1)); fins.setMatrixAt(i, mm); }
  fins.castShadow = true; motor.add(fins);
  // tapa trasera con rejilla del ventilador
  var cap = latheMesh([[0, 0.058], [0.012, 0.058], [0.026, 0.054], [0.03, 0.046], [0.03, 0.04]], M.black, 40); motor.add(cap);
  for (i = 1; i <= 3; i++) { var ring = mesh(new T.TorusGeometry(0.007 * i, 0.0012, 6, 32), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0585; motor.add(ring); }
  var shaft = mesh(new T.CylinderGeometry(0.004, 0.004, 0.008, 16), M.steel); shaft.position.y = -0.046; motor.add(shaft);
  motor.rotation.z = -Math.PI / 2; motor.position.set(p.x + 0.03, p.y, p.z); g.add(motor);
  // caja de bornes con prensaestopa y placa
  rbox(0.03, 0.016, 0.026, 0.003, M.pump, p.x + 0.03, p.y + 0.038, p.z, g);
  rbox(0.032, 0.003, 0.028, 0.0012, M.pumpDark, p.x + 0.03, p.y + 0.0475, p.z, g);
  [[-1, -1], [1, 1]].forEach(function (c) { var sc = mesh(new T.CylinderGeometry(0.0018, 0.0018, 0.0012, 12), M.steel); sc.position.set(p.x + 0.03 + c[0] * 0.011, p.y + 0.0495, p.z + c[1] * 0.009); g.add(sc); });
  var gland = mesh(new T.CylinderGeometry(0.0045, 0.0055, 0.008, 16), M.black); gland.rotation.z = Math.PI / 2; gland.position.set(p.x + 0.049, p.y + 0.038, p.z); g.add(gland);
  var pl = new T.Mesh(new T.PlaneGeometry(0.04, 0.02), M.plate); pl.position.set(p.x + 0.035, p.y + 0.004, p.z + 0.0345); g.add(pl);
  // voluta de la bomba con brida y pernos
  var head = new T.Group();
  head.add(latheMesh([[0, -0.016], [0.02, -0.016], [0.031, -0.013], [0.036, -0.006], [0.037, 0.006], [0.039, 0.008], [0.039, 0.014], [0.03, 0.016], [0, 0.016]], M.pump, 48));
  head.add(latheMesh([[0, -0.022], [0.012, -0.022], [0.026, -0.018], [0.03, -0.016]], M.pumpDark, 40));
  for (i = 0; i < 6; i++) { var a2 = i / 6 * Math.PI * 2, bolt = hexMesh(0.006, 0.004, M.steel); bolt.position.set(Math.cos(a2) * 0.034, 0.017, Math.sin(a2) * 0.034); head.add(bolt); }
  head.rotation.z = Math.PI / 2; head.position.set(p.x - 0.03, p.y, p.z); g.add(head);
  // boquilla de succión (axial) y de descarga (radial) con rosca
  var suc = new T.Group(); suc.add(latheMesh([[0.016, 0], [0.016, 0.004], [0.0125, 0.006], [0.0125, 0.024], [0.0105, 0.026]], M.pump, 32));
  addThreads(suc, 0.0127, 0.012, 0.024, M.pumpDark);
  alignY(suc, V(-1, 0, 0), V(p.x - 0.047, p.y, p.z)); g.add(suc);
  var dis = new T.Group(); dis.add(latheMesh([[0.016, 0], [0.016, 0.004], [0.0125, 0.007], [0.0125, 0.012], [0.0105, 0.014]], M.pump, 32));
  addThreads(dis, 0.0127, 0.007, 0.012, M.pumpDark);
  alignY(dis, UP, V(p.x - 0.045, p.y + 0.036, p.z)); g.add(dis);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(g);
  // cable de la bomba a la fuente
  var cv = new T.CatmullRomCurve3([V(p.x + 0.053, p.y + 0.038, p.z), V(p.x + 0.075, p.y + 0.03, p.z - 0.02), V(-0.24, 0.006, -0.17), V(-0.215, 0.012, -0.195)], false, 'centripetal');
  world.add(mesh(new T.TubeGeometry(cv, 40, 0.0022, 8, false), M.black));
  // fuente de 12 V
  var f = new T.Group();
  rbox(0.075, 0.032, 0.05, 0.003, M.alu, -0.2, 0.016, -0.21, f);
  var top = new T.Mesh(new T.PlaneGeometry(0.06, 0.04), M.psu); top.rotation.x = -Math.PI / 2; top.position.set(-0.2, 0.0322, -0.21); f.add(top);
  rbox(0.012, 0.012, 0.05, 0.002, M.black, -0.235, 0.012, -0.21, f);
  var led = new T.Mesh(new T.SphereGeometry(0.0022, 10, 10), new T.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(-0.17, 0.026, -0.1848); f.add(led);
  f.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  world.add(f);
})();

// ESP32 en caja transparente atornillada
var espLed, ESP_PIN = V(-0.08, 0.03, 0.04);
(function () {
  var g = new T.Group(), x = -0.08, z = 0.04;
  rbox(0.11, 0.006, 0.075, 0.002, M.powder, x, 0.003, z, g);
  var b = new T.Mesh(new T.RoundedBoxGeometry ? new T.RoundedBoxGeometry(0.11, 0.032, 0.075, 3, 0.004) : new T.BoxGeometry(0.11, 0.032, 0.075), M.boxClear); b.position.set(x, 0.022, z); b.renderOrder = 2; g.add(b);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { var s = mesh(new T.CylinderGeometry(0.0022, 0.0022, 0.002, 12), M.steel); s.position.set(x + c[0] * 0.05, 0.0385, z + c[1] * 0.032); g.add(s); });
  var pcb = mesh(new T.BoxGeometry(0.056, 0.0016, 0.028), [M.pcbGreen, M.pcbGreen, M.pcb, M.pcbGreen, M.pcbGreen, M.pcbGreen]); pcb.position.set(x - 0.005, 0.016, z); g.add(pcb);
  rbox(0.018, 0.003, 0.016, 0.0008, M.steel, x - 0.006, 0.0185, z, g);
  rbox(0.008, 0.003, 0.007, 0.0008, M.steel, x - 0.035, 0.0185, z, g);
  for (var i = 0; i < 15; i++) { var a = rbox(0.0024, 0.009, 0.0024, 0.0004, M.black, x - 0.04 + i * 0.0049, 0.0115, z - 0.0125, g); var b2 = rbox(0.0024, 0.009, 0.0024, 0.0004, M.black, x - 0.04 + i * 0.0049, 0.0115, z + 0.0125, g); }
  // regleta de bornes para sensores
  rbox(0.03, 0.008, 0.01, 0.001, std(0x1b7f3a, 0.5), x + 0.03, 0.012, z + 0.022, g);
  espLed = new T.Mesh(new T.SphereGeometry(0.0018, 10, 10), M.led); espLed.position.set(x + 0.02, 0.018, z + 0.006); g.add(espLed);
  world.add(g);
})();

/* -------------------------------------------------------------- edificio */
function buildBuilding() {
  var b = G.bld, g = bldGroup, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0, D = b.z1 - b.z0;
  // zócalo de concreto y vereda
  rbox(W + 0.012, G.floors[0], D + 0.012, 0.002, M.concrete, cx, G.floors[0] / 2, cz, g);
  rbox(W + 0.02, 0.006, D + 0.02, 0.002, M.concrete, cx, 0.003, cz, g);
  // losas con cornisa
  [G.floors[1], G.floors[2], G.ceil].forEach(function (y) {
    rbox(W + 0.014, 0.014, D + 0.014, 0.0015, M.plaster, cx, y - 0.007, cz, g);
    rbox(W + 0.02, 0.004, D + 0.02, 0.0012, M.white, cx, y - 0.0155, cz, g);
  });
  // pisos de porcelanato
  G.floors.forEach(function (y) { var f = mesh(new T.PlaneGeometry(W - 0.012, D - 0.012), M.floorTile, false, true); f.rotation.x = -Math.PI / 2; f.position.set(cx, y + 0.0008, cz); g.add(f); });
  // columnas
  [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].forEach(function (p) {
    rbox(0.022, G.ceil - G.floors[0], 0.022, 0.002, M.plaster, p[0] + (p[0] < cx ? 0.011 : -0.011), (G.ceil + G.floors[0]) / 2, p[1] + (p[1] < cz ? 0.011 : -0.011), g);
  });
  // muro posterior: mayólica por dentro, tarrajeo por fuera
  var bw = mesh(new T.BoxGeometry(W, G.ceil - G.floors[0], 0.008), [M.plaster, M.plaster, M.plaster, M.plaster, M.wallTile, M.plaster]);
  bw.position.set(cx, (G.ceil + G.floors[0]) / 2, b.z0 + 0.004); g.add(bw);
  // muros laterales con ventana por piso
  [b.x0 + 0.004, b.x1 - 0.004].forEach(function (x, side) {
    var inner = side ? 1 : 0; // índice de cara interior (+x para el muro izquierdo, -x para el derecho)
    function wbox(w, h, d, px, py, pz) {
      var mats = [M.plaster, M.plaster, M.plaster, M.plaster, M.plaster, M.plaster]; mats[inner] = M.wallTile2;
      var m = mesh(new T.BoxGeometry(w, h, d), mats); m.position.set(px, py, pz); g.add(m); return m;
    }
    G.floors.forEach(function (y0, i) {
      var y1 = (i < 2 ? G.floors[i + 1] : G.ceil) - 0.014, hh = y1 - y0;
      var wz0 = b.z0 + 0.15, wz1 = b.z0 + 0.27, wy0 = y0 + 0.13, wy1 = y0 + 0.235;
      wbox(0.008, hh, wz0 - b.z0 - 0.008, x, y0 + hh / 2, (b.z0 + 0.008 + wz0) / 2);
      wbox(0.008, hh, b.z1 - wz1, x, y0 + hh / 2, (wz1 + b.z1) / 2);
      wbox(0.008, wy0 - y0, wz1 - wz0, x, (y0 + wy0) / 2, (wz0 + wz1) / 2);
      wbox(0.008, y1 - wy1, wz1 - wz0, x, (wy1 + y1) / 2, (wz0 + wz1) / 2);
      // ventana de aluminio con alféizar
      var fr = new T.Group(), cz2 = (wz0 + wz1) / 2, cy = (wy0 + wy1) / 2;
      rbox(0.012, 0.005, wz1 - wz0, 0.001, M.alu, x, wy0 + 0.0025, cz2, fr);
      rbox(0.012, 0.005, wz1 - wz0, 0.001, M.alu, x, wy1 - 0.0025, cz2, fr);
      rbox(0.012, wy1 - wy0, 0.005, 0.001, M.alu, x, cy, wz0 + 0.0025, fr);
      rbox(0.012, wy1 - wy0, 0.005, 0.001, M.alu, x, cy, wz1 - 0.0025, fr);
      rbox(0.008, wy1 - wy0, 0.004, 0.001, M.alu, x, cy, cz2, fr);
      rbox(0.02, 0.004, wz1 - wz0 + 0.012, 0.001, M.marble, x + (side ? 0.006 : -0.006), wy0 - 0.002, cz2, fr);
      var gl = new T.Mesh(new T.PlaneGeometry(wz1 - wz0, wy1 - wy0), M.glass); gl.rotation.y = Math.PI / 2; gl.position.set(x, cy, cz2); fr.add(gl);
      g.add(fr);
    });
  });
  G.floors.forEach(function (y, i) { bathroom(g, y, i); });
  // techo a dos aguas con tejas de arcilla
  var rx0 = b.x0 - 0.03, rx1 = b.x1 + 0.03, rz0 = b.z0 - 0.02, rz1 = b.z1 + 0.02, ry = G.ceil + 0.004, rise = 0.042;
  var half = (rx1 - rx0) / 2, len = Math.sqrt(half * half + rise * rise), ang = Math.atan2(rise, half), depth = rz1 - rz0;
  var tileGeo = new T.CylinderGeometry(0.0085, 0.0075, 0.034, 10, 1, true, 0, Math.PI); tileGeo.rotateZ(Math.PI / 2);
  var cols = Math.floor(depth / 0.017), rows = Math.ceil(len / 0.028);
  [-1, 1].forEach(function (s) {
    var deck = mesh(new T.BoxGeometry(len, 0.006, depth), M.roofBase); deck.position.set(cx + s * half / 2, ry + rise / 2 + 0.003, (rz0 + rz1) / 2); deck.rotation.z = -s * ang; g.add(deck);
    var inst = [new T.InstancedMesh(tileGeo, M.roofTile, cols * rows), new T.InstancedMesh(tileGeo, M.roofTile2, cols * rows)], n = [0, 0];
    var mm = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
      var conv = c % 2, u = (r + 0.5) / rows; // posición a lo largo de la pendiente desde el alero
      var px = cx + s * (half - u * half), py = ry + 0.006 + u * rise + (conv ? 0.006 : 0.0015), pz = rz0 + (c + 0.5) * depth / cols;
      e.set(conv ? 0 : Math.PI, 0, s > 0 ? Math.PI - ang : ang); q.setFromEuler(e);
      mm.compose(V(px, py, pz), q, V(1, 1, 1)); var k = (c + r) % 3 === 0 ? 1 : 0; inst[k].setMatrixAt(n[k]++, mm);
    }
    inst.forEach(function (im, k) { im.count = n[k]; im.castShadow = true; im.receiveShadow = true; g.add(im); });
  });
  var ridge = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, depth + 0.006, 14, 1, false, 0, Math.PI), M.roofTile);
  ridge.rotation.x = Math.PI / 2; ridge.rotation.y = Math.PI; ridge.position.set(cx, ry + rise + 0.008, (rz0 + rz1) / 2); ridge.castShadow = true; g.add(ridge);
  var tri = new T.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, rise - 0.004); tri.closePath();
  [b.z0 + 0.004, b.z1 - 0.004].forEach(function (z) { var gm = mesh(new T.ExtrudeGeometry(tri, { depth: 0.006, bevelEnabled: false }), M.plaster); gm.position.set(cx, ry, z - 0.003); g.add(gm); });
  // tablas de alero
  [-1, 1].forEach(function (s) { var fb = rbox(0.004, 0.012, depth + 0.004, 0.001, M.fascia, cx + s * (half + 0.001), ry + 0.002, (rz0 + rz1) / 2, g); });
}
function bathroom(g, y, i) {
  var b = G.bld, zb = b.z0 + 0.008;
  // inodoro de una pieza
  var ix = 0.185, iz = zb + 0.048, it = new T.Group();
  it.add(latheMesh([[0, 0], [0.013, 0], [0.0135, 0.004], [0.0125, 0.018], [0.016, 0.026], [0.019, 0.034], [0.0195, 0.038], [0, 0.038]], M.ceramic, 40));
  var bowl = latheMesh([[0.0, 0.03], [0.012, 0.032], [0.019, 0.036], [0.0205, 0.0395], [0.019, 0.041], [0.014, 0.038], [0.008, 0.033], [0, 0.031]], M.ceramic, 40); it.add(bowl);
  it.scale.set(1, 1, 1.25); it.position.set(ix, y, iz); g.add(it);
  var seat = mesh(new T.TorusGeometry(0.016, 0.0035, 12, 40), M.ceramic); seat.rotation.x = Math.PI / 2; seat.scale.set(1, 1.3, 1); seat.position.set(ix, y + 0.0425, iz); g.add(seat);
  var lidT = mesh(new T.CylinderGeometry(0.019, 0.019, 0.002, 40), M.ceramic); lidT.scale.set(1, 1, 1.25); lidT.rotation.x = -1.45; lidT.position.set(ix, y + 0.064, zb + 0.022); g.add(lidT);
  rbox(0.046, 0.04, 0.017, 0.004, M.ceramic, ix, y + 0.062, zb + 0.0095, g);
  rbox(0.048, 0.004, 0.019, 0.0015, M.ceramic, ix, y + 0.0835, zb + 0.0095, g);
  var fb = mesh(new T.CylinderGeometry(0.0035, 0.0035, 0.0015, 20), M.chrome); fb.position.set(ix, y + 0.0858, zb + 0.0095); g.add(fb);
  // lavatorio de pedestal con grifería
  var lx = 0.29, lz = zb + 0.03;
  var ped = latheMesh([[0.012, 0], [0.011, 0.01], [0.0085, 0.04], [0.009, 0.07], [0.012, 0.078]], M.ceramic, 32); ped.position.set(lx, y, lz - 0.006); g.add(ped);
  var basin = latheMesh([[0, 0.068], [0.012, 0.069], [0.024, 0.074], [0.031, 0.083], [0.033, 0.09], [0.032, 0.093], [0.028, 0.093], [0.026, 0.088], [0.018, 0.082], [0.008, 0.079], [0, 0.0785]], M.ceramic, 48);
  basin.scale.set(1.05, 1, 0.78); basin.position.set(lx, y, lz); g.add(basin);
  var drain = mesh(new T.CylinderGeometry(0.003, 0.003, 0.0008, 16), M.chrome); drain.position.set(lx, y + 0.0792, lz); g.add(drain);
  var fbase = latheMesh([[0.0045, 0], [0.004, 0.004], [0.0028, 0.02]], M.chrome, 20); fbase.position.set(lx, y + 0.093, zb + 0.009); g.add(fbase);
  var sp = new T.CatmullRomCurve3([V(lx, y + 0.112, zb + 0.009), V(lx, y + 0.118, zb + 0.016), V(lx, y + 0.112, zb + 0.026)]);
  g.add(mesh(new T.TubeGeometry(sp, 16, 0.0018, 10, false), M.chrome));
  rbox(0.002, 0.003, 0.014, 0.0008, M.chrome, lx, y + 0.118, zb + 0.004, g);
  // espejo con marco y luz
  rbox(0.062, 0.078, 0.003, 0.0015, M.alu, lx, y + 0.165, zb + 0.0015, g);
  var mir = mesh(new T.PlaneGeometry(0.058, 0.074), M.mirror, false, false); mir.position.set(lx, y + 0.165, zb + 0.0032); g.add(mir);
  rbox(0.05, 0.004, 0.006, 0.0015, M.lamp, lx, y + 0.208, zb + 0.004, g);
  // repisa
  rbox(0.05, 0.003, 0.012, 0.001, M.marble, lx, y + 0.122, zb + 0.006, g);
  // ducha: plato, mampara, barra y cabezal tipo lluvia
  var dx = 0.425, dz = zb + 0.042;
  rbox(0.09, 0.006, 0.084, 0.0015, M.ceramic, dx, y + 0.003, dz, g);
  var dr = mesh(new T.CylinderGeometry(0.0045, 0.0045, 0.0008, 20), M.chrome); dr.position.set(dx, y + 0.0062, dz); g.add(dr);
  var pipe = new T.CatmullRomCurve3([V(dx + 0.03, y + 0.06, zb + 0.004), V(dx + 0.03, y + 0.2, zb + 0.004), V(dx + 0.03, y + 0.214, zb + 0.012), V(dx + 0.03, y + 0.214, zb + 0.03)]);
  g.add(mesh(new T.TubeGeometry(pipe, 24, 0.0016, 10, false), M.chrome));
  var head = latheMesh([[0, -0.0015], [0.013, -0.0015], [0.014, 0], [0.012, 0.002], [0, 0.003]], M.chrome, 32); head.position.set(dx + 0.03, y + 0.21, zb + 0.032); g.add(head);
  var mix = latheMesh([[0.007, 0], [0.007, 0.003], [0.004, 0.006], [0.003, 0.009]], M.chrome, 24); mix.rotation.x = Math.PI / 2; mix.position.set(dx + 0.03, y + 0.1, zb + 0.001); g.add(mix);
  rbox(0.0025, 0.0025, 0.012, 0.0008, M.chrome, dx + 0.03, y + 0.1, zb + 0.014, g);
  var scr = new T.Mesh(new T.PlaneGeometry(0.084, 0.19), M.glass); scr.rotation.y = Math.PI / 2; scr.position.set(dx - 0.046, y + 0.1, dz); g.add(scr);
  rbox(0.003, 0.19, 0.003, 0.0008, M.chrome, dx - 0.046, y + 0.1, dz + 0.042, g);
  rbox(0.003, 0.003, 0.084, 0.0008, M.chrome, dx - 0.046, y + 0.195, dz, g);
  // toallero con toalla y tapete
  var tr = new T.CatmullRomCurve3([V(b.x1 - 0.008, y + 0.135, b.z0 + 0.085), V(b.x1 - 0.016, y + 0.135, b.z0 + 0.088), V(b.x1 - 0.016, y + 0.135, b.z0 + 0.132), V(b.x1 - 0.008, y + 0.135, b.z0 + 0.135)]);
  g.add(mesh(new T.TubeGeometry(tr, 20, 0.0012, 8, false), M.chrome));
  rbox(0.004, 0.05, 0.038, 0.0015, M.towel, b.x1 - 0.016, y + 0.112, b.z0 + 0.11, g);
  rbox(0.05, 0.0015, 0.032, 0.0012, M.mat, 0.37, y + 0.0015, zb + 0.11, g);
  // luminaria empotrada
  var ceilY = (i < 2 ? G.floors[i + 1] : G.ceil) - 0.014;
  var ring = mesh(new T.CylinderGeometry(0.02, 0.02, 0.003, 32), M.alu); ring.position.set(0.3, ceilY - 0.0015, -0.06); g.add(ring);
  var lampDisk = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.0035, 28), M.lamp); lampDisk.position.set(0.3, ceilY - 0.0018, -0.06); g.add(lampDisk);
  var pl = new T.PointLight(0xffd9a0, 0.5, 0.55, 2); pl.position.set(0.3, ceilY - 0.03, -0.05); g.add(pl); floorLights.push(pl);
}
buildBuilding();
