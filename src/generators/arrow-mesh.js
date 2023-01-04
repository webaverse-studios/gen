import * as THREE from 'three';

const arrowGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1, -1);
  shape.lineTo(0, 2);
  shape.lineTo(-1, -1);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.25,
    bevelEnabled: false,
  });
  geometry.translate(0, 1, 0);
  geometry.rotateX(-Math.PI / 2);
  const s = 0.1;
  geometry.scale(s, s, s);

  return geometry;
})();
export class ArrowMesh extends THREE.Mesh {
  constructor() {
    const material = new THREE.MeshPhongMaterial({
      color: 0xFF0000,
    });

    super(arrowGeometry, material);
  }
}