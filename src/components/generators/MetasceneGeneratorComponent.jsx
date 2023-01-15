import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import {useState, useRef, useEffect} from 'react';
import React from 'react';
import classnames from 'classnames';
import alea from 'alea';
import concaveman from 'concaveman';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import {Text} from 'troika-three-text';
// import * as passes from '../../generators/ms-passes.js';
import {
  setPerspectiveCameraFromJson,
  getPerspectiveCameraJson,
  setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../../zine/zine-camera-utils.js';
// import {
//   makeId,
// } from '../../../utils.js';
// import {
//   devServerUrl,
//   devServerTmpUrl,
// } from '../../constants/generator-constants.js';
import {
  reconstructPointCloudFromDepthField,
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
  getDoubleSidedGeometry,
  getGeometryHeights,
} from '../../zine/zine-geometry-utils.js';
import {
  mainImageKey,
  promptKey,
} from '../../zine/zine-data-specs.js';
import {
  panelSize,
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
  physicsPixelStride,
  portalExtrusion,
  entranceExitEmptyDiameter,
  entranceExitHeight,
  entranceExitWidth,
  entranceExitDepth,
  defaultCameraFov,
} from '../../zine/zine-constants.js';
// import {
//   depthVertexShader,
//   depthFragmentShader,
// } from '../../utils/sg-shaders.js';
import {
  depthFloats2Canvas,
} from '../../generators/sg-debug.js';
import {
  makeRenderer,
  makeGltfLoader,
  makeDefaultCamera,
  makeFloorNetCamera,
  makeMapIndexCamera,
  normalToQuaternion,
} from '../../zine/zine-utils.js';
import {
  zineMagicBytes,
  ZineStoryboard,
  ZineStoryboardBase,
  // ZinePanel,
  // ZineData,
  initCompressor,
} from '../../zine/zine-format.js';
// import {
//   ZineRenderer,
// } from '../../zine/zine-renderer.js';
import {colors} from '../../zine/zine-colors.js';
// import {
//   // getCoverageRenderSpecsMeshes,
//   // renderMeshesCoverage,
//   getDepthRenderSpecsMeshes,
//   renderMeshesDepth,
// } from '../../clients/reconstruction-client.js';
import {
  pushMeshes,
} from '../../zine/zine-utils.js';
import {
  shuffle,
} from '../../utils/rng-utils.js';
import {
  downloadFile,
  openZineFile,
  zineFile2Url,
} from '../../utils/http-utils.js';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';

import styles from '../../../styles/MetasceneGenerator.module.css';
import {
  blob2img,
} from '../../utils/convert-utils.js';
import {
  ImageAiClient,
} from '../../clients/image-client.js';
// XXX these should be abstracted out and shared with the engine app
import {
  StoryTargetMesh,
} from '../../generators/story-target-mesh.js';
import {
  FloorTargetMesh,
} from '../../generators/floor-target-mesh.js';
import {
  FlashMesh,
} from '../../generators/flash-mesh.js';
import {
  ArrowMesh,
} from '../../generators/arrow-mesh.js';
import {
  KeyMesh,
} from '../../generators/key-mesh.js';
import {
  getPanelSpecOutlinePositionsDirections,
  makeFlowerGeometry,
  makeFloorFlowerMesh,
  makeFloorPetalMesh,
} from '../../generators/flower-mesh.js';
import {AiClient} from '../../../clients/ai/ai-client.js';
// import {DatabaseClient} from './clients/database/database-client.js';
import {
  getDatasetSpecs,
  getDatasetItems,
  getTrainingItems,
  getDatasetItemsForDatasetSpec,
} from '../../../lore/dataset-engine/dataset-specs.js';
import {
  DatasetGenerator,
  // CachedDatasetGenerator,
} from '../../../lore/dataset-engine/dataset-generator.js';
import {
  useRouter,
} from '../../generators/router.js';
// import {
//   formatDatasetItems,
//   formatDatasetItemsForPolyfill,
// } from './lore/dataset-engine/dataset-parser.js';
import {
  FreeList,
} from '../../utils/allocator-utils.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localVector6 = new THREE.Vector3();
const localVector7 = new THREE.Vector3();
const localVector8 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localVector2D2 = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localPlane = new THREE.Plane();
const localRaycaster = new THREE.Raycaster();
const localBox2D = new THREE.Box2();
const localColor = new THREE.Color();
const localObb = new OBB();
const localCamera = new THREE.Camera();

const zeroVector = new THREE.Vector3(0, 0, 0);
const oneVector = new THREE.Vector3(1, 1, 1);
const upVector = new THREE.Vector3(0, 1, 0);
const y180Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const y180Matrix = new THREE.Matrix4().makeRotationY(Math.PI);

const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0xFF0000,
});

const aiClient = new AiClient();
const imageAiClient = new ImageAiClient();

//

const defaultMaxWorkers = globalThis?.navigator?.hardwareConcurrency ?? 4;
const panelSpecGeometrySize = 256;
const panelSpecTextureSize = 256;
const metazineAtlasTextureSize = 4096;
const metazineAtlasTextureRowSize = Math.floor(metazineAtlasTextureSize / panelSpecTextureSize);
const orbitControlsDistance = 40;
const maxRenderPanels = 64;
const maxRenderEntranceExits = maxRenderPanels * 8;
const matrixWorldTextureWidthInPixels = maxRenderPanels * 16 / 4;
const labelFloatOffset = 0.1;
const controlsMinDistance = 1;
const controlsMaxDistance = 300;

//

const blockEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

//

const collectEntranceExits = panelSpecs => {
  const entranceExitLocations = [];
  for (let i = 0; i < panelSpecs.length; i++) {
    const panelSpec = panelSpecs[i];
    const localEntranceExitLocations = panelSpec.entranceExitLocations.map(eel => {
      const position = localVector.fromArray(eel.position);
      const quaternion = localQuaternion.fromArray(eel.quaternion);
      const scale = localVector2.copy(oneVector);
      localMatrix.compose(
        position,
        quaternion,
        scale
      )
        .premultiply(panelSpec.matrixWorld)
        .decompose(position, quaternion, scale);
      return {
        ...eel,
        position: position.toArray(),
        quaternion: quaternion.toArray(),
      };
    });
    entranceExitLocations.push(...localEntranceExitLocations);
  }
  return entranceExitLocations;
};
const getEntranceExitGeometry = (entranceExitLocations) => {
  if (entranceExitLocations.length > 0) {
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
      const selectIndices = new Int16Array(2 * g.attributes.position.count);
      for (let i = 0; i < g.attributes.position.count; i++) {
        selectIndices[i * 2 + 0] = portalLocation.panelIndex;
        selectIndices[i * 2 + 1] = portalLocation.entranceIndex;
      }
      g.setAttribute('selectIndex', new THREE.BufferAttribute(selectIndices, 2, false));
      return g;
    });
    const geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
    return geometry;
  } else {
    return new THREE.BufferGeometry();
  }
};
// XXX needs to be unified with the one in scene-generator.js
// XXX note that they take different arguments (and use the above holder methods to convert values)
class EntranceExitMesh extends THREE.Mesh {
  constructor({
    panelSpecs,
  }) {
    const entranceExitLocations = collectEntranceExits(panelSpecs);
    const geometry = getEntranceExitGeometry(entranceExitLocations);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSelectIndex: {
          value: -1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute vec2 selectIndex;
        varying vec2 vUv;
        flat varying vec2 vSelectIndex;

        void main() {
          vUv = uv;
          vSelectIndex = selectIndex;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        varying vec2 vUv;
        flat varying vec2 vSelectIndex;

        void main() {
          vec3 c;
          if (vSelectIndex == vec2(-1.)) {
            c = vec3(1., 0., 1.);
          } else {
            c = vec3(0.5, 1., 0.);
          }
          gl_FragColor = vec4(c, 0.5);
          gl_FragColor.rg += vUv * 0.2;
        }
      `,
      transparent: true,
    });
    super(geometry, material);
    this.panelSpecs = panelSpecs;

    const entranceExitMesh = this;
    entranceExitMesh.frustumCulled = false;
    entranceExitMesh.enabled = false;
    entranceExitMesh.visible = false;
    entranceExitMesh.updateVisibility = () => {
      entranceExitMesh.visible = entranceExitMesh.enabled &&
        !!(this.geometry.attributes?.position.count > 0);
    };
  }
  updateGeometry() {
    this.geometry.dispose();

    const entranceExitLocations = collectEntranceExits(this.panelSpecs);
    const geometry = getEntranceExitGeometry(entranceExitLocations);
    this.geometry = geometry;
  }
}

//

const intersectFloor = (mouse, camera, vectorTarget) => {
  const floorPlane = localPlane.setFromNormalAndCoplanarPoint(
    upVector,
    zeroVector
  );
  localRaycaster.setFromCamera(mouse, camera);
  return localRaycaster.ray.intersectPlane(floorPlane, vectorTarget);
};
class PickerMesh3D extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x808080,
      opacity: 0.5,
      transparent: true,
    });
    
    super(geometry, material);
    
    this.frustumCulled = false;
  }
}
class PanelPicker3D extends THREE.Object3D {
  constructor({
    canvas,
    camera,
    controls,
    panelSpecs,
  }) {
    super();

    this.canvas = canvas;
    this.camera = camera;
    this.controls = controls;
    this.panelSpecs = panelSpecs;

    // select
    this.hoverPanelSpec = null;
    this.selectPanelSpec = null;

    // mouse
    const mouse = new THREE.Vector2();
    this.mouse = mouse;

    // picker mesh
    const pickerMesh = new PickerMesh3D();
    this.add(pickerMesh);
    pickerMesh.updateMatrixWorld();
    this.pickerMesh = pickerMesh;

    // state
    this.dragSpec = null;
  }
  handleMousedown(e) {
    const isLeftClick = e.button === 0;
    if (isLeftClick) {
      let startPanelSpec;
      let startCenterPosition;
      let startQuaternion;
      if (
        this.selectPanelSpec &&
        this.hoverPanelSpec === this.selectPanelSpec
      ) {
        startPanelSpec = this.selectPanelSpec;
        const {
          boundingBox,
        } = startPanelSpec;

        const bbox = new THREE.Box3(
          new THREE.Vector3().fromArray(boundingBox.min),
          new THREE.Vector3().fromArray(boundingBox.max)
        ).applyMatrix4(startPanelSpec.matrix);
        const center = bbox.getCenter(new THREE.Vector3());

        startCenterPosition = center.clone();
        startQuaternion = startPanelSpec.quaternion.clone();
      } else {
        startCenterPosition = null;
        startQuaternion = null;
      }

      const startFloorIntersection = intersectFloor(this.mouse, this.camera, localVector);

      this.dragSpec = {
        startX: e.clientX,
        startY: e.clientY,
        panelSpec: startPanelSpec,
        startCenterPosition,
        startQuaternion,
        startFloorIntersection: startFloorIntersection && startFloorIntersection.clone(),
      };
      this.controls.enabled = !this.selectPanelSpec ||
        this.hoverPanelSpec !== this.selectPanelSpec;
    }
  }
  handleMouseup(e) {
    const isLeftClick = e.button === 0;
    if (isLeftClick && this.dragSpec) {
      const {
        clientX,
        clientY,
      } = e;
      const {
        startX,
        startY,
      } = this.dragSpec;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      if (deltaX === 0 && deltaY === 0) {
        this.select();
      }
      
      this.dragSpec = null;
      this.controls.enabled = true;
    }
  }
  handleMousemove(e) {
    // set the raycaster from mouse event
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.mouse.set(
      (x / rect.width) * 2 - 1,
      -(y / rect.height) * 2 + 1
    );
    
    if (!this.dragSpec) { // not dragging
      this.update();
    } else { // dragging
      const {
        panelSpec,
        startCenterPosition,
        startQuaternion,
        startFloorIntersection,
      } = this.dragSpec;

      if (panelSpec && startFloorIntersection) {
        const floorIntersection = intersectFloor(this.mouse, this.camera, localVector);
        if (floorIntersection) {
          const delta = floorIntersection.clone()
            .sub(startFloorIntersection);
          const length = delta.length();
          const maxDragLength = 100;
          if (length > maxDragLength) {
            delta.multiplyScalar(maxDragLength / length);
          }

          const newCenterPosition = startCenterPosition.clone()
            .add(delta);

          this.drag(newCenterPosition, startQuaternion);
          this.dispatchEvent({
            type: 'panelgeometryupdate',
          });
        }
      }
    }
  }
  update() {
    localRaycaster.setFromCamera(this.mouse, this.camera);

    this.pickerMesh.visible = false;

    const oldHoverPanelSpec = this.hoverPanelSpec;
    this.hoverPanelSpec = null;

    // find panel spec intersections
    let closestIntersectionDistance = Infinity;
    for (let i = 0; i < this.panelSpecs.length; i++) {
      const panelSpec = this.panelSpecs[i];

      // if we are selected, only hover over the selected panel
      if (!this.selectPanelSpec || this.selectPanelSpec === panelSpec) {
        const {
          boundingBox,
        } = panelSpec;

        const p = localVector;
        const q = localQuaternion;
        const s = localVector2;
        panelSpec.matrixWorld.decompose(p, q, s);

        const bbox = new THREE.Box3(
          localVector3.fromArray(boundingBox.min),
          localVector4.fromArray(boundingBox.max)
        );
        const center = bbox.getCenter(localVector5);
        const size = bbox.getSize(localVector6);

        const centerOffset = localVector7.copy(center)
          .applyQuaternion(q);

        const obb = localObb;
        obb.center.copy(centerOffset);
        obb.halfSize.copy(size)
          .multiplyScalar(0.5);
        obb.rotation.identity();
        obb.applyMatrix4(panelSpec.matrixWorld)
        
        const intersection = obb.intersectRay(localRaycaster.ray, localVector8);
        if (intersection) {
          const distance = localRaycaster.ray.origin.distanceTo(intersection);
          if (distance < closestIntersectionDistance) {
            closestIntersectionDistance = distance;

            this.pickerMesh.position.copy(p)
              .add(centerOffset);
            this.pickerMesh.quaternion.copy(q);
            this.pickerMesh.scale.copy(size);
            this.pickerMesh.updateMatrixWorld();
            this.pickerMesh.visible = true;

            this.hover(panelSpec);
          }
        }
      }
    }
    if (this.hoverPanelSpec !== oldHoverPanelSpec) {
      this.dispatchEvent({
        type: 'hoverchange',
        hoverPanelSpec: this.hoverPanelSpec,
      });
    }
  }
  hover(panelSpec) {
    this.hoverPanelSpec = panelSpec;
  }
  select() {
    this.selectPanelSpec = this.hoverPanelSpec;

    this.dispatchEvent({
      type: 'selectchange',
      selectPanelSpec: this.selectPanelSpec,
    });
  }
  drag(newCenterPosition, newQuaternion) {
    const panelSpec = this.selectPanelSpec;
    const {
      boundingBox,
    } = panelSpec;

    const getClosestEntranceExitSnap = () => {
      const {
        entranceExitLocations,
      } = panelSpec;

      let closestDistance = Infinity;
      let closestPanelSpec = null;
      let closestEntranceExitLocation = null;
      let closestOtherPanelSpec = null;
      let closestOtherEntranceExitLocation = null;
      for (let i = 0; i < this.panelSpecs.length; i++) {
        const otherPanelSpec = this.panelSpecs[i];
        if (otherPanelSpec === panelSpec) {
          continue;
        }

        const {
          entranceExitLocations: otherEntranceExitLocations,
        } = otherPanelSpec;
        for (let j = 0; j < otherEntranceExitLocations.length; j++) {
          const otherEntranceExitLocation = otherEntranceExitLocations[j];
          
          localMatrix.compose(
            localVector.fromArray(otherEntranceExitLocation.position),
            localQuaternion.fromArray(otherEntranceExitLocation.quaternion),
            oneVector
          )
            .premultiply(otherPanelSpec.transformScene.matrixWorld)
            .decompose(localVector, localQuaternion, localVector2);
          localVector.y = 0; // snap to floor

          const otherEntrancePosition = localVector;
          const otherEntranceDirection = localVector2.set(0, 0, -1)
            .applyQuaternion(localQuaternion);
          otherEntranceDirection.y = 0;
          otherEntranceDirection.normalize();
          otherEntranceDirection.applyQuaternion(y180Quaternion);

          for (let k = 0; k < entranceExitLocations.length; k++) {
            const entranceExitLocation = entranceExitLocations[k];
            
            localMatrix2.compose(
              localVector3.fromArray(entranceExitLocation.position),
              localQuaternion2.fromArray(entranceExitLocation.quaternion),
              oneVector
            )
              .premultiply(panelSpec.transformScene.matrixWorld)
              .decompose(localVector3, localQuaternion2, localVector4);
            localVector3.y = 0; // snap to floor

            const entrancePosition = localVector3;
            const entranceDirection = localVector4.set(0, 0, -1)
              .applyQuaternion(localQuaternion2);
            entranceDirection.y = 0;
            entranceDirection.normalize();

            // only snap to entrance/exit locations that are facing the same quadrant
            const angle = otherEntranceDirection.angleTo(entranceDirection);
            if (angle <= Math.PI / 2) {
              const distance = otherEntrancePosition.distanceTo(entrancePosition);
              if (distance < closestDistance) {
                closestDistance = distance;

                closestPanelSpec = panelSpec;
                closestEntranceExitLocation = entranceExitLocation;

                closestOtherPanelSpec = otherPanelSpec;
                closestOtherEntranceExitLocation = otherEntranceExitLocation;
              }
            }
          }
        }
      }

      if (closestDistance < 10) {
        return {
          distance: closestDistance,
          panelSpec: closestPanelSpec,
          entranceExitLocation: closestEntranceExitLocation,
          otherPanelSpec: closestOtherPanelSpec,
          otherEntranceExitLocation: closestOtherEntranceExitLocation,
        };
      } else {
        return null;
      }
    };

    // unlink entrance/exit indices
    const selectedPanelIndex = this.panelSpecs.indexOf(this.selectPanelSpec);
    for (let i = 0; i < panelSpec.entranceExitLocations.length; i++) {
      const eel = panelSpec.entranceExitLocations[i];

      if (eel.panelIndex === selectedPanelIndex) {
        eel.panelIndex = -1;
        eel.entranceIndex = -1;
      }
    }
    for (let i = 0; i < panelSpec.entranceExitLocations.length; i++) {
      const eel = panelSpec.entranceExitLocations[i];
      
      const {
        panelIndex,
        entranceIndex,
      } = eel;

      if (panelIndex !== -1) {
        const otherPanel = this.panelSpecs[panelIndex];
        const otherEel = otherPanel.entranceExitLocations[entranceIndex];
        otherEel.panelIndex = -1;
        otherEel.entranceIndex = -1;
      }
      
      eel.panelIndex = -1;
      eel.entranceIndex = -1;
    }

    // perform the drag
    const bbox = new THREE.Box3(
      new THREE.Vector3().fromArray(boundingBox.min),
      new THREE.Vector3().fromArray(boundingBox.max)
    );
    const center = bbox.getCenter(new THREE.Vector3());
    const centerOffset = center.clone()
      .applyQuaternion(newQuaternion);

    panelSpec.position.copy(newCenterPosition)
      .sub(centerOffset);
    panelSpec.quaternion.copy(newQuaternion);
    panelSpec.updateMatrixWorld();

    // snap entrance/exit
    const snap = getClosestEntranceExitSnap();
    if (snap) {
      const exitLocation = snap.otherEntranceExitLocation;
      const entranceLocation = snap.entranceExitLocation;
      const exitParentMatrixWorld = snap.otherPanelSpec.transformScene.matrixWorld;
      const entranceParentMatrixWorld = snap.panelSpec.transformScene.matrixWorld;
      const exitPanelSpec = snap.otherPanelSpec;
      const entrancePanelSpec = snap.panelSpec;
      
      {
        // exit location
        const entrancePanelIndex = this.panelSpecs.indexOf(entrancePanelSpec);
        const entranceLocationIndex = entrancePanelSpec.entranceExitLocations.indexOf(entranceLocation);
        exitLocation.panelIndex = entrancePanelIndex;
        exitLocation.entranceIndex = entranceLocationIndex;
      }
      {
        // entrance location
        const exitPanelIndex = this.panelSpecs.indexOf(exitPanelSpec);
        const exitLocationIndex = exitPanelSpec.entranceExitLocations.indexOf(exitLocation);
        entranceLocation.panelIndex = exitPanelIndex;
        entranceLocation.entranceIndex = exitLocationIndex;
      }
      
      connect({
        exitLocation,
        entranceLocation,
        exitParentMatrixWorld,
        entranceParentMatrixWorld,
        target: entrancePanelSpec,
      });
    }

    this.dispatchEvent({
      type: 'panelgeometryupdate',
    });
  }
  rotate(angleY) {
    if (this.selectPanelSpec) {
      const {
        boundingBox,
      } = this.selectPanelSpec;

      const bbox = new THREE.Box3(
        new THREE.Vector3().fromArray(boundingBox.min),
        new THREE.Vector3().fromArray(boundingBox.max)
      ).applyMatrix4(this.selectPanelSpec.matrix);
      const center = bbox.getCenter(new THREE.Vector3());

      this.selectPanelSpec.matrix
        .premultiply(
          new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z)
        )
        .premultiply(
          new THREE.Matrix4().makeRotationFromQuaternion(
            new THREE.Quaternion()
              .setFromAxisAngle(
                upVector,
                angleY
              )
          )
        )
        .premultiply(
          new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
        )
        .decompose(
          this.selectPanelSpec.position,
          this.selectPanelSpec.quaternion,
          localVector2
        );
      this.selectPanelSpec.updateMatrixWorld();

      if (this.dragSpec) {
        this.dragSpec.startQuaternion.copy(this.selectPanelSpec.quaternion);
      }
    }
    this.dispatchEvent({
      type: 'panelgeometryupdate',
    });
  }
}

//

const drawAtlasTexture = async (panelSpec, index, ctx) => {
  const {imageArrayBuffer} = panelSpec;
  const blob = new Blob([imageArrayBuffer]);
  const imageBitmap = await createImageBitmap(blob);
  
  const x = (index % metazineAtlasTextureRowSize) * panelSpecTextureSize;
  let y = Math.floor(index / metazineAtlasTextureRowSize) * panelSpecTextureSize;
  y = metazineAtlasTextureSize - y - panelSpecTextureSize;

  ctx.drawImage(
    imageBitmap,
    x, y,
    panelSpecTextureSize, panelSpecTextureSize
  );
};
class SceneBatchedMesh extends THREE.Mesh {
  static planeGeometry = new THREE.PlaneGeometry(
    1, 1,
    panelSpecGeometrySize - 1, panelSpecGeometrySize - 1
  );
  constructor() {
    const geometry = new THREE.BufferGeometry();

    // attributes
    const positions = new Float32Array(maxRenderPanels * SceneBatchedMesh.planeGeometry.attributes.position.count * 3);
    const positionsAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionsAttribute);
    
    const uvs = new Float32Array(maxRenderPanels * SceneBatchedMesh.planeGeometry.attributes.uv.count * 2);
    const uvsAttribute = new THREE.BufferAttribute(uvs, 2);
    geometry.setAttribute('uv', uvsAttribute);

    const textureIndex = new Float32Array(maxRenderPanels * SceneBatchedMesh.planeGeometry.attributes.position.count);
    for (let i = 0; i < maxRenderPanels; i++) {
      const baseIndex = i * SceneBatchedMesh.planeGeometry.attributes.position.count;
      for (let j = 0; j < SceneBatchedMesh.planeGeometry.attributes.position.count; j++) {
        textureIndex[baseIndex + j] = i;
      }
    }
    const textureIndexAttribute = new THREE.BufferAttribute(textureIndex, 1);
    geometry.setAttribute('textureIndex', textureIndexAttribute);

    // indices
    const indices = new Uint32Array(maxRenderPanels * SceneBatchedMesh.planeGeometry.index.count);
    for (let i = 0; i < maxRenderPanels; i++) {
      for (let j = 0; j < SceneBatchedMesh.planeGeometry.index.count; j++) {
        const dstIndex = i * SceneBatchedMesh.planeGeometry.index.count + j;
        const srcIndex = j;
        const positionsOffset = i * SceneBatchedMesh.planeGeometry.attributes.position.count;
        indices[dstIndex] = positionsOffset + SceneBatchedMesh.planeGeometry.index.array[srcIndex];
      }
    }
    const indicesAttribute = new THREE.BufferAttribute(indices, 1);
    geometry.setIndex(indicesAttribute);
    geometry.setDrawRange(0, 0);

    // virtual instanced texture attributes
    const matrixWorlds = new Float32Array(maxRenderPanels * 16);
    const matrixWorldsTexture = new THREE.DataTexture(
      matrixWorlds,
      matrixWorldTextureWidthInPixels, 1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );

    const scaleOffsets = new Float32Array(maxRenderPanels);
    const scaleOffsetsTexture = new THREE.DataTexture(
      scaleOffsets,
      maxRenderPanels, 1,
      THREE.RedFormat,
      THREE.FloatType,
    );

    const selectIndexes = new Float32Array(maxRenderPanels);
    const selectIndexesTexture = new THREE.DataTexture(
      selectIndexes,
      maxRenderPanels, 1,
      THREE.RedFormat,
      THREE.FloatType,
    );
        
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = metazineAtlasTextureSize;
    atlasCanvas.height = metazineAtlasTextureSize;
    atlasCanvas.ctx = atlasCanvas.getContext('2d');
    atlasCanvas.cssText = `\
      position: relative;
      max-width: 1024px;
      max-height: 1024px;
      background: red;
    `;
    atlasCanvas.classList.add('atlasCanvas');
    document.body.appendChild(atlasCanvas);

    const map = new THREE.Texture(atlasCanvas);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        uSelectIndex: {
          value: -1,
          needsUpdate: true,
        },
        matrixWorldsTexture: {
          value: matrixWorldsTexture,
          needsUpdate: true,
        },
        scaleOffsetsTexture: {
          value: scaleOffsetsTexture,
          needsUpdate: true,
        },
        selectIndexesTexture: {
          value: selectIndexesTexture,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform float uSelectIndex;
        uniform sampler2D matrixWorldsTexture;
        uniform sampler2D scaleOffsetsTexture;
        uniform sampler2D selectIndexesTexture;

        attribute float textureIndex;

        varying vec2 vUv;
        flat varying float vSelected;

        //

        const float maxRenderPanels = ${maxRenderPanels.toFixed(8)};
        const float matrixWorldTextureWidthInPixels = ${matrixWorldTextureWidthInPixels.toFixed(8)};

        //

        vec4 quaternion_inverse(vec4 q) {
          return vec4(-q.xyz, q.w);
        }
        vec3 rotate_vertex_quaternion(vec3 position, vec4 q) {
          vec3 u = q.xyz;
          float s = q.w;
          return position + 2.0 * cross(u, cross(u, position) + s * position);
        }

        void main() {
          vUv = uv;

          // read virtual instance textures
          vec2 baseUv = vec2((textureIndex + 0.5) / maxRenderPanels, 0.5);
          vec2 baseUvMatrixWorld = vec2((textureIndex * 4. + 0.5) / matrixWorldTextureWidthInPixels, 0.5); 

          vec4 matrixWorld1 = texture2D(matrixWorldsTexture, baseUvMatrixWorld + vec2(0., 0.) / matrixWorldTextureWidthInPixels);
          vec4 matrixWorld2 = texture2D(matrixWorldsTexture, baseUvMatrixWorld + vec2(1., 0.) / matrixWorldTextureWidthInPixels);
          vec4 matrixWorld3 = texture2D(matrixWorldsTexture, baseUvMatrixWorld + vec2(2., 0.) / matrixWorldTextureWidthInPixels);
          vec4 matrixWorld4 = texture2D(matrixWorldsTexture, baseUvMatrixWorld + vec2(3., 0.) / matrixWorldTextureWidthInPixels);
          mat4 matrixWorld = mat4(
            matrixWorld1.x, matrixWorld1.y, matrixWorld1.z, matrixWorld1.w,
            matrixWorld2.x, matrixWorld2.y, matrixWorld2.z, matrixWorld2.w,
            matrixWorld3.x, matrixWorld3.y, matrixWorld3.z, matrixWorld3.w,
            matrixWorld4.x, matrixWorld4.y, matrixWorld4.z, matrixWorld4.w
          );
          float scaleOffset = texture2D(scaleOffsetsTexture, baseUv).r;
          float selectIndex = texture2D(selectIndexesTexture, baseUv).r;

          vec3 p = position;

          if (uSelectIndex == -1. || selectIndex == uSelectIndex) {
            vSelected = 1.;
          } else {
            vSelected = 0.;
            p.y -= scaleOffset;
            p.y *= 0.2;
            p.y += scaleOffset;
          }

          gl_Position = projectionMatrix * viewMatrix * matrixWorld * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        varying vec2 vUv;
        flat varying float vSelected;

        void main() {
          gl_FragColor = texture2D(map, vUv);
          if (vSelected == 0.) {
            gl_FragColor.rgb *= 0.5;
            gl_FragColor.a = 0.5;
          }

          // gl_FragColor = vec4(vUv, 0., 1.);
        }
      `,
      transparent: true,
    });
    super(geometry, material);

    this.frustumCulled = false;
    
    this.panelSpecs = [];
    this.freeList = new FreeList(maxRenderPanels);
  }
  addPanel(panelSpec) {
    this.panelSpecs.push(panelSpec);

    const index = this.freeList.alloc(1);
    this.#addPanelSpecToGeometry(panelSpec, index);
    this.#addPanelSpecToTextureAtlas(panelSpec, index);
  }
  #addPanelSpecToGeometry(panelSpec, index) {
    const {
      sceneChunkMesh,
      floorBoundingBox,
    } = panelSpec;
    const {
      geometry,
    } = this;

    // attributes
    const positionsAttribute = geometry.attributes.position;
    const positions = positionsAttribute.array;
    const uvsAttribute = geometry.attributes.uv;
    const uvs = uvsAttribute.array;
    // virtual instance attributes
    const matrixWorldsTexture = this.material.uniforms.matrixWorldsTexture.value;
    const matrixWorlds = matrixWorldsTexture.image.data;
    const scaleOffsetsTexture = this.material.uniforms.scaleOffsetsTexture.value;
    const scaleOffsets = scaleOffsetsTexture.image.data;
    const selectIndexesTexture = this.material.uniforms.selectIndexesTexture.value;
    const selectIndexes = selectIndexesTexture.image.data;

    const floorBoundingBox3 = new THREE.Box3(
      new THREE.Vector3().fromArray(floorBoundingBox.min),
      new THREE.Vector3().fromArray(floorBoundingBox.max)
    );

    // positions
    positions.set(
      sceneChunkMesh.geometry.attributes.position.array,
      index * sceneChunkMesh.geometry.attributes.position.count * 3
    );
    positionsAttribute.needsUpdate = true;

    // uvs
    {
      const srcUvs = SceneBatchedMesh.planeGeometry.attributes.uv.array;
      const px = (index % metazineAtlasTextureRowSize) / metazineAtlasTextureRowSize;
      const py = Math.floor(index / metazineAtlasTextureRowSize) / metazineAtlasTextureRowSize;
      for (let j = 0; j < srcUvs.length; j += 2) {
        const dstIndex = index * srcUvs.length + j;
        const srcIndex = j;
        uvs[dstIndex + 0] = srcUvs[srcIndex + 0] * panelSpecTextureSize / metazineAtlasTextureSize + px;
        uvs[dstIndex + 1] = srcUvs[srcIndex + 1] * panelSpecTextureSize / metazineAtlasTextureSize + py;
      }
      uvsAttribute.needsUpdate = true;
    }

    // virtual instanced texture attributes
    matrixWorlds.set(sceneChunkMesh.matrixWorld.elements, index * 16);
    matrixWorldsTexture.needsUpdate = true;

    scaleOffsets[index] = floorBoundingBox3.min.y;
    scaleOffsetsTexture.needsUpdate = true;

    selectIndexes[index] = index;
    selectIndexesTexture.needsUpdate = true;

    geometry.drawRange.count += SceneBatchedMesh.planeGeometry.index.count;
  }
  async #addPanelSpecToTextureAtlas(panelSpec, index) {
    await drawAtlasTexture(panelSpec, index, this.material.uniforms.map.value.image.ctx);
    this.material.uniforms.map.value.needsUpdate = true;
  }
  updateGeometry() {
    const matrixWorlds = this.material.uniforms.matrixWorldsTexture.value.image.data;
    for (let i = 0; i < this.panelSpecs.length; i++) {
      const panelSpec = this.panelSpecs[i];
      matrixWorlds.set(panelSpec.sceneChunkMesh.matrixWorld.elements, i * 16);
    }
    this.material.uniforms.matrixWorldsTexture.value.needsUpdate = true;
  }
}

//

class PanelPickerGraph extends THREE.Object3D {
  constructor({
    canvas,
    camera,
    controls,
    panelSpecs,
  }) {
    super();

    this.canvas = canvas;
    this.camera = camera;
    this.controls = controls;
    this.panelSpecs = panelSpecs;

    // select
    this.hoverPanelSpec = null;
    this.selectPanelSpec = null;
    this.hoverEntranceLocation = null;

    // mouse
    const mouse = new THREE.Vector2();
    this.mouse = mouse;

    // picker mesh
    const pickerMesh = new FloorTargetMesh();
    this.add(pickerMesh);
    pickerMesh.updateMatrixWorld();
    this.pickerMesh = pickerMesh;

    // state
    this.dragSpec = null;
  }
  handleMousedown(e) {
    const isLeftClick = e.button === 0;
    if (isLeftClick) {
      const startFloorIntersection = intersectFloor(this.mouse, this.camera, localVector);

      const panelSpec = this.hoverPanelSpec;
      const panelStartPosition2D = panelSpec && panelSpec.position2D.clone();

      this.dragSpec = {
        startX: e.clientX,
        startY: e.clientY,
        panelSpec,
        panelStartPosition2D,
        entranceLocation: this.hoverEntranceLocation,
        startFloorIntersection: startFloorIntersection && startFloorIntersection.clone(),
      };
    }
  }
  handleMouseup(e) {
    const isLeftClick = e.button === 0;
    if (isLeftClick && this.dragSpec) {
      const {
        clientX,
        clientY,
      } = e;
      const {
        startX,
        startY,
      } = this.dragSpec;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      if (deltaX === 0 && deltaY === 0) {
        this.selectPanel();
      }
    
      this.dragSpec = null;

      this.dispatchEvent({
        type: 'linkchange',
        startPanelSpec: null,
        entranceLocation: null,
        endPanelSpec: null,
        exitLocation: null,
        startPosition: null,
        endPosition: null,
      });
    }
  }
  handleMousemove(e) {
    // set the raycaster from mouse event
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.mouse.set(
      (x / rect.width) * 2 - 1,
      -(y / rect.height) * 2 + 1
    );

    this.update();

    if (this.dragSpec) {
      const {
        panelSpec,
        panelStartPosition2D,
        entranceLocation,
        startFloorIntersection,
      } = this.dragSpec;

      if (panelSpec && startFloorIntersection) {
        const floorIntersection = intersectFloor(this.mouse, this.camera, localVector);

        if (!entranceLocation) { // panel drag
          const delta = floorIntersection.clone()
            .sub(startFloorIntersection);
          panelSpec.position2D.copy(panelStartPosition2D)
            .add(delta);
          
          this.dispatchEvent({
            type: 'panelgeometryupdate',
          });
        } else { // link drag
          localMatrix.compose(
            localVector2.fromArray(entranceLocation.position),
            localQuaternion.fromArray(entranceLocation.quaternion),
            oneVector
          )
            .premultiply(panelSpec.transformScene.matrixWorld)
            .decompose(
              localVector2,
              localQuaternion,
              localVector3
            );

          const startPosition = localVector2.clone();
          const endPosition = floorIntersection.clone();

          this.dispatchEvent({
            type: 'linkchange',
            startPanelSpec: panelSpec,
            entranceLocation,
            endPanelSpec: this.hoverPanelSpec,
            exitLocation: this.hoverEntranceLocation,
            startPosition,
            endPosition,
          });
        }
      }
    }
  }
  hoverPanel(panelSpec) {
    this.hoverPanelSpec = panelSpec;
  }
  hoverEntrance(entranceLocation) {
    this.hoverEntranceLocation = entranceLocation;
  }
  selectPanel() {
    this.selectPanelSpec = this.hoverPanelSpec;

    this.dispatchEvent({
      type: 'selectchange',
      selectPanelSpec: this.selectPanelSpec,
    });
  }
  update() {
    localRaycaster.setFromCamera(this.mouse, this.camera);

    this.pickerMesh.visible = false;

    const oldHoverPanelSpec = this.hoverPanelSpec;
    this.hoverPanelSpec = null;
    this.hoverEntranceLocation = null;

    this.pickerMesh.visible = false;

    // find entrance/exit intersections
    const intersectEntranceExit = () => {
      for (let i = 0; i < this.panelSpecs.length; i++) {
        const panelSpec = this.panelSpecs[i];

        // if we are selected, only hover over the selected panel
        for (let j = 0; j < panelSpec.entranceExitLocations.length; j++) {
          const eel = panelSpec.entranceExitLocations[j];

          const positionNdc = localVector.fromArray(eel.position)
            .project(panelSpec.camera);
          
          const positionWorld = localVector2.set(
            panelSpec.position2D.x + (positionNdc.x * SceneGraphMesh.size / 2),
            labelFloatOffset,
            panelSpec.position2D.z - (positionNdc.y * SceneGraphMesh.size / 2)
          );

          const floorPlane = localPlane.setFromNormalAndCoplanarPoint(
            upVector,
            zeroVector
          );

          const intersection = localRaycaster.ray.intersectPlane(floorPlane, localVector3);
          if (intersection) {
            const distance = intersection.distanceTo(positionWorld);
            if (distance < entrancePointWidth) {
              this.hoverPanel(panelSpec);
              this.hoverEntrance(eel);

              this.pickerMesh.position.copy(positionWorld);
              this.pickerMesh.updateMatrixWorld();
        
              this.pickerMesh.material.uniforms.scale.value.setScalar(entrancePointWidth);
              this.pickerMesh.material.uniforms.scale.needsUpdate = true;

              this.pickerMesh.visible = true;

              return true;
            }
          }
        }
      }
      return false;
    };
    // find panel spec intersections
    const intersectPanel = () => {
      for (let i = 0; i < this.panelSpecs.length; i++) {
        const panelSpec = this.panelSpecs[i];

        // if we are selected, only hover over the selected panel
        if (!this.selectPanelSpec || this.selectPanelSpec === panelSpec) {
          // compute the 2d bounding box of the panel spec
          const bbox = localBox2D.set(
            localVector2D.set(
              panelSpec.position2D.x - SceneGraphMesh.size / 2,
              panelSpec.position2D.z - SceneGraphMesh.size / 2
            ),
            localVector2D2.set(
              panelSpec.position2D.x + SceneGraphMesh.size / 2,
              panelSpec.position2D.z + SceneGraphMesh.size / 2
            )
          );

          const floorPlane = localPlane.setFromNormalAndCoplanarPoint(
            upVector,
            zeroVector
          );

          const intersection = localRaycaster.ray.intersectPlane(floorPlane, localVector);
          if (intersection) {
            const intersection2D = localVector2D.set(intersection.x, intersection.z);
            if (bbox.containsPoint(intersection2D)) {
              this.hoverPanel(panelSpec);

              this.pickerMesh.position.set(
                panelSpec.position2D.x,
                labelFloatOffset,
                panelSpec.position2D.z
              );
              this.pickerMesh.updateMatrixWorld();
        
              this.pickerMesh.material.uniforms.scale.value.setScalar(SceneGraphMesh.size);
              this.pickerMesh.material.uniforms.scale.needsUpdate = true;

              this.pickerMesh.visible = true;
              
              return true;
            }
          }
        }
      }
      return false;
    };

    intersectEntranceExit() || intersectPanel();

    if (this.hoverPanelSpec !== oldHoverPanelSpec) {
      this.dispatchEvent({
        type: 'hoverchange',
        hoverPanelSpec: this.hoverPanelSpec,
      });
    }
  }
}

//

class SceneGraphMesh extends THREE.InstancedMesh {
  static size = 10;
  static spacing = 0.2;
  static planeGeometry = new THREE.PlaneGeometry(SceneGraphMesh.size, SceneGraphMesh.size)
    .rotateX(-Math.PI / 2);
  constructor() {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.copy(SceneGraphMesh.planeGeometry);

    const selectIndex = new Float32Array(maxRenderPanels);
    const selectIndexAttribute = new THREE.InstancedBufferAttribute(selectIndex, 1);
    geometry.setAttribute('selectIndex', selectIndexAttribute);

    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = metazineAtlasTextureSize;
    atlasCanvas.height = metazineAtlasTextureSize;
    atlasCanvas.ctx = atlasCanvas.getContext('2d');
    atlasCanvas.cssText = `\
      position: relative;
      max-width: 1024px;
      max-height: 1024px;
      background: red;
    `;
    atlasCanvas.classList.add('atlasCanvas');
    document.body.appendChild(atlasCanvas);

    const map = new THREE.Texture(atlasCanvas);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        uSelectIndex: {
          value: -1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform float uSelectIndex;
        uniform sampler2D matrixWorldsTexture;

        attribute float selectIndex;

        varying vec2 vUv;
        flat varying float vSelected;

        //

        const float maxRenderPanels = ${maxRenderPanels.toFixed(8)};
        const float matrixWorldTextureWidthInPixels = ${matrixWorldTextureWidthInPixels.toFixed(8)};
        const float metazineAtlasTextureRowSize = ${metazineAtlasTextureRowSize.toFixed(8)};
        const float panelSpecTextureSize = ${panelSpecTextureSize.toFixed(8)};
        const float metazineAtlasTextureSize = ${metazineAtlasTextureSize.toFixed(8)};

        //

        vec4 quaternion_inverse(vec4 q) {
          return vec4(-q.xyz, q.w);
        }
        vec3 rotate_vertex_quaternion(vec3 position, vec4 q) {
          vec3 u = q.xyz;
          float s = q.w;
          return position + 2.0 * cross(u, cross(u, position) + s * position);
        }

        void main() {
          vUv = uv;
          float px = mod(selectIndex, metazineAtlasTextureRowSize) / metazineAtlasTextureRowSize;
          float py = floor(selectIndex / metazineAtlasTextureRowSize) / metazineAtlasTextureRowSize;
          vUv.x = vUv.x * panelSpecTextureSize / metazineAtlasTextureSize + px;
          vUv.y = vUv.y * panelSpecTextureSize / metazineAtlasTextureSize + py;

          if (uSelectIndex == -1. || selectIndex == uSelectIndex) {
            vSelected = 1.;
          } else {
            vSelected = 0.;
          }

          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        varying vec2 vUv;
        flat varying float vSelected;

        void main() {
          gl_FragColor = texture2D(map, vUv);
          if (vSelected == 0.) {
            gl_FragColor.rgb *= 0.5;
            gl_FragColor.a = 0.5;
          }
        }
      `,
      transparent: true,
    });
    super(geometry, material, maxRenderPanels);

    this.frustumCulled = false;
    this.count = 0;
    
    this.panelSpecs = [];
    this.freeList = new FreeList(maxRenderPanels);
  }
  addPanel(panelSpec) {
    this.panelSpecs.push(panelSpec);

    const index = this.freeList.alloc(1);
    this.#addPanelSpecToGeometry(panelSpec, index);
    this.#addPanelSpecToTextureAtlas(panelSpec, index);
  }
  #addPanelSpecToGeometry(panelSpec, index) {
    const {
      geometry,
    } = this;

    // attributes
    const selectIndexesAttribute = geometry.attributes.selectIndex;
    const selectIndexes = selectIndexesAttribute.array;
    selectIndexes[index] = index;
    selectIndexesAttribute.needsUpdate = true;

    // instance matrix
    const matrix = localMatrix.makeTranslation(
      panelSpec.position2D.x,
      0,
      panelSpec.position2D.z
    );
    this.setMatrixAt(index, matrix);
    this.instanceMatrix.needsUpdate = true;

    this.count++;
  }
  async #addPanelSpecToTextureAtlas(panelSpec, index) {
    await drawAtlasTexture(panelSpec, index, this.material.uniforms.map.value.image.ctx);
    this.material.uniforms.map.value.needsUpdate = true;
  }
  updateGeometry() {
    for (let i = 0; i < this.panelSpecs.length; i++) {
      const panelSpec = this.panelSpecs[i];
      const matrix = localMatrix.makeTranslation(
        panelSpec.position2D.x,
        0,
        panelSpec.position2D.z
      );
      this.setMatrixAt(i, matrix);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

//

class MapIndexMesh extends THREE.Mesh {
  constructor({
    width,
    height,
  }) {
    const geometry = new THREE.PlaneGeometry(floorNetWorldSize, floorNetWorldSize)
      .rotateX(-Math.PI / 2);
  
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: null,
          needsUpdate: false,
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
        uniform sampler2D map;
        varying vec2 vUv;

        void main() {
          gl_FragColor = texture2D(map, vUv);
          
          if (gl_FragColor.a < 0.5) {
            gl_FragColor.rgb = vec3(0.1);
            gl_FragColor.a = 1.;
          }
        }
      `,
      // color: 0xFF0000,
      // transparent: true,
      // opacity: 0.7,
      // side: THREE.BackSide,
      side: THREE.DoubleSide,
    });

    super(geometry, material);
    this.frustumCulled = false;
    this.width = width;
    this.height = height;
  }
  setMapIndex(mapIndex) {
    const mapIndexUnpacked = new Uint8Array(mapIndex.length * 4);
    for (let i = 0; i < mapIndex.length; i++) {
      const indexValue = mapIndex[i];
      const c = localColor.setHex(colors[indexValue % colors.length]);
      mapIndexUnpacked[i * 4] = c.r * 255;
      mapIndexUnpacked[i * 4 + 1] = c.g * 255;
      mapIndexUnpacked[i * 4 + 2] = c.b * 255;
      mapIndexUnpacked[i * 4 + 3] = 255;
    }

    const map = new THREE.DataTexture(
      mapIndexUnpacked,
      this.width,
      this.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    map.minFilter = THREE.NearestFilter;
    map.magFilter = THREE.NearestFilter;
    map.needsUpdate = true;

    this.material.uniforms.map.value = map;
    this.material.uniforms.map.needsUpdate = true;
  }
}

//

const getMapIndexSpecsMeshes = (renderSpecs) => {
  const meshes = [];

  // let vertexShader = depthVertexShader;
  // let fragmentShader = depthFragmentShader;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      // cameraNear: {
      //   value: camera.near,
      //   needsUpdate: true,
      // },
      // cameraFar: {
      //   value: camera.far,
      //   needsUpdate: true,
      // },
      // isPerspective: {
      //   value: +camera.isPerspectiveCamera,
      //   needsUpdate: true,
      // },
    },
    vertexShader: `\
      attribute float panelIndex;
      flat varying float vPanelIndex;

      void main() {
        vPanelIndex = panelIndex;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `\
      flat varying float vPanelIndex;

      void main() {
        gl_FragColor = vec4(vPanelIndex, 0., 0., 1.);
      }
    `,
    side: THREE.BackSide,
  });

  for (const renderSpec of renderSpecs) {
    const {geometry, matrixWorld} = renderSpec;
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mapIndexMesh';
    mesh.frustumCulled = false;
    mesh.matrix.copy(matrixWorld)
      .decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.matrixWorld.copy(mesh.matrix);
    meshes.push(mesh);
  }

  return meshes;
};

//

/* const renderMeshesMapIndexFull = (meshes, width, height, camera) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.classList.add('mapIndexCanvas');
  const renderer = makeRenderer(canvas);
  // document.body.appendChild(canvas);

  const mapIndexScene = new THREE.Scene();
  mapIndexScene.autoUpdate = false;
  for (const mapIndexMesh of meshes) {
    mapIndexScene.add(mapIndexMesh);
  }

  // render target
  const mapIndexRenderTarget = new THREE.WebGLRenderTarget(
    width,
    height,
    {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
    }
  );

  // render
  // XXX render to the canvas, for debugging
  // renderer.render(mapIndexScene, camera);

  // real render to the render target
  renderer.setRenderTarget(mapIndexRenderTarget);
  // renderer.clear();
  renderer.render(mapIndexScene, camera);
  renderer.setRenderTarget(null);
  
  // read back image data
  const imageData = {
    data: new Uint8Array(mapIndexRenderTarget.width * mapIndexRenderTarget.height * 4),
    width,
    height,
  };
  renderer.readRenderTargetPixels(mapIndexRenderTarget, 0, 0, mapIndexRenderTarget.width, mapIndexRenderTarget.height, imageData.data);

  // latch rendered map index data
  // note: we flip in the x direction,
  // since we render from the bottom but we want the image right side up when sampling from the top
  const mapIndex = new Uint8Array(imageData.data.length / 4);
  for (let i = 0; i < imageData.data.length; i += 4) {
    mapIndex[i / 4] = imageData.data[i]; // r
  }
  
  const mapIndexResolution = [
    mapIndexRenderTarget.width,
    mapIndexRenderTarget.height,
  ];

  // return result
  return {
    mapIndex,
    mapIndexResolution,
  };
}; */
const flipUint8ArrayX = (uint8Array, width, height) => {
  const uint8Array2 = new Uint8Array(uint8Array.length);
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      const x = width - 1 - dx;
      const y = dy;
      const dstIndex = x + y * width;
      const srcIndex = dx + dy * width;
      uint8Array2[dstIndex] = uint8Array[srcIndex];
    }
  }
  return uint8Array2;
};
/* export function renderMapIndexFull({
  renderSpecs,
  camera,
}) {
  const width = floorNetPixelSize;
  const height = floorNetPixelSize;
  const meshes = getMapIndexSpecsMeshes(renderSpecs);
  const mapIndexSpec = renderMeshesMapIndexFull(meshes, width, height, camera);
  return mapIndexSpec;
} */
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

//

const getRenderSpecsFromZineRenderers = zineRenderers => {
  return zineRenderers.map((zineRenderer, index) => {
    const {panel} = zineRenderer;
    const layers = panel.getLayers();
    
    // const layer0 = layers[0];
    const layer1 = layers[1];
    const depthFieldArrayBuffer = layer1.getData('depthField');
    const cameraJson = layer1.getData('cameraJson');
    const camera = setPerspectiveCameraFromJson(new THREE.PerspectiveCamera(), cameraJson);
    const resolution = layer1.getData('resolution');
    const [
      width,
      height,
    ] = resolution;
    
    let pointCloudArrayBuffer;
    {
      const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
        depthFieldArrayBuffer,
        width,
        height,
        camera.fov,
      );
      pointCloudArrayBuffer = pointCloudFloat32Array.buffer;
    }

    let geometry = pointCloudArrayBufferToGeometry(pointCloudArrayBuffer, width, height);
    // const panelIndex = new Uint8Array(geometry.attributes.position.count)
    //   .fill(index + 1);
    // geometry.setAttribute('panelIndex', new THREE.BufferAttribute(panelIndex, 1, true));
    // geometry = geometry.toNonIndexed();
    // // add barycentric coordinates
    // const barycentric = new Float32Array(geometry.attributes.position.count * 3);
    // for (let i = 0; i < barycentric.length; i += 9) {
    //   barycentric[i + 0] = 1;
    //   barycentric[i + 1] = 0;
    //   barycentric[i + 2] = 0;

    //   barycentric[i + 3] = 0;
    //   barycentric[i + 4] = 1;
    //   barycentric[i + 5] = 0;

    //   barycentric[i + 6] = 0;
    //   barycentric[i + 7] = 0;
    //   barycentric[i + 8] = 1;
    // }
    // geometry.setAttribute('barycentric', new THREE.BufferAttribute(barycentric, 3));

    const matrixWorld = zineRenderer.transformScene.matrixWorld.clone();
    
    return {
      geometry,
      matrixWorld,
    };
  });
};
/* const getMapIndexFromZineRenderersFull = ({
  zineRenderers,
  camera,
}) => {
  const renderSpecs = getRenderSpecsFromZineRenderers(zineRenderers);
  const mapIndexSpec = renderMapIndexFull({
    renderSpecs,
    camera,
  });
  const mapIndex = mapIndexSpec.mapIndex;
  const mapIndexResolution = mapIndexSpec.mapIndexResolution;

  return {
    mapIndex,
    mapIndexResolution,
  };
}; */
const getMapIndexFromZineRenderersAdd = ({
  oldMapIndex, // old map index
  newZineRenderer, // new zine renderer to add
  attachPanelIndex, // we are ok with the new zine renderer clobbering this panel index only
  camera, // camera used to render the old map index
}) => {
  const newRenderSpecs = getRenderSpecsFromZineRenderers([
    newZineRenderer,
  ]);
  const mapIndexSpec = renderMapIndexAdd({
    oldMapIndex,
    newRenderSpecs,
    attachPanelIndex,
    camera,
  });
  const mapIndex = mapIndexSpec.mapIndex;
  const mapIndexResolution = mapIndexSpec.mapIndexResolution;

  return {
    mapIndex,
    mapIndexResolution,
  };
};

//

class MapIndexMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        mode: {
          value: 0, // 0 = keep, 1 = replace
          needsUpdate: false,
        },
        mapIndexMap: {
          value: null,
          needsUpdate: false,
        },
        resolution: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
        // lastPanelIndex: {
        //   value: 0,
        //   needsUpdate: false,
        // },
        newPanelIndex: {
          value: 0,
          needsUpdate: false,
        },
      },
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          // project the point normally
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          
          float w = gl_Position.w;
          gl_Position /= w;

          // compute uv from position
          vec2 uv = vec2(
            (gl_Position.x + 1.0) / 2.0,
            (gl_Position.y + 1.0) / 2.0
          );

          gl_Position *= w;

          vUv = uv;
        }
      `,
      fragmentShader: `\
        uniform sampler2D mapIndexMap;
        // uniform float lastPanelIndex;
        uniform vec2 resolution;
        uniform float newPanelIndex;
        uniform int mode;
        varying vec2 vUv;

        void main() {
          vec4 oldMapIndexSample = texture2D(mapIndexMap, vUv);
          float oldMapIndex = oldMapIndexSample.r * 255.0;
          float oldDepth = oldMapIndex / 255.0;

          if (mode == ${MapIndexRenderer.MODE_KEEP}) { // keep mode
            // get the uv distance to the nearest edge
            vec2 uvDistance;
            uvDistance.x = min(vUv.x, 1.0 - vUv.x);
            uvDistance.y = min(vUv.y, 1.0 - vUv.y);

            vec2 pixelUvSize = 1.0 / resolution;

            float panelIndexDelta = newPanelIndex - oldMapIndex;
            if (
              (
                oldMapIndex == 0. || panelIndexDelta <= 2.
              ) &&
              (
                uvDistance.x > pixelUvSize.x &&
                uvDistance.y > pixelUvSize.y
              )
            ) { // keepable value
              gl_FragColor = vec4(0., 0., 0., 1.);
            } else { // non-keepable value
              gl_FragColor = vec4(1., 0., 0., 1.);
            }
          } else if (mode == ${MapIndexRenderer.MODE_REPLACE}) { // replace mode
            float newMapIndex = newPanelIndex / 255.0;
            float newDepth = newMapIndex;
            gl_FragColor = vec4(newMapIndex, newDepth, 0.0, 1.);
          } else {
            gl_FragColor = vec4(0., 0., 0., 1.);
          }
        }
      `,
      // depthFunc: THREE.GreaterEqualDepth,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
      // extensions: {
      //   fragDepth: true,
      // },
    });
  }
}
class MapIndexRenderer {
  static MODE_KEEP = 0;
  static MODE_REPLACE = 1;
  constructor() {
    // canvas
    const width = floorNetPixelSize;
    const height = floorNetPixelSize;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // renderer
    this.renderer = makeRenderer(canvas);
    this.renderer.autoClear = false;

    // camera
    this.camera = makeMapIndexCamera();

    // render target
    const _makeRenderTarget = () => {
      return new THREE.WebGLRenderTarget(
        width,
        height,
        {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          // stencilBuffer: false,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        }
      );
    };
    this.renderTargets = [
      _makeRenderTarget(), // read
      _makeRenderTarget(), // write
    ];
    // // clear depth
    // {
    //   this.renderer.state.buffers.depth.setClear(0);
    //   for (let i = 0; i < this.renderTargets.length; i++) {
    //     const renderTarget = this.renderTargets[i];
    //     this.renderer.setRenderTarget(renderTarget);
    //     this.renderer.clear();
    //     this.renderer.setRenderTarget(null);
    //   }
    //   this.renderer.state.buffers.depth.setClear(1);
    // }

    // draw scene
    this.drawScene = new THREE.Scene();
    this.drawScene.autoUpdate = false;
    const drawOverrideMaterial = new MapIndexMaterial();
    this.drawOverrideMaterial = drawOverrideMaterial;
    this.drawScene.overrideMaterial = drawOverrideMaterial;

    // intersect scene
    this.intersectScene = new THREE.Scene();
    this.intersectScene.autoUpdate = false;
    const intersectOverrideMaterial = new MapIndexMaterial();
    this.intersectOverrideMaterial = intersectOverrideMaterial;
    this.intersectScene.overrideMaterial = intersectOverrideMaterial;
  
    // check scene
    this.checkScene = new THREE.Scene();
    this.checkScene.autoUpdate = false;
    // check mesh
    const checkMesh = (() => {
      // full screen quad pane
      const planeGeometry = new THREE.PlaneGeometry(2, 2);
      const instanceCount = width * height;
      // const geometry = new THREE.InstancedBufferGeometry()
      //   .copy(planeGeometry);
      // geometry.instanceCount = instanceCount;
      const geometry = planeGeometry;
      // add instanced uvs
      const uvs = new Float32Array(instanceCount * 2);
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const i = dy * width + dx;
          const u = (dx + 0.5) / width;
          const v = (dy + 0.5) / height;
          uvs[i * 2 + 0] = u;
          uvs[i * 2 + 1] = v;
        }
      }
      geometry.setAttribute('uv', new THREE.InstancedBufferAttribute(uvs, 2));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: {
            value: null,
            needsUpdate: false,
          },
        },
        vertexShader: `\
          uniform sampler2D map;
  
          void main() {
            vec4 value = texture2D(map, uv);
            if (value.r > 0.) {
              gl_Position = vec4(position.xy, 0., 1.0);
            } else {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            }
          }
        `,
        fragmentShader: `\  
          void main() {
            gl_FragColor = vec4(1., 0., 0., 1.);
          }
        `,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.checkScene.add(checkMesh);
    this.checkScene.checkMesh = checkMesh;
    checkMesh.updateMatrixWorld();

    // check render target
    this.checkRenderTarget = new THREE.WebGLRenderTarget(
      1, 1,
      {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      }
    );
    this.checkResultUint8Array = new Uint8Array(
      this.checkRenderTarget.width * this.checkRenderTarget.height * 4
    );
  }
  /* #swapRenderTargets() {
    const temp = this.renderTargets[0];
    this.renderTargets[0] = this.renderTargets[1];
    this.renderTargets[1] = temp;
  } */
  draw(panelSpec, mode, attachPanelIndex, newPanelIndex) {
    const meshes = [panelSpec];

    // console.log('draw panel spec', {
    //   attachPanelIndex,
    //   newPanelIndex,
    // });

    // push
    const popMeshes = pushMeshes(this.drawScene, meshes);

    // render
    {
      // uniforms
      this.drawOverrideMaterial.uniforms.mode.value = mode;
      this.drawOverrideMaterial.uniforms.mode.needsUpdate = true;

      // this.drawOverrideMaterial.uniforms.mapIndexMap.value = this.renderTargets[0].texture;
      // this.drawOverrideMaterial.uniforms.mapIndexMap.needsUpdate = true;

      // this.drawOverrideMaterial.uniforms.lastPanelIndex.value = attachPanelIndex;
      // this.drawOverrideMaterial.uniforms.lastPanelIndex.needsUpdate = true;

      this.drawOverrideMaterial.uniforms.resolution.value.set(floorNetPixelSize, floorNetPixelSize);
      this.drawOverrideMaterial.uniforms.resolution.needsUpdate = true;
      
      this.drawOverrideMaterial.uniforms.newPanelIndex.value = newPanelIndex;
      this.drawOverrideMaterial.uniforms.newPanelIndex.needsUpdate = true;

      // render to the intersect target
      this.renderer.setRenderTarget(this.renderTargets[0]);
      // note: no clear; drawing on top of existing map
      this.renderer.render(this.drawScene, this.camera);
      this.renderer.setRenderTarget(null);

      // swap render targets
      // this.#swapRenderTargets();
    }

    // pop
    popMeshes();
  }
  intersect(panelSpec, attachPanelIndex, newPanelIndex) {
    const meshes = [panelSpec];

    // push
    const popMeshes = pushMeshes(this.intersectScene, meshes);

    // compute intersect
    let intersect;
    {
      // const gl = this.renderer.getContext();

      // uniforms
      this.intersectOverrideMaterial.uniforms.mode.value = MapIndexRenderer.MODE_KEEP;
      this.intersectOverrideMaterial.uniforms.mode.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.mapIndexMap.value = this.renderTargets[0].texture;
      this.intersectOverrideMaterial.uniforms.mapIndexMap.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.resolution.value.set(floorNetPixelSize, floorNetPixelSize);
      this.intersectOverrideMaterial.uniforms.resolution.needsUpdate = true;

      // this.intersectOverrideMaterial.uniforms.lastPanelIndex.value = attachPanelIndex;
      // this.intersectOverrideMaterial.uniforms.lastPanelIndex.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.newPanelIndex.value = newPanelIndex;
      this.intersectOverrideMaterial.uniforms.newPanelIndex.needsUpdate = true;

      // render intersect scene
      this.renderer.setRenderTarget(this.renderTargets[1]);
      this.renderer.clear(); // clear previous result
      this.renderer.render(this.intersectScene, this.camera);
      this.renderer.setRenderTarget(null);
      
      // XXX read intermediate result for debugging
      let debugUint8Array;
      let debugUint8Array2;
      {
        debugUint8Array = new Uint8Array(
          this.renderTargets[1].width * this.renderTargets[1].height * 4
        );
        this.renderer.readRenderTargetPixels(
          this.renderTargets[1],
          0, 0,
          this.renderTargets[1].width, this.renderTargets[1].height,
          debugUint8Array
        );
        // get red only
        debugUint8Array2 = new Uint8Array(
          this.renderTargets[1].width * this.renderTargets[1].height
        );
        for (let i = 0; i < debugUint8Array2.length; i++) {
          debugUint8Array2[i] = debugUint8Array[i * 4];
        }
      }

      // set up check scene
      this.checkScene.checkMesh.material.uniforms.map.value = this.renderTargets[1].texture;
      this.checkScene.checkMesh.material.uniforms.map.needsUpdate = true;
      // render check scene
      this.renderer.setRenderTarget(this.checkRenderTarget);
      this.renderer.clear(); // clear previous result
      this.renderer.render(this.checkScene, this.camera);
      this.renderer.setRenderTarget(null);
      // read the check result
      this.renderer.readRenderTargetPixels(
        this.checkRenderTarget,
        0, 0,
        this.checkRenderTarget.width, this.checkRenderTarget.height,
        this.checkResultUint8Array
      );
      intersect = this.checkResultUint8Array[0] > 0;

      // // XXX debug logging
      // console.log('check intermediate result', debugUint8Array2.filter(n => n !== 0).length, intersect, {
      //   attachPanelIndex,
      //   newPanelIndex,
      //   debugUint8Array2,
      // });
    }

    popMeshes();

    return intersect;
  }
  /* getMapIndexRenderTarget() {
    return this.renderTargets[0];
  } */
  getMapIndex() {
    // read back image data
    const readRenderTarget = this.renderTargets[0];
    const uint8Array = new Uint8Array(
      readRenderTarget.width * readRenderTarget.height * 4
    );
    const {
      width,
      height,
    } = readRenderTarget;
    this.renderer.readRenderTargetPixels(
      readRenderTarget,
      0, 0,
      width, height,
      uint8Array
    );

    // latch rendered map index data
    // note: flip in the x direction,
    // since we render from the bottom but we want the image right side up when sampling from the top
    let mapIndex = new Uint8Array(uint8Array.length / 4);
    for (let i = 0; i < uint8Array.length; i += 4) {
      mapIndex[i / 4] = uint8Array[i]; // r
    }
    mapIndex = flipUint8ArrayX(mapIndex, width, height);

    return mapIndex;
  }
  getMapIndexResolution() {
    const readRenderTarget = this.renderTargets[0];
    const {
      width,
      height,
    } = readRenderTarget;
    return [
      width,
      height,
    ];
  }
}

//

class MetazineLoader {
  constructor({
    total = 1,
  } = {}) {
    this.total = total;

    this.semaphoreValue = defaultMaxWorkers;
    this.queue = [];
  }
  async loadFile(zineFile, index) {
    if (this.semaphoreValue > 0) {
      this.semaphoreValue--;
      try {
        const result = await this.#loadZineFileAsync(zineFile, index);
        return result;
      } finally {
        this.semaphoreValue++;
        if (this.queue.length > 0) {
          const {zineFile, index, accept, reject} = this.queue.shift();
          this.loadFile(zineFile, index)
            .then(accept, reject);
        }
      }
    } else {
      const result = await new Promise((accept, reject) => {
        this.queue.push({
          zineFile,
          index,
          accept,
          reject,
        });
      });
      return result;
    }
  }
  async #loadZineFileAsync(zineFile, index) {
    const fileName = zineFile.name;
    console.log(`loading [${index + 1}/${this.total}] ${fileName}...`);

    // load zine file data
    const zinefileArrayBuffer = await zineFile.arrayBuffer();
    const zinefileUint8Array = new Uint8Array(zinefileArrayBuffer, zineMagicBytes.length);

    // load storyboard
    const storyboard = new ZineStoryboard();
    await storyboard.loadAsync(zinefileUint8Array, {
      decompressKeys: [
        'depthField',
      ],
    });

    // instantiate panel specs
    const panels = storyboard.getPanels();
    const loadPanel = panel => {
      // latch data
      const layer0 = panel.getLayer(0);
      const imageArrayBuffer = layer0.getData(mainImageKey);
      const prompt = layer0.getData(promptKey);
      const layer1 = panel.getLayer(1);
      const positionArray = layer1.getData('position');
      const quaternionArray = layer1.getData('quaternion');
      const scaleArray = layer1.getData('scale');
      const resolution = layer1.getData('resolution');
      const [
        width,
        height,
      ] = resolution;
      const cameraJson = layer1.getData('cameraJson');
      const camera = setPerspectiveCameraFromJson(new THREE.PerspectiveCamera(), cameraJson);
      const boundingBox = layer1.getData('boundingBox');
      const floorBoundingBox = layer1.getData('floorBoundingBox');
      const outlineJson = layer1.getData('outlineJson');
      const depthFieldArrayBuffer = layer1.getData('depthField');
      const entranceExitLocations = layer1.getData('entranceExitLocations');
      const floorPlaneLocation = layer1.getData('floorPlaneLocation');

      // mesh
      const panelSpec = new THREE.Object3D();
      panelSpec.name = fileName;
      panelSpec.description = prompt;
      // NOTE: the file is needed during export
      // the alternative is to keep the data in memory, but that seems worse
      panelSpec.file = zineFile;
      panelSpec.imageArrayBuffer = imageArrayBuffer;
      const imageBlob = new Blob([imageArrayBuffer]);
      const imageBlobUrl = URL.createObjectURL(imageBlob);
      panelSpec.imgSrc = imageBlobUrl;
      panelSpec.resolution = resolution;
      panelSpec.camera = camera;
      panelSpec.boundingBox = boundingBox;
      panelSpec.floorBoundingBox = floorBoundingBox;
      panelSpec.outlineJson = outlineJson;
      panelSpec.entranceExitLocations = entranceExitLocations;
      panelSpec.floorPlaneLocation = floorPlaneLocation;
      panelSpec.position2D = new THREE.Vector3();
      panelSpec.resetToFloorTransform = () => {
        panelSpec.position.set(0, 0, 0);
        panelSpec.quaternion.fromArray(floorPlaneLocation.quaternion)
          .invert(); // level the floor
        panelSpec.scale.set(1, 1, 1);
        panelSpec.updateMatrixWorld();
      };

      // transform scene
      const transformScene = new THREE.Object3D();
      transformScene.position.fromArray(positionArray);
      transformScene.quaternion.fromArray(quaternionArray);
      transformScene.scale.fromArray(scaleArray);
      panelSpec.add(transformScene);
      panelSpec.transformScene = transformScene;
      transformScene.updateMatrixWorld();

      // scene chunk mesh
      let pointCloudArrayBuffer;
      {
        const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
          depthFieldArrayBuffer,
          width,
          height,
          camera.fov,
        );
        pointCloudArrayBuffer = pointCloudFloat32Array.buffer;
      }
      const geometry = pointCloudArrayBufferToGeometry(
        pointCloudArrayBuffer,
        width,
        height,
        panelSpecGeometrySize,
        panelSpecGeometrySize,
      );
      geometry.computeVertexNormals();
      // index material for index map drawing;
      // screen rendering uses batching using this geometry and a different material
      const sceneChunkMesh = new THREE.Mesh(geometry, fakeMaterial);
      sceneChunkMesh.frustumCulled = false;
      transformScene.add(sceneChunkMesh);
      sceneChunkMesh.updateMatrixWorld();
      panelSpec.sceneChunkMesh = sceneChunkMesh;

      return panelSpec;
    };
    const panelSpecs = panels.map(panel => loadPanel(panel));
    return panelSpecs;
  }
}

//

// reset transform to identity
const resetTransform = panelSpec => {
  panelSpec.position.setScalar(0);
  panelSpec.quaternion.identity();
  panelSpec.scale.setScalar(1);
  panelSpec.updateMatrixWorld();
};
const connect = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  return ({
    exitLocation, // targetZineRenderer.metadata.entranceExitLocations[entranceIndex];
    entranceLocation, // this.metadata.entranceExitLocations[exitIndex];
    exitParentMatrixWorld, // this.transformScene.matrixWorld
    entranceParentMatrixWorld, // targetZineRenderer.transformScene.matrixWorld
    target, // targetZineRenderer.scene
  }) => {
    resetTransform(target);

    const exitMatrixWorld = new THREE.Matrix4().compose(
      localVector.fromArray(exitLocation.position),
      localQuaternion.fromArray(exitLocation.quaternion),
      oneVector
    )
      .premultiply(exitParentMatrixWorld)
      .decompose(
        localVector,
        localQuaternion,
        localVector2
      ).compose(
        localVector,
        localQuaternion,
        oneVector
      );

    const entranceMatrixWorld = new THREE.Matrix4().compose(
      localVector.fromArray(entranceLocation.position),
      localQuaternion.fromArray(entranceLocation.quaternion)
        .multiply(y180Quaternion),
      oneVector
    )
      .premultiply(entranceParentMatrixWorld)
      .decompose(
        localVector,
        localQuaternion,
        localVector2
      ).compose(
        localVector,
        localQuaternion,
        oneVector
      );
    const entranceMatrixWorldInverse = entranceMatrixWorld.clone().invert();

    const matrixWorld = entranceMatrixWorldInverse.clone()
      .premultiply(exitMatrixWorld);

    target.matrix.copy(matrixWorld)
      .decompose(
        target.position,
        target.quaternion,
        target.scale
      );
    target.updateMatrixWorld();
  }
})();
export class Metazine extends EventTarget {
  constructor() {
    super();
    
    this.renderPanelSpecs = [];
    this.mapIndexRenderer = null;

    this.#listen();
  }
  #listen() {
    this.addEventListener('panelgeometryupdate', e => {
      this.#updateMapIndex();
    });
  }

  getPanels() {
    return this.panels;
  }
  removePanel(panelSpec) {
    this.removeEntranceExitLinks(panelSpec);

    const index = this.renderPanelSpecs.indexOf(panelSpec);
    this.renderPanelSpecs.splice(index, 1);

    this.dispatchEvent(new MessageEvent('panelgeometryupdate'));
  }
  removeEntranceExitLinks(panelSpec) {
    const index = this.renderPanelSpecs.indexOf(panelSpec);
    
    for (let i = 0; i < this.renderPanelSpecs.length; i++) {
      const otherPanelSpec = this.renderPanelSpecs[i];
      const {entranceExitLocations} = otherPanelSpec;
      
      for (let j = 0; j < entranceExitLocations.length; j++) {
        const eel = entranceExitLocations[j];
        const {
          panelIndex,
          entranceIndex,
        } = eel;
        if (panelIndex === index) {
          eel.panelIndex = -1;
          eel.entranceIndex = -1;
        } else if (panelIndex > index) {
          eel.panelIndex--;
        }
      }
    }
  }
  
  clear() {
    this.zs.clear();
  }
  async compileZineFiles(zineFiles) {
    console.time('loadPanels');
    let panelSpecs;
    {
      const metazineLoader = new MetazineLoader({
        total: zineFiles.length,
      });

      const panelSpecsArray = await Promise.all(
        zineFiles.map((zineFile, index) =>
          metazineLoader.loadFile(zineFile, index)
        )
      );
      panelSpecs = panelSpecsArray.flat();
    }
    console.timeEnd('loadPanels');

    // get the render panel specs
    this.renderPanelSpecs = panelSpecs;
    
    const mapIndexRenderer = new MapIndexRenderer();
    this.mapIndexRenderer = mapIndexRenderer;
    this.mapIndex = mapIndexRenderer.getMapIndex();
    this.mapIndexResolution = mapIndexRenderer.getMapIndexResolution();
  }
  autoConnect() { // automatically connect panel exits to panel entrances
    this.#autoConnect3D();
    this.#autoConnectGraph();
    this.#emitUpdate();
  }

  #autoConnect3D() {
    const rng = alea(seed);
    const panelSpecs = this.renderPanelSpecs;

    // helper functions
    // weighted rng
    const probabalisticIndexRng = (weights) => {
      let weightSum = 0;
      for (let i = 0; i < weights.length; i++) {
        weightSum += weights[i];
      }
      const randomValue = rng() * weightSum;
      let weightSum2 = 0;
      for (let i = 0; i < weights.length; i++) {
        weightSum2 += weights[i];
        if (randomValue < weightSum2) {
          return i;
        }
      }
      return weights.length - 1;
    };
    // randomly choose a panel spec index that satisfies a condition
    const getConditionPanelSpecIndex = (panelSpecs, condition, maxTries = 100) => {
      for (let i = 0; i < maxTries; i++) {
        const panelSpecIndex = Math.floor(rng() * panelSpecs.length);
        const panelSpec = panelSpecs[panelSpecIndex];
        if (condition(panelSpec)) {
          return panelSpecIndex;
        }
      }
      console.warn('failed to find panel spec', panelSpecs, condition);
      return -1;
    };

    // clear entrances/exit panelIndex, entranceIndex to -1
    for (let i = 0; i < panelSpecs.length; i++) {
      const panelSpec = panelSpecs[i];
      for (let j = 0; j < panelSpec.entranceExitLocations.length; j++) {
        const eel = panelSpec.entranceExitLocations[j];
        eel.panelIndex = -1;
        eel.entranceIndex = -1;
      }
    }
    // reset initial transforms
    for (let i = 0; i < panelSpecs.length; i++) {
      const panelSpec = panelSpecs[i];
      resetTransform(panelSpec);
    }
    
    // first panel
    const candidateEntrancePanelSpecs = panelSpecs.slice();
    const firstPanelSpecIndex = getConditionPanelSpecIndex(
      candidateEntrancePanelSpecs,
      panelSpec => panelSpec.entranceExitLocations.length >= 2
    );
    const firstPanelSpec = candidateEntrancePanelSpecs.splice(firstPanelSpecIndex, 1)[0];
    firstPanelSpec.resetToFloorTransform();
    const candidateExitSpecs = firstPanelSpec.entranceExitLocations.map(eel => {
      return {
        panelSpec: firstPanelSpec,
        entranceExitLocation: eel,
      };
    });

    // iteratively connect additional panels
    let numIntersects = 0;
    const maxNumIntersects = 100;
    while (
      candidateExitSpecs.length > 0 &&
      candidateEntrancePanelSpecs.length > 0
    ) {
      // exit location
      const outerExitSpecs = candidateExitSpecs.map(exitSpec => {
        const {panelSpec, entranceExitLocation} = exitSpec;
        localMatrix.compose(
          localVector.fromArray(entranceExitLocation.position),
          localQuaternion.fromArray(entranceExitLocation.quaternion),
          oneVector
        ).premultiply(panelSpec.transformScene.matrixWorld)
        .decompose(
          localVector,
          localQuaternion,
          localVector2
        );
        const outerExitSpec = [
          localVector.x,
          localVector.z,
        ];
        outerExitSpec.exitSpec = exitSpec;
        return outerExitSpec;
      });
      const outerExitSpecsConcave = concaveman(outerExitSpecs, 3)
        .map(o => o.exitSpec);
      const outerExitSpecsConcaveDistances = outerExitSpecsConcave.map(exitSpec => {
        const {panelSpec, entranceExitLocation} = exitSpec;
        new THREE.Matrix4()
          .compose(
            localVector.fromArray(entranceExitLocation.position),
            localQuaternion.fromArray(entranceExitLocation.quaternion),
            oneVector
          )
          .premultiply(panelSpec.transformScene.matrixWorld)
          .decompose(
            localVector,
            localQuaternion,
            localVector2
          );
        const l = localVector.length();
        if (l !== 0) {
          return 1 / l;
        } else {
          return 0;
        }
      });
      const outerExitSpecIndex = probabalisticIndexRng(outerExitSpecsConcaveDistances);
      const exitSpec = outerExitSpecsConcave[outerExitSpecIndex];
      const {
        panelSpec: exitPanelSpec,
        entranceExitLocation: exitLocation,
      } = exitSpec;
      const exitSpecIndex = candidateExitSpecs.indexOf(exitSpec);

      // entrance location
      const entrancePanelSpecIndex = getConditionPanelSpecIndex(
        candidateEntrancePanelSpecs,
        panelSpec => panelSpec.entranceExitLocations.length >= 2
      );
      if (entrancePanelSpecIndex !== -1) {
        const entrancePanelSpec = candidateEntrancePanelSpecs[entrancePanelSpecIndex];
        const candidateEntranceLocations = entrancePanelSpec.entranceExitLocations.slice();
        // choose the location which has the closest angle to the exit location
        const exitDirection = localVector.set(0, 0, -1)
          .applyQuaternion(y180Quaternion)
          .applyQuaternion(localQuaternion.fromArray(exitLocation.quaternion))
        candidateEntranceLocations.sort((a, b) => {
          const aDirection = localVector2.set(0, 0, -1)
            .applyQuaternion(localQuaternion.fromArray(a.quaternion));
          let aDotExitDirection = aDirection.dot(exitDirection);

          const bDirection = localVector3.set(0, 0, -1)
            .applyQuaternion(localQuaternion.fromArray(b.quaternion));
          let bDotExitDirection = bDirection.dot(exitDirection);
          
          return bDotExitDirection - aDotExitDirection; // sort by largest dot product
        });
        const candidateEntranceLocationIndex = 0;
        const entranceLocation = candidateEntranceLocations[candidateEntranceLocationIndex];
        
        // remember indices in both directions
        {
          // exit location
          const entrancePanelIndex = panelSpecs.indexOf(entrancePanelSpec);
          const entranceLocationIndex = entrancePanelSpec.entranceExitLocations.indexOf(entranceLocation);
          exitLocation.panelIndex = entrancePanelIndex;
          exitLocation.entranceIndex = entranceLocationIndex;
        }
        {
          // entrance location
          const exitPanelIndex = panelSpecs.indexOf(exitPanelSpec);
          const exitLocationIndex = exitPanelSpec.entranceExitLocations.indexOf(exitLocation);
          entranceLocation.panelIndex = exitPanelIndex;
          entranceLocation.entranceIndex = exitLocationIndex;
        }

        // latch fixed exit location
        const exitParentMatrixWorld = exitPanelSpec.transformScene.matrixWorld;

        // latch new entrance location
        const entranceParentMatrixWorld = entrancePanelSpec.transformScene.matrixWorld;

        // latch entrance panel spec as the transform target
        connect({
          exitLocation,
          entranceLocation,
          exitParentMatrixWorld,
          entranceParentMatrixWorld,
          target: entrancePanelSpec,
        });
        let intersect = false; // XXX hack
        if (intersect) {
          if (++numIntersects < maxNumIntersects) {
            continue;
          } else {
            console.warn('too many intersects');
            debugger;
          }
        } else {
          // splice exit spec from candidates
          candidateExitSpecs.splice(exitSpecIndex, 1);
          // splice entrance panel spec from candidates
          candidateEntrancePanelSpecs.splice(entrancePanelSpecIndex, 1);

          // splice the used entrance location from entrance panel spec's enter exit location candidates
          candidateEntranceLocations.splice(candidateEntranceLocationIndex, 1);
          // push the remaining unused entrances to candidate exit specs
          const newCandidateExitSpecs = candidateEntranceLocations.map(eel => {
            return {
              panelSpec: entrancePanelSpec,
              entranceExitLocation: eel,
            };
          });
          candidateExitSpecs.push(...newCandidateExitSpecs);
        }
      } else {
        // we couldn't find an entrance location we can connect, so stop
        // console.log('break');
        break;
      }
    }

    // set aside remaining candidate entrance panel specs
    for (let i = 0; i < candidateEntrancePanelSpecs.length; i++) {
      const panelSpec = candidateEntrancePanelSpecs[i];
      panelSpec.position.set(-50, 0, -50);
      panelSpec.updateMatrixWorld();
    }
  }
  #autoConnectGraph() {
    // try to fit into square
    const fullWidth = Math.sqrt(this.renderPanelSpecs.length);
    const fullHeight = fullWidth;
    for (let i = 0; i < this.renderPanelSpecs.length; i++) {
      const panelSpec = this.renderPanelSpecs[i];
      
      const dx = i % fullWidth;
      const dz = Math.floor(i / fullWidth);
      const spacedSize = SceneGraphMesh.size + SceneGraphMesh.spacing;
      panelSpec.position2D.set(
        (-fullWidth / 2 + 0.5 + dx) * spacedSize,
        0,
        (-fullHeight / 2 + 0.5 + dz) * spacedSize
      );
    }
  }
  #emitUpdate() {
    this.dispatchEvent(new MessageEvent('panelgeometryupdate'));
    this.#updateMapIndex();
    this.dispatchEvent(new MessageEvent('mapindexupdate'));
  }
  #updateMapIndex() {
    this.mapIndexRenderer.renderer.clear();

    for (let i = 0; i < this.renderPanelSpecs.length; i++) {
      const panelSpec = this.renderPanelSpecs[i];
      const attachPanelIndex = i;
      const newPanelIndex = i + 1;
      this.mapIndexRenderer.draw(
        panelSpec,
        MapIndexRenderer.MODE_REPLACE,
        attachPanelIndex,
        newPanelIndex
      );
    }
  }

  async exportAsync() {
    const exportStoryboard = new ZineStoryboardBase();
    for (let i = 0; i < this.renderPanelSpecs.length; i++) {
      const panelSpec = this.renderPanelSpecs[i];
      const {
        file: zineFile,
        entranceExitLocations,
      } = panelSpec;
      
      // load
      const zinefileArrayBuffer = await zineFile.arrayBuffer();
      
      // import
      let zinefileUint8Array = new Uint8Array(zinefileArrayBuffer, zineMagicBytes.length);
      
      // copy over changed properties
      const storyboard = new ZineStoryboardBase();
      storyboard.loadUncompressed(zinefileUint8Array);
      const panelIds = storyboard.getKeys();
      for (let j = 0; j < panelIds.length; j++) {
        const panelId = panelIds[j];
        const layerIds = storyboard.zd.getKeys([
          panelId,
        ]);
        const layer1Id = layerIds[1];
        
        storyboard.zd.setData([
          panelId,
          layer1Id,
          'entranceExitLocations',
        ], entranceExitLocations);
      }

      // export
      zinefileUint8Array = storyboard.exportUncompressed();
      
      // merge
      exportStoryboard.mergeUint8Array(zinefileUint8Array);
    }
    const uint8Array = exportStoryboard.exportUncompressed();
    return uint8Array;
  }
}

//

class ChunkEdgeMesh extends THREE.Object3D {
  constructor() {
    super();
  }
  setPanelSpec(panelSpec) {
    // clear old children
    this.clear();

    // positions
    const {
      outlineJson,
      floorPlaneLocation,
    } = panelSpec;
    const {
      positions: flowerPositions,
      directions: flowerDirections,
    } = getPanelSpecOutlinePositionsDirections({
      outlineJson,
      floorPlaneLocation,
      directionMode: 'vertical',
    });
    const flowerGeometry = makeFlowerGeometry(flowerPositions, flowerDirections);
    const {
      positions: flowerPetalPositions,
      directions: flowerPetalDirections,
    } = getPanelSpecOutlinePositionsDirections({
      outlineJson,
      floorPlaneLocation,
      directionMode: 'horizontal',
    });
    const flowerPetalGeometry = makeFlowerGeometry(flowerPetalPositions, flowerPetalDirections);

    // transforms
    const transformPosition = new THREE.Vector3();
    const transformQuaternion = new THREE.Quaternion();
    const transformScale = new THREE.Vector3();
    panelSpec.matrixWorld
      .decompose(transformPosition, transformQuaternion, transformScale);

    // create flower geometry
    const floorFlowerMesh = makeFloorFlowerMesh(flowerGeometry);
    floorFlowerMesh.position.copy(transformPosition);
    floorFlowerMesh.quaternion.copy(transformQuaternion);
    // floorFlowerMesh.scale.copy(transformScale);
    this.add(floorFlowerMesh);
    floorFlowerMesh.updateMatrixWorld();

    const floorPetalMesh = makeFloorPetalMesh(flowerPetalGeometry);
    floorPetalMesh.position.copy(transformPosition);
    floorPetalMesh.quaternion.copy(transformQuaternion);
    // floorPetalMesh.scale.copy(transformScale);
    this.add(floorPetalMesh);
    floorPetalMesh.updateMatrixWorld();
  }
}

//

class UnderfloorMesh extends THREE.Object3D {
  constructor() {
    super();

    const floorTargetMesh = new FloorTargetMesh();
    this.add(floorTargetMesh);
    floorTargetMesh.updateMatrixWorld();
    this.floorTargetMesh = floorTargetMesh;

    const flashMesh = new FlashMesh();
    this.add(flashMesh);
    flashMesh.updateMatrixWorld();
    this.flashMesh = flashMesh;

    const arrowMesh = new ArrowMesh();
    arrowMesh.geometry = arrowMesh.geometry.clone()
      .rotateX(Math.PI)
      .translate(0, 20, 0)
    arrowMesh.frustumCulled = false;
    this.add(arrowMesh);
    arrowMesh.updateMatrixWorld();
    this.arrowMesh = arrowMesh;

    // chunk edge mesh
    const chunkEdgeMesh = new ChunkEdgeMesh();
    this.add(chunkEdgeMesh);
    chunkEdgeMesh.updateMatrixWorld();
    this.chunkEdgeMesh = chunkEdgeMesh;

    // key mesh
    {
      const keyMeshInner = new KeyMesh();
      const keyMesh = new THREE.Object3D();
      keyMesh.add(keyMeshInner);

      keyMeshInner.position.y = 15;
      keyMeshInner.scale.setScalar(5);
      
      this.add(keyMesh);
      keyMesh.updateMatrixWorld();
      this.keyMesh = keyMesh;
    }
  }
  setTransform(panelSpec, position, quaternion, scale) {
    const transformables = [
      this.floorTargetMesh,
      this.flashMesh,
      this.keyMesh,
    ];
    transformables.forEach(mesh => {
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      // mesh.scale.copy(scale);
      mesh.updateMatrixWorld();

      if (mesh.material?.uniforms?.scale) {
        mesh.material.uniforms.scale.value.copy(scale);
        mesh.material.uniforms.scale.needsUpdate = true;
      }
    });
    const translatables = [
      this.arrowMesh,
    ];
    translatables.forEach(mesh => {
      mesh.position.copy(position);
      mesh.updateMatrixWorld();
    });

    this.chunkEdgeMesh.setPanelSpec(panelSpec);
  }
  update() {
    const now = performance.now();

    [
      this.floorTargetMesh,
      this.flashMesh,
    ].forEach(mesh => {
      mesh.material.uniforms.uTime.value = now / 1000;
      mesh.material.uniforms.uTime.needsUpdate = true;
    });
  }
}

//

export class Metazine3DRenderer extends EventTarget {
  constructor({
    canvas,
    metazine,
  }) {
    super();

    this.canvas = canvas;
    this.metazine = metazine;

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('metazine3DRendererCanvas');

    // renderer
    const renderer = makeRenderer(canvas);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    // scene
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    this.scene = scene;
    
    // camera
    const camera = makeDefaultCamera();
    camera.position.set(0, orbitControlsDistance / 2, orbitControlsDistance);
    this.camera = camera;

    // orbit controls
    const controls = new OrbitControls(this.camera, canvas);
    controls.minDistance = controlsMinDistance;
    controls.maxDistance = controlsMaxDistance;
    controls.target.set(0, 0, 0);
    controls.update();
    controls.locked = false;
    this.controls = controls;

    // lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    directionalLight.updateMatrixWorld();
    scene.add(directionalLight);

    // scene batched mesh
    const sceneBatchedMesh = new SceneBatchedMesh();
    // XXX for this and the graph mesh,
    // XXX we should probably keep a direct refernece to metazine.renderPanelSpecs,
    // XX so that we can update when it changes
    for (const panelSpec of metazine.renderPanelSpecs) {
      sceneBatchedMesh.addPanel(panelSpec);
    }
    scene.add(sceneBatchedMesh);
    sceneBatchedMesh.updateMatrixWorld();
    this.sceneBatchedMesh = sceneBatchedMesh;

    // bootstrap
    this.#initAux();
    this.#listen();
    this.#animate();
  }
  #initAux() {
    // panel picker
    const panelPicker = new PanelPicker3D({
      canvas: this.canvas,
      camera: this.camera,
      controls: this.controls,
      panelSpecs: this.metazine.renderPanelSpecs,
    });
    this.scene.add(panelPicker);
    panelPicker.updateMatrixWorld();
    this.panelPicker = panelPicker;
    panelPicker.addEventListener('selectchange', e => {
      this.handlePanelSpecChange(e.selectPanelSpec);
    });

    // entrance exit mesh
    const entranceExitMesh = new EntranceExitMesh({
      panelSpecs: this.metazine.renderPanelSpecs,
    });
    entranceExitMesh.enabled = true;
    entranceExitMesh.updateVisibility();
    this.scene.add(entranceExitMesh);
    entranceExitMesh.updateMatrixWorld();
    this.entranceExitMesh = entranceExitMesh;

    // map index mesh
    const mapIndex = this.metazine.mapIndexRenderer.getMapIndex();
    const mapIndexResolution = this.metazine.mapIndexRenderer.getMapIndexResolution();
    const mapIndexMesh = new MapIndexMesh({
      width: mapIndexResolution[0],
      height: mapIndexResolution[1],
    });
    mapIndexMesh.position.y = -15;
    mapIndexMesh.setMapIndex(mapIndex);
    this.scene.add(mapIndexMesh);
    mapIndexMesh.updateMatrixWorld();
    this.mapIndexMesh = mapIndexMesh;

    // underfloor mesh
    const underfloorMesh = new UnderfloorMesh();
    underfloorMesh.visible = false;
    this.scene.add(underfloorMesh);
    underfloorMesh.updateMatrixWorld();
    this.underfloorMesh = underfloorMesh;

    // story target mesh
    const storyTargetMesh = new StoryTargetMesh();
    storyTargetMesh.visible = true;
    storyTargetMesh.frustumCulled = false;
    storyTargetMesh.scale.setScalar(8);
    this.scene.add(storyTargetMesh);
    storyTargetMesh.updateMatrixWorld();
    this.storyTargetMesh = storyTargetMesh;

    // // debug cube mesh at origin
    // const cubeMesh = new THREE.Mesh(
    //   new THREE.BoxGeometry(1, 1, 1),
    //   new THREE.MeshPhongMaterial({
    //     color: 0xff0000,
    //   })
    // );
    // this.scene.add(cubeMesh);
    // cubeMesh.updateMatrixWorld();
  }
  #listen() {
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
            break;
          }
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousedown = e => {
      this.panelPicker.handleMousedown(e);
    };
    const mouseup = e => {
      this.panelPicker.handleMouseup(e);
    };
    const mousemove = e => {
      this.panelPicker.handleMousemove(e);
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', mousedown);
    document.addEventListener('mouseup', mouseup);
    canvas.addEventListener('mousemove', mousemove);
    canvas.addEventListener('click', blockEvent);
    canvas.addEventListener('wheel', blockEvent);

    const panelgeometryupdate = e => {
      this.sceneBatchedMesh.updateGeometry();
      this.entranceExitMesh.updateGeometry();
    };
    this.metazine.addEventListener('panelgeometryupdate', panelgeometryupdate);
    this.panelPicker.addEventListener('panelgeometryupdate', panelgeometryupdate);
    const mapIndexUpdate = e => {
      const mapIndex = this.metazine.mapIndexRenderer.getMapIndex();
      this.mapIndexMesh.setMapIndex(mapIndex);
    };
    this.metazine.addEventListener('mapindexupdate', mapIndexUpdate);

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', mousedown);
      document.removeEventListener('mouseup', mouseup);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      this.metazine.removeEventListener('panelgeometryupdate', panelgeometryupdate);
      this.panelPicker.removeEventListener('panelgeometryupdate', panelgeometryupdate);
      this.metazine.removeEventListener('mapindexupdate', mapIndexUpdate);
    });
  }
  render() {
    // update
    if (!this.controls.locked) {
      this.controls.update();
    }

    this.storyTargetMesh.position.copy(this.controls.target);
    this.storyTargetMesh.updateMatrixWorld();

    this.underfloorMesh.update();

    // render
    this.renderer.render(this.scene, this.camera);
  }
  #animate() {
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
  handlePanelSpecChange(panelSpec) {
    // update member
    this.selectedPanelSpec = panelSpec;
    
    // update meshes
    {
      const selectIndex = this.metazine.renderPanelSpecs.indexOf(panelSpec);
      this.sceneBatchedMesh.material.uniforms.uSelectIndex.value = selectIndex;
      this.sceneBatchedMesh.material.uniforms.uSelectIndex.needsUpdate = true;
    }
    {
      this.underfloorMesh.visible = panelSpec !== null;
    }

    if (panelSpec) {
      const backOffsetVector = new THREE.Vector3(0, 1, 1);

      // bounding box
      const boundingBox = new THREE.Box3(
        new THREE.Vector3().fromArray(panelSpec.boundingBox.min),
        new THREE.Vector3().fromArray(panelSpec.boundingBox.max)
      );
      const center = boundingBox.getCenter(new THREE.Vector3());
      const worldCenter = center.clone()
        .applyMatrix4(panelSpec.transformScene.matrixWorld);

      // floor bounding box
      const floorBoundingBox = new THREE.Box3(
        new THREE.Vector3().fromArray(panelSpec.floorBoundingBox.min),
        new THREE.Vector3().fromArray(panelSpec.floorBoundingBox.max)
      );
      const floorWorldPosition = new THREE.Vector3();
      const floorWorldQuaternion = new THREE.Quaternion();
      const floorWorldScale = floorBoundingBox.getSize(new THREE.Vector3());
      new THREE.Matrix4()
        .compose(floorWorldPosition, floorWorldQuaternion, floorWorldScale)
        .premultiply(panelSpec.transformScene.matrixWorld)
        .decompose(floorWorldPosition, floorWorldQuaternion, floorWorldScale);

      // panel spec transform
      const transformPosition = new THREE.Vector3();
      const transformQuaternion = new THREE.Quaternion();
      const transformScale = new THREE.Vector3();
      panelSpec.transformScene.matrixWorld
        .decompose(transformPosition, transformQuaternion, transformScale);

      const eulerFlat = new THREE.Euler()
        .setFromQuaternion(transformQuaternion, 'YXZ');
      eulerFlat.x = 0;
      eulerFlat.z = 0;
      const transformQuaternionFlat = new THREE.Quaternion()
        .setFromEuler(eulerFlat);

      const targetCameraDistance = this.controls.target
        .distanceTo(this.camera.position);

      // set camera
      this.camera.position.copy(worldCenter);
      this.camera.quaternion.copy(transformQuaternion);
      this.camera.position
        .add(
          backOffsetVector.clone()
            .normalize()
            .multiplyScalar(targetCameraDistance)
            .applyQuaternion(transformQuaternionFlat)
        );
      this.camera.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(
          this.camera.position,
          worldCenter,
          upVector
        )
      );
      this.camera.updateMatrixWorld();
      // reset fov
      this.camera.fov = defaultCameraFov;
      this.camera.updateProjectionMatrix();

      // set controls
      this.controls.target.copy(worldCenter);
      this.controls.addEventListener('change', e => {
        if (this.controls.locked) {
          this.controls.locked = false;
          this.controls.update();
        }
      });

      // set underfloor
      const underfloorPosition = worldCenter.clone();
      underfloorPosition.y -= 10;
      const underfloorQuaternion = transformQuaternionFlat;
      const underfloorScale = floorWorldScale;
      this.underfloorMesh.setTransform(panelSpec, underfloorPosition, underfloorQuaternion, underfloorScale);
      this.underfloorMesh.updateMatrixWorld();
    }
  }
  setCameraToPanelSpec() {
    if (this.selectedPanelSpec) {
      this.camera.copy(this.selectedPanelSpec.camera)
      this.camera.matrix.premultiply(this.selectedPanelSpec.matrixWorld)
        .decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
      this.camera.updateMatrixWorld();

      this.controls.target.copy(this.camera.position)
        .add(
          new THREE.Vector3(0, 0, -orbitControlsDistance)
            .applyQuaternion(this.camera.quaternion)
        );
      this.controls.locked = true;
    } else {
      console.warn('no panel spec selected');
    }
  }
  rotate(angleY) {
    this.panelPicker.rotate(angleY);
    
    if (this.dragSpec && this.panelPicker.selectPanelSpec) {
      this.dragSpec.startQuaternion.copy(this.panelPicker.selectPanelSpec.quaternion);
    }
  }
  snapshotMap({
    width = 1024,
    height = 1024,
  } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const renderer = makeRenderer(canvas);

    const scene = new THREE.Scene();
    scene.autoClear = false;

    this.sceneBatchedMesh.geometry.computeBoundingBox();
    const {
      boundingBox,
    } = this.sceneBatchedMesh.geometry;
    const worldWidth = boundingBox.max.x - boundingBox.min.x;
    const worldHeight = boundingBox.max.z - boundingBox.min.z;
    const center = boundingBox.getCenter(new THREE.Vector3());

    const camera = makeFloorNetCamera();
    camera.position.x = center.x;
    camera.position.z = center.z;
    camera.updateMatrixWorld();
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.updateProjectionMatrix();

    // push meshes
    this.sceneBatchedMesh.material.side = THREE.BackSide;
    this.sceneBatchedMesh.material.needsUpdate = true;
    const popMeshes = pushMeshes(scene, [
      this.sceneBatchedMesh,
    ]);

    // render
    renderer.render(scene, camera);

    // pop meshes
    this.sceneBatchedMesh.material.side = THREE.FrontSide;
    this.sceneBatchedMesh.material.needsUpdate = true;
    popMeshes();

    // return
    return canvas;
  }
  destroy() {
    console.log('destroy Metazine3DRenderer');
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}
const Metazine3DCanvas = ({
  metazine,
  onPanelSpecChange,
}) => {
  const canvasRef = useRef();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new Metazine3DRenderer({
        canvas,
        metazine,
      });
      const selectchange = e => {
        onPanelSpecChange(e.selectPanelSpec);
      };
      renderer.panelPicker.addEventListener('selectchange', selectchange);

      const _direction = (x, z) => {
        // get candidate panel specs
        const selectablePanelSpecs = renderer.metazine.renderPanelSpecs
          .filter(panelSpec => panelSpec !== renderer.selectedPanelSpec);
        const panelSpecCenters = selectablePanelSpecs
          .map(panelSpec => {
            const boundingBox = new THREE.Box3(
              new THREE.Vector3().fromArray(panelSpec.boundingBox.min),
              new THREE.Vector3().fromArray(panelSpec.boundingBox.max)
            );
            const center = boundingBox.getCenter(new THREE.Vector3());
            const worldCenter = center.clone()
              .applyMatrix4(panelSpec.matrixWorld);
            worldCenter.y = 0;
            return {
              panelSpec,
              center: worldCenter,
            };
          });

        // target position
        const targetPositionFloor = renderer.controls.target.clone();
        targetPositionFloor.y = 0;
        // target direction
        const cameraDirection = new THREE.Vector3(x, 0, z)
          .applyQuaternion(renderer.camera.quaternion);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        // find best candidate
        const getAngle = panelSpecCenter => {
          return panelSpecCenter.center.clone()
            .sub(targetPositionFloor)
            .angleTo(cameraDirection);
        };
        const getDistance = panelSpecCenter => {
          return panelSpecCenter.center.distanceTo(targetPositionFloor);
        };
        const maxSweepCandidates = 3;
        const panelSpecCentersSweep = panelSpecCenters
          .filter(panelSpecCenter => {
            const angle = getAngle(panelSpecCenter);
            return angle <= Math.PI / 6;
          })
          .sort((a, b) => {
            const aDistance = getDistance(a);
            const bDistance = getDistance(b);
            return aDistance - bDistance;
          })
          .slice(0, maxSweepCandidates)
          .sort((a, b) => {
            const aAngle = getAngle(a);
            const bAngle = getAngle(b);
            return aAngle - bAngle;
          });
        if (panelSpecCentersSweep.length > 0) {
          const closestPanelSpec = panelSpecCentersSweep[0].panelSpec;
          renderer.panelPicker.hover(closestPanelSpec);
          renderer.panelPicker.select();
        }
      };
      const _rotate = angleY => {
        renderer.rotate(angleY);
      };
      const keydown = async e => {
        switch (e.key) {
          case 'w': {
            _direction(0, -1);
            break;
          }
          case 'a': {
            _direction(-1, 0);
            break;
          }
          case 's': {
            _direction(0, 1);
            break;
          }
          case 'd': {
            _direction(1, 0);
            break;
          }
          case 'q': {
            _rotate(Math.PI / 2);
            break;
          }
          case 'e': {
            _rotate(-Math.PI / 2);
            break;
          }
          case 'g': {
            renderer.setCameraToPanelSpec();
            break;
          }
          case 'Escape': {
            renderer.panelPicker.hover(null);
            renderer.panelPicker.select();
            break;
          }
          case 'm': {
            e.preventDefault();
            e.stopPropagation();

            const canvas = renderer.snapshotMap();
            canvas.style.cssText = `\
              background: red;
            `;
            document.body.appendChild(canvas);

            // collect edit image properties
            const blob = await new Promise((accept, reject) => {
              canvas.toBlob(blob => {
                accept(blob);
              });
            });
            const maskBlob = blob; // same as blob
            const prompt = 'map, top down aerial view, anime style';

            // edit the image
            console.log('edit map image started...');
            console.time('editMapImage');
            const editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, prompt);
            console.timeEnd('editMapImage');

            const img = await blob2img(editedImgBlob);
            img.style.cssText = `\
              background: blue;
            `;
            document.body.appendChild(img);

            break;
          }
        }
      };
      window.addEventListener('keydown', keydown);

      return () => {
        renderer.destroy();
        renderer.panelPicker.removeEventListener('selectchange', selectchange);
        window.removeEventListener('keydown', keydown);
      };
    }
  }, [metazine, canvasRef.current]);

  return (
    <canvas
      className={styles.canvas}
      width={panelSize}
      height={panelSize}
      ref={canvasRef}
    />
  );
};
const Metazine3DCanvasWrapper = React.memo(Metazine3DCanvas, (prevProps, nextProps) => {
  return prevProps.metazine === nextProps.metazine;
});

//

const entrancePointSize = 0.2;
const entrancePointWidth = 0.6;
const entrancePointEdges = 32;
const entrancePointGeometry = (() => {
  // front geometry
  const circleGeometry = new THREE.CircleGeometry(entrancePointSize, entrancePointEdges);
  const ringGeometry = new THREE.RingGeometry(entrancePointSize * 1.4, entrancePointSize * 1.7, entrancePointEdges);
  const geometryFront = BufferGeometryUtils.mergeBufferGeometries([
    circleGeometry,
    ringGeometry,
  ]);
  geometryFront.rotateX(-Math.PI / 2);
  // color black
  const colorsFront = new Float32Array(geometryFront.attributes.position.count * 3);
  geometryFront.setAttribute('color', new THREE.BufferAttribute(colorsFront, 3));
  
  // back geometry
  const geometryBack = geometryFront.clone();
  // invert positions
  const positionsBack = geometryBack.attributes.position.array;
  for (let i = 0; i < positionsBack.length; i += 3) {
    positionsBack[i + 1] *= -1;
  }
  // scale
  const scaleFactor = 1.15;
  for (let i = 0; i < positionsBack.length; i += 3) {
    positionsBack[i + 0] *= scaleFactor;
    positionsBack[i + 1] *= scaleFactor;
    positionsBack[i + 2] *= scaleFactor;
  }
  // color white
  const colorsBack = geometryBack.attributes.color.array;
  colorsBack.fill(1);

  // merge geometries
  const geometry = BufferGeometryUtils.mergeBufferGeometries([
    geometryBack,
    geometryFront,
  ]);
  return geometry;
})();
class EntrancePointMesh extends THREE.InstancedMesh {
  constructor({
    panelSpecs,
  }) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.copy(entrancePointGeometry);

    const material = new THREE.ShaderMaterial({
      vertexShader: `\
        attribute vec3 color;
        varying vec3 vColor;

        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
    });
    super(geometry, material, maxRenderEntranceExits);

    this.frustrumCulled = false;
    this.count = 0;

    this.panelSpecs = panelSpecs;

    this.updateGeometry();
  }
  updateGeometry() {
    this.count = 0;

    for (let i = 0; i < this.panelSpecs.length; i++) {
      const panelSpec = this.panelSpecs[i];
      for (let j = 0; j < panelSpec.entranceExitLocations.length; j++) {
        const eel = panelSpec.entranceExitLocations[j];

        const positionNdc = localVector.fromArray(eel.position)
          .project(panelSpec.camera);

        const matrix = localMatrix
          .makeTranslation(
            panelSpec.position2D.x + (positionNdc.x * SceneGraphMesh.size / 2),
            0,
            panelSpec.position2D.z - (positionNdc.y * SceneGraphMesh.size / 2)
          );
        this.setMatrixAt(this.count, matrix);
        this.instanceMatrix.needsUpdate = true;
        
        this.count++;
      }
    }
  }
}

//

const maxLinkSegments = 64;
const entranceLinkGeometry = (() => {
  const width = 0.1;
  const rectangleGeometry = new THREE.BoxGeometry(width, 0, 1);

  // front geometry
  const geometriesFront = [];
  for (let i = 0; i < maxLinkSegments; i++) {
    geometriesFront.push(rectangleGeometry);
  }
  const geometryFront = BufferGeometryUtils.mergeBufferGeometries(geometriesFront);
  {
    // link indices
    const linkIndices = new Float32Array(rectangleGeometry.attributes.position.count * maxLinkSegments);
    for (let i = 0; i < maxLinkSegments; i++) {
      const baseIndex = i * rectangleGeometry.attributes.position.count;
      for (let j = 0; j < rectangleGeometry.attributes.position.count; j++) {
        linkIndices[baseIndex + j] = i;
      }
    }
    geometryFront.setAttribute('linkIndex', new THREE.BufferAttribute(linkIndices, 1));

    // color black
    const colorsFront = new Float32Array(rectangleGeometry.attributes.position.count * maxLinkSegments * 3);
    geometryFront.setAttribute('color', new THREE.BufferAttribute(colorsFront, 3));
  }

  // back geometry
  const geometryBack = geometryFront.clone();
  {
    // invert positions
    const positionsBack = geometryBack.attributes.position.array;
    for (let i = 0; i < positionsBack.length; i += 3) {
      positionsBack[i + 1] *= -1;
    }
    // scale positions
    const scaleOffset = 0.05;
    for (let i = 0; i < positionsBack.length; i += 3) {
      positionsBack[i + 0] += scaleOffset * Math.sign(positionsBack[i + 0]);
      positionsBack[i + 1] += scaleOffset * Math.sign(positionsBack[i + 1]);
      positionsBack[i + 2] += scaleOffset * Math.sign(positionsBack[i + 2]);
    }

    // color white
    const colorBack = geometryBack.attributes.color.array;
    colorBack.fill(1);
  }

  // merge geometries
  const geometry = BufferGeometryUtils.mergeBufferGeometries([
    geometryBack,
    geometryFront,
  ]);
  return geometry;
})();
class EntranceLinkMesh extends THREE.InstancedMesh {
  constructor({
    panelSpecs,
  }) {
    // geometry
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.copy(entranceLinkGeometry);
    // attributes
    const starts = new Float32Array(maxRenderEntranceExits * 3);
    geometry.setAttribute('start', new THREE.InstancedBufferAttribute(starts, 3));
    const ends = new Float32Array(maxRenderEntranceExits * 3);
    geometry.setAttribute('end', new THREE.InstancedBufferAttribute(ends, 3));

    // material
    const material = new THREE.ShaderMaterial({
      vertexShader: `\
        attribute float linkIndex;
        attribute vec3 start;
        attribute vec3 end;
        attribute vec3 color;

        varying vec3 vColor;

        const float maxLinkSegments = ${maxLinkSegments.toFixed(8)};
        const float segmentLength = 1.;
        const vec3 up = vec3(0., 1., 0.);

        // make a quaternion from a direction and up vector
        vec4 makeQuaternion(vec3 dir, vec3 up) {
          vec3 right = normalize(cross(up, dir));
          up = normalize(cross(dir, right));
          float trace = right.x + up.y + dir.z;
          if (trace > 0.) {
            float s = 0.5 / sqrt(trace + 1.);
            return vec4(
              (up.z - dir.y) * s,
              (dir.x - right.z) * s,
              (right.y - up.x) * s,
              0.25 / s
            );
          } else if (right.x > up.y && right.x > dir.z) {
            float s = 2. * sqrt(1. + right.x - up.y - dir.z);
            return vec4(
              0.25 * s,
              (right.y + up.x) / s,
              (dir.x + right.z) / s,
              (up.z - dir.y) / s
            );
          } else if (up.y > dir.z) {
            float s = 2. * sqrt(1. + up.y - right.x - dir.z);
            return vec4(
              (right.y + up.x) / s,
              0.25 * s,
              (up.z + dir.y) / s,
              (dir.x - right.z) / s
            );
          } else {
            float s = 2. * sqrt(1. + dir.z - right.x - up.y);
            return vec4(
              (dir.x + right.z) / s,
              (up.z + dir.y) / s,
              0.25 * s,
              (right.y - up.x) / s
            );
          }
        }

        // compose matrix from position, quaternion, and scale
        mat4 composeMatrix(vec3 position, vec4 quaternion, vec3 scale) {
          float x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w;
          float x2 = x + x, y2 = y + y, z2 = z + z;
          float xx = x * x2, xy = x * y2, xz = x * z2;
          float yy = y * y2, yz = y * z2, zz = z * z2;
          float wx = w * x2, wy = w * y2, wz = w * z2;

          mat4 m = mat4(
            1. - (yy + zz), xy + wz, xz - wy, 0.,
            xy - wz, 1. - (xx + zz), yz + wx, 0.,
            xz + wy, yz - wx, 1. - (xx + yy), 0.,
            position.x, position.y, position.z, 1.
          );

          m[0][0] *= scale.x;
          m[0][1] *= scale.x;
          m[0][2] *= scale.x;
          m[1][0] *= scale.y;
          m[1][1] *= scale.y;
          m[1][2] *= scale.y;
          m[2][0] *= scale.z;
          m[2][1] *= scale.z;
          m[2][2] *= scale.z;

          return m;
        }

        void main() {
          vColor = color;

          vec3 delta = end - start;
          vec3 direction = normalize(delta);
          float deltaLength = length(delta);

          float numSegments = floor(deltaLength / segmentLength);
          float currentSegment = linkIndex;
          if (currentSegment < numSegments) {
            vec3 p = start + direction * (currentSegment + 0.5) * segmentLength;
            vec4 q = makeQuaternion(direction, up);
            vec3 s = vec3(1., 1., segmentLength / 2.); // half depth for gap

            mat4 localMatrix = composeMatrix(p, q, s);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * localMatrix * vec4(position, 1.);
          } else {
            gl_Position = vec4(0., 0., 0., 0.);
          }
        }
      `,
      fragmentShader: `\
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, 1.);
        }
      `,
    });
    super(geometry, material, maxRenderEntranceExits);

    this.frustrumCulled = false;
    this.count = 0;

    this.panelSpecs = panelSpecs;

    this.dragSpec = null;

    this.updateGeometry();
  }
  updateDrag({
    startPanelSpec,
    entranceLocation,
    endPanelSpec,
    exitLocation,
    endPosition,
  }) {
    if (startPanelSpec) {
      this.dragSpec = {
        startPanelSpec,
        entranceLocation,
        endPanelSpec,
        exitLocation,
        endPosition,
      };
    } else {
      this.dragSpec = null;
    }

    this.updateGeometry();
  }
  updateGeometry() {
    this.count = 0;

    const startsAttribute = this.geometry.attributes.start;
    const starts = startsAttribute.array;
    const endsAttribute = this.geometry.attributes.end;
    const ends = endsAttribute.array;

    const _drawEntranceExits = () => {
      const getKey = (panelIndex, entranceIndex) => [panelIndex, entranceIndex].join(',');
      const seenKeys = new Set();

      for (let i = 0; i < this.panelSpecs.length; i++) {
        const panelSpec = this.panelSpecs[i];
        for (let j = 0; j < panelSpec.entranceExitLocations.length; j++) {
          const eel = panelSpec.entranceExitLocations[j];
          const key1 = getKey(i, j);

          const {
            panelIndex,
            entranceIndex,
          } = eel;
          if (panelIndex !== -1) {
            const otherPanel = this.panelSpecs[panelIndex];
            const otherEel = otherPanel.entranceExitLocations[entranceIndex];
            const key2 = getKey(panelIndex, entranceIndex);

            if (!seenKeys.has(key1) && !seenKeys.has(key2)) {
              seenKeys.add(key1);
              seenKeys.add(key2);

              const startPositionNdc = localVector.fromArray(eel.position)
                .project(panelSpec.camera);
              const endPositionNdc = localVector2.fromArray(otherEel.position)
                .project(otherPanel.camera);

              const startPositionWorld = localVector3.set(
                panelSpec.position2D.x + (startPositionNdc.x * SceneGraphMesh.size / 2),
                0,
                panelSpec.position2D.z - (startPositionNdc.y * SceneGraphMesh.size / 2)
              );
              const endPositionWorld = localVector4.set(
                otherPanel.position2D.x + (endPositionNdc.x * SceneGraphMesh.size / 2),
                0,
                otherPanel.position2D.z - (endPositionNdc.y * SceneGraphMesh.size / 2)
              );

              startPositionWorld.toArray(starts, this.count * 3);
              endPositionWorld.toArray(ends, this.count * 3);

              this.count++;
            }
          }
        }
      }
    };
    _drawEntranceExits();

    const _drawDrag = () => {
      if (this.dragSpec) {
        const {
          startPanelSpec,
          entranceLocation,
          endPanelSpec,
          exitLocation,
          endPosition,
        } = this.dragSpec;
        
        const startPositionNdc = localVector.fromArray(entranceLocation.position)
          .project(startPanelSpec.camera);
        const startPositionWorld = localVector2.set(
          startPanelSpec.position2D.x + (startPositionNdc.x * SceneGraphMesh.size / 2),
          0,
          startPanelSpec.position2D.z - (startPositionNdc.y * SceneGraphMesh.size / 2)
        );

        let endPositionWorld;
        if (
          (startPanelSpec && endPanelSpec && startPanelSpec !== endPanelSpec) &&
          (entranceLocation && exitLocation && entranceLocation !== exitLocation)
        ) {
          const endPositionWorldNdc = localVector3.fromArray(exitLocation.position)
            .project(endPanelSpec.camera);
          endPositionWorld = localVector4.set(
            endPanelSpec.position2D.x + (endPositionWorldNdc.x * SceneGraphMesh.size / 2),
            0,
            endPanelSpec.position2D.z - (endPositionWorldNdc.y * SceneGraphMesh.size / 2)
          );
        } else {
          endPositionWorld = endPosition;
        }

        startPositionWorld.toArray(starts, this.count * 3);
        endPositionWorld.toArray(ends, this.count * 3);

        this.count++;
      }
    };
    _drawDrag();

    startsAttribute.needsUpdate = true;
    endsAttribute.needsUpdate = true;
  }
}

//

class MetazineGraphRenderer extends EventTarget {
  constructor({
    canvas,
    metazine,
  }) {
    super();

    this.canvas = canvas;
    this.metazine = metazine;

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('metazineGraphRendererCanvas');

    // renderer
    const renderer = makeRenderer(canvas);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    // scene
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    this.scene = scene;
    
    // camera
    const camera = makeDefaultCamera();
    camera.position.set(0, 40, 0);
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.camera = camera;

    // orbit controls
    const controls = new OrbitControls(this.camera, canvas);
    controls.minDistance = controlsMinDistance;
    controls.maxDistance = controlsMaxDistance;
    controls.target.set(0, 0, 0);
    controls.enableRotate = false;
    controls.locked = false;
    this.controls = controls;

    // lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    directionalLight.updateMatrixWorld();
    scene.add(directionalLight);

    // scene graph mesh
    const sceneGraphMesh = new SceneGraphMesh();
    for (const panelSpec of metazine.renderPanelSpecs) {
      sceneGraphMesh.addPanel(panelSpec);
    }
    scene.add(sceneGraphMesh);
    sceneGraphMesh.updateMatrixWorld();
    this.sceneGraphMesh = sceneGraphMesh;

    // state
    this.dragSpec = null;

    this.#initAux();
    this.#listen();
    this.#animate();
  }
  #initAux() {
    // panel picker
    const panelPicker = new PanelPickerGraph({
      canvas: this.canvas,
      camera: this.camera,
      controls: this.controls,
      panelSpecs: this.metazine.renderPanelSpecs,
    });
    this.scene.add(panelPicker);
    panelPicker.updateMatrixWorld();
    this.panelPicker = panelPicker;
    panelPicker.addEventListener('selectchange', e => {
      this.handlePanelSpecChange(e.selectPanelSpec);
    });
    panelPicker.addEventListener('linkchange', e => {
      const {
        startPanelSpec,
        entranceLocation,
        endPanelSpec,
        exitLocation,
        endPosition,
      } = e;
      this.entranceLinkMesh.updateDrag({
        startPanelSpec,
        entranceLocation,
        endPanelSpec,
        exitLocation,
        endPosition,
      });
    });

    // entrance point mesh
    const entrancePointMesh = new EntrancePointMesh({
      panelSpecs: this.metazine.renderPanelSpecs,
    });
    entrancePointMesh.position.set(0, labelFloatOffset, 0);
    this.scene.add(entrancePointMesh);
    entrancePointMesh.updateMatrixWorld();
    this.entrancePointMesh = entrancePointMesh;

    // entrance link mesh
    const entranceLinkMesh = new EntranceLinkMesh({
      panelSpecs: this.metazine.renderPanelSpecs,
    });
    entranceLinkMesh.position.set(0, labelFloatOffset, 0);
    this.scene.add(entranceLinkMesh);
    entranceLinkMesh.updateMatrixWorld();
    this.entranceLinkMesh = entranceLinkMesh;

    // // debug cube mesh at origin
    // const cubeMesh = new THREE.Mesh(
    //   new THREE.BoxGeometry(1, 1, 1),
    //   new THREE.MeshPhongMaterial({
    //     color: 0xff0000,
    //   })
    // );
    // this.scene.add(cubeMesh);
    // cubeMesh.updateMatrixWorld();
  }
  #listen() {
    const panelgeometryupdate = e => {
      this.sceneGraphMesh.updateGeometry();
      this.entrancePointMesh.updateGeometry();
      this.entranceLinkMesh.updateGeometry();
    };
    this.metazine.addEventListener('panelgeometryupdate', panelgeometryupdate);
    this.panelPicker.addEventListener('panelgeometryupdate', panelgeometryupdate);

    const mousedown = e => {
      this.panelPicker.handleMousedown(e);
    };
    const mouseup = e => {
      this.panelPicker.handleMouseup(e);
    };
    const mousemove = e => {
      this.panelPicker.handleMousemove(e);
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', mousedown);
    document.addEventListener('mouseup', mouseup);
    canvas.addEventListener('mousemove', mousemove);
    canvas.addEventListener('click', blockEvent);

    const keydown = async e => {
      switch (e.key) {
        case 'Delete': {
          // console.log('del');
          if (this.panelPicker.selectPanelSpec) {
            this.metazine.removePanel(this.panelPicker.selectPanelSpec);
          }
          break;
        }
        case 'Escape': {
          this.panelPicker.hover(null);
          this.panelPicker.select();
          break;
        }
      }
    };
    window.addEventListener('keydown', keydown);

    this.addEventListener('destroy', e => {
      this.metazine.removeEventListener('panelgeometryupdate', panelgeometryupdate);
      this.panelPicker.removeEventListener('panelgeometryupdate', panelgeometryupdate);

      canvas.removeEventListener('mousedown', mousedown);
      document.removeEventListener('mouseup', mouseup);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);

      window.removeEventListener('keydown', keydown);
    });
  }
  handlePanelSpecChange(panelSpec) {
    const panelIndex = this.metazine.renderPanelSpecs.indexOf(panelSpec);
    this.sceneGraphMesh.material.uniforms.uSelectIndex.value = panelIndex;
    this.sceneGraphMesh.material.uniforms.uSelectIndex.needsUpdate = true;
  }
  render() {
    // update
    if (!this.controls.locked) {
      this.controls.update();
    }

    // render
    this.renderer.render(this.scene, this.camera);
  }
  #animate() {
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
  destroy() {
    console.log('destroy MetazineGraphRenderer');
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}
const MetazineGraphCanvas = ({
  metazine,
  onPanelSpecChange,
}) => {
  const canvasRef = useRef();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new MetazineGraphRenderer({
        canvas,
        metazine,
      });
      const selectchange = e => {
        onPanelSpecChange(e.selectPanelSpec);
      };
      renderer.panelPicker.addEventListener('selectchange', selectchange);

      return () => {
        renderer.destroy();
        renderer.panelPicker.removeEventListener('selectchange', selectchange);
      };
    }
  }, [metazine, canvasRef.current]);

  return (
    <canvas
      className={styles.canvas}
      width={panelSize}
      height={panelSize}
      ref={canvasRef}
    />
  );
};
const MetazineGraphCanvasWrapper = React.memo(MetazineGraphCanvas, (prevProps, nextProps) => {
  return prevProps.metazine === nextProps.metazine;
});

//

const SideScene = ({
  panelSpec,
}) => {
  const [loreEnabled, setLoreEnabled] = useState(false);
  const [biome, setBiome] = useState(null);
  const [description, setDescription] = useState(null);
  const [image, setImage] = useState(null);
  const [imageGallery, setImageGallery] = useState([]);
  const [items, setItems] = useState([]);
  const [mobs, setMobs] = useState([]);
  const [name, setName] = useState(null);
  const [ores, setOres] = useState([]);

  return (
    <div className={styles.overlay}>
      <div className={styles.heroTag}>
        <div className={styles.h1}>
          {panelSpec.name}
        </div>
        <div className={styles.h2}>
          {panelSpec.description}
        </div>
      </div>
      <div className={classnames(styles.infobar, styles.form)}>
        <img src={panelSpec.imgSrc} className={styles.img} />
        {!loreEnabled ? (
          <div
            className={styles.button}
            onClick={async e => {
              setLoreEnabled(true);

              const datasetSpecs = await getDatasetSpecs();
              const datasetGenerator = new DatasetGenerator({
                datasetSpecs,
                aiClient,
                // fillRatio: 0.5,
              });
              const settingSpec = await datasetGenerator.generateItem('setting', {
                // Name: 'Death Mountain',
                Description: panelSpec.description,
              }, {
                // keys: ['Image'],
              });
              console.log('got setting spec', settingSpec);
              const {
                Biome,
                Description,
                Image,
                'Image Gallery': ImageGallery,
                Items,
                Mobs,
                Name,
                Ores,
              } = settingSpec;
              setBiome(Biome);
              setDescription(Description);
              setImage(Image);
              setImageGallery((ImageGallery ?? '').split(/\n+/));
              setItems((Items ?? '').split(/\n+/));
              setMobs((Mobs ?? '').split(/\n+/));
              setName(Name);
              setOres((Ores ?? '').split(/\n+/));
            }}
          >Enable Scene Lore</div>
        ) : <div className={styles.lore}>
          {name && <div className={styles.name}>{name}</div>}
          {description && <div className={styles.description}>{description}</div>}
          {biome && <div className={styles.biome}>{biome}</div>}
          {image && <div className={styles.image}>{image}</div>}
          {imageGallery.length > 0 && <div className={styles.imageGallery}>
            <div className={styles.h3}>Image Gallery</div>
            {imageGallery.map((imgSrc, i) => (
              // <img key={i} src={imgSrc} className={styles.img} />
              <div key={i} className={styles.imgText}>{imgSrc}</div>
            ))}
          </div>}
          {items?.length > 0 && <div className={styles.items}>
            <div className={styles.h3}>Items</div>
            {items.map((item, i) => (
              // <div key={i} className={styles.item}>{item}</div>
              <div key={i} className={styles.imgText}>{item}</div>
            ))}
          </div>}
          {mobs?.length > 0 && <div className={styles.mobs}>
            <div className={styles.h3}>Mobs</div>
            {mobs.map((mob, i) => (
              // <div key={i} className={styles.mob}>{mob}</div>
              <div key={i} className={styles.imgText}>{mob}</div>
            ))}
          </div>}
          {ores?.length > 0 && <div className={styles.ores}>
            <div className={styles.h3}>Ores</div>
            {ores.map((ore, i) => (
              // <div key={i} className={styles.ore}>{ore}</div>
              <div key={i} className={styles.imgText}>{ore}</div>
            ))}
          </div>}
        </div>}
      </div>
    </div>
  );
};
const SideMetascene = ({
  // panelSpec,
}) => {  
  const [loreEnabled, setLoreEnabled] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [objectives, setObjectives] = useState([]);
  const [reward, setReward] = useState('');

  return (
    <div className={styles.overlay}>
      {name ? <div className={styles.heroTag}>
        <div className={styles.h1}>{name}</div>
        <div className={styles.h2}>{description}</div>
        {objectives.length > 0 ? <div className={styles.label}>Objectives</div> : null}
        <div className={styles.list}>
          {objectives.map(objective => (
            <div className={styles.listItem} key={objective}>{objective}</div>
          ))}
        </div>
        {reward ? <div className={styles.label}>Reward</div> : null}
        <div className={styles.h3}>{reward}</div>
      </div> : null}
      <div className={classnames(styles.infobar, styles.form)}>
        {!loreEnabled ? (
          <div
            className={styles.button}
            onClick={async e => {
              setLoreEnabled(true);

              const datasetSpecs = await getDatasetSpecs();
              const datasetGenerator = new DatasetGenerator({
                datasetSpecs,
                aiClient,
                // fillRatio: 0.5,
              });
              const questSpec = await datasetGenerator.generateItem('quest', {
                // Name: 'Death Mountain',
                // Description: 'A mountain in the middle of a desert.',
              }, {
                // keys: ['Image'],
              });
              console.log('got quest spec', questSpec);
              const {
                Name,
                Description,
                Image,
                Objectives,
                Reward,
              } = questSpec;
              setName(Name);
              setDescription(Description);
              setImage(Image);
              setObjectives(Objectives.split(/\n+/));
              setReward(Reward);
            }}
          >Enable Quest Lore</div>
        ) : null}
      </div>
    </div>
  );
};
const MetazineView = ({
  metazine,
  viewMode,
}) => {
  const [panelSpec, setPanelSpec] = useState(null);

  return (
    <>
      {panelSpec ? <div className={styles.header}>
        <button className={styles.button} onClick={async e => {
          e.preventDefault();
          e.stopPropagation();

          const {file} = panelSpec;
          downloadFile(file, file.name);
        }}>Download zine</button>
        <button className={styles.button} onClick={async e => {
          e.preventDefault();
          e.stopPropagation();

          const {file} = panelSpec;
          const src = await zineFile2Url(file);
          
          const u = new URL(globalThis.location.href);
          u.search = '';
          u.searchParams.set('tab', 'sceneGenerator');
          u.searchParams.set('src', src);
          const router = useRouter();
          router.pushUrl(u.href);
        }}>Zine to single</button>
        <button className={styles.button} onClick={async e => {
          e.preventDefault();
          e.stopPropagation();

          const {file} = panelSpec;
          openZineFile(file);
        }}>Zine to app</button>
      </div> : null}
      <div className={styles.metazineCanvas}>
        {panelSpec ? <SideScene panelSpec={panelSpec} /> : <SideMetascene />}
        {(() => {
          switch (viewMode) {
            case '3d': {
              return (
                <Metazine3DCanvasWrapper
                  metazine={metazine}
                  onPanelSpecChange={setPanelSpec}
                />
              );
            }
            case 'graph': {
              return (
                <MetazineGraphCanvasWrapper
                  metazine={metazine}
                  onPanelSpecChange={setPanelSpec}
                />
              );
            }
            default: {
              throw new Error('unknown view mode: ' + viewMode);
            }
          }
        })()}
      </div>
    </>
  );
};

//

const MetasceneGeneratorComponent = () => {
  const [metazine, setMetazine] = useState(() => new Metazine());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('3d');
  const [seed, setSeed] = useState('lol');
  const [maxPanels, setMaxPanels] = useState(16);
  const [files, _setFiles] = useState([]);

  const setFiles = files => {
    const sortedFiles = files.slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    _setFiles(sortedFiles);
    
    // if (sortedFiles.length === 0) {
    //   setLoading(false);
    // }
  };
  const addFiles = newFiles => {
    const allFiles = files.concat(newFiles);
    setFiles(allFiles);
  };
  const compile = async () => {
    // if (files.length > 0) {
      initCompressor({
        numWorkers: defaultMaxWorkers,
      });

      setLoading(true);
      try {
        const filesSorted = shuffle(files.slice(), seed)
          .slice(0, maxPanels);

        await metazine.compileZineFiles(filesSorted, {
          seed,
        });
      } finally {
        setLoading(false);
      }

      setLoaded(true);
    // }
  };
  // const drop = async e => {
  //   const files = Array.from(e.dataTransfer.files);
  //   setFiles(files);
  //   compile(files);
  // };
  const autoConnect = () => {
    metazine.autoConnect();
  };

  const setSrc = async src => {
    if (src) {
      const res = await fetch(src);
      const blob = await res.blob();
      const files = [blob];
      setFiles(files);
      compile(files);
    }
  };
  useEffect(() => {
    const router = useRouter();
    if (router.currentSrc) {
      setSrc(router.currentSrc);
    }
    const srcchange = e => {
      const {src} = e.data;
      setSrc(src);
    };
    router.addEventListener('srcchange', srcchange);
    return () => {
      router.removeEventListener('srcchange', srcchange);
    };
  }, []);

  return (
    <div className={styles.metasceneGenerator}>
      {loading ?
        <div className={styles.header}>
          compiling...
        </div>
      :
        loaded ? (
          <>
            <div className={styles.header}>
              <label className={styles.label}>
                View mode:
                <select className={styles.select} value={viewMode} onChange={e => {
                  setViewMode(e.target.value);
                }}>
                  <option value='3d'>3d</option>
                  <option value='graph'>graph</option>
                </select>
              </label>
            </div>
            <div className={styles.header}>
              <button className={styles.button} onClick={async e => {
                e.preventDefault();
                e.stopPropagation();
      
                const uint8Array = await metazine.exportAsync();
                const blob = new Blob([
                  zineMagicBytes,
                  uint8Array,
                ], {
                  type: 'application/octet-stream',
                });
                downloadFile(blob, 'metazine.zine');
              }}>Download metazine</button>
              <button className={styles.button} onClick={async e => {
                e.preventDefault();
                e.stopPropagation();

                const uint8Array = await metazine.exportAsync();
                const blob = new Blob([
                  zineMagicBytes,
                  uint8Array,
                ], {
                  type: 'application/octet-stream',
                });
                openZineFile(blob);
              }}>Metazine to app</button>
            </div>
            <div className={styles.sidebar}>
              {loading ?
                <div>building...</div>
              :
                <input type='button' value='Auto-Connect' className={styles.button} onClick={autoConnect} />
              }
            </div>
            <MetazineView
              metazine={metazine}
              viewMode={viewMode}
            />
          </>
        ) : (
          <>
            <div className={styles.header}>
              <label className={styles.label}>
                Seed:
                <input type='text' value={seed} onChange={e => {
                  setSeed(e.target.value);
                }} />
              </label>
              <label className={styles.label}>
                Max panels:
                <input type='number' className={styles.numberInput} value={maxPanels} onChange={e => {
                  setMaxPanels(e.target.value);
                }} />
              </label>
              {files.length > 0 ? (
                <button
                  className={styles.button}
                  onClick={compile}
                >Compile</button>
              ) : null}
            </div>
            <div className={styles.main}>
              {loading ?
                null
              : <DropTarget
                  className={styles.panelPlaceholder}
                  // files={files}
                  onFilesAdd={addFiles}
                  // onDrop={drop}
                  multiple
                />
              }
              {files.length > 0 ?
                <div className={styles.files}>
                  <div className={styles.filesHeader}>Files ({files.length}):</div>
                  {files.map((file, i) => {
                    return (
                      <div className={styles.file} key={i}>
                        <div className={styles.fileName}>{file.name}</div>
                        <a className={styles.closeX} onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();

                          const newFiles = files.slice();
                          newFiles.splice(i, 1);
                          setFiles(newFiles);
                        }}>x</a>
                      </div>
                    );
                  })}
                </div>
              :
                null
              }
            </div>
          </>
        )
      }
    </div>
  );
};
export default MetasceneGeneratorComponent;