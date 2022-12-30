import * as THREE from 'three';
// import {OBB} from 'three/examples/jsm/math/OBB.js';
import {useState, useRef, useEffect} from 'react';
// import alea from 'alea';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import {Text} from 'troika-three-text';
// import * as passes from './sg-passes.js';
// import {
//   setPerspectiveCameraFromJson,
//   getPerspectiveCameraJson,
//   setOrthographicCameraFromJson,
//   getOrthographicCameraJson,
// } from '../zine/zine-camera-utils.js';
// import {
//   getDepthFloat32ArrayViewPositionPx,
//   bilinearInterpolate,
// } from '../zine/zine-geometry-utils.js';
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
  normalToQuaternion,
} from '../../zine/zine-utils.js';
import {
  zineMagicBytes,
  ZineStoryboard,
  // ZinePanel,
  ZineData,
} from '../../zine/zine-format.js';
import {
  ZineRenderer,
} from '../../zine/zine-renderer.js';
// import {
//   ZineStoryboardCompressor,
// } from '../../zine/zine-compression.js'
// import physicsManager from '../../../physics-manager.js';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';

import styles from '../../../styles/MetasceneGenerator.module.css';

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

/* const MetazinePlaceholderComponent = ({
  storyboard,
  onPanelSelect,
}) => {
  const onNew = e => {
    e.preventDefault();
    e.stopPropagation();
    // const panel = storyboard.addPanel();
    // onPanelSelect(panel);
  };
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      const panel = storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }
  };

  return (
    <DropTarget
      className={styles.panelPlaceholder}
      newLabel='Create New Board'
      onNew={onNew}
      onDragOver={dragover}
      onDrop={drop}
    />
  );
}; */

//
export class Metazine extends EventTarget {
  constructor() {
    super();
    
    this.zd = new ZineData();
    this.panels = [];
  }

  getPanels() {
    return this.panels;
  }
  
  clear() {
    this.zs.clear();
  }
  async loadAsync(uint8Array) {
    const s = new TextDecoder().decode(uint8Array);
    const j = JSON.parse(s);
    // console.log('got json', j);
    const zineFileUrls = j.map(fileName => {
      return `https://local.webaverse.com/zine-build/${fileName}`;
    });
    // console.log('got file names', zineFileUrls);

    const localZineFileUrls = [
      zineFileUrls[20],
      zineFileUrls[21],
    ];
    // let zinefile0 = await loadFileUint8Array(zineFileUrls[20]);
    // zinefile0 = zinefile0.slice(zineMagicBytes.length);

    for (let i = 0; i < localZineFileUrls.length; i++) {
      let zinefile = await loadFileUint8Array(localZineFileUrls[i]);
      zinefile = zinefile.slice(zineMagicBytes.length);

      const storyboard = new ZineStoryboard();
      // storyboard.clear();
      await storyboard.loadAsync(zinefile);

      const panels = storyboard.getPanels();
      // console.log('got panels', panels);
      // debugger;
      const panel0 = panels[0];
      this.addPanel(panel0);
    }
  }
  addPanel(panel) {
    this.panels.push(panel);
    this.dispatchEvent(new MessageEvent('paneladd', {
      data: {
        panel,
      },
    }));
  }
  async exportAsync() {
    return this.zs.toUint8Array();
  }
}

export class MetazineRenderer extends EventTarget {
  constructor(canvas, metazine, {
    debug = false,
  } = {}) {
    super();

    this.canvas = canvas;
    this.metazine = metazine;
    this.debug = debug;

    this.zineRenderers = [];

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('canvas');

    // renderer
    const renderer = makeRenderer(canvas);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    this.scene = scene;
    
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

    // initialize initial panels
    const panels = this.metazine.getPanels();
    for (const panel of panels) {
      this.addPanel(panel);
    }
    this.metazine.addEventListener('paneladd', e => {
      const {panel} = e.data;
      this.addPanel(panel);
    });
  }
  addPanel(panel) {
    // load the panel
    const zineRenderer = new ZineRenderer({
      panel,
    });
    const {
      sceneMesh,
      scenePhysicsMesh,
      // floorNetMesh,
      // edgeDepthMesh,
      // wallPlaneMeshes,
    } = zineRenderer;
    this.scene.add(zineRenderer.scene);
    if (this.zineRenderers.length === 0) {
      this.camera.copy(zineRenderer.camera);
    }
    // this.sceneMesh = sceneMesh;
    // this.scenePhysicsMesh = scenePhysicsMesh;
    // this.floorNetMesh = floorNetMesh;
    // this.wallPlaneMeshes = wallPlaneMeshes;
    // this.edgeDepthMesh = edgeDepthMesh;

    // entrance exit mesh
    // XXX move this to the zine renderer instead of externally in app/gen
    // const entranceExitMesh = new EntranceExitMesh({
    //   entranceExitLocations: this.zineRenderer.metadata.entranceExitLocations,
    // });
    // this.zineRenderer.transformScene.add(entranceExitMesh);
    // entranceExitMesh.updateMatrixWorld();
    // this.entranceExitMesh = entranceExitMesh;

    // connect the previous panel to this one
    const previousZineRenderer = this.zineRenderers.length > 0 ?
      this.zineRenderers[this.zineRenderers.length - 1]
    :
      null;    
    if (previousZineRenderer) {
      previousZineRenderer.connect(zineRenderer);
    }

    // book keeping
    this.zineRenderers.push(zineRenderer);
  }
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
    // const panel = storyboard.addPanel();
    // onPanelSelect(panel);
    console.warn('new not implemented');
  };
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      const arrayBuffer = await new Promise((accept, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          accept(e.target.result);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
      const uint8Array = new Uint8Array(arrayBuffer);
      await metazine.loadAsync(uint8Array);

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