import {useEffect} from 'react';
import styles from '../../../styles/Storyboard.module.css';

const StoryboardPanel = ({
  panel,
}) => {
  return (
    <div className={styles.panel}>
      Panel
    </div>  
  );
};

export const StoryboardComponent = ({
  storyboard,
  panel,
  panels,
}) => {
  // const [items, setItems] = useState([]);

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
      {panels.map(panel => (
        <StoryboardPanel
          panel={panel}
        />
      ))}
    </div>
  )
};