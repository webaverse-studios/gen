import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {targetWorldScale} from '../constants/generator-constants.js';
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

const _decorateDirectionAttribute = (geometry, direction) => {
  const directions = new Float32Array(geometry.attributes.position.array.length / 3 * 2);
  for (let i = 0; i < directions.length; i += 2) {
    direction.toArray(directions, i);
  }
  geometry.setAttribute('direction', new THREE.BufferAttribute(directions, 2));
};
const floorTargetGeometry = (() => {
  const topLeftCornerGeometry = BufferGeometryUtils.mergeBufferGeometries([
    new THREE.BoxGeometry(3, 1, 1)
      .translate(3 / 2 - 0.5, 0, 0),
    new THREE.BoxGeometry(1, 3 - 0.5, 1)
      .translate(0, -(3 - 0.5) / 2 - 0.5, 0),
  ]);
  const bottomLeftCornerGeometry = topLeftCornerGeometry.clone()
    .rotateZ(Math.PI / 2);
  const bottomRightCornerGeometry = topLeftCornerGeometry.clone()
    .rotateZ(Math.PI);
  const topRightCornerGeometry = topLeftCornerGeometry.clone()
    .rotateZ(-Math.PI / 2);

  _decorateDirectionAttribute(topLeftCornerGeometry, new THREE.Vector2(-1, -1));
  _decorateDirectionAttribute(bottomLeftCornerGeometry, new THREE.Vector2(-1, 1));
  _decorateDirectionAttribute(bottomRightCornerGeometry, new THREE.Vector2(1, 1));
  _decorateDirectionAttribute(topRightCornerGeometry, new THREE.Vector2(1, -1));

  const targetGeometry = BufferGeometryUtils.mergeBufferGeometries([
    topLeftCornerGeometry,
    bottomLeftCornerGeometry,
    bottomRightCornerGeometry,
    topRightCornerGeometry,
  ]);
  targetGeometry.scale(targetWorldScale, targetWorldScale, targetWorldScale);
  targetGeometry.rotateX(-Math.PI / 2);
  return targetGeometry;
})();
export class FloorTargetMesh extends THREE.Mesh {
  constructor() {
    const floorTargetMaterial = new THREE.ShaderMaterial({
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
        uniform vec3 scale;
        attribute vec2 direction;
        
        void main() {
          vec3 p = position + vec3(direction.x, 0., direction.y) * scale * 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        uniform vec3 uWorldViewport;
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
    super(floorTargetGeometry, floorTargetMaterial);
    this.frustumCulled = false;
  }
}