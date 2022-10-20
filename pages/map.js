// import * as THREE from 'three';
// import {useState, useMemo, useEffect} from 'react';

import {useState} from 'react';
import styles from '../styles/Map.module.css';
import {MapCanvas} from '../src/components/MapCanvas.js';
import {MapSidebar} from '../src/components/MapSidebar.js';

//

const arrayEquals = (a, b) => {
  if (a.length !== b.length) {
    return false;
  } else {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
};

//

const Map = () => {
  const [minMax, setMinMax] = useState([0, 0, 0, 0]);
  
  return (
    <div className={styles.map}>
      <MapCanvas onSelectChange={o => {
        if (!arrayEquals(minMax, o.minMax)) {
          setMinMax(o.minMax);
        } else {
          setMinMax([0, 0, 0, 0]);
        }
      }} />
      <MapSidebar minMax={minMax} />
    </div>
  );
};
export default Map;