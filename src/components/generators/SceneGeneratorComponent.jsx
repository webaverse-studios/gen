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
  const onPanelsLoad = newPanelDatas => {
    const oldPanels = panels;
    for (const panel of oldPanels) {
      storyboard.removePanel(panel);
    }
    const newPanels = newPanelDatas.map(panelData => storyboard.addPanel(panelData));
    if (newPanels.length > 0) {
      setPanel(newPanels[0]);
    }
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
        onPanelsLoad={onPanelsLoad}
      />
    </div>
  );
};
export default SceneGeneratorComponent;