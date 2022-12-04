import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {mobUrls} from '../../constants/urls.js';
import {
  makeRenderer,
  makeGltfLoader,
} from '../../utils/three-utils.js';
import {makePromise} from '../../../utils.js';

import styles from '../../../styles/AvatarGenerator.module.css';

//

const AvatarGeneratorComponent = () => {
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState(false);
  const canvasRef = useRef();
  
  const size = 1024;

  const generateAvatar = async prompt => {
    const canvas = canvasRef.current;
    if (canvas && !generated) {
      setGenerated(true);

      const renderer = makeRenderer(canvas);

      const scene = new THREE.Scene();
      scene.autoUpdate = false;

      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(1, 2, 3);
      scene.add(light);

      const ambientLight = new THREE.AmbientLight(0xffffff, 2);
      scene.add(ambientLight);

      const controls = new OrbitControls(camera, canvas);
      controls.minDistance = 1;
      controls.maxDistance = 100;
      controls.target.set(0, 0, -3);

      const mobs = new THREE.Object3D();
      (async () => {
        const gltfLoader = makeGltfLoader();
        const rng = alea('mob');
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

        globalThis.model = model;
      })();
      scene.add(mobs);

      // start render loop
      const _render = () => {
        requestAnimationFrame(_render);
        renderer.render(scene, camera);
      };
      _render();
    }
  };

  return (
    <div className={styles.avatarGenerator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={'UV map for a JRPG avatar video game'} />
        <div className={styles.button} onClick={async () => {
          await generateAvatar(prompt);
        }}>Generate</div>
      <canvas className={styles.canvas} width={size} height={size} ref={canvasRef} />
    </div>
  );
};
export default AvatarGeneratorComponent;