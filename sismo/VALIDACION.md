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
| 02c placas (muros) | T1 (s) | 0.177 | 0.172 | 2.9% |
|  | T3 (s) | 0.121 | 0.118 | 2.4% |
|  | Peso sísmico (t) | 780.80 | 780.79 | 0.0% |
|  | V estático X (t) | 161.04 | 161.04 | -0.0% |
|  | V dinámico X (t) | 125.71 | 124.15 | 1.3% |
|  | Deriva máx. X | 0.0011 | 0.0011 | 0.8% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 02d placas (dual) | T1 (s) | 0.174 | 0.169 | 3.1% |
|  | T3 (s) | 0.119 | 0.116 | 2.8% |
|  | Peso sísmico (t) | 788.48 | 788.47 | 0.0% |
|  | V estático X (t) | 139.39 | 139.39 | 0.0% |
|  | V dinámico X (t) | 110.83 | 109.39 | 1.3% |
|  | Deriva máx. X | 0.0010 | 0.0010 | 4.8% |
|  | Ip | 1.00 | 1.00 | 0.0% |
| 04 torsión (placas en un borde) | T1 (s) | 0.612 | 0.611 | 0.2% |
|  | T3 (s) | 0.192 | 0.192 | 0.1% |
|  | Peso sísmico (t) | 708.80 | 708.79 | 0.0% |
|  | V estático X (t) | 204.76 | 205.05 | -0.1% |
|  | V dinámico X (t) | 179.45 | 179.69 | -0.1% |
|  | Deriva máx. X | 0.0148 | 0.0148 | 0.3% |
|  | Ip | 0.60 | 0.60 | 0.0% |


**Qué muestra:** en pórticos (casos 01, 02b, 03 y 04) el motor reproduce a ETABS prácticamente exacto: periodos, peso, cortantes, derivas, la irregularidad de esquinas entrantes (Ip = 0,9) y la torsional extrema (Ip = 0,6, Δmax/Δprom = 1,93 frente a 1,94).

**Placas:** el prototipo modela cada placa como una columna ancha con brazos rígidos (método de la columna ancha), y ETABS la modela con elementos lámina. La placa sale alrededor de 3% más flexible: el periodo es ~3% mayor y el cortante dinámico ~1% mayor. Para un prototipo es aceptable, y en la fase 2 se puede cambiar a un elemento lámina para que coincida exacto.
