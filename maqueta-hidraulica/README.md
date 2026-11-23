# Red hidráulica de un edificio (maqueta 3D)

Modelo 3D interactivo de la maqueta de red hidráulica del proyecto integrador de Física (UNAB, Ingeniería Civil): depósito, bomba de 12 V, dos ramales en paralelo, válvulas, caudalímetros YF-S201, tomas de presión, ESP32 y edificio de tres pisos.

- Ver en línea: https://alex1525-cloud.github.io/calcupaso/maqueta-hidraulica/
- `index.html` es un solo archivo que funciona sin internet (three.js r128 incluido).
- Cálculo teórico de fricción con Darcy–Weisbach y Colebrook, con los parámetros de la tabla 6 del informe. Resultados teóricos; la animación es ilustrativa.

Para regenerar `index.html` después de editar `src/`: `python3 src/build.py` (usa three.js de `../sismo/lib`).
