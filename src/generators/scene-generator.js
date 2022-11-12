import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

import {ImageAiClient} from '../clients/image-client.js';
import {getLabel} from '../clients/perception-client.js';
import {
  pointcloudStride,
  getPointCloud,
  pointCloudArrayBuffer2canvas,
  pointCloudArrayBufferToPositionAttributeArray,
  applySkybox,
  pointCloudArrayBufferToColorAttributeArray,
  skyboxDistance,
} from '../clients/reconstruction-client.js';

// import {prompts} from '../constants/prompts.js';
import {blob2img} from '../utils/convert-utils.js';
import {labelClasses} from '../constants/prompts.js';

//

const imageAiClient = new ImageAiClient();
// globalThis.depthCubes = [];
// globalThis.depthCubesSkipped = [];

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

//

function drawLabelCanvas(img, boundingBoxLayers) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');

  //

  ctx.drawImage(img, 0, 0);

  //
  // window.boundingBoxLayers = boundingBoxLayers;
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
    } /* else {
      console.log('cut point');
    } */
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
const _clipGeometryToMask = (geometry, widthSegments, heightSegments, maskImageData, indexImageDatas) => {
  const _isPointTransparent = i => maskImageData.data[i * 4 + 3] === 0;
  {
    const indices = [];
    const gridX = widthSegments;
    const gridY = heightSegments;
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
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

        // if one of the points was in the hole, render it
        (aO || bO || cO) && indices.push(a, b, d);
        (bO || cO || dO) && indices.push(b, c, d);
      }
    }
    for (let ix = 0; ix < gridX1; ix++) {
      for (let iy = 0; iy < gridX1; iy++) {
        const i = ix + gridX1 * iy;

        const distanceSpec = indexImageDatas.map(indexImageData => {
          const {direction} = indexImageData;
          // const rgbaFloat = indexImageData.slice(i * 4, i * 4 + 4);
        });
      }
    }
    // set the new indices on the geometry
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  }
};

//

class ScenePackage {
  constructor(spec) {
    this.spec = spec;
  }
}

//

class SceneRenderer {
  constructor(element) {
    this.element = element;

    this.prompt = null;

    // canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvas.classList.add('canvas');
    this.element.appendChild(canvas);

    // renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

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

    this.listen();

    const _startLoop = () => {
      const _render = () => {
        if (this.renderer) {
          // update orbit controls
          this.controls.update();
          this.camera.updateMatrixWorld();

          // render
          this.renderer.render(scene, camera);
        }
      };
      const _loop = () => {
        requestAnimationFrame(_loop);
        _render();
      };
      _loop();
    };
    _startLoop();
  }
  listen() {
    document.addEventListener('keydown', e => {
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
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', blockEvent);
    canvas.addEventListener('mouseup', blockEvent);
    canvas.addEventListener('click', blockEvent);
    canvas.addEventListener('wheel', blockEvent);
  }
  setPackage(scenePackage) {
    const {
      prompt,
      img,
      labelImg,
      pointCloudHeaders,
      pointCloudArrayBuffer,
      planeMatrices,
      predictedHeight,
    } = scenePackage.spec;

    this.prompt = prompt;

    // camera
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // scene mesh
    const widthSegments = img.width - 1;
    const heightSegments = img.height - 1;
    const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/img.width);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
    pointCloudArrayBufferToColorAttributeArray(labelImg, geometry.attributes.color.array);
    _cutSkybox(geometry);
    applySkybox(geometry.attributes.position.array);
    const map = new THREE.Texture(img);
    map.needsUpdate = true;
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
      planesMesh = new THREE.InstancedMesh(planeGeometry, material, planeMatrices.length);
      planesMesh.name = 'planesMesh';
      planesMesh.frustumCulled = false;
      for (let i = 0; i < planeMatrices.length; i++) {
        planesMesh.setMatrixAt(i, planeMatrices[i]);
      }
      planesMesh.count = planeMatrices.length;
      planesMesh.instanceMatrix.needsUpdate = true;
      return planesMesh;
    })();
    // this.scene.add(planesMesh);
    this.planesMesh = planesMesh;
  }
  async renderBackground() {
    const cameraPosition = this.camera.position.clone();
    const cameraQuaternion = this.camera.quaternion.clone();

    const backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.classList.add('backgroundCanvas');
    backgroundCanvas.width = this.renderer.domElement.width;
    backgroundCanvas.height = this.renderer.domElement.height;
    backgroundCanvas.style.cssText = `\
      background: red;
    `;
    const backgroundContext = backgroundCanvas.getContext('2d');
    backgroundContext.drawImage(this.renderer.domElement, 0, 0);
    this.element.appendChild(backgroundCanvas);

    const blob = await new Promise((accept, reject) => {
      backgroundCanvas.toBlob(blob => {
        accept(blob);
      });
    });
    const maskBlob = blob; // same as blob
    const maskImg = await blob2img(maskBlob);

    // console.log('edit', [blob, maskBlob, this.prompt]);
    const editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, this.prompt);
    const editedImg = await blob2img(editedImgBlob);
    editedImg.classList.add('editImg');
    this.element.appendChild(editedImg);

    // get point cloud
    const {
      headers: pointCloudHeaders,
      arrayBuffer: pointCloudArrayBuffer,
    } = await getPointCloud(blob);
    const pointCloudCanvas = pointCloudArrayBuffer2canvas(pointCloudArrayBuffer);
    this.element.appendChild(pointCloudCanvas);
    
    const fov = Number(pointCloudHeaders['x-fov']);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    // index canvas
    const indexCanvas = document.createElement('canvas');
    indexCanvas.classList.add('indexCanvas');
    indexCanvas.width = this.renderer.domElement.width;
    indexCanvas.height = this.renderer.domElement.height;

    // for index rendering, create a copy of this.sceneMesh with a new material
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
    const indexRenderer = new THREE.WebGLRenderer({
      canvas: indexCanvas,
      alpha: true,
      // antialias: true,
      preserveDrawingBuffer: true,
    });
    indexRenderer.setClearColor(0x000000, 0);
    // const indexContext = indexRenderer.getContext();

    // float render target
    const indexRenderTarget = new THREE.WebGLRenderTarget(
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
    const maskImageData = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = nonAaRenderer.domElement.width;
      canvas.height = nonAaRenderer.domElement.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(nonAaRenderer.domElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, nonAaRenderer.domElement.width, nonAaRenderer.domElement.height);
      return imageData;
    })();

    // render depth
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

    // display depth cubes
    {
      const setPositionFromViewZ = (() => {
        const projInv = new THREE.Matrix4();
      
        return (screenPosition, camera, viewZ, position) => {
          // get the inverse projection matrix of the camera
          projInv.copy(camera.projectionMatrix)
            .invert();
          position
            .set(
              screenPosition.x * 2 - 1,
              -(screenPosition.y) * 2 + 1,
              0.5
            )
            .applyMatrix4(projInv);
      
          position.multiplyScalar(viewZ / position.z);
          position.applyMatrix4(camera.matrixWorld);
          return position;
        };
      })();

      // render an instanced cubes mesh to show the depth
      // const depthCubesGeometry = new THREE.BoxBufferGeometry(0.1, 0.1, 0.1);
      const depthCubesGeometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
      const depthCubesMaterial = new THREE.MeshPhongMaterial({
        color: 0x00FFFF,
      });
      const depthCubesMesh = new THREE.InstancedMesh(depthCubesGeometry, depthCubesMaterial, depthFloatImageData.length);
      depthCubesMesh.name = 'depthCubesMesh';
      depthCubesMesh.frustumCulled = false;
      this.scene.add(depthCubesMesh);

      // set the matrices by projecting the depth from the perspective camera
      const skipRatio = 8;
      for (let i = 0; i < depthFloatImageData.length; i += skipRatio) {
        const depth = depthFloatImageData[i]; // the orthographic depth
        const viewZ = depth;
        const x = (i % this.renderer.domElement.width) / this.renderer.domElement.width;
        const y = Math.floor(i / this.renderer.domElement.width) / this.renderer.domElement.height;
        const mousePosition = new THREE.Vector2(x, y);
        const target = new THREE.Vector3();
        setPositionFromViewZ(mousePosition, this.camera, viewZ, target);
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(target.x, target.y, target.z);
        depthCubesMesh.setMatrixAt(i / skipRatio, matrix);
      }
      depthCubesMesh.count = depthFloatImageData.length;
      depthCubesMesh.instanceMatrix.needsUpdate = true;
    }

    // post-process index canvas
    let indexImageDatas;
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
      // globalThis.indexColorsAlphas = indexColorsAlphas;

      // render out the index colors and alphas
      const indexCanvas2 = encodeIndexColorsAlphasToCanvas(indexColorsAlphas);
      indexCanvas2.classList.add('indexCanvas2');
      // document.body.appendChild(indexCanvas2);

      // create the float data texture from indexColorsAlphas
      const indexCanvas2Texture = new THREE.DataTexture(
        indexColorsAlphas,
        indexCanvas.width,
        indexCanvas.height,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      indexCanvas2Texture.minFilter = THREE.NearestFilter;
      indexCanvas2Texture.magFilter = THREE.NearestFilter;
      indexCanvas2Texture.wrapS = THREE.ClampToEdgeWrapping;
      indexCanvas2Texture.wrapT = THREE.ClampToEdgeWrapping;
      indexCanvas2Texture.needsUpdate = true;

      const fullscreenGeometry = new THREE.PlaneGeometry(2, 2);
      const indexMaterial = new THREE.ShaderMaterial({
        uniforms: {
          size: {
            value: new THREE.Vector2(
              this.renderer.domElement.width,
              this.renderer.domElement.height,
            ),
            needsUpdate: true,
          },
          direction: {
            value: new THREE.Vector2(0, 0),
            needsUpdate: true,
          },
          map: {
            // value: indexCanvas2Texture,
            value: indexRenderTarget,
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
          varying vec2 vUv;
          uniform vec2 size;
          uniform vec2 direction;
          uniform sampler2D map;

          #define PI 3.1415926535897932384626433832795

          const int maxSamples = 512;
          
          vec3 bestColor = vec3(1., 0., 1.); // XXX should be white in production to minimize risk of color/index conflicts
          float bestColorDistance = 1e10;
          bool seenFlags[maxSamples];
          int numSeenFlags = 0;

          void setSeenFlag(int index) {
            seenFlags[index] = true;
            numSeenFlags++;
          }
          void setColor(vec3 color, vec2 duvPixels, int i) {
            float distanceAlongDirection = dot(duvPixels, direction);
            if (distanceAlongDirection >= 0. && distanceAlongDirection < bestColorDistance) {
              bestColor = color;
              bestColorDistance = distanceAlongDirection;
            }
            setSeenFlag(i);
          }
          void scanRadius(float r, vec2 direction, float startAngle, float endAngle) {
            // sample points in an arc of radius r
            // the best color is defined as the one furthest in the given direction
            // we stop looking once we see the first point in any given ray, to detect a bounding box
            // direction is in [-1, 1] space
            for (int i = 0; i < maxSamples; i++) {
              if (!seenFlags[i]) {
                float angle = mix(startAngle, endAngle, float(i) / float(maxSamples));
                vec2 duvPixels = r * vec2(cos(angle), sin(angle));
                vec2 duv = duvPixels / size;
                vec2 uv = vUv + duv;

                if (uv.x >= 0. && uv.x <= 1. && uv.y >= 0. && uv.y <= 1.) {
                  vec4 color = texture2D(map, uv);
                  if (color.a > 0.) {
                    setColor(color.rgb, duvPixels, i);
                  }
                } else {
                  setSeenFlag(i);
                }
              }
            }
          }
          
          const float maxDistance = 512.;
          
          void main() {
            /* // we start on the right and run counter clockwise
            float startAngle = 0.;
            float endAngle = PI * 2.;
            if (direction.x < 0.) {
              startAngle = PI * 0.5;
              endAngle = PI * 3. * 0.5;
            } else if (direction.x > 0.) {
              startAngle = PI * 3. * 0.5;
              endAngle = PI * 0.5;
            } else if (direction.y < 0.) {
              startAngle = 0.;
              endAngle = PI;
            } else if (direction.y > 0.) {
              startAngle = PI;
              endAngle = 0.;
            } */
            
            vec4 color = texture2D(map, vUv);
            if (color.a == 0.) {
              /* // first unidirectional scan
              for (float radius = 1.; radius < maxDistance; radius += 1.) {
                scanRadius(radius, direction, startAngle, endAngle);
                if (numSeenFlags >= maxSamples) {
                  break;
                }
              } */
              // if the first scan failed, try a full scan
              // if (numSeenFlags < maxSamples) {
                float startAngle2 = 0.;
                float endAngle2 = PI * 2.;
                if (direction.x < 0.) {
                  startAngle2 = PI * 0.5;
                  endAngle2 = PI * 3. * 0.5;
                } else if (direction.x > 0.) {
                  startAngle2 = PI * 3. * 0.5;
                  endAngle2 = PI * 3. * 0.5 + PI;
                } else if (direction.y < 0.) {
                  startAngle2 = 0.;
                  endAngle2 = PI;
                } else if (direction.y > 0.) {
                  startAngle2 = PI;
                  endAngle2 = PI + PI;
                }

                /* // have to reset the seen flags
                for (int i = 0; i < maxSamples; i++) {
                  seenFlags[i] = false;
                }
                numSeenFlags = 0; */

                for (float radius = 1.; radius < maxDistance; radius += 1.) {
                  scanRadius(radius, direction, startAngle2, endAngle2);
                  if (numSeenFlags >= maxSamples) {
                    break;
                  }
                }
              // }
              
              // encode the distance as alpha
              vec2 directionAxis = abs(direction);
              float sizeAlongDirectionAxis = dot(size, directionAxis);
              float a = (sizeAlongDirectionAxis - bestColorDistance) / sizeAlongDirectionAxis;
              // return the color
              gl_FragColor = vec4(bestColor, a);
            } else {
              gl_FragColor = color;
            }
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const fullscreenMesh = new THREE.Mesh(fullscreenGeometry, indexMaterial);
      fullscreenMesh.name = 'fullscreenMesh';
      fullscreenMesh.frustumCulled = false;

      fullscreenScene.add(fullscreenMesh);
      
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
        // globalThis.indexColorsAlphas2 = indexColorsAlphas2;
        return indexColorsAlphas2;
      };
      indexImageDatas = directions.map(direction => {
        const [directionX, directionY] = direction;

        const indexColorsAlphas2 = smearIndexColorAlphas(indexColorsAlphas, direction);
        const scanCanvas = encodeIndexColorsAlphasToCanvas(indexColorsAlphas2);
        scanCanvas.classList.add('indexImageDataCanvas:' + [directionX, directionY].join(','));
        scanCanvas.direction = direction;
        document.body.appendChild(scanCanvas);
        return scanCanvas;
      });
      globalThis.indexImageDatas = indexImageDatas;
    }

    // create background mesh
    {
      const widthSegments = editedImg.width - 1;
      const heightSegments = editedImg.height - 1;
      const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
      pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/editedImg.width);
      const material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
      });
      const backgroundMesh = new THREE.Mesh(geometry, material);
      backgroundMesh.name = 'backgroundMesh';
      backgroundMesh.position.copy(cameraPosition);
      backgroundMesh.quaternion.copy(cameraQuaternion);
      backgroundMesh.updateMatrixWorld();
      backgroundMesh.frustumCulled = false;

      _clipGeometryToMask(geometry, widthSegments, heightSegments, maskImageData, indexImageDatas);
      geometry.computeVertexNormals();

      this.scene.add(backgroundMesh);
    }

  }
}

//

const _detectPlanes = async points => {
  console.time('ransac');
  const res = await fetch(`https://depth.webaverse.com/ransac?n=${16}&threshold=${0.1}&init_n=${1500}`, {
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

export class SceneGenerator {
  async generate(prompt, blob) {
    if (!(blob instanceof Blob)) {
      blob = await imageAiClient.createImageBlob(prompt);
    }

    // color
    const img = await blob2img(blob);
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
    const boundingBoxLayers = JSON.parse(labelHeaders['x-bounding-boxes']);
    // console.log('got bounding boxes', boundingBoxLayers);
    const labelCanvas = drawLabelCanvas(labelImg, boundingBoxLayers);
    document.body.appendChild(labelCanvas);
    globalThis.labelCanvas = labelCanvas;

    // point cloud
    const {
      headers: pointCloudHeaders,
      arrayBuffer: pointCloudArrayBuffer,
    } = await getPointCloud(blob);
    const pointCloudCanvas = pointCloudArrayBuffer2canvas(pointCloudArrayBuffer);
    // console.log('got point cloud', {
    //   pointCloudHeaders,
    //   pointCloudCanvas,
    // });
    document.body.appendChild(pointCloudCanvas);

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
      console.log('planes', planesJson);
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
        planeMatrices.push(m);

        // latch new points
        points2 = Float32Array.from(outlierPlaneFloats);
      }
    }

    // query the height
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
    const predictedHeight = await _getPredictedHeight(blob);
    // console.log('got predicted height', predictedHeight);

    // start renderer
    const _startRender = () => {
      return new ScenePackage({
        prompt,
        img,
        labelImg,
        labelCanvas,
        pointCloudHeaders,
        pointCloudArrayBuffer,
        pointCloudCanvas,
        planeMatrices,
        predictedHeight,
      });
    };
    return _startRender();
  }
  createRenderer(element) {
    return new SceneRenderer(element);
  }
}