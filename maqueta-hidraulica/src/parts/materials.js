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
  g.fillStyle = 'rgba(28,45,80,.78)'; g.font = 'bold 30px Arial';
  g.fillText('PVC-U  AGUA FRÍA  C-10  NTP 399.002  ▸▸', 0, 0); g.restore();
  g.save(); g.translate(w * 0.72, h * 0.54); g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(28,45,80,.78)'; g.font = 'bold 30px Arial';
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
