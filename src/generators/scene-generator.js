import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

import {ImageAiClient} from '../clients/image-client.js';
import {getLabel} from '../clients/perception-client.js';
import {
  pointcloudStride,
  getPointCloud,
  drawPointCloudCanvas,
  pointCloudArrayBufferToPositionAttributeArray,
  applySkybox,
  pointCloudArrayBufferToColorAttributeArray,
  skyboxDistance,
} from '../clients/reconstruction-client.js';

import {blob2img} from '../utils/convert-utils.js';
import {makeId} from '../utils/id-utils.js';
import {labelClasses} from '../constants/prompts.js';

//

export const panelSize = 1024;
export const mainImageKey = 'layer0/image';
export const promptKey = 'layer0/prompt';
export const layer1Specs = [
  {
    name: 'labelImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'pointCloudHeaders',
    type: 'json',
  },
  {
    name: 'pointCloud',
    type: 'arrayBuffer',
  },
  {
    name: 'boundingBoxLayers',
    type: 'json',
  },
  {
    name: 'planeMatrices',
    type: 'json',
  },
  {
    name: 'predictedHeight',
    type: 'json',
  },
];
export const layer2Specs = [
  {
    name: 'maskImg',
    type: 'imageFile',
  },
  {
    name: 'editedImg',
    type: 'imageFile',
  },
  {
    name: 'pointCloudHeaders',
    type: 'json',
  },
  {
    name: 'pointCloud',
    type: 'arrayBuffer',
  },
  {
    name: 'depthFloatImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'indexColorsAlphasArray',
    type: 'json',
  },
];

//

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

const localMatrix = new THREE.Matrix4();

//

const floatImageData = imageData => {
  const result = new Float32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const {width, height} = imageData;
  // flip Y
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const j = (height - 1 - y) * width + x;
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
  }
  return result;
};
const depthVertexShader = `\
  precision highp float;
  precision highp int;
  /* uniform float uVertexOffset;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec2 vWorldUv;
  varying vec3 vPos;
  varying vec3 vNormal; */

  void main() {
    // vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // vec3 newPosition = position + normal * vec3( uVertexOffset, uVertexOffset, uVertexOffset );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // vViewPosition = -mvPosition.xyz;
    // vUv = uv;
    // vPos = position;
    // vNormal = normal;
  }
`;
const depthFragmentShader = `\
  // uniform vec3 uColor;
  // uniform float uTime;
  uniform float cameraNear;
  uniform float cameraFar;

  // varying vec3 vViewPosition;
  // varying vec2 vUv;

  // varying vec3 vPos;
  // varying vec3 vNormal;

  #define FLOAT_MAX  1.70141184e38
  #define FLOAT_MIN  1.17549435e-38

  lowp vec4 encode_float(highp float v) {
    highp float av = abs(v);

    //Handle special cases
    if(av < FLOAT_MIN) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    } else if(v > FLOAT_MAX) {
      return vec4(127.0, 128.0, 0.0, 0.0) / 255.0;
    } else if(v < -FLOAT_MAX) {
      return vec4(255.0, 128.0, 0.0, 0.0) / 255.0;
    }

    highp vec4 c = vec4(0,0,0,0);

    //Compute exponent and mantissa
    highp float e = floor(log2(av));
    highp float m = av * pow(2.0, -e) - 1.0;

    //Unpack mantissa
    c[1] = floor(128.0 * m);
    m -= c[1] / 128.0;
    c[2] = floor(32768.0 * m);
    m -= c[2] / 32768.0;
    c[3] = floor(8388608.0 * m);

    //Unpack exponent
    highp float ebias = e + 127.0;
    c[0] = floor(ebias / 2.0);
    ebias -= c[0] * 2.0;
    c[1] += floor(ebias) * 128.0;

    //Unpack sign bit
    c[0] += 128.0 * step(0.0, -v);

    //Scale back to range
    return c / 255.0;
  }

  // note: the 0.1s here an there are voodoo related to precision
  float decode_float(vec4 v) {
    vec4 bits = v * 255.0;
    float sign = mix(-1.0, 1.0, step(bits[3], 128.0));
    float expo = floor(mod(bits[3] + 0.1, 128.0)) * 2.0 +
                floor((bits[2] + 0.1) / 128.0) - 127.0;
    float sig = bits[0] +
                bits[1] * 256.0 +
                floor(mod(bits[2] + 0.1, 128.0)) * 256.0 * 256.0;
    return sign * (1.0 + sig / 8388607.0) * pow(2.0, expo);
  }

  float perspectiveDepthToViewZ( const in float invClipZ, const in float near, const in float far ) {
    return ( near * far ) / ( ( far - near ) * invClipZ - far );
  }

  void main() {
    // get the view Z
    // first, we need to reconstruct the depth value in this fragment
    float depth = gl_FragCoord.z;
    float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    gl_FragColor = encode_float(viewZ).abgr;
  }
`;
function drawLabelCanvas(img, boundingBoxLayers) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');

  //

  ctx.drawImage(img, 0, 0);

  //
  for (let i = 0; i < boundingBoxLayers.length; i++) {
    const bboxes = boundingBoxLayers[i];
    ctx.strokeStyle = 'red';
    const className = labelClasses[i];
    for (let j = 0; j < bboxes.length; j++) {      
      // draw the main rectangle
      const bbox = bboxes[j];
      const [x1, y1, x2, y2] = bbox;
      const w = x2 - x1;
      const h = y2 - y1;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, w, h);

      // label the box in the top left, with a black background and white text that fits inside
      ctx.fillStyle = 'black';
      ctx.fillRect(x1, y1, 100, 20);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(className, x1 + 2, y1 + 14);
    }
  }

  //

  return canvas;
}

//

const blockEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const _isPointInSkybox = (geometry, i) => geometry.attributes.position.array[i * 3 + 2] > -skyboxDistance;
const _cutSkybox = geometry => {
  // copy over only the triangles that are all on one side of the skybox bounds
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aInSkybox = _isPointInSkybox(geometry, a);
    const bInSkybox = _isPointInSkybox(geometry, b);
    const cInSkybox = _isPointInSkybox(geometry, c);
    if (aInSkybox === bInSkybox && bInSkybox === cInSkybox) {
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
    }
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
// same as above, but for a luminosity value
function calculateValue(x, y, alphaSpecs /* : {x: number, y: number, a: number}[] */) {
  let total = 0;
  for (let i = 0; i < alphaSpecs.length; i++) {
    let c = alphaSpecs[i];
    let d = distance(c.x, c.y, x, y);
    if (d === 0) {
      return c;
    }
    d = 1 / (d * d);
    c.d = d;
    total += d;
  }
  let a = 0;
  for (let i = 0; i < alphaSpecs.length; i++) {
    let c = alphaSpecs[i];
    let ratio = c.d / total;
    a += ratio * c.value;
  }
  a = Math.floor(a);
  // return {a:a};
  return a;
}
const _clipGeometryToMask = (
  geometry,
  widthSegments,
  heightSegments,
  oldGeometry,
  maskImageData,
  depthFloatImageData,
  indexColorsAlphasArray
) => {
  // check if the point was originally solid or a hole
  const _isPointTransparent = i => maskImageData.data[i * 4 + 3] === 0;
  // get the array which has the brightest alphas at this index
  const _getBrightestIndexColorAlpha = (indexColorsAlphasArray, index) => {
    let bestIndexColorAlpha = null;
    let bestIndexColorAlphaValue = -1;
    for (let i = 0; i < indexColorsAlphasArray.length; i++) {
      const indexColorAlpha = indexColorsAlphasArray[i];
      const a = indexColorAlpha[index * 4 + 3];
      if (a > bestIndexColorAlphaValue) {
        bestIndexColorAlpha = indexColorAlpha;
        bestIndexColorAlphaValue = a;
      }
    }
    return bestIndexColorAlpha;
  };

  // const positions = geometry.attributes.position.array.slice();
  const indices = [];
  const gridX = widthSegments;
  const gridY = heightSegments;
  const gridX1 = gridX + 1;
  const gridY1 = gridY + 1;
  const frontierPoints = new Set();
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const a = ix + gridX1 * iy;
      const b = ix + gridX1 * (iy + 1);
      const c = (ix + 1) + gridX1 * (iy + 1);
      const d = (ix + 1) + gridX1 * iy;

      const aO = _isPointTransparent(a);
      const bO = _isPointTransparent(b);
      const cO = _isPointTransparent(c);
      const dO = _isPointTransparent(d);

      // if one of the points was in the hole, keep it; otherwise, discard it
      // if a kept point neighbors a non-hole point, add it to the frontier set for welding
      if (aO || bO || cO) {
        indices.push(a, b, d);
        if (!aO) {
          frontierPoints.add(a);
        }
        if (!bO) {
          frontierPoints.add(b);
        }
        if (!dO) {
          frontierPoints.add(d);
        }
      }
      if (bO || cO || dO) {
        indices.push(b, c, d);
        if (!bO) {
          frontierPoints.add(b);
        }
        if (!cO) {
          frontierPoints.add(c);
        }
        if (!dO) {
          frontierPoints.add(d);
        }
      }
    }
  }
  /* for (let ix = 0; ix < gridX1; ix++) {
    for (let iy = 0; iy < gridX1; iy++) {
      const index = ix + gridX1 * iy;

      // if it's a frontier point, we need to weld it to the nearest existing point in the old geometry
      if (frontierPoints.has(index)) {
        const brightestIndexColorAlpha = _getBrightestIndexColorAlpha(indexColorsAlphasArray, index);
        const r = brightestIndexColorAlpha[index * 4 + 0];
        const g = brightestIndexColorAlpha[index * 4 + 1];
        const b = brightestIndexColorAlpha[index * 4 + 2];
        // const a = brightestIndexColorAlpha[index * 4 + 3];

        const screenX = r * gridX1;
        const screenY = g * gridY1;
        const vertexIndex = b;

        // ensure screenX, screenY, vertexIndex are integers; throw if not
        if (screenX !== Math.floor(screenX)) {
          console.warn('invalid screenX', screenX);
          debugger;
          throw new Error('invalid screenX');
        }
        if (screenY !== Math.floor(screenY)) {
          console.warn('invalid screenY', screenY);
          debugger;
          throw new Error('invalid screenY');
        }
        if (vertexIndex !== Math.floor(vertexIndex)) {
          console.warn('invalid vertexIndex', vertexIndex);
          debugger;
          throw new Error('invalid vertexIndex');
        }

        const positionIndex = vertexIndex * 3;
        const oldPositions = oldGeometry.attributes.position.array;
        positions[index * 3 + 0] = oldPositions[positionIndex + 0];
        positions[index * 3 + 1] = oldPositions[positionIndex + 1];
        positions[index * 3 + 2] = oldPositions[positionIndex + 2];
      } else {
        // otherwise, we need to perform a 6-point interpolation across the index colors alphas array

        // colect [{x, y, value}]
        const alphaSpecs = indexColorsAlphasArray.map(indexColorsAlphas => {
          const r = indexColorsAlphas[index * 4 + 0];
          const g = indexColorsAlphas[index * 4 + 1];
          const b = indexColorsAlphas[index * 4 + 2];
          const a = indexColorsAlphas[index * 4 + 3];

          const screenX = r * gridX1;
          const screenY = g * gridY1;
          const vertexIndex = b;

          // ensure screenX, screenY, vertexIndex are integers; throw if not
          if (screenX !== Math.floor(screenX)) {
            console.warn('invalid screenX', screenX);
            debugger;
            throw new Error('invalid screenX');
          }
          if (screenY !== Math.floor(screenY)) {
            console.warn('invalid screenY', screenY);
            debugger;
            throw new Error('invalid screenY');
          }
          if (vertexIndex !== Math.floor(vertexIndex)) {
            console.warn('invalid vertexIndex', vertexIndex);
            debugger;
            throw new Error('invalid vertexIndex');
          }

          if (a > 0) { // if it's a solid point, get the viewZ from the depth float image data
            const depthFloatIndex = screenX + screenY * gridX1;
            const viewZ = depthFloatImageData[depthFloatIndex];

            return {
              x: screenX,
              y: screenY,
              value: viewZ,
            };
          } else { // else if it's a transparent point, pretend it's the destination geometry's local Z at the corner
            const {direction} = indexColorsAlphas;

            // snap the screen position
            let screenX2 = ix / gridX1;
            let screenY2 = iy / gridY1;
            if (direction.x < 0) {
              screenX2 = gridX1 - 1;
            } else if (direction.x > 0) {
              screenX2 = 0;
            }
            if (direction.y < 0) {
              screenY2 = gridY1 - 1;
            } else if (direction.y > 0) {
              screenY2 = 0;
            }

            const viewZ = 0; // XXX need to get this from the rendered depth of the destination geometry

            return {
              x: screenX2,
              y: screenY2,
              value: viewZ,
            };
          }
        });
        // XXX add to the list of candidates a centroid point at the axis intersection of the other points
        // XXX viewZ should come from the depth float image data of the new geometry
        
        const resolvedViewZ = calculateValue(ix, iy, alphaSpecs);
        // XXX convert viewZ to worldZ
        const worldZ = 0; // XXX
        // positions[index * 3 + 0] = oldPositions[positionIndex + 0];
        // positions[index * 3 + 1] = oldPositions[positionIndex + 1];
        positions[index * 3 + 2] = worldZ;
      }
    }
  }
  // set the new positions and indices on the geometry
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); */
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
};

//

class PanelRenderer extends EventTarget {
  constructor(canvas, panel, {
    debug = false,
  } = {}) {
    super();

    this.canvas = canvas;
    this.panel = panel;
    this.debug = debug;

    this.layerScenes = [];

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('canvas');

    // renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x0000FF);
    scene.autoUpdate = false;
    this.scene = scene;
    
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera = camera;

    // orbit controls
    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(0, 0, -3);
    this.controls = controls;

    // lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    directionalLight.updateMatrixWorld();
    scene.add(directionalLight);

    this.sceneMesh = null;
    this.floorMesh = null;
    this.planesMesh = null;

    const cubeMesh = new THREE.Mesh(
      new THREE.BoxBufferGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({
        color: 0x00ff00,
      }),
    );
    cubeMesh.name = 'cubeMesh';
    cubeMesh.frustumCulled = false;
    // scene.add(cubeMesh);

    // read the mesh from the panel
    const imgArrayBuffer = panel.getData(mainImageKey);
    const labelImageData = panel.getData('layer1/labelImageData');
    const pointCloudHeaders = panel.getData('layer1/pointCloudHeaders');
    const pointCloudArrayBuffer = panel.getData('layer1/pointCloud');
    const planeMatrices = panel.getData('layer1/planeMatrices');
    const predictedHeight = panel.getData('layer1/predictedHeight');
    // console.log('got panel datas', panel.getDatas());

    // camera
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // scene mesh
    const widthSegments = this.canvas.width - 1;
    const heightSegments = this.canvas.height - 1;
    const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/this.canvas.width);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
    pointCloudArrayBufferToColorAttributeArray(labelImageData, geometry.attributes.color.array);
    _cutSkybox(geometry);
    applySkybox(geometry.attributes.position.array);
    const map = new THREE.Texture();
    (async () => { // load the texture image
      const imgBlob = new Blob([imgArrayBuffer], {
        type: 'image/jpeg',
      });
      map.image = await createImageBitmap(imgBlob, {
        imageOrientation: 'flipY',
      });
      map.needsUpdate = true;
    })();
    const sceneMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        // color: 0x0000ff,
        map,
      }),
    );
    sceneMesh.name = 'sceneMesh';
    sceneMesh.frustumCulled = false;
    this.scene.add(sceneMesh);
    this.sceneMesh = sceneMesh;

    // floor mesh
    const floorMesh = (() => {
      const geometry = new THREE.PlaneGeometry(1, 1)
        .rotateX(-Math.PI/2)
      const material = new THREE.MeshBasicMaterial({
        color: 0x808080,
        transparent: true,
        opacity: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'floorMesh';
      mesh.frustumCulled = false;
      return mesh;
    })();
    floorMesh.position.y = -predictedHeight;
    floorMesh.updateMatrixWorld();
    // this.scene.add(floorMesh);
    this.floorMesh = floorMesh;

    // planes mesh
    const planesMesh = (() => {
      const planeGeometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const planesMesh = new THREE.InstancedMesh(planeGeometry, material, planeMatrices.length);
      planesMesh.name = 'planesMesh';
      planesMesh.frustumCulled = false;
      for (let i = 0; i < planeMatrices.length; i++) {
        planesMesh.setMatrixAt(i, localMatrix.fromArray(planeMatrices[i]));
      }
      planesMesh.count = planeMatrices.length;
      planesMesh.instanceMatrix.needsUpdate = true;
      return planesMesh;
    })();
    // this.scene.add(planesMesh);
    this.planesMesh = planesMesh;

    // bootstrap
    this.listen();
    this.animate();
  }
  listen() {
    const keydown = e => {
      if (!e.repeat) {
        // page up
        if (e.key === 'PageUp') {
          this.sceneMesh.material.uniforms.uColorEnabled.value = 1;
          this.sceneMesh.material.uniforms.uColorEnabled.needsUpdate = true;
          blockEvent(e);
        } else if (e.key === 'PageDown') {
          this.sceneMesh.material.uniforms.uColorEnabled.value = 0;
          this.sceneMesh.material.uniforms.uColorEnabled.needsUpdate = true;
          blockEvent(e);
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', blockEvent);
    canvas.addEventListener('mouseup', blockEvent);
    canvas.addEventListener('click', blockEvent);
    canvas.addEventListener('wheel', blockEvent);

    this.panel.addEventListener('update', e => {
      this.updateOutmeshLayers();
    });

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', blockEvent);
      canvas.removeEventListener('mouseup', blockEvent);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);
    });
  }
  animate() {
    const _startLoop = () => {
      const _render = () => {
        // update orbit controls
        this.controls.update();
        this.camera.updateMatrixWorld();

        // render
        this.renderer.render(this.scene, this.camera);
      };
      let frame;
      const _loop = () => {
        frame = requestAnimationFrame(_loop);
        _render();
      };
      _loop();

      this.addEventListener('destroy', e => {
        cancelAnimationFrame(frame);
      });
    };
    _startLoop();
  }
  async renderOutmesh(panel) {
    const prompt = panel.getData(promptKey);
    if (!prompt) {
      throw new Error('no prompt, so cannot outmesh');
    }

    // render the mask image
    console.time('maskImage');
    let blob;
    let maskBlob;
    let maskImgArrayBuffer;
    {
      const backgroundCanvas = document.createElement('canvas');
      backgroundCanvas.classList.add('backgroundCanvas');
      backgroundCanvas.width = this.renderer.domElement.width;
      backgroundCanvas.height = this.renderer.domElement.height;
      backgroundCanvas.style.cssText = `\
        background: red;
      `;
      const backgroundContext = backgroundCanvas.getContext('2d');
      backgroundContext.drawImage(this.renderer.domElement, 0, 0);
      // this.element.appendChild(backgroundCanvas);

      blob = await new Promise((accept, reject) => {
        backgroundCanvas.toBlob(blob => {
          accept(blob);
        });
      });
      maskBlob = blob; // same as blob
      maskImgArrayBuffer = await blob.arrayBuffer();
      // const maskImg = await blob2img(maskBlob);
    }
    console.timeEnd('maskImage');

    // edit the image
    console.time('editImg');
    let editedImgBlob;
    let editedImgArrayBuffer;
    let editedImg;
    {
      editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, prompt);
      editedImgArrayBuffer = await editedImgBlob.arrayBuffer();
      editedImg = await blob2img(editedImgBlob);
      editedImg.classList.add('editImg');
      // this.element.appendChild(editedImg);
    }
    console.timeEnd('editImg');

    // get point cloud
    console.time('pointCloud');
    let pointCloudHeaders;
    let pointCloudArrayBuffer;
    {
      const pc = await getPointCloud(blob);
      pointCloudHeaders = pc.headers;
      pointCloudArrayBuffer = pc.arrayBuffer;
      // const pointCloudCanvas = drawPointCloudCanvas(pointCloudArrayBuffer);
      // this.element.appendChild(pointCloudCanvas);
    }
    console.timeEnd('pointCloud');

    // render indices
    console.time('renderIndices');
    let indexCanvas;
    let indexRenderer;
    let indexRenderTarget;
    let maskImageData;
    {
      indexCanvas = document.createElement('canvas');
      indexCanvas.classList.add('indexCanvas');
      indexCanvas.width = this.renderer.domElement.width;
      indexCanvas.height = this.renderer.domElement.height;

      const indexScene = new THREE.Scene();
      indexScene.autoUpdate = false;

      const sceneMesh2 = this.sceneMesh.clone();
      sceneMesh2.name = 'sceneMesh2';
      sceneMesh2.material = new THREE.ShaderMaterial({
        uniforms: {
          resolution: {
            value: new THREE.Vector2(indexCanvas.width, indexCanvas.height),
            needsUpdate: true,
          },
        },
        vertexShader: `
          varying float vVertexId;
          void main() {
            vVertexId = float(gl_VertexID);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec2 resolution;
          varying float vVertexId;

          void main() {
            vec2 uv = gl_FragCoord.xy / resolution;
            gl_FragColor = vec4(uv, vVertexId, 1.0);
          }
        `,
      });
      indexScene.add(sceneMesh2);

      // create a new index renderer
      indexRenderer = new THREE.WebGLRenderer({
        canvas: indexCanvas,
        alpha: true,
        // antialias: true,
        preserveDrawingBuffer: true,
      });
      indexRenderer.setClearColor(0x000000, 0);
      // const indexContext = indexRenderer.getContext();

      // float render target
      indexRenderTarget = new THREE.WebGLRenderTarget(
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          format: THREE.RGBAFormat,
          type: THREE.FloatType,
        }
      );

      // render indices
      {
        indexRenderer.setRenderTarget(indexRenderTarget);
        indexRenderer.render(indexScene, this.camera);
      }

      // render color witohut antialiasing
      const nonAaCanvas = document.createElement('canvas');
      nonAaCanvas.width = this.renderer.domElement.width;
      nonAaCanvas.height = this.renderer.domElement.height;
      const nonAaRenderer = new THREE.WebGLRenderer({
        canvas: nonAaCanvas,
        alpha: true,
        // antialias: true,
        preserveDrawingBuffer: true,
      });
      nonAaRenderer.setClearColor(0x000000, 0);
      nonAaRenderer.render(this.scene, this.camera);
      
      maskImageData = (() => {
        const canvas = document.createElement('canvas');
        canvas.width = nonAaRenderer.domElement.width;
        canvas.height = nonAaRenderer.domElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(nonAaRenderer.domElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, nonAaRenderer.domElement.width, nonAaRenderer.domElement.height);
        return imageData;
      })();
    }
    console.timeEnd('renderIndices');

    // render depth
    console.time('renderDepth');
    let depthFloatImageData;
    {
      const depthMaterial = new THREE.ShaderMaterial({
        uniforms: {
          cameraNear: {
            value: this.camera.near,
            needsUpdate: true,
          },
          cameraFar: {
            value: this.camera.far,
            needsUpdate: true,
          },
        },
        vertexShader: depthVertexShader,
        fragmentShader: depthFragmentShader,
      });
      const depthMesh = this.sceneMesh.clone();
      depthMesh.name = 'depthMesh';
      depthMesh.material = depthMaterial;
      depthMesh.frustumCulled = false;
      const depthScene = new THREE.Scene();
      depthScene.autoUpdate = false;
      depthScene.add(depthMesh);

      const depthRenderTarget = new THREE.WebGLRenderTarget(
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
        }
      );

      const _renderOverrideMaterial = (renderTarget) => {
        this.renderer.setRenderTarget(renderTarget);
        // this.scene.overrideMaterial = overrideMaterial;

        this.renderer.clear();
        this.renderer.render(depthScene, this.camera);
        
        // this.scene.overrideMaterial = null;
        
        const imageData = {
          data: new Uint8Array(renderTarget.width * renderTarget.height * 4),
          width: renderTarget.width,
          height: renderTarget.height,
        };
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, renderTarget.width, renderTarget.height, imageData.data);
        this.renderer.setRenderTarget(null);
        return imageData;
      };
      depthFloatImageData = floatImageData(_renderOverrideMaterial(depthRenderTarget));
      for (let i = 0; i < depthFloatImageData.length; i++) {
        if (depthFloatImageData[i] === this.camera.near) {
          depthFloatImageData[i] = -this.camera.far;
        }
      }

      // done with this
      this.scene.remove(depthMesh);
    }
    console.timeEnd('renderDepth');

    // post-process index canvas
    let indexColorsAlphasArray;
    console.time('postProcess');
    {
      // set up the scene
      const fullscreenScene = new THREE.Scene();
      fullscreenScene.autoUpdate = false;

      const encodeIndexColorAlphaToRgba = (indexColor, alpha, uint8Array, i) => {
        const r = indexColor[0];
        const g = indexColor[1];
        const b = indexColor[2];

        uint8Array[i + 0] = r * 255;
        uint8Array[i + 1] = g * 255;
        uint8Array[i + 2] = b / (indexCanvas.width * indexCanvas.height) * 255;
        uint8Array[i + 3] = alpha * 255;
      };
      const encodeIndexColorsAlphasToRgba = (indexColorsAlphas, uint8Array) => {
        for (let i = 0; i < indexColorsAlphas.length; i += 4) {
          const indexColor = indexColorsAlphas.slice(i + 0, i + 3);
          const alpha = indexColorsAlphas[i + 3];
          encodeIndexColorAlphaToRgba(indexColor, alpha, uint8Array, i);
        }
      };
      const encodeIndexColorsAlphasToCanvas = indexColorsAlphas => {
        const indexCanvas2 = document.createElement('canvas');
        indexCanvas2.width = indexCanvas.width;
        indexCanvas2.height = indexCanvas.height;
        indexCanvas2.style.cssText = `\
          background: red;
        `;
        const indexContext2 = indexCanvas2.getContext('2d');
        const indexImageData2 = indexContext2.createImageData(indexCanvas.width, indexCanvas.height);
        encodeIndexColorsAlphasToRgba(indexColorsAlphas, indexImageData2.data);
        indexContext2.putImageData(indexImageData2, 0, 0);
        return indexCanvas2;
      };

      // extract the index colors and alphas
      const indexColorsAlphas = new Float32Array(indexCanvas.width * indexCanvas.height * 4);
      indexRenderer.readRenderTargetPixels(indexRenderTarget, 0, 0, indexCanvas.width, indexCanvas.height, indexColorsAlphas);

      if (this.debug) {
        const indexCanvas2 = encodeIndexColorsAlphasToCanvas(indexColorsAlphas);
        indexCanvas2.classList.add('indexCanvas2');
        // this.element.appendChild(indexCanvas2);
      }

      const directions = [
        [-1, 0],
        [1, 0],
        [0, 1],
        [0, -1],
      ];
      const getIndex = (x, y) => (x + indexCanvas.width * y) * 4;
      const smearIndexColorAlphas = (indexColorsAlphas, direction) => {
        const indexColorsAlphas2 = new indexColorsAlphas.constructor(indexColorsAlphas.length);
        const genCoords = function*() {
          if (direction[0] < 0) {
            for (let dy = 0; dy < indexRenderer.domElement.height; dy++) {
              for (let dx = indexRenderer.domElement.width - 1; dx >= 0; dx--) {
                yield [dx, dy, dx === 0];
              }
            }
          } else if (direction[0] > 0) {
            for (let dy = 0; dy < indexRenderer.domElement.height; dy++) {
              for (let dx = 0; dx < indexRenderer.domElement.width; dx++) {
                yield [dx, dy, dx === indexRenderer.domElement.width - 1];
              }
            }
          } else if (direction[1] < 0) {
            for (let dx = 0; dx < indexRenderer.domElement.width; dx++) {
              for (let dy = indexRenderer.domElement.height - 1; dy >= 0; dy--) {
                yield [dx, dy, dy === 0];
              }
            }
          } else if (direction[1] > 0) {
            for (let dx = 0; dx < indexRenderer.domElement.width; dx++) {
              for (let dy = 0; dy < indexRenderer.domElement.height; dy++) {
                yield [dx, dy, dy === indexRenderer.domElement.height - 1];
              }
            }
          } else {
            throw new Error('invalid direction');
          }
        };
        {
          const coordsIter = genCoords();
          let currentColor = [-1, -1, -1];
          let currentAlpha = -1;
          for (const coord of coordsIter) {
            const index = getIndex(coord[0], coord[1]);
            const last = coord[2];

            if (currentAlpha === -1) {
              currentColor[0] = indexColorsAlphas[index + 0];
              currentColor[1] = indexColorsAlphas[index + 1];
              currentColor[2] = indexColorsAlphas[index + 2];
              currentAlpha = indexColorsAlphas[index + 3];
            }

            const r = indexColorsAlphas[index + 0];
            const g = indexColorsAlphas[index + 1];
            const b = indexColorsAlphas[index + 2];
            const a = indexColorsAlphas[index + 3];
            if (a > 0) {
              currentColor[0] = r;
              currentColor[1] = g;
              currentColor[2] = b;
              currentAlpha = a;
            } else {
              currentAlpha -= 1 / indexRenderer.domElement.width;
              currentAlpha = Math.max(currentAlpha, 0);
            }
            // write back
            indexColorsAlphas2[index + 0] = currentColor[0];
            indexColorsAlphas2[index + 1] = currentColor[1];
            indexColorsAlphas2[index + 2] = currentColor[2];
            indexColorsAlphas2[index + 3] = currentAlpha;

            if (last) {
              currentAlpha = -1;
            }
          }
        }
        return indexColorsAlphas2;
      };
      const sdfIndexColorAlphas = (indexColorsAlphas) => {
        return indexColorsAlphas;
        // XXX use:
        // XXX https://github.com/bzztbomb/three_js_outline/blob/trunk/lib/jfaOutline.js#L68
        // XXX https://www.shadertoy.com/view/4syGWK
        /* const indexColorsAlphas2 = indexColorsAlphas.slice();
        const queue = [];
        const _recursePoints = (x, y, parentColor, parentAlpha) => {
          queue.push([x, y, parentColor, parentAlpha]);
        };
        const _handleRecursePoints = (x, y, parentColor, parentAlpha) => {
          for (let dy = -1; dy <= 1; dy += 2) {
            for (let dx = -1; dx <= 1; dx += 2) {
              const ax = x + dx;
              const ay = y + dy;
              if (ax >= 0 && ax < indexRenderer.domElement.width && ay >= 0 && ay < indexRenderer.domElement.height) {
                const index = getIndex(ax, ay);
                // const r = indexColorsAlphas2[index + 0];
                // const g = indexColorsAlphas2[index + 1];
                // const b = indexColorsAlphas2[index + 2];
                const a = indexColorsAlphas2[index + 3];

                const parentDistance = Math.sqrt(dx*dx + dy*dy);
                const newAlpha = parentAlpha - parentDistance * (1 / indexRenderer.domElement.width);

                if (newAlpha > a) {
                  indexColorsAlphas2[index + 0] = parentColor[0];
                  indexColorsAlphas2[index + 1] = parentColor[1];
                  indexColorsAlphas2[index + 2] = parentColor[2];
                  indexColorsAlphas2[index + 3] = newAlpha;
                  _recursePoints(ax, ay, indexColorsAlphas2.slice(index + 0, index + 3), indexColorsAlphas2[index + 3]);
                }
              }
            }
          }
        };
        for (let y = 0; y < indexRenderer.domElement.height; y++) {
          for (let x = 0; x < indexRenderer.domElement.width; x++) {
            const index = getIndex(x, y);
            const r = indexColorsAlphas[index + 0];
            const g = indexColorsAlphas[index + 1];
            const b = indexColorsAlphas[index + 2];
            const a = indexColorsAlphas[index + 3];
            if (a > 0) {
              indexColorsAlphas2[index + 0] = r;
              indexColorsAlphas2[index + 1] = g;
              indexColorsAlphas2[index + 2] = b;
              indexColorsAlphas2[index + 3] = a;
              _recursePoints(x, y, [r, g, b], a);
            }
          }
        }
        while (queue.length > 0) {
          const [x, y, parentColor, parentAlpha] = queue.shift();
          _handleRecursePoints(x, y, parentColor, parentAlpha);
        }
        return indexColorsAlphas2; */
      };
      
      indexColorsAlphasArray = directions.map(direction => {
        const indexColorsAlphas2 = smearIndexColorAlphas(indexColorsAlphas, direction);
        indexColorsAlphas2.direction = direction;
        return indexColorsAlphas2;
      });
      const sdfIndexImageData = (() => {
        const indexColorsAlphas2 = sdfIndexColorAlphas(indexColorsAlphas);
        indexColorsAlphas2.direction = [0, 0];
        return indexColorsAlphas2;
      })();
      indexColorsAlphasArray.push(sdfIndexImageData);
    }
    console.timeEnd('postProcess')

    // return result
    return {
      maskImg: maskImgArrayBuffer,
      editedImg: editedImgArrayBuffer,
      pointCloudHeaders,
      pointCloud: pointCloudArrayBuffer,
      depthFloatImageData,
      indexColorsAlphasArray,
    };
  }
  createOutmeshLayer(layerEntries) {
    const _getLayerEntry = key => layerEntries.find(layerEntry => layerEntry.key.endsWith('/' + key))?.value;
    const maskImg = _getLayerEntry('maskImg');
    const editedImg = _getLayerEntry('editedImg');
    const pointCloudHeaders = _getLayerEntry('pointCloudHeaders');
    const pointCloud = _getLayerEntry('pointCloud');
    const depthFloatImageData = _getLayerEntry('depthFloatImageData');
    const indexColorsAlphasArray = _getLayerEntry('indexColorsAlphasArray');
    console.log('got data', {
      maskImg,
      editedImg,
      pointCloudHeaders,
      pointCloud,
      depthFloatImageData,
      indexColorsAlphasArray,
    })

    const layerScene = new THREE.Scene();
    layerScene.autoUpdate = false;

    // create background mesh
    (async () => {
      console.time('backgroundMesh');
      const maskImgBlob = new Blob([maskImg], {type: 'image/png'});
      const maskImageBitmap = await createImageBitmap(maskImgBlob);
      const canvas = document.createElement('canvas');
      canvas.width = maskImageBitmap.width;
      canvas.height = maskImageBitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(maskImageBitmap, 0, 0);
      const maskImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      const widthSegments = panelSize - 1;
      const heightSegments = panelSize - 1;
      const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
      pointCloudArrayBufferToPositionAttributeArray(pointCloud, geometry.attributes.position.array, 1 / panelSize);
      const material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
      });
      const backgroundMesh = new THREE.Mesh(geometry, material);
      backgroundMesh.name = 'backgroundMesh';
      backgroundMesh.position.copy(this.camera.position);
      backgroundMesh.quaternion.copy(this.camera.quaternion);
      backgroundMesh.updateMatrixWorld();
      backgroundMesh.frustumCulled = false;

      const oldGeometry = this.sceneMesh.geometry;
      
      _clipGeometryToMask(
        geometry,
        widthSegments,
        heightSegments,
        oldGeometry,
        maskImageData,
        depthFloatImageData,
        indexColorsAlphasArray
      );
      geometry.computeVertexNormals();

      layerScene.add(backgroundMesh);
      console.timeEnd('backgroundMesh');
    })();

    // display depth cubes
    console.time('depthCubes');
    {
      const setPositionFromViewZ = (() => {
        const projInv = new THREE.Matrix4();
      
        return (x, y, viewZ, camera, position) => {
          // get the inverse projection matrix of the camera
          projInv.copy(camera.projectionMatrix)
            .invert();
          position
            .set(
              x * 2 - 1,
              -y * 2 + 1,
              0.5
            )
            .applyMatrix4(projInv);
      
          position.multiplyScalar(viewZ / position.z);
          position.applyMatrix4(camera.matrixWorld);
          return position;
        };
      })();

      // render an instanced cubes mesh to show the depth
      // const depthCubesGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
      const depthCubesGeometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
      const depthCubesMaterial = new THREE.MeshPhongMaterial({
        color: 0x00FFFF,
      });
      const depthCubesMesh = new THREE.InstancedMesh(depthCubesGeometry, depthCubesMaterial, depthFloatImageData.length);
      depthCubesMesh.name = 'depthCubesMesh';
      depthCubesMesh.frustumCulled = false;
      layerScene.add(depthCubesMesh);

      // set the matrices by projecting the depth from the perspective camera
      const skipRatio = 8;
      for (let i = 0; i < depthFloatImageData.length; i += skipRatio) {
        const x = (i % this.renderer.domElement.width) / this.renderer.domElement.width;
        const y = Math.floor(i / this.renderer.domElement.width) / this.renderer.domElement.height;
        const viewZ = depthFloatImageData[i];
        const target  = setPositionFromViewZ(x, y, viewZ, this.camera, new THREE.Vector3());

        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(target.x, target.y, target.z);
        depthCubesMesh.setMatrixAt(i / skipRatio, matrix);
      }
      depthCubesMesh.count = depthFloatImageData.length;
      depthCubesMesh.instanceMatrix.needsUpdate = true;
    }
    console.timeEnd('depthCubes');

    // set fov
    console.time('fov');
    {
      const fov = Number(pointCloudHeaders['x-fov']);
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    console.timeEnd('fov');

    return layerScene;
  }
  updateOutmeshLayers() {
    const startLayer = 2;
    const maxLayers = 10;
    const _getDataLayers = () => {
      const layers = [];
      for (let i = startLayer; i < maxLayers; i++) {
        const layerDatas = this.panel.getDatas().filter(({key}) => {
          return key.startsWith('layer' + i + '/');
        });
        if (layer2Specs.every(spec => {
          return layerDatas.some(({key}) => key.endsWith('/' + spec.name));
        })) {
          layers[i] = layerDatas;
        } else {
          break;
        }
      }
      return layers;
    }
    const layers = _getDataLayers();

    const _addNewLayers = () => {
      for (let i = startLayer; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layerDatas = layers[i];
          layerScene = this.createOutmeshLayer(layerDatas);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        this.scene.remove(layerScene);
      }
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();
  }
  destroy() {
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}

//

const _detectPlanes = async points => {
  console.time('ransac');
  const res = await fetch(`https://depth.webaverse.com/ransac?n=${8}&threshold=${0.1}&init_n=${1500}`, {
    method: 'POST',
    body: points,
  });
  if (res.ok) {
    const planesJson = await res.json();
    console.timeEnd('ransac');
    return planesJson;
  } else {
    console.timeEnd('ransac');
    throw new Error('failed to detect planes');
  }
};

//

const _getPredictedHeight = async blob => {
  const fd = new FormData();
  fd.append('question', 'in feet, how high up is this?');
  fd.append('file', blob);
  fd.append('task', 'vqa');
  const res = await fetch(`https://blip.webaverse.com/upload`, {
    method: 'post',
    body: fd,
  });
  const j = await res.json();
  const {Answer} = j;
  const f = parseFloat(Answer);
  if (!isNaN(f)) {
    return f;
  } else {
    return null;
  }
};
const _getImageCaption = async blob => {
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('task', 'image_captioning');
  const res = await fetch(`https://blip.webaverse.com/upload`, {
    method: 'post',
    body: fd,
  });
  const j = await res.json();
  const {Caption} = j;
  return Caption;
};

//

const _resizeFile = async file => {
  // read the image
  const image = await new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
      cleanup();
    };
    img.onerror = err => {
      reject(err);
      cleanup();
    };
    img.crossOrigin = 'Anonymous';
    const u = URL.createObjectURL(file);
    img.src = u;
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
  });

  // if necessary, resize the image via contain mode
  if (image.width !== 1024 || image.height !== 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    // ctx.fillStyle = 'white';
    // ctx.fillRect(0, 0, 1024, 1024);
    const sx = Math.max(0, (image.width - image.height) / 2);
    const sy = Math.max(0, (image.height - image.width) / 2);
    const sw = Math.min(image.width, image.height);
    const sh = Math.min(image.width, image.height);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 1024, 1024);
    file = await new Promise((accept, reject) => {
      canvas.toBlob(blob => {
        accept(blob);
      });
    });
  }
  return file;
};

//

async function compileVirtualScene(arrayBuffer) {
  // color
  const blob = new Blob([arrayBuffer], {
    type: 'image/png',
  });
  const img = await blob2img(blob);
  img.classList.add('img');
  // document.body.appendChild(img);
  
  // label
  const {
    headers: labelHeaders,
    blob: labelBlob,
  } = await getLabel(blob, {
    classes: labelClasses,
    threshold: 0.0001,
  });
  const labelImg = await blob2img(labelBlob);
  const labelImageData = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = labelImg.width;
    canvas.height = labelImg.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(labelImg, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer;
  })();
  const boundingBoxLayers = JSON.parse(labelHeaders['x-bounding-boxes']);
  // const labelCanvas = drawLabelCanvas(labelImg, boundingBoxLayers);
  // document.body.appendChild(labelCanvas);

  // point cloud
  const {
    headers: pointCloudHeaders,
    arrayBuffer: pointCloudArrayBuffer,
  } = await getPointCloud(blob);
  const pointCloudCanvas = drawPointCloudCanvas(pointCloudArrayBuffer);
  // document.body.appendChild(pointCloudCanvas);

  // run ransac
  const planeMatrices = [];
  {
    const widthSegments = img.width - 1;
    const heightSegments = img.height - 1;
    const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/img.width);
    applySkybox(geometry.attributes.position.array);

    // keep only a fraction of the points
    const fraction = 16;
    let points = geometry.attributes.position.array;
    let points2 = new Float32Array(points.length / fraction);
    for (let i = 0; i < points2.length / 3; i++) {
      const j = i * 3 * fraction;
      points2[i*3+0] = points[j+0];
      points2[i*3+1] = points[j+1];
      points2[i*3+2] = points[j+2];
    }
    // shuffle points2
    for (let i = 0; i < points2.length / 3; i++) {
      const j = Math.floor(Math.random() * points2.length / 3);
      const tmp = points2.slice(i*3, i*3+3);
      points2.set(points2.slice(j*3, j*3+3), i*3);
      points2.set(tmp, j*3);
    }

    // detect planes
    const planesJson = await _detectPlanes(points2);
    // draw detected planes
    for (let i = 0; i < planesJson.length; i++) {
      const plane = planesJson[i];
      const [planeEquation, planePointIndices] = plane; // XXX note the planeIndices are computed relative to the current points set after removing all previous planes; these are not global indices
      
      const normal = new THREE.Vector3(planeEquation[0], planeEquation[1], planeEquation[2]);
      const distance = planeEquation[3];
      
      // cut out the plane points
      const inlierPlaneFloats = [];
      const outlierPlaneFloats = [];
      for (let j = 0; j < points2.length; j += 3) {
        if (planePointIndices.includes(j/3)) {
          inlierPlaneFloats.push(points2[j], points2[j+1], points2[j+2]);
        } else {
          outlierPlaneFloats.push(points2[j], points2[j+1], points2[j+2]);
        }
      }

      // compute the centroid
      const centroid = new THREE.Vector3();
      let count = 0;
      for (let j = 0; j < inlierPlaneFloats.length; j += 3) {
        centroid.x += inlierPlaneFloats[j];
        centroid.y += inlierPlaneFloats[j+1];
        centroid.z += inlierPlaneFloats[j+2];
        count++;
      }
      centroid.divideScalar(count);

      // console.log('got centroid', centroid);

      const m = new THREE.Matrix4().compose(
        centroid,
        new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(
            normal,
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 1, 0),
          )
        ),
        new THREE.Vector3(1, 1, 1)
      );
      planeMatrices.push(m.toArray());

      // latch new points
      points2 = Float32Array.from(outlierPlaneFloats);
    }
  }

  // query the height
  const predictedHeight = await _getPredictedHeight(blob);
  // console.log('got predicted height', predictedHeight);

  // return result
  return {
    labelImageData,
    pointCloudHeaders,
    pointCloud: pointCloudArrayBuffer,
    boundingBoxLayers,
    planeMatrices,
    predictedHeight,
  };
}

//

export class Panel extends EventTarget {
  constructor(data = []) {
    super();

    this.id = makeId();
    this.#data = data;

    this.runningTasks = [];
    this.abortController = new AbortController();
  }
  #data;

  getDatas() {
    return this.#data;
  }
  getDataSpec(key) {
    return this.#data.find(item => item.key === key);
  }
  getData(key) {
    const item = this.getDataSpec(key);
    return item?.value;
  }
  setData(key, value, type) {
    let item = this.getDataSpec(key);
    if (!item) {
      item = {
        key,
        type,
        value,
      };
      this.#data.push(item);
    } else {
      item.value = value;
    }
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        key,
      },
    }));
  }
  deleteData(key) {
    const index = this.#data.findIndex(item => item.key === key);
    if (index !== -1) {
      this.#data.splice(index, 1);
    }
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        key,
      },
    }));
  }
  hasData(key) {
    return this.#data.some(item => item.key === key);
  }
  hasDataMatch(regex) {
    return this.#data.some(item => regex.test(item.key));
  }

  isBusy() {
    return this.runningTasks.length > 0;
  }
  isEmpty() {
    return !this.hasData(mainImageKey);
  }
  getBusyMessage() {
    if (this.runningTasks.length > 0) {
      return this.runningTasks[0].message;
    } else {
      return '';
    }
  }
  getDimension() {
    return this.hasDataMatch(/^layer1/) ? 3 : 2;
  }

  async setFile(file, prompt) {
    file = await _resizeFile(file, panelSize, panelSize);
    (async () => {
      const arrayBuffer = await file.arrayBuffer();
      this.setData(mainImageKey, arrayBuffer, 'imageFile');
    })();
    (async () => {
      if (!prompt) {
        prompt = await _getImageCaption(file);
      }
      this.setData(promptKey, prompt, 'text');
    })();
  }
  async setFromPrompt(prompt) {
    await this.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await this.setFile(blob, prompt);
    }, 'generating image');
  }

  async compile() {
    await this.task(async ({signal}) => {
      const image = this.getData(mainImageKey);
      const compileResult = await compileVirtualScene(image);
      // console.log('got compile result', compileResult);

      for (const {name, type} of layer1Specs) {
        this.setData('layer1/' + name, compileResult[name], type);
      }
    }, 'compiling');
  }
  async outmesh(renderer) {
    // console.log('outmesh start', renderer);
    try {
      const outmeshResult = await renderer.renderOutmesh(this);
      // const {
      //   maskImg,
      //   editedImg,
      //   pointCloud,
      //   depthFloatImageData,
      // } = outmeshResult;

      for (const {name, type} of layer2Specs) {
        this.setData('layer2/' + name, outmeshResult[name], type);
      }
    } catch(err) {
      console.warn(err);
    }
  }

  createRenderer(canvas, opts) {
    return new PanelRenderer(canvas, this, opts);
  }

  async task(fn, message) {
    const {signal} = this.abortController;

    const task = {
      message,
    };
    this.runningTasks.push(task);

    this.dispatchEvent(new MessageEvent('busyupdate', {
      data: {
        busy: this.isBusy(),
        message: this.getBusyMessage(),
      },
    }));

    try {
      await fn({
        signal,
      });
    } finally {
      const index = this.runningTasks.indexOf(task);
      this.runningTasks.splice(index, 1);
      
      this.dispatchEvent(new MessageEvent('busyupdate', {
        data: {
          busy: this.isBusy(),
          message: this.getBusyMessage(),
        },
      }));
    }
  }
  cancel() {
    this.abortController.abort(abortError);
  }
  destroy() {
    this.cancel();
  }
}

//

export class Storyboard extends EventTarget {
  constructor() {
    super();

    this.panels = [];
  }
  #addPanelInternal(panel) {
    this.panels.push(panel);
    this.dispatchEvent(new MessageEvent('paneladd', {
      data: {
        panel,
      },
    }));
  }
  #removePanelInternal(panel) {
    const i = this.panels.indexOf(panel);
    if (i !== -1) {
      this.panels.splice(i, 1);
      panel.destroy();

      this.dispatchEvent(new MessageEvent('panelremove', {
        data: {
          panel,
        },
      }));
    } else {
      throw new Error('panel not found');
    }
  }
  addPanel(data) {
    const panel = new Panel(data);
    this.#addPanelInternal(panel);
    return panel;
  }
  addPanelFromPrompt(prompt) {
    const panel = new Panel();
    panel.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await panel.setFile(blob, prompt);
    }, 'generating image');
    this.#addPanelInternal(panel);
    return panel;
  }
  addPanelFromFile(file) {
    const panel = new Panel();
    panel.task(async ({signal}) => {
      await panel.setFile(file);
    }, 'adding image');
    this.#addPanelInternal(panel);
    return panel;
  }
  removePanel(panel) {
    this.#removePanelInternal(panel);
  }
}