import * as THREE from 'three';

const gridGeometry = new THREE.PlaneGeometry(1, 1);
export class GridMesh extends THREE.Mesh {
  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {
          value: new THREE.Color(0xFF0000),
          needsUpdate: true,
        },
      },
      vertexShader: `\
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform vec3 uColor;
        varying vec2 vUv;

        const vec3 lineColor = vec3(${new THREE.Vector3(0x00BBCC).toArray().map(n => n.toFixed(8)).join(',')});

        void main() {
          vec2 uv = vUv;

          // draw a grid based on uv
          float b = 0.1;
          float f = min(mod(uv.x, b), mod(uv.y, b));
          f = min(f, mod(1.-uv.x, b));
          f = min(f, mod(1.-uv.y, b));
          f *= 200.;

          float a = max(1. - f, 0.);
          a = max(a, 0.5);

          // vec3 c = lineColor;
          vec3 c = uColor;

          gl_FragColor = vec4(c, a);
          // gl_FragColor.rg = uv;
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });

    super(gridGeometry, material);
  }
};