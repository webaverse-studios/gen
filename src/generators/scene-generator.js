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

import {prompts} from '../constants/prompts.js';
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

    console.log('edit', [blob, maskBlob, this.prompt]);
    const editedImg = await imageAiClient.editImg(blob, maskBlob, this.prompt);
    editedImg.classList.add('editImg');
    document.body.appendChild(editedImg);

    // const imageData = backgroundContext.getImageData(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    // debugger;
  }
}

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

      console.time('ransac');
      const res = await fetch(`https://depth.webaverse.com/ransac?n=${16}&threshold=${0.1}&init_n=${1500}`, {
        method: 'POST',
        body: points2.buffer,
      });
      console.timeEnd('ransac');
      if (res.ok) {
        const planesJson = await res.json();
        console.log('planes', planesJson);


        // draw the planes
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
      } else {
        debugger;
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