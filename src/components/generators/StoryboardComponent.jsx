import {useState, useEffect} from 'react';
import classnames from 'classnames';

import {PlaceholderImg} from '../placeholders/PlaceholderImg.jsx';
import styles from '../../../styles/Storyboard.module.css';

//

const StoryboardPanel = ({
  storyboard,
  panel,
  selected,
  onClick,
}) => {
  const [busy, setBusy] = useState(panel ? panel.isBusy() : false);
  const [image, setImage] = useState(panel.renders.image);

  // event handling
  useEffect(() => {
    if (panel) {
      const onbusyupdate = e => {
        setBusy(e.data.busy);
      };
      panel.addEventListener('busyupdate', onbusyupdate);
      const onrenderupdate = e => {
        const {key, value} = e.data;
        if (key === 'image') {
          setImage(value);
        }
      };
      panel.addEventListener('renderupdate', onrenderupdate);

      return () => {
        panel.removeEventListener('busyupdate', onbusyupdate);
        panel.removeEventListener('renderupdate', onrenderupdate);
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
            <img src={image} className={styles.img} />
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