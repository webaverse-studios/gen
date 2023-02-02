import {useEffect, useRef, useState} from 'react';
import {makeDefaultCamera, makeRenderer} from "../../zine/zine-utils.js";
import * as THREE from "three";
import styles from "../../../styles/Hups.module.css";
import {AvatarManager} from '../generators/AvatarManager.js';

import Avatar from '../../avatars/avatars.js';
import avatarsWasmManager from '../../avatars/avatars-wasm-manager.js';

//

const size = 1024;

//

/* class AvatarRenderer extends EventTarget {
    constructor(model, canvas) {
        super();

        this.canvas = canvas;
        this.model = model;

        // canvas.width = size;
        // canvas.height = size;
        // canvas.classList.add('canvas');

        // create renderer
        const renderer = makeRenderer(canvas);
        this.renderer = renderer;
        this.addEventListener('destroy', e => {
            this.renderer.dispose();
        });

        // setup 3D scene
        const scene = new THREE.Scene();
        scene.autoUpdate = false;
        this.scene = scene;

        const camera = makeDefaultCamera();
        camera.position.set(0, 0.9, -2);
        camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        camera.updateMatrixWorld();
        this.camera = camera;

        const avatars = new THREE.Object3D();
        avatars.add(model);
        model.updateMatrixWorld();
        scene.add(avatars);
        this.avatars = avatars;
        
        this.animate();
    }

    animate() {
        const _startLoop = () => {
            let frame;
            const _loop = () => {
                frame = requestAnimationFrame(_loop);

                this.renderer.render(this.scene, this.camera);
            };
            _loop();

            this.addEventListener('destroy', e => {
                cancelAnimationFrame(frame);
            });
        };
        _startLoop();
    }

    destroy() {
        this.dispatchEvent(new MessageEvent('destroy'));
    }
}; */

//

export const AvatarCanvas = ({
  gltf,
}) => {
  // console.log('render avatar canvas', {gltf});
  const [avatarManager, setAvatarManager] = useState(null);
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
   
    if (gltf && canvas && !avatarManager) {
      let live = true;

      (async () => {
        await Promise.all([
          Avatar.waitForLoad(),
          avatarsWasmManager.waitForLoad(),
        ]);
        if (!live) return;

        // console.log('render gltf', {
        //   canvas,
        //   gltf,
        // });

        const avatarManager = new AvatarManager({
          canvas,
          gltf,
        });
        await avatarManager.waitForLoad();
        if (!live) return;

        await avatarManager.embody();
        if (!live) return;
        
        setAvatarManager(avatarManager);
      })();

      return () => {
        live = false;
      };
    }
  }, [gltf, canvasRef.current, avatarManager]);

  return (
    <canvas
      className={styles.canvas}
      width={size}
      height={size}
      ref={canvasRef}
    />
  );
};