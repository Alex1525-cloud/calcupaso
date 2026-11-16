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
      sec[wsec] = { type: "col", b: Lw, h: t, wall: true };
      for (let k = w.p1; k <= w.p2; k++) {
        elems.push({ type: "col", a: addPt(mid, k - 1), b: addPt(mid, k), sec: wsec, k, ang, wall: wi, ends: [w.i, w.j] });
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
    const addMass = (k, m, x, y) => { const L = lv[k]; L.m += m; L.Sx += m * x; L.Sy += m * y; L.Ip += m * (x * x + y * y); };
    const pp = { total: 0 };
    for (const e of elems) {
      const s = sec[e.sec], A = s.props ? s.props.A : s.b * s.h;
      const pa = pts.get(e.a), pb = pts.get(e.b);
      if (e.type === "link") continue;
      if (e.type === "col") {
        const W = A * gamma * model.stories[e.k - 1].h;
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
        if (model.slabMass === "distribuida") { const L = lv[k]; L.m += m * P.A; L.Sx += m * P.Sx; L.Sy += m * P.Sy; L.Ip += m * P.Ip; }
        else { // como ETABS: la masa de cada paño se concentra en sus vértices (partes iguales)
          for (const [x, y] of poly) addMass(k, m * P.A / poly.length, x, y);
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
    const order = [...pts.values()].filter(p => p.k > 0).sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
    order.forEach((p, i) => { p.eq = 3 * i; });
    const ns = 3 * order.length, nm = 3 * N;
    const masterEq = (k) => 3 * (k - 1); // índice en el bloque de maestros

    // A: cada gdl del nudo como combinación de gdl globales. Devuelve [[{g, c}...] x6]; g<ns: esclavo, g>=ns: maestro
    function dofMap(p) {
      if (p.k === 0) return [[], [], [], [], [], []];
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
      if (a.k > 0 && b.k > 0) bw = Math.max(bw, Math.abs(a.eq - b.eq) + 2);
    }
    bw = Math.max(bw, 2);
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
      const Ee = s.rigid ? E * 100 : E, Ge = s.rigid ? Gm * 100 : Gm;
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
      let Kl = frameLocalK(Ee, Ge, A, Iy, Iz, J, As, As, L - a0 - b0);
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

    const mass = new Float64Array(nm);
    levels.forEach((L, i) => { mass[3 * i] = L.m; mass[3 * i + 1] = L.m; mass[3 * i + 2] = L.J; });

    // dimensiones en planta de cada nivel (para la excentricidad accidental)
    for (const L of levels) {
      const xs = [], ys = [];
      for (const p of pts.values()) if (p.k === L.k) { xs.push(p.x); ys.push(p.y); }
      L.Lx = Math.max(...xs) - Math.min(...xs); L.Ly = Math.max(...ys) - Math.min(...ys);
      L.points = [...pts.values()].filter(p => p.k === L.k).map(p => ({ id: p.id, x: p.x, y: p.y }));
    }

    const Wpp = pp.total;
    return { N, z, levels, KL, mass, elems, pts, cargas: { PP: Wpp, ...cargas }, X, ns, nm, order, Kss, Ksm, model, sec };
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
      B.levels.forEach((L, k) => { Lx += L.m * phi[3 * k]; Ly += L.m * phi[3 * k + 1]; Lr += L.J * phi[3 * k + 2]; });
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

  // Respuesta estática de los diafragmas a fuerzas (Fx, Fy, Mz) por nivel
  function solveLateral(B, F) {
    const n = B.nm, A = B.KL.map(r => Float64Array.from(r)), b = Float64Array.from(F);
    for (let i = 0; i < n; i++) { // Gauss (matriz pequeña)
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; if (!f) continue; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }

  // desplazamiento de un punto (x, y) del nivel k (1..N) en la dirección d (0 = X, 1 = Y)
  function pointDisp(B, u, k, x, y, d) {
    if (k === 0) return 0;
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
  // Fuerzas en los extremos del elemento (ejes globales, 12 valores)
  function elemForces(e, u) {
    const ue = e.map.map(l => l.reduce((a, t) => a + t.c * u[t.g], 0));
    return e.Kg.map(r => r.reduce((a, v, j) => a + v * ue[j], 0));
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
      const F = (i) => { const f = new Float64Array(B.nm); f[3 * k + i] = 1; return solveLateral(B, f); };
      const ux = F(0), uy = F(1), ut = F(2), tt = ut[3 * k + 2];
      return { piso: L.name, xcm: L.xc, ycm: L.yc, xcr: L.xc - uy[3 * k + 2] / tt, ycr: L.yc + ux[3 * k + 2] / tt, Lx: L.Lx, Ly: L.Ly };
    });
  }
  root.Solver = { G, centros, fullDisp, elemForces, buildModel, modal, cqc, solveLateral, pointDisp, driftPoints, polyProps, torsionJ, jacobiEigen, Band };
  if (typeof module !== "undefined") module.exports = root.Solver;
})(typeof window !== "undefined" ? window : globalThis);
