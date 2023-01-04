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