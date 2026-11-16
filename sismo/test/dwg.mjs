// Lee test/ejemplo.dwg (formato AutoCAD 2018, escrito con acad-ts) con dwg/entrada.js y lo importa.
// Requiere instalar antes las dependencias del lector: sh dwg/construir.sh
import fs from "fs";
import { leer } from "../dwg/entrada.js";
await import("../src/plano.js"); await import("../src/e030.js"); await import("../src/irreg.js"); await import("../src/dxf.js");
const { Plano: Pl, DXF: D, Irreg: I } = globalThis;
const b = fs.readFileSync(new URL("./ejemplo.dwg", import.meta.url));
const d = leer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
console.log("versión", d.version, "unidades", d.unidades, d.capas);
const roles = {}; for (const c in d.capas) roles[c] = D.rolSugerido(c);
const { plano } = D.importar(d, roles, { escala: 0.01, viga: [0.3, 0.6], vigasPorEjes: true, losas: true });
console.log("col", plano.columnas.length, "vig", plano.vigas.length, "pla", plano.placas.length, "losas", plano.losas.length);
const { model } = Pl.aModelo(plano, { n: 4, h1: 3.2, h: 2.8 }, 210, { cm: 500, cmRoof: 400, cv: 200, cvRoof: 100 }, true);
const r = I.analizarTodo(model, { zona: 4, suelo: "S2", categoria: "C", sistemaX: "DUAL", sistemaY: "DUAL" });
console.log("T1", r.modes[0].T.toFixed(3), "P", r.P.toFixed(1));
