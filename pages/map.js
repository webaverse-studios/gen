// import * as THREE from 'three';
// import {useState, useMemo, useEffect} from 'react';

import {useState} from 'react';
import styles from '../styles/Map.module.css';
import {MapCanvas} from '../src/components/MapCanvas.js';
import {MapSidebar} from '../src/components/MapSidebar.js';

const Map = () => {
  const [minMax, setMinMax] = useState([0, 0, 0, 0]);
  
  return (
    <div className={styles.map}>
      <MapCanvas onSelectChange={o => {
          const {minMax} = o;
          // if (minMax) {
            setMinMax(minMax);
          // } else {
          //   setMinMax([0, 0, 0, 0]);
          // }
      }} />
      <MapSidebar minMax={minMax} onClose={e => {
        setMinMax([0, 0, 0, 0]);
      }} />
    </div>
  );
};
export default Map;