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
  renderMeshesMapIndexFull,
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

//

export function renderMapIndexFull({
  renderSpecs,
  camera,
}) {
  const width = floorNetPixelSize;
  const height = floorNetPixelSize;
  const meshes = getMapIndexSpecsMeshes(renderSpecs);
  const mapIndexSpec = renderMeshesMapIndexFull(meshes, width, height, camera);
  return mapIndexSpec;
}

//

export function renderMapIndexAdd({
  oldMapIndex,
  newRenderSpecs,
  attachPanelIndex,
  camera,
}) {
  const width = floorNetPixelSize;
  const height = floorNetPixelSize;
  debugger;
  const meshes = getMapIndexSpecsMeshes(newRenderSpecs);
}