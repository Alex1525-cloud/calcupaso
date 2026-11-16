/* Asistente normativo: recomendaciones antes y después del análisis, con la norma citada.
   Las reglas de predimensionamiento son prácticas usuales en Perú (no artículos de norma) y se dicen como tales. */
(function (root) {
  "use strict";

  // Usos frecuentes: sobrecarga E.020 (kg/m²) y categoría E.030 sugerida
  const USOS = {
    vivienda: { nombre: "Vivienda", cv: 200, cat: "C", nota: "E.020: viviendas 200 kg/m² (corredores y escaleras 200)." },
    oficinas: { nombre: "Oficinas", cv: 250, cat: "C", nota: "E.020: oficinas 250 kg/m² (corredores y escaleras 400)." },
    colegio: { nombre: "Centro educativo (aulas)", cv: 250, cat: "A2", nota: "E.020: aulas 250 kg/m², talleres 350, corredores 400. E.030: los colegios son esenciales (A2)." },
    hospital: { nombre: "Establecimiento de salud", cv: 300, cat: "A1", nota: "E.020: cuartos 200, salas de operación y laboratorios 300 kg/m². E.030: según su nivel puede ser A1 (con aislamiento en zonas 3 y 4) o A2." },
    comercio: { nombre: "Tiendas / comercio", cv: 500, cat: "C", nota: "E.020: tiendas 500 kg/m². Si es centro comercial grande, la E.030 lo pone en categoría B." },
    biblioteca: { nombre: "Biblioteca (salas de lectura)", cv: 300, cat: "B", nota: "E.020: salas de lectura 300, depósitos de libros 750 kg/m². E.030: las bibliotecas son categoría B." },
  };

  const pesoAligerado = (h) => h <= 0.17 ? 280 : h <= 0.20 ? 300 : h <= 0.25 ? 350 : 420;
  const r05 = (x) => Math.ceil(x / 0.05 - 1e-9) * 0.05;

  // Predimensionamiento a partir de la planta y los pisos
  function predim(st) {
    const out = [];
    const lx = st.ejesX, ly = st.ejesY;
    const Lmax = Math.max(...lx, ...ly);
    const Lmin = Math.min(...lx, ...ly);
    // losa aligerada en una dirección: h ≈ L/25 (se arma en la luz corta del paño)
    const hl = Lmin <= 4 ? 0.17 : Lmin <= 5.5 ? 0.20 : Lmin <= 6.5 ? 0.25 : 0.30;
    out.push({ tipo: "info", titulo: `Losa aligerada: h = ${hl.toFixed(2)} m`,
      texto: `Luz corta de ${Lmin.toFixed(2)} m ÷ 25 ≈ ${(Lmin / 25).toFixed(2)} m. Su peso propio es de unos ${pesoAligerado(hl)} kg/m² (va en la CM).`,
      art: "Regla práctica; la E.060 (9.6.2, Tabla 9.1) permite no verificar deflexiones si h ≥ L/21 en aligerados continuos en ambos extremos.", aplicar: { losaH: hl } });
    // vigas: h = L/10 a L/12, b >= 0.25
    const hv = r05(Lmax / 11), bv = Math.max(0.25, r05(hv / 2));
    out.push({ tipo: "info", titulo: `Vigas: ${bv.toFixed(2)} × ${hv.toFixed(2)} m`,
      texto: `Luz mayor ${Lmax.toFixed(2)} m: h entre L/12 y L/10 (${(Lmax / 12).toFixed(2)}–${(Lmax / 10).toFixed(2)} m). Ancho ≥ 0,25 m y cerca de h/2.`,
      art: "Regla práctica; ancho mínimo de 25 cm para vigas de sistemas sismorresistentes (E.060, cap. 21).", aplicar: { vigB: bv, vigH: hv } });
    // columnas: P = 1 t/m² × área tributaria × pisos; A = P / (0,45 f'c) centrales y P / (0,35 f'c) perimetrales
    const fc = st.fc;
    const tribC = (Math.max(...lx)) * (Math.max(...ly));
    const tribE = tribC / 2;
    const Pc = 1.0 * tribC * st.pisos.n, Pe = 1.0 * tribE * st.pisos.n;
    const Ac = Pc * 1000 / (0.45 * fc), Ae = Pe * 1000 / (0.35 * fc);
    const lc = r05(Math.sqrt(Math.max(Ac, Ae)) / 100);
    const lcol = Math.max(0.30, lc);
    out.push({ tipo: "info", titulo: `Columnas: ${lcol.toFixed(2)} × ${lcol.toFixed(2)} m (por carga de gravedad)`,
      texto: `Central: P ≈ 1 t/m² × ${tribC.toFixed(1)} m² × ${st.pisos.n} pisos = ${Pc.toFixed(0)} t → A = P/(0,45 f'c) = ${Ac.toFixed(0)} cm². ` +
        `Perimetral: P ≈ ${Pe.toFixed(0)} t → A = P/(0,35 f'c) = ${Ae.toFixed(0)} cm². En pórticos, la deriva suele pedir columnas más grandes: el análisis te lo dirá.`,
      art: "Regla práctica de predimensionamiento (carga de servicio de 1 t/m² por piso).", aplicar: { colB: lcol, colH: lcol } });
    return out;
  }

  // Densidad de placas para que el sistema sea de muros: Vbasal ≈ Σ Vc de los muros
  function placasNecesarias(r, fc, t) {
    const vc = 0.53 * Math.sqrt(fc) * 10; // t/m² (0,53√f'c en kg/cm²)
    return r.dirs.map(D => {
      const V = D.coef * r.P * D.R / 6; // cortante estático con R0 = 6 (muros)
      const A = V / vc;
      return { dir: D.d ? "Y" : "X", V, A, L: A / t };
    });
  }

  // Recomendaciones después del análisis
  function despues(st, r) {
    const q = r.q, out = [], A = q.norma === "2026" ? root.E030.ART["2026"] : root.E030.ART["2018"];
    const lim = q.derivaLim;
    // masa participativa
    const last = r.modes[r.modes.length - 1];
    if (last.SumUX < 0.9 || last.SumUY < 0.9)
      out.push({ tipo: "warn", titulo: "Faltan modos", texto: `Con ${r.modes.length} modos la masa participativa es ${(100 * last.SumUX).toFixed(0)}% en X y ${(100 * last.SumUY).toFixed(0)}% en Y; la norma pide al menos 90%.`, art: "E.030, análisis modal espectral: masa participativa ≥ 90%" });
    else
      out.push({ tipo: "ok", titulo: "Masa participativa suficiente", texto: `${r.modes.length} modos suman ${(100 * last.SumUX).toFixed(0)}% en X y ${(100 * last.SumUY).toFixed(0)}% en Y (≥ 90%).`, art: "E.030, análisis modal espectral" });

    // derivas
    for (const [d, key] of [["X", "inX"], ["Y", "inY"]]) {
      const mx = Math.max(...r.derivas.map(x => x[key]));
      const piso = r.derivas.find(x => x[key] === mx).piso;
      if (mx <= lim) {
        out.push({ tipo: "ok", titulo: `Deriva en ${d}: cumple`, texto: `Máxima ${mx.toFixed(4)} en ${piso}, menor que ${lim} (${(100 * mx / lim).toFixed(0)}% del límite).` +
          (mx < 0.5 * lim ? " Hay bastante holgura: podrías reducir secciones y ahorrar concreto." : ""), art: `E.030, ${A.deriva} y ${A.limDeriva}` });
      } else {
        const f = mx / lim; // rigidez necesaria ~ proporcional
        const D = r.dirs[d === "X" ? 0 : 1];
        const sug = [];
        if (D.fracMuros < 0.2) {
          const c = st.secc.col, ladoX = d === "X" ? c[0] : c[1];
          // en pórticos la rigidez crece con la inercia de columnas y vigas; aproximación: lado ∝ f^(1/3)
          sug.push(`aumentar la columna en la dirección ${d} de ${ladoX.toFixed(2)} m a ≈ ${r05(ladoX * Math.cbrt(f)).toFixed(2)} m (y las vigas en proporción)`);
          const pl = placasNecesarias(r, st.fc, st.secc.placaT)[d === "X" ? 0 : 1];
          sug.push(`o agregar placas en ${d}: unos ${pl.L.toFixed(1)} m de muro de ${st.secc.placaT} m en total, repartidos simétricamente (sistema de muros)`);
        } else {
          sug.push(`alargar o engrosar las placas en ${d}, o agregar más, repartidas simétricamente (se necesita ≈ ${f.toFixed(1)} veces la rigidez actual)`);
        }
        out.push({ tipo: "bad", titulo: `Deriva en ${d}: NO cumple`, texto: `Máxima ${mx.toFixed(4)} en ${piso}, mayor que ${lim} (${(100 * mx / lim).toFixed(0)}% del límite). Te sugiero ${sug.join("; ")}.`, art: `E.030, ${A.deriva} y ${A.limDeriva}` });
      }
    }

    // sistema estructural
    for (const s of r.sistema) {
      const pct = (100 * s.fracMuros).toFixed(0);
      if (s.calculado !== s.declarado)
        out.push({ tipo: "warn", titulo: `Sistema en ${s.dir}: declaraste ${s.declarado.toLowerCase()}, pero se comporta como ${s.calculado.toLowerCase()}`,
          texto: `Las placas toman ${pct}% del cortante basal. Cambia el sistema en ${s.dir} a ${s.calculado} (R0 = ${root.E030.R0[s.calculado]}) en el paso 1 y vuelve a analizar.`, art: `E.030, ${A.sistema}` });
      else out.push({ tipo: "ok", titulo: `Sistema en ${s.dir}: ${s.calculado.toLowerCase()}`, texto: `Las placas toman ${pct}% del cortante basal, coherente con lo declarado (R0 = ${root.E030.R0[s.calculado]}).`, art: `E.030, ${A.sistema}` });
    }

    // irregularidades
    const pres = r.irreg.lista.filter(v => v.presente);
    if (!pres.length) out.push({ tipo: "ok", titulo: "Estructura regular", texto: "No se detectaron irregularidades: Ia = Ip = 1.", art: `E.030, ${A.altura} y ${A.planta}` });
    for (const v of pres) {
      const consejo = {
        torsion: "Reubica las placas o columnas grandes para que el centro de rigidez se acerque al centro de masa (simetría en planta).",
        torsion_ext: "La torsión es muy fuerte: pon placas en los lados opuestos del edificio, no solo en uno.",
        esquinas: "Si puedes, separa la planta en bloques rectangulares con una junta sísmica.",
        rigidez: "El piso es mucho más flexible que el de arriba: rigidízalo (columnas más grandes o placas) o iguala alturas.",
        rigidez_ext: "Piso blando extremo: es una falla típica en sismos. Rigidiza ese piso.",
        masa: "Revisa si hay un uso pesado (almacén, piscina) y redistribúyelo.",
        geom_vert: "Los retranqueos fuertes concentran esfuerzos; considéralo en el diseño.",
        discont: "Evita elementos que nacen sobre vigas (transferencias).",
        diafragma: "Las aberturas grandes debilitan la losa como diafragma.",
      }[v.clave] || "";
      out.push({ tipo: "warn", titulo: `Irregularidad: ${v.nombre} (factor ${v.factor})`, texto: `${v.detalle.join("; ")}. ${consejo}`, art: `E.030, ${v.tabla === "Altura" ? A.altura : A.planta}` });
    }
    r.restricciones.forEach(t => out.push({ tipo: "bad", titulo: "Restricción de la norma", texto: t, art: `E.030, ${A.restric}` }));

    // escalamiento
    for (const D of r.dirs) {
      const d = D.d ? "Y" : "X", frac = q.regular ? 0.8 : 0.9;
      out.push({ tipo: D.factorEscala > 1 ? "warn" : "info", titulo: `Cortante dinámico en ${d}: ${(100 * D.Vdin / D.Vest).toFixed(0)}% del estático`,
        texto: D.factorEscala > 1 ? `Es menor que el ${frac * 100}% exigido: para diseñar, multiplica las fuerzas del sismo dinámico en ${d} por ${D.factorEscala.toFixed(3)} (las derivas no se escalan).`
          : `Supera el ${frac * 100}% del estático: no hace falta escalar las fuerzas de diseño.`, art: `E.030, ${A.escala}` });
    }
    return out;
  }

  // Combinaciones de diseño E.060 (art. 9.2) con el sismo de la E.030
  function combinaciones(q) {
    const c = ["1,4 CM + 1,7 CV"];
    const S = q.dir30 ? ["(SX + 0,3 SY)", "(SY + 0,3 SX)"] : ["SX", "SY"];
    for (const s of S) { c.push(`1,25 (CM + CV) ± ${s}`); c.push(`0,9 CM ± ${s}`); }
    return c;
  }

  // Explicaciones cortas para cada resultado
  const EXPLICA = {
    T: "Periodo fundamental: el tiempo que tarda el edificio en dar una oscilación completa. Más alto = más flexible.",
    V: "Cortante basal: la fuerza horizontal total que el sismo le aplica al edificio en la base.",
    deriva: "Deriva: desplazamiento relativo entre dos pisos dividido entre la altura del piso. Se multiplica por 0,75·R (regular) o 0,85·R (irregular) para pasarla a inelástica.",
    modos: "Cada modo es una forma natural de vibrar. La masa participativa dice cuánto del edificio se mueve en ese modo en cada dirección.",
    irreg: "Las irregularidades reducen R con los factores Ia (altura) e Ip (planta): el edificio se diseña para más fuerza.",
  };

  root.Asistente = { USOS, predim, despues, combinaciones, EXPLICA, pesoAligerado, placasNecesarias };
})(typeof window !== "undefined" ? window : globalThis);
