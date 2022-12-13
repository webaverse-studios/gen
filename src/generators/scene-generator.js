import * as THREE from 'three';
import alea from 'alea';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {Text} from 'troika-three-text';
import * as passes from './sg-passes.js';
import {
  setPerspectiveCameraFromJson,
  getPerspectiveCameraJson,
  setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../zine/zine-camera-utils.js';
import {
  panelSize,
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
} from '../zine/zine-constants.js';
import {
  LensMaterial,
} from './sg-materials.js';
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
import {
  ZineStoryboard,
  ZinePanel,
  ZineData,
} from '../zine/zine-format.js';
import {
  ZineRenderer,
} from '../zine/zine-renderer.js';

import {ImageAiClient} from '../clients/image-client.js';
import {
  getPointCloud,
  // drawPointCloudCanvas,
  // reprojectCameraFovArray,
  // applySkybox,
  // pointCloudArrayBufferToColorAttributeArray,
  // skyboxDistance,
  clipGeometryZ,
  mergeOperator,
} from '../clients/reconstruction-client.js';
import {
  pointCloudArrayBufferToPositionAttributeArray,
  pointCloudArrayBufferToGeometry,
  reinterpretFloatImageData,
  depthFloat32ArrayToPositionAttributeArray,
  depthFloat32ArrayToGeometry,
  depthFloat32ArrayToOrthographicPositionAttributeArray,
  depthFloat32ArrayToOrthographicGeometry,
  depthFloat32ArrayToHeightfield,
  getDepthFloatsFromPointCloud,
  getDepthFloatsFromIndexedGeometry,
  setCameraViewPositionFromViewZ,
} from '../zine/zine-geometry-utils.js';
import {
  depthFloats2Canvas,
  distanceFloats2Canvas,
  segmentsImg2Canvas,
  planesMask2Canvas,
  maskIndex2Canvas,
} from './sg-debug.js';

import {
  blob2img,
  img2ImageData,
  resizeImage,
} from '../utils/convert-utils.js';
import {classes, categories, categoryClassIndices} from '../../constants/classes.js';
import {colors, rainbowColors, detectronColors} from '../constants/detectron-colors.js';
import {mobUrls} from '../constants/urls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  frameSize,
  canvasSize,
  numFramesPerRow,
  numFrames,
  
  arrowUpBrightUrl,
  arrowUpDimUrl,
  arrowsUpUrl,
} from '../utils/light-arrow.js';
import {makePromise} from '../../utils.js';
import {
  VQAClient,
} from '../clients/vqa-client.js';
import {
  mainImageKey,
  promptKey,
  layer2Specs,
} from '../zine/zine-data-specs.js';

//

export {
  ZineStoryboard,
};

//

const vqaClient = new VQAClient();

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
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();
const localCamera = new THREE.PerspectiveCamera();
const localOrthographicCamera = new THREE.OrthographicCamera();
const localColor = new THREE.Color();

const localFloat32Array4 = new Float32Array(4);
const localUint8ArrayPanelSize = new Uint8Array(((panelSize - 1) * 2) * (panelSize - 1) * 4);

const upVector = new THREE.Vector3(0, 1, 0);
const downVector = new THREE.Vector3(0, -1, 0);
const forwardVector = new THREE.Vector3(0, 0, -1);
const backwardVector = new THREE.Vector3(0, 0, 1);
const zeroVector = new THREE.Vector3(0, 0, 0);

const gltfLoader = makeGltfLoader();

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

//

const defaultCameraMatrix = new THREE.Matrix4();

//

const depthRenderSkipRatio = 8;
const makeDepthCubesMesh = (depthFloats, width, height, camera) => {
  // render an instanced cubes mesh to show the depth
  const depthCubesGeometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
  const depthCubesMaterial = new THREE.MeshPhongMaterial({
    // color: 0x00FFFF,
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

const getFirstFloorPlaneIndex = (planeSpecs) => {
  if (planeSpecs.labels.length > 0) {
    const labelSpecs = planeSpecs.labels.map((label, index) => {
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
    const firstFloorPlaneIndex = labelSpecs[0].index;
    return firstFloorPlaneIndex;
  } else {
    return -1;
  }

  /* console.log('get first floor plane index', {
    segmentSpecs,
    planeSpecs,
  });
  debugger;

  // const segmentLabelIndices = segmentSpecs.labelIndices;
  const planeLabelIndices = planeSpecs.labelIndices;

  const _getPlanesBySegmentIndices = selectSegmentIndices => {
    const planeAcc = new Map();

    for (let i = 0; i < segmentSpecs.mask.length; i++) {
      const segmentIndex = segmentSpecs.mask[i];
      if (selectSegmentIndices.includes(segmentIndex)) {
        const planeIndex = planeLabelIndices[i];
        
        let acc = planeAcc.get(planeIndex) ?? 0;
        acc++;
        planeAcc.set(planeIndex, acc);
      }
    }

    // divide planeAcc by numVertices
    for (const planeIndex of planeAcc.keys()) {
      let acc = planeAcc.get(planeIndex);
      // acc /= planeSpecs.labels[planeIndex].numPixels;
      acc /= planeSpecs.labels[planeIndex].distanceSquaredF;
      // if (isNaN(acc)) {
      //   console.warn('invalid plane acc', planeIndex, planeAcc.get(planeIndex), planeSpecs.labels[planeIndex].numPixels);
      //   debugger;
      // }
      planeAcc.set(planeIndex, acc);
    }

    // return the plane indices sorted by highest acc count
    return Array.from(planeAcc.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
  };
  const floorPlaneIndices = _getPlanesBySegmentIndices(categoryClassIndices.floor);
  // const floorPlaneLabels = floorPlaneIndices.map(planeIndex => planeSpecs.labels[planeIndex]);
  return floorPlaneIndices.length > 0 ? floorPlaneIndices[0] : -1; */
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
  const segmentSpecs = getMaskSpecsByConnectivity(geometry, segmentMask, width, height);
  let planeSpecs = getMaskSpecsByValue(geometry, planesMask, width, height);
  planeSpecs = zipPlanesSegmentsJson(planeSpecs, planesJson);
  const portalSpecs = getMaskSpecsByMatch(portalJson, segmentMask, categoryClassIndices.portal, width, height);
  return {
    segmentSpecs,
    planeSpecs,
    portalSpecs,
  };
};

//

const getMaskSpecsByConnectivity = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const array = new Float32Array(width * height);
  const colorArray = new Float32Array(width * height * 3);
  const labels = [];
  const labelIndices = new Uint32Array(width * height);

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

          const c = localColor.setHex(colors[value % colors.length]);
          for (const index of segmentIndices) {
            const position = localVector.fromArray(positions, index * 3);
            boundingBox.expandByPoint(position);

            array[index] = value;

            colorArray[index * 3 + 0] = c.r;
            colorArray[index * 3 + 1] = c.g;
            colorArray[index * 3 + 2] = c.b;
          }
          labels.push({
            index: value,
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
    array,
    colorArray,
    labels,
    labelIndices,
    mask,
  };
};
const getMaskSpecsByValue = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const array = new Float32Array(width * height);
  const colorArray = new Float32Array(width * height * 3);
  const labels = new Map();
  const labelIndices = new Uint32Array(width * height);

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

          const c = localColor.setHex(colors[value % colors.length]);
          for (const index of segmentIndices) {
            const position = localVector.fromArray(positions, index * 3);
            boundingBox.expandByPoint(position);

            array[index] = value;

            colorArray[index * 3 + 0] = c.r;
            colorArray[index * 3 + 1] = c.g;
            colorArray[index * 3 + 2] = c.b;
          }

          boundingBox.min.toArray(label.bbox[0]);
          boundingBox.max.toArray(label.bbox[1]);
        }
      }
    }
  }
  return {
    array,
    colorArray,
    labels: Array.from(labels.values()),
    labelIndices,
  };
};
const getMaskSpecsByMatch = (labels, segmentMask, highlightIndices, width, height) => {
  // const array = new Float32Array(width * height);
  const colorArray = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      const value = segmentMask[index];
      const highlight = highlightIndices.includes(value);
      // array[index] = highlight ? 1 : 0;
    
      const c = localColor.setHex(highlight ? 0xFFFFFF : 0x000000);
      colorArray[index * 3 + 0] = c.r;
      colorArray[index * 3 + 1] = c.g;
      colorArray[index * 3 + 2] = c.b;
    }
  }
  return {
    labels,
    // array,
    colorArray,
  };
};
const zipPlanesSegmentsJson = (planeSpecs, planesJson) => {
  if (planeSpecs.labels.length !== planesJson.length) {
    console.warn('invalid planes zip lengths', {
      planeSpecs,
      planesJson,
    });
    debugger;
  }

  for (let i = 0; i < planeSpecs.labels.length; i++) {
    const label = planeSpecs.labels[i];
    const planeJson = planesJson[i];
    for (const k in planeJson) {
      label[k] = planeJson[k];
    }
  }
  return planeSpecs;
};

//

const getFloorPlaneLocation = (() => {
  const localVector = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();

  return ({
    floorPlaneCenter,
    floorPlaneNormal,
  }) => {
    const quaternion = normalToQuaternion(floorPlaneNormal, localQuaternion, backwardVector)
      .premultiply(localQuaternion2.setFromAxisAngle(localVector.set(1, 0, 0), -Math.PI/2))
    
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
  const localVector3 = new THREE.Vector3();
  const localPlane = new THREE.Plane();

  return (offset, camera, depthFloatsRaw, floorPlaneJson, targetPosition) => {
    // console.log('copy', {
    //   camera,
    //   position: camera?.position,
    //   offset,
    // });
    // if (!camera.position) {
    //   console.warn('bad camera 3', camera);
    //   debugger;
    // }
    targetPosition.copy(camera.position)
      .add(
        localVector.copy(offset)
          .applyQuaternion(camera.quaternion)
      );

    // compute the sample coordinates:
    const floorCornerBasePosition = localVector.set(0, 0, 0)
      .add(localVector2.set(-floorNetWorldSize / 2, 0, -floorNetWorldSize / 2));
    const px = (targetPosition.x - floorCornerBasePosition.x) / floorNetWorldSize;
    const pz = (targetPosition.z - floorCornerBasePosition.z) / floorNetWorldSize;
    const x = Math.floor(px * floorNetPixelSize);
    const z = Math.floor(pz * floorNetPixelSize);
    const index = z * floorNetPixelSize + x;
    targetPosition.y = depthFloatsRaw[index];

    const floorPlane = localPlane.set(
      localVector3.fromArray(floorPlaneJson.normal),
      floorPlaneJson.constant
    );

    if (floorPlane.distanceToPoint(targetPosition) < (camera.near + camera.far) / 4) { // mesh hit
      return targetPosition;
    } else {
      return null;
    }
  };
})();
const getRaycastedCameraEntranceLocation = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();

  // raycast 2m in front of the camera, and check for a floor hit
  return (camera, depthFloatsRaw, floorPlaneLocation, floorPlaneJson) => {
    if (!camera.position) {
      console.warn('bad raycast camera', camera);
      debugger;
    } 
    const cameraNearScan = camera.near;
    const cameraFarScan = 2;
    const cameraScanWidth = entranceExitWidth;
    const cameraScanStep = floorNetResolution;
    // console.log('scan', {
    //   cameraNearScan,
    //   cameraFarScan,
    //   cameraScanStep,
    // });
    for (
      let cameraDistance = cameraNearScan;
      cameraDistance <= cameraFarScan;
      cameraDistance += cameraScanStep
    ) {
      let everyXHit = true;
      for (let dx = -cameraScanWidth / 2; dx <= cameraScanWidth / 2; dx += cameraScanStep) {
        if (!camera.position) {
          console.warn('bad raycast camera 2', camera);
          debugger;
        }
        const targetPosition = getFloorHit(
          localVector2.set(dx, 0, -cameraDistance),
          camera,
          depthFloatsRaw,
          floorPlaneJson,
          localVector
        );
        if (!targetPosition) {
          everyXHit = false;
          break;
        }
      }
      if (everyXHit) {
        const targetPosition = getFloorHit(
          localVector2.set(0, 0, -cameraDistance),
          camera,
          depthFloatsRaw,
          floorPlaneJson,
          localVector
        );
        const position = targetPosition.toArray();
        const quaternion = floorPlaneLocation.quaternion.slice();
        // console.log('floor hit 3', {
        //   position,
        //   quaternion,
        // });
        return {
          position,
          quaternion,
        };
      }
    }

    return null;
  };
})();
const getRaycastedPortalLocations = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localVector4 = new THREE.Vector3();
  const localVector5 = new THREE.Vector3();
  const localVector6 = new THREE.Vector3();
  const localVector7 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();
  const localQuaternion3 = new THREE.Quaternion();
  const localQuaternion4 = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  
  return (portalSpecs, depthFloats, floorPlaneLocation) => {
    const portalLocations = [];
    for (let i = 0; i < portalSpecs.labels.length; i++) {
      const labelSpec = portalSpecs.labels[i];
      const normal = localVector.fromArray(labelSpec.normal);
      const center = localVector2.fromArray(labelSpec.center);
      
      // portal center in world space, 1m in front of the center
      const portalCenter = localVector3.copy(center)
        .add(localVector4.copy(normal).multiplyScalar(-1));

      // compute the sample coordinates:
      const floorCornerBasePosition = localVector5.set(0, 0, 0)
        .add(localVector6.set(-floorNetWorldSize / 2, 0, -floorNetWorldSize / 2));
      const px = (portalCenter.x - floorCornerBasePosition.x) / floorNetWorldSize;
      const pz = (portalCenter.z - floorCornerBasePosition.z) / floorNetWorldSize;
      const x = Math.floor(px * floorNetPixelSize);
      const z = Math.floor(pz * floorNetPixelSize);
      const index = z * floorNetPixelSize + x;
      portalCenter.y = depthFloats[index];

      const targetQuaternion = localQuaternion;
      normalToQuaternion(normal, targetQuaternion, upVector);
      localEuler.setFromQuaternion(targetQuaternion, 'YXZ');
      localEuler.x = 0;
      localEuler.z = 0;
      targetQuaternion.setFromEuler(localEuler);

      const floorNormal = localVector6.fromArray(floorPlaneLocation.normal);
      const floorQuaternion = localQuaternion2;
      normalToQuaternion(floorNormal, floorQuaternion, backwardVector)
        .multiply(localQuaternion3.setFromAxisAngle(localVector7.set(1, 0, 0), -Math.PI/2));
      
      // set the quaternion to face towards targetQuaternion, but with the floor normal as the up vector
      const quaternion = localQuaternion4;
      quaternion.multiplyQuaternions(
        floorQuaternion,
        targetQuaternion
      );

      portalLocations.push({
        position: portalCenter.toArray(),
        quaternion: quaternion.toArray(),
      });
    }
    return portalLocations;
  };
})();
function shuffle(array, seed = '') {
  const rng = alea(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
const sortLocations = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localVector4 = new THREE.Vector3();
  // const localVector5 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  // const localQuaternion2 = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  const localMatrix = new THREE.Matrix4();

  return ({
    cameraEntranceLocation,
    floorPlaneLocation,
    portalLocations,
    seed = 'avatars',
  }) => {
    // collect candidate locations
    let candidateLocations = [];
    // if (cameraEntranceLocation) {
    //   candidateLocations.push(cameraEntranceLocation);
    // }
    // if (floorPlaneLocation) {
    //   candidateLocations.push(floorPlaneLocation);
    // }
    candidateLocations.push(...portalLocations);
    candidateLocations = structuredClone(candidateLocations); // do not scribble over original arrays

    // remove candidate locations that are too close to each other
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
    });

    // entrances + exits
    const entranceExitLocations = [];
    if (cameraEntranceLocation) {
      entranceExitLocations.push(cameraEntranceLocation);

      // find the furthest portal from the camera entrance
      let furthestPortalIndex = -1;
      let furthestPortalDistance = 0;
      for (let i = 0; i < candidateLocations.length; i++) {
        const portalLocation = candidateLocations[i];
        const d = localVector.fromArray(cameraEntranceLocation.position)
          .distanceTo(
            localVector2.fromArray(portalLocation.position)
          );
        if (d > furthestPortalDistance) {
          furthestPortalDistance = d;
          furthestPortalIndex = i;
        }
      }
      if (furthestPortalIndex !== -1) {
        entranceExitLocations.push(candidateLocations[furthestPortalIndex]);
        candidateLocations.splice(furthestPortalIndex, 1);
      }
    } else {
      // find the two furthest portals from each other
      let furthestPortalIndex1 = -1;
      let furthestPortalIndex2 = -1;
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
            furthestPortalDistance = d;
            furthestPortalIndex1 = i;
            furthestPortalIndex2 = j;
          }
        }
      }
      if (furthestPortalIndex1 !== -1 && furthestPortalIndex2 !== -1) {
        const portal1 = candidateLocations[furthestPortalIndex1];
        const portal2 = candidateLocations[furthestPortalIndex2];

        entranceExitLocations.push(portal1);
        entranceExitLocations.push(portal2);

        const portalLocationIndexes = [
          furthestPortalIndex1,
          furthestPortalIndex2,
        ].sort((a, b) => a - b);
        candidateLocations.splice(portalLocationIndexes[1], 1);
        candidateLocations.splice(portalLocationIndexes[0], 1);
      }
    }

    // randomize remaining candidate locations
    shuffle(candidateLocations, seed);

    // compute remaining candidate location look quaternions
    {
      const rng = alea(seed);
      for (let i = 0; i < candidateLocations.length; i++) {
        const candidateLocation = candidateLocations[i];
        // const candidatePosition = localVector.fromArray(candidateLocation.position);
        
        const lookCandidateLocations = candidateLocations.filter((lookCandidateLocation, j) => {
          return j !== i;
        });

        let quaternion;
        if (lookCandidateLocations.length > 0) {
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
            .multiply(localQuaternion.setFromAxisAngle(localVector4.set(1, 0, 0), -Math.PI/2));

          quaternion = localQuaternion.multiplyQuaternions(
            floorQuaternion,
            targetQuaternion,
          );
        } else {
          quaternion = localQuaternion.identity();
        }
        quaternion.toArray(candidateLocation.quaternion);
      }
    }

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
    // flip y
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
      
      // if at least one of them is masked, we have a boundary point
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
      const newDepthFloatImageData2 = newDepthFloatImageData.map((n, index) => {
        const index2 = segmentMask[index];
        return categoryClassIndices.floor.includes(index2) ? n : Infinity;
      });
      
      const {width, height} = img;
      const planesSpec = await getPlanesRgbd(
        width,
        height,
        focalLength,
        newDepthFloatImageData2,
        10000,
      );
      // console.log('read planes spec', {planesSpec, newDepthFloatImageData2});
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
      const newDepthFloatImageData2 = newDepthFloatImageData.map((n, index) => {
        const index2 = segmentMask[index];
        return categoryClassIndices.portal.includes(index2) ? n : Infinity;
      });

      const {width, height} = img;
      const portalSpec = await getPlanesRgbd(
        width,
        height,
        focalLength,
        newDepthFloatImageData2,
        5000,
      );
      // console.log('read portal spec', {portalSpec, newDepthFloatImageData2});
      portalJson = portalSpec.planesJson;
      portalMask = portalSpec.planesMask;

      // globalThis.portalJson = portalJson;
      // globalThis.portalMask = portalMask;
      // globalThis.newDepthFloatImageData2 = newDepthFloatImageData2;

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

const planeArrowGeometry = (() => {
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
const makePlaneArrowMesh = () => {
  const material = new THREE.MeshPhongMaterial({
    color: 0xFF0000,
  });

  const arrowMesh = new THREE.Mesh(planeArrowGeometry, material);
  return arrowMesh;
};
const gridGeometry = new THREE.PlaneGeometry(1, 1);
const makeGridMesh = () => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: {
        value: new THREE.Color(0xFF0000),
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
      uniform vec3 uColor;
      varying vec2 vUv;

      const vec3 lineColor = vec3(${new THREE.Vector3(0x00BBCC).toArray().map(n => n.toFixed(8)).join(',')});

      void main() {
        vec2 uv = vUv;

        // draw a grid based on uv
        float b = 0.1;
        float f = min(mod(uv.x, b), mod(uv.y, b));
        f = min(f, mod(1.-uv.x, b));
        f = min(f, mod(1.-uv.y, b));
        f *= 200.;

        float a = max(1. - f, 0.);
        a = max(a, 0.5);

        // vec3 c = lineColor;
        vec3 c = uColor;

        gl_FragColor = vec4(c, a);
        // gl_FragColor.rg = uv;
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const gridMesh = new THREE.Mesh(gridGeometry, material);
  return gridMesh;
};

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
      const geometry = new THREE.PlaneBufferGeometry(1, 1);
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
      const geometry = new THREE.PlaneBufferGeometry(2, 1)
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
      const planeGeometry = new THREE.PlaneBufferGeometry(1, 1)
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
      if (width * height * 9 !== sceneMeshGeometry.attributes.position.array.length) {
        console.warn('invalid width/height', width, height, sceneMeshGeometry.attributes.position.array.length);
        debugger;
      }
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
      segmentSpecs,
      planeSpecs,
      portalSpecs,
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
          attribute vec3 portalColor;
          // attribute vec3 barycentric;
          
          flat varying float vSegment;
          flat varying vec3 vSegmentColor;
          flat varying float vPlane;
          flat varying vec3 vPlaneColor;
          // varying float vPortal;
          flat varying vec3 vPortalColor;
          // varying vec3 vBarycentric;
          varying vec2 vUv;
          varying vec3 vPosition;
  
          void main() {
            vSegment = segment;
            vSegmentColor = segmentColor;
            vPlane = plane;
            vPlaneColor = planeColor;
            // vPortal = portal;
            vPortalColor = portalColor;
  
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
          flat varying vec3 vPortalColor;
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
              gl_FragColor = vec4(vPortalColor, 0.5);
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
            const {array, /*colorArray, labelIndices, labels, mask*/} = segmentSpecs;
            const segmentIndex = array[pickerIndex];
            if (segmentIndex !== undefined) {
              selectorIndex = segmentIndex;
            } else {
              console.warn('no segment index', this, segmentSpecs, pickerIndex);
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
      const {labels} = segmentSpecs;
      for (const label of labels) {
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
      for (const label of planeSpecs.labels) {
        // compute label planes
        const center = localVector.fromArray(label.center);
        const normal = localVector2.fromArray(label.normal);

        // arrow mesh
        const arrowMesh = makePlaneArrowMesh();
        arrowMesh.position.copy(center);
        normalToQuaternion(normal, arrowMesh.quaternion, backwardVector);
        arrowMesh.updateMatrixWorld();
        arrowMesh.frustumCulled = false;
        planeMesh.add(arrowMesh);
        planeArrowMeshes.push(arrowMesh);

        // grid mesh
        const gridMesh = makeGridMesh();
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
      // globalThis.planeArrowMeshes = planeArrowMeshes;
      // globalThis.planeMeshes = planeMeshes;
    }

    // portal gizmo meshes
    {
      const portalMesh = this.toolOverlayMeshes['portal'];

      // if (!portalSpecs.labels) {
      //   console.warn('no portal labels', portalSpecs);
      //   debugger;
      // }
      for (const label of portalSpecs.labels) {
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

const entranceExitHeight = 2;
const entranceExitWidth = 2;
const entranceExitDepth = 20;
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

    const s = 0.002; // grid visualization scale
    const _decorateDirectionAttribute = (geometry, direction) => {
      const directions = new Float32Array(geometry.attributes.position.array.length / 3 * 2);
      for (let i = 0; i < directions.length; i += 2) {
        direction.toArray(directions, i);
      }
      geometry.setAttribute('direction', new THREE.BufferAttribute(directions, 2));
    };

    const targetGeometry = (() => {
      const topLeftCornerGeometry = BufferGeometryUtils.mergeBufferGeometries([
        new THREE.BoxBufferGeometry(3, 1, 1)
          .translate(3 / 2 - 0.5, 0, 0),
        new THREE.BoxBufferGeometry(1, 3 - 0.5, 1)
          .translate(0, -(3 - 0.5) / 2 - 0.5, 0),
      ]);
      const bottomLeftCornerGeometry = topLeftCornerGeometry.clone()
        .rotateZ(Math.PI / 2);
      const bottomRightCornerGeometry = topLeftCornerGeometry.clone()
        .rotateZ(Math.PI);
      const topRightCornerGeometry = topLeftCornerGeometry.clone()
        .rotateZ(-Math.PI / 2);

      _decorateDirectionAttribute(topLeftCornerGeometry, new THREE.Vector2(-1, 1));
      _decorateDirectionAttribute(bottomLeftCornerGeometry, new THREE.Vector2(-1, -1));
      _decorateDirectionAttribute(bottomRightCornerGeometry, new THREE.Vector2(1, -1));
      _decorateDirectionAttribute(topRightCornerGeometry, new THREE.Vector2(1, 1));

      const targetGeometry = BufferGeometryUtils.mergeBufferGeometries([
        topLeftCornerGeometry,
        bottomLeftCornerGeometry,
        bottomRightCornerGeometry,
        topRightCornerGeometry,
      ]);
      targetGeometry.scale(s, s, s);
      return targetGeometry;
    })();

    const rectangleGeometry = (() => {
      const s2 = 1 / s;
      const topGeometry = new THREE.BoxBufferGeometry(s2, 1, 1)
        .translate(0, s2 / 2, 0);
      const bottomGeometry = topGeometry.clone()
        .translate(0, -s2, 0);
      const leftGeometry = new THREE.BoxBufferGeometry(1, s2, 1)
        .translate(-s2 / 2, 0, 0);
      const rightGeometry = leftGeometry.clone()
        .translate(s2, 0, 0);

      const rectangleGeometry = BufferGeometryUtils.mergeBufferGeometries([
        topGeometry,
        bottomGeometry,
        leftGeometry,
        rightGeometry,
      ]);

      // dummy directions because they are not used in this mesh material
      const directions = new Float32Array(panelSize * panelSize * 2);
      rectangleGeometry.setAttribute('direction', new THREE.BufferAttribute(directions, 2));

      rectangleGeometry.scale(s, s, s);

      return rectangleGeometry;
    })();

    const targetMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        uWorldViewport: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
      },
      vertexShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
        attribute vec2 direction;
        varying vec2 vUv;
        varying vec2 vDirection;
        
        void main() {
          vUv = uv;
          vDirection = direction;

          vec3 offset = vec3(direction, 1.) * uWorldViewport;
          vec3 p = position + offset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
        varying vec2 vUv;
        varying vec2 vDirection;
        
        void main() {
          gl_FragColor = vec4(0., 0., 0., 1.);
        }
      `,
      side: THREE.DoubleSide,
    });

    const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
    targetMesh.frustumCulled = false;
    targetMesh.visible = true;

    const rectangleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        uWorldViewport: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        uRunning: {
          value: 0,
          needsUpdate: false,
        },
      },
      vertexShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
        uniform float uRunning;
        attribute vec2 direction;
        varying vec2 vUv;
        varying vec2 vDirection;
        
        void main() {
          vUv = uv;
          vDirection = direction;

          vec3 p = vec3(position.xy * uWorldViewport.xy * 2., position.z + uWorldViewport.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
        uniform float uRunning;
        varying vec2 vUv;
        varying vec2 vDirection;
        
        const vec3 color = vec3(1., 0.5, 0.5);

        void main() {
          if (uRunning > 0.5) {
            float modTime = mod(uTime, 0.15) / 0.15;
            float f = modTime < 0.5 ? 0. : 1.;
            vec3 c = mix(color, vec3(0., 0., 0.), f);
            gl_FragColor = vec4(c, 1.);
          } else {
            gl_FragColor = vec4(0., 0., 0., 1.);
          }
        }
      `,
      side: THREE.DoubleSide,
    });

    const rectangleMesh = new THREE.Mesh(rectangleGeometry, rectangleMaterial);
    rectangleMesh.frustumCulled = false;
    rectangleMesh.visible = false;

    //

    const frustumGeometry = new THREE.BoxBufferGeometry(1, 1, 1)
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

    const imageGeometry = new THREE.PlaneBufferGeometry(1, 1);
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
    outmeshMesh.add(rectangleMesh);
    outmeshMesh.rectangleMesh = rectangleMesh;
    outmeshMesh.add(frustumMesh);
    outmeshMesh.frustumMesh = frustumMesh;
    outmeshMesh.add(imageMesh);
    outmeshMesh.imageMesh = imageMesh;

    //

    const meshes = [
      targetMesh,
      rectangleMesh,
      frustumMesh,
      imageMesh,
    ];
    const worldViewportMeshes = [
      targetMesh,
      rectangleMesh,
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
        // globalThis.box = [
        //   worldBox.min.toArray(),
        //   worldBox.max.toArray(),
        // ];
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
        rectangleMesh.visible = true;
        frustumMesh.visible = true;
      } else if (state === 'preview') {
        rectangleMesh.visible = true;
        frustumMesh.visible = true;
        imageMesh.visible = true;
      } else if (state === 'finished') {
        rectangleMesh.visible = true;
        imageMesh.visible = true;
      }

      rectangleMesh.material.uniforms.uRunning.value = +(state === 'running');
      rectangleMesh.material.uniforms.uRunning.needsUpdate = true;
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
    const {sceneMesh, scenePhysicsMesh, floorNetMesh} = this.zineRenderer;
    scene.add(this.zineRenderer.scene);
    this.camera.copy(this.zineRenderer.camera);
    this.sceneMesh = sceneMesh;
    this.scenePhysicsMesh = scenePhysicsMesh;
    this.floorNetMesh = floorNetMesh;
    this.updateObjectTransforms();

    // portal net mesh
    const portalNetMesh = new PortalNetMesh({
      portalLocations: this.zineRenderer.metadata.portalLocations,
    });
    this.scene.add(portalNetMesh);
    this.portalNetMesh = portalNetMesh;

    // entrance exit mesh
    const entranceExitMesh = new EntranceExitMesh({
      entranceExitLocations: this.zineRenderer.metadata.entranceExitLocations,
    });
    this.scene.add(entranceExitMesh);
    this.entranceExitMesh = entranceExitMesh;

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
      scene.add(selector.lensOutputMesh);
      
      selector.indicesOutputMesh.position.x = -10;
      selector.indicesOutputMesh.position.z = -10;
      selector.indicesOutputMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      selector.indicesOutputMesh.updateMatrixWorld();
      scene.add(selector.indicesOutputMesh);
      
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
    scene.add(overlay.overlayScene);
    this.overlay = overlay;

    // outmesh
    const outmeshMesh = new OutmeshToolMesh(sceneMesh.geometry);
    this.scene.add(outmeshMesh);
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
      this.zineRenderer.scenePhysicsMesh.enabled = this.tool === 'plane';
      this.zineRenderer.scenePhysicsMesh.updateVisibility();
      this.zineRenderer.floorNetMesh.enabled = this.tool === 'plane';
      this.zineRenderer.floorNetMesh.updateVisibility();
    }

    this.outmeshMesh.visible = tool === 'outmesh';

    this.controls.enabled = [
      'camera',
      'outmesh',
      // 'segment',
      'plane',
      'portal',
    ].includes(this.tool);

    this.portalNetMesh.enabled = this.tool === 'portal';
    this.portalNetMesh.updateVisibility();

    this.entranceExitMesh.enabled = this.tool === 'portal';
    this.entranceExitMesh.updateVisibility();

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

            // XXX hack
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
            const {planeSpecs, firstFloorPlaneIndex} = this.sceneMesh;
            const labelSpec = planeSpecs.labels[firstFloorPlaneIndex];
            const normal = localVector.fromArray(labelSpec.normal);
            // const center = localVector2.fromArray(labelSpec.center);

            normalToQuaternion(normal, this.sceneMesh.quaternion, backwardVector)
              .invert()
              .premultiply(localQuaternion.setFromAxisAngle(localVector.set(1, 0, 0), Math.PI/2))
            this.sceneMesh.updateMatrixWorld();

            defaultCameraMatrix.copy(this.sceneMesh.matrixWorld);
            break;
          }
          case 'f': {
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
    // console.log('edit camera json init', editCameraJson);

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
    ];
    const _pushAuxMeshes = () => {
      for (const auxMesh of auxMeshes) {
        this.scene.remove(auxMesh);
      }
      return () => {
        for (const auxMesh of auxMeshes) {
          this.scene.add(auxMesh);
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
    let editedImg;
    {
      editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, prompt);
      editedImg = await blob2img(editedImgBlob);
      editedImg.classList.add('editImg');
      // this.element.appendChild(editedImg);
      document.body.appendChild(editedImg);
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
    const layer1 = this.panel.getLayer(1);
    const oldPointCloudArrayBuffer = layer1.getData('pointCloud');
    const floorPlaneJson = layer1.getData('floorPlaneJson');

    // reify objects
    const editCamera = setPerspectiveCameraFromJson(localCamera, editCameraJson).clone();
    const floorPlane = new THREE.Plane(localVector.fromArray(floorPlaneJson.normal), floorPlaneJson.constant);

    // extract image array buffers
    let maskImgArrayBuffer;
    {
      maskImgArrayBuffer = await maskBlob.arrayBuffer();
    }

    let editedImgArrayBuffer;
    let editedImg;
    {
      editedImgArrayBuffer = await editedImgBlob.arrayBuffer();
      editedImg = await blob2img(editedImgBlob);
      editedImg.classList.add('editImg');
      document.body.appendChild(editedImg);
    }

    // image segmentation
    console.time('imageSegmentation');
    let segmentMask;
    {
      const imageSegmentationSpec = await _getImageSegements(editedImgBlob);
      const {segmentsBlob, boundingBoxLayers} = imageSegmentationSpec;

      const segmentsImageBitmap = await createImageBitmap(segmentsBlob);
      
      {
        const segmentsCanvasMono = segmentsImg2Canvas(segmentsImageBitmap);
        const ctx = segmentsCanvasMono.getContext('2d');

        const imageData = ctx.getImageData(0, 0, segmentsCanvasMono.width, segmentsCanvasMono.height);
        const {data} = imageData;
        segmentMask = new Int32Array(data.byteLength / Int32Array.BYTES_PER_ELEMENT);
        for (let i = 0; i < segmentMask.length; i++) {
          const r = data[i * 4 + 0];
          segmentMask[i] = r;
        }
      }

      {
        const segmentsCanvasColor = segmentsImg2Canvas(segmentsImageBitmap, {
          color: true,
        });
        segmentsCanvasColor.classList.add('imageSegmentationCanvas2');
        segmentsCanvasColor.style.cssText = `\
          background-color: red;
        `;
        document.body.appendChild(segmentsCanvasColor);
        const ctx = segmentsCanvasColor.getContext('2d');

        drawLabels(ctx, resizeBoundingBoxLayers(
          boundingBoxLayers,
          segmentsImageBitmap.width,
          segmentsImageBitmap.height,
          segmentsCanvasColor.width,
          segmentsCanvasColor.height
        ));
      }
    }
    console.timeEnd('imageSegmentation');

    // get point cloud
    console.time('pointCloud');
    let pointCloudHeaders;
    let pointCloudArrayBuffer;
    {
      const pc = await getPointCloud(editedImgBlob, {
        forceFov: editCamera.fov,
      });
      pointCloudHeaders = pc.headers;
      pointCloudArrayBuffer = pc.arrayBuffer;
      // const pointCloudCanvas = drawPointCloudCanvas(pointCloudArrayBuffer);
      // this.element.appendChild(pointCloudCanvas);
    }
    console.timeEnd('pointCloud');

    // console.time('snapPointCloud');
    // {
    //   pointCloudArrayBuffer = snapPointCloudToCamera(pointCloudArrayBuffer, this.renderer.domElement.width, this.renderer.domElement.width, editCamera);
    // }
    // console.timeEnd('snapPointCloud');

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

    /* // reproject fov from new to old
    console.time('reprojectFov');
    {
      const oldCamera = editCamera;
      // const oldFov = oldCamera.fov;
      const newFov = Number(pointCloudHeaders['x-fov']);
      const newCamera = editCamera.clone();
      newCamera.fov = newFov;
      newCamera.updateProjectionMatrix();

      newDepthFloatImageData = reprojectCameraFovArray(
        newDepthFloatImageData,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        newCamera,
        oldCamera,
      );
    }
    console.timeEnd('reprojectFov'); */

    // depth reconstruction
    const {
      oldDepthFloatImageData: depthFloatImageData,
      maskIndex,
      distanceFloatImageData,
      distanceNearestPositions,
      reconstructedDepthFloats,
    } = mergeOperator({
      newDepthFloatImageData,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      camera: editCamera,
      renderSpecs: [
        this.sceneMesh,
      ].map(sceneMesh => {
        const {indexedGeometry} = sceneMesh;
        // if (!indexedGeometry) {
        //   console.warn('no indexed geometry', sceneMesh);
        //   debugger;
        // }
        return {
          geometry: indexedGeometry,
          width: this.renderer.domElement.width,
          height: this.renderer.domElement.height,
        };
      }),
    });
    {
      const maskIndexCanvas = maskIndex2Canvas(
        maskIndex,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
      );
      document.body.appendChild(maskIndexCanvas);

      const distanceFloatsCanvas = distanceFloats2Canvas(
        distanceFloatImageData,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
      );
      document.body.appendChild(distanceFloatsCanvas);

      const reconstructionCanvas = depthFloats2Canvas(
        reconstructedDepthFloats,
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        editCamera,
      );
      document.body.appendChild(reconstructionCanvas);
    }

    console.time('floorReconstruction');
    const oldFloorNetDepthRenderGeometry = pointCloudArrayBufferToGeometry(
      oldPointCloudArrayBuffer,
      this.renderer.domElement.width,
      this.renderer.domElement.height,
    );
    const newFloorNetDepthRenderGeometry = depthFloat32ArrayToGeometry(
      reconstructedDepthFloats,
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      editCamera,
    );
    // globalThis.oldFloorNetDepthRenderGeometry = oldFloorNetDepthRenderGeometry;
    // globalThis.newFloorNetDepthRenderGeometry = newFloorNetDepthRenderGeometry;
    const floorNetCamera = makeFloorNetCamera();
    const {
      floorNetDepths,
      floorResolution,
    } = passes.reconstructFloor({
      renderSpecs: [
        {
          geometry: oldFloorNetDepthRenderGeometry,
          width: this.renderer.domElement.width,
          height: this.renderer.domElement.height,
          clipZ: true,
        },
        {
          geometry: newFloorNetDepthRenderGeometry,
          width: this.renderer.domElement.width,
          height: this.renderer.domElement.height,
          clipZ: true,
        },
      ],
      camera: floorNetCamera,
      floorPlane,
    });
    const floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);
    console.timeEnd('floorReconstruction');

    // return result
    return {
      maskImg: maskImgArrayBuffer,
      editedImg: editedImgArrayBuffer,
      maskIndex,

      pointCloudHeaders,
      pointCloud: pointCloudArrayBuffer,
      depthFloatImageData,
      distanceFloatImageData,
      distanceNearestPositions,
      newDepthFloatImageData,
      reconstructedDepthFloats,
      planesJson,
      planesMask,
      portalJson,
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
    const {width, height} = this.renderer.domElement;
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
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        editCamera,
      );
      _mergeMask(geometry, depthFloatImageData, distanceNearestPositions);
      // const segmentSpecs = getMaskSpecsByConnectivity(geometry, segmentMask, this.canvas.width, this.canvas.height);
      // let planeSpecs = getMaskSpecsByValue(geometry, planesMask, this.canvas.width, this.canvas.height);
      // planeSpecs = zipPlanesSegmentsJson(planeSpecs, planesJson);
      const semanticSpecs = getSemanticSpecs({
        geometry,
        segmentMask,
        planesMask,
        planesJson,
        portalJson,
        width: this.canvas.width,
        height: this.canvas.height,
      });
      const {
        segmentSpecs,
        planeSpecs,
        portalSpecs,
      } = semanticSpecs;
      // geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
      // geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
      // geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
      // geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
      geometry.computeVertexNormals();

      // const distanceFloatImageDataTex = new THREE.DataTexture(
      //   distanceFloatImageData,
      //   this.canvas.width,
      //   this.canvas.height,
      //   THREE.RGBAFormat,
      //   THREE.FloatType,
      // );
      // distanceFloatImageDataTex.needsUpdate = true;

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
      // backgroundMesh.position.copy(this.camera.position);
      // backgroundMesh.quaternion.copy(this.camera.quaternion);
      // backgroundMesh.scale.copy(this.camera.scale);
      // backgroundMesh.matrix.copy(this.camera.matrix);
      // backgroundMesh.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh.frustumCulled = false;
      backgroundMesh.segmentSpecs = segmentSpecs;
      backgroundMesh.planeSpecs = planeSpecs;

      layerScene.add(backgroundMesh);
    }
    console.timeEnd('backgroundMesh');
    
    // globalThis.distanceFloatImageData = distanceFloatImageData;
    // globalThis.backgroundMesh = backgroundMesh;
    // globalThis.distanceNearestPositions = distanceNearestPositions;

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
    // const layers = this.panel.zd.getDataLayersMatchingSpec(layer2Specs);
    let layer = this.panel.getLayer(2);
    if (layer && !layer.matchesSpecs(layer2Specs)) {
      layer = null;
    }
    const layers = layer ? [
      layer,
    ] : [];
    // console.log('update outmesh layers', layer, layer2Specs, layers);

    const _addNewLayers = () => {
      for (let i = 0; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layer = layers[i];
          // console.log ('pre add layer scene', i, layerDatas);
          layerScene = this.createOutmeshLayer(layer);
          // console.log('add layer scene', i, layerScene);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        // console.log('remove layer scene', i, layerScene);
        this.scene.remove(layerScene);
      }
      // console.log('set layer scenes', layers.length);
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();

    // console.log('ending layer scenes length', this.layerScenes.length);
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
      // try {
        const normal = new Float32Array(planesArrayBuffer, index, 3);
        index += Float32Array.BYTES_PER_ELEMENT * 3;
        const center = new Float32Array(planesArrayBuffer, index, 3);
        index += Float32Array.BYTES_PER_ELEMENT * 3;
        const numVertices = dataView.getUint32(index, true);
        index += Uint32Array.BYTES_PER_ELEMENT;
        const distanceSquaredF = new Float32Array(planesArrayBuffer, index, 1);
        index += Float32Array.BYTES_PER_ELEMENT;
        
        // console.log('plane', i, normal, center, numVertices, distanceSquaredF);
        const planeJson = {
          normal,
          center,
          numVertices,
          distanceSquaredF,
        };
        planesJson.push(planeJson);
      // } catch(err) {
      //   console.warn('fail', err.stack);
      //   debugger;
      // }
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
const _getImageSegements = async imgBlob => {
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

    const boundingBoxLayers = JSON.parse(resHeaders['x-bounding-boxes']);

    return {
      segmentsBlob,
      boundingBoxLayers,
    };
  } else {
    throw new Error('failed to detect image segments');
  }
};

//

export async function compileVirtualScene(imageArrayBuffer) {
  // color
  const blob = new Blob([imageArrayBuffer], {
    type: 'image/png',
  });
  const img = await blob2img(blob);
  img.classList.add('img');
  // document.body.appendChild(img);

  const {width, height} = img;

  // resolution
  const resolution = [
    width,
    height,
  ];

  // {
  //   const res = await fetch(`https://depth.webaverse.com/predictFov`, {
  //     method: 'POST',
  //     body: blob,
  //   });
  //   if (res.ok) {
  //     const j = await res.json();
  //     console.log('predict fov json', j);
  //   } else {
  //     console.warn('invalid response', res.status);
  //   }
  // }
  
  // {
  //   const res = await fetch(`https://depth.webaverse.com/depth`, {
  //     method: 'POST',
  //     body: blob,
  //   });
  //   if (res.ok) {
  //     const arrayBuffer = await res.arrayBuffer();
  //     console.log('got array buffer', arrayBuffer);
  //     const float32Array = new Float32Array(arrayBuffer);
  //     console.log('predict fov json', float32Array);
  //   } else {
  //     console.warn('invalid response', res.status);
  //   }
  // }
  // debugger;

  // image segmentation
  console.time('imageSegmentation');
  let segmentMask;
  {
    const imageSegmentationSpec = await _getImageSegements(blob);
    const {segmentsBlob, boundingBoxLayers} = imageSegmentationSpec;

    const segmentsImageBitmap = await createImageBitmap(segmentsBlob);
    
    {
      const segmentsCanvasMono = segmentsImg2Canvas(segmentsImageBitmap);
      const ctx = segmentsCanvasMono.getContext('2d');

      const imageData = ctx.getImageData(0, 0, segmentsCanvasMono.width, segmentsCanvasMono.height);
      const {data} = imageData;
      segmentMask = new Int32Array(data.byteLength / Int32Array.BYTES_PER_ELEMENT);
      for (let i = 0; i < segmentMask.length; i++) {
        const r = data[i * 4 + 0];
        segmentMask[i] = r;
      }
    }

    {
      const segmentsCanvasColor = segmentsImg2Canvas(segmentsImageBitmap, {
        color: true,
      });
      segmentsCanvasColor.classList.add('imageSegmentationCanvas2');
      segmentsCanvasColor.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(segmentsCanvasColor);
      const ctx = segmentsCanvasColor.getContext('2d');

      drawLabels(ctx, resizeBoundingBoxLayers(
        boundingBoxLayers,
        segmentsImageBitmap.width,
        segmentsImageBitmap.height,
        segmentsCanvasColor.width,
        segmentsCanvasColor.height
      ));
    }
  }
  console.timeEnd('imageSegmentation');

  // point cloud reconstruction
  console.time('pointCloud');
  let {
    headers: pointCloudHeaders,
    arrayBuffer: pointCloudArrayBuffer,
  } = await getPointCloud(blob);
  console.timeEnd('pointCloud');

  // plane detection
  console.time('planeDetection');
  const fov = Number(pointCloudHeaders['x-fov']);
  const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer, panelSize, panelSize);
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
    cameraJson = getPerspectiveCameraJson(camera);
  }
  console.timeEnd('camera');

  const geometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, img.width, img.height);
  const semanticSpecs = getSemanticSpecs({
    geometry,
    segmentMask,
    planesMask,
    planesJson,
    portalJson,
    width: img.width,
    height: img.height,
  });
  const {
    segmentSpecs,
    planeSpecs,
    portalSpecs,
  } = semanticSpecs;

  console.time('floorPlane');
  const floorPlane = new THREE.Plane()
    .setFromNormalAndCoplanarPoint(
      localVector.set(0, 1, 0),
      localVector2.set(0, 0, 0)
    );
  const firstFloorPlaneIndex = getFirstFloorPlaneIndex(planeSpecs);
  if (firstFloorPlaneIndex !== -1) {
    const labelSpec = planeSpecs.labels[firstFloorPlaneIndex];
    const {normal, center} = labelSpec;
    floorPlane.setFromNormalAndCoplanarPoint(
      localVector.fromArray(normal),
      localVector2.fromArray(center)
    );
  }
  const floorPlaneJson = {
    normal: floorPlane.normal.toArray(),
    constant: floorPlane.constant,
  };
  console.timeEnd('floorPlane');

  console.time('floorReconstruction');
  const floorNetCamera = makeFloorNetCamera();
  let floorNetDepthsRaw;
  let floorNetDepths;
  let floorResolution;
  let floorNetCameraJson;
  {
    const floorNetDepthRenderGeometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, width, height);
    const reconstructionSpec = passes.reconstructFloor({
      renderSpecs: [
        {
          geometry: floorNetDepthRenderGeometry,
          width,
          height,
          clipZ: true,
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
  const floorHeightfield = depthFloat32ArrayToHeightfield(
    floorNetDepths,
    floorNetPixelSize,
    floorNetPixelSize,
    floorNetCamera,
  );

  const floorPlaneLabelSpec = firstFloorPlaneIndex !== -1 ?
    planeSpecs.labels[firstFloorPlaneIndex]
  :
    null;
  const floorPlaneCenter = floorPlaneLabelSpec && localVector.fromArray(floorPlaneLabelSpec.center);
  const floorPlaneNormal = floorPlaneLabelSpec && localVector2.fromArray(floorPlaneLabelSpec.normal);
  const floorPlaneLocation = getFloorPlaneLocation({
    floorPlaneCenter,
    floorPlaneNormal,
  });

  const cameraEntranceLocation = getRaycastedCameraEntranceLocation(camera, floorHeightfieldRaw, floorPlaneLocation, floorPlaneJson);
  const portalLocations = getRaycastedPortalLocations(portalSpecs, floorHeightfield, floorPlaneLocation);

  const {
    entranceExitLocations,
    candidateLocations,
  } = sortLocations({
    floorPlaneLocation,
    cameraEntranceLocation,
    portalLocations,
  });

  // query the height
  const predictedHeight = await vqaClient.getPredictedHeight(blob);
  // console.log('got predicted height', predictedHeight);

  const scale = 1;

  // return result
  return {
    resolution,
    segmentMask,
    cameraJson,
    pointCloudHeaders,
    pointCloud: pointCloudArrayBuffer,
    planesJson,
    planesMask,
    portalJson,
    segmentSpecs,
    planeSpecs,
    portalSpecs,
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
    scale,
  };
}