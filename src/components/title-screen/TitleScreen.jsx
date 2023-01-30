import * as THREE from 'three';
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
// import {
//   compileScene, // XXX for remote compilation
// } from '../../../zine-runtime/zine-remote-compiler.js';
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

import styles from '../../../styles/TitleScreen.module.css';

//

const hash = `8ebd78be3078833da10c95b565ee88b7cf6ba9e0`;
const assetsBaseUrl = `https://cdn.jsdelivr.net/gh/webaverse/content@${hash}/`;
const titleScreenZineFileName = 'title-screen.zine';
const cubicBezier = bezier(0, 1, 0, 1);

//

const localVector2D = new THREE.Vector2();
// const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();

// const zeroVector = new THREE.Vector3(0, 0, 0);
// const oneVector = new THREE.Vector3(1, 1, 1);
// const upVector = new THREE.Vector3(0, 1, 0);

//

const _loadImageArrayBuffer = async u => {
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

class TitleScreenRenderer {
    constructor({
        canvas,
        uint8Array,
    }) {
        this.canvas = canvas;
        this.uint8Array = uint8Array;

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
    
        // scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;

        // camera
        const camera = new THREE.PerspectiveCamera();

        // camera manager
        const localPlayer = new THREE.Object3D();
        localPlayer.position.z = -1;
        localPlayer.updateMatrixWorld();
        const zineCameraManager = new ZineCameraManager({
            camera,
            localPlayer,
        }, {
            normalizeView: false,
            followView: false,
        });
    
        // storyboard
        (async () => {
            const zineStoryboard = new ZineStoryboard();
            await zineStoryboard.loadAsync(uint8Array);
            if (!live) return;
    
            const panel0 = zineStoryboard.getPanel(0);
            const zineRenderer = new ZineRenderer({
                panel: panel0,
                alignFloor: true,
            });
    
            // scene mesh
            scene.add(zineRenderer.scene);
            zineRenderer.scene.updateMatrixWorld();
    
            // path mesh
            const splinePoints = zineRenderer.metadata.paths.map(p => new THREE.Vector3().fromArray(p.position));
            const pathMesh = new PathMesh(splinePoints, {
                animate: true,
            });
            scene.add(pathMesh);
            pathMesh.updateMatrixWorld();
    
            // apply camera
            // camera.copy(zineRenderer.camera);
            zineCameraManager.setLockCamera(zineRenderer.camera);
            zineCameraManager.toggleCameraLock();
        })();
    
        // video mesh
        let video = null;
        let videoMesh = null;
        (async () => {
            const videoUrl = `${assetsBaseUrl}videos/upstreet2.ktx2z`;
            
            // const videoUrl = `/sm/spritesheet.ktx2z`;

            // console.log('got video url', videoUrl);
            const res = await fetch(videoUrl);
            const blob = await res.blob();
            const pack = await VideoMesh.loadPack([
                blob,
            ]);

            videoMesh = new VideoMesh({
                pack,
            });
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

        // particle system mesh
        let particleSystemMesh;
        let particleEmitter;
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

            particleSystemMesh = new ParticleSystemMesh({
                pack,
            });
            particleSystemMesh.frustumCulled = false;
            scene.add(particleSystemMesh);
            particleSystemMesh.position.z = -1;
            particleSystemMesh.scale.setScalar(0.5);
            particleSystemMesh.updateMatrixWorld();

            particleEmitter = new ParticleEmitter2(particleSystemMesh, {
                range: 0.3,
            });
        })();

        // resize handler
        const _setSize = () => {
            renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    
            if (videoMesh) {
                videoMesh.material.uniforms.screenResolution.value.set(
                    globalThis.innerWidth,
                    globalThis.innerHeight
                );
                videoMesh.material.uniforms.screenResolution.needsUpdate = true;
            }
        };
        _setSize();
        renderer.setPixelRatio(window.devicePixelRatio);

        const resize = e => {
            _setSize();
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
        const getCurrentOpacity = now => {
            const timeDiff = now - lastPointerLockChangeTime;
            const timeDiffS = timeDiff / 1000;

            let f = timeDiffS / opacityRate;
            f = Math.min(Math.max(f, 0), 1);
            
            const opacity = startOpacity + (endOpacity - startOpacity) * cubicBezier(f);
            return opacity;
        };
        const pointerlockchange = e => {
            const now = performance.now();

            startOpacity = getCurrentOpacity(now);
            endOpacity = document.pointerLockElement ? 0 : 1;

            lastPointerLockChangeTime = now;
        };
        document.addEventListener('pointerlockchange', pointerlockchange);
    
        // frame loop
        let lastTimestamp = performance.now();
        const _recurse = () => {
          frame = requestAnimationFrame(_recurse);
    
          if (!document.hidden) {
            const timestamp = performance.now();
            const timeDiff = timestamp - lastTimestamp;

            // update meshes
            if (videoMesh) {
                const resolution = renderer.getSize(localVector2D);
                videoMesh.update({
                    timestamp,
                    opacity: getCurrentOpacity(timestamp),
                    resolution,
                });
            }
            if (particleSystemMesh) {
                particleEmitter.update({
                    timestamp,
                    localPlayer: particleSystemMesh,
                });

                particleSystemMesh.update({
                    timestamp,
                    timeDiff,
                    camera,
                });
            }
            // update camera
            zineCameraManager.updatePost(timestamp, timeDiff);
            
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
    destroy() {
      for (let i = 0; i < this.cleanupFns.length; i++) {
        this.cleanupFns[i]();
      }
    }
}

//

const MainScreen = ({
    titleScreenRenderer,
    focused,
    onFocus,
    canvasRef,
}) => {
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
            e.preventDefault();
            e.stopPropagation();
            
            switch (e.key) {
                // space
                case ' ': {
                    _togglePointerLock();
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
    }, [canvasRef.current, onFocus]);

    return (
        <div className={classnames(
            styles.mainScreen,
            titleScreenRenderer ? styles.enabled : null,
            focused ? styles.focused : null,
        )}>
            <canvas className={classnames(
                styles.canvas,
            )} onDoubleClick={async e => {
                await _togglePointerLock();
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

const TitleScreen = () => {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [focused, setFocused] = useState(false);
    const [titleScreenRenderer, setTitleScreenRenderer] = useState(null);

    const canvasRef = useRef();

    useEffect(() => {
        const keydown = async e => {
            switch (e.key) {
                case 's': {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log('save', titleScreenRenderer);

                        if (titleScreenRenderer) {
                            await _saveFile(titleScreenZineFileName, titleScreenRenderer.uint8Array);
                        }
                    }
                    break;
                }
                case 'o': {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log('open', titleScreenRenderer);

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

                            console.log('done loading', newTitleScreenRenderer);
                        } else {
                            throw new Error('no canvas');
                        }
                    }
                    break;
                }
            }
        };
        document.addEventListener('keydown', keydown);

        return () => {
            document.removeEventListener('keydown', keydown);
        };
    }, [canvasRef.current, titleScreenRenderer]);

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
                                const imageArrayBuffer = await _loadImageArrayBuffer(u);
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