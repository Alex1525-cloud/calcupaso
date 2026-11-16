/* Visor 3D (Three.js): modelo, formas de modo animadas y derivas por piso. */
(function (root) {
  "use strict";
  const V = {};
  let renderer, scene, camera, controls, el, solidos, lineas, segs = [], anim = null, t0 = 0, centro = [0, 0, 0], tam = 10;

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
  const P = (x, y, z) => new THREE.Vector3(x, z, -y); // planta (x, y) y altura z -> Three (Y arriba)

  V.init = function (contenedor) {
    el = contenedor;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(30, 60, 40); scene.add(dl);
    new ResizeObserver(resize).observe(el);
    resize(); tema(); loop();
  };
  function resize() {
    const w = el.clientWidth || 300, h = el.clientHeight || 300;
    renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function tema() { scene.background = new THREE.Color(css("--surface2")); }
  V.tema = tema;

  function caja(a, b, ancho, alto, color, opac) {
    // prisma entre a y b (Vector3), sección ancho × alto (alto en la vertical de la viga o en Y de la columna)
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = new THREE.BoxGeometry(ancho, L, alto);
    const m = new THREE.MeshLambertMaterial({ color, transparent: opac < 1, opacity: opac });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }

  /* modelo: el mismo objeto que recibe el solver; z: cotas de cada nivel */
  V.dibujar = function (model, z) {
    if (solidos) scene.remove(solidos);
    if (lineas) scene.remove(lineas);
    solidos = new THREE.Group(); segs = [];
    const sec = model.sections, nd = model.nodes;
    const cCol = new THREE.Color(css("--col")), cViga = new THREE.Color(css("--beam")), cMuro = new THREE.Color(css("--wall")), cLosa = new THREE.Color(css("--slab"));
    for (const c of model.columns) for (let k = c.p1; k <= c.p2; k++) {
      const [x, y] = nd[c.node], s = sec[c.sec];
      const m = caja(P(x, y, z[k - 1]), P(x, y, z[k]), s.b, s.h, cCol, 1);
      m.userData = { tipo: "col", k }; solidos.add(m);
      segs.push([x, y, k - 1, x, y, k]);
    }
    for (const v of model.beams) for (let k = v.p1; k <= v.p2; k++) {
      const [x1, y1] = nd[v.i], [x2, y2] = nd[v.j], s = sec[v.sec];
      const zc = z[k] - s.h / 2;
      const a = P(x1, y1, zc), b = P(x2, y2, zc);
      const d = new THREE.Vector3().subVectors(b, a), L = d.length();
      const g = new THREE.BoxGeometry(L, s.h, s.b);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: cViga }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.rotation.y = Math.atan2(-(d.z), d.x);
      m.userData = { tipo: "viga", k }; solidos.add(m);
      segs.push([x1, y1, k, x2, y2, k]);
    }
    for (const w of model.walls || []) for (let k = w.p1; k <= w.p2; k++) {
      const [x1, y1] = nd[w.i], [x2, y2] = nd[w.j], t = sec[w.sec].b;
      const L = Math.hypot(x2 - x1, y2 - y1), h = z[k] - z[k - 1];
      const g = new THREE.BoxGeometry(L, h, t);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: cMuro, transparent: true, opacity: 0.92 }));
      m.position.copy(P((x1 + x2) / 2, (y1 + y2) / 2, (z[k - 1] + z[k]) / 2));
      m.rotation.y = Math.atan2(y2 - y1, x2 - x1);
      m.userData = { tipo: "muro", k }; solidos.add(m);
      segs.push([x1, y1, k - 1, x1, y1, k], [x2, y2, k - 1, x2, y2, k], [x1, y1, k, x2, y2, k], [x1, y1, k - 1, x2, y2, k], [x2, y2, k - 1, x1, y1, k]);
    }
    for (const s of model.slabs) for (let k = s.p1; k <= s.p2; k++) {
      const pts = s.nodes.map(n => nd[n]);
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ShapeGeometry(sh);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: cLosa, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = z[k];
      m.userData = { tipo: "losa", k }; solidos.add(m);
    }
    // base
    const xs = Object.values(nd).map(p => p[0]), ys = Object.values(nd).map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const grid = new THREE.GridHelper(Math.max(x1 - x0, y1 - y0) * 2 + 10, 20, new THREE.Color(css("--border")), new THREE.Color(css("--border")));
    grid.position.set((x0 + x1) / 2, 0, -(y0 + y1) / 2); solidos.add(grid);
    scene.add(solidos);
    // líneas para la deformada
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs.length * 6), 3));
    lineas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(css("--accent")) }));
    lineas.visible = false; scene.add(lineas);
    V.z = z;
    const H = z[z.length - 1];
    centro = [(x0 + x1) / 2, (y0 + y1) / 2, H / 2]; tam = Math.max(x1 - x0, y1 - y0, H);
    if (!V._camOk) { V.vistaInicial(); V._camOk = true; }
  };

  V.vistaInicial = function () {
    const c = P(...centro);
    controls.target.copy(c);
    camera.position.set(c.x + tam * 1.5, c.y + tam * 0.9, c.z + tam * 1.7);
    controls.update();
  };

  // Animar un modo: niveles = [{xc, yc}], phi = vector 3N (ux, uy, θ por nivel)
  V.modo = function (niveles, phi, escala) {
    if (!phi) { anim = null; lineas.visible = false; solidos.children.forEach(m => { if (m.material && m.userData.tipo !== "losa") { m.material.transparent = m.userData.tipo === "muro"; m.material.opacity = m.userData.tipo === "muro" ? 0.92 : 1; } }); return; }
    // amplitud: el mayor desplazamiento de un punto = escala × 10% de la altura
    let mx = 1e-12;
    for (const s of segs) for (const [x, y, k] of [[s[0], s[1], s[2]], [s[3], s[4], s[5]]]) {
      if (!k) continue; const i = 3 * (k - 1), L = niveles[k - 1];
      mx = Math.max(mx, Math.hypot(phi[i] - (y - L.yc) * phi[i + 2], phi[i + 1] + (x - L.xc) * phi[i + 2]));
    }
    anim = { niveles, phi, amp: escala * 0.12 * tam / mx };
    lineas.visible = true; t0 = performance.now();
    solidos.children.forEach(m => { if (m.material && m.userData.tipo && m.userData.tipo !== "losa") { m.material.transparent = true; m.material.opacity = 0.35; } });
  };

  V.colorDeriva = function (derivas, lim) {
    const ok = new THREE.Color(css("--ok")), warn = new THREE.Color(css("--warn")), bad = new THREE.Color(css("--bad"));
    solidos.children.forEach(m => {
      const u = m.userData; if (!u || (u.tipo !== "col" && u.tipo !== "muro")) return;
      const d = derivas[u.k - 1]; if (!d) return;
      const r = Math.max(d.inX, d.inY) / lim;
      m.material.color.copy(r > 1 ? bad : r > 0.8 ? warn : ok);
    });
  };
  V.colorNormal = function () {
    const c = { col: new THREE.Color(css("--col")), muro: new THREE.Color(css("--wall")), viga: new THREE.Color(css("--beam")), losa: new THREE.Color(css("--slab")) };
    solidos && solidos.children.forEach(m => { const t = m.userData && m.userData.tipo; if (c[t]) m.material.color.copy(c[t]); });
  };

  function loop() {
    requestAnimationFrame(loop);
    if (anim && lineas) {
      const s = Math.sin((performance.now() - t0) / 1000 * 2 * Math.PI * 0.6) * anim.amp;
      const a = lineas.geometry.attributes.position.array;
      const z = V.z;
      segs.forEach((g, i) => {
        for (let e = 0; e < 2; e++) {
          const x = g[3 * e], y = g[3 * e + 1], k = g[3 * e + 2];
          let dx = 0, dy = 0;
          if (k) { const j = 3 * (k - 1), L = anim.niveles[k - 1]; dx = anim.phi[j] - (y - L.yc) * anim.phi[j + 2]; dy = anim.phi[j + 1] + (x - L.xc) * anim.phi[j + 2]; }
          const p = P(x + s * dx, y + s * dy, z[k]);
          a.set([p.x, p.y, p.z], 6 * i + 3 * e);
        }
      });
      lineas.geometry.attributes.position.needsUpdate = true;
    }
    controls && controls.update();
    renderer && renderer.render(scene, camera);
  }

  V.captura = () => renderer.domElement.toDataURL("image/png");
  root.Visor = V;
})(window);
