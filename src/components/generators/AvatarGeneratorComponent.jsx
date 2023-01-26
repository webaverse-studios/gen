import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {makeDefaultCamera, makeGltfExporter, makeGltfLoader, makeRenderer} from "../../zine/zine-utils.js";
import {makePromise} from "../../../utils.js";
import styles from "../../../styles/AvatarGenerator.module.css";
import {AvatarRendererComponent} from "./AvatarRenderComponent.jsx";


// setting up constants
const avatarUrls = [
  `/models/Avatar_Bases/Hacker Class/HackerClassMaster_v2.1_Guilty.vrm`,
  `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v2_Guilty.vrm`,
];

const seed = 'lol';
globalThis.seed = seed;
const rng = alea(seed);
const hairShift = rng() * Math.PI * 2;
const clothingShift = rng() * Math.PI * 2;
const hairMetadata = [1, hairShift, 0.5, 0.5];
const chestMetadata = [0, clothingShift, 0, 0.3];
const clothingMetadata = [1, clothingShift, 0, 0.3];
const headMetadata = [1, 0, 0, 0];
const bodyMetadata = [1, 0, 0, 0];
const categorySpecsArray = [
  [
    {
      regex: /hair/i,
      name: 'hair',
      className: 'hair',
      metadata: hairMetadata,
    },
    {
      regex: /head/i,
      name: 'head',
      className: 'body',
      metadata: headMetadata,
    },
    {
      regex: /body/i,
      name: 'body',
      className: 'body',
      metadata: bodyMetadata,
    },
    {
      regex: /^chest_/,
      name: 'chest',
      className: 'clothing',
      metadata: chestMetadata,
    },
    {
      regex: /^legs_/,
      name: 'legs',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^foot_/,
      name: 'foot',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^outer_/,
      name: 'outer',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^accessories_/,
      name: 'accessories',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^solo_/,
      name: 'solo',
      className: 'solo',
      metadata: clothingMetadata,
    },
  ],
  [
    {
      regex: /^hair_/,
      name: 'hair',
      className: 'hair',
      metadata: hairMetadata,
    },
    {
      regex: /^foot_/,
      name: 'foot',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^accessories_/,
      name: 'accessories',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^outer_/,
      name: 'outer',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^chest_/,
      name: 'chest',
      className: 'clothing',
      metadata: chestMetadata,
    },
    {
      regex: /^legs_/,
      name: 'legs',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^head_/,
      name: 'head',
      className: 'body',
      metadata: headMetadata,
    },
    {
      regex: /^body_/,
      name: 'body',
      className: 'body',
      metadata: bodyMetadata,
    },
    {
      regex: /^solo_/,
      name: 'solo',
      className: 'solo',
      metadata: clothingMetadata,
    },
  ],
];
const size = 1024;

// model loading and mesh extraction utils
const gltfLoader = makeGltfLoader();
const gltfExporter = makeGltfExporter();
export const getMeshes = model => {
  const meshes = [];
  model.traverse(o => {
    if (o.isMesh) {
      meshes.push(o);
    }
  });
  return meshes;
};

const loadGltf = avatarUrl => {
  const p = makePromise();
  gltfLoader.load(avatarUrl, gltf => {
    p.resolve(gltf);
  }, function onProgress(xhr) {
    // console.log('progress', xhr.loaded / xhr.total);
  }, p.reject);
  return p;
};

// loading a random avatar
const selectAvatar = async (avatarUrlIndex = Math.floor(rng() * avatarUrls.length)) => {
  const avatarUrl = avatarUrls[avatarUrlIndex];
  const categorySpecs = categorySpecsArray[avatarUrlIndex];
  console.log("categorySpecs", categorySpecs);

  console.log('loading avatar', avatarUrl);
  const gltf = await loadGltf(avatarUrl);

  // deep copy the gltf
  const oldModel = gltf.scene;

  const model = new THREE.Scene();
  model.position.copy(gltf.scene.position);
  model.quaternion.copy(gltf.scene.quaternion);
  model.scale.copy(gltf.scene.scale);
  model.matrix.copy(gltf.scene.matrix);
  model.matrixWorld.copy(gltf.scene.matrixWorld);
  model.visible = gltf.scene.visible;
  while(oldModel.children.length > 0) {
    model.add(oldModel.children[0]);
  }
  model.updateMatrixWorld();
  gltf.scene = model;

  // extract meshes from model
  let meshes = getMeshes(model);

  // sort meshes by category
  const categories = {};
  for (const mesh of meshes) {
    const {name} = mesh
    const categoryIndex = categorySpecs.findIndex(categorySpec => categorySpec.regex.test(name));

    if (categoryIndex !== -1) {
      const categorySpec = categorySpecs[categoryIndex];
      let entry = categories[categorySpec.name];
      if (!entry) {
        entry = {
          meshes: [],
        };
        categories[categorySpec.name] = entry;
      }
      mesh.className = 'avatar';
      mesh.metadata = categorySpec.metadata;
      entry.meshes.push(mesh);
    } else {
      console.warn('failed to match mesh to category', name);
      debugger;
    }
    mesh.visible = false;
  }
  console.log('categories', categories);
  // sort by name
  for (const categoryName in categories) {
    categories[categoryName].meshes.sort((a, b) => a.name.localeCompare(b.name));
  }

  // select and show a random mesh from each category
  const categorySelections = {};
  const _selectFromCategory = (name) => {
    const category = categories[name];
    const mesh = category.meshes[Math.floor(rng() * category.meshes.length)];
    mesh.visible = true;
    categorySelections[name] = mesh;
  };

  for (const categorySpec of categorySpecs) {
    const {name, className} = categorySpec;
    console.log('selecting from category', name, className);
    if (!['solo', 'clothing'].includes(className)) {
      _selectFromCategory(name);
    }
  }

  // select a random item from solo category if option exists and random number is less than 0.5
  let isSolo = (categories['solo'] ?
          (categories['solo'].meshes.length > 0)
          :
          false
  ) && (rng() < 0.5);

  // if solo, select a random item from solo category else select a random item from clothing category
  if (isSolo) {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'solo') {
        _selectFromCategory(name);
      }
    }
  } else {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'clothing') {
        _selectFromCategory(name);
      }
    }
  }

  // selection done
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

  return gltf;
};

const generateModel = async () =>{
  const gltf = await selectAvatar();
  let model = gltf.scene;
  return model
};

// class Data

const AvatarGeneratorComponent = () => {
  const [generated, setGenerated] = useState(false)
  const [model, setModel] = useState()

  const generateClick = async () => {
    generateModel().then((mod) => {
      setModel(mod);
      setGenerated(true);
      console.log("model", model);
    });
  };

  return (

      <div className={styles.AvatarGenerator}>
        {(() => {
          if (!generated) {
            return (<div className={styles.button} onClick={async () => {
              await generateClick();
            }}>Generate</div>)
          } else {
            return (
                <div>
                  <div className={styles.button} onClick={async () => {
                    await generateClick();}}>Generate</div>
                  <AvatarRendererComponent model={model}/>
                </div>
            )
          }
        })()}
      </div>

  );
};
export default AvatarGeneratorComponent;

