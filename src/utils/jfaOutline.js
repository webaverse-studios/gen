import * as three_1 from 'three';
import * as fullScreenPass_1 from './fullscreenPass.js';
import {
  LensFullscreenMaterial,
} from '../generators/sg-materials.js';
import {
  pushMeshes,
} from '../zine/zine-utils.js';

const localVectorA = new three_1.Vector3();
// const localColor = new three_1.Color();

export class JFAOutline {
    /**
     * Construct an instance of JFAOutline
     * @param targets The targets to ping pong between.
     * @param iResolution Three.Vector2 containing width and height of the screen.
     * @param outlinePass Optional custom outlining shader.
     */
    constructor(iResolution, outlinePass) {
        const targets = makeFloatRenderTargetSwapChain(iResolution.x, iResolution.y);
        this.targets = targets;
        this.selectedMaterial = new three_1.MeshBasicMaterial({ color: 0xFFFFFF });
        this.uvPass = fullScreenPass_1.fullScreenPass(`
      uniform sampler2D tex;
    
      void main() {
        vec2 coord = gl_FragCoord.xy - 0.5;

        // sample silhouette texture for sobel
        mat3 values;
        for(int u=0; u<3; u++)
        {
            for(int v=0; v<3; v++)
            {
                vec2 offset = vec2(float(u-1), float(v-1));
                vec2 sampleUV = clamp(coord + offset, vec2(0.0), iResolution.xy - vec2(1.0));
                values[u][v] = texture2D(tex, sampleUV / iResolution).x;
            }
        }    
    
        vec4 outColor = vec4(coord, 0.0, 0.0);
    
        if (values[1][1] > 0.99) {
          gl_FragColor = outColor;
          return;
        }
    
        if (values[1][1] < 0.01) {
          gl_FragColor = vec4(1.0);
          return;
        }
          
        vec2 dir = -vec2(
          values[0][0] + values[0][1] * 2.0 + values[0][2] - values[2][0] - values[2][1] * 2.0 - values[2][2],
          values[0][0] + values[1][0] * 2.0 + values[2][0] - values[0][2] - values[1][2] * 2.0 - values[2][2]
          );
    
        // if dir length is small, this is either a sub pixel dot or line
        // no way to estimate sub pixel edge, so output position
        if (abs(dir.x) <= 0.005 && abs(dir.y) <= 0.005) {
          gl_FragColor = outColor;
          return;
        }
            
    
      // normalize direction
      dir = normalize(dir);
    
      // sub pixel offset
      vec2 offset = dir * (1.0 - values[1][1]);
    
      gl_FragColor = vec4(outColor.x + offset.x, outColor.y + offset.y, 0.0, 0.0);    
      }
    `, {
            tex: { value: targets[0].texture },
            iResolution: { value: iResolution },
        });
        this.jumpFloodPass = fullScreenPass_1.fullScreenPass(`
    uniform sampler2D tex;
    uniform float jumpOffset;
    
    void main() {
      float min_dist = 99999.0;
      vec4 closest_rgba = vec4(1.0);
      vec2 pixelCoord = gl_FragCoord.xy; //vUv * iResolution;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 sampleCoord = pixelCoord + vec2(x,y) * jumpOffset;
          //sampleCoord += vec2(0.5); // get center of pixel
          vec4 rgba = texture2D(tex, clamp(sampleCoord / iResolution, 0.0, 1.0));
          if (rgba.a < 1.0) {
            vec2 coord = rgba.xy;
            float dist = distance(pixelCoord, coord);
            if (dist < min_dist) {
              min_dist = dist;
              closest_rgba = rgba;
            }  
          }  
        }
      }
      gl_FragColor = closest_rgba;
    }
    `, {
            tex: { value: targets[0].texture },
            iResolution: { value: iResolution },
            jumpOffset: { value: 1 },
        });
        this.outlinePass = outlinePass !== null && outlinePass !== void 0 ? outlinePass : fullScreenPass_1.fullScreenPass(`
      uniform sampler2D tex;
      uniform float threshLow;
      uniform float threshHigh;
      uniform vec4 outlineColor;
    
      void main() {
        vec2 vUv = gl_FragCoord.xy / iResolution;
        vec4 rgba = texture2D(tex, vUv);
        vec2 coord = rgba.xy;
        vec4 color = vec4(0.0);
        if (rgba.a < 1.0) {
          float dist = distance(coord, gl_FragCoord.xy);
          if (dist >= threshLow && dist <= threshHigh) {
            color = outlineColor;
            color.a = clamp(threshHigh - dist, 0.0, 1.0);
          }
        }
        gl_FragColor = color;  
      }
    `, {
            tex: { value: targets[0].texture },
            iResolution: { value: iResolution },
            threshLow: { value: 1.0 },
            threshHigh: { value: 200.0 },
            outlineColor: { value: new three_1.Vector4(1.0, 0.0, 0.0, 1.0) },
        }, {
            depthTest: false,
            depthWrite: false,
            blending: three_1.NormalBlending,
            transparent: true,
        });
    }
    /**
     * One call interface for rendering object outlines.
     * @param renderer Three.JS renderer
     * @param scene Three.JS scene
     * @param camera Three.JS target.
     * @param targets Render targets array (at least length two) to ping pong between, must be of type float.
     * @param iResolution Three.JS Vector2 containing width/height.
     * @param selectedLayer The layer for selected objects.
     * @param outlineUniforms Optional uniforms to pass in for the outlining shader.
     */
    outline(renderer, scene, camera, targets, iResolution, selectedLayer, outlineUniforms) {
        this.renderSelected(renderer, scene, camera, targets, selectedLayer);
        const distanceIndex = this.renderDistanceTex(renderer, targets, iResolution, outlineUniforms);
        this.renderOutline(renderer, distanceIndex, targets, outlineUniforms);
    }
    /**
     * Allows one to update the outlining shader used.
     * @param outlinePass New outline shader
     * @returns Old outline shader
     */
    setOutlinePass(outlinePass) {
        const oldPass = this.outlinePass;
        this.outlinePass = outlinePass;
        return oldPass;
    }
    /**
     * Render the selected objects to the first render target.
     * @param renderer Three.JS renderer
     * @param scene Three.JS scene
     * @param camera Three.JS target.
     * @param targets Render targets array (at least length two) to ping pong between, must be of type float.
     * @param selectedLayer The layer for selected objects.
     */
    renderSelected(renderer, scene, camera, targets) {
        // const oldClearColor = renderer.getClearColor(localColor).getHex();
        const oldOverrideMaterial = scene.overrideMaterial;
        // renderer.setClearColor(0x0);
        scene.overrideMaterial = this.selectedMaterial;
        // camera.layers.set(selectedLayer);
        renderer.setRenderTarget(targets[0]);
        renderer.render(scene, camera);
        // camera.layers.enableAll();
        // renderer.setClearColor(oldClearColor);
        scene.overrideMaterial = oldOverrideMaterial;
    }
    /**
     * This renders the distance texture from the initial outline buffer generated by renderSelected.
     * outlineUniforms.threshHigh is used to determine how much of the distance buffer to generate, if
     * it is not passed, it will generate the distance texture for the whole screen.
     *
     * @param renderer Three.JS renderer
     * @param targets Render targets array (at least length two) to ping pong between, must be of type float.
     * @param iResolution Three.JS Vector2 containing width/height.
     * @param outlineUniforms Optional uniforms to pass in for the outlining shader.
     * @returns Index of the final render target that contains the distance texture
     */
    renderDistanceTex(renderer, targets, iResolution, outlineUniforms) {
        var _a;
        renderer.setRenderTarget(targets[1]);
        this.uvPass(renderer, {
            tex: targets[0].texture,
            iResolution,
        });
        const distance = (_a = outlineUniforms === null || outlineUniforms === void 0 ? void 0 : outlineUniforms.threshHigh) !== null && _a !== void 0 ? _a : Math.max(iResolution.x, iResolution.y);
        const numPasses = Math.ceil(Math.log2(distance));
        let sampleOffset = Math.pow(2, numPasses - 1);
        let currRT = 0;
        for (let i = 0; i < numPasses; i++) {
            renderer.setRenderTarget(targets[currRT]);
            this.jumpFloodPass(renderer, {
                tex: targets[1 - currRT].texture,
                jumpOffset: sampleOffset,
            });
            currRT = 1 - currRT;
            sampleOffset >>= 1;
        }

        // final pass
        sampleOffset = 1;
        for (let i = 0; i < 1; i++) {
            renderer.setRenderTarget(targets[currRT]);
            this.jumpFloodPass(renderer, {
                tex: targets[1 - currRT].texture,
                jumpOffset: sampleOffset,
            });
            currRT = 1 - currRT;
        }

        return 1 - currRT;
    }
    /**
     *
     * @param renderer Three.JS renderer
     * @param distanceIndex Index into targets of the final distance texture
     * @param targets Render targets used to generate distance texture
     * @param outlineUniforms Custom uniforms for outline shader
     */
    renderOutline(renderer, distanceIndex, targets, outlineUniforms) {
        renderer.setRenderTarget(null);
        const oldAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        this.outlinePass(renderer, Object.assign(Object.assign({}, outlineUniforms), { tex: targets[distanceIndex] }));
        renderer.autoClear = oldAutoClear;
    }
}

const reconstructionPass = fullScreenPass_1.fullScreenPass(`
uniform sampler2D distanceTex;
uniform sampler2D oldNewDepthTexture;
uniform sampler2D feedbackDepthTexture;
uniform int range;

void main() {
  vec2 pixelUv = gl_FragCoord.xy;
  vec2 uv = pixelUv / iResolution;

  vec4 distanceRgba = texture2D(distanceTex, uv);
  vec2 distancePixelUv = distanceRgba.rg;
  float d = distance(pixelUv, distancePixelUv);
  
  vec4 feedbackRgba = texture2D(feedbackDepthTexture, uv);

  vec4 localRgba = texture2D(oldNewDepthTexture, uv);
  float localOldDepth = localRgba.r;
  float localNewDepth = localRgba.g;

  feedbackRgba.a = 1.;

  const float eps = 0.000001;
  if (d < eps) { // if this is an initial pixel, just write the old depth
    feedbackRgba.r = localOldDepth;
  } else { // else if this is a feedback pixel, derive new depth
    // resample around the nearest distance

    float sumDelta = 0.;
    float totalDelta = 0.;

    {
      for (int x = -range; x <= range; x++) {
        for (int y = -range; y <= range; y++) {
          vec2 offset = vec2(float(x), float(y));

          vec2 pixelUv2 = pixelUv + offset;
          // if (pixelUv2.x >= 0. && pixelUv2.x < iResolution.x && pixelUv2.y >= 0. && pixelUv2.y < iResolution.y) {
            // vec2 pixelUv3 = min(max(pixelUv2, vec2(0.)), iResolution - 1.);
            // vec2 uv2 = pixelUv3 / iResolution;
            vec2 uv2 = pixelUv2 / iResolution;

            vec4 distanceRgba2 = texture2D(distanceTex, uv2);
            vec2 distancePixelUv2 = distanceRgba2.rg;
            float d2 = distance(pixelUv2, distancePixelUv2);

            vec4 localRgba2 = texture2D(oldNewDepthTexture, uv2);
            float localOldDepth2 = localRgba2.r;
            float localNewDepth2 = localRgba2.g;

            vec2 remotePixelUv = distancePixelUv2;
            vec2 remoteUv = remotePixelUv / iResolution;
            vec4 remoteRgba = texture2D(oldNewDepthTexture, remoteUv);
            float remoteOldDepth = remoteRgba.r;
            float remoteNewDepth = remoteRgba.g;
            float remoteOldExists = remoteRgba.b;
            float remoteNewExists = remoteRgba.a;

            // if (remoteOldExists >= 0.5 && abs(remoteOldDepth) > eps) {
            if (abs(remoteOldDepth) > eps) {
              // compute the predicted depth:
              float delta = remoteOldDepth - remoteNewDepth;

              float weight = mix(1., 0., length(offset) / float(range));

              sumDelta += delta * weight;
              totalDelta += weight;
            }
          // }
        }
      }
      if (totalDelta != 0.) {
        sumDelta /= totalDelta;
      }
    }

    feedbackRgba.r = localNewDepth + sumDelta;
  }

  gl_FragColor = feedbackRgba;
}
`, {
    distanceTex: { value: null },
    iResolution: { value: null },
    oldNewDepthTexture: { value: null },
    feedbackDepthTexture: { value: null },
    range: { value: 1 },
});

//

export function makeFloatRenderTargetSwapChain(width, height) {
  const targets = Array(2);
  for (let i = 0; i < 2; i++) {
    targets[i] = new three_1.WebGLRenderTarget(width, height, {
      type: three_1.FloatType,
      magFilter: three_1.NearestFilter,
      minFilter: three_1.NearestFilter,
    });
  }
  return targets;
};

//

export function renderDepthReconstruction(
  renderer,
  maskIndex,
  distanceFloatImageData,
  oldDepthFloats,
  newDepthFloats
) {
  const iResolution = new three_1.Vector2(renderer.domElement.width, renderer.domElement.height);
  const targets = makeFloatRenderTargetSwapChain(iResolution.x, iResolution.y);

  const distanceTex = new three_1.DataTexture(distanceFloatImageData, iResolution.x, iResolution.y, three_1.RGBAFormat, three_1.FloatType);
  distanceTex.minFilter = three_1.NearestFilter;
  distanceTex.magFilter = three_1.NearestFilter;
  distanceTex.needsUpdate = true;

  const oldNewDepthTextureData = new Float32Array(oldDepthFloats.length * 4);
  for (let i = 0; i < oldDepthFloats.length; i++) {
    oldNewDepthTextureData[i * 4] = oldDepthFloats[i];
    oldNewDepthTextureData[i * 4 + 1] = newDepthFloats[i];
    oldNewDepthTextureData[i * 4 + 2] = maskIndex[i] !== -1 ? 1 : 0;
    oldNewDepthTextureData[i * 4 + 3] = 1;
  }
  const oldNewDepthTexture = new three_1.DataTexture(oldNewDepthTextureData, iResolution.x, iResolution.y, three_1.RGBAFormat, three_1.FloatType);
  oldNewDepthTexture.minFilter = three_1.NearestFilter;
  oldNewDepthTexture.magFilter = three_1.NearestFilter;
  oldNewDepthTexture.flipY = true;
  oldNewDepthTexture.needsUpdate = true;

  const _render = () => {
    const readTarget = targets[0];
    const writeTarget = targets[1];

    const _render2 = () => {
      reconstructionPass(renderer, {
        distanceTex,
        iResolution,
        oldNewDepthTexture,
        feedbackDepthTexture: readTarget.texture,
        range: 4,
      });
    };

    // render to canvas
    renderer.setRenderTarget(null);
    renderer.clear();
    _render2();

    // render to render target
    renderer.setRenderTarget(writeTarget);
    _render2();
    renderer.setRenderTarget(null);

    // swap targets
    [targets[0], targets[1]] = [targets[1], targets[0]];
  };
  _render();

  // read the render target
  const writeRenderTarget = targets[0];
  const reconstructedDepthFloatsImageData = new Float32Array(writeRenderTarget.width * writeRenderTarget.height * 4);
  renderer.readRenderTargetPixels(writeRenderTarget, 0, 0, writeRenderTarget.width, writeRenderTarget.height, reconstructedDepthFloatsImageData);

  // extract to depth-only
  // flip y
  const reconstructedDepthFloats = new Float32Array(reconstructedDepthFloatsImageData.length / 4);
  for (let i = 0; i < reconstructedDepthFloats.length; i++) {
    const j = i * 4;

    const x = i % writeRenderTarget.width;
    let y = Math.floor(i / writeRenderTarget.width);
    y = writeRenderTarget.height - y - 1;
    
    const index = y * writeRenderTarget.width + x;

    reconstructedDepthFloats[index] = reconstructedDepthFloatsImageData[j];
  }
  return reconstructedDepthFloats;
}

//

export function renderMaskIndex({
  renderer,
  meshes,
  camera,
}) {
  let maskIndex;

  const lensFullscreenMaterial = new LensFullscreenMaterial();
  
  const lensFullscreenScene = new three_1.Scene();
  lensFullscreenScene.autoUpdate = false;
  lensFullscreenScene.overrideMaterial = lensFullscreenMaterial;

  const lensFullscreenRenderTarget = new three_1.WebGLRenderTarget(
    renderer.domElement.width,
    renderer.domElement.height,
    {
      minFilter: three_1.NearestFilter,
      magFilter: three_1.NearestFilter,
      format: three_1.RGBAFormat,
      type: three_1.FloatType,
    }
  );

  {
    // push meshes
    const popMeshes = pushMeshes(lensFullscreenScene, meshes);

    // push old state
    const oldRenderTarget = renderer.getRenderTarget();
    // const oldClearColor = this.renderer.getClearColor(localColor);
    // const oldClearAlpha = this.renderer.getClearAlpha();

    // render
    renderer.setRenderTarget(lensFullscreenRenderTarget);
    // renderer.setClearColor(0x000000, 0);
    // renderer.clear();
    renderer.render(lensFullscreenScene, camera);

    // read back the indices
    const float32Array = new Float32Array(renderer.domElement.width * renderer.domElement.height * 4);
    renderer.readRenderTargetPixels(lensFullscreenRenderTarget, 0, 0, renderer.domElement.width, renderer.domElement.height, float32Array);

    /* the above was encoded with the following glsl shader. we need to decode it. */
    // float r = floor(fIndex / 65536.0);
    // fIndex -= r * 65536.0;
    // float g = floor(fIndex / 256.0);
    // fIndex -= g * 256.0;
    // float b = fIndex;
    maskIndex = new Int32Array(renderer.domElement.width * renderer.domElement.height);
    maskIndex.fill(-1);
    for (let y = 0; y < renderer.domElement.height; y++) {
      for (let x = 0; x < renderer.domElement.width; x++) {
        const i = y * renderer.domElement.width + x;

        // flip y when reading
        const ax = x;
        const ay = renderer.domElement.height - 1 - y;
        const j = ay * renderer.domElement.width + ax;

        const r = float32Array[j * 4 + 0];
        const g = float32Array[j * 4 + 1];
        const b = float32Array[j * 4 + 2];

        const index = r * 65536 + g * 256 + b;
        maskIndex[i] = index;
      }
    }

    // pop old state
    renderer.setRenderTarget(oldRenderTarget);
    // renderer.setClearColor(oldClearColor, oldClearAlpha);

    // pop meshes
    popMeshes();
  }

  return maskIndex;
}

//

export function renderJfaDistance({
  renderer,
  meshes,
  camera,
}) {
  const iResolution = new three_1.Vector2(renderer.domElement.width, renderer.domElement.height);
  
  const tempScene = new three_1.Scene();
  tempScene.autoUpdate = false;

  // note: stealing the meshes for a moment
  const popMeshes = pushMeshes(tempScene, meshes);

  // We need two render targets to ping-pong in between.  
  const jfaOutline = new JFAOutline(iResolution);
  const {targets} = jfaOutline;
  jfaOutline.renderSelected(renderer, tempScene, camera, targets);
  const outlineUniforms = undefined;
  const distanceIndex = jfaOutline.renderDistanceTex(renderer, targets, iResolution, outlineUniforms);
  const distanceRenderTarget = targets[distanceIndex];

  // get the image data back out of the render target, as a Float32Array
  const distanceFloatImageData = new Float32Array(distanceRenderTarget.width * distanceRenderTarget.height * 4);
  renderer.readRenderTargetPixels(distanceRenderTarget, 0, 0, distanceRenderTarget.width, distanceRenderTarget.height, distanceFloatImageData);
  
  popMeshes();
  
  return distanceFloatImageData;
}
export function getDistanceNearestPositions({
  distanceFloatImageData,
  width,
  height,
  meshes,
  maskIndex,
}) {
  // accumulate distance nearest positions
  const distanceNearestPositions = new Float32Array(width * height * 3);
  // if (distanceNearestPositions.length / 3 * 4 !== distanceFloatImageData.length) {
  //   console.warn('distance positions length mismatch', distanceNearestPositions.length, distanceFloatImageData.length);
  //   debugger;
  // }
  for (let i = 0; i < distanceFloatImageData.length; i += 4) {
    const r = distanceFloatImageData[i];
    const g = distanceFloatImageData[i+1];
    // const b = distanceFloatImageData[i+2];
    // const a = distanceFloatImageData[i+3];

    const j = i / 4;
    // const x = j % width;
    // const y = Math.floor(j / width);

    let ax = Math.floor(r);
    let ay = Math.floor(g);
    ax = Math.min(Math.max(ax, 0), width - 1);
    ay = Math.min(Math.max(ay, 0), height - 1);
    ay = height - 1 - ay;
    const i3 = ax + ay * width;

    const triangleId = maskIndex[i3];
    const triangleStartIndex = triangleId * 3;

    const firstMesh = meshes[0]; // note: assuming only one mesh...
    const positions = firstMesh.geometry.attributes.position.array;
    const aVector = localVectorA.fromArray(positions, triangleStartIndex * 3);
    // const bVector = localVectorB.fromArray(positions, (triangleStartIndex + 1) * 3);
    // const cVector = localVectorC.fromArray(positions, (triangleStartIndex + 2) * 3);

    /* // project the points onto the camera, and find the one closest to x, y
    const aScreen = localVectorA2.copy(aVector)
      .applyMatrix4(editCamera.matrixWorldInverse)
      .applyMatrix4(editCamera.projectionMatrix);
    const bScreen = localVectorB2.copy(bVector)
      .applyMatrix4(editCamera.matrixWorldInverse)
      .applyMatrix4(editCamera.projectionMatrix);
    const cScreen = localVectorC2.copy(cVector)
      .applyMatrix4(editCamera.matrixWorldInverse)
      .applyMatrix4(editCamera.projectionMatrix);

    aScreen.x = (aScreen.x + 1) / 2 * width;
    aScreen.y = (aScreen.y + 1) / 2 * height;
    bScreen.x = (bScreen.x + 1) / 2 * width;
    bScreen.y = (bScreen.y + 1) / 2 * height;
    cScreen.x = (cScreen.x + 1) / 2 * width;
    cScreen.y = (cScreen.y + 1) / 2 * height;

    const aDistance = Math.hypot(aScreen.x - x, aScreen.y - y);
    const bDistance = Math.hypot(bScreen.x - x, bScreen.y - y);
    const cDistance = Math.hypot(cScreen.x - x, cScreen.y - y);

    let nearestPoint;
    let nearestDistance = Infinity;
    if (aDistance < nearestDistance) {
      nearestPoint = aVector;
      nearestDistance = aDistance;
    }
    if (bDistance < nearestDistance) {
      nearestPoint = bVector;
      nearestDistance = bDistance;
    }
    if (cDistance < nearestDistance) {
      nearestPoint = cVector;
      nearestDistance = cDistance;
    } */
    const nearestPoint = aVector;

    distanceNearestPositions[j * 3 + 0] = nearestPoint.x;
    distanceNearestPositions[j * 3 + 1] = nearestPoint.y;
    distanceNearestPositions[j * 3 + 2] = nearestPoint.z;
  }

  return distanceNearestPositions;
}