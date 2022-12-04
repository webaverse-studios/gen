import * as THREE from 'three';
import {
  // setPerspectiveCameraFromJson,
  // getPerspectiveCameraJson,
  // setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../utils/camera-utils.js';
import {
  pointCloudArrayBufferToGeometry,
  reinterpretFloatImageData,
  clipGeometryZ,
  getGeometryClipZMask,
  mergeOperator,
  clipRenderSpecs,
  getRenderSpecsMeshes,
  getRenderSpecsMeshesDepth,
} from '../clients/reconstruction-client.js';
import {
  depthVertexShader,
  depthFragmentShader,
} from '../utils/sg-shaders.js';
import {
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
} from '../constants/sg-constants.js';
import {makeRenderer} from '../utils/three-utils.js';
import {
  maskIndex2Canvas,
} from './sg-debug.js';

//

const localVector = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localRay = new THREE.Ray();

//

export function reconstructFloor({
  renderSpecs,
  floorPlane,
}) {
  // camera
  const floorNetCamera = new THREE.OrthographicCamera(
    -floorNetWorldSize / 2,
    floorNetWorldSize / 2,
    floorNetWorldSize / 2,
    -floorNetWorldSize / 2,
    0,
    floorNetWorldDepth
  );
  floorNetCamera.position.set(0, -floorNetWorldDepth/2, 0);
  floorNetCamera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2)
    .multiply(
      localQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    );
  floorNetCamera.updateMatrixWorld();

  const floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);

  renderSpecs = clipRenderSpecs(renderSpecs);
  const width = floorNetPixelSize;
  const height = floorNetPixelSize;
  const meshes = getRenderSpecsMeshes(renderSpecs, floorNetCamera);

  const floorNetDepthsOriginal = getRenderSpecsMeshesDepth(meshes, width, height, floorNetCamera);
  globalThis.floorNetDepthsOriginal = floorNetDepthsOriginal;
  // globalThis.hits = [];
  const floorNetDepths = new Float32Array(floorNetDepthsOriginal.length);
  globalThis.floorNetDepths = floorNetDepths;
  const offset = 0.1;
  for (let i = 0; i < floorNetDepthsOriginal.length; i++) {
    let value = floorNetDepthsOriginal[i];
    if (value !== 0) {
      value = value - offset;
    } else {
      // sample around the pixel to see if there's a nearby depth
      const range = 3;
      let sum = 0;
      let total = 0;
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          // if (dx === 0 && dy === 0) {
          //   continue;
          // }

          const _planeHit = () => {
            localRay.origin.copy(floorNetCamera.position);
            localRay.origin.x = (x / width - 0.5) * floorNetWorldSize;
            localRay.origin.z = (y / height - 0.5) * floorNetWorldSize;
            localRay.direction.set(0, 0, -1)
              .applyQuaternion(floorNetCamera.quaternion);
            const point = localRay.intersectPlane(floorPlane, localVector);
            sum += -(point.y - floorNetCamera.position.y) * weight;
          };

          const x = i % width + dx;
          const y = Math.floor(i / width) + dy;
          const index = y * width + x;
          const distance = Math.sqrt(dx*dx + dy*dy);
          const weight = 1 / (1 + distance);
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const value2 = floorNetDepthsOriginal[index];
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
  return {
    floorNetDepths,
    floorNetCameraJson,
  };
}