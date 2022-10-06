// import * as THREE from 'three';
// import {useState, useMemo, useEffect} from 'react';

import styles from '../styles/Map.module.css';
import {MapCanvas} from './components/MapCanvas.js';

const Map = () => {
  return (
    <div className={styles.map}>
      <MapCanvas />
    </div>
  );
};
export default Map;