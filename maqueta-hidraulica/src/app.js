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
  theme: 'light', palette: 'azul',
  Qu1: 4, Qu2: 4, Q0: 8, flowMode: 'dato', open: { r1: 100, r2: 100 }, K: null, ptab: 'calc', via: 'r1', scenMsg: ''
};
S.K = { codo: H.K_REF.codo, teeRecto: H.K_REF.teeRecto, teeDeriv: H.K_REF.teeDeriv, medidor: H.K_REF.medidor };
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

/* Entorno HDRI de estudio (Poly Haven, CC0) embebido; si falla queda el entorno generado. */
(function () {
  if (!window.HDRI_STUDIO || !T.EXRLoader) return;
  try {
    new T.EXRLoader().setDataType(T.HalfFloatType).load(window.HDRI_STUDIO, function (tex) {
      var pm = new T.PMREMGenerator(renderer); var env = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose();
      /* el HDRI de estudio solo en metales (reflejos nítidos); el resto mantiene el entorno cálido */
      Object.keys(M).forEach(function (k) { var m = M[k]; if (m && m.isMaterial && m.metalness >= 0.5) { m.envMap = env; m.envMapIntensity = 0.9; m.needsUpdate = true; } });
    });
  } catch (e) {}
})();

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
function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function shade(hex, k) { var c = new T.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }
function mkCanvas(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function texFrom(c, rx, ry, srgb) {
  var t = new T.CanvasTexture(c); t.anisotropy = 8;
  if (srgb !== false) t.encoding = T.sRGBEncoding;
  if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); }
  return t;
}
function canvasTex(w, h, draw, rx, ry) { return texFrom(mkCanvas(w, h, draw), rx, ry); }
/* Mapa normal a partir de un mapa de alturas en escala de grises. */
function normalFrom(hc, strength, rx, ry) {
  var w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  var out = document.createElement('canvas'); out.width = w; out.height = h;
  var g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  function H(x, y) { x = (x + w) % w; y = (y + h) % h; return src[(y * w + x) * 4] / 255; }
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    var nx = -dx, ny = dy, nz = 1, l = Math.sqrt(nx * nx + ny * ny + nz * nz), i = (y * w + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return texFrom(out, rx, ry, false);
}
/* Juego de cerámica: color + relieve de fragua */
function tileSet(o) {
  var W = o.size || 512, r = rnd(o.seed || 5);
  var col = mkCanvas(W, W, function () {}), hei = mkCanvas(W, W, function () {});
  var gc = col.getContext('2d'), gh = hei.getContext('2d');
  gc.fillStyle = o.grout; gc.fillRect(0, 0, W, W); gh.fillStyle = '#000'; gh.fillRect(0, 0, W, W);
  var tw = W / o.cols, th = W / o.rows, gp = o.gap * W;
  for (var j = 0; j < o.rows + 1; j++) for (var i = -1; i < o.cols + 1; i++) {
    var x = i * tw + (o.stagger && j % 2 ? tw / 2 : 0), y = j * th;
    var base = shade(o.base, (r() - 0.5) * o.jitter);
    gc.fillStyle = base; gc.fillRect(x + gp, y + gp, tw - 2 * gp, th - 2 * gp);
    if (o.veins) {
      gc.strokeStyle = 'rgba(120,120,120,0.10)'; gc.lineWidth = 1;
      for (var v = 0; v < 3; v++) { gc.beginPath(); gc.moveTo(x + r() * tw, y + gp); gc.bezierCurveTo(x + r() * tw, y + r() * th, x + r() * tw, y + r() * th, x + r() * tw, y + th - gp); gc.stroke(); }
    }
    var lg = gc.createLinearGradient(x, y, x, y + th); lg.addColorStop(0, 'rgba(255,255,255,.12)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)');
    gc.fillStyle = lg; gc.fillRect(x + gp, y + gp, tw - 2 * gp, th - 2 * gp);
    // relieve: borde redondeado
    for (var k = 0; k < 4; k++) { gh.fillStyle = 'rgb(' + (120 + k * 40) + ',' + (120 + k * 40) + ',' + (120 + k * 40) + ')'; gh.fillRect(x + gp + k, y + gp + k, tw - 2 * gp - 2 * k, th - 2 * gp - 2 * k); }
  }
  return { map: texFrom(col, o.rx, o.ry), normalMap: normalFrom(hei, o.normal || 3, o.rx, o.ry) };
}
var TS_FLOOR = tileSet({ cols: 4, rows: 4, base: '#cfc6b8', grout: '#9b948a', gap: 0.006, jitter: 0.04, veins: true, rx: 2.2, ry: 2.8, seed: 3 });
var TS_WALL = tileSet({ cols: 4, rows: 8, stagger: true, base: '#f2f4f5', grout: '#c3cad0', gap: 0.008, jitter: 0.025, rx: 2.4, ry: 2.4, seed: 9 });
var TS_WALL2 = tileSet({ cols: 4, rows: 8, stagger: true, base: '#d9e5ec', grout: '#a9b6c0', gap: 0.008, jitter: 0.03, rx: 2.4, ry: 2.4, seed: 13 });
/* Tarrajeo / concreto: ruido de baja y alta frecuencia */
function plaster(base, seed, amp, rx) {
  var r = rnd(seed), W = 256;
  var hc = mkCanvas(W, W, function (g) {
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, W);
    for (var i = 0; i < 2600; i++) { var v = Math.floor(100 + r() * 60); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + r() * 0.35) + ')'; g.beginPath(); g.arc(r() * W, r() * W, 0.6 + r() * 2.4, 0, 7); g.fill(); }
  });
  var cc = mkCanvas(W, W, function (g) {
    g.fillStyle = base; g.fillRect(0, 0, W, W);
    for (var i = 0; i < 900; i++) { g.fillStyle = 'rgba(0,0,0,' + (r() * 0.035) + ')'; g.beginPath(); g.arc(r() * W, r() * W, 1 + r() * 6, 0, 7); g.fill(); }
  });
  return { map: texFrom(cc, rx, rx), normalMap: normalFrom(hc, amp, rx, rx) };
}
var TX_PLASTER = plaster('#f4f2ec', 21, 1.4, 3);
var TX_CONCRETE = plaster('#cfcbc3', 33, 2.2, 4);
/* Madera contrachapada con veta */
var WOOD_C = mkCanvas(2048, 1024, function (g, w, h) {
  var r = rnd(7), gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#caa071'); gr.addColorStop(0.5, '#c29567'); gr.addColorStop(1, '#cda577');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (var i = 0; i < 260; i++) {
    var y = r() * h, a = 0.04 + r() * 0.12, f = 90 + r() * 140, ph = r() * 10;
    g.strokeStyle = (r() > 0.45 ? 'rgba(115,72,36,' : 'rgba(240,206,160,') + a + ')';
    g.lineWidth = 0.6 + r() * 2.6; g.beginPath();
    for (var x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x / f + ph) * (3 + r() * 1.5) + Math.sin(x / (f * 3.1)) * 9);
    g.stroke();
  }
  for (var k = 0; k < 5; k++) { var kx = r() * w, ky = r() * h; for (var q = 1; q < 9; q++) { g.strokeStyle = 'rgba(100,60,30,' + (0.18 - q * 0.015) + ')'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(kx, ky, q * 5, q * 2.2, 0, 0, 7); g.stroke(); } }
});
var texWood = texFrom(WOOD_C);
/* Texto impreso en el PVC (se repite cada 0,30 m) */
var texPrint = canvasTex(256, 1024, function (g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w * 0.22, h * 0.04); g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(28,45,80,.62)'; g.font = 'bold 19px Arial';
  g.fillText('PVC-U  AGUA FRÍA  C-10  NTP 399.002  ▸▸', 0, 0); g.restore();
  g.save(); g.translate(w * 0.72, h * 0.54); g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(28,45,80,.62)'; g.font = 'bold 19px Arial';
  g.fillText('PVC-U  AGUA FRÍA  C-10  NTP 399.002  ▸▸', 0, 0); g.restore();
});
texPrint.wrapS = texPrint.wrapT = T.RepeatWrapping;
var texMeter = canvasTex(256, 256, function (g, w, h) {
  var gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#22262b'); gr.addColorStop(1, '#111316');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 10, 0, 7); g.stroke();
  g.fillStyle = '#dfe5ea'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('YF-S201', w / 2, 96);
  g.font = '18px Arial'; g.fillText('DN15  1–30 L/min', w / 2, 124); g.fillText('5–18 V DC', w / 2, 148);
  g.lineWidth = 8; g.strokeStyle = '#dfe5ea'; g.beginPath(); g.moveTo(70, 190); g.lineTo(178, 190); g.stroke();
  g.beginPath(); g.moveTo(194, 190); g.lineTo(166, 172); g.lineTo(166, 208); g.closePath(); g.fillStyle = '#dfe5ea'; g.fill();
});
var texPcb = canvasTex(512, 256, function (g, w, h) {
  g.fillStyle = '#10151d'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,110,140,.35)'; g.lineWidth = 2; var r = rnd(4);
  for (var i = 0; i < 40; i++) { g.beginPath(); var x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 80); g.stroke(); }
  g.fillStyle = '#c5ccd3'; g.fillRect(150, 36, 230, 176);
  g.strokeStyle = '#9aa3ab'; g.strokeRect(150, 36, 230, 176);
  g.fillStyle = '#39424d'; g.font = 'bold 36px Arial'; g.fillText('ESP32', 205, 118); g.font = '20px Arial'; g.fillText('WROOM-32', 210, 150);
  g.fillStyle = '#d4af37'; for (var k = 0; k < 19; k++) { g.fillRect(16 + k * 25.6, 8, 12, 12); g.fillRect(16 + k * 25.6, h - 20, 12, 12); }
  g.strokeStyle = '#d4af37'; g.lineWidth = 4; g.beginPath(); g.moveTo(400, 60); for (var z = 0; z < 6; z++) { g.lineTo(400 + (z % 2) * 70, 60 + z * 24); } g.stroke();
});
var texPlate = canvasTex(256, 128, function (g, w, h) {
  var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e9edf1'); gr.addColorStop(1, '#b8c0c8');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#7d8790'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#1d2a3a'; g.font = 'bold 26px Arial'; g.fillText('BOMBA 12 V DC', 22, 44);
  g.font = '18px Arial'; g.fillText('Q máx 10 L/min', 22, 74); g.fillText('H máx 5 m  ·  60 W', 22, 100);
});
var texPsu = canvasTex(256, 256, function (g, w, h) {
  g.fillStyle = '#b9c0c7'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3b434c'; for (var y = 0; y < 9; y++) for (var x = 0; x < 9; x++) { g.beginPath(); g.arc(24 + x * 26, 24 + y * 26, 7, 0, 7); g.fill(); }
});
var texScale = canvasTex(128, 512, function (g, w, h) {
  g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(30,60,110,.85)'; g.strokeStyle = 'rgba(30,60,110,.85)';
  g.font = 'bold 22px Arial'; g.lineWidth = 3;
  for (var i = 0; i <= 20; i++) {
    var y = h - 8 - i * (h - 16) / 20, L = i % 5 === 0 ? 46 : 22;
    g.beginPath(); g.moveTo(8, y); g.lineTo(8 + L, y); g.stroke();
    if (i % 5 === 0 && i > 0) g.fillText(i + ' L', 62, y + 8);
  }
});

/* ---------------------------------------------------------- materiales */
function std(c, r, m, o) { var p = { color: c, roughness: r == null ? 0.5 : r, metalness: m || 0 }; for (var k in o) p[k] = o[k]; return new T.MeshStandardMaterial(p); }
function phys(c, r, m, o) { var p = { color: c, roughness: r == null ? 0.5 : r, metalness: m || 0 }; for (var k in o) p[k] = o[k]; return new T.MeshPhysicalMaterial(p); }
var M = {
  pvc: phys(0xf2f2ee, 0.3, 0, { clearcoat: 0.45, clearcoatRoughness: 0.28, map: texPrint }),
  fit: phys(0xebebe6, 0.36, 0, { clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  brass: std(0xd9ab55, 0.24, 1), brassDark: std(0xb98a3c, 0.35, 1), chrome: std(0xffffff, 0.06, 1), steel: std(0xcfd3d7, 0.26, 1),
  black: std(0x17191c, 0.52), nylon: phys(0x141619, 0.48, 0, { clearcoat: 0.25, clearcoatRoughness: 0.5 }), rubber: std(0x0c0d0f, 0.88),
  dark: std(0x2d3239, 0.45, 0.4), red: phys(0xd0202a, 0.38, 0, { clearcoat: 0.6, clearcoatRoughness: 0.3 }), redGrip: std(0xb3141d, 0.72),
  pump: phys(0x1c4fd0, 0.32, 0.35, { clearcoat: 0.9, clearcoatRoughness: 0.18 }), pumpDark: phys(0x163e9e, 0.4, 0.3, { clearcoat: 0.6 }),
  powder: phys(0x22262c, 0.55, 0.35, { clearcoat: 0.25, clearcoatRoughness: 0.6 }), alu: std(0xd7dbdf, 0.32, 1),
  wood: std(0xffffff, 0.58, 0, { map: texWood }), board2: phys(0x1f3048, 0.5, 0.1, { clearcoat: 0.4 }),
  plaster: std(0xffffff, 0.85, 0, { map: TX_PLASTER.map, normalMap: TX_PLASTER.normalMap, normalScale: new T.Vector2(0.6, 0.6) }),
  concrete: std(0xffffff, 0.9, 0, { map: TX_CONCRETE.map, normalMap: TX_CONCRETE.normalMap }),
  white: std(0xf7f6f2, 0.7), column: std(0xfbfbf9, 0.65),
  wallTile: phys(0xffffff, 0.18, 0, { map: TS_WALL.map, normalMap: TS_WALL.normalMap, normalScale: new T.Vector2(0.9, 0.9), clearcoat: 0.6, clearcoatRoughness: 0.15 }),
  wallTile2: phys(0xffffff, 0.2, 0, { map: TS_WALL2.map, normalMap: TS_WALL2.normalMap, normalScale: new T.Vector2(0.9, 0.9), clearcoat: 0.5, clearcoatRoughness: 0.2 }),
  floorTile: phys(0xffffff, 0.24, 0, { map: TS_FLOOR.map, normalMap: TS_FLOOR.normalMap, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
  roofTile: phys(0xb9502c, 0.62, 0, { clearcoat: 0.15 }), roofTile2: phys(0xa8462a, 0.66, 0, { clearcoat: 0.1 }), roofBase: std(0x6e3a26, 0.8),
  fascia: std(0x8a5a3a, 0.55, 0, { map: texWood }),
  ceramic: phys(0xfdfdfb, 0.08, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }), mirror: std(0xffffff, 0.02, 1),
  marble: phys(0xe9e6df, 0.15, 0, { clearcoat: 0.8 }), towel: std(0x5c7fa8, 0.95), mat: std(0x8aa3b8, 0.95),
  glass: phys(0xe6f4f8, 0.03, 0, { transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide, clearcoat: 1 }),
  tankGlass: phys(0xf4faff, 0.04, 0, { transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.03 }),
  tankWater: phys(0x2f8fd0, 0.05, 0, { transparent: true, opacity: 0.42, depthWrite: false, clearcoat: 1 }),
  waterTop: phys(0x5fb8ea, 0.02, 0, { transparent: true, opacity: 0.55, depthWrite: false, clearcoat: 1 }),
  lid: phys(0x1d4ed8, 0.38, 0, { clearcoat: 0.6 }), frame: std(0x3a4250, 0.4, 0.8), lamp: new T.MeshBasicMaterial({ color: 0xfff3d6 }),
  pcbGreen: std(0x12161d, 0.5), pcb: std(0xffffff, 0.4, 0.2, { map: texPcb }),
  boxClear: phys(0xeef6ff, 0.05, 0, { transparent: true, opacity: 0.2, depthWrite: false, clearcoat: 1 }),
  led: new T.MeshBasicMaterial({ color: 0xff2b2b }), meterTop: std(0xffffff, 0.45, 0, { map: texMeter }),
  plate: std(0xffffff, 0.3, 0.6, { map: texPlate }), psu: std(0xffffff, 0.35, 0.8, { map: texPsu }),
  scale: new T.MeshBasicMaterial({ map: texScale, transparent: true, depthWrite: false }),
  tape1: std(0x2563eb, 0.45), tape2: std(0xdc2626, 0.45), cap: phys(0xe9ebe7, 0.4, 0, { clearcoat: 0.3 }),
  wire: {}
};

var CIRC = { r1: 0x1d4ed8, r2: 0xe11d48, al: 0x0891b2, rt: 0x7c3aed };
var WATER = {}, DOTMAT = {};
Object.keys(CIRC).forEach(function (k) {
  WATER[k] = new T.MeshStandardMaterial({ color: CIRC[k], roughness: 0.25, transparent: true, opacity: 0.8, emissive: CIRC[k], emissiveIntensity: 0.12, toneMapped: false, depthWrite: false });
  var c = new T.Color(CIRC[k]).lerp(new T.Color(0xffffff), 0.82);
  DOTMAT[k] = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, toneMapped: false });
});

/* contraste: el edificio va en arena y gris azulado para que la tubería blanca y el agua de color resalten */
M.plaster.color.setHex(0xcdb99a); M.white.color.setHex(0xc9bba5); M.column.color.setHex(0xd3c4ab);
M.concrete.color.setHex(0x9c968c); M.wallTile.color.setHex(0xaebccb); M.wallTile2.color.setHex(0xa3b4c6);
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

/* ------------------------------------------------------------ escena fija */
var world = new T.Group(); scene.add(world);
var bldGroup = new T.Group(); world.add(bldGroup);
var hyd = new T.Group(); world.add(hyd);
var cotaGroup = new T.Group(); world.add(cotaGroup);
var floorLights = [];

// sombra sobre "mesa"
var shadowCatcher = new T.Mesh(new T.PlaneGeometry(6, 6), new T.ShadowMaterial({ opacity: 0.18 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = -G.board.t - 0.0005; shadowCatcher.receiveShadow = true; world.add(shadowCatcher);

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

/* ---------------------------------------------------------- red hidráulica */
var flows = [];        // trazadores
var labelDefs = [];    // rótulos del diseño activo
var swapMats = [];     // tuberías cuyo material cambia con el modo
var waterMeshes = [];
var nodesInfo = {};

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
  im.frustumCulled = false; im.renderOrder = 6; hyd.add(im);
  flows.push({ line: line, cum: cum, total: total, count: count, im: im, sp: sp, q: qkey, offset: Math.random() * total, rad: sp.Di * 0.21 });
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
  (function () {
    var u = new T.Group(), r = spFeed.De / 2, Zd = V(0, 0, 1);
    var nut = hexMesh(spFeed.De * 1.55, 0.011, M.fit); alignY(nut, Zd, V(p.x - 0.045, 0.12, -0.02)); u.add(nut);
    [-1, 1].forEach(function (k) { var c = mesh(hubGeo(r, 0.012), M.fit); alignY(c, V(0, 0, -k), V(p.x - 0.045, 0.12, -0.02 + k * 0.0175)); u.add(c); });
    hyd.add(u); u.traverse(function (o) { if (o.isMesh) swapMats.push(o); });
  })();
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
    addValve(V(-0.215, y, Z), V(1, 0, 0), sp, V(0, 0, 1), S.open[k] / 100);
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
    addValve(V(x, 0.19, Z), UP, sp, V(0, 0, 1), S.open[k] / 100);
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
    m.transparent = S.glass; m.opacity = S.glass ? (m === M.pvc ? 0.12 : 0.3) : 1; m.depthWrite = !S.glass; m.needsUpdate = true;
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
  if (S.Q1 != null) { try { renderEng(); if (S.ptab === 'gra') renderCharts(); if (S.ptab === 'iot') renderIoT(); } catch (e) {} }
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
  solveFlows();
  var c = compute(), a = c.r1, b = c.r2, g1 = branchDef('r1'), g2 = branchDef('r2'), q1 = H.ramal(g1, S.Q1), q2 = H.ramal(g2, S.Q2);
  function hl(g, q) { return g.sumK == null ? 'cerrada' : (q.Q > 0 ? fmt(q.hL, 6) : '0'); }
  function ht(g, q) { return g.sumK == null ? '—' : (q.Q > 0 ? (q.trans ? '≈ ' : '') + fmt(q.h, 6) : '0'); }
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
    ['Carga de velocidad v²/2g (mm)', fmt(a.hv * 1000, 2), fmt(b.hv * 1000, 2)],
    ['ΣK de accesorios', g1.sumK == null ? '—' : fmt(g1.sumK, 2), g2.sumK == null ? '—' : fmt(g2.sumK, 2)],
    ['Pérdida local hL (m c.a.)', hl(g1, q1), hl(g2, q2), 'key'],
    ['Pérdida total hf + hL (m c.a.)', ht(g1, q1), ht(g2, q2), 'key tot']
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
  if (S.scenMsg) notes.unshift(['scen', S.scenMsg]);
  if (S.flowMode === 'reparto' && SPLIT) {
    notes.unshift(['ok', SPLIT.bloqueado ? 'Las dos válvulas están cerradas: no hay flujo.' : 'Reparto predicho para Q₀ = ' + fmt(S.Q0, 2) + ' L/min: Q₁ = ' + fmt(S.Q1, 2) + ' y Q₂ = ' + fmt(S.Q2, 2) + ' L/min. Con este reparto la pérdida total de ambos ramales es la misma: ' + fmt(SPLIT.h * 1000, 2) + ' mm.']);
  } else if (a.hf != null && b.hf != null && a.hf > 0 && b.hf > 0) {
    notes.push(['', 'Los ramales están en paralelo: en la red real sus pérdidas totales se igualan y el caudal se reparte hasta lograrlo. Aquí Q₁ y Q₂ son datos del informe; usa "Predecir reparto" para calcularlo.']);
  }
  notes.push(['', 'Cada piso está 0,2903 m más alto: ρgΔz = ' + fmt(H.hidrostatica(0.2903), 0) + ' Pa. Esa diferencia es altura, no fricción.']);
  document.getElementById('notes').innerHTML = notes.map(function (n) { return '<div class="note ' + n[0] + '">' + n[1] + '</div>'; }).join('');
  document.getElementById('stQ0').textContent = fmt(S.Q1 + S.Q2, 2);
  document.getElementById('stH1').textContent = a.hf != null ? fmt(a.hf, 4) : 'Trans.';
  document.getElementById('stH2').textContent = b.hf != null ? fmt(b.hf, 4) : 'Trans.';
  document.getElementById('stHid').textContent = fmt(H.hidrostatica(0.2903), 0);
  $('pQ0').textContent = $('stQ0').textContent; $('pH1').textContent = $('stH1').textContent; $('pH2').textContent = $('stH2').textContent;
  document.getElementById('lgR1').textContent = c.s1.nombre; document.getElementById('lgR2').textContent = c.s2.nombre;
  var qs = $('qsplit'); if (qs) qs.innerHTML = '<span class="r1">Q₁ = <b>' + fmt(S.Q1, 2) + '</b></span><span class="r2">Q₂ = <b>' + fmt(S.Q2, 2) + '</b></span><small>L/min, calculados</small>';
  renderEng();
}

/* ------------------------------------------------------------ fase 3: ingeniería */
var KNAMES = { codo: 'Codo 90°', teeRecto: 'Tee, paso directo', teeDeriv: 'Tee, derivación', medidor: 'Caudalímetro YF-S201' };
/* accesorios que atraviesa cada ramal entre los nudos (según el modelo 3D) */
function fittings(d, k) {
  if (d === 'A') return k === 'r1' ? { codo: 2, teeRecto: 1, teeDeriv: 1, medidor: 1 } : { codo: 0, teeRecto: 1, teeDeriv: 1, medidor: 1 };
  return k === 'r1' ? { codo: 2, teeRecto: 5, teeDeriv: 0, medidor: 1 } : { codo: 0, teeRecto: 3, teeDeriv: 2, medidor: 1 };
}
function headerSpec() { return H.PVC[S.design === 'A' ? '1/2' : '3/4']; }
function branchDef(k) {
  var d = S.design, sp = H.PVC[S.spec[d][k]], n = fittings(d, k), Kv = H.kValvula(S.open[k]), sum = 0;
  Object.keys(n).forEach(function (f) { sum += n[f] * S.K[f]; });
  return { k: k, sp: sp, D: sp.Di, L: S.L[d][k], n: n, Kv: Kv, sumK: Kv == null ? null : sum + Kv, Dh: headerSpec().Di };
}
/* caudales efectivos: dato del informe o reparto predicho */
var SPLIT = null;
function solveFlows() {
  SPLIT = null;
  if (S.flowMode === 'reparto') {
    SPLIT = H.reparto(S.Q0, branchDef('r1'), branchDef('r2'));
    S.Q1 = SPLIT.Q1; S.Q2 = SPLIT.Q2;
  } else {
    S.Q1 = S.open.r1 > 0 ? S.Qu1 : 0; S.Q2 = S.open.r2 > 0 ? S.Qu2 : 0;
  }
}
function setValveHandles() { buildHyd(); }

/* ---------- tabla de accesorios ---------- */
function renderK() {
  var b1 = branchDef('r1'), b2 = branchDef('r2'), r1 = H.ramal(b1, S.Q1), r2 = H.ramal(b2, S.Q2);
  var rows = Object.keys(KNAMES).map(function (f) {
    return '<tr><td>' + KNAMES[f] + '</td><td><input class="kin" type="number" step="0.05" min="0" data-k="' + f + '" value="' + S.K[f] + '"></td><td>' + b1.n[f] + '</td><td>' + b2.n[f] + '</td></tr>';
  });
  function kv(b) { return b.Kv == null ? 'cerrada' : fmt(b.Kv, b.Kv < 1 ? 2 : 1); }
  rows.push('<tr><td>Válvula de bola <small>(' + S.open.r1 + ' % / ' + S.open.r2 + ' %)</small></td><td class="muted">según apertura</td><td>' + kv(b1) + '</td><td>' + kv(b2) + '</td></tr>');
  rows.push('<tr class="key"><td>ΣK del ramal</td><td></td><td>' + (b1.sumK == null ? '—' : fmt(b1.sumK, 2)) + '</td><td>' + (b2.sumK == null ? '—' : fmt(b2.sumK, 2)) + '</td></tr>');
  if (r1.hT > 1e-7 || r2.hT > 1e-7) rows.push('<tr><td>Reducción y ampliación <small>(cambio de diámetro)</small></td><td class="muted">½(1−β²); (1−β²)²</td><td>' + fmt(r1.hT * 1000, 2) + ' mm</td><td>' + fmt(r2.hT * 1000, 2) + ' mm</td></tr>');
  $('kTable').querySelector('tbody').innerHTML = rows.join('');
  $('kTable').querySelectorAll('.kin').forEach(function (inp) {
    inp.onchange = function () { var v = +this.value; if (isFinite(v) && v >= 0) { S.K[this.dataset.k] = v; renderCalc(); } };
  });
  // barras fricción vs accesorios
  var mx = Math.max(r1.h, r2.h, 1e-9);
  $('kBars').innerHTML = [['Ramal 1', r1, 'r1', b1], ['Ramal 2', r2, 'r2', b2]].map(function (x) {
    var r = x[1];
    if (x[3].sumK == null || r.Q <= 0) return '<div class="bar-row"><span class="bl">' + x[0] + '</span><span class="muted">sin flujo</span></div>';
    var pf = r.hf / r.h * 100;
    return '<div class="bar-row"><span class="bl ' + x[2] + '">' + x[0] + '</span><div class="bar-track"><i class="bf" style="width:' + (r.hf / mx * 100).toFixed(1) + '%"></i><i class="bk" style="width:' + (r.hL / mx * 100).toFixed(1) + '%"></i></div>' +
      '<span class="bv">' + fmt(r.h * 1000, 1) + ' mm</span><small class="bp">fricción ' + fmt(pf, 0) + ' % · accesorios ' + fmt(100 - pf, 0) + ' %</small></div>';
  }).join('') + '<div class="bar-key"><span><i class="bf"></i>Fricción h<sub>f</sub></span><span><i class="bk"></i>Accesorios h<sub>L</sub></span></div>';
  var n = [];
  if (r1.Q > 0 && r1.hL > r1.hf) n.push(['', 'En el ramal 1 los accesorios pierden ' + fmt(r1.hL / Math.max(r1.hf, 1e-12), 1) + ' veces lo que pierde el tubo recto. Con longitudes tan cortas, <b>mandan los accesorios, no la longitud</b>.']);
  n.push(['', 'La válvula de bola casi no pierde abierta (K ≈ 0,05), pero al 50 % su K sube a ≈ 31 y al 25 % pasa de 700: por eso una válvula a medio cerrar desvía el agua al otro ramal.']);
  n.push(['warn', 'El K del YF-S201 (2,2) es una estimación: su ficha no lo trae. Conviene medirlo en la maqueta con los sensores P antes y después del caudalímetro.']);
  $('kNotes').innerHTML = n.map(function (x) { return '<div class="note ' + x[0] + '">' + x[1] + '</div>'; }).join('');
}

/* ---------- línea de energía ---------- */
function energyProfile(via) {
  var d = S.design, Z = G.ZP, t = G.tank, p = G.pump, spH = headerSpec(), b = branchDef(via), Qb = via === 'r1' ? S.Q1 : S.Q2, Q0 = S.Q1 + S.Q2;
  if (Qb <= 0) return null;
  var segs = [], events = [], marks = [], s0 = 0;
  function hvQ(Q, D) { return H.hvOf(Q, D); }
  function poly(pts, D, Q, grad, startName) {
    var start = s0;
    for (var i = 0; i < pts.length - 1; i++) {
      var L = pts[i].distanceTo(pts[i + 1]);
      segs.push({ a: pts[i], b: pts[i + 1], s: s0, L: L, D: D, Q: Q, grad: grad });
      s0 += L;
      if (i < pts.length - 2) events.push({ s: s0, h: S.K.codo * hvQ(Q, D), name: 'codo' });
    }
    return start;
  }
  function sAt(P) { // distancia recorrida hasta el punto P (que está sobre algún tramo)
    for (var i = 0; i < segs.length; i++) { var g = segs[i], ab = g.b.clone().sub(g.a), ap = P.clone().sub(g.a), u = ap.dot(ab) / Math.max(1e-12, ab.lengthSq()); if (u >= -1e-6 && u <= 1 + 1e-6 && ap.clone().sub(ab.clone().multiplyScalar(u)).length() < 1e-4) return g.s + u * g.L; }
    return null;
  }
  function gradOf(Q, D) { var v = H.vel(Q, D), Re = v * D / H.AGUA.nu; return H.fEff(Re, D) / D * v * v / (2 * H.AGUA.g); }
  var gH = gradOf(Q0, spH.Di), rb = H.ramal(b, Qb), hvb = hvQ(Qb, b.D);
  var P0 = V(p.x - 0.045, p.y + 0.05, p.z), down, br, N1, N2, tees1, tees2, taps = [];
  if (d === 'A') {
    var x1 = -0.27, x2 = 0.10, yR2 = 0.28, yR1 = 0.47, xM = 0.16;
    N1 = V(x1, yR2, Z); N2 = V(x2, yR2, Z);
    poly([P0, V(p.x - 0.045, 0.12, p.z), V(p.x - 0.045, 0.12, Z), V(x1, 0.12, Z), N1], spH.Di, Q0, gH);
    br = via === 'r1' ? [N1, V(x1, yR1, Z), V(x2, yR1, Z), N2] : [N1, N2];
    tees1 = via === 'r1' ? 'teeRecto' : 'teeDeriv'; tees2 = via === 'r1' ? 'teeDeriv' : 'teeRecto';
    var yb = via === 'r1' ? yR1 : yR2;
    down = [N2, V(xM, yR2, Z), V(xM, G.topY, Z), V(t.x, G.topY, Z), V(t.x, G.topY, t.z)];
    var geomL = 0; for (var i = 0; i < br.length - 1; i++) geomL += br[i].distanceTo(br[i + 1]);
    var nb = segs.length; poly(br, b.D, Qb, rb.hf / geomL);
    events.push({ s: sAt(N1) + 1e-6, h: S.K[tees1] * hvb + H.hTransicion(Qb, spH.Di, b.D), name: 'tee' });
    events.push({ P: V(-0.215, yb, Z), h: b.Kv * hvb, name: 'Válvula' });
    events.push({ P: V(-0.135, yb, Z), h: S.K.medidor * hvb, name: 'YF-S201' });
    marks.push({ P: V(-0.07, yb, Z), name: 'P₁ ' + (via === 'r1' ? 'R1' : 'R2'), sensor: true }, { P: V(0.058, yb, Z), name: 'P₂ ' + (via === 'r1' ? 'R1' : 'R2'), sensor: true });
    var sN2 = s0;
    events.push({ s: sN2 - 1e-6, h: S.K[tees2] * hvb + H.hTransicion(Qb, b.D, spH.Di), name: 'tee' });
    poly(down, spH.Di, Q0, gH);
    G.taps.forEach(function (y, i) { var P = V(xM, y, Z); events.push({ P: P, h: S.K.teeRecto * hvQ(Q0, spH.Di), name: 'tee' }); marks.push({ P: P, name: 'Piso ' + (i + 1), floor: true }); });
  } else {
    var xR2 = 0.16, xR1 = 0.22, yT = G.topY, C = V(xR2, 0.12, Z), Tp = V(xR2, yT, Z);
    N1 = C; N2 = Tp;
    poly([P0, V(p.x - 0.045, 0.12, p.z), V(p.x - 0.045, 0.12, Z), C], spH.Di, Q0, gH);
    br = via === 'r1' ? [C, V(xR1, 0.12, Z), V(xR1, yT, Z), Tp] : [C, Tp];
    var xb = via === 'r1' ? xR1 : xR2;
    tees1 = via === 'r1' ? 'teeRecto' : 'teeDeriv'; tees2 = tees1;
    var gl = 0; for (var j = 0; j < br.length - 1; j++) gl += br[j].distanceTo(br[j + 1]);
    var sC = s0; poly(br, b.D, Qb, rb.hf / gl);
    events.push({ s: sC + 1e-6, h: S.K[tees1] * hvb + H.hTransicion(Qb, spH.Di, b.D), name: 'tee' });
    events.push({ P: V(xb, 0.19, Z), h: b.Kv * hvb, name: 'Válvula' });
    events.push({ P: V(xb, 0.265, Z), h: S.K.medidor * hvb, name: 'YF-S201' });
    G.taps.forEach(function (y, i) { var P = V(xb, y, Z); events.push({ P: P, h: S.K.teeRecto * hvb, name: 'tee' }); marks.push({ P: P, name: 'P' + ['₁', '₂', '₃'][i] + ' ' + (via === 'r1' ? 'R1' : 'R2') + ' · piso ' + (i + 1), sensor: true, floor: true }); });
    var sT = s0;
    events.push({ s: sT - 1e-6, h: S.K[tees2] * hvb + H.hTransicion(Qb, b.D, spH.Di), name: 'tee' });
    poly([Tp, V(t.x, yT, Z), V(t.x, yT, t.z)], spH.Di, Q0, gH);
  }
  events.forEach(function (e) { if (e.s == null) e.s = sAt(e.P); });
  marks.forEach(function (m) { m.s = sAt(m.P); m.z = m.P.y; });
  marks.unshift({ s: 0, z: P0.y, name: 'Salida de la bomba' });
  marks.push({ s: sAt(N1), z: N1.y, name: d === 'A' ? 'Nudo N₁' : 'Cabezal' }, { s: sAt(N2), z: N2.y, name: d === 'A' ? 'Nudo N₂' : 'Unión superior' }, { s: s0, z: segs[segs.length - 1].b.y, name: 'Descarga libre' });
  // pérdida acumulada en la abscisa s (antes de los eventos en s)
  function lossAt(s, inclusive) {
    var h = 0;
    segs.forEach(function (g) { if (s > g.s) h += g.grad * Math.min(g.L, s - g.s); });
    events.forEach(function (e) { if (e.s < s || (inclusive && Math.abs(e.s - s) < 1e-9)) h += e.h; });
    return h;
  }
  function segAt(s) { for (var i = 0; i < segs.length; i++) if (s <= segs[i].s + segs[i].L + 1e-9) return segs[i]; return segs[segs.length - 1]; }
  function zAt(s) { var g = segAt(s), u = Math.max(0, Math.min(1, (s - g.s) / g.L)); return g.a.y + (g.b.y - g.a.y) * u; }
  var total = lossAt(s0 + 1, true), last = segs[segs.length - 1], Eend = last.b.y + hvQ(last.Q, last.D), E0 = Eend + total;
  // muestreo para la gráfica: vértices y saltos
  var xs = [0]; segs.forEach(function (g) { xs.push(g.s + g.L); }); events.forEach(function (e) { xs.push(e.s - 1e-7, e.s + 1e-7); });
  for (var k = 0; k <= 120; k++) xs.push(s0 * k / 120);
  xs = xs.filter(function (x) { return x >= 0 && x <= s0; }).sort(function (a, c) { return a - c; });
  var pts = xs.map(function (x) { var g = segAt(x), hv = hvQ(g.Q, g.D), E = E0 - lossAt(x, false); return { s: x, z: zAt(x), E: E, HGL: E - hv }; });
  marks.forEach(function (m) { var g = segAt(m.s), hv = hvQ(g.Q, g.D); m.E = E0 - lossAt(m.s, false); m.p = H.AGUA.rho * H.AGUA.g * (m.E - hv - m.z); if (Math.abs(m.p) < 0.5) m.p = 0; });
  var zTank = t.y0 + 0.255;
  return { pts: pts, marks: marks, events: events, L: s0, E0: E0, total: total, Hb: E0 - zTank, zTank: zTank };
}

/* ---------- gráficos SVG ---------- */
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
function svgPlot(o) {
  var W = 320, Hh = o.h || 200, m = { l: 44, r: 10, t: 10, b: 30 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
  function tx(x) { return o.xlog ? m.l + (Math.log10(x) - Math.log10(o.x[0])) / (Math.log10(o.x[1]) - Math.log10(o.x[0])) * iw : m.l + (x - o.x[0]) / (o.x[1] - o.x[0]) * iw; }
  function ty(y) { return o.ylog ? m.t + ih - (Math.log10(y) - Math.log10(o.y[0])) / (Math.log10(o.y[1]) - Math.log10(o.y[0])) * ih : m.t + ih - (y - o.y[0]) / (o.y[1] - o.y[0]) * ih; }
  var g = [], ink = css('--ink-3'), line = css('--line');
  (o.bands || []).forEach(function (b) { g.push('<rect x="' + tx(b[0]).toFixed(1) + '" y="' + m.t + '" width="' + (tx(b[1]) - tx(b[0])).toFixed(1) + '" height="' + ih + '" fill="' + b[2] + '" opacity=".13"/>'); });
  (o.xt || []).forEach(function (v) { var X = tx(v).toFixed(1); g.push('<line x1="' + X + '" x2="' + X + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="' + line + '" stroke-width=".6"/><text x="' + X + '" y="' + (Hh - m.b + 13) + '" fill="' + ink + '" font-size="9" text-anchor="middle">' + (o.xf ? o.xf(v) : v) + '</text>'); });
  (o.yt || []).forEach(function (v) { var Y = ty(v).toFixed(1); g.push('<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y + '" y2="' + Y + '" stroke="' + line + '" stroke-width=".6"/><text x="' + (m.l - 5) + '" y="' + (+Y + 3) + '" fill="' + ink + '" font-size="9" text-anchor="end">' + (o.yf ? o.yf(v) : v) + '</text>'); });
  (o.series || []).forEach(function (s) {
    var d = '', pen = false;
    s.pts.forEach(function (p) { if (p == null || !isFinite(p[1])) { pen = false; return; } d += (pen ? 'L' : 'M') + tx(p[0]).toFixed(1) + ' ' + ty(p[1]).toFixed(1); pen = true; });
    g.push('<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + (s.w || 1.8) + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>');
  });
  (o.dots || []).forEach(function (p) { g.push('<circle cx="' + tx(p[0]).toFixed(1) + '" cy="' + ty(p[1]).toFixed(1) + '" r="' + (p[3] || 3.6) + '" fill="' + p[2] + '" stroke="' + css('--surface') + '" stroke-width="1.5"/>' + (p[4] ? '<text x="' + (tx(p[0]) + 5).toFixed(1) + '" y="' + (ty(p[1]) + (p[4] === 'R2' ? 12 : -5)).toFixed(1) + '" fill="' + css('--ink-2') + '" font-size="8.5">' + p[4] + '</text>' : '')); });
  g.push('<text x="' + (m.l + iw / 2) + '" y="' + (Hh - 3) + '" fill="' + ink + '" font-size="9.5" text-anchor="middle">' + (o.xl || '') + '</text>');
  g.push('<text transform="translate(10 ' + (m.t + ih / 2) + ') rotate(-90)" fill="' + ink + '" font-size="9.5" text-anchor="middle">' + (o.yl || '') + '</text>');
  return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + (o.alt || '') + '">' + g.join('') + '</svg>';
}
function niceTicks(a, b, n) { var st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), e = (b - a) / n / st; st *= e > 5 ? 10 : e > 2 ? 5 : e > 1 ? 2 : 1; var out = []; for (var v = Math.ceil(a / st) * st; v <= b + 1e-12; v += st) out.push(+v.toFixed(10)); return out; }

function renderEnergy() {
  var ep = energyProfile(S.via), el = $('eneChart');
  document.querySelectorAll('#segVia button').forEach(function (b) { b.classList.toggle('on', b.dataset.via === S.via); });
  if (!ep) { el.innerHTML = '<p class="sub">Ese ramal está sin flujo. Elige el otro ramal.</p>'; $('eneTable').querySelector('tbody').innerHTML = ''; $('eneNotes').innerHTML = ''; return ep; }
  var ymax = Math.max.apply(null, ep.pts.map(function (p) { return p.E; })) * 1.06;
  var cv = S.via === 'r1' ? css('--r1') : css('--r2');
  el.innerHTML = svgPlot({
    x: [0, ep.L], y: [0, ymax], xt: niceTicks(0, ep.L, 5), yt: niceTicks(0, ymax, 5), xf: function (v) { return fmt(v, 1); }, yf: function (v) { return fmt(v, 1); },
    xl: 'Distancia a lo largo del circuito (m)', yl: 'Altura (m)', h: 220, alt: 'Línea de energía y piezométrica',
    series: [
      { pts: ep.pts.map(function (p) { return [p.s, p.z]; }), c: css('--rt'), w: 3.2 },
      { pts: ep.pts.map(function (p) { return [p.s, p.HGL]; }), c: cv, w: 2 },
      { pts: ep.pts.map(function (p) { return [p.s, p.E]; }), c: css('--accent'), w: 1.4, dash: '4 3' }
    ],
    dots: ep.marks.filter(function (m) { return m.sensor || m.floor; }).map(function (m) { return [m.s, m.z + m.p / (H.AGUA.rho * H.AGUA.g), cv, 3, ''] })
  });
  $('eneTable').querySelector('tbody').innerHTML = ep.marks.slice().sort(function (a, b) { return a.s - b.s; }).map(function (m) {
    return '<tr' + (m.sensor ? ' class="key"' : '') + '><td>' + m.name + '</td><td>' + fmt(m.z, 3) + '</td><td>' + fmt(m.p / 1000, 2) + '</td><td>' + fmt(m.E, 4) + '</td></tr>';
  }).join('');
  var n = [];
  n.push(['', 'Carga que debe dar la bomba (desde el nivel del depósito): <b>H ≈ ' + fmt(ep.Hb, 3) + ' m</b>, de los cuales solo ' + fmt(ep.total * 1000, 1) + ' mm son pérdidas; el resto es subir el agua. La placa indica H máx = 5 m, así que la bomba sobra para la maqueta.']);
  n.push(['', 'La presión baja ≈ ' + fmt(H.hidrostatica(0.2903) / 1000, 2) + ' kPa por cada piso que sube el tubo: es altura (ρgΔz). La fricción y los accesorios solo mueven unos pocos pascales.']);
  n.push(['', 'Escalones de la línea de energía = accesorios (tees, válvula, YF-S201, codos). Pendiente suave = fricción del tubo recto.']);
  $('eneNotes').innerHTML = n.map(function (x) { return '<div class="note ' + x[0] + '">' + x[1] + '</div>'; }).join('');
  return ep;
}

function renderCharts() {
  var b1 = branchDef('r1'), b2 = branchDef('r2'), Qmax = 10, c1 = css('--r1'), c2 = css('--r2');
  function curves(b, Qs) {
    var hf = [], ht = [];
    for (var q = 0.1; q <= Qmax + 1e-9; q += 0.1) {
      var t = H.tramo(q, b.D, b.L); hf.push([q, t.hf != null ? t.hf * 1000 : NaN]);
      ht.push([q, b.sumK == null ? NaN : H.ramal(b, q).h * 1000]);
    }
    return { hf: hf, ht: ht };
  }
  function band(b, c) { var A = Math.PI * b.D * b.D / 4, f = 60000 * A * H.AGUA.nu / b.D; return [H.RE_LAM * f, Math.min(Qmax, H.RE_TURB * f), c]; }
  var k1 = curves(b1), k2 = curves(b2), ymax = 0;
  k1.ht.concat(k2.ht, k1.hf, k2.hf).forEach(function (p) { if (isFinite(p[1])) ymax = Math.max(ymax, p[1]); });
  ymax = Math.min(ymax, 400) * 1.05 || 1;
  var r1 = H.ramal(b1, S.Q1), r2 = H.ramal(b2, S.Q2), dots = [];
  if (S.Q1 > 0 && b1.sumK != null) dots.push([S.Q1, r1.h * 1000, c1, 3.8, 'R1']);
  if (S.Q2 > 0 && b2.sumK != null) dots.push([S.Q2, r2.h * 1000, c2, 3.8, 'R2']);
  $('chHQ').innerHTML = svgPlot({
    x: [0, Qmax], y: [0, ymax], xt: [0, 2, 4, 6, 8, 10], yt: niceTicks(0, ymax, 5), yf: function (v) { return fmt(v, v < 10 ? 1 : 0); },
    xl: 'Caudal Q (L/min)', yl: 'Pérdida (mm c.a.)', alt: 'Pérdida frente al caudal',
    bands: [band(b1, c1), band(b2, c2)],
    series: [{ pts: k1.hf, c: c1 }, { pts: k2.hf, c: c2 }, { pts: k1.ht, c: c1, dash: '5 3', w: 1.4 }, { pts: k2.ht, c: c2, dash: '5 3', w: 1.4 }],
    dots: dots
  });
  // potencia disipada
  var ep = energyProfile(S.via) || energyProfile(S.via === 'r1' ? 'r2' : 'r1');
  function P(Q, h) { return H.AGUA.rho * H.AGUA.g * Q / 60000 * h * 1000; }
  var items = [['Ramal 1', S.Q1 > 0 && b1.sumK != null ? P(S.Q1, r1.h) : 0, 'r1'], ['Ramal 2', S.Q2 > 0 && b2.sumK != null ? P(S.Q2, r2.h) : 0, 'r2']];
  if (ep) items.push(['Todo el circuito', P(S.Q1 + S.Q2, ep.total), 'al']);
  $('pow').innerHTML = items.map(function (x) { return '<div class="pw ' + x[2] + '"><b>' + fmt(x[1], x[1] < 1 ? 2 : 1) + '</b><span>mW</span><small>' + x[0] + '</small></div>'; }).join('') +
    '<p class="sub">Un foco LED de 9 W gasta unas ' + fmt(9000 / Math.max(1e-9, items[items.length - 1][1]), 0) + ' veces más. Toda esta energía se vuelve calor en el agua.</p>';
  // Moody
  var Re = [], lam = [], col1 = [], col2 = [];
  for (var e = 2.8; e <= 5.05; e += 0.02) { var R = Math.pow(10, e); Re.push(R); lam.push([R, R < 4000 ? 64 / R : NaN]); col1.push([R, R > 2300 ? H.colebrook(R, H.AGUA.eps / b1.D) : NaN]); col2.push([R, R > 2300 ? H.colebrook(R, H.AGUA.eps / b2.D) : NaN]); }
  var md = [];
  if (S.Q1 > 0) md.push([r1.Re, r1.f, c1, 3.8, 'R1']);
  if (S.Q2 > 0) md.push([r2.Re, r2.f, c2, 3.8, 'R2']);
  $('chMoody').innerHTML = svgPlot({
    x: [600, 110000], y: [0.012, 0.11], xlog: true, ylog: true, h: 190,
    xt: [1000, 2300, 4000, 10000, 100000], xf: function (v) { return v >= 10000 ? (v / 1000) + 'k' : v >= 2300 && v < 10000 ? fmt(v / 1000, 1) + 'k' : '10³'; },
    yt: [0.015, 0.02, 0.03, 0.05, 0.08], yf: function (v) { return fmt(v, 3); },
    xl: 'Reynolds Re', yl: 'f de Darcy', alt: 'Diagrama de Moody',
    bands: [[2300, 4000, css('--warn')]],
    series: [{ pts: lam, c: css('--ink-3'), w: 1.4 }, { pts: col1, c: c1, w: 1.4 }, { pts: col2, c: c2, w: 1.2, dash: '4 3' }],
    dots: md
  });
}

function renderIoT() {
  var e1 = energyProfile('r1'), e2 = energyProfile('r2'), cards = [];
  function pc(e, lbl, cls) {
    if (!e) return '<div class="iot-card ' + cls + '"><small>' + lbl + '</small><b>—</b><span>ramal cerrado</span></div>';
    return e.marks.filter(function (m) { return m.sensor; }).map(function (m) { return '<div class="iot-card ' + cls + '"><small>' + m.name + '</small><b>' + fmt(m.p / 1000, 2) + '</b><span>kPa</span></div>'; }).join('');
  }
  cards.push('<h4 class="ch-title">Presión (transductores)</h4><div class="iot-grid">' + pc(e1, 'R1', 'r1') + pc(e2, 'R2', 'r2') + '</div>');
  if (S.design === 'A') {
    var d1 = e1 ? e1.marks.filter(function (m) { return m.sensor; }) : null, d2 = e2 ? e2.marks.filter(function (m) { return m.sensor; }) : null;
    cards.push('<div class="iot-grid">' + [['ΔP R1 (P₁ − P₂)', d1, 'r1'], ['ΔP R2 (P₁ − P₂)', d2, 'r2']].map(function (x) { return '<div class="iot-card ' + x[2] + '"><small>' + x[0] + '</small><b>' + (x[1] ? fmt(x[1][0].p - x[1][1].p, 1) : '—') + '</b><span>Pa</span></div>'; }).join('') + '</div>');
  }
  cards.push('<h4 class="ch-title">Caudal (YF-S201, F = 7,5·Q)</h4><div class="iot-grid">' + [['Q₀ total', S.Q1 + S.Q2, 'al'], ['Q₁ ramal 1', S.Q1, 'r1'], ['Q₂ ramal 2', S.Q2, 'r2']].map(function (x) {
    return '<div class="iot-card ' + x[2] + '"><small>' + x[0] + '</small><b>' + fmt(x[1], 2) + '</b><span>L/min · ' + fmt(7.5 * x[1], 1) + ' Hz</span></div>';
  }).join('') + '</div>');
  cards.push('<div class="note">Los pulsos del YF-S201 se cuentan en ventanas de al menos 1 s: a 4 L/min llegan 30 pulsos por segundo. La ΔP entre P₁ y P₂ es de pocos pascales, por debajo de la resolución de muchos transductores de 0–1,2 MPa.</div>');
  $('iot').innerHTML = cards.join('');
}

function renderEng() { renderK(); renderEnergy(); if (S.ptab === 'gra') renderCharts(); if (S.ptab === 'iot') renderIoT(); }

/* ---------- escenarios del informe ---------- */
function scenario(id) {
  var d = S.design;
  S.L[d] = { r1: DEF_L[d].r1, r2: DEF_L[d].r2 }; S.open = { r1: 100, r2: 100 }; S.flowMode = 'dato'; S.Qu1 = S.Qu2 = 4; S.Q0 = 8;
  if (id === 'A') { S.spec[d] = { r1: '1/2', r2: '1/2' }; S.L[d] = { r1: 1, r2: 2 }; }
  if (id === 'B') { S.open.r1 = 50; }
  if (id === 'C') { S.flowMode = 'reparto'; S.open.r1 = 50; }
  if (id === 'D') { S.flowMode = 'reparto'; S.open.r2 = 0; }
  if (id === '0') S.spec[d] = d === 'A' ? { r1: '1/2', r2: '1/2' } : { r1: '3/4', r2: '1/2' };
  document.querySelectorAll('#scen button').forEach(function (b) { b.classList.toggle('on', b.dataset.sc === id && id !== '0'); });
  var msg = { A: 'Serie A: tramos rectos de 1 y 2 m a caudal controlado. La pérdida por fricción crece en proporción a la longitud.', B: 'Serie B: válvula del ramal 1 al 50 % con el mismo caudal. La pérdida local de la válvula se dispara.', C: 'Serie C: con la bomba dando el mismo Q₀, cerrar a medias el ramal 1 empuja agua al ramal 2.', D: 'Serie D: solo el ramal 1 abierto. Todo Q₀ pasa por él y su pérdida sube.' }[id];
  S.scenMsg = msg || '';
  buildHyd(); syncInputs(); renderCalc();
}

/* ------------------------------------------------------------ interfaz */
function $(id) { return document.getElementById(id); }
function syncInputs() {
  var d = S.design;
  $('selD1').value = S.spec[d].r1; $('selD2').value = S.spec[d].r2;
  $('inL1').value = S.L[d].r1; $('inL2').value = S.L[d].r2;
  $('inQ1').value = S.Qu1; $('inQ2').value = S.Qu2; $('inQ0').value = S.Q0;
  $('selV1').value = S.open.r1; $('selV2').value = S.open.r2;
  document.querySelectorAll('#segFlow button').forEach(function (b) { b.classList.toggle('on', b.dataset.fm === S.flowMode); });
  $('rowQ').hidden = S.flowMode === 'reparto'; $('rowQ0').hidden = S.flowMode !== 'reparto';
  syncChips();
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
$('inQ1').oninput = function () { S.Qu1 = Math.max(0, Math.min(30, +this.value || 0)); clearScen(); renderCalc(); syncChips(); };
$('inQ2').oninput = function () { S.Qu2 = Math.max(0, Math.min(30, +this.value || 0)); clearScen(); renderCalc(); syncChips(); };
$('inQ0').oninput = function () { S.Q0 = Math.max(0, Math.min(30, +this.value || 0)); clearScen(); renderCalc(); syncChips(); };
function syncChips() { document.querySelectorAll('#chipsQ button').forEach(function (b) { var q = +b.dataset.q; b.classList.toggle('on', S.flowMode === 'reparto' ? S.Q0 === 2 * q : (S.Qu1 === q && S.Qu2 === q)); }); }
document.querySelectorAll('#chipsQ button').forEach(function (b) { b.onclick = function () { S.Qu1 = S.Qu2 = +b.dataset.q; S.Q0 = 2 * b.dataset.q; clearScen(); syncInputs(); renderCalc(); }; });
function clearScen() { S.scenMsg = ''; document.querySelectorAll('#scen button').forEach(function (b) { b.classList.remove('on'); }); }
document.querySelectorAll('#segFlow button').forEach(function (b) { b.onclick = function () { S.flowMode = b.dataset.fm; if (S.flowMode === 'reparto') S.Q0 = S.Qu1 + S.Qu2; clearScen(); syncInputs(); renderCalc(); }; });
$('selV1').onchange = function () { S.open.r1 = +this.value; clearScen(); buildHyd(); renderCalc(); };
$('selV2').onchange = function () { S.open.r2 = +this.value; clearScen(); buildHyd(); renderCalc(); };
document.querySelectorAll('#scen button').forEach(function (b) { b.onclick = function () { scenario(b.dataset.sc); }; });
document.querySelectorAll('#ptabs button').forEach(function (b) { b.onclick = function () {
  S.ptab = b.dataset.tab;
  document.querySelectorAll('#ptabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
  document.querySelectorAll('.ptab').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === S.ptab); });
  renderEng();
}; });
document.querySelectorAll('#segVia button').forEach(function (b) { b.onclick = function () { S.via = b.dataset.via; renderEng(); if (S.ptab === 'gra') renderCharts(); }; });
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
if (window.innerWidth < 600) { $('tour').classList.add('hidden'); $('btnTour').classList.remove('on'); labelEls.forEach(function (L) { L.el.classList.remove('hi'); }); }
loop();
window.HID = { S: S, compute: compute, setView: setView, showTour: showTour, buildHyd: buildHyd, renderCalc: renderCalc, camera: camera, controls: controls, scene: scene };
})();
