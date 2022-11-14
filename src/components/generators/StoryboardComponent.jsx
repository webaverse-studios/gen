import {useState, useEffect} from 'react';
import classnames from 'classnames';

import {PlaceholderImg} from '../placeholders/PlaceholderImg.jsx';
import {BlobRenderer} from '../renderers/BlobRenderer.jsx';
import styles from '../../../styles/Storyboard.module.css';

//

import {mainImageKey} from '../../generators/scene-generator.js';

//

const StoryboardPanel = ({
  storyboard,
  panel,
  selected,
  onClick,
}) => {
  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);
  const [busyMessage, setBusyMessage] = useState(panel ? panel.getBusyMessage() : '');
  const _getImage = () => panel.getData(mainImageKey);
  const [image, setImage] = useState(_getImage);

  // image handling
  useEffect(() => {
    if (panel) {
      const onupdate = e => {
        setImage(_getImage());
      };
      panel.addEventListener('update', onupdate);

      return () => {
        panel.removeEventListener('update', onupdate);
      };
    }
  }, [panel, busy, image]);

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
      panel.setFile(file);
    }
  };

  return (
    <div
      className={classnames(styles.panel, selected ? styles.selected : null)}
      onClick={onClick}
      onDragOver={dragover}
      onDrop={drop}
    >
      {(() => {
        if (busy) {
          return (
            <PlaceholderImg className={classnames(styles.img, styles.icon)} />
          );
        } else if (image) {
          return (
            <BlobRenderer srcObject={image} className={styles.img} />
          );
        } else {
          return (
            <div className={styles.placeholder}>
              <img src='/images/missing-file.svg' className={classnames(styles.img, styles.icon)} />
            </div>
          );
        }
      })()}
    </div>  
  );
};

//

const StoryboardPanelPlaceholder = ({
  onClick,
}) => {
  return (
    <div className={classnames(styles.panel, styles.add)} onClick={onClick}>
      <img src="/images/plus.svg" className={classnames(styles.img, styles.icon)} />
    </div>
  );
}

//

export const StoryboardComponent = ({
  storyboard,
  panel,
  panels,
  onPanelSelect,
}) => {
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
      await storyboard.addPanelFromFile(file);
    }
  };

  return (
    <div
      className={styles.storyboard}
      onDragOver={dragover}
      onDrop={drop}
    >
      {panels.map((p, i) => (
        <StoryboardPanel
          storyboard={storyboard}
          panel={p}
          selected={p === panel}
          onClick={e => {
            onPanelSelect(p);
          }}
          key={p.id}
        />
      ))}
      <StoryboardPanelPlaceholder
        onClick={e => {
          const panel = storyboard.addPanel();
          onPanelSelect(panel);
        }}
      />
    </div>
  )
};