import * as THREE from 'three';
import {
  floorNetResolution,
} from '../zine/zine-constants.js';
import {
  mod,
} from '../../utils.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localVector6 = new THREE.Vector3();
const localVector7 = new THREE.Vector3();
const localTriangle = new THREE.Triangle();
const localTriangle2 = new THREE.Triangle();

//

export const getPanelSpecOutlinePositionsDirections = ({
  outlineJson,
  floorPlaneLocation,
  directionMode = 'vertical',
} = {}) => {
  // edges
  const {
    edges,
  } = outlineJson;

  // positions
  const numPoints = edges.length;
  const positions = new Float32Array(numPoints * 3);
  for (let i = 0; i < numPoints; i++) {
    const edge = edges[i];
    localVector.fromArray(edge)
      .toArray(positions, i * 3);
  }

  // directions
  const floorQuaternion = new THREE.Quaternion()
    .fromArray(floorPlaneLocation.quaternion);
  const directions = new Float32Array(numPoints * 3);
  if (directionMode === 'vertical') {
    for (let i = 0; i < numPoints; i++) {
      localVector.set(0, 1, 0)
        .applyQuaternion(floorQuaternion)
        .toArray(directions, i * 3);
    }
  } else if (directionMode === 'horizontal') {
    for (let i = 0; i < numPoints; i++) {
      const centerI = i;
      const leftI = mod(i - 1, numPoints);
      const rightI = mod(i + 1, numPoints);

      const a = localVector.fromArray(positions, leftI * 3);
      const b = localVector2.fromArray(positions, centerI * 3);
      const c = localVector3.fromArray(positions, rightI * 3);
      const d = localVector4.copy(b)
        .add(
          localVector5.set(0, 1, 0)
            .applyQuaternion(floorQuaternion)
        );

      const triangle = localTriangle.set(a, d, b);
      const normal = triangle.getNormal(localVector5);
      const triangle2 = localTriangle2.set(d, c, b);
      const normal2 = triangle2.getNormal(localVector6);

      const normalAvg = localVector7.copy(normal)
        .add(normal2)
        .multiplyScalar(0.5);
      normalAvg.toArray(directions, i * 3);
    }
  } else {
    throw new Error('unknown directionMode: ' + directionMode);
  }

  return {
    positions,
    directions,
  };
};

//

export const makeFlowerGeometry = (
  positionsArray,
  directionsArray,
) => {
  const geometry = new THREE.BufferGeometry();

  // positions
  const numPoints = positionsArray.length / 3;
  const positions = new Float32Array(numPoints * 3 * 2);
  for (let i = 0; i < numPoints; i++) {
    localVector.fromArray(positionsArray, i * 3);
    localVector2.fromArray(directionsArray, i * 3);

    // bottom
    localVector.toArray(positions, i * 3);
    // top
    localVector.add(localVector2);
    localVector.toArray(positions, i * 3 + numPoints * 3);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // directions
  const directions = new Float32Array(numPoints * 3 * 2);
  // NOTE: only iterating the top points; the bottom points have direction 0
  for (let i = 0; i < numPoints; i++) {
    const index = i * 3;
    const indexTopOffset = numPoints * 3;
    localVector.fromArray(directionsArray, index)
      .toArray(directions, index + indexTopOffset);
  }
  geometry.setAttribute('direction', new THREE.BufferAttribute(directions, 3));

  // indices
  const uint16Array = new Uint16Array(numPoints * 6);
  for (let i = 0; i < numPoints; i++) {
    // bottom, from the first half of the positions array
    const a = i;
    // neighbor point
    const b = (i + 1) % numPoints;

    // top, from the second half of the positions array
    const c = i + numPoints;
    // neighbor point
    const d = b + numPoints;

    // abc
    uint16Array[i * 6 + 0] = a;
    uint16Array[i * 6 + 1] = c;
    uint16Array[i * 6 + 2] = d;
    // bdc
    uint16Array[i * 6 + 3] = a;
    uint16Array[i * 6 + 4] = d;
    uint16Array[i * 6 + 5] = b;
  }
  geometry.setIndex(new THREE.BufferAttribute(uint16Array, 1));
  geometry.computeVertexNormals();

  return geometry;
};

//

export const makeFloorFlowerMesh = (geometry) => {
  const material = new THREE.ShaderMaterial({
    vertexShader: `\
      attribute vec3 direction;
      varying vec3 vNormal;

      void main() {
        vNormal = normal;

        vec3 p = position;
        // if (direction != vec3(0.)) {
          p += direction * 9.;
        // }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `\
      varying vec3 vNormal;

      void main() {
        gl_FragColor = vec4(vNormal, 0.3);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
};

//

export const makeFloorPetalMesh = (geometry) => {
  const material = new THREE.ShaderMaterial({
    vertexShader: `\
      attribute vec3 direction;
      varying vec3 vNormal;

      void main() {
        vNormal = normal;
        
        vec3 p = position;
        // if (direction != vec3(0.)) {
          p += direction * 2.;
        // }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `\
      varying vec3 vNormal;

      void main() {
        // gl_FragColor = vec4(vNormal, 1.0);
        gl_FragColor = vec4(0., 1., 0., 0.3);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
};