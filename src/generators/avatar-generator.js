import {applyMask, applyNoise} from "../utils/model-utils.js";
import * as THREE from "three";
import {Vector3} from "three";
import {makeDefaultCamera, makeRenderer, pushMeshes} from "../zine/zine-utils.js";
import {new_img_inpainting} from "../clients/sd-image-client.js";


const base_camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3);

// Black image used to update mask while rotating around the avatar
const black_image = new ImageData(1, 1);
// Set all the pixels in the ImageData object to black
const data = black_image.data;
data[0] = 0; // Red
data[1] = 0; // Green
data[2] = 0; // Blue
data[3] = 255; // Alpha







// create 4 cameras for front, left, right and back views
const views = [
    { prompt: "front view of ", view: 'front'},
    {prompt: "back view of ", view: 'back'},
    {prompt: "side view of ", view: 'left'},
    {prompt: "side view of ", view: "right"},
    {prompt: "bottom up view of ", view: 'bottom'},
    {prompt: "top down view of ", view: "top"},
];

// function render 3D mesh to canvas from a specific view

const Avatar3DCanvas = ({
                            renderer, model, camera, bg_color=0xffffff
                        }) => {
    // const canvas = document.createElement('canvas');
    // canvas.width = 512;
    // canvas.height = 512;
    // const renderer = makeRenderer(canvas);
    renderer.setClearColor(bg_color, 1);
    const scene = new THREE.Scene();
    scene.autoUpdate = false;

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 2, 3);
    light.updateMatrixWorld();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const avatars = new THREE.Object3D();

    avatars.add(model);
    model.updateMatrixWorld();
    scene.add(avatars);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL();
}

function projectTextureMasked({mesh, masked_mesh, texture, proj_point, renderer}) {
    // projection mapping of texture onto mesh and extracting the uv map
    const {material} = mesh;
    // get the matrices from the proj_point so they're fixed in proj_point's original position
    const viewMatrixCamera = proj_point.matrixWorldInverse.clone()
    const projectionMatrixCamera = proj_point.projectionMatrix.clone()
    const modelMatrixCamera = proj_point.matrixWorld.clone()

    const projPosition = proj_point.position.clone()

    const [width, height] = [512, 512];
    renderer.setClearColor(0xff8e00, 1);
    renderer.setSize(width, height)
    renderer.autoClear = false;

    const camera = makeDefaultCamera();

    // background scene
    const backgroundScene = new THREE.Scene();
    backgroundScene.autoUpdate = false;

    // background mesh -> fullscreen geometry
    const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

    // fullscreen material
    const backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap : { value: material.map },
            uAlpha: {
                value: 1,
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
    uniform sampler2D uMap;
    uniform float uAlpha;
    varying vec2 vUv;

    void main() {

      gl_FragColor = texture2D(uMap, vUv);
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

    const color = 0xfeff00
    const color2 = 0x00ff00

    const overrideMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: new THREE.CanvasTexture(texture)},
            uBGMap: { value: material.map },
            uMaskMap: { value: masked_mesh.material.map },
            color2: {value: new THREE.Color(color2)},
            color: {value: new THREE.Color(color)},
            viewMatrixCamera: {type: 'm4', value: viewMatrixCamera},
            projectionMatrixCamera: {type: 'm4', value: projectionMatrixCamera},
            modelMatrixCamera: {type: 'mat4', value: modelMatrixCamera},
            // we will set this later when we will have positioned the object
            savedModelMatrix: {type: 'mat4', value: new THREE.Matrix4()},
            projPosition: {type: 'v3', value: projPosition},
        },
        vertexShader: `
          uniform mat4 savedModelMatrix;
          uniform mat4 viewMatrixCamera;
          uniform mat4 projectionMatrixCamera;
          uniform mat4 modelMatrixCamera;
         
          varying vec4 vWorldPosition;
          varying vec3 vNormal;
          varying vec4 vTexCoords;
          varying vec2 vUv;
          
          
          void main() {
              vUv = uv;
              vec2 duv = (uv - 0.5) * 2.;          
              gl_Position = vec4(duv.x, duv.y, 0., 1.0);
              vNormal = mat3(savedModelMatrix) * normal;
              vWorldPosition = savedModelMatrix * vec4(position, 1.0);
              vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
          }
          
          `,
        fragmentShader: `
        uniform vec3 color;
        uniform vec3 color2;
        uniform sampler2D uMap;
        uniform sampler2D uBGMap;
        uniform sampler2D uMaskMap;
        uniform vec3 projPosition;
        

        varying vec3 vNormal;
        varying vec4 vWorldPosition;
        varying vec4 vTexCoords;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;

          vec4 outColor = texture2D(uMap, uv);

          // this makes sure we don't render also the back of the object
          vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
          float dotProduct = dot(vNormal, projectorDirection);
          vec4 mask = texture2D(uMaskMap, vUv);
          float mag = (mask.r + mask.g + mask.b) / 3.;
          
          if (dotProduct < 0.5 || mag == 0.0) {
            outColor = texture2D(uBGMap, vUv);
          }

          gl_FragColor = outColor;
        }`,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
// vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;
    //
    // vec4 outColor = texture2D(uMap, uv);
    //
    // // this makes sure we don't render also the back of the object
    // vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
    // float dotProduct = dot(vNormal, projectorDirection);
    // if (dotProduct < 0.0) {
    //   outColor = texture2D(uBGMap, vUv);
    // }

    // vec4 mask = texture2D(uMaskMap, vUv);
    // float mag = (mask.r + mask.g + mask.b) / 3.;
    // if (dotProduct < 0. || mag == 0.) {
    //   outColor = texture2D(uBGMap, vUv);
    // }
    // gl_FragColor = outColor;
    foregroundScene.overrideMaterial = overrideMaterial;

    // push mesh to foreground scene
    const popMeshes = pushMeshes(foregroundScene, [mesh], {
        frustumCulled: false,
    });

    renderer.render(backgroundScene, camera);
    renderer.render(foregroundScene, camera);
    // pop meshes
    popMeshes();
    const img = renderer.domElement;
    renderer.resetState();
    return img;
}



function projectTexture({mesh, texture, proj_point, renderer}) {
    // projection mapping of texture onto mesh and extracting the uv map
    const {material} = mesh;
    // get the matrices from the proj_point so they're fixed in proj_point's original position
    const viewMatrixCamera = proj_point.matrixWorldInverse.clone()
    const projectionMatrixCamera = proj_point.projectionMatrix.clone()
    const modelMatrixCamera = proj_point.matrixWorld.clone()

    const projPosition = proj_point.position.clone()

    const [width, height] = [512, 512];
    renderer.setClearColor(0xff8e00, 1);
    renderer.setSize(width, height)
    renderer.autoClear = false;

    const camera = makeDefaultCamera();

    // background scene
    const backgroundScene = new THREE.Scene();
    backgroundScene.autoUpdate = false;

    // background mesh -> fullscreen geometry
    const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

    // fullscreen material
    const backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap : { value: material.map },
            uAlpha: {
                value: 1,
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
    uniform sampler2D uMap;
    uniform float uAlpha;
    varying vec2 vUv;

    void main() {

      gl_FragColor = texture2D(uMap, vUv);
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

    const color = 0xfeff00
    const color2 = 0x00ff00

    const overrideMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: new THREE.CanvasTexture(texture)},
            uBGMap: { value: material.map },
            color2: {value: new THREE.Color(color2)},
            color: {value: new THREE.Color(color)},
            viewMatrixCamera: {type: 'm4', value: viewMatrixCamera},
            projectionMatrixCamera: {type: 'm4', value: projectionMatrixCamera},
            modelMatrixCamera: {type: 'mat4', value: modelMatrixCamera},
            // we will set this later when we will have positioned the object
            savedModelMatrix: {type: 'mat4', value: new THREE.Matrix4()},
            projPosition: {type: 'v3', value: projPosition},
        },
        vertexShader: `
          uniform mat4 savedModelMatrix;
          uniform mat4 viewMatrixCamera;
          uniform mat4 projectionMatrixCamera;
          uniform mat4 modelMatrixCamera;
         
          varying vec4 vWorldPosition;
          varying vec3 vNormal;
          varying vec4 vTexCoords;
          varying vec2 vUv;
          
          
          void main() {
              vUv = uv;
              vec2 duv = (uv - 0.5) * 2.;          
              gl_Position = vec4(duv.x, duv.y, 0., 1.0);
              vNormal = mat3(savedModelMatrix) * normal;
              vWorldPosition = savedModelMatrix * vec4(position, 1.0);
              vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
          }
          
          `,
        fragmentShader: `
        uniform vec3 color;
        uniform vec3 color2;
        uniform sampler2D uMap;
        uniform sampler2D uBGMap;
        uniform vec3 projPosition;
        

        varying vec3 vNormal;
        varying vec4 vWorldPosition;
        varying vec4 vTexCoords;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;

          vec4 outColor = texture2D(uMap, uv);

          // this makes sure we don't render also the back of the object
          vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
          float dotProduct = dot(vNormal, projectorDirection);
          if (dotProduct < 0.5) {
            outColor = texture2D(uBGMap, vUv);
          }

          gl_FragColor = outColor;
        }`,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    foregroundScene.overrideMaterial = overrideMaterial;

    // push mesh to foreground scene
    const popMeshes = pushMeshes(foregroundScene, [mesh], {
        frustumCulled: false,
    });

    renderer.render(backgroundScene, camera);
    renderer.render(foregroundScene, camera);
    // pop meshes
    popMeshes();
    const img = renderer.domElement;
    renderer.resetState();
    return renderer.domElement;
}

// function calculating the longest side of the bounding box based on view top, side, front
function getLongestSide({min, max, center, view}) {
    if (view === 'top') {
        const p1 = new THREE.Vector3(min.x, max.y, min.z);
        const p2 = new THREE.Vector3(max.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:center.x, y:-Math.max(d1, d2)* 2, z:center.z};
    }
    if (view === 'left') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:Math.max(d1, d2)* 2, y:center.y, z:center.z};
    }
    if (view === 'front') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:center.x, y:center.y, z:-Math.max(d1, d2)* 2};
    }
    if (view === 'bottom') {
        const p1 = new THREE.Vector3(min.x, max.y, min.z);
        const p2 = new THREE.Vector3(max.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:center.x, y:Math.max(d1, d2)* 2, z:center.z};
    }
    if (view === 'right') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:-Math.max(d1, d2)* 2, y:center.y, z:center.z};
    }
    if (view === 'back') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x:center.x, y:center.y, z:Math.max(d1, d2)* 2};
    }

}

export async function editTexture(mesh, prompt) {
    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
    });
    renderer.setSize(512, 512);
    renderer.sortObjects = false;
    renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const projection_renderer = new THREE.WebGLRenderer()
    const mask_renderer = new THREE.WebGLRenderer()

    // copy mesh and set texture to noise
    const min = mesh.geometry.boundingBox.min;
    const max = mesh.geometry.boundingBox.max;
    const center = new Vector3((min.x+max.x)/2,(min.y+max.y)/2, (min.z+max.z)/2);
    mesh.material.map = new THREE.CanvasTexture(applyNoise(mesh));

    const mask_material = mesh.material.clone();
    mask_material.map = new THREE.CanvasTexture(applyMask(mesh));
    mask_material.map.needsUpdate = true;
    mask_material.needsUpdate = true;

    const mask_geo = mesh.geometry;
    const mask_mesh = new THREE.Mesh(mask_geo, mask_material);
    mask_mesh.frustumCulled = false;

    const seed =  Math.floor(Math.random() * 1000000);

    // iterate over views and call project Texture with each view
    for(const view of views) {
        const cam_pos = getLongestSide({min, max, center, view:view.view});
        base_camera.position.set(cam_pos.x, cam_pos.y, cam_pos.z);
        base_camera.lookAt(center.x, center.y, center.z);
        base_camera.updateMatrixWorld();
        const imgData = Avatar3DCanvas({renderer, model:mesh, camera:base_camera, bg_color:0x000000});
        const maskData = Avatar3DCanvas({renderer, model:mask_mesh, camera:base_camera, bg_color:0x000000});
        const gen_img = await new_img_inpainting({
                                prompt: view.prompt + prompt,
                                width:512,
                                height:512,
                                ImgDataUrl: imgData,
                                maskDataUrl: maskData,
                                seed: seed,
                            });
        // document.body.appendChild(gen_img);
        mesh.material.map = new THREE.CanvasTexture(projectTextureMasked({mesh: mesh, masked_mesh:mask_mesh, texture: gen_img, proj_point: base_camera, renderer:projection_renderer})); //projectTexture({mesh: mesh, texture: gen_img, proj_point: base_camera}));

        mask_mesh.material.map = new THREE.CanvasTexture(projectTexture({mesh: mask_mesh, texture: black_image, proj_point: base_camera, renderer:mask_renderer}));

        // destroy renderers
        renderer.dispose();
        projection_renderer.dispose();
        mask_renderer.dispose();
    }
}