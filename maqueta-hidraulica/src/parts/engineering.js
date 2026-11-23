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
    G.taps.forEach(function (y, i) { var P = V(xb, y, Z); events.push({ P: P, h: S.K.teeRecto * hvb, name: 'tee' }); marks.push({ P: P, name: 'P' + ['₁', '₂', '₃'][i] + ' · piso ' + (i + 1), sensor: true, floor: true }); });
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
  marks.forEach(function (m) { var g = segAt(m.s), hv = hvQ(g.Q, g.D); m.E = E0 - lossAt(m.s, false); m.p = H.AGUA.rho * H.AGUA.g * (m.E - hv - m.z); });
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
  (o.dots || []).forEach(function (p) { g.push('<circle cx="' + tx(p[0]).toFixed(1) + '" cy="' + ty(p[1]).toFixed(1) + '" r="' + (p[3] || 3.6) + '" fill="' + p[2] + '" stroke="' + css('--surface') + '" stroke-width="1.5"/>' + (p[4] ? '<text x="' + (tx(p[0]) + 5).toFixed(1) + '" y="' + (ty(p[1]) - 5).toFixed(1) + '" fill="' + css('--ink-2') + '" font-size="8.5">' + p[4] + '</text>' : '')); });
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
