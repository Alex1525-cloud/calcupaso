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

  function hidrostatica(dz) { return AGUA.rho * AGUA.g * dz; }

  var api = { AGUA: AGUA, PVC: PVC, tramo: tramo, colebrook: colebrook, hidrostatica: hidrostatica, RE_LAM: RE_LAM, RE_TURB: RE_TURB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HCALC = api;
})(this);
