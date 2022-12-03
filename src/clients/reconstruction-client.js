import * as THREE from 'three';
import materialColors from '../constants/material-colors.js';
import {
  renderMaskIndex,
  renderJfa,
  renderDepthReconstruction,
} from '../utils/jfaOutline.js';
import {
  makeRenderer,
} from '../utils/three-utils.js';
import {
  depthVertexShader,
  depthFragmentShader,
} from '../utils/sg-shaders.js';
import {
  panelSize,
} from '../constants/sg-constants.js';
import {
  maskIndex2Canvas,
  distanceFloats2Canvas,
  depthFloats2Canvas,
} from '../generators/sg-debug.js';

//

export const skyboxDistance = 5;
export const skyboxScaleFactor = 5;
export const pointcloudStride = 4 + 4 + 4 + 1 + 1 + 1;

//

const localVector = new THREE.Vector3();

//

export function drawPointCloudCanvas(arrayBuffer) {
  // python_types = (float, float, float, int, int, int)
  // npy_types = [('x', 'f4'), ('y', 'f4'), ('z', 'f4'), ('red', 'u1'), ('green', 'u1'), ('blue', 'u1')]
  const numPixels = arrayBuffer.byteLength / pointcloudStride;
  const width = Math.sqrt(numPixels);
  const height = width;
  if (width * height !== numPixels) {
    throw new Error('invalid point cloud dimensions');
  }
  // we want to parse the following ndarray into the canvas pixels
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const dataView = new DataView(arrayBuffer);
  for (let i = 0, j = 0; i < arrayBuffer.byteLength; i += pointcloudStride, j += 4) {
    const x = dataView.getFloat32(i + 0, true);
    const y = dataView.getFloat32(i + 4, true);
    const z = dataView.getFloat32(i + 8, true);
    const red = dataView.getUint8(i + 12);
    const green = dataView.getUint8(i + 13);
    const blue = dataView.getUint8(i + 14);

    const v = z/100;
    imageData.data[j + 0] = v;
    imageData.data[j + 1] = v;
    imageData.data[j + 2] = v;
    imageData.data[j + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

//

export function pointCloudArrayBufferToPositionAttributeArray(arrayBuffer, width, height, float32Array) { // result in float32Array
  // const numPixels = arrayBuffer.byteLength / pointcloudStride;
  // const width = Math.sqrt(numPixels);
  // const height = width;
  // // if (width * height !== numPixels) {
  // //   throw new Error('invalid point cloud dimensions');
  // // }

  const scaleFactor = 1 / width;

  const dataView = new DataView(arrayBuffer);
  for (let i = 0, j = 0; i < arrayBuffer.byteLength; i += pointcloudStride, j += 3) {
    let x = dataView.getFloat32(i + 0, true);
    let y = dataView.getFloat32(i + 4, true);
    let z = dataView.getFloat32(i + 8, true);

    x *= scaleFactor;
    y *= -scaleFactor;
    z *= -scaleFactor;

    float32Array[j + 0] = x;
    float32Array[j + 1] = y;
    float32Array[j + 2] = z;
  }
}
export function pointCloudArrayBufferToGeometry(arrayBuffer, width, height) {
  const widthSegments = width - 1;
  const heightSegments = height - 1;
  let geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  pointCloudArrayBufferToPositionAttributeArray(arrayBuffer, width, height, geometry.attributes.position.array);
  return geometry;
}

//

export const reinterpretFloatImageData = imageData => {
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

//

export function depthFloat32ArrayToPositionAttributeArray(
  depthFloat32Array,
  width,
  height,
  camera,
  float32Array,
) { // result in float32Array
  // const numPixels = depthFloat32Array.length;
  // const width = Math.sqrt(numPixels);
  // const height = width;
  for (let i = 0; i < depthFloat32Array.length; i++) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;
  
    const viewZ = depthFloat32Array[i];
    const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, camera, localVector);
    const target = worldPoint.applyMatrix4(camera.matrixWorld);

    target.toArray(float32Array, i * 3);
  }
}
export function depthFloat32ArrayToGeometry(
  depthFloat32Array,
  width,
  height,
  camera,
) { // result in float32Array
  const widthSegments = width - 1;
  const heightSegments = height - 1;
  // geometry is camera-relative
  const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  depthFloat32ArrayToPositionAttributeArray(
    depthFloat32Array,
    width,
    height,
    camera,
    geometry.attributes.position.array,
  );
  return geometry;
}

//

export function depthFloat32ArrayToOrthographicPositionAttributeArray(
  depthFloat32Array,
  width,
  height,
  camera,
  float32Array,
) { // result in float32Array
  for (let i = 0; i < depthFloat32Array.length; i++) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;
  
    const viewZ = depthFloat32Array[i];
    const worldPoint = setCameraViewPositionFromOrthographicViewZ(x, y, viewZ, camera, localVector);
    const target = worldPoint.applyMatrix4(camera.matrixWorld);

    target.toArray(float32Array, i * 3);
  }
}
export function depthFloat32ArrayToOrthographicGeometry(
  depthFloat32Array,
  width,
  height,
  camera,
) { // result in float32Array
  const widthSegments = width - 1;
  const heightSegments = height - 1;
  // geometry is camera-relative
  const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  depthFloat32ArrayToOrthographicPositionAttributeArray(
    depthFloat32Array,
    width,
    height,
    camera,
    geometry.attributes.position.array,
  );
  return geometry;
}

//

export function depthFloat32ArrayToHeightfield(
  depthFloat32Array,
  width,
  height,
  camera,
) {
  // const {near, far} = camera;

  const heightfield = new Float32Array(width * height);
  for (let i = 0; i < depthFloat32Array.length; i++) {
    let x = (i % width);
    let y = Math.floor(i / width);
    // y = height - 1 - y;
    x = width - 1 - x;

    const index = x + y * width;

    const viewZ = depthFloat32Array[i];
    const depth = camera.position.y - viewZ;
    heightfield[index] = depth;
  }
  return heightfield;

  // const widthSegments = width - 1;
  // const heightSegments = height - 1;
  // // geometry is camera-relative
  // const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  // depthFloat32ArrayToOrthographicPositionAttributeArray(
  //   depthFloat32Array,
  //   width,
  //   height,
  //   camera,
  //   geometry.attributes.position.array,
  // );
  // return geometry;
}

//

export const getGepthFloatsFromGeometryPositions = geometryPositions => {
  const newDepthFloatImageData = new Float32Array(geometryPositions.length / 3);
  for (let i = 0; i < newDepthFloatImageData.length; i++) {
    newDepthFloatImageData[i] = geometryPositions[i * 3 + 2];
  }
  return newDepthFloatImageData;
};
export const getDepthFloatsFromPointCloud = pointCloudArrayBuffer => {
  const geometryPositions = new Float32Array(panelSize * panelSize * 3);
  pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, panelSize, panelSize, geometryPositions);
  return getGepthFloatsFromGeometryPositions(geometryPositions);
};
export const getDepthFloatsFromIndexedGeometry = geometry => getGepthFloatsFromGeometryPositions(geometry.attributes.position.array);

//

export function getGeometryClipZMask(geometry, width, height, depthFloats32Array) {
  const clipZMask = new Uint8Array(geometry.attributes.position.array.length / 3).fill(255);

  const clipDistance = 0.1;

  // for all points in left to right
  const gridX = width - 1;
  const gridX1 = gridX + 1;
  const gridY = height - 1;
  // const gridY1 = gridY + 1;
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const x = ix;
      const y = iy;
      const x2 = x + 1;
      const y2 = y + 1;

      const aIndex = y * gridX1 + x;
      const bIndex = y * gridX1 + x2;
      const cIndex = y2 * gridX1 + x;
      const dIndex = y2 * gridX1 + x2;
      
      const aDepthFloat = depthFloats32Array[aIndex];
      const bDepthFloat = depthFloats32Array[bIndex];
      const cDepthFloat = depthFloats32Array[cIndex];
      const dDepthFloat = depthFloats32Array[dIndex];

      const topDepth = (aDepthFloat + bDepthFloat) / 2;
      const bottomDepth = (cDepthFloat + dDepthFloat) / 2;
      const leftDepth = (aDepthFloat + cDepthFloat) / 2;
      const rightDepth = (bDepthFloat + dDepthFloat) / 2;

      const topDownDepthDelta = Math.abs(bottomDepth - topDepth);
      const leftRightDepthDelta = Math.abs(rightDepth - leftDepth);
      if (
        topDownDepthDelta >= clipDistance ||
        leftRightDepthDelta >= clipDistance
      ) {
        // for ( let iy = 0; iy < gridY; iy ++ ) {
        //   for ( let ix = 0; ix < gridX; ix ++ ) {
        // const a = ix + gridX1 * iy;
        // const b = ix + gridX1 * ( iy + 1 );
        // const c = ( ix + 1 ) + gridX1 * ( iy + 1 );
        // const d = ( ix + 1 ) + gridX1 * iy;
        // indices.push( a, b, d );
        // indices.push( b, c, d );

        const index1 = (ix + gridX * iy) * 6;
        // for (let k = 0; k < 9 * 2; k++) {
        //   geometry.attributes.position.array[index1 * 3 + k] = 0;
        // }
        for (let k = 0; k < 6; k++) {
          clipZMask[index1 + k] = 0;
        }
      }
    }
  }

  return clipZMask;
}
export function applyGeometryClipZMask(geometry, clipZMask) {
  for (let i = 0; i < clipZMask.length; i++) {
    if (clipZMask[i] === 0) {
      const baseIndex = i * 3;
      geometry.attributes.position.array[baseIndex] = 0;
      geometry.attributes.position.array[baseIndex + 1] = 0;
      geometry.attributes.position.array[baseIndex + 2] = 0;
    }
  }
  geometry.attributes.position.needsUpdate = true;
}
export function clipGeometryZ(geometry, width, height, depthFloats32Array) {
  const clipZMask = getGeometryClipZMask(geometry, width, height, depthFloats32Array);
  // if (clipZMask.length !== geometry.attributes.position.array.length) {
  //   console.warn('wrong length', clipZMask, geometry.attributes.position.array);
  //   debugger;
  // }
  applyGeometryClipZMask(geometry, clipZMask);
}

//

export function decorateGeometryTriangleIds(geometry) {
  const triangleIdAttribute = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1);
  for (let i = 0; i < triangleIdAttribute.count; i++) {
    triangleIdAttribute.array[i] = Math.floor(i / 3);
  }
  geometry.setAttribute('triangleId', triangleIdAttribute);
}

//

export const mergeOperator = ({
  newDepthFloatImageData,
  width,
  height,
  camera,
  renderSpecs,
}) => {
  // clipZ
  renderSpecs = renderSpecs.map(renderSpec => {
    let {geometry, width, height, clipZ} = renderSpec;
    if (clipZ) {
      // geometry = geometry.clone();
      const depthFloats32Array = getDepthFloatsFromIndexedGeometry(geometry);
      geometry = geometry.toNonIndexed();
      const clipZMask = getGeometryClipZMask(geometry, width, height, depthFloats32Array);
      geometry.setAttribute('maskZ', new THREE.BufferAttribute(clipZMask, 1));
    } else {
      geometry = geometry.toNonIndexed();
    }
    decorateGeometryTriangleIds(geometry);
    return {
      geometry,
      width,
      height,
      clipZ,
    };
  });

  // canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.classList.add('mergeCanvas');
  document.body.appendChild(canvas);

  // renderer
  const renderer = makeRenderer(canvas);

  // render depth
  console.time('renderDepth');
  let oldDepthFloatImageData;
  const meshes = [];
  {
    const depthScene = new THREE.Scene();
    depthScene.autoUpdate = false;
    for (const renderSpec of renderSpecs) {
      const {geometry, clipZ} = renderSpec;
      
      let vertexShader = depthVertexShader;
      let fragmentShader = depthFragmentShader;
      let side = THREE.FrontSide;
      if (clipZ) {
        vertexShader = vertexShader.replace('// HEADER', `\
          // HEADER
          attribute float maskZ;
          varying float vMaskZ;
        `).replace('// POST', `\
          // POST
          vMaskZ = maskZ;
        `);
        fragmentShader = fragmentShader.replace('// HEADER', `\
          // HEADER
          varying float vMaskZ;
        `).replace('// POST', `\
          // POST
          if (vMaskZ < 0.5) {
            gl_FragColor = vec4(0., 0., 0., 0.);
          }
        `);
        side = THREE.BackSide;
      }
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cameraNear: {
            value: camera.near,
            needsUpdate: true,
          },
          cameraFar: {
            value: camera.far,
            needsUpdate: true,
          },
          isPerspective: {
            value: +camera.isPerspectiveCamera,
            needsUpdate: true,
          },
        },
        vertexShader,
        fragmentShader,
        side,
      });
      
      const depthMesh = new THREE.Mesh(geometry, material);
      depthMesh.name = 'depthMesh';
      depthMesh.frustumCulled = false;
      depthScene.add(depthMesh);
      meshes.push(depthMesh);
    }

    // render target
    const depthRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
      }
    );

    // render
    // render to the canvas, for debugging
    renderer.render(depthScene, camera);

    // real render to the render target
    renderer.setRenderTarget(depthRenderTarget);
    // renderer.clear();
    renderer.render(depthScene, camera);
    renderer.setRenderTarget(null);
    
    // read back image data
    const imageData = {
      data: new Uint8Array(depthRenderTarget.width * depthRenderTarget.height * 4),
      width,
      height,
    };
    renderer.readRenderTargetPixels(depthRenderTarget, 0, 0, depthRenderTarget.width, depthRenderTarget.height, imageData.data);

    // latch rendered depth data
    oldDepthFloatImageData = reinterpretFloatImageData(imageData); // viewZ
  }
  console.timeEnd('renderDepth');

  // render mask index
  console.log('render mask index', {
    renderer,
    renderSpecs,
    meshes,
    camera,
  });
  const maskIndex = renderMaskIndex({
    renderer,
    meshes,
    camera,
  });

  // render outline
  console.time('outline');
  const {
    distanceFloatImageData,
    distanceNearestPositions,
  } = renderJfa({
    renderer,
    meshes,
    camera,
    maskIndex,
  });
  console.timeEnd('outline');

  console.time('depthReconstruction');
  const reconstructedDepthFloats = renderDepthReconstruction(
    renderer,
    maskIndex,
    distanceFloatImageData,
    oldDepthFloatImageData,
    newDepthFloatImageData
  );
  globalThis.distanceFloatImageData = distanceFloatImageData;
  globalThis.oldDepthFloatImageData = oldDepthFloatImageData;
  globalThis.newDepthFloatImageData = newDepthFloatImageData;
  globalThis.reconstructedDepthFloats = reconstructedDepthFloats;
  console.timeEnd('depthReconstruction');

  // debug canvases
  {
    const maskIndexCanvas = maskIndex2Canvas(
      maskIndex,
      width,
      height,
    );
    document.body.appendChild(maskIndexCanvas);

    const distanceFloatsCanvas = distanceFloats2Canvas(
      distanceFloatImageData,
      width,
      height,
    );
    document.body.appendChild(distanceFloatsCanvas);

    const reconstructionCanvas = depthFloats2Canvas(
      reconstructedDepthFloats,
      width,
      height,
      camera,
      camera.far,
    );
    document.body.appendChild(reconstructionCanvas);
  }

  return {
    oldDepthFloatImageData,
    newDepthFloatImageData,
    maskIndex,
    distanceFloatImageData,
    distanceNearestPositions,
    reconstructedDepthFloats,
  };
};

//

function viewZToOrthographicDepth(viewZ, near, far) {
  return ( viewZ + near ) / ( near - far );
}
function orthographicDepthToViewZ(orthoZ, near, far) {
  return orthoZ * ( near - far ) - near;
}
export const setCameraViewPositionFromViewZ = (x, y, viewZ, camera, target) => {
  const {near, far, projectionMatrix, projectionMatrixInverse} = camera;
  
  const depth = viewZToOrthographicDepth(viewZ, near, far);

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
export const setCameraViewPositionFromOrthographicViewZ = (x, y, viewZ, camera, target) => {
  const {near, far, projectionMatrix, projectionMatrixInverse} = camera;

  // if (isNaN(viewZ)) {
  //   console.warn('viewZ is nan', viewZ, near, far);
  //   debugger;
  // }

  const depth = viewZToOrthographicDepth(viewZ, near, far);
  // const depth = viewZ;
  // if (isNaN(depth)) {
  //   console.warn('depth is nan', depth, viewZ, near, far);
  //   debugger;
  // }

  // get the ndc point, which we will use for the unproject
  const ndcPoint = new THREE.Vector3(
    (x - 0.5) * 2,
    (y - 0.5) * 2,
    (depth - 0.5) * 2
  );
  // if (isNaN(ndcPoint.x)) {
  //   console.warn('ndcPoint.x is nan', ndcPoint.toArray());
  //   debugger;
  // }

  // apply the unprojection
  const worldPoint = ndcPoint.clone()
    // .unproject(camera);
    .applyMatrix4(projectionMatrixInverse);

  // if (isNaN(worldPoint.x)) {
  //   console.warn('worldPoint.x is nan', worldPoint.toArray());
  //   debugger;
  // }

  target.x = worldPoint.x;
  target.y = worldPoint.y;
  target.z = worldPoint.z;
  return target;
}

//

export const reprojectCameraFov = (() => {
  return (x, y, viewZ, oldCamera, newCamera) => { // XXX support oldCamera, newCamera
    const {near, far, projectionMatrix} = oldCamera;
    const {near: near2, far: far2, projectionMatrix: projectionMatrix2} = newCamera;
    
    const depth = viewZToOrthographicDepth(viewZ, near, far);

    const clipW = projectionMatrix.elements[2 * 4 + 3] * viewZ + projectionMatrix.elements[3 * 4 + 3];
    const clipPosition = new THREE.Vector4(
      (x - 0.5) * 2,
      (y - 0.5) * 2,
      (depth - 0.5) * 2,
      1
    );
    clipPosition.multiplyScalar(clipW);

    // reverse the process
    const clipPosition2 = clipPosition;
    const clipW2 = projectionMatrix2.elements[2 * 4 + 3] * viewZ + projectionMatrix2.elements[3 * 4 + 3];
    clipPosition2.multiplyScalar(1 / clipW2);
    clipPosition2.x = (clipPosition2.x / 2 + 0.5);
    clipPosition2.y = (clipPosition2.y / 2 + 0.5);
    clipPosition2.z = (clipPosition2.z / 2 + 0.5);
    clipPosition2.w = 1;

    const viewZ2 = orthographicDepthToViewZ(clipPosition2.z, near2, far2);
    return viewZ2;
  };
})();
export const reprojectCameraFovArray = (depthFloats, width, height, oldCamera, newCamera) => {
  const result = new Float32Array(depthFloats.length);
  for (let i = 0; i < depthFloats.length; i++) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;

    let viewZ = depthFloats[i];
    viewZ = reprojectCameraFov(x, y, viewZ, oldCamera, newCamera);
    result[i] = viewZ;
  }
  return result;
};

//

export function applySkybox(float32Array) { // // result in float32Array
  const numPixels = float32Array.length / 3;
  const width = Math.sqrt(numPixels);
  const height = width;
  if (width * height !== numPixels) {
    throw new Error('invalid point cloud dimensions');
  }
  for (let i = 0, j = 0; i < float32Array.length; i += 3, j += 1) {
    const x = float32Array[i + 0];
    const y = float32Array[i + 1];
    const z = float32Array[i + 2];

    if (z <= -skyboxDistance) {
      float32Array[i + 0] *= skyboxScaleFactor;
      float32Array[i + 1] *= skyboxScaleFactor;
      float32Array[i + 2] *= skyboxScaleFactor;
    }
  }
}

export async function getPointCloud(blob, {
  forceFov,
} = {}) {
  const u = new URL('https://depth.webaverse.com/pointcloud');
  if (forceFov !== undefined) {
    u.searchParams.set('fov', forceFov);
  }
  const res = await fetch(u, {
    method: 'POST',
    body: blob,
    headers: {
      'Content-Type': 'image/png',
    },
    mode: 'cors',
  });
  if (res.ok) {
    const headers = Object.fromEntries(res.headers.entries());
    const arrayBuffer = await res.arrayBuffer();
    return {
      headers,
      arrayBuffer,
    };
  } else {
    debugger;
  }
}

export const labelColors = (() => {
  const result = [];
  for (const colorName of Object.keys(materialColors)) {
    const colors = materialColors[colorName];
    for (const weight of ['400']) {
      const hashColor = colors[weight];
      const color = new THREE.Color(hashColor);
      result.push(color);
    }
  }
  // random shuffle
  for (let i = 0; i < result.length; i++) {
    const j = Math.floor(Math.random() * result.length);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
})();
export function pointCloudArrayBufferToColorAttributeArray(labelImageData, uint8Array) { // result in uint8Array
  const imageData = {
    data: new Uint8Array(labelImageData),
  };

  const usedLabelColors = new Set();
  // write to the color attribute buffer (RGB)
  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
    const r = imageData.data[i + 0];
    // const g = imageData.data[i + 1];
    // const b = imageData.data[i + 2];
    // const a = imageData.data[i + 3];
    if (r !== 255 && r < labelColors.length) {
      // const labelClass = labelClasses[r];
      const color = labelColors[r];
      if (!usedLabelColors.has(color)) {
        usedLabelColors.add(color);
      }
      uint8Array[j + 0] = color.r * 255;
      uint8Array[j + 1] = color.g * 255;
      uint8Array[j + 2] = color.b * 255;
    } else {
      // none
    }
  }
}