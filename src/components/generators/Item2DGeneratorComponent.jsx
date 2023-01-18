import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  useState,
  useRef,
} from 'react';
import classnames from 'classnames';
import {prompts} from '../../constants/prompts.js';
import {ItemGenerator} from '../../generators/item-generator.js';
import {DropTarget} from '../drop-target/DropTarget.jsx';

import styles from '../../../styles/Gen.module.css';
import {downloadFile} from '../../utils/http-utils.js';
import {blob2img} from '../../utils/convert-utils.js';

//

const itemGenerator = new ItemGenerator();
const previewCanvasSize = 1024;

//

const Item2DGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(prompts.item);
  const [imgBlob, setImgBlob] = useState(null);
  const [glbBlob, setGlbBlob] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [compiled, setCompiled] = useState(false);

  const canvasRef = useRef(null);

  const addFiles = newFiles => {
    setFiles(newFiles);
  };

  return (
    <div className={styles.generator}>
      <canvas className={classnames(
        styles.canvas,
        compiled ? null : styles.hidden,
      )} ref={canvasRef} />
      {!loading ? <>
        {!generated && files.length === 0 ? <>
          <input type="text" className={styles.input} value={prompt} onChange={e => {
            setPrompt(e.target.value);
          }} placeholder={prompts.item} />
        </> : null}
        {(!generated && !imgBlob) ?
          <div className={styles.button} onClick={async () => {
            setLoading(true);

            try {
              let imgBlob;
              if (files.length > 0) {
                imgBlob = files[0];
              } else {
                imgBlob = await itemGenerator.generateImage(prompt);
              }
              setImgBlob(imgBlob);

              const img = await blob2img(imgBlob);
              img.classList.add('img');
              document.body.appendChild(img);
            } finally {
              setLoading(false);
              setGenerated(true);
            }
          }}>Generate</div>
        : null}
        {(!compiled && imgBlob) ?
          <div className={styles.button} onClick={async () => {
            setLoading(true);

            try {
              const img = await blob2img(imgBlob);

              const {
                sceneMesh,
                // imgBlob,
                glbBlob,
              } = await itemGenerator.compileMesh(img);

              setGlbBlob(glbBlob);

              // start renderer
              const _startRender = () => {
                // const canvas = document.createElement('canvas');
                // canvas.classList.add('canvas');
                const canvas = canvasRef.current;
                if (!canvas) {
                  throw new Error('no canvas');
                }
                canvas.width = previewCanvasSize;
                canvas.height = previewCanvasSize;
                document.body.appendChild(canvas);

                const renderer = new THREE.WebGLRenderer({
                  canvas,
                  alpha: true,
                  antialias: true,
                });

                // set up high quality shadow map (2048px)
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;

                const scene = new THREE.Scene();
                
                // scene.background = new THREE.Color(0x000000);
                const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
                camera.position.x = 0.5;
                camera.position.y = 1;
                camera.position.z = 2;
                // camera.lookAt(new THREE.Vector3(0, 0.5, 0));
                camera.updateMatrixWorld();

                // lights
                const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
                directionalLight.position.set(3, 2, 3);
                directionalLight.castShadow = true;
                scene.add(directionalLight);

                // receive shadow on the floor
                const floorMesh = new THREE.Mesh(
                  new THREE.PlaneBufferGeometry(10, 10),
                  new THREE.MeshStandardMaterial({
                    color: 0xFFFFFF,
                    roughness: 0.5,
                    metalness: 0.5,
                  })
                );
                floorMesh.receiveShadow = true;
                floorMesh.rotation.x = -Math.PI / 2;
                floorMesh.frustumCulled = false;
                floorMesh.updateMatrixWorld();
                scene.add(floorMesh);

                // collect the pixels into a flat voxel grid along the x-y plane
                sceneMesh.castShadow = true;
                sceneMesh.frustumCulled = false;
                scene.add(sceneMesh);

                /* const cubeMesh = new THREE.Mesh(
                  new THREE.BoxBufferGeometry(0.1, 0.1, 0.1),
                  new THREE.MeshPhongMaterial({
                    color: 0x00ff00,
                  }),
                );
                cubeMesh.castShadow = true;
                cubeMesh.frustumCulled = false;
                scene.add(cubeMesh); */

                // add THREE.js orbit controls
                const controls = new OrbitControls(camera, canvas);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                // controls.screenSpacePanning = false;
                controls.minDistance = 0.001;
                controls.maxDistance = 10;
                controls.maxPolarAngle = Math.PI / 2;
                // set the target
                controls.target.set(0, 1, 0);

                const blockEvent = e => {
                  e.preventDefault();
                  e.stopPropagation();
                };
                canvas.addEventListener('mousedown', blockEvent);
                canvas.addEventListener('mouseup', blockEvent);
                canvas.addEventListener('click', blockEvent);
                canvas.addEventListener('wheel', blockEvent);
                document.addEventListener('keydown', e => {
                  if (!e.repeat) {
                    // page up
                    if (e.key === 'PageUp') {
                      material.uniforms.uColorEnabled.value = 1;
                      material.uniforms.uColorEnabled.needsUpdate = true;
                      blockEvent(e);
                    } else if (e.key === 'PageDown') {
                      material.uniforms.uColorEnabled.value = 0;
                      material.uniforms.uColorEnabled.needsUpdate = true;
                      blockEvent(e);
                    }
                  }
                });

                const _startLoop = () => {
                  const _render = () => {
                    // update orbit controls
                    controls.update();
                    camera.updateMatrixWorld();

                    const now = performance.now();
                    sceneMesh.position.y = Math.sin(now / 1000) * 0.3 + 0.5;
                    sceneMesh.rotation.y = now / 500;
                    sceneMesh.updateMatrixWorld();

                    // render
                    renderer.render(scene, camera);
                  };
                  const _loop = () => {
                    requestAnimationFrame(_loop);
                    _render();
                  };
                  _loop();
                };
                _startLoop();
              };
              _startRender();
            } finally {
              setLoading(false);
              setCompiled(true);
            }
          }}>Compile</div>
        : null}
        {imgBlob ?
          <div className={styles.button} onClick={async () => {
            // download the images
            downloadFile(imgBlob, 'item.png');
          }}>DL images</div>
        : null}
        {glbBlob ?
          <div className={styles.button} onClick={async () => {
            // download the images
            downloadFile(glbBlob, 'item.glb');
          }}>DL model</div>
        : null}
        {(!generated && files.length === 0) ? <DropTarget
          className={classnames(
            styles.panelPlaceholder,
          )}
          onFilesAdd={addFiles}
          // multiple
        /> : null}
        {(!generated && files.length > 0) ? <div className={styles.files}>
          <div className={styles.filesHeader}>Files ({files.length}):</div>
          {files.map((file, i) => {
            return (
              <div className={styles.file} key={i}>
                <div className={styles.fileName}>{file.name}</div>
                <a className={styles.closeX} onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();

                  const newFiles = files.slice();
                  newFiles.splice(i, 1);
                  setFiles(newFiles);
                }}>x</a>
              </div>
            );
          })}
        </div> : null}
      </> : <div className={styles.header}>
        compiling...
      </div>}
    </div>
  );
};
export default Item2DGeneratorComponent;