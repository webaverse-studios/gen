import {useState} from 'react';
import {useRef} from 'react';
import {StoryboardGeneratorComponent} from  './StoryboardGeneratorComponent.jsx';
import styles from '../../../styles/StoryboardRenderer.module.css';

export const StoryboardRendererComponent = ({
  storyboard,
  panel,
  onPanelSelect = () => {},
}) => {
  const canvasRef = useRef();

  return (
    <div className={styles.storyboardRenderer}>
      {(() => {
        if (panel) {
          if (panel.isEmpty()) {
            return <StoryboardGeneratorComponent
              storyboard={storyboard}
            />;
          } else {
            <div className={styles.canvasWrap} ref={canvasRef} />
          }
        } else {
          return <div className={styles.panelPlaceholder}>
            <div>Select a panel</div>
            <div>or, <a onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              const panel = storyboard.addPanel();
              onPanelSelect(panel);
            }}>create a new one</a></div>
          </div>
        }
      })()}      
    </div>
  )
};