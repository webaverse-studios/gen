import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import {ProcGenManager} from '../../src/procedural-generation/procgen-manager.js';
import {FreeList} from '../../public/utils/geometry-utils.js';
import {setRaycasterFromEvent} from '../../public/utils/renderer-utils.js';
import styles from '../../styles/MapCanvas.module.css';

import {
  chunkSize,
  worldWidth,
  worldHeight,
  // chunksPerView,
  baseLod1Range,
  spacing,
  maxChunks,
} from '../../constants/renderer-constants.js';
import {HeightfieldsMesh} from '../layers/heightfields-mesh.js';
import {ParcelsMesh} from '../layers/parcels-mesh.js';
import {getScaleLod} from '../../public/utils/procgen-utils.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localRaycaster = new THREE.Raycaster();

const zeroQuaternion = new THREE.Quaternion();

//

const abortError = new Error('aborted');
abortError.isAbortError = true;

// helpers

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
  const [heightfieldsMesh, setHeightfieldsMesh] = useState(null);
  const [debugMesh, setDebugMesh] = useState(null);
  const [parcelsMesh, setParcelsMesh] = useState(null);
  const [lodTracker, setLodTracker] = useState(null);

  // helpers
  const loadHeightfields = async (heightfieldsMesh, camera) => {
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

      heightfieldsMesh.addChunk({
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
        heightfieldsMesh.removeChunk(allocEntry.freeListEntry);
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

  const loadParcels = async parcelsMesh => {
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
      parcelsMesh.barrierResult = barrierResult;
  
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
        parcelsMesh.setMatrixAt(i, localMatrix);
      }
      parcelsMesh.instanceMatrix.needsUpdate = true;
      parcelsMesh.count = leafNodes.length;
    };
    await _generateBarriers();
  };
  const _updateParcelsHover = (parcelsMesh, position) => {
    const {barrierResult} = parcelsMesh;
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

            parcelsMesh.material.uniforms.highlightMin.value.fromArray(min)
              .multiplyScalar(chunkSize);
            parcelsMesh.material.uniforms.highlightMin.needsUpdate = true;
            parcelsMesh.material.uniforms.highlightMax.value.fromArray(min)
              .add(localVector2.setScalar(lod))
              .multiplyScalar(chunkSize);
            parcelsMesh.material.uniforms.highlightMax.needsUpdate = true;

            // console.log('got', leafNode.min.join(','), leafNode.lod, leafNodesMin.join(','), leafNodesMax.join(','), barrierResult);

            // console.log('setting',
            //   parcelsMesh.material.uniforms.highlightMin.value.toArray().join(','),
            //   parcelsMesh.material.uniforms.highlightMax.value.toArray().join(','),
            // );
          } else {
            debugger;
          }
        } else {
          // console.log('bad index', index, x, z, w);
          debugger;
        }
      } else {
        parcelsMesh.material.uniforms.highlightMin.value.setScalar(0);
        parcelsMesh.material.uniforms.highlightMin.needsUpdate = true;
        parcelsMesh.material.uniforms.highlightMax.value.setScalar(0);
        parcelsMesh.material.uniforms.highlightMax.needsUpdate = true;
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

      // layers
      const instance = useInstance();
      const heightfieldsMesh = new HeightfieldsMesh({
        instance,
      });
      heightfieldsMesh.frustumCulled = false;
      scene.add(heightfieldsMesh);
      setHeightfieldsMesh(heightfieldsMesh);

      const parcelsMesh = new ParcelsMesh();
      parcelsMesh.frustumCulled = false;
      scene.add(parcelsMesh);
      setParcelsMesh(parcelsMesh);

      // cursor
      const debugGeometry = new THREE.BoxGeometry(1, 1, 1);
      const debugMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
      });
      const debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
      debugMesh.frustumCulled = false;
      scene.add(debugMesh);
      setDebugMesh(debugMesh);

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
      loadHeightfields(heightfieldsMesh, camera)
        .then(lodTracker => {
          updateLodTracker(lodTracker, camera);
          setLodTracker(lodTracker);
        });
      loadParcels(parcelsMesh);
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
      heightfieldsMesh && heightfieldsMesh.destroy();
    };
  }, [renderer]);
  useEffect(() => {
    if (renderer) {
      const [width, height] = dimensions;
      renderer.setSize(width, height);
    }
  }, [renderer, dimensions]);

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

    _updateParcelsHover(parcelsMesh, localRaycaster.ray.origin);
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