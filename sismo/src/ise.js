/* Interacción suelo-estructura (opcional): resortes en la base de cada columna y placa con las rigideces
   estáticas de Gazetas (1991) para zapatas rectangulares superficiales sobre un semiespacio elástico.
   El tamaño de cada zapata sale de las cargas de gravedad (CM + CV) y la capacidad portante. */
(function (root) {
  "use strict";
  const S = root.Solver || require("./solver.js");
  const F = root.Fuerzas || require("./fuerzas.js");
  const D = root.Diseno || require("./diseno.js");
  const VS_SUELO = { S0: 1000, S1: 650, S2: 450, S3: 275, S4: 150 }; // m/s, valor típico de cada perfil (E.030)

  // L y Bm: semilados (L ≥ Bm). Devuelve rigideces en t/m y t·m/rad.
  function gazetas(Lt, Bt, G, nu) {
    const L = Math.max(Lt, Bt) / 2, Bm = Math.min(Lt, Bt) / 2, Ab = 4 * L * Bm, chi = Ab / (4 * L * L);
    const Ibx = 4 / 3 * L * Bm ** 3, Iby = 4 / 3 * Bm * L ** 3, Ibz = Ibx + Iby; // x: eje largo
    const Kz = 2 * G * L / (1 - nu) * (0.73 + 1.54 * chi ** 0.75);
    const Kcorto = 2 * G * L / (2 - nu) * (2 + 2.5 * chi ** 0.85); // traslación en la dirección corta
    const Klargo = Kcorto - 0.2 / (0.75 - nu) * G * L * (1 - Bm / L); // traslación en la dirección larga
    const Krx = G / (1 - nu) * Ibx ** 0.75 * (L / Bm) ** 0.25 * (2.4 + 0.5 * Bm / L); // giro alrededor del eje largo
    const Kry = 3 * G / (1 - nu) * Iby ** 0.75 * (L / Bm) ** 0.15; // giro alrededor del eje corto
    const Kt = 3.5 * G * Ibz ** 0.75 * (Bm / L) ** 0.4 * (Ibz / Bm ** 4) ** 0.2;
    return { Kz, Kcorto, Klargo, Krx, Kry, Kt };
  }

  /* model: el modelo sin resortes. p = {qadm, Df, vs30, suelo, fc, fy}. Devuelve {springs, info, G, Vs} */
  function resortes(model, p) {
    const B = S.buildModel(Object.assign({}, model, { springs: null, pDelta: false }));
    const g = F.gravedad(B), sec = B.sec;
    const Vs = p.vs30 || VS_SUELO[p.suelo] || 450, nu = 0.33, gam = 1.9;
    const G = 0.5 * gam / S.G * Vs * Vs; // t/m², con 50% de reducción por la deformación del sismo
    const springs = {}, info = [];
    for (const [e, f] of g.porElem) {
      if (e.type !== "col" || e.k !== 1) continue;
      const s = sec[e.sec], id = B.pts.get(e.a).id;
      const rc = { D: f.D.P[0], L: f.L.P[0], SX: 0, SY: 0, MD: [0, 0], ML: [0, 0], MSX: [0, 0], MSY: [0, 0] };
      const z = s.mat === "alb" ? D.cimientoCorrido(rc, s.b, s.h, p) : D.zapata(rc, s.forma === "circ" ? [s.b, s.b] : [s.b, s.h], p);
      if (z.falla) continue;
      const Ly = z.Ly, Lz = z.Lz, k = gazetas(Ly, Lz, G, nu);
      const largoY = Ly >= Lz; // eje largo en y local
      const ky = largoY ? k.Klargo : k.Kcorto, kz = largoY ? k.Kcorto : k.Klargo;
      const ry = largoY ? k.Krx : k.Kry, rz = largoY ? k.Kry : k.Krx; // giro alrededor del eje y local y del eje z local
      const c = Math.cos(e.ang || 0), sn = Math.sin(e.ang || 0), c2 = c * c, s2 = sn * sn;
      springs[id] = [c2 * ky + s2 * kz, s2 * ky + c2 * kz, k.Kz, c2 * ry + s2 * rz, s2 * ry + c2 * rz, k.Kt];
      info.push({ id, x: B.pts.get(e.a).x, y: B.pts.get(e.a).y, Ly, Lz, Kz: k.Kz, Kx: springs[id][0], Ky: springs[id][1], placa: e.wall != null });
    }
    return { springs, info, G, Vs, nu };
  }

  const ISE = { resortes, gazetas, VS_SUELO };
  root.ISE = ISE;
  if (typeof module !== "undefined") module.exports = ISE;
})(typeof window !== "undefined" ? window : globalThis);
