import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

import {createImageBlob} from '../clients/image-client.js';
import {getLabel} from '../clients/perception-client.js';
import {
  pointcloudStride,
  getPointCloud,
  pointCloudArrayBuffer2canvas,
  pointCloudArrayBufferToPositionAttributeArray,
  pointCloudArrayBufferToColorAttributeArray,
} from '../clients/reconstruction-client.js';

import {prompts} from '../constants/prompts.js';
import {blob2img} from '../utils/convert-utils.js';
import {labelClasses} from '../constants/prompts.js';

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

//

export class SceneGenerator {
  async generate(blob) {
    if (window.triggered) {
      // console.warn('already triggered', new Error().stack);
      // debugger;
      return;
    }
    window.triggered = true;

    if (!(blob instanceof Blob)) {
      const prompt = (typeof blob === 'string' ? blob : '') || prompts.world;
      blob = await createImageBlob(prompt);
    }

    // canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvas.classList.add('canvas');
    document.body.appendChild(canvas);

    // debug images
    
    // color
    const img = await blob2img(blob);
    document.body.appendChild(img);
    
    // label
    const {
      headers: labelHeaders,
      blob: labelBlob,
    } = await getLabel(blob, {
      classes: labelClasses,
      threshold: 0.0001,
    });
    // console.log('got label', {
    //   labelHeaders,
    //   labelBlob,
    // });
    const labelImg = await blob2img(labelBlob);
    // document.body.appendChild(labelImg);
    const boundingBoxLayers = JSON.parse(labelHeaders['x-bounding-boxes']);
    // console.log('got bounding boxes', boundingBoxLayers);
    const labelCanvas = drawLabelCanvas(labelImg, boundingBoxLayers);
    document.body.appendChild(labelCanvas);
    // window.labelCanvas = labelCanvas;
    // console.log('found labels', labelClasses.filter((e, i) => boundingBoxLayers[i].length > 0));

    // point cloud
    const {
      headers: pointCloudHeaders,
      arrayBuffer: pointCloudArrayBuffer,
    } = await getPointCloud(blob);
    const pointCloudCanvas = pointCloudArrayBuffer2canvas(pointCloudArrayBuffer);
    console.log('got point cloud', {
      pointCloudHeaders,
      pointCloudCanvas,
    });
    document.body.appendChild(pointCloudCanvas);

    // run ransac
    let planesMesh = null;
    {
      const geometry = new THREE.PlaneBufferGeometry(1, 1, img.width - 1, img.height - 1);
      pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/img.width, true);

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
        const planeGeometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
          color: 0xff0000,
        });
        planesMesh = new THREE.InstancedMesh(planeGeometry, material, planesJson.length);
        planesMesh.frustumCulled = false;
        planesMesh.count = 0;
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

          planesMesh.setMatrixAt(i, new THREE.Matrix4().compose(
            centroid,
            new THREE.Quaternion().setFromRotationMatrix(
              new THREE.Matrix4().lookAt(
                normal,
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 1, 0),
              )
            ),
            new THREE.Vector3(1, 1, 1)
          ));

          // latch new points
          points2 = Float32Array.from(outlierPlaneFloats);
          planesMesh.count++;
        }
        // update the instanced mesh
        planesMesh.instanceMatrix.needsUpdate = true;
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
      if (window.looping) {
        debugger;
      }
      window.looping = true;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
      });

      const scene = new THREE.Scene();
      // scene.background = new THREE.Color(0x0000FF);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

      // lights
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 2, 3);
      scene.add(directionalLight);
      
      const geometry = new THREE.PlaneBufferGeometry(1, 1, img.width - 1, img.height - 1);
      pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/img.width, false);
      geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
      pointCloudArrayBufferToColorAttributeArray(labelImg, geometry.attributes.color.array);
      const map = new THREE.Texture(img);
      map.needsUpdate = true;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          // color: {
          //   value: new THREE.Color(0xff0000),
          //   needsUpdate: true,
          // },
          map: {
            value: map,
            needsUpdate: true,
          },
          /* depthMap: {
            value: new THREE.Texture(pointCloudCanvas),
            needsUpdate: true,
          }, */
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
            /* gl_FragColor = texture2D(map, vUv);
            // gl_FragColor.rg += vUv * 0.1;
            if (uColorEnabled > 0.) {
              gl_FragColor.rgb = vColor;
            } */
          }
        `,
      });
      const sceneMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          // color: 0x0000ff,
          map,
        }),
      );
      sceneMesh.frustumCulled = false;
      scene.add(sceneMesh);

      // set the floor mesh
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
      scene.add(floorMesh);

      scene.add(planesMesh);

      const cubeMesh = new THREE.Mesh(
        new THREE.BoxBufferGeometry(1, 1, 1),
        new THREE.MeshPhongMaterial({
          color: 0x00ff00,
        }),
      );
      cubeMesh.frustumCulled = false;
      scene.add(cubeMesh);

      // add THREE.js orbit controls
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
      controls.minDistance = 1;
      controls.maxDistance = 100;
      controls.maxPolarAngle = Math.PI / 2;
      // set the target
      controls.target.set(0, 0, -3);

      const blockEvent = e => {
        e.preventDefault();
        e.stopPropagation();
      };
      canvas.addEventListener('mousedown', blockEvent);
      canvas.addEventListener('mouseup', blockEvent);
      canvas.addEventListener('click', blockEvent);
      canvas.addEventListener('wheel', blockEvent);
      document.addEventListener('keydown', e => {
        if (!e.repeat) {
          // page up
          if (e.key === 'PageUp') {
            material.uniforms.uColorEnabled.value = 1;
            material.uniforms.uColorEnabled.needsUpdate = true;
            blockEvent(e);
          } else if (e.key === 'PageDown') {
            material.uniforms.uColorEnabled.value = 0;
            material.uniforms.uColorEnabled.needsUpdate = true;
            blockEvent(e);
          }
        }
      });

      const _startLoop = () => {
        console.log('start render loop');
        const _render = () => {
          // update orbit controls
          controls.update();
          // console.log('camera', camera.position.toArray().join(','));
          camera.updateMatrixWorld();

          // update scene
          // sceneMesh.material.uniforms.map.needsUpdate = true;

          // render
          renderer.render(scene, camera);
        };
        const _loop = () => {
          requestAnimationFrame(_loop);
          _render();
        };
        _loop();
      };
      _startLoop();
    };
    const renderManager = _startRender();
  }
}