import {useState} from 'react';
import classnames from 'classnames';

import SceneGeneratorComponent from '../src/components/generators/SceneGeneratorComponent.jsx';
import MetasceneGeneratorComponent from '../src/components/generators/MetasceneGeneratorComponent.jsx';
import AvatarGeneratorComponent from '../src/components/generators/AvatarGeneratorComponent.jsx';
import MobGeneratorComponent from '../src/components/generators/MobGeneratorComponent.jsx';
import CharacterGeneratorComponent from '../src/components/generators/CharacterGeneratorComponent.jsx';
import ItemGeneratorComponent from '../src/components/generators/ItemGeneratorComponent.jsx';

import styles from '../styles/Gen.module.css';

//

export const Gen = () => {
  const [tab, setTab] = useState('sceneGenerator');

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
          tab === 'metasceneGenerator' ? styles.selected : '',
        )} onClick={_setTab('metasceneGenerator')}>Metascene</div>
        <div className={classnames(
          styles.tab,
          tab === 'avatarGenerator' ? styles.selected : '',
        )} onClick={_setTab('avatarGenerator')}>Avatar</div>
        <div className={classnames(
          styles.tab,
          tab === 'mobGenerator' ? styles.selected : '',
        )} onClick={_setTab('mobGenerator')}>Mob</div>
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
            }
            case 'metasceneGenerator': {
              return <MetasceneGeneratorComponent />
            }
            case 'avatarGenerator': {
              return <AvatarGeneratorComponent />
            }
            case 'mobGenerator': {
              return <MobGeneratorComponent />
            }
            case 'characterGenerator': {
              return <CharacterGeneratorComponent />
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