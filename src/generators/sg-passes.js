import * as THREE from 'three';
import {
  // setPerspectiveCameraFromJson,
  // getPerspectiveCameraJson,
  // setOrthographicCameraFromJson,
  getOrthographicCameraJson,
} from '../utils/camera-utils.js';
import {
  pointCloudArrayBufferToGeometry,
  reinterpretFloatImageData,
  clipGeometryZ,
  getGeometryClipZMask,
  mergeOperator,
} from '../clients/reconstruction-client.js';
import {
  depthVertexShader,
  depthFragmentShader,
} from '../utils/sg-shaders.js';
import {
  floorNetWorldSize,
  floorNetWorldDepth,
  floorNetResolution,
  floorNetPixelSize,
} from '../constants/sg-constants.js';
import {makeRenderer} from '../utils/three-utils.js';

//

// const localVector = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();

/* const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0xff0000,
}); */

//

export function reconstructFloor({
  renderSpecs,
}) {
  // camera
  const floorNetCamera = new THREE.OrthographicCamera(
    -floorNetWorldSize / 2,
    floorNetWorldSize / 2,
    floorNetWorldSize / 2,
    -floorNetWorldSize / 2,
    0,
    floorNetWorldDepth
  );
  floorNetCamera.position.set(0, -floorNetWorldDepth/2, 0);
  floorNetCamera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2)
    .multiply(
      localQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    );
  floorNetCamera.updateMatrixWorld();

  const floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);

  let floorNetDepths;
  {
    /* // canvas
    const canvas = document.createElement('canvas');
    canvas.width = floorNetPixelSize;
    canvas.height = floorNetPixelSize;
    canvas.classList.add('floorReconstructionCanvas');
    document.body.appendChild(canvas);

    // renderer
    const renderer = makeRenderer(canvas);

    // render target
    const floorRenderTarget = new THREE.WebGLRenderTarget(floorNetPixelSize, floorNetPixelSize, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
    });

    // scene
    const floorNetScene = new THREE.Scene();
    floorNetScene.autoUpdate = false;

    // mesh
    const floorNetDepthRenderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cameraNear: {
          value: floorNetCamera.near,
          needsUpdate: true,
        },
        cameraFar: {
          value: floorNetCamera.far,
          needsUpdate: true,
        },
        isPerspective: {
          value: 0,
          needsUpdate: true,
        },
      },
      vertexShader: depthVertexShader.replace('// HEADER', `\
        // HEADER
        attribute float maskZ;
        varying float vMaskZ;
      `).replace('// POST', `\
        // POST
        vMaskZ = maskZ;
      `),
      fragmentShader: depthFragmentShader.replace('// HEADER', `\
        // HEADER
        varying float vMaskZ;
      `).replace('// POST', `\
        // POST
        if (vMaskZ < 0.5) {
          gl_FragColor = vec4(0., 0., 0., 0.);
        }
      `),
      side: THREE.BackSide,
    });
    for (const renderSpec of renderSpecs) {
      const {geometry} = renderSpec;
      const floorNetDepthRenderMesh = new THREE.Mesh(geometry, floorNetDepthRenderMaterial);
      floorNetDepthRenderMesh.frustumCulled = false;
      floorNetScene.add(floorNetDepthRenderMesh);
    }
    
    // render
    // render to the canvas, for debugging
    renderer.render(floorNetScene, floorNetCamera);
    
    // real render to the render target
    renderer.setRenderTarget(floorRenderTarget);
    renderer.render(floorNetScene, floorNetCamera);
    renderer.setRenderTarget(null);

    // read back the depth
    const imageData = {
      data: new Uint8Array(floorNetPixelSize * floorNetPixelSize * 4),
      width: floorNetPixelSize,
      height: floorNetPixelSize,
    };
    renderer.readRenderTargetPixels(
      floorRenderTarget,
      0,
      0,
      floorNetPixelSize,
      floorNetPixelSize,
      imageData.data
    );
    floorNetDepths = reinterpretFloatImageData(imageData); */













    // merge depths
    const floorPlaneDepths = new Float32Array(floorNetPixelSize * floorNetPixelSize)
      .fill(floorNetCamera.far / 2);

    console.log('merge operator 1', {
      newDepthFloatImageData: floorPlaneDepths,
      width: floorNetPixelSize,
      height: floorNetPixelSize,
      camera: floorNetCamera,
      renderSpecs,
    });

    const mergeResult = mergeOperator({
      newDepthFloatImageData: floorPlaneDepths,
      width: floorNetPixelSize,
      height: floorNetPixelSize,
      camera: floorNetCamera,
      renderSpecs,
    });
    const {
      oldDepthFloatImageData: depthFloatImageData,
      maskIndex,
      distanceFloatImageData,
      distanceNearestPositions,
      reconstructedDepthFloats,
    } = mergeResult;
    console.log('merge operator 2', mergeResult);

    // globalThis.oldDepthFloatImageData = depthFloatImageData;
    // globalThis.newDepthFloatImageData = floorPlaneDepths;
    // globalThis.reconstructedDepthFloats = reconstructedDepthFloats;

    floorNetDepths = depthFloatImageData;
    // floorNetDepths = reconstructedDepthFloats;
  }

  return {
    floorNetDepths,
    floorNetCameraJson,
  };
}