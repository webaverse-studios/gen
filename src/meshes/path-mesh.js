import * as THREE from 'three';
import {
  StreetLineGeometry,
} from '../geometries/StreetGeometry.js';

export class PathMesh extends THREE.Mesh {
  constructor(splinePoints) {
    // const app = useApp();
    // const localPlayer = useLocalPlayer();
    // const physics = usePhysics();
    // const {StreetLineGeometry, StreetFlatGeometry} = useGeometries();
    // const {alea} = useProcGen();

    // app.name = 'path';

    /* const line = app.getComponent('line') ?? [
      [0, 0, 0],
      [0, 0, -1],
    ]; */

    // const startPoint = new THREE.Vector3().fromArray(line[0]);
    // const endPoint = new THREE.Vector3().fromArray(line[1]);

    // const startPoint = localPlayer.position.clone();
    // const endPoint = new THREE.Vector3().setFromMatrixPosition(app.matrixWorld);

    // const direction = endPoint.clone()
    //   .sub(startPoint)
    //   .normalize();
    // const distance = startPoint.distanceTo(endPoint);
    // const segmentLength = 0.5;
    // const maxNumPoints = Math.round(distance / segmentLength);
    // const numPoints = Math.min(maxNumPoints, 32);
    // const stepRange = 0.2;

    // const rng = alea('path');
    // const r = () => -1 + 2 * rng();

    const numPoints = splinePoints.length;

    /* const splinePoints = Array(numPoints);
    for (let i = 0; i <= numPoints; i++) {
      const position = startPoint.clone()
        .add(direction.clone().multiplyScalar(i * distance / maxNumPoints));
      position.x += r() * stepRange;
      // point.y += r() * stepRange;
      position.y += 100;
      position.z += r() * stepRange;
      
      const result = physics.raycast(
        position,
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -Math.PI / 2
        )
      );
      const p = position.clone();
      if (result) {
        const {
          point,
        } = result;

        p.fromArray(point);
        p.y += 0.05;
      } else {
        // console.warn('no raycast', position);
        p.y = 0;
      }
      splinePoints[i] = p;
    } */
    // console.log('path mesh points', splinePoints);
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
    //   mesh.frustumCulled = false;
    //   return mesh;
    // };
    /* (async () => {
      await waitForSceneLoaded();
    
      const pathMesh = _makePathMesh();
      app.add(pathMesh);
      pathMesh.matrix.copy(app.matrixWorld).invert()
        .decompose(pathMesh.position, pathMesh.quaternion, pathMesh.scale);
      pathMesh.updateMatrixWorld();
    })(); */

    // return app;
  }
}