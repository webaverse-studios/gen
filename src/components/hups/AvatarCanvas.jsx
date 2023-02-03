import * as THREE from "three";
import {useEffect, useRef, useState} from 'react';
// import {makeDefaultCamera, makeRenderer} from "../../zine/zine-utils.js";
import styles from "../../../styles/Hups.module.css";
import {AvatarManager} from '../generators/AvatarManager.js';

import Avatar from '../../avatars/avatars.js';
import avatarsWasmManager from '../../avatars/avatars-wasm-manager.js';

//

const size = 1024;

//

export const AvatarCanvas = ({
  gltf,
}) => {
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

        const avatarManager = new AvatarManager({
          canvas,
          gltf,
        });
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