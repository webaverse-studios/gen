import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {mobUrls} from '../../constants/urls.js';
import {
  makeRenderer,
  makeGltfLoader,
  pushMeshes,
  makeDefaultCamera,
} from '../../utils/three-utils.js';
import {makePromise} from '../../../utils.js';

import styles from '../../../styles/MobGenerator.module.css';

//

const MobGeneratorComponent = () => {
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState(false);
  const canvasRef = useRef();
  
  const size = 1024;

  const generateMob = async prompt => {
    const canvas = canvasRef.current;
    if (canvas && !generated) {
      setGenerated(true);

      const renderer = makeRenderer(canvas);

      const scene = new THREE.Scene();
      scene.autoUpdate = false;

      const camera = makeDefaultCamera();
      camera.position.set(0, 1, -4);
      camera.lookAt(new THREE.Vector3(0, 0, 0));
      camera.updateMatrixWorld();

      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(1, 2, 3);
      scene.add(light);

      const ambientLight = new THREE.AmbientLight(0xffffff, 2);
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

        const meshes = [];
        const materials = [];
        model.traverse(o => {
          if (o.isMesh) {
            meshes.push(o);
            materials.push(o.material);
          }
        });

        globalThis.model = model;
        globalThis.meshes = meshes;
        globalThis.materials = materials;

        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i];
          const material = materials[i];
          const {map} = material;
          const {image} = map;

          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.style.cssText = `\
            background: red;
          `;
          document.body.appendChild(canvas);
          const renderer2 = makeRenderer(canvas);
          const scene2 = new THREE.Scene();
          scene2.autoUpdate = false;
          const camera2 = makeDefaultCamera();

          const overrideMaterial = new THREE.ShaderMaterial({
            uniforms: {
              uMap: {
                value: material.map,
                needsUpdate: true,
              },
              iResolution: {
                value: new THREE.Vector2(image.width, image.height),
                needsUpdate: true,
              },
            },
            vertexShader: `\
              varying vec2 vUv;

              void main() {
                vUv = uv;
                // gl_Position = vec4(position, 1.0);
                vec2 duv = (uv - 0.5) * 2.;
                gl_Position = vec4(duv.x, duv.y, 0., 1.0);
              }
            `,
            fragmentShader: `\
              uniform sampler2D uMap;
              varying vec2 vUv;

              void main() {
                vec4 color = texture2D(uMap, vUv);
                gl_FragColor = color;
                gl_FragColor.b += 0.1;
                gl_FragColor.a = 1.;
              }
            `,
          });
          scene2.overrideMaterial = overrideMaterial;

          // push meshes
          const popMeshes = pushMeshes(scene2, meshes, {
            frustumCulled: false,
          });

          // render
          renderer2.render(scene2, camera2);

          // pop meshes
          popMeshes();

          const newMap = new THREE.Texture();
        }
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
      }} placeholder={'UV map for a JRPG monster creature video game'} />
        <div className={styles.button} onClick={async () => {
          await generateMob(prompt);
        }}>Generate</div>
      <canvas className={styles.canvas} width={size} height={size} ref={canvasRef} />
    </div>
  );
};
export default MobGeneratorComponent;