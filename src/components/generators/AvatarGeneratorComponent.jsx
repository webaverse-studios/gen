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
  optimizeAvatarModel,
} from '../../utils/avatar-optimizer.js';

//

const avatarUrl = `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v1_Guilty.vrm`;
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

  const avatars = new THREE.Object3D();
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

    // recompile the model
    const getMeshSpecs = model => {
      const meshes = [];
      const materials = [];
      model.traverse(o => {
        if (o.isMesh) {
          meshes.push(o);
          materials.push(o.material);
        }
      });
      return {
        meshes,
        materials,
      };
    };
    let meshSpecs = getMeshSpecs(model);
    let meshes = meshSpecs.meshes;
    let materials = meshSpecs.materials;

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

    // enable base meshes
    for (const mesh of categories.body.meshes) {
      mesh.visible = true;
    }
    for (const mesh of categories.head.meshes) {
      mesh.visible = true;
    }

    // remove invisible meshes
    for (const mesh of meshes) {
      if (!mesh.visible) {
        mesh.parent.remove(mesh);
      }
    }

    // XXX: hack because this mesh does not have an identity transform
    model.updateMatrixWorld();
    const beltMesh = categories.accessories.meshes.find(mesh => mesh.name === 'accessories_HipBelt');
    beltMesh.matrix.decompose(beltMesh.position, beltMesh.quaternion, beltMesh.scale);
    beltMesh.geometry.applyMatrix4(beltMesh.matrix);
    beltMesh.matrix.identity()
      .decompose(beltMesh.position, beltMesh.quaternion, beltMesh.scale);
    beltMesh.updateMatrixWorld();

    // optimize the resulting model
    model = await optimizeAvatarModel(model);
    
    // // add the model to the scene
    avatars.add(model);
    model.updateMatrixWorld();

    // latch the new mesh specs
    meshSpecs = getMeshSpecs(model);
    meshes = meshSpecs.meshes;
    materials = meshSpecs.materials;

    // XXX rerender the textures with AI
    for (let i = 0; i < materials.length; i++) {
      // const material = materials[i];
      // console.log('got material', material);
      // const {map} = material;
      // const {image} = map;
      // image.style.cssText = `\
      //   position: relative;
      //   width: 1024px;
      //   height: 1024px;
      // `;
      // document.body.appendChild(image);

      // // resize to size
      // const canvas = document.createElement('canvas');
      // canvas.width = size;
      // canvas.height = size;
      // const ctx = canvas.getContext('2d');
      // ctx.drawImage(image, 0, 0, size, size);
      
      // const blob = await canvas2blob(canvas);
      const opaqueImgDataUrl = await image2DataUrl(canvas);

      // const editImg = await img2img({
      //   prompt,
      //   width: image.width,
      //   height: image.height,
      //   imageDataUrl: opaqueImgDataUrl,
      //   // imageDataUrl: maskImgDataUrl,
      //   maskImageDataUrl: maskImgDataUrl,
      // });
  
      // generateTextureMaps
    }

    globalThis.model = model;
    globalThis.meshes = meshes;
    globalThis.materials = materials;
    // globalThis.categories = categories;
  })();
  scene.add(avatars);

  // start render loop
  const _render = () => {
    requestAnimationFrame(_render);
    renderer.render(scene, camera);
  };
  _render();
};

const defaultPrompt = 'diffuse texture, Unreal Engine anime video game, JRPG character VRChat VRoid Hub Pixiv';
const AvatarGeneratorComponent = () => {
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
export default AvatarGeneratorComponent;