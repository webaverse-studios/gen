import {applyMask, applyNoise} from "../utils/model-utils.js";
import * as THREE from "three";
import {Vector3} from "three";
import {makeDefaultCamera, makeRenderer, pushMeshes} from "../zine/zine-utils.js";
import {new_img_inpainting, upscale} from "../clients/sd-image-client.js";


const base_camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3);

// Black image used to update mask while rotating around the avatar
const black_image = new ImageData(1, 1);
// Set all the pixels in the ImageData object to black
const data = black_image.data;
data[0] = 0; // Red
data[1] = 0; // Green
data[2] = 0; // Blue
data[3] = 255; // Alpha


function extractUVMap({mesh}) {
    // projection mapping of texture onto mesh and extracting the uv map
    const {material} = mesh;

    const [width, height] = [512, 512];
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const renderer = new THREE.WebGLRenderer(canvas);
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
        vertexShader: `\
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0., 1.0);
    }
  `,
        fragmentShader: `\

    void main() {

      gl_FragColor = vec4(0,0,0,0);
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
            uBGMap: {value: material.map},
        },
        vertexShader: `
       
          varying vec2 vUv;          
          void main() {
              vUv = uv;
              vec2 duv = (uv - 0.5) * 2.;          
              gl_Position = vec4(duv.x, duv.y, 0., 1.0);
          }
          
          `,
        fragmentShader: `
        uniform sampler2D uBGMap;
        
        varying vec2 vUv;
        
        void main() {
          vec4 outColor = texture2D(uBGMap, vUv);

          // this makes sure we don't render also the back of the object
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
    return img;

}


// create 4 cameras for front, left, right and back views
const views = [
    {prompt: "front view of ", view: 'front', mask_range: 0.1, texture_range: -.1},
    // {prompt: "front right view of ", view: "front-right"},
    {prompt: "side view of ", view: "right", mask_range: 0.6, texture_range: 0.4},
    // {prompt: "back right view of ", view: "back-right"},
    {prompt: "back view of ", view: 'back', mask_range: 0.1, texture_range: -0.1},
    {prompt: "side view of ", view: 'left', mask_range: 0.6, texture_range: 0.4},
    // {prompt: "back left view of ", view: 'back-left'},
    // {prompt: "front left view of ", view: "front-left"},

    {prompt: "bottom up view of ", view: 'bottom', mask_range: 0, texture_range: 0},
    {prompt: "top down view of ", view: "top", mask_range: 0, texture_range: 0},
];

const symmetrical_views = [
    {prompt: "front view of ", view: 'front', mask_range: 0.2, texture_range: -.1},
    {prompt: "side view of ", view: "right", mask_range: 0.6, texture_range: 0.4},
    {prompt: "back view of ", view: 'back', mask_range: 0.2, texture_range: -.1},
    {prompt: "bottom up view of ", view: 'bottom', mask_range: 0, texture_range: 0},
    {prompt: "top down view of ", view: "top", mask_range: 0, texture_range: 0},

]

// function dilating image given kernel size
function dilateImage(image, kernelSize) {
    // Create a new scene and camera
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    const camera = makeDefaultCamera();

    // Create a new texture from the image
    var img = new THREE.CanvasTexture(image);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            img: { type: "t", value: img },
            kernelSize: { type: "f", value: kernelSize },
            width: { type: "f", value: image.width },
            height: { type: "f", value: image.height },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0., 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D img;
            uniform float kernelSize;
            uniform float width;
            uniform float height;
            varying vec2 vUv;

            vec4 dilate(sampler2D tex, vec2 uv, float kernelSize) {
                vec4 maxValue = vec4(0.0);
                for (float y = -kernelSize/2.0; y <= kernelSize/2.0; y += 1.0) {
                    for (float x = -kernelSize/2.0; x <= kernelSize/2.0; x += 1.0) {
                        vec4 value = texture2D(tex, uv + vec2(x, y) / vec2(width, height));
                        maxValue = max(maxValue, value);
                    }
                }
                return maxValue;
            }

            void main() {
                gl_FragColor = dilate(img, vUv, kernelSize);
            }
        `,

        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneBufferGeometry(2, 2);


    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    // Render the scene
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const dilation_renderer = new THREE.WebGLRenderer(canvas);
    dilation_renderer.setSize(512, 512)
    dilation_renderer.render(scene, camera);
    return dilation_renderer.domElement;
}

// function returning the xor of two images used to create
function getXOROfImages(img1, img2) {
    // Create a new canvas element to draw the XOR of the two images
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    const camera = makeDefaultCamera();
    const material = new THREE.ShaderMaterial({
        uniforms: {
            img1: { type: "t", value: new THREE.CanvasTexture(img1) },
            img2: { type: "t", value: new THREE.CanvasTexture(img2) },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0., 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D img1;
            uniform sampler2D img2;
            varying vec2 vUv;

            void main() {
                vec4 color1 = texture2D(img1, vUv);
                vec4 color2 = texture2D(img2, vUv);
                float alpha = (abs(color1.r - color2.r) + abs(color1.g - color2.g) + abs(color1.b - color2.b))/3.;
                gl_FragColor = vec4(abs(color1.r - color2.r), abs(color1.g - color2.g), abs(color1.b - color2.b),alpha);
            }
        `,

        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneBufferGeometry(2, 2);


    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    // Render the scene
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const xor_renderer = new THREE.WebGLRenderer(canvas);
    xor_renderer.setSize(512, 512)
    xor_renderer.render(scene, camera);
    return xor_renderer.domElement;
}

// remove the first pixel along the edge (black to colour transition)
function erodeImage(image, kernelSize){
    // Create a new scene and camera
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    const camera = makeDefaultCamera();

    // Create a new texture from the image
    var img = new THREE.CanvasTexture(image);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            img: { type: "t", value: img },
            kernelSize: { type: "f", value: kernelSize },
            width: { type: "f", value: image.width },
            height: { type: "f", value: image.height },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0., 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D img;
            uniform float kernelSize;
            uniform float width;
            uniform float height;
            varying vec2 vUv;

            vec4 dilate(sampler2D tex, vec2 uv, float kernelSize) {
                vec4 minValue = vec4(1.0);
                for (float y = -kernelSize/2.0; y <= kernelSize/2.0; y += 1.0) {
                    for (float x = -kernelSize/2.0; x <= kernelSize/2.0; x += 1.0) {
                        vec4 value = texture2D(tex, uv + vec2(x, y) / vec2(width, height));
                        minValue = min(minValue, value);
                    }
                }
                return minValue;
            }

            void main() {
                gl_FragColor = dilate(img, vUv, kernelSize);
            }
        `,

        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneBufferGeometry(2, 2);


    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    // Render the scene
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const erode_renderer = new THREE.WebGLRenderer(canvas);
    erode_renderer.setSize(512, 512)
    erode_renderer.render(scene, camera);
    return erode_renderer.domElement;
}

function maskImage(img, mask){
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(img, 0, 0);
    return canvas;
}
function masked_dilateImage(image, mask,kernelSize) {
    // Create a new scene and camera
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    const camera = makeDefaultCamera();

    // Create a new texture from the image
    const material = new THREE.ShaderMaterial({
        uniforms: {
            img: { type: "t", value: new THREE.CanvasTexture(image) },
            mask: { type: "t", value: new THREE.CanvasTexture(mask) },
            kernelSize: { type: "f", value: kernelSize },
            width: { type: "f", value: image.width },
            height: { type: "f", value: image.height },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0., 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D img;
            uniform sampler2D mask;
            uniform float kernelSize;
            uniform float width;
            uniform float height;
            varying vec2 vUv;

            vec4 dilate(sampler2D tex, vec2 uv, float kernelSize) {
                vec4 maxValue = vec4(0.0);
                for (float y = -kernelSize/2.0; y <= kernelSize/2.0; y += 1.0) {
                    for (float x = -kernelSize/2.0; x <= kernelSize/2.0; x += 1.0) {
                        vec4 value = texture2D(tex, uv + vec2(x, y) / vec2(width, height));
                        maxValue = max(maxValue, value);
                    }
                }
                return maxValue;
            }

            void main() {
                vec4 mask_value = texture2D(mask, vUv);
                float mag = ((mask_value.r + mask_value.g + mask_value.b) * mask_value.a)/3.;
                gl_FragColor = mask_value;
              
                if (mag > 0.) {
                    gl_FragColor = dilate(img, vUv, kernelSize);
                } else {
                    gl_FragColor = texture2D(img, vUv);
                }   
            }
        `,

        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneBufferGeometry(2, 2);


    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    // Render the scene
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const dilation_renderer = new THREE.WebGLRenderer(canvas);
    dilation_renderer.setClearColor(0x000000, 1);
    dilation_renderer.setSize(512, 512)
    dilation_renderer.render(scene, camera);
    return dilation_renderer.domElement;
}

function compositeImages(img1, img2, mask) {
    // Create a new canvas element to draw the union of the two images
    var compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = img1.width;
    compositeCanvas.height = img1.height;
    var compositeCtx = compositeCanvas.getContext("2d");
    var compositeImageData = compositeCtx.createImageData(img1.width, img1.height);

    // Draw the two images on the canvas element
    const img1Canvas = document.createElement("canvas");
    img1Canvas.width = img1.width;
    img1Canvas.height = img1.height;
    const img1Ctx = img1Canvas.getContext("2d");
    img1Ctx.drawImage(img1, 0, 0);

    const img2Canvas = document.createElement("canvas");
    img2Canvas.width = img1.width;
    img2Canvas.height = img1.height;
    const img2Ctx = img2Canvas.getContext("2d");
    img2Ctx.drawImage(img2, 0, 0);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = img1.width;
    maskCanvas.height = img1.height;
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.drawImage(mask, 0, 0);

    // Get the image data for the two images
    var imageData1 = img1Ctx.getImageData(0, 0, img1.width, img1.height);
    var imageData2 = img2Ctx.getImageData(0, 0, img2.width, img2.height);
    var maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);

    // Get the image data for the union image

    // Iterate over the pixels of the union image
    for (var i = 0; i < compositeImageData.data.length; i += 4) {
        // If either image has a white pixel at this position, set the pixel in the union image to white
        if (maskData.data[i] === 255 && maskData.data[i + 1] === 255 && maskData.data[i + 2] === 255) {
            compositeImageData.data[i] = imageData1.data[i];
            compositeImageData.data[i + 1] = imageData1.data[i + 1];
            compositeImageData.data[i + 2] = imageData1.data[i + 2];
            compositeImageData.data[i + 3] = imageData1.data[i + 3];
        } else {
            compositeImageData.data[i] = imageData2.data[i];
            compositeImageData.data[i + 1] = imageData2.data[i + 1];
            compositeImageData.data[i + 2] = imageData2.data[i + 2];
            compositeImageData.data[i + 3] = imageData2.data[i + 3];
        }
    }

    // Draw the union image on the canvas element
    compositeCtx.putImageData(compositeImageData, 0, 0);

    return compositeCanvas;
}


function overlayImages(img1,img2){
    const canvas = document.createElement("canvas");
    canvas.width = img1.width;
    canvas.height = img1.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img1, 0, 0);
    // ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(img2, 0, 0);
    return canvas;
}
// pad texture based on mask
function padTexture({texture, mask}) {
    // dilate mask
    const dilated_mask = dilateImage(mask, 4);
    const eroded_mask = erodeImage(mask, 4);
    const edge = getXOROfImages(eroded_mask, dilated_mask);

    // display dilated_texture using edge as a mask, where the value of edge is white display the colour of dilated_texture
    // otherwise display black

    const removed_noise = maskImage(texture, eroded_mask)
    const padding = dilateImage(removed_noise, 5);
    const padded_image = compositeImages(removed_noise, padding, eroded_mask);
    return padded_image;
}
// function render 3D mesh to canvas from a specific view
const Avatar3DCanvas = ({
                            renderer, model, camera, bg_color = 0xffffff
                        }) => {
    // const canvas = document.createElement('canvas');
    // canvas.width = 512;
    // canvas.height = 512;
    // const renderer = makeRenderer(canvas);
    renderer.setClearColor(bg_color, 1);
    const scene = new THREE.Scene();
    scene.autoUpdate = false;

    const avatars = new THREE.Object3D();

    avatars.add(model);
    model.updateMatrixWorld();
    scene.add(avatars);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL();
}

function projectTextureMasked({mesh, masked_mesh, texture, proj_point, renderer, projection_range = 0.3, srgb = true}) {
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
            uMap: {value: material.map},
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
            uMap: {value: new THREE.CanvasTexture(texture)},
            uBGMap: {value: material.map},
            uMaskMap: {value: masked_mesh.material.map},
            color2: {value: new THREE.Color(color2)},
            color: {value: new THREE.Color(color)},
            viewMatrixCamera: {type: 'm4', value: viewMatrixCamera},
            projectionMatrixCamera: {type: 'm4', value: projectionMatrixCamera},
            modelMatrixCamera: {type: 'mat4', value: modelMatrixCamera},
            // we will set this later when we will have positioned the object
            savedModelMatrix: {type: 'mat4', value: new THREE.Matrix4()},
            projPosition: {type: 'v3', value: projPosition},
            dot_min: {value: projection_range},
            srgb: {value: srgb},
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
        uniform float dot_min;
        uniform bool srgb;
        

        varying vec3 vNormal;
        varying vec4 vWorldPosition;
        varying vec4 vTexCoords;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;

          vec4 outColor = texture2D(uMap, uv);
          if (srgb) {
            outColor.r = pow(outColor.r, 2.2);
            outColor.g = pow(outColor.g, 2.2);
            outColor.b = pow(outColor.b, 2.2);   
          }

          // this makes sure we don't render also the back of the object
          vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
          float dotProduct = dot(vNormal, projectorDirection);
          vec4 mask = texture2D(uMaskMap, vUv);
          float mag = (mask.r + mask.g + mask.b) / 3.;
          
          if (dotProduct < dot_min || mag < 1.) {
            outColor = texture2D(uBGMap, vUv);
            // if (dotProduct < 0.3 && dotProduct > 0.) {
            //   vec4 bg = texture2D(uBGMap, vUv);
            //   vec4 fg = texture2D(uMap, vUv);
            //   outColor = mix(bg, fg, dotProduct);
            //
            // }
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
    return img;
}


function projectTexture({mesh, texture, proj_point, renderer, projection_range = 0.3}) {
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
            uMap: {value: material.map},
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
            uMap: {value: new THREE.CanvasTexture(texture)},
            uBGMap: {value: material.map},
            color2: {value: new THREE.Color(color2)},
            color: {value: new THREE.Color(color)},
            viewMatrixCamera: {type: 'm4', value: viewMatrixCamera},
            projectionMatrixCamera: {type: 'm4', value: projectionMatrixCamera},
            modelMatrixCamera: {type: 'mat4', value: modelMatrixCamera},
            // we will set this later when we will have positioned the object
            savedModelMatrix: {type: 'mat4', value: new THREE.Matrix4()},
            projPosition: {type: 'v3', value: projPosition},
            dot_min: {value: projection_range},
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
        uniform float dot_min;
        

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
          if (dotProduct < dot_min) {
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
        return {x: center.x, y: center.y + Math.max(d1, d2) * 2, z: center.z};
    }
    if (view === 'left') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: Math.max(d1, d2) * 2, y: center.y, z: center.z};
    }
    if (view === 'front') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: center.x, y: center.y, z: -Math.max(d1, d2) * 2};
    }
    if (view === 'bottom') {
        const p1 = new THREE.Vector3(min.x, max.y, min.z);
        const p2 = new THREE.Vector3(max.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: center.x, y: center.y - Math.max(d1, d2) * 2, z: center.z};
    }
    if (view === 'right') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: -Math.max(d1, d2) * 2, y: center.y, z: center.z};
    }
    if (view === 'back') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: center.x, y: center.y, z: Math.max(d1, d2) * 2};
    }
    if (view === 'front-right') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: -Math.max(d1, d2) * 2, y: center.y, z: -Math.max(d1, d2) * 2};
    }
    if (view === 'front-left') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: Math.max(d1, d2) * 2, y: center.y, z: -Math.max(d1, d2) * 2};
    }
    if (view === 'back-right') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(min.x, max.y, min.z);
        const p3 = new THREE.Vector3(min.x, min.y, max.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: -Math.max(d1, d2) * 2, y: center.y, z: Math.max(d1, d2) * 2};
    }
    if (view === 'back-left') {
        const p1 = new THREE.Vector3(min.x, min.y, min.z);
        const p2 = new THREE.Vector3(max.x, min.y, min.z);
        const p3 = new THREE.Vector3(min.x, max.y, min.z);
        const d1 = p1.distanceTo(p2);
        const d2 = p1.distanceTo(p3);
        return {x: Math.max(d1, d2) * 2, y: center.y, z: Math.max(d1, d2) * 2};
    }


}

function getUVMap(mesh){
    // projection mapping of texture onto mesh and extracting the uv map
    const {material} = mesh;
    const {map} = material;
    const {image} = map;
    const {width, height} = image;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer(canvas);
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
            uvMap: {value: map},
        },
        vertexShader: `\
    varying vec2 vUv;

    void main() {
      vUv = uv;
     
      gl_Position = vec4(position.xy, 0., 1.0);
    }
  `,
        fragmentShader: `\
    uniform sampler2D uvMap;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(uvMap, vUv);
    }
  `,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    backgroundMesh.frustumCulled = false;
    backgroundScene.add(backgroundMesh);
    renderer.render(backgroundScene, camera);
    const img = renderer.domElement;
    renderer.resetState();
    return img;

}
function upscaleImage(image, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas;
}

export async function editTexture(mesh, prompt, symmetrical) {
    const renderer= new THREE.WebGLRenderer({
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
    const center = new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const og_uv = getUVMap(mesh);
    console.log("OG", og_uv);
    mesh.material.map = new THREE.CanvasTexture(applyNoise(mesh));

    const mask_material = mesh.material.clone();
    const mask_image = applyMask(mesh);

    mask_material.map = new THREE.CanvasTexture(mask_image);
    mask_material.map.needsUpdate = true;
    mask_material.needsUpdate = true;

    const mask_geo = mesh.geometry;
    const adaptive_mask_mesh = new THREE.Mesh(mask_geo, mask_material.clone());
    adaptive_mask_mesh.frustumCulled = false;

    const mask_mesh = new THREE.Mesh(mask_geo, mask_material.clone());
    mask_mesh.frustumCulled = false;

    const seed = Math.floor(Math.random() * 1000000);
    let uv_img = null;
    if (symmetrical) {
        for (const view of symmetrical_views) {
            const cam_pos = getLongestSide({min, max, center, view: view.view});
            base_camera.position.set(cam_pos.x, cam_pos.y, cam_pos.z);
            base_camera.lookAt(center.x, center.y, center.z);
            base_camera.updateMatrixWorld();
            const imgData = Avatar3DCanvas({renderer, model: mesh, camera: base_camera, bg_color: 0x000000});
            const maskData = Avatar3DCanvas({
                renderer,
                model: adaptive_mask_mesh,
                camera: base_camera,
                bg_color: 0x000000
            });

            const gen_img = await new_img_inpainting({
                prompt: view.prompt + prompt,
                width: 512,
                height: 512,
                ImgDataUrl: imgData,
                maskDataUrl: maskData,
                seed: seed,
            });
            uv_img = projectTextureMasked({
                mesh: mesh,
                masked_mesh: adaptive_mask_mesh,
                texture: gen_img,
                proj_point: base_camera,
                renderer: projection_renderer,
                projection_range: view.texture_range
            })
            const texture = new THREE.CanvasTexture(uv_img);
            mesh.material.map = texture;
            adaptive_mask_mesh.material.map = new THREE.CanvasTexture(projectTexture({
                mesh: adaptive_mask_mesh,
                texture: black_image,
                proj_point: base_camera,
                renderer: mask_renderer,
                projection_range: view.mask_range
            }));

            if (view.view === 'right'){
                const cam_pos = getLongestSide({min, max, center, view: "left"});
                base_camera.position.set(cam_pos.x, cam_pos.y, cam_pos.z);
                base_camera.lookAt(center.x, center.y, center.z);
                base_camera.updateMatrixWorld();
                const canvas = document.createElement("canvas");
                canvas.width = gen_img.width;
                canvas.height = gen_img.height;
                const ctx = canvas.getContext("2d");
                ctx.scale(-1, 1);
                ctx.drawImage(gen_img, -gen_img.width, 0, gen_img.width, gen_img.height);
                uv_img = projectTextureMasked({
                    mesh: mesh,
                    masked_mesh: adaptive_mask_mesh,
                    texture: canvas,
                    proj_point: base_camera,
                    renderer: projection_renderer,
                    projection_range: view.texture_range
                })
                const texture = new THREE.CanvasTexture(uv_img);
                mesh.material.map = texture;
                adaptive_mask_mesh.material.map = new THREE.CanvasTexture(projectTexture({
                    mesh: adaptive_mask_mesh,
                    texture: black_image,
                    proj_point: base_camera,
                    renderer: mask_renderer,
                    projection_range: view.mask_range
                }));

            }


        }
    } else {
        // iterate over views and call project Texture with each view
        for (const view of views) {
            const cam_pos = getLongestSide({min, max, center, view: view.view});
            base_camera.position.set(cam_pos.x, cam_pos.y, cam_pos.z);
            base_camera.lookAt(center.x, center.y, center.z);
            base_camera.updateMatrixWorld();
            const imgData = Avatar3DCanvas({renderer, model: mesh, camera: base_camera, bg_color: 0x000000});
            const maskData = Avatar3DCanvas({
                renderer,
                model: adaptive_mask_mesh,
                camera: base_camera,
                bg_color: 0x000000
            });

            const gen_img = await new_img_inpainting({
                prompt: view.prompt + prompt,
                width: 512,
                height: 512,
                ImgDataUrl: imgData,
                maskDataUrl: maskData,
                seed: seed,
            });
            uv_img = projectTextureMasked({
                mesh: mesh,
                masked_mesh: adaptive_mask_mesh,
                texture: gen_img,
                proj_point: base_camera,
                renderer: projection_renderer,
                projection_range: view.texture_range
            })
            const texture = new THREE.CanvasTexture(uv_img);
            mesh.material.map = texture.clone();
            adaptive_mask_mesh.material.map = new THREE.CanvasTexture(projectTexture({
                mesh: adaptive_mask_mesh,
                texture: black_image,
                proj_point: base_camera,
                renderer: mask_renderer,
                projection_range: view.mask_range
            }));

        }
    }
    const uv = extractUVMap({mesh: mesh});
    const padded_mask = padTexture({texture: uv, mask:mask_image});
    const super_res = await upscale({width:og_uv.width, height:og_uv.height, ImgDataUrl: padded_mask.toDataURL()});


    const upscaled_mask = upscaleImage(padded_mask, super_res.width, super_res.height)
    const masked_super_res = maskImage(super_res, upscaled_mask);
    const combined = overlayImages(og_uv, masked_super_res);

    const texture = new THREE.CanvasTexture(combined);
    mesh.material.map = texture.clone();
    console.log("DONE");


}