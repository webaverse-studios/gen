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
import {
  TileMesh,
  renderPanorama,
} from '../../generators/skybox-generator.js';

import styles from '../../../styles/SkyboxGenerator.module.css';

import {
  mod,
} from '../../utils/memory-utils.js';

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
const localSpherical = new THREE.Spherical();
const localObb = new OBB();

const zeroVector = new THREE.Vector3(0, 0, 0);
const oneVector = new THREE.Vector3(1, 1, 1);
const upVector = new THREE.Vector3(0, 1, 0);
const y180Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const y180Matrix = new THREE.Matrix4().makeRotationY(Math.PI);

//

const size = 756;
const panoramaRadius = 3;
const panoramaWidthSegments = 256;
const panoramaHeightSegments = 64;

const cameraY = 5;

const cubeSize = 1024;

//

const _makeTestScene = ({
  renderer,
  camera,
}) => {
  // scene
  const scene = new THREE.Scene();
  scene.autoUpdate = false;

  // cube render target
  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(cubeSize, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
  cubeCamera.position.copy(camera.position);
  cubeCamera.updateMatrixWorld();
  scene.cubeCamera = cubeCamera;

  // or create an unmanaged CubemapToEquirectangular
  const equiUnmanaged = new CubemapToEquirectangular(renderer, false);
  equiUnmanaged.setSize(cubeSize, cubeSize);
  scene.equiUnmanaged = equiUnmanaged;

  // floor plane
  // const floorPlane = new THREE.Mesh(
  //   new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2),
  //   new THREE.MeshPhongMaterial({
  //     color: 0x333333,
  //     side: THREE.DoubleSide,
  //   })
  // );
  // scene.add(floorPlane);
  // floorPlane.updateMatrixWorld();

  // display texture mesh
  const displayTextureMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      map: equiUnmanaged.output.texture,
      side: THREE.DoubleSide,
    })
  );
  displayTextureMesh.position.set(0, cameraY, -2);
  scene.add(displayTextureMesh);
  displayTextureMesh.updateMatrixWorld();
  scene.displayTextureMesh = displayTextureMesh;

  // display sphere mesh
  const displaySphereGeometry = new THREE.SphereGeometry(1, 32, 32);
  const displaySphereMaterial = new THREE.MeshBasicMaterial({
    map: equiUnmanaged.output.texture,
    side: THREE.DoubleSide,
  });
  const displaySphereMesh = new THREE.Mesh(displaySphereGeometry, displaySphereMaterial);
  displaySphereMesh.position.set(0, cameraY, 0);
  scene.add(displaySphereMesh);
  displaySphereMesh.updateMatrixWorld();
  scene.displaySphereMesh = displaySphereMesh;

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

  return scene;
};

//

const _genPanoramaScene = async ({
  renderer,
  camera,
  file,
}) => {
  const scene = new THREE.Scene();
  scene.autoUpdate = false;

  // texture loader
  const textureLoader = new THREE.TextureLoader();

  // panorama texture
  const panoramaTexture = await new Promise((accept, reject) => {
    const u = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
    textureLoader.load(u, (tex) => {
      accept(tex);
      cleanup();
    }, undefined, err => {
      reject(err);
      cleanup();
    });
  });
  panoramaTexture.wrapS = THREE.RepeatWrapping;
  panoramaTexture.wrapT = THREE.RepeatWrapping;
  panoramaTexture.needsUpdate = true;
  const panoramaTextureImage = panoramaTexture.image;
  // document.body.appendChild(panoramaTextureImage);

  // tile scene
  const tileScene = new THREE.Scene();
  tileScene.autoUpdate = false;

  // tile mesh
  const tileMesh = new TileMesh({
    map: panoramaTexture,
  });
  // tileMesh.position.set(0, cameraY, 0);
  tileScene.add(tileMesh);
  tileMesh.updateMatrixWorld();

  // sphere mesh
  const _makeSphereMesh = () => {
    const sphereGeometry = new THREE.SphereGeometry(
      panoramaRadius,
      panoramaWidthSegments,
      panoramaHeightSegments,
    );
    // flip inside out
    for (let i = 0; i < sphereGeometry.index.array.length; i += 3) {
      const a = sphereGeometry.index.array[i + 0];
      const b = sphereGeometry.index.array[i + 1];
      const c = sphereGeometry.index.array[i + 2];
      sphereGeometry.index.array[i + 0] = c;
      sphereGeometry.index.array[i + 1] = b;
      sphereGeometry.index.array[i + 2] = a;
    }

    const sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: panoramaTexture,
        }
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
          vec4 c = texture2D(map, vUv);

          gl_FragColor = vec4(vUv * 0.1, 0.0, 1.0);
          gl_FragColor.rgb += c.rgb;
        }
      `,
    });
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    return sphereMesh;
  };
  const sphereMesh = _makeSphereMesh();
  // sphereMesh.position.set(0, 20, 0);
  sphereMesh.position.set(0, cameraY, 0);
  scene.add(sphereMesh);
  sphereMesh.updateMatrixWorld();
  scene.sphereMesh = sphereMesh;

  // render panorama
  // {
  //   // we overlap tiles by 50% to avoid seams
  //   const uvXIncrement = 1 / numTiles;
  //   for (let i = 0; i < numTiles; i++) {
  //     const tileCanvas = document.createElement('canvas');
  //     tileCanvas.width = size;
  //     tileCanvas.height = size;
  //     const tileCanvasCtx = tileCanvas.getContext('2d');

  //     tileMesh.setUvOffset(
  //       new THREE.Vector2(
  //         uvXIncrement * i,
  //         0,
  //       ),
  //       uvXIncrement * 2
  //     );

  //     renderer.render(tileScene, camera);
  //     tileCanvasCtx.drawImage(renderer.domElement, 0, 0);

  //     // document.body.appendChild(tileCanvas);
  //     tiles.push(tileCanvas);
  //   }
  //   renderer.clear();
  // }

  const depths = await renderPanorama(renderer, tileScene, tileMesh, camera, panoramaTextureImage);
  setSphereGeometryPanoramaDepth(
    sphereMesh.geometry,
    depths,
    panoramaWidthSegments,
    panoramaHeightSegments,
  );
  return scene;
};

//

let loaded = false;
const SkyboxCanvasComponent = ({
  file,
}) => {
  const [renderer, setRenderer] = useState(null);
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && file) {
      if (!loaded) {
        loaded = true;

        (async () => {
          // renderer
          const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
          });

          // scene
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0xEEEEEE);
          scene.autoUpdate = false;

          // camera
          const camera = new THREE.PerspectiveCamera(
            75,
            1,
            0.1,
            1000
          );
          camera.position.y = cameraY;
          camera.updateMatrixWorld();

          // lights
          const ambientLight = new THREE.AmbientLight(0x404040);
          scene.add(ambientLight);
          const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 2);
          directionalLight.position.set(0, cameraY, 0);
          scene.add(directionalLight);
          directionalLight.updateMatrixWorld();

          // orbit controls
          const orbitControls = new OrbitControls(camera, renderer.domElement);
          orbitControls.target.set(0, cameraY, -1);

          // scenes
          // test scene
          const testScene = _makeTestScene({
            renderer,
            camera,
          });
          testScene.position.set(20, 0, 0);
          scene.add(testScene);
          testScene.updateMatrixWorld();

          // panorama scene
          const panoramaScene = await _genPanoramaScene({
            renderer,
            camera,
            file,
          });
          scene.add(panoramaScene);
          panoramaScene.updateMatrixWorld();

          const _recurse = () => {
            frame = requestAnimationFrame(_recurse);

            // update
            orbitControls.update();

            // render cube camera
            testScene.displayTextureMesh.visible = false;
            testScene.displaySphereMesh.visible = false;
            panoramaScene.sphereMesh.visible = false;
            
            testScene.cubeCamera.update(renderer, scene);
            testScene.equiUnmanaged.convert(testScene.cubeCamera);
            
            testScene.displayTextureMesh.visible = true;
            testScene.displaySphereMesh.visible = true;
            panoramaScene.sphereMesh.visible = true;

            // render main camera
            renderer.render(scene, camera);
          };
          let frame = requestAnimationFrame(_recurse);
        })();
      }
    }
  }, [canvasRef.current, file]);
  
  return (
    <div className={styles.skyboxCanvas}>
      <canvas width={size} height={size} className={styles.canvas} ref={canvasRef} />
    </div>
  );
}

//

const SkyboxPlaceholderComponent = ({
  onFileChange,
}) => {
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    onFileChange(file);
  };
  
  return (
    <div
      className={styles.skyboxPlaceholder}
      onDragOver={dragover}
      onDrop={drop}
    >
      {/* <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} />
      <div className={styles.button} onClick={async () => {
        await panel.setFromPrompt(prompt);
      }}>Generate</div> */}
      <div><a className={styles.fileUpload}><input type="file" onChange={e => {
        const file = e.target.files[0];
        if (file) {
          onFileChange(file);
        }
        e.target.value = null;
      }} />Upload File</a></div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
  );
};

//

const SkyboxGeneratorComponent = () => {
  const [file, setFile] = useState(null);

  return (
    <div className={styles.skyboxGenerator}>
      <div className={styles.skyboxRenderer}>
        {!file ?
          <SkyboxPlaceholderComponent
            onFileChange={file => {
              setFile(file);
            }}
          />
        :
          <SkyboxCanvasComponent
            file={file}
          />
        }
      </div>
    </div>
  );
};
export default SkyboxGeneratorComponent;