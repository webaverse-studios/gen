import {useState, useEffect} from 'react';
import styles from '../../../styles/StoryboardGenerator.module.css';
import {prompts} from '../../constants/prompts.js';

//

export const StoryboardGeneratorComponent = ({
  storyboard,
  panel,
}) => {
  const [prompt, setPrompt] = useState(prompts.world);

  // drag and drop
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();

    if (!panel.isBusy()) {
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
      <input type="text" className={styles.input} value={prompt} onChange={e => {
        setPrompt(e.target.value);
      }} placeholder={prompts.character} />
        <div className={styles.button} onClick={async () => {
          await panel.setFromPrompt(prompt);
        }}>Generate</div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
        const file = e.target.files[0];
        if (file) {
          panel.setFile(file);
        }
      }} />Upload File</a></div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
  );
};