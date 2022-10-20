// import * as THREE from 'three';
// import {useState, useMemo, useEffect} from 'react';

import classnames from 'classnames';
import {useEffect} from 'react';
// import {ProcGenManager} from '../../src/procedural-generation/procgen-manager.js';
// import {FreeList} from '../../public/utils/geometry-utils.js';
// import {setRaycasterFromEvent} from '../../public/utils/renderer-utils.js';
import styles from '../../styles/MapSidebar.module.css';

// import {HeightfieldsMesh} from '../layers/heightfields-mesh.js';
// import {ParcelsMesh} from '../layers/parcels-mesh.js';
// import {Target2DMesh} from '../meshes/target-2d-mesh.js';
// import {HudMesh} from '../layers/hud-mesh.js';
// import {LoadingMesh} from '../layers/loading-mesh.js';
// import {getScaleLod} from '../../public/utils/procgen-utils.js';

// import {
//   chunkSize,
// } from '../../constants/procgen-constants.js';
// import {
//   worldWidth,
//   worldHeight,
//   baseLod1Range,
//   maxChunks,
// } from '../../constants/map-constants.js';

// import bezier from '../utils/easing.js';

export const MapSidebar = ({
  minMax = [0, 0, 0, 0],
  onClose,
}) => {
  const selected = (minMax[2] - minMax[0]) > 0;
  // console.log('got', selected, minMax[2]);

  useEffect(() => {
    const keydown = e => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
    };
  }, []);

  return (
    <div
      className={classnames(styles.mapSidebar, selected ? styles.open : null)}
    />
  );
};