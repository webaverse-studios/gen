import {useState, useEffect} from 'react';
// import {useRef} from 'react';

import {StoryboardGeneratorComponent} from  './StoryboardGeneratorComponent.jsx';
import {Storyboard2DRendererComponent} from  './Storyboard2DRendererComponent.jsx';
import {Storyboard3DRendererComponent} from  './Storyboard3DRendererComponent.jsx';
import styles from '../../../styles/StoryboardRenderer.module.css';

//

const StoryboardLayerComponent = ({
  storyboard,
  panel,
}) => {
  const [image, setImage] = useState(panel.renders.image);

  const _getImage = () => panel.renders.image;

  useEffect(() => {
    const onrenderupdate = e => {
      setImage(_getImage());
    };
    panel.addEventListener('renderupdate', onrenderupdate);

    setImage(_getImage());

    return () => {
      panel.removeEventListener('renderupdate', onrenderupdate);
    };
  }, [panel]);

  return (
    <div className={styles.layer}>
      <img src={image} className={styles.img} />
    </div>
  );
};

//


const StoryboardPlaceholderComponent = ({
  storyboard,
  onPanelSelect,
}) => {
  // drag and drop
  const dragover = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const drop = async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      const panel = storyboard.addPanelFromFile(file);
      onPanelSelect(panel);
    }
  };

  return (
    <div
      className={styles.panelPlaceholder}
      onDragOver={dragover}
      onDrop={drop}
    >
      <div><a onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        const panel = storyboard.addPanel();
        onPanelSelect(panel);
      }}><b>Create New Panel</b></a></div>
      <div>or, <a className={styles.fileUpload}><input type="file" onChange={async e => {
        const file = e.target.files[0];
        if (file) {
          const panel = await storyboard.addPanelFromFile(file);
          onPanelSelect(panel);
        }
      }} />Upload File</a></div>
      <div>or, <i>Drag and Drop</i></div>
    </div>
    );
}

//

export const StoryboardRendererComponent = ({
  storyboard,
  panel,
  layer,
  onPanelSelect = () => {},
}) => {
  const _getEmpty = () => panel ? panel.isEmpty() : true;
  const _getDimension = () => panel ? panel.getDimension() : 2;
  const [empty, setEmpty] = useState(_getEmpty);
  const [dimension, setDimension] = useState(_getDimension);

  useEffect(() => {
    if (panel) {
      const onrenderupdate = e => {
        setEmpty(_getEmpty());
      };
      panel.addEventListener('renderupdate', onrenderupdate);
      
      setEmpty(_getEmpty());

      return () => {
        panel.removeEventListener('renderupdate', onrenderupdate);
      };
    }
  }, [panel]);

  return (
    <div className={styles.storyboardRenderer}>
      {(() => {
        if (panel) {
          if (empty) {
            return <StoryboardGeneratorComponent
              storyboard={storyboard}
              panel={panel}
            />
          } else {
            if (layer) {
              return <StoryboardLayerComponent
                storyboard={storyboard}  
                panel={panel}
                layer={layer}
              />
            } else {
              if (dimension === 2) {
                return <Storyboard2DRendererComponent
                  storyboard={storyboard}  
                  panel={panel}
                />
              } else if (dimension === 3) {
                return <Storyboard3DRendererComponent
                  storyboard={storyboard}  
                  panel={panel}
                />
              } else {
                throw new Error('invalid dimension: ' + dimension);
              }
            }
          }
        } else {
          return <StoryboardPlaceholderComponent
            storyboard={storyboard}
            onPanelSelect={onPanelSelect}
          />
        }
      })()}      
    </div>
  )
};