import {useEffect, useState, useRef} from 'react';
import * as THREE from 'three';
import {
  SceneGallery,
} from '../image-gallery/SceneGallery.jsx';
import {
  DropTarget,
} from '../drop-target/DropTarget.jsx';
import {
  makeRenderer,
} from '../../zine/zine-utils.js';

import styles from '../../../styles/CelGenerator.module.css';

//

const size = 1024;
const width = 352;
const height = 352;
const blockSize = 32;
const smallWidth = width / blockSize;
const smallHeight = height / blockSize;

//

const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

//

const getImageMasks = async (blob, prompts = ['sky'], {
  factor = 0.5,
} = {}) => {
  // const imgUrl = 'https://cdn.jsdelivr.net/gh/webaverse/content@main/images/148%20-%207sCGiVK.png';
  // const prompts = ['sky', 'floor'];

  // const res = await fetch(imgUrl);
  // const b = await res.blob();
  const res2 = await fetch('https://clipseg.webaverse.com/predict?prompts=' + encodeURIComponent(JSON.stringify(prompts)), {
    method: 'POST',
    body: blob,
  });
  const a = await res2.arrayBuffer();

  const canvases = [];
  for (let i = 0; i < prompts.length; i++) {
    let min = Infinity;
    let max = -Infinity;
    const float32Array = new Float32Array(a, i * width * height * 4, width * height);
    float32Array.forEach(n => {
      min = Math.min(min, n);
      max = Math.max(max, n);
    });
    // console.log('min max', min, max);
    const avg = (min + max) / 2;
    const minValue = min + (max - min) * factor;

    // draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    {
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          const index = dx + dy * width;
          const baseIndex = index * 4;

          const n = float32Array[index];
          if (n >= minValue) {
            data[baseIndex + 0] = 255;
            data[baseIndex + 1] = 255;
            data[baseIndex + 2] = 255;
            data[baseIndex + 3] = 255;
          } else {
            data[baseIndex + 0] = 0;
            data[baseIndex + 1] = 0;
            data[baseIndex + 2] = 0;
            data[baseIndex + 3] = 255;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
    canvases.push(canvas);
  }
  return canvases;
};

//

class CelMesh extends THREE.Mesh {
  constructor({
    images = [],
  }) {
    // full screen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    // only one image is supported for now
    const image = images[0];
    const tex0 = new THREE.Texture(image);
    tex0.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tex0: {
          value: tex0,
          needsUpdate: true,
        },
        maskTex: {
          value: null,
          needsUpdate: false,
        },
        numFrames: {
          value: 1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 0.5, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D tex0;
        uniform sampler2D maskTex;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(tex0, vUv);
          gl_FragColor = color;

          // gl_FragColor.r = 1.;
          // gl_FragColor.a = 1.;
        }
      `,
    });

    super(geometry, material);
  }
}

//

const CelRenderer = ({
  file,
}) => {
  const canvasRef = useRef();
  
  // prevent wheel event
  useEffect(() => {
    const canvas = canvasRef.current;
    if (file && canvas) {      
      const wheel = e => {
        cancelEvent(e);
      };
      canvas.addEventListener('wheel', wheel, {
        passive: false,
      });

      const cancelFns = [];

      let live = true;
      cancelFns.push(() => {
        canvas.removeEventListener('wheel', wheel);
        live = false;
      });

      (async () => {
        const imageBitmap = await createImageBitmap(file, {
          imageOrientation: 'flipY',
        });
        if (!live) return;

        // renderer
        const renderer = makeRenderer(canvas);

        // scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;

        // camera
        const camera = new THREE.OrthographicCamera(
          -1, // left
          1, // right
          1, // top
          -1, // bottom
          0, // near,
          1, // far
        );
        camera.position.z = 1;
        camera.updateProjectionMatrix();

        const celMesh = new CelMesh({
          images: [imageBitmap],
        });
        celMesh.frustumCulled = false;
        celMesh.onBeforeRender = () => {
          console.log('render');
        };
        scene.add(celMesh);

        (async () => {
          const [
            skyImageMaskCanvas,
          ] = await getImageMasks(file, [
            'sky',
          ], {
            factor: 0.7,
          });

          // XXX debug
          skyImageMaskCanvas.style.cssText = `\
            background: red;
          `;
          document.body.appendChild(skyImageMaskCanvas);

          const skyImageMaskBitmap = await createImageBitmap(skyImageMaskCanvas, {
            resizeWidth: smallWidth,
            resizeHeight: smallHeight,
            resizeQuality: 'high',
          });
          const skyImageMaskCanvas2 = document.createElement('canvas');
          skyImageMaskCanvas2.width = skyImageMaskBitmap.width;
          skyImageMaskCanvas2.height = skyImageMaskBitmap.height;
          const ctx2 = skyImageMaskCanvas2.getContext('2d');
          ctx2.drawImage(skyImageMaskBitmap, 0, 0);

          // XXX debug
          skyImageMaskCanvas2.style.cssText = `\
            background: red;
            width: ${width}px;
            height: ${height}px;
          `;
          document.body.appendChild(skyImageMaskCanvas2);

          celMesh.material.uniforms.maskTex.value = skyImageMaskCanvas2;
          celMesh.material.uniforms.maskTex.needsUpdate = true;
        })();

        // animate
        let frame;
        const _render = () => {
          frame = requestAnimationFrame(_render);

          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(_render);

        // register cleanup
        cancelFns.push(() => {
          cancelAnimationFrame(frame);
        });
      })();

      return () => {
        for (const cancelFn of cancelFns) {
          cancelFn();
        }
      };
    }
  }, [file, canvasRef.current]);

  return <canvas
    width={size}
    height={size}
    ref={canvasRef}
    className={styles.canvas}
  />;
};

//

const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
const CelGeneratorComponent = () => {
  // const [prompt, setPrompt] = useState(defaultPrompt);
  
  const [loading, setLoading] = useState(false);

  const [selecting, setSelecting] = useState(false);
  
  // const [avatarManager, setAvatarManager] = useState(null);
  
  // const [retextured, setRetextured] = useState(false);
  // const [imageAiModel, setImageAiModel] = useState('sd');
  
  // const [emotion, setEmotion] = useState('none');
  // const [emotions, setEmotions] = useState([]);
  // const [animation, setAnimation] = useState('none');
  // const [animations, setAnimations] = useState([]);

  // const [voiceEndpoint, setVoiceEndpoint] = useState('');
  // const [voiceEndpoints, setVoiceEndpoints] = useState([]);

  // const [voicePack, setVoicePack] = useState('');
  // const [voicePacks, setVoicePacks] = useState([]);
  
  // const [embodied, setEmbodied] = useState(false);
  
  // const [interrogating, setInterrogating] = useState(false);
  // const [conversations, setConversations] = useState([]);
  // const [conversation, setConversation] = useState(null);

  const [files, setFiles] = useState([]);
  
  const addFiles = fs => {
    const newFiles = files.concat(fs);
    setFiles(newFiles);
  };
  const onSelect = () => {
    setSelecting(true);
  };

  return (
    <div className={styles.celGenerator}>
      {files.length === 0 ? (
        !selecting ? (
          <DropTarget
            className={styles.panelPlaceholder}
            // newLabel='Create New Panel'
            selectLabel='Select Scene'
            onFilesAdd={addFiles}
            // onNew={onNew}
            onSelect={onSelect}
          />
        ) : (
          <SceneGallery onImageClick={async u => {
            const res = await fetch(u);
            const file = await res.blob();
            console.log('load file', file);
            addFiles([file]);
            // const panel = storyboard.addPanelFromFile(file);
            // onPanelSelect(panel);
          }}>
          </SceneGallery>
        )
      ) : (
        <CelRenderer
          file={files[0]}
        />
      )
    }
    </div>
  )
};
export default CelGeneratorComponent;