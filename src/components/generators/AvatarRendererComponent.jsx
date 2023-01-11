import {useState, useEffect, useRef} from 'react';
import {makeDefaultCamera, makeRenderer, pushMeshes} from "../../zine/zine-utils.js";
import * as THREE from "three";
import {OrbitControls} from "../../../packages/three/examples/jsm/controls/OrbitControls.js";
import styles from "../../../styles/AvatarGenerator.module.css";
import {PanelRenderer} from "../../generators/scene-generator.js";
import {panelSize} from "../../zine/zine-constants.js";
import {getMeshes} from "./CleanedAvatarGenerator.jsx";
import {optimizeAvatarModel} from "../../utils/avatar-optimizer.js";
import {editMeshTextures, makeNoiseCanvas, preprocessMeshForTextureEdit} from "../../utils/model-utils.js";
import alea from "../../utils/alea.js";
import {loadImage} from "../../../utils.js";
import {img2img, img_inpainting, txt2img} from "../../clients/sd-image-client.js";
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import {MTLLoader} from "three/examples/jsm/loaders/MTLLoader.js";

// 3D Canvas to render avatar

const size = 512;
const baseUrl = `https://stable-diffusion.webaverse.com/`;

export const combineMasked = (mask, t1, t2) => {
    console.log('combineMasked')
    const canvas = document.createElement('canvas');
    canvas.className = 'Masked';
    canvas.width = t1.width;
    canvas.height = t1.height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(t2, 0, -t1.height, t1.width, t1.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0,  -t1.height, t1.width, t1.height);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(t1, 0, 0, t1.width, t1.height);
    // document.body.appendChild(canvas);
    return canvas;
}


function SkinnedMesh3DRenderer(props) {
    // display the selected mesh by making every other part invisible
    const { mesh } = props;
    console.log("SKINNED", mesh);
    const containerRef = useRef(null);
    const textureCanvasRef = useRef(null);
    const [scene, setScene] = useState(null);


        useEffect(() => {
        // Create a scene and add the SkinnedMesh to it
        const objct = new THREE.Object3D();
        objct.add(mesh);
        const canvas = containerRef.current;
        const renderer = new AvatarRenderer(objct, canvas);
        setScene(renderer.scene);

        const textureCanvas = textureCanvasRef.current;
        // display mesh texture as 2D image
        const {material} = mesh;
        const {map} = material;
        let {image} = map;
        const ctx = textureCanvas.getContext('2d');
        ctx.drawImage(image, 0, 0, size, size);

        return () => {
            renderer.destroy();
        };

    }, [mesh, containerRef]);

    function DownloadGLTF(mesh) {
        console.log("Downloading", mesh);

        const exporter = new GLTFExporter();
        exporter.parse(mesh, function (gltf) {
            console.log("GLTF", JSON.stringify(gltf));
            const link = document.createElement('a');
            link.download = 'three-object.gltf';
            link.href = URL.createObjectURL(new Blob([JSON.stringify(gltf)], { type: 'application/octet-stream' }));
            link.click();
        });

        const {material} = mesh;
        console.log("Material", material);
        const mtlLoader = new MTLLoader();
        const mtlString = mtlLoader.parse(material).sourceFile;
        console.log("MTL", mtlString);
        const link = document.createElement('a');
        link.download = 'meshMaterial.mtl';
        link.href = URL.createObjectURL(new Blob([mtlString], { type: 'application/octet-stream' }));
        link.click();
    }



    return (
        <div>
            <canvas
                className={styles.canvas}
                width={size}
                height={size}
                ref={containerRef}
            />
            <canvas
                className={styles.canvas}
                width={size}
                height={size}
                ref={textureCanvasRef}
            />
            <button onClick={() => DownloadGLTF(mesh)}>Download GLTF</button>
        </div>
    );
}

const defaultPrompt = 'An albedo texture atlas of a blue shirt, albedotxt';

function extractMask(props) {
    const {mesh} = props;
    console.log("Extract Mask", mesh);
    // setting params
    const textureSize = size;
    const flipY = false;
    const hueShift = 0;

    const maskBgAlpha = 0;
    const maskFgAlpha = 1;
    const SDmaskBgAlpha = 0;
    const SDmaskFgAlpha = 0.07;
    const opaqueBgAlpha = 0.5;
    const opaqueFgAlpha = 0.5;

    // getting texture

    const {material} = mesh;
    const {map} = material;
    let {image} = map;

    // setting up context
    const {width, height} = image;
    const masked_renderer = new THREE.WebGLRenderer();
    masked_renderer.setSize(width, height)
    masked_renderer.autoClear = false;
    const SDmasked_renderer = new THREE.WebGLRenderer();
    masked_renderer.setSize(width, height)
    masked_renderer.autoClear = false;
    const text_renderer = new THREE.WebGLRenderer();
    text_renderer.setSize(width, height);
    text_renderer.autoClear = false;
    const camera = makeDefaultCamera();

    // setting up background
    const backgroundColor = 0x000000;
    const uColor = new THREE.Color(backgroundColor);

    // background scene
    const backgroundScene = new THREE.Scene();
    backgroundScene.autoUpdate = false;

    // background mesh -> fullscreen geometry
    const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

    // fullscreen material
    const backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uAlpha: {
                value: 1,
                needsUpdate: true,
            },
            uColor: {
                value: uColor,
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
    uniform float uAlpha;
    varying vec2 vUv;

    void main() {

      gl_FragColor = vec4(uColor, uAlpha);
    }
  `,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    backgroundMesh.frustumCulled = false;
    backgroundScene.add(backgroundMesh);

    // setting up foreground
    const foregroundScene = new THREE.Scene();
    foregroundScene.autoUpdate = false;

    const overrideMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap: {
                value: material.map,
                needsUpdate: true,
            },
            uAlpha: {
                value: 1,
                needsUpdate: true,
            },
            uColor: {
                value: uColor,
                needsUpdate: true,
            },
            uHueShift: {
                value: hueShift,
                needsUpdate: true,
            },
        },
        vertexShader: `\
    uniform float uFlipY;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec2 duv = (uv - 0.5) * 2.;          
      gl_Position = vec4(duv.x, duv.y, 0., 1.0);
    }
  `,
        fragmentShader: `\
    uniform sampler2D uMap;
    uniform float uAlpha;
    uniform vec3 uColor;
    uniform float uHueShift;
    varying vec2 vUv;

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
      vec4 color = texture2D(uMap, vUv);

      vec3 hsv = rgb2hsv(color.rgb);
      hsv.x += uHueShift;
      color.rgb = hsv2rgb(hsv);
      gl_FragColor = vec4(color.rgb, uAlpha);
    }
  `,
        depthTest: false,
        depthWrite: false,
        // blending: THREE.NoBlending,
        side: THREE.DoubleSide,
    });
    foregroundScene.overrideMaterial = overrideMaterial;
    // push mesh to foreground scene
    const popMeshes = pushMeshes(foregroundScene, [mesh], {
        frustumCulled: false,
    });

    //render mask
    masked_renderer.setClearColor(backgroundColor, 0);
    backgroundMaterial.uniforms.uAlpha.value = maskBgAlpha;
    backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
    overrideMaterial.uniforms.uAlpha.value = maskFgAlpha;
    overrideMaterial.uniforms.uAlpha.needsUpdate = true;
    masked_renderer.render(backgroundScene, camera);
    masked_renderer.render(foregroundScene, camera);

    SDmasked_renderer.setClearColor(backgroundColor, 0);
    backgroundMaterial.uniforms.uAlpha.value = SDmaskBgAlpha;
    backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
    overrideMaterial.uniforms.uAlpha.value = SDmaskFgAlpha;
    overrideMaterial.uniforms.uAlpha.needsUpdate = true;
    SDmasked_renderer.render(backgroundScene, camera);
    SDmasked_renderer.render(foregroundScene, camera);

    text_renderer.setClearColor(backgroundColor, 1);
    backgroundMaterial.uniforms.uAlpha.value = opaqueBgAlpha;
    backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
    overrideMaterial.uniforms.uAlpha.value = opaqueFgAlpha;
    overrideMaterial.uniforms.uAlpha.needsUpdate = true;
    text_renderer.render(backgroundScene, camera);
    text_renderer.render(foregroundScene, camera);

    // pop meshes
    popMeshes();
    // return images from texture_canvas and masked_canvas
    return {
        texture: text_renderer.domElement.toDataURL(),
        SDmask: SDmasked_renderer.domElement.toDataURL(),
        mask: masked_renderer.domElement.toDataURL(),
        width: width,
        height: height,
    }
}



function MaskedSkinnedMeshRenderer(props) {
    const maskedRef = useRef(null);
    const textureRef = useRef(null);
    const { mesh } = props;
    console.log("Masked Render", mesh);
    // setting params
    const textureSize = size;
    const flipY =  false;
    const hueShift = 0;
    const maskBgAlpha =  0;
    const maskFgAlpha = 0.07;
    const opaqueBgAlpha = 0.5;
    const opaqueFgAlpha = 0.5;

    // getting texture

    const {material} = mesh;
    const {map} = material;
    let {image} = map;

    useEffect(() => {

        // setting up canvas
        const imgRation = image.width / image.height;
        const masked_canvas = maskedRef.current;
        masked_canvas.width = 512 * imgRation;
        masked_canvas.height = 512 * imgRation;
        masked_canvas.style.cssText = `\
          background: white;
        `;
        const texture_canvas = textureRef.current;
        texture_canvas.width = 512 * imgRation;
        texture_canvas.height = 512 * imgRation;
        texture_canvas.style.cssText = `\
          background: white;
        `;
        // setting up context
        const masked_renderer = makeRenderer(masked_canvas);
        masked_renderer.autoClear = false;
        const text_renderer = makeRenderer(texture_canvas);
        text_renderer.autoClear = false;
        const camera = makeDefaultCamera();

        // setting up background
        const backgroundColor = 0x000000;
        const uColor = new THREE.Color(backgroundColor);

        // background scene
        const backgroundScene = new THREE.Scene();
        backgroundScene.autoUpdate = false;

        // background mesh -> fullscreen geometry
        const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

        // fullscreen material
        const backgroundMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uAlpha: {
                    value: 1,
                    needsUpdate: true,
                },
                uColor: {
                    value: uColor,
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
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {

          gl_FragColor = vec4(uColor, uAlpha);
        }
      `,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
        backgroundMesh.frustumCulled = false;
        backgroundScene.add(backgroundMesh);

        // setting up foreground
        const foregroundScene = new THREE.Scene();
        foregroundScene.autoUpdate = false;

        const overrideMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uMap: {
                    value: material.map,
                    needsUpdate: true,
                },
                uAlpha: {
                    value: 1,
                    needsUpdate: true,
                },
                uColor: {
                    value: uColor,
                    needsUpdate: true,
                },
                uHueShift: {
                    value: hueShift,
                    needsUpdate: true,
                },
                uFlipY: {
                  value: +flipY,
                  needsUpdate: true,
                },
            },
            vertexShader: `\
        uniform float uFlipY;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vec2 duv = (uv - 0.5) * 2.;          
          if (uFlipY > 0.) {
            duv.y *= -1.;
          }
          gl_Position = vec4(duv.x, duv.y, 0., 1.0);
        }
      `,
            fragmentShader: `\
        uniform sampler2D uMap;
        uniform float uAlpha;
        uniform vec3 uColor;
        uniform float uHueShift;
        varying vec2 vUv;

        // convert rgb to hsv in glsl
        // All components are in the range [0…1], including hue.
        vec3 rgb2hsv(vec3 c)
        {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        // convert hsv to rgb in glsl
        vec3 hsv2rgb(vec3 c)
        {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
          vec4 color = texture2D(uMap, vUv);

          // vec3 hsv = rgb2hsv(color.rgb);
          // hsv.x += uHueShift;
          // color.rgb = hsv2rgb(hsv);
          gl_FragColor = vec4(color.rgb, uAlpha);
        }
      `,
            depthTest: false,
            depthWrite: false,
            // blending: THREE.NoBlending,
            side: THREE.DoubleSide,
        });
        foregroundScene.overrideMaterial = overrideMaterial;
        // push mesh to foreground scene
        const popMeshes = pushMeshes(foregroundScene, [mesh], {
            frustumCulled: false,
        });

        //render mask
        masked_renderer.setClearColor(backgroundColor, 0);
        backgroundMaterial.uniforms.uAlpha.value = maskBgAlpha;
        backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
        overrideMaterial.uniforms.uAlpha.value = maskFgAlpha;
        overrideMaterial.uniforms.uAlpha.needsUpdate = true;
        masked_renderer.render(backgroundScene, camera);
        masked_renderer.render(foregroundScene, camera);

        text_renderer.setClearColor(backgroundColor, 1);
        backgroundMaterial.uniforms.uAlpha.value = opaqueBgAlpha;
        backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
        overrideMaterial.uniforms.uAlpha.value = opaqueFgAlpha;
        overrideMaterial.uniforms.uAlpha.needsUpdate = true;
        text_renderer.render(backgroundScene, camera);
        text_renderer.render(foregroundScene, camera);

        // pop meshes
        popMeshes();

    }, [mesh, maskedRef.current]);

    return (
        <div>
            <canvas
                className={styles.canvas}
                width={size}
                height={size}
                ref={maskedRef}
            />
            <canvas
                className={styles.canvas}
                width={size}
                height={size}
                ref={textureRef}
            />
        </div>
    );


}


const editTexture = async (mesh, {
    prompt,
    width,
    height,
    opaqueImgDataUrl,
    maskImgDataUrl,
    flipY = false,
}) => {
    const editImg = await img_inpainting({
        prompt,
        width:512,
        height:512,
        imageDataUrl: opaqueImgDataUrl,
        maskImageDataUrl: maskImgDataUrl,
    });
    console.log('edit image', editImg);
    {
        document.body.appendChild(editImg);
    }
    return editImg;
};

async function AITextureEdit(props) {
    const {prompt, mesh} = props;
    console.log("Editing Texture", prompt, mesh);
    const {texture, SDmask, mask, width, height} = extractMask({mesh: mesh});
    console.log('ok 1', {
        width,
        height,
        SDmask,
        mask,
        texture,
    });
    const editImg = await editTexture(mesh, {
        prompt,
        width:1024,
        height:1024,
        opaqueImgDataUrl:texture,
        maskImgDataUrl:SDmask,
    });

    const ogTexture = mesh.material.map.image;
    const maskImg = await loadImage(mask);
    const newTexture = new THREE.CanvasTexture(combineMasked(maskImg, ogTexture, editImg));
    console.log(newTexture)
    const geometry2 = mesh.geometry;

    const material2 = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
    });

    material2.map = newTexture
    material2.map.flipY = false;
    material2.map.encoding = THREE.sRGBEncoding;
    material2.map.needsUpdate = true;
    material2.needsUpdate = true;

    mesh.material = material2;
}

function MeshSelector(props){
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [imageAiModel, setImageAiModel] = useState('sd');
    const {model} = props;
    const meshes = getMeshes(model);
    const [selectedOption, setSelectedOption] = useState(meshes[0]);
    const options = meshes.map((mesh) => mesh.name);
    const [edited, setEdited] = useState(false);

    const handleChange = (event) => {
        const currentMesh = meshes.find((mesh) => mesh.name === event.target.value);
        setSelectedOption(currentMesh);
    };

    return (
        <div>
            <select onChange={handleChange}>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
            <input type="text" className={styles.input} value={prompt} onChange={e => {
                setPrompt(e.target.value);
            }} placeholder={prompt} />
            <select className={styles.select} value={imageAiModel} onChange={e => {
                setImageAiModel(e.target.value);
            }}>
                <option value="sd">SD</option>
                <option value="openai">OpenAI</option>
            </select>
            <button onClick={() => {AITextureEdit({prompt: prompt, mesh: selectedOption})}}>Edit</button>
            <div>
                {selectedOption && <SkinnedMesh3DRenderer mesh={selectedOption.clone()} />}
                {selectedOption && <MaskedSkinnedMeshRenderer mesh={selectedOption.clone()} />}
            </div>
            {/*if (edited) {*/}
            {/*    <div>*/}
            {/*        <AITextureEdit*/}
            {/*            prompt={prompt}*/}
            {/*            mesh={selectedOption}*/}
            {/*        />*/}
            {/*    </div>*/}
            {/*}*/}
        </div>
    );
}

const Avatar3DCanvas = ({
                           model,
                            mesh,
                           }) => {
    const canvasRef = useRef();
    const [scene, setScene] = useState(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const renderer = new AvatarRenderer(model, canvas);
        setScene(renderer.scene);

        return () => {
            renderer.destroy();
        };
    }, [model, mesh, canvasRef.current]);

    function DownloadGLTF(scene) {
        console.log("Downloading", scene);

        const exporter = new GLTFExporter();
        exporter.parse(scene, function (gltf) {
            console.log("GLTF", JSON.stringify(gltf));
            const link = document.createElement('a');
            link.download = 'three-object.gltf';
            link.href = URL.createObjectURL(new Blob([JSON.stringify(gltf)], { type: 'application/octet-stream' }));
            link.click();
        });
    }


    return (
        <div>
        <canvas
            className={styles.canvas}
            width={size}
            height={size}
            ref={canvasRef}
        />
        <button onClick={() => DownloadGLTF(scene)}>Download GLTF</button>
        </div>
    );
};

export class AvatarRenderer extends EventTarget {
    constructor(model, canvas){
        super();

        this.canvas = canvas;
        this.model = model;

        canvas.width = size;
        canvas.height = size;
        canvas.classList.add('canvas');

        // create renderer
        const renderer = makeRenderer(canvas);
        this.renderer = renderer;
        this.addEventListener('destroy', e => {
            this.renderer.dispose();
        });

        // setup 3D scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;
        this.scene = scene;

        const camera = makeDefaultCamera();
        camera.position.set(0, 0.9, -2);
        camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        camera.updateMatrixWorld();
        this.camera = camera;

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
        controls.target.z = 0;
        controls.update();
        this.controls = controls;

        const avatars = new THREE.Object3D();

        avatars.add(model);
        model.updateMatrixWorld();
        scene.add(avatars);
        this.avatars = avatars;
        this.animate()
    }

    animate() {
        const _startLoop = () => {
            let frame;
            const _loop = () => {
                frame = requestAnimationFrame(_loop);
                this.renderer.render(this.scene, this.camera);
            };
            _loop();

            this.addEventListener('destroy', e => {
                cancelAnimationFrame(frame);
            });
        };
        _startLoop();
    }

    destroy() {
        console.log('destroy PanelRenderer', this);

        this.dispatchEvent(new MessageEvent('destroy'));
    }
};


export const AvatarRendererComponent = ({
                                                  model,
                                              }) => {
    console.log('AvatarRendererComponent model', model);



    return (

        <div className={styles.AvatarGenerator}>

            <Avatar3DCanvas model={model}/>
            <MeshSelector model={model}/>
        </div>

    );
}


