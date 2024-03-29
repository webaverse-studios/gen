import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {ImageAiClient} from '../clients/image-client.js';
import materialColors from '../constants/material-colors.js';
import {prompts} from '../constants/prompts.js';
import {ColorScheme} from '../utils/color-scheme.js';
// import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import {
//   img2imgBlob,
// } from '../clients/image-client.js';
import {img2canvas} from '../utils/convert-utils.js';

//

const imageAiClient = new ImageAiClient();
const gltfExporter = new GLTFExporter();

//

const createSeedImage = (
  w, // width
  h, // height
  rw, // radius width
  rh, // radius height
  p, // power distribution of radius
  n, // number of rectangles
  shape, // 'ellipse' or 'rectangle'
  {
    color = null,
    monochrome = false,
    // blur = 0,
  } = {},
) => {
  const rng = () => (Math.random() * 2) - 1;
  const baseColors = Object.keys(materialColors).map(k => materialColors[k][400].slice(1));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.fillStyle = '#fff';
  maskCtx.fillRect(0, 0, w, h);

  const baseColor = color ?? baseColors[Math.floor(Math.random() * baseColors.length)];
  const scheme = new ColorScheme();
  scheme.from_hex(baseColor)
    .scheme(monochrome ? 'mono' : 'triade')   
    // .variation('hard');
  const colors = scheme.colors();

  for (let i = 0; i < n; i++) {
    const x = w / 2 + rng() * rw;
    const y = h / 2 + rng() * rh;
    const sw = Math.pow(Math.random(), p) * rw;
    const sh = Math.pow(Math.random(), p) * rh;
    ctx.fillStyle = '#' + colors[Math.floor(Math.random() * colors.length)];
    if (shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x, y, sw, sh, 0, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillRect(x - sw / 2, y - sh / 2, sw, sh);
    }
  }

  // make this box transparent in the mask
  // requires blend mode
  maskCtx.fillStyle = 'rgba(255, 255, 255, 1)';
  maskCtx.globalCompositeOperation = 'destination-out';
  if (shape === 'ellipse') {
    maskCtx.beginPath();
    maskCtx.ellipse(w / 2, h / 2, w / 2 * 0.9, h / 2 * 0.9, 0, 0, 2 * Math.PI);
    maskCtx.fill();
  } else if (shape === 'rectangle') {
    const innerRatio = 0.1;
    maskCtx.fillRect(w * innerRatio, 0, w - w * innerRatio * 2, h);
  }

  return {
    canvas,
    maskCanvas,
  };
};

const colorDistance = 32;

export class ItemGenerator {
  async generateImage(prompt = prompts.item) {
    const blobCanvas = document.createElement('canvas');
    blobCanvas.classList.add('blobCanvas');
    blobCanvas.width = 512;
    blobCanvas.height = 512;
    // blobCanvas.style.cssText = `\
    //   background: red;
    // `;
    // document.body.appendChild(blobCanvas);

    // draw full canvas rect white
    const blobCtx = blobCanvas.getContext('2d');
    blobCtx.fillStyle = '#fff';
    blobCtx.fillRect(0, 0, blobCanvas.width, blobCanvas.height);
    const blob = await new Promise((accept, reject) => {
      blobCanvas.toBlob(accept, 'image/png');
    });

    // clear the center rect (80% size of the canvas) to transparent, but keep the outer border white
    blobCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    blobCtx.globalCompositeOperation = 'destination-out';
    blobCtx.fillRect(
      blobCanvas.width * 0.1,
      blobCanvas.height * 0.1,
      blobCanvas.width * 0.8,
      blobCanvas.height * 0.8,
    );
    const maskBlob = await new Promise((accept, reject) => {
      blobCanvas.toBlob(accept, 'image/png');
    });

    console.log('get blob', {
      prompt,
      blob,
      maskBlob,
    });

    const imgBlob = await imageAiClient.editImg(
      blob,
      maskBlob,
      prompt,
    );
    return imgBlob;
  }
  async compileMesh(img) {
    // image canvas (transparent)
    const pixelSize = 32;
    const imgCanvasTransparent = document.createElement('canvas');
    imgCanvasTransparent.classList.add('imgCanvasTransparent');
    imgCanvasTransparent.width = pixelSize;
    imgCanvasTransparent.height = pixelSize;
    imgCanvasTransparent.style.cssText = `\
      background: red;
    `;
    {
      const imgCanvasTransparentContext = imgCanvasTransparent.getContext('2d');
      // scale down the image
      imgCanvasTransparentContext.drawImage(
        img,
        0, 0,
        img.width, img.height,
        0, 0,
        imgCanvasTransparent.width, imgCanvasTransparent.height,
      );
      const imageData = imgCanvasTransparentContext.getImageData(0, 0, imgCanvasTransparent.width, imgCanvasTransparent.height);
      // make a copy of the imageDAta data
      const data2 = imageData.data.slice();
      const imageData2 = new ImageData(data2, imgCanvasTransparent.width, imgCanvasTransparent.height);
      // get the top left color
      const topLeftColor = imageData.data.slice(0, 4);
      // flood fill from all 5 corners to all pixels with the same color
      const _floodFill = (x, y, color) => {
        const seenPixels = new Set();
        const getKey = (x, y) => `${x},${y}`;
        const _getPixel = (x, y) => {
          const i = (y * imgCanvasTransparent.width + x) * 4;
          return imageData.data.slice(i, i + 4);
        };
        const _setPixel = (x, y, color) => {
          const i = (y * imgCanvasTransparent.width + x) * 4;
          imageData2.data[i + 0] = color[0];
          imageData2.data[i + 1] = color[1];
          imageData2.data[i + 2] = color[2];
          imageData2.data[i + 3] = color[3];
        };
        const _colorEquals = (color1, color2) => {
          const distance = Math.abs(color1[0] - color2[0]) + Math.abs(color1[1] - color2[1]) + Math.abs(color1[2] - color2[2]);
          return distance <= colorDistance;
        };
        const queue = [];
        const _floodFillInner = (x, y) => {
          queue.push([x, y]);
        };
        _floodFillInner(x, y);
        seenPixels.add(getKey(x, y));
        while (queue.length > 0) {
          const entry = queue.shift();
          const [x, y] = entry;
          const pixelColor = _getPixel(x, y);

          if (_colorEquals(pixelColor, color)) {
            // set the flood fill color and continue the flood fill
            _setPixel(x, y, [0, 0, 0, 0]);
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < imgCanvasTransparent.width && ny >= 0 && ny < imgCanvasTransparent.height && !seenPixels.has(getKey(nx, ny))) {
                  _floodFillInner(nx, ny);
                  seenPixels.add(getKey(nx, ny));
                }
              }
            }
          } else {
            // debugger;
          }
        }
      };
      _floodFill(0, 0, topLeftColor);
      _floodFill(imgCanvasTransparent.width - 1, 0, topLeftColor);
      _floodFill(0, imgCanvasTransparent.height - 1, topLeftColor);
      _floodFill(imgCanvasTransparent.width - 1, imgCanvasTransparent.height - 1, topLeftColor);

      imgCanvasTransparentContext.putImageData(imageData2, 0, 0);
    }
    document.body.appendChild(imgCanvasTransparent);
  
    // pixel canvas (solid)
    const pixelCanvas = document.createElement('canvas');
    pixelCanvas.classList.add('pixelCanvas');
    pixelCanvas.width = pixelSize;
    pixelCanvas.height = pixelSize;
    const pixelContext = pixelCanvas.getContext('2d');
    pixelContext.imageSmoothingEnabled = false;
    pixelContext.drawImage(img, 0, 0, pixelSize, pixelSize);
    document.body.appendChild(pixelCanvas);

    // pixel canvas (transparent)
    const pixelCanvasTransparent = document.createElement('canvas');
    pixelCanvasTransparent.classList.add('pixelCanvasTransparent');
    pixelCanvasTransparent.width = pixelSize;
    pixelCanvasTransparent.height = pixelSize;
    pixelCanvasTransparent.style.cssText = `\
      background: red;
    `;
    const pixelContextTransparent = pixelCanvasTransparent.getContext('2d');
    pixelContextTransparent.imageSmoothingEnabled = false;
    pixelContextTransparent.drawImage(imgCanvasTransparent, 0, 0, pixelSize, pixelSize);
    document.body.appendChild(pixelCanvasTransparent);

    // gather non-transparent pixels in a list
    const pixelsList = [];
    const imageData = pixelContextTransparent.getImageData(0, 0, pixelSize, pixelSize);
    const {data} = imageData;
    for (let y = 0; y < pixelSize; y++) {
      for (let x = 0; x < pixelSize; x++) {
        const i = (y * pixelSize + x) * 4;
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        // make alpha the distance to white instead (brightness)
        // const a = 255 - Math.max(r, g, b);
        if (a > 0.5 * 255) {
          // flip y
          pixelsList.push([x, pixelSize - y, r, g, b, a]);
        }
      }
    }

    const makeSceneMesh = (pixelsList) => {
      const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(pixelsList.length * cubeGeometry.attributes.position.array.length);
      const colors = new Float32Array(pixelsList.length * cubeGeometry.attributes.position.array.length);
      const indices = new Uint16Array(pixelsList.length * cubeGeometry.index.array.length);
      for (let i = 0; i < pixelsList.length; i++) {
        const [x, y, r, g, b, a] = pixelsList[i];
        const position = cubeGeometry.attributes.position.array;
        for (let j = 0; j < position.length; j += 3) {
          // offset the positions to keep the object centered
          positions[i * position.length + j + 0] = position[j + 0] + x - pixelSize/2;
          positions[i * position.length + j + 1] = position[j + 1] + y + 0.5;
          positions[i * position.length + j + 2] = position[j + 2];
          colors[i * position.length + j + 0] = r / 255;
          colors[i * position.length + j + 1] = g / 255;
          colors[i * position.length + j + 2] = b / 255;
        }
        const index = cubeGeometry.index.array;
        for (let j = 0; j < index.length; j++) {
          indices[i * index.length + j] = index[j] + i * cubeGeometry.attributes.position.array.length / 3;
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      const pixelScale = 1 / pixelSize;
      geometry.scale(pixelScale, pixelScale, pixelScale);

      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        // side: THREE.DoubleSide,
      });
      const sceneMesh = new THREE.Mesh(
        geometry,
        material,
      );
      return sceneMesh;
    };
    const sceneMesh = makeSceneMesh(pixelsList);

    // exports
    const imgCanvas = img2canvas(img);
    const imgBlob = await new Promise((accept, reject) => {
      imgCanvas.toBlob(accept, 'image/png');
    });
    const glbBlob = await (async () => {
      const exportScene = new THREE.Scene();
      exportScene.add(sceneMesh);

      const arrayBuffer = await new Promise((accept, reject) => {
        gltfExporter.parse(exportScene, (result) => {
          accept(result);
        }, err => {
          // console.warn(err);
          reject(err);
        }, {
          binary: true,
        });
      });
      return new Blob([arrayBuffer], {
        type: 'model/gltf-binary',
      });
    })();

    return {
      sceneMesh,
      imgBlob,
      glbBlob,
    };
  }
};