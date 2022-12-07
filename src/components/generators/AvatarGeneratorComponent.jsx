import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {
  txt2img,
  img2img,
} from '../../clients/image-client.js';
// import {
//   txt2img,
//   img2img,
// } from '../../clients/sd-image-client.js';
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
import {
  blob2img,
  canvas2blob,
  image2DataUrl,
  img2canvas,
} from '../../utils/convert-utils.js';
import {
  optimizeAvatarModel,
} from '../../utils/avatar-optimizer.js';
import {
  preprocessMeshForTextureEdit,
  editMeshTextures,
} from '../../utils/model-utils.js';

import styles from '../../../styles/MobGenerator.module.css';

//

const avatarUrl = `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v1_Guilty.vrm`;
const size = 1024;

//

const generateAvatar = async (canvas, prompt, negativePrompt) => {
  const renderer = makeRenderer(canvas);

  const scene = new THREE.Scene();
  scene.autoUpdate = false;

  const camera = makeDefaultCamera();
  camera.position.set(0, 0.9, -2);
  // camera.lookAt(new THREE.Vector3(0, camera.position.y, 0));
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  camera.updateMatrixWorld();

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 3);
  light.updateMatrixWorld();
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const localColor = new THREE.Color();

  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 1;
  controls.maxDistance = 100;
  const targetDistance = -camera.position.z;
  controls.target.copy(camera.position)
    // .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), targetDistance);
  controls.target.z = 0;
  controls.update();

  const seed = 'lol' + Math.random();
  globalThis.seed = seed;
  const rng = alea(seed);

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
    const getMeshes = model => {
      const meshes = [];
      model.traverse(o => {
        if (o.isMesh) {
          meshes.push(o);
        }
      });
      return meshes;
    };
    let meshes = getMeshes(model);

    // sort meshes into invisible categories
    // metadata = [alpha, shiftHSV]
    const hairShift = rng() * Math.PI * 2;
    const clothingShift = rng() * Math.PI * 2;
    const hairMetadata = [1, hairShift, 0.5, 0.5];
    const chestMetadata = [0, clothingShift, 0, 0.3];
    const clothingMetadata = [1, clothingShift, 0, 0.3];
    const headMetadata = [1, 0, 0, 0];
    const bodyMetadata = [1, 0, 0, 0];
    const categorySpecs = [
      {
        prefix: 'hair_',
        name: 'hair',
        className: 'hair',
        metadata: hairMetadata,
      },
      {
        prefix: 'foot_',
        name: 'foot',
        className: 'clothing',
        metadata: clothingMetadata,
      },
      {
        prefix: 'accessories_',
        name: 'accessories',
        className: 'clothing',
        metadata: clothingMetadata,
      },
      {
        prefix: 'chest_',
        name: 'chest',
        className: 'clothing',
        metadata: chestMetadata,
      },
      {
        prefix: 'legs_',
        name: 'legs',
        className: 'clothing',
        metadata: clothingMetadata,
      },
      {
        prefix: 'head_',
        name: 'head',
        className: 'body',
        metadata: headMetadata,
      },
      {
        prefix: 'body_',
        name: 'body',
        className: 'body',
        metadata: bodyMetadata,
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
        mesh.className = 'avatar';
        mesh.metadata = categorySpec.metadata;
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
    globalThis.optimizedModel = model;

    // // add the model to the scene
    avatars.add(model);
    model.updateMatrixWorld();

    meshes = getMeshes(model);
    if (meshes.length !== 1) {
      console.warn('unexpected number of meshes', meshes.length);
      debugger;
    }
    {
      const mesh = meshes[0];
      globalThis.mesh = mesh;
      const {material} = mesh;

      const canvas = document.createElement('canvas');
      canvas.classList.add('frontCanvas');
      canvas.width = size;
      canvas.height = size;
      canvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(canvas);

      const renderer2 = makeRenderer(canvas);
      renderer2.autoClear = false;

      const candidateColors = colors.slice();

      const backgroundColor = 0xFFFFFF;
      // const backgroundColor = 0x000000;
      // const backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      // const backgroundColor = candidateColors.splice(Math.floor(Math.random() * candidateColors.length), 1)[0];
      const bgColor = new THREE.Color(backgroundColor);

      const backgroundColor2 = 0xFFFFFF;
      // const backgroundColor2 = 0x000000;
      // const backgroundColor2 = colors[Math.floor(Math.random() * colors.length)];
      // const backgroundColor2 = candidateColors.splice(Math.floor(Math.random() * candidateColors.length), 1)[0];
      // const backgroundColor2 = backgroundColor;
      const bgColor2 = new THREE.Color(backgroundColor2);

      // background scene
      const backgroundScene = new THREE.Scene();
      backgroundScene.autoUpdate = false;

      // background mesh
      // fullscreen geometry
      const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);
      const backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uAlpha: {
            value: 1,
            needsUpdate: true,
          },
          uColor: {
            value: bgColor,
            needsUpdate: true,
          },
          uColor2: {
            value: bgColor2,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0., 1.0);
          }
        `,
        fragmentShader: `\
          uniform vec3 uColor;
          uniform vec3 uColor2;
          uniform float uAlpha;
          varying vec2 vUv;

          void main() {
            // gl_FragColor = color;
            // gl_FragColor.b += 0.1;
            // gl_FragColor.a = 1.;

            // gl_FragColor = vec4(color.rgb, uAlpha);

            // gl_FragColor = vec4(uColor * (0.5 + vUv.y * 0.5), uAlpha);
            gl_FragColor = vec4(mix(uColor, uColor2, vUv.y), uAlpha);
            // gl_FragColor = vec4(vUv, 0., uAlpha);

            // if (uAlpha == 1.) {
            //   gl_FragColor = vec4(color.rgb, uAlpha);
            // } else {
            //   // gl_FragColor = vec4(uColor * (0.7 + vUv.y * 0.3), uAlpha);
            // }
          }
        `,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NoBlending,
        // transparent: true,
      });
      const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
      backgroundMesh.frustumCulled = false;
      backgroundScene.add(backgroundMesh);

      // foreground scene
      const scene2 = new THREE.Scene();
      scene2.autoUpdate = false;
      
      const overrideMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uAlpha: {
            value: -1,
            needsUpdate: true,
          },
          uMap: {
            value: material.map,
            needsUpdate: true,
          },
          // uFlipY: {
          //   value: +flipY,
          //   needsUpdate: true,
          // },
        },
        vertexShader: `\
          attribute vec4 metadata;
          varying vec2 vUv;
          varying vec2 vUv2;
          flat varying vec4 vMetadata;
  
          void main() {
            vUv = uv;
            vMetadata = metadata;
            
            // gl_Position = vec4(position, 1.0);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            
            vec3 p = gl_Position.xyz / gl_Position.w;
            vUv2 = p.xy * 0.5 + 0.5;

            // vec2 duv = (uv - 0.5) * 2.;
            // gl_Position = vec4(duv.x, duv.y, 0., 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D uMap;
          uniform float uAlpha;
          varying vec2 vUv;
          varying vec2 vUv2;
          flat varying vec4 vMetadata;
  
          // convert rgb to hsv in glsl
          vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0., -1./3., 2./3., -1.);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
          }
  
          // convert hsv to rgb in glsl
          vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1., 2./3., 1./3., 3.);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
          }
  
          void main() {
            float alpha = vMetadata.x;
            float hueShift = vMetadata.y;
            float saturationShift = vMetadata.z;
            float valueShift = vMetadata.w;

            vec4 color = texture2D(uMap, vUv);
  
            vec3 hsv = rgb2hsv(color.rgb);
            hsv.x += hueShift;
            hsv.y += saturationShift;
            hsv.z += valueShift;
            color.rgb = hsv2rgb(hsv);
  
            bool realAlpha = uAlpha < 0.;
            float a = realAlpha ? alpha : uAlpha;
            // if (vUv2.x < 0.25 || vUv2.x > 0.75) {
            //   a = 1.;
            // }
            gl_FragColor = vec4(color.rgb, a);
            // gl_FragColor = vec4(color.rgb, alpha);
          }
        `,
        // depthTest: false,
        // depthWrite: false,
        blending: THREE.NoBlending,
        // side: THREE.DoubleSide,
        // transparent: true,
      });
      scene2.overrideMaterial = overrideMaterial;

      const camera2 = new THREE.OrthographicCamera(
        -1, // left
        1, // right
        1, // top
        -1, // bottom
        0, // near
        1000 // far
      );
      camera2.position.copy(camera.position);
      camera2.quaternion.copy(camera.quaternion);
      camera2.updateMatrixWorld();

      // prepare latch canvases
      const processingCanvas = document.createElement('canvas');
      processingCanvas.width = size;
      processingCanvas.height = size;
      const processingContext = processingCanvas.getContext('2d');
      processingContext.drawImage(renderer2.domElement, 0, 0);

      const popMeshes = pushMeshes(scene2, [
        model,
      ]);

      // render mask
      backgroundMaterial.uniforms.uAlpha.value = 0.1;
      backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
      overrideMaterial.uniforms.uAlpha.value = -1;
      overrideMaterial.uniforms.uAlpha.needsUpdate = true;
      renderer2.clear();
      renderer2.render(backgroundScene, camera2);
      renderer2.render(scene2, camera2);
      processingContext.drawImage(renderer2.domElement, 0, 0);
      const maskImageData = processingContext.getImageData(0, 0, size, size);

      // render opaque
      backgroundMaterial.uniforms.uAlpha.value = 1;
      backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
      overrideMaterial.uniforms.uAlpha.value = 1;
      overrideMaterial.uniforms.uAlpha.needsUpdate = true;
      renderer2.clear();
      renderer2.render(backgroundScene, camera2);
      renderer2.render(scene2, camera2);
      processingContext.drawImage(renderer2.domElement, 0, 0);
      const opaqueImageData = processingContext.getImageData(0, 0, size, size);

      popMeshes();

      // draw the canvases for debugging
      const opaqueCanvas = document.createElement('canvas');
      opaqueCanvas.width = size;
      opaqueCanvas.height = size;
      opaqueCanvas.classList.add('opaqueCanvas');
      opaqueCanvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(opaqueCanvas);
      const opaqueContext = opaqueCanvas.getContext('2d');
      opaqueContext.putImageData(opaqueImageData, 0, 0);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = size;
      maskCanvas.height = size;
      maskCanvas.classList.add('maskCanvas');
      maskCanvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(maskCanvas);
      const maskContext = maskCanvas.getContext('2d');
      maskContext.putImageData(maskImageData, 0, 0);

      // const [
      //   opaqueImgDataUrl,
      //   maskImgDataUrl,
      // ] = await Promise.all([
      //   image2DataUrl(opaqueCanvas),
      //   image2DataUrl(maskCanvas),
      // ]);

      const blob = await canvas2blob(opaqueCanvas);
      const maskBlob = await canvas2blob(maskCanvas);

      // const editImg = await img2img({
      //   prompt,
      //   negativePrompt,
      //   width: size,
      //   height: size,
      //   imageDataUrl: opaqueImgDataUrl,
      //   // imageDataUrl: maskImgDataUrl,
      //   maskImageDataUrl: maskImgDataUrl,
      // });
      const editImg = await img2img({
        prompt,
        blob,
        maskBlob,
      });
      console.log('edit image', editImg);
      document.body.appendChild(editImg);
    }

    /* // latch the new mesh specs
    meshes = getMeshes(model);
    // if (meshes.length !== 1) {
    //   console.warn('only one mesh is supported', meshes.length);
    // }
    console.log('new meshes', meshes);
    globalThis.meshes = meshes.slice();

    for (const mesh of meshes) {
      mesh.visible = false;
    }

    // XXX
    let first = true;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      mesh.visible = true;
      const {
        width,
        height,
        maskImgDataUrl,
        opaqueImgDataUrl,
      } = await preprocessMeshForTextureEdit(mesh, {
        textureSize: size,
        flipY: true,
      });
      
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
        flipY: false,
      });

      console.log('ok 2', mesh2);

      if (first) {
        first = false;
        const parent = mesh.parent;
        parent.remove(mesh);
        parent.add(mesh2);
      }
    } */

    // globalThis.model = model;
    // globalThis.mesh = mesh;
    // globalThis.mesh2 = mesh2;
  })();
  scene.add(avatars);

  // start render loop
  const _render = () => {
    requestAnimationFrame(_render);
    renderer.render(scene, camera);
  };
  _render();
};

const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
// const negativePrompt = 'side, back';
const negativePrompt = '';
const AvatarGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generated, setGenerated] = useState(false);
  const [imageAiModel, setImageAiModel] = useState('sd');
  const canvasRef = useRef();
  
  const generateClick = async prompt => {
    const canvas = canvasRef.current;
    if (canvas && !generated) {
      setGenerated(true);
      await generateAvatar(canvas, prompt, negativePrompt);
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