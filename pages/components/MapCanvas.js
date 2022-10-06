import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

import styles from '../../styles/MapCanvas.module.css';

//

const localMatrix = new THREE.Matrix4();

//

export const MapCanvas = () => {
  const [dimensions, setDimensions] = useState([
    globalThis.innerWidth * globalThis.devicePixelRatio,
    globalThis.innerHeight * globalThis.devicePixelRatio,
  ]);
  const [dragging, setDragging] = useState(false);
  const [renderer, setRenderer] = useState(null);
  // const [frame, setFrame] = useState(null);
  const [live, setLive] = useState(true);

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
      scene.add(mesh);
      mesh.frustumCulled = false;

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
          // camera.position.x = Math.sin(performance.now() / 300) * chunkSize;
          // camera.updateMatrixWorld();
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
      setDragging(false);
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
    setDragging(true);
  };
  const handleMouseMove = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <canvas
      className={styles.canvas}
      // width={dimensions[0]}
      // height={dimensions[1]}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      ref={handleCanvas}
    />
  );
};