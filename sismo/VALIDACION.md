# Validación del motor de SismoPaso contra ETABS 22

Mismos edificios que la batería de casos del script con la API de ETABS (`etabs_auto\casos`), con E.030-2026, zona 4, suelo S2, categoría C, f'c = 210 kg/cm², Ec = 15000·√f'c, secciones brutas, base empotrada y diafragma rígido. Los valores de ETABS vienen de sus informes (las derivas están redondeadas a 4 decimales, así que su diferencia porcentual es aproximada). Para regenerar la tabla: `node test/validacion.js`.

| Caso | Magnitud | SismoPaso | ETABS 22 | Diferencia |
|---|---|---|---|---|
| 02b pórticos 60x60 | T1 (s) | 0.382 | 0.382 | 0.1% |
|  | T3 (s) | 0.334 | 0.334 | 0.1% |
|  | Peso sísmico (t) | 787.59 | 787.59 | 0.0% |
|  | V estático X (t) | 121.83 | 121.83 | 0.0% |
|  | V dinámico X (t) | 104.10 | 104.10 | -0.0% |
|  | Deriva máx. X | 0.0055 | 0.0055 | -0.4% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 01 pórticos 40x40 (S=1.05) | T1 (s) | 0.610 | 0.610 | 0.1% |
|  | T3 (s) | 0.531 | 0.531 | -0.1% |
|  | Peso sísmico (t) | 660.80 | 660.80 | -0.0% |
|  | V estático X (t) | 95.90 | 95.90 | -0.0% |
|  | V dinámico X (t) | 84.67 | 84.70 | -0.0% |
|  | Deriva máx. X | 0.0127 | 0.0127 | -0.0% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 03 planta en L | T1 (s) | 0.563 | 0.563 | -0.0% |
|  | T3 (s) | 0.512 | 0.512 | 0.1% |
|  | Peso sísmico (t) | 393.78 | 393.77 | 0.0% |
|  | V estático X (t) | 67.68 | 67.68 | 0.0% |
|  | V dinámico X (t) | 59.05 | 59.05 | -0.0% |
|  | Deriva máx. X | 0.0147 | 0.0147 | 0.3% |
|  | Ip | 0.90 | 0.90 | 0.0% |
| 02c placas (muros) | T1 (s) | 0.174 | 0.172 | 1.0% |
|  | T3 (s) | 0.119 | 0.118 | 0.5% |
|  | Peso sísmico (t) | 780.80 | 780.79 | 0.0% |
|  | V estático X (t) | 161.04 | 161.04 | -0.0% |
|  | V dinámico X (t) | 124.87 | 124.15 | 0.6% |
|  | Deriva máx. X | 0.0011 | 0.0011 | -2.3% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 02d placas (dual) | T1 (s) | 0.170 | 0.169 | 0.8% |
|  | T3 (s) | 0.117 | 0.116 | 0.4% |
|  | Peso sísmico (t) | 788.48 | 788.47 | 0.0% |
|  | V estático X (t) | 139.39 | 139.39 | 0.0% |
|  | V dinámico X (t) | 109.91 | 109.39 | 0.5% |
|  | Deriva máx. X | 0.0010 | 0.0010 | 1.3% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 04 torsión (placas en un borde) | T1 (s) | 0.612 | 0.611 | 0.2% |
|  | T3 (s) | 0.192 | 0.192 | 0.1% |
|  | Peso sísmico (t) | 708.80 | 708.79 | 0.0% |
|  | V estático X (t) | 204.75 | 205.05 | -0.1% |
|  | V dinámico X (t) | 179.44 | 179.69 | -0.1% |
|  | Deriva máx. X | 0.0148 | 0.0148 | 0.3% |
|  | Ip | 0.60 | 0.60 | 0.0% |

Placas: columna ancha (modelo anterior) frente a lámina (modelo actual), periodo T1:

| Caso | Columna ancha | ETABS 22 | Dif. | Lámina | ETABS 22 | Dif. |
|---|---|---|---|---|---|---|
| 02c placas (muros) | 0.177 | 0.172 | 2.9% | 0.174 | 0.172 | 1.0% |
| 02d placas (dual) | 0.174 | 0.169 | 3.1% | 0.170 | 0.169 | 0.8% |
| 04 torsión (placas en un borde) | 0.612 | 0.611 | 0.2% | 0.612 | 0.611 | 0.2% |

**Qué muestra:** en pórticos (casos 01, 02b, 03 y 04) el motor reproduce a ETABS prácticamente exacto: periodos, peso, cortantes, derivas, la irregularidad de esquinas entrantes (Ip = 0,9) y la torsional extrema (Ip = 0,6, Δmax/Δprom = 1,93 frente a 1,94).

**Placas:** desde noviembre de 2026 cada placa se modela como lámina: membranas cuadriláteras con modos incompatibles (Q6, Wilson-Taylor), una por piso a lo alto y de unos 0,75 m a lo largo, y una columna central solo para la flexión fuera del plano. La diferencia con ETABS bajó de ~3% (columna ancha) a ~1% en el periodo y ~0,6% en el cortante dinámico. Afinar la malla no cambia el resultado (converge). La columna ancha sigue disponible como opción, y es la que se usa con interacción suelo-estructura.
