import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {targetScale, targetScaleInv} from '../constants/generator-constants.js';
import {
  panelSize,
  // floorNetWorldSize,
  // floorNetWorldDepth,
  // floorNetResolution,
  // floorNetPixelSize,
  // physicsPixelStride,
  // portalExtrusion,
  // entranceExitEmptyDiameter,
} from '../zine/zine-constants.js';

const blinkRectangleGeometry = (() => {
  const topGeometry = new THREE.BoxGeometry(targetScaleInv, 1, 1)
    .translate(0, targetScaleInv / 2, 0);
  const bottomGeometry = topGeometry.clone()
    .translate(0, -targetScaleInv, 0);
  const leftGeometry = new THREE.BoxGeometry(1, targetScaleInv, 1)
    .translate(-targetScaleInv / 2, 0, 0);
  const rightGeometry = leftGeometry.clone()
    .translate(targetScaleInv, 0, 0);

  const rectangleGeometry = BufferGeometryUtils.mergeBufferGeometries([
    topGeometry,
    bottomGeometry,
    leftGeometry,
    rightGeometry,
  ]);

  rectangleGeometry.scale(targetScale, targetScale, targetScale);

  return rectangleGeometry;
})();
export class BlinkMesh extends THREE.Mesh {
  constructor() {
    const blinkMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: false,
        },
        uWorldViewport: {
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
        uniform vec3 uWorldViewport;
        attribute vec2 direction;
        varying vec2 vDirection;
        
        void main() {
          vDirection = direction;

          vec3 p = vec3(position.xy * uWorldViewport.xy * 2., position.z + uWorldViewport.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
        uniform float uRunning;
        varying vec2 vDirection;
        
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
    super(blinkRectangleGeometry, blinkMaterial);
  }
}