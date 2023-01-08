import {useState, useEffect} from 'react';
import classnames from 'classnames';

import SceneGeneratorComponent from '../src/components/generators/SceneGeneratorComponent.jsx';
import MetasceneGeneratorComponent from '../src/components/generators/MetasceneGeneratorComponent.jsx';
import AvatarGeneratorComponent from '../src/components/generators/AvatarGeneratorComponent.jsx';
import MobGeneratorComponent from '../src/components/generators/MobGeneratorComponent.jsx';
import CharacterGeneratorComponent from '../src/components/generators/CharacterGeneratorComponent.jsx';
import ItemGeneratorComponent from '../src/components/generators/ItemGeneratorComponent.jsx';

import {useRouter} from '../src/generators/router.js';

import styles from '../styles/Gen.module.css';

//

const tabs = [
  {
    tab: 'sceneGenerator',
    label: 'Scene',
  },
  {
    tab: 'metasceneGenerator',
    label: 'Metascene',
  },
  {
    tab: 'avatarGenerator',
    label: 'Avatar',
  },
  {
    tab: 'mobGenerator',
    label: 'Mob',
  },
  {
    tab: 'characterGenerator',
    label: 'Character',
  },
  {
    tab: 'itemGenerator',
    label: 'Item',
  },
];
const defaultTab = tabs[0].tab;
export const Gen = () => {
  const router = useRouter();
  const [tab, setTab] = useState(() => router.currentTab || defaultTab);

  useEffect(() => {
    const tabchange = e => {
      const newTab = e.data.tab || defaultTab;
      const tabIndex = tabs.findIndex(tab => tab.tab === newTab);
      if (tabIndex !== -1) {
        setTab(newTab);
      }
    };
    router.addEventListener('tabchange', tabchange);

    return () => {
      router.removeEventListener('tabchange', tabchange);
    };
  }, []);

  const _setTab = newTab => () => {
    // console.log('set tab', newTab);
    // setTab(newTab);
    const u = new URL(globalThis.location.href);
    u.search = '';
    u.searchParams.set('tab', newTab);
    router.pushUrl(u.href);
  };

  return (
    <div className={styles.gen}>
      <div className={styles.tabs}>
        {/* <div className={classnames(
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
        )} onClick={_setTab('itemGenerator')}>Item</div> */}
        {tabs.map(t => {
          const {tab: tabName, label} = t;
          return (
            <div
              key={tabName}
              className={classnames(
                styles.tab,
                tab === tabName ? styles.selected : '',
              )}
              onClick={_setTab(tabName)}
            >
              {label}
            </div>
          );
        })}
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