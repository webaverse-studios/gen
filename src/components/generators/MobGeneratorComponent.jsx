import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import alea from '../../utils/alea.js';
import {
  imageForImg2Img,
  imageForImg2Img2,
  mask,
} from '../../constants/urls.js';
import {mobUrls} from '../../constants/image-constants.js';
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
};

//

const txt2img = async ({
  prompt = 'test',
  negativePrompt = '',
  width = 512,
  height = 512,
} = {}) => {
/*
 : string, // represents text string of 'Prompt' Textbox component
 : string, // represents text string of 'Negative prompt' Textbox component
 : string, // represents selected choice of 'Style 1' Dropdown component
 : string, // represents selected choice of 'Style 2' Dropdown component
 : number, // represents selected value of 'Sampling Steps' Slider component
 : string, // represents selected choice of 'Sampling method' Radio component
 : boolean, // represents checked status of 'Restore faces' Checkbox component
 : boolean, // represents checked status of 'Tiling' Checkbox component
 : number, // represents selected value of 'Batch count' Slider component
 : number, // represents selected value of 'Batch size' Slider component
 : number, // represents selected value of 'CFG Scale' Slider component
 : number, // represents numeric value of 'Seed' Number component
 : number, // represents numeric value of 'Variation seed' Number component
 : number, // represents selected value of 'Variation strength' Slider component
 : number, // represents selected value of 'Resize seed from height' Slider component
 : number, // represents selected value of 'Resize seed from width' Slider component
 : boolean, // represents checked status of 'Extra' Checkbox component
 : number, // represents selected value of 'Height' Slider component
 : number, // represents selected value of 'Width' Slider component
 : boolean, // represents checked status of 'Highres. fix' Checkbox component
 : number, // represents selected value of 'Denoising strength' Slider component
 : number, // represents selected value of 'Firstpass width' Slider component
 : number, // represents selected value of 'Firstpass height' Slider component
 : string, // represents selected choice of 'Script' Dropdown component
 : boolean, // represents checked status of 'Put variable parts at start of prompt' Checkbox component
 : boolean, // represents checked status of 'Iterate seed every line' Checkbox component
 : boolean, // represents checked status of 'Use same random seed for all lines' Checkbox component
 : string, // represents text string of 'List of prompt inputs' Textbox component
 : string, // represents selected choice of 'X type' Dropdown component
 : string, // represents text string of 'X values' Textbox component
 : string, // represents selected choice of 'Y type' Dropdown component
 : string, // represents text string of 'Y values' Textbox component
 : boolean, // represents checked status of 'Draw legend' Checkbox component
 : boolean, // represents checked status of 'Include Separate Images' Checkbox component
 : boolean, // represents checked status of 'Keep -1 for seeds' Checkbox
*/
  const res = await fetch("https://stable-diffusion.webaverse.com/run/txt2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        prompt, // prompt
        negativePrompt, // negative prompt
        "None", // style 1
        "None", // style 2
        20, // sampling steps
        "Euler a", // sampling method
        false, // restore faces
        false, // tiling
        1, // batch count
        1, // batch size
        7, // cfg scale
        -1, // seed
        -1, // variation seed
        0, // variation strength
        0, // resize seed from height
        0, // resize seed from width
        false, // extra
        height, // height
        width, // width
        false, // highres fix
        0.7, // denoising strength
        0, // firstpass width
        0, // firstpass height
        "None", // script
        false, // put variable parts at start of prompt
        false, // iterate seed every line
        false, // use same random seed for all lines
        prompt, // list of prompt inputs
        "Nothing", // x type
        "", // x values
        "Nothing", // y type
        "", // y values
        true, // draw legend
        false, // include separate images
        false, // keep -1 for seeds
    ]
  })})
  const r = await res.json();
  const data = r.data;
  const j = data[0][0];
  const {name} = j;
  const img = await loadImage('/file=' + name);
  img.style.cssText = `\
    position: absolute;
    top: 0;
    left: 0;
  `;
  document.body.appendChild(img);
  return j;
};
globalThis.txt2img = txt2img;

//

const img2img = async ({
  prompt = 'test',
  negativePrompt = '',
  width = 512,
  height = 512,
} = {}) => {
  /*
 : { label: string; confidences?: Array<{ label: string; confidence: number }>, // represents output label and optional set of confidences per label of the Label component
 : string, // represents text string of 'Prompt' Textbox component
 : string, // represents text string of 'Negative prompt' Textbox component
 : string, // represents selected choice of 'Style 1' Dropdown component
 : string, // represents selected choice of 'Style 2' Dropdown component
 : string, // represents image data as base64 string of 'Image for img2img' Image component
 : string, // represents image data as base64 string of 'Image for inpainting with mask' Image component
 : Any, // represents stored state value of the State component
 : string, // represents image data as base64 string of 'Image for img2img' Image component
 : string, // represents image data as base64 string of 'Mask' Image component
 : string, // represents selected choice of 'Mask mode' Radio component
 : number, // represents selected value of 'Sampling Steps' Slider component
 : string, // represents selected choice of 'Sampling method' Radio component
 : number, // represents selected value of 'Mask blur' Slider component
 : number, // represents selected value of 'Mask transparency' Slider component
 : string, // represents selected choice of 'Masked content' Radio component
 : boolean, // represents checked status of 'Restore faces' Checkbox component
 : boolean, // represents checked status of 'Tiling' Checkbox component
 : number, // represents selected value of 'Batch count' Slider component
 : number, // represents selected value of 'Batch size' Slider component
 : number, // represents selected value of 'CFG Scale' Slider component
 : number, // represents selected value of 'Denoising strength' Slider component
 : number, // represents numeric value of 'Seed' Number component
 : number, // represents numeric value of 'Variation seed' Number component
 : number, // represents selected value of 'Variation strength' Slider component
 : number, // represents selected value of 'Resize seed from height' Slider component
 : number, // represents selected value of 'Resize seed from width' Slider component
 : boolean, // represents checked status of 'Extra' Checkbox component
 : number, // represents selected value of 'Height' Slider component
 : number, // represents selected value of 'Width' Slider component
 : string, // represents selected choice of 'Resize mode' Radio component
 : boolean, // represents checked status of 'Inpaint at full resolution' Checkbox component
 : number, // represents selected value of 'Inpaint at full resolution padding, pixels' Slider component
 : string, // represents selected choice of 'Masking mode' Radio component
 : string, // represents text string of 'Input directory' Textbox component
 : string, // represents text string of 'Output directory' Textbox component
 : string, // represents selected choice of 'Script' Dropdown component
 : string, // represents HTML rendering of markdown of the Markdown component
 : boolean, // represents checked status of 'Override `Sampling method` to Euler?(this method is built for it)' Checkbox component
 : boolean, // represents checked status of 'Override `prompt` to the same value as `original prompt`?(and `negative prompt`)' Checkbox component
 : string, // represents text string of 'Original prompt' Textbox component
 : string, // represents text string of 'Original negative prompt' Textbox component
 : boolean, // represents checked status of 'Override `Sampling Steps` to the same value as `Decode steps`?' Checkbox component
 : number, // represents selected value of 'Decode steps' Slider component
 : boolean, // represents checked status of 'Override `Denoising strength` to 1?' Checkbox component
 : number, // represents selected value of 'Decode CFG scale' Slider component
 : number, // represents selected value of 'Randomness' Slider component
 : boolean, // represents checked status of 'Sigma adjustment for finding noise for image' Checkbox component
 : number, // represents selected value of 'Loops' Slider component
 : number, // represents selected value of 'Denoising strength change factor' Slider component
 : string, // represents HTML output of the Html component
 : number, // represents selected value of 'Pixels to expand' Slider component
 : number, // represents selected value of 'Mask blur' Slider component
 : Array<string>, // represents list of selected choices of 'Outpainting direction' Checkboxgroup component
 : number, // represents selected value of 'Fall-off exponent (lower=higher detail)' Slider component
 : number, // represents selected value of 'Color variation' Slider component
 : number, // represents selected value of 'Pixels to expand' Slider component
 : number, // represents selected value of 'Mask blur' Slider component
 : string, // represents selected choice of 'Masked content' Radio component
 : Array<string>, // represents list of selected choices of 'Outpainting direction' Checkboxgroup component
 : boolean, // represents checked status of 'Put variable parts at start of prompt' Checkbox component
 : boolean, // represents checked status of 'Iterate seed every line' Checkbox component
 : boolean, // represents checked status of 'Use same random seed for all lines' Checkbox component
 : string, // represents text string of 'List of prompt inputs' Textbox component
 : string, // represents HTML output of the Html component
 : number, // represents selected value of 'Tile overlap' Slider component
 : string, // represents selected choice of 'Upscaler' Radio component
 : string, // represents selected choice of 'X type' Dropdown component
 : string, // represents text string of 'X values' Textbox component
 : string, // represents selected choice of 'Y type' Dropdown component
 : string, // represents text string of 'Y values' Textbox component
 : boolean, // represents checked status of 'Draw legend' Checkbox component
 : boolean, // represents checked status of 'Include Separate Images' Checkbox component
 : boolean, // represents checked status of 'Keep -1 for seeds' Checkbox
*/
  const pixelsToExpand = 128;
  const maskBlur = 0;
  const maskTransparency = 0; // 0 default
  const res = await fetch("https://stable-diffusion.webaverse.com/run/img2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
          1, // confidence
          prompt, // prompt
          negativePrompt, // negative prompt
          "None", // style 1
          "None", // style 2
          null, // image for img2img
          null, // image for inpainting with mask
          null, // state
          imageForImg2Img2, // image for img2img
          mask, // mask
          "Upload mask", // mask mode
          20, // sampling steps
          "Euler a", // sampling method
          maskBlur, // mask blur
          maskTransparency, // mask transparency
          "fill", // masked content {"fill", "original", "latent noise", "latent nothing"}
          false, // restore faces
          false, // tiling
          1, // batch count
          1, // batch size
          7, // cfg scale
          0.75, // denoising strength
          -1, // seed
          -1, // variation seed
          0, // variation strength
          0, // resize seed from height
          0, // resize seed from width
          false, // extra
          height, // height
          width, // width
          "Just resize", // resize mode
          false, // inpaint at full resolution
          32, // inpaint at full resolution padding, pixels
          "Inpaint masked", // masking mode
          "", // input directory
          "", // output directory
          "None", // script
          "<ul>\n<li><code>CFG Scale</code> should be 2 or lower.</li>\n</ul>\n", // markdown
          true, // override `Sampling method` to Euler?(this method is built for it)
          true, // override `prompt` to the same value as `original prompt`?(and `negative prompt`)
          "", // original prompt
          "", // original negative prompt
          true, // override `Sampling Steps` to the same value as `Decode steps`?
          50, // decode steps
          true, // override `Denoising strength` to 1?
          1, // decode CFG scale
          0, // randomness
          false, // sigma adjustment for finding noise for image
          4, // loops
          1, // denoising strength change factor
          "<p style=\"margin-bottom:0.75em\">Recommended settings: Sampling Steps: 80-100, Sampler: Euler a, Denoising strength: 0.8</p>", // html
          pixelsToExpand, // pixels to expand
          maskBlur, // mask blur
          [ // outpainting direction
            "left",
            "right",
            "up",
            "down"
          ],
          1, // fall-off exponent (lower=higher detail)
          0.05, // color variation
          pixelsToExpand, // pixels to expand
          maskBlur, // mask blur
          "fill", // masked content
          [ // outpainting direction
            "left",
            "right",
            "up",
            "down"
          ],
          false, // put variable parts at start of prompt
          false, // iterate seed every line
          false, // use same random seed for all lines
          "", // list of prompt inputs
          "<p style=\"margin-bottom:0.75em\">Will upscale the image to twice the dimensions; use width and height sliders to set tile size</p>", // html
          64, // tile overlap
          "None", // upscaler
          "Seed", // x type
          "", // x values
          "Nothing", // y type
          "", // y values
          true, // draw legend
          false, // include separate images
          false, // keep -1 for seeds
          // null, // image for inpainting with mask
          // // "{\"prompt\": \"anime\", \"all_prompts\": [\"anime\"], \"negative_prompt\": \"\", \"all_negative_prompts\": [\"\"], \"seed\": 3183593457, \"all_seeds\": [3183593457], \"subseed\": 1599988678, \"all_subseeds\": [1599988678], \"subseed_strength\": 0, \"width\": 512, \"height\": 512, \"sampler_name\": \"Euler a\", \"cfg_scale\": 7, \"steps\": 20, \"batch_size\": 1, \"restore_faces\": false, \"face_restoration_model\": null, \"sd_model_hash\": \"779e99ba\", \"seed_resize_from_w\": 0, \"seed_resize_from_h\": 0, \"denoising_strength\": 0.75, \"extra_generation_params\": {\"Mask blur\": 4}, \"index_of_first_image\": 0, \"infotexts\": [\"anime\\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 3183593457, Size: 512x512, Model hash: 779e99ba, Denoising strength: 0.75, Mask blur: 4\"], \"styles\": [\"None\", \"None\"], \"job_timestamp\": \"20221205030835\", \"clip_skip\": 1, \"is_using_inpainting_conditioning\": false}",
          // // "<p>anime<br>\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 3183593457, Size: 512x512, Model hash: 779e99ba, Denoising strength: 0.75, Mask blur: 4</p><div class='performance'><p class='time'>Time taken: <wbr>1.34s</p><p class='vram'>Torch active/reserved: 3162/3694 MiB, <wbr>Sys VRAM: 5108/48686 MiB (10.49%)</p></div>"
    ]
  })})
  const r = await res.json();
  const data = r.data;
  const j = data[0][0];
  const {name} = j;
  console.log('got data', {data, j, name});
  const img = await loadImage('/file=' + name);
  img.style.cssText = `\
    position: absolute;
    top: 0;
    left: 0;
  `;
  document.body.appendChild(img);
  return j;
};
globalThis.img2img = img2img;

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