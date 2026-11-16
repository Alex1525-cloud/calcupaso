/* Diseño en concreto armado con las fuerzas del análisis (E.060): vigas (flexión y corte por capacidad),
   columnas y placas (flexocompresión con diagrama de interacción por fibras, corte) y zapatas aisladas.
   Unidades internas: kg y cm. Las fuerzas llegan en t y m. Es una guía para estudiantes: el detallado final
   (empalmes, anclajes, cortes de barras) lo define el ingeniero. */
(function (root) {
  "use strict";
  const F = root.Fuerzas || require("./fuerzas.js");
  const BARRAS = [["3/8", 0.71, 0.95], ["1/2", 1.29, 1.27], ["5/8", 1.99, 1.59], ["3/4", 2.84, 1.91], ["1", 5.10, 2.54]];
  const bar = (n) => BARRAS.find(b => b[0] === n);
  const r1 = (x, p) => Math.floor(x / p + 1e-9) * p; // redondeo hacia abajo
  const ru = (x, p) => Math.ceil(x / p - 1e-9) * p; // hacia arriba
  const beta1 = (fc) => fc <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 280) / 70);

  // ------------------------------------------------------------ flexión simple (sección rectangular)
  function asFlexion(Mu, b, d, fc, fy) { // Mu en kg·cm
    if (Mu <= 0) return 0;
    const k = 2 * Mu / (0.9 * 0.85 * fc * b), disc = d * d - k;
    if (disc < 0) return Infinity;
    return 0.85 * fc * b / fy * (d - Math.sqrt(disc));
  }
  const Mn = (As, b, d, fc, fy) => { const a = As * fy / (0.85 * fc * b); return As * fy * (d - a / 2); };
  // barras para un área: menor exceso que entre en el ancho (1 o 2 capas)
  function elegirBarras(As, b, minN = 2, opciones = ["1/2", "5/8", "3/4", "1"]) {
    let mejor = null;
    for (const n0 of opciones) {
      const [nom, a, db] = bar(n0), n = Math.max(minN, Math.ceil(As / a - 1e-9));
      const caben = Math.floor((b - 2 * 5.5 + Math.max(2.5, db)) / (db + Math.max(2.5, db)));
      if (caben < 2 || n > 2 * caben) continue;
      const exc = n * a - As, cand = { n, nom, A: n * a, capas: n > caben ? 2 : 1, txt: `${n} Ø ${nom}"` + (n > caben ? " (2 capas)" : "") };
      if (!mejor || cand.capas < mejor.capas || (cand.capas === mejor.capas && exc < mejor.A - As - 1e-9)) mejor = cand;
    }
    return mejor;
  }

  // ------------------------------------------------------------ vigas
  function viga(o, sec, p) {
    const { fc, fy } = p, b = sec.b * 100, h = sec.h * 100, d = h - 6, e = o.e, n = F.NEST - 1;
    const env = (k, i) => F.envolvente(o, k, i);
    const Mneg = [0, n].map(i => Math.max(0, -env("M", i).min) * 1e5);
    const Mposc = Math.max(...Array.from({ length: n + 1 }, (_, i) => env("M", i).max), 0) * 1e5;
    const Mposf = [0, n].map(i => Math.max(0, env("M", i).max) * 1e5);
    const Asmin = 0.7 * Math.sqrt(fc) / fy * b * d;
    const rb = 0.85 * beta1(fc) * fc / fy * 6000 / (6000 + fy), Asmax = 0.75 * rb * b * d;
    const fr = p.porticos ? 0.5 : 1 / 3; // acero positivo en la cara ≥ 1/2 (pórticos) o 1/3 (dual tipo I / muros) del negativo
    const req = (Mu) => Math.max(asFlexion(Mu, b, d, fc, fy), Mu > 0 ? Asmin : 0);
    const supI = Math.max(req(Mneg[0]), Asmin), supD = Math.max(req(Mneg[1]), Asmin);
    const infI = Math.max(req(Mposf[0]), fr * supI, Asmin), infD = Math.max(req(Mposf[1]), fr * supD, Asmin);
    const cuarto = Math.max(supI, supD) / 4;
    const infC = Math.max(req(Mposc), infI, infD, cuarto, Asmin), supC = Math.max(Asmin, cuarto);
    const falla = [supI, supD, infC].some(a => !isFinite(a) || a > Asmax);
    const B = (A) => isFinite(A) ? elegirBarras(A, b) : null;
    const bs = { supI: B(supI), supC: B(supC), supD: B(supD), infI: B(infI), infC: B(infC), infD: B(infD) };
    // corte por capacidad: (Mn izq + Mn der)/ln + cortante isostático de 1,25(CM+CV)
    const ln = (e.ln || e.L) * 100, fyc = p.porticos ? 1.25 * fy : fy;
    const MnS = (x) => x ? Mn(x.A, b, d, fc, fyc) : 0;
    const Mcap = Math.max(MnS(bs.supI) + MnS(bs.infD), MnS(bs.infI) + MnS(bs.supD));
    const Vg = Math.max(Math.abs(1.25 * (o.D.V[0] + o.L.V[0])), Math.abs(1.25 * (o.D.V[n] + o.L.V[n]))) * 1000;
    const Vana = Math.max(...[0, n].map(i => { const v = env("V", i); return Math.max(Math.abs(v.max), Math.abs(v.min)); })) * 1000;
    let Vu = Mcap / ln + Vg;
    if (!p.porticos) { // dual tipo I / muros: también puede tomarse con el sismo amplificado por 2,5
      const V25 = Math.max(...[0, n].map(i => Math.max(...F.COMBOS.map(([, fD, fL, fS, dS]) => Math.abs(fD * o.D.V[i] + fL * o.L.V[i]) + (dS ? 2.5 * fS * o[dS].V[i] : 0))))) * 1000;
      Vu = Math.min(Vu, V25);
    }
    Vu = Math.max(Vu, Vana);
    const est = estribos(Vu, b, d, fc, fy, h, bs);
    return { tipo: "viga", b: sec.b, h: sec.h, L: e.L, Mu: { negI: Mneg[0] / 1e5, pos: Mposc / 1e5, negD: Mneg[1] / 1e5 }, As: { supI, supC, supD, infI, infC, infD }, Asmin, Asmax, barras: bs, Vu: Vu / 1000, est, falla: falla || est.falla,
      nota: falla ? "La sección no alcanza en flexión (excede el acero máximo 0,75ρb): aumenta el peralte o el ancho." : est.falla ? "El corte excede el máximo (Vs > 2,1√f'c·b·d): aumenta la sección." : "" };
  }
  function estribos(Vu, b, d, fc, fy, h, bs) {
    const Vc = 0.53 * Math.sqrt(fc) * b * d, Vs = Math.max(0, Vu / 0.85 - Vc), Av = 2 * 0.71;
    const falla = Vs > 2.1 * Math.sqrt(fc) * b * d;
    const sCalc = Vs > 0 ? Av * fy * d / Vs : Infinity;
    const dbl = Math.min(...Object.values(bs).filter(Boolean).map(x => bar(x.nom)[2]));
    const s0 = r1(Math.min(sCalc, d / 4, 10 * dbl, 24 * 0.95, 30), 2.5), sR = r1(Math.min(sCalc, d / 2), 2.5);
    const nConf = Math.ceil((2 * h - 5) / s0);
    return { Vc: Vc / 1000, Vs: Vs / 1000, s0, sR, nConf, txt: `□ Ø 3/8": 1 @ 5, ${nConf} @ ${s0}, resto @ ${sR} cm (c/extremo)`, falla };
  }

  // ------------------------------------------------------------ flexocompresión por fibras
  function enPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function fibras(poly, n = 32) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const nx = Math.max(4, Math.round(n * Math.sqrt((x1 - x0) / (y1 - y0)))), ny = Math.max(4, Math.round(n * Math.sqrt((y1 - y0) / (x1 - x0))));
    const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dy; if (enPoly(x, y, poly)) out.push([x, y, dx * dy]); }
    return out;
  }
  // barras repartidas en el contorno (con recubrimiento al centro de la barra), esquinas primero
  function barrasContorno(poly, rec, nb, circ) {
    if (circ) { const R = Math.max(...poly.map(p => Math.hypot(p[0], p[1]))) - rec; return Array.from({ length: nb }, (_, i) => [R * Math.cos(2 * Math.PI * i / nb), R * Math.sin(2 * Math.PI * i / nb)]); }
    let A = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; A += x0 * y1 - x1 * y0; }
    const s = A > 0 ? 1 : -1, n = poly.length;
    const nrm = (i) => { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n], L = Math.hypot(x1 - x0, y1 - y0); return [-s * (y1 - y0) / L, s * (x1 - x0) / L]; };
    const off = poly.map((p, i) => { const a = nrm((i - 1 + n) % n), b = nrm(i); return [p[0] + rec * (a[0] + b[0]), p[1] + rec * (a[1] + b[1])]; });
    const pts = off.slice(), lados = off.map((p, i) => ({ p, q: off[(i + 1) % n], L: Math.hypot(off[(i + 1) % n][0] - p[0], off[(i + 1) % n][1] - p[1]) }));
    const per = lados.reduce((a, l) => a + l.L, 0); let resto = Math.max(0, nb - n);
    const asign = lados.map(l => resto * l.L / per), ent = asign.map(Math.floor);
    let falta = resto - ent.reduce((a, b) => a + b, 0);
    asign.map((v, i) => [v - ent[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { ent[i]++; falta--; } });
    lados.forEach((l, i) => { for (let k = 1; k <= ent[i]; k++) { const t = k / (ent[i] + 1); pts.push([l.p[0] + t * (l.q[0] - l.p[0]), l.p[1] + t * (l.q[1] - l.p[1])]); } });
    return pts;
  }
  /* Curva de diseño (φPn, φMn) para flexión según la coordenada `eje` (0: y local, 1: z local), con compresión en el lado `signo`.
     barras: [[y, z, As]] en cm. */
  function curva(fib, barras, eje, signo, fc, fy, Ag, espiral, nominal) {
    const Es = 2e6, ecu = 0.003, b1 = beta1(fc), pc = (q) => signo * q[eje];
    const smax = Math.max(...fib.map(pc)), smin = Math.min(...fib.map(pc)), D = smax - smin;
    const Ast = barras.reduce((a, x) => a + x[2], 0), P0 = 0.85 * fc * (Ag - Ast) + fy * Ast;
    const phiC = espiral ? 0.75 : 0.70, cap = (espiral ? 0.85 : 0.80) * phiC * P0;
    const pts = [];
    const cs = [];
    for (let i = 0; i <= 40; i++) cs.push(D * 0.03 * Math.pow(50, i / 40)); // de 0,03D a 1,5D
    for (const c of cs) {
      let P = 0, M = 0;
      const a = b1 * c;
      for (const f of fib) { const s = pc(f); if (smax - s <= a) { const Fc = 0.85 * fc * f[2]; P += Fc; M += Fc * s; } }
      for (const br of barras) {
        const s = pc(br), e = ecu * (c - (smax - s)) / c;
        let fs = Math.max(-fy, Math.min(fy, Es * e));
        if (smax - s <= a) fs -= 0.85 * fc; // concreto desplazado
        P += fs * br[2]; M += fs * br[2] * s;
      }
      let phi = phiC;
      const lim = 0.1 * fc * Ag;
      if (P < lim / phiC) phi = P <= 0 ? 0.9 : 0.9 - (0.9 - phiC) * phiC * P / lim;
      if (nominal) phi = 1;
      pts.push([phi * P, phi * Math.abs(M)]);
    }
    pts.unshift([-0.9 * fy * Ast, 0]);
    pts.sort((x, y) => x[0] - y[0]);
    return { pts, cap, P0, tension: -0.9 * fy * Ast };
  }
  function phiMn(cv, Pu) {
    const p = cv.pts; if (Pu <= p[0][0]) return 0; if (Pu >= p[p.length - 1][0]) return p[p.length - 1][1];
    for (let i = 1; i < p.length; i++) if (Pu <= p[i][0]) { const t = (Pu - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); }
    return 0;
  }
  // demandas (P, |M2|, |M3|) de cada combinación en los dos extremos, en kg y kg·cm
  function demandas(o) {
    const out = [];
    for (const [nom, fD, fL, fS, dS] of F.COMBOS) for (let i = 0; i < 2; i++) {
      const g = (k) => fD * o.D[k][i] + fL * o.L[k][i], s = (k) => dS ? fS * o[dS][k][i] : 0;
      for (const sg of dS ? [1, -1] : [1]) out.push({ nom, i, P: (g("P") + sg * s("P")) * 1000, M2: (Math.abs(g("M2")) + s("M2")) * 1e5, M3: (Math.abs(g("M3")) + s("M3")) * 1e5 });
    }
    return out;
  }
  function verificar(sec, barras, dem, fc, fy, Ag, espiral) {
    const fib = sec.fib, cv = [0, 1].map(eje => [1, -1].map(sg => curva(fib, barras, eje, sg, fc, fy, Ag, espiral)));
    let peor = { r: 0 };
    for (const d of dem) {
      const cap = cv[0][0].cap;
      let r;
      if (d.P > cap) r = d.P / cap * 1.0001 + 1;
      else if (d.P < cv[0][0].tension) r = 2;
      else {
        const m3 = Math.min(phiMn(cv[0][0], d.P), phiMn(cv[0][1], d.P)), m2 = Math.min(phiMn(cv[1][0], d.P), phiMn(cv[1][1], d.P));
        r = (m3 > 0 ? d.M3 / m3 : (d.M3 > 0 ? 9 : 0)) + (m2 > 0 ? d.M2 / m2 : (d.M2 > 0 ? 9 : 0)); // contorno de carga lineal (conservador)
      }
      if (r > peor.r) peor = { r, d };
    }
    return { peor, cv };
  }
  // contorno de la sección en ejes locales del elemento (cm), y: dirección de b, z: dirección de h
  function seccionLocal(s) {
    let poly, circ = false;
    if (s.poly) {
      const ph = (s.props && s.props.phi || 0) * Math.PI / 180, c = Math.cos(ph), sn = Math.sin(ph);
      poly = s.poly.map(([u, v]) => [100 * (u * c + v * sn), 100 * (-u * sn + v * c)]);
      circ = s.forma === "circ";
    } else { const b = 50 * s.b, h = 50 * s.h; poly = [[-b, -h], [b, -h], [b, h], [-b, h]]; }
    let A = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; A += (x0 * y1 - x1 * y0) / 2; }
    return { poly, circ, Ag: Math.abs(A), fib: fibras(poly) };
  }

  function columna(o, s, p) {
    const { fc, fy } = p, sl = seccionLocal(s), Ag = sl.Ag, dem = demandas(o);
    const nMin = sl.circ ? 6 : sl.poly.length, rec = 6;
    let elegido = null;
    for (let rho = 0.01; rho <= 0.0601 && !elegido; rho += 0.0025) {
      for (const nom of ["3/4", "5/8", "1"]) {
        const [, a, db] = bar(nom);
        let n = Math.max(nMin, Math.ceil(rho * Ag / a)); if (!sl.circ && n % 2) n++;
        const per = sl.poly.reduce((acc, q, i) => acc + Math.hypot(sl.poly[(i + 1) % sl.poly.length][0] - q[0], sl.poly[(i + 1) % sl.poly.length][1] - q[1]), 0) - 8 * rec;
        if (per / n < db + 4) continue; // separación libre mínima
        if (n * a / Ag > 0.06) continue;
        const pos = barrasContorno(sl.poly, rec, n, sl.circ), barras = pos.map(([y, z]) => [y, z, a]);
        const v = verificar(sl, barras, dem, fc, fy, Ag, sl.circ);
        if (v.peor.r <= 1) { elegido = { n, nom, As: n * a, rho: n * a / Ag, barras, v }; break; }
      }
    }
    const Pmax = Math.max(...dem.map(d => d.P)) / 1000;
    let res = { tipo: "columna", Ag, Pu: Pmax, ok: !!elegido };
    if (!elegido) return Object.assign(res, { falla: true, nota: "Ni con 6% de acero alcanza: aumenta la sección de la columna." });
    // corte: capacidad (2·Mn/hn con Mn a la carga axial máxima) o sismo × 2,5, lo menor; nunca menos que el análisis
    const hn = (o.e.L - 0.6) * 100, Pd = Pmax * 1000;
    const Mnc = Math.max(phiMn(elegido.v.cv[0][0], Pd), phiMn(elegido.v.cv[1][0], Pd)) / 0.7;
    const Vcap = 2 * Mnc / hn;
    const Vana = Math.max(...["V2", "V3"].map(k => Math.max(...[0, 1].map(i => { const v = F.envolvente(o, k, i); return Math.max(Math.abs(v.max), Math.abs(v.min)); })))) * 1000;
    const V25 = Math.max(...["V2", "V3"].map(k => Math.max(...[0, 1].map(i => Math.max(...F.COMBOS.map(([, fD, fL, fS, dS]) => Math.abs(fD * o.D[k][i] + fL * o.L[k][i]) + (dS ? 2.5 * fS * o[dS][k][i] : 0))))))) * 1000;
    const Vu = Math.max(Vana, p.porticos ? Vcap : Math.min(Vcap, V25));
    const bmin = Math.min(...[0, 1].map(k => Math.max(...sl.poly.map(q => q[k])) - Math.min(...sl.poly.map(q => q[k])))), bmax = Math.max(...[0, 1].map(k => Math.max(...sl.poly.map(q => q[k])) - Math.min(...sl.poly.map(q => q[k]))));
    const d = bmax - 6, Nu = Math.min(...dem.map(x => x.P));
    const Vc = 0.53 * Math.sqrt(fc) * (1 + Math.max(0, Nu) / (140 * Ag)) * bmin * d;
    const Vs = Math.max(0, Vu / 0.85 - Vc), sCalc = Vs > 0 ? 2 * 0.71 * fy * d / Vs : Infinity;
    const dbl = bar(elegido.nom)[2];
    const so = r1(Math.min(8 * dbl, bmin / 2, 10, sCalc), 2.5), sR = r1(Math.min(sCalc, 16 * dbl, 48 * 0.95, bmin, 30), 2.5);
    const lo = ru(Math.max(hn / 6, bmax, 50), 5);
    return Object.assign(res, { n: elegido.n, nom: elegido.nom, As: elegido.As, rho: elegido.rho, ratio: elegido.v.peor.r, critica: elegido.v.peor.d, Vu: Vu / 1000,
      est: { so, sR, lo, txt: `□ Ø 3/8": 1 @ 5, resto en Lo = ${lo} cm @ ${so}, centro @ ${sR} cm` }, falla: Vs > 2.1 * Math.sqrt(fc) * bmin * d,
      txt: `${elegido.n} Ø ${elegido.nom}" (ρ = ${(100 * elegido.rho).toFixed(2)}%)`, nota: "" });
  }

  // ------------------------------------------------------------ placas
  function placa(o, s, p, hm, R) {
    const { fc, fy } = p, Lw = s.b * 100, t = s.h * 100, sl = seccionLocal(s), Ag = sl.Ag, dem = demandas(o);
    // acero repartido mínimo (0,25% en dos capas) + núcleos en los extremos
    const nCapas = t > 20 ? 2 : 1, sv = Math.min(r1(nCapas * 0.71 / (0.0025 * t), 2.5), 3 * t, 40);
    const repartidas = [];
    for (let y = -Lw / 2 + 0.1 * Lw + sv; y < Lw / 2 - 0.1 * Lw; y += sv) for (let c = 0; c < nCapas; c++) repartidas.push([y, nCapas === 2 ? (c ? 1 : -1) * (t / 2 - 5) : 0, 0.71]);
    const OPC = [[4, "1/2"], [4, "5/8"], [4, "3/4"], [6, "3/4"], [6, "1"], [8, "1"], [10, "1"], [12, "1"]];
    let el = null;
    for (const [n, nom] of OPC) {
      const a = bar(nom)[1], nucleo = [];
      const lz = Math.max(0.1 * Lw, 2 * 15) / 2;
      for (const sg of [-1, 1]) for (let i = 0; i < n; i++) { const fila = Math.floor(i / 2); nucleo.push([sg * (Lw / 2 - 5 - fila * lz * 2 / Math.max(1, n / 2 - 1)), (i % 2 ? 1 : -1) * (t / 2 - 5), a]); }
      const v = verificar(sl, repartidas.concat(nucleo), dem, fc, fy, Ag, false);
      if (v.peor.r <= 1) { el = { n, nom, v }; break; }
    }
    const Mu = Math.max(...dem.map(x => x.M3)), Pu = Math.max(...dem.map(x => x.P));
    let res = { tipo: "placa", Lw: s.b, t: s.h, Mu: Mu / 1e5, Pu: Pu / 1000 };
    // corte: Vu·(Mn/Mu) ≤ R (amplificación por capacidad en flexión)
    const Vu0 = Math.max(...[0, 1].map(i => { const v = F.envolvente(o, "V2", i); return Math.max(Math.abs(v.max), Math.abs(v.min)); })) * 1000;
    const Mnp = el ? phiMn(el.v.cv[0][0], Pu) / 0.7 : Mu;
    const amp = Math.min(R, Math.max(1, Mu > 0 ? Mnp / Mu : 1)), Vu = Vu0 * amp;
    const Acw = Lw * t, rel = hm / s.b, ac = rel <= 1.5 ? 0.8 : rel >= 2 ? 0.53 : 0.8 - (0.27) * (rel - 1.5) / 0.5;
    const Vc = ac * Math.sqrt(fc) * Acw, Vs = Math.max(0, Vu / 0.85 - Vc);
    const falla = Vu / 0.85 > 2.6 * Math.sqrt(fc) * Acw;
    const rh = Math.max(0.0025, Vs / (Acw * fy)), rv = Math.max(0.0025, 0.0025 + 0.5 * (2.5 - rel) * (rh - 0.0025));
    const esp = (rho) => Math.min(r1(nCapas * 0.71 / (rho * t), 2.5), 3 * t, 40);
    // ¿necesita elementos de borde confinados? esfuerzo en el extremo > 0,2 f'c
    const I = t * Lw ** 3 / 12, sig = Math.max(...dem.map(d => d.P / Ag + d.M3 * (Lw / 2) / I));
    Object.assign(res, { ok: !!el && !falla, falla: !el || falla, Vu: Vu / 1000, amp, ac, rh, rv,
      txtH: `Ø 3/8" @ ${esp(rh)} cm${nCapas === 2 ? " en 2 capas" : ""}`, txtV: `Ø 3/8" @ ${esp(rv)} cm${nCapas === 2 ? " en 2 capas" : ""}`,
      txtN: el ? `${el.n} Ø ${el.nom}" en cada extremo` : "—", confinar: sig > 0.2 * fc, sig,
      nota: !el ? "Ni con 12 Ø 1\" en los extremos alcanza la flexocompresión: alarga la placa o aumenta su espesor." : falla ? "El corte excede el máximo (2,6√f'c·Acw): aumenta el espesor o la longitud." : "" });
    return res;
  }

  // ------------------------------------------------------------ muros de albañilería confinada (E.070)
  function muroAlb(o, s, p, hPiso) {
    const L = s.b * 100, t = s.h * 100, h = hPiso * 100, fm = s.fm || 65, vm = s.vm || 8.1;
    const Pm = (o.D.P[0] + o.L.P[0]) * 1000, Pg = (o.D.P[0] + 0.25 * o.L.P[0]) * 1000;
    const sigma = Pm / (L * t), sigAdm = Math.min(0.2 * fm * (1 - (h / (35 * t)) ** 2), 0.15 * fm);
    const Vsev = Math.max(o.SX.V2[0], o.SY.V2[0]) * 1000, Msev = Math.max(o.SX.M3[0], o.SY.M3[0]) * 1e5;
    const Ve = Vsev / 2, Me = Msev / 2; // sismo moderado = la mitad del severo (R = 3)
    const alfa = Me > 0 ? Math.min(1, Math.max(1 / 3, Ve * L / Me)) : 1;
    const Vm = 0.5 * vm * alfa * t * L + 0.23 * Math.max(0, Pg);
    const espesor = t >= h / 20 - 1e-6, axial = sigma <= sigAdm, fisura = Ve <= 0.55 * Vm;
    const notas = [];
    if (!espesor) notas.push(`Espesor menor que h/20 = ${(h / 20).toFixed(1)} cm.`);
    if (!axial) notas.push(`Esfuerzo axial ${sigma.toFixed(1)} kg/cm² > ${sigAdm.toFixed(1)} kg/cm²: usa un ladrillo de mayor f'm o un muro más grueso.`);
    if (!fisura) notas.push("Se fisura con el sismo moderado (Ve > 0,55 Vm): agrega muros en esa dirección o aumenta su longitud.");
    return { tipo: "albañilería", Lw: s.b, t: s.h, sigma, sigAdm, Ve: Ve / 1000, Vm: Vm / 1000, Vsev: Vsev / 1000, alfa, falla: !(espesor && axial && fisura), ok: espesor && axial && fisura,
      txtConf: `Columnas de confinamiento ${s.h.toFixed(2)} × 0.20 m con 4 Ø 3/8" y □ Ø 1/4": 1 @ 5, 4 @ 10, resto @ 25 cm en cada extremo y a no más de 2h; viga solera ${s.h.toFixed(2)} × 0.20 m con 4 Ø 3/8" (mínimos usuales)`,
      nota: notas.join(" ") };
  }

  // ------------------------------------------------------------ cimiento corrido de concreto ciclópeo (muros de albañilería)
  function cimientoCorrido(rc, Lw, t, p) {
    const { qadm, Df } = p, gm = 2.0, sc = 0.2, qa = qadm * 10, qn = qa - gm * Df - sc;
    if (qn <= 0) return { falla: true, nota: "La capacidad portante es muy baja para ese desplante." };
    const Ps = rc.D + rc.L, M = Math.abs(rc.MD[1] + rc.ML[1]);
    const casos = [{ P: Ps, M, q: qn }];
    for (const sx of ["SX", "SY"]) casos.push({ P: Ps + 0.8 * rc[sx], M: M + 0.8 * rc["M" + sx][1], q: 1.3 * qa - gm * Df - sc });
    let B = Math.max(0.40, ru(Ps / Lw / qn, 0.05));
    const qmax = (c) => c.P / (B * Lw) + 6 * c.M / (B * Lw * Lw);
    for (let it = 0; it < 60 && casos.some(c => qmax(c) > c.q); it++) B = +(B + 0.05).toFixed(2);
    const hc = Math.max(0.6, ru(Df - 0.1, 0.05), ru(2 * (B - t) / 2, 0.05)); // vuelo ≤ h/2 para concreto simple
    return { Ly: Lw, Lz: B, hz: hc, Df, Ps, qn, ok: true, falla: false, ciclopeo: true,
      ay: { txt: "Concreto ciclópeo 1:10 + 30% de piedra grande" }, az: { txt: `Sobrecimiento ${t.toFixed(2)} m de ancho, 1:8 + 25% de piedra mediana` },
      nota: casos.some(c => c.P / (B * Lw) - 6 * c.M / (B * Lw * Lw) < 0) ? "Con sismo un extremo tiende a levantarse; como el cimiento corrido es continuo con el de los muros vecinos, revisa que la sobrecimentación y las vigas soleras los unan." : "" };
  }

  // ------------------------------------------------------------ zapatas aisladas
  /* r: reacción {D, L, SX, SY, MD:[M2,M3], ML, MSX, MSY} en t y t·m; dim: [lado en y local, lado en z local] del elemento (m). */
  function zapata(rc, dim, p) {
    const { fc, fy, qadm, Df } = p, gm = 2.0, sc = 0.2; // peso unitario promedio suelo + concreto (t/m³), sobrecarga del piso (t/m²)
    const qa = qadm * 10, qn = qa - gm * Df - sc; // t/m²
    if (qn <= 0) return { falla: true, nota: "La capacidad portante es muy baja para ese desplante." };
    const Ps = rc.D + rc.L, M = (k) => Math.abs(rc.MD[k] + rc.ML[k]);
    const casos = [{ P: Ps, M2: M(0), M3: M(1), q: qn }]; // servicio
    for (const s of ["SX", "SY"]) for (const sg of [1, -1]) casos.push({ P: Ps + sg * 0.8 * rc[s], M2: M(0) + 0.8 * rc["M" + s][0], M3: M(1) + 0.8 * rc["M" + s][1], q: 1.3 * qa - gm * Df - sc });
    const [b, h] = dim;
    let Ly = +Math.max(1.0, ru((b - h) / 2 + Math.sqrt(Ps / qn + ((b - h) / 2) ** 2), 0.05)).toFixed(2), Lz = +Math.max(1.0, ru(Ly - (b - h), 0.05)).toFixed(2);
    const qmax = (c) => c.P / (Ly * Lz) + 6 * c.M3 / (Lz * Ly * Ly) + 6 * c.M2 / (Ly * Lz * Lz);
    const qmin = (c) => c.P / (Ly * Lz) - 6 * c.M3 / (Lz * Ly * Ly) - 6 * c.M2 / (Ly * Lz * Lz);
    for (let it = 0; it < 80 && casos.some(c => qmax(c) > c.q); it++) { Ly = +(Ly + 0.05).toFixed(2); Lz = +(Lz + 0.05).toFixed(2); }
    const levanta = casos.some(c => qmin(c) < 0);
    // última: qu uniforme conservador (máximo de las combinaciones)
    const ult = F.COMBOS.flatMap(([, fD, fL, fS, dS]) => (dS ? [1, -1] : [1]).map(sg => ({ P: fD * rc.D + fL * rc.L + (dS ? sg * fS * rc[dS] : 0), M2: Math.abs(fD * rc.MD[0] + fL * rc.ML[0]) + (dS ? fS * rc["M" + dS][0] : 0), M3: Math.abs(fD * rc.MD[1] + fL * rc.ML[1]) + (dS ? fS * rc["M" + dS][1] : 0) })));
    const qu = Math.max(...ult.map(qmax)), Pu = Math.max(...ult.map(c => c.P));
    const B = Ly * 100, L = Lz * 100, bc = b * 100, hc = h * 100, qk = qu / 10; // kg/cm²
    let hz = 0.5, d, ok = false, bo, vc;
    const ldc = Math.max(0.08 * 1.91 * fy / Math.sqrt(fc), 0.004 * 1.91 * fy); // anclaje en compresión de barras de 3/4"
    hz = Math.max(hz, ru((ldc + 10) / 100, 0.05));
    for (; hz <= 2.0; hz = +(hz + 0.05).toFixed(2)) {
      d = hz * 100 - 10;
      bo = 2 * (bc + d) + 2 * (hc + d);
      const Vp = qk * (B * L - (bc + d) * (hc + d)), bc_ = Math.max(b, h) / Math.min(b, h);
      vc = Math.min(0.53 * (1 + 2 / bc_), 0.27 * (40 * d / bo + 2), 1.06) * Math.sqrt(fc) * bo * d;
      const my = (B - bc) / 2, mz = (L - hc) / 2;
      const V1 = qk * L * Math.max(0, my - d), V2 = qk * B * Math.max(0, mz - d), v1 = 0.53 * Math.sqrt(fc) * d;
      if (Vp <= 0.85 * vc && V1 <= 0.85 * v1 * L && V2 <= 0.85 * v1 * B) { ok = true; break; }
    }
    const my = (B - bc) / 2, mz = (L - hc) / 2;
    const acero = (m, ancho) => {
      const Mu = qk * ancho * m * m / 2, As = Math.max(asFlexion(Mu, ancho, d, fc, fy), 0.0018 * ancho * hz * 100);
      const nom = As / ancho * 100 > 1.99 * 100 / 15 ? "3/4" : "5/8", a = bar(nom)[1];
      return { As, txt: `Ø ${nom}" @ ${Math.min(r1(a * ancho / As, 2.5), 30)} cm` };
    };
    return { Ly, Lz, hz, Df, qn, qu, Pu, Ps, levanta, ok, falla: !ok, ay: acero(my, L), az: acero(mz, B),
      nota: !ok ? "El peralte necesario pasa de 2 m: revisa la capacidad portante o usa otra cimentación." : levanta ? "Con sismo, una parte de la zapata deja de apoyarse (excentricidad > L/6): conviene una viga de cimentación." : "" };
  }

  /* Diseño completo. fz = Fuerzas.calcular(r). p = {fc, fy, qadm, Df, porticos} */
  function disenar(r, fz, p) {
    const B = r.B, sec = B.sec, out = { vigas: [], columnas: [], placas: [], muros: [], zapatas: [] };
    const R = Math.max(r.q.Rx, r.q.Ry), hTot = B.z[B.N];
    const piso = (e) => B.levels[e.k - 1].name;
    const xy = (e) => { const a = B.pts.get(e.a), b = B.pts.get(e.b); return [a, b]; };
    const etq = (p1, p2) => `(${p1.x.toFixed(1)}, ${p1.y.toFixed(1)})` + (p2 ? `–(${p2.x.toFixed(1)}, ${p2.y.toFixed(1)})` : "");
    for (const o of fz.elems) {
      const e = o.e, s = sec[e.sec];
      try {
        if (e.type === "beam") { const [a, b] = xy(e); out.vigas.push(Object.assign(viga(o, s, p), { piso: piso(e), k: e.k, donde: etq(a, b) })); }
        else if (e.wall != null) {
          const [x1, y1] = B.model.nodes[e.ends[0]], [x2, y2] = B.model.nodes[e.ends[1]], donde = etq({ x: x1, y: y1 }, { x: x2, y: y2 });
          if (s.mat === "alb") out.muros.push(Object.assign(muroAlb(o, s, p, B.levels[e.k - 1].h), { piso: piso(e), k: e.k, donde, ang: e.ang || 0 }));
          else out.placas.push(Object.assign(placa(o, s, p, hTot - B.z[e.k - 1], R), { piso: piso(e), k: e.k, donde }));
        }
        else { const [a] = xy(e); out.columnas.push(Object.assign(columna(o, s, p), { piso: piso(e), k: e.k, donde: etq(a), b: s.b, h: s.h, forma: s.forma || "rect" })); }
      } catch (err) { console.error(err); }
    }
    // zapatas (columnas) y cimientos corridos armados (placas)
    for (const [id, rc] of fz.reacc) {
      const e = rc.e, s = sec[e.sec], a = B.pts.get(e.a);
      const dim = s.forma === "circ" ? [s.b, s.b] : [s.b, s.h];
      const z = s.mat === "alb" ? cimientoCorrido(rc, s.b, s.h, p) : zapata(rc, dim, p);
      const centro = e.wall != null ? (() => { const [x1, y1] = B.model.nodes[e.ends[0]], [x2, y2] = B.model.nodes[e.ends[1]]; return [(x1 + x2) / 2, (y1 + y2) / 2]; })() : [a.x, a.y];
      out.zapatas.push(Object.assign(z, { id, placa: e.wall != null, donde: `(${centro[0].toFixed(1)}, ${centro[1].toFixed(1)})`, centro, ang: e.ang || 0, dim, D: rc.D, L: rc.L }));
    }
    // resistencia global de la albañilería: Σ Vm de cada piso ≥ cortante del sismo severo (E.070)
    out.albGlobal = [];
    if (out.muros.length) for (let k = 1; k <= B.N; k++) for (const D of r.dirs.filter(D => (D.d ? r.q.sistemaY : r.q.sistemaX) === "ALBAÑILERÍA")) { // solo en la dirección declarada de albañilería
      const ms = out.muros.filter(m => m.k === k), Vm = ms.reduce((a, m) => a + m.Vm * Math.abs(D.d ? Math.sin(m.ang) : Math.cos(m.ang)), 0);
      const VE = D.shearDin[k - 1] * D.factorEscala;
      out.albGlobal.push({ piso: B.levels[k - 1].name, dir: D.d ? "Y" : "X", Vm, VE, ok: Vm >= VE });
    }
    // traslapes entre zapatas vecinas (comparación de rectángulos girados aproximada con círculos inscritos/ejes)
    const zs = out.zapatas;
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
      const A = zs[i], Bz = zs[j]; if (A.falla || Bz.falla) continue;
      const dx = Math.abs(A.centro[0] - Bz.centro[0]), dy = Math.abs(A.centro[1] - Bz.centro[1]);
      const ext = (z) => { const c = Math.abs(Math.cos(z.ang)), s = Math.abs(Math.sin(z.ang)); return [(z.Ly * c + z.Lz * s) / 2, (z.Ly * s + z.Lz * c) / 2]; };
      const ea = ext(A), eb = ext(Bz);
      if (dx < ea[0] + eb[0] && dy < ea[1] + eb[1]) { A.traslape = (A.traslape || []).concat(Bz.donde); Bz.traslape = (Bz.traslape || []).concat(A.donde); }
    }
    return out;
  }

  const Diseno = { disenar, muroAlb, cimientoCorrido, phiMn, fibras, viga, columna, placa, zapata, curva, seccionLocal, barrasContorno, asFlexion, elegirBarras, BARRAS };
  root.Diseno = Diseno;
  if (typeof module !== "undefined") module.exports = Diseno;
})(typeof window !== "undefined" ? window : globalThis);
