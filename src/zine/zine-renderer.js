import * as THREE from 'three';
import alea from 'alea';
import {
  mainImageKey,
  // promptKey,
  // layer2Specs,
} from './zine-data-specs.js';
import {
  makeDefaultCamera,
  normalToQuaternion,
} from './zine-utils.js';
import {
  // getDepthFloatsFromIndexedGeometry,
  // reinterpretFloatImageData,
  pointCloudArrayBufferToGeometry,
  decorateGeometryTriangleIds,
  depthFloat32ArrayToOrthographicGeometry,
} from '../zine/zine-geometry-utils.js';
import {
  setOrthographicCameraFromJson,
} from './zine-camera-utils.js';
import {
  floorNetPixelSize,
} from './zine-constants.js';

//

// const upVector = new THREE.Vector3(0, 1, 0);
const backwardVector = new THREE.Vector3(0, 0, 1);

//

class SceneMaterial extends THREE.ShaderMaterial {
  constructor({
    map,
  }) {
    super({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        selectedIndicesMap: {
          value: null,
          needsUpdate: false,
        },
        iSelectedIndicesMapResolution: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
        uEraser: {
          value: 0,
          needsUpdate: true,
        },
        uMouseDown: {
          value: 0,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute float triangleId;
        varying vec2 vUv;
        varying float vTriangleId;
        
        void main() {
          vUv = uv;
          vTriangleId = triangleId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        uniform sampler2D selectedIndicesMap;
        uniform vec2 iSelectedIndicesMapResolution;
        uniform int uEraser;
        uniform int uMouseDown;

        varying vec2 vUv;
        varying float vTriangleId;

        void main() {
          gl_FragColor = texture2D(map, vUv);
          
          if (uEraser == 1) {
            // check for selection
            float x = mod(vTriangleId, iSelectedIndicesMapResolution.x);
            float y = floor(vTriangleId / iSelectedIndicesMapResolution.x);
            vec2 uv = (vec2(x, y) + 0.5) / iSelectedIndicesMapResolution;
            vec4 selectedIndexRgba = texture2D(selectedIndicesMap, uv);
            bool isSelected = selectedIndexRgba.r > 0.5;
            if (isSelected) {
              if (uMouseDown == 1) {
                gl_FragColor.rgb = vec3(${new THREE.Color(0xFF3333).toArray().join(', ')});
              } else {
                gl_FragColor.rgb *= 0.2;
              }
            }
          }
        }
      `,
    })
  }
}
class SceneMesh extends THREE.Mesh {
  constructor({
    pointCloudArrayBuffer,
    imgArrayBuffer,
    width,
    height,
    segmentSpecs,
    planeSpecs,
    portalSpecs,
    firstFloorPlaneIndex,
  }) {
    const map = new THREE.Texture();
    const material = new SceneMaterial({
      map,
    });

    // scene mesh
    let geometry = pointCloudArrayBufferToGeometry(
      pointCloudArrayBuffer,
      width,
      height,
    );
    geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
    geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
    geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
    geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
    // geometry.setAttribute('portal', new THREE.BufferAttribute(portalSpecs.array, 1));
    geometry.setAttribute('portalColor', new THREE.BufferAttribute(portalSpecs.colorArray, 3));
    const indexedGeometry = geometry;
    geometry = geometry.toNonIndexed();
    decorateGeometryTriangleIds(geometry);

    super(geometry, material);

    const sceneMesh = this;
    sceneMesh.name = 'sceneMesh';
    sceneMesh.frustumCulled = false;
    sceneMesh.indexedGeometry = indexedGeometry;
    sceneMesh.segmentSpecs = segmentSpecs;
    sceneMesh.planeSpecs = planeSpecs;
    sceneMesh.portalSpecs = portalSpecs;
    sceneMesh.firstFloorPlaneIndex = firstFloorPlaneIndex;
    sceneMesh.update = (selector) => {
      sceneMesh.material.uniforms.uMouseDown.value = +selector.mousedown;
      sceneMesh.material.uniforms.uMouseDown.needsUpdate = true;
    };
    (async () => { // load the texture image
      sceneMesh.visible = false;

      const imgBlob = new Blob([imgArrayBuffer], {
        type: 'image/png',
      });
      map.image = await createImageBitmap(imgBlob, {
        imageOrientation: 'flipY',
      });
      // map.encoding = THREE.sRGBEncoding;
      map.needsUpdate = true;

      sceneMesh.visible = true;
    })();
  }
}

//

class FloorNetMesh extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.PlaneBufferGeometry(1, 1);

    const material = new THREE.MeshPhongMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide,
    });

    super(geometry, material);

    const floorNetMesh = this;
    floorNetMesh.enabled = false;
    let hasGeometry = false;
    floorNetMesh.setGeometry = ({
      floorNetDepths,
      floorNetCamera,
    }) => {
      const geometry = depthFloat32ArrayToOrthographicGeometry(
        floorNetDepths,
        floorNetPixelSize,
        floorNetPixelSize,
        floorNetCamera,
      );
      geometry.computeVertexNormals();
      floorNetMesh.geometry = geometry;

      hasGeometry = true;
      floorNetMesh.updateVisibility();
    };
    floorNetMesh.updateVisibility = () => {
      floorNetMesh.visible = floorNetMesh.enabled && hasGeometry;
    };
    floorNetMesh.frustumCulled = false;
    floorNetMesh.visible = false;
  }
}

//

const _getFloorTransform = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();

  return ({
    planeSpecs,
    firstFloorPlaneIndex,
  }) => {
    if (firstFloorPlaneIndex !== -1) {
      const labelSpec = planeSpecs.labels[firstFloorPlaneIndex];
      const normal = localVector.fromArray(labelSpec.normal);
      const center = localVector2.fromArray(labelSpec.center);
      
      const position = center.clone();
      const quaternion = localQuaternion;
      normalToQuaternion(normal, quaternion, backwardVector)
        .multiply(localQuaternion2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2));

      return {
        position,
        quaternion,
      };
    } else {
      return {
        position,
        quaternion,
      };
    }
  };
})();
const _getCandidateTransforms = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localVector3 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localQuaternion2 = new THREE.Quaternion();
  const localMatrix = new THREE.Matrix4();
  
  return ({
    portalLocations,
    firstFloorPlaneIndex,
    floorTransform,
    planeSpecs,
    n = 1
  }) => {
    const rng = alea('avatars');
    const candidatePortalLocations = portalLocations.slice();

    const result = Array(n);
    for (let i = 0; i < n && candidatePortalLocations.length > 0; i++) {
      let position;
      let quaternion;

      // position
      const portalLocation = candidatePortalLocations.splice(Math.floor(rng() * candidatePortalLocations.length), 1)[0];
      position = new THREE.Vector3().fromArray(portalLocation);

      // quaternion
      const lookCandidateLocations = (firstFloorPlaneIndex !== -1 ? [
        floorTransform.position,
      ] : [])
        .concat(candidatePortalLocations.map(portalLocation => {
          return new THREE.Vector3().fromArray(portalLocation);
        }));
      if (lookCandidateLocations.length > 0) {
        const lookCandidateLocation = lookCandidateLocations[Math.floor(rng() * lookCandidateLocations.length)];
        // match up vector to first plane
        const up = localVector2.set(0, 1, 0);
        if (firstFloorPlaneIndex !== -1) {
          const labelSpec = planeSpecs.labels[firstFloorPlaneIndex];
          const normal = localVector3.fromArray(labelSpec.normal);
          normalToQuaternion(normal, localQuaternion, backwardVector)
            .multiply(localQuaternion2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2))
          up.applyQuaternion(localQuaternion);
        }
        quaternion = new THREE.Quaternion().setFromRotationMatrix(
          localMatrix.lookAt(
            position,
            lookCandidateLocation,
            up
          )
        );
      } else {
        quaternion = new THREE.Quaternion();
      }
      result[i] = {
        position,
        quaternion,
      };
    }
    return result;
  };
})();

//

export class ZineRenderer {
  constructor({
    panel,
  }) {
    const layer0 = panel.getLayer(0);
    const layer1 = panel.getLayer(1);
    const imgArrayBuffer = layer0.getData(mainImageKey);
    const resolution = layer1.getData('resolution');
    const segmentMask = layer1.getData('segmentMask');
    // const labelImageData = layer1.getData('labelImageData');
    const pointCloudHeaders = layer1.getData('pointCloudHeaders');
    let pointCloudArrayBuffer = layer1.getData('pointCloud');
    // const planeMatrices = layer1.getData('planeMatrices');
    const planesJson = layer1.getData('planesJson');
    const planesMask = layer1.getData('planesMask');
    const portalJson = layer1.getData('portalJson');
    const segmentSpecs = layer1.getData('segmentSpecs');
    const planeSpecs = layer1.getData('planeSpecs');
    const portalSpecs = layer1.getData('portalSpecs');
    const firstFloorPlaneIndex = layer1.getData('firstFloorPlaneIndex');
    const floorNetDepths = layer1.getData('floorNetDepths');
    const floorNetCameraJson = layer1.getData('floorNetCameraJson');
    const predictedHeight = layer1.getData('predictedHeight');
    const portalLocations = layer1.getData('portalLocations');

    // camera
    this.camera = makeDefaultCamera();
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // floor net camera
    const floorNetCamera = setOrthographicCameraFromJson(
      new THREE.OrthographicCamera(),
      floorNetCameraJson
    );

    // scene mesh
    const sceneMesh = new SceneMesh({
      pointCloudArrayBuffer,
      imgArrayBuffer,
      width: resolution[0],
      height: resolution[1],
      segmentSpecs,
      planeSpecs,
      portalSpecs,
      firstFloorPlaneIndex,
    });
    this.sceneMesh = sceneMesh;

    // floor net mesh
    const floorNetMesh = new FloorNetMesh();
    this.floorNetMesh = floorNetMesh;
    this.floorNetMesh.setGeometry({
      floorNetDepths,
      floorNetCamera,
    });

    // transforms
    const floorTransform = _getFloorTransform({
      planeSpecs,
      firstFloorPlaneIndex,
    });
    this.floorTransform = floorTransform;

    const candidateTransforms = _getCandidateTransforms({
      portalLocations,
      firstFloorPlaneIndex,
      floorTransform,
      planeSpecs,
      n: 2,
    });
    this.candidateTransforms = candidateTransforms;

    this.portalLocations = portalLocations;
  }
}