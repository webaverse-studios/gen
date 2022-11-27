import * as THREE from 'three';

//

const lensFragmentShader = `\
flat varying float vIndex;

void main() {
  float fIndex = vIndex;

  // encode the index as rgb
  float r = floor(fIndex / 65536.0);
  fIndex -= r * 65536.0;
  float g = floor(fIndex / 256.0);
  fIndex -= g * 256.0;
  float b = fIndex;

  gl_FragColor = vec4(r, g, b, 1.);
}
`;

//

export class LensMaterial extends THREE.ShaderMaterial {
  constructor({
    width,
    height,
    selectorSize,
  }) {
    super({
      uniforms: {
        viewport: {
          value: new THREE.Vector4(),
          needsUpdate: true,
        },
        iResolution: {
          value: new THREE.Vector2(width, height),
          needsUpdate: true,
        },
        selectorSize: {
          value: selectorSize,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform vec4 viewport;
        uniform vec2 iResolution;
        uniform float selectorSize;
        attribute float triangleId;
        flat varying float vIndex;

        void main() {
          // get the triangle index, dividing by 3
          // vIndex = gl_VertexID / 3;
          
          vIndex = triangleId;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          float w = gl_Position.w;
          gl_Position /= w;
          
          // viewport is [x, y, width, height], in the range [0, iResolution]
          // iResolution is [width, height]
          // update gl_Position so that the view is zoomed in on the viewport:
          gl_Position.xy = (gl_Position.xy + 1.0) / 2.0;
          gl_Position.xy *= iResolution;
          gl_Position.xy -= viewport.xy;
          gl_Position.xy /= viewport.zw;
          gl_Position.xy = gl_Position.xy * 2.0 - 1.0;

          gl_Position *= w;
        }
      `,
      fragmentShader: lensFragmentShader,
    });
  }
}
export class LensFullscreenMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      // uniforms: {
      // },
      vertexShader: `\
        attribute float triangleId;
        flat varying float vIndex;

        void main() {
          vIndex = triangleId;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: lensFragmentShader,
    });
  }
}