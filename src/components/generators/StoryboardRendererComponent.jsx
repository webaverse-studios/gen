// import {useState} from 'react';
// import {useRef} from 'react';

import {StoryboardGeneratorComponent} from  './StoryboardGeneratorComponent.jsx';
import {Storyboard3DRendererComponent} from  './Storyboard3DRendererComponent.jsx';
import styles from '../../../styles/StoryboardRenderer.module.css';

export const StoryboardRendererComponent = ({
  storyboard,
  panel,
  onPanelSelect = () => {},
}) => {

  return (
    <div className={styles.storyboardRenderer}>
      {(() => {
        if (panel) {
          if (panel.isEmpty()) {
            return <StoryboardGeneratorComponent
              storyboard={storyboard}
              panel={panel}
            />;
          } else {
          }
        } else {
          return <div className={styles.panelPlaceholder}>
            <div>Select a panel</div>
            <div>or, <a onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              const panel = storyboard.addPanel();
              onPanelSelect(panel);
            }}><b>Create New Panel</b></a></div>
            <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
              const file = e.target.files[0];
              if (file) {
                await storyboard.addPanelFromFile(file);
              }
            }} />Upload File</a></div>
            <div>or, <b>Drag and Drop</b></div>
          </div>
        }
      })()}      
    </div>
  )
};