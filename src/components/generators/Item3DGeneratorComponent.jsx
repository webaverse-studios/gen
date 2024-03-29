import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  useState,
  useRef,
  // useEffect,
} from 'react';
import classnames from 'classnames';
import {prompts} from '../../constants/prompts.js';
import dcManager from '../../../dc-manager.js';
import {
  floorNetPixelSize,
} from '../../zine/zine-constants.js';
import {
  makeRenderer,
  makeDefaultCamera,
} from '../../zine/zine-utils.js';
import {
  controlsMinDistance,
  controlsMaxDistance,
} from '../../constants/generator-constants.js';
import {blob2img} from '../../utils/convert-utils.js';
import {ItemGenerator} from '../../generators/item-generator.js';
import {DropTarget} from '../drop-target/DropTarget.jsx';

import styles from '../../../styles/Gen.module.css';

//

const itemGenerator = new ItemGenerator();

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();

//

const pointeUrl = `https://mask2former.webaverse.com/pointe`;

//

const Item3DGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(prompts.item);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imgBlob, setImgBlob] = useState(null);
  const [generated, setGenerated] = useState(false);
  const [compiled, setCompiled] = useState(false);
  const [ps, setPs] = useState([]);
  const [cs, setCs] = useState([]);

  const canvasRef = useRef();
  
  const addFiles = newFiles => {
    setFiles(newFiles);
  };

  return (
    <div className={styles.generator}>
      <canvas className={classnames(
        styles.canvas,
        compiled ? null : styles.hidden,
      )} ref={canvasRef} />
      {!loading ? <>
        {!generated && files.length === 0 ? <>
          <input type="text" className={styles.input} value={prompt} onChange={e => {
            setPrompt(e.target.value);
          }} placeholder={prompts.item} />
        </> : null}
        {(!generated && !imgBlob) ?
          <div className={styles.button} onClick={async () => {
            setLoading(true);

            try {
              let imgBlob;
              if (files.length > 0) {
                imgBlob = files[0];
              } else {
                imgBlob = await itemGenerator.generateImage(prompt);
              }
              setImgBlob(imgBlob);

              const img = await blob2img(imgBlob);
              img.classList.add('img');
              document.body.appendChild(img);

              const res = await fetch(pointeUrl, {
                method: 'POST',
                body: imgBlob,
              });
              const arrayBuffer = await res.arrayBuffer();
              const numFloats = arrayBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT;
              const numPositions = numFloats / 2;
              const numColors = numFloats / 2;
              const ps = new Float32Array(arrayBuffer, 0, numPositions);
              const cs = new Float32Array(arrayBuffer, numPositions * Float32Array.BYTES_PER_ELEMENT, numColors);

              console.log('got point cloud raw', ps.slice(), cs.slice());

              setPs(ps);
              setCs(cs);
            } finally {
              setLoading(false);
              setGenerated(true);
            }
          }}>Generate</div>
        : null}
        {(!compiled && imgBlob) ?
          <div className={styles.button} onClick={async () => {
            setLoading(true);

            try {
              const chunkSize = 32;
              const range = 8;
              const fatness = 1;
              const widthOffset = 20;
              const heightOffset = 50;
              const renderScale = 20;

              const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
              const compress = (v, f) => f + v * (1 - f * 2);
              const snap = (v, n) => Math.round(v / n) * n;

              // canvas
              const width = floorNetPixelSize;
              const height = floorNetPixelSize;
              // const canvas = document.createElement('canvas');
              const canvas = canvasRef.current;
              // if (!canvas) {
              //   throw new Error('no canvas');
              // }
              canvas.width = width;
              canvas.height = height;

              // renderer
              const renderer = makeRenderer(canvas);
              renderer.autoClear = false;

              // camera
              const camera = makeDefaultCamera();
              camera.position.z = heightOffset;
              camera.updateMatrixWorld();

              // controls
              const controls = new OrbitControls(camera, canvas);
              controls.minDistance = controlsMinDistance;
              controls.maxDistance = controlsMaxDistance;
              controls.target.set(0, 0, 0);
              controls.update();

              // scene
              const scene = new THREE.Scene();
              scene.matrixAutoUpdate = false;

              // lights
              const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
              directionalLight.position.set(1, 2, 3);
              directionalLight.updateMatrixWorld();
              scene.add(directionalLight);

              // render
              const _render = () => {
                requestAnimationFrame(_render);

                controls.update();
                renderer.clear();
                renderer.render(scene, camera);
              };
              requestAnimationFrame(_render);

              //

              // point cloud
              {

                setLoading(true);

                await dcManager.waitForLoad();

                // get the bounding box
                const bbox = new THREE.Box3();
                for (let i = 0; i < ps.length; i += 3) {
                  bbox.min.x = Math.min(bbox.min.x, ps[i + 0]);
                  bbox.min.y = Math.min(bbox.min.y, ps[i + 1]);
                  bbox.min.z = Math.min(bbox.min.z, ps[i + 2]);
                  
                  bbox.max.x = Math.max(bbox.max.x, ps[i + 0]);
                  bbox.max.y = Math.max(bbox.max.y, ps[i + 1]);
                  bbox.max.z = Math.max(bbox.max.z, ps[i + 2]);
                }
                console.log('got bbox', bbox.min.toArray(), bbox.max.toArray());
                // scale to fit in a 1x1x1 box
                const center = bbox.getCenter(new THREE.Vector3());
                const size = bbox.getSize(new THREE.Vector3());
                const sizeF = Math.max(size.x, size.y, size.z);
                console.log('got scale', {center, size, sizeF});
                
                const compressF = range / chunkSize;

                for (let i = 0; i < ps.length; i += 3) {
                  ps[i + 0] = clamp(compress(0.5 + (ps[i + 0] - center.x) / sizeF, compressF), 0, 1) * chunkSize;
                  ps[i + 1] = clamp(compress(0.5 + (ps[i + 1] - center.y) / sizeF, compressF), 0, 1) * chunkSize;
                  ps[i + 2] = clamp(compress(0.5 + (ps[i + 2] - center.z) / sizeF, compressF), 0, 1) * chunkSize;
                }

                // XXX quantize
                // for (let i = 0; i < ps.length; i += 3) {
                //   ps[i + 0] = snap(ps[i + 0], 1);
                //   ps[i + 1] = snap(ps[i + 1], 1);
                //   ps[i + 2] = snap(ps[i + 2], 1);
                // }

                console.log('got point cloud normalized', ps.slice());

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(ps, 3));
                geometry.setAttribute('color', new THREE.BufferAttribute(cs, 3));
                const material = new THREE.PointsMaterial({
                  size: 0.2,
                  sizeAttenuation: true,
                  // color: 0x0000FF,
                  vertexColors: true,
                });
                const mesh = new THREE.Points(geometry, material);
                mesh.position.set(0, 0, 0);
                mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                mesh.scale.setScalar(renderScale / chunkSize);
                mesh.frustumCulled = false;
                scene.add(mesh);
                mesh.updateMatrixWorld();
              }

              // dual contouring
              let positions;
              let indices;
              {
                const instance = dcManager.dcWorker.createInstance({
                  chunkSize,
                  range,
                  fatness,
                });
                // const meshResultUint8Array = dcManager.dcWorker.createPointCloudMesh(instance, ps);
                const meshResultUint8Array = dcManager.dcWorker.marchCubes(instance, ps);
                dcManager.dcWorker.destroyInstance(instance);
                // console.log('got mesh result', meshResultUint8Array);

                const dataView = new DataView(meshResultUint8Array.buffer, meshResultUint8Array.byteOffset, meshResultUint8Array.byteLength);
                let index = 0;

                const numPositions = dataView.getUint32(index, true);
                index += Uint32Array.BYTES_PER_ELEMENT;
                positions = new Float32Array(meshResultUint8Array.buffer, meshResultUint8Array.byteOffset + index, numPositions * 3);
                index += positions.byteLength;

                const numNormals = dataView.getUint32(index, true);
                index += Uint32Array.BYTES_PER_ELEMENT;
                const normals = new Float32Array(meshResultUint8Array.buffer, meshResultUint8Array.byteOffset + index, numNormals * 3);
                index += normals.byteLength;

                const numIndices = dataView.getUint32(index, true);
                index += Uint32Array.BYTES_PER_ELEMENT;
                indices = new Uint32Array(meshResultUint8Array.buffer, meshResultUint8Array.byteOffset + index, numIndices);
                index += indices.byteLength;

                // console.log('parsed mesh result', positions,
                //   normals,
                //   indices,
                // );
                // if (index !== meshResultUint8Array.byteLength) {
                //   console.warn('mesh result out of sync', index, meshResultUint8Array.byteLength);
                //   throw new Error('mesh result out of sync');
                // }

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
                
                const material = new THREE.MeshPhongMaterial({
                  color: 0x00FF00,
                });

                const mesh2 = new THREE.Mesh(geometry, material);
                mesh2.position.set(-widthOffset, 0, 0);
                mesh2.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                mesh2.scale.setScalar(renderScale / chunkSize);
                mesh2.frustumCulled = false;
                scene.add(mesh2);
                mesh2.updateMatrixWorld();
              }

              // vhacd
              let hulls;
              let positions3;
              let indices3;
              {
                const vhacdResultUint8Array = dcManager.dcWorker.vhacd({
                  positions,
                  indices,
                  maxConvexHulls: 4,
                  // resolution: 400000,
                  // resolution: 100000,
                  resolution: chunkSize,
                  // minimumVolumePercentErrorAllowed: 1,
                  // minimumVolumePercentErrorAllowed: 10,
                  // minimumVolumePercentErrorAllowed: 0.01,
                  minimumVolumePercentErrorAllowed: 0,
                  // maxRecursionDepth: 10,
                  maxRecursionDepth: 4,
                  shrinkWrap: true,
                  // shrinkWrap: false,
                  fillMode: dcManager.fillModes[0],
                  // fillMode: dcManager.fillModes[1],
                  // fillMode: dcManager.fillModes[2],
                  maxNumVerticesPerCH: 64,
                  // maxNumVerticesPerCH: 16,
                  // maxNumVerticesPerCH: 1024,
                  // maxNumVerticesPerCH: 256,
                  minEdgeLength: 0,
                  // minEdgeLength: 16,
                  // minEdgeLength: 0,
                  // findBestPlane: false,
                  findBestPlane: true,
                });

                const dataView = new DataView(vhacdResultUint8Array.buffer, vhacdResultUint8Array.byteOffset, vhacdResultUint8Array.byteLength);
                let index = 0;

                const numHulls = dataView.getUint32(index, true);
                index += Uint32Array.BYTES_PER_ELEMENT;
                
                let numPositionsTotal = 0;
                let numIndicesTotal = 0;

                hulls = Array(numHulls);
                for (let i = 0; i < numHulls; i++) {
                  const numPositions = dataView.getUint32(index, true);
                  index += Uint32Array.BYTES_PER_ELEMENT;
                  const positions = new Float32Array(vhacdResultUint8Array.buffer, vhacdResultUint8Array.byteOffset + index, numPositions);
                  index += positions.byteLength;

                  numPositionsTotal += numPositions;

                  const numIndices = dataView.getUint32(index, true);
                  index += Uint32Array.BYTES_PER_ELEMENT;
                  const indices = new Uint32Array(vhacdResultUint8Array.buffer, vhacdResultUint8Array.byteOffset + index, numIndices);
                  index += indices.byteLength;

                  numIndicesTotal += numIndices;

                  hulls[i] = {
                    positions,
                    indices,
                  };
                }

                console.log('got hulls', hulls);

                const geometry = new THREE.BufferGeometry();

                positions3 = new Float32Array(numPositionsTotal);
                let positionsIndex = 0;
                indices3 = new Uint32Array(numIndicesTotal);
                let indicesIndex = 0;
                for (let i = 0; i < hulls.length; i++) {
                  const hull = hulls[i];

                  for (let j = 0; j < hull.indices.length; j++) {
                    indices3[indicesIndex + j] = hull.indices[j] + positionsIndex / 3;
                  }
                  indicesIndex += hull.indices.length;

                  positions3.set(hull.positions, positionsIndex);
                  positionsIndex += hull.positions.length;
                }
                geometry.setAttribute('position', new THREE.BufferAttribute(positions3, 3));
                geometry.setIndex(new THREE.BufferAttribute(indices3, 1));
                geometry.computeVertexNormals();
                
                const material = new THREE.MeshPhongMaterial({
                  color: 0x0000FF,
                });

                const mesh3 = new THREE.Mesh(geometry, material);
                mesh3.position.set(widthOffset, 0, 0);
                mesh3.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                mesh3.scale.setScalar(renderScale / chunkSize);
                mesh3.frustumCulled = false;
                scene.add(mesh3);
                mesh3.updateMatrixWorld();
              }

              // voxelize
              {
                const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
                const geometry = new THREE.InstancedBufferGeometry();
                geometry.copy(baseGeometry);

                const colorField = new Float32Array(chunkSize * chunkSize * chunkSize * 3);
                const sumField = new Float32Array(chunkSize * chunkSize * chunkSize);
                const seenVoxels = new Set();
                for (let i = 0; i < ps.length; i += 3) {
                  const p = localVector.fromArray(ps, i);
                  if (p.x >= 0 && p.x < chunkSize && p.y >= 0 && p.y < chunkSize && p.z >= 0 && p.z < chunkSize) {
                    const x = Math.floor(p.x);
                    const y = Math.floor(p.y);
                    const z = Math.floor(p.z);
                    const index = x + y * chunkSize + z * chunkSize * chunkSize;
                    
                    const c = localVector2.fromArray(cs, i);
                    colorField[index * 3 + 0] += c.x;
                    colorField[index * 3 + 1] += c.y;
                    colorField[index * 3 + 2] += c.z;
                    sumField[index]++;

                    seenVoxels.add(index);
                  }
                }

                console.log('got seen voxels', seenVoxels);

                const getNumNeighbors = (seenVoxels, x, y, z) => {
                  let result = 0;
                  for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                      for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dy === 0 && dz === 0) {
                          continue;
                        }
                        const nx = x + dx;
                        const ny = y + dy;
                        const nz = z + dz;
                        if (nx >= 0 && nx < chunkSize && ny >= 0 && ny < chunkSize && nz >= 0 && nz < chunkSize) {
                          const index = nx + ny * chunkSize + nz * chunkSize * chunkSize;
                          result += +seenVoxels.has(index);
                        }
                      }
                    }
                  }
                  return result;
                };

                const maxCount = seenVoxels.size;
                const offsets = new Float32Array(maxCount * 3);
                const colors = new Float32Array(maxCount * 3);
                let offsetIndex = 0;
                let colorIndex = 0;
                let count = 0;
                for (const index of seenVoxels) {
                  const x = index % chunkSize;
                  const y = Math.floor(index / chunkSize) % chunkSize;
                  const z = Math.floor(index / (chunkSize * chunkSize));

                  const numNeighbors = getNumNeighbors(seenVoxels, x, y, z);
                  if (numNeighbors >= 1) {
                    offsets[offsetIndex + 0] = x;
                    offsets[offsetIndex + 1] = y;
                    offsets[offsetIndex + 2] = z;
                    offsetIndex += 3;

                    const sum = sumField[index];
                    colors[colorIndex + 0] = colorField[index * 3 + 0] / sum;
                    colors[colorIndex + 1] = colorField[index * 3 + 1] / sum;
                    colors[colorIndex + 2] = colorField[index * 3 + 2] / sum;
                    colorIndex += 3;

                    count++;
                  }
                }
                geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
                geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));

                const material = new THREE.ShaderMaterial({
                  vertexShader: `\
                    attribute vec3 offset;
                    attribute vec3 color;
                    varying vec3 vColor;

                    void main() {
                      vColor = color;

                      vec3 p = position + offset;
                      // vec3 p = position;
                      // gl_Position = projectionMatrix * modelMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0);
                      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
                    }
                  `,
                  fragmentShader: `\
                    varying vec3 vColor;

                    void main() {
                      gl_FragColor = vec4(vColor, 1.0);
                      // gl_FragColor = vec4(1., 0., 0., 1.0);
                    }
                  `,
                });

                const mesh4 = new THREE.InstancedMesh(geometry, material, count);
                mesh4.position.set(widthOffset * 2, 0, 0);
                mesh4.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                mesh4.scale.setScalar(renderScale / chunkSize);
                mesh4.frustumCulled = false;
                scene.add(mesh4);
                mesh4.updateMatrixWorld();

                const matrix = localMatrix.identity();
                for (let i = 0; i < count; i++) {
                  mesh4.setMatrixAt(i, matrix);
                }
                mesh4.count = count;
                mesh4.instanceMatrix.needsUpdate = true;
              }
            } finally {
              setLoading(false);
              setCompiled(true);
            }
          }}>Compile</div>
        : null}
        {/* {imgBlob ?
          <div className={styles.button} onClick={async () => {
            // download the images
            downloadFile(imgBlob, 'item.png');
          }}>DL images</div>
        : null} */}
        {(!generated && files.length === 0) ? <DropTarget
          className={classnames(
            styles.panelPlaceholder,
          )}
          onFilesAdd={addFiles}
          // multiple
        /> : null}
        {(!generated && files.length > 0) ? <div className={styles.files}>
          <div className={styles.filesHeader}>Files ({files.length}):</div>
          {files.map((file, i) => {
            return (
              <div className={styles.file} key={i}>
                <div className={styles.fileName}>{file.name}</div>
                <a className={styles.closeX} onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();

                  const newFiles = files.slice();
                  newFiles.splice(i, 1);
                  setFiles(newFiles);
                }}>x</a>
              </div>
            );
          })}
        </div> : null}
      </> : <div className={styles.header}>
        compiling...
      </div>}
    </div>
  );
};
export default Item3DGeneratorComponent;