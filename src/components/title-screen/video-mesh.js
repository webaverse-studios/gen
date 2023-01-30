import * as THREE from 'three';
import {KTX2Loader} from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  zbdecode,
} from '../../zine/encoding.js';

const getKtx2Loader = (() => {
  let ktx2Loader = null;
  return () => {
    if (!ktx2Loader) {
      ktx2Loader = new KTX2Loader();
      ktx2Loader.load = (_load => function load() {
        console.log('ktx2 loader load', this.workerConfig);
        if (!this.workerConfig) {
          const renderer = new THREE.WebGLRenderer();
          this.detectSupport(renderer);
          renderer.dispose();
        }
        return _load.apply(this, arguments);
      })(ktx2Loader.load);
      ktx2Loader.setTranscoderPath('/three/basis/');
    }
    return ktx2Loader;
  };
})();

const _loadKtx2zTexture = async file => {
  // const fileSpec = particlesJson.find(f => f.name === name);
  // const {numFrames} = fileSpec;

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const zJson = zbdecode(uint8Array);
  console.log('got z json', zJson);
  const [
    numFrames,
    width,
    height,
    numFramesPerX,
    numFramesPerY,
    duration,
    ktx2Uint8Array,
  ] = zJson;

  const ktx2Blob = new Blob([ktx2Uint8Array], {
    type: 'application/octet-stream',
  });

  const texture = await new Promise((accept, reject) => {
    const ktx2Loader = getKtx2Loader();
    const u = URL.createObjectURL(ktx2Blob);
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
    ktx2Loader.load(u, t => {
      accept(t);
      cleanup();
    }, function onProgress() {}, err => {
      reject(err);
      cleanup();
    });
  });
  texture.name = name;
  texture.anisotropy = 16;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // use mip mapped filter
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  
  texture.numFrames = numFrames;
  texture.width = width;
  texture.height = height;
  texture.numFramesPerX = numFramesPerX;
  texture.numFramesPerY = numFramesPerY;
  texture.duration = duration;

  return texture;
};

//

class VideoPack {
  constructor({
    textures,
  }) {
    this.textures = textures;
  }
}

//

export class VideoMesh extends THREE.Mesh {
  static async loadPack(files) {
    const textures = await Promise.all(files.map(async file => {
      const texture = await _loadKtx2zTexture(file);
      return texture;
    }));
    const videoPack = new VideoPack({
      textures,
    });
    return videoPack;
  }
  constructor({
    pack,
  }) {
    // full screen video mesh
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);

    const {
      textures,
    } = pack;
    const [texture] = textures;
    const {
      numFrames,
      width,
      height,
      numFramesPerX,
      numFramesPerY,
      duration,
    } = texture;

    /* console.log('got texture', {
      numFrames,
      width,
      height,
      numFramesPerX,
      numFramesPerY,
      duration,
    }); */

    const videoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        texture0: {
          value: texture,
          needsUpdate: true,
        },
        numFrames: {
          value: numFrames,
          needsUpdate: true,
        },
        numFramesPerX: {
          value: numFramesPerX,
          needsUpdate: true,
        },
        numFramesPerY: {
          value: numFramesPerY,
          needsUpdate: true,
        },
        duration: {
          value: duration,
          needsUpdate: true,
        },
        screenResolution: {
          value: new THREE.Vector2(1024, 1024),
          needsUpdate: true,
        },
        videoResolution: {
          value: new THREE.Vector2(width, height),
          needsUpdate: true,
        },
        offset: {
          value: new THREE.Vector2(0, -0.3),
          needsUpdate: true,
        },
        uTime: {
          value: 0,
          needsUpdate: true,
        },
        uOpacity: {
          value: 1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
          vUv = uv;

          vec3 p = position;
          p *= (1. + (1. - uOpacity) * 0.3);
          gl_Position = vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D texture0;

        uniform vec2 screenResolution;
        uniform vec2 videoResolution;
        uniform vec2 offset;
        
        uniform float numFrames;
        uniform float numFramesPerX;
        uniform float numFramesPerY;
        uniform float duration;

        uniform float uTime;
        uniform float uOpacity;

        varying vec2 vUv;

        const vec3 baseColor = vec3(${
          new THREE.Color(0xa4a4a4).toArray().map(n => n.toFixed(8)).join(', ')
          // new THREE.Color(0xd3d3d3).toArray().map(n => n.toFixed(8)).join(', ')
        });
        const float scaleFactor = 0.7;

        void main() {
          // adjust uv for the video aspect ratios of the screen and the video
          // to keep the video centered and unstretched regardless of the screen aspect ratio
          float screenAspectRatio = screenResolution.x / screenResolution.y;
          float videoAspectRatio = videoResolution.x / videoResolution.y;

          vec2 numFramesPerXY = vec2(numFramesPerX, numFramesPerY);

          float frameIndex = mod(
            floor(uTime / duration * (numFrames + 1.)),
            numFrames
          );
          float x = mod(frameIndex, numFramesPerXY.x);
          float y = floor(frameIndex / numFramesPerXY.x);

          vec2 uv = vUv;
          uv.y = 1.0 - uv.y;

          uv -= 0.5;
          uv.y *= videoAspectRatio;
          uv.y /= screenAspectRatio;
          uv /= scaleFactor;
          uv += 0.5;

          if (uv.x >= 0. && uv.x <= 1. && uv.y >= 0. && uv.y <= 1.) {
            // uv = (uv - 0.5) * 2.0; // [-1, 1]
            // uv.y /= screenAspectRatio;
            // uv.y *= videoAspectRatio;
            // uv += offset;
            // uv = (uv + 1.0) / 2.0; // [0, 1]

            // adjust for frame index
            uv /= numFramesPerXY;
            uv += vec2(x, y) / numFramesPerXY;

            gl_FragColor = texture2D(texture0, uv);

            float colorDistance = distance(gl_FragColor.rgb, baseColor);
            const float rolloffStart = 0.02;
            const float rolloffEnd = 0.04;
            const float rolloffRange = rolloffEnd - rolloffStart;
            if (colorDistance < rolloffStart) {
              discard;
            } else {
              gl_FragColor.a = mix(0.0, 1.0, (colorDistance - rolloffStart) / rolloffRange);
            }

            gl_FragColor.a *= pow(uOpacity, 3.);
          } else {
            discard;
          }
        }
      `,
      // side: THREE.DoubleSide,
      transparent: true,
      alphaToCoverage: true,
      // alphaTest: 0.1,
    });

    super(geometry, videoMaterial);
  }
  update({
    timestamp,
    opacity,
    resolution,
  }) {
    this.material.uniforms.uTime.value = timestamp / 1000;
    this.material.uniforms.uTime.needsUpdate = true;

    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uOpacity.needsUpdate = true;

    this.material.uniforms.screenResolution.value.copy(resolution);
    this.material.uniforms.screenResolution.needsUpdate = true;
  }
}