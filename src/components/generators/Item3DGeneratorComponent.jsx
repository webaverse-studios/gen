// import * as THREE from 'three';
import {useState} from 'react';
import {prompts} from '../../constants/prompts.js';
import {ItemGenerator} from '../../generators/item-generator.js';

import styles from '../../../styles/Gen.module.css';
import {downloadFile} from '../../utils/http-utils.js';

//

const itemGenerator = new ItemGenerator();

//

const ItemGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(prompts.item);
  const [itemInstance, setItemInstance] = useState(null);

  return (
    <div className={styles.generator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.item} />
      <div className={styles.button} onClick={async () => {
        const newItemInstance = await itemGenerator.generate(prompt);
        setItemInstance(newItemInstance);
      }}>Generate</div>
      {itemInstance ? <>
        <div className={styles.button} onClick={async () => {
          // download the images
          const {imgBlob} = itemInstance;
          downloadFile(imgBlob, 'item.png');
        }}>DL images</div>
        <div className={styles.button} onClick={async () => {
          // download the images
          const {glbBlob} = itemInstance;
          downloadFile(glbBlob, 'item.glb');
        }}>DL model</div>
      </>
      : null}
    </div>
  );
};
export default ItemGeneratorComponent;