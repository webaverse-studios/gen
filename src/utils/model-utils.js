import * as THREE from 'three';
import alea from './alea.js';
import {
  makeRenderer,
  makeGltfLoader,
  pushMeshes,
  makeDefaultCamera,
} from '../zine/zine-utils.js';
import {
  blob2img,
  canvas2blob,
  image2DataUrl,
  img2canvas,
} from './convert-utils.js';
import {
  generateTextureMaps,
} from '../clients/material-map-client.js';
import {
  img2img,
} from '../clients/sd-image-client.js';
import {
  colors,
} from '../constants/detectron-colors.js';
//

const defaultTextureSize = 1024;

//

// resize the image to be contained within the w, h. keep the aspect ratio.
const resizeImageToFit = (img, w, h) => {
  let newWidth = w;
  let newHeight = h;
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;
  if (imgRatio < canvasRatio) {
    newWidth = img.width * (h / img.height);
  } else {
    newHeight = img.height * (w / img.width);
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, newWidth, newHeight);
  return canvas;
};

//

const makeSeedCanvas = () => {
  const imgCanvas = createSeedImage(
    1024, // w
    1024, // h
    400, // rw
    400, // rh
    1.1, // p
    8192, // n
    'rectangle', // shape
  );
  // console.log('imgCanvas', imgCanvas);
  // document.body.appendChild(imgCanvas);
  return imgCanvas;
};

//

export function makeNoiseCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  // // debugging
  // canvas.style.cssText = `\
  //   background: red;
  // `;
  // document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const noise = alea('seed');
  for (let i = 0; i < data.length; i += 4) {
    const r = noise() * 255;
    const g = noise() * 255;
    const b = noise() * 255;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

//

export const preprocessMeshForTextureEdit = async (mesh, options = {}) => {
  const textureSize = options.textureSize ?? defaultTextureSize;
  const flipY = options.flipY ?? false;
  const hueShift = options.hueShift ?? 0;
  const maskBgAlpha = options.maskBgAlpha ?? 0;
  const maskFgAlpha = options.maskFgAlpha ?? 0.07;
  const opaqueBgAlpha = options.opaqueBgAlpha ?? 0.5;
  const opaqueFgAlpha = options.opaqueBgAlpha ?? 1;
  
  const meshes = [mesh];
  // for (let i = 0; i < meshes.length; i++) {
    // const mesh = meshes[i];
    const {material} = mesh;
    const {map} = material;
    let {image} = map;

    // document.body.appendChild(image);

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.style.cssText = `\
      background: red;
    `;
    // document.body.appendChild(canvas);
    const renderer2 = makeRenderer(canvas);
    renderer2.autoClear = false;

    // constants
    const candidateColors = colors.slice();

    // const backgroundColor = 0xFFFFFF;
    const backgroundColor = 0x000000;
    // const backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    // const backgroundColor = candidateColors.splice(Math.floor(Math.random() * candidateColors.length), 1)[0];
    const uColor = new THREE.Color(backgroundColor);

    // const backgroundColor2 = 0xFFFFFF;
    const backgroundColor2 = 0x000000;
    // const backgroundColor2 = colors[Math.floor(Math.random() * colors.length)];
    // const backgroundColor2 = candidateColors.splice(Math.floor(Math.random() * candidateColors.length), 1)[0];
    // const backgroundColor2 = backgroundColor;
    const uColor2 = new THREE.Color(backgroundColor2);

    // background scene
    const backgroundScene = new THREE.Scene();
    backgroundScene.autoUpdate = false;

    // background mesh
    // fullscreen geometry
    const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2)
    // const backgroundGeometry = new THREE.BoxBufferGeometry(1, 1, 1)
      // .translate(0, 0, 0.5);
    // fullscreen material
    const noiseCanvas = makeNoiseCanvas(image.width, image.height);
    // const noiseCanvas = makeSeedCanvas();
    const noiseMap = new THREE.Texture(noiseCanvas);
    noiseMap.needsUpdate = true;
    const backgroundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uNoiseMap: {
          value: noiseMap,
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
        uColor2: {
          value: uColor2,
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
        uniform sampler2D uNoiseMap;
        uniform vec3 uColor;
        uniform vec3 uColor2;
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(uNoiseMap, vUv);

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
      // blending: THREE.NoBlending,
    });
    const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    backgroundMesh.frustumCulled = false;
    backgroundScene.add(backgroundMesh);

    const scene2 = new THREE.Scene();
    scene2.autoUpdate = false;
    const camera2 = makeDefaultCamera();

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
        uColor2: {
          value: uColor2,
          needsUpdate: true,
        },
        uHueShift: {
          value: hueShift,
          needsUpdate: true,
        },
        // uFlipY: {
        //   value: +flipY,
        //   needsUpdate: true,
        // },
      },
      vertexShader: `\
        uniform float uFlipY;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          // gl_Position = vec4(position, 1.0);
          vec2 duv = (uv - 0.5) * 2.;
          // if (uFlipY > 0.) {
          //   duv.y *= -1.;
          // }
          gl_Position = vec4(duv.x, duv.y, 0., 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D uMap;
        uniform float uAlpha;
        uniform vec3 uColor;
        uniform vec3 uColor2;
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
          // // hsv.y += 0.25;
          // // hsv.z += 0.1;
          color.rgb = hsv2rgb(hsv);

          // gl_FragColor = color;
          // gl_FragColor.b += 0.1;
          // gl_FragColor.a = 1.;

          gl_FragColor = vec4(color.rgb, uAlpha);
        }
      `,
      depthTest: false,
      depthWrite: false,
      // blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    });
    scene2.overrideMaterial = overrideMaterial;

    // push meshes
    const popMeshes = pushMeshes(scene2, meshes, {
      frustumCulled: false,
    });

    // render mask
    // const backgroundColor = 0x000000; // XXX in the future, we could get this from the corners of the image
    // const backgroundColor = 0xFFFFFF; // XXX in the future, we could get this from the corners of the image
    renderer2.setClearColor(backgroundColor, 0);
    backgroundMaterial.uniforms.uAlpha.value = maskBgAlpha;
    backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
    overrideMaterial.uniforms.uAlpha.value = maskFgAlpha;
    overrideMaterial.uniforms.uAlpha.needsUpdate = true;
    // renderer2.clear();
    renderer2.render(backgroundScene, camera2);
    renderer2.render(scene2, camera2);
    // latch mask
    // const maskImgCanvas = img2canvas(renderer.domElement);
    const maskCanvas = resizeImageToFit(
      renderer2.domElement,
      textureSize,
      textureSize
    );
    const maskImgDataUrlPromise = image2DataUrl(maskCanvas, 'mask');

    // render opaque
    renderer2.setClearColor(backgroundColor, 1);
    // const alpha2 = 1;
    backgroundMaterial.uniforms.uAlpha.value = opaqueBgAlpha;
    backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
    overrideMaterial.uniforms.uAlpha.value = opaqueFgAlpha;
    overrideMaterial.uniforms.uAlpha.needsUpdate = true;
    // renderer2.clear();
    renderer2.render(backgroundScene, camera2);
    renderer2.render(scene2, camera2);
    // latch opaque
    // const opaqueImgCanvas = img2canvas(renderer.domElement);
    const opaqueCanvas = resizeImageToFit(
      renderer2.domElement,
      textureSize,
      textureSize
    );
    const opaqueImgDataUrlPromise = image2DataUrl(opaqueCanvas, 'opaque');

    // pop meshes
    popMeshes();

    const [
      maskImgDataUrl,
      opaqueImgDataUrl,
    ] = await Promise.all([
      maskImgDataUrlPromise,
      opaqueImgDataUrlPromise,
    ]);

    return {
      width: textureSize,
      height: textureSize,
      opaqueImgDataUrl,
      maskImgDataUrl,
    };
  // }
};

//

export const editMeshTextures = async (mesh, {
  prompt,
  width,
  height,
  opaqueImgDataUrl,
  maskImgDataUrl,
  flipY = true,
}) => {
  const editImg = await img2img({
    prompt,
    width,
    height,
    imageDataUrl: opaqueImgDataUrl,
    // imageDataUrl: maskImgDataUrl,
    maskImageDataUrl: maskImgDataUrl,
  });
  console.log('edit image', editImg);


  {
    document.body.appendChild(editImg);
  }

  // const {
  //   normalImage,
  //   roughnessImage,
  //   displacementImage,
  // } = await generateTextureMaps(editImg);
  //
  // {
  //   document.body.appendChild(normalImage);
  //   document.body.appendChild(roughnessImage);
  //   document.body.appendChild(displacementImage);
  // }

  const geometry2 = mesh.geometry;

  const material2 = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    // transparent: true,
    // alphaTest: 0.9,
  });
  // material2.name = 'ai-textured-' + material.name;

  material2.map = new THREE.Texture(editImg);
  material2.map.flipY = flipY;
  material2.map.encoding = THREE.sRGBEncoding;
  material2.map.needsUpdate = true;

  // material2.map = new THREE.DataTexture(
  //   Uint8Array.from([255, 255, 255, 255]),
  //   1,
  //   1,
  //   THREE.RGBAFormat,
  //   THREE.UnsignedByteType,
  // );
  // material2.map.needsUpdate = true;

  // material2.normalMap = new THREE.Texture(normalImage);
  // // material2.normalMap.flipY = true;
  // // material2.normalMap.encoding = THREE.sRGBEncoding;
  // // material2.normalMapType = THREE.ObjectSpaceNormalMap;
  // material2.normalMap.needsUpdate = true;

  // material2.roughnessMap = new THREE.Texture(roughnessImage);
  // // material2.roughnessMap.flipY = true;
  // // material2.roughnessMap.encoding = THREE.sRGBEncoding;
  // material2.roughnessMap.needsUpdate = true;
  // material2.roughness = 1;

  // material2.bumpMap = new THREE.Texture(displacementImage);
  // // material2.bumpMap.flipY = true;
  // // material2.metalnessMap.encoding = THREE.sRGBEncoding;
  // material2.bumpMap.needsUpdate = true;
  // // material2.metalness = 0;
  // // material2.metalnessMap = null;

  // material2.emissiveMap = null;

  // material2.transparent = true;

  material2.needsUpdate = true;

  const mesh2 = new THREE.Mesh(geometry2, material2);
  mesh2.frustumCulled = false;
  return mesh2;
};

// apply noise to a mesh's texture
export const applyNoise = (mesh) => {
  const {material} = mesh;
  const canvas = document.createElement('canvas');
  const width = 512;
  const height = 512;
  canvas.width = 512;
  canvas.height = 512;
  const renderer = makeRenderer(canvas);
  renderer.setSize(width, height)
  renderer.autoClear = false;
  const noise = makeNoiseCanvas(512, 512);
  const noise_texture = new THREE.CanvasTexture(noise);


  // background scene
  const backgroundScene = new THREE.Scene();
  backgroundScene.autoUpdate = false;

  // background mesh -> fullscreen geometry
  const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

  // fullscreen material
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uMap : { value: material.map },
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

  const overrideMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uNoiseMap: {value: noise_texture},
    },
    vertexShader: `
    varying vec2 vUv;

        void main() {
          vUv = uv;
          // gl_Position = vec4(position, 1.0);
          vec2 duv = (uv - 0.5) * 2.;
          gl_Position = vec4(duv.x, duv.y, 0., 1.0);
        }
      `,
    fragmentShader: `
    uniform sampler2D uNoiseMap;
    varying vec2 vUv;
    
    void main() {
          vec4 color = texture2D(uNoiseMap, vUv);
          gl_FragColor = vec4(color.rgb, 1);
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
  const camera = makeDefaultCamera();
  renderer.render(backgroundScene, camera);
  renderer.render(foregroundScene, camera);
  // pop meshes
  popMeshes();

  // document.body.appendChild(renderer.domElement);
  return (renderer.domElement);
};

export const applyMask = (mesh) => {
  const {material} = mesh;
  const canvas = document.createElement('canvas');
  const width = 512;
  const height = 512;
  canvas.width = 512;
  canvas.height = 512;
  const renderer = makeRenderer(canvas);
  renderer.setSize(width, height)
  renderer.autoClear = false;

  // background scene
  const backgroundScene = new THREE.Scene();
  backgroundScene.autoUpdate = false;

  // background mesh -> fullscreen geometry
  const backgroundGeometry = new THREE.PlaneBufferGeometry(2, 2);

  // fullscreen material
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uMap : { value: material.map },
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

  const overrideMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: new THREE.Color(0xffffff)},
    },
    vertexShader: `
    varying vec2 vUv;

        void main() {
          vUv = uv;
          // gl_Position = vec4(position, 1.0);
          vec2 duv = (uv - 0.5) * 2.;
          gl_Position = vec4(duv.x, duv.y, 0., 1.0);
        }
      `,
    fragmentShader: `
    uniform vec3 uColor;
    varying vec2 vUv;
    
    void main() {
          vec4 color = vec4(uColor, 1.);
          gl_FragColor = vec4(color.rgb, 1);
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
  const camera = makeDefaultCamera();
  renderer.render(backgroundScene, camera);
  renderer.render(foregroundScene, camera);
  // pop meshes
  popMeshes();

  // document.body.appendChild(renderer.domElement);
  return (renderer.domElement);


};
