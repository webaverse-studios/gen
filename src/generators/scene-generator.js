import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import alea from '../utils/alea.js';
import {JFAOutline, renderDepthReconstruction} from '../utils/jfaOutline.js';

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

import {blob2img, img2ImageData} from '../utils/convert-utils.js';
import {makeId} from '../utils/id-utils.js';
import {labelClasses} from '../constants/prompts.js';
// import {downloadFile} from '../utils/http-utils.js';

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
  // {
  //   name: 'planeMatrices',
  //   type: 'json',
  // },
  {
    name: 'planesJson',
    type: 'json',
  },
  {
    name: 'planesIndices',
    type: 'arrayBuffer',
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
export const tools = [
  'camera',
  'eraser',
];

//

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

const localVector = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
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
  function viewZToOrthographicDepth(viewZ, near, far) {
    return ( viewZ + near ) / ( near - far );
  }
  function orthographicDepthToViewZ(orthoZ, near, far) {
    return orthoZ * ( near - far ) - near;
  }

  return (x, y, viewZ, camera, target) => {
    const {near, far, projectionMatrix, projectionMatrixInverse} = camera;
    
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
const getDepthFloatsFromPointCloud = (pointCloudArrayBuffer, ) => {
  const geometryPositions = new Float32Array(panelSize * panelSize * 3);
  pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometryPositions, 1 / panelSize);

  const newDepthFloatImageData = new Float32Array(geometryPositions.length / 3);
  for (let i = 0; i < newDepthFloatImageData.length; i++) {
    newDepthFloatImageData[i] = geometryPositions[i * 3 + 2];
  }
  return newDepthFloatImageData;
};
const makeFloatRenderTargetSwapChain = (width, height) => {
  const targets = Array(2);
  for (let i = 0; i < 2; i++) {
    targets[i] = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    });
  }
  return targets;
};

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

const selectorSize = 8 + 1;
class Selector {
  constructor({
    renderer,
    camera,
    mouse,
    raycaster,
  }) {
    this.renderer = renderer;
    this.camera = camera;
    this.mouse = mouse;
    this.raycaster = raycaster;
    
    const lensRenderTarget = new THREE.WebGLRenderTarget(selectorSize, selectorSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.lensRenderTarget = lensRenderTarget;

    const indexMaterial = new THREE.ShaderMaterial({
      uniforms: {
        viewport: {
          value: new THREE.Vector4(),
          needsUpdate: true,
        },
        iResolution: {
          value: new THREE.Vector2(),
          needsUpdate: true,
        },
        selectorSize: {
          value: selectorSize,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform vec4 viewport;
        uniform vec2 iResolution;
        uniform float selectorSize;
        attribute float triangleId;
        varying float vIndex;

        void main() {
          // get the triangle index, dividing by 3
          // vIndex = gl_VertexID / 3;
          
          vIndex = triangleId;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          float w = gl_Position.w;
          gl_Position /= w;
          
          // viewport is [x, y, width, height], in the range [0, iResolution]
          // iResolution is [width, height]
          // update gl_Position so that the view is zoomed in on the viewport:
          gl_Position.xy = (gl_Position.xy + 1.0) / 2.0;
          gl_Position.xy *= iResolution;
          gl_Position.xy -= viewport.xy;
          gl_Position.xy /= viewport.zw;
          gl_Position.xy = gl_Position.xy * 2.0 - 1.0;

          gl_Position *= w;
        }
      `,
      fragmentShader: `\
        varying float vIndex;

        void main() {
          float fIndex = vIndex;

          // encode the index as rgb
          float r = floor(fIndex / 65536.0);
          fIndex -= r * 65536.0;
          float g = floor(fIndex / 256.0);
          fIndex -= g * 256.0;
          float b = fIndex;

          gl_FragColor = vec4(r, g, b, 1.);
        }
      `,
    });
    this.indexMaterial = indexMaterial;

    const lensScene = new THREE.Scene();
    lensScene.autoUpdate = false;
    lensScene.overrideMaterial = indexMaterial;
    this.lensScene = lensScene;

    const lensOutputMesh = (() => {
      const geometry = new THREE.PlaneBufferGeometry(1, 1);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tIndex: {
            value: lensRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D tIndex;
          varying vec2 vUv;
          void main() {
            vec4 indexRgba = texture2D(tIndex, vUv);
            
            // encode the index as rgba
            // float r = floor(fIndex / 65536.0);
            // fIndex -= r * 65536.0;
            // float g = floor(fIndex / 256.0);
            // fIndex -= g * 256.0;
            // float b = floor(fIndex / 1.0);
            // fIndex -= b * 1.0;
            // gl_FragColor = vec4(r, g, b, 1.);

            gl_FragColor = vec4(indexRgba.rgb / 255.0, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.lensOutputMesh = lensOutputMesh;

    // index full screen pass 
    const indicesRenderTarget = new THREE.WebGLRenderTarget((panelSize - 1) * 2, panelSize - 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.indicesRenderTarget = indicesRenderTarget;

    const indicesScene = new THREE.Scene();
    indicesScene.autoUpdate = false;
    this.indicesScene = indicesScene;

    const indicesOutputMesh = (() => {
      const scale = 10;
      const geometry = new THREE.PlaneBufferGeometry(2, 1)
        .scale(scale, scale, scale);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          indicesTexture: {
            value: indicesRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D indicesTexture;
          varying vec2 vUv;
          void main() {
            vec4 indicesRgba = texture2D(indicesTexture, vUv);
            gl_FragColor = vec4(indicesRgba.rgb, 1.0);
            gl_FragColor.rg += 0.5 * vUv;
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.indicesOutputMesh = indicesOutputMesh;
  }
  addMesh(mesh) {
    // lens mesh
    const selectorWindowMesh = mesh.clone();
    this.lensScene.add(selectorWindowMesh);
    
    // indices mesh
    const indicesMesh = (() => {
      const planeGeometry = new THREE.PlaneBufferGeometry(1, 1)
        .translate(0.5, 0.5, 0);
      // position x, y is in the range [0, 1]
      const sceneMeshGeometry = mesh.geometry;

      const {width, height} = this.indicesRenderTarget;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // const coords = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // for each plane, we copy in the sceneMeshGeometry triangle vertices it represents
      /* const triangles = new Float32Array(9 * planeGeometry.attributes.position.array.length * width * height);
      if (triangles.length !== sceneMeshGeometry.attributes.position.array * 9) {
        console.warn('triangle count mismatch 1', triangles.length, sceneMeshGeometry.attributes.position.array * 9);
        debugger;
      }
      if (triangles.length !== positions.length * 3) {
        console.warn('triangle count mismatch 2', positions.length, triangles.length * 3);
        debugger;
      } */
      if (width * height * 9 !== sceneMeshGeometry.attributes.position.array.length) {
        console.warn('invalid width/height', width, height, sceneMeshGeometry.attributes.position.array.length);
        debugger;
      }
      const pt1 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt2 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt3 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // if (pt1.length !== sceneMeshGeometry.attributes.position.array.length * 3) {
      //   console.warn('triangle count mismatch 1', pt1.length, sceneMeshGeometry.attributes.position.array.length * 3);
      //   debugger;
      // }
      const indices = new Uint32Array(planeGeometry.index.array.length * width * height);
      let positionOffset = 0;
      let indexOffset = 0;
      let triangleReadOffset = 0;
      let triangleWriteOffset = 0;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const uvx = dx / width;
          const uvy = dy / height;

          // convert to ndc
          const ndcx = uvx * 2 - 1;
          const ndcy = uvy * 2 - 1;

          for (let i = 0; i < planeGeometry.attributes.position.array.length; i += 3) {

            // get the position offset
            // note: * 2 because we are in the range [-1, 1]
            const pox = planeGeometry.attributes.position.array[i + 0] / width * 2;
            const poy = planeGeometry.attributes.position.array[i + 1] / height * 2;

            // copy position
            positions[positionOffset + i + 0] = ndcx + pox;
            positions[positionOffset + i + 1] = ndcy + poy;
            positions[positionOffset + i + 2] = 0;

            // coord
            // const index = dx + dy * selectorSize;
            // coords[positionOffset + i + 0] = dx;
            // coords[positionOffset + i + 1] = dy;
            // coords[positionOffset + i + 2] = index;

            // triangle
            pt1[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 0];
            pt1[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 1];
            pt1[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 2];

            pt2[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 3];
            pt2[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 4];
            pt2[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 5];

            pt3[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 6];
            pt3[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 7];
            pt3[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 8];
          }
          positionOffset += planeGeometry.attributes.position.array.length;

          triangleWriteOffset += planeGeometry.attributes.position.array.length;
          triangleReadOffset += 9;

          const localIndexOffset = positionOffset / 3;
          for (let i = 0; i < planeGeometry.index.array.length; i++) {
            indices[indexOffset + i] = planeGeometry.index.array[i] + localIndexOffset;
          }
          indexOffset += planeGeometry.index.array.length;
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      // geometry.setAttribute('coord', new THREE.BufferAttribute(coords, 3));
      geometry.setAttribute('point1', new THREE.BufferAttribute(pt1, 3));
      geometry.setAttribute('point2', new THREE.BufferAttribute(pt2, 3));
      geometry.setAttribute('point3', new THREE.BufferAttribute(pt3, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          iResolution: {
            value: new THREE.Vector2(width, height),
            needsUpdate: true,
          },
        },
        vertexShader: `\
          attribute vec3 point1;
          attribute vec3 point2;
          attribute vec3 point3;
          varying vec3 vPoint1;
          varying vec3 vPoint2;
          varying vec3 vPoint3;

          void main() {
            vPoint1 = point1;
            vPoint2 = point2;
            vPoint3 = point3;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform vec2 iResolution;
          varying vec3 vPoint1;
          varying vec3 vPoint2;
          varying vec3 vPoint3;

          struct Point {
            float x;
            float y;
          };
          struct Triangle {
            Point a;
            Point b;
            Point c;
          };

          bool pointInTriangle(Point point, Triangle triangle) {
            //compute vectors & dot products
            float cx = point.x;
            float cy = point.y;
            Point t0 = triangle.a;
            Point t1 = triangle.b;
            Point t2 = triangle.c;
            float v0x = t2.x-t0.x;
            float v0y = t2.y-t0.y;
            float v1x = t1.x-t0.x;
            float v1y = t1.y-t0.y;
            float v2x = cx-t0.x;
            float v2y = cy-t0.y;
            float dot00 = v0x*v0x + v0y*v0y;
            float dot01 = v0x*v1x + v0y*v1y;
            float dot02 = v0x*v2x + v0y*v2y;
            float dot11 = v1x*v1x + v1y*v1y;
            float dot12 = v1x*v2x + v1y*v2y;
          
            // Compute barycentric coordinates
            float b = (dot00 * dot11 - dot01 * dot01);
            float inv = (b == 0.) ? 0. : (1. / b);
            float u = (dot11*dot02 - dot01*dot12) * inv;
            float v = (dot00*dot12 - dot01*dot02) * inv;
            return u>=0. && v>=0. && (u+v < 1.);
          }
          bool pointCircleCollision(Point point, Point circle, float r) {
            if (r==0.) return false;
            float dx = circle.x - point.x;
            float dy = circle.y - point.y;
            return dx * dx + dy * dy <= r * r;
          }
          bool lineCircleCollision(Point a, Point b, Point circle, float radius/*, nearest*/) {
            //check to see if start or end points lie within circle 
            if (pointCircleCollision(a, circle, radius)) {
              // if (nearest) {
              //     nearest[0] = a[0]
              //     nearest[1] = a[1]
              // }
              return true;
            } if (pointCircleCollision(b, circle, radius)) {
              // if (nearest) {
              //     nearest[0] = b[0]
              //     nearest[1] = b[1]
              // }
              return true;
            }
            
            float x1 = a.x;
            float y1 = a.y;
            float x2 = b.x;
            float y2 = b.y;
            float cx = circle.x;
            float cy = circle.y;
      
            //vector d
            float dx = x2 - x1;
            float dy = y2 - y1;
            
            //vector lc
            float lcx = cx - x1;
            float lcy = cy - y1;
            
            //project lc onto d, resulting in vector p
            float dLen2 = dx * dx + dy * dy; //len2 of d
            float px = dx;
            float py = dy;
            if (dLen2 > 0.) {
              float dp = (lcx * dx + lcy * dy) / dLen2;
              px *= dp;
              py *= dp;
            }
            
            // if (!nearest)
            //     nearest = tmp
            // const tmp = [0, 0]
            Point tmp;
            tmp.x = x1 + px;
            tmp.y = y1 + py;
            
            //len2 of p
            float pLen2 = px * px + py * py;
            
            //check collision
            return pointCircleCollision(tmp, circle, radius) &&
              pLen2 <= dLen2 &&
              (px * dx + py * dy) >= 0.;
          }

          bool triangleCircleCollision(Triangle triangle, Point circle, float radius) {
            if (pointInTriangle(circle, triangle))
                return true;
            if (lineCircleCollision(triangle.a, triangle.b, circle, radius))
                return true;
            if (lineCircleCollision(triangle.b, triangle.c, circle, radius))
                return true;
            if (lineCircleCollision(triangle.c, triangle.a, circle, radius))
                return true;
            return false;
          }

          void main() {
            gl_FragColor = vec4(1.);
          }
        `,
      });
      const resultMesh = new THREE.Mesh(geometry, material);
      resultMesh.frustumCulled = false;
      return resultMesh;
    })();
    this.indicesScene.add(indicesMesh);
  }
  update() {
    // push
    const oldRenderTarget = this.renderer.getRenderTarget();

    // update
    {
      const selectorSizeM1 = selectorSize - 1;
      const halfSelectorSizeM1 = selectorSizeM1 / 2;
      this.indexMaterial.uniforms.viewport.value.set(
        (this.mouse.x / 2 + 0.5) * this.renderer.domElement.width - halfSelectorSizeM1 - 1,
        (this.mouse.y / 2 + 0.5) * this.renderer.domElement.height - halfSelectorSizeM1 - 1,
        selectorSize,
        selectorSize
      );
      this.indexMaterial.uniforms.viewport.needsUpdate = true;
      this.indexMaterial.uniforms.iResolution.value.set(this.renderer.domElement.width, this.renderer.domElement.height);
      this.indexMaterial.uniforms.iResolution.needsUpdate = true;
    }

    // render lens
    this.renderer.setRenderTarget(this.lensRenderTarget);
    this.renderer.render(this.lensScene, this.camera);

    // render indices scene
    this.renderer.setRenderTarget(this.indicesRenderTarget);
    this.renderer.render(this.indicesScene, this.camera);

    // pop
    this.renderer.setRenderTarget(oldRenderTarget);
  }
}

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

    this.tool = tools[0];
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

    // mouse
    const mouse = new THREE.Vector2();
    this.mouse = mouse;

    // raycaster
    const raycaster = new THREE.Raycaster();
    this.raycaster = raycaster;

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
    // const planeMatrices = panel.getData('layer1/planeMatrices');
    const planesJson = panel.getData('layer1/planesJson');
    const planesIndices = panel.getData('layer1/planesIndices');
    const predictedHeight = panel.getData('layer1/predictedHeight');
    // console.log('got panel datas', panel.getDatas());

    // camera
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // scene mesh
    const widthSegments = this.canvas.width - 1;
    const heightSegments = this.canvas.height - 1;
    let geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/this.canvas.width);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
    pointCloudArrayBufferToColorAttributeArray(labelImageData, geometry.attributes.color.array);
    // _cutSkybox(geometry);
    // applySkybox(geometry.attributes.position.array);
    geometry = geometry.toNonIndexed();
    // add extra triangeId attribute
    const triangleIdAttribute = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1);
    for (let i = 0; i < triangleIdAttribute.count; i++) {
      triangleIdAttribute.array[i] = Math.floor(i / 3);
    }
    geometry.setAttribute('triangleId', triangleIdAttribute);
    
    // texture
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

    // mesh
    const sceneMesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          map: {
            value: map,
            needsUpdate: true,
          },
          selectedIndicesMap: {
            value: null,
            needsUpdate: false,
          },
          iSelectedIndicesMapResolution: {
            value: new THREE.Vector2(),
            needsUpdate: false,
          },
        },
        vertexShader: `\
          attribute float triangleId;
          varying vec2 vUv;
          varying float vTriangleId;
          
          void main() {
            vUv = uv;
            vTriangleId = triangleId;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D map;
          uniform sampler2D selectedIndicesMap;
          uniform vec2 iSelectedIndicesMapResolution;
          varying vec2 vUv;
          varying float vTriangleId;

          void main() {
            gl_FragColor = texture2D(map, vUv);
            
            // check for selection
            float x = mod(vTriangleId, iSelectedIndicesMapResolution.x);
            float y = floor(vTriangleId / iSelectedIndicesMapResolution.x);
            vec2 uv = (vec2(x, y) + 0.5) / iSelectedIndicesMapResolution;
            vec4 selectedIndexRgba = texture2D(selectedIndicesMap, uv);
            bool isSelected = selectedIndexRgba.r > 0.5;
            if (isSelected) {
              gl_FragColor.rgb *= 0.2;
            }
          }
        `,
      }),
    );
    sceneMesh.name = 'sceneMesh';
    sceneMesh.frustumCulled = false;
    this.scene.add(sceneMesh);
    this.sceneMesh = sceneMesh;

    // globalThis.sceneMesh = sceneMesh;

    // selector
    {
      const selector = new Selector({
        renderer,
        camera,
        mouse,
        raycaster,
      });
      selector.addMesh(sceneMesh);

      selector.lensOutputMesh.position.x = -10;
      selector.lensOutputMesh.updateMatrixWorld();
      scene.add(selector.lensOutputMesh);
      
      selector.indicesOutputMesh.position.x = -10;
      selector.indicesOutputMesh.position.z = -10;
      selector.indicesOutputMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      selector.indicesOutputMesh.updateMatrixWorld();
      scene.add(selector.indicesOutputMesh);
      
      sceneMesh.material.uniforms.selectedIndicesMap.value = selector.indicesRenderTarget.texture;
      sceneMesh.material.uniforms.selectedIndicesMap.needsUpdate = true;
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.value.set(selector.indicesRenderTarget.width, selector.indicesRenderTarget.height);
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.needsUpdate = true;

      this.selector = selector;
    }

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

    /* // planes mesh
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
    this.planesMesh = planesMesh; */

    // bootstrap
    this.listen();
    this.animate();
  }
  setTool(tool) {
    this.tool = tool;

    this.controls.enabled = this.tool === 'camera';
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

    const mousemove = e => {
      // set the THREE.js.Raycaster from the mouse event
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mouse.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(this.mouse, this.camera);
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', blockEvent);
    canvas.addEventListener('mouseup', blockEvent);
    canvas.addEventListener('mousemove', mousemove);
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
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      this.panel.removeEventListener('update', update);
    });
  }
  animate() {
    const _startLoop = () => {
      const _render = () => {
        switch (this.tool) {
          case 'camera': {
            // update orbit controls
            this.controls.update();
            this.camera.updateMatrixWorld();
            break;
          }
          case 'eraser': {
            this.selector.update();
            break;
          }
        }

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
      depthFloatImageData = floatImageData(_renderOverrideMaterial(depthRenderTarget)); // viewZ
    }
    console.timeEnd('renderDepth');

    console.time('extractDepths');
    const newDepthFloatImageData = getDepthFloatsFromPointCloud(pointCloudArrayBuffer);
    console.timeEnd('extractDepths');

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
      const targets = makeFloatRenderTargetSwapChain(this.renderer.domElement.width, this.renderer.domElement.height);

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
      const targets = makeFloatRenderTargetSwapChain(this.renderer.domElement.width, this.renderer.domElement.height);

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
      // globalThis.depthFloatImageData = depthFloatImageData;
      // globalThis.newDepthFloatImageData = newDepthFloatImageData;
      // globalThis.reconstructedDepthFloats = reconstructedDepthFloats;

      // draw to canvas
      const canvas = document.createElement('canvas');
      canvas.classList.add('reconstructionCanvas');
      canvas.width = writeRenderTarget.width;
      canvas.height = writeRenderTarget.height;
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < depthFloatImageData.length; i++) {
        const x = (i % canvas.width);
        const y = Math.floor(i / canvas.width);

        const px = x / canvas.width;
        const py = y / canvas.height;

        // const viewZ = r;
        // const localViewPoint = localVector.set(x / canvas.width, y / canvas.height, viewZ)
        //   .applyMatrix4(this.camera.projectionMatrixInverse);
        // const localViewZ = localViewPoint.z;
        // const localDepthZ = -localViewZ;

        const viewZ = reconstructedDepthFloats[i];
        const worldPoint = setCameraViewPositionFromViewZ(px, py, viewZ, this.camera, localVector);

        const index = y * canvas.width + x;
        data[index*4 + 0] = -worldPoint.z / 30 * 255;
        data[index*4 + 1] = 0;
        data[index*4 + 2] = 0;
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
      // const maskImgBlob = new Blob([maskImg], {type: 'image/png'});
      // const maskImageBitmap = await createImageBitmap(maskImgBlob);
      // const canvas = document.createElement('canvas');
      // canvas.width = maskImageBitmap.width;
      // canvas.height = maskImageBitmap.height;
      // const context = canvas.getContext('2d');
      // context.drawImage(maskImageBitmap, 0, 0);
      // const maskImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const maskImageData = img2ImageData(maskImg);
      
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
        const depthCubesMesh = new THREE.InstancedMesh(depthCubesGeometry, depthCubesMaterial, newDepthFloatImageData.length);
        depthCubesMesh.name = 'depthCubesMesh';
        depthCubesMesh.frustumCulled = false;
        layerScene.add(depthCubesMesh);

        // set the matrices by projecting the depth from the perspective camera
        const depthRenderSkipRatio = 8;
        depthCubesMesh.count = 0;
        for (let i = 0; i < newDepthFloatImageData.length; i += depthRenderSkipRatio) {
          const x = (i % this.renderer.domElement.width) / this.renderer.domElement.width;
          let y = Math.floor(i / this.renderer.domElement.width) / this.renderer.domElement.height;
          y = 1 - y;

          const viewZ = reconstructedDepthFloats[i];
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

    // console.log('update outmesh layers', layers.length, this.layerScenes.length);

    const _addNewLayers = () => {
      const startLayer = 2;
      for (let i = startLayer; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layerDatas = layers[i];
          // console.log ('pre add layer scene', i, layerDatas);
          layerScene = this.createOutmeshLayer(layerDatas);
          // console.log('add layer scene', i, layerScene);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        // console.log('remove layer scene', i, layerScene);
        this.scene.remove(layerScene);
      }
      // console.log('set layer scenes', layers.length);
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();

    // console.log('ending layer scenes length', this.layerScenes.length);
  }
  destroy() {
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}

//

/* const _getPlanesRansac = async points => {
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
}; */
const _getPlanesRgbd = async (width, height, depthFloats32Array) => {
  const header = Int32Array.from([width, height]);

  const requestBlob = new Blob([header, depthFloats32Array], {
    type: 'application/octet-stream',
  });

  const minSupport = 50000;
  const res = await fetch(`https://depth.webaverse.com/planeDetection?minSupport=${minSupport}`, {
    method: 'POST',
    body: requestBlob,
  });
  if (res.ok) {
    const planesArrayBuffer = await res.arrayBuffer();
    const dataView = new DataView(planesArrayBuffer);
    
    // parse number of planes
    let index = 0;
    const numPlanes = dataView.getUint32(index, true);
    index += Uint32Array.BYTES_PER_ELEMENT;
    
    // parse the planes
    const planesJson = [];
    for (let i = 0; i < numPlanes; i++) {
      const normal = new Float32Array(planesArrayBuffer, index, 3);
      index += Float32Array.BYTES_PER_ELEMENT * 3;
      const center = new Float32Array(planesArrayBuffer, index, 3);
      index += Float32Array.BYTES_PER_ELEMENT * 3;
      const numVertices = dataView.getUint32(index, true);
      index += Uint32Array.BYTES_PER_ELEMENT;
      const distanceSquaredF = new Float32Array(planesArrayBuffer, index, 1);
      index += Float32Array.BYTES_PER_ELEMENT;
      
      // console.log('plane', i, normal, center, numVertices, distanceSquaredF);
      const planeJson = {
        normal,
        center,
        numVertices,
        distanceSquaredF,
      };
      planesJson.push(planeJson);
    }

    // the remainder is a Int32Array(width * height) of plane indices
    const planesIndices = new Int32Array(planesArrayBuffer, index);
    index += Int32Array.BYTES_PER_ELEMENT * planesIndices.length;
    if (planesIndices.length !== width * height) {
      throw new Error('plane indices length mismatch');
    }

    return {
      planesJson,
      planesIndices,
    };
  } else {
    throw new Error('failed to detect planes');
  }
};
const _getImageSegements = async imgBlob => {
  const threshold = 0.5;
  const res = await fetch(`https://mask2former.webaverse.com/predict?threshold=${threshold}`, {
    method: 'POST',
    body: imgBlob,
  });
  if (res.ok) {
    const segmentsBlob = await res.blob();
    const resHeaders = Object.fromEntries(res.headers.entries());

    // const labelImg = await blob2img(segmentsBlob);
    const boundingBoxLayers = JSON.parse(resHeaders['x-bounding-boxes']);
    // console.log('got bounding boxes', boundingBoxLayers);
    // const labelCanvas = drawLabelCanvas(labelImg, boundingBoxLayers);

    return {
      segmentsBlob,
      boundingBoxLayers,
    };

    // const segmentsArrayBuffer = await res.arrayBuffer();
    // const segments = new Uint8Array(segmentsArrayBuffer);
    // return segments;
  } else {
    throw new Error('failed to detect image segments');
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
  const labelImageData = img2ImageData(labelImg).data.buffer;
  const boundingBoxLayers = JSON.parse(labelHeaders['x-bounding-boxes']);
  // const labelCanvas = drawLabelCanvas(labelImg, boundingBoxLayers);
  // document.body.appendChild(labelCanvas);

  /* // image segmentation
  console.time('imageSegmentation');
  let imageSegmentationSpec;
  {
    imageSegmentationSpec = await _getImageSegements(blob);
    console.log('got image segmentation spec', imageSegmentationSpec);
  }
  console.timeEnd('imageSegmentation'); */

  // point cloud reconstruction
  console.time('pointCloud');
  const {
    headers: pointCloudHeaders,
    arrayBuffer: pointCloudArrayBuffer,
  } = await getPointCloud(blob);
  console.timeEnd('pointCloud');

  // plane detection
  console.time('planeDetection');
  let planesJson;
  let planesIndices;
  {
    const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer);
    
    const {width, height} = img;
    const planesSpec = await _getPlanesRgbd(width, height, depthFloats32Array);
    console.log('got planes spec', planesSpec);
    planesJson = planesSpec.planesJson;
    planesIndices = planesSpec.planesIndices;
  }
  console.timeEnd('planeDetection');

  // run ransac
  /* const planeMatrices = [];
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
    const planesJson = await _getPlanesRansac(points2);
    // draw detected planes
    for (let i = 0; i < planesJson.length; i++) {
      const plane = planesJson[i];
      const [planeEquation, planePointIndices] = plane; // XXX note the planesIndices are computed relative to the current points set after removing all previous planes; these are not global indices
      
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
  } */

  // query the height
  const predictedHeight = await _getPredictedHeight(blob);
  // console.log('got predicted height', predictedHeight);

  // return result
  return {
    labelImageData,
    pointCloudHeaders,
    pointCloud: pointCloudArrayBuffer,
    boundingBoxLayers,
    // planeMatrices,
    planesJson,
    planesIndices,
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

//

function triangleCircleCollision(triangle, circle, radius) {
  if (pointInTriangle(circle, triangle))
      return true
  if (lineCircleCollision(triangle[0], triangle[1], circle, radius))
      return true
  if (lineCircleCollision(triangle[1], triangle[2], circle, radius))
      return true
  if (lineCircleCollision(triangle[2], triangle[0], circle, radius))
      return true
  return false
}

function pointInTriangle(point, triangle) {
  //compute vectors & dot products
  var cx = point[0], cy = point[1],
      t0 = triangle[0], t1 = triangle[1], t2 = triangle[2],
      v0x = t2[0]-t0[0], v0y = t2[1]-t0[1],
      v1x = t1[0]-t0[0], v1y = t1[1]-t0[1],
      v2x = cx-t0[0], v2y = cy-t0[1],
      dot00 = v0x*v0x + v0y*v0y,
      dot01 = v0x*v1x + v0y*v1y,
      dot02 = v0x*v2x + v0y*v2y,
      dot11 = v1x*v1x + v1y*v1y,
      dot12 = v1x*v2x + v1y*v2y

  // Compute barycentric coordinates
  var b = (dot00 * dot11 - dot01 * dot01),
      inv = b === 0 ? 0 : (1 / b),
      u = (dot11*dot02 - dot01*dot12) * inv,
      v = (dot00*dot12 - dot01*dot02) * inv
  return u>=0 && v>=0 && (u+v < 1)
}

function pointCircleCollision(point, circle, r) {
  if (r===0) return false
  var dx = circle[0] - point[0]
  var dy = circle[1] - point[1]
  return dx * dx + dy * dy <= r * r
}

const lineCircleCollision = (() => {
  const tmp = [0, 0]

  function lineCircleCollision(a, b, circle, radius/*, nearest*/) {
      //check to see if start or end points lie within circle 
      if (pointCircleCollision(a, circle, radius)) {
          // if (nearest) {
          //     nearest[0] = a[0]
          //     nearest[1] = a[1]
          // }
          return true
      } if (pointCircleCollision(b, circle, radius)) {
          // if (nearest) {
          //     nearest[0] = b[0]
          //     nearest[1] = b[1]
          // }
          return true
      }
      
      var x1 = a[0],
          y1 = a[1],
          x2 = b[0],
          y2 = b[1],
          cx = circle[0],
          cy = circle[1]

      //vector d
      var dx = x2 - x1
      var dy = y2 - y1
      
      //vector lc
      var lcx = cx - x1
      var lcy = cy - y1
      
      //project lc onto d, resulting in vector p
      var dLen2 = dx * dx + dy * dy //len2 of d
      var px = dx
      var py = dy
      if (dLen2 > 0) {
          var dp = (lcx * dx + lcy * dy) / dLen2
          px *= dp
          py *= dp
      }
      
      // if (!nearest)
      //     nearest = tmp
      tmp[0] = x1 + px
      tmp[1] = y1 + py
      
      //len2 of p
      var pLen2 = px * px + py * py
      
      //check collision
      return pointCircleCollision(tmp, circle, radius)
              && pLen2 <= dLen2 && (px * dx + py * dy) >= 0
  }
  return lineCircleCollision;
})();