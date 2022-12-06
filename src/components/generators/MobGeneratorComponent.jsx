import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
// import {
//   txt2img,
//   img2img,
// } from '../../clients/image-client.js';
import {
  txt2img,
  img2img,
} from '../../clients/sd-image-client.js';
import {
  generateTextureMaps,
} from '../../clients/material-map-client.js';
import {mobUrls} from '../../constants/urls.js';
import {
  makeRenderer,
  makeGltfLoader,
  pushMeshes,
  makeDefaultCamera,
} from '../../utils/three-utils.js';
import {
  makePromise,
  loadImage,
} from '../../../utils.js';
import {
  createSeedImage,
} from '../../../canvas/seed-image.js';
import {
  colors,
} from '../../constants/detectron-colors.js';

import styles from '../../../styles/MobGenerator.module.css';
import {
  blob2img,
  canvas2blob,
  image2DataUrl,
  img2canvas,
} from '../../utils/convert-utils.js';
import {
  preprocessMeshForTextureEdit,
  editMeshTextures,
} from '../../utils/model-utils.js';

//

const size = 1024;

//

const generateMob = async (canvas, prompt) => {
  const renderer = makeRenderer(canvas);

  const scene = new THREE.Scene();
  scene.autoUpdate = false;

  const camera = makeDefaultCamera();
  camera.position.set(0, 1, -4);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  camera.updateMatrixWorld();

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 3);
  light.updateMatrixWorld();
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 1;
  controls.maxDistance = 100;
  const targetDistance = -camera.position.z;
  controls.target.copy(camera.position)
    .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), targetDistance);

  const mobs = new THREE.Object3D();
  (async () => {
    const gltfLoader = makeGltfLoader();
    const rng = alea('lol8');
    const mobUrl = mobUrls[Math.floor(rng() * mobUrls.length)];
    
    const p = makePromise();
    gltfLoader.load(mobUrl, gltf => {
      p.resolve(gltf);
    }, function onProgress(xhr) {
      // console.log('progress', xhr.loaded / xhr.total);
    }, p.reject);

    let model = await p;
    model = model.scene;
    mobs.add(model);
    model.updateMatrixWorld();

    // recompile the model
    const meshes = [];
    model.traverse(o => {
      if (o.isMesh) {
        meshes.push(o);
      }
    });

    // globalThis.model = model;
    // globalThis.meshes = meshes;

    if (meshes.length !== 1) {
      console.warn('meshes.length !== 1', meshes.length);
      debugger;
    }

    const mesh = meshes[0];
    const {
      width,
      height,
      maskImgDataUrl,
      opaqueImgDataUrl,
    } = await preprocessMeshForTextureEdit(mesh);
    
    console.log('ok 1', {
      width,
      height,
      maskImgDataUrl,
      opaqueImgDataUrl,
    });

    const mesh2 = await editMeshTextures(mesh, {
      prompt,
      width,
      height,
      opaqueImgDataUrl,
      maskImgDataUrl,
    });

    console.log('ok 2', {
      width,
      height,
      maskImgDataUrl,
      opaqueImgDataUrl,
    });

    const parent = mesh.parent;
    parent.remove(mesh);
    parent.add(mesh2);
  })();
  scene.add(mobs);

  // start render loop
  const _render = () => {
    requestAnimationFrame(_render);
    renderer.render(scene, camera);
  };
  _render();
};

const defaultPrompt = 'diffuse texture, Unreal Engine anime video game, JRPG epic colorful monster creature';
const MobGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generated, setGenerated] = useState(false);
  const [imageAiModel, setImageAiModel] = useState('sd');
  const canvasRef = useRef();
  
  const generateClick = async prompt => {
    const canvas = canvasRef.current;
    if (canvas && !generated) {
      setGenerated(true);
      await generateMob(canvas, prompt);
    }
  };

  return (
    <div className={styles.mobGenerator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompt} />
      <select className={styles.select} value={imageAiModel} onChange={e => {
        setImageAiModel(e.target.value);
      }}>
        <option value="sd">SD</option>
        <option value="openai">OpenAI</option>
      </select>
      <div className={styles.button} onClick={async () => {
        await generateClick(prompt);
      }}>Generate</div>
      <canvas className={styles.canvas} width={size} height={size} ref={canvasRef} />
    </div>
  );
};
export default MobGeneratorComponent;