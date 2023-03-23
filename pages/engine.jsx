import * as THREE from 'three';
import offscreenEngineApi from '../packages/offscreen-engine/offscreen-engine-api.js';
import {
  compileVirtualSceneExport,
} from '../src/generators/scene-generator.js';
import {
  getDepthField,
  // reconstructPointCloudFromDepthField,
} from '../src/clients/reconstruction-client.js';
import {
  reconstructPointCloudFromDepthField,
  // pointCloudArrayBufferToGeometry,
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
} from '../src/zine/zine-geometry-utils.js';
import {
  renderPanorama,
} from '../src/generators/skybox-generator.js';
// import { loadImage } from '../../engine/util.js';
import {
  TileMesh,
} from '../src/generators/skybox-generator.js';

offscreenEngineApi(async (funcName, args, opts) => {
  // console.log('funcName, args');

  if (funcName === 'compilePanel') {
    const {
      imageArrayBuffer,
      // width,
      // height,
    } = args;
    
    // get depth field
    // console.time('depthField');
    let depthFieldHeaders;
    let depthFieldArrayBuffer;
    {
      // console.log('get depth field 1', {
      //   funcName,
      //   args,
      //   // width,
      //   // height,
      // });
      const blob = new Blob([imageArrayBuffer], {
        type: 'image/png',
      });
      const df = await getDepthField(blob);
      // console.log('get depth field 2', {
      //   blob,
      //   df,
      //   funcName,
      //   args,
      // });
      depthFieldHeaders = df.headers;
      depthFieldArrayBuffer = df.arrayBuffer;
    }
    // console.timeEnd('depthField');

    const fov = Number(depthFieldHeaders['x-fov']);
    const width = Number(depthFieldHeaders['x-width']);
    const height = Number(depthFieldHeaders['x-height']);
    // console.log('got headers', depthFieldHeaders);
    
    let pointCloudArrayBuffer;
    {
      const pointCloudFloat32Array = reconstructPointCloudFromDepthField(
        depthFieldArrayBuffer,
        width,
        height,
        fov,
      );
      pointCloudArrayBuffer = pointCloudFloat32Array.buffer;
    }
    // console.timeEnd('pointCloud');

    // const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer, width, height);
    // return depthFloats32Array;

    const result = {
      pointCloudArrayBuffer,
      width,
      height,
    };
    return result;
  } else if (funcName === 'compileSkybox') {
    const {
      imageArrayBuffer,
    } = args;
    const file = new Blob([imageArrayBuffer], {
      type: 'image/png',
    });
    // console.log('compile skybox 1', blob);
    // const u = URL.createObjectURL(blob);
    // const image = await loadImage(u);
    // console.log('compile skybox 2');

    // texture loader
    const textureLoader = new THREE.TextureLoader();

    // panorama texture
    const panoramaTexture = await new Promise((accept, reject) => {
      const u = URL.createObjectURL(file);
      const cleanup = () => {
        URL.revokeObjectURL(u);
      };
      textureLoader.load(u, (tex) => {
        accept(tex);
        cleanup();
      }, undefined, err => {
        reject(err);
        cleanup();
      });
    });
    panoramaTexture.wrapS = THREE.RepeatWrapping;
    panoramaTexture.wrapT = THREE.RepeatWrapping;
    panoramaTexture.needsUpdate = true;
    const panoramaTextureImage = panoramaTexture.image;

    // tile scene
    const tileScene = new THREE.Scene();
    tileScene.autoUpdate = false;

    // tile mesh
    const tileMesh = new TileMesh({
      map: panoramaTexture,
    });
    tileScene.add(tileMesh);
    tileMesh.updateMatrixWorld();

    const canvas = new OffscreenCanvas(1024, 1024);
    const renderer = new THREE.WebGLRenderer({
      canvas,
    });
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    console.log('render panorama 1');
    const depths = await renderPanorama(renderer, tileScene, tileMesh, camera, panoramaTextureImage);
    console.log('render panorama 2', depths);

    return depths;
  } else if (funcName === 'compileScene') {
    const {
      imageArrayBuffer,
    } = args;
    
    // XXX debugging
    if (!imageArrayBuffer) {
      throw new Error('offscreenEngineApi got no imageArrayBuffer', imageArrayBuffer);
    }

    const uint8Array = await compileVirtualSceneExport(imageArrayBuffer)
    return uint8Array;
  } else {
    throw new Error('unknown function: ' + funcName);
  }
});
console.log('iframe post engine ready');
globalThis.parent.postMessage({
  method: 'engineReady',
}, '*');

//

export const Engine = () => {
  return (
    <div className='engine-fake-node'>engine.html</div>
  );
};
