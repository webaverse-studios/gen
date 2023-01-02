import * as THREE from 'three';
import {
  clipRenderSpecs,
  getDepthRenderSpecsMeshes,
  renderMeshesDepth,
} from '../clients/reconstruction-client.js';
// import {
//   depthVertexShader,
//   depthFragmentShader,
// } from '../utils/sg-shaders.js';
import {
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
} from '../zine/zine-constants.js';
// import {makeRenderer} from '../zine/zine-utils.js';
// import {
//   maskIndex2Canvas,
// } from './sg-debug.js';

//

const localVector = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
const localRay = new THREE.Ray();

//

export function reconstructFloor({
  renderSpecs,
  camera,
  floorPlane,
}) {
  // add clipZ attributes
  renderSpecs = clipRenderSpecs(renderSpecs);
  const meshes = getDepthRenderSpecsMeshes(renderSpecs, camera);

  const floorWidth = floorNetPixelSize;
  const floorHeight = floorNetPixelSize;
  const floorNetDepthsRaw = renderMeshesDepth(meshes, floorWidth, floorHeight, camera);
  const floorNetDepths = new Float32Array(floorNetDepthsRaw.length);
  // const offset = 0.1 / 2;
  const offset = 0;
  for (let i = 0; i < floorNetDepthsRaw.length; i++) {
    let value = floorNetDepthsRaw[i];
    if (value !== 0) {
      value = value + offset;
    } else {
      // sample around the pixel to see if there's a nearby depth
      const range = 3;
      let sum = 0;
      let total = 0;
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const _planeHit = () => {
            localRay.origin.copy(camera.position);
            localRay.origin.x = (x / floorWidth - 0.5) * floorNetWorldSize;
            localRay.origin.z = (y / floorHeight - 0.5) * floorNetWorldSize;
            localRay.direction.set(0, 0, -1)
              .applyQuaternion(camera.quaternion);
            let point = localRay.intersectPlane(floorPlane, localVector);
            // if the point missed, the floor plane is probably at a weird angle,
            // so just assume a zero depth
            if (!point) {
              // try the reverse direction
              // localRay.direction.negate();
              // point = localRay.intersectPlane(floorPlane, localVector);
            } else {
              sum += -(point.y - camera.position.y) * weight;
            }
          };

          const x = i % floorWidth + dx;
          const y = Math.floor(i / floorWidth) + dy;
          const index = y * floorWidth + x;
          const distance = Math.sqrt(dx*dx + dy*dy);
          const weight = 1 / (1 + distance);
          if (x >= 0 && x < floorWidth && y >= 0 && y < floorHeight) {
            const value2 = floorNetDepthsRaw[index];
            if (value2 !== 0) { // real hit
              sum += value2 * weight;
            } else { // fake plane hit
              _planeHit();
            }
          } else {
            _planeHit();
          }
          total += weight;
        }
      }
      if (total !== 0) {
        sum /= total;
      }
      value = sum;
    }
    floorNetDepths[i] = value;
  }
  const floorResolution = [floorWidth, floorHeight];
  return {
    floorNetDepthsRaw,
    floorNetDepths,
    floorResolution,
  };
}