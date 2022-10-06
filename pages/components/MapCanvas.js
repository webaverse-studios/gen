import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import styles from '../../styles/MapCanvas.module.css';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localRaycaster = new THREE.Raycaster();

const downQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

//

let scale = 1;

export const MapCanvas = () => {
  const [dimensions, setDimensions] = useState([
    globalThis.innerWidth * globalThis.devicePixelRatio,
    globalThis.innerHeight * globalThis.devicePixelRatio,
  ]);
  const [dragState, setDragState] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [debugMesh, setDebugMesh] = useState(null);

  const setRaycasterFromEvent = (raycaster, e) => {
    const w = dimensions[0] / devicePixelRatio;
    const h = dimensions[1] / devicePixelRatio;
    const mouse = localVector2D.set(
      (e.clientX / w) * 2 - 1,
      -(e.clientY / h) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
  };

  const handleCanvas = useMemo(() => canvasEl => {
    if (canvasEl) {
      const worldWidth = 128;
      const worldHeight = 128;
      const chunkSize = 16;

      const scene = new THREE.Scene();
      scene.matrixWorldAutoUpdate = false;

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

      const scale = 0.9;
      const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize)
        .scale(scale, scale, scale)
        .translate(chunkSize / 2, -chunkSize / 2, 0)
        .rotateX(-Math.PI / 2);
      const material = new THREE.ShaderMaterial({
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
      const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        256
      );
      mesh.frustumCulled = false;
      scene.add(mesh);

      const debugGeometry = new THREE.BoxGeometry(1, 1, 1);
      const debugMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
      });
      const debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
      debugMesh.frustumCulled = false;
      scene.add(debugMesh);
      setDebugMesh(debugMesh);

      // get the top left near point of the camera
      const topLeftNear = new THREE.Vector3(-1, 1, 0);
      topLeftNear.unproject(camera);
      localMatrix.makeTranslation(
        topLeftNear.x,
        topLeftNear.y,
        topLeftNear.z
      );
      mesh.setMatrixAt(0, localMatrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 1;

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
    renderer && renderer.setSize(width, height);
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
      const startPosition = new THREE.Vector3(
        (-startX / w) * 2 + 1,
        (startY / h) * 2 - 1,
        0
      ).unproject(camera);
      const endPosition = new THREE.Vector3(
        (-clientX / w) * 2 + 1,
        (clientY / h) * 2 - 1,
        0
      ).unproject(camera);

      camera.position.copy(dragState.cameraStartPositon)
        .sub(startPosition)
        .add(endPosition);
      camera.updateMatrixWorld();
    }

    setRaycasterFromEvent(localRaycaster, e);
    debugMesh.position.set(localRaycaster.ray.origin.x, 0, localRaycaster.ray.origin.z);
    debugMesh.updateMatrixWorld();
  };
  const handleWheel = e => {
    e.stopPropagation();

    // scale around the mouse position
    setRaycasterFromEvent(localRaycaster, e);

    const oldScale = scale;
    const newScale = Math.min(Math.max(scale * (1 + e.deltaY * 0.001), 0.01), 3);
    const scaleFactor = newScale / oldScale;

    localMatrix.compose(
      camera.position,
      downQuaternion,
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
        localMatrix2.makeScale(scaleFactor, 1, scaleFactor)
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
    scale = newScale;
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