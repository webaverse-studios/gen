// import uuidByString from 'uuid-by-string';
// import Markdown from 'marked-react';
import * as THREE from 'three';
import {useState, useMemo, useEffect} from 'react';

// import styles from '../styles/ContentObject.module.css';
import styles from '../styles/Map.module.css';
// import {Ctx} from '../context.js';
// import {cleanName} from '../utils.js';
// import {generateItem} from '../datasets/dataset-generator.js';
// import {formatItemText} from '../datasets/dataset-parser.js';
// import {getDatasetSpecs} from '../datasets/dataset-specs.js';

const MapCanvas = () => {
  const [dimensions, setDimensions] = useState([
    globalThis.innerWidth * globalThis.devicePixelRatio,
    globalThis.innerHeight * globalThis.devicePixelRatio,
  ]);
  const [dragging, setDragging] = useState(false);
  const [renderer, setRenderer] = useState(null);
  const [frame, setFrame] = useState(null);

  const handleCanvas = useMemo(() => canvasEl => {
    if (canvasEl) {
      const worldWidth = 128;
      const worldHeight = 128;
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(
        worldWidth / -2,
        worldWidth / 2,
        worldHeight / 2,
        worldHeight / -2,
        0.1,
        1000
      );

      const renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
      });
      setRenderer(renderer);

      const frame = requestAnimationFrame(() => {
        renderer.render(scene, camera);
      });
      setFrame(frame);
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
    };
  }, []);
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
    <div className={styles.map}>
      <canvas
        className={styles.canvas}
        // width={dimensions[0]}
        // height={dimensions[1]}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        ref={handleCanvas}
      />
    </div>
  );
};
const Map = () => {
  return <MapCanvas />
};
export default Map;