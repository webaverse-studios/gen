import {useState, useEffect} from 'react';
import styles from '../../../styles/StoryboardGenerator.module.css';
import {prompts} from '../../constants/prompts.js';

export const StoryboardGeneratorComponent = ({
  storyboard,
  panel,
}) => {
  const [prompt, setPrompt] = useState(prompts.world);
  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);

  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        // console.log('got busy update', e);
        setBusy(e.data.busy);
      };
      panel.addEventListener('busyupdate', onbusyupdate);

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
      };
    }
  }, [panel, busy]);
  /* const _addPanel = async file => {
    setBusy(true);
    try {
      if (typeof file === 'string') {
        file = await imageAiClient.createImageBlob(file);
      }
      file = await _resizeFile(file);
      const scenePackage = await sceneGenerator.generate(prompt, file);

      const sceneRenderer = sceneGenerator.createRenderer(canvasRef.current);
      sceneRenderer.setPackage(scenePackage);

      setSceneRenderer(sceneRenderer);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }; */

  return (
    <div className={styles.storyboardGenerator}>
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} disabled={busy} />
        <div className={styles.button} onClick={async () => {
          await storyboard.addPanelFromPrompt(prompt);
        }} disabled={busy}>Generate</div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
        const file = e.target.files[0];
        if (file) {
          await storyboard.addPanelFromFile(file);
        }
      }} />Upload File</a></div>
      <div>or, <b>Drag and Drop</b></div>
    </div>
  );
};