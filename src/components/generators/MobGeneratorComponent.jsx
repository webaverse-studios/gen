import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {
  txt2img,
  img2img,
} from '../../clients/sd-image-client.js';
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

import styles from '../../../styles/MobGenerator.module.css';

//

async function image2DataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // debugging
  canvas.style.cssText = `\
    background: red;
  `;
  document.body.appendChild(canvas);

  // get the blob
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  // get the blob url
  // read the data url from the blob
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
  return dataUrl;
}

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

            // gl_FragColor = color;
            // gl_FragColor.b += 0.1;
            // gl_FragColor.a = 1.;

            gl_FragColor = vec4(mix(
              color.rgb,
              vec3(1.),
              0.5
            ), 1.);
          }
        `,
      });
      scene2.overrideMaterial = overrideMaterial;

      // push meshes
      const popMeshes = pushMeshes(scene2, meshes, {
        frustumCulled: false,
      });

      // render mask
      renderer2.render(scene2, camera2);
      // latch mask
      const maskImgDataUrlPromise = image2DataUrl(renderer2.domElement);

      // render opaque
      renderer2.setClearColor(0xFFFFFF, 1);
      renderer2.clear();
      renderer2.render(scene2, camera2);
      // latch opaque
      const opaqueImgDataUrlPromise = image2DataUrl(renderer2.domElement);

      // pop meshes
      popMeshes();

      const [
        maskImgDataUrl,
        opaqueImgDataUrl,
      ] = await Promise.all([
        maskImgDataUrlPromise,
        opaqueImgDataUrlPromise,
      ]);
      
      const editImg = await img2img({
        prompt,
        width: image.width,
        height: image.height,
        imageDataUrl: opaqueImgDataUrl,
        maskImageDataUrl: maskImgDataUrl,
      });
      console.log('edit image', editImg);

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
};

const MobGeneratorComponent = () => {
  const [prompt, setPrompt] = useState('');
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
      }} placeholder={'UV map for a JRPG monster creature video game'} />
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