import * as THREE from 'three';

import {
  chunkSize,
  spacing,
} from '../../constants/renderer-constants.js';

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
}