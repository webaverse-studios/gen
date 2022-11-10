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
const _clipGeometryToMask = (geometry, maskCanvas) => {
  // draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = maskCanvas.width;
  canvas.height = maskCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(maskCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const _isPointTransparent = i => {
    const a = imageData.data[i * 4 + 3];
    return a === 0;
  };
  // console.log('computing index', geometry.index.array.length);
  {
    const indices = [];
    const gridX = maskCanvas.width;
    const gridY = maskCanvas.height;
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

        (aO || bO || cO) && indices.push(a, b, d);
        (bO || cO || dO) && indices.push(b, c, d);
      }
    }
    console.log('set index', indices);
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
    const geometry = new THREE.PlaneBufferGeometry(1, 1, img.width - 1, img.height - 1);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/img.width);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
    pointCloudArrayBufferToColorAttributeArray(labelImg, geometry.attributes.color.array);
    _cutSkybox(geometry);
    applySkybox(geometry.attributes.position.array);
    const map = new THREE.Texture(img);
    map.needsUpdate = true;
    /* const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        uColorEnabled: {
          value: 0,
          needsUpdate: true,
        },
      },
      side: THREE.DoubleSide,
      vertexShader: `\
        attribute vec3 color;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        uniform float uColorEnabled;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(1., 0., 0., 1.);
        }
      `,
    }); */
    const sceneMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        // color: 0x0000ff,
        map,
      }),
    );
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
      mesh.frustumCulled = false;
      return mesh;
    })();
    floorMesh.position.y = -predictedHeight;
    floorMesh.updateMatrixWorld();
    this.scene.add(floorMesh);
    this.floorMesh = floorMesh;

    // planes mesh
    const planesMesh = (() => {
      const planeGeometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      planesMesh = new THREE.InstancedMesh(planeGeometry, material, planeMatrices.length);
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
    document.body.appendChild(backgroundCanvas);

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
    document.body.appendChild(editedImg);

    // get point cloud
    const {
      headers: pointCloudHeaders,
      arrayBuffer: pointCloudArrayBuffer,
    } = await getPointCloud(blob);
    const pointCloudCanvas = pointCloudArrayBuffer2canvas(pointCloudArrayBuffer);
    document.body.appendChild(pointCloudCanvas);

    const geometry = new THREE.PlaneBufferGeometry(1, 1, editedImg.width - 1, editedImg.height - 1);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/editedImg.width);
    // _clipGeometryToMask(geometry, maskImg);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({
      color: 0xff0000,
    });
    const backgroundMesh = new THREE.Mesh(geometry, material);
    backgroundMesh.position.copy(cameraPosition);
    backgroundMesh.quaternion.copy(cameraQuaternion);
    backgroundMesh.updateMatrixWorld();
    backgroundMesh.frustumCulled = false;
    
    const fov = Number(pointCloudHeaders['x-fov']);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    
    // re-render the canvas from this perspective
    const movedCanvas = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = this.renderer.domElement.width;
      canvas.height = this.renderer.domElement.height;
      document.body.appendChild(canvas);

      // create a copy of this.sceneMesh with a new material
      const sceneMesh2 = this.sceneMesh.clone();
      sceneMesh2.material = new THREE.ShaderMaterial({
        vertexShader: `\
          // encode the vertex index into the color attribute
          flat varying vec3 vColor;
          void main() {
            float fIndex = float(gl_VertexID);
            float r = floor(fIndex / 65536.);
            fIndex -= r * 65536.;
            float g = floor(fIndex / 256.);
            fIndex -= g * 256.;
            float b = fIndex;
            vColor = vec3(r, g, b) / 255.;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          flat varying vec3 vColor;
          void main() {
            gl_FragColor = vec4(vColor, 1.);
          }
        `,
      });
      this.scene.remove(this.sceneMesh);
      this.scene.add(sceneMesh2);

      // create a new non-antialiased renderer
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        // antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.render(this.scene, this.camera);

      // fill in the gaps in the canvas by re-rendering a full screen shader
      { 
        this.scene.remove(sceneMesh2);
        this.scene.add(this.sceneMesh);

        // set up the scene
        const fullscreenScene = new THREE.Scene();
        fullscreenScene.autoUpdate = false;

        const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // copy the renderer canvas
        const swapCanvas = document.createElement('canvas');
        swapCanvas.width = canvas.width;
        swapCanvas.height = canvas.height;
        const swapContext = swapCanvas.getContext('2d');
        swapContext.drawImage(renderer.domElement, 0, 0);

        const swapCanvasTexture = new THREE.Texture(swapCanvas);
        swapCanvasTexture.type = THREE.FloatType;
        swapCanvasTexture.needsUpdate = true;
        swapCanvasTexture.minFilter = THREE.NearestFilter;
        swapCanvasTexture.magFilter = THREE.NearestFilter;

        const fullscreenGeometry = new THREE.PlaneBufferGeometry(2, 2);
        const fullscreenMaterial = new THREE.ShaderMaterial({
          uniforms: {
            size: {
              value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
              needsUpdate: true,
            },
            map: {
              value: swapCanvasTexture,
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
            uniform sampler2D map;

            vec3 colors[9];
            float colorsCount[9];
            void addColor(vec4 color, int dx, int dy) {
              float d = sqrt(float(dx*dx + dy*dy));

              for (int i = 0; i < 9; i++) {
                if (colors[i] == color.rgb) {
                  // scale the count by distance
                  colorsCount[i] += 2. - 1. / d;
                  return;
                } else if (colorsCount[i] == 0.) {
                  colors[i] = color.rgb;
                  colorsCount[i] = 2. - 1. / d;
                  return;
                }
              }
            }
            vec3 getMostCommonColor() {
              float maxCount = 0.;
              vec3 maxColor = vec3(0.);
              for (int i = 0; i < 9; i++) {
                if (colorsCount[i] > maxCount) {
                  maxCount = colorsCount[i];
                  maxColor = colors[i];
                }
              }
              return maxColor;
            }
            void bubbleSort() {
                bool swapped = true;
                int j = 0;
                for (int c = 0; c < 3; c--)
                {
                    if (!swapped)
                        break;
                    swapped = false;
                    j++;
                    for (int i = 0; i < 3; i++)
                    {
                        if (i >= 3 - j)
                            break;
                        if (colorsCount[i] > colorsCount[i + 1])
                        {
                            vec3 tmpColor = colors[i];
                            colors[i] = colors[i + 1];
                            colors[i + 1] = tmpColor;

                            float tmpColorsCount = colorsCount[i];
                            colorsCount[i] = colorsCount[i + 1];
                            colorsCount[i + 1] = tmpColorsCount;

                            swapped = true;
                        }
                    }
                }
            }

            void main() {
              vec4 color = texture2D(map, vUv);
              if (color.a == 0.) {

                // accumulate the colors around us
                for (int dy = -1; dy <= 1; dy += 2) {
                  int dx = 0;
                  vec4 c = texture2D(map, vUv + /* vec2(0.5) / size + */ vec2(dx, dy) / size);
                  if (c.a > 0.) {
                    addColor(c, dx, dy);
                  }
                }
                for (int dx = -1; dx <= 1; dx += 2) {
                  int dy = 0;
                  vec4 c = texture2D(map, vUv + /* vec2(0.5) / size + */ vec2(dx, dy) / size);
                  if (c.a > 0.) {
                    addColor(c, dx, dy);
                  }
                }
                bubbleSort();

                // get the closest color
                vec3 commonColor = getMostCommonColor();

                // get the distance to the closest color
                float minDistance = 1e10;
                for (int dx = -1; dx <= 1; dx += 2) {
                  for (int dy = -1; dy <= 1; dy += 2) {
                    vec4 c = texture2D(map, vUv + /* vec2(0.5) / size + */ vec2(dx, dy) / size);
                    if (c.rgb == commonColor) {
                      float decodedDistance = (1. - c.a) * size.x;
                      float extraDistance = sqrt(float(dx * dx + dy * dy));
                      float distance = decodedDistance - extraDistance;
                      if (distance < minDistance) {
                        minDistance = distance;
                      }
                    }
                  }
                }

                if (commonColor == vec3(0.)) {
                  gl_FragColor = vec4(commonColor, 0.);
                } else {
                  // float a = a = (size.x - (closestDistance + extraDistance)) / size.x;
                  gl_FragColor = vec4(commonColor, 1.);
                }
              } else {
                gl_FragColor = color;
              }
            }
          `,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const fullscreenMesh = new THREE.Mesh(fullscreenGeometry, fullscreenMaterial);
        fullscreenMesh.frustumCulled = false;

        fullscreenScene.add(fullscreenMesh);

        // run a few times
        console.time('scanRender');
        const maxDistance = Math.ceil(1024 * Math.SQRT2);
        for (let i = 0; i < maxDistance; i++) {
          renderer.render(fullscreenScene, fullscreenCamera);
          // copy the result to the swap canvas
          swapContext.drawImage(renderer.domElement, 0, 0);
          swapCanvasTexture.needsUpdate = true;
        }
        console.timeEnd('scanRender');
      }
      const canvas2 = document.createElement('canvas');
      canvas2.width = canvas.width;
      canvas2.height = canvas.height;
      const context2 = canvas2.getContext('2d');
      context2.drawImage(canvas, 0, 0);
      const imageData = context2.getImageData(0, 0, canvas.width, canvas.height);
      // for (let y = 0; y < canvas.height; y++) {
      //   for (let x = 0; x < canvas.width; x++) {          
      //   }
      // }

      return canvas2;
    })();
    document.body.appendChild(movedCanvas);

    this.scene.add(backgroundMesh);
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
    // document.body.appendChild(labelCanvas);
    // console.log('found labels', labelClasses.filter((e, i) => boundingBoxLayers[i].length > 0));

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
    // document.body.appendChild(pointCloudCanvas);

    // run ransac
    const planeMatrices = [];
    {
      const geometry = new THREE.PlaneBufferGeometry(1, 1, img.width - 1, img.height - 1);
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