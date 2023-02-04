import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {useState, useRef, useEffect} from 'react';
import classnames from 'classnames';

import {
    ZineStoryboard,
} from '../../zine/zine-format.js';
import {
    ZineRenderer,
} from '../../zine/zine-renderer.js';
import {
    ZineCameraManager,
} from '../../zine-runtime/zine-camera.js';
import bezier from '../../zine-runtime/easing.js';
import {
    compileVirtualSceneExport,
} from '../../generators/scene-generator.js';
import {
    PathMesh,
} from '../../zine-aux/meshes/path-mesh.js';
import{
    SceneGallery,
} from '../image-gallery/SceneGallery.jsx';
import {
    VideoMesh,
} from '../../zine-aux/meshes/video-mesh.js';
import {
    ParticleEmitter2,
    ParticleSystemMesh,
} from '../../zine-aux/meshes/particle-system.js';
import {
    PortalMesh,
} from '../../zine-aux/meshes/portal-mesh.js';
import {
    CapsuleGeometry,
} from '../../zine-aux/geometries/CapsuleGeometry.js';
import {
    OutlineMesh,
} from '../../zine-aux/meshes/outline-mesh.js';
import {
    loadImage,
} from '../../../utils.js';
import {
    physicsObjectTracker,
} from '../../physics/physics-manager.js';
import physicsManager from '../../physics/physics-manager.js';
import {
    CharacterPhysics,
    capsuleToAvatarHmd,
} from '../../physics/character-physics.js';
import {
    loadGltf,
} from "../../utils/mesh-utils.js";
import {
    AvatarManager,
} from '../generators/AvatarManager.js';

import {
    Hups,
} from '../hups/Hups.jsx';

import {
    getDoubleSidedGeometry,
} from '../../zine/zine-geometry-utils.js';
import avatarsWasmManager from '../../avatars/avatars-wasm-manager.js';

import styles from '../../../styles/TitleScreen.module.css';
import {makeId} from '../../physics/util.js';

// import {
//     StoryTargetMesh,
// } from '../../generators/story-target-mesh.js';

import {
    ActionManager,
} from './ActionManager.js';

import {
    getFloorNetPhysicsMesh,
} from '../../zine/zine-mesh-utils.js';
import {
    PanelInstanceManager,
} from '../../zine-runtime/zine-manager.js';

import {useRouter} from '../../generators/router.js';

import {
    // reconstructPointCloudFromDepthField,
    // setCameraViewPositionFromOrthographicViewZ,
    // getDepthFloatsFromPointCloud,
    // depthFloat32ArrayToOrthographicGeometry,
    // getDepthFloat32ArrayWorldPosition,
    // getDoubleSidedGeometry,
    getGeometryHeights,
  } from '../../zine/zine-geometry-utils.js';

import Avatar from '../../avatars/avatars.js';
import {
    zineMagicBytes,
} from '../../zine/zine-constants.js';

import {
    setPerspectiveCameraFromJson,
    setOrthographicCameraFromJson,
} from '../../zine/zine-camera-utils.js';
import {
    floorNetResolution,
} from '../../zine/zine-constants.js';

//

const hash = `8ebd78be3078833da10c95b565ee88b7cf6ba9e0`;
const assetsBaseUrl = `https://cdn.jsdelivr.net/gh/webaverse/content@${hash}/`;
const titleScreenZineFileName = 'title-screen.zine';
const cubicBezier = bezier(0, 1, 0, 1);
// const gravity = new THREE.Vector3(0, -9.8, 0);
const heightfieldScale = 0.1; // must fit heightfield in int16
const avatarUrl = `/avatars/Scillia_Drophunter_V19.vrm`;

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localRaycaster = new THREE.Raycaster();
const localOrthographicCamera = new THREE.OrthographicCamera();

// const zeroVector = new THREE.Vector3(0, 0, 0);
// const oneVector = new THREE.Vector3(1, 1, 1);
// const upVector = new THREE.Vector3(0, 1, 0);

const textDecoder = new TextDecoder();

//

const _loadArrayBuffer = async u => {
    const res = await fetch(u);
    const arrayBuffer = await res.arrayBuffer();
    return arrayBuffer;
};

//

const _saveFile = async (fileName, uint8Array) => {
    const d = await navigator.storage.getDirectory();
    // console.log('save to d', d, titleScreenRenderer.uint8Array);
    const fh = await d.getFileHandle(fileName, {
        create: true,
    });
    // write titleScreenRenderer.uint8Array to f
    const w = await fh.createWritable();
    await w.write(uint8Array);
    await w.close();
    // console.log('done saving');
};
const _loadFile = async (fileName) => {
    const d = await navigator.storage.getDirectory();
    // console.log('open from d', d);
    const fh = await d.getFileHandle(fileName, {
        create: false,
    });
    // get file size
    const f = await fh.getFile();
    // console.log('file size', f, f.size);
    const arrayBuffer = await f.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // console.log('load result', uint8Array);
    return uint8Array;
};

//

class LinearAnimation {
    constructor({
        startValue,
        endValue,
        startTime,
        duration,
    }) {
        this.startValue = startValue;
        this.endValue = endValue;
        this.startTime = startTime;
        this.duration = duration;
    }
    update(timestamp) {
        const timeDiff = timestamp - this.startTime;
        let f = timeDiff / this.duration;
        const done = f >= 1;
        f = Math.min(Math.max(f, 0), 1);
        const value = this.startValue + (this.endValue - this.startValue) * f;
        return {
            done,
            value,
        };
    }
}

//

const makePlaceholderMesh = () => {
    const object = new THREE.Object3D();

    // outline mesh
    let outlineMesh;
    {
        outlineMesh = new OutlineMesh({
            geometry: new CapsuleGeometry(r, r, h, 8)
              .rotateZ(Math.PI / 2)
              .translate(0, -h / 2, 0),
        });
        object.add(outlineMesh);
        outlineMesh.updateMatrixWorld();
        object.outlineMesh = outlineMesh;
    }

    // particle mesh
    (async () => {
        const particleName = 'Elements - Energy 017 Charge Up noCT noRSZ.mov';
        const explosionName = 'Elements - Energy 119 Dissapear noCT noRSZ.mov';
        const explosion2Name = 'Elements - Explosion 014 Hit Radial MIX noCT noRSZ.mov';
        const particleNames = [
            particleName,
            explosionName,
            explosion2Name,
        ].map(s => s.replace(/\.mov$/, '.ktx2z'));

        const videoUrls = particleNames.map(particleName => `${assetsBaseUrl}particles/${particleName}`);

        const files = await Promise.all(videoUrls.map(async videoUrl => {
            const res = await fetch(videoUrl);
            const blob = await res.blob();
            return blob;
        }));
        const pack = await ParticleSystemMesh.loadPack(files);

        const particleSystemMesh = new ParticleSystemMesh({
            pack,
        });
        object.particleSystemMesh = particleSystemMesh;
        particleSystemMesh.frustumCulled = false;
        object.add(particleSystemMesh);
        // particleSystemMesh.position.set(0, -h / 2, 0);
        particleSystemMesh.updateMatrixWorld();

        const particleEmitter = new ParticleEmitter2(particleSystemMesh, {
            range: 1,
        });
        object.particleEmitter = particleEmitter;
    })();
    
    object.update = function({
        timestamp,
        timeDiff,
        localPlayer,
        camera,
    }) {
        if (this.outlineMesh) {
            this.outlineMesh.update(timestamp);
        }
        if (this.particleSystemMesh) {
            this.particleEmitter.update({
                timestamp,
                localPlayer,
            });

            this.particleSystemMesh.update({
                timestamp,
                timeDiff,
                camera,
            });
        }
    };

    return object;
};

const r = 0.3;
// const aw = r * 2;
const ah = 1.6;
const h = ah - r * 2;
const widthPadding = 0.25; // we calculate width from shoulders, but we need a little padding
class LocalPlayer {
    constructor() {
        this.object = new THREE.Object3D();
        this.placeholderMesh = makePlaceholderMesh();
        this.object.add(this.placeholderMesh);

        this.outlineMesh = null;
        this.particleSystemMesh = null;
        this.particleEmitter = null;
        this.characterPhysics = null;
        (async () => {
            // avatar
            await Promise.all([
                Avatar.waitForLoad(),
                avatarsWasmManager.waitForLoad(),
            ]);
            {
                const gltf = await loadGltf(avatarUrl);  
                const avatar = await AvatarManager.makeAvatar({
                    gltf,
                });
                this.avatar = avatar;

                this.object.add(gltf.scene);
                this.object.updateMatrixWorld();
                // globalThis.gltf = gltf;
            }

            // character physics
            {
                const actionManager = new ActionManager();
                // intialize position to local player position, since it is used by character controller initialization
                this.avatar.inputs.hmd.position.copy(this.placeholderMesh.position);
                this.avatar.inputs.hmd.quaternion.copy(this.placeholderMesh.quaternion);

                this.characterPhysics = new CharacterPhysics({
                    avatar: this.avatar,
                    actionManager,
                });
                this.characterPhysics.loadCharacterController(
                    this.avatar.shoulderWidth + widthPadding,
                    this.avatar.height,
                );
                const physicsScene = physicsManager.getScene();
                physicsScene.disableGeometryQueries(this.characterPhysics.characterController);
            }
        })();

        this.velocity = new THREE.Vector3(0, 0, 0);
    }
    get position() {
        return this.placeholderMesh.position;
    }
    get quaternion() {
        return this.placeholderMesh.quaternion;
    }
    get scale() {
        return this.placeholderMesh.scale;
    }
    update({
        timestamp,
        timeDiff,
        localPlayer,
        camera,
        keys,
    }) {
        if (this.characterPhysics) {
            const direction = new THREE.Vector3();
            if (keys.right) {
                direction.x += 1;
            }
            if (keys.left) {
                direction.x -= 1;
            }
            if (keys.up) {
                direction.z -= 1;
            }
            if (keys.down) {
                direction.z += 1;
            }
            direction.normalize();
            {
                const speed = 3;
                const velocity = localVector.copy(direction)
                  .multiplyScalar(speed);
                this.characterPhysics.applyWasd(velocity, timeDiff);
            }

            const timeDiffS = timeDiff / 1000;
            this.characterPhysics.update(timestamp, timeDiffS);

            const applyCharacterPhysicsToAvatar = (characterPhysics, avatar) => {
                const {
                    characterController,
                } = characterPhysics;
                // local player
                capsuleToAvatarHmd(characterController.position, this.avatar, this.placeholderMesh.position);
                // this.placeholderMesh.position.copy(characterController.position);
                this.placeholderMesh.quaternion.copy(characterController.quaternion);
                this.placeholderMesh.updateMatrixWorld();

                // avatar
                avatar.inputs.hmd.position.copy(this.placeholderMesh.position);
                avatar.inputs.hmd.quaternion.copy(this.placeholderMesh.quaternion);
                // XXX deliberately set gamepads to NaN to see if it's still used (probably is for VR)
                avatar.inputs.leftGamepad.position.set(NaN, NaN, NaN);
                avatar.inputs.leftGamepad.quaternion.set(NaN, NaN, NaN, NaN);
                avatar.inputs.rightGamepad.position.set(NaN, NaN, NaN);
                avatar.inputs.rightGamepad.quaternion.set(NaN, NaN, NaN, NaN);
            };

            avatarsWasmManager.physxWorker.updateInterpolationAnimationAvatar(this.avatar.animationAvatarPtr, timeDiff);
            applyCharacterPhysicsToAvatar(this.characterPhysics, this.avatar);
            this.avatar.update(timestamp, timeDiff);
        }

        this.placeholderMesh.update({
            timestamp,
            timeDiff,
            localPlayer: this,
            camera,
        });
    }
}

//

class KeysTracker {
    constructor() {
        this.left = false;
        this.right = false;
        this.up = false;
        this.down = false;
    }
    reset() {
        this.left = false;
        this.right = false;
        this.up = false;
        this.down = false;
    }
}

//

class TitleScreenRenderer extends EventTarget {
    constructor({
        canvas,
        uint8Array,
    }) {
        super();

        this.canvas = canvas;
        this.uint8Array = uint8Array;

        // locals
        this.keys = new KeysTracker();

        // cleanup
        this.cleanupFns = [];

        let live = true;
        this.cleanupFns.push(() => {
            cancelAnimationFrame(frame);
        });

        // renderer
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
        });
        renderer.sortObjects = false;
        this.renderer = renderer;
    
        // scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;
        this.scene = scene;

        // camera
        const camera = new THREE.PerspectiveCamera();
        this.camera = camera;

        // local player
        const localPlayer = new LocalPlayer();
        localPlayer.placeholderMesh.position.z = -2;
        scene.add(localPlayer.object);
        localPlayer.object.updateMatrixWorld();
        this.localPlayer = localPlayer;
    
        // storyboard
        (async () => {
            await physicsManager.waitForLoad();

            const zineStoryboard = new ZineStoryboard();
            await zineStoryboard.loadAsync(uint8Array);
            if (!live) return;

            // const panel0 = zineStoryboard.getPanel(0);
            // const zineRenderer = new ZineRenderer({
            //     panel: panel0,
            //     alignFloor: true,
            // });
    
            // // scene mesh
            // scene.add(zineRenderer.scene);
            // zineRenderer.scene.updateMatrixWorld();

            // scene physics
            const physics = physicsManager.getScene();
            /* {
                const {
                    scenePhysicsMesh,
                } = zineRenderer;
                const geometry2 = getDoubleSidedGeometry(scenePhysicsMesh.geometry);
        
                const scenePhysicsMesh2 = new THREE.Mesh(geometry2, scenePhysicsMesh.material);
                scenePhysicsMesh2.name = 'scenePhysicsMesh';
                scenePhysicsMesh2.visible = false;
                zineRenderer.transformScene.add(scenePhysicsMesh2);
                this.scenePhysicsMesh = scenePhysicsMesh2;

                const scenePhysicsObject = physics.addGeometry(scenePhysicsMesh2);
                scenePhysicsObject.update = () => {
                    scenePhysicsMesh2.matrixWorld.decompose(
                        scenePhysicsObject.position,
                        scenePhysicsObject.quaternion,
                        scenePhysicsObject.scale
                    );
                    physics.setTransform(scenePhysicsObject, false);
                };
                this.scenePhysicsObject = scenePhysicsObject;
                
                physicsObjectTracker.add(scenePhysicsObject);
            } */

            // camera manager
            const zineCameraManager = new ZineCameraManager({
                camera,
                localPlayer,
            }, {
                normalizeView: false,
                followView: false,
            });
            this.zineCameraManager = zineCameraManager;
            this.zineCameraManager.setLockCamera(camera);
            this.zineCameraManager.toggleCameraLock();

            // panel instance manager
            const panelInstanceManager = new PanelInstanceManager(zineStoryboard, {
                zineCameraManager,
                physics,
                localPlayer,
            });
            scene.add(panelInstanceManager);
            panelInstanceManager.updateMatrixWorld();
            this.panelInstanceManager = panelInstanceManager;

            // path mesh
            const panel0Instance = panelInstanceManager.panelInstances[0];
            const splinePoints = panel0Instance.zineRenderer.metadata.paths.map(p => new THREE.Vector3().fromArray(p.position));
            const pathMesh = new PathMesh(splinePoints, {
                animate: true,
            });
            scene.add(pathMesh);
            pathMesh.updateMatrixWorld();
        })();

        // video mesh
        this.videoMesh = null;
        (async () => {
            const videoUrl = `${assetsBaseUrl}videos/upstreet2.ktx2z`;
            
            // const videoUrl = `/sm/spritesheet.ktx2z`;

            // console.log('got video url', videoUrl);
            const res = await fetch(videoUrl);
            const blob = await res.blob();
            const pack = await VideoMesh.loadPack([
                blob,
            ]);

            const videoMesh = new VideoMesh({
                pack,
            });
            this.videoMesh = videoMesh;
            videoMesh.frustumCulled = false;
            scene.add(videoMesh);
        })();
        /* (async () => {
            const videoUrl = `${assetsBaseUrl}/videos/upstreet2.mp4`;
            // console.log('got video url', videoUrl);
            video = await _loadVideo(videoUrl);
            if (!live) return;
            
            video.muted = true;
            video.play();
            video.loop = true;
            // video.playbackRate = 2;
            video.style.cssText = `\
                position: absolute;
                top: 0;
                left: 0;
            `;
            // document.body.appendChild(video);

            this.cleanupFns.push(() => {
                video.pause();
            });
        })(); */

        // portal mesh
        this.portalMesh = null;
        (async () => {
            const portalScene = new THREE.Scene();
            portalScene.autoUpdate = false;
            {
                const gltfLoader = new GLTFLoader();
                gltfLoader.load('/models/skybox.glb', gltf => {
                    const skyboxMesh = gltf.scene;
                    portalScene.add(skyboxMesh);  
                    skyboxMesh.updateMatrixWorld();
                }, undefined, err => {
                  console.warn(err);
                });
            }

            const noiseImage = await loadImage('/images/noise.png');

            const portalMesh = new PortalMesh({
                renderer,
                portalScene,
                portalCamera: camera,
                noiseImage,
            });
            this.portalMesh = portalMesh;
            portalMesh.position.set(0, -1, -5);
            portalMesh.scale.setScalar(3);
            scene.add(portalMesh);
            portalMesh.updateMatrixWorld();
        })();
        this.portalSizeIndex = 0;
        this.portalAnimations = [];

        /* // speech bubble mesh
        let speechBubbleMesh;
        {
            speechBubbleMesh = new SpeechBubbleMesh({
                text: 'hello world',
                fontSize: 0.1,
            });
            speechBubbleMesh.position.set(0, 2, -3);
            scene.add(speechBubbleMesh);
            speechBubbleMesh.updateMatrixWorld();
        } */

        // resize handler
        const _setSize = () => {
            renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    
            if (this.videoMesh) {
                this.videoMesh.material.uniforms.screenResolution.value.set(
                    globalThis.innerWidth,
                    globalThis.innerHeight
                );
                this.videoMesh.material.uniforms.screenResolution.needsUpdate = true;
            }
        };
        _setSize();
        renderer.setPixelRatio(globalThis.devicePixelRatio);

        const resize = e => {
            _setSize();

            this.dispatchEvent(new MessageEvent('resize'));
        };
        globalThis.addEventListener('resize', resize);
        this.cleanupFns.push(() => {
            globalThis.removeEventListener('resize', resize);
        });
        
        // key handlers
        let lastPointerLockChangeTime = -Infinity;
        let startOpacity = 0;
        let endOpacity = 1;
        const opacityRate = 1;
        this.getCurrentOpacity = now => {
            const timeDiff = now - lastPointerLockChangeTime;
            const timeDiffS = timeDiff / 1000;

            let f = timeDiffS / opacityRate;
            f = Math.min(Math.max(f, 0), 1);
            
            const opacity = startOpacity + (endOpacity - startOpacity) * cubicBezier(f);
            return opacity;
        };
        const pointerlockchange = e => {
            const now = performance.now();

            startOpacity = this.getCurrentOpacity(now);
            endOpacity = document.pointerLockElement ? 0 : 1;

            lastPointerLockChangeTime = now;
        };
        document.addEventListener('pointerlockchange', pointerlockchange);

        const mousemove = e => {
            if (this.zineCameraManager) {
                this.zineCameraManager.handleMouseMove(e);
            }
        };
        canvas.addEventListener('mousemove', mousemove);
        const wheel = e => {
            if (this.zineCameraManager) {
                this.zineCameraManager.handleMouseWheel(e);
            }
        };
        canvas.addEventListener('wheel', wheel);
        this.cleanupFns.push(() => {
            canvas.removeEventListener('mousemove', mousemove);
            canvas.removeEventListener('wheel', wheel);
        });

        // render loop
        let lastTimestamp = performance.now();
        const _recurse = () => {
          frame = requestAnimationFrame(_recurse);
    
          if (!document.hidden) {
            const timestamp = performance.now();
            const timeDiff = timestamp - lastTimestamp;
            
            // if panels are loaded
            if (this.panelInstanceManager) {
                // local update
                this.update(timestamp, timeDiff);

                // simulate physics
                const physics = physicsManager.getScene();
                physics.simulatePhysics(timeDiff);

                // update scene physics
                if (this.scenePhysicsObject) {
                    this.scenePhysicsObject.update();
                }

                // update camera
                if (this.zineCameraManager) {
                    this.zineCameraManager.updatePost(timestamp, timeDiff);
                }
            }

            // render
            renderer.render(scene, camera);

            // post update
            lastTimestamp = timestamp;
          }
        };
        let frame = requestAnimationFrame(_recurse);

        this.cleanupFns.push(() => {
            cancelAnimationFrame(frame);
        });
    }
    static portalSizes = [
        1,
        0,
        100,
    ];
    togglePortal() {
        this.portalSizeIndex = (this.portalSizeIndex + 1) % TitleScreenRenderer.portalSizes.length;

        const startTime = performance.now();
        const nextSize = TitleScreenRenderer.portalSizes[this.portalSizeIndex];
        this.portalAnimations.push(new LinearAnimation({
            startTime,
            duration: 1000,
            startValue: this.portalMesh.getScale(),
            endValue: nextSize,
        }));
    }
    update(timestamp, timeDiff) {
        // update meshes
        if (this.videoMesh) {
            const resolution = this.renderer.getSize(localVector2D);
            this.videoMesh.update({
                timestamp,
                opacity: this.getCurrentOpacity(timestamp),
                resolution,
            });
        }
        if (this.portalMesh) {
            this.portalAnimations = this.portalAnimations.filter(portalAnimation => {
                const {
                    done,
                    value,
                } = portalAnimation.update(timestamp);
                this.portalMesh.setScale(value);
                return !done;
            });
            this.portalMesh.update(timestamp);
        }
        if (this.panelInstanceManager) {
            const {mousePosition} = this.zineCameraManager;
            this.panelInstanceManager.update({
                mousePosition,
            });
        }
        if (this.localPlayer) {
            this.localPlayer.update({
                timestamp,
                timeDiff,
                camera: this.camera,
                keys: this.keys,
            });
        }
    }
    destroy() {
      for (let i = 0; i < this.cleanupFns.length; i++) {
        this.cleanupFns[i]();
      }
    }
}

//

class SpeechBubbleObject extends THREE.Object3D {
    constructor({
        text,
        updateFn,
    }) {
        super();

        this.text = text;
        this.updateFn = updateFn;

        this.textIndex = 0;
        this.lastTextIndex = 0;
    }
}
class SpeechBubbleManager extends EventTarget {
    constructor({
        camera,
        containerEl,
    }) {
        super();

        this.camera = camera;
        this.containerEl = containerEl;
        
        this.rect = null;
        this.speechBubbles = [];
        this.speechBubbleElCache = new WeakMap();
        this.speechBubbleRectCache = new WeakMap();
        this.speechBubbleCleanupFns = new WeakMap();
        this.cleanupFns = [];

        this.refreshRect();
        {
            // resize observer on containerEl
            const resizeObserver = new ResizeObserver(() => {
                this.refreshRect();
            });
            resizeObserver.observe(this.containerEl);
            this.cleanupFns.push(() => {
                resizeObserver.disconnect();
            });
        }
    }
    refreshRect() {
        // console.log('refresh rect');
        this.rect = this.containerEl.getBoundingClientRect();
    }
    createSpeechBubble({
        text = `I'm going places.`,
        updateFn = () => true,
    } = {}) {
        const speechBubbleObject = new SpeechBubbleObject({
            text,
            updateFn,
        });
        this.speechBubbles.push(speechBubbleObject);
        return speechBubbleObject;
    }
    removeSpeechBubble(speechBubble) {
        const index = this.speechBubbles.indexOf(speechBubble);
        if (index !== -1) {
            this.speechBubbles.splice(index, 1);
            speechBubble.parent && speechBubble.parent.remove(speechBubble);
        } else {
            throw new Error(`could not find speech bubble`);
        }
    }
    update(timestamp) {
        for (let i = 0; i < this.speechBubbles.length; i++) {
            const speechBubble = this.speechBubbles[i];
            const f = speechBubble.updateFn(timestamp);

            let el = this.speechBubbleElCache.get(speechBubble);
            let rect = this.speechBubbleRectCache.get(speechBubble);
            if (!el) {
                el = document.createElement('div');
                el.classList.add(styles.speechBubble);

                const notchEl = document.createElement('div');
                notchEl.classList.add(styles.notch);
                el.appendChild(notchEl);

                const textEl = document.createElement('div');
                textEl.classList.add(styles.text);
                el.appendChild(textEl);

                const placeholderEl = document.createElement('div');
                placeholderEl.classList.add(styles.placeholder);
                el.appendChild(placeholderEl);
                placeholderEl.innerText = speechBubble.text;

                this.containerEl.appendChild(el);
                this.speechBubbleElCache.set(speechBubble, el);

                rect = el.getBoundingClientRect();
                this.speechBubbleRectCache.set(speechBubble, rect);

                {
                    const resizeObserver = new ResizeObserver(() => {
                        const rect = el.getBoundingClientRect();
                        this.speechBubbleRectCache.set(speechBubble, rect);
                    });
                    resizeObserver.observe(el);
                }
            }
            
            if (f >= 1) {
                this.removeSpeechBubble(speechBubble);
                i--;

                el.parentNode.removeChild(el);
                this.speechBubbleElCache.delete(speechBubble);
                
                continue;
            } else {
                // project the camera point
                const screenPoint = localVector.copy(speechBubble.position)
                    // .add(localVector2.set(0, 0.1, 0)) 
                    .project(this.camera);
                // flip y
                screenPoint.y *= -1;
                // convert to pixels
                screenPoint.x = (screenPoint.x + 1) * this.rect.width / 2;
                screenPoint.y = (screenPoint.y + 1) * this.rect.height / 2;

                // adjust to center
                screenPoint.x -= rect.width / 2;
                screenPoint.y -= rect.height;
                screenPoint.y -= 20;
                
                // apply transform style
                el.style.transform = `translate3d(${screenPoint.x}px, ${screenPoint.y}px, 0)`;

                // update the text
                if (speechBubble.textIndex !== speechBubble.lastTextIndex) {
                    const currentText = speechBubble.text.slice(0, speechBubble.textIndex);
    
                    // const placeholderEl = el.querySelector(`.${styles.placeholder}`);
                    const textEl = el.querySelector(`.${styles.text}`);
                    textEl.innerText = currentText;
    
                    speechBubble.lastTextIndex = speechBubble.textIndex;
                }
            }
        }
    }
    destroy() {
        for (let i = 0; i < this.cleanupFns.length; i++) {
            this.cleanupFns[i]();
        }
    }
}
/* const SpeechBubbles = ({
    speechBubbleManager,
}) => {
    const [speechBubbleMessages, setSpeechBubbleMessages] = useState([]);
    const [speechBubbleElCache, setSpeechBubbleElCache] = useState(() => new WeakMap());
    const speechBubblesRef = useRef();

    useEffect(() => {
        const speechBubblesEl = speechBubblesRef.current;
        if (speechBubbleManager && speechBubblesEl) {
            const _recurse = () => {
                frame = requestAnimationFrame(_recurse);

                const timestamp = performance.now();
                for (let i = 0; i < speechBubbleManager.speechBubbles.length; i++) {
                    const speechBubble = speechBubbleManager.speechBubbles[i];
                    const f = speechBubble.updateFn(timestamp);
                    if (f >= 1) {
                        // speechBubbleManager.speechBubbles.splice(i, 1);
                        speechBubbleManager.removeSpeechBubble(speechBubble);
                        i--;

                        const el = speechBubbleElCache.get(speechBubble);
                        if (!el) {
                            console.warn('no speech bubble el in cache to delete', {speechBubbleElCache, speechBubble});
                            debugger;
                        }
                        el.parentNode.removeChild(el);
                        speechBubbleElCache.delete(speechBubble);
                        
                        continue;
                    }
                }

                for (let i = 0; i < speechBubbleManager.speechBubbles.length; i++) {
                    const speechBubble = speechBubbleManager.speechBubbles[i];
                    let el = speechBubbleElCache.get(speechBubble);
                    if (!el) {
                        el = document.createElement('div');
                        el.classList.add(styles.speechBubble);
                        speechBubblesEl.appendChild(el);
                        speechBubbleElCache.set(speechBubble, el);
                    }
                    if (speechBubble.text !== speechBubble.lastText) {
                        el.innerText = speechBubble.text;
                        speechBubble.lastText = speechBubble.text;
                    }
                }
            };
            let frame = requestAnimationFrame(_recurse);

            return () => {
                cancelAnimationFrame(frame);
            };
        }
    }, [speechBubbleManager, speechBubblesRef.current]);

    return (
        <div className={styles.speechBubbles} ref={speechBubblesRef} />
    );
}; */

//

class CubeMesh extends THREE.Mesh {
    constructor() {
        const geometry = new THREE.BoxGeometry(0.02, 0.02, 0.02);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
        });
        super(geometry, material);
    }
}

//

const MainScreen = ({
    titleScreenRenderer,
    focused,
    onFocus,
    canvasRef,
}) => {
    const [resolution, setResolution] = useState(() => {
        const resolution = new THREE.Vector2();
        if (titleScreenRenderer) {
            titleScreenRenderer.renderer.getSize(resolution);
        }
        return resolution;
    });
    const [speechBubbleManager, setSpeechBubbleManager] = useState(null);
    const speechBubblesRef = useRef();

    const _togglePointerLock = async () => {
        const canvas = canvasRef.current;
        if (canvas) {
            if (!document.pointerLockElement) {
                await canvas.requestPointerLock();
            } else {
                document.exitPointerLock();
            }
        }
    };
    const _requestPointerLock = async () => {
        const canvas = canvasRef.current;
        if (canvas) {
            await canvas.requestPointerLock();
        }
    };

    useEffect(() => {
        if (titleScreenRenderer) {
            const resize = () => {
                const resolution = new THREE.Vector2();
                titleScreenRenderer.renderer.getSize(resolution);
                setResolution(resolution);
            };
            titleScreenRenderer.addEventListener('resize', resize);

            resize();

            return () => {
                titleScreenRenderer.removeEventListener('resize', resize);
            };
        }
    }, [titleScreenRenderer]);

    useEffect(() => {
        const speechBubblesEl = speechBubblesRef.current;
        if (titleScreenRenderer && speechBubblesEl) {
            const speechBubbleManager = new SpeechBubbleManager({
                camera: titleScreenRenderer.camera,
                containerEl: speechBubblesEl,
            });
            setSpeechBubbleManager(speechBubbleManager);

            const _recurse = () => {
                frame = requestAnimationFrame(_recurse);

                const timestamp = performance.now();
                speechBubbleManager.update(timestamp);
            };
            let frame = requestAnimationFrame(_recurse);

            return () => {
                speechBubbleManager.destroy();
                setSpeechBubbleManager(null);

                cancelAnimationFrame(frame);
            };
        }
    }, [titleScreenRenderer, speechBubblesRef.current]);

    useEffect(() => {
        const pointerlockchange = e => {
            onFocus(document.pointerLockElement === canvasRef.current);
        };
        document.addEventListener('pointerlockchange', pointerlockchange);

        const wheel = e => {
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener('wheel', wheel, {
            passive: false,
        });

        const keydown = e => {
            switch (e.key) {
                case ' ': {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    _togglePointerLock();
                    break;
                }
                case 'p': {
                    e.preventDefault();
                    e.stopPropagation();

                    titleScreenRenderer.togglePortal();
                    break;
                }
                case 'm': {
                    e.preventDefault();
                    e.stopPropagation();
            
                    if (titleScreenRenderer && speechBubbleManager) {
                        const startTime = performance.now();
                        const duration = 8000;
                        const startPosition = new THREE.Vector3(
                            Math.random() - 0.5,
                            Math.random() - 0.5,
                            -1
                        );
                        const direction = new THREE.Vector3(
                            Math.random() - 0.5,
                            Math.random() - 0.5,
                            0
                        ).normalize();
                        const speechBubbleObject = speechBubbleManager.createSpeechBubble({
                            text: `I'm going places.`,
                            updateFn(timestamp) {
                                const timeDiff = timestamp - startTime;
                                const f = timeDiff / duration;
                                
                                const f2 = Math.min(Math.max(f * 4, 0), 1);
                                const charN = Math.floor(f2 * this.text.length);
                                this.textIndex = charN;

                                this.position.copy(startPosition)
                                    .add(
                                        direction.clone()
                                            .multiplyScalar(Math.sin(f * Math.PI * 2))
                                    );
                                this.updateMatrixWorld();

                                return f;
                            },
                        });

                        const cubeMesh = new CubeMesh();
                        speechBubbleObject.add(cubeMesh);
                        cubeMesh.updateMatrixWorld();

                        titleScreenRenderer.scene.add(speechBubbleObject);
                        speechBubbleObject.updateMatrixWorld();
                    }
                    
                    break;
                }
            }
        };
        document.addEventListener('keydown', keydown);

        return () => {
            document.removeEventListener('pointerlockchange', pointerlockchange);
            document.removeEventListener('wheel', wheel);
            document.removeEventListener('keydown', keydown);
        };
    }, [canvasRef.current, titleScreenRenderer, speechBubbleManager, onFocus]);

    return (
        <div className={classnames(
            styles.mainScreen,
            titleScreenRenderer ? styles.enabled : null,
            focused ? styles.focused : null,
        )}>
            <div
                className={styles.speechBubbles}
                ref={speechBubblesRef}
                style={{
                    width: `${resolution.x}px`,
                    height: `${resolution.y}px`,
                }}
            ></div>
            <canvas className={classnames(
                styles.canvas,
            )} onDoubleClick={async e => {
                await _requestPointerLock();
            }} ref={canvasRef} />
            <footer className={styles.footer}>
                <div className={styles.warningLabel}>
                    <span className={styles.bold}>SEVERE WARNING:</span> This product is not intended for children under age sixty. <span className={styles.bold}>This is an AI generated product.</span> The ideas expressed are not proven to be safe. This product contains cursed language and due to its nature it should be viewed twice. Made by the Lisk.
                </div>
                <div className={styles.slider}>
                    <div className={styles.notches}>
                        <div className={classnames(
                            styles.notch,
                        )} />
                        <div className={classnames(
                            styles.notch,
                            styles.selected,
                        )} />
                        <div className={classnames(
                            styles.notch,
                            styles.loading,
                        )} />
                    </div>
                </div>
            </footer>
        </div>
    );
};

//

const seenRouters = new WeakMap();

//

const TitleScreen = () => {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [focused, setFocused] = useState(false);
    const [titleScreenRenderer, setTitleScreenRenderer] = useState(null);
    const [hups, setHups] = useState([]);

    const canvasRef = useRef();

    const setSrc = async src => {
        if (src) {
          const res = await fetch(src);
          const arrayBuffer = await res.arrayBuffer();
    
          // check magic bytes
          const firstBytes = new Uint8Array(arrayBuffer, 0, zineMagicBytes.length);
          const firstBytesString = textDecoder.decode(firstBytes);
          if (firstBytesString === zineMagicBytes) {
            const uint8Array = new Uint8Array(arrayBuffer, zineMagicBytes.length);
            // await onPanelsLoad(uint8Array);

            // titleScreenRenderer && titleScreenRenderer.destroy();
            // setTitleScreenRenderer(null);

            const canvas = canvasRef.current;
            if (canvas) {
                // const uint8Array = await _loadFile(titleScreenZineFileName);

                const newTitleScreenRenderer = new TitleScreenRenderer({
                    canvas,
                    uint8Array,
                });
                setTitleScreenRenderer(newTitleScreenRenderer);
                setLoaded(true);

                // console.log('done loading', newTitleScreenRenderer);
            } else {
                throw new Error('no canvas');
            }
          } else {
            console.warn('got invalid file', {firstBytes, firstBytesString});
          }
        }
      };
      useEffect(() => {
        const router = useRouter();
        if (!seenRouters.has(router)) {
            seenRouters.set(router, true);
            
            if (router.currentSrc) {
                setSrc(router.currentSrc);
            }
            const srcchange = e => {
                const {src} = e.data;
                setSrc(src);
            };
            router.addEventListener('srcchange', srcchange);
            return () => {
              router.removeEventListener('srcchange', srcchange);
            };
        }
      }, []);

    useEffect(() => {
        const keydown = async e => {
            switch (e.key) {
                case 'w':
                case 'W':
                {
                    titleScreenRenderer.keys.up = true;
                    break;
                }
                case 's':
                case 'S':
                {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log('save', titleScreenRenderer);

                        if (titleScreenRenderer) {
                            await _saveFile(titleScreenZineFileName, titleScreenRenderer.uint8Array);
                        }
                    } else {
                        titleScreenRenderer.keys.down = true;
                    }
                    break;
                }
                case 'a':
                case 'A':
                {
                    titleScreenRenderer.keys.left = true;
                    break;
                }
                case 'd':
                case 'D':
                {
                    titleScreenRenderer.keys.right = true;
                    break;
                }
                case 'o':
                {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        // console.log('open', titleScreenRenderer);

                        titleScreenRenderer && titleScreenRenderer.destroy();
                        setTitleScreenRenderer(null);

                        const canvas = canvasRef.current;
                        if (canvas) {
                            const uint8Array = await _loadFile(titleScreenZineFileName);

                            const newTitleScreenRenderer = new TitleScreenRenderer({
                                canvas,
                                uint8Array,
                            });
                            setTitleScreenRenderer(newTitleScreenRenderer);
                            setLoaded(true);

                            // console.log('done loading', newTitleScreenRenderer);
                        } else {
                            throw new Error('no canvas');
                        }
                    }
                    break;
                }
            }
        };
        document.addEventListener('keydown', keydown);
        const keyup = e => {
            switch (e.key) {
                case 'w':
                case 'W':
                {
                    titleScreenRenderer.keys.up = false;
                    break;
                }
                case 's':
                case 'S':
                {
                    titleScreenRenderer.keys.down = false;
                    break;
                }
                case 'a':
                case 'A':
                {
                    titleScreenRenderer.keys.left = false;
                    break;
                }
                case 'd':
                case 'D':
                {
                    titleScreenRenderer.keys.right = false;
                    break;
                }
                case 'k':
                {
                    const newHup = {
                        id: makeId(8),
                    };
                    setHups([...hups, newHup]);
                    break;
                }
            }
        };
        document.addEventListener('keyup', keyup);

        return () => {
            document.removeEventListener('keydown', keydown);
            document.removeEventListener('keyup', keyup);
        };
    }, [
        canvasRef.current,
        titleScreenRenderer,
        titleScreenRenderer?.keys.left,
        titleScreenRenderer?.keys.right,
        titleScreenRenderer?.keys.up,
        titleScreenRenderer?.keys.down,
    ]);

    return (
        <div
            className={styles.titleScreen}
        >
            <MainScreen
                titleScreenRenderer={titleScreenRenderer}
                focused={focused}
                onFocus={newFocused => {
                    setFocused(newFocused);
                }}
                canvasRef={canvasRef}
            />
            {hups.map(hup => <Hups hup={hup} key={hup.id} />)}
            {loading ? (
                <div className={styles.header}>
                    loading...
                </div>
            ) : (loaded ? (
                    null
                ) : (<SceneGallery
                    onImageClick={async u => {
                        try {
                            setLoading(true);

                            const canvas = canvasRef.current;
                            if (canvas) {
                                const imageArrayBuffer = await _loadArrayBuffer(u);
                                const uint8Array = await compileVirtualSceneExport(imageArrayBuffer);

                                const titleScreenRenderer = new TitleScreenRenderer({
                                    canvas,
                                    uint8Array,
                                });
                                setTitleScreenRenderer(titleScreenRenderer);
                                setLoaded(true);
                            } else {
                                throw new Error('no canvas');
                            }
                        } finally {
                            setLoading(false);
                        }
                    }}
                />))
            }
        </div>
    );

};
export default TitleScreen;