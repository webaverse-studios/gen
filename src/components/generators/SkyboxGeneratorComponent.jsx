import {useState, useRef, useEffect} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import React from 'react';
import CubemapToEquirectangular from '../../utils/CubemapToEquirectangular.js';
import classnames from 'classnames';
import alea from 'alea';
import concaveman from 'concaveman';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  setPerspectiveCameraFromJson,
  getPerspectiveCameraJson,
  setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../../zine/zine-camera-utils.js';
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
  isRootKey,
} from '../../zine/zine-data-specs.js';
import {
  panelSize,
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
  physicsPixelStride,
  // portalExtrusion,
  entranceExitEmptyDiameter,
  entranceExitHeight,
  entranceExitWidth,
  entranceExitDepth,
  defaultCameraFov,
} from '../../zine/zine-constants.js';
import {
  depthFloats2Canvas,
} from '../../generators/sg-debug.js';
import {
  pushMeshes,
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
import {colors} from '../../zine/zine-colors.js';
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
  // getDatasetItems,
  // getTrainingItems,
  // getDatasetItemsForDatasetSpec,
} from '../../dataset-engine/dataset-specs.js';

import {
  DatasetGenerator,
  // CachedDatasetGenerator,
} from '../../dataset-engine/dataset-generator.js';
import {
  useRouter,
} from '../../generators/router.js';
import {
  FreeList,
} from '../../utils/allocator-utils.js';
import {loadImage} from '../../../utils.js';
import {
  controlsMinDistance,
  controlsMaxDistance,
} from '../../constants/generator-constants.js';

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
const localEuler = new THREE.Euler();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localPlane = new THREE.Plane();
const localRaycaster = new THREE.Raycaster();
const localBox2D = new THREE.Box2();
const localColor = new THREE.Color();
const localObb = new OBB();

const zeroVector = new THREE.Vector3(0, 0, 0);
const oneVector = new THREE.Vector3(1, 1, 1);
const upVector = new THREE.Vector3(0, 1, 0);
const y180Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const y180Matrix = new THREE.Matrix4().makeRotationY(Math.PI);

const size = 756;

// const fakeMaterial = new THREE.MeshBasicMaterial({
//   color: 0xFF0000,
// });

// const aiClient = new AiClient();
// const imageAiClient = new ImageAiClient();
// const gltfLoader = new GLTFLoader();

//

// const defaultMaxWorkers = globalThis?.navigator?.hardwareConcurrency ?? 4;
// const panelSpecGeometrySize = 256;
// const panelSpecTextureSize = 256;
// const metazineAtlasTextureSize = 4096;
// const metazineAtlasTextureRowSize = Math.floor(metazineAtlasTextureSize / panelSpecTextureSize);
// const orbitControlsDistance = 40;
// const maxRenderPanels = 64;
// const maxRenderEntranceExits = maxRenderPanels * 8;
// const matrixWorldTextureWidthInPixels = maxRenderPanels * 16 / 4;
// const labelHeightOffset = 20;
// const labelFloatOffset = 0.1;

//

// const blockEvent = e => {
//   e.preventDefault();
//   e.stopPropagation();
// };

//

let loaded = false;
const SkyboxGeneratorComponent = () => {
  const [renderer, setRenderer] = useState(null);
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      if (!loaded) {
        loaded = true;

        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
        });

        // scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xEEEEEE);
        scene.autoUpdate = false;

        // camera
        const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        camera.position.y = 1;
        camera.updateMatrixWorld();

        // cube render target
        const cubeSize = 1024;
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(cubeSize, {
          format: THREE.RGBAFormat,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
        });
        const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
        cubeCamera.position.copy(camera.position);
        cubeCamera.updateMatrixWorld();

        // or create an unmanaged CubemapToEquirectangular
        const equiUnmanaged = new CubemapToEquirectangular(renderer, false);
        equiUnmanaged.setSize(cubeSize, cubeSize);

        // floor plane
        const floorPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2),
          new THREE.MeshPhongMaterial({
            color: 0x333333,
            side: THREE.DoubleSide,
          })
        );
        scene.add(floorPlane);
        floorPlane.updateMatrixWorld();

        // display texture mesh
        const displayTextureMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.MeshBasicMaterial({
            // color: 0xFFFFFF,
            // map: cubeRenderTarget.texture,
            // map: cubeCopyTexture,
            map: equiUnmanaged.output.texture,
            side: THREE.DoubleSide,
          })
        );
        displayTextureMesh.position.set(0, 1, -2);
        // displayTextureMesh.scale.set(1, 1, 1);
        scene.add(displayTextureMesh);
        displayTextureMesh.updateMatrixWorld();

        // lights
        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 2);
        directionalLight.position.set(0, 1, 0);
        scene.add(directionalLight);
        directionalLight.updateMatrixWorld();

        // orbit controls
        const orbitControls = new OrbitControls(camera, canvas);
        // orbitControls.enableDamping = true;
        orbitControls.target.set(0, 1, -1);
        
        // cube render target copy (for sphere)
        const cubeRenderTargetCopy = new THREE.WebGLCubeRenderTarget(cubeSize, {
          format: THREE.RGBAFormat,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
        });

        // display sphere mesh
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        // flip uvs
        // for (let i = 0; i < sphereGeometry.attributes.uv.count; i++) {
        //   sphereGeometry.attributes.uv.setY(i, 1 - sphereGeometry.attributes.uv.getY(i));
        // }
        const sphereMaterial = new THREE.MeshBasicMaterial({
          // color: 0xFFFFFF,
          // map: cubeRenderTarget.texture,
          map: cubeRenderTargetCopy.texture,
          side: THREE.DoubleSide,
        });
        const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(0, 1, 0);
        scene.add(sphereMesh);
        sphereMesh.updateMatrixWorld();

        // default cube
        const cubeMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshPhongMaterial({
            color: 0x800000,
            // side: THREE.DoubleSide,
          })
        );
        cubeMesh.position.set(0, 3, -3);
        scene.add(cubeMesh);
        cubeMesh.updateMatrixWorld();

        const _recurse = () => {
          frame = requestAnimationFrame(_recurse);

          // update
          orbitControls.update();

          // render cube camera
          displayTextureMesh.visible = false;
          sphereMesh.visible = false;
          
          cubeCamera.update(renderer, scene);
          equiUnmanaged.convert(cubeCamera);
          cubeRenderTargetCopy.fromEquirectangularTexture(renderer, equiUnmanaged.output.texture);
          
          displayTextureMesh.visible = true;
          sphereMesh.visible = true;

          // render main camera
          renderer.render(scene, camera);
        };
        let frame = requestAnimationFrame(_recurse);
      }
    }
  }, [canvasRef.current]);

  return (
    <div className={styles.skyboxGenerator}>
      <canvas width={size} height={size} className={styles.canvas} ref={canvasRef} />
    </div>
  );
};
export default SkyboxGeneratorComponent;