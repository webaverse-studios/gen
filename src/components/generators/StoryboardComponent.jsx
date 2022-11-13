import {useEffect} from 'react';
import classnames from 'classnames';
import styles from '../../../styles/Storyboard.module.css';

//

const StoryboardPanel = ({
  panel,
  selected,
  onClick,
}) => {
  return (
    <div
      className={classnames(styles.panel, selected ? styles.selected : null)}
      onClick={onClick}
    >
      {panel.renders.image ?
        <img src={panel.renders.image} className={styles.img} />
      :
        <div className={styles.placeholder}></div>
      }
    </div>  
  );
};

//

const StoryboardPanelPlaceholder = ({
  onClick,
}) => {
  return (
    <div className={classnames(styles.panel, styles.add)} onClick={onClick}>
      <img src="/images/plus.svg" className={styles.img} />
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
  useEffect(() => {
    const dragover = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragover', dragover);
    const drop = async e => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      const file = files[0];
      if (file) {
        await storyboard.addPanelFromFile(file);
      }
    };
    document.addEventListener('drop', drop);

    return () => {
      document.removeEventListener('dragover', dragover);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={styles.storyboard}>
      {panels.map((p, i) => (
        <StoryboardPanel
          panel={p}
          selected={p === panel}
          onClick={e => {
            onPanelSelect(p);
          }}
          key={i}
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