import {useState, useEffect} from 'react';
import styles from '../../../styles/StoryboardGenerator.module.css';
import {prompts} from '../../constants/prompts.js';

export const StoryboardGeneratorComponent = ({
  storyboard,
  panel,
}) => {
  const [prompt, setPrompt] = useState(prompts.world);
  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);
  const [busyMessage, setBusyMessage] = useState(panel ? panel.getBusyMessage() : '');

  // busy tracking
  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(panel.isBusy());
        setBusyMessage(panel.getBusyMessage());
      };
      panel.addEventListener('busyupdate', onbusyupdate);

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
      };
    }
  }, [panel, busy]);

  // drag and drop
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();

    if (!busy) {
      const files = e.dataTransfer.files;
      const file = files[0];
      if (file) {
        panel.setFile(file);
      }
    }
  };

  return (
    <div
      className={styles.storyboardGenerator}
      onDragOver={dragover}
      onDrop={drop}
    >
      {!busy ? <>
        <input type="text" className={styles.input} value={prompt} onChange={e => {
          setPrompt(e.target.value);
        }} placeholder={prompts.character} disabled={busy} />
          <div className={styles.button} onClick={async () => {
            await panel.setFromPrompt(prompt);
          }} disabled={busy}>Generate</div>
        <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
          const file = e.target.files[0];
          if (file) {
            panel.setFile(file);
          }
        }} />Upload File</a></div>
        <div>or, <i>Drag and Drop</i></div>
      </> : (
        <div className={styles.busy}>{busyMessage}</div>
      )}
    </div>
  );
};