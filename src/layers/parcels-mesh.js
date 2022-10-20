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
    const maxCount = 256;
    const parcelGeometry = new THREE.PlaneGeometry(1, 1)
      // .scale(scale, scale, scale)
      .translate(0.5, -0.5, 0)
      .rotateX(-Math.PI / 2);
    // parcelGeometry.setAttribute('positionIndex', new THREE.InstancedBufferAttribute(new Float32Array(maxCount), 1));
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
        uDown: {
          value: 0,
          needsUpdate: false,
        },
        hoverIndex: {
          value: -1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform vec2 highlightMin;
        uniform vec2 highlightMax;  
        uniform float uDown;
        uniform float hoverIndex;
        varying vec3 vPosition;
        varying vec3 vColor;

        void main() {
          vec4 instancePosition = vec4(position, 1.0);

          float index = float(gl_InstanceID);
          if (
            abs(hoverIndex - index) < 0.1
          ) {
            float scaleFactor = 1. - 0.1 * uDown;
            instancePosition.xyz -= 0.5;
            instancePosition.xyz *= scaleFactor;
            instancePosition.xyz += 0.5;
          }
          
          instancePosition = instanceMatrix * instancePosition;
          vPosition = instancePosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * instancePosition;

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
          vColor = c;
        }
      `,
      fragmentShader: `\
        uniform vec2 highlightMin;
        uniform vec2 highlightMax;
        varying vec3 vPosition;
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, 0.2);
        }
      `,
      transparent: true
    });
    super(parcelGeometry, parcelMaterial, maxCount);

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
    let hoverIndex = -1;
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

            hoverIndex = indexIndex;
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
    this.material.uniforms.hoverIndex.value = hoverIndex;
    this.material.uniforms.hoverIndex.needsUpdate = true;
    return {
      hoverIndex: this.material.uniforms.hoverIndex.value,
      highlightMin: this.material.uniforms.highlightMin.value.clone(),
      highlightMax: this.material.uniforms.highlightMax.value.clone(),
      active: this.material.uniforms.uDown.value > 0,
    }
  }
  updateActive(down) {
    // if (this.result) {
      this.material.uniforms.uDown.value = down ? 1 : 0;
      this.material.uniforms.uDown.needsUpdate = true;
    // }
  }
}