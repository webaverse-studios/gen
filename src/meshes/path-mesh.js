import * as THREE from 'three';
import {
  StreetLineGeometry,
} from '../geometries/StreetGeometry.js';

export class PathMesh extends THREE.Mesh {
  constructor(splinePoints) {
    const numPoints = splinePoints.length;

    const curve = new THREE.CatmullRomCurve3(splinePoints);

    const geometry = new StreetLineGeometry(
      curve, // path
      numPoints, // tubularSegments
      0.05, // radiusX
      0, // radiusY
    );

    const map = new THREE.Texture();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    (async () => {
      const img = await new Promise((accept, reject) => {
        const img = new Image();
        img.onload = () => {
          accept(img);
        };
        img.onerror = err => {
          reject(err);
        };
        img.src = '/images/arrowtail.png';
      });
      map.image = img;
      map.needsUpdate = true;
    })();
    const material = new THREE.MeshBasicMaterial({
      // color: 0xFF0000,
      // flatShading: true,
      map,
      side: THREE.DoubleSide,
    });
    super(geometry, material);
  }
}