import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import {ProcGenManager} from '../../src/procedural-generation/procgen-manager.js';
import styles from '../../styles/MapCanvas.module.css';

//

const chunkSize = 16;
const worldWidth = 128;
const worldHeight = 128;
const spacing = 1;

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

let procGenInstance = null;
const useInstance = () => {
  if (!procGenInstance) {
    const procGenManager = new ProcGenManager({
      chunkSize,
    });
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

  // helpers
  const setRaycasterFromEvent = (raycaster, e) => {
    const w = dimensions[0] / devicePixelRatio;
    const h = dimensions[1] / devicePixelRatio;
    const mouse = localVector2D.set(
      (e.clientX / w) * 2 - 1,
      -(e.clientY / h) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
  };
  const _getChunksInRange = camera => {
    const chunks = [];

    // get the top left near point of the camera
    const topLeftNear = new THREE.Vector3(-1, 1, 0);
    topLeftNear.unproject(camera);
    // get the bottom right near point of the camera
    const bottomRightNear = new THREE.Vector3(1, -1, 0);
    bottomRightNear.unproject(camera);

    for (let dx = topLeftNear.x; dx < bottomRightNear.x + chunkSize; dx += chunkSize) {
      for (let dz = topLeftNear.z; dz < bottomRightNear.z + chunkSize; dz += chunkSize) {
        const x = Math.floor(dx / chunkSize);
        const z = Math.floor(dz / chunkSize);
        chunks.push({
          min: new THREE.Vector2(x, z),
        });
      }
    }

    return chunks;
  };
  const _renderChunksToMeshInstances = (chunks, chunksMesh) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const {min} = chunk;
      localMatrix.compose(
        localVector.set(
          min.x * chunkSize,
          0,
          min.y * chunkSize
        ),
        zeroQuaternion,
        localVector2.setScalar(chunkSize - spacing)
      );
      chunksMesh.setMatrixAt(i, localMatrix);
    }
    chunksMesh.instanceMatrix.needsUpdate = true;
    chunksMesh.count = chunks.length;
  };
  const _refreshChunks = (camera, chunksMesh) => {
    const chunks = _getChunksInRange(camera);
    _renderChunksToMeshInstances(chunks, chunksMesh);
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

      const chunksGeometry = new THREE.PlaneGeometry(1, 1)
        // .scale(scale, scale, scale)
        .translate(0.5, -0.5, 0)
        .rotateX(-Math.PI / 2);
      const chunksMaterial = new THREE.ShaderMaterial({
        vertexShader: `\
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          void main() {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
          }
        `,
      });
      const chunksMesh = new THREE.InstancedMesh(
        chunksGeometry,
        chunksMaterial,
        1024
      );
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
      const barrierMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
      });
      const barrierMesh = new THREE.InstancedMesh(
        barrierGeometry,
        barrierMaterial,
        256
      );
      barrierMesh.frustumCulled = false;
      scene.add(barrierMesh);
      setBarrierMesh(barrierMesh);

      // camera
      const left = worldWidth / -2;
      const right = worldWidth / 2;
      const top = worldHeight / 2;
      const bottom = worldHeight / -2;
      const near = 0.1;
      const far = 1000;
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
      _refreshChunks(camera, chunksMesh);

      // debug barrier
      (async () => {
        if (!procGenInstance) {
          const instance = useInstance();
  
          const position = localVector.set(0, 0, 0);
          const minLod = 1;
          const maxLod = 6;
          const abortController = new AbortController();
          const {signal} = abortController;
  
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
            /* console.log('make translate', [
              min[0],
              0,
              min[1],
              size
            ]); */
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
        }
      })();
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
    };
  }, [renderer]);
  useEffect(() => {
    const [width, height] = dimensions;
    if (renderer) {
      renderer.setSize(width, height);
      _refreshChunks(camera, chunksMesh);
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

      _refreshChunks(camera, chunksMesh);
    }

    setRaycasterFromEvent(localRaycaster, e);
    debugMesh.position.set(localRaycaster.ray.origin.x, 0, localRaycaster.ray.origin.z);
    debugMesh.updateMatrixWorld();
  };
  const handleWheel = e => {
    e.stopPropagation();

    // scale around the mouse position
    setRaycasterFromEvent(localRaycaster, e);

    const oldScale = camera.scale.x;
    const newScale = Math.min(Math.max(oldScale * (1 + e.deltaY * 0.001), 0.02), 3);
    const scaleFactor = newScale / oldScale;

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

    _refreshChunks(camera, chunksMesh);
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