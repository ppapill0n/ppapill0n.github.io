import * as THREE from './vendor/three.module.min.js';

export const CAMERA_POSITION = Object.freeze([0, 1.6, 2.7]);
export const START_VIEW = Object.freeze({ yaw: -0.07, pitch: 0.095 });
const SLOTS = [[-2.7, 0, -2.7], [1.7, 0, -3.5], [3.25, 0, -0.3], [-3.1, 0, 0.4], [2.9, 0, 3.8], [-2.7, 0, 3.6]];

export function createRoom(canvas, { onProjection = () => {}, onContextLost = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe8cf');
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 80);
  camera.position.fromArray(CAMERA_POSITION);
  const room = new THREE.Group(), objects = new THREE.Group();
  scene.add(room, objects);
  const materials = new Set(), geometries = new Set(), textures = new Set();
  let frame = 0, disposed = false;
  const color = (hex, extra = {}) => {
    const material = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.86, ...extra });
    materials.add(material);
    return material;
  };
  // Generated grain only; no external images or network requests are needed.
  function grainTexture(seed, repeatX, repeatY) {
    const surface = document.createElement('canvas'); surface.width = 128; surface.height = 512;
    const ctx = surface.getContext('2d');
    let state = seed;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    ctx.fillStyle = '#d4bc95'; ctx.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 190; i++) {
      const x = random() * 128;
      ctx.strokeStyle = `rgba(80,48,23,${0.025 + random() * 0.08})`; ctx.lineWidth = random() * 1.2 + 0.3;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + random() * 8, 170, x - random() * 7, 330, x + random() * 4, 512); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); textures.add(texture); return texture;
  }
  const plaster = color('#f0e9d9'), trim = color('#4e6856'), wood = color('#bd9c75', { map: grainTexture(2, 1, 1) });
  const ceilingWood = color('#c2a985', { map: grainTexture(3, 1, 3) });
  const floorWood = color('#dfc39b', { map: grainTexture(6, 1, 1) });
  const darkWood = color('#745236'), brass = color('#b99551', { metalness: 0.65, roughness: 0.4 });
  const leaf = color('#50734b'), leafLight = color('#70905b'), soil = color('#493e2b'), pot = color('#b78560');
  function mesh(geometry, material, position, parent = room, shadow = true) {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, material); result.position.set(...position);
    result.castShadow = shadow; result.receiveShadow = true; parent.add(result); return result;
  }
  const box = (size, position, material, parent, shadow) => mesh(new THREE.BoxGeometry(...size), material, position, parent, shadow);
  function beam(a, b, width = 0.18, material = wood, parent = room) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), vector = end.clone().sub(start);
    const result = box([width, vector.length(), width], start.clone().add(end).multiplyScalar(0.5).toArray(), material, parent);
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()); return result;
  }
  function archPath(x, bottom, radius, spring, PathClass = THREE.Path) {
    const path = new PathClass(); path.moveTo(x - radius, bottom); path.lineTo(x + radius, bottom);
    path.lineTo(x + radius, spring); path.absarc(x, spring, radius, 0, Math.PI, false); path.lineTo(x - radius, bottom); return path;
  }
  function archFrame(x, bottom, radius, spring, z, material) {
    beam([x - radius, bottom, z], [x - radius, spring, z], 0.09, material);
    beam([x + radius, bottom, z], [x + radius, spring, z], 0.09, material);
    const points = Array.from({ length: 25 }, (_, index) => {
      const angle = index / 24 * Math.PI;
      return new THREE.Vector3(x + Math.cos(angle) * radius, spring + Math.sin(angle) * radius, z);
    });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.05, 8, false), material, [0, 0, 0]);
    box([radius * 2 + 0.2, 0.1, 0.35], [x, bottom, z + 0.03], material);
  }
  // Floor: real separated boards, instanced to keep draw calls low.
  box([9.3, 0.16, 10.3], [0, -0.12, 0], darkWood);
  const boardGeometry = new THREE.BoxGeometry(0.492, 0.06, 1); geometries.add(boardGeometry);
  const boardLayout = [];
  for (let col = 0; col < 18; col++) {
    let start = -5, row = 0;
    while (start < 4.999) {
      const length = Math.min(row === 0 ? 0.8 + col % 4 * 0.43 : 2.4, 5 - start);
      boardLayout.push({ col, row, center: start + length / 2, length }); start += length; row++;
    }
  }
  const boards = new THREE.InstancedMesh(boardGeometry, floorWood, boardLayout.length), matrix = new THREE.Matrix4();
  boardLayout.forEach(({ col, row, center, length }, index) => {
    matrix.compose(new THREE.Vector3(-4.25 + col * 0.5, -0.025, center), new THREE.Quaternion(), new THREE.Vector3(1, 1, length - 0.008));
    boards.setMatrixAt(index, matrix);
    boards.setColorAt(index, new THREE.Color().setHSL(0.09, 0.14, 0.79 + ((col * 7 + row * 13) % 9) / 75));
  });
  boards.receiveShadow = true; room.add(boards);
  // Far wall has two actual arched openings; the niche has a recessed backing.
  const front = new THREE.Shape(); front.moveTo(-4.5, 0); front.lineTo(4.5, 0); front.lineTo(4.5, 3.5); front.lineTo(0, 5.6); front.lineTo(-4.5, 3.5); front.closePath();
  front.holes.push(archPath(-1.7, 0.85, 0.78, 2.25), archPath(1.75, 0.85, 0.74, 2.25));
  mesh(new THREE.ExtrudeGeometry(front, { depth: 0.22, bevelEnabled: false, curveSegments: 24 }), plaster, [0, 0, -5.12]);
  const back = new THREE.Shape(); back.moveTo(-4.5, 0); back.lineTo(4.5, 0); back.lineTo(4.5, 3.5); back.lineTo(0, 5.6); back.lineTo(-4.5, 3.5); back.closePath();
  mesh(new THREE.ExtrudeGeometry(back, { depth: 0.2, bevelEnabled: false }), plaster, [0, 0, 5]);
  box([0.2, 3.5, 10], [4.6, 1.75, 0], plaster);
  // Left wall: a broad glazed opening and open French door into the courtyard.
  box([0.2, 0.45, 5.5], [-4.6, 3.275, -1.1], plaster);
  box([0.2, 3.5, 1.15], [-4.6, 1.75, -4.425], plaster);
  box([0.2, 3.5, 3.35], [-4.6, 1.75, 3.325], plaster);
  box([0.2, 0.55, 3.85], [-4.6, 0.275, -0.275], plaster);
  for (const z of [-3.85, -2.2, -0.92, 0.36, 1.65]) box([0.16, 3.03, 0.11], [-4.46, 1.52, z], trim);
  for (const y of [0.57, 1.5, 2.28, 3.02]) box([0.12, 0.075, 3.85], [-4.46, y, -0.275], trim);
  box([0.15, 0.1, 5.6], [-4.46, 3.03, -1.1], trim);
  const glass = color('#b9d9c1', { transparent: true, opacity: 0.11, roughness: 0.2, depthWrite: false });
  box([0.02, 2.4, 3.75], [-4.5, 1.8, -0.275], glass, room, false);
  // Door leaf swung outwards; the opening itself is unobstructed.
  const frenchDoor = new THREE.Group(); frenchDoor.position.set(-4.5, 0, -2.2); frenchDoor.rotation.y = 0.94; room.add(frenchDoor);
  for (const z of [0, -1.56]) box([0.09, 2.94, 0.09], [0, 1.5, z], trim, frenchDoor);
  for (const y of [0.08, 1.05, 2.05, 2.96]) box([0.09, 0.08, 1.6], [0, y, -0.78], trim, frenchDoor);
  box([0.025, 2.85, 1.5], [0, 1.5, -0.78], glass, frenchDoor, false);
  box([0.74, 0.38, 3.1], [-4.05, 0.21, -0.275], trim);
  box([0.83, 0.09, 3.23], [-4.05, 0.44, -0.275], wood);
  // Perimeter and the closed right-hand panel door.
  for (const z of [-4.88, 4.88]) box([9, 0.18, 0.09], [0, 0.09, z], trim);
  box([0.09, 0.18, 10], [4.44, 0.09, 0], trim);
  box([0.09, 0.18, 3.4], [-4.44, 0.09, 3.3], trim);
  box([0.12, 2.7, 1.52], [4.43, 1.35, -1.85], darkWood);
  box([0.13, 2.56, 1.36], [4.34, 1.28, -1.85], trim);
  for (const y of [0.66, 1.9]) {
    box([0.04, 1, 1.08], [4.26, y, -1.85], color('#294938'));
    for (const z of [-2.4, -1.3]) box([0.06, 1.1, 0.035], [4.22, y, z], trim);
  }
  mesh(new THREE.SphereGeometry(0.055, 12, 8), brass, [4.17, 1.3, -1.33]);
  // Sloped plank roof, ridge and substantial exposed rafters.
  const slope = Math.atan2(2.1, 4.5), slopeLength = Math.hypot(4.5, 2.1);
  for (const side of [-1, 1]) {
    const ceiling = box([slopeLength + 0.25, 0.15, 10.5], [side * 2.25, 4.58, 0], ceilingWood);
    ceiling.rotation.z = -side * slope;
    for (let i = 0; i < 13; i++) {
      const x = side * (i + 0.5) * 4.5 / 13;
      box([0.018, 0.025, 10], [x, 5.49 - Math.abs(x) * 2.1 / 4.5, 0], darkWood);
    }
    beam([side * 4.4, 3.35, -4.9], [side * 4.4, 3.35, 4.9], 0.24);
  }
  beam([0, 5.42, -5], [0, 5.42, 5], 0.28);
  for (const z of [-4.75, -1.7, 1.4, 4.6]) {
    beam([-4.4, 3.31, z], [0, 5.38, z], 0.23);
    beam([0, 5.38, z], [4.4, 3.31, z], 0.23);
    for (const side of [-1, 1]) beam([side * 4.38, 2.78, z], [side * 3.4, 3.75, z], 0.14);
  }
  archFrame(-1.7, 0.85, 0.78, 2.25, -4.86, trim);
  box([0.07, 2.12, 0.1], [-1.7, 1.93, -4.85], trim);
  box([1.52, 0.07, 0.1], [-1.7, 1.8, -4.85], trim);
  const windowLight = color('#c9d8ad', { emissive: '#9bba81', emissiveIntensity: 0.38 });
  mesh(new THREE.ShapeGeometry(archPath(-1.7, 0.85, 0.78, 2.25, THREE.Shape), 24), windowLight, [0, 0, -5.45], room, false);
  archFrame(1.75, 0.85, 0.74, 2.25, -4.95, plaster);
  mesh(new THREE.ShapeGeometry(archPath(1.75, 0.85, 0.74, 2.25, THREE.Shape), 24), color('#a69b7f'), [0, 0, -5.5]);
  for (const x of [1.02, 2.48]) box([0.06, 1.4, 0.48], [x, 1.55, -5.22], plaster);
  for (const y of [0.86, 1.48, 2.12]) box([1.47, 0.07, 0.5], [1.75, y, -5.13], wood);
  function sconce(x, y, z, facing = 0) {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = facing; room.add(group);
    box([0.12, 0.26, 0.05], [0, 0, 0], brass, group);
    beam([0, -0.06, 0], [0, -0.06, 0.16], 0.035, brass, group);
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 16, 1, true), color('#e7bc77', { emissive: '#ffb351', emissiveIntensity: 0.7, side: THREE.DoubleSide }), [0, 0.04, 0.16], group);
    const light = new THREE.PointLight('#ffcc81', 5, 3.3, 2); light.position.set(0, 0, 0.3); group.add(light);
  }
  sconce(-3.35, 2.15, -4.82); sconce(3.3, 2.15, -4.82); sconce(4.35, 2.2, 2.7, -Math.PI / 2); sconce(0, 2.3, 4.83, Math.PI);
  // A small actual courtyard, visible through the opening (not a panorama).
  const garden = new THREE.Group(); scene.add(garden);
  box([14, 0.1, 18], [-10, -0.12, -1], color('#7d8e5c'), garden);
  box([2.5, 0.08, 6], [-5.8, -0.04, 0], color('#b9b093'), garden);
  for (let i = 0; i < 6; i++) box([1.15, 0.04, 0.8], [-7.2 - i * 0.75, 0, 0.3 + Math.sin(i) * 0.2], color('#c9c2a2'), garden);
  function tree(x, z, scale) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); garden.add(group);
    mesh(new THREE.CylinderGeometry(0.07, 0.13, 2.6, 8), darkWood, [0, 1.3, 0], group);
    for (const [dx, dy, dz, radius] of [[0, 2.8, 0, 1.15], [-0.6, 2.3, 0.2, 0.9], [0.65, 2.5, -0.15, 0.85]]) {
      const foliage = mesh(new THREE.IcosahedronGeometry(radius, 2), dx < 0 ? leafLight : leaf, [dx, dy, dz], group);
      foliage.scale.y = 1.15;
    }
  }
  for (const [x, z, scale] of [[-8.7, -4.7, 1.4], [-10, -1.5, 1.2], [-8.7, 3.6, 1.1], [-12.5, 1, 1.8], [-7, -6.1, 1]]) tree(x, z, scale);
  const sky = new THREE.HemisphereLight('#fff0d4', '#c0ab7c', 2.1); scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff0d6', 3.3); sun.position.set(-9, 5.4, -4); sun.target.position.set(2, 0, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 35;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035; sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true; scene.add(sun, sun.target);
  // Soft ambient fill through the courtyard opening, without another shadow pass.
  const fill = new THREE.DirectionalLight('#e8efca', 0.65); fill.position.set(-4, 2, 1); scene.add(fill);

  function plant(parent) {
    mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.39, 16), pot, [0, 0.2, 0], parent);
    mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 16), soil, [0, 0.4, 0], parent);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, height = 0.8 + (i % 3) * 0.15, x = Math.cos(a) * 0.29, z = Math.sin(a) * 0.29;
      beam([0, 0.4, 0], [x, height, z], 0.018, leaf, parent);
      const blade = mesh(new THREE.SphereGeometry(0.16, 10, 6), i % 2 ? leaf : leafLight, [x, height, z], parent);
      blade.scale.set(0.7, 1.6, 0.32); blade.rotation.z = -x;
    }
  }
  const outsidePot = new THREE.Group(); outsidePot.position.set(-5.1, 0, -0.35); garden.add(outsidePot); plant(outsidePot);
  const objectMaterials = [color('#9eaa8e'), color('#bd8c65'), color('#d3b876'), color('#647c71')];
  const gameCream = color('#e1d3a9'), gameInk = color('#334a3c');
  const groupItems = new Map();
  function clearObjects() {
    for (const group of [...objects.children]) {
      group.traverse(item => { if (item.isMesh) { item.geometry.dispose(); geometries.delete(item.geometry); } });
      objects.remove(group);
    }
    groupItems.clear();
  }
  function setObjects(items) {
    clearObjects();
    for (const item of items) {
      const group = new THREE.Group(); group.position.set(...SLOTS[item.slot]); objects.add(group);
      group.userData.objectId = item.id; groupItems.set(item.id, { group, item });
      if (item.type === 'plant') plant(group);
      else if (item.type === 'books') {
        box([1.12, 0.09, 0.62], [0, 0.48, 0], wood, group);
        for (const x of [-0.47, 0.47]) box([0.08, 0.44, 0.54], [x, 0.22, 0], wood, group);
        for (let i = 0; i < 5; i++) box([0.11 + i % 2 * 0.02, 0.27 + i % 3 * 0.035, 0.26], [-0.28 + i * 0.13, 0.68, 0], objectMaterials[i % 4], group);
      } else {
        box([1, 0.09, 0.78], [0, 0.66, 0], wood, group);
        for (const x of [-0.4, 0.4]) for (const z of [-0.3, 0.3]) box([0.065, 0.62, 0.065], [x, 0.31, z], trim, group);
        box([0.58, 0.035, 0.49], [0, 0.72, 0], gameCream, group);
        for (let i = 0; i < 5; i++) {
          box([0.5, 0.003, 0.007], [0, 0.741, -0.2 + i * 0.1], gameInk, group);
          box([0.007, 0.003, 0.4], [-0.2 + i * 0.1, 0.741, 0], gameInk, group);
        }
        for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.037, 10, 6), i % 2 ? gameCream : gameInk, [-0.1 + i % 3 * 0.1, 0.76, -0.1 + Math.floor(i / 3) * 0.1], group).scale.y = 0.45;
      }
    }
    sun.shadow.needsUpdate = true; requestRender();
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Include architecture so objects cannot be picked through walls or shelves.
    const hit = raycaster.intersectObjects([room, objects], true).find(result => result.object.material !== glass);
    let object = hit?.object;
    while (object && !object.userData.objectId) object = object.parent;
    return object?.userData.objectId ?? null;
  }
  function projections() {
    return [...groupItems].map(([id, { group }]) => {
      const world = group.position.clone().add(new THREE.Vector3(0, 1.38, 0));
      const point = world.clone().project(camera);
      const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
      return { id, x: (point.x + 1) * canvas.clientWidth / 2, y: (1 - point.y) * canvas.clientHeight / 2,
        visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.96 && Math.abs(point.y) < 0.9 && world.sub(camera.position).dot(forward) > 0 };
    });
  }
  function render() { frame = 0; if (disposed || document.hidden) return; renderer.render(scene, camera); onProjection(projections()); }
  function requestRender() { if (!frame && !disposed) frame = requestAnimationFrame(render); }
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.fov = width < 650 ? 78 : 68; camera.updateProjectionMatrix(); requestRender();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const visibility = () => { if (!document.hidden) requestRender(); };
  const contextLost = event => { event.preventDefault(); onContextLost(); };
  document.addEventListener('visibilitychange', visibility); canvas.addEventListener('webglcontextlost', contextLost);
  resize();
  return {
    setObjects, pick,
    look(direction) { camera.lookAt(camera.position.clone().add(new THREE.Vector3(direction.x, direction.y, direction.z))); requestRender(); },
    inspect() { return { camera: camera.position.toArray(), direction: camera.getWorldDirection(new THREE.Vector3()).toArray(), objects: groupItems.size,
      geometries: renderer.info.memory.geometries, drawCalls: renderer.info.render.calls, projections: projections() }; },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); canvas.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); renderer.dispose();
    },
  };
}
