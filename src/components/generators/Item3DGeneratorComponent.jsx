import * as THREE from 'three';
import {useState} from 'react';
import dcManager from '../../../dc-manager.js';

import styles from '../../../styles/Gen.module.css';

//

const pointeUrl = `https://mask2former.webaverse.com/pointe`;

//

const Item3DGeneratorComponent = () => {
  const [files, setFiles] = useState([]); // XXX latch files
  
  return (
    <div className={styles.generator}>
      <div className={styles.button} onClick={async () => {
        const chunkSize = 32;
        const range = 8;
        const fatness = 1;
        const widthOffset = 20;
        const heightOffset = 50;
        const renderScale = 20;

        const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
        const compress = (v, f) => f + v * (1 - f * 2);
        const snap = (v, n) => Math.round(v / n) * n;

        // point cloud
        let ps;
        let cs;
        {
          const r = await fetch('/pointcloud.f32');
          const a = await r.arrayBuffer();
          const numFloats = a.byteLength / Float32Array.BYTES_PER_ELEMENT;
          const numPositions = numFloats / 2;
          const numColors = numFloats / 2;
          ps = new Float32Array(a, 0, numPositions);
          cs = new Float32Array(a, numPositions * Float32Array.BYTES_PER_ELEMENT, numColors);
          // cs = new Float32Array(numColors);
          console.log('got point cloud raw', ps.slice(), cs.slice());

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
          mesh.position.set(0, heightOffset, 0);
          mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          mesh.scale.setScalar(renderScale / chunkSize);
          mesh.frustumCulled = false;
          scene.add(mesh);
          mesh.updateMatrixWorld();
        }

        await dcManager.waitForLoad();

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
          mesh2.position.set(-widthOffset, heightOffset, 0);
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
          mesh3.position.set(widthOffset, heightOffset, 0);
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
          mesh4.position.set(widthOffset * 2, heightOffset, 0);
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

        /* // quantize
        let positions4;
        let indices4;
        {
          const geometry = new THREE.BufferGeometry();

          positions4 = positions3.slice();
          for (let i = 0; i < positions4.length; i += 3) {
            positions4[i + 0] = snap(positions4[i + 0], 1);
            positions4[i + 1] = snap(positions4[i + 1], 1);
            positions4[i + 2] = snap(positions4[i + 2], 1);
          }
          geometry.setAttribute('position', new THREE.BufferAttribute(positions4, 3));

          indices4 = indices3.slice();
          geometry.setIndex(new THREE.BufferAttribute(indices4, 1));
          
          geometry.computeVertexNormals();

          const material = new THREE.MeshPhongMaterial({
            color: 0xFF0000,
          });

          const mesh4 = new THREE.Mesh(geometry, material);
          mesh4.position.set(widthOffset * 2, heightOffset, 0);
          mesh4.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
          mesh4.scale.setScalar(renderScale / chunkSize);
          mesh4.frustumCulled = false;
          scene.add(mesh4);
          mesh4.updateMatrixWorld();

          globalThis.mesh4 = mesh4
        } */

      }}>Generate</div>
    </div>
  );
};
export default Item3DGeneratorComponent;