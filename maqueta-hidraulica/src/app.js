/* Maqueta 3D de red hidráulica de edificio (three.js r128, sin conexión). */
(function () {
'use strict';
var T = THREE, H = HCALC;
var V = function (x, y, z) { return new T.Vector3(x, y, z); };
var UP = V(0, 1, 0);

/* ------------------------------------------------------------------ estado */
var DEF_L = { A: { r1: 0.5485, r2: 0.2565 }, B: { r1: 0.6685, r2: 0.6365 } };
var S = {
  design: 'A',
  spec: { A: { r1: '1/2', r2: '1/2' }, B: { r1: '3/4', r2: '1/2' } },
  L: { A: { r1: 0.5485, r2: 0.2565 }, B: { r1: 0.6685, r2: 0.6365 } },
  Q1: 4, Q2: 4,
  glass: true, paused: false, autorot: false, warm: true, labels: true, cotas: false, building: true,
  theme: 'light', palette: 'azul'
};
var PALS = ['azul', 'oceano', 'glaciar', 'indigo', 'morado', 'rosado', 'carmesi', 'grafito'];
try { var pl = localStorage.getItem('hid-palette'); if (PALS.indexOf(pl) >= 0) S.palette = pl; } catch (e) {}
try { var th = localStorage.getItem('hid-theme'); if (th === 'dark' || th === 'light') S.theme = th; } catch (e) {}
if (S.theme === 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) {
  try { if (!localStorage.getItem('hid-theme')) S.theme = 'dark'; } catch (e) { S.theme = 'dark'; }
}

/* Geometría general (m). Origen: centro de la cara superior del tablero. */
var G = {
  board: { w: 1.0, d: 0.60, t: 0.025 },
  ZP: 0.22,                                   // plano frontal de la tubería
  bld: { x0: 0.12, x1: 0.48, z0: -0.27, z1: 0.18 },
  floors: [0.08, 0.3703, 0.6606], ceil: 0.9509, // separación 0,2903 m (informe)
  taps: [0.34, 0.6303, 0.9206],               // salidas de consumo por piso
  topY: 0.975,
  tank: { x: -0.36, z: -0.10, r: 0.14, h: 0.33, y0: 0.235 },
  pump: { x: -0.36, y: 0.045, z: -0.10 }
};

/* -------------------------------------------------------------- renderer */
var stage = document.getElementById('stage');
var renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
stage.insertBefore(renderer.domElement, stage.firstChild);

var scene = new T.Scene();
var camera = new T.PerspectiveCamera(34, 1, 0.01, 50);
camera.position.set(-0.62, 0.92, 1.85);
var controls = new T.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.45, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.25; controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI * 0.495;

/* Entorno de reflejos generado en código (tipo estudio). */
function makeEnv() {
  var s = new T.Scene();
  var room = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ side: T.BackSide, color: 0x9aa3ad }));
  room.scale.set(16, 10, 16); room.position.y = 4.5; s.add(room);
  s.add(new T.AmbientLight(0xffffff, 0.6));
  function panel(w, h, x, y, z, k, ry) {
    var m = new T.MeshBasicMaterial({ color: 0xffffff }); m.color.setScalar(k);
    var p = new T.Mesh(new T.PlaneGeometry(w, h), m); p.position.set(x, y, z);
    p.lookAt(0, 1, 0); if (ry) p.rotation.z += ry; s.add(p);
  }
  panel(6, 3, 0, 9.4, 0, 3.2); panel(3, 4, -7.8, 5, 2, 2.2); panel(3, 4, 7.8, 4, -2, 1.6);
  panel(5, 2.5, 0, 4, 7.8, 1.4); panel(4, 2, 2, 3, -7.8, 0.9);
  var pm = new T.PMREMGenerator(renderer);
  var tex = pm.fromScene(s, 0.035).texture; pm.dispose();
  return tex;
}
scene.environment = makeEnv();

/* Luces */
var hemi = new T.HemisphereLight(0xf2f6ff, 0x8a7a66, 0.45); scene.add(hemi);
var sun = new T.DirectionalLight(0xfff0dc, 1.55);
sun.position.set(-1.4, 2.6, 1.9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
var sc = sun.shadow.camera; sc.left = -0.9; sc.right = 0.9; sc.top = 0.9; sc.bottom = -0.9; sc.near = 0.5; sc.far = 6;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002; sun.shadow.radius = 4;
sun.target.position.set(0, 0.35, 0); scene.add(sun); scene.add(sun.target);
var fill = new T.DirectionalLight(0xdbe8ff, 0.35); fill.position.set(2, 1.2, -1.5); scene.add(fill);

/* ---------------------------------------------------------- texturas */
function canvasTex(w, h, draw, rx, ry) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
  if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); }
  return t;
}
function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
var texWood = canvasTex(1024, 512, function (g, w, h) {
  g.fillStyle = '#c99d6b'; g.fillRect(0, 0, w, h);
  var r = rnd(7);
  for (var i = 0; i < 140; i++) {
    var y = r() * h, a = 0.05 + r() * 0.12;
    g.strokeStyle = (r() > 0.5 ? 'rgba(120,78,40,' : 'rgba(235,200,150,') + a + ')';
    g.lineWidth = 0.6 + r() * 2.2; g.beginPath();
    for (var x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / (60 + r() * 30) + i) * (2 + r() * 3));
    g.stroke();
  }
});
function tiles(base, grout, n, m, jitter) {
  return function (g, w, h) {
    g.fillStyle = grout; g.fillRect(0, 0, w, h);
    var r = rnd(11), tw = w / n, thh = h / m, gp = Math.max(2, w / 220);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var k = (r() - 0.5) * jitter;
      g.fillStyle = shade(base, k);
      g.fillRect(i * tw + gp, j * thh + gp, tw - 2 * gp, thh - 2 * gp);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(i * tw + gp, j * thh + gp, tw - 2 * gp, (thh - 2 * gp) * 0.35);
    }
  };
}
function shade(hex, k) {
  var c = new T.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString();
}
var texWallTile = canvasTex(512, 512, tiles('#e9eef2', '#c9d2da', 8, 8, 0.03), 3, 3);
var texFloorTile = canvasTex(512, 512, tiles('#b9b2a6', '#8f887d', 6, 6, 0.05), 2, 2);
var texRoof = canvasTex(512, 512, function (g, w, h) {
  g.fillStyle = '#7d2c1c'; g.fillRect(0, 0, w, h);
  var rows = 10, cols = 8, r = rnd(3);
  for (var j = 0; j < rows; j++) for (var i = 0; i <= cols; i++) {
    var x = i * w / cols + (j % 2 ? w / cols / 2 : 0), y = j * h / rows, tw = w / cols, th = h / rows;
    var grd = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    var base = shade('#c4512f', (r() - 0.5) * 0.06);
    grd.addColorStop(0, shade(base, -0.12)); grd.addColorStop(0.5, shade(base, 0.08)); grd.addColorStop(1, shade(base, -0.14));
    g.fillStyle = grd; g.beginPath();
    g.moveTo(x - tw / 2 + 2, y); g.lineTo(x + tw / 2 - 2, y); g.lineTo(x + tw / 2 - 2, y + th * 0.82);
    g.quadraticCurveTo(x, y + th * 1.08, x - tw / 2 + 2, y + th * 0.82); g.closePath(); g.fill();
  }
}, 2, 2);
var texMeter = canvasTex(256, 256, function (g, w, h) {
  g.fillStyle = '#16191d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8edf2'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('YF-S201', w / 2, 92);
  g.font = '20px Arial'; g.fillText('1-30 L/min', w / 2, 124);
  g.lineWidth = 9; g.strokeStyle = '#e8edf2'; g.beginPath(); g.moveTo(58, 180); g.lineTo(190, 180); g.stroke();
  g.beginPath(); g.moveTo(198, 180); g.lineTo(166, 160); g.lineTo(166, 200); g.closePath(); g.fillStyle = '#e8edf2'; g.fill();
});
var texPcb = canvasTex(256, 128, function (g, w, h) {
  g.fillStyle = '#141820'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b8c0c8'; g.fillRect(70, 20, 120, 88);
  g.fillStyle = '#2b3240'; g.font = 'bold 18px Arial'; g.fillText('ESP32', 98, 62); g.font = '12px Arial'; g.fillText('WROOM-32', 96, 82);
  g.fillStyle = '#d4af37'; for (var i = 0; i < 19; i++) { g.fillRect(8 + i * 12.8, 4, 6, 6); g.fillRect(8 + i * 12.8, h - 10, 6, 6); }
  g.fillStyle = '#c0c6cc'; g.fillRect(200, 44, 44, 40);
});

/* ---------------------------------------------------------- materiales */
function std(c, r, m, o) { var p = { color: c, roughness: r == null ? 0.5 : r, metalness: m || 0 }; for (var k in o) p[k] = o[k]; return new T.MeshStandardMaterial(p); }
var M = {
  pvc: new T.MeshPhysicalMaterial({ color: 0xf4f5f2, roughness: 0.34, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  fit: new T.MeshPhysicalMaterial({ color: 0xe6e8e4, roughness: 0.42, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
  brass: std(0xc8a04a, 0.28, 0.95), chrome: std(0xe4e8ec, 0.1, 1), steel: std(0xbac2ca, 0.32, 0.9),
  black: std(0x1b1f24, 0.55), dark: std(0x31363d, 0.5, 0.3), red: std(0xd42a2a, 0.42), redGrip: std(0xb51f1f, 0.7),
  pump: std(0x1e4fc9, 0.38, 0.35), pumpDark: std(0x173b93, 0.45, 0.3), navyMetal: std(0x25344a, 0.45, 0.6),
  wood: std(0xffffff, 0.62, 0, { map: texWood }), board2: std(0x1f3048, 0.6),
  white: std(0xf7f7f4, 0.78), concrete: std(0xd9d7d1, 0.9), column: std(0xfbfbf9, 0.7),
  wallTile: std(0xffffff, 0.25, 0, { map: texWallTile }), floorTile: std(0xffffff, 0.35, 0, { map: texFloorTile }),
  roof: std(0xffffff, 0.6, 0, { map: texRoof }), ceramic: std(0xffffff, 0.12), mirror: std(0xffffff, 0.03, 1),
  glass: new T.MeshPhysicalMaterial({ color: 0xdff1f7, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide }),
  tankGlass: new T.MeshPhysicalMaterial({ color: 0xf0f8ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide, clearcoat: 1 }),
  tankWater: new T.MeshPhysicalMaterial({ color: 0x4aa6dc, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false }),
  lid: std(0x1d4ed8, 0.4, 0.1), frame: std(0x3a4250, 0.5, 0.4), lamp: new T.MeshBasicMaterial({ color: 0xfff3d6 }),
  pcbGreen: std(0x0f5132, 0.5), pcb: std(0xffffff, 0.45, 0.2, { map: texPcb }), boxClear: new T.MeshPhysicalMaterial({ color: 0xeef6ff, roughness: 0.08, transparent: true, opacity: 0.22, depthWrite: false }),
  led: new T.MeshBasicMaterial({ color: 0xff2b2b }), meterTop: new T.MeshStandardMaterial({ map: texMeter, roughness: 0.4 }),
  tape1: std(0x2563eb, 0.5), tape2: std(0xdc2626, 0.5), cap: std(0xe9ebe7, 0.45)
};
var CIRC = { r1: 0x2563eb, r2: 0xdc2626, al: 0x38bdf8, rt: 0x8aa0b8 };
var WATER = {}, DOTMAT = {};
Object.keys(CIRC).forEach(function (k) {
  WATER[k] = new T.MeshStandardMaterial({ color: CIRC[k], roughness: 0.2, transparent: true, opacity: 0.62, emissive: CIRC[k], emissiveIntensity: 0.12 });
  var c = new T.Color(CIRC[k]).lerp(new T.Color(0xffffff), 0.55);
  DOTMAT[k] = new T.MeshBasicMaterial({ color: c });
});

/* --------------------------------------------------------- utilidades 3D */
function mesh(geo, mat, cast, recv) { var m = new T.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = recv !== false; return m; }
function box(w, h, d, mat, x, y, z, parent) { var m = mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
function cylAlong(r, len, mat, a, dir, seg, parent, open) {
  var m = mesh(new T.CylinderGeometry(r, r, len, seg || 24, 1, !!open), mat);
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); m.position.copy(a);
  if (parent) parent.add(m); return m;
}
/* base local: eje Y = dirección del tubo, eje Z = "arriba" del accesorio */
function frame(dir, up) {
  var y = dir.clone().normalize();
  var z = up.clone().addScaledVector(y, -up.dot(y)); if (z.lengthSq() < 1e-6) z = V(0, 0, 1); z.normalize();
  var x = new T.Vector3().crossVectors(y, z);
  var q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
  return q;
}

/* ------------------------------------------------------------ escena fija */
var world = new T.Group(); scene.add(world);
var bldGroup = new T.Group(); world.add(bldGroup);
var hyd = new T.Group(); world.add(hyd);
var cotaGroup = new T.Group(); world.add(cotaGroup);
var floorLights = [];

// sombra sobre "mesa"
var shadowCatcher = new T.Mesh(new T.PlaneGeometry(6, 6), new T.ShadowMaterial({ opacity: 0.18 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = -G.board.t - 0.0005; shadowCatcher.receiveShadow = true; world.add(shadowCatcher);

// tablero de madera con canto azul marino
(function () {
  var b = G.board;
  var top = box(b.w, b.t, b.d, M.wood, 0, -b.t / 2, 0, world);
  top.castShadow = true;
  box(b.w + 0.004, 0.012, 0.004, M.board2, 0, -b.t / 2, b.d / 2 + 0.002, world);
})();

// soporte del depósito
(function () {
  var t = G.tank, s = new T.Group(), h = t.y0 - 0.015, w = 0.32;
  for (var i = -1; i <= 1; i += 2) for (var j = -1; j <= 1; j += 2) box(0.018, h, 0.018, M.navyMetal, t.x + i * (w / 2 - 0.009), h / 2, t.z + j * (w / 2 - 0.009), s);
  box(w, 0.015, w, M.navyMetal, t.x, h + 0.0075, t.z, s);
  for (var k = -1; k <= 1; k += 2) {
    box(w, 0.012, 0.012, M.navyMetal, t.x, 0.17, t.z + k * (w / 2 - 0.009), s);
    box(0.012, 0.012, w, M.navyMetal, t.x + k * (w / 2 - 0.009), 0.17, t.z, s);
  }
  world.add(s);
})();

// depósito 20 L transparente
var tankWaterTop;
(function () {
  var t = G.tank, g = new T.Group();
  var shell = new T.Mesh(new T.CylinderGeometry(t.r, t.r, t.h, 64, 1, true), M.tankGlass); shell.position.set(t.x, t.y0 + t.h / 2, t.z); g.add(shell);
  var bottom = mesh(new T.CylinderGeometry(t.r + 0.004, t.r + 0.004, 0.012, 64), M.lid); bottom.position.set(t.x, t.y0 + 0.006, t.z); g.add(bottom);
  var wh = 0.255;
  var water = new T.Mesh(new T.CylinderGeometry(t.r - 0.004, t.r - 0.004, wh, 64), M.tankWater); water.position.set(t.x, t.y0 + 0.012 + wh / 2, t.z); g.add(water);
  tankWaterTop = water;
  var lid = mesh(new T.CylinderGeometry(t.r + 0.006, t.r + 0.006, 0.022, 64, 1, true), M.lid); lid.position.set(t.x, t.y0 + t.h, t.z); g.add(lid);
  var ring = mesh(new T.TorusGeometry(t.r + 0.004, 0.004, 10, 64), M.lid); ring.rotation.x = Math.PI / 2; ring.position.set(t.x, t.y0 + t.h + 0.011, t.z); g.add(ring);
  // asa
  var asa = mesh(new T.TorusGeometry(0.07, 0.006, 10, 40, Math.PI), M.lid); asa.position.set(t.x, t.y0 + t.h + 0.011, t.z); g.add(asa);
  // marcas de nivel
  for (var i = 1; i <= 4; i++) {
    var mk = new T.Mesh(new T.BoxGeometry(0.03, 0.0015, 0.001), M.dark); mk.position.set(t.x, t.y0 + 0.012 + i * 0.06, t.z + t.r + 0.0008); g.add(mk);
  }
  world.add(g);
})();

// bomba 12 V
(function () {
  var p = G.pump, g = new T.Group();
  box(0.13, 0.008, 0.075, M.black, p.x + 0.005, 0.004, p.z, g);
  for (var i = -1; i <= 1; i += 2) box(0.012, 0.012, 0.06, M.dark, p.x + i * 0.04, 0.014, p.z, g);
  var motor = cylAlong(0.031, 0.08, M.pump, V(p.x + 0.025, p.y, p.z), V(1, 0, 0), 40, g);
  for (var k = 0; k < 7; k++) cylAlong(0.0328, 0.004, M.pumpDark, V(p.x + 0.0 + k * 0.01, p.y, p.z), V(1, 0, 0), 40, g);
  cylAlong(0.024, 0.012, M.black, V(p.x + 0.071, p.y, p.z), V(1, 0, 0), 32, g);
  cylAlong(0.006, 0.01, M.steel, V(p.x + 0.081, p.y, p.z), V(1, 0, 0), 16, g);
  // voluta
  cylAlong(0.036, 0.03, M.pump, V(p.x - 0.03, p.y, p.z), V(1, 0, 0), 40, g);
  cylAlong(0.03, 0.006, M.pumpDark, V(p.x - 0.048, p.y, p.z), V(1, 0, 0), 40, g);
  // bocas
  cylAlong(0.0125, 0.026, M.pump, V(p.x - 0.058, p.y, p.z), V(1, 0, 0), 24, g);
  cylAlong(0.0125, 0.03, M.pump, V(p.x - 0.045, p.y + 0.036, p.z), UP, 24, g);
  // bornes
  box(0.02, 0.012, 0.016, M.black, p.x + 0.03, p.y + 0.034, p.z, g);
  world.add(g);
  // fuente 12 V
  var f = new T.Group();
  box(0.07, 0.03, 0.045, M.black, -0.20, 0.015, -0.21, f);
  var led = new T.Mesh(new T.SphereGeometry(0.0025, 10, 10), new T.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(-0.175, 0.024, -0.187); f.add(led);
  world.add(f);
})();

// ESP32 en caja transparente
var espLed, ESP_PIN = V(-0.08, 0.03, 0.04);
(function () {
  var g = new T.Group(), x = -0.08, z = 0.04;
  box(0.11, 0.004, 0.075, M.black, x, 0.002, z, g);
  var b = new T.Mesh(new T.BoxGeometry(0.11, 0.032, 0.075), M.boxClear); b.position.set(x, 0.02, z); g.add(b);
  box(0.09, 0.004, 0.055, M.pcbGreen, x, 0.008, z, g);
  var pcb = mesh(new T.BoxGeometry(0.056, 0.003, 0.028), [M.black, M.black, M.pcb, M.black, M.black, M.black]); pcb.position.set(x, 0.0125, z); g.add(pcb);
  for (var i = 0; i < 12; i++) { box(0.002, 0.008, 0.002, M.brass, x - 0.04 + i * 0.0073, 0.014, z - 0.022, g); box(0.002, 0.008, 0.002, M.brass, x - 0.04 + i * 0.0073, 0.014, z + 0.022, g); }
  espLed = new T.Mesh(new T.SphereGeometry(0.0022, 10, 10), M.led); espLed.position.set(x + 0.032, 0.015, z + 0.01); g.add(espLed);
  world.add(g);
})();

/* -------------------------------------------------------------- edificio */
function buildBuilding() {
  var b = G.bld, g = bldGroup, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0, D = b.z1 - b.z0;
  // zócalo
  box(W + 0.01, G.floors[0], D + 0.01, M.concrete, cx, G.floors[0] / 2, cz, g);
  // losas
  [G.floors[1], G.floors[2], G.ceil].forEach(function (y) { box(W + 0.012, 0.014, D + 0.012, M.white, cx, y - 0.007, cz, g); });
  // pisos con cerámica
  G.floors.forEach(function (y) {
    var f = mesh(new T.PlaneGeometry(W - 0.01, D - 0.01), M.floorTile, false, true); f.rotation.x = -Math.PI / 2; f.position.set(cx, y + 0.0007, cz); g.add(f);
  });
  // columnas
  [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].forEach(function (p) {
    box(0.022, G.ceil - G.floors[0], 0.022, M.column, p[0] + (p[0] < cx ? 0.011 : -0.011), (G.ceil + G.floors[0]) / 2, p[1] + (p[1] < cz ? 0.011 : -0.011), g);
  });
  // muro posterior con mayólica
  box(W, G.ceil - G.floors[0], 0.008, M.wallTile, cx, (G.ceil + G.floors[0]) / 2, b.z0 + 0.004, g);
  // muros laterales con ventana por piso
  [b.x0 + 0.004, b.x1 - 0.004].forEach(function (x, side) {
    G.floors.forEach(function (y0, i) {
      var y1 = (i < 2 ? G.floors[i + 1] : G.ceil) - 0.014, hh = y1 - y0;
      var wz0 = b.z0 + 0.15, wz1 = b.z0 + 0.27, wy0 = y0 + 0.13, wy1 = y0 + 0.235;
      var mat = side ? M.wallTile : M.white;
      // trozos alrededor de la ventana
      box(0.008, hh, wz0 - b.z0 - 0.008, mat, x, y0 + hh / 2, (b.z0 + 0.008 + wz0) / 2, g);
      box(0.008, hh, b.z1 - wz1, mat, x, y0 + hh / 2, (wz1 + b.z1) / 2, g);
      box(0.008, wy0 - y0, wz1 - wz0, mat, x, (y0 + wy0) / 2, (wz0 + wz1) / 2, g);
      box(0.008, y1 - wy1, wz1 - wz0, mat, x, (wy1 + y1) / 2, (wz0 + wz1) / 2, g);
      // marco y vidrio
      var fr = new T.Group();
      box(0.012, 0.006, wz1 - wz0, M.frame, x, wy0 + 0.003, (wz0 + wz1) / 2, fr);
      box(0.012, 0.006, wz1 - wz0, M.frame, x, wy1 - 0.003, (wz0 + wz1) / 2, fr);
      box(0.012, wy1 - wy0, 0.006, M.frame, x, (wy0 + wy1) / 2, wz0 + 0.003, fr);
      box(0.012, wy1 - wy0, 0.006, M.frame, x, (wy0 + wy1) / 2, wz1 - 0.003, fr);
      box(0.01, wy1 - wy0, 0.004, M.frame, x, (wy0 + wy1) / 2, (wz0 + wz1) / 2, fr);
      var gl = new T.Mesh(new T.PlaneGeometry(wz1 - wz0, wy1 - wy0), M.glass); gl.rotation.y = Math.PI / 2; gl.position.set(x, (wy0 + wy1) / 2, (wz0 + wz1) / 2); fr.add(gl);
      g.add(fr);
    });
  });
  // baños por piso
  G.floors.forEach(function (y, i) { bathroom(g, y, i); });
  // techo a dos aguas con tejas
  var rx0 = b.x0 - 0.03, rx1 = b.x1 + 0.03, rz0 = b.z0 - 0.02, rz1 = b.z1 + 0.02, ry = G.ceil + 0.004, rise = 0.042;
  var half = (rx1 - rx0) / 2, len = Math.sqrt(half * half + rise * rise), ang = Math.atan2(rise, half);
  [-1, 1].forEach(function (s) {
    var p = mesh(new T.BoxGeometry(len, 0.008, rz1 - rz0), [M.white, M.white, M.roof, M.white, M.white, M.white]);
    p.position.set(cx + s * half / 2, ry + rise / 2 + 0.004, (rz0 + rz1) / 2); p.rotation.z = -s * ang; g.add(p);
  });
  var ridge = cylAlong(0.007, rz1 - rz0 + 0.004, M.roof, V(cx, ry + rise + 0.008, (rz0 + rz1) / 2), V(0, 0, 1), 16, g);
  var tri = new T.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, rise - 0.004); tri.closePath();
  [b.z0 + 0.004, b.z1 - 0.004].forEach(function (z) {
    var gm = mesh(new T.ExtrudeGeometry(tri, { depth: 0.006, bevelEnabled: false }), M.white); gm.position.set(cx, ry, z - 0.003); g.add(gm);
  });
}
function bathroom(g, y, i) {
  var b = G.bld, zb = b.z0 + 0.008;
  // inodoro
  var it = new T.Group(), ix = 0.185, iz = zb + 0.045;
  var base = mesh(new T.CylinderGeometry(0.014, 0.017, 0.026, 28), M.ceramic); base.position.set(ix, y + 0.013, iz + 0.005); it.add(base);
  var bowl = mesh(new T.SphereGeometry(0.022, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.ceramic); bowl.scale.set(0.95, 0.5, 1.25); bowl.rotation.x = Math.PI; bowl.position.set(ix, y + 0.04, iz + 0.008); it.add(bowl);
  var seat = mesh(new T.TorusGeometry(0.018, 0.004, 10, 28), M.ceramic); seat.rotation.x = Math.PI / 2; seat.scale.set(1, 1.25, 1); seat.position.set(ix, y + 0.041, iz + 0.008); it.add(seat);
  box(0.044, 0.038, 0.016, M.ceramic, ix, y + 0.062, zb + 0.009, it);
  box(0.046, 0.004, 0.018, M.ceramic, ix, y + 0.083, zb + 0.009, it);
  var btn = cylAlong(0.003, 0.002, M.chrome, V(ix, y + 0.086, zb + 0.009), UP, 12, it);
  g.add(it);
  // lavatorio de pedestal con espejo
  var lx = 0.29, lz = zb + 0.03;
  var ped = mesh(new T.CylinderGeometry(0.008, 0.012, 0.075, 20), M.ceramic); ped.position.set(lx, y + 0.0375, lz - 0.006); g.add(ped);
  var basin = mesh(new T.SphereGeometry(0.03, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.ceramic); basin.rotation.x = Math.PI; basin.scale.set(1.1, 0.45, 0.8); basin.position.set(lx, y + 0.09, lz); g.add(basin);
  box(0.066, 0.005, 0.05, M.ceramic, lx, y + 0.0905, lz, g);
  var sink = mesh(new T.CylinderGeometry(0.02, 0.02, 0.0012, 28), M.dark); sink.scale.set(1.2, 1, 0.8); sink.position.set(lx, y + 0.0932, lz + 0.004); g.add(sink);
  cylAlong(0.0022, 0.016, M.chrome, V(lx, y + 0.1, zb + 0.008), UP, 12, g);
  cylAlong(0.0018, 0.014, M.chrome, V(lx, y + 0.108, zb + 0.014), V(0, 0, 1), 12, g);
  box(0.06, 0.075, 0.003, M.frame, lx, y + 0.165, zb + 0.0015, g);
  var mir = mesh(new T.PlaneGeometry(0.055, 0.07), M.mirror, false, false); mir.position.set(lx, y + 0.165, zb + 0.0032); g.add(mir);
  box(0.05, 0.005, 0.006, M.lamp, lx, y + 0.207, zb + 0.004, g);
  // ducha con mampara
  var dx = 0.425, dz = zb + 0.042;
  box(0.09, 0.006, 0.084, M.ceramic, dx, y + 0.003, dz, g);
  var drain = cylAlong(0.004, 0.001, M.chrome, V(dx, y + 0.0065, dz), UP, 14, g);
  cylAlong(0.0022, 0.2, M.chrome, V(dx + 0.03, y + 0.11, zb + 0.006), UP, 12, g);
  cylAlong(0.0022, 0.025, M.chrome, V(dx + 0.03, y + 0.21, zb + 0.018), V(0, 0, 1), 12, g);
  var head = mesh(new T.CylinderGeometry(0.011, 0.007, 0.006, 24), M.chrome); head.position.set(dx + 0.03, y + 0.205, zb + 0.03); g.add(head);
  cylAlong(0.003, 0.01, M.chrome, V(dx + 0.03, y + 0.09, zb + 0.01), V(0, 0, 1), 12, g);
  var scr = new T.Mesh(new T.PlaneGeometry(0.085, 0.19), M.glass); scr.rotation.y = Math.PI / 2; scr.position.set(dx - 0.046, y + 0.1, dz); g.add(scr);
  box(0.003, 0.19, 0.003, M.chrome, dx - 0.046, y + 0.1, dz + 0.042, g);
  // toallero
  cylAlong(0.0016, 0.05, M.chrome, V(b.x1 - 0.012, y + 0.13, b.z0 + 0.11), V(0, 0, 1), 10, g);
  box(0.002, 0.04, 0.035, std(0x5b7fa6, 0.9), b.x1 - 0.012, y + 0.11, b.z0 + 0.11, g);
  // luminaria
  var ceilY = (i < 2 ? G.floors[i + 1] : G.ceil) - 0.014;
  var lampDisk = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.004, 28), M.lamp); lampDisk.position.set(0.3, ceilY - 0.002, -0.06); g.add(lampDisk);
  var pl = new T.PointLight(0xffd9a0, 0.5, 0.55, 2); pl.position.set(0.3, ceilY - 0.03, -0.05); g.add(pl); floorLights.push(pl);
}
buildBuilding();

/* ---------------------------------------------------------- red hidráulica */
var flows = [];        // trazadores
var labelDefs = [];    // rótulos del diseño activo
var swapMats = [];     // tuberías cuyo material cambia con el modo
var waterMeshes = [];
var nodesInfo = {};

function addRun(pts, sp, circ, opt) {
  opt = opt || {};
  var R = sp.De * 0.85, r = sp.De / 2, rw = sp.Di / 2 * 0.97, n = pts.length, dirs = [];
  for (var i = 0; i < n - 1; i++) dirs.push(pts[i + 1].clone().sub(pts[i]).normalize());
  var line = [pts[0].clone()], hubL = sp.De * 0.62;
  for (i = 0; i < n - 1; i++) {
    var a = pts[i].clone(), b = pts[i + 1].clone(), d = dirs[i];
    if (i > 0) a.addScaledVector(d, R);
    if (i < n - 2) b.addScaledVector(d, -R);
    var len = a.distanceTo(b);
    if (len > 1e-4) {
      var mid = a.clone().add(b).multiplyScalar(0.5);
      var p = cylAlong(r, len, M.pvc, mid, d, 28, hyd, true); swapMats.push(p);
      var w = new T.Mesh(new T.CylinderGeometry(rw, rw, len, 16), WATER[circ]); w.quaternion.copy(p.quaternion); w.position.copy(mid); hyd.add(w); waterMeshes.push(w);
    }
    line.push(b.clone());
    if (i < n - 2) {
      var d1 = d, d2 = dirs[i + 1], P = pts[i + 1];
      var C = P.clone().addScaledVector(d1, -R).addScaledVector(d2, R);
      var xa = d2.clone().negate(), ya = d1.clone(), za = new T.Vector3().crossVectors(xa, ya);
      var q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xa, ya, za));
      var el = mesh(new T.TorusGeometry(R, r * 1.06, 16, 20, Math.PI / 2), M.fit); el.quaternion.copy(q); el.position.copy(C); hyd.add(el); swapMats.push(el);
      var ew = new T.Mesh(new T.TorusGeometry(R, rw, 10, 16, Math.PI / 2), WATER[circ]); ew.quaternion.copy(q); ew.position.copy(C); hyd.add(ew); waterMeshes.push(ew);
      swapMats.push(cylAlong(r * 1.17, hubL, M.fit, b.clone().addScaledVector(d1, -hubL / 2), d1, 28, hyd));
      var a2 = P.clone().addScaledVector(d2, R);
      swapMats.push(cylAlong(r * 1.17, hubL, M.fit, a2.clone().addScaledVector(d2, hubL / 2), d2, 28, hyd));
      for (var k = 1; k <= 8; k++) {
        var th = k / 8 * Math.PI / 2;
        line.push(C.clone().addScaledVector(xa, R * Math.cos(th)).addScaledVector(ya, R * Math.sin(th)));
      }
    }
  }
  if (opt.capEnd) swapMats.push(cylAlong(r * 1.18, 0.014, M.cap, pts[n - 1].clone().addScaledVector(dirs[n - 2], -0.004), dirs[n - 2], 28, hyd));
  if (opt.flow !== false) addFlow(line, sp, circ, opt.q || 'Q0');
  return line;
}
function addTee(p, axis, branch, sp) {
  var r = sp.De / 2 * 1.17, L = sp.De * 1.9;
  swapMats.push(cylAlong(r, L, M.fit, p, axis, 28, hyd));
  swapMats.push(cylAlong(r, sp.De * 0.95, M.fit, p.clone().addScaledVector(branch, sp.De * 0.475), branch, 28, hyd));
}
function addTape(p, dir, sp, mat) {
  cylAlong(sp.De / 2 + 0.0008, 0.008, mat, p, dir, 28, hyd);
}
function addValve(p, dir, sp, up, opening) {
  var s = sp.De / 0.021, g = new T.Group();
  g.add(cylAlong(0.0118 * s, 0.05 * s, M.brass, V(0, 0, 0), UP, 28));
  var ball = mesh(new T.SphereGeometry(0.0148 * s, 28, 18), M.brass); ball.scale.set(1, 1.2, 1); g.add(ball);
  [-1, 1].forEach(function (k) { var h = mesh(new T.CylinderGeometry(0.0128 * s, 0.0128 * s, 0.011 * s, 6), M.brass); h.position.y = k * 0.0195 * s; g.add(h); });
  g.add(cylAlong(0.0032 * s, 0.014 * s, M.steel, V(0, 0, 0.0185 * s), V(0, 0, 1), 14));
  var hp = new T.Group(); hp.position.set(0, 0, 0.0255 * s);
  var nut = mesh(new T.CylinderGeometry(0.005 * s, 0.005 * s, 0.004 * s, 6), M.steel); nut.rotation.x = Math.PI / 2; hp.add(nut);
  box(0.012 * s, 0.04 * s, 0.0035 * s, M.red, 0, 0.016 * s, 0, hp);
  var grip = mesh(new T.BoxGeometry(0.0135 * s, 0.026 * s, 0.006 * s), M.redGrip); grip.position.set(0, 0.04 * s, 0); hp.add(grip);
  hp.rotation.z = (1 - opening) * Math.PI / 2;
  g.add(hp);
  g.quaternion.copy(frame(dir, up)); g.position.copy(p);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  hyd.add(g); return g;
}
function addMeter(p, dir, sp, up) {
  var s = Math.max(1, sp.De / 0.021), g = new T.Group();
  g.add(cylAlong(0.0125 * s, 0.042 * s, M.black, V(0, 0, 0), UP, 28));
  [-1, 1].forEach(function (k) { g.add(cylAlong(0.0108 * s, 0.011 * s, M.dark, V(0, k * 0.0265 * s, 0), UP, 20)); for (var t = 0; t < 3; t++) g.add(cylAlong(0.0113 * s, 0.0012 * s, M.dark, V(0, k * (0.023 + t * 0.003) * s, 0), UP, 20)); });
  var hs = mesh(new T.CylinderGeometry(0.0172 * s, 0.0172 * s, 0.028 * s, 32), M.black); hs.rotation.x = Math.PI / 2; hs.position.z = 0.004 * s; g.add(hs);
  var top = new T.Mesh(new T.CircleGeometry(0.0165 * s, 32), M.meterTop); top.position.z = 0.0182 * s; top.rotation.z = -Math.PI / 2; g.add(top);
  box(0.008 * s, 0.01 * s, 0.008 * s, M.black, 0.019 * s, 0, 0.008 * s, g);
  g.quaternion.copy(frame(dir, up)); g.position.copy(p);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
  hyd.add(g);
  return g.localToWorld(V(0.022 * s, 0, 0.008 * s));
}
function addPSensor(p, sp, up) {
  var g = new T.Group(), u = up.clone().normalize(), r0 = sp.De / 2;
  g.add(cylAlong(0.0058, r0 + 0.01, M.fit, p.clone().addScaledVector(u, (r0 + 0.01) / 2), u, 16));
  var hx = mesh(new T.CylinderGeometry(0.0088, 0.0088, 0.008, 6), M.brass); hx.quaternion.setFromUnitVectors(UP, u); hx.position.copy(p).addScaledVector(u, r0 + 0.014); g.add(hx);
  g.add(cylAlong(0.0092, 0.03, M.steel, p.clone().addScaledVector(u, r0 + 0.033), u, 24));
  g.add(cylAlong(0.0078, 0.012, M.black, p.clone().addScaledVector(u, r0 + 0.054), u, 20));
  g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  hyd.add(g);
  return p.clone().addScaledVector(u, r0 + 0.06);
}
function addCable(a, color, idx) {
  // arnés: sube un poco, se separa del tubo, baja vertical y corre por el tablero hasta el ESP32
  var off = 0.006 + (idx % 6) * 0.003, zc = a.z + 0.035 + (idx % 3) * 0.004;
  var pts = [a.clone(), a.clone().add(V(0, 0.012, 0)), V(a.x + off, a.y - 0.01, zc), V(a.x + off, 0.012, zc),
    V((a.x + ESP_PIN.x) / 2, 0.006, Math.max(zc, ESP_PIN.z + 0.05)), ESP_PIN.clone().add(V(-0.03 + (idx % 8) * 0.008, -0.012, 0.04))];
  var curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
  var m = mesh(new T.TubeGeometry(curve, 90, 0.0011, 6, false), std(color, 0.6));
  hyd.add(m);
}
/* trazadores de flujo */
var dotGeo = new T.SphereGeometry(1, 10, 8);
function addFlow(line, sp, circ, qkey) {
  var cum = [0];
  for (var i = 1; i < line.length; i++) cum.push(cum[i - 1] + line[i].distanceTo(line[i - 1]));
  var total = cum[cum.length - 1];
  if (total < 1e-4) return;
  var count = Math.max(2, Math.round(total / 0.03));
  var im = new T.InstancedMesh(dotGeo, DOTMAT[circ], count);
  im.frustumCulled = false; hyd.add(im);
  flows.push({ line: line, cum: cum, total: total, count: count, im: im, sp: sp, q: qkey, offset: Math.random() * total, rad: sp.Di * 0.16 });
}
var tmpM = new T.Matrix4(), tmpV = new T.Vector3(), tmpS = new T.Vector3(), tmpQ = new T.Quaternion();
function flowPoint(f, s, out) {
  var c = f.cum, lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
  var t = (s - c[lo]) / Math.max(1e-9, c[hi] - c[lo]);
  return out.copy(f.line[lo]).lerp(f.line[hi], t);
}
function qOf(key) { return key === 'Q1' ? S.Q1 : key === 'Q2' ? S.Q2 : S.Q1 + S.Q2; }
function updateFlows(dt) {
  for (var i = 0; i < flows.length; i++) {
    var f = flows[i], Q = qOf(f.q) / 60000, v = Q / (Math.PI * f.sp.Di * f.sp.Di / 4);
    f.im.visible = S.glass && Q > 0;
    if (!f.im.visible) continue;
    if (!S.paused) f.offset = (f.offset + v * dt) % f.total;
    var step = f.total / f.count;
    tmpS.setScalar(f.rad);
    for (var k = 0; k < f.count; k++) {
      var s = (f.offset + k * step) % f.total;
      flowPoint(f, s, tmpV);
      tmpM.compose(tmpV, tmpQ, tmpS); f.im.setMatrixAt(k, tmpM);
    }
    f.im.instanceMatrix.needsUpdate = true;
  }
}

function clearHyd() {
  hyd.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
  hyd.clear ? hyd.clear() : hyd.children.slice().forEach(function (c) { hyd.remove(c); });
  flows = []; swapMats = []; waterMeshes = []; labelDefs = [];
}
function lab(text, pos, cls, key) { labelDefs.push({ text: text, pos: pos, cls: cls || '', key: key || '' }); }

/* Circuito común: succión y descarga de la bomba */
function pumpCircuit(spFeed, xNode, yNode) {
  var t = G.tank, p = G.pump, Z = G.ZP;
  addRun([V(-0.46, t.y0 + 0.01, t.z), V(-0.46, p.y, t.z), V(p.x - 0.071, p.y, p.z)], spFeed, 'al', { q: 'Q0' });
  var pts = [V(p.x - 0.045, p.y + 0.05, p.z), V(p.x - 0.045, 0.12, p.z), V(p.x - 0.045, 0.12, Z), V(xNode, 0.12, Z)];
  if (yNode > 0.12) pts.push(V(xNode, yNode, Z));
  addRun(pts, spFeed, 'al', { q: 'Q0' });
  // unión universal en la descarga
  swapMats.push(cylAlong(spFeed.De / 2 * 1.35, 0.016, M.fit, V(p.x - 0.045, 0.12, -0.02), V(0, 0, 1), 6, hyd));
}
function floorStub(x, y, sp, withSensor, circLabel) {
  var Z = G.ZP, z1 = 0.10;
  addTee(V(x, y, Z), UP, V(0, 0, -1), sp);
  addRun([V(x, y, Z - sp.De * 0.9), V(x, y, z1)], sp, 'rt', { capEnd: true, flow: false });
  addValve(V(x, y, 0.138), V(0, 0, -1), sp, V(1, 0, 0), 0);
  var end = null;
  if (withSensor) end = addPSensor(V(x, y, 0.175), sp, UP);
  return end;
}

function buildA() {
  var sp1 = H.PVC[S.spec.A.r1], sp2 = H.PVC[S.spec.A.r2], spF = H.PVC['1/2'], Z = G.ZP;
  var big = sp1.De > sp2.De ? sp1 : sp2; if (spF.De > big.De) big = spF;
  var x1 = -0.27, x2 = 0.10, yR2 = 0.28, yR1 = 0.47, xM = 0.16;
  pumpCircuit(spF, x1, yR2 - 0.0001 > 0.12 ? yR2 : 0.12);
  // nudos
  addTee(V(x1, yR2, Z), UP, V(1, 0, 0), big);
  addTee(V(x2, yR2, Z), V(1, 0, 0), UP, big);
  // ramal 2 (inferior, recto)
  addRun([V(x1, yR2, Z), V(x2, yR2, Z)], sp2, 'r2', { q: 'Q2' });
  // ramal 1 (superior)
  addRun([V(x1, yR2, Z), V(x1, yR1, Z), V(x2, yR1, Z), V(x2, yR2, Z)], sp1, 'r1', { q: 'Q1' });
  // accesorios en ambos ramales
  var cab = [];
  [[yR1, sp1, 'r1', 'Ramal 1'], [yR2, sp2, 'r2', 'Ramal 2']].forEach(function (it) {
    var y = it[0], sp = it[1], k = it[2];
    addValve(V(-0.215, y, Z), V(1, 0, 0), sp, V(0, 0, 1), 1);
    cab.push(addMeter(V(-0.135, y, Z), V(1, 0, 0), sp, V(0, 0, 1)));
    cab.push(addPSensor(V(-0.07, y, Z), sp, UP));
    cab.push(addPSensor(V(0.058, y, Z), sp, UP));
    addTape(V(-0.035, y, Z), V(1, 0, 0), sp, k === 'r1' ? M.tape1 : M.tape2);
    addTape(V(0.02, y, Z), V(1, 0, 0), sp, k === 'r1' ? M.tape1 : M.tape2);
    lab(it[3] + ' · Q' + (k === 'r1' ? '₁' : '₂') + ' · PVC ' + sp.nombre, (k === 'r1' ? V(0.0, y + 0.15, Z) : V(-0.02, y - 0.03, Z + 0.02)), k + (k === 'r1' ? '' : ' below'), k);
    if (k === 'r1') { lab('Válvula', V(-0.215, y + 0.06, Z + 0.02), '', 'valv'); lab('YF-S201', V(-0.135, y + 0.06, Z + 0.02), '', 'valv'); }
    lab('P₁', V(-0.07, y + 0.085, Z), '', 'psen'); lab('P₂', V(0.058, y + 0.085, Z), '', 'psen');
  });
  // montante y retorno al depósito
  var t = G.tank;
  addRun([V(x2, yR2, Z), V(xM, yR2, Z), V(xM, G.topY, Z), V(t.x, G.topY, Z), V(t.x, G.topY, t.z), V(t.x, t.y0 + t.h - 0.04, t.z)], spF, 'rt', { q: 'Q0' });
  G.taps.forEach(function (y, i) { floorStub(xM, y, spF, false); });
  var cols = [0xe11d48, 0x111827, 0xf59e0b, 0x2563eb, 0x16a34a, 0x9333ea, 0xf97316, 0x0ea5e9];
  cab.forEach(function (c, i) { addCable(c, cols[i % cols.length], i); });
  lab('Nudo N₁', V(x1 - 0.045, yR2 - 0.01, Z), '', 'node');
  lab('Nudo N₂', V(x2 + 0.005, yR2 - 0.045, Z), '', 'node');
  lab('Montante', V(xM + 0.035, 0.52, Z), '', 'mont');
  lab('Retorno al depósito', V(-0.12, G.topY + 0.035, Z), '', 'ret');
  lab('Consumos cerrados', V(xM + 0.06, G.taps[1] + 0.04, 0.16), '', 'stub');
  nodesInfo = { hyd: V(-0.08, 0.38, Z) };
}

function buildB() {
  var sp1 = H.PVC[S.spec.B.r1], sp2 = H.PVC[S.spec.B.r2], spF = H.PVC['3/4'], Z = G.ZP;
  var big = sp1.De > sp2.De ? sp1 : sp2; if (spF.De > big.De) big = spF;
  var xR2 = 0.16, xR1 = 0.22, y0 = 0.12, yT = G.topY, t = G.tank;
  pumpCircuit(spF, xR2, 0.12);
  addTee(V(xR2, y0, Z), V(1, 0, 0), UP, big);
  addTee(V(xR2, yT, Z), V(1, 0, 0), V(0, -1, 0), big);
  addRun([V(xR2, y0, Z), V(xR2, yT, Z)], sp2, 'r2', { q: 'Q2' });
  addRun([V(xR2, y0, Z), V(xR1, y0, Z), V(xR1, yT, Z), V(xR2, yT, Z)], sp1, 'r1', { q: 'Q1' });
  var cab = [];
  [[xR1, sp1, 'r1', 'Ramal 1'], [xR2, sp2, 'r2', 'Ramal 2']].forEach(function (it) {
    var x = it[0], sp = it[1], k = it[2];
    addValve(V(x, 0.19, Z), UP, sp, V(0, 0, 1), 1);
    cab.push(addMeter(V(x, 0.265, Z), UP, sp, V(0, 0, 1)));
    G.taps.forEach(function (y, i) {
      var e = floorStub(x, y, sp, true);
      if (e) cab.push(e);
      addTape(V(x, y - 0.05, Z), UP, sp, k === 'r1' ? M.tape1 : M.tape2);
    });
  });
  addRun([V(xR2, yT, Z), V(t.x, yT, Z), V(t.x, yT, t.z), V(t.x, t.y0 + t.h - 0.04, t.z)], spF, 'rt', { q: 'Q0' });
  var cols = [0xe11d48, 0x111827, 0xf59e0b, 0x2563eb, 0x16a34a, 0x9333ea, 0xf97316, 0x0ea5e9];
  cab.forEach(function (c, i) { addCable(c, cols[i % cols.length], i); });
  lab('Ramal 1 · PVC ' + sp1.nombre, V(xR1 + 0.03, 0.47, Z + 0.02), 'r1', 'r1');
  lab('Ramal 2 · PVC ' + sp2.nombre, V(xR2 - 0.075, 0.47, Z + 0.02), 'r2', 'r2');
  lab('Válvulas', V(0.19, 0.19 + 0.05, Z + 0.04), '', 'valv');
  lab('YF-S201', V(0.19, 0.265 + 0.055, Z + 0.04), '', 'meter');
  G.taps.forEach(function (y, i) { lab('P' + ['₁', '₂', '₃'][i] + ' / Q' + ['₁', '₂', '₃'][i], V(0.19, y + 0.075, 0.175), '', 'psen'); });
  lab('Retorno al depósito', V(-0.12, G.topY + 0.035, Z), '', 'ret');
  lab('Cabezal', V(-0.1, 0.155, Z), '', 'node');
  nodesInfo = { hyd: V(0.0, 0.45, Z) };
}

function buildHyd() {
  clearHyd();
  if (S.design === 'A') buildA(); else buildB();
  // rótulos comunes
  lab('Depósito 20 L', V(G.tank.x, G.tank.y0 + G.tank.h + 0.06, G.tank.z), '', 'tank');
  lab('Bomba 12 V', V(G.pump.x, 0.12, G.pump.z + 0.05), '', 'pump');
  lab('ESP32 · IoT', V(-0.08, 0.06, 0.05), '', 'esp');
  ['1.er piso', '2.º piso', '3.er piso'].forEach(function (t, i) { lab(t, V(G.bld.x1 + 0.0, G.floors[i] + 0.25, G.bld.z1 + 0.01), 'floor', 'floor'); });
  applyMode();
  rebuildLabels();
  buildCotas();
}

/* ------------------------------------------------------------- cotas */
var cotaLabels = [];
function buildCotas() {
  cotaGroup.children.slice().forEach(function (c) { cotaGroup.remove(c); if (c.geometry) c.geometry.dispose(); });
  cotaLabels = [];
  var segs = [], mat = new T.LineBasicMaterial({ color: S.theme === 'dark' ? 0xcfe0f5 : 0x1f3f66 });
  function dim(a, b, off, text) {
    var A = a.clone().add(off), B = b.clone().add(off);
    segs.push(A, B, a, A, b, B);
    var d = B.clone().sub(A).normalize(), n = off.clone().normalize().multiplyScalar(0.012);
    segs.push(A.clone().sub(n), A.clone().add(n), B.clone().sub(n), B.clone().add(n));
    cotaLabels.push({ text: text, pos: A.clone().add(B).multiplyScalar(0.5), cls: 'cota' });
  }
  var b = G.board;
  dim(V(-0.5, 0, 0.3), V(0.5, 0, 0.3), V(0, 0, 0.07), '1,00 m');
  dim(V(0.5, 0, -0.3), V(0.5, 0, 0.3), V(0.07, 0, 0), '0,60 m');
  dim(V(-0.5, 0, -0.3), V(-0.5, 1.0, -0.3), V(-0.06, 0, 0), '1,00 m');
  dim(V(G.bld.x1, G.floors[1], G.bld.z1), V(G.bld.x1, G.floors[2], G.bld.z1), V(0.06, 0, 0), '0,2903 m');
  if (S.design === 'A') {
    dim(V(-0.27, 0, G.ZP), V(-0.27, 0.28, G.ZP), V(-0.07, 0, 0), '0,28 m');
    dim(V(-0.27, 0.28, G.ZP), V(-0.27, 0.47, G.ZP), V(-0.07, 0, 0), '0,19 m');
    dim(V(-0.27, 0.47, G.ZP), V(0.10, 0.47, G.ZP), V(0, 0.07, 0), '0,37 m');
  }
  var geo = new T.BufferGeometry().setFromPoints(segs);
  cotaGroup.add(new T.LineSegments(geo, mat));
  cotaGroup.visible = S.cotas;
  rebuildLabels();
}

/* ------------------------------------------------------------- rótulos */
var labelsEl = document.getElementById('labels'), labelEls = [];
function rebuildLabels() {
  labelsEl.innerHTML = ''; labelEls = [];
  labelDefs.concat(S.cotas ? cotaLabels : []).forEach(function (d) {
    var el = document.createElement('div'); el.className = 'lab ' + d.cls; el.textContent = d.text;
    el.dataset.key = d.key || ''; labelsEl.appendChild(el); labelEls.push({ el: el, pos: d.pos, cls: d.cls });
  });
}
var projV = new T.Vector3();
function updateLabels() {
  var w = stage.clientWidth, h = stage.clientHeight;
  for (var i = 0; i < labelEls.length; i++) {
    var L = labelEls[i];
    if (L.cls === 'floor' && !S.building) { L.el.style.display = 'none'; continue; }
    projV.copy(L.pos).project(camera);
    if (projV.z > 1 || projV.x < -1.2 || projV.x > 1.2 || projV.y < -1.2 || projV.y > 1.2) { L.el.style.display = 'none'; continue; }
    L.el.style.display = '';
    L.el.style.left = ((projV.x + 1) / 2 * w).toFixed(1) + 'px';
    L.el.style.top = ((1 - projV.y) / 2 * h - (L.cls === 'floor' || L.cls === 'cota' ? 0 : L.cls.indexOf('below') >= 0 ? -10 : 10)).toFixed(1) + 'px';
  }
}

/* ------------------------------------------------------------ modos */
function applyMode() {
  [M.pvc, M.fit, M.cap].forEach(function (m) {
    m.transparent = S.glass; m.opacity = S.glass ? (m === M.pvc ? 0.26 : 0.5) : 1; m.depthWrite = !S.glass; m.needsUpdate = true;
  });
  waterMeshes.forEach(function (w) { w.visible = S.glass; });
  swapMats.forEach(function (m) { m.castShadow = !S.glass; });
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme);
  document.documentElement.setAttribute('data-palette', S.palette);
  document.querySelectorAll('#segTheme button').forEach(function (b) { b.classList.toggle('on', b.dataset.theme === S.theme); });
  document.querySelectorAll('#palGrid button').forEach(function (b) { b.classList.toggle('on', b.dataset.pal === S.palette); });
  var dark = S.theme === 'dark';
  hemi.intensity = dark ? 0.3 : 0.45;
  renderer.toneMappingExposure = dark ? 0.95 : 1.05;
  shadowCatcher.material.opacity = dark ? 0.35 : 0.18;
  buildCotas();
}
function applyLight() {
  sun.color.set(S.warm ? 0xffe6c7 : 0xffffff);
  sun.intensity = S.warm ? 1.45 : 1.6;
  floorLights.forEach(function (l) { l.intensity = S.warm ? 0.55 : 0; });
  M.lamp.color.set(S.warm ? 0xfff0cf : 0xe9eef3);
}

/* ------------------------------------------------------------ cámara */
var VIEWS = {
  iso: { p: V(-0.62, 0.92, 1.85), t: V(0.0, 0.43, 0) },
  front: { p: V(0, 0.5, 2.05), t: V(0, 0.5, 0) },
  top: { p: V(0.0, 2.25, 0.02), t: V(0, 0, 0) },
  side: { p: V(2.1, 0.55, 0.05), t: V(0, 0.5, 0) },
  hyd: { p: V(-0.15, 0.55, 1.05), t: V(-0.08, 0.38, 0.12) },
  bld: { p: V(0.62, 0.7, 1.0), t: V(0.3, 0.5, -0.02) }
};
var tween = null;
function fitDistance(p, t) {
  // aleja la cámara en pantallas angostas para que entre la maqueta
  var asp = camera.aspect, k = asp < 1 ? Math.min(2.0, 1.15 / asp) : 1;
  return t.clone().add(p.clone().sub(t).multiplyScalar(k));
}
function goTo(p, t, dur) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: fitDistance(p, t), t1: t.clone(), t: 0, d: dur || 1.1 };
}
function setView(name) {
  var v = VIEWS[name]; if (!v) return;
  if (name === 'hyd' && S.design === 'B') v = { p: V(0.05, 0.6, 1.25), t: V(0.05, 0.5, 0.12) };
  goTo(v.p, v.t);
  document.querySelectorAll('#segView button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === name); });
}
function stepTween(dt) {
  if (!tween) return;
  tween.t += dt / tween.d; var k = Math.min(1, tween.t), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
  if (k >= 1) tween = null;
}
renderer.domElement.addEventListener('dblclick', function (ev) {
  var r = renderer.domElement.getBoundingClientRect();
  var m = new T.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  var rc = new T.Raycaster(); rc.setFromCamera(m, camera);
  var hit = rc.intersectObjects(world.children, true).filter(function (h) { return h.object.visible && h.object.type === 'Mesh'; })[0];
  if (hit) { var off = camera.position.clone().sub(controls.target); goTo(hit.point.clone().add(off.multiplyScalar(0.6)), hit.point, 0.8); }
});

/* ------------------------------------------------------------ recorrido */
function tourSteps() {
  var A = S.design === 'A';
  return [
    { k: '', title: 'Vista general del sistema', text: 'El depósito, la bomba y dos ramales en paralelo forman un circuito de recirculación. El edificio muestra tres niveles y sus puntos de consumo, que permanecen cerrados durante el ensayo.', v: VIEWS.iso },
    { k: 'tank', title: 'Depósito y bomba de 12 V', text: 'El depósito abierto de 20 L alimenta la bomba de baja tensión. La bomba impulsa el agua hacia el nudo de reparto y el circuito devuelve el mismo caudal al depósito.', v: { p: V(-0.75, 0.55, 0.75), t: V(-0.36, 0.2, -0.05) } },
    { k: 'r1', title: 'Dos ramales en paralelo', text: A ? 'Entre los nudos N₁ y N₂ el caudal se reparte: Q₀ = Q₁ + Q₂. El ramal 1 sube 0,19 m y recorre 0,37 m; el ramal 2 va recto. Ambos tienen la misma pérdida de energía entre los mismos nudos.' : 'Desde el cabezal, el ramal 1 (PVC ' + H.PVC[S.spec.B.r1].nombre + ') y el ramal 2 (PVC ' + H.PVC[S.spec.B.r2].nombre + ') suben en paralelo junto al edificio y se unen arriba. Q₀ = Q₁ + Q₂.', v: A ? { p: V(-0.1, 0.5, 1.0), t: V(-0.08, 0.38, 0.15) } : { p: V(0.15, 0.62, 1.1), t: V(0.18, 0.5, 0.15) } },
    { k: 'valv', title: 'Válvulas de bola y caudalímetros', text: 'Cada ramal tiene una válvula de bola para regular la apertura (100, 75 y 50 %) y un caudalímetro YF-S201 de 1–30 L/min, con salida de 450 pulsos por litro (F = 7,5 Q).', v: A ? { p: V(-0.3, 0.5, 0.65), t: V(-0.17, 0.37, 0.22) } : { p: V(0.0, 0.35, 0.65), t: V(0.19, 0.23, 0.22) } },
    { k: 'psen', title: 'Tomas de presión', text: A ? 'Las tomas P₁ y P₂ quedan después del medidor, separadas 0,128 m. A 4 L/min, la fricción ideal de ese tramo es solo 10,9 Pa: los sensores deben resolver diferencias muy pequeñas.' : 'Cada piso tiene una toma de presión por ramal. Entre pisos la presión cambia ρgΔz ≈ 2843 Pa por la altura, mucho más que la fricción, que es de decenas de pascales.', v: A ? { p: V(0.0, 0.62, 0.6), t: V(0.0, 0.4, 0.22) } : { p: V(0.45, 0.6, 0.75), t: V(0.19, 0.55, 0.16) } },
    { k: A ? 'mont' : 'r2', title: A ? 'Montante y pisos' : 'Salidas por piso', text: 'Las salidas de los tres pisos están cerradas durante la recirculación (válvulas cruzadas). La separación entre pisos es 0,2903 m: una diferencia hidrostática de 2843 Pa que no es pérdida por fricción.', v: { p: V(0.7, 0.75, 0.95), t: V(0.22, 0.6, 0.1) } },
    { k: 'ret', title: 'Retorno al depósito', text: 'Todo el caudal Q₀ vuelve al depósito abierto. El circuito recirculante reduce el agua de reposición y permite repetir los ensayos con los mismos componentes.', v: { p: V(-0.3, 1.25, 1.0), t: V(-0.12, 0.8, 0.05) } },
    { k: 'esp', title: 'ESP32 y registro IoT', text: 'El ESP32 lee la presión a 10 Hz y cuenta los pulsos de caudal en ventanas de 1 s o más, con respaldo local si cae el Wi‑Fi. Los valores del panel son teóricos y no reemplazan la medición calibrada.', v: { p: V(0.05, 0.3, 0.55), t: V(-0.08, 0.05, 0.05) } }
  ];
}
var tourI = 0, tourOn = true;
function showTour(i) {
  var st = tourSteps(); tourI = (i + st.length) % st.length; var s = st[tourI];
  document.getElementById('tourStep').textContent = (tourI + 1) + ' / ' + st.length;
  document.getElementById('tourTitle').textContent = s.title;
  document.getElementById('tourText').textContent = s.text;
  goTo(s.v.p, s.v.t, 1.3);
  labelEls.forEach(function (L) { L.el.classList.toggle('hi', !!s.k && L.el.dataset.key === s.k); });
}

/* ------------------------------------------------------------ panel de cálculo */
function fmt(x, d) { if (x == null || !isFinite(x)) return '—'; return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function sci(x) { if (x == null) return '—'; var e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e); return fmt(m, 3) + ' × 10' + sup(e); }
function sup(n) { var m = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }; return String(n).split('').map(function (c) { return m[c]; }).join(''); }
var IS010_VMAX = { '1/2': 1.90, '3/4': 2.20, '1': 2.48 };
function compute() {
  var d = S.design, s1 = H.PVC[S.spec[d].r1], s2 = H.PVC[S.spec[d].r2];
  return { r1: H.tramo(S.Q1, s1.Di, S.L[d].r1), r2: H.tramo(S.Q2, s2.Di, S.L[d].r2), s1: s1, s2: s2 };
}
function renderCalc() {
  var c = compute(), a = c.r1, b = c.r2;
  function hfTxt(r) { return r.hf != null ? fmt(r.hf, 6) : (r.regimen === 'Transición' ? 'Transición' : '—'); }
  var rows = [
    ['Diámetro interior Di (mm)', fmt(c.s1.Di * 1000, 1), fmt(c.s2.Di * 1000, 1)],
    ['Área interior A (mm²)', fmt(a.A * 1e6, 1), fmt(b.A * 1e6, 1)],
    ['Velocidad v (m/s)', fmt(a.v, 3), fmt(b.v, 3)],
    ['Reynolds Re', fmt(a.Re, 0), fmt(b.Re, 0)],
    ['Régimen', a.regimen, b.regimen],
    ['Factor de Darcy f', a.f != null ? fmt(a.f, 5) : '—', b.f != null ? fmt(b.f, 5) : '—'],
    ['Pérdida hf (m c.a.)', hfTxt(a), hfTxt(b), 'key'],
    ['Δp por fricción (Pa)', a.dp != null ? fmt(a.dp, 2) : '—', b.dp != null ? fmt(b.dp, 2) : '—', 'key'],
    ['Carga de velocidad v²/2g (mm)', fmt(a.hv * 1000, 2), fmt(b.hv * 1000, 2)]
  ];
  document.querySelector('#resTable tbody').innerHTML = rows.map(function (r) {
    return '<tr class="' + (r[3] || '') + '"><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
  }).join('');
  var notes = [];
  [['Ramal 1', a, c.s1], ['Ramal 2', b, c.s2]].forEach(function (x) {
    var r = x[1];
    if (r.regimen === 'Transición') notes.push(['warn', x[0] + ': Re = ' + fmt(r.Re, 0) + ' está en la transición. Como referencia, las ramas laminar y turbulenta dan ' + fmt(r.hfLam, 5) + ' y ' + fmt(r.hfTurb, 5) + ' m; no es un valor único.']);
    if (r.QLmin > 0 && r.v < 0.6) notes.push(['', x[0] + ': v = ' + fmt(r.v, 2) + ' m/s, menor que 0,60 m/s, la velocidad mínima referencial de la IS.010 para redes reales. En una maqueta educativa es esperable.']);
    if (r.v > IS010_VMAX[x[2].id]) notes.push(['warn', x[0] + ': v = ' + fmt(r.v, 2) + ' m/s supera la máxima referencial de la IS.010 para ' + x[2].nombre + ' (' + fmt(IS010_VMAX[x[2].id], 2) + ' m/s).']);
  });
  if (a.hf != null && b.hf != null && a.hf > 0 && b.hf > 0) {
    notes.push(['', 'Los ramales están en paralelo: en la red real sus pérdidas totales entre los mismos nudos se igualan y los caudales se reparten hasta lograrlo. Aquí Q₁ y Q₂ son datos ingresados, no una predicción.']);
  }
  notes.push(['', 'Cada piso está 0,2903 m más alto: ρgΔz = ' + fmt(H.hidrostatica(0.2903), 0) + ' Pa. Esa diferencia es altura, no fricción.']);
  document.getElementById('notes').innerHTML = notes.map(function (n) { return '<div class="note ' + n[0] + '">' + n[1] + '</div>'; }).join('');
  document.getElementById('stQ0').textContent = fmt(S.Q1 + S.Q2, 2);
  document.getElementById('stH1').textContent = a.hf != null ? fmt(a.hf, 4) : 'Trans.';
  document.getElementById('stH2').textContent = b.hf != null ? fmt(b.hf, 4) : 'Trans.';
  document.getElementById('stHid').textContent = fmt(H.hidrostatica(0.2903), 0);
  $('pQ0').textContent = $('stQ0').textContent; $('pH1').textContent = $('stH1').textContent; $('pH2').textContent = $('stH2').textContent;
  document.getElementById('lgR1').textContent = c.s1.nombre; document.getElementById('lgR2').textContent = c.s2.nombre;
}

/* ------------------------------------------------------------ interfaz */
function $(id) { return document.getElementById(id); }
function syncInputs() {
  var d = S.design;
  $('selD1').value = S.spec[d].r1; $('selD2').value = S.spec[d].r2;
  $('inL1').value = S.L[d].r1; $('inL2').value = S.L[d].r2;
  $('inQ1').value = S.Q1; $('inQ2').value = S.Q2;
  document.querySelectorAll('#chipsQ button').forEach(function (b) { b.classList.toggle('on', +b.dataset.q === S.Q1 && S.Q1 === S.Q2); });
}
document.querySelectorAll('#segDesign button').forEach(function (b) {
  b.onclick = function () {
    S.design = b.dataset.design;
    document.querySelectorAll('#segDesign button').forEach(function (x) { x.classList.toggle('on', x === b); });
    buildHyd(); syncInputs(); renderCalc(); if (!$('tour').classList.contains('hidden')) showTour(tourI);
  };
});
document.querySelectorAll('#segView button').forEach(function (b) { b.onclick = function () { setView(b.dataset.view); }; });
document.querySelectorAll('#segMode button').forEach(function (b) {
  b.onclick = function () { S.glass = b.dataset.mode === 'glass'; document.querySelectorAll('#segMode button').forEach(function (x) { x.classList.toggle('on', x === b); }); applyMode(); };
});
$('inQ1').oninput = function () { S.Q1 = Math.max(0, Math.min(30, +this.value || 0)); renderCalc(); syncChips(); };
$('inQ2').oninput = function () { S.Q2 = Math.max(0, Math.min(30, +this.value || 0)); renderCalc(); syncChips(); };
function syncChips() { document.querySelectorAll('#chipsQ button').forEach(function (b) { b.classList.toggle('on', +b.dataset.q === S.Q1 && S.Q1 === S.Q2); }); }
document.querySelectorAll('#chipsQ button').forEach(function (b) { b.onclick = function () { S.Q1 = S.Q2 = +b.dataset.q; syncInputs(); renderCalc(); }; });
$('selD1').onchange = function () { S.spec[S.design].r1 = this.value; buildHyd(); renderCalc(); };
$('selD2').onchange = function () { S.spec[S.design].r2 = this.value; buildHyd(); renderCalc(); };
$('inL1').oninput = function () { S.L[S.design].r1 = Math.max(0, +this.value || 0); renderCalc(); };
$('inL2').oninput = function () { S.L[S.design].r2 = Math.max(0, +this.value || 0); renderCalc(); };
$('btnResetL').onclick = function () { S.L[S.design] = { r1: DEF_L[S.design].r1, r2: DEF_L[S.design].r2 }; syncInputs(); renderCalc(); };
$('ckLabels').onchange = function () { S.labels = this.checked; labelsEl.classList.toggle('off', !S.labels); };
$('ckCotas').onchange = function () { S.cotas = this.checked; cotaGroup.visible = S.cotas; rebuildLabels(); };
$('ckBuilding').onchange = function () { S.building = this.checked; bldGroup.visible = S.building; };
$('btnPause').onclick = function () { S.paused = !S.paused; this.textContent = S.paused ? 'Reanudar flujo' : 'Pausar flujo'; this.classList.toggle('on', S.paused); };
$('btnRotate').onclick = function () { S.autorot = !S.autorot; controls.autoRotate = S.autorot; controls.autoRotateSpeed = 0.9; this.classList.toggle('on', S.autorot); };
$('btnLight').onclick = function () { S.warm = !S.warm; this.classList.toggle('on', S.warm); this.textContent = S.warm ? 'Luz cálida' : 'Luz neutra'; applyLight(); };
function setTheme(t) { S.theme = t; try { localStorage.setItem('hid-theme', S.theme); } catch (e) {} applyTheme(); }
$('btnTheme').onclick = function (e) { e.stopPropagation(); var p = $('themePop'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden)); };
$('themePop').onclick = function (e) { e.stopPropagation(); };
document.addEventListener('click', function () { $('themePop').hidden = true; $('btnTheme').setAttribute('aria-expanded', 'false'); });
document.querySelectorAll('#segTheme button').forEach(function (b) { b.onclick = function () { setTheme(b.dataset.theme); }; });
document.querySelectorAll('#palGrid button').forEach(function (b) { b.onclick = function () { S.palette = b.dataset.pal; try { localStorage.setItem('hid-palette', S.palette); } catch (e) {} applyTheme(); }; });
// barra flotante del modo presentación
document.querySelectorAll('#pbar [data-pv]').forEach(function (b) { b.onclick = function () { setView(b.dataset.pv); syncPbar(b.dataset.pv); }; });
$('pPause').onclick = function () { $('btnPause').click(); syncPbar(); };
$('pRotate').onclick = function () { $('btnRotate').click(); syncPbar(); };
$('pMode').onclick = function () { document.querySelector('#segMode [data-mode=' + (S.glass ? 'pvc' : 'glass') + ']').click(); syncPbar(); };
function syncPbar(view) {
  if (view) document.querySelectorAll('#pbar [data-pv]').forEach(function (b) { b.classList.toggle('on', b.dataset.pv === view); });
  $('pPause').textContent = S.paused ? 'Reanudar' : 'Pausar'; $('pPause').classList.toggle('on', S.paused);
  $('pRotate').classList.toggle('on', S.autorot);
  $('pMode').textContent = S.glass ? 'PVC real' : 'Flujo visible';
}
$('btnTour').onclick = function () { var t = $('tour'); var hid = t.classList.toggle('hidden'); this.classList.toggle('on', !hid); if (!hid) showTour(tourI); else labelEls.forEach(function (L) { L.el.classList.remove('hi'); }); };
$('tourPrev').onclick = function () { showTour(tourI - 1); };
$('tourNext').onclick = function () { showTour(tourI + 1); };
$('btnPresent').onclick = function () { togglePresent(); };
function togglePresent() {
  var on = document.body.classList.toggle('present');
  $('btnPresent').textContent = on ? 'Salir de presentación' : 'Modo presentación';
  if (on) { $('tour').classList.remove('hidden'); $('btnTour').classList.add('on'); showTour(0); syncPbar('iso'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); }
  else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  setTimeout(resize, 60);
}
document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') showTour(tourI + 1);
  else if (e.key === 'ArrowLeft') showTour(tourI - 1);
  else if (e.key === 'p' || e.key === 'P' || e.key === ' ') { e.preventDefault(); $('btnPause').click(); }
  else if (e.key === 't' || e.key === 'T') setTheme(S.theme === 'dark' ? 'light' : 'dark');
  else if (e.key === 'f' || e.key === 'F') togglePresent();
  else if (e.key === 'Escape' && document.body.classList.contains('present')) togglePresent();
});

/* ------------------------------------------------------------ bucle */
function resize() {
  var w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && document.body.classList.contains('present')) togglePresent(); setTimeout(resize, 60); });
var clock = new T.Clock(), tAcc = 0;
function loop() {
  var dt = Math.min(0.05, clock.getDelta()); tAcc += dt;
  stepTween(dt); controls.update(); updateFlows(dt);
  espLed.visible = Math.floor(tAcc * 2) % 2 === 0;
  tankWaterTop.scale.y = 1 + Math.sin(tAcc * 1.7) * 0.004;
  renderer.render(scene, camera); updateLabels();
  requestAnimationFrame(loop);
}

/* arranque */
applyTheme(); applyLight(); buildHyd(); syncInputs(); renderCalc(); resize();
goTo(VIEWS.iso.p, VIEWS.iso.t, 0.01);
showTour(0);
loop();
window.HID = { S: S, compute: compute, setView: setView, showTour: showTour, buildHyd: buildHyd, renderCalc: renderCalc, camera: camera, controls: controls, scene: scene };
})();
