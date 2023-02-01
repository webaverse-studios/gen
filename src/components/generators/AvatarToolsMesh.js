import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// import {AvatarRenderer} from '../../avatars/avatar-renderer.js';
import {PathMesh} from '../../zine-aux/meshes/path-mesh.js';
import {ArrowMesh} from '../../generators/arrow-mesh.js';

//

const localVector = new THREE.Vector3();
const localPlane = new THREE.Plane();

//

class FloorMesh extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.PlaneBufferGeometry(30, 30)
      .rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      // color: 0xEEEEEE,
      color: 0x000000,
      // opacity: 0.5,
      // transparent: true,
    });
    super(geometry, material);
  }
}

//

class DropMesh extends THREE.Mesh {
  constructor() {
    const h = 2;
    const railGeometry = new THREE.BoxGeometry(0.02, h, 0.02)
      .translate(0, h / 2, 0);
    const partIds = new Float32Array(railGeometry.attributes.position.count).fill(1);
    railGeometry.setAttribute('partId', new THREE.BufferAttribute(partIds, 1));

    const h2 = 0.2;
    const headGeometry = new THREE.CylinderGeometry(0.2, 0.03, h2, 16)
      .translate(0, h2 / 2, 0);
    const partIds2 = new Float32Array(railGeometry.attributes.position.count).fill(2);
    headGeometry.setAttribute('partId', new THREE.BufferAttribute(partIds2, 1));
    
    const geometry = BufferGeometryUtils.mergeBufferGeometries([
      railGeometry,
      headGeometry,
    ]);
    const material = new THREE.ShaderMaterial({
      // color: 0xff0000,
      uniforms: {
        uTime: {
          value: 0,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute float partId;

        varying vec2 vUv;
        flat varying float vPartId;

        void main() {
          vUv = uv;
          vPartId = partId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform float uTime;
        varying vec2 vUv;
        flat varying float vPartId;

        void main() {
          float f = mod(uTime / 1000., 1.);
          gl_FragColor = vec4(f, vPartId, 0., 1.);
        }
      `,
      transparent: true,
    });
    super(geometry, material);
  }
  update() {
    const now = performance.now();
    this.material.uniforms.uTime.value = now;
    this.material.uniforms.uTime.needsUpdate = true;
  }
}

//

const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

//

export class AvatarToolsMesh extends THREE.Object3D {
  static tools = [
    'camera',
    'move',
  ];
  
  constructor({
    avatarManager,
  }) {
    super();

    // args
    this.avatarManager = avatarManager;
    
    const {
      camera,
      controls,
    } = avatarManager;
    const canvas = avatarManager.renderer.domElement;
    // if (!camera || !controls || !canvas) {
    //   console.log('got', {camera, controls});
    //   debugger;
    // }
    this.camera = camera;
    this.controls = controls;
    this.canvas = canvas;

    // scene
    // const scene = new THREE.Scene();
    // scene.autoUpdate = true;
    // this.scene = scene;

    // floor mesh
    const floorMesh = new FloorMesh();
    floorMesh.frustumCulled = false;
    this.add(floorMesh);
    floorMesh.updateMatrixWorld();
    this.floorMesh = floorMesh;

    // arrow mesh
    const arrowMesh = new ArrowMesh();
    arrowMesh.geometry = arrowMesh.geometry.clone()
      .rotateX(Math.PI)
      .scale(0.1, 0.1, 0.1)
      .translate(0, 0.2, 0)
    arrowMesh.visible = false;
    this.add(arrowMesh);
    arrowMesh.updateMatrixWorld();
    this.arrowMesh = arrowMesh;

    // drop mesh
    const dropMesh = new DropMesh();
    arrowMesh.add(dropMesh);
    dropMesh.updateMatrixWorld();
    this.dropMesh = dropMesh;

    // path mesh
    const pathMesh = new PathMesh();
    pathMesh.frustumCulled = false;
    // this.zineRenderer.transformScene.add(pathMesh);
    this.add(pathMesh);
    pathMesh.updateMatrixWorld();
    this.pathMesh = pathMesh;

    // state
    this.toolIndex = 0;
    this.mouse = new THREE.Vector2();
    this.cleanup = null;
    
    // intitialize
    this.#listen();
  }
  get tool() {
    return AvatarToolsMesh.tools[this.toolIndex];
  }
  set tool(tool) {
    throw new Error('not implemented');
    /* const toolIndex = AvatarToolsMesh.tools.indexOf(tool);
    if (toolIndex !== -1) {
      this.setToolIndex(toolIndex);
    } */
  }
  setToolIndex(toolIndex) {
    this.toolIndex = toolIndex;
    this.dispatchEvent({
      type: 'toolchange',
      tool: this.tool,
    });
  }
  update() {
    this.arrowMesh.visible = false;
    
    if (this.tool === 'move') {
      // console.log('update move');
  
      const intersectFloor = (mouse, camera, vectorTarget) => {
        const floorPlane = localPlane.setFromNormalAndCoplanarPoint(
          upVector,
          zeroVector
        );
        localRaycaster.setFromCamera(mouse, camera);
        return localRaycaster.ray.intersectPlane(floorPlane, vectorTarget);
      };
      const intersection = intersectFloor(this.mouse, this.camera, localVector);

      // console.log('intersect', this.mouse.toArray(), this.camera.position.toArray(), intersection && intersection.toArray());
      if (intersection) {
        this.arrowMesh.position.copy(intersection);
        this.arrowMesh.updateMatrixWorld();
        this.arrowMesh.visible = true;
       }

       this.dropMesh.update();
    }
  }
  #listen() {
    const keydown = e => {
      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        {
          cancelEvent(e);

          const keyIndex = parseInt(e.key, 10) - 1;
          this.setToolIndex(keyIndex);
          break;
        }
        case 't': {
          if (document.activeElement) {
            // nothing
          } else {
            cancelEvent(e);
            // XXX enable talk
            console.log('enable talk');
          }
          break;
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousemove = e => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mouse.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );
    };
    this.canvas.addEventListener('mousemove', mousemove);

    const mousedown = e => {
      cancelEvent(e);

      if (this.tool === 'move') {
        if (this.avatarManager.avatar) {
          const points = (() => {
            const startPosition = localVector2.copy(this.avatarManager.avatar.inputs.hmd.position)
              .add(
                localVector3.set(0, -this.avatarManager.avatar.height, 0)
              );
            const endPosition = this.arrowMesh.position;

            const stepSize = 1;
            const points = [];
            const direction = endPosition.clone()
              .sub(startPosition);
            const distance = direction.length();
            direction.normalize();
            for (let d = 0; d < distance; d += stepSize) {
              const point = startPosition.clone()
                .add(direction.clone().multiplyScalar(d));
              points.push(point);
            }
            points.push(endPosition.clone());

            // make this a directional walk from the entrance to the exit
            // const depthFloats = floorHeightfield;
            // const yOffset = 0.10;
            const rng = alea('paths');
            for (let i = 0; i < points.length; i++) {
              // const labelSpec = portalLabels[i];
              // const normal = localVector.fromArray(labelSpec.normal);
              // const center = localVector2.fromArray(labelSpec.center);
              const center = points[i];
              
              // portal center in world space, 1m in front of the center
              const portalCenter = localVector3.copy(center)
              if (i !== 0 && i !== points.length - 1) {
                const prevCenter = points[i - 1];
                localQuaternion.setFromRotationMatrix(
                  localMatrix.lookAt(
                    prevCenter,
                    endPosition,
                    upVector
                  )
                );
                portalCenter.add(localVector4.set((rng() - 0.5) * 2 * 0.3, 0, 0).applyQuaternion(localQuaternion));
              }
              // portalCenter.add(upVector);
              portalCenter.y += 0.1;
              center.copy(portalCenter);
            }

            return points;
          })();
          this.pathMesh.geometry = PathMesh.makeGeometry(points);
          this.pathMesh.visible = points.length > 0;
        }
      }
    };
    this.canvas.addEventListener('mousedown', mousedown);

    const toolchange = e => {
      console.log('update', e.tool);
      this.controls.enabled = e.tool === 'camera';
    };
    this.addEventListener('toolchange', toolchange);

    this.cleanup = () => {
      document.removeEventListener('keydown', keydown);
      this.canvas.removeEventListener('mousemove', mousemove);
      this.canvas.removeEventListener('mousedown', mousedown);
      this.removeEventListener('toolchange', toolchange);
    };
  }
  destroy() {
    this.cleanup();
  }
}