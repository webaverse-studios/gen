import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import {ProcGenManager} from '../../src/procedural-generation/procgen-manager.js';
import {FreeList} from '../../public/utils/geometry-utils.js';
import styles from '../../styles/MapCanvas.module.css';

//

const chunkSize = 16;
const worldWidth = 512;
const worldHeight = 512;
let chunksPerView = Math.ceil(worldWidth / chunkSize);
const baseLod1Range = Math.ceil(chunksPerView / 2);
chunksPerView++;
const spacing = 1;
const maxChunks = 2048;

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localRaycaster = new THREE.Raycaster();

const zeroQuaternion = new THREE.Quaternion();

//

const abortError = new Error('aborted');
abortError.isAbortError = true;

// helpers

const setRaycasterFromEvent = (raycaster, camera, e) => {
  const w = globalThis.innerWidth;
  const h = globalThis.innerHeight;
  const mouse = localVector2D.set(
    (e.clientX / w) * 2 - 1,
    -(e.clientY / h) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
};
const getScaleLod = scale => {
  let scaleLod = Math.ceil(Math.log2(scale));
  scaleLod = Math.max(scaleLod, 0);
  scaleLod++;
  return scaleLod;
};
const getScaleInt = scale => {
  const scaleLod = getScaleLod(scale);
  // console.log('scale lod', scale, scaleLod);
  // const scaleInt = Math.pow(2, scaleLod);
  const scaleInt = 1 << (scaleLod - 1);
  return scaleInt;
};
const getLodTrackerOptions = camera => {
  const scaleLod = getScaleLod(camera.scale.x);
  const lodTrackerOptions = {
    minLod: scaleLod,
    maxLod: scaleLod,
    lod1Range: baseLod1Range,
    // debug: true,
  };
  return lodTrackerOptions;
};
const _getChunkHeightfieldAsync = async (x, z, lod, {
  signal = null,
} = {}) => {
  const instance = useInstance();

  const min = new THREE.Vector2(x, z);
  const lodArray = Int32Array.from([lod, lod]);
  const generateFlags = {
    terrain: false,
    water: false,
    barrier: false,
    vegetation: false,
    grass: false,
    poi: false,
    heightfield: true,
  };
  const numVegetationInstances = 0; // litterUrls.length;
  const numGrassInstances = 0; // grassUrls.length;
  const numPoiInstances = 0; // hudUrls.length;
  const options = {
    signal,
  };
  const chunkResult = await instance.generateChunk(
    min,
    lod,
    lodArray,
    generateFlags,
    numVegetationInstances,
    numGrassInstances,
    numPoiInstances,
    options
  );
  return chunkResult.heightfields.pixels;
};

// mesh classes

class ChunksMesh extends THREE.InstancedMesh {
  constructor() {
    const chunksGeometry = new THREE.PlaneGeometry(1, 1)
      .translate(0.5, -0.5, 0)
      .rotateX(-Math.PI / 2);
    const chunksInstancedGeometry = new THREE.InstancedBufferGeometry();
    chunksInstancedGeometry.attributes = chunksGeometry.attributes;
    chunksInstancedGeometry.index = chunksGeometry.index;
    const uvs2 = new Float32Array(2 * maxChunks);
    const uvs2Attribute = new THREE.InstancedBufferAttribute(uvs2, 2);
    chunksInstancedGeometry.setAttribute('uv2', uvs2Attribute);
    // console.log('got geo', chunksInstancedGeometry);

    const canvas = document.createElement('canvas');
    canvas.width = chunksPerView * chunkSize;
    canvas.height = chunksPerView * chunkSize;
    canvas.ctx = canvas.getContext('2d');
    canvas.ctx.imageData = canvas.ctx.createImageData(chunkSize, chunkSize);
    /* canvas.style.cssText = `\
      position: fixed;
      top: 0;
      left: 0;
      z-index: 100;
      pointer-events: none;
    `; */

    const uTex = new THREE.Texture(canvas);
    // uTex.flipY = false;
    const chunksMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTex: {
          value: uTex,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute vec2 uv2;
        varying vec2 vUv;
      
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vUv = uv2 + uv / ${chunksPerView.toFixed(8)};
          // vUv = uv;
        }
      `,
      fragmentShader: `\
        uniform sampler2D uTex;
        varying vec2 vUv;

        void main() {
          // vec3 uvc = vec3(vUv.x, 0.0, vUv.y);

          vec4 c = texture2D(uTex, vUv);
          // c.rgb += uvc;
          gl_FragColor = vec4(c.rgb, 1.0);
        }
      `,
    });
    // chunksMaterial.uniforms.uTex.value.onUpdate = () => {
    //   console.log('tex update');
    // };

    super(
      chunksInstancedGeometry,
      chunksMaterial,
      maxChunks
    );

    this.canvas = canvas;
    // document.body.appendChild(canvas); // XXX debugging
    this.updateCancelFn = null;
  }
  addChunk({
    chunk,
    freeListEntry,
    camera,
    signal,
  }) {
    (async () => {
      try {
        const {min} = chunk;
        const scaleInt = getScaleInt(camera.scale.x);
        
        const pixels = await _getChunkHeightfieldAsync(min.x, min.y, scaleInt, {
          signal,
        });
        
        const dx = freeListEntry % chunksPerView;
        const dy = Math.floor(freeListEntry / chunksPerView);

        const _updateGeometry = () => {
          localMatrix.compose(
            localVector.set(
              min.x * chunkSize,
              0,
              min.y * chunkSize
            ),
            zeroQuaternion,
            localVector2.setScalar(scaleInt * chunkSize - spacing)
          );
          this.setMatrixAt(freeListEntry, localMatrix);
          this.instanceMatrix.needsUpdate = true;

          // update uvs
          // XXX why does the right/bottom get removed and then added again when scrolling left/up?
          const uvX = dx / chunksPerView;
          const uvY = (1 - 1 / chunksPerView) - (dy / chunksPerView);
          this.geometry.attributes.uv2.array[freeListEntry * 2] = uvX;
          this.geometry.attributes.uv2.array[freeListEntry * 2 + 1] = uvY;
          this.geometry.attributes.uv2.needsUpdate = true;
        };

        const _updateTexture = () => {
          const {ctx} = this.canvas;
          const {imageData} = ctx;
          let index = 0;
          for (let ddz = 0; ddz < chunkSize; ddz++) {
            for (let ddx = 0; ddx < chunkSize; ddx++) {
              const srcHeight = pixels[index];
              const srcWater = pixels[index + 1];
              imageData.data[index] = srcHeight;
              imageData.data[index + 1] = srcWater;
              imageData.data[index + 2] = 0;
              imageData.data[index + 3] = 255;

              index += 4;
            }
          }
          ctx.putImageData(imageData, dx * chunkSize, dy * chunkSize);
          this.material.uniforms.uTex.value.needsUpdate = true;
          // console.log('update', this.material.uniforms.uTex);
        };

        _updateGeometry();
        _updateTexture();
      } catch(err) {
        if (!err?.isAbortError) {
          throw err;
        }
      }
    })();
  }
  removeChunk(freeListEntry) {
    // console.log('remove chunk', chunk.min.toArray().join(','), freeListEntry);
    
    // const {min} = chunk;
    localMatrix.makeScale(
      0,
      0,
      0
    );
    this.setMatrixAt(freeListEntry, localMatrix);
    this.instanceMatrix.needsUpdate = true;

    /* // update texture
    const dx = freeListEntry % chunksPerView;
    const dy = Math.floor(freeListEntry / chunksPerView);

    const {ctx} = this.canvas;
    ctx.clearRect(dx * chunkSize, dy * chunkSize, chunkSize, chunkSize);
    this.material.uniforms.uTex.value.needsUpdate = true; */
  }
  destroy() {
    // this.canvas?.parentNode?.removeChild(this.canvas);
  }
}

//

class AllocEntry {
  constructor(freeListEntry) {
    this.freeListEntry = freeListEntry;
    this.abortController = new AbortController();
  }
}

//

const procGenManager = new ProcGenManager({
  chunkSize,
});
let procGenInstance = null;
const useInstance = () => {
  if (!procGenInstance) {
    procGenInstance = procGenManager.getInstance('lol');
  }
  return procGenInstance;
};

export const MapCanvas = () => {
  // 2d
  const [dimensions, setDimensions] = useState([
    globalThis.innerWidth * globalThis.devicePixelRatio,
    globalThis.innerHeight * globalThis.devicePixelRatio,
  ]);
  const [dragState, setDragState] = useState(null);
  // 3d
  const [renderer, setRenderer] = useState(null);
  const [camera, setCamera] = useState(null);
  const [chunksMesh, setChunksMesh] = useState(null);
  const [debugMesh, setDebugMesh] = useState(null);
  const [barrierMesh, setBarrierMesh] = useState(null);
  const [lodTracker, setLodTracker] = useState(null);

  // helpers
  const loadLods = async (chunksMesh, camera) => {
    const instance = useInstance();

    const lodTrackerOptions = getLodTrackerOptions(camera);
    const lodTracker = await instance.createLodChunkTracker(lodTrackerOptions);
    const freeList = new FreeList(maxChunks);
    const allocMap = new Map();
    lodTracker.onChunkAdd(chunk => {
      const key = procGenManager.getNodeHash(chunk);
      const freeListEntry = freeList.alloc(1);

      const allocEntry = new AllocEntry(freeListEntry);
      const {abortController} = allocEntry;
      const {signal} = abortController;

      chunksMesh.addChunk({
        chunk,
        freeListEntry,
        camera,
        signal,
      });
      if (!allocMap.has(key)) {
        allocMap.set(key, allocEntry);
      } else {
        debugger;
      }
    });
    lodTracker.onChunkRemove(chunk => {
      const key = procGenManager.getNodeHash(chunk);
      const allocEntry = allocMap.get(key);
      if (allocEntry !== undefined) {
        chunksMesh.removeChunk(allocEntry.freeListEntry);
        freeList.free(allocEntry.freeListEntry);
        allocEntry.abortController.abort(abortError);
        allocMap.delete(key);
      } else {
        debugger;
      }
    });
    return lodTracker;
  };
  const updateLodTracker = (lodTracker, camera) => {
    const instance = useInstance();
    const playerPosition = localVector.set(
      camera.position.x,
      0,
      camera.position.z
    );
    instance.setCamera(
      playerPosition,
      playerPosition,
      camera.quaternion,
      camera.projectionMatrix
    );

    lodTracker.update(playerPosition);
  };

  //

  const loadBarriers = async barrierMesh => {
    const instance = useInstance();
    
    const minLod = 1;
    const maxLod = 6;
    
    const abortController = new AbortController();
    const {signal} = abortController;
    const _generateBarriers = async () => {
      const position = localVector.set(0, 0, 0);

      const barrierResult = await instance.generateBarrier(
        position,
        minLod,
        maxLod,
        chunkSize,
        {
          signal,
        },
      );
      // console.log('got barrier', barrierResult);
      barrierMesh.barrierResult = barrierResult;
  
      const {
        leafNodes,
      } = barrierResult;
      for (let i = 0; i < leafNodes.length; i++) {
        const leafNode = leafNodes[i];
        const {
          min,
          lod,
        } = leafNode;
  
        const size = lod * chunkSize;
        localMatrix.compose(
          localVector.set(
            min[0] * chunkSize,
            0,
            min[1] * chunkSize
          ),
          zeroQuaternion,
          localVector2.setScalar(size - spacing)
        );
        barrierMesh.setMatrixAt(i, localMatrix);
      }
      barrierMesh.instanceMatrix.needsUpdate = true;
      barrierMesh.count = leafNodes.length;
    };
    await _generateBarriers();
  };
  const _updateBarrierHover = (barrierMesh, position) => {
    const {barrierResult} = barrierMesh;
    if (barrierResult) {
      const {leafNodes, leafNodesMin, leafNodesMax, leafNodesIndex} = barrierResult;

      const chunkPosition = localVector.copy(position);
      chunkPosition.x = Math.floor(chunkPosition.x / chunkSize);
      chunkPosition.y = Math.floor(chunkPosition.y / chunkSize);
      chunkPosition.z = Math.floor(chunkPosition.z / chunkSize);

      if (
        chunkPosition.x >= leafNodesMin[0] && chunkPosition.x < leafNodesMax[0] &&
        chunkPosition.z >= leafNodesMin[1] && chunkPosition.z < leafNodesMax[1]
      ) {
        const x = chunkPosition.x - leafNodesMin[0];
        const z = chunkPosition.z - leafNodesMin[1];
        const w = leafNodesMax[0] - leafNodesMin[0];
        // const h = leafNodesMax[1] - leafNodesMin[1];
        const index = x + z * w;
        if (index >= 0 && index < leafNodesIndex.length) {
          const indexIndex = leafNodesIndex[index];
          const leafNode = leafNodes[indexIndex];
          if (leafNode) {
            const {min, lod} = leafNode;

            barrierMesh.material.uniforms.highlightMin.value.fromArray(min)
              .multiplyScalar(chunkSize);
            barrierMesh.material.uniforms.highlightMin.needsUpdate = true;
            barrierMesh.material.uniforms.highlightMax.value.fromArray(min)
              .add(localVector2.setScalar(lod))
              .multiplyScalar(chunkSize);
            barrierMesh.material.uniforms.highlightMax.needsUpdate = true;

            // console.log('got', leafNode.min.join(','), leafNode.lod, leafNodesMin.join(','), leafNodesMax.join(','), barrierResult);

            // console.log('setting',
            //   barrierMesh.material.uniforms.highlightMin.value.toArray().join(','),
            //   barrierMesh.material.uniforms.highlightMax.value.toArray().join(','),
            // );
          } else {
            debugger;
          }
        } else {
          // console.log('bad index', index, x, z, w);
          debugger;
        }
      } else {
        barrierMesh.material.uniforms.highlightMin.value.setScalar(0);
        barrierMesh.material.uniforms.highlightMin.needsUpdate = true;
        barrierMesh.material.uniforms.highlightMax.value.setScalar(0);
        barrierMesh.material.uniforms.highlightMax.needsUpdate = true;
      }
    }
  };

  // initialize canvas from element ref
  const handleCanvas = useMemo(() => canvasEl => {
    if (canvasEl) {
      // renderer
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
      });
      renderer.sortObjects = false;
      setRenderer(renderer);

      let frame;
      const _recurse = () => {
        frame = requestAnimationFrame(() => {
          _recurse();
          renderer.render(scene, camera);
        });
      };
      _recurse();
      renderer.setSize = (setSize => function(width, height) {
        const fov = width / height;
        camera.top = top / fov;
        camera.bottom = bottom / fov;
        camera.updateProjectionMatrix();
        
        return setSize.apply(this, arguments);
      })(renderer.setSize);
      renderer.stop = () => {
        cancelAnimationFrame(frame);
        renderer.dispose();
      };

      // scene
      const scene = new THREE.Scene();
      scene.matrixWorldAutoUpdate = false;

      const chunksMesh = new ChunksMesh();
      chunksMesh.frustumCulled = false;
      scene.add(chunksMesh);
      setChunksMesh(chunksMesh);

      const debugGeometry = new THREE.BoxGeometry(1, 1, 1);
      const debugMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
      });
      const debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
      debugMesh.frustumCulled = false;
      scene.add(debugMesh);
      setDebugMesh(debugMesh);

      const barrierGeometry = new THREE.PlaneGeometry(1, 1)
        // .scale(scale, scale, scale)
        .translate(0.5, -0.5, 0)
        .rotateX(-Math.PI / 2);
      const barrierMaterial = new THREE.ShaderMaterial({
        uniforms: {
          highlightMin: {
            value: new THREE.Vector2(),
            needsUpdate: false,
          },
          highlightMax: {
            value: new THREE.Vector2(),
            needsUpdate: false,
          },
        },
        vertexShader: `\
          varying vec3 vPosition;

          void main() {
            vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
            vPosition = instancePosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
          }
        `,
        fragmentShader: `\
          uniform vec2 highlightMin;
          uniform vec2 highlightMax;
          varying vec3 vPosition;

          void main() {
            vec3 c;
            if (
              vPosition.x >= highlightMin.x &&
              vPosition.x < highlightMax.x &&
              vPosition.z >= highlightMin.y &&
              vPosition.z <= highlightMax.y
            ) {
              c = vec3(0., 0., 1.);
            } else {
              c = vec3(0., 1., 0.);
            }
            gl_FragColor = vec4(c, 0.2);
          }
        `,
        transparent: true
      });
      const barrierMesh = new THREE.InstancedMesh(
        barrierGeometry,
        barrierMaterial,
        256
      );
      barrierMesh.frustumCulled = false;
      barrierMesh.barrierResult = null;
      scene.add(barrierMesh);
      setBarrierMesh(barrierMesh);

      // camera
      const left = worldWidth / -2;
      const right = worldWidth / 2;
      const top = worldHeight / 2;
      const bottom = worldHeight / -2;
      const near = 0.1;
      const far = 10000;
      const fov = dimensions[0] / dimensions[1];
      const camera = new THREE.OrthographicCamera(
        left,
        right,
        top / fov,
        bottom / fov,
        near,
        far
      );
      camera.position.set(0, 128, 0);
      camera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      camera.updateMatrixWorld();
      setCamera(camera);

      // init
      loadLods(chunksMesh, camera)
        .then(lodTracker => {
          updateLodTracker(lodTracker, camera);
          setLodTracker(lodTracker);
        });
      loadBarriers(barrierMesh);
    }
  }, []);
  function handleResize() {
    const width = globalThis.innerWidth * globalThis.devicePixelRatio;
    const height = globalThis.innerHeight * globalThis.devicePixelRatio;
    setDimensions([
      width,
      height,
    ]);
  }
  useEffect(() => {
    globalThis.addEventListener('resize', handleResize);

    const handleMouseUp = e => {
      e.preventDefault();
      e.stopPropagation();
      setDragState(null);
    };
    globalThis.addEventListener('mouseup', handleMouseUp);

    return () => {
      globalThis.removeEventListener('resize', handleResize);
      globalThis.removeEventListener('mouseup', handleMouseUp);
      renderer && renderer.stop();
      chunksMesh && chunksMesh.destroy();
    };
  }, [renderer]);
  useEffect(() => {
    if (renderer) {
      const [width, height] = dimensions;
      renderer.setSize(width, height);
    }
  }, [renderer, dimensions]);
  useEffect(() => {
    lodTracker && updateLodTracker(lodTracker, camera);
  }, [lodTracker, camera, dimensions]);

  const handleMouseDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const {clientX, clientY} = e;
    setDragState({
      startX: clientX,
      startY: clientY,
      cameraStartPositon: camera.position.clone(),
    });
  };
  const handleMouseMove = e => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState) {
      const {clientX, clientY} = e;
      const {startX, startY} = dragState;

      const w = dimensions[0] / devicePixelRatio;
      const h = dimensions[1] / devicePixelRatio;
      const startPosition = localVector.set(
        (-startX / w) * 2 + 1,
        (startY / h) * 2 - 1,
        0
      ).unproject(camera);
      const endPosition = localVector2.set(
        (-clientX / w) * 2 + 1,
        (clientY / h) * 2 - 1,
        0
      ).unproject(camera);

      camera.position.copy(dragState.cameraStartPositon)
        .sub(startPosition)
        .add(endPosition);
      camera.updateMatrixWorld();

      updateLodTracker(lodTracker, camera);
    }

    setRaycasterFromEvent(localRaycaster, camera, e);
    debugMesh.position.set(localRaycaster.ray.origin.x, 0, localRaycaster.ray.origin.z);
    debugMesh.updateMatrixWorld();

    // if (barrierMesh) {
      _updateBarrierHover(barrierMesh, localRaycaster.ray.origin);
    // }
  };
  const handleWheel = e => {
    e.stopPropagation();

    // scale around the mouse position
    setRaycasterFromEvent(localRaycaster, camera, e);

    const oldScale = camera.scale.x;
    const newScale = Math.min(Math.max(oldScale * (1 + e.deltaY * 0.001), 0.02), 12);
    const scaleFactor = newScale / oldScale;

    // console.log('new scale', newScale);

    localMatrix.compose(
      camera.position,
      camera.quaternion,
      localVector2.setScalar(oldScale)
    )
      .premultiply(
        localMatrix2.makeTranslation(
          -localRaycaster.ray.origin.x,
          0,
          -localRaycaster.ray.origin.z
        )
      )
      .premultiply(
        localMatrix2.makeScale(scaleFactor, scaleFactor, scaleFactor)
      )
      .premultiply(
        localMatrix2.makeTranslation(
          localRaycaster.ray.origin.x,
          0,
          localRaycaster.ray.origin.z
        )
      )
      .decompose(camera.position, localQuaternion, localVector2);
    camera.scale.set(newScale, newScale, 1);
    camera.updateMatrixWorld();

    const lodTrackerOptions = getLodTrackerOptions(camera);
    lodTracker.setOptions(lodTrackerOptions);
    updateLodTracker(lodTracker, camera);
  };

  return (
    <canvas
      className={styles.canvas}
      // width={dimensions[0]}
      // height={dimensions[1]}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      ref={handleCanvas}
    />
  );
};