// import * as THREE from 'three';
import {useState} from 'react';
import {prompts} from '../../constants/prompts.js';
import {ItemGenerator} from '../../generators/item-generator.js';

import styles from '../../../styles/Gen.module.css';

//

const itemGenerator = new ItemGenerator();

//

const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
];

//

const ItemGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(prompts.item);
  
  return (
    <div className={styles.generator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.item} />
      <div className={styles.button} onClick={async () => {
        await itemGenerator.generate(prompt);
      }}>Generate</div>
    </div>
  );
};
export default ItemGeneratorComponent;