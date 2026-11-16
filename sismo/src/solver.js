/* Motor de cálculo de SismoPaso: pórticos 3D con diafragma rígido, análisis modal y espectral.
   Unidades: tonf, m, s. Funciona en el navegador (window.Solver) y en Node (module.exports). */
(function (root) {
  "use strict";
  const G = 9.80665;

  // ---------------------------------------------------------------- utilidades
  function torsionJ(a, b) { // rectángulo, a >= b
    if (a < b) [a, b] = [b, a];
    return a * b ** 3 * (1 / 3 - 0.21 * (b / a) * (1 - b ** 4 / (12 * a ** 4)));
  }

  function polyProps(pts) { // área, momentos de primer y segundo orden respecto al origen
    let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const c = x0 * y1 - x1 * y0;
      A += c; Sx += (x0 + x1) * c; Sy += (y0 + y1) * c;
      Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c; Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    }
    A /= 2; Sx /= 6; Sy /= 6; Ixx /= 12; Iyy /= 12;
    const s = Math.sign(A) || 1;
    return { A: A * s, Sx: Sx * s, Sy: Sy * s, Ip: (Ixx + Iyy) * s }; // Sx = ∫x dA, Sy = ∫y dA
  }

  // Rigidez local 12x12 de un elemento de pórtico 3D con deformación por corte (Timoshenko)
  function frameLocalK(E, Gm, A, Iy, Iz, J, Asy, Asz, L) {
    const K = Array.from({ length: 12 }, () => new Float64Array(12));
    const set = (i, j, v) => { K[i][j] += v; if (i !== j) K[j][i] += v; };
    const ea = E * A / L, gj = Gm * J / L;
    set(0, 0, ea); set(6, 6, ea); set(0, 6, -ea);
    set(3, 3, gj); set(9, 9, gj); set(3, 9, -gj);
    // flexión en el plano x-y (desplazamiento v, giro θz), usa Iz
    const py = Asy > 0 ? 12 * E * Iz / (Gm * Asy * L * L) : 0;
    let c = E * Iz / ((1 + py) * L ** 3);
    set(1, 1, 12 * c); set(7, 7, 12 * c); set(1, 7, -12 * c);
    set(1, 5, 6 * L * c); set(1, 11, 6 * L * c); set(7, 5, -6 * L * c); set(7, 11, -6 * L * c);
    set(5, 5, (4 + py) * L * L * c); set(11, 11, (4 + py) * L * L * c); set(5, 11, (2 - py) * L * L * c);
    // flexión en el plano x-z (desplazamiento w, giro θy), usa Iy
    const pz = Asz > 0 ? 12 * E * Iy / (Gm * Asz * L * L) : 0;
    c = E * Iy / ((1 + pz) * L ** 3);
    set(2, 2, 12 * c); set(8, 8, 12 * c); set(2, 8, -12 * c);
    set(2, 4, -6 * L * c); set(2, 10, -6 * L * c); set(8, 4, 6 * L * c); set(8, 10, 6 * L * c);
    set(4, 4, (4 + pz) * L * L * c); set(10, 10, (4 + pz) * L * L * c); set(4, 10, (2 - pz) * L * L * c);
    return K;
  }

  // Elemento con zonas rígidas en los extremos: K = Hᵀ K_flexible H (H traslada giros a desplazamientos)
  function withRigidEnds(K, Lf, a, b) {
    if (!a && !b) return K;
    const H = Array.from({ length: 12 }, (_, i) => { const r = new Float64Array(12); r[i] = 1; return r; });
    // nudo i: el extremo flexible está a +a en x local: v = vi + a θz, w = wi - a θy
    H[1][5] = a; H[2][4] = -a;
    // nudo j: el extremo flexible está a -b: v = vj - b θz, w = wj + b θy
    H[7][11] = -b; H[8][10] = b;
    return triple(H, K);
  }

  function triple(T, K) { // Tᵀ K T, matrices 12x12
    const n = 12, KT = Array.from({ length: n }, () => new Float64Array(n)), R = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const v = K[i][k]; if (!v) continue; for (let j = 0; j < n; j++) KT[i][j] += v * T[k][j]; }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) { const v = T[k][i]; if (!v) continue; for (let j = 0; j < n; j++) R[i][j] += v * KT[k][j]; }
    return R;
  }

  // ---------------------------------------------------------------- membranas (placas como lámina y losas flexibles)
  function inv(Ain) { // Gauss-Jordan (matrices pequeñas)
    const n = Ain.length, A = Ain.map(r => Array.from(r)), I = A.map((_, i) => A.map((__, j) => +(i === j)));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [I[c], I[p]] = [I[p], I[c]];
      const d = A[c][c]; for (let j = 0; j < n; j++) { A[c][j] /= d; I[c][j] /= d; }
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < n; j++) { A[r][j] -= f * A[c][j]; I[r][j] -= f * I[c][j]; } }
    }
    return I;
  }
  /* Cuadrilátero de 4 nudos en tensión plana con modos incompatibles (Wilson-Taylor, QM6): representa bien la flexión
     en el plano aun con un solo elemento por piso. xy: 4 nudos en sentido antihorario. Devuelve 8x8 [u1, v1, u2, v2, …]. */
  function q6K(xy, E, nu, t) {
    const f = E * t / (1 - nu * nu), D = [[f, f * nu, 0], [f * nu, f, 0], [0, 0, f * (1 - nu) / 2]];
    const xi = [-1, 1, 1, -1], et = [-1, -1, 1, 1], g = 1 / Math.sqrt(3);
    const jac = (a, b) => {
      const dNa = xi.map((x, i) => x * (1 + b * et[i]) / 4), dNb = et.map((e, i) => e * (1 + a * xi[i]) / 4);
      const J = [[0, 0], [0, 0]];
      for (let i = 0; i < 4; i++) { J[0][0] += dNa[i] * xy[i][0]; J[0][1] += dNa[i] * xy[i][1]; J[1][0] += dNb[i] * xy[i][0]; J[1][1] += dNb[i] * xy[i][1]; }
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0], Ji = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
      return { dNa, dNb, det, Ji };
    };
    const j0 = jac(0, 0);
    const Kcc = Array.from({ length: 8 }, () => new Float64Array(8)), Kci = Array.from({ length: 8 }, () => new Float64Array(4)), Kii = Array.from({ length: 4 }, () => new Float64Array(4));
    for (const a of [-g, g]) for (const b of [-g, g]) {
      const { dNa, dNb, det, Ji } = jac(a, b);
      const Bc = [new Float64Array(8), new Float64Array(8), new Float64Array(8)];
      for (let i = 0; i < 4; i++) {
        const dx = Ji[0][0] * dNa[i] + Ji[0][1] * dNb[i], dy = Ji[1][0] * dNa[i] + Ji[1][1] * dNb[i];
        Bc[0][2 * i] = dx; Bc[1][2 * i + 1] = dy; Bc[2][2 * i] = dy; Bc[2][2 * i + 1] = dx;
      }
      // modos incompatibles (1 − ξ²) y (1 − η²) con el jacobiano del centro (corrección de Taylor)
      const r = j0.det / det, dP = [[-2 * a, 0], [0, -2 * b]];
      const Bi = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
      for (let m = 0; m < 2; m++) {
        const dx = (j0.Ji[0][0] * dP[m][0] + j0.Ji[0][1] * dP[m][1]) * r, dy = (j0.Ji[1][0] * dP[m][0] + j0.Ji[1][1] * dP[m][1]) * r;
        Bi[0][2 * m] = dx; Bi[1][2 * m + 1] = dy; Bi[2][2 * m] = dy; Bi[2][2 * m + 1] = dx;
      }
      const add = (K, B1, B2, n1, n2) => { for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) { let v = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) v += B1[p][i] * D[p][q] * B2[q][j]; K[i][j] += v * det; } };
      add(Kcc, Bc, Bc, 8, 8); add(Kci, Bc, Bi, 8, 4); add(Kii, Bi, Bi, 4, 4);
    }
    const Ki = inv(Kii), K = Array.from({ length: 8 }, () => new Float64Array(8));
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      let v = 0; for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) v += Kci[i][p] * Ki[p][q] * Kci[j][q];
      K[i][j] = Kcc[i][j] - v;
    }
    return K;
  }
  // Triángulo de deformación constante (CST), 6x6 [u1, v1, u2, v2, u3, v3]
  function cstK(xy, E, nu, t) {
    const [[x1, y1], [x2, y2], [x3, y3]] = xy, A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1), A = Math.abs(A2) / 2;
    const b = [y2 - y3, y3 - y1, y1 - y2].map(v => v / A2), c = [x3 - x2, x1 - x3, x2 - x1].map(v => v / A2);
    const f = E * t / (1 - nu * nu), D = [[f, f * nu, 0], [f * nu, f, 0], [0, 0, f * (1 - nu) / 2]];
    const B = [new Float64Array(6), new Float64Array(6), new Float64Array(6)];
    for (let i = 0; i < 3; i++) { B[0][2 * i] = b[i]; B[1][2 * i + 1] = c[i]; B[2][2 * i] = c[i]; B[2][2 * i + 1] = b[i]; }
    const K = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) v += B[p][i] * D[p][q] * B[q][j]; K[i][j] = v * A; }
    return K;
  }

  // ---------------------------------------------------------------- matriz en banda (Cholesky)
  class Band {
    constructor(n, bw) { this.n = n; this.bw = bw; this.a = new Float64Array(n * (bw + 1)); }
    add(i, j, v) { if (j > i) [i, j] = [j, i]; const d = i - j; if (d > this.bw) throw new Error("ancho de banda"); this.a[i * (this.bw + 1) + d] += v; }
    factor() {
      const { n, bw, a } = this, w = bw + 1;
      for (let i = 0; i < n; i++) {
        for (let j = Math.max(0, i - bw); j <= i; j++) {
          let s = a[i * w + (i - j)];
          const k0 = Math.max(0, i - bw, j - bw);
          for (let k = k0; k < j; k++) s -= a[i * w + (i - k)] * a[j * w + (j - k)];
          if (i === j) {
            if (!(s > 1e-12)) throw new Error("La estructura es inestable (revisa apoyos y conexiones).");
            a[i * w] = Math.sqrt(s);
          } else a[i * w + (i - j)] = s / a[j * w];
        }
      }
    }
    solve(b) { // in situ
      const { n, bw, a } = this, w = bw + 1;
      for (let i = 0; i < n; i++) { let s = b[i]; for (let k = Math.max(0, i - bw); k < i; k++) s -= a[i * w + (i - k)] * b[k]; b[i] = s / a[i * w]; }
      for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) s -= a[k * w + (k - i)] * b[k]; b[i] = s / a[i * w]; }
      return b;
    }
  }

  // ---------------------------------------------------------------- autovalores (Jacobi)
  function jacobiEigen(A) {
    const n = A.length, a = A.map(r => Float64Array.from(r));
    const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0, diag = 0;
      for (let i = 0; i < n; i++) { diag += a[i][i] ** 2; for (let j = i + 1; j < n; j++) off += a[i][j] ** 2; }
      if (off <= 1e-26 * diag) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const vals = a.map((r, i) => r[i]);
    const idx = vals.map((_, i) => i).sort((i, j) => vals[i] - vals[j]);
    return { values: idx.map(i => vals[i]), vectors: idx.map(i => V.map(r => r[i])) };
  }

  // ---------------------------------------------------------------- modelo
  /* model = {
       stories: [{name, h}], E (t/m²), nu, gamma (t/m³),
       nodes: {id: [x, y]}, sections: {nombre: {type: "col"|"beam", b, h}},
       columns: [{node, sec, p1, p2}], beams: [{i, j, sec, p1, p2}], slabs: [{nodes: [...], p1, p2}],
       loads: {cm, cmRoof, cv, cvRoof}  (t/m²), massFactors: {cm, cv, cvRoof},
       rigidZone: 0..1 (factor de zona rígida en los extremos) } */
  function buildModel(model) {
    model = Object.assign({}, model, { nodes: Object.assign({}, model.nodes), sections: Object.assign({}, model.sections) });
    const N = model.stories.length;
    const z = [0];
    model.stories.forEach(s => z.push(z[z.length - 1] + s.h));
    const E = model.E, Gm = E / (2 * (1 + model.nu)), gamma = model.gamma;
    const sec = model.sections;
    const rz = model.rigidZone || 0;

    // nudos 3D: (nodo de planta, nivel)
    const pts = new Map(); // "id@k" -> {id, k, x, y}
    const key = (id, k) => id + "@" + k;
    const addPt = (id, k) => { const kk = key(id, k); if (!pts.has(kk)) { const [x, y] = model.nodes[id]; pts.set(kk, { id, k, x, y }); } return kk; };
    const elems = [];
    const colAt = {}; // "id@k" -> sección de la columna que llega o sale (para zonas rígidas y peso de vigas)
    for (const c of model.columns) for (let k = c.p1; k <= c.p2; k++) {
      elems.push({ type: "col", a: addPt(c.node, k - 1), b: addPt(c.node, k), sec: c.sec, k, ang: (c.ang || 0) * Math.PI / 180 });
      colAt[key(c.node, k)] = c.sec; colAt[key(c.node, k - 1)] = colAt[key(c.node, k - 1)] || c.sec;
    }
    // placas: columna ancha en el eje del muro + brazos rígidos hacia sus extremos en cada nivel
    const nodesXY = Object.assign({}, model.nodes);
    model.nodes = nodesXY;
    (model.walls || []).forEach((w, wi) => {
      const [x1, y1] = nodesXY[w.i], [x2, y2] = nodesXY[w.j];
      const mid = "~M" + (wi + 1);
      nodesXY[mid] = [(x1 + x2) / 2, (y1 + y2) / 2];
      const Lw = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1), t = sec[w.sec].b;
      const wsec = "~W" + (wi + 1), lsec = "~R" + (wi + 1);
      const ws = sec[w.sec];
      sec[wsec] = { type: "col", b: Lw, h: t, wall: true, mat: ws.mat, fm: ws.fm, vm: ws.vm, E: ws.E, G: ws.G, gamma: ws.gamma };
      // placa como lámina: membranas Q6 entre los nudos del muro en cada piso (la columna del centro queda solo
      // para la flexión fuera del plano). Con resortes en la base (ISE) se usa la columna ancha.
      const lam = model.wallModel === "lamina" && !model.springs;
      let ids = null;
      if (lam) {
        const nd = Math.max(2, Math.min(12, Math.ceil(Lw / 0.75)));
        ids = [w.i];
        for (let j = 1; j < nd; j++) { const id = "~W" + (wi + 1) + "_" + j; nodesXY[id] = [x1 + (x2 - x1) * j / nd, y1 + (y2 - y1) * j / nd]; ids.push(id); }
        ids.push(w.j);
      }
      for (let k = w.p1; k <= w.p2; k++) {
        const ew = { type: "col", a: addPt(mid, k - 1), b: addPt(mid, k), sec: wsec, k, ang, wall: wi, ends: [w.i, w.j] };
        if (lam) {
          ew.lam = true; ew.quads = [];
          const E_ = ws.E || model.E, z0 = 0, hk0 = model.stories[k - 1].h;
          for (let j = 0; j < ids.length - 1; j++) {
            const s0 = Lw * j / (ids.length - 1), s1 = Lw * (j + 1) / (ids.length - 1);
            const keys = [addPt(ids[j], k - 1), addPt(ids[j + 1], k - 1), addPt(ids[j + 1], k), addPt(ids[j], k)];
            ew.quads.push({ keys, smid: Lw / 2, s: [s0, s1, s1, s0], K: q6K([[s0, z0], [s1, z0], [s1, hk0], [s0, hk0]], E_, model.nu, t), c: Math.cos(ang), sn: Math.sin(ang) });
          }
        }
        elems.push(ew);
        const hk = model.stories[k - 1].h;
        sec[lsec + "@" + k] = { type: "beam", b: t, h: hk, rigid: true };
        elems.push({ type: "link", a: addPt(mid, k), b: addPt(w.i, k), sec: lsec + "@" + k, k });
        elems.push({ type: "link", a: addPt(mid, k), b: addPt(w.j, k), sec: lsec + "@" + k, k });
      }
    });
    const beamDepthAt = {};
    for (const v of model.beams) for (let k = v.p1; k <= v.p2; k++) {
      elems.push({ type: "beam", a: addPt(v.i, k), b: addPt(v.j, k), sec: v.sec, k });
      for (const n of [v.i, v.j]) beamDepthAt[key(n, k)] = Math.max(beamDepthAt[key(n, k)] || 0, sec[v.sec].h);
    }

    // ---- masas por nivel (masa, momentos de primer y segundo orden respecto al origen)
    const lv = Array.from({ length: N + 1 }, () => ({ m: 0, Sx: 0, Sy: 0, Ip: 0, W: 0 }));
    const flex = model.diafragma === "flexible";
    const masaNudo = new Map(); // diafragma flexible: masa en cada punto (k|x|y)
    const ck = (k, x, y) => k + "|" + Math.round(x * 1e4) + "|" + Math.round(y * 1e4);
    const addMass = (k, m, x, y) => { const L = lv[k]; L.m += m; L.Sx += m * x; L.Sy += m * y; L.Ip += m * (x * x + y * y); if (flex && k > 0) { const kk = ck(k, x, y); const o = masaNudo.get(kk) || { k, x, y, m: 0 }; o.m += m; masaNudo.set(kk, o); } };
    const pp = { total: 0 };
    for (const e of elems) {
      const s = sec[e.sec], A = s.props ? s.props.A : s.b * s.h;
      const pa = pts.get(e.a), pb = pts.get(e.b);
      if (e.type === "link") continue;
      if (e.type === "col") {
        const W = A * (s.gamma || gamma) * model.stories[e.k - 1].h;
        pp.total += W;
        if (e.ends) { // placa: como ETABS, la masa va a las cuatro esquinas del muro
          for (const n of e.ends) { const [x, y] = model.nodes[n]; addMass(e.k - 1, W / 4 / G, x, y); addMass(e.k, W / 4 / G, x, y); }
        } else { addMass(e.k - 1, W / 2 / G, pa.x, pa.y); addMass(e.k, W / 2 / G, pb.x, pb.y); }
      } else {
        const L = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const ux = (pb.x - pa.x) / L, uy = (pb.y - pa.y) / L;
        const half = (kk) => { const cs = colAt[kk]; if (!cs) return 0; const c = sec[cs]; return 0.5 * (Math.abs(ux) * c.b + Math.abs(uy) * c.h); };
        const Lc = Math.max(L - half(e.a) - half(e.b), 0);
        const W = A * gamma * Lc;
        pp.total += W;
        addMass(e.k, W / 2 / G, pa.x, pa.y); addMass(e.k, W / 2 / G, pb.x, pb.y);
      }
    }
    // losas: carga uniforme (CM, CV) repartida sobre el polígono
    const ld = model.loads, mf = model.massFactors;
    const slabKey = (s) => s.nodes.slice().sort().join("|");
    const cover = new Set();
    for (const s of model.slabs) for (let k = s.p1; k <= s.p2; k++) cover.add(slabKey(s) + "#" + k);
    const cargas = { CM: 0, CV: 0, CVT: 0 };
    for (const s of model.slabs) {
      const poly = s.nodes.map(n => model.nodes[n]);
      const P = polyProps(poly);
      for (let k = s.p1; k <= s.p2; k++) {
        const roof = !cover.has(slabKey(s) + "#" + (k + 1));
        const cm = (roof ? ld.cmRoof : ld.cm) + (s.cm || 0), cv = s.cvAbs != null ? s.cvAbs : (roof ? ld.cvRoof : ld.cv) + (s.cv || 0);
        cargas.CM += cm * P.A; cargas[roof ? "CVT" : "CV"] += cv * P.A;
        const w = cm * mf.cm + cv * (roof ? mf.cvRoof : mf.cv); // t/m² que entra al peso sísmico
        const m = w / G;
        if (model.slabMass === "distribuida" && !flex) { const L = lv[k]; L.m += m * P.A; L.Sx += m * P.Sx; L.Sy += m * P.Sy; L.Ip += m * P.Ip; }
        else { // como ETABS: la masa de cada paño se concentra en sus vértices (partes iguales)
          for (const [x, y] of poly) addMass(k, m * P.A / poly.length, x, y);
        }
      }
    }
    // diafragma flexible: cada paño es una membrana (Q6 si tiene 4 lados, triángulos si no) con el espesor que
    // trabaja en el plano: maciza h, aligerada/nervada la losa superior de 5 cm, colaborante el concreto sobre la placa
    const membranas = [], muroNudos = Object.keys(model.nodes).filter(id => id[0] === "~" && id[1] === "W" && id.includes("_"));
    if (flex) for (const sl of model.slabs) {
      const tipo = sl.tipo || "aligerada1", h = sl.h || 0.2;
      const te = tipo === "maciza" ? h : tipo === "colaborante" ? Math.max(0.05, h - 0.06) : tipo === "escalera" ? 0 : 0.05;
      if (!(te > 0)) continue;
      for (let k = sl.p1; k <= sl.p2; k++) {
        // borde del paño con los nudos intermedios de las placas-lámina que caen sobre él (así la losa los arrastra)
        const ids = [];
        sl.nodes.forEach((n, i) => {
          ids.push(n);
          const [ax, ay] = model.nodes[n], [bx, by] = model.nodes[sl.nodes[(i + 1) % sl.nodes.length]], L2 = (bx - ax) ** 2 + (by - ay) ** 2;
          const en = [];
          for (const id of muroNudos) {
            if (!pts.has(key(id, k))) continue;
            const [x, y] = model.nodes[id], t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2;
            if (t > 1e-6 && t < 1 - 1e-6 && Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / Math.sqrt(L2) < 1e-4) en.push([t, id]);
          }
          en.sort((a, b) => a[0] - b[0]).forEach(([, id]) => ids.push(id));
        });
        const keys = ids.map(n => addPt(n, k)), xy = ids.map(n => model.nodes[n]);
        let A2 = 0; for (let i = 0; i < xy.length; i++) { const [x0, y0] = xy[i], [x1, y1] = xy[(i + 1) % xy.length]; A2 += x0 * y1 - x1 * y0; }
        const ord = A2 < 0 ? [...keys.keys()].reverse() : [...keys.keys()];
        if (ord.length === 4) membranas.push({ keys: ord.map(i => keys[i]), K: q6K(ord.map(i => xy[i]), model.E, model.nu, te) });
        else if (ids.length === sl.nodes.length) for (let i = 1; i < ord.length - 1; i++) { const tri = [ord[0], ord[i], ord[i + 1]]; membranas.push({ keys: tri.map(j => keys[j]), K: cstK(tri.map(j => xy[j]), model.E, model.nu, te) }); }
        else { // abanico desde el centroide (nudo propio del paño, sin masa)
          const P = polyProps(xy), cid = "~S" + (membranas.length + 1);
          model.nodes[cid] = [P.Sx / P.A, P.Sy / P.A]; const ckey = addPt(cid, k);
          for (let i = 0; i < ord.length; i++) { const a = ord[i], b = ord[(i + 1) % ord.length]; membranas.push({ keys: [keys[a], keys[b], ckey], K: cstK([xy[a], xy[b], model.nodes[cid]], model.E, model.nu, te) }); }
        }
      }
    }
    const levels = [];
    for (let k = 1; k <= N; k++) {
      const L = lv[k];
      const xc = L.Sx / L.m, yc = L.Sy / L.m;
      levels.push({ k, name: model.stories[k - 1].name, z: z[k], h: model.stories[k - 1].h, m: L.m, W: L.m * G,
        xc, yc, J: L.Ip - L.m * (xc * xc + yc * yc) });
    }

    // ---- grados de libertad: por nudo (uz, rx, ry) libres; (ux, uy, rz) esclavos del diafragma del nivel
    // con interacción suelo-estructura (model.springs), los nudos de la base tienen sus 6 gdl con resortes
    const resortes = model.springs || null;
    const order = [...pts.values()].filter(p => p.k > 0 || (resortes && resortes[p.id])).sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
    // maestros: rígido = (ux, uy, rz) del centro de masa de cada nivel; flexible = (ux, uy) de cada nudo con masa
    const maestros = []; // {k, d, x, y, key}
    if (flex) {
      const porCoord = new Map(); for (const p of pts.values()) if (p.k > 0) porCoord.set(ck(p.k, p.x, p.y), p);
      for (const o of masaNudo.values()) { // masa en un punto sin nudo: al nudo más cercano del nivel
        let p = porCoord.get(ck(o.k, o.x, o.y));
        if (!p) { let bd = Infinity; for (const q of pts.values()) if (q.k === o.k) { const d = Math.hypot(q.x - o.x, q.y - o.y); if (d < bd) { bd = d; p = q; } } }
        if (p) p.masa = (p.masa || 0) + o.m;
      }
      for (const p of [...pts.values()].filter(p => p.k > 0 && p.masa > 1e-9).sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y)) {
        p.mi = maestros.length; maestros.push({ k: p.k, d: 0, x: p.x, y: p.y, key: p.id + "@" + p.k, m: p.masa }, { k: p.k, d: 1, x: p.x, y: p.y, key: p.id + "@" + p.k, m: p.masa });
      }
    } else for (let k = 1; k <= N; k++) for (let d = 0; d < 3; d++) maestros.push({ k, d, x: levels[k - 1].xc, y: levels[k - 1].yc });
    let neq = 0;
    order.forEach(p => { p.eq = neq; neq += p.k === 0 ? 6 : !flex ? 3 : p.mi != null ? 4 : 6; });
    const ns = neq, nm = maestros.length;
    const masterEq = (k) => 3 * (k - 1); // índice en el bloque de maestros (diafragma rígido)

    // A: cada gdl del nudo como combinación de gdl globales. Devuelve [[{g, c}...] x6]; g<ns: esclavo, g>=ns: maestro
    function dofMap(p) {
      if (p.k === 0) return p.eq != null ? [0, 1, 2, 3, 4, 5].map(i => [{ g: p.eq + i, c: 1 }]) : [[], [], [], [], [], []];
      if (flex) {
        if (p.mi == null) return [0, 1, 2, 3, 4, 5].map(i => [{ g: p.eq + i, c: 1 }]);
        return [[{ g: ns + p.mi, c: 1 }], [{ g: ns + p.mi + 1, c: 1 }], [{ g: p.eq, c: 1 }], [{ g: p.eq + 1, c: 1 }], [{ g: p.eq + 2, c: 1 }], [{ g: p.eq + 3, c: 1 }]];
      }
      const L = levels[p.k - 1], m0 = ns + masterEq(p.k);
      const dx = p.x - L.xc, dy = p.y - L.yc;
      return [
        [{ g: m0, c: 1 }, { g: m0 + 2, c: -dy }],
        [{ g: m0 + 1, c: 1 }, { g: m0 + 2, c: dx }],
        [{ g: p.eq, c: 1 }], [{ g: p.eq + 1, c: 1 }], [{ g: p.eq + 2, c: 1 }],
        [{ g: m0 + 2, c: 1 }],
      ];
    }

    // ancho de banda
    let bw = 0;
    for (const e of elems) {
      const a = pts.get(e.a), b = pts.get(e.b);
      if (a.eq != null && b.eq != null) bw = Math.max(bw, Math.abs(a.eq - b.eq) + 5);
      if (e.quads) for (const q of e.quads) { const eqs = q.keys.map(kk => pts.get(kk).eq).filter(x => x != null); if (eqs.length) bw = Math.max(bw, Math.max(...eqs) - Math.min(...eqs) + 5); }
    }
    for (const mb of membranas) { const eqs = mb.keys.map(kk => pts.get(kk).eq); bw = Math.max(bw, Math.max(...eqs) - Math.min(...eqs) + 6); }
    bw = Math.max(bw, 6);
    const Kss = new Band(ns, bw);
    const Ksm = Array.from({ length: ns }, () => new Float64Array(nm));
    const Kmm = Array.from({ length: nm }, () => new Float64Array(nm));
    const addK = (gi, gj, v) => {
      if (gi < ns && gj < ns) { if (gi >= gj) Kss.add(gi, gj, v); }
      else if (gi < ns) Ksm[gi][gj - ns] += v;
      else if (gj >= ns) Kmm[gi - ns][gj - ns] += v;
    };

    for (const e of elems) {
      const s = sec[e.sec], pa = pts.get(e.a), pb = pts.get(e.b);
      const za = z[pa.k], zb = z[pb.k];
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = zb - za;
      const L = Math.hypot(dx, dy, dz);
      const ex = [dx / L, dy / L, dz / L];
      let ey, ez;
      if (e.type === "col") { const c = Math.cos(e.ang || 0), sn = Math.sin(e.ang || 0); ey = [c, sn, 0]; ez = [-sn, c, 0]; } // y local: dimensión b (X si ángulo 0), z local: dimensión h
      else { ez = [0, 0, 1]; ey = [ez[1] * ex[2] - ez[2] * ex[1], ez[2] * ex[0] - ez[0] * ex[2], ez[0] * ex[1] - ez[1] * ex[0]]; }
      let A = s.b * s.h, Iy, Iz, J = torsionJ(s.b, s.h);
      if (e.type === "col") { Iz = s.h * s.b ** 3 / 12; Iy = s.b * s.h ** 3 / 12; } // flexión según X usa Iz
      else { Iy = s.b * s.h ** 3 / 12; Iz = s.h * s.b ** 3 / 12; }
      let As = (s.wall ? 1 : 5 / 6) * A; // placa: ETABS (lámina) usa el área completa a corte
      if (s.props && e.type === "col") ({ A, Iy, Iz, J, As } = s.props); // columnas circulares, en L o en T
      let Asy = As, Asz = As;
      if (e.lam) { A *= 1e-6; Iz *= 1e-6; Asy = As * 1e-6; Asz = 5 / 6 * s.b * s.h; } // la membrana toma lo que está en el plano
      const Ee = s.rigid ? E * 100 : (s.E || E), Ge = s.rigid ? Gm * 100 : (s.G || Gm);
      // zonas rígidas
      let a0 = 0, b0 = 0;
      if (rz > 0 && e.type !== "link") {
        if (e.type === "col") { a0 = rz * (pa.k > 0 ? (beamDepthAt[e.a] || 0) : 0); b0 = rz * (beamDepthAt[e.b] || 0); }
        else {
          const ux = Math.abs(ex[0]), uy = Math.abs(ex[1]);
          const half = (kk) => { const cs = colAt[kk]; if (!cs) return 0; const c = sec[cs]; return 0.5 * (ux * c.b + uy * c.h); };
          a0 = rz * half(e.a); b0 = rz * half(e.b);
        }
      }
      let Kl = frameLocalK(Ee, Ge, A, Iy, Iz, J, Asy, Asz, L - a0 - b0);
      Kl = withRigidEnds(Kl, L - a0 - b0, a0, b0);
      // transformación local -> global
      const T = Array.from({ length: 12 }, () => new Float64Array(12));
      const R = [ex, ey, ez];
      for (let blk = 0; blk < 4; blk++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[3 * blk + i][3 * blk + j] = R[i][j];
      const Kg = triple(T, Kl);
      // ensamblaje con restricciones del diafragma
      const map = dofMap(pa).concat(dofMap(pb));
      e.Kg = Kg; e.map = map; e.R = R; e.L = L;
      for (let i = 0; i < 12; i++) for (const ti of map[i]) for (let j = 0; j < 12; j++) {
        const v = Kg[i][j]; if (!v) continue;
        for (const tj of map[j]) addK(ti.g, tj.g, ti.c * tj.c * v);
      }
    }

    // membranas de las placas: gdl (u a lo largo del muro, w vertical) de cada nudo
    for (const e of elems) if (e.quads) for (const q of e.quads) {
      q.map = [];
      for (const kk of q.keys) {
        const m = dofMap(pts.get(kk));
        q.map.push(m[0].map(t => ({ g: t.g, c: t.c * q.c })).concat(m[1].map(t => ({ g: t.g, c: t.c * q.sn }))), m[2]);
      }
      for (let i = 0; i < 8; i++) for (const ti of q.map[i]) for (let j = 0; j < 8; j++) {
        const v = q.K[i][j]; if (!v) continue;
        for (const tj of q.map[j]) addK(ti.g, tj.g, ti.c * tj.c * v);
      }
    }
    // membranas de losa (ux, uy de cada vértice)
    for (const mb of membranas) {
      const mp = []; for (const kk of mb.keys) { const m = dofMap(pts.get(kk)); mp.push(m[0], m[1]); }
      const n = mp.length;
      for (let i = 0; i < n; i++) for (const ti of mp[i]) for (let j = 0; j < n; j++) { const v = mb.K[i][j]; if (!v) continue; for (const tj of mp[j]) addK(ti.g, tj.g, ti.c * tj.c * v); }
    }
    if (flex) { // nudos que solo tocan losa: sin rigidez vertical ni de giro propia -> resorte mínimo (no carga nada)
      const conFrame = new Set(); for (const e of elems) { conFrame.add(e.a); conFrame.add(e.b); if (e.quads) e.quads.forEach(q => q.keys.forEach(kk => conFrame.add(kk))); }
      for (const p of order) if (p.k > 0) {
        const kk = p.id + "@" + p.k, base = p.mi != null ? 0 : 2;
        if (!conFrame.has(kk)) for (let i = base; i < (p.mi != null ? 4 : 6); i++) Kss.add(p.eq + i, p.eq + i, 1e-3);
        else Kss.add(p.eq + (p.mi != null ? 3 : 5), p.eq + (p.mi != null ? 3 : 5), 1e-3); // giro en planta mínimo
      }
    }
    // giros sin rigidez (nudos intermedios de las láminas): resorte mínimo, no influye en nada
    for (const p of order) if (p.id[0] === "~" && p.id[1] === "W" && p.k > 0) { const o = flex ? (p.mi != null ? 0 : 2) : 0; Kss.add(p.eq + o + 1, p.eq + o + 1, 1e-3); Kss.add(p.eq + o + 2, p.eq + o + 2, 1e-3); }

    // resortes de la base (ejes globales; kx, ky, kz, krx, kry, krz)
    if (resortes) for (const p of order) if (p.k === 0) { const kk = resortes[p.id]; for (let i = 0; i < 6; i++) Kss.add(p.eq + i, p.eq + i, kk[i]); }

    // ---- condensación estática a los 3N gdl de los diafragmas
    Kss.factor();
    const X = Array.from({ length: nm }, (_, j) => Kss.solve(Float64Array.from(Ksm, r => r[j]))); // Kss⁻¹ Ksm (por columna)
    const KL = Array.from({ length: nm }, () => new Float64Array(nm));
    for (let i = 0; i < nm; i++) for (let j = 0; j < nm; j++) {
      let s = 0; const xj = X[j];
      for (let r = 0; r < ns; r++) { const v = Ksm[r][i]; if (v) s += v * xj[r]; }
      KL[i][j] = Kmm[i][j] - s;
    }
    for (let i = 0; i < nm; i++) for (let j = 0; j < i; j++) { const v = 0.5 * (KL[i][j] + KL[j][i]); KL[i][j] = KL[j][i] = v; }

    // efecto P-Δ (opcional, como la opción de ETABS basada en la masa): rigidez geométrica de cada entrepiso
    // con la carga de gravedad que tiene encima (peso sísmico), Kg = −N/h en traslación y −N·r²/h en giro.
    if (model.pDelta && flex) { // reparto por masa de cada nudo, acoplado con el nudo de abajo en la misma posición
      const idx = new Map(maestros.map((m, i) => [m.k + "|" + Math.round(m.x * 1e4) + "|" + Math.round(m.y * 1e4) + "|" + m.d, i]));
      for (let k = N; k >= 1; k--) {
        let Nk = 0; for (let j = k; j <= N; j++) Nk += levels[j - 1].W;
        const h = model.stories[k - 1].h, Mk = levels[k - 1].m;
        maestros.forEach((m, a) => { if (m.k !== k) return; const g = Nk / h * m.m / Mk; KL[a][a] -= g; const b = idx.get((k - 1) + "|" + Math.round(m.x * 1e4) + "|" + Math.round(m.y * 1e4) + "|" + m.d); if (b != null) { KL[b][b] -= g; KL[a][b] += g; KL[b][a] += g; } });
      }
    } else if (model.pDelta) {
      for (let k = N; k >= 1; k--) {
        let Nk = 0, Mk = 0, Jk = 0;
        for (let j = k; j <= N; j++) { const L = levels[j - 1]; Nk += L.W; Mk += L.m; Jk += L.J; }
        const h = model.stories[k - 1].h, gk = Nk / h, r2 = Jk / Mk;
        for (let d = 0; d < 3; d++) {
          const g = d === 2 ? gk * r2 : gk, a = 3 * (k - 1) + d;
          KL[a][a] -= g;
          if (k > 1) { const b = 3 * (k - 2) + d; KL[b][b] -= g; KL[a][b] += g; KL[b][a] += g; }
        }
      }
    }

    const mass = new Float64Array(nm);
    if (flex) maestros.forEach((m, i) => { mass[i] = m.m; });
    else levels.forEach((L, i) => { mass[3 * i] = L.m; mass[3 * i + 1] = L.m; mass[3 * i + 2] = L.J; });
    // vectores de influencia (sismo en X, en Y y giro alrededor del CM de cada nivel)
    const inf = { x: new Float64Array(nm), y: new Float64Array(nm), r: new Float64Array(nm) };
    maestros.forEach((m, i) => {
      const L = levels[m.k - 1];
      if (m.d === 0) { inf.x[i] = 1; inf.r[i] = flex ? -(m.y - L.yc) : 0; }
      else if (m.d === 1) { inf.y[i] = 1; inf.r[i] = flex ? m.x - L.xc : 0; }
      else inf.r[i] = 1;
    });
    const maestroEn = new Map(); maestros.forEach((m, i) => { if (m.d === 0) maestroEn.set(m.k + "|" + Math.round(m.x * 1e4) + "|" + Math.round(m.y * 1e4), i); });

    // dimensiones en planta de cada nivel (para la excentricidad accidental)
    for (const L of levels) {
      const xs = [], ys = [];
      for (const p of pts.values()) if (p.k === L.k) { xs.push(p.x); ys.push(p.y); }
      L.Lx = Math.max(...xs) - Math.min(...xs); L.Ly = Math.max(...ys) - Math.min(...ys);
      L.points = [...pts.values()].filter(p => p.k === L.k).map(p => ({ id: p.id, x: p.x, y: p.y }));
    }

    const Wpp = pp.total;
    return { N, z, levels, KL, mass, elems, pts, cargas: { PP: Wpp, ...cargas }, X, ns, nm, order, Kss, Ksm, model, sec, flex, maestros, inf, maestroEn, membranas };
  }

  // ---------------------------------------------------------------- análisis modal
  function modal(B, nModes) {
    const nm = B.nm, s = Array.from(B.mass, m => 1 / Math.sqrt(m));
    const A = Array.from({ length: nm }, (_, i) => Array.from({ length: nm }, (_, j) => B.KL[i][j] * s[i] * s[j]));
    const { values, vectors } = jacobiEigen(A);
    const Mtot = B.levels.reduce((a, L) => a + L.m, 0);
    const Jtot = B.levels.reduce((a, L) => a + L.J, 0);
    const modes = [];
    const n = Math.min(nModes || nm, nm);
    for (let i = 0; i < n; i++) {
      const w2 = values[i], w = Math.sqrt(w2);
      const phi = vectors[i].map((v, j) => v * s[j]); // normalizado a la masa: φᵀMφ = 1
      let Lx = 0, Ly = 0, Lr = 0;
      for (let j = 0; j < nm; j++) { const mp = B.mass[j] * phi[j]; Lx += mp * B.inf.x[j]; Ly += mp * B.inf.y[j]; Lr += mp * B.inf.r[j]; }
      modes.push({ n: i + 1, w, T: 2 * Math.PI / w, phi, Gx: Lx, Gy: Ly, Gr: Lr, UX: Lx * Lx / Mtot, UY: Ly * Ly / Mtot, RZ: Lr * Lr / Jtot });
    }
    let sx = 0, sy = 0, sr = 0;
    for (const m of modes) { sx += m.UX; sy += m.UY; sr += m.RZ; m.SumUX = sx; m.SumUY = sy; m.SumRZ = sr; }
    return modes;
  }

  // CQC (amortiguamiento constante)
  function cqc(vals, modes, xi) {
    let s = 0;
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++) {
      const r = modes[j].w / modes[i].w;
      const rho = 8 * xi * xi * (1 + r) * r ** 1.5 / ((1 - r * r) ** 2 + 4 * xi * xi * r * (1 + r) ** 2);
      s += vals[i] * rho * vals[j];
    }
    return Math.sqrt(Math.max(s, 0));
  }

  // Respuesta estática de los gdl maestros a un vector de fuerzas maestras
  function solveMaster(B, Fm) {
    const n = B.nm, A = B.KL.map(r => Float64Array.from(r)), b = Float64Array.from(Fm);
    for (let i = 0; i < n; i++) { // Gauss con pivoteo
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; if (!f) continue; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }
  // nudos con masa de cada nivel (diafragma flexible): [{i, x, y, m}] con i = índice del maestro ux
  function nudosNivel(B, k) {
    const out = []; B.maestros.forEach((m, i) => { if (m.k === k && m.d === 0) out.push({ i, x: m.x, y: m.y, m: B.mass[i] }); });
    return out;
  }
  function inercia(B, k) {
    const L = B.levels[k - 1], nn = nudosNivel(B, k);
    let M = 0, J = 0; for (const q of nn) { M += q.m; J += q.m * ((q.x - L.xc) ** 2 + (q.y - L.yc) ** 2); }
    return { nn, M, J, L };
  }
  // (Fx, Fy, Mz) por nivel → fuerzas en los maestros. Flexible: reparto según la masa de cada nudo
  function cargaNivel(B, F) {
    if (!B.flex) return Float64Array.from(F);
    const f = new Float64Array(B.nm);
    for (let k = 1; k <= B.N; k++) {
      const Fx = F[3 * (k - 1)], Fy = F[3 * (k - 1) + 1], Mz = F[3 * (k - 1) + 2];
      if (!Fx && !Fy && !Mz) continue;
      const { nn, M, J, L } = inercia(B, k);
      for (const q of nn) {
        const rx = q.x - L.xc, ry = q.y - L.yc;
        f[q.i] += Fx * q.m / M - (J ? Mz * q.m * ry / J : 0);
        f[q.i + 1] += Fy * q.m / M + (J ? Mz * q.m * rx / J : 0);
      }
    }
    return f;
  }
  // fuerzas en los maestros → resultante (Fx, Fy, Mz) de cada nivel respecto al centro de masa
  function fuerzasNivel(B, v) {
    if (!B.flex) return Float64Array.from(v);
    const F = new Float64Array(3 * B.N);
    B.maestros.forEach((m, i) => {
      const L = B.levels[m.k - 1], o = 3 * (m.k - 1);
      if (m.d === 0) { F[o] += v[i]; F[o + 2] -= (m.y - L.yc) * v[i]; } else { F[o + 1] += v[i]; F[o + 2] += (m.x - L.xc) * v[i]; }
    });
    return F;
  }
  // desplazamiento (ux, uy, rz) del nivel k (1..N) en su centro de masa; flexible: ajuste de cuerpo rígido ponderado por masa
  function despNivel(B, u, k) {
    if (k === 0) return [0, 0, 0];
    if (!B.flex) { const i = 3 * (k - 1); return [u[i], u[i + 1], u[i + 2]]; }
    const { nn, M, J, L } = inercia(B, k);
    let ux = 0, uy = 0, rz = 0;
    for (const q of nn) { ux += q.m * u[q.i]; uy += q.m * u[q.i + 1]; rz += q.m * ((q.x - L.xc) * u[q.i + 1] - (q.y - L.yc) * u[q.i]); }
    return [ux / M, uy / M, J ? rz / J : 0];
  }
  // Respuesta estática a fuerzas (Fx, Fy, Mz) por nivel; devuelve los desplazamientos maestros
  function solveLateral(B, F) { return solveMaster(B, cargaNivel(B, F)); }

  // desplazamiento de un punto (x, y) del nivel k (1..N) en la dirección d (0 = X, 1 = Y)
  function pointDisp(B, u, k, x, y, d) {
    if (k === 0) return 0;
    if (B.flex) {
      let i = B.maestroEn.get(k + "|" + Math.round(x * 1e4) + "|" + Math.round(y * 1e4));
      if (i == null) { let best = Infinity; for (const q of nudosNivel(B, k)) { const r = (q.x - x) ** 2 + (q.y - y) ** 2; if (r < best) { best = r; i = q.i; } } }
      return i == null ? 0 : u[i + d];
    }
    const L = B.levels[k - 1], i = 3 * (k - 1);
    return d === 0 ? u[i] - (y - L.yc) * u[i + 2] : u[i + 1] + (x - L.xc) * u[i + 2];
  }

  // Desplazamientos completos (esclavos + maestros) a partir de los gdl de los diafragmas: us = -Kss⁻¹ Ksm um
  function fullDisp(B, um) {
    const us = new Float64Array(B.ns);
    for (let j = 0; j < B.nm; j++) { const c = um[j]; if (!c) continue; const x = B.X[j]; for (let r = 0; r < B.ns; r++) us[r] -= x[r] * c; }
    const u = new Float64Array(B.ns + B.nm); u.set(us); u.set(um, B.ns);
    return u;
  }
  // Fuerzas en los extremos del elemento en ejes locales (12 valores); en una placa-lámina suma la membrana del piso
  function elemLocal(e, u) {
    const ue = e.map.map(l => l.reduce((a, t) => a + t.c * u[t.g], 0));
    const fg = e.Kg.map(r => r.reduce((a, v, j) => a + v * ue[j], 0));
    const fl = new Float64Array(12);
    for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) fl[3 * b + i] += e.R[i][j] * fg[3 * b + j];
    if (e.quads) for (const q of e.quads) {
      const uq = q.map.map(l => l.reduce((a, t) => a + t.c * u[t.g], 0));
      const fq = q.K.map(r => r.reduce((a, v, j) => a + v * uq[j], 0));
      for (let n = 0; n < 4; n++) { // nudos 0-1 abajo (extremo a), 2-3 arriba (extremo b)
        const o = n < 2 ? 0 : 6, Fs = fq[2 * n], Fw = fq[2 * n + 1], d = q.s[n] - q.smid;
        fl[o] += Fw; fl[o + 1] += Fs; fl[o + 5] += -d * Fw;
      }
    }
    return fl;
  }
  // Fuerzas en los extremos del elemento (ejes globales, 12 valores)
  function elemForces(e, u) {
    const fl = elemLocal(e, u), g = new Float64Array(12);
    for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g[3 * b + i] += e.R[j][i] * fl[3 * b + j];
    return g;
  }

  // Puntos de control de deriva: columnas presentes en ambos niveles del entrepiso
  function driftPoints(B, k) {
    const below = new Set(), out = [];
    for (const p of B.pts.values()) if (p.k === k - 1) below.add(p.id);
    for (const p of B.pts.values()) if (p.k === k && p.id[0] !== "~" && (k === 1 || below.has(p.id))) out.push(p);
    return out;
  }

  /* Centro de masa y centro de rigidez de cada piso (como ETABS: carga unitaria solo en ese piso).
     Una fuerza que pasa por el CR no hace girar el piso. */
  function centros(B) {
    return B.levels.map((L, k) => {
      const F = (i) => { const f = new Float64Array(3 * B.N); f[3 * k + i] = 1; return despNivel(B, solveLateral(B, f), k + 1); };
      const ux = F(0), uy = F(1), ut = F(2), tt = ut[2];
      return { piso: L.name, xcm: L.xc, ycm: L.yc, xcr: L.xc - uy[2] / tt, ycr: L.yc + ux[2] / tt, Lx: L.Lx, Ly: L.Ly };
    });
  }
  root.Solver = { G, centros, fullDisp, elemForces, elemLocal, q6K, cstK, inv, buildModel, modal, cqc, solveLateral, solveMaster, cargaNivel, fuerzasNivel, despNivel, pointDisp, driftPoints, polyProps, torsionJ, jacobiEigen, Band };
  if (typeof module !== "undefined") module.exports = root.Solver;
})(typeof window !== "undefined" ? window : globalThis);
