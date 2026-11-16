# SismoPaso: análisis sísmico E.030-2026 en el navegador

Prototipo educativo de un programa tipo ETABS, pensado para estudiantes: dibujas la planta, ves el edificio en 3D y el asistente te dice qué cumple, qué no y qué cambiar, citando la norma.

- **Motor propio** (`src/solver.js`): pórtico 3D con deformación por corte, diafragma rígido por piso, condensación estática y análisis modal. Las placas se modelan como columna ancha con brazos rígidos.
- **Norma** (`src/e030.js`, `src/irreg.js`): espectro E.030-2026 (con la opción 2018), cortante estático y dinámico, escalamiento, derivas con excentricidad accidental, irregularidades (Tablas 11 y 12), sistema estructural según el reparto del cortante y restricciones (Tabla 13).
- **Asistente** (`src/asistente.js`): predimensionamiento, sobrecargas E.020 según el uso, combinaciones E.060 y recomendaciones después del análisis.
- **Editor de planta tipo AutoCAD** (`src/cad.js`, `src/plano.js`): columnas, vigas, placas, losas y ejes con imán, orto, coordenadas `x,y`, `@dx,dy` y `@L<ángulo`, deshacer y losas automáticas. Cada elemento tiene su propia sección.
- **Importar DXF** (`src/dxf.js`): lee capas, líneas, polilíneas y bloques; eliges qué capa es de columnas, placas o ejes, y crea las vigas sobre los ejes y las losas en los paños cerrados.
- **Visor 3D** (`src/visor.js`, Three.js r128 en `lib/`): modos animados y derivas por piso con colores.

No necesita servidor: abre `index.html` o publícalo en GitHub Pages. Validación contra ETABS en [VALIDACION.md](VALIDACION.md). Pruebas: `node test/validacion.js`.

> Prototipo educativo: no reemplaza el criterio ni la firma de un ingeniero.
