import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import {ProcGenManager} from '../../src/procedural-generation/procgen-manager.js';
import {FreeList} from '../../public/utils/geometry-utils.js';
import {setRaycasterFromEvent} from '../../public/utils/renderer-utils.js';
import styles from '../../styles/MapCanvas.module.css';

import {HeightfieldsMesh} from '../layers/heightfields-mesh.js';
import {ParcelsMesh} from '../layers/parcels-mesh.js';
import {Target2DMesh} from '../meshes/target-2d-mesh.js';
import {HudMesh} from '../layers/hud-mesh.js';
import {getScaleLod} from '../../public/utils/procgen-utils.js';

import {
  chunkSize,
} from '../../constants/procgen-constants.js';
import {
  worldWidth,
  worldHeight,
  baseLod1Range,
  maxChunks,
} from '../../constants/map-constants.js';

import bezier from '../utils/easing.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localRaycaster = new THREE.Raycaster();

const cubicBezier = bezier(0, 1, 0, 1);

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
  const [fragMovedState, setFragMovedState] = useState(false);
  // 3d
  const [renderer, setRenderer] = useState(null);
  const [camera, setCamera] = useState(null);
  const [layer1Mesh, setLayer1Mesh] = useState(null);
  const [layer2Mesh, setLayer2Mesh] = useState(null);
  const [heightfieldsMesh, setHeightfieldsMesh] = useState(null);
  const [debugMesh, setDebugMesh] = useState(null);
  const [parcelsMesh, setParcelsMesh] = useState(null);
  const [targetMesh, setTargetMesh] = useState(null);
  const [hudMesh, setHudMesh] = useState(null);
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
  const loadParcels = async parcelsMesh => {
    const instance = useInstance();
    
    const minLod = 1;
    const maxLod = 6;
    
    const abortController = new AbortController();
    const {signal} = abortController;
    const _generateBarriers = async () => {
      const position = localVector.set(0, 0, 0);

      const result = await instance.generateBarrier(
        position,
        minLod,
        maxLod,
        chunkSize,
        {
          signal,
        },
      );
      parcelsMesh.setResult(result);
    };
    await _generateBarriers();
  };
  const loadHud = async hudMesh => {
    await hudMesh.waitForLoad();
  };

  //

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

  // initialize canvas from element ref
  let animation = null;
  let currentValue = 0;
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
      const layer1Mesh = new THREE.Object3D();
      scene.add(layer1Mesh);
      setLayer1Mesh(layer1Mesh);
      const layer2Mesh = new THREE.Object3D();
      scene.add(layer2Mesh);
      setLayer2Mesh(layer2Mesh);
      // heightfields
      const instance = useInstance();
      const heightfieldsMesh = new HeightfieldsMesh({
        instance,
      });
      heightfieldsMesh.frustumCulled = false;
      layer1Mesh.add(heightfieldsMesh);
      setHeightfieldsMesh(heightfieldsMesh);
      // parcels
      const parcelsMesh = new ParcelsMesh();
      parcelsMesh.frustumCulled = false;
      layer1Mesh.add(parcelsMesh);
      setParcelsMesh(parcelsMesh);
      // target
      const targetMesh = new Target2DMesh();
      targetMesh.frustumCulled = false;
      targetMesh.visible = false;
      let active = false;
      const size = new THREE.Vector2();
      const _updateScale = () => {
        targetMesh.scale.set(size.x, 1, size.y).multiplyScalar(active ? 0.9 : 1);
      };
      targetMesh.updateHover = (hoverIndex, min, max) => {
        if (hoverIndex !== -1) {
          size.copy(max).sub(min);
          targetMesh.updateMatrixWorld();
          targetMesh.visible = true;
        } else {
          targetMesh.visible = false;
        }
      };
      targetMesh.updateActive = (newActive) => {
        active = newActive;
        _updateScale();
        targetMesh.updateMatrixWorld();
      };
      layer1Mesh.add(targetMesh);
      setTargetMesh(targetMesh);
      // hud
      const hudMesh = new HudMesh({
        instance,
        renderer,
      });
      hudMesh.frustumCulled = false;
      layer1Mesh.add(hudMesh);
      setHudMesh(hudMesh);

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
      loadHud(hudMesh);
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

      parcelsMesh.updateActive(false);
      targetMesh.updateActive(false);
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
    setFragMovedState(false);
    parcelsMesh.updateActive(true);
    targetMesh.updateActive(true);
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
      
      const maxMoveDistance = 3;
      const newMovedState = fragMovedState || new THREE.Vector2(clientX, clientY).distanceTo(new THREE.Vector2(startX, startY)) > maxMoveDistance;
      if (!fragMovedState && newMovedState) {
        parcelsMesh.updateActive(false);
        targetMesh.updateActive(false);
      }
      setFragMovedState(newMovedState);
    }

    setRaycasterFromEvent(localRaycaster, camera, e);
    debugMesh.position.set(localRaycaster.ray.origin.x, 0, localRaycaster.ray.origin.z);
    debugMesh.updateMatrixWorld();

    const {
      hoverIndex,
      highlightMin,
      highlightMax,
      active,
    } = parcelsMesh.updateHover(localRaycaster.ray.origin);
    targetMesh.updateHover(hoverIndex, highlightMin, highlightMax);

    if (hoverIndex !== -1) {
      const size = highlightMax.clone().sub(highlightMin);
      const center = highlightMin.clone().add(size.clone().multiplyScalar(0.5));
      targetMesh.position.set(center.x, 0, center.y);
      // console.log('set position', targetMesh.position.toArray().join(', '), size.x);
      targetMesh.updateActive(active);
    } else {
      targetMesh.updateActive(false);
    }
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

  useEffect(() => {
    if (parcelsMesh) {
      const keydown = e => {
        switch (e.code) {
          // page up
          case 'PageUp': {
            // console.log('page up');

            if (animation) {
              animation.end();
            }

            const _updateScale = () => {
              const v = cubicBezier(currentValue);
              layer1Mesh.scale.set(1 - v * 0.2, 1, 1 - v * 0.2);
              layer1Mesh.updateMatrixWorld();

              heightfieldsMesh.setOpacity(1 - v);
              parcelsMesh.setOpacity(1 - v);
              targetMesh.setOpacity(1 - v);
            };

            const startTime = performance.now();
            animation = {
              startTime,
              startValue: new THREE.Vector3(0, currentValue, 0),
              endValue: new THREE.Vector3(0, 1, 0),
              duration: 1000,
              update() {
                const currentTime = performance.now();
                const t = Math.min((currentTime - this.startTime) / this.duration, 1);
                const value = this.startValue.clone().lerp(this.endValue, t);
                currentValue = value.y;

                _updateScale();

                if (t >= 1) {
                  animation = null;
                }
              },
              end() {
                currentValue = this.endValue.y;
                _updateScale();
                animation = null;
              },
            };
            break;
          }
          // page down
          case 'PageDown': {
            // console.log('page down');

            if (animation) {
              animation.end();
            }

            const _updateScale = () => {
              const v = (1 - cubicBezier(1 - currentValue));
              layer1Mesh.scale.set(1 - v * 0.2, 1, 1 - v * 0.2);
              layer1Mesh.updateMatrixWorld();

              heightfieldsMesh.setOpacity(1 - v);
              parcelsMesh.setOpacity(1 - v);
              targetMesh.setOpacity(1 - v);
            };

            const startTime = performance.now();
            animation = {
              startTime,
              startValue: new THREE.Vector3(0, currentValue, 0),
              endValue: new THREE.Vector3(0, 0, 0),
              duration: 1000,
              update() {
                const currentTime = performance.now();
                const t = Math.min((currentTime - this.startTime) / this.duration, 1);
                const value = this.startValue.clone().lerp(this.endValue, t);
                currentValue = value.y;

                _updateScale();

                if (t >= 1) {
                  animation = null;
                }
              },
              end() {
                currentValue = this.endValue.y;
                _updateScale();
                animation = null;
              },
            };
            break;
          }
        }
      };
      window.addEventListener('keydown', keydown);

      let frame;
      const _recurse = () => {
        frame = window.requestAnimationFrame(() => {
          _recurse();

          if (animation) {
            animation.update();
          }
        });
      };
      _recurse();

      return () => {
        window.removeEventListener('keydown', keydown);
        cancelAnimationFrame(frame);
      };
    }
  }, [parcelsMesh]);

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