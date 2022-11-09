// import * as THREE from 'three';
import {SceneGenerator} from '../src/generators/scene-generator.js';
import {CharacterGenerator} from '../src/generators/character-generator.js';
import {ItemGenerator} from '../src/generators/item-generator.js';

import styles from '../styles/Gen.module.css';

//

const sceneGenerator = new SceneGenerator();
const characterGenerator = new CharacterGenerator();
const itemGenerator = new ItemGenerator();

//

const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
];

//

if (typeof window !== 'undefined') {
  document.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      // const u = URL.createObjectURL(file);
      await sceneGenerator.generate(file);
      // URL.revokeObjectURL(u);
    }
  });
}

//

const Gen = () => {
  // const [minMax, setMinMax] = useState([0, 0, 0, 0]);
  
  return (
    <div className={styles.gen}>
      <div className={styles.tabs}>
        <div className={styles.tab} onClick={async () => {
          await sceneGenerator.generate();
        }}>Scene</div>
        <div className={styles.tab} onClick={async () => {
          await characterGenerator.generate();
        }}>Character</div>
        <div className={styles.tab} onClick={async () => {
          await itemGenerator.generate();
        }}>Item</div>
      </div>
    </div>
  );
};
export default Gen;