// import * as THREE from 'three';
import {
  pointCloudArrayBufferToGeometry,
  reinterpretFloatImageData,
  clipGeometryZ,
  getGeometryClipZMask,
  mergeOperator,
  clipRenderSpecs,
  getDepthRenderSpecsMeshes,
  getMapIndexSpecsMeshes,
  renderMeshesDepth,
  renderMeshesMapIndex,
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
} from '../zine/zine-constants.js';
// import {makeRenderer} from '../zine/zine-utils.js';
// import {
//   maskIndex2Canvas,
// } from './sg-debug.js';

//

// const localVector = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
// const localRay = new THREE.Ray();

//

export function renderMapIndex({
  renderSpecs,
  camera,
  // floorPlane,
}) {
  // renderSpecs = clipRenderSpecs(renderSpecs);
  const width = floorNetPixelSize;
  const height = floorNetPixelSize;
  const meshes = getMapIndexSpecsMeshes(renderSpecs);
  const mapIndexSpec = renderMeshesMapIndex(meshes, width, height, camera);
  return mapIndexSpec;
}