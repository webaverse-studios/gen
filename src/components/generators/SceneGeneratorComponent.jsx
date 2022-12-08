// import * as THREE from 'three';
import {useState, useEffect} from 'react';
// import {
//   ZineStoryboard,
// } from '../../generators/scene-generator.js';
import {StoryboardComponent} from './StoryboardComponent.jsx';
import {StoryboardRendererComponent} from './StoryboardRendererComponent.jsx';
import {
  Storyboard,
} from '../../generators/sg-storyboard.js';

import styles from '../../../styles/SceneGenerator.module.css';

//

const SceneGeneratorComponent = () => {
  const [storyboard, setStoryboard] = useState(() => new Storyboard());
  const [panel, setPanel] = useState(null);
  const [panels, setPanels] = useState([]);

  useEffect(() => {
    const paneladd = e => {
      console.log('panel add', storyboard.panels.slice());
      const panel = storyboard.panels[storyboard.panels.length - 1];
      setPanels(storyboard.panels.slice());
      setPanel(panel);
    };
    storyboard.addEventListener('paneladd', paneladd);
    const panelremove = e => {
      const oldPanels = panels;
      const newPanels = storyboard.panels.slice();
      console.log('panel remove', oldPanels, newPanels);
      setPanels(newPanels);

      const {keyPath} = e.data;
      const id = keyPath[keyPath.length - 1]
      console.log('check id', panel.zp.id, id);
      if (panel.zp.id === id) {
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
  const onPanelsLoad = uint8Array => {
    storyboard.clear();
    storyboard.load(uint8Array);

    if (storyboard.panels.length > 0) {
      setPanel(storyboard.panels[0]);
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