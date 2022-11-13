// import * as THREE from 'three';
import {useState, useEffect} from 'react';
import {Storyboard} from '../../generators/scene-generator.js';
import {StoryboardComponent} from './StoryboardComponent.jsx';
import {StoryboardRendererComponent} from './StoryboardRendererComponent.jsx';

import styles from '../../../styles/SceneGenerator.module.css';

//

/* const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
]; */

//

const _resizeFile = async file => {
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
  const [storyboard, setStoryboard] = useState(() => new Storyboard());
  const [panel, setPanel] = useState(null);
  const [panels, setPanels] = useState([]);

  useEffect(() => {
    const paneladd = e => {
      setPanels(storyboard.panels.slice());
    };
    storyboard.addEventListener('paneladd', paneladd);
    const panelremove = e => {
      const oldPanels = panels;
      const newPanels = storyboard.panels.slice();
      setPanels(newPanels);

      if (panel === e.data.panel) {
        // select the next panel, if there is one
        if (newPanels.length > 0) {
          setPanel(newPanels[Math.min(oldPanels.indexOf(panel), newPanels.length - 1)]);
        } else {
          setPanel(null);
        }
      }
    };
    storyboard.addEventListener('panelremove', panelremove);

    const keydown = e => {
      if (e.key === 'Delete') {
        if (panel) {
          e.preventDefault();
          e.stopPropagation();

          storyboard.removePanel(panel);
        }
      }
    };
    document.addEventListener('keydown', keydown);

    return () => {
      storyboard.removeEventListener('paneladd', paneladd);
      storyboard.removeEventListener('panelremove', panelremove);
      document.removeEventListener('keydown', keydown);
    };
  }, [storyboard, panel, panels]);

  const onPanelSelect = panel => {
    setPanel(panel);
  };

  return (
    <div className={styles.sceneGenerator}>
      <StoryboardRendererComponent
        storyboard={storyboard}
        panel={panel}
        onPanelSelect={onPanelSelect}
      />
      <StoryboardComponent
        storyboard={storyboard}
        panel={panel}
        panels={panels}
        onPanelSelect={onPanelSelect}
      />
    </div>
  );
};
export default SceneGeneratorComponent;