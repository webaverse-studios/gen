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

import styles from '../../../styles/TitleScreen.module.css';

//

const assetsBaseUrl = `https://cdn.jsdelivr.net/gh/webaverse/content@main/`
const titleScreenZineFileName = 'title-screen.zine';

//

const _loadImageArrayBuffer = async u => {
    const res = await fetch(u);
    const arrayBuffer = await res.arrayBuffer();
    return arrayBuffer;
};
const _loadVideo = async u => {
    const v = document.createElement('video');
    v.crossOrigin = 'Anonymous';
    v.src = u;
    await new Promise((accept, reject) => {
        v.oncanplaythrough = accept;
        v.onerror = reject;
    });
    return v;
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
globalThis.saveFile = _saveFile;
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
globalThis.loadFile = _loadFile;

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
        let videoTexture = null;
        let videoMesh = null;
        (async () => {
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
    
            // full screen video mesh
            const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    
            videoTexture = new THREE.VideoTexture(video);
            const videoMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    map: {
                        value: videoTexture,
                        needsUpdate: true,
                    },
                    screenResolution: {
                        value: new THREE.Vector2(canvas.width, canvas.height),
                        needsUpdate: true,
                    },
                    videoResolution: {
                        value: new THREE.Vector2(1980, 1080),
                        needsUpdate: true,
                    },
                    offset: {
                        value: new THREE.Vector2(0, -0.3),
                        needsUpdate: true,
                    },
                },
                vertexShader: `\
                    varying vec2 vUv;
    
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `\
                    uniform sampler2D map;
                    uniform vec2 screenResolution;
                    uniform vec2 videoResolution;
                    uniform vec2 offset;
                    varying vec2 vUv;
    
                    const vec3 baseColor = vec3(${
                        new THREE.Color(0xd3d3d3).toArray().map(n => n.toFixed(8)).join(', ')
                    });
                    // const vec3 baseColor = vec3(0., 1., 0.);
                    /* const vec3 baseColor = vec3(${
                        new THREE.Color(0x01b140).toArray().map(n => n.toFixed(8)).join(', ')
                    }); */
    
                    void main() {
                        // adjust uv for the video aspect ratios of the screen and the video
                        // to keep the video centered and unstretched regardless of the screen aspect ratio
                        float screenAspectRatio = screenResolution.x / screenResolution.y;
                        float videoAspectRatio = videoResolution.x / videoResolution.y;
    
                        vec2 uv = vUv;
                        uv = (uv - 0.5) * 2.0; // [-1, 1]
                        uv.y /= screenAspectRatio;
                        uv.y *= videoAspectRatio;
                        uv += offset;
                        uv = (uv + 1.0) / 2.0; // [0, 1]
                        
                        gl_FragColor = texture2D(map, uv);
    
                        // float colorDistance = abs(gl_FragColor.r - baseColor.r) +
                        //     abs(gl_FragColor.g - baseColor.g) +
                        //     abs(gl_FragColor.b - baseColor.b);
                        float colorDistance = distance(gl_FragColor.rgb, baseColor);
                        if (colorDistance < 0.01) {
                            discard;
                        } else {
                            gl_FragColor.a = min(max(colorDistance * 4., 0.0), 1.0);
                        }
                    }
                `,
                side: THREE.DoubleSide,
                transparent: true,
                alphaToCoverage: true,
                // alphaTest: 0.1,
            });
    
            videoMesh = new THREE.Mesh(geometry, videoMaterial);
            videoMesh.frustumCulled = false;
            scene.add(videoMesh);
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
        
        /* // key handlers
        globalThis.addEventListener('keydown', e => {
            switch (e.key) {
                case 'n': {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('trigger animation');
                    
                    break;
                }
            }
        }); */
    
        // frame loop
        let lastTimestamp = performance.now();
        const _recurse = () => {
          frame = requestAnimationFrame(_recurse);
    
          if (!document.hidden) {
            const timestamp = performance.now();
            const timeDiff = timestamp - lastTimestamp;
            zineCameraManager.updatePost(timestamp, timeDiff);
    
            renderer.render(scene, camera);
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
    canvasRef,
}) => {
    return (
        <div className={classnames(
            styles.mainScreen,
            titleScreenRenderer ? styles.enabled : null,
        )}>
            <canvas className={classnames(
                styles.canvas,
            )} ref={canvasRef} />
            <footer className={styles.footer}>
                <span className={styles.bold}>SEVERE WARNING:</span> This product is not intended for children under age sixty. <span className={styles.bold}>This is an AI generated product.</span> The ideas expressed are not proven to be safe. This product contains course language and due to its nature it should be viewed twice. Made by the Lisk.
            </footer>
        </div>
    );
};

//

const TitleScreen = () => {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [titleScreenRenderer, setTitleScreenRenderer] = useState(null);

    // forward the canvas ref to the main screen
    const canvasRef = useRef(null);

    useEffect(() => {
        const keydown = async e => {
            switch (e.key) {
                case 's': {
                    e.preventDefault();
                    e.stopPropagation();

                    console.log('save', titleScreenRenderer);

                    if (titleScreenRenderer) {
                        await _saveFile(titleScreenZineFileName, titleScreenRenderer.uint8Array);
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