import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import PolynomialRegression from 'ml-regression-polynomial';
import regression from 'regression';
import Heap from 'heap-js';
import alea from '../utils/alea.js';
import {JFAOutline, renderDepthReconstruction} from '../utils/jfaOutline.js';

// const x = [50, 50, 50, 70, 70, 70, 80, 80, 80, 90, 90, 90, 100, 100, 100];
// const y = [3.3, 2.8, 2.9, 2.3, 2.6, 2.1, 2.5, 2.9, 2.4, 3.0, 3.1, 2.8, 3.3, 3.5, 3.0];
// const degree = 5; // setup the maximum degree of the polynomial
// const regression = new PolynomialRegression(x, y, degree);
// console.log(regression.predict(80));

// import regression from 'regression';
// const result = regression.linear([[0, 1], [32, 67], [12, 79]]);
// const gradient = result.equation[0];
// const yIntercept = result.equation[1];

/* globalThis.testPrediction = () => {
  const data = [[0,1],[32, 67], [12, 30], [40, 79]];
  // const result = regression.polynomial(data, {
  //   order: 3,
  // });
  const result = regression.exponential(data);
  console.log('predict', result.predict(30));
  return result;
}; */

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
  // {
  //   name: 'indexColorsAlphasArray',
  //   type: 'json',
  // },
  {
    name: 'oldDepthFloatImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'newDepthFloatImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'reconstructedDepthFloats',
    type: 'arrayBuffer',
  },
];

//

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
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
  float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
    return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
  }
  
  float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
    return ( viewZ + near ) / ( near - far );
  }
  float orthographicDepthToViewZ( const in float linearClipZ, const in float near, const in float far ) {
    return linearClipZ * ( near - far ) - near;
  }

  void main() {
    // get the view Z
    // first, we need to reconstruct the depth value in this fragment
    float depth = gl_FragCoord.z;
    float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    
    // convert to orthographic depth
    // float orthoZ = viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
    // gl_FragColor = encode_float(orthoZ).abgr;

    gl_FragColor = encode_float(viewZ).abgr;
  }
`;
const setCameraViewPositionFromViewZ = (() => {
  const projectionMatrixInverse = new THREE.Matrix4();

  function viewZToOrthographicDepth(viewZ, near, far) {
    return ( viewZ + near ) / ( near - far );
  }
  function orthographicDepthToViewZ(orthoZ, near, far) {
    return orthoZ * ( near - far ) - near;
  }

  return (x, y, viewZ, camera, target) => {
    const {near, far, projectionMatrix} = camera;
    projectionMatrixInverse.copy(projectionMatrix)
      .invert();
    
    const depth = viewZToOrthographicDepth(viewZ, near, far);

    // float clipW = cameraProjection[2][3] * viewZ + cameraProjection[3][3];
    // vec4 clipPosition = vec4( ( vec3( gl_FragCoord.xy / viewport.zw, depth ) - 0.5 ) * 2.0, 1.0 );
    // clipPosition *= clipW;
    // vec4 viewPosition = inverseProjection * clipPosition;
    // vec4 vorldPosition = cameraMatrixWorld * vec4( viewPosition.xyz, 1.0 );

    const clipW = projectionMatrix.elements[2 * 4 + 3] * viewZ + projectionMatrix.elements[3 * 4 + 3];
    const clipPosition = new THREE.Vector4(
      (x - 0.5) * 2,
      (y - 0.5) * 2,
      (depth - 0.5) * 2,
      1
    );
    clipPosition.multiplyScalar(clipW);
    const viewPosition = clipPosition.applyMatrix4(projectionMatrixInverse);
    
    target.x = viewPosition.x;
    target.y = viewPosition.y;
    target.z = viewPosition.z;
    return target;
  };
})();

//

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
const _isPointMasked = (maskImageData, i) => maskImageData.data[i * 4 + 3] > 0;
const _cutMask = (geometry, maskImageData) => {
  // copy over only the triangles that are not completely masked
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aMasked = _isPointMasked(maskImageData, a);
    const bMasked = _isPointMasked(maskImageData, b);
    const cMasked = _isPointMasked(maskImageData, c);
    // if not all are masked, then keep the triangle
    if (!(aMasked && bMasked && cMasked)) {
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
    }
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
const _isValidZDepth = z => z < 0;
const _cutDepth = (geometry, depthFloatImageData) => {
  // copy over only the triangles that are not completely far
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aValid = _isValidZDepth(depthFloatImageData[a]);
    const bValid = _isValidZDepth(depthFloatImageData[b]);
    const cValid = _isValidZDepth(depthFloatImageData[c]);
    // if not all are valid, then keep the triangle
    if (!(aValid && bValid && cValid)) {
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

    console.log('create renderer', new Error().stack);

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
    // _cutSkybox(geometry);
    // applySkybox(geometry.attributes.position.array);
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

    const update = e => {
      this.updateOutmeshLayers();
    };
    this.panel.addEventListener('update', update);

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', blockEvent);
      canvas.removeEventListener('mouseup', blockEvent);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      this.panel.removeEventListener('update', update);
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
      const maskCanvas = document.createElement('canvas');
      maskCanvas.classList.add('maskCanvas');
      maskCanvas.width = this.renderer.domElement.width;
      maskCanvas.height = this.renderer.domElement.height;
      maskCanvas.style.cssText = `\
        background: red;
      `;
      const backgroundContext = maskCanvas.getContext('2d');
      backgroundContext.drawImage(this.renderer.domElement, 0, 0);
      // this.element.appendChild(maskCanvas);
      document.body.appendChild(maskCanvas);

      blob = await new Promise((accept, reject) => {
        maskCanvas.toBlob(blob => {
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
      document.body.appendChild(editedImg);
    }
    console.timeEnd('editImg');

    // get point cloud
    console.time('pointCloud');
    let pointCloudHeaders;
    let pointCloudArrayBuffer;
    {
      const pc = await getPointCloud(editedImgBlob);
      pointCloudHeaders = pc.headers;
      pointCloudArrayBuffer = pc.arrayBuffer;
      // const pointCloudCanvas = drawPointCloudCanvas(pointCloudArrayBuffer);
      // this.element.appendChild(pointCloudCanvas);
    }
    console.timeEnd('pointCloud');

    // set fov
    console.time('fov');
    {
      this.camera.fov = Number(pointCloudHeaders['x-fov']);
      this.camera.updateProjectionMatrix();
    }
    console.timeEnd('fov');

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
      depthFloatImageData = floatImageData(_renderOverrideMaterial(depthRenderTarget)); // orthoZ
    }
    console.timeEnd('renderDepth');

    console.time('formatDepths');
    let newDepthFloatImageData;
    { 
      const geometryPositions = new Float32Array(panelSize * panelSize * 3);
      pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometryPositions, 1 / panelSize);

      newDepthFloatImageData = new Float32Array(geometryPositions.length / 3);
      for (let i = 0; i < newDepthFloatImageData.length; i++) {
        const worldPoint = localVector.fromArray(geometryPositions, i * 3);
        const projectionPoint = worldPoint.applyMatrix4(this.camera.projectionMatrix);

        newDepthFloatImageData[i] = projectionPoint.z;
      }
    }
    console.timeEnd('formatDepths');

    const _makeFloatRenderTargetSwapChain = () => {
      const targets = Array(2);
      for (let i = 0; i < 2; i++) {
        targets[i] = new THREE.WebGLRenderTarget(this.renderer.domElement.width, this.renderer.domElement.height, {
          type: THREE.FloatType,
          magFilter: THREE.NearestFilter,
          minFilter: THREE.NearestFilter,
        });
      }
      return targets;
    };

    // render outline
    console.time('outline');
    const iResolution = new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height);
    let distanceRenderTarget;
    {
      // By default we rely on the three js layer system to mark an object for outlining.
      const SELECTED_LAYER = 0;

      const tempScene = new THREE.Scene();
      tempScene.autoUpdate = false;
      tempScene.add(this.sceneMesh); // note: stealing the scene mesh for a moment

      // We need two render targets to ping-pong in between.  
      const targets = _makeFloatRenderTargetSwapChain();

      const jfaOutline = new JFAOutline(targets, iResolution);
      // jfaOutline.outline(this.renderer, tempScene, this.camera, targets, iResolution, SELECTED_LAYER);
      jfaOutline.renderSelected(this.renderer, tempScene, this.camera, targets, SELECTED_LAYER);
      const outlineUniforms = undefined;
      const distanceIndex = jfaOutline.renderDistanceTex(this.renderer, targets, iResolution, outlineUniforms);
      distanceRenderTarget = targets[distanceIndex];
      // get the image data back out of the render target, as a Float32Array
      const distanceFloatImageData = new Float32Array(distanceRenderTarget.width * distanceRenderTarget.height * 4);
      this.renderer.readRenderTargetPixels(distanceRenderTarget, 0, 0, distanceRenderTarget.width, distanceRenderTarget.height, distanceFloatImageData);
      // globalThis.distanceFloatImageData = distanceFloatImageData;

      // output to canvas
      const canvas = document.createElement('canvas');
      canvas.classList.add('outlineCanvas');
      canvas.width = distanceRenderTarget.width;
      canvas.height = distanceRenderTarget.height;
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      // globalThis.distanceU8ImageData = data;
      for (let i = 0; i < distanceFloatImageData.length; i += 4) {
        const r = distanceFloatImageData[i];
        const g = distanceFloatImageData[i+1];
        const b = distanceFloatImageData[i+2];
        const a = distanceFloatImageData[i+3];

        const j = i / 4;
        const x = j % canvas.width;
        const y = Math.floor(j / canvas.width);

        const expectedPoint = new THREE.Vector2(x, y);
        const realPoint = new THREE.Vector2(r, g);
        const d = realPoint.distanceTo(expectedPoint);
        const f = Math.max(1 - d / 512, 0);

        // flip y
        const index = (canvas.height - y - 1) * canvas.width + x;
        data[index*4 + 0] = r / canvas.width * 255 * f;
        data[index*4 + 1] = g / canvas.width * 255 * f;
        data[index*4 + 2] = b / canvas.width * 255 * f;
        data[index*4 + 3] = 255;
      }
      context.putImageData(imageData, 0, 0);
      document.body.appendChild(canvas);

      // done with this, put it back
      this.scene.add(this.sceneMesh);
    }
    console.timeEnd('outline');

    // depth reconstruction
    console.time('reconstructZ');
    let reconstructedDepthFloats;
    {
      const targets = _makeFloatRenderTargetSwapChain();

      renderDepthReconstruction(
        this.renderer,
        distanceRenderTarget,
        targets,
        depthFloatImageData,
        newDepthFloatImageData,
        iResolution
      );

      // read the render target
      const writeRenderTarget = targets[0];
      const reconstructedDepthFloatsImageData = new Float32Array(writeRenderTarget.width * writeRenderTarget.height * 4);
      this.renderer.readRenderTargetPixels(writeRenderTarget, 0, 0, writeRenderTarget.width, writeRenderTarget.height, reconstructedDepthFloatsImageData);

      // extract to depth-only
      // flip y
      reconstructedDepthFloats = new Float32Array(reconstructedDepthFloatsImageData.length / 4);
      for (let i = 0; i < reconstructedDepthFloats.length; i++) {
        const j = i * 4;

        const x = i % writeRenderTarget.width;
        let y = Math.floor(i / writeRenderTarget.width);
        y = writeRenderTarget.height - y - 1;
        
        const index = y * writeRenderTarget.width + x;

        reconstructedDepthFloats[index] = reconstructedDepthFloatsImageData[j];
      }

      globalThis.reconstructedDepthFloats = reconstructedDepthFloats;

      // draw to canvas
      const canvas = document.createElement('canvas');
      canvas.classList.add('reconstructionCanvas');
      canvas.width = writeRenderTarget.width;
      canvas.height = writeRenderTarget.height;
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < reconstructedDepthFloatsImageData.length; i += 4) {
        const r = reconstructedDepthFloatsImageData[i];
        const g = reconstructedDepthFloatsImageData[i+1];
        const b = reconstructedDepthFloatsImageData[i+2];
        const a = reconstructedDepthFloatsImageData[i+3];

        const j = i / 4;
        const x = j % canvas.width;
        const y = Math.floor(j / canvas.width);

        const viewZ = r;
        const localViewPoint = localVector.set(x / canvas.width, y / canvas.height, viewZ)
          .applyMatrix4(this.camera.projectionMatrixInverse);
        const localViewZ = localViewPoint.z;
        const localDepthZ = -localViewZ;

        const index = y * canvas.width + x;
        data[index*4 + 0] = localDepthZ / 30 * 255;
        data[index*4 + 1] = g;
        data[index*4 + 2] = b;
        data[index*4 + 3] = 255;
      }
      context.putImageData(imageData, 0, 0);
      document.body.appendChild(canvas);
    }
    console.timeEnd('reconstructZ');

    // return result
    return {
      maskImg: maskImgArrayBuffer,
      editedImg: editedImgArrayBuffer,
      pointCloudHeaders,
      pointCloud: pointCloudArrayBuffer,
      depthFloatImageData,
      // indexColorsAlphasArray,
      newDepthFloatImageData,
      reconstructedDepthFloats,
    };
  }
  createOutmeshLayer(layerEntries) {
    if (!globalThis.outmeshing) {
      globalThis.outmeshing = 1;
    } else {
      console.warn('already outmeshing: ' + globalThis.outmeshing);
      debugger;
    }
    const _getLayerEntry = key => layerEntries.find(layerEntry => layerEntry.key.endsWith('/' + key))?.value;
    const maskImg = _getLayerEntry('maskImg');
    const editedImg = _getLayerEntry('editedImg');
    const pointCloudHeaders = _getLayerEntry('pointCloudHeaders');
    const pointCloud = _getLayerEntry('pointCloud');
    const depthFloatImageData = _getLayerEntry('depthFloatImageData');
    // const indexColorsAlphasArray = _getLayerEntry('indexColorsAlphasArray');
    const newDepthFloatImageData = _getLayerEntry('newDepthFloatImageData');
    const reconstructedDepthFloats = _getLayerEntry('reconstructedDepthFloats');

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
      // geometry is camera-relative
      const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
      pointCloudArrayBufferToPositionAttributeArray(pointCloud, geometry.attributes.position.array, 1 / panelSize);
      // _cutMask(geometry, maskImageData);
      geometry.computeVertexNormals();
      const material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8,
      });
      const backgroundMesh = new THREE.Mesh(geometry, material);
      backgroundMesh.name = 'backgroundMesh';
      backgroundMesh.position.copy(this.camera.position);
      backgroundMesh.quaternion.copy(this.camera.quaternion);
      backgroundMesh.scale.copy(this.camera.scale);
      backgroundMesh.matrix.copy(this.camera.matrix);
      backgroundMesh.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh.frustumCulled = false;

      console.time('reconstructZ');
      {
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
        const depthRenderSkipRatio = 8;
        depthCubesMesh.count = 0;
        for (let i = 0; i < depthFloatImageData.length; i += depthRenderSkipRatio) {
          const x = (i % this.renderer.domElement.width) / this.renderer.domElement.width;
          let y = Math.floor(i / this.renderer.domElement.width) / this.renderer.domElement.height;
          y = 1 - y;

          const viewZ = depthFloatImageData[i];
          const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, this.camera, localVector);
          const target = worldPoint.applyMatrix4(this.camera.matrixWorld);

          localMatrix.makeTranslation(target.x, target.y, target.z);
          depthCubesMesh.setMatrixAt(i / depthRenderSkipRatio, localMatrix);
          depthCubesMesh.count++;
        }
        depthCubesMesh.instanceMatrix.needsUpdate = true;
      }
      console.timeEnd('reconstructZ');

      console.time('cutDepth');
      // const wrappedPositions = geometry.attributes.position.array.slice();
      _cutDepth(geometry, depthFloatImageData);
      console.timeEnd('cutDepth');

      // copy the geometry, including the attributes
      const geometry2 = geometry.clone();
      const material2 = new THREE.MeshPhongMaterial({
        color: 0x0000ff,
        transparent: true,
        opacity: 0.4,
      });
      const backgroundMesh2 = new THREE.Mesh(geometry2, material2);
      backgroundMesh2.name = 'backgroundMesh2';
      backgroundMesh2.position.copy(this.camera.position);
      backgroundMesh2.quaternion.copy(this.camera.quaternion);
      backgroundMesh2.scale.copy(this.camera.scale);
      backgroundMesh2.matrix.copy(this.camera.matrix);
      backgroundMesh2.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh2.frustumCulled = false;
      console.timeEnd('backgroundMesh');

      geometry.computeVertexNormals();

      layerScene.add(backgroundMesh);
      layerScene.add(backgroundMesh2);
    })();

    return layerScene;
  }
  updateOutmeshLayers() {
    const layers = this.panel.getDataLayersMatchingSpec(layer2Specs);

    console.log('update outmesh layers', layers.length, this.layerScenes.length);

    const _addNewLayers = () => {
      const startLayer = 2;
      for (let i = startLayer; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layerDatas = layers[i];
          console.log ('pre add layer scene', i, layerDatas);
          layerScene = this.createOutmeshLayer(layerDatas);
          console.log('add layer scene', i, layerScene);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        console.log('remove layer scene', i, layerScene);
        this.scene.remove(layerScene);
      }
      console.log('set layer scenes', layers.length);
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();

    console.log('ending layer scenes length', this.layerScenes.length);
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
    // applySkybox(geometry.attributes.position.array);

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
  getDataLayersMatchingSpec(layersSpecs) {
    return this.getDataLayersMatchingSpecs([layersSpecs]);
  }
  getDataLayersMatchingSpecs(layersSpecsArray) {
    const maxLayers = 10;
    const layers = [];
    for (let i = 0; i < maxLayers; i++) {
      const layerDatas = this.getDatas().filter(({key}) => {
        return key.startsWith('layer' + i + '/');
      });
      if (layersSpecsArray.some(layersSpecs =>
        layersSpecs.every(spec => {
          return layerDatas.some(({key}) => key.endsWith('/' + spec.name));
        })
      )) {
        layers[i] = layerDatas;
      }
    }
    return layers;
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