/* Cálculo teórico de pérdidas por fricción (Darcy–Weisbach + Colebrook).
   Parámetros de la tabla 6 del informe. Resultados teóricos, no mediciones. */
(function (root) {
  'use strict';

  var AGUA = { rho: 998.2, nu: 1.004e-6, g: 9.81, eps: 0.0015e-3, T: 20 };

  // PVC clase 10 (NTP 399.002). Di provisional: debe medirse en el tubo comprado.
  var PVC = {
    '1/2': { nombre: '1/2"', De: 0.0210, e: 0.0018 },
    '3/4': { nombre: '3/4"', De: 0.0265, e: 0.0018 },
    '1':   { nombre: '1"',   De: 0.0330, e: 0.0018 }
  };
  Object.keys(PVC).forEach(function (k) { PVC[k].Di = PVC[k].De - 2 * PVC[k].e; PVC[k].id = k; });

  var RE_LAM = 2300, RE_TURB = 4000;

  function colebrook(Re, rr) {
    // semilla de Swamee–Jain y punto fijo
    var f = 0.25 / Math.pow(Math.log10(rr / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
    for (var i = 0; i < 100; i++) {
      var x = -2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(f)));
      var fn = 1 / (x * x);
      if (Math.abs(fn - f) < 1e-14) { f = fn; break; }
      f = fn;
    }
    return f;
  }

  /** Tramo recto: Q en L/min, D y L en m. */
  function tramo(QLmin, D, L) {
    var Q = QLmin / 60000;
    var A = Math.PI * D * D / 4;
    var v = Q / A;
    var Re = v * D / AGUA.nu;
    var hv = v * v / (2 * AGUA.g);
    var r = { Q: Q, QLmin: QLmin, D: D, L: L, A: A, v: v, Re: Re, hv: hv, f: null, hf: null, dp: null, regimen: '' };
    if (QLmin <= 0) { r.regimen = 'Sin flujo'; r.f = 0; r.hf = 0; r.dp = 0; return r; }
    if (Re < RE_LAM) { r.regimen = 'Laminar'; r.f = 64 / Re; }
    else if (Re < RE_TURB) {
      r.regimen = 'Transición';
      // referencias de dos ramas del modelo (como en la nota de la tabla 7), sin valor único
      r.fLam = 64 / Re; r.fTurb = colebrook(Re, AGUA.eps / D);
      r.hfLam = r.fLam * L / D * hv; r.hfTurb = r.fTurb * L / D * hv;
    }
    else { r.regimen = 'Turbulento'; r.f = colebrook(Re, AGUA.eps / D); }
    if (r.f != null) { r.hf = r.f * L / D * hv; r.dp = AGUA.rho * AGUA.g * r.hf; }
    return r;
  }


  /* ---------------- Fase 3: pérdidas locales, f continuo y reparto ---------------- */
  // K de referencia (tablas usuales de Crane / Mott). Editables en la interfaz: a verificar.
  var K_REF = { codo: 0.9, teeRecto: 0.6, teeDeriv: 1.8, medidor: 2.2 };
  // Válvula de bola: K según ángulo de cierre θ (grados), tabla usual de literatura.
  var BOLA = [[0, 0.05], [5, 0.05], [10, 0.29], [15, 0.75], [20, 1.56], [25, 3.10], [30, 5.47], [35, 9.68], [40, 17.3], [45, 31.2], [50, 52.6], [55, 106], [60, 206], [65, 486]];
  /** apertura en % (100 abierta, 0 cerrada) → K de la válvula; null si está cerrada. */
  function kValvula(ap) {
    if (ap <= 0) return null;
    var th = (1 - ap / 100) * 90;
    if (th >= 65) return 486 * Math.exp((th - 65) / 6);
    for (var i = 1; i < BOLA.length; i++) if (th <= BOLA[i][0]) {
      var a = BOLA[i - 1], b = BOLA[i], t = (th - a[0]) / (b[0] - a[0]);
      return Math.exp(Math.log(a[1]) + t * (Math.log(b[1]) - Math.log(a[1])));
    }
    return 486;
  }
  /** f continuo: laminar, Colebrook y, entre 2300 y 4000, interpolación lineal (solo referencial). */
  function fEff(Re, D) {
    if (Re <= 0) return 0;
    if (Re < RE_LAM) return 64 / Re;
    var rr = AGUA.eps / D;
    if (Re >= RE_TURB) return colebrook(Re, rr);
    var t = (Re - RE_LAM) / (RE_TURB - RE_LAM);
    return (1 - t) * 64 / RE_LAM + t * colebrook(RE_TURB, rr);
  }
  function vel(QLmin, D) { return QLmin / 60000 / (Math.PI * D * D / 4); }
  function hvOf(QLmin, D) { var v = vel(QLmin, D); return v * v / (2 * AGUA.g); }
  /** Pérdida por cambio de sección al pasar de Da a Db (carga en m, con la velocidad mayor). */
  function hTransicion(QLmin, Da, Db) {
    if (Math.abs(Da - Db) < 1e-6 || QLmin <= 0) return 0;
    if (Db < Da) { var b2 = Db * Db / (Da * Da); return 0.5 * (1 - b2) * hvOf(QLmin, Db); }      // contracción
    var a2 = Da * Da / (Db * Db); return (1 - a2) * (1 - a2) * hvOf(QLmin, Da);                // ampliación
  }
  /** Ramal: {D, L, sumK, Dh (diámetro del cabezal)}. Devuelve hf, hL y h total (m). */
  function ramal(br, QLmin) {
    if (QLmin <= 0) return { Q: 0, hf: 0, hL: 0, h: 0, f: 0, Re: 0, v: 0, hv: 0 };
    var v = vel(QLmin, br.D), Re = v * br.D / AGUA.nu, hv = v * v / (2 * AGUA.g), f = fEff(Re, br.D);
    var hf = f * br.L / br.D * hv;
    var hT = br.Dh ? hTransicion(QLmin, br.Dh, br.D) + hTransicion(QLmin, br.D, br.Dh) : 0;
    var hL = br.sumK * hv + hT;
    return { Q: QLmin, v: v, Re: Re, hv: hv, f: f, hf: hf, hL: hL, hT: hT, h: hf + hL, trans: Re >= RE_LAM && Re < RE_TURB };
  }
  /** Reparto en paralelo: busca Q1 con h1(Q1) = h2(Q0 − Q1). br.sumK = null → válvula cerrada. */
  function reparto(Q0, b1, b2) {
    if (Q0 <= 0) return { Q1: 0, Q2: 0, h: 0 };
    if (b1.sumK == null && b2.sumK == null) return { Q1: 0, Q2: 0, h: null, bloqueado: true };
    if (b1.sumK == null) return { Q1: 0, Q2: Q0, h: ramal(b2, Q0).h };
    if (b2.sumK == null) return { Q1: Q0, Q2: 0, h: ramal(b1, Q0).h };
    var lo = 0, hi = Q0;
    for (var i = 0; i < 80; i++) {
      var m = (lo + hi) / 2, g = ramal(b1, m).h - ramal(b2, Q0 - m).h;
      if (g > 0) hi = m; else lo = m;
    }
    var Q1 = (lo + hi) / 2;
    return { Q1: Q1, Q2: Q0 - Q1, h: ramal(b1, Q1).h };
  }

  function hidrostatica(dz) { return AGUA.rho * AGUA.g * dz; }

  var api = { AGUA: AGUA, PVC: PVC, tramo: tramo, colebrook: colebrook, hidrostatica: hidrostatica, RE_LAM: RE_LAM, RE_TURB: RE_TURB,
    K_REF: K_REF, kValvula: kValvula, fEff: fEff, vel: vel, hvOf: hvOf, hTransicion: hTransicion, ramal: ramal, reparto: reparto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HCALC = api;
})(this);
