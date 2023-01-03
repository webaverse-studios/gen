import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {targetScale, targetScaleInv} from '../constants/generator-constants.js';
// import {
//   panelSize,
//   floorNetWorldSize,
//   floorNetWorldDepth,
//   floorNetResolution,
//   floorNetPixelSize,
//   physicsPixelStride,
//   portalExtrusion,
//   entranceExitEmptyDiameter,
// } from '../zine/zine-constants.js';

const flashRectangleGeometry = new THREE.PlaneGeometry(1, 1)
  .rotateX(-Math.PI / 2)
export class FlashMesh extends THREE.Mesh {
  constructor() {
    const flashMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        scale: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        uRunning: {
          value: 0,
          needsUpdate: false,
        },
      },
      vertexShader: `\
        uniform float uTime;
        uniform vec3 scale;
        
        void main() {

          vec3 p = position * scale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform float uRunning;
        
        const vec3 color = vec3(1., 0.5, 0.5);

        void main() {
          if (uRunning > 0.5) {
            float modTime = mod(uTime, 0.15) / 0.15;
            float f = modTime < 0.5 ? 0. : 1.;
            vec3 c = mix(color, vec3(0., 0., 0.), f);
            gl_FragColor = vec4(c, 1.);
          } else {
            gl_FragColor = vec4(0., 0., 0., 1.);
          }
        }
      `,
      side: THREE.DoubleSide,
    });
    super(flashRectangleGeometry, flashMaterial);
    this.frustumCulled = false;
  }
}