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
  img2canvas,
} from '../../utils/convert-utils.js';

//

const avatarUrl = `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v1_Guilty.vrm`;

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
    const p = makePromise();
    gltfLoader.load(avatarUrl, gltf => {
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
    const materials = [];
    model.traverse(o => {
      if (o.isMesh) {
        meshes.push(o);
        materials.push(o.material);
      }
    });

    // sort meshes into invisible categories
    const categorySpecs = [
      {
        prefix: 'hair_',
        name: 'hair',
      },
      {
        prefix: 'foot_',
        name: 'foot',
      },
      {
        prefix: 'accessories_',
        name: 'accessories',
      },
      {
        prefix: 'chest_',
        name: 'chest',
      },
      {
        prefix: 'legs_',
        name: 'legs',
      },
      {
        prefix: 'head_',
        name: 'head',
      },
      {
        prefix: 'body_',
        name: 'body',
      },
    ];
    const categories = {};
    for (const mesh of meshes) {
      const {name} = mesh;
      const categoryIndex = categorySpecs.findIndex(categorySpec => name.startsWith(categorySpec.prefix));
      if (categoryIndex !== -1) {
        const categorySpec = categorySpecs[categoryIndex];
        let entry = categories[categorySpec.name];
        if (!entry) {
          entry = {
            meshes: [],
          };
          categories[categorySpec.name] = entry;
        }
        entry.meshes.push(mesh);
      } else {
        console.warn('failed to match mesh to category', name);
        debugger;
      }
      mesh.visible = false;
    }
    // sort by name
    for (const categoryName in categories) {
      categories[categoryName].meshes.sort((a, b) => a.name.localeCompare(b.name));
    }

    // select and show a random mesh from each category
    const rng = alea('lol');
    const categorySelections = {};
    for (const categorySpec of categorySpecs) {
      const {name} = categorySpec;
      const category = categories[name];
      const mesh = category.meshes[Math.floor(rng() * category.meshes.length)];
      mesh.visible = true;
      categorySelections[name] = mesh;
    }

    for (const mesh of categories.body.meshes) {
      mesh.visible = true;
    }
    for (const mesh of categories.head.meshes) {
      mesh.visible = true;
    }

    globalThis.meshes = meshes;
    globalThis.categories = categories;
  })();
  scene.add(mobs);

  // start render loop
  const _render = () => {
    requestAnimationFrame(_render);
    renderer.render(scene, camera);
  };
  _render();
};

const defaultPrompt = 'diffuse texture, Unreal Engine anime video game, JRPG character VRoid Hub Pixiv';
const AvatarGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generated, setGenerated] = useState(false);
  const [imageAiModel, setImageAiModel] = useState('sd');
  const canvasRef = useRef();
  
  const size = 1024;

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
export default AvatarGeneratorComponent;