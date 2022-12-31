import * as THREE from 'three';
// import {OBB} from 'three/examples/jsm/math/OBB.js';
import {useState, useRef, useEffect} from 'react';
import alea from 'alea';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import {Text} from 'troika-three-text';
// import * as passes from '../../generators/ms-passes.js';
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
  panelSize,
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
  physicsPixelStride,
  portalExtrusion,
  entranceExitEmptyDiameter,
} from '../../zine/zine-constants.js';
// import {
//   depthVertexShader,
//   depthFragmentShader,
// } from '../../utils/sg-shaders.js';
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
  // ZinePanel,
  // ZineData,
  initCompressor,
} from '../../zine/zine-format.js';
import {
  ZineRenderer,
} from '../../zine/zine-renderer.js';
import {colors} from '../../zine/zine-colors.js';
// import {
//   // getMapIndexSpecsMeshes,
//   // renderMeshesMapIndexFull,
//   // flipUint8ArrayX,
// } from '../../clients/reconstruction-client.js';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';

import styles from '../../../styles/MetasceneGenerator.module.css';

//

const localColor = new THREE.Color();

//

const loadFileUint8Array = async fileName => {
  const res = await fetch(fileName);
  const arrayBuffer = await res.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return uint8Array;
};
const blockEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

//

class MapIndexMesh extends THREE.Mesh {
  constructor({
    mapIndex,
    mapIndexResolution,
  }) {
    const geometry = new THREE.PlaneGeometry(floorNetWorldSize, floorNetWorldSize)
      .rotateX(-Math.PI / 2);
  
    const mapIndexUnpacked = new Uint8Array(mapIndex.length * 4);
    for (let i = 0; i < mapIndex.length; i++) {
      const indexValue = mapIndex[i];
      const c = localColor.setHex(colors[indexValue % colors.length]);
      mapIndexUnpacked[i * 4] = c.r * 255;
      mapIndexUnpacked[i * 4 + 1] = c.g * 255;
      mapIndexUnpacked[i * 4 + 2] = c.b * 255;
      mapIndexUnpacked[i * 4 + 3] = 255;
    }

    const [
      width,
      height,
    ] = mapIndexResolution;
    const map = new THREE.DataTexture(
      mapIndexUnpacked,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    map.minFilter = THREE.NearestFilter;
    map.magFilter = THREE.NearestFilter;
    map.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: map,
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
    });

    super(geometry, material);

    this.frustumCulled = false;
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
    
    const mapIndexMesh = new THREE.Mesh(geometry, material);
    mapIndexMesh.name = 'mapIndexMesh';
    mapIndexMesh.frustumCulled = false;
    mapIndexMesh.matrix.copy(matrixWorld)
      .decompose(mapIndexMesh.position, mapIndexMesh.quaternion, mapIndexMesh.scale);
    mapIndexMesh.matrixWorld.copy(mapIndexMesh.matrix);
    meshes.push(mapIndexMesh);
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

class MapGenRenderer {
  constructor() {
    // canvas
    const canvas = document.createElement('canvas');
    canvas.width = floorNetPixelSize;
    canvas.height = floorNetPixelSize;

    // renderer
    this.renderer = makeRenderer(canvas);

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
          stencilBuffer: false,
        }
      );
    };
    this.renderTargets = [
      _makeRenderTarget(), // read
      _makeRenderTarget(), // write
    ];

    // intersect scene
    this.intersectScene = new THREE.Scene();
    this.intersectScene.autoUpdate = false;
    const intersectOverrideMaterial = new THREE.ShaderMaterial({
      uniforms: {
        mode: {
          value: 0, // 0 = keep, 1 = replace
          needsUpdate: true,
        },
        mapIndexMap: {
          value: this.render[0].texture,
          needsUpdate: true,
        },
        lastPanelIndex: {
          value: 0,
          needsUpdate: true,
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
        uniform float lastPanelIndex;
        uniform float newPanelIndex;
        uniform int mode;
        varying vec2 vUv;

        void main() {
          vec4 oldMapIndexSample = texture2D(mapIndexMap, vUv);
          float oldMapIndex = oldMapIndexSample.r * 255.0;
          float oldDepth = oldMapIndex / 255.0;

          if (mode == 0) { // keep mode
            if (oldMapIndex == 0. || oldMapIndex == lastPanelIndex) { // keepable value
              discard;
            } else { // non-keepable value; draw the old value and pass the sample test
              gl_FragColor = oldMapIndexSample;
              gl_FragDepth = oldDepth;
            }
          } else { // replace mode
            float newMapIndex = newPanelIndex;
            float newDepth = newMapIndex / 255.0;
            gl_FragColor = vec4(newMapIndex, newDepth, 0.0, 1.);
            gl_FragDepth = oldDepth;
          }
        }
      `,
      depthFunc: THREE.GreaterEqualDepth,
      side: THREE.BackSide,
      extensions: {
        fragDepth: true,
      },
    });
    this.intersectOverrideMaterial = intersectOverrideMaterial;
    this.intersectScene.overrideMaterial = intersectOverrideMaterial;
  }
  #swapRenderTargets() {
    const temp = this.renderTargets[0];
    this.renderTargets[0] = this.renderTargets[1];
    this.renderTargets[1] = temp;
  }
  tryDraw(attachPanelIndex, newPanelIndex, zineRenderer) {
    const gl = this.renderer.getContext();

    // collect meshes
    const renderSpecs = getRenderSpecsFromZineRenderers([
      zineRenderer,
    ]);
    const meshes = getMapIndexSpecsMeshes(renderSpecs);

    // push
    const pushMeshes = () => {
      const parents = meshes.map(mesh => {
        const {parent} = mesh;
        parent.remove(mesh);
        return parent;
      });
      return () => {
        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i];
          const parent = parents[i];
          parent.add(mesh);
        }
      };
    };
    const popMeshes = pushMeshes();

    // compute intersect
    let intersect;
    {
      // uniforms
      this.intersectOverrideMaterial.uniforms.mode.value = 0; // keep mode
      this.intersectOverrideMaterial.uniforms.mode.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.mapIndexMap.value = this.renderTargets[0].texture;
      this.intersectOverrideMaterial.uniforms.mapIndexMap.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.lastPanelIndex.value = attachPanelIndex;
      this.intersectOverrideMaterial.uniforms.lastPanelIndex.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.newPanelIndex.value = newPanelIndex;
      this.intersectOverrideMaterial.uniforms.newPanelIndex.needsUpdate = true;

      // start any samples passed query
      const anySamplesPassedQuery = gl.createQuery();
      gl.beginQuery(gl.ANY_SAMPLES_PASSED, anySamplesPassedQuery);

      // render
      this.renderer.setRenderTarget(this.renderTargets[1]);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      // get sync
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      // wait for sync
      {
        const status = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) { // ok
          // nothing
        } else {
          throw new Error('failed to wait for sync');
        }
      }
      // delete sync
      gl.deleteSync(sync);

      // get the samples passed query result
      const queryResultAvailable = gl.getQueryParameter(anySamplesPassedQuery, gl.QUERY_RESULT_AVAILABLE);
      if (!queryResultAvailable) {
        throw new Error('failed to get query result: ' + queryResultAvailable);
      }
      const samplesPassed = gl.getQueryParameter(anySamplesPassedQuery, gl.QUERY_RESULT);
      intersect = samplesPassed > 0;

      // delete query
      gl.deleteQuery(anySamplesPassedQuery);
    }

    // if we did not intersect, perform the full draw
    if (!intersect) {
      // uniforms
      this.intersectOverrideMaterial.uniforms.mode.value = 1; // replace mode
      this.intersectOverrideMaterial.uniforms.mode.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.mapIndexMap.value = this.renderTargets[0].texture;
      this.intersectOverrideMaterial.uniforms.mapIndexMap.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.lastPanelIndex.value = attachPanelIndex;
      this.intersectOverrideMaterial.uniforms.lastPanelIndex.needsUpdate = true;

      this.intersectOverrideMaterial.uniforms.newPanelIndex.value = newPanelIndex;
      this.intersectOverrideMaterial.uniforms.newPanelIndex.needsUpdate = true;

      // render to the intersect target
      this.renderer.setRenderTarget(this.renderTargets[1]);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      // swap render targets
      this.#swapRenderTargets();
    }

    // pop
    popMeshes();
  }
  getMapIndex() {
    // read back image data
    const uint8Array = new Uint8Array(
      this.renderTargets[0].width * this.renderTargets[0].height * 4
    );
    const {
      width,
      height,
    } = this.renderTargets[0];
    this.renderer.readRenderTargetPixels(
      this.renderTargets[0],
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
    const {
      width,
      height,
    } = this.renderTargets[0]
    return [
      width,
      height,
    ];
  }
}

//

const defaultMaxWorkers = globalThis?.navigator?.hardwareConcurrency ?? 4;
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
    console.log(`loading [${index + 1}/${this.total}] ${zineFile.name}...`);

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

    // latch panel specs
    const panels = storyboard.getPanels();
    const panelSpecs = panels.map(panel => {
      const layer1 = panel.getLayer(1);
      const depthField = layer1.getData('depthField')
        .slice();
      const entranceExitLocations = layer1.getData('entranceExitLocations');
      const floorPlaneLocation = layer1.getData('floorPlaneLocation');
      
      return {
        depthField,
        entranceExitLocations,
        floorPlaneLocation,
      };
    });
    return panelSpecs;
  }
}

//

export class Metazine extends EventTarget {
  constructor() {
    super();
    
    // this.zd = new ZineData();
    
    // load result
    this.panelSpecs = [];
    this.mapIndex = null;
    this.mapIndexResolution = null;
  }

  getPanels() {
    return this.panels;
  }
  
  clear() {
    this.zs.clear();
  }
  async loadFiles(zineFiles) {
    // const s = new TextDecoder().decode(uint8Array);
    // let j = JSON.parse(s);
    
    // collect zine file urls
    // let zineFileUrls = j
    //   .filter(fileName => !/dall/i.test(fileName))
    //   .map(fileName => `https://local.webaverse.com/zine-build/${fileName}`);
    // zineFileUrls = zineFileUrls.slice(0, 10);

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
    console.log('got panel specs', panelSpecs);

    debugger;

    const mapGenRenderer = new MapGenRenderer();
    const maxNumPanels = 3;
    const rng = alea('lol');
    for (let i = 0; i < maxNumPanels && zineFileUrls.length > 0; i++) {
      // find a zine file
      const zineFileUrlIndex = Math.floor(rng() * zineFileUrls.length);
      const zineFileUrl = zineFileUrls[zineFileUrlIndex];
      
      // load zine file data
      let zinefile = await loadFileUint8Array(zineFileUrl);
      zinefile = zinefile.slice(zineMagicBytes.length);

      // load storyboard
      const storyboard = new ZineStoryboard();
      await storyboard.loadAsync(zinefile);

      // load zine renderer
      const isFirstPanel = this.panelSpecs.length === 0;
      const zineRenderer = new ZineRenderer({
        panel,
        alignFloor: isFirstPanel, // align floor for the first panel
      });

      // XXX try connecting a candidate entrance

      const attachPanelIndex = this.panelSpecs.length;
      const newPanelIndex = attachPanelIndex + 1;
      const drew = mapGenRenderer.tryDraw(attachPanelIndex, newPanelIndex, zineRenderer);

      const panelSpec = {
        zineFileUrl,
        // XXX add the transform here
      };
      if (drew) {
        this.panelSpecs.push(panelSpec);
      } else {
        // XXX try another candidate entrance/zine renderer
      }
    }

    this.mapIndex = mapGenRenderer.getMapIndex();
    this.mapIndexResolution = mapGenRenderer.getMapIndexResolution();
  }
}

//

export class MetazineRenderer extends EventTarget {
  constructor(canvas, metazine) {
    super();

    this.canvas = canvas;
    this.metazine = metazine;

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('metazineRendererCanvas');

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

    // bootstrap
    this.listen();
    this.animate();
    this.#init();
  }
  async #init() {
    for (let i = 0; i < this.metazine.panelSpecs.length; i++) {
      const panelSpec = this.metazine.panelSpecs[i];
      const {zineFileUrl} = panelSpec;
      
      // load zine file data
      let zinefile = await loadFileUint8Array(zineFileUrl);
      zinefile = zinefile.slice(zineMagicBytes.length);

      // load storyboard
      const storyboard = new ZineStoryboard();
      await storyboard.loadAsync(zinefile);

      // load zine renderer
      const isFirstPanel = this.panelSpecs.length === 0;
      const zineRenderer = new ZineRenderer({
        panel,
      });

      // XXX set the zine transform from the panel spec

      this.scene.add(zineRenderer.scene);
    }

    const {
      mapIndex,
      mapIndexResolution,
    } = this.metazine;
    const mapIndexMesh = new MapIndexMesh({
      mapIndex,
      mapIndexResolution,
    });
    mapIndexMesh.position.y = -5;
    this.scene.add(mapIndexMesh);
    mapIndexMesh.updateMatrixWorld();
  }
  // addPanel(panel) {
  //   // load the panel
  //   const zineRenderer = new ZineRenderer({
  //     panel,
  //   });
  //   const {
  //     sceneMesh,
  //     scenePhysicsMesh,
  //   } = zineRenderer;
  //   this.scene.add(zineRenderer.scene);
  //   if (this.zineRenderers.length === 0) {
  //     this.camera.copy(zineRenderer.camera);
  //   }

  //   // connect the previous panel to this one
  //   const previousZineRenderer = this.zineRenderers.length > 0 ?
  //     this.zineRenderers[this.zineRenderers.length - 1]
  //   :
  //     null;    
  //   if (previousZineRenderer) {
  //     previousZineRenderer.connect(zineRenderer);
  //   }

  //   // bookkeeping
  //   this.zineRenderers.push(zineRenderer);
  // }
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
            break;
          }
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousedown = e => {
      // this.selector.setMouseDown(true);
    };
    const mouseup = e => {
      // this.selector.setMouseDown(false);
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

    // const update = e => {
    //   this.updateOutmeshLayers();
    // };
    // this.panel.zp.addEventListener('layeradd', update);
    // this.panel.zp.addEventListener('layerremove', update);
    // this.panel.zp.addEventListener('layerupdate', update);

    // const transformchange = e => {
    //   this.updateObjectTransforms();
    // };
    // this.zineRenderer.addEventListener('transformchange', transformchange);

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', mousedown);
      document.removeEventListener('mouseup', mouseup);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      // this.panel.zp.removeEventListener('layeradd', update);
      // this.panel.zp.removeEventListener('layerremove', update);
      // this.panel.zp.removeEventListener('layerupdate', update);

      // this.zineRenderer.removeEventListener('transformchange', transformchange);
    });
  }
  render() {
    // update tools
    this.controls.update();
    this.camera.updateMatrixWorld();

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
  destroy() {
    console.log('destroy MetasceneRenderer');

    this.dispatchEvent(new MessageEvent('destroy'));
  }
};

//

const Metazine3DCanvas = ({
  metazine,
}) => {
  const canvasRef = useRef();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new MetazineRenderer(canvas, metazine);

      return () => {
        renderer.destroy();
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

//

const MetasceneGeneratorComponent = () => {
  const [metazine, setMetazine] = useState(() => new Metazine());
  const [loaded, setLoaded] = useState(false);

  const onNew = e => {
    e.preventDefault();
    e.stopPropagation();
    console.warn('new not implemented');
  };
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (files.length > 0) {
      initCompressor({
        numWorkers: defaultMaxWorkers,
      });

      // const arrayBuffer = await new Promise((accept, reject) => {
      //   const reader = new FileReader();
      //   reader.onload = e => {
      //     accept(e.target.result);
      //   };
      //   reader.onerror = reject;
      //   reader.readAsArrayBuffer(file);
      // });

      // const uint8Array = new Uint8Array(arrayBuffer);
      // await metazine.loadAsync(uint8Array);

      await metazine.loadFiles(files);

      setLoaded(true);
    }
  };

  return (
    <div className={styles.metasceneGenerator}>
      {loaded ? (
        <Metazine3DCanvas
          width={panelSize}
          height={panelSize}
          metazine={metazine}
        />
      ) : (
        <DropTarget
          className={styles.panelPlaceholder}
          newLabel='Create New Board'
          onNew={onNew}
          onDragOver={dragover}
          onDrop={drop}
        />
      )}
    </div>
  );
};
export default MetasceneGeneratorComponent;