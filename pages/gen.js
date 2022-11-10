import {useState} from 'react';
import classnames from 'classnames';

import SceneGeneratorComponent from '../src/components/generators/SceneGeneratorComponent.jsx';
import CharacterGeneratorComponent from '../src/components/generators/CharacterGeneratorComponent.jsx';
import ItemGeneratorComponent from '../src/components/generators/ItemGeneratorComponent.jsx';

import styles from '../styles/Gen.module.css';

//

/* const vqaQueries = [
  `is this birds eye view?`,
  `is the viewer looking up at the sky?`,
  `is the viewer looking up at the ceiling?`,
  `how many feet tall is the viewer?`,
]; */

//

const Gen = () => {
  const [tab, setTab] = useState('');

  const _setTab = newTab => () => {
    setTab(newTab);
  };

  return (
    <div className={styles.gen}>
      <div className={styles.tabs}>
        <div className={classnames(
          styles.tab,
          tab === 'sceneGenerator' ? styles.selected : '',
        )} onClick={_setTab('sceneGenerator')}>Scene</div>
        <div className={classnames(
          styles.tab,
          tab === 'characterGenerator' ? styles.selected : '',
        )} onClick={_setTab('characterGenerator')}>Character</div>
        <div className={classnames(
          styles.tab,
          tab === 'itemGenerator' ? styles.selected : '',
        )} onClick={_setTab('itemGenerator')}>Item</div>
      </div>
      {
        (() => {
          switch (tab) {
            case 'sceneGenerator': {
              return <SceneGeneratorComponent />
              break;
            }
            case 'characterGenerator': {
              return <CharacterGeneratorComponent />
              break;
            }
            case 'itemGenerator': {
              return <ItemGeneratorComponent />
            }
            default:
              return null;
          }
        })()
      }
    </div>
  );
};
export default Gen;