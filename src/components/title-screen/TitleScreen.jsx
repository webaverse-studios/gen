import * as THREE from 'three';
import React, {useState, useEffect, useRef, useContext, createContext, Fragment} from 'react';
import classnames from 'classnames';

//

// import '../../../styles/globals.css';
import styles from '../../../styles/TitleScreen.module.css';

//

// import {
//     ZineRenderer,
// } from 'zine/zine-renderer.js';
import {
    ZineCameraManager,
} from '../../zine-runtime/zine-camera.js';
import {
    ZineStoryboard,
} from '../../zine/zine-format.js';
// import {
//     compileScene, // XXX for remote compilation
// } from '../../../zine-runtime/zine-remote-compiler.js';
import {
    PathMesh,
} from '../../zine-aux/meshes/path-mesh.js';

//

const contentBaseUrl = `https://cdn.jsdelivr.net/gh/webaverse/content@main/`;
const imagesUrl = `${contentBaseUrl}images/`;
const imagesListUrl = `${imagesUrl}list.txt`;
// const assetsBaseUrl = `https://webaverse.github.io/gwe-assets`;

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

const _startApp = (canvas, u) => {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
    });

    const camera = new THREE.PerspectiveCamera();

    const scene = new THREE.Scene();
    scene.autoUpdate = false;

    // camera manager
    const zineCameraManager = new ZineCameraManager(camera, {
        normalizeView: false,
        followView: false,
    });

    (async () => {
        const imageArrayBuffer = await _loadImageArrayBuffer(u);

        const uint8Array = await compileScene(imageArrayBuffer);

        const zineStoryboard = new ZineStoryboard();
        zineStoryboard.load(uint8Array);

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
        video = await _loadVideo(`${assetsBaseUrl}/videos/upstreet2.mp4`);;
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
    globalThis.addEventListener('resize', e => {
        _setSize();
    });

    // key handlers
    globalThis.addEventListener('keydown', e => {
        switch (e.key) {
            case 'g': {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('trigger animation');
                
                break;
            }
        }
    });

    // frame loop
    let lastTimestamp = performance.now();
    const _frame = () => {
      requestAnimationFrame(_frame);

      if (!document.hidden) {
        const timestamp = performance.now();
        const timeDiff = timestamp - lastTimestamp;
        zineCameraManager.updatePost(timestamp, timeDiff);

        renderer.render(scene, camera);
      }
    };
    _frame();
};

//

const Gallery = ({
    onLoadImage,
}) => {
    const [imgUrls, setImgUrls] = useState([]);
    
    useEffect(() => {
        let live = true;
        
        (async () => {
            const res = await fetch(imagesListUrl);
            if (!live) return;
            
            const text = await res.text();
            if (!live) return;

            const urls = text.split('\n')
              .map(name => `${imagesUrl}${name}`);
            // console.log('load new urls', urls);
            setImgUrls(urls);
        })();

        return () => {
            live = false;
        };
    }, []);

    return (
        <div className={styles.gallery}>
            {imgUrls.map((u, i) => {
               return (
                   <GalleryImage
                       src={u}
                       onClick={e => {
                            onLoadImage(u);
                       }}
                       key={i}
                   />
               );
            })}
        </div>
    );
};

//

const MainScreen = ({
    appStarted,
    canvasRef,
}) => {
    return (
        <div className={classnames(
            styles.mainScreen,
            appStarted ? styles.enabled : null,
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

const GalleryImage = ({
    src,
    onClick,
}) => {
    const ref = useRef();
    const imgRef = useRef();

    useEffect(() => {
        const el = ref.current;
        const imgEl = imgRef.current;
        if (el && imgEl) {
            const options = {
                root: null,
                rootMargin: '1000px',
                threshold: 0,
            };
            const callback = (entries, observer) => {
                // console.log('got entries', {
                //     entries,
                //     observer,
                // });
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        if (!imgEl.loaded) {
                            imgEl.loaded = true;
                            // console.log('intersecting', entry, imgEl.src);
                            /* const img = new Image();
                            img.src = src;
                            img.crossOrigin = 'Anonymous';
                            img.onload = () => {
                                console.log('got image', img);
                                el.appendChild(img);
                            };
                            observer.unobserve(entry.target); */

                            imgEl.classList.add(styles.loaded);

                            const load = e => {
                                // imgEl.classList.add(styles.loaded);
                                cleanup();
                            };
                            imgEl.addEventListener('load', load);
                            const error = e => {
                                imgEl.classList.add(styles.errored);
                                cleanup();
                            };
                            imgEl.addEventListener('error', error);
                            const cleanup = () => {
                                imgEl.removeEventListener('load', load);
                                imgEl.removeEventListener('error', error);
                            };
                            imgEl.src = src;
                        }
                    } else {
                        if (imgEl.loaded) {
                            // compute the scroll parent
                            // const scrollTop = window.pageYOffset;

                            // compute the scroll distance
                            // const rect = imgEl.getBoundingClientRect();                            
                            // const scrollDistance = Math.max(0, -rect.bottom, -rect.top);
                            // console.log('scroll', scrollDistance);

                            // if (scrollDistance > 1000) {
                                // console.log('scroll distance cleared', scrollDistance);
                                imgEl.removeAttribute('src');
                                // imgEl.src = '';
                                imgEl.loaded = false;
                                imgEl.classList.remove(styles.loaded);
                                imgEl.classList.remove(styles.errored);
                            // }
                        }
                    }
                }
            };
            let observer = new IntersectionObserver(callback, options);
            observer.observe(el);

            return () => {
                observer.disconnect();
            };
        }
    }, [ref.current, imgRef.current]);

    return (
        <div className={styles.imageWrap} ref={ref}>
            <img crossOrigin="Anonymous" className={styles.image} onClick={onClick} ref={imgRef} />
        </div>
    );
};

//

const TitleScreen = () => {

    const [appStarted, setAppStarted] = useState(false);

    // forward the canvas ref to the main screen
    const canvasRef = useRef(null);

    //

    return (
        <div
            className={styles.titleScreen}
        >
            <MainScreen
                appStarted={appStarted}
                canvasRef={canvasRef}
            />
            {appStarted ? null : <Gallery
                onLoadImage={u => {
                    if (canvasRef.current && !appStarted) {
                        setAppStarted(true);
                        _startApp(canvasRef.current, u);
                    }
                }}
            />}
        </div>
    );

};
export default TitleScreen;