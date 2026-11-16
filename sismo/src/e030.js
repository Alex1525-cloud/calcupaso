/* Norma E.030 (2026 por defecto, 2018 opcional) y análisis sísmico sobre el motor.
   Tablas copiadas del prototipo con ETABS (norma.py / e030.py), cotejadas con el texto oficial. */
(function (root) {
  "use strict";
  const S = root.Solver || (typeof require !== "undefined" ? require("./solver.js") : null);

  const Z = { 1: 0.10, 2: 0.25, 3: 0.35, 4: 0.45 };
  const U = { A1: 1.5, A2: 1.5, B: 1.3, C: 1.0 };
  const R0 = { "PÓRTICOS": 8, "DUAL": 7, "MUROS": 6, "EMDL": 3.5, "ALBAÑILERÍA": 3 };
  const CT = { "PÓRTICOS": 35, "DUAL": 60, "MUROS": 60, "EMDL": 60, "ALBAÑILERÍA": 60 };
  const DERIVA = { "CONCRETO": 0.007, "ACERO": 0.010, "ALBAÑILERÍA": 0.005, "MADERA": 0.010, "EMDL": 0.004 };
  const S_2018 = { 4: { S0: .8, S1: 1, S2: 1.05, S3: 1.1 }, 3: { S0: .8, S1: 1, S2: 1.15, S3: 1.2 }, 2: { S0: .8, S1: 1, S2: 1.2, S3: 1.4 }, 1: { S0: .8, S1: 1, S2: 1.6, S3: 2 } };
  const TPTL_2018 = { S0: [0.3, 3.0], S1: [0.4, 2.5], S2: [0.6, 2.0], S3: [1.0, 1.6] };
  const S_2026 = { 4: { S0: .8, S1: 1, S2: [1, 1.1], S3: [1.1, 1.2], S4: null }, 3: { S0: .8, S1: 1, S2: [1, 1.15], S3: [1.15, 1.2], S4: 1.3 },
    2: { S0: .8, S1: 1, S2: [1, 1.3], S3: [1.3, 1.4], S4: 1.7 }, 1: { S0: .8, S1: 1, S2: [1, 1.3], S3: [1.3, 1.6], S4: 2.4 } };
  const TP_2026 = { S0: 0.3, S1: 0.4, S2: [0.4, 0.6], S3: [0.6, 0.9], S4: 1.2 };
  const TL_2026 = { S0: 3.0, S1: 2.5, S2: [2.5, 2.0], S3: [2.0, 1.6], S4: 1.6 };
  const VS30 = { S0: [800, 1e9], S1: [550, 800], S2: [350, 550], S3: [200, 350], S4: [0, 200] };
  const ART = {
    "2026": { C: "art. 18", peso: "art. 31", estatico: "art. 33.2", Vbase: "art. 34", k: "art. 35", T: "art. 36", ecc: "arts. 37 y 45",
      escala: "art. 44", direccional: "arts. 33.3 y 43", deriva: "art. 50", sistema: "art. 20 (Tabla N° 8)", brutas: "art. 30.2",
      R0: "Tabla N° 10", altura: "Tabla N° 11", planta: "Tabla N° 12", restric: "Tabla N° 13", limDeriva: "Tabla N° 14", suelo: "Tablas N° 4 y N° 5", categoria: "Tabla N° 7" },
    "2018": { C: "art. 14", peso: "art. 26", estatico: "E.030-2018", Vbase: "E.030-2018", k: "E.030-2018", T: "E.030-2018", ecc: "E.030-2018",
      escala: "art. 29.4", direccional: "(no exige 100%+30%)", deriva: "art. 31", sistema: "E.030-2018", brutas: "E.030-2018",
      R0: "Tabla N° 7", altura: "Tabla N° 8", planta: "Tabla N° 9", restric: "Tabla N° 10", limDeriva: "Tabla N° 11", suelo: "Tablas N° 3 y N° 4", categoria: "Tabla N° 5" },
  };

  const interp = (par, vs, [lo, hi]) => {
    if (!Array.isArray(par)) return par;
    if (vs == null) return par[1];
    const t = Math.min(Math.max((hi - vs) / (hi - lo), 0), 1);
    return par[0] + (par[1] - par[0]) * t;
  };

  function sueloParams(version, zona, suelo, vs30) {
    if (version === "2018") {
      if (suelo === "S4") return { S: null, nota: "Suelo S4: S, Tp y TL los fija el estudio de mecánica de suelos." };
      return { S: S_2018[zona][suelo], Tp: TPTL_2018[suelo][0], TL: TPTL_2018[suelo][1], nota: "" };
    }
    const s = S_2026[zona][suelo];
    if (s == null) return { S: null, nota: "Zona 4 con suelo S4: la Tabla N° 4 exige un análisis de respuesta de sitio." };
    const r = VS30[suelo];
    const nota = Array.isArray(s) ? (vs30 != null ? `S, Tp y TL interpolados con Vs30 = ${vs30} m/s.` :
      "Sin Vs30 se toma el mayor S, y Tp y TL del extremo blando (nota (*) de la Tabla N° 5).") : "";
    return { S: interp(s, vs30, r), Tp: interp(TP_2026[suelo], vs30, r), TL: interp(TL_2026[suelo], vs30, r), nota };
  }

  function factorC(T, Tp, TL, rampa) {
    if (rampa && T < 0.2 * Tp) return 1 + 7.5 * T / Tp;
    if (T <= Tp) return 2.5;
    if (T < TL) return 2.5 * Tp / T;
    return 2.5 * Tp * TL / (T * T);
  }
  const exponenteK = (T) => T <= 0.5 ? 1 : Math.min(0.75 + 0.5 * T, 2);

  /* p = {norma, zona, suelo, vs30, categoria, sistemaX, sistemaY, Ia, Ip, regular, ecc, amort, derivaLim, dir30, escReg, escIrr} */
  function parametros(p) {
    const norma = p.norma || "2026";
    const sp = sueloParams(norma, p.zona, p.suelo, p.vs30);
    const sx = p.sistemaX || "PÓRTICOS", sy = p.sistemaY || sx;
    const q = {
      norma, zona: p.zona, suelo: p.suelo, categoria: p.categoria, sistemaX: sx, sistemaY: sy,
      Z: p.Z ?? Z[p.zona], U: p.U ?? U[p.categoria], S: p.S ?? sp.S, Tp: p.Tp ?? sp.Tp, TL: p.TL ?? sp.TL, notaSuelo: sp.nota,
      R0x: p.R0x ?? R0[sx], R0y: p.R0y ?? R0[sy], Iax: p.Iax ?? p.Ia ?? 1, Iay: p.Iay ?? p.Ia ?? 1, Ipx: p.Ipx ?? p.Ip ?? 1, Ipy: p.Ipy ?? p.Ip ?? 1,
      ecc: p.ecc ?? 0.05, amort: p.amort ?? 0.05, derivaLim: p.derivaLim ?? (sx === "ALBAÑILERÍA" || sy === "ALBAÑILERÍA" ? DERIVA["ALBAÑILERÍA"] : DERIVA.CONCRETO),
      dir30: p.dir30 ?? false, escReg: 0.8, escIrr: 0.9, CT: Math.min(CT[sx], CT[sy]),
    };
    q.Rx = q.R0x * q.Iax * q.Ipx; q.Ry = q.R0y * q.Iay * q.Ipy;
    q.regular = p.regular ?? (q.Iax * q.Ipx * q.Iay * q.Ipy === 1);
    return q;
  }

  // ---------------------------------------------------------------- análisis completo
  function analizar(model, p) {
    const q = parametros(p);
    const B = S.buildModel(model);
    const N = B.N, levels = B.levels;
    const modes = S.modal(B, Math.min(B.nm, Math.max(12, 3 * N)));
    const P = levels.reduce((a, L) => a + L.W, 0);
    const g = S.G, rampa = q.norma === "2026";
    const hn = B.z[N];

    // periodo fundamental por dirección: el modo con mayor masa participativa
    const Tdir = (d) => modes.reduce((b, m) => (d === 0 ? m.UX : m.UY) > (d === 0 ? b.UX : b.UY) ? m : b).T;
    const dirs = [0, 1].map(d => {
      const R = d === 0 ? q.Rx : q.Ry, T = Tdir(d);
      const C = factorC(T, q.Tp, q.TL, false), CR = Math.max(C / R, 0.11), coef = q.Z * q.U * q.S * CR, k = exponenteK(T);
      const V = coef * P;
      const sum = levels.reduce((a, L) => a + L.W * L.z ** k, 0);
      const F = levels.map(L => V * L.W * L.z ** k / sum);
      return { d, R, T, C, CR, coef, k, Vest: V, Fest: F };
    });

    // respuesta espectral por modo (dirección d sola), con Sa = ZUCS/R·g
    function espectral(d, R, factor) {
      const per = modes.map(m => {
        const Sa = q.Z * q.U * factorC(m.T, q.Tp, q.TL, rampa) * q.S / R * g * factor;
        const Gm = d === 0 ? m.Gx : m.Gy;
        const u = m.phi.map(v => v * Gm * Sa / (m.w * m.w));
        const f = levels.map((L, k) => [L.m * m.phi[3 * k] * Gm * Sa, L.m * m.phi[3 * k + 1] * Gm * Sa, L.J * m.phi[3 * k + 2] * Gm * Sa]);
        return { u, f, Sa };
      });
      // cortantes de piso combinados (CQC)
      const shear = levels.map((_, k) => S.cqc(per.map(r => { let s = 0; for (let j = k; j < N; j++) s += r.f[j][d]; return s; }), modes, q.amort));
      return { per, shear };
    }

    // deriva en puntos (columnas) para una lista de casos espectrales (d, factor) combinados por SRSS, más torsión accidental
    function derivas(cargas) {
      const out = [];
      const resps = cargas.map(([d, f]) => ({ d, f, r: espectral(d, d === 0 ? q.Rx : q.Ry, f) }));
      // torsión accidental: momento = fuerza de piso espectral × e (art. 45), se suma en valor absoluto
      const tors = resps.map(({ d, r }) => {
        const F = new Float64Array(3 * N);
        levels.forEach((L, k) => {
          const Fi = r.shear[k] - (k + 1 < N ? r.shear[k + 1] : 0);
          F[3 * k + 2] = Fi * q.ecc * (d === 0 ? L.Ly : L.Lx);
        });
        return S.solveLateral(B, F);
      });
      for (let k = 1; k <= N; k++) {
        const h = levels[k - 1].h;
        const row = { piso: levels[k - 1].name, k, X: 0, Y: 0, Xavg: 0, Yavg: 0, pt: {} };
        const pts = S.driftPoints(B, k);
        for (const dd of [0, 1]) {
          let mx = 0, mn = Infinity, at = null;
          for (const p of pts) {
            let s2 = 0, t = 0;
            resps.forEach(({ r }, c) => {
              const v = r.per.map(m => (S.pointDisp(B, m.u, k, p.x, p.y, dd) - S.pointDisp(B, m.u, k - 1, p.x, p.y, dd)) / h);
              s2 += S.cqc(v, modes, q.amort) ** 2;
              t += Math.abs((S.pointDisp(B, tors[c], k, p.x, p.y, dd) - S.pointDisp(B, tors[c], k - 1, p.x, p.y, dd)) / h);
            });
            const dr = Math.sqrt(s2) + t;
            mn = Math.min(mn, dr); if (dr > mx) { mx = dr; at = p.id; }
          }
          row[dd ? "Y" : "X"] = mx; row[dd ? "Yavg" : "Xavg"] = (mx + mn) / 2; row.pt[dd ? "Y" : "X"] = at;
        }
        out.push(row);
      }
      return out;
    }

    const res = { q, B, modes, P, hn, Tini: hn / q.CT, dirs, cargas: B.cargas };
    for (const D of dirs) {
      const r = espectral(D.d, D.R, 1);
      D.Vdin = r.shear[0]; D.shearDin = r.shear;
      const frac = q.regular ? q.escReg : q.escIrr;
      D.factorEscala = Math.max(1, frac * D.Vest / D.Vdin);
      D.fDeriva = (q.regular ? 0.75 : 0.85) * D.R;
    }
    // reparto del cortante basal entre placas y columnas (fuerzas estáticas sin excentricidad), art. 20
    for (const D of dirs) {
      const F = new Float64Array(3 * N);
      D.Fest.forEach((f, k) => { F[3 * k + D.d] = f; });
      const u = S.fullDisp(B, S.solveLateral(B, F));
      let vw = 0, vc = 0, va = 0;
      for (const e of B.elems) if (e.type === "col" && e.k === 1) {
        const v = -S.elemForces(e, u)[D.d]; // fuerza en el extremo inferior = reacción
        if (e.wall != null && B.sec[e.sec].mat === "alb") va += v; else if (e.wall != null) vw += v; else vc += v;
      }
      D.Vmuros = vw; D.Valb = va; D.Vcolumnas = vc; D.fracMuros = vw / (vw + vc + va); D.fracAlb = va / (vw + vc + va);
      D.sistemaCalc = D.fracAlb >= 0.7 ? "ALBAÑILERÍA" : D.fracMuros + D.fracAlb >= 0.7 ? "MUROS" : D.fracMuros + D.fracAlb > 0.2 ? "DUAL" : "PÓRTICOS";
    }
    const p30 = q.dir30 ? 0.3 : 0;
    const dX = derivas(p30 ? [[0, 1], [1, p30]] : [[0, 1]]);
    const dY = derivas(p30 ? [[1, 1], [0, p30]] : [[1, 1]]);
    res.derivas = levels.map((L, i) => ({
      piso: L.name, h: L.h,
      elX: dX[i].X, elY: dY[i].Y, inX: dX[i].X * dirs[0].fDeriva, inY: dY[i].Y * dirs[1].fDeriva,
      ratioX: dX[i].X / dX[i].Xavg, ratioY: dY[i].Y / dY[i].Yavg, ptX: dX[i].pt.X, ptY: dY[i].pt.Y,
    }));
    res.derivaMax = { X: Math.max(...res.derivas.map(r => r.inX)), Y: Math.max(...res.derivas.map(r => r.inY)) };
    res.cumple = res.derivaMax.X <= q.derivaLim && res.derivaMax.Y <= q.derivaLim;
    // índice de estabilidad para el efecto P-Δ: Q = N·Δ / (V·h·R) con la deriva inelástica (E.030, efectos de segundo orden)
    res.estabilidad = levels.map((L, k) => {
      let Nk = 0; for (let j = k; j < N; j++) Nk += levels[j].W;
      const QX = Nk * res.derivas[k].inX / (dirs[0].shearDin[k] * dirs[0].factorEscala * q.Rx), QY = Nk * res.derivas[k].inY / (dirs[1].shearDin[k] * dirs[1].factorEscala * q.Ry);
      return { piso: L.name, N: Nk, QX, QY };
    });
    res.Qmax = Math.max(...res.estabilidad.map(e => Math.max(e.QX, e.QY)));
    return res;
  }

  const E030 = { Z, U, R0, CT, DERIVA, ART, sueloParams, factorC, exponenteK, parametros, analizar };
  root.E030 = E030;
  if (typeof module !== "undefined") module.exports = E030;
})(typeof window !== "undefined" ? window : globalThis);
