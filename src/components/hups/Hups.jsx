import * as THREE from 'three';
import {useState, useEffect} from 'react';
import alea from '../../utils/alea.js';
import {makeGltfLoader} from "../../zine/zine-utils.js";
// import {makePromise} from "../../../utils.js";
import styles from "../../../styles/Hups.module.css";
import {AvatarCanvas} from "./AvatarCanvas.jsx";
import {
  getMeshes,
  loadGltf,
} from "../../utils/mesh-utils.js";

const avatarUrl = `https://raw.githack.com/webaverse/content/main/avatars/Scillia_Drophunter_V19.vrm`;

const seed = 'lol';
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

//

export const Hups = () => {
  const [gltf, setGltf] = useState(null);

  useEffect(() => {
    let live = true;

    (async () =>{
      // const gltf = await selectAvatar();
      const gltf = await loadGltf(avatarUrl);
      if (!live) return;

      // console.log('set model', gltf.scene);
      
      setGltf(gltf);
    })();

    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={styles.hups}>
      {gltf ? <AvatarCanvas gltf={gltf} /> : null}
    </div>
  );
};
export default Hups;