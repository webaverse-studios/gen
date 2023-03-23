import * as THREE from 'three';
import {
  getDepthField,
} from '../clients/reconstruction-client.js';
import {
  reconstructPointCloudFromDepthField,
} from '../zine/zine-geometry-utils.js';
import {
  // reconstructPointCloudFromDepthField,
  pointCloudArrayBufferToGeometry,
  // getBoundingBoxFromPointCloud,
  // reinterpretFloatImageData,
  // depthFloat32ArrayToPositionAttributeArray,
  // depthFloat32ArrayToGeometry,
  // depthFloat32ArrayToOrthographicPositionAttributeArray,
  // depthFloat32ArrayToOrthographicGeometry,
  // depthFloat32ArrayToHeightfield,
  getDepthFloatsFromPointCloud,
  // getDepthFloatsFromIndexedGeometry,
  // setCameraViewPositionFromViewZ,
  // getDoubleSidedGeometry,
  // getGeometryHeights,
} from '../zine/zine-geometry-utils.js';
import {
  mod,
} from '../../utils.js';

//

const localVector = new THREE.Vector3();
// const localVector2 = new THREE.Vector3();
// const localVector3 = new THREE.Vector3();
// const localVector4 = new THREE.Vector3();
// const localVector5 = new THREE.Vector3();
// const localVector6 = new THREE.Vector3();
// const localVector7 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();

//

export class TileMesh extends THREE.Mesh {
  constructor({
    map,
  }) {
    const geometry = new THREE.PlaneBufferGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        uvOffset: {
          value: new THREE.Vector2(),
          needsUpdate: true,
        },
        uvWidth: {
          value: 1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          vUv = uv;
          // full screen texture
          gl_Position = vec4(position, 1.0);
          // vec2 position = position.xy * 0.5 + 0.5;
          // gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        uniform vec2 uvOffset;
        uniform float uvWidth;
        
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          // uv.x = (uv.x - 0.5) * uvWidth;
          uv.x *= uvWidth;
          uv += uvOffset;
          gl_FragColor = texture2D(map, uv);
        }
      `,
    });
    super(geometry, material);
  }
  setUvOffset(uvOffset, uvWidth) {
    this.material.uniforms.uvOffset.value.copy(uvOffset);
    this.material.uniforms.uvOffset.needsUpdate = true;

    this.material.uniforms.uvWidth.value = uvWidth;
    this.material.uniforms.uvWidth.needsUpdate = true;
  }
}

//

// values is a float32 array of w * h
const bilinearSample = (values, w, h, x, y) => {
  const x0 = Math.floor(x);
  const x1 = Math.min(x0 + 1, w - 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(y0 + 1, h - 1);
  const v00 = values[y0 * w + x0];
  const v01 = values[y0 * w + x1];
  const v10 = values[y1 * w + x0];
  const v11 = values[y1 * w + x1];
  const u = x - x0;
  const v = y - y0;
  const v0 = (1 - u) * v00 + u * v01;
  const v1 = (1 - u) * v10 + u * v11;
  const v2 = (1 - v) * v0 + v * v1;
  return v2;
};
const bilinearSamplePlane = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localVector4 = new THREE.Vector3();
  const localVector5 = new THREE.Vector3();
  const localVector6 = new THREE.Vector3();
  const localVector7 = new THREE.Vector3();

  return (geometry, w, h, x, y, target) => {
    const positions = geometry.attributes.position.array;

    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, w - 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, h - 1);
    const v00 = localVector.fromArray(positions, (y0 * w + x0) * 3);
    const v01 = localVector2.fromArray(positions, (y0 * w + x1) * 3);
    const v10 = localVector3.fromArray(positions, (y1 * w + x0) * 3);
    const v11 = localVector4.fromArray(positions, (y1 * w + x1) * 3);
    const u = x - x0;
    const v = y - y0;
    const v0 = localVector5.copy(v00).lerp(v01, u);
    const v1 = localVector6.copy(v10).lerp(v11, u);
    const v2 = localVector7.copy(v0).lerp(v1, v);
    target.copy(v2);
    return target;
  };
})();
export const setSphereGeometryPanoramaDepth = (
  geometry,
  depthTiles,
  widthSegments,
  heightSegments
) => {
  console.log('set depth', {
    geometry,
    depthTiles,
    widthSegments,
    heightSegments,
  });

  const numTiles = depthTiles.length;
  const uvXIncrement = 1 / numTiles;

  const thetaStart = 0;
  const thetaEnd = Math.PI * 2;

  const positionsAttribute = geometry.attributes.position;
  const positions = positionsAttribute.array;

  console.log('got positions', {
    positions,
  });

  // globalThis.minU3 = Infinity;
  // globalThis.maxU3 = -Infinity;

  for ( let iy = 0; iy <= heightSegments; iy ++ ) {
    // const verticesRow = [];

    const v = iy / heightSegments;

    // special case for the poles

    let uOffset = 0;

    if ( iy == 0 && thetaStart == 0 ) {

      uOffset = 0.5 / widthSegments;

    } else if ( iy == heightSegments && thetaEnd == Math.PI ) {

      uOffset = - 0.5 / widthSegments;

    }

    if (iy == 0 || iy == heightSegments) {
      continue;
    }

    for ( let ix = 0; ix <= widthSegments; ix ++ ) {
      const vertexIndex = ix + iy * ( widthSegments + 1 );
      const vertexOffet = vertexIndex * 3;

      localVector.fromArray(positions, vertexOffet);

      const u = ix / widthSegments;

      const u2 = mod(u + uOffset, 1);
      // const v2 = 1 - v;
      // const u2 = u;
      const v2 = v;

      // get the list of tiles contributing to this pixel
      // console.log('start check');
      // index the tiles
      for (let i = 0; i < depthTiles.length; i++) {
        const depthTile = depthTiles[i];
        depthTile.i = i;
      }
      let candidateTiles = depthTiles.filter(tile => {
        const leftUvX = tile.i * uvXIncrement;
        const centerUvX = mod(leftUvX + uvXIncrement, 1);
        const rightUvX = mod(centerUvX + uvXIncrement, 1);

        const d = Math.abs(u2 - centerUvX);
        /* const leftDistance = Math.abs(u2 - leftUvX);
        const rightDistance = Math.abs(u2 - rightUvX);

        console.log('check candidate', (
          leftDistance <= (uvXIncrement) &&
          rightDistance <= (uvXIncrement * 2)
        ) ||
        (
          leftDistance <= (uvXIncrement * 2) &&
          rightDistance <= (uvXIncrement)
        ), {
          u2,
          leftUvX,
          rightUvX,
          centerUvX,
          leftDistance,
          rightDistance,
          uvXIncrement,
          uvXIncrement2: uvXIncrement * 2,
        }); */

        return d < uvXIncrement;
      });
      // candidateTiles = candidateTiles.slice(0, 1);
      if (candidateTiles.length === 0) {
        console.warn('no candidate tiles', candidateTiles);
        debugger;
      }

      // get the candidate depths values via bilinear sample
      // const value = new THREE.Vector3();
      let value = 0;
      let totalWeight = 0;
      for (let i = 0; i < candidateTiles.length; i++) {
        const depthTile = candidateTiles[i];

        const leftUvX = depthTile.i * uvXIncrement;
        const centerUvX = mod(leftUvX + uvXIncrement, 1);
        const rightUvX = mod(centerUvX + uvXIncrement, 1);

        // remap global uv 0..1 to local tile uv 0..1
        // IMPORTANT NOTE: account for the modulo wrapping; we can't just do u2 - leftUvX
        const u3 = mod(u2 - leftUvX, 1) / mod(rightUvX - leftUvX, 1);
        const v3 = v2;

        // globalThis.minU3 = Math.min(globalThis.minU3, u3);
        // globalThis.maxU3 = Math.max(globalThis.maxU3, u3);

        let tileValue = bilinearSample(depthTile, size, size, u3 * size, v3 * size);
        tileValue *= -1; // since depth is negative

        // rotate the position from tile space to sphere space
        // const rotY = (depthTile.i / numTiles) * Math.PI * 2;
        // localQuaternion.setFromAxisAngle(upVector, -rotY);
        // position.applyQuaternion(localQuaternion);
        // position.x *= -1;
        // position.z *= -1;
        // position.y *= -1;

        // weight the value by how close it is to the center of the tile
        const distanceToCenterUvX = Math.abs(u3 - 0.5) * 2;
        const weight = 1 - distanceToCenterUvX;
        // value.add(position.multiplyScalar(weight));
        value += tileValue * weight;
        totalWeight += weight;
      }
      value /= totalWeight;

      const direction2D = localVector2D.set(
        localVector.x,
        localVector.z
      );
      direction2D.normalize();
      direction2D.multiplyScalar(value);
      // localVector.multiplyScalar(value);
      localVector.x = direction2D.x;
      localVector.z = direction2D.y;
      localVector.toArray(positions, vertexOffet);
    }
  }

  positionsAttribute.needsUpdate = true;
};

//

const size = 1024;
export const renderPanorama = async (
  renderer,
  tileScene,
  tileMesh,
  camera,
  panoramaTextureImage,
) => {
  const aspect = panoramaTextureImage.width / panoramaTextureImage.height;
  // console.log('snapshotting', aspect);

  const tiles = [];

  // we overlap tiles by 50% to avoid seams
  const numTiles = Math.ceil(aspect * 2);
  const uvXIncrement = 1 / numTiles;
  for (let i = 0; i < numTiles; i++) {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = size;
    tileCanvas.height = size;
    const tileCanvasCtx = tileCanvas.getContext('2d');

    tileMesh.setUvOffset(
      new THREE.Vector2(
        uvXIncrement * i,
        0,
      ),
      uvXIncrement * 2
    );

    renderer.render(tileScene, camera);
    tileCanvasCtx.drawImage(renderer.domElement, 0, 0);

    document.body.appendChild(tileCanvas);
    tileCanvas.classList.add('tileCanvas');
    // console.log('append tile canvas', tileCanvas);
    tiles.push(tileCanvas);
  }
  renderer.clear();

  // // we overlap tiles by 50% to avoid seams
  // const numTiles = Math.ceil(aspect * 2);
  // const uvXIncrement = 1 / numTiles;
  // tileMesh.setUvOffset(
  //   new THREE.Vector2(
  //     uvXIncrement * i,
  //     0,
  //   ),
  //   uvXIncrement * 2
  // );

  // for (let i = 0; i < numTiles; i++) {
  //   const tileCanvas = document.createElement('canvas');
  //   tileCanvas.width = size;
  //   tileCanvas.height = size;
  //   const tileCanvasCtx = tileCanvas.getContext('2d');

  //   renderer.clear();
  //   renderer.render(tileScene, camera);
  //   tileCanvasCtx.drawImage(renderer.domElement, 0, 0);

  //   tiles.push(tileCanvas);
  // }

  const depths = [];
  // globalThis.depths = depths;
  const depthCanvases = [];
  // globalThis.depthCanvases = depthCanvases;
  const geometries = [];
  // globalThis.geometries = geometries;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    
    // image
    const blob = await new Promise((accept, reject) => {
      tile.toBlob(accept, 'image/png');
    });

    // depth field
    const df = await getDepthField(blob);
    const depthFieldHeaders = df.headers;
    const depthFieldArrayBuffer = df.arrayBuffer;

    // if (tile.width !== size || tile.height !== size) {
    //   console.warn('tile size mismatch', tile.width, tile.height, size, size);
    //   debugger;
    // }

    const fov = parseFloat(depthFieldHeaders['x-fov']);
    // const float32Array = new Float32Array(depthFieldArrayBuffer);
    // float32Array.index = i;
    // depths.push(float32Array);

    // point cloud
    const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
      depthFieldArrayBuffer,
      tile.width,
      tile.height,
      fov,
    );
    const pointCloudArrayBuffer = pointCloudFloat32Array.buffer;

    // depth floats
    const float32Array = getDepthFloatsFromPointCloud(
      pointCloudArrayBuffer,
      tile.width,
      tile.height
    );
    float32Array.i = i;
    depths.push(float32Array);

    const geometry = pointCloudArrayBufferToGeometry(
      pointCloudArrayBuffer,
      tile.width,
      tile.height
    );
    geometry.i = i;
    geometries.push(geometry);

    console.log('got point cloud array buffer', {
      float32Array: float32Array.slice(),
      pointCloudFloat32Array: pointCloudFloat32Array.slice(),
    });

    const depthCanvas = document.createElement('canvas');
    depthCanvas.width = size;
    depthCanvas.height = size;
    const depthCtx = depthCanvas.getContext('2d');
    const imageData = depthCtx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const depth = float32Array[i] / 1000 / 10;
      const depthByte = Math.floor(depth * 255);
      const j = i * 4;
      imageData.data[j + 0] = depthByte;
      imageData.data[j + 1] = depthByte;
      imageData.data[j + 2] = depthByte;
      imageData.data[j + 3] = 255;
    }
    depthCtx.putImageData(imageData, 0, 0);

    depthCanvas.classList.add('depthCanvas');
    document.body.appendChild(depthCanvas);
    depthCanvases.push(depthCanvas);
  }

  return depths;
  // return {
  //   tiles,
  //   depths,
  // };
};