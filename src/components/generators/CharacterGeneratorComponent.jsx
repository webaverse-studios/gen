// import * as THREE from 'three';
import {useState} from 'react';
import {prompts} from '../../constants/prompts.js';
import {CharacterGenerator} from '../../generators/character-generator.js';

import styles from '../../../styles/Gen.module.css';

//

const characterGenerator = new CharacterGenerator();

//

const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
];

//

const numImages = 4;
const CharacterGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(prompts.character);
  
  return (
    <div className={styles.generator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} />
      <div className={styles.button} onClick={async () => {
        await characterGenerator.generate(prompt);
      }}>Generate</div>
    </div>
  );
};
export default CharacterGeneratorComponent;