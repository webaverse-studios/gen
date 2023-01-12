import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import alea from 'alea';
import concaveman from 'concaveman';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {Text} from 'troika-three-text';
import {
  makePromise,
} from '../../utils.js';
import {
  shuffle,
} from '../utils/rng-utils.js';
import {
  frameSize,
  canvasSize,
  numFramesPerRow,
  numFrames,
  
  arrowUpBrightUrl,
  arrowUpDimUrl,
  arrowsUpUrl,
} from '../utils/light-arrow.js';

import {
  setPerspectiveCameraFromJson,
  getPerspectiveCameraJson,
  setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../zine/zine-camera-utils.js';
import {
  getDepthFloat32ArrayViewPositionPx,
  bilinearInterpolate,
  bilinearInterpolateChecked,
} from '../zine/zine-geometry-utils.js';
import {
  panelSize,
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
  physicsPixelStride,
  portalExtrusion,
  entranceExitEmptyDiameter,
} from '../zine/zine-constants.js';
// import {
//   depthVertexShader,
//   depthFragmentShader,
// } from '../utils/sg-shaders.js';
import {
  makeRenderer,
  makeGltfLoader,
  makeDefaultCamera,
  makeFloorNetCamera,
  normalToQuaternion,
} from '../zine/zine-utils.js';
// import {
//   ZineStoryboard,
//   ZinePanel,
//   ZineData,
// } from '../zine/zine-format.js';
import {
  ZineRenderer,
} from '../zine/zine-renderer.js';
// import {
//   ZineStoryboardCompressor,
// } from '../zine/zine-compression.js'
import {
  reconstructPointCloudFromDepthField,
  pointCloudArrayBufferToGeometry,
  getBoundingBoxFromPointCloud,
  reinterpretFloatImageData,
  depthFloat32ArrayToPositionAttributeArray,
  depthFloat32ArrayToGeometry,
  depthFloat32ArrayToOrthographicPositionAttributeArray,
  depthFloat32ArrayToOrthographicGeometry,
  depthFloat32ArrayToHeightfield,
  getDepthFloatsFromPointCloud,
  getDepthFloatsFromIndexedGeometry,
  setCameraViewPositionFromViewZ,
  getDoubleSidedGeometry,
  getGeometryHeights,
} from '../zine/zine-geometry-utils.js';
import {
  getFloorNetPhysicsMesh,
} from '../zine/zine-mesh-utils.js';
import {
  blob2img,
  img2ImageData,
  resizeImage,
} from '../utils/convert-utils.js';
import {classes, categories, categoryClassIndices} from '../../constants/classes.js';
import {heightfieldScale} from '../../constants/physics-constants.js';
import {colors, rainbowColors, detectronColors} from '../constants/detectron-colors.js';
import {mobUrls} from '../constants/urls.js';
import {
  targetScale,
  targetScaleInv,
} from '../constants/generator-constants.js';
import {
  VQAClient,
} from '../clients/vqa-client.js';
import {
  // mainImageKey,
  promptKey,
  layer2Specs,
} from '../zine/zine-data-specs.js';
import {
  entranceExitHeight,
  entranceExitWidth,
  entranceExitDepth,
} from '../zine/zine-constants.js';

import * as passes from './sg-passes.js';
import {
  LensMaterial,
} from './sg-materials.js';
import {
  TargetMesh,
} from './target-mesh.js';
import {
  BlinkMesh,
} from './blink-mesh.js';
import {
  ArrowMesh,
} from './arrow-mesh.js';
import {
  GridMesh,
} from './grid-mesh.js';
import {
  getPanelSpecOutlinePositionsDirections,
  makeFlowerGeometry,
  makeFloorFlowerMesh,
  makeFloorPetalMesh,
} from './flower-mesh.js';
import {
  depthFloats2Canvas,
  distanceFloats2Canvas,
  segmentsImg2Canvas,
  planesMask2Canvas,
  maskIndex2Canvas,
} from './sg-debug.js';

//

import {
  ImageAiClient,
} from '../clients/image-client.js';
import {
  getDepthField,
  // getPointCloud,
  clipGeometryZ,
  mergeOperator,
  // getCoverageRenderSpecsMeshes,
  // renderMeshesCoverage,
  getDepthRenderSpecsMeshes,
  renderMeshesDepth,
} from '../clients/reconstruction-client.js';
import {PathMesh} from '../zine-aux/meshes/path-mesh.js';
import '../../lore-test.js';

//

const vqaClient = new VQAClient();

//

const planeGeometryNormalizeQuaternion = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2);

// constants

export const selectorSize = 8 + 1;
export const tools = [
  'camera',
  'eraser',
  'outmesh',
  'segment',
  'plane',
  'portal',
];

// locals

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localVector6 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();
const localCamera = new THREE.PerspectiveCamera();
const localOrthographicCamera = new THREE.OrthographicCamera();
const localFrustum = new THREE.Frustum();
const localColor = new THREE.Color();

const localFloat32Array4 = new Float32Array(4);
const localUint8ArrayPanelSize = new Uint8Array(((panelSize - 1) * 2) * (panelSize - 1) * 4);

const upVector = new THREE.Vector3(0, 1, 0);
const backwardVector = new THREE.Vector3(0, 0, 1);
const rightVector = new THREE.Vector3(1, 0, 0);

const gltfLoader = makeGltfLoader();

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

// const zSymbol = Symbol('z');

//

const defaultCameraMatrix = new THREE.Matrix4();

//

/* const forwardizeQuaternion = (() => {
  const localVector = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();
  
  return quaternion => {
    const forwardDirection = localVector.set(0, 0, -1)
      .applyQuaternion(quaternion);
    forwardDirection.y = 0;
    forwardDirection.normalize();
    return quaternion.setFromRotationMatrix(
      localMatrix.lookAt(
        zeroVector,
        forwardDirection,
        upVector,
      )
    );
  };
})(); */

const depthRenderSkipRatio = 8;
const makeDepthCubesMesh = (depthFloats, width, height, camera) => {
  // render an instanced cubes mesh to show the depth
  const depthCubesGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const depthCubesMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
  });
  const depthCubesMesh = new THREE.InstancedMesh(depthCubesGeometry, depthCubesMaterial, depthFloats.length);
  depthCubesMesh.name = 'depthCubesMesh';
  depthCubesMesh.frustumCulled = false;

  // set the matrices by projecting the depth from the perspective camera
  depthCubesMesh.count = 0;
  for (let i = 0; i < depthFloats.length; i += depthRenderSkipRatio) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;

    const viewZ = depthFloats[i];
    const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, camera, localVector);
    const target = worldPoint.applyMatrix4(camera.matrixWorld);

    localMatrix.makeTranslation(target.x, target.y, target.z);
    depthCubesMesh.setMatrixAt(i / depthRenderSkipRatio, localMatrix);
    depthCubesMesh.count++;
  }
  depthCubesMesh.instanceMatrix.needsUpdate = true;
  return depthCubesMesh;
};

//

const resizeBoundingBoxLayers = (boundingBoxLayers, oldWidth, oldHeight, width, height) => boundingBoxLayers.map(layer => {
  const {label, bbox} = layer;
  return {
    label,
    bbox: [
      bbox[0] / oldWidth * width,
      bbox[1] / oldHeight * height,
      bbox[2] / oldWidth * width,
      bbox[3] / oldHeight * height,
    ],
  };
});

//

const getFirstFloorPlaneIndex = (planeLabels) => {
  if (planeLabels.length > 0) {
    const labelSpecs = planeLabels.map((label, index) => {
      const {normal, distanceSquaredF} = label;
      return {
        index,
        normal,
        distanceSquaredF,
      };
    });
    const snapAngle = Math.PI / 16;
    const _getForwardAngle = a => {
      const v = localVector.fromArray(a.normal);
      v.x = 0;
      v.normalize();
      const zAngle = Math.atan2(v.y, v.z);
      return zAngle;
    }
    const snappedAngleSets = [];
    for (let angle = -Math.PI / 2; angle <= Math.PI / 2; angle += snapAngle) {
      const set = new Set();
      snappedAngleSets.push(set);

      for (const labelSpec of labelSpecs) {
        const planeAngle = _getForwardAngle(labelSpec);
        if (planeAngle >= angle - snapAngle/2 && planeAngle <= angle + snapAngle/2) {
          set.add(labelSpec.index);
        }
      }
    }
    // sort the sets by size
    const _reduceSetToNumPixels = set => Array.from(set).reduce((sum, e) => sum + e.numPixels, 0);
    snappedAngleSets.sort((a, b) => _reduceSetToNumPixels(b) - _reduceSetToNumPixels(a));
    labelSpecs.sort((a, b) => {
      const aSnappedAngleSetIndex = snappedAngleSets.findIndex(set => set.has(a.index));
      const bSnappedAngleSetIndex = snappedAngleSets.findIndex(set => set.has(b.index));

      const aValid = aSnappedAngleSetIndex !== -1;
      const bValid = bSnappedAngleSetIndex !== -1;
      const diff = +bValid - +aValid;
      if (diff !== 0) {
        return diff;
      } else {
        const diff = aSnappedAngleSetIndex - bSnappedAngleSetIndex;
        if (diff !== 0) {
          return diff;
        } else {
          return b.numVertices - a.numVertices;
          // return a.distanceSquaredF - b.distanceSquaredF;
          // return b.numPixels - a.numPixels;
        }
      }
    });
    // XXX this can be reduced to an average transform of the matching planes in the set to improve accuracy
    const firstFloorPlaneIndex = labelSpecs[0].index;
    return firstFloorPlaneIndex;
  } else {
    return -1;
  }
};

//

const getSemanticSpecs = ({
  geometry,
  segmentMask,
  planesMask,
  planesJson,
  portalJson,
  width,
  height,
}) => {
  const {
    labels: segmentLabels,
    labelIndices: segmentLabelIndices,
  } = getMaskSpecsByConnectivity(geometry, segmentMask, width, height);
  
  const {
    labels: planeLabels,
    labelIndices: planeLabelIndices,
  } = getMaskSpecsByValue(geometry, planesMask, width, height);
  zipPlanesSegmentsJson(planeLabels, planesJson);

  const portalLabels = portalJson;

  return {
    segmentLabels,
    segmentLabelIndices,
    planeLabels,
    planeLabelIndices,
    portalLabels,
  };
};

//

const getMaskSpecsByConnectivity = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const labels = [];
  const labelIndices = new Uint8Array(width * height).fill(255);

  const seenIndices = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (!seenIndices.has(index)) {
        seenIndices.add(index);

        // initialize loop
        const value = mask[index];
        if (value !== -1) {
          const segmentIndices = [];
          const boundingBox = localBox.set(
            localVector.set(Infinity, Infinity, Infinity),
            localVector2.set(-Infinity, -Infinity, -Infinity)
          );
          const labelIndex = labels.length;

          // push initial queue entry
          const queue = [index];
          segmentIndices.push(index);
          labelIndices[index] = labelIndex;

          // loop
          while (queue.length > 0) {
            const index = queue.shift();

            const localValue = mask[index];
            if (localValue === value) {
              const x = index % width;
              const y = Math.floor(index / width);

              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  if (dx === 0 && dy === 0) {
                    continue;
                  }

                  const ax = x + dx;
                  const ay = y + dy;

                  if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
                    const aIndex = ay * width + ax;
                    
                    if (!seenIndices.has(aIndex)) {
                      queue.push(aIndex);
                      seenIndices.add(aIndex);
                      segmentIndices.push(aIndex);
                      labelIndices[aIndex] = labelIndex;
                    }
                  }
                }
              }
            }
          }

          for (const index of segmentIndices) {
            const position = localVector.fromArray(positions, index * 3);
            boundingBox.expandByPoint(position);
          }
          labels.push({
            index: value,
            value,
            bbox: [
              boundingBox.min.toArray(),
              boundingBox.max.toArray(),
            ],
          });
        }
      }
    }
  }
  return {
    labels,
    labelIndices,
  };
};
const getMaskSpecsByValue = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const labels = new Map();
  const labelIndices = new Uint8Array(width * height).fill(255);

  const seenIndices = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (!seenIndices.has(index)) {
        seenIndices.add(index);

        // initialize loop
        const value = mask[index];
        if (value !== -1) {
          const segmentIndices = [];

          // push initial queue entry
          const queue = [index];
          segmentIndices.push(index);

          let label = labels.get(value);
          if (!label) {
            label = {
              index: labels.size,
              value,
              bbox: [
                [Infinity, Infinity, Infinity],
                [-Infinity, -Infinity, -Infinity],
              ],
              numPixels: 0,
            };
            labels.set(value, label);
          }
          labelIndices[index] = label.index;
          label.numPixels++;

          const boundingBox = localBox.set(
            localVector.fromArray(label.bbox[0]),
            localVector2.fromArray(label.bbox[1])
          );

          // loop
          while (queue.length > 0) {
            const index = queue.shift();

            const localValue = mask[index];
            if (localValue === value) {
              const x = index % width;
              const y = Math.floor(index / width);

              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  if (dx === 0 && dy === 0) {
                    continue;
                  }

                  const ax = x + dx;
                  const ay = y + dy;

                  if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
                    const aIndex = ay * width + ax;
                    
                    if (!seenIndices.has(aIndex)) {
                      queue.push(aIndex);
                      seenIndices.add(aIndex);
                      segmentIndices.push(aIndex);
                      labelIndices[aIndex] = label.index;
                      label.numPixels++;
                    }
                  }
                }
              }
            }
          }

          for (const index of segmentIndices) {
            const position = localVector.fromArray(positions, index * 3);
            boundingBox.expandByPoint(position);
          }

          boundingBox.min.toArray(label.bbox[0]);
          boundingBox.max.toArray(label.bbox[1]);
        }
      }
    }
  }
  return {
    labels: Array.from(labels.values()),
    labelIndices,
  };
};
const zipPlanesSegmentsJson = (planeLabels, planesJson) => {
  if (planeLabels.length !== planesJson.length) {
    console.warn('invalid planes zip lengths', {
      planeLabels,
      planesJson,
    });
    debugger;
  }

  for (let i = 0; i < planeLabels.length; i++) {
    const label = planeLabels[i];
    const planeJson = planesJson[i];
    for (const k in planeJson) {
      label[k] = planeJson[k];
    }
  }
  // return planeLabels;
};
const projectQuaternionToFloor = (() => {
  const localVector = new THREE.Vector3();

  return (
    srcQuaternion,
    floorQuaternion,
    targetQuaternion,
  ) => {
    const forwardDirection = localVector.set(0, 0, -1)
      .applyQuaternion(srcQuaternion);
    return projectDirectionToFloor(
      forwardDirection,
      floorQuaternion,
      targetQuaternion
    );
  };
})();
const projectDirectionToFloor = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localPlane = new THREE.Plane();

  return (
    forwardDirection,
    floorQuaternion,
    targetQuaternion,
  ) => {
    // get the floor plane
    const floorUpDirection = localVector.set(0, 1, 0)
      .applyQuaternion(floorQuaternion);
    const floorPlane = localPlane
      .setFromNormalAndCoplanarPoint(
        floorUpDirection,
        new THREE.Vector3(0, 0, 0)
      );

    // project the forward direction onto the floor plane
    const projectedForwardDirection = floorPlane.projectPoint(
      forwardDirection,
      localVector2
    ).normalize();

    return targetQuaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        projectedForwardDirection,
        floorUpDirection
      )
    );
  };
})();

//

const getFloorPlaneLocation = (() => {
  // const localVector = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();

  return ({
    floorPlaneCenter,
    floorPlaneNormal,
  }) => {
    const quaternion = normalToQuaternion(floorPlaneNormal, localQuaternion, backwardVector)
      .multiply(localQuaternion2.setFromAxisAngle(rightVector, -Math.PI/2))
    
    return {
      position: floorPlaneCenter.toArray(),
      quaternion: quaternion.toArray(),
      normal: floorPlaneNormal.toArray(),
    };
  };
})();
const getFloorHit = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  // const localVector3 = new THREE.Vector3();
  // const localPlane = new THREE.Plane();

  return (
    position,
    quaternion,
    offset,
    depthFloatsRaw,
    floorPlaneJson,
    targetPosition
  ) => {
    targetPosition.copy(position)
      .add(
        localVector.copy(offset)
          .applyQuaternion(quaternion)
      );

    // compute the sample coordinates:
    const floorCornerBasePosition = localVector.set(0, 0, 0)
      .add(localVector2.set(-floorNetWorldSize / 2, 0, -floorNetWorldSize / 2));
    const px = (targetPosition.x - floorCornerBasePosition.x) / floorNetWorldSize;
    const pz = (targetPosition.z - floorCornerBasePosition.z) / floorNetWorldSize;
    const ix = Math.floor(px * floorNetPixelSize);
    const iz = Math.floor(pz * floorNetPixelSize);
    const index = iz * floorNetPixelSize + ix;
    targetPosition.y = depthFloatsRaw[index];

    const checkFn = y => y > -floorNetWorldDepth * 0.49;
    if (checkFn(targetPosition.y)) { // mesh hit
      targetPosition.y = bilinearInterpolateChecked(
        depthFloatsRaw,
        floorNetPixelSize,
        floorNetPixelSize,
        px,
        pz,
        checkFn
      );
      return targetPosition;
    } else {
      return null;
    }
  };
})();
const getRangeHit = (() => {
  // const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  // const localVector3 = new THREE.Vector3();
  // const localPlane = new THREE.Plane();

  return (
    position,
    quaternion,
    size,
    depthFloatsRaw,
    floorPlaneJson,
    targetPosition,
    {
      // cameraNearScan = camera.near,
      // cameraFarScan = 3,
      // cameraScanWidth = entranceExitWidth,
      cameraScanStep = floorNetResolution,
    } = {},
  ) => {
    // const radius = Math.max(size.x, size.z) / 2;
    for (let dx = -size.x / 2; dx <= size.x / 2; dx += cameraScanStep) {
      for (let dz = -size.z / 2; dz <= size.z / 2; dz += cameraScanStep) {
        // const distance = Math.sqrt(dx * dx + dz * dz);
        // if (distance < radius) { // if we're inside the range circle
          const targetPosition2 = getFloorHit(
            position,
            quaternion,
            localVector2.set(dx, 0, dz),
            depthFloatsRaw,
            floorPlaneJson,
            targetPosition
          );
          if (targetPosition2 === null) {
            return null;
          }
        // }
      }
    }
    // return the middle floor hit
    const targetPosition2 = getFloorHit(
      position,
      quaternion,
      localVector2.set(0, 0, 0),
      depthFloatsRaw,
      floorPlaneJson,
      targetPosition
    );
    // if (targetPosition2 === null) {
    //   console.warn('no floor hit 3', targetPosition2);
    //   debugger;
    // }
    return targetPosition2;
  };
})();
const hitScan = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();

  return (position, quaternion, depthFloatsRaw, floorPlaneJson, {
    cameraNearScan = 0,
    cameraFarScan = 3,
    cameraScanWidth = entranceExitWidth,
    cameraScanStep = floorNetResolution,
  } = {}) => {
    for (
      let cameraDistance = cameraNearScan;
      cameraDistance <= cameraFarScan;
      cameraDistance += cameraScanStep
    ) {
      let everyXHit = true;
      const numScanSteps = Math.ceil(cameraScanWidth / cameraScanStep);
      for (let dx = -numScanSteps / 2; dx <= numScanSteps / 2; dx++) {
        const dx2 = dx * cameraScanStep;
        const targetPosition = getFloorHit(
          position,
          quaternion,
          localVector2.set(dx2, 0, -cameraDistance)
            .applyQuaternion(quaternion),
          depthFloatsRaw,
          floorPlaneJson,
          localVector
        );
        if (targetPosition === null) {
          everyXHit = false;
          break;
        }
      }
      if (everyXHit) {
        return cameraDistance;
      }
    }
    return null;
  };
})();
const getRaycastedCameraEntranceLocation = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  // const localVector3 = new THREE.Vector3();

  // raycast in front of the camera and check for a floor hit
  return (position, quaternion, depthFloatsRaw, floorPlaneLocation, floorPlaneJson) => {
    const cameraDistance = hitScan(
      position,
      quaternion,
      depthFloatsRaw,
      floorPlaneJson,
    );
    if (cameraDistance !== null) {
      // ensure there is space for the player to stand
      const targetPosition = getFloorHit(
        position,
        quaternion,
        localVector2.set(0, 0, -cameraDistance)
          .applyQuaternion(quaternion),
        depthFloatsRaw,
        floorPlaneJson,
        localVector
      );
      if (targetPosition !== null) {
        const position = targetPosition.toArray();
        const quaternion = floorPlaneLocation.quaternion.slice();

        // compute the portal box center, which is behind the position
        const center = targetPosition.clone()
          .add(
            new THREE.Vector3(0, entranceExitHeight / 2, entranceExitDepth / 2)
              .applyQuaternion(new THREE.Quaternion().fromArray(quaternion))
          ).toArray();
        const size = new THREE.Vector3(entranceExitWidth, entranceExitHeight, entranceExitDepth)
          .toArray();
        return {
          position,
          quaternion,
          center,
          size,
        };
      } else {
        return null;
      }
    } else {
      return null;
    }
  };
})();
const getRaycastedPortalLocations = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localVector4 = new THREE.Vector3();
  const localVector5 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();
  const localQuaternion3 = new THREE.Quaternion();
  
  return (portalLabels, depthFloats, depthFloatsRaw, floorPlaneLocation, floorPlaneJson) => {
    const portalLocations = [];
    for (let i = 0; i < portalLabels.length; i++) {
      const labelSpec = portalLabels[i];
      const normal = localVector.fromArray(labelSpec.normal);
      const center = localVector2.fromArray(labelSpec.center);

      // compute floor quaternion
      const floorNormal = localVector3.fromArray(floorPlaneLocation.normal);
      const floorQuaternion = localQuaternion;
      normalToQuaternion(floorNormal, floorQuaternion, backwardVector)
        .multiply(localQuaternion2.setFromAxisAngle(rightVector, -Math.PI/2));

      // scan for the portal forward using hitScan
      const hitScanPosition = center.clone();
      const hitScanQuaternion = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(
          new THREE.Vector3(0, 0, 0),
          normal.clone().multiplyScalar(-1),
          new THREE.Vector3(0, 1, 0).applyQuaternion(floorQuaternion)
        )
      );
      const cameraDistance = hitScan(
        hitScanPosition,
        hitScanQuaternion,
        depthFloatsRaw,
        floorPlaneJson,
        {
          cameraNearScan: 0,
          cameraFarScan: 3,
          cameraScanWidth: entranceExitWidth,
          cameraScanStep: floorNetResolution,
        }
      );
      if (cameraDistance !== null) {
        // portal center in front of the hit point in world space
        const portalQuaternion = projectQuaternionToFloor(
          hitScanQuaternion,
          floorQuaternion,
          localQuaternion3
        );
        const portalCenter = hitScanPosition.clone()
          .add(
            new THREE.Vector3(0, 0, -cameraDistance)
              .applyQuaternion(hitScanQuaternion)
          )
          .add(
            new THREE.Vector3(0, 0, -portalExtrusion)
              .applyQuaternion(portalQuaternion)
          );
        
        // ensure there is space for the player to stand
        const targetPosition = getRangeHit(
          portalCenter,
          // XXX we can change to go along the portal once the floor net mesh is aligned with the floor
          hitScanQuaternion,
          // portalQuaternion,
          localVector4.setScalar(entranceExitEmptyDiameter),
          depthFloatsRaw,
          floorPlaneJson,
          localVector5,
        );
        if (targetPosition !== null) {
          // compute the portal box center, which is behind the position
          const center = targetPosition.clone()
            .add(
              new THREE.Vector3(0, entranceExitHeight / 2, entranceExitDepth / 2)
                .applyQuaternion(portalQuaternion)
            );
          const size = new THREE.Vector3(entranceExitWidth, entranceExitHeight, entranceExitDepth);

          portalLocations.push({
            position: targetPosition.toArray(),
            quaternion: portalQuaternion.toArray(),
            center: center.toArray(),
            size: size.toArray(),
          });
          // console.warn('ok hit');
        } /* else {
          console.warn('null hit');
        } */
      }
    }
    return portalLocations;
  };
})();
/* function* subsets(array, offset = 0) {
  while (offset < array.length) {
    let first = array[offset++];
    for (let subset of subsets(array, offset)) {
      subset.push(first);
      yield subset;
    }
  }
  yield [];
} */
/* const allSubsets = inputArray => {
  const result = [];
  for (let subset of subsets(inputArray)) {
    result.push(subset);
  }
  return result;
}; */
function isSetSelfIntersecting(candidateLocations) {
  for (let i = 0; i < candidateLocations.length; i++) {
    for (let j = i + 1; j < candidateLocations.length; j++) {
      const candidateLocation1 = candidateLocations[i];
      const candidateLocation2 = candidateLocations[j];
      if (entranceExitIntersects(candidateLocation1, candidateLocation2)) {
        return true;
      }
    }
  }
  return false;
}
const entranceExitIntersects = (() => {
  const localVector = new THREE.Vector3();
  // const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();

  return (box1, box2) => {
    const box1Position = localVector.fromArray(box1.position);
    const box1Quaternion = localQuaternion.fromArray(box1.quaternion);
    // const box1Scale = localVector2.fromArray(box1.scale);
    // const scale = new THREE.Vector3(entranceExitWidth, entranceExitHeight, entranceExitDepth);
    const scale = new THREE.Vector3(1, 1, 1);
    const obb1 = new OBB().set(
      new THREE.Vector3(), // center
      new THREE.Vector3(entranceExitWidth, entranceExitHeight, entranceExitDepth)
        .multiplyScalar(0.5), // halfSize
      new THREE.Matrix3(), // rotation
    ).applyMatrix4(new THREE.Matrix4().compose(
      box1Position.clone()
        .add(
          new THREE.Vector3(0, entranceExitHeight / 2, entranceExitDepth / 2)
            .applyQuaternion(box1Quaternion)
        ),
      box1Quaternion,
      scale
    ));

    const box2Position = localVector3.fromArray(box2.position);
    const box2Quaternion = localQuaternion2.fromArray(box2.quaternion);
    // const box2Scale = localVector4.fromArray(box2.scale);
    const obb2 = new OBB().set(
      new THREE.Vector3(), // center
      new THREE.Vector3(entranceExitWidth, entranceExitHeight, entranceExitDepth)
        .multiplyScalar(0.5), // halfSize
      new THREE.Matrix3(), // rotation
    ).applyMatrix4(new THREE.Matrix4().compose(
      box2Position.clone()
        .add(
          new THREE.Vector3(0, entranceExitHeight / 2, entranceExitDepth / 2)
            .applyQuaternion(box2Quaternion)
        ),
      box2Quaternion,
      scale
    ));
    
    return obb1.intersectsOBB(obb2);
  };
})();
function getSetDistanceSq(candidateLocations) {
  let sum = 0;
  for (let i = 0; i < candidateLocations.length; i++) {
    for (let j = i + 1; j < candidateLocations.length; j++) {
      const candidateLocation1 = candidateLocations[i];
      const candidateLocation2 = candidateLocations[j];
      const d = localVector.fromArray(candidateLocation1.position)
        .sub(
          localVector2.fromArray(candidateLocation2.position)
        )
        .lengthSq();
      sum += d;
    }
  }
  return sum;
}
const sortLocations = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  // const localVector4 = new THREE.Vector3();
  // const localVector5 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  // const localQuaternion2 = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  const localMatrix = new THREE.Matrix4();

  return ({
    cameraEntranceLocation,
    floorPlaneLocation,
    portalLocations,
    // boundingBox,
    seed = 'avatars',
  }) => {
    // collect candidate locations
    let candidateLocations = [];
    candidateLocations.push(...portalLocations);
    const allCandidateLocations = candidateLocations.slice();
    
    // do not scribble over original data
    cameraEntranceLocation = structuredClone(cameraEntranceLocation);
    candidateLocations = structuredClone(candidateLocations);

    /* // remove candidate locations that are too close to each other
    const minSeparationDistance = 1;
    candidateLocations = candidateLocations.filter((candidateLocation, i) => {
      for (let j = i + 1; j < candidateLocations.length; j++) {
        const otherCandidateLocation = candidateLocations[j];
        const d = localVector.fromArray(candidateLocation.position)
          .distanceTo(
            localVector2.fromArray(otherCandidateLocation.position)
          );
        if (d < minSeparationDistance) {
          return false;
        }
      }
      return true;
    }); */

    // filter for good candidate entrance exit locations
    // const meshCenter = localBox.set(
    //   localVector.fromArray(boundingBox.min),
    //   localVector2.fromArray(boundingBox.max)
    // ).getCenter(localVector);
    /* const candidateEntranceExitLocations = candidateLocations.filter(candidateLocation => {
      return true; // XXXX
      // check whether the entrance exit candidate location is facing the scene mesh bounding box center
      // (angle within Math.PI / 2)
      const forwardLookDirection = localVector2.set(0, 0, -1)
        .applyQuaternion(localQuaternion.fromArray(candidateLocation.quaternion));
      const centerLookDirection = localVector3.copy(meshCenter)
        .sub(localVector4.fromArray(candidateLocation.position))
        .normalize();
      const angle = forwardLookDirection.angleTo(centerLookDirection);
      return angle <= Math.PI / 2;
    }); */

    const candidateLocationsCenter = (() => {
      const acc = new THREE.Vector3();
      for (let i = 0; i < candidateLocations.length; i++) {
        const candidateLocation = candidateLocations[i];
        acc.x += candidateLocation.position[0];
        acc.y += candidateLocation.position[1];
        acc.z += candidateLocation.position[2];
        // acc.add(localVector.fromArray(candidateLocation.position));
      }
      return acc.divideScalar(candidateLocations.length);
    })();
    const less = center => (a, b) => {
      if (a.x - center.x >= 0 && b.x - center.x < 0)
          return true;
      if (a.x - center.x < 0 && b.x - center.x >= 0)
          return false;
      if (a.x - center.x == 0 && b.x - center.x == 0) {
          if (a.z - center.z >= 0 || b.z - center.z >= 0)
              return a.z > b.z;
          return b.z > a.z;
      }

      // compute the cross product of vectors (center -> a) x (center -> b)
      const det = (a.x - center.x) * (b.z - center.z) - (b.x - center.x) * (a.z - center.z);
      if (det < 0)
          return true;
      if (det > 0)
          return false;

      // points a and b are on the same line from the center
      // check which point is closer to the center
      const d1 = (a.x - center.x) * (a.x - center.x) + (a.z - center.z) * (a.z - center.z);
      const d2 = (b.x - center.x) * (b.x - center.x) + (b.z - center.z) * (b.z - center.z);
      return d1 > d2;
    };

    // sort the candidate locations by angle
    candidateLocations.sort(less(candidateLocationsCenter));

    // entrances + exits
    let entranceExitLocations = [];
    if (cameraEntranceLocation) {
      entranceExitLocations.push(cameraEntranceLocation);

      /* // find the furthest portal from the camera entrance
      let furthestPortal = null;
      let furthestPortalDistance = 0;
      for (let i = 0; i < candidateLocations.length; i++) {
        const portalLocation = candidateLocations[i];
        const d = localVector.fromArray(cameraEntranceLocation.position)
          .distanceTo(
            localVector2.fromArray(portalLocation.position)
          );
        if (d > furthestPortalDistance) {
          furthestPortal = portalLocation;
          furthestPortalDistance = d;
        }
      }
      if (furthestPortal !== null) {
        entranceExitLocations.push(furthestPortal);

        candidateEntranceExitLocations.splice(candidateEntranceExitLocations.indexOf(furthestPortal), 1);
        candidateLocations.splice(candidateLocations.indexOf(furthestPortal), 1);
      } */
    } /* else {
      // find the two furthest portals from each other
      let furthestPortal1 = null;
      let furthestPortal2 = null;
      let furthestPortalDistance = 0;
      for (let i = 0; i < candidateLocations.length; i++) {
        const portalLocation1 = candidateLocations[i];
        for (let j = i + 1; j < candidateLocations.length; j++) {
          const portalLocation2 = candidateLocations[j];
          const d = localVector.fromArray(portalLocation1.position)
            .distanceTo(
              localVector2.fromArray(portalLocation2.position)
            );
          if (d > furthestPortalDistance) {
            furthestPortal1 = portalLocation1;
            furthestPortal2 = portalLocation2;
            furthestPortalDistance = d;
          }
        }
      }
      if (furthestPortal1 !== null && furthestPortal2 !== null) {
        entranceExitLocations.push(furthestPortal1);
        entranceExitLocations.push(furthestPortal2);

        candidateEntranceExitLocations.splice(candidateEntranceExitLocations.indexOf(furthestPortal1), 1);
        candidateEntranceExitLocations.splice(candidateEntranceExitLocations.indexOf(furthestPortal2), 1);
        candidateLocations.splice(candidateLocations.indexOf(furthestPortal1), 1);
        candidateLocations.splice(candidateLocations.indexOf(furthestPortal2), 1);
      }
    } */

    // if there are portals left, try to find a few more that would make good entrances/exits
    {
      const fixedCandidateLocations = entranceExitLocations;
      let largestSetSize = 0;
      let largestDistance = 0;
      let largestDistanceSet = [];
      for (let startCandidateIndex = 0; startCandidateIndex < candidateLocations.length; startCandidateIndex++) {
        const startCandidateLocation = candidateLocations[startCandidateIndex];
        // scan by step size 1/2..1/4
        for (let stepFactor = 2; stepFactor <= 4; stepFactor++) {
          let stepSize = Math.floor(candidateLocations.length / stepFactor);
          stepSize = Math.max(stepSize, 1);
          const stepCandidateLocations = [];
          for (let indexOffset = 0; indexOffset < candidateLocations.length; indexOffset += stepSize) {
            const candidateIndex = (startCandidateIndex + indexOffset) % candidateLocations.length;
            const candidateLocation = candidateLocations[candidateIndex];
            if (
              candidateLocation !== startCandidateLocation &&
              !stepCandidateLocations.includes(candidateLocation)
            ) {
              stepCandidateLocations.push(candidateLocation);
            }
          }
          const extraCandidateLocations = [
            startCandidateLocation,
            ...stepCandidateLocations,
          ];
          const allCandidateEntrances = [
            ...fixedCandidateLocations,
            ...extraCandidateLocations,
          ];
          if (allCandidateEntrances.length > largestSetSize) {
            const hasIntersections = isSetSelfIntersecting(allCandidateEntrances);
            if (!hasIntersections) {
              const distanceSq = getSetDistanceSq(allCandidateEntrances);
              if (distanceSq > largestDistance) {
                largestDistance = distanceSq;
                largestDistanceSet = extraCandidateLocations;
              }
            }
          }
        }
      }
      for (let i = 0; i < largestDistanceSet.length; i++) {
        const candidateLocation = largestDistanceSet[i];
        entranceExitLocations.push(candidateLocation);
        const candidateLocationIndex = candidateLocations.indexOf(candidateLocation);
        candidateLocations.splice(candidateLocationIndex, 1);
      }

      /* for (const candidateLocationSubset of subsets(candidateLocations)) {
        if (candidateLocationSubset.length > 0) {
          const allCandidateEntrances = [...fixedCandidateLocations, ...candidateLocationSubset];

          if (allCandidateEntrances.length > largestSetSize) {
            const hasIntersections = isSetSelfIntersecting(allCandidateEntrances);
            if (!hasIntersections) {
              const distanceSq = getSetDistanceSq(allCandidateEntrances);
              if (distanceSq > largestDistance) {
                largestDistance = distanceSq;
                largestDistanceSet = candidateLocationSubset;
              }
            }
          }
        }
      }
      const maxEntranceExits = 4;
      while (largestDistanceSet.length > 0 && entranceExitLocations.length < maxEntranceExits) {
        const candidateLocation = largestDistanceSet.shift();
        entranceExitLocations.push(candidateLocation);
        const candidateLocationIndex = candidateLocations.indexOf(candidateLocation);
        candidateLocations.splice(candidateLocationIndex, 1);
      } */
    }

    // randomize remaining candidate locations
    shuffle(candidateLocations, seed);

    // compute remaining candidate location look quaternions
    {
      const rng = alea(seed);
      for (let i = 0; i < candidateLocations.length; i++) {
        const candidateLocation = candidateLocations[i];
        // const candidatePosition = localVector.fromArray(candidateLocation.position);
        
        const lookCandidateLocations = allCandidateLocations.filter(lookCandidateLocation => {
          return lookCandidateLocation !== candidateLocation;
        });

        let quaternion;
        if (lookCandidateLocations.length > 0) { // if there is something to look at
          const position = localVector2.fromArray(candidateLocation.position);

          const lookCandidateLocation = lookCandidateLocations[
            Math.floor(rng() * lookCandidateLocations.length)
          ];
          const lookPosition = localVector3.fromArray(lookCandidateLocation.position);

          const targetQuaternion = new THREE.Quaternion();
          // normalToQuaternion(normal, targetQuaternion, upVector);
          targetQuaternion.setFromRotationMatrix(
            localMatrix.lookAt(
              position,
              lookPosition,
              upVector
            )
          );
          localEuler.setFromQuaternion(targetQuaternion, 'YXZ');
          localEuler.x = 0;
          localEuler.z = 0;
          targetQuaternion.setFromEuler(localEuler);
    
          const floorNormal = new THREE.Vector3().fromArray(floorPlaneLocation.normal);
          const floorQuaternion = new THREE.Quaternion();
          normalToQuaternion(floorNormal, floorQuaternion, backwardVector)
            .multiply(localQuaternion.setFromAxisAngle(rightVector, -Math.PI/2));

          quaternion = localQuaternion.multiplyQuaternions(
            floorQuaternion,
            targetQuaternion,
          );
        } else { // else if there is nothing to look at, keep the quaternion
          quaternion = localQuaternion.fromArray(candidateLocation.quaternion);
        }
        quaternion.toArray(candidateLocation.quaternion);
      }
    }

    // decorate entrance exit indices
    entranceExitLocations = entranceExitLocations.map(eel => {
      return {
        ...eel,
        panelIndex: -1,
        entranceIndex: -1,
      };
    });

    return {
      entranceExitLocations,
      candidateLocations,
    };
  };
})();

//

function drawLabels(ctx, boundingBoxLayers) {
  for (let i = 0; i < boundingBoxLayers.length; i++) {
    const layer = boundingBoxLayers[i];
    let {label, bbox} = layer;

    ctx.strokeStyle = 'red';
    // draw the main rectangle
    const [x1, y1, x2, y2] = bbox;
    const w = x2 - x1;
    const h = y2 - y1;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w, h);

    // label the box in the top left, with a black background and white text that fits inside
    ctx.fillStyle = 'black';
    ctx.fillRect(x1, y1, 150, 20);
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText(label, x1 + 2, y1 + 14);
  }
}

//

// convert focal length in millimeters to fov in degrees, in THREE.js:
function focalLengthToFov(focalLength) {
  return 2 * Math.atan(0.5 * 1000 / focalLength) * 180 / Math.PI;
}
function fovToFocalLength(fov) {
  return 0.5 * 1000 / Math.tan(fov * Math.PI / 360);
}

//

const blockEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const _mergeMask = (geometry, depthFloatImageData, distanceNearestPositions) => {
  // copy over snapped positions
  const newPositions = geometry.attributes.position.array.slice();
  const _snapPoint = index => {
    const x = index % panelSize;
    let y = Math.floor(index / panelSize);
    y = panelSize - 1 - y;
    const srcIndex = y * panelSize + x;
    const dstIndex = index;

    localVector.fromArray(distanceNearestPositions, srcIndex * 3)
      .toArray(newPositions, dstIndex * 3);
  };
  
  // copy over only the triangles that are not completely masked
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aMasked = depthFloatImageData[a] !== 0;
    const bMasked = depthFloatImageData[b] !== 0;
    const cMasked = depthFloatImageData[c] !== 0;
    if (!(aMasked && bMasked && cMasked)) { // if not all are masked, then keep the triangle
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
      
      // if at least one of them is masked, we have a boundary point, so snap it
      if (aMasked || bMasked || cMasked) {
        !aMasked && _snapPoint(a);
        !bMasked && _snapPoint(b);
        !cMasked && _snapPoint(c);
      }
    }
  }
  // set the new attributes
  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
const getSemanticPlanes = async (img, fov, newDepthFloatImageData, segmentMask) => {
  const focalLength = fovToFocalLength(fov);

  let planesJson;
  let planesMask;
  let portalJson;
  let portalMask;
  await Promise.all([
    // floor planes
    (async () => {
      let hadValue = false;
      let newDepthFloatImageData1 = newDepthFloatImageData.map((n, index) => {
        const index2 = segmentMask[index];
        if (categoryClassIndices.floor.includes(index2)) {
          hadValue = true;
          return n;
        } else {
          return Infinity;
        }
      });
      if (!hadValue) { // if the mask was empty, use the original data
        newDepthFloatImageData1 = newDepthFloatImageData;
      }
      
      const {width, height} = img;
      const planesSpec = await getPlanesRgbd(
        width,
        height,
        focalLength,
        newDepthFloatImageData1,
        10000,
      );
      planesJson = planesSpec.planesJson;
      planesMask = planesSpec.planesMask;

      const planesCanvas = planesMask2Canvas(planesMask, {
        color: true,
      });
      planesCanvas.classList.add('planeDetectionCanvas');
      planesCanvas.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(planesCanvas);
    })(),
    // portal planes
    (async () => {
      // let hadValue = false;
      let newDepthFloatImageData2 /*= newDepthFloatImageData.map((n, index) => {
        const index2 = segmentMask[index];
        if (categoryClassIndices.portal.includes(index2)) {
          hadValue = true;
          return n;
        } else {
          return Infinity;
        }
      });
      if (!hadValue) { // if the mask was empty, use the original data */
        newDepthFloatImageData2 = newDepthFloatImageData;
      // }

      const {width, height} = img;
      const portalSpec = await getPlanesRgbd(
        width,
        height,
        focalLength,
        newDepthFloatImageData2,
        5000,
      );
      portalJson = portalSpec.planesJson;
      portalMask = portalSpec.planesMask;

      const portalCanvas = planesMask2Canvas(portalMask, {
        color: true,
      });
      portalCanvas.classList.add('portalDetectionCanvas');
      portalCanvas.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(portalCanvas);
    })(),
  ]);
  return {
    planesJson,
    planesMask,
    portalJson,
    portalMask,
  };
}

//

class Selector {
  constructor({
    renderer,
    camera,
    mouse,
    raycaster,
  }) {
    this.renderer = renderer;
    this.camera = camera;
    this.mouse = mouse;
    this.raycaster = raycaster;

    this.lensEnabled = false;
    this.indicesEnabled = false;
    this.eraserEnabled = false;
    this.pickerEnabled = false;
    this.pickerIndex = -1;
    this.mousedown = false;

    this.sceneMeshes = [];
    this.indexMeshes = [];
    
    const lensRenderTarget = new THREE.WebGLRenderTarget(selectorSize, selectorSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.lensRenderTarget = lensRenderTarget;

    const lensMaterial = new LensMaterial({
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      selectorSize,
    });
    this.lensMaterial = lensMaterial;
    
    const lensScene = new THREE.Scene();
    lensScene.autoUpdate = false;
    lensScene.overrideMaterial = lensMaterial;
    this.lensScene = lensScene;

    const lensOutputMesh = (() => {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tIndex: {
            value: lensRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D tIndex;
          varying vec2 vUv;
          void main() {
            vec4 indexRgba = texture2D(tIndex, vUv);
            
            // encode the index as rgba
            // float r = floor(fIndex / 65536.0);
            // fIndex -= r * 65536.0;
            // float g = floor(fIndex / 256.0);
            // fIndex -= g * 256.0;
            // float b = floor(fIndex / 1.0);
            // fIndex -= b * 1.0;
            // gl_FragColor = vec4(r, g, b, 1.);

            gl_FragColor = vec4(indexRgba.rgb / 255.0, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.lensOutputMesh = lensOutputMesh;

    // index full screen pass 
    const indicesRenderTarget = new THREE.WebGLRenderTarget((panelSize - 1) * 2, panelSize - 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      // type: THREE.FloatType,
    });
    this.indicesRenderTarget = indicesRenderTarget;

    const indicesScene = new THREE.Scene();
    indicesScene.autoUpdate = false;
    this.indicesScene = indicesScene;

    const indexMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iResolution: {
          value: new THREE.Vector2(this.indicesRenderTarget.width, this.indicesRenderTarget.height),
          needsUpdate: true,
        },
        uPointerCircle: {
          value: new THREE.Vector3(),
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute vec3 point1;
        attribute vec3 point2;
        attribute vec3 point3;
        varying vec3 vPoint1;
        varying vec3 vPoint2;
        varying vec3 vPoint3;

        void main() {
          vPoint1 = point1;
          vPoint2 = point2;
          vPoint3 = point3;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        uniform vec2 iResolution;
        uniform vec3 uPointerCircle;
        varying vec3 vPoint1;
        varying vec3 vPoint2;
        varying vec3 vPoint3;

        struct Point {
          float x;
          float y;
        };
        struct Triangle {
          Point a;
          Point b;
          Point c;
        };

        bool pointInTriangle(Point point, Triangle triangle) {
          //compute vectors & dot products
          float cx = point.x;
          float cy = point.y;
          Point t0 = triangle.a;
          Point t1 = triangle.b;
          Point t2 = triangle.c;
          float v0x = t2.x-t0.x;
          float v0y = t2.y-t0.y;
          float v1x = t1.x-t0.x;
          float v1y = t1.y-t0.y;
          float v2x = cx-t0.x;
          float v2y = cy-t0.y;
          float dot00 = v0x*v0x + v0y*v0y;
          float dot01 = v0x*v1x + v0y*v1y;
          float dot02 = v0x*v2x + v0y*v2y;
          float dot11 = v1x*v1x + v1y*v1y;
          float dot12 = v1x*v2x + v1y*v2y;
        
          // Compute barycentric coordinates
          float b = (dot00 * dot11 - dot01 * dot01);
          float inv = (b == 0.) ? 0. : (1. / b);
          float u = (dot11*dot02 - dot01*dot12) * inv;
          float v = (dot00*dot12 - dot01*dot02) * inv;
          return u>=0. && v>=0. && (u+v < 1.);
        }
        bool pointCircleCollision(Point point, Point circle, float r) {
          if (r==0.) return false;
          float dx = circle.x - point.x;
          float dy = circle.y - point.y;
          return dx * dx + dy * dy <= r * r;
        }
        bool lineCircleCollision(Point a, Point b, Point circle, float radius/*, nearest*/) {
          //check to see if start or end points lie within circle 
          if (pointCircleCollision(a, circle, radius)) {
            // if (nearest) {
            //     nearest[0] = a[0]
            //     nearest[1] = a[1]
            // }
            return true;
          } if (pointCircleCollision(b, circle, radius)) {
            // if (nearest) {
            //     nearest[0] = b[0]
            //     nearest[1] = b[1]
            // }
            return true;
          }
          
          float x1 = a.x;
          float y1 = a.y;
          float x2 = b.x;
          float y2 = b.y;
          float cx = circle.x;
          float cy = circle.y;
    
          //vector d
          float dx = x2 - x1;
          float dy = y2 - y1;
          
          //vector lc
          float lcx = cx - x1;
          float lcy = cy - y1;
          
          //project lc onto d, resulting in vector p
          float dLen2 = dx * dx + dy * dy; //len2 of d
          float px = dx;
          float py = dy;
          if (dLen2 > 0.) {
            float dp = (lcx * dx + lcy * dy) / dLen2;
            px *= dp;
            py *= dp;
          }
          
          // if (!nearest)
          //     nearest = tmp
          // const tmp = [0, 0]
          Point tmp;
          tmp.x = x1 + px;
          tmp.y = y1 + py;
          
          //len2 of p
          float pLen2 = px * px + py * py;
          
          //check collision
          return pointCircleCollision(tmp, circle, radius) &&
            pLen2 <= dLen2 &&
            (px * dx + py * dy) >= 0.;
        }

        bool triangleCircleCollision(Triangle triangle, Point circle, float radius) {
          if (pointInTriangle(circle, triangle))
              return true;
          if (lineCircleCollision(triangle.a, triangle.b, circle, radius))
              return true;
          if (lineCircleCollision(triangle.b, triangle.c, circle, radius))
              return true;
          if (lineCircleCollision(triangle.c, triangle.a, circle, radius))
              return true;
          return false;
        }

        void main() {
          // project the points
          vec4 point1Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint1, 1.0);
          point1Tmp /= point1Tmp.w;
          vec2 point1 = point1Tmp.xy;

          vec4 point2Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint2, 1.0);
          point2Tmp /= point2Tmp.w;
          vec2 point2 = point2Tmp.xy;

          vec4 point3Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint3, 1.0);
          point3Tmp /= point3Tmp.w;
          vec2 point3 = point3Tmp.xy;

          Triangle triangle;
          triangle.a.x = point1.x;
          triangle.a.y = point1.y;
          triangle.b.x = point2.x;
          triangle.b.y = point2.y;
          triangle.c.x = point3.x;
          triangle.c.y = point3.y;

          Point circle;
          circle.x = uPointerCircle.x;
          circle.y = uPointerCircle.y;

          float radius = uPointerCircle.z;

          float v;
          if (triangleCircleCollision(triangle, circle, radius)) {
            v = 1.;
          } else {
            v = 0.;
          }
          gl_FragColor = vec4(vec3(v), 1.);
        }
      `,
    });
    this.indexMaterial = indexMaterial;

    const indicesOutputMesh = (() => {
      const scale = 10;
      const geometry = new THREE.PlaneGeometry(2, 1)
        .scale(scale, scale, scale);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          indicesTexture: {
            value: indicesRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D indicesTexture;
          varying vec2 vUv;
          void main() {
            vec4 indicesRgba = texture2D(indicesTexture, vUv);
            gl_FragColor = vec4(indicesRgba.rgb, 1.0);
            gl_FragColor.rg += 0.5 * vUv;
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.indicesOutputMesh = indicesOutputMesh;
  }
  setTool(tool) {
    this.lensEnabled = [
      'eraser',
      'segment',
      'plane',
    ].includes(tool);
    this.indicesEnabled = [
      'eraser',
    ].includes(tool);
    this.eraserEnabled = [
      'eraser',
    ].includes(tool);
    this.pickerEnabled = [
      'segment',
    ].includes(tool);
  }
  setMouseDown(mousedown) {
    this.mousedown = mousedown;
  }
  addMesh(sceneMesh) {
    this.sceneMeshes.push(sceneMesh);

    // index mesh
    const indexMesh = (() => {
      const planeGeometry = new THREE.PlaneGeometry(1, 1)
        .translate(0.5, 0.5, 0);
      // position x, y is in the range [0, 1]
      const sceneMeshGeometry = sceneMesh.geometry;

      const {width, height} = this.indicesRenderTarget;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // const coords = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // for each plane, we copy in the sceneMeshGeometry triangle vertices it represents
      /* const triangles = new Float32Array(9 * planeGeometry.attributes.position.array.length * width * height);
      if (triangles.length !== sceneMeshGeometry.attributes.position.array * 9) {
        console.warn('triangle count mismatch 1', triangles.length, sceneMeshGeometry.attributes.position.array * 9);
        debugger;
      }
      if (triangles.length !== positions.length * 3) {
        console.warn('triangle count mismatch 2', positions.length, triangles.length * 3);
        debugger;
      } */
      // if (width * height * 9 !== sceneMeshGeometry.attributes.position.array.length) {
      //   console.warn('invalid width/height', width, height, sceneMeshGeometry.attributes.position.array.length);
      //   debugger;
      // }
      const pt1 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt2 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt3 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // if (pt1.length !== sceneMeshGeometry.attributes.position.array.length * 3) {
      //   console.warn('triangle count mismatch 1', pt1.length, sceneMeshGeometry.attributes.position.array.length * 3);
      //   debugger;
      // }
      const indices = new Uint32Array(planeGeometry.index.array.length * width * height);
      let positionOffset = 0;
      let indexOffset = 0;
      let triangleReadOffset = 0;
      let triangleWriteOffset = 0;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const uvx = dx / width;
          const uvy = dy / height;

          // convert to ndc
          const ndcx = uvx * 2 - 1;
          const ndcy = uvy * 2 - 1;

          for (let i = 0; i < planeGeometry.attributes.position.array.length; i += 3) {
            // get the position offset
            // note: * 2 because we are in the range [-1, 1]
            const pox = planeGeometry.attributes.position.array[i + 0] / width * 2;
            const poy = planeGeometry.attributes.position.array[i + 1] / height * 2;

            // copy position
            positions[positionOffset + i + 0] = ndcx + pox;
            positions[positionOffset + i + 1] = ndcy + poy;
            positions[positionOffset + i + 2] = 0;

            // coord
            // const index = dx + dy * selectorSize;
            // coords[positionOffset + i + 0] = dx;
            // coords[positionOffset + i + 1] = dy;
            // coords[positionOffset + i + 2] = index;

            // triangle
            pt1[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 0];
            pt1[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 1];
            pt1[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 2];

            pt2[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 3];
            pt2[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 4];
            pt2[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 5];

            pt3[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 6];
            pt3[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 7];
            pt3[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 8];
          }
          positionOffset += planeGeometry.attributes.position.array.length;

          triangleWriteOffset += planeGeometry.attributes.position.array.length;
          triangleReadOffset += 9;

          const localIndexOffset = positionOffset / 3;
          for (let i = 0; i < planeGeometry.index.array.length; i++) {
            indices[indexOffset + i] = planeGeometry.index.array[i] + localIndexOffset;
          }
          indexOffset += planeGeometry.index.array.length;
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      // geometry.setAttribute('coord', new THREE.BufferAttribute(coords, 3));
      geometry.setAttribute('point1', new THREE.BufferAttribute(pt1, 3));
      geometry.setAttribute('point2', new THREE.BufferAttribute(pt2, 3));
      geometry.setAttribute('point3', new THREE.BufferAttribute(pt3, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));

      const material = this.indexMaterial;

      const indexMesh = new THREE.Mesh(geometry, material);
      indexMesh.frustumCulled = false;
      indexMesh.setTransformToParent = () => {
        indexMesh.position.copy(sceneMesh.position);
        indexMesh.quaternion.copy(sceneMesh.quaternion);
        indexMesh.scale.copy(sceneMesh.scale);
        indexMesh.updateMatrixWorld();
      };
      return indexMesh;
    })();
    this.indicesScene.add(indexMesh);
    this.indexMeshes.push(indexMesh);
  }
  update() {
    const _renderSelector = () => {
      // push
      const oldRenderTarget = this.renderer.getRenderTarget();

      // update
      {
        // lens material
        const selectorSizeM1 = selectorSize - 1;
        const halfSelectorSizeM1 = selectorSizeM1 / 2;
        this.lensMaterial.uniforms.viewport.value.set(
          (this.mouse.x / 2 + 0.5) * this.renderer.domElement.width - halfSelectorSizeM1 - 1,
          (this.mouse.y / 2 + 0.5) * this.renderer.domElement.height - halfSelectorSizeM1 - 1,
          selectorSize,
          selectorSize
        );
        this.lensMaterial.uniforms.viewport.needsUpdate = true;

        // index material
        const radiusPixels = 100;
        const radius = radiusPixels / this.renderer.domElement.width;
        this.indexMaterial.uniforms.uPointerCircle.value.set(this.mouse.x, this.mouse.y, radius);
        this.indexMaterial.uniforms.uPointerCircle.needsUpdate = true;

        // index meshes
        for (const mesh of this.indexMeshes) {
          mesh.setTransformToParent();
        }
      }

      // attach
      const _restoreParents = (() => {
        const parents = this.sceneMeshes.map(sceneMesh => {
          const {parent} = sceneMesh;
          this.lensScene.add(sceneMesh);
          return parent;
        });
        return () => {
          for (let i = 0; i < parents.length; i++) {
            parents[i].add(this.sceneMeshes[i]);
          }
        };
      })();

      // render lens
      if (this.lensEnabled) {
        this.renderer.setRenderTarget(this.lensRenderTarget);
        this.renderer.render(this.lensScene, this.camera);
      }

      // render indices scene
      if (this.indicesEnabled) {
        this.renderer.setRenderTarget(this.indicesRenderTarget);
        this.renderer.render(this.indicesScene, this.camera);
      }

      if (this.pickerEnabled) {
        // read the middle pixel
        const lensFloat32Data = localFloat32Array4;
        const selectorSizeM1 = selectorSize - 1;
        this.renderer.readRenderTargetPixels(this.lensRenderTarget, selectorSizeM1 / 2, selectorSizeM1 / 2, 1, 1, lensFloat32Data);
        // encode the index as rgba
        // float r = floor(fIndex / 65536.0);
        // fIndex -= r * 65536.0;
        // float g = floor(fIndex / 256.0);
        // fIndex -= g * 256.0;
        // float b = floor(fIndex / 1.0);
        // fIndex -= b * 1.0;
        // gl_FragColor = vec4(r, g, b, 1.);
        const a = lensFloat32Data[3];
        if (a > 0) {
          const index = Math.floor(lensFloat32Data[0] * 65536 + lensFloat32Data[1] * 256 + lensFloat32Data[2]);
          
          // look up the position index in the scene mesh indexed geometry
          if (this.sceneMeshes.length === 1) {
            // nothing
          } else {
            console.warn('only implemented for one scene mesh');
            debugger;
          }
          const firstSceneMesh = this.sceneMeshes[0]; // note: using first scene mesh only
          const index2 = firstSceneMesh.indexedGeometry.index.array[index] * 3;
          if (index2 === undefined) {
            console.warn('index2 is undefined');
            debugger;
          }

          if (index2 >= 0 && index2 < (this.renderer.domElement.width * this.renderer.domElement.height)) {
            this.pickerIndex = index2;
          } else {
            this.pickerIndex = -1;
          }
        } else {
          this.pickerIndex = -1;
        }
      } else {
        this.pickerIndex = -1;
      }

      // restore
      _restoreParents();

      // pop
      this.renderer.setRenderTarget(oldRenderTarget);
    };
    _renderSelector();

    const _updateSceneMeshes = () => {
      for (const sceneMesh of this.sceneMeshes) {
        // if (!this.selector) {
        //   console.warn('no selector', this);
        //   debugger;
        // }
        sceneMesh.update(this);
      }
    };
    _updateSceneMeshes();

    const _updateEraser = () => {
      if (this.eraserEnabled && this.mousedown) {
        const lensUint8Data = localUint8ArrayPanelSize;
        this.renderer.readRenderTargetPixels(
          this.indicesRenderTarget,
          0,
          0,
          this.indicesRenderTarget.width,
          this.indicesRenderTarget.height,
          lensUint8Data,
        );

        if (this.sceneMeshes.length === 1) {
          // nothing
        } else {
          console.warn('only implemented for one scene mesh');
          debugger;
        }
        const firstSceneMesh = this.sceneMeshes[0]; // note: using first scene mesh only

        const triangleIdAttribute = firstSceneMesh.geometry.attributes.triangleId;
        for (let i = 0; i < triangleIdAttribute.count; i += 3) {
          const triangleId = Math.floor(i / 3);

          const x = triangleId % this.indicesRenderTarget.width;
          const y = Math.floor(triangleId / this.indicesRenderTarget.width);

          const j = y * this.indicesRenderTarget.width + x;
          const r = lensUint8Data[j * 4 + 0];

          if (r > 0) {
            const baseIndex = triangleId * 9;

            firstSceneMesh.geometry.attributes.position.array[baseIndex + 0] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 1] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 2] = 0;

            firstSceneMesh.geometry.attributes.position.array[baseIndex + 3] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 4] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 5] = 0;

            firstSceneMesh.geometry.attributes.position.array[baseIndex + 6] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 7] = 0;
            firstSceneMesh.geometry.attributes.position.array[baseIndex + 8] = 0;

            firstSceneMesh.geometry.attributes.position.needsUpdate = true;
          }
        }
      }
    };
    _updateEraser();
  }
}

//

class Overlay {
  constructor({
    renderer,
    selector,
  }) {
    this.renderer = renderer;
    this.selector = selector;

    this.segmentPickerEnabled = false;

    const overlayScene = new THREE.Scene();
    overlayScene.autoUpdate = false;
    this.overlayScene = overlayScene;

    this.sceneOverlayMeshes = [];
    this.arrowMeshes = [];
  }
  addMesh(sceneMesh) {
    // if (!sceneMesh) {
    //   console.warn('no sceneMesh', sceneMesh);
    //   debugger;
    // }

    const geometry = sceneMesh.geometry.clone();
    const {
      segmentLabels,
      segmentLabelIndices,
      planeLabels,
      planeLabelIndices,
      portalLabels,
      // segmentSpecs,
      // planeSpecs,
      // portalSpecs,
      segmentArray,
      firstFloorPlaneIndex,
    } = sceneMesh;

    const sceneOverlayMesh = new THREE.Object3D();
    sceneOverlayMesh.setTransformToParent = () => {
      sceneOverlayMesh.position.copy(sceneMesh.position);
      sceneOverlayMesh.quaternion.copy(sceneMesh.quaternion);
      sceneOverlayMesh.scale.copy(sceneMesh.scale);
      sceneOverlayMesh.updateMatrixWorld();
    };
    sceneOverlayMesh.update = () => {
      sceneOverlayMesh.setTransformToParent();
    };
    this.overlayScene.add(sceneOverlayMesh);
    this.sceneOverlayMeshes.push(sceneOverlayMesh);

    // arrows spritesheet mesh
    const arrowSize = 0.5;
    const arrowDemoSize = 0.2;
    const arrowGeometry = new THREE.PlaneGeometry(arrowSize, arrowSize);
    const makeArrowsMesh = () => {
      const tex = new THREE.Texture();
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;

      (async () => {
        const img = new Image();
        img.crossOrigin = true;
        img.src = arrowsUpUrl;
        await new Promise((accept, reject) => {
          img.onload = accept;
          img.onerror = reject;
        });

        tex.image = img;
        tex.needsUpdate = true;
      })();

      const material = new THREE.ShaderMaterial({
        uniforms: {
          tex: {
            value: tex,
            needsUpdate: true,
          },
          uTime: {
            value: 0,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D tex;
          uniform float uTime;
          varying vec2 vUv;

          const float numFrames = ${numFrames.toFixed(8)};
          const float numFramesPerRow = ${numFramesPerRow.toFixed(8)};
          const float frameSize = ${frameSize.toFixed(8)};
          const float canvasSize = ${canvasSize.toFixed(8)};
          const float frameTime = 50.;

          void main() {
            float frameIndex = mod(floor(uTime / frameTime), numFrames);
            float frameX = mod(frameIndex, numFramesPerRow);
            float frameY = floor(frameIndex / numFramesPerRow);
            vec2 frameUv = vec2(
              (frameX + vUv.x) * frameSize / canvasSize,
              (frameY + vUv.y) * frameSize / canvasSize
            );

            gl_FragColor = texture2D(tex, frameUv);
            if (!gl_FrontFacing) {
              gl_FragColor.rgb *= 0.5;
            }
            if (gl_FragColor.a < 0.1) {
              discard;
            }
          }
        `,
        transparent: true,
        // alphaTest: 0.1,
        alphaToCoverage: true,
        // side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(arrowGeometry, material);
      mesh.frustumCulled = false;
      mesh.update = () => {
        mesh.material.uniforms.uTime.value = performance.now();
        mesh.material.uniforms.uTime.needsUpdate = true;
      };
      return mesh;
    };
    const arrowsMesh = makeArrowsMesh();
    arrowsMesh.scale.setScalar(arrowDemoSize / arrowSize);
    arrowsMesh.updateMatrixWorld();
    sceneOverlayMesh.add(arrowsMesh);
    this.arrowMeshes.push(arrowsMesh);

    // arrow meshes
    const makeArrowMesh = arrowUrl => {
      const tex = new THREE.Texture();
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;

      (async () => {
        const img = new Image();
        img.crossOrigin = true;
        img.src = arrowUrl;
        await new Promise((accept, reject) => {
          img.onload = accept;
          img.onerror = reject;
        });
        tex.image = img;
        tex.needsUpdate = true;
      })();
      
      const material = new THREE.MeshBasicMaterial({
        // color: 0x000000,
        map: tex,
        transparent: true,
        // opacity: 0.5,
        alphaTest: 0.1,
        alphaToCoverage: true,
      });
      const mesh = new THREE.Mesh(arrowGeometry, material);
      mesh.frustumCulled = false;
      return mesh;
    };
    const arrowUrls = [
      arrowUpBrightUrl,
      arrowUpDimUrl,
    ];
    for (let i = 0; i < arrowUrls.length; i++) {
      const arrowUrl = arrowUrls[i];
      const arrowMesh = makeArrowMesh(arrowUrl);
      arrowMesh.position.x = -arrowDemoSize + i * arrowDemoSize * 2;
      arrowMesh.scale.setScalar(arrowDemoSize / arrowSize);
      arrowMesh.updateMatrixWorld();
      arrowMesh.frustumCulled = false;
      arrowMesh.update = () => {
        // nothing
      };
      sceneOverlayMesh.add(arrowMesh);
      this.arrowMeshes.push(arrowMesh);
    }

    /* // add barycentric coordinates
    const barycentric = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.array.length), 3);
    for (let i = 0; i < barycentric.array.length; i += 9) {
      barycentric.array[i + 0] = 1;
      barycentric.array[i + 1] = 0;
      barycentric.array[i + 2] = 0;

      barycentric.array[i + 3] = 0;
      barycentric.array[i + 4] = 1;
      barycentric.array[i + 5] = 0;

      barycentric.array[i + 6] = 0;
      barycentric.array[i + 7] = 0;
      barycentric.array[i + 8] = 1;
    }
    geometry.setAttribute('barycentric', barycentric); */

    const _makeOverlayMesh = ({
      renderMode,
    }) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uRenderMode: {
            value: renderMode,
            needsUpdate: true,
          },
          uSelectorIndex: {
            value: -1,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          attribute float segment;
          attribute vec3 segmentColor;
          attribute float plane;
          attribute vec3 planeColor;
          // attribute float portal;
          // attribute vec3 portalColor;
          // attribute vec3 barycentric;
          
          flat varying float vSegment;
          flat varying vec3 vSegmentColor;
          flat varying float vPlane;
          flat varying vec3 vPlaneColor;
          // varying float vPortal;
          // flat varying vec3 vPortalColor;
          // varying vec3 vBarycentric;
          varying vec2 vUv;
          varying vec3 vPosition;
  
          void main() {
            vSegment = segment;
            vSegmentColor = segmentColor;
            vPlane = plane;
            vPlaneColor = planeColor;
            // vPortal = portal;
            // vPortalColor = portalColor;
  
            // vBarycentric = barycentric;
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform int uRenderMode;
          uniform int uSelectorIndex;
          
          flat varying float vSegment;
          flat varying vec3 vSegmentColor;
          flat varying float vPlane;
          flat varying vec3 vPlaneColor;
          // varying vec3 vBarycentric;
          // varying float vPortal;
          // flat varying vec3 vPortalColor;
          varying vec2 vUv;
          varying vec3 vPosition;
  
          const float lineWidth = 0.1;
          const vec3 lineColor = vec3(${new THREE.Vector3(0x00BBCC).toArray().map(n => n.toFixed(8)).join(',')});
  
          float edgeFactor(vec3 bary, float width) {
            // vec3 bary = vec3(vBC.x, vBC.y, 1.0 - vBC.x - vBC.y);
            vec3 d = fwidth(bary);
            vec3 a3 = smoothstep(d * (width - 0.5), d * (width + 0.5), bary);
            return min(min(a3.x, a3.y), a3.z);
          }
  
          void main() {
            vec2 uv = vUv;
            float b = 0.05;
            float f = min(mod(uv.x, b), mod(uv.y, b));
            f = min(f, mod(1.-uv.x, b));
            f = min(f, mod(1.-uv.y, b));
            f *= 200.;
  
            float a = max(1. - f, 0.);
            a = max(a, 0.5);
  
            if (uRenderMode == 0) {
              vec3 c = lineColor;
              vec3 p = vPosition;
  
              gl_FragColor = vec4(c, a);
              gl_FragColor.rg = uv;
            } else if (uRenderMode == 1) {
              gl_FragColor = vec4(vSegmentColor, a);
              
              // highlight support
              if (uSelectorIndex != -1) {
                if (vSegment == float(uSelectorIndex)) {
                  // nothing
                } else {
                  gl_FragColor.rgb *= 0.2;
                }
                gl_FragColor.a = max(gl_FragColor.a, 0.7);
              }
            } else if (uRenderMode == 2) {
              gl_FragColor = vec4(vPlaneColor, 0.7);
            } else if (uRenderMode == 3) {
              // gl_FragColor = vec4(vPortalColor, 0.5);
              gl_FragColor = vec4(0., 0., 0., 0.5);
            } else {
              // gl_FragColor = vec4(1., 0., 0., 1.);
              discard;
            }
          }
        `,
        transparent: true,
        alphaToCoverage: true,
        // polygon offset to front
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const mesh = new THREE.Mesh(
        geometry,
        material,
      );
      mesh.frustumCulled = false;
      mesh.update = () => {
        if (this.segmentPickerEnabled) {
          const {pickerIndex} = this.selector;
          let selectorIndex;
          if (pickerIndex !== -1) {
            const segmentIndex = segmentArray[pickerIndex];
            if (segmentIndex !== undefined) {
              selectorIndex = segmentIndex;
            } else {
              console.warn('no segment index', this, segmentArray, pickerIndex);
              debugger;
            }
          } else {
            selectorIndex = -1;
          }
          material.uniforms.uSelectorIndex.value = selectorIndex;
          material.uniforms.uSelectorIndex.needsUpdate = true;
        }
      };
      return mesh;
    };

    // lens mesh
    const toolOverlayMeshSpecs = [
      {
        name: 'eraser',
        renderMode: 0,
      },
      {
        name: 'segment',
        renderMode: 1,
      },
      {
        name: 'plane',
        renderMode: 2,
      },
      {
        name: 'portal',
        renderMode: 3,
      },
    ];
    this.toolOverlayMeshes = {};
    for (let i = 0; i < toolOverlayMeshSpecs.length; i++) {
      const toolOverlayMeshSpec = toolOverlayMeshSpecs[i];
      const {
        name,
        renderMode,
      } = toolOverlayMeshSpec;
      const overlayMesh = _makeOverlayMesh({
        renderMode,
      });
      overlayMesh.visible = false;
      sceneOverlayMesh.add(overlayMesh);
      this.toolOverlayMeshes[name] = overlayMesh;
    }

    // segment text meshes
    {
      const segmentMesh = this.toolOverlayMeshes['segment'];
      for (const label of segmentLabels) {
        const {index, bbox} = label;
        const name = classes[index];

        const boundingBox = localBox.set(
          localVector.fromArray(bbox[0]),
          localVector2.fromArray(bbox[1])
        );
        const center = boundingBox.getCenter(localVector);
        const size = boundingBox.getSize(localVector2);
        
        {
          const textMesh = new Text();
          textMesh.position.copy(center);
          textMesh.position.z += size.z / 2;
          textMesh.updateMatrixWorld();

          textMesh.text = name;
          textMesh.fontSize = 0.2;
          textMesh.anchorX = 'center';
          textMesh.anchorY = 'middle';
          textMesh.color = 0x000000;
          textMesh.sync();

          segmentMesh.add(textMesh);
        }
      }
    }

    // plane gizmo meshes
    {
      const planeMesh = this.toolOverlayMeshes['plane'];

      const planeArrowMeshes = [];
      const planeMeshes = [];
      for (const label of planeLabels) {
        // compute label planes
        const center = localVector.fromArray(label.center);
        const normal = localVector2.fromArray(label.normal);

        // arrow mesh
        const arrowMesh = new ArrowMesh();
        arrowMesh.geometry = arrowMesh.geometry.clone();
        arrowMesh.geometry.translate(0, 1, 0);
        arrowMesh.geometry.rotateX(-Math.PI / 2);
        arrowMesh.geometry.scale(0.1, 0.1, 0.1);
        arrowMesh.position.copy(center);
        normalToQuaternion(normal, arrowMesh.quaternion, backwardVector);
        arrowMesh.updateMatrixWorld();
        arrowMesh.frustumCulled = false;
        planeMesh.add(arrowMesh);
        planeArrowMeshes.push(arrowMesh);

        // grid mesh
        const gridMesh = new GridMesh();
        gridMesh.position.copy(arrowMesh.position);
        gridMesh.quaternion.copy(arrowMesh.quaternion);
        gridMesh.updateMatrixWorld();
        gridMesh.frustumCulled = false;
        planeMesh.add(gridMesh);
        planeMeshes.push(gridMesh);
      }

      if (firstFloorPlaneIndex !== -1) {
        planeArrowMeshes[firstFloorPlaneIndex].material.color.set(0x00FF00);

        planeMeshes[firstFloorPlaneIndex].material.uniforms.uColor.value.set(0x00FF00);
        planeMeshes[firstFloorPlaneIndex].material.uniforms.uColor.needsUpdate = true;
      }
    }

    // portal gizmo meshes
    {
      const portalMesh = this.toolOverlayMeshes['portal'];

      for (const label of portalLabels) {
        // compute label planes
        const center = localVector.fromArray(label.center);
        const normal = localVector2.fromArray(label.normal);

        // arrow mesh
        const arrowMesh = makeArrowsMesh();
        arrowMesh.position.copy(center);
        normalToQuaternion(normal, arrowMesh.quaternion, upVector)
          .multiply(localQuaternion.setFromAxisAngle(upVector, Math.PI));
        arrowMesh.updateMatrixWorld();
        arrowMesh.frustumCulled = false;
        portalMesh.add(arrowMesh);
        this.arrowMeshes.push(arrowMesh);
      }
    }
  }
  setTool(tool) {
    for (const k in this.toolOverlayMeshes) {
      const toolOverlayMesh = this.toolOverlayMeshes[k];
      toolOverlayMesh.visible = k === tool;
    }

    this.segmentPickerEnabled = [
      'segment',
    ].includes(tool);
  }
  update() {
    for (const mesh of this.sceneOverlayMeshes) {
      mesh.update();
    }
    for (const k in this.toolOverlayMeshes) {
      const toolOverlayMesh = this.toolOverlayMeshes[k];
      toolOverlayMesh.update();
    }
    for (const mesh of this.arrowMeshes) {
      mesh.update();
    }
  }
}

//

class PortalNetMesh extends THREE.Mesh {
  constructor({
    portalLocations,
  }) {
    const baseGeometry = (() => {
      const baseSize = 0.1;
      const geometries = [
        new THREE.BoxGeometry(baseSize, baseSize, baseSize),
        new THREE.BoxGeometry(baseSize * 0.2, baseSize * 2, baseSize * 0.2)
          .translate(0, baseSize, 0),
        new THREE.BoxGeometry(baseSize * 0.2, baseSize * 0.2, baseSize)
          .translate(0, 0, -baseSize / 2),
      ];
      return BufferGeometryUtils.mergeBufferGeometries(geometries);
    })();
    const geometries = portalLocations.map(portalLocation => {
      const g = baseGeometry.clone();
      g.applyMatrix4(
        localMatrix.compose(
          localVector.fromArray(portalLocation.position),
          localQuaternion.fromArray(portalLocation.quaternion),
          localVector2.setScalar(1)
        )
      );
      return g;
    });
    const geometry = geometries.length > 0 ? BufferGeometryUtils.mergeBufferGeometries(geometries) : new THREE.BufferGeometry();

    const material = new THREE.ShaderMaterial({
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        varying vec2 vUv;

        void main() {
          vec3 c = vec3(0., 0.5, 1.);
          gl_FragColor = vec4(c, 0.5);
          gl_FragColor.rg += vUv * 0.2;
        }
      `,
      transparent: true,
    });
    super(geometry, material);

    const hasGeometry = geometries.length > 0;

    const portalNetMesh = this;
    portalNetMesh.frustumCulled = false;
    portalNetMesh.enabled = false;
    portalNetMesh.visible = false;
    portalNetMesh.updateVisibility = () => {
      portalNetMesh.visible = portalNetMesh.enabled && hasGeometry;
    };
  }
}

//

class EntranceExitMesh extends THREE.Mesh {
  constructor({
    entranceExitLocations,
  }) {
    const baseGeometry = new THREE.BoxGeometry(entranceExitWidth, entranceExitHeight, entranceExitDepth)
      .translate(0, entranceExitHeight / 2, entranceExitDepth / 2);
    const geometries = entranceExitLocations.map(portalLocation => {
      const g = baseGeometry.clone();
      g.applyMatrix4(
        localMatrix.compose(
          localVector.fromArray(portalLocation.position),
          localQuaternion.fromArray(portalLocation.quaternion),
          localVector2.setScalar(1)
        )
      );
      return g;
    });
    const geometry = geometries.length > 0 ? BufferGeometryUtils.mergeBufferGeometries(geometries) : new THREE.BufferGeometry();

    const material = new THREE.ShaderMaterial({
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        varying vec2 vUv;

        void main() {
          vec3 c = vec3(1., 0., 1.);
          gl_FragColor = vec4(c, 0.5);
          gl_FragColor.rg += vUv * 0.2;
        }
      `,
      transparent: true,
    });
    super(geometry, material);

    const hasGeometry = geometries.length > 0;

    const entranceExitMesh = this;
    entranceExitMesh.frustumCulled = false;
    entranceExitMesh.enabled = false;
    entranceExitMesh.visible = false;
    entranceExitMesh.updateVisibility = () => {
      entranceExitMesh.visible = entranceExitMesh.enabled && hasGeometry;
    };
  }
}

//

class OutmeshToolMesh extends THREE.Object3D {
  constructor() {
    super();

    const targetMesh = new TargetMesh();
    targetMesh.frustumCulled = false;
    targetMesh.visible = true;

    const blinkMesh = new BlinkMesh();
    blinkMesh.frustumCulled = false;
    blinkMesh.visible = false;

    //

    const frustumGeometry = new THREE.BoxGeometry(1, 1, 1)
      // .translate(0, 0, -0.5);

    const frustumMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        uWorldBoxMin: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        uWorldBoxMax: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
      },
      vertexShader: `\
        uniform float uTime;
        uniform vec3 uWorldBoxMin;
        uniform vec3 uWorldBoxMax;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vLocalPosition;

        void main() {
          vUv = uv;
          // vNormal = normalMatrix * normal;
          vNormal = normal;

          vec3 p = vec3(0.);
          if (position.z < 0.) {
            if (position.x < 0.) {
              p.x = uWorldBoxMin.x;
            } else {
              p.x = -uWorldBoxMin.x;
            }
            if (position.y < 0.) {
              p.y = uWorldBoxMin.y;
            } else {
              p.y = -uWorldBoxMin.y;
            }
            p.z = uWorldBoxMin.z;
          } else {
            if (position.x < 0.) {
              p.x = -uWorldBoxMax.x;
            } else {
              p.x = uWorldBoxMax.x;
            }
            if (position.y < 0.) {
              p.y = -uWorldBoxMax.y;
            } else {
              p.y = uWorldBoxMax.y;
            }
            p.z = uWorldBoxMax.z;

            p *= 0.5;
          }

          vPosition = (modelMatrix * vec4(p, 1.0)).xyz;
          vLocalPosition = p;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform vec3 uWorldBoxMin;
        uniform vec3 uWorldBoxMax;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vLocalPosition;

        void main() {
          vec3 c = vec3(0.5, 0.5, 1.);

          // vec3 light = normalize(vec3(1., 2., 3.));
          // float d = dot(vNormal, light);

          // use derivative to get the normal
          vec3 dFdx = dFdx(vPosition);
          vec3 dFdy = dFdy(vPosition);

          // compute lighting
          vec3 normal = normalize(cross(dFdx, dFdy));
          vec3 light = normalize(vec3(1., 2., 3.));
          float d = dot(normal, light);

          // c *= 0.3 + pow(d, 2.) * 0.7;
          
          const float baseAlpha = 0.3;
          float a;
          if (vNormal.z == 0.) {
            vec2 uv = vLocalPosition.xy * 2. - 0.5;
            float b = 0.2;
            float f = min(mod(uv.x, b), mod(uv.y, b));
            f = min(f, mod(1.-uv.x, b));
            f = min(f, mod(1.-uv.y, b));
            f *= 50.;

            a = min(max(1. - f, baseAlpha), 0.5);
          } else {
            a = baseAlpha;
          }

          gl_FragColor = vec4(c, a);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const frustumMesh = new THREE.Mesh(frustumGeometry, frustumMaterial);
    // frustumMesh.position.z -= 0.01;
    // frustumMesh.updateMatrixWorld();
    frustumMesh.frustumCulled = false;
    frustumMesh.visible = false;

    //

    const imageGeometry = new THREE.PlaneGeometry(1, 1);
    const imageMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        uWorldViewport: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        uImage: {
          value: new THREE.Texture(),
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform vec3 uWorldViewport;
        varying vec2 vUv;

        void main() {
          vUv = uv;

          vec3 p = vec3(position.xy * uWorldViewport.xy * 2., position.z + uWorldViewport.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform sampler2D uImage;
        varying vec2 vUv;

        void main() {
          float f = sin(uTime * 10.) * 0.5 + 0.5;
          gl_FragColor = texture2D(uImage, vUv);
          gl_FragColor.rgb += f * 0.2;
          gl_FragColor.a = 0.3 + f * 0.7;
        }
      `,
      transparent: true,
    });
    const imageMesh = new THREE.Mesh(imageGeometry, imageMaterial);
    // imageMesh.position.z = 0.01;
    // imageMesh.updateMatrixWorld();
    imageMesh.frustumCulled = false;
    imageMesh.visible = false;

    //
    
    const outmeshMesh = this;
    outmeshMesh.visible = false;

    outmeshMesh.add(targetMesh);
    outmeshMesh.targetMesh = targetMesh;
    outmeshMesh.add(blinkMesh);
    outmeshMesh.blinkMesh = blinkMesh;
    outmeshMesh.add(frustumMesh);
    outmeshMesh.frustumMesh = frustumMesh;
    outmeshMesh.add(imageMesh);
    outmeshMesh.imageMesh = imageMesh;

    //

    const meshes = [
      targetMesh,
      blinkMesh,
      frustumMesh,
      imageMesh,
    ];
    const worldViewportMeshes = [
      targetMesh,
      blinkMesh,
      imageMesh,
    ];
    const worldBoxMeshes = [
      frustumMesh,
    ];

    //

    let state = null;
    outmeshMesh.update = (camera) => {
      // update position
      if (state === null) {
        outmeshMesh.position.copy(camera.position);
        outmeshMesh.quaternion.copy(camera.quaternion);
        outmeshMesh.updateMatrixWorld();
      }
      
      // update meshes
      for (const mesh of meshes) {
        // update uTime
        mesh.material.uniforms.uTime.value = performance.now() / 1000;
        mesh.material.uniforms.uTime.needsUpdate = true;
      }
      for (const mesh of worldViewportMeshes) {
        mesh.material.uniforms.uWorldViewport.value.set(1, 1, -1)
          .applyMatrix4(camera.projectionMatrixInverse);
        mesh.material.uniforms.uWorldViewport.needsUpdate = true;
      }
      for (const mesh of worldBoxMeshes) {
        const worldBox = localBox.set(
          localVector.set(-1, -1, -1)
            .applyMatrix4(camera.projectionMatrixInverse),
          localVector2.set(1, 1, 1)
            .applyMatrix4(camera.projectionMatrixInverse),
        );

        mesh.material.uniforms.uWorldBoxMin.value.copy(worldBox.min);
        mesh.material.uniforms.uWorldBoxMin.needsUpdate = true;
        mesh.material.uniforms.uWorldBoxMax.value.copy(worldBox.max);
        mesh.material.uniforms.uWorldBoxMax.needsUpdate = true;
      }
    };
    outmeshMesh.setState = newState => {
      state = newState;

      for (const mesh of meshes) {
        mesh.visible = false;
      }
      // null -> running -> preview -> finished
      if (state === null) {
        targetMesh.visible = true;
      } else if (state === 'running') {
        blinkMesh.visible = true;
        frustumMesh.visible = true;
      } else if (state === 'preview') {
        blinkMesh.visible = true;
        frustumMesh.visible = true;
        imageMesh.visible = true;
      } else if (state === 'finished') {
        blinkMesh.visible = true;
        imageMesh.visible = true;
      }

      blinkMesh.material.uniforms.uRunning.value = +(state === 'running');
      blinkMesh.material.uniforms.uRunning.needsUpdate = true;
    };
  }
}

//

export class PanelRenderer extends EventTarget {
  constructor(canvas, panel, {
    debug = false,
  } = {}) {
    super();

    this.canvas = canvas;
    this.panel = panel;
    this.debug = debug;

    this.tool = tools[0];
    this.layerScenes = [];

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('canvas');

    // renderer
    const renderer = makeRenderer(canvas);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    this.scene = scene;
    
    const camera = makeDefaultCamera();
    this.camera = camera;

    // orbit controls
    const controls = new OrbitControls(this.camera, canvas);
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.target.set(0, 0, -3);
    this.controls = controls;

    // mouse
    const mouse = new THREE.Vector2();
    this.mouse = mouse;

    // raycaster
    const raycaster = new THREE.Raycaster();
    this.raycaster = raycaster;

    // lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    directionalLight.updateMatrixWorld();
    scene.add(directionalLight);

    this.sceneMesh = null;

    // avatar
    const avatar = new THREE.Object3D();
    avatar.visible = false;
    (async () => {
      const modelUrl = './models/scillia.glb';
      
      const p = makePromise();
      gltfLoader.load(modelUrl, gltf => {
        p.resolve(gltf);
      }, function onProgress(xhr) {
        // console.log('progress', xhr.loaded / xhr.total);
      }, p.reject);
  
      const model = await p;
      avatar.add(model.scene);
      model.scene.updateMatrixWorld();
    })();
    scene.add(avatar);
    this.avatar = avatar;

    // avatars
    const avatars = new THREE.Object3D();
    avatars.visible = false;
    (async () => {
      const u = './models/Avatar_Bases/Drophunter Class/DropHunter_Master_v1_Guilty.vrm';
      const p = makePromise();
      gltfLoader.load(u, vrm => {
        p.resolve(vrm);
      }, function onProgress(xhr) {
        // console.log('progress', xhr.loaded / xhr.total);
      }, p.reject);

      const vrm = await p;
      const model = vrm.scene;
      model.scale.setScalar(0.8);
      avatars.add(model);
      model.updateMatrixWorld();
    })();
    scene.add(avatars);
    this.avatars = avatars;

    // mobs
    const mobs = new THREE.Object3D();
    mobs.visible = false;
    (async () => {
      const promises = mobUrls.map(async modelUrl => {
        const p = makePromise();
        gltfLoader.load(modelUrl, gltf => {
          p.resolve(gltf);
        }, function onProgress(xhr) {
          // console.log('progress', xhr.loaded / xhr.total);
        }, p.reject);
  
        const model = await p;
        mobs.add(model.scene);
        model.scene.updateMatrixWorld();
      });
      await Promise.all(promises);
    })();
    scene.add(mobs);
    this.mobs = mobs;

    // read the mesh from the panel
    this.zineRenderer = new ZineRenderer({
      panel,
    });
    const {
      sceneMesh,
      scenePhysicsMesh,
      lightMesh,
      floorNetMesh,
      edgeDepthMesh,
      wallPlaneMeshes,
    } = this.zineRenderer;
    scene.add(this.zineRenderer.scene);
    this.camera.copy(this.zineRenderer.camera);
    this.sceneMesh = sceneMesh;
    this.scenePhysicsMesh = scenePhysicsMesh;
    this.lightMesh = lightMesh;
    this.floorNetMesh = floorNetMesh;
    this.wallPlaneMeshes = wallPlaneMeshes;
    this.edgeDepthMesh = edgeDepthMesh;
    this.updateObjectTransforms();

    // portal net mesh
    const portalNetMesh = new PortalNetMesh({
      portalLocations: this.zineRenderer.metadata.portalLocations,
    });
    this.zineRenderer.transformScene.add(portalNetMesh);
    portalNetMesh.updateMatrixWorld();
    this.portalNetMesh = portalNetMesh;

    // entrance exit mesh
    const entranceExitMesh = new EntranceExitMesh({
      entranceExitLocations: this.zineRenderer.metadata.entranceExitLocations,
    });
    this.zineRenderer.transformScene.add(entranceExitMesh);
    entranceExitMesh.updateMatrixWorld();
    this.entranceExitMesh = entranceExitMesh;

    // path mesh
    const splinePoints = this.zineRenderer.metadata.paths.map(p => new THREE.Vector3().fromArray(p.position));
    const pathMesh = new PathMesh(splinePoints);
    pathMesh.visible = false;
    pathMesh.frustumCulled = false;
    this.zineRenderer.transformScene.add(pathMesh);
    pathMesh.updateMatrixWorld();
    this.pathMesh = pathMesh;

    // floor flower meshes
    {
      const {
        outlineJson,
        floorPlaneLocation,
      } = this.zineRenderer.metadata;

      // flower geometry
      const {
        positions: flowerPositions,
        directions: flowerDirections,
      } = getPanelSpecOutlinePositionsDirections({
        outlineJson,
        floorPlaneLocation,
        directionMode: 'vertical',
      });
      const flowerGeometry = makeFlowerGeometry(flowerPositions, flowerDirections);
      const floorFlowerMesh = makeFloorFlowerMesh(flowerGeometry);
      floorFlowerMesh.visible = false;
      this.zineRenderer.transformScene.add(floorFlowerMesh);
      floorFlowerMesh.updateMatrixWorld();
      this.floorFlowerMesh = floorFlowerMesh;

      // flower petal geometry
      const {
        positions: flowerPetalPositions,
        directions: flowerPetalDirections,
      } = getPanelSpecOutlinePositionsDirections({
        outlineJson,
        floorPlaneLocation,
        directionMode: 'horizontal',
      });
      const flowerPetalGeometry = makeFlowerGeometry(flowerPetalPositions, flowerPetalDirections);
      const floorFlowerPetalMesh = makeFloorPetalMesh(flowerPetalGeometry);
      floorFlowerPetalMesh.visible = false;
      this.zineRenderer.transformScene.add(floorFlowerPetalMesh);
      floorFlowerPetalMesh.updateMatrixWorld();
      this.floorFlowerPetalMesh = floorFlowerPetalMesh;
    }

    // light mesh
    lightMesh.visible = true;

    // selector
    {
      const selector = new Selector({
        renderer,
        camera,
        mouse,
        raycaster,
      });
      selector.addMesh(sceneMesh);

      selector.lensOutputMesh.position.x = -10;
      selector.lensOutputMesh.updateMatrixWorld();
      this.zineRenderer.transformScene.add(selector.lensOutputMesh);
      selector.lensOutputMesh.updateMatrixWorld();
      
      selector.indicesOutputMesh.position.x = -10;
      selector.indicesOutputMesh.position.z = -10;
      selector.indicesOutputMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      selector.indicesOutputMesh.updateMatrixWorld();
      this.zineRenderer.transformScene.add(selector.indicesOutputMesh);
      selector.indicesOutputMesh.updateMatrixWorld();
      
      sceneMesh.material.uniforms.selectedIndicesMap.value = selector.indicesRenderTarget.texture;
      sceneMesh.material.uniforms.selectedIndicesMap.needsUpdate = true;
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.value.set(selector.indicesRenderTarget.width, selector.indicesRenderTarget.height);
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.needsUpdate = true;

      this.selector = selector;
    }

    // overlay
    const overlay = new Overlay({
      renderer,
      selector: this.selector,
    });
    overlay.addMesh(sceneMesh);
    this.zineRenderer.transformScene.add(overlay.overlayScene);
    overlay.overlayScene.updateMatrixWorld();
    this.overlay = overlay;

    // outmesh
    const outmeshMesh = new OutmeshToolMesh(sceneMesh.geometry);
    this.zineRenderer.scene.add(outmeshMesh);
    outmeshMesh.updateMatrixWorld();
    this.outmeshMesh = outmeshMesh;

    // initial render
    this.updateOutmeshLayers();

    // bootstrap
    this.listen();
    this.animate();
  }
  updateObjectTransforms() {
    const scale = this.zineRenderer.getScale();

    // place avatar
    const {floorPlaneLocation} = this.zineRenderer.metadata;
    if (floorPlaneLocation) {
      this.avatar.position.fromArray(floorPlaneLocation.position)
        .multiplyScalar(scale);
      this.avatar.quaternion.fromArray(floorPlaneLocation.quaternion);
      this.avatar.updateMatrixWorld();
      this.avatar.visible = true;
    }
    
    // place avatars
    const [
      avatarsTransform,
      mobsTransform,
    ] = this.zineRenderer.metadata.candidateLocations;
    if (avatarsTransform) {
      this.avatars.position.fromArray(avatarsTransform.position)
        .multiplyScalar(scale);
      this.avatars.quaternion.fromArray(avatarsTransform.quaternion);
      this.avatars.updateMatrixWorld();
      this.avatars.visible = true;
    }

    // place mobs
    if (mobsTransform) {
      this.mobs.position.fromArray(mobsTransform.position)
        .multiplyScalar(scale);
      this.mobs.quaternion.fromArray(mobsTransform.quaternion);
      this.mobs.updateMatrixWorld();
      this.mobs.visible = true;
    }
  }
  setTool(tool) {
    this.tool = tool;

    {
      this.zineRenderer.sceneMesh.material.uniforms.uEraser.value = tool === 'eraser' ? 1 : 0;
      this.zineRenderer.sceneMesh.material.uniforms.uEraser.needsUpdate = true;
      this.zineRenderer.scenePhysicsMesh.enabled = false; // this.tool === 'plane';
      this.zineRenderer.scenePhysicsMesh.updateVisibility();
      this.zineRenderer.floorNetMesh.enabled = this.tool === 'plane';
      this.zineRenderer.floorNetMesh.updateVisibility();
    }

    this.outmeshMesh.visible = tool === 'outmesh';

    this.floorFlowerMesh.visible = tool === 'plane';
    this.floorFlowerPetalMesh.visible = tool === 'plane';

    this.controls.enabled = [
      'camera',
      'outmesh',
      // 'segment',
      'plane',
      'portal',
    ].includes(this.tool);

    this.portalNetMesh.enabled = this.tool === 'portal';
    this.portalNetMesh.updateVisibility();

    this.entranceExitMesh.enabled = ['portal'].includes(this.tool);
    this.entranceExitMesh.updateVisibility();

    this.pathMesh.visible = this.tool === 'portal';

    for (let i = 0; i < this.wallPlaneMeshes.length; i++) {
      const wallPlaneMesh = this.wallPlaneMeshes[i];
      wallPlaneMesh.visible = this.tool === 'plane';
    }

    this.selector.setTool(this.tool);
    this.overlay.setTool(this.tool);
  }
  setPreviewImage(img) {
    if (img) {
      this.outmeshMesh.imageMesh.material.uniforms.uImage.value.image = img;
      this.outmeshMesh.imageMesh.material.uniforms.uImage.value.needsUpdate = true;
      this.outmeshMesh.imageMesh.visible = true;
    } else {
      this.outmeshMesh.imageMesh.visible = false;
    }
  }
  listen() {
    const keydown = e => {
      if (!e.repeat && !e.ctrlKey) {
        switch (e.key) {
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9': {
            const keyIndex = parseInt(e.key, 10) - 1;
            this.setTool(tools[keyIndex] ?? tools[0]);
            break;
          }
          case ' ': {
            e.preventDefault();
            e.stopPropagation();

            if (this.tool === 'outmesh') {
              defaultCameraMatrix.copy(this.camera.matrixWorld);
              
              (async () => {
                this.outmeshMesh.setState('running');

                try {
                  const outmeshImageResult = await this.renderOutmeshImage();
                  
                  (async () => {
                    const {
                      editedImgBlob,
                      // maskBlob,
                    } = outmeshImageResult;
                    const editedImg = await blob2img(editedImgBlob);
                    this.setPreviewImage(editedImg);
                    if (this.state === 'running') {
                      this.setState('preview');
                    }
                  })();

                  const outmeshMeshResult = await this.renderOutmeshMesh(outmeshImageResult);

                  const layer = this.panel.zp.addLayer();
                  for (const name of layer2Specs) {
                    const value = outmeshImageResult[name] ?? outmeshMeshResult[name];
                    if (!value) {
                      console.warn('missing value', name);
                      debugger;
                    }
                    layer.setData(name, value);
                  }
                } finally {
                  this.outmeshMesh.setState('finished');
                }
              })();
            }
            break;
          }
          case 'r': {
            const {planeLabels, firstFloorPlaneIndex} = this.sceneMesh;
            const labelSpec = planeLabels[firstFloorPlaneIndex];
            const normal = localVector.fromArray(labelSpec.normal);
            // const center = localVector2.fromArray(labelSpec.center);

            normalToQuaternion(normal, localQuaternion, backwardVector)
              .multiply(localQuaternion2.setFromAxisAngle(rightVector, -Math.PI/2))
              .invert();
            const layer1 = this.zineRenderer.panel.getLayer(1);
            layer1.setData('quaternion', localQuaternion.toArray());

            defaultCameraMatrix.copy(this.zineRenderer.transformScene.matrixWorld);
            break;
          }
          case 'g': {
            // set the camera to match the scene origin
            this.camera.matrixWorld.copy(defaultCameraMatrix);
            this.camera.matrix.copy(this.camera.matrixWorld)
              .decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
            
            // set the orbitControls target in front of us
            this.controls.target.copy(this.camera.position)
              .add(this.camera.getWorldDirection(localVector).multiplyScalar(3));
            this.controls.update();
            break;
          }
          /* case 'n': {
            console.log('connect');
            break;
          } */
          case 'c': {
            this.clip();
            break;
          }
          case 'PageUp': {
            e.preventDefault();
            e.stopPropagation();
            this.scale(1);
            break;
          }
          case 'PageDown': {
            e.preventDefault();
            e.stopPropagation();
            this.scale(-1);
            break;
          }
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousedown = e => {
      this.selector.setMouseDown(true);
    };
    const mouseup = e => {
      this.selector.setMouseDown(false);
    };
    const mousemove = e => {
      // set the THREE.js.Raycaster from the mouse event
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mouse.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(this.mouse, this.camera);
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', mousedown);
    document.addEventListener('mouseup', mouseup);
    canvas.addEventListener('mousemove', mousemove);
    canvas.addEventListener('click', blockEvent);
    canvas.addEventListener('wheel', blockEvent);

    const update = e => {
      this.updateOutmeshLayers();
    };
    this.panel.zp.addEventListener('layeradd', update);
    this.panel.zp.addEventListener('layerremove', update);
    this.panel.zp.addEventListener('layerupdate', update);

    const transformchange = e => {
      this.updateObjectTransforms();
    };
    this.zineRenderer.addEventListener('transformchange', transformchange);

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', mousedown);
      document.removeEventListener('mouseup', mouseup);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      this.panel.zp.removeEventListener('layeradd', update);
      this.panel.zp.removeEventListener('layerremove', update);
      this.panel.zp.removeEventListener('layerupdate', update);

      this.zineRenderer.removeEventListener('transformchange', transformchange);
    });
  }
  render() {
    // update tools
    switch (this.tool) {
      case 'camera': {
        this.controls.update();
        this.camera.updateMatrixWorld();
        break;
      }
      case 'outmesh': {
        this.outmeshMesh.update(this.camera);
        break;
      }
      case 'eraser':
      case 'segment': {
        this.selector.update();
        break;
      }
    }

    // update overlay
    this.overlay.update();

    // render
    this.renderer.render(this.scene, this.camera);
  }
  animate() {
    const _startLoop = () => {
      let frame;
      const _loop = () => {
        frame = requestAnimationFrame(_loop);

        this.render();
      };
      _loop();

      this.addEventListener('destroy', e => {
        cancelAnimationFrame(frame);
      });
    };
    _startLoop();
  }
  async renderOutmeshImage() {
    const layer0 = this.panel.getLayer(0);
    const prompt = layer0.getData(promptKey);
    if (!prompt) {
      throw new Error('no prompt, so cannot outmesh');
    }

    // snapshot camera state
    const editCameraJson = getPerspectiveCameraJson(this.camera);

    // helpers
    const auxMeshes = [
      this.avatar,
      this.avatars,
      this.mobs,
      this.scenePhysicsMesh,
      this.floorNetMesh,
      this.portalNetMesh,
      this.entranceExitMesh,
      this.overlay.overlayScene,
      this.outmeshMesh,
      this.selector.lensOutputMesh,
      this.selector.indicesOutputMesh,
      this.edgeDepthMesh,
    ];
    const _pushAuxMeshes = () => {
      const parents = auxMeshes.map(auxMesh => {
        const {parent} = auxMesh;
        parent.remove(auxMesh);
        return parent;
      });
      return () => {
        for (let i = 0; i < auxMeshes.length; i++) {
          const auxMesh = auxMeshes[i];
          const parent = parents[i];
          parent.add(auxMesh);
        }
      };
    };

    // render the mask image
    console.time('maskImage');
    let blob;
    let maskBlob;
    {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.classList.add('maskCanvas');
      maskCanvas.width = this.renderer.domElement.width;
      maskCanvas.height = this.renderer.domElement.height;
      maskCanvas.style.cssText = `\
        background: red;
      `;
      const backgroundContext = maskCanvas.getContext('2d');

      // render without overlay
      {
        const _popAuxMeshes = _pushAuxMeshes();
        this.render();
        _popAuxMeshes();
      }

      // draw to canvas
      backgroundContext.drawImage(this.renderer.domElement, 0, 0);
      // this.element.appendChild(maskCanvas);
      document.body.appendChild(maskCanvas);

      blob = await new Promise((accept, reject) => {
        maskCanvas.toBlob(blob => {
          accept(blob);
        });
      });
      maskBlob = blob; // same as blob
    }
    console.timeEnd('maskImage');

    // edit the image
    console.time('editImg');
    let editedImgBlob;
    // let editedImg;
    {
      editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, prompt);
      // editedImg = await blob2img(editedImgBlob);
      // editedImg.classList.add('editImg');
    }
    console.timeEnd('editImg');

    return {
      editedImgBlob,
      maskBlob,
      editCameraJson,
    };
  }
  async renderOutmeshMesh({
    editedImgBlob,
    maskBlob,
    editCameraJson,
  }) {
    // const layer0 = this.panel.getLayer(1);
    // const resolution = layer0.getData('resolution');
    const layer1 = this.panel.getLayer(1);
    const originalCameraJson = layer1.getData('cameraJson');
    const oldDepthField = layer1.getData('depthField');
    const oldResolution = layer1.getData('resolution');
    const floorPlaneJson = layer1.getData('floorPlaneJson');

    // reify objects
    const [
      oldWidth,
      oldHeight,
    ] = oldResolution;
    const originalCamera = setPerspectiveCameraFromJson(localCamera, originalCameraJson).clone();
    const editCamera = setPerspectiveCameraFromJson(localCamera, editCameraJson).clone();
    const floorPlane = new THREE.Plane(localVector.fromArray(floorPlaneJson.normal), floorPlaneJson.constant);

    // extract image array buffers
    let maskImgArrayBuffer;
    {
      maskImgArrayBuffer = await maskBlob.arrayBuffer();
    }

    let editedImgArrayBuffer;
    let editedImg;
    let width, height;
    {
      editedImgArrayBuffer = await editedImgBlob.arrayBuffer();
      editedImg = await blob2img(editedImgBlob);
      width = editedImg.width;
      height = editedImg.height;
      editedImg.classList.add('editImg');
      document.body.appendChild(editedImg);
    }
    // const resolution = [
    //   width,
    //   height,
    // ];

    // image segmentation
    console.time('imageSegmentation');
    let segmentMask;
    {
      const imageSegmentationSpec = await _getImageSegments(editedImgBlob, width, height);
      segmentMask = imageSegmentationSpec.segmentMask;
      const boundingBoxLayers = imageSegmentationSpec.boundingBoxLayers;

      {
        const segmentsCanvasColor = document.createElement('canvas');
        segmentsCanvasColor.width = width;
        segmentsCanvasColor.height = height;
        segmentsCanvasColor.classList.add('imageSegmentationCanvasOutmesh');
        segmentsCanvasColor.style.cssText = `\
          background-color: red;
        `;
        document.body.appendChild(segmentsCanvasColor);
        const ctx = segmentsCanvasColor.getContext('2d');
  
        const segmentImageData = ctx.createImageData(width, height);
        for (let i = 0; i < segmentMask.length; i++) {
          const segmentIndex = segmentMask[i];
  
          const c = localColor.setHex(colors[segmentIndex % colors.length]);
          segmentImageData.data[i * 4 + 0] = c.r * 255;
          segmentImageData.data[i * 4 + 1] = c.g * 255;
          segmentImageData.data[i * 4 + 2] = c.b * 255;
          segmentImageData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(segmentImageData, 0, 0);
  
        drawLabels(ctx, boundingBoxLayers);
      }
    }
    console.timeEnd('imageSegmentation');

    // get depth field
    console.time('depthField');
    let depthFieldHeaders;
    let depthFieldArrayBuffer;
    {
      const df = await getDepthField(editedImgBlob, {
        forceFov: editCamera.fov,
      });
      depthFieldHeaders = df.headers;
      depthFieldArrayBuffer = df.arrayBuffer;
    }
    console.timeEnd('depthField');

    console.time('pointCloud');
    let pointCloudArrayBuffer;
    {
      const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
        depthFieldArrayBuffer,
        width,
        height,
        editCamera.fov,
      );
      pointCloudArrayBuffer = pointCloudFloat32Array.buffer;
    }
    console.timeEnd('pointCloud');

    console.time('extractDepths');
    let newDepthFloatImageData = getDepthFloatsFromPointCloud(pointCloudArrayBuffer, panelSize, panelSize);
    console.timeEnd('extractDepths');

    // plane detection
    console.time('planeDetection');
    const {
      planesJson,
      planesMask,
      portalJson,
      portalMask,
    } = await getSemanticPlanes(editedImg, editCamera.fov, newDepthFloatImageData, segmentMask);
    console.timeEnd('planeDetection');

    // compute the segment mask for the new geometry
    let segmentLabels;
    let segmentLabelIndices;
    let planeLabels;
    let planeLabelIndices;
    let portalLabels;
    {
      const geometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, width, height);
      const semanticSpecs = getSemanticSpecs({
        geometry,
        segmentMask,
        planesMask,
        planesJson,
        portalJson,
        width,
        height,
      });
      segmentLabels = semanticSpecs.segmentLabels;
      segmentLabelIndices = semanticSpecs.segmentLabelIndices;
      planeLabels = semanticSpecs.planeLabels;
      planeLabelIndices = semanticSpecs.planeLabelIndices;
      portalLabels = semanticSpecs.portalLabels;
    }

    // depth reconstruction
    const {
      oldDepthFloatImageData: depthFloatImageData,
      maskIndex,
      distanceFloatImageData,
      distanceNearestPositions,
      reconstructedDepthFloats,
    } = mergeOperator({
      newDepthFloatImageData,
      width,
      height,
      camera: editCamera,
      renderSpecs: [
        this.sceneMesh,
      ].map(sceneMesh => {
        const {indexedGeometry, matrixWorld} = sceneMesh;
        return {
          geometry: indexedGeometry,
          width,
          height,
          matrixWorld,
        };
      }),
    });
    {
      const maskIndexCanvas = maskIndex2Canvas(
        maskIndex,
        width,
        height,
      );
      document.body.appendChild(maskIndexCanvas);

      const distanceFloatsCanvas = distanceFloats2Canvas(
        distanceFloatImageData,
        width,
        height,
      );
      document.body.appendChild(distanceFloatsCanvas);

      const reconstructionCanvas = depthFloats2Canvas(
        reconstructedDepthFloats,
        width,
        height,
        editCamera,
      );
      document.body.appendChild(reconstructionCanvas);
    }

    console.time('floorReconstruction');
    const oldPointCloudFloat32Array = reconstructPointCloudFromDepthField(
      oldDepthField,
      oldWidth,
      oldHeight,
      originalCamera.fov,
    );
    const oldPointCloudArrayBuffer = oldPointCloudFloat32Array.buffer;
    const oldFloorNetDepthRenderGeometry = pointCloudArrayBufferToGeometry(
      oldPointCloudArrayBuffer,
      oldWidth,
      oldHeight,
    );
    const newFloorNetDepthRenderGeometry = depthFloat32ArrayToGeometry(
      reconstructedDepthFloats,
      width,
      height,
      editCamera,
    );
    const floorNetCamera = makeFloorNetCamera();
    const {
      floorNetDepths,
      floorResolution,
    } = passes.reconstructFloor({
      renderSpecs: [
        {
          geometry: oldFloorNetDepthRenderGeometry,
          clipZ: true,
          side: THREE.BackSide,
          // side: THREE.DoubleSide,
          width: oldWidth,
          height: oldHeight,
        },
        {
          geometry: newFloorNetDepthRenderGeometry,
          clipZ: true,
          side: THREE.BackSide,
          // side: THREE.DoubleSide,
          width,
          height,
        },
      ],
      camera: floorNetCamera,
      floorPlane,
    });
    const floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);
    console.timeEnd('floorReconstruction');

    // XXX enable this when there are outmeshed entrances/exits
    // bump the floor heightfield to underpin the the entrance/exit locations w/ gaussian blur
    // {
    //   floorNetDepths = bumpFloorNetDepthsByBoxes(
    //     floorNetDepths,
    //     floorNetCamera,
    //     floorNetPixelSize,
    //     floorNetPixelSize,
    //     entranceExitLocations,
    //   );
    //   // have to recompute the heightfield from the new floor net depths
    //   floorHeightfield = depthFloat32ArrayToHeightfield(
    //     floorNetDepths,
    //     floorNetPixelSize,
    //     floorNetPixelSize,
    //     floorNetCamera,
    //   );
    // }

    // return result
    return {
      maskImg: maskImgArrayBuffer,
      editedImg: editedImgArrayBuffer,
      maskIndex,

      depthFieldHeaders,
      depthField: depthFieldArrayBuffer,
      depthFloatImageData,
      distanceFloatImageData,
      distanceNearestPositions,
      newDepthFloatImageData,
      reconstructedDepthFloats,
      planesJson,
      planesMask,
      portalJson,
      segmentLabels,
      segmentLabelIndices,
      planeLabels,
      planeLabelIndices,
      portalLabels,
      // segmentSpecs,
      // planeSpecs,
      // portalSpecs,
      floorResolution,
      floorNetDepths,
      floorNetCameraJson,
      segmentMask,
      editCameraJson,
    };
  }
  clip() {
    const {geometry, indexedGeometry} = this.sceneMesh;
    const depthFloats32Array = getDepthFloatsFromIndexedGeometry(indexedGeometry);
    
    const layer1 = this.panel.getLayer(1);
    const resolution = layer1.getData('resolution');
    const [
      width,
      height,
    ] = resolution;
    clipGeometryZ(geometry, width, height, depthFloats32Array);
  }
  scale(f) {
    const oldScale = this.zineRenderer.getScale();
    const scaleFactor = 1.2;
    const newScale = oldScale * (f < 0 ? scaleFactor : 1 / scaleFactor);
    this.zineRenderer.setScale(newScale);
  }
  createOutmeshLayer(layer) {
    const maskImg = layer.getData('maskImg');
    const editedImg = layer.getData('editedImg');
    const maskIndex = layer.getData('maskIndex');
    const pointCloudHeaders = layer.getData('pointCloudHeaders');
    const pointCloud = layer.getData('pointCloud');
    const depthFloatImageData = layer.getData('depthFloatImageData');
    const distanceFloatImageData = layer.getData('distanceFloatImageData');
    const distanceNearestPositions = layer.getData('distanceNearestPositions');
    const newDepthFloatImageData = layer.getData('newDepthFloatImageData');
    const reconstructedDepthFloats = layer.getData('reconstructedDepthFloats');
    const planesJson = layer.getData('planesJson');
    const planesMask = layer.getData('planesMask');
    const portalJson = layer.getData('portalJson');
    const floorResolution = layer.getData('floorResolution');
    const floorNetDepths = layer.getData('floorNetDepths');
    const floorNetCameraJson = layer.getData('floorNetCameraJson');
    const segmentMask = layer.getData('segmentMask');
    const segmentLabels = layer.getData('segmentLabels');
    const segmentLabelIndices = layer.getData('segmentLabelIndices');
    const planeLabels = layer.getData('planeLabels');
    const planeLabelIndices = layer.getData('planeLabelIndices');
    const portalLabels = layer.getData('portalLabels');
    // const segmentSpecs = layer.getData('segmentSpecs');
    // const planeSpecs = layer.getData('planeSpecs');
    // const portalSpecs = layer.getData('portalSpecs');
    const editCameraJson = layer.getData('editCameraJson');

    //

    const editCamera = setPerspectiveCameraFromJson(localCamera, editCameraJson).clone();
    const floorNetCamera = setOrthographicCameraFromJson(localOrthographicCamera, floorNetCameraJson).clone();

    //

    const layerScene = new THREE.Scene();
    layerScene.autoUpdate = false;

    //

    /* console.time('depthPreviewReconstructed');
    {
      const depthPreviewReconstructedMesh = makeDepthCubesMesh(
        reconstructedDepthFloats,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        editCamera,
      );
      const colors = new Float32Array(depthPreviewReconstructedMesh.count * 3);
      let j = 0;
      for (let i = 0; i < reconstructedDepthFloats.length; i += depthRenderSkipRatio) {
        const d = depthFloatImageData[i];
        const color = localColor.setHex(d !== 0 ? 0x00FF00 : 0x0000FF);
        colors[j*3 + 0] = color.r;
        colors[j*3 + 1] = color.g;
        colors[j*3 + 2] = color.b;
        j++;
      }
      depthPreviewReconstructedMesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
      
      // layerScene.add(depthPreviewReconstructedMesh);
    }
    // globalThis.reconstructedDepthFloats = reconstructedDepthFloats;
    // globalThis.depthFloatImageData = depthFloatImageData;
    // globalThis.newDepthFloatImageData = newDepthFloatImageData;
    console.timeEnd('depthPreviewReconstructed'); */

    /* console.time('depthPreviewNew');
    {
      const depthPreviewNewMesh = makeDepthCubesMesh(
        newDepthFloatImageData,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        editCamera,
      );
      const colors = new Float32Array(depthPreviewNewMesh.count * 3);
      const color = localColor.setHex(0xFF0000);
      let j = 0;
      for (let i = 0; i < newDepthFloatImageData.length; i += depthRenderSkipRatio) {
        colors[j*3 + 0] = color.r;
        colors[j*3 + 1] = color.g;
        colors[j*3 + 2] = color.b;
        j++;
      }
      depthPreviewNewMesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
      
      // layerScene.add(depthPreviewNewMesh);
    }
    console.timeEnd('depthPreviewNew'); */

    /* console.time('depthPreviewOld');
    {
      const depthPreviewOldMesh = makeDepthCubesMesh(
        depthFloatImageData,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        editCamera,
      );
      const colors = new Float32Array(depthPreviewOldMesh.count * 3);
      const color = localColor.setHex(0xFF00FF);
      let j = 0;
      for (let i = 0; i < depthFloatImageData.length; i += depthRenderSkipRatio) {
        colors[j*3 + 0] = color.r;
        colors[j*3 + 1] = color.g;
        colors[j*3 + 2] = color.b;
        j++;
      }
      depthPreviewOldMesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
      layerScene.add(depthPreviewOldMesh);
    }
    console.timeEnd('depthPreviewOld'); */

    // create background mesh
    console.time('backgroundMesh');
    let backgroundMesh;
    {
      const geometry = depthFloat32ArrayToGeometry(
        reconstructedDepthFloats,
        this.renderer.domElement.width, // XXX should this be the original image width? this should not be changeable
        this.renderer.domElement.height,
        editCamera,
      );
      _mergeMask(geometry, depthFloatImageData, distanceNearestPositions);
      geometry.computeVertexNormals();

      const editedImgTex = new THREE.Texture();
      (async () => {
        const editedImgBlob = new Blob([
          editedImg,
        ], {
          type: 'image/png',
        });
         editedImgTex.image = await blob2img(editedImgBlob);
         editedImgTex.needsUpdate = true;
      })();

      const material = new THREE.ShaderMaterial({
        // color: 0xff0000,
        // transparent: true,
        // opacity: 0.8,
        uniforms: {
          editedImgTex: {
            value: editedImgTex,
            needsUpdate: true,
          },
          // distanceFloatImageDataTex: {
          //   value: distanceFloatImageDataTex,
          //   needsUpdate: true,
          // },
        },
        vertexShader: `\
          varying vec2 vUv;
          
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D editedImgTex;
          // uniform sampler2D distanceFloatImageDataTex;

          varying vec2 vUv;
            
          void main() {
            // vec4 c = texture2D(distanceFloatImageDataTex, vUv);
            // gl_FragColor = vec4(c.rg / 1024., 0., 1.);
            vec4 c = texture2D(editedImgTex, vUv);
            gl_FragColor = vec4(c.rgb, 1.);
          }
        `,
        // transparent: true,
      });
      backgroundMesh = new THREE.Mesh(geometry, material);
      backgroundMesh.name = 'backgroundMesh';
      backgroundMesh.frustumCulled = false;
      backgroundMesh.segmentLabels = segmentLabels;
      backgroundMesh.segmentLabelIndices = segmentLabelIndices;
      backgroundMesh.planeLabels = planeLabels;
      backgroundMesh.planeLabelIndices = planeLabelIndices;
      backgroundMesh.portalLabels = portalLabels;
      // backgroundMesh.segmentSpecs = segmentSpecs;
      // backgroundMesh.planeSpecs = planeSpecs;
      // backgroundMesh.portalSpecs = portalSpecs;

      layerScene.add(backgroundMesh);
    }
    console.timeEnd('backgroundMesh');
    
    this.floorNetMesh.setGeometry({
      floorNetDepths,
      floorNetCamera,
    });

    // console.time('cutDepth');
    // // const wrappedPositions = geometry.attributes.position.array.slice();
    // _cutDepth(geometry, depthFloatImageData);
    // console.timeEnd('cutDepth');

    /* console.time('backgroundMesh2');
    {
      // copy the geometry, including the attributes
      const {geometry} = backgroundMesh;
      const geometry2 = geometry.clone();
      const material2 = new THREE.MeshPhongMaterial({
        color: 0x0000ff,
        transparent: true,
        opacity: 0.4,
      });
      const backgroundMesh2 = new THREE.Mesh(geometry2, material2);
      backgroundMesh2.name = 'backgroundMesh2';
      backgroundMesh2.position.copy(this.camera.position);
      backgroundMesh2.quaternion.copy(this.camera.quaternion);
      backgroundMesh2.scale.copy(this.camera.scale);
      backgroundMesh2.matrix.copy(this.camera.matrix);
      backgroundMesh2.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh2.frustumCulled = false;
      
      layerScene.add(backgroundMesh2);
    }
    console.timeEnd('backgroundMesh2'); */

    return layerScene;
  }
  updateOutmeshLayers() {
    let layer = this.panel.getLayer(2);
    if (layer && !layer.matchesSpecs(layer2Specs)) {
      layer = null;
    }
    const layers = layer ? [
      layer,
    ] : [];

    const _addNewLayers = () => {
      for (let i = 0; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layer = layers[i];
          layerScene = this.createOutmeshLayer(layer);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        this.scene.remove(layerScene);
      }
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();
  }
  destroy() {
    console.log('destroy PanelRenderer', this);

    this.dispatchEvent(new MessageEvent('destroy'));
  }
}

//

/* const _getPlanesRansac = async points => {
  console.time('ransac');
  const res = await fetch(`https://depth.webaverse.com/ransac?n=${8}&threshold=${0.1}&init_n=${1500}`, {
    method: 'POST',
    body: points,
  });
  if (res.ok) {
    const planesJson = await res.json();
    console.timeEnd('ransac');
    return planesJson;
  } else {
    console.timeEnd('ransac');
    throw new Error('failed to detect planes');
  }
}; */
const getPlanesRgbd = async (width, height, focalLength, depthFloats32Array, minSupport = 30000) => {
  const widthHeightHeader = Int32Array.from([width, height]);
  const focalLengthHeader = Float32Array.from([focalLength]);

  const requestBlob = new Blob([
    widthHeightHeader,
    focalLengthHeader,
    depthFloats32Array,
  ], {
    type: 'application/octet-stream',
  });

  const res = await fetch(`https://depth.webaverse.com/planeDetection?minSupport=${minSupport}`, {
    method: 'POST',
    body: requestBlob,
  });
  if (res.ok) {
    const planesArrayBuffer = await res.arrayBuffer();
    const dataView = new DataView(planesArrayBuffer);
    
    // parse number of planes
    let index = 0;
    const numPlanes = dataView.getUint32(index, true);
    index += Uint32Array.BYTES_PER_ELEMENT;

    /* if (numPlanes > 512) {
      console.warn('too many planes', numPlanes);
      debugger;
    } */
    
    // parse the planes
    const planesJson = [];
    for (let i = 0; i < numPlanes; i++) {
      const normal = new Float32Array(planesArrayBuffer, index, 3);
      index += Float32Array.BYTES_PER_ELEMENT * 3;
      const center = new Float32Array(planesArrayBuffer, index, 3);
      index += Float32Array.BYTES_PER_ELEMENT * 3;
      const numVertices = dataView.getUint32(index, true);
      index += Uint32Array.BYTES_PER_ELEMENT;
      const distanceSquaredF = new Float32Array(planesArrayBuffer, index, 1);
      index += Float32Array.BYTES_PER_ELEMENT;
      
      const planeJson = {
        normal,
        center,
        numVertices,
        distanceSquaredF,
      };
      planesJson.push(planeJson);
    }

    // the remainder is a Int32Array(width * height) of plane indices
    const planesMask = new Int32Array(planesArrayBuffer, index);
    index += Int32Array.BYTES_PER_ELEMENT * planesMask.length;
    /* if (planesMask.length !== width * height) {
      throw new Error('plane indices length mismatch');
    } */

    return {
      planesJson,
      planesMask,
    };
  } else {
    throw new Error('failed to detect planes');
  }
};
const imageSegmentationClasses = [
  'floor',
  'wall',
  'portal',
  'seat',
  'light',
  'npc',
].flatMap(categoryName => categories[categoryName]);
const _getImageSegments = async (
  imgBlob,
  targetWidth,
  targetHeight,
) => {
  const u = new URL(`https://mask2former.webaverse.com/predict`);
  u.searchParams.set('classes', imageSegmentationClasses.join(','));
  u.searchParams.set('boosts', Array(imageSegmentationClasses).fill(1).join(','));
  u.searchParams.set('threshold', 0.5);
  const res = await fetch(u, {
    method: 'POST',
    body: imgBlob,
  });
  if (res.ok) {
    const segmentsBlob = await res.blob();
    const resHeaders = Object.fromEntries(res.headers.entries());
    let boundingBoxLayers = JSON.parse(resHeaders['x-bounding-boxes']);

    // resize to target size
    const segmentsImageBitmap = await createImageBitmap(segmentsBlob);
    const originalWidth = segmentsImageBitmap.width;
    const originalHeight = segmentsImageBitmap.height;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(segmentsImageBitmap, 0, 0, targetWidth, targetHeight);
    
    // get the segement mask, which is the u8 red channel of the image
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const segmentMask = new Uint8Array(imageData.data.length / 4);
    for (let i = 0; i < segmentMask.length; i++) {
      const r = imageData.data[i * 4 + 0];
      segmentMask[i] = r;
    }

    // resize the bounding boxes
    boundingBoxLayers = resizeBoundingBoxLayers(
      boundingBoxLayers,
      originalWidth,
      originalHeight,
      targetWidth,
      targetHeight,
    );

    return {
      segmentMask,
      boundingBoxLayers,
    };
  } else {
    throw new Error('failed to detect image segments');
  }
};

//

const bumpFloorNetDepthsByBoxes = (
  floorNetDepths, // Float32Array(width * height)
  floorNetCamera, // THREE.PerspectiveCamera
  width, // number
  height, // number
  portalLocations, // [{position, quaterion, center, size}]
) => {
  floorNetDepths = floorNetDepths.slice();

  const _intersectPortal = (ray) => {
    for (let i = 0; i < portalLocations.length; i++) {
      const portalLocation = portalLocations[i];
      let {quaternion, center, size} = portalLocation;
      quaternion = new THREE.Quaternion().fromArray(quaternion);
      center = new THREE.Vector3().fromArray(center);
      size = new THREE.Vector3().fromArray(size);

      // flatten the portal onto the floor
      center.add(
        new THREE.Vector3(0, -size.y / 2, 0)
          .applyQuaternion(quaternion)
      );
      size.y = 0;

      const box = new THREE.Box3()
        .setFromCenterAndSize(new THREE.Vector3(0, 0, 0), size);
      
      // undo the box rotation transform so that we can perform a world space intersection test
      const rotatedRay = ray.clone();
      const m = new THREE.Matrix4()
        .compose(
          center,
          quaternion,
          new THREE.Vector3(1, 1, 1)
        );
      rotatedRay.applyMatrix4(
        m.clone().invert()
      );

      const intersection = rotatedRay.intersectBox(box, new THREE.Vector3());
      if (intersection) {
        return intersection.distanceTo(rotatedRay.origin);
      }
    }
    return null;
  };

  // loop through and adjust the points based on portal intersections
  for (let i = 0; i < floorNetDepths.length; i++) {
    let x = (i % width);
    let y = Math.floor(i / width);
    y = height - 1 - y;

    const point = new THREE.Vector3(
      (x / width) * floorNetWorldSize - floorNetWorldSize / 2,
      (y / height) * floorNetWorldSize - floorNetWorldSize / 2,
      0
    );
    const direction = new THREE.Vector3(0, 0, -1);
    const ray = new THREE.Ray(point, direction)
      .applyMatrix4(
        floorNetCamera.matrixWorld
      );

    const viewZ = floorNetDepths[i];

    // compute the new value
    let v;
    const portalIntersectionDistance = _intersectPortal(ray);
    if (portalIntersectionDistance !== null) {
      // use intersection distance
      v = -portalIntersectionDistance;
    } else {
      // use the old value
      v = viewZ;
    }

    floorNetDepths[i] = v;
  }
  return floorNetDepths;
};

//
// function that given an image extracts depth maps and sends both + scale to `https://dataset.webaverse.com/store`
export async function getDepth(imageArrayBuffer) {

  const blob = new Blob([imageArrayBuffer], {
    type: 'image/png',
  });

  // fetch depth map of imageArrayBuffer
  const res = await fetch(`https://depth.webaverse.com/predictDepth`, {
    method: 'POST',
    body: blob,
    headers: {
      'Content-Type': 'image/png',
    },
    mode: 'cors',
  });
  return res
}

export async function compileVirtualScene(imageArrayBuffer) {
  // color
  const blob = new Blob([imageArrayBuffer], {
    type: 'image/png',
  });
  const img = await blob2img(blob, {
    // width: panelSize,
    // height: panelSize,
  });
  img.classList.add('img');
  // document.body.appendChild(img);

  const {width, height} = img;

  // resolution
  const resolution = [
    width,
    height,
  ];

  // transform
  const position = [0, 0, 0];
  const quaternion = [0, 0, 0, 1];
  const scale = [1, 1, 1];

  // image segmentation
  console.time('imageSegmentation');
  let segmentMask;
  {
    const imageSegmentationSpec = await _getImageSegments(blob, width, height);
    segmentMask = imageSegmentationSpec.segmentMask;
    const boundingBoxLayers = imageSegmentationSpec.boundingBoxLayers;

    {
      const segmentsCanvasColor = document.createElement('canvas');
      segmentsCanvasColor.width = width;
      segmentsCanvasColor.height = height;
      segmentsCanvasColor.classList.add('imageSegmentationCanvas2');
      segmentsCanvasColor.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(segmentsCanvasColor);
      const ctx = segmentsCanvasColor.getContext('2d');

      const segmentImageData = ctx.createImageData(width, height);
      for (let i = 0; i < segmentMask.length; i++) {
        const segmentIndex = segmentMask[i];

        const c = localColor.setHex(colors[segmentIndex % colors.length]);
        segmentImageData.data[i * 4 + 0] = c.r * 255;
        segmentImageData.data[i * 4 + 1] = c.g * 255;
        segmentImageData.data[i * 4 + 2] = c.b * 255;
        segmentImageData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(segmentImageData, 0, 0);

      drawLabels(ctx, boundingBoxLayers);
    }
  }
  console.timeEnd('imageSegmentation');

  // get depth field
  console.time('depthField');
  let depthFieldHeaders;
  let depthFieldArrayBuffer;
  {
    const df = await getDepthField(blob);
    depthFieldHeaders = df.headers;
    depthFieldArrayBuffer = df.arrayBuffer;
  }
  console.timeEnd('depthField');

  // reconstruct point cloud
  console.time('pointCloud');
  const fov = Number(depthFieldHeaders['x-fov']);
  let pointCloudArrayBuffer;
  {
    const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
      depthFieldArrayBuffer,
      width,
      height,
      fov,
    );
    pointCloudArrayBuffer = pointCloudFloat32Array.buffer;
  }
  console.timeEnd('pointCloud');

  // plane detection
  console.time('planeDetection');
  const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer, width, height);
  const {
    planesJson,
    planesMask,
    portalJson,
    portalMask,
  } = await getSemanticPlanes(img, fov, depthFloats32Array, segmentMask);
  console.timeEnd('planeDetection');

  console.time('camera');
  let camera;
  let cameraJson;
  {
    camera = makeDefaultCamera();
    camera.fov = fov;
    camera.updateProjectionMatrix();
    cameraJson = getPerspectiveCameraJson(camera);
  }
  console.timeEnd('camera');

  console.time('sphericalHarmonics');
  let sphericalHarmonics;
  {
    const skyCutCanvas = document.createElement('canvas');
    skyCutCanvas.width = width;
    skyCutCanvas.height = height;
    skyCutCanvas.classList.add('skyCut');
    const ctx = skyCutCanvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    document.body.appendChild(skyCutCanvas);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
  
        const value = segmentMask[index];
        if (categoryClassIndices.sky.indexOf(value)) {
          imageData.data[index * 4 + 0] = 255;
          imageData.data[index * 4 + 1] = 255;
          imageData.data[index * 4 + 2] = 255;
          imageData.data[index * 4 + 3] = 255;
        } else {
          imageData.data[index * 4 + 0] = 0;
          imageData.data[index * 4 + 1] = 0;
          imageData.data[index * 4 + 2] = 0;
          imageData.data[index * 4 + 3] = 255;
        }
      }
    }
    // console.log('num skies', numSkies, imageData.data);
    ctx.putImageData(imageData, 0, 0);

    const maskBlob = await new Promise((accept, reject) => {
      skyCutCanvas.toBlob(accept);
    });

    const formData = new FormData();
    formData.append('img', blob);
    formData.append('mask', maskBlob);

    const res = await fetch(`https://inverse-render-net.webaverse.com/lighting`, {
      method: 'POST',
      body: formData,
    });
    const arrayBuffer = await res.arrayBuffer();
    sphericalHarmonics = new Float32Array(arrayBuffer);
  }
  console.timeEnd('sphericalHarmonics');

  const geometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, width, height);
  const semanticSpecs = getSemanticSpecs({
    geometry,
    segmentMask,
    planesMask,
    planesJson,
    portalJson,
    width,
    height,
  });
  const {
    segmentLabels,
    segmentLabelIndices,
    planeLabels,
    planeLabelIndices,
    portalLabels,
    // segmentSpecs,
    // planeSpecs,
    // portalSpecs,
  } = semanticSpecs;

  console.time('floorPlane');
  const floorPlane = new THREE.Plane();
  floorPlane.center = new THREE.Vector3(0, -1.5, 0); // assume standing height
  floorPlane.setFromNormalAndCoplanarPoint(
    localVector.set(0, 1, 0),
    floorPlane.center
  );
  const firstFloorPlaneIndex = getFirstFloorPlaneIndex(planeLabels);
  if (firstFloorPlaneIndex !== -1) {
    const labelSpec = planeLabels[firstFloorPlaneIndex];
    const {normal, center} = labelSpec;
    floorPlane.center.fromArray(center);
    floorPlane.setFromNormalAndCoplanarPoint(
      localVector.fromArray(normal),
      floorPlane.center
    );
  }
  const floorPlaneJson = {
    normal: floorPlane.normal.toArray(),
    constant: floorPlane.constant,
    center: floorPlane.center.toArray(),
  };
  console.timeEnd('floorPlane');

  console.time('floorReconstruction');
  const floorNetCamera = makeFloorNetCamera();
  let floorNetDepthsRaw; // no clipping or portal optimization
  let floorNetDepths; // has clipping and portal optimization
  let floorResolution;
  let floorNetCameraJson;
  {
    const floorNetDepthRenderGeometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, width, height);
    const reconstructionSpec = passes.reconstructFloor({
      renderSpecs: [
        {
          geometry: floorNetDepthRenderGeometry,
          clipZ: true,
          side: THREE.BackSide,
          // side: THREE.DoubleSide,
          width,
          height,
        },
      ],
      camera: floorNetCamera,
      floorPlane,
    });
    floorNetDepthsRaw = reconstructionSpec.floorNetDepthsRaw;
    floorNetDepths = reconstructionSpec.floorNetDepths;
    floorResolution = reconstructionSpec.floorResolution;
    floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);
  }
  console.timeEnd('floorReconstruction');

  const floorHeightfieldRaw = depthFloat32ArrayToHeightfield(
    floorNetDepthsRaw,
    floorNetPixelSize,
    floorNetPixelSize,
    floorNetCamera,
  );

  let floorHeightfield = depthFloat32ArrayToHeightfield(
    floorNetDepths,
    floorNetPixelSize,
    floorNetPixelSize,
    floorNetCamera,
  );

  const floorPlaneLocation = getFloorPlaneLocation({
    floorPlaneCenter: floorPlane.center,
    floorPlaneNormal: floorPlane.normal,
  });

  const cameraEntranceLocation = getRaycastedCameraEntranceLocation(
    camera.position,
    camera.quaternion,
    floorHeightfieldRaw,
    floorPlaneLocation,
    floorPlaneJson
  );
  const portalLocations = getRaycastedPortalLocations(
    portalLabels,
    floorHeightfield,
    floorHeightfieldRaw,
    floorPlaneLocation,
    floorPlaneJson
  );

  console.time('boundingBox');
  const boundingBox = getBoundingBoxFromPointCloud(
    pointCloudArrayBuffer,
    width,
    height,
  );
  const floorInverseMatrix = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().fromArray(floorPlaneLocation.quaternion)
        .invert(),
      new THREE.Vector3(1, 1, 1),
    );
  const floorBoundingBox = getBoundingBoxFromPointCloud(
    pointCloudArrayBuffer,
    width,
    height,
    floorInverseMatrix,
  );
  console.timeEnd('boundingBox');

  console.time('outline');
  let outlineJson;
  {
    const getIndex = (x, y, width) => y * width + x;
    const getOutlinePoints = (depthFloat32Array, width, height, camera) => {
      const seenIndices = new Map();
      const queue = [
        [0, 0],
      ];
      seenIndices.set(
        getIndex(
          queue[0][0],
          queue[0][1],
          width
        ),
        true
      );
      const outlinePoints = [];
      let i = 0;
      while (queue.length > 0) {
        const [x, y] = queue.shift();
        
        // XXX debug check
        {
          const index = getIndex(x, y, width);
          const r = depthFloat32Array[index];
          if (r !== 0) {
            console.warn('found filled pixel in queue', i, x, y);
            debugger;
          }
        }

        let zSum = 0;
        let weightSum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ax = x + dx;
            const ay = y + dy;
            if (ax >= 0 && ax < width && ay >= 0 && ay < height) { // if in bounds
              const index2 = getIndex(ax, ay, width);
              const r2 = depthFloat32Array[index2];
              if (r2 !== 0) { // filled
                const outlineDepth = depthFloat32Array[index2];
                const z = camera.position.y - outlineDepth;
                // if (isNaN(z)) {
                //   console.warn('illegal z 1', {z, outlineDepth, x, y});
                //   debugger;
                // }

                const d = Math.sqrt(dx*dx + dy*dy);
                const weight = 1 / (d*d + 1);

                zSum += z * weight;
                weightSum += weight;
              } else { // clear
                if (!seenIndices.has(index2)) {
                  seenIndices.set(index2, true);
                  queue.push([ax, ay]);
                }
              }
            }
          }
        }
        if (weightSum > 0) {
          const z = zSum / weightSum;
          // if (isNaN(z)) {
          //   console.warn('illegal z 2', {z, zSum, weightSum, x, y});
          //   debugger;
          // }
          const outlinePoint = [x, y, z];
          // outlinePoint[zSymbol] = z;
          outlinePoints.push(outlinePoint);
        }

        i++;
      }
      return outlinePoints;
    };
    const getOutlineJson = panelSpec => {
      // camera
      const chunkEdgeCamera = makeFloorNetCamera();
    
      // compute camera spec
      const box3 = new THREE.Box3(
        new THREE.Vector3().fromArray(floorBoundingBox.min),
        new THREE.Vector3().fromArray(floorBoundingBox.max)
      );
      const center = box3.getCenter(new THREE.Vector3());
      const size = box3.getSize(new THREE.Vector3());
    
      // back left
      const centerBackLeft = center.clone()
        .add(new THREE.Vector3(-size.x / 2, 0, -size.z / 2))
        .add(new THREE.Vector3(-floorNetResolution, 0, -floorNetResolution).multiplyScalar(2)); // 2 px border
      // snap to grid
      centerBackLeft.x = Math.floor(centerBackLeft.x / floorNetResolution) * floorNetResolution;
      centerBackLeft.z = Math.floor(centerBackLeft.z / floorNetResolution) * floorNetResolution;
      
      // front right
      const centerFrontRight = center.clone()
        .add(new THREE.Vector3(size.x / 2, 0, size.z / 2))
        .add(new THREE.Vector3(floorNetResolution, 0, floorNetResolution).multiplyScalar(2)); // 2 px border
      // snap to grid
      centerFrontRight.x = Math.ceil(centerFrontRight.x / floorNetResolution) * floorNetResolution;
      centerFrontRight.z = Math.ceil(centerFrontRight.z / floorNetResolution) * floorNetResolution;
      
      // compute the new center
      center.copy(centerBackLeft)
        .add(centerFrontRight)
        .multiplyScalar(0.5);
      // compute the new size
      size.copy(centerFrontRight)
        .sub(centerBackLeft);
    
      // set the orthographic camera
      chunkEdgeCamera.position.copy(center);
      chunkEdgeCamera.position.y -= floorNetWorldDepth / 2;
      chunkEdgeCamera.updateMatrixWorld();
      chunkEdgeCamera.left = centerBackLeft.x - center.x;
      chunkEdgeCamera.right = centerFrontRight.x - center.x;
      chunkEdgeCamera.top = centerFrontRight.z - center.z;
      chunkEdgeCamera.bottom = centerBackLeft.z - center.z;
      chunkEdgeCamera.updateProjectionMatrix();
    
      // compute the pixel resolution to use
      const targetWidth = Math.ceil(size.x / floorNetResolution); // padding
      const targetHeight = Math.ceil(size.z / floorNetResolution); // padding
    
      // render the coverage map
      const meshSpecs = [
        {
          geometry,
          matrixWorld: floorInverseMatrix,
          width,
          height,
          side: THREE.DoubleSide,
        },
      ];
      const meshes = getDepthRenderSpecsMeshes(meshSpecs, chunkEdgeCamera);
      const depthFloat32Array = renderMeshesDepth(meshes, targetWidth, targetHeight, chunkEdgeCamera);
      
      // for debugging
      // const coverageCanvas = depthFloats2Canvas(depthFloat32Array, width, height, chunkEdgeCamera);
      // coverageCanvas.style.cssText = `\
      //   background: blue;
      // `;
      // document.body.appendChild(coverageCanvas);
    
      // get outline points
      const outlinePoints = getOutlinePoints(depthFloat32Array, targetWidth, targetHeight, chunkEdgeCamera);
    
      // detect edges
      let edges = concaveman(outlinePoints, 5);
      // edges = edges.map(edge => {
      //   const [x, y] = edge;
      //   const z = edge[zSymbol];
      //   return [x, y, z];
      // });

      const transformQuaternion = new THREE.Quaternion()
        .fromArray(floorPlaneLocation.quaternion);
      const transformPosition = new THREE.Vector3(center.x + size.x / 2, 0, center.z - size.z / 2)
        .applyQuaternion(transformQuaternion);

      // positions
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const [x, y, z] = edge;

        localVector.set(
          -x * floorNetResolution,
          z,
          y * floorNetResolution
        )
          .applyQuaternion(transformQuaternion)
          .add(transformPosition);
        localVector.toArray(edge);
      }

      return {
        edges,
        // center: center.toArray(),
        // size: size.toArray(),
      };
    };
    outlineJson = getOutlineJson();
  }
  console.timeEnd('outline');

  const {
    entranceExitLocations,
    candidateLocations,
  } = sortLocations({
    floorPlaneLocation,
    cameraEntranceLocation,
    portalLocations,
    // boundingBox,
  });

  /* // bump the floor heightfield to underpin the the entrance/exit locations w/ gaussian blur
  {
    floorNetDepths = bumpFloorNetDepthsByBoxes(
      floorNetDepths,
      floorNetCamera,
      floorNetPixelSize,
      floorNetPixelSize,
      entranceExitLocations,
    );
    // have to recompute the heightfield from the new floor net depths
    floorHeightfield = depthFloat32ArrayToHeightfield(
      floorNetDepths,
      floorNetPixelSize,
      floorNetPixelSize,
      floorNetCamera,
    );
  } */

  const predictedHeight = await vqaClient.getPredictedHeight(blob);

  let edgeDepths;
  {
    const scaleVector = localVector.fromArray(scale);

    const tops = [];
    const bottoms = [];
    const lefts = [];
    const rights = [];

    let top = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    {
      const py = 0;
      for (let px = 0; px < width; px++) {
        getDepthFloat32ArrayViewPositionPx(
          depthFloats32Array,
          px,
          py,
          width,
          height,
          camera,
          scaleVector,
          localVector2
        );
        const z = localVector2.z;
        if (z < top.min[2]) {
          localVector2.toArray(top.min);
        }
        if (z > top.max[2]) {
          localVector2.toArray(top.max);
        }
        tops.push(localVector2.toArray());
      }
    }
    let bottom = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    {
      const py = height - 1;
      for (let px = 0; px < width; px++) {
        getDepthFloat32ArrayViewPositionPx(
          depthFloats32Array,
          px,
          py,
          width,
          height,
          camera,
          scaleVector,
          localVector2
        );
        const z = localVector2.z;
        if (z < bottom.min[2]) {
          localVector2.toArray(bottom.min);
        }
        if (z > bottom.max[2]) {
          localVector2.toArray(bottom.max);
        }
        bottoms.push(localVector2.toArray());
      }
    }
    let left = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    {
      const px = 0;
      for (let py = 0; py < height; py++) {
        getDepthFloat32ArrayViewPositionPx(
          depthFloats32Array,
          px,
          py,
          width,
          height,
          camera,
          scaleVector,
          localVector2
        );
        const z = localVector2.z;
        if (z < left.min[2]) {
          localVector2.toArray(left.min);
        }
        if (z > left.max[2]) {
          localVector2.toArray(left.max);
        }
        lefts.push(localVector2.toArray());
      }
    }
    let right = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    {
      const px = width - 1;
      for (let py = 0; py < height; py++) {
        getDepthFloat32ArrayViewPositionPx(
          depthFloats32Array,
          px,
          py,
          width,
          height,
          camera,
          scaleVector,
          localVector2
        );
        const z = localVector2.z;
        if (z < right.min[2]) {
          localVector2.toArray(right.min);
        }
        if (z > right.max[2]) {
          localVector2.toArray(right.max);
        }
        rights.push(localVector2.toArray());
      }
    }

    edgeDepths = {
      top,
      bottom,
      left,
      right,
      tops,
      bottoms,
      lefts,
      rights,
    };
  }

  // walls
  // wall physics
  // walls are the back, left, and right edges of the scene
  // frustum planes order:
  // planes[0] = right
  // planes[1] = left
  // planes[2] = bottom
  // planes[3] = top
  // planes[4] = far
  // planes[5] = near
  let wallPlanes = [];
  {
    // near wall
    {
      let minMaxPoint = new THREE.Vector3(Infinity, Infinity, Infinity);
      if (edgeDepths.top.min[2] < minMaxPoint.z) {
        minMaxPoint.fromArray(edgeDepths.top.max);
      }
      if (edgeDepths.bottom.min[2] < minMaxPoint.z) {
        minMaxPoint.fromArray(edgeDepths.bottom.max);
      }
      if (edgeDepths.left.min[2] < minMaxPoint.z) {
        minMaxPoint.fromArray(edgeDepths.left.max);
      }
      if (edgeDepths.right.min[2] < minMaxPoint.z) {
        minMaxPoint.fromArray(edgeDepths.right.max);
      }

      let minMaxPoint2 = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      if (edgeDepths.top.max[2] > minMaxPoint2.z) {
        minMaxPoint2.fromArray(edgeDepths.top.max);
      }
      if (edgeDepths.bottom.max[2] > minMaxPoint2.z) {
        minMaxPoint2.fromArray(edgeDepths.bottom.max);
      }
      if (edgeDepths.left.max[2] > minMaxPoint2.z) {
        minMaxPoint2.fromArray(edgeDepths.left.max);
      }
      if (edgeDepths.right.max[2] > minMaxPoint2.z) {
        minMaxPoint2.fromArray(edgeDepths.right.max);
      }

      const _getTransform = () => {
        const wallPosition = minMaxPoint.clone()
          .lerp(minMaxPoint2, 0.5);

        // rotate the wall to be perpendicular to the floor, to prevent jump climbing exploits
        const floorQuaternion = localQuaternion.fromArray(floorPlaneLocation.quaternion);
        const wallQuaternion = projectQuaternionToFloor(
          camera.quaternion,
          floorQuaternion,
          localQuaternion2
        );

        wallQuaternion.multiply(planeGeometryNormalizeQuaternion);
        return {
          position: wallPosition,
          quaternion: wallQuaternion,
        };
      };
      const {
        position: centerPoint,
        quaternion: planeQuaternion,
      } = _getTransform();

      wallPlanes.push({
        position: centerPoint.toArray(),
        quaternion: planeQuaternion.toArray(),
        color: 0xffff00,
      });
    }
    // left, right walls
    {
      const _getPlaneTransforms = () => {
        localFrustum.setFromProjectionMatrix(
          camera.projectionMatrix
        );
        const planeEdgeDepths = [
          edgeDepths.right,
          edgeDepths.left,
          edgeDepths.top,
          edgeDepths.bottom,
          {
            min: [-Infinity, -Infinity, -Infinity],
            max: [Infinity, Infinity, Infinity],
          },
          {
            min: [-Infinity, -Infinity, -Infinity],
            max: [Infinity, Infinity, Infinity],
          },
        ];
        // const planeDirections = [
        //   new THREE.Vector3(1, 0, 0), // right
        //   new THREE.Vector3(-1, 0, 0), // left
        //   new THREE.Vector3(0, 16, 0), // top
        //   new THREE.Vector3(0, -1, 0), // bottom
        //   new THREE.Vector3(0, 0, 1), // far
        //   new THREE.Vector3(0, 0, -1), // near
        // ];
        return localFrustum.planes.map((wallPlane, index) => {
          // const planeDirection = planeDirections[index];
          const planeEdgeDepth = planeEdgeDepths[index];
          // compute a test point
          const wallPosition = new THREE.Vector3()
            .fromArray(planeEdgeDepth.min);
          // project the test point onto the floor
          const floorPoint = floorPlane.projectPoint(wallPosition, new THREE.Vector3());
          // cross the floor up direction with the floor direction to get the wall direction
          const floorDirection = floorPoint.clone()
            .sub(camera.position)
            .normalize();
          const floorUpVector = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(
              new THREE.Quaternion().fromArray(floorPlaneLocation.quaternion)
            );
          let wallDirection;
          if (index === 0) {
            wallDirection = floorUpVector.clone()
              .cross(floorDirection)
              .normalize();
          } else {
            wallDirection = floorDirection.clone()
              .cross(floorUpVector)
              .normalize();
          }
          const wallQuaternion = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(
              new THREE.Vector3(0, 0, 0),
              wallDirection,
              floorUpVector
            )
          );
          
          wallQuaternion.multiply(planeGeometryNormalizeQuaternion);
          return {
            position: wallPosition,
            quaternion: wallQuaternion,
          };
        });
      };
      const planeTransforms = _getPlaneTransforms();
      [
        0, // right
        1, // left
        // 5, // near
      ].forEach(i => {
        const {
          position: wallPlanePosition,
          quaternion: wallPlaneQuaternion,
        } = planeTransforms[i];
        wallPlanes.push({
          position: wallPlanePosition.toArray(),
          quaternion: wallPlaneQuaternion.toArray(),
          color: 0x00ffff,
        });
      });
    }
  }

  // paths
  let paths;
  {
    // pathfinding
    if (entranceExitLocations.length >= 2) {
      // const portalLocations = [];
      const els = entranceExitLocations.slice(0, 2).map(el => {
        return new THREE.Vector3().fromArray(el.position);
      });
      const entrancePosition = els[0];
      const exitPosition = els[1];
      const stepSize = 1;
      const points = [];
      const direction = exitPosition.clone()
        .sub(entrancePosition);
      const distance = direction.length();
      direction.normalize();
      for (let d = 0; d < distance; d += stepSize) {
        const point = entrancePosition.clone()
          .add(direction.clone().multiplyScalar(d));
        points.push(point);
      }
      points.push(exitPosition.clone());
      // make this a directional walk from the entrance to the exit
      const depthFloats = floorHeightfield;
      const yOffset = 0.10;
      const rng = alea('paths');
      for (let i = 0; i < points.length; i++) {
        // const labelSpec = portalLabels[i];
        // const normal = localVector.fromArray(labelSpec.normal);
        // const center = localVector2.fromArray(labelSpec.center);
        const center = points[i];
        
        // portal center in world space, 1m in front of the center
        const portalCenter = localVector3.copy(center)
          // .add(localVector4.copy(normal).multiplyScalar(-1));
        if (i !== 0 && i !== points.length - 1) {
          const prevCenter = points[i - 1];
          localQuaternion.setFromRotationMatrix(
            localMatrix.lookAt(
              prevCenter,
              exitPosition,
              localVector4.set(0, 1, 0)
            )
          );
          portalCenter.add(localVector4.set((rng() - 0.5) * 2 * 0.3, 0, 0).applyQuaternion(localQuaternion));
        }
        portalCenter.add(localVector4.set(0, 1, 0));

        // compute the sample coordinates:
        const floorCornerBasePosition = localVector5.set(0, 0, 0)
          .add(localVector6.set(-floorNetWorldSize / 2, 0, -floorNetWorldSize / 2));
        const px = (portalCenter.x - floorCornerBasePosition.x) / floorNetWorldSize;
        const pz = (portalCenter.z - floorCornerBasePosition.z) / floorNetWorldSize;
        const x = Math.floor(px * floorNetPixelSize);
        const z = Math.floor(pz * floorNetPixelSize);
        const index = z * floorNetPixelSize + x;
        portalCenter.y = depthFloats[index];
        portalCenter.y += yOffset;

        center.copy(portalCenter);
      }

      paths = points.map(p => {
        return {
          position: p.toArray(),
        };
      });
    } else {
      // console.warn('no entrance/exit locations, so no paths!');
      paths = [];
    }
  }

  // return result
  return {
    resolution,
    position,
    quaternion,
    scale,
    cameraJson,
    boundingBox,
    floorBoundingBox,
    outlineJson,
    depthFieldHeaders,
    depthField: depthFieldArrayBuffer,
    sphericalHarmonics,
    planesJson,
    portalJson,
    segmentLabels,
    segmentLabelIndices,
    planeLabels,
    planeLabelIndices,
    portalLabels,
    // segmentSpecs,
    // planeSpecs,
    // portalSpecs,
    firstFloorPlaneIndex,
    floorPlaneJson,
    floorResolution,
    floorNetDepths,
    floorNetCameraJson,
    floorPlaneLocation,
    cameraEntranceLocation,
    entranceExitLocations,
    portalLocations,
    candidateLocations,
    predictedHeight,
    edgeDepths,
    wallPlanes,
    paths,
  };
}