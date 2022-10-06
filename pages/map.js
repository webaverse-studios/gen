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
  /* const formatImages = md => {
    md = md.replace(/\!\[([^\]]*?)\]\(([^\)]*?)\)/g, (all, title, url) => {
      const match = title.match(/^([\s\S]*?)(\|[\s\S]*?)?$/);
      if (match) {
        title = match[1].trim();
        url = match[2] ? match[2].trim() : title;
        if (url) {
          return `![${title}](/api/images/${type}s/${encodeURIComponent(url)}.png)`;
        } else {
          return null;
        }
      } else {
        return all;
      }
    });
    md = md.replace(/(\!?)\[([\s\S]+?)\]\(([\s\S]+?)\)/g, (all, q, title, url) => {
      if (q) {
        return all;
      }
      return `[${title}](${encodeURI(url)})`;
    });
    return md;
  };
  content = formatImages(content);
  return (
    <div className={styles.character}>
      <div className={styles.name}>{title}</div>
      <div className={styles.markdown}>
        <Markdown gfm openLinksInNewTab={false}>{content}</Markdown>
      </div>
    </div>
  ); */
};
/* Map.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/([^\/]*)\/([^\/]*)/);
  let type = match ? match[1].replace(/s$/, '') : '';
  let name = match ? match[2] : '';
  name = decodeURIComponent(name);
  name = cleanName(name);

  const c = new Ctx();
  const title = `${type}/${name}`;
  const id = uuidByString(title);
  const query = await c.databaseClient.getByName('Content', title);
  if (query) {
    const {content} = query;
    return {
      type,
      id,
      title,
      content,
    };
  } else {
    const c = new Ctx();
    const [
      datasetSpecs,
      generatedItem,
    ] = await Promise.all([
      getDatasetSpecs(),
      generateItem(type, name),
    ]);
    const datasetSpec = datasetSpecs.find(ds => ds.type === type);
    // console.log('got datset spec', {datasetSpec});
    const itemText = formatItemText(generatedItem, datasetSpec);

    // const imgUrl = `/api/characters/${name}/images/main.png`;

    const content = `\
${itemText}
`;
// ![](${encodeURI(imgUrl)})

    await c.databaseClient.setByName('Content', title, content);
    
    return {
      type,
      id,
      title,
      content,
    };
  }
}; */
export default Map;