// import * as THREE from 'three';
import {useState, useRef} from 'react';
import classnames from 'classnames';
import {prompts} from '../../constants/prompts.js';
import {CharacterGenerator} from '../../generators/character-generator.js';
import {mod} from '../../../utils.js';

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
  const [bodyIndex, setBodyIndex] = useState(0);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  
  const canvasRef = useRef();
  
  const _moveBody = delta => {
    const nextBodyIndex = mod(bodyIndex + delta, numImages);
    setBodyIndex(nextBodyIndex);
  };

  return (
    <div className={styles.generator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} disabled={busy} />
      <div className={styles.button} onClick={async () => {
        setBusy(true);
        try {
          await characterGenerator.generate(prompt, canvasRef.current); // XXX split this into generate and render
          setStep(2);
        } finally {
          setBusy(false);
        }
      }} disabled={busy}>Generate</div>
      <div className={styles.characterCreator}>
        {step === 2 ? <div className={classnames(styles.arrow, styles.left)} onClick={async () => {
          _moveBody(-1);
        }}>
          <img src="/images/light-arrow-01.png" className={classnames(styles.img, styles.light)} />
          <img src="/images/light-arrow-02.png" className={classnames(styles.img, styles.dark)} />
        </div> : null}
        <div className={styles.canvasWrap} ref={canvasRef} />
        {step === 2 ? <div className={classnames(styles.arrow, styles.right)} onClick={async () => {
          _moveBody(1);
        }}>
          <img src="/images/light-arrow-01.png" className={classnames(styles.img, styles.light)} />
          <img src="/images/light-arrow-02.png" className={classnames(styles.img, styles.dark)} />
        </div> : null}
      </div>
    </div>
  );
};
export default CharacterGeneratorComponent;