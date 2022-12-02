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

//

// const localVector = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();

//

export function reconstructFloor({
  renderSpecs,
}) {
  let floorNetDepths;
  let floorNetCameraJson;
  {
    // renderer
    const canvas = document.createElement('canvas');
    canvas.width = floorNetPixelSize;
    canvas.height = floorNetPixelSize;
    canvas.classList.add('floorReconstructionCanvas');
    document.body.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);

    // render target
    const floorRenderTarget = new THREE.WebGLRenderTarget(floorNetPixelSize, floorNetPixelSize, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
    });

    // scene
    const floorNetScene = new THREE.Scene();
    floorNetScene.autoUpdate = false;

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

    // mesh
    floorNetCameraJson = getOrthographicCameraJson(floorNetCamera);
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
      blending: THREE.NoBlending,
    });
    for (const renderSpec of renderSpecs) {
      const {geometry, width, height, depthFloat32Array} = renderSpec;
      const g = geometry.clone();

      const maskZUint8Array = getGeometryClipZMask(g, width, height, depthFloat32Array);
      g.setAttribute('maskZ', new THREE.BufferAttribute(maskZUint8Array, 1));
      globalThis.maskZUint8Array = maskZUint8Array;

      const floorNetDepthRenderMesh = new THREE.Mesh(g, floorNetDepthRenderMaterial);
      floorNetDepthRenderMesh.frustumCulled = false;
      floorNetScene.add(floorNetDepthRenderMesh);
    }
    
    // render
    // render to the canvas, for debugging
    renderer.render(floorNetScene, floorNetCamera);
    
    // real render to render target
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
    floorNetDepths = reinterpretFloatImageData(imageData);

    // const filteredFloorNetDepths = floorNetDepths.filter(n => n !== 0);
    // if (filteredFloorNetDepths.length > 0) {
    //   console.log('floor net depths found:', filteredFloorNetDepths.length);
    // } else {
    //   console.warn('no floor net depths found', floorNetDepths);
    //   debugger;
    // }

    // XXX 
  }

  return {
    floorNetDepths,
    floorNetCameraJson,
  };
}