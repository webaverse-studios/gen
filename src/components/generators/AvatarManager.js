import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

import Avatar from '../../avatars/avatars.js';
import avatarsWasmManager from '../../avatars/avatars-wasm-manager.js';

import {AvatarRenderer} from '../../avatars/avatar-renderer.js';

// import {
//   makeRendererWithBackground,
// } from '../../utils/renderer-utils.js';
import {
  makeRenderer,
  makeDefaultCamera,
} from '../../zine/zine-utils.js';

import {maxAvatarQuality} from '../../avatars/constants.js';

//

export class AvatarManager extends EventTarget {
  constructor({
    canvas,
    gltf,
  }) {
    super();

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.gltf = gltf;
    // this.gltf2 = null;

    this.avatar = null;

    // this.loadPromise = (async () => {
      const {
        renderer,
        scene,
        camera,
        controls,
        // gltf,
        // gltf2,
      } = AvatarManager.makeContext(canvas, gltf);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.controls = controls;
      // this.gltf = gltf;
      // this.gltf2 = gltf2;
    // })();

    // this.lastTimestamp = performance.now();
  }
  static makeContext(canvas, gltf) {
    // if (!canvas || !gltf) {
    //   debugger;
    // }

    // const renderer = makeRendererWithBackground(canvas);
    const renderer = makeRenderer(canvas);

    const scene = new THREE.Scene();
    scene.autoUpdate = false;

    const camera = makeDefaultCamera();
    camera.position.set(0, 0.9, -2);
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    camera.updateMatrixWorld();

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 2, 3);
    light.updateMatrixWorld();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const controls = new OrbitControls(camera, canvas);
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.target.copy(camera.position);
    controls.target.z = 0;
    controls.update();
    
    // const gltf = await selectAvatar(makeRng());      
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld();

    // const gltf2 = await selectAvatar(makeRng());
    
    return {
      renderer,
      scene,
      camera,
      controls,
      // gltf,
      // gltf2,
    };
  }
  static async makeAvatar({
    gltf,
    // gltf2,
  }) {
    const avatarRenderer = new AvatarRenderer({
      gltf,
      // gltf2,
      quality: maxAvatarQuality,
    });
    await avatarRenderer.waitForLoad();
  
    const avatar = new Avatar(avatarRenderer, {
      fingers: true,
      hair: true,
      visemes: true,
      debug: false,
    });
    avatar.setTopEnabled(false);
    avatar.setHandEnabled(0, false);
    avatar.setHandEnabled(1, false);
    avatar.setBottomEnabled(false);
    avatar.inputs.hmd.position.y = avatar.height;
    // avatar.inputs.hmd.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    avatar.inputs.hmd.updateMatrixWorld();

    return avatar;
  }
  /* update() {
    const {
      renderer,
      scene,
      camera,
    } = this;

    const timestamp = performance.now();
    const timeDiff = timestamp - this.lastTimestamp;
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        timestamp,
        timeDiff,
      },
    }));
    this.lastTimestamp = timestamp;
    
    renderer.render(scene, camera);
  } */
  async waitForLoad() {
    // return this.loadPromise;
  }
  async createImage() {
    const {
      gltf,
    } = this;
    const width = 300;
    const height = 300;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.classList.add('avatarImageCanvas');

    const emotion = '';
    
    const img = await screenshotAvatarGltf({
      gltf,
      width,
      height,
      canvas,
      emotion,
    });
    return img;
  }
  async createIcons() {
    // XXX
  }
  async createVideo() {
    await Promise.all([
      Avatar.waitForLoad(),
      avatarsWasmManager.waitForLoad(),
    ]);

    const animations = Avatar.getAnimations();
    const idleAnimation = animations.find(a => a.name === idleAnimationName);
    const idleAnimationDuration = idleAnimation.duration;

    const {
      gltf,
    } = this;
    const width = 512;
    const height = 512;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const {
      renderer,
      scene,
      camera,
      controls,
      // gltf,
      // gltf2,
    } = AvatarManager.makeContext(canvas, gltf);

    const avatar = await AvatarManager.makeAvatar({
      gltf,
      // gltf2,
    });
    // avatar.inputs.hmd.position.y = 0;
    // avatar.inputs.hmd.updateMatrixWorld();

    scene.add(gltf.scene);

    avatar.update(0, 0); // compute the bounding box
    gltf.scene.updateMatrixWorld();
    const boundingBox = new THREE.Box3().setFromObject(gltf.scene);

    const writeCanvas = document.createElement('canvas');
    writeCanvas.width = width;
    writeCanvas.height = height;
    const writeCtx = writeCanvas.getContext('2d');

    const videoWriter = new WebMWriter({
      quality: 1,
      fileWriter: null,
      fd: null,
      frameDuration: null,
      frameRate: FPS,
    });

    const _pushFrame = () => {
      writeCtx.drawImage(renderer.domElement, 0, 0);
      videoWriter.addFrame(writeCanvas);
    };

    let now = 0;
    const timeDiff = 1000 / FPS;
    while (now < idleAnimationDuration * 1000) {
      avatar.update(now, timeDiff);

      _lookAt(camera, boundingBox);

      renderer.clear();
      renderer.render(scene, camera);

      _pushFrame();
      
      now += timeDiff;
    }

    const blob = await videoWriter.complete();

    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    await new Promise((accept, reject) => {
      video.oncanplaythrough = accept;
      video.onerror = reject;
      video.src = URL.createObjectURL(blob);
    });
    video.style.cssText = `\
      position: fixed;
      top: 0;
      left: 0;
      width: 512px;
      background: red;
    `;
    video.loop = true;
    document.body.appendChild(video);
  }
  async embody() {
    await Promise.all([
      Avatar.waitForLoad(),
      avatarsWasmManager.waitForLoad(),
    ]);

    const {
      gltf,
      // gltf2,
    } = this;
    // console.log('embody', {
    //   gltf,
    // });
    const avatar = await AvatarManager.makeAvatar({
      gltf,
      // gltf2,
    });
    this.avatar = avatar;

    this.scene.add(gltf.scene);

    let lastTimestamp = performance.now();
    const _recurse = () => {
      frame = requestAnimationFrame(_recurse);

      const timestamp = performance.now();
      const timeDiff = timestamp - lastTimestamp;
      avatar.update(timestamp, timeDiff);

      this.controls.update();

      // console.log('render', {
      //   gltf,
      // });

      this.renderer.render(this.scene, this.camera);

      lastTimestamp = timestamp;
    };
    let frame = requestAnimationFrame(_recurse);

    /* this.addEventListener('update', e => {
      const {timestamp, timeDiff} = e.data;
      avatar.update(timestamp, timeDiff);

      this.controls.update();

      // gltf2.scene.updateMatrixWorld();
      // gltf.scene.updateMatrixWorld();
    }); */
  }
}