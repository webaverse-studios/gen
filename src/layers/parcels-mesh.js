import * as THREE from 'three';

import {
  chunkSize,
} from '../../constants/procgen-constants.js';
import {
  spacing,
} from '../../constants/map-constants.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localMatrix = new THREE.Matrix4();

const zeroQuaternion = new THREE.Quaternion();

//

export class ParcelsMesh extends THREE.InstancedMesh {
  constructor() {
    const parcelGeometry = new THREE.PlaneGeometry(1, 1)
      // .scale(scale, scale, scale)
      .translate(0.5, -0.5, 0)
      .rotateX(-Math.PI / 2);
    const parcelMaterial = new THREE.ShaderMaterial({
      uniforms: {
        highlightMin: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
        highlightMax: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
      },
      vertexShader: `\
        varying vec3 vPosition;

        void main() {
          vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
          vPosition = instancePosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
        }
      `,
      fragmentShader: `\
        uniform vec2 highlightMin;
        uniform vec2 highlightMax;
        varying vec3 vPosition;

        void main() {
          vec3 c;
          if (
            vPosition.x >= highlightMin.x &&
            vPosition.x < highlightMax.x &&
            vPosition.z >= highlightMin.y &&
            vPosition.z <= highlightMax.y
          ) {
            c = vec3(0., 0., 1.);
          } else {
            c = vec3(0., 1., 0.);
          }
          gl_FragColor = vec4(c, 0.2);
        }
      `,
      transparent: true
    });
    super(parcelGeometry, parcelMaterial, 256);

    this.result = null;
  }
  setResult(result) {
    this.result = result;
  
    const {
      leafNodes,
    } = result;
    for (let i = 0; i < leafNodes.length; i++) {
      const leafNode = leafNodes[i];
      const {
        min,
        lod,
      } = leafNode;

      const size = lod * chunkSize;
      localMatrix.compose(
        localVector.set(
          min[0] * chunkSize,
          0,
          min[1] * chunkSize
        ),
        zeroQuaternion,
        localVector2.setScalar(size - spacing)
      );
      this.setMatrixAt(i, localMatrix);
    }
    this.instanceMatrix.needsUpdate = true;
    this.count = leafNodes.length;
  }
  updateHover(position) {
    if (this.result) {
      const {leafNodes, leafNodesMin, leafNodesMax, leafNodesIndex} = this.result;

      const chunkPosition = localVector.copy(position);
      chunkPosition.x = Math.floor(chunkPosition.x / chunkSize);
      chunkPosition.y = Math.floor(chunkPosition.y / chunkSize);
      chunkPosition.z = Math.floor(chunkPosition.z / chunkSize);

      if (
        chunkPosition.x >= leafNodesMin[0] && chunkPosition.x < leafNodesMax[0] &&
        chunkPosition.z >= leafNodesMin[1] && chunkPosition.z < leafNodesMax[1]
      ) {
        const x = chunkPosition.x - leafNodesMin[0];
        const z = chunkPosition.z - leafNodesMin[1];
        const w = leafNodesMax[0] - leafNodesMin[0];
        // const h = leafNodesMax[1] - leafNodesMin[1];
        const index = x + z * w;
        if (index >= 0 && index < leafNodesIndex.length) {
          const indexIndex = leafNodesIndex[index];
          const leafNode = leafNodes[indexIndex];
          if (leafNode) {
            const {min, lod} = leafNode;

            this.material.uniforms.highlightMin.value.fromArray(min)
              .multiplyScalar(chunkSize);
            this.material.uniforms.highlightMin.needsUpdate = true;
            this.material.uniforms.highlightMax.value.fromArray(min)
              .add(localVector2.setScalar(lod))
              .multiplyScalar(chunkSize);
            this.material.uniforms.highlightMax.needsUpdate = true;
          } else {
            debugger;
          }
        } else {
          debugger;
        }
      } else {
        this.material.uniforms.highlightMin.value.setScalar(0);
        this.material.uniforms.highlightMin.needsUpdate = true;
        this.material.uniforms.highlightMax.value.setScalar(0);
        this.material.uniforms.highlightMax.needsUpdate = true;
      }
    }
  }
}