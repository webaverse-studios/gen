// import * as THREE from 'three';
import {useState, useRef} from 'react';
import {prompts} from '../../constants/prompts.js';
import {SceneGenerator} from '../../generators/scene-generator.js';

import styles from '../../../styles/Gen.module.css';
import {useEffect} from 'react';

//

const sceneGenerator = new SceneGenerator();

//

/* const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
]; */

//

const Storyboard = () => {
  const [items, setItems] = useState([]);

  return (
    <div className={styles.storyboard}>
      {items.map(item => (
        <div className={styles.storyboardItem}>
          <img src={item} />
        </div>
      ))}
    </div>
  )
};

//

const _sizeFile = async file => {
  // read the image
  const image = await new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
      cleanup();
    };
    img.onerror = err => {
      reject(err);
      cleanup();
    };
    img.crossOrigin = 'Anonymous';
    const u = URL.createObjectURL(file);
    img.src = u;
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
  });

  // if necessary, resize the image via contain mode
  if (image.width !== 1024 || image.height !== 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    // ctx.fillStyle = 'white';
    // ctx.fillRect(0, 0, 1024, 1024);
    const sx = Math.max(0, (image.width - image.height) / 2);
    const sy = Math.max(0, (image.height - image.width) / 2);
    const sw = Math.min(image.width, image.height);
    const sh = Math.min(image.width, image.height);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 1024, 1024);
    file = await new Promise((accept, reject) => {
      canvas.toBlob(blob => {
        accept(blob);
      });
    });
  }
  return file;
};
const SceneGeneratorComponent = () => {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState(prompts.world);
  const [sceneRenderer, setSceneRenderer] = useState(null);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef();

  const _addPanel = async file => {
    setBusy(true);
    try {
      file = await _sizeFile(file);
      const scenePackage = await sceneGenerator.generate(prompt, file);

      const sceneRenderer = sceneGenerator.createRenderer(canvasRef.current);
      sceneRenderer.setPackage(scenePackage);

      setSceneRenderer(sceneRenderer);
      setStep(2);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const dragover = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragover', dragover);
    const drop = async e => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      const file = files[0];
      if (file) {
        await _addPanel(file);
      }
    };
    document.addEventListener('drop', drop);
    const keydown = e => {
      if (!e.repeat) {
        console.log('got key', e.key);
        switch (e.key) {
          case ' ': {
            if (step === 2) {
              e.preventDefault();
              e.stopPropagation();

              sceneRenderer.renderBackground();
            }
            break;
          }
        }
      }
    };
    document.addEventListener('keydown', keydown);

    return () => {
      document.removeEventListener('dragover', dragover);
      document.removeEventListener('drop', drop);
      document.removeEventListener('keydown', keydown);
    };
  }, [sceneRenderer]);

  return (
    <div className={styles.generator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} disabled={busy} />
        <div className={styles.button} onClick={async () => {
          await sceneGenerator.generate(prompt);
        }} disabled={busy}>Generate</div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
        const file = e.target.files[0];
        if (file) {
          await _addPanel(file);
        }
      }} />Upload File</a></div>
      <div>or, <b>Drag and Drop</b></div>
      <div className={styles.canvasWrap} ref={canvasRef} />
    </div>
  );
};
export default SceneGeneratorComponent;