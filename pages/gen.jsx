import {useState, useEffect} from 'react';
import classnames from 'classnames';

import SceneGeneratorComponent from '../src/components/generators/SceneGeneratorComponent.jsx';
import SkyboxGeneratorComponent from '../src/components/generators/SkyboxGeneratorComponent.jsx';
import AvatarGeneratorComponent from '../src/components/generators/AvatarGeneratorComponent.jsx';
import MobGeneratorComponent from '../src/components/generators/MobGeneratorComponent.jsx';
// import CharacterGeneratorComponent from '../src/components/generators/CharacterGeneratorComponent.jsx';
import Item2DGeneratorComponent from '../src/components/generators/Item2DGeneratorComponent.jsx';
import Item3DGeneratorComponent from '../src/components/generators/Item3DGeneratorComponent.jsx';

import CelGeneratorComponent from '../src/components/generators/CelGeneratorComponent.jsx';
import StepGeneratorComponent from '../src/components/generators/StepGeneratorComponent.jsx';
import DocGeneratorComponent from '../src/components/generators/DocGeneratorComponent.jsx';
import NpcGeneratorComponent from '../src/components/generators/NpcGeneratorComponent.jsx';

import TitleScreenComponent from '../src/components/title-screen/TitleScreen.jsx';

import {useRouter} from '../src/generators/router.js';

import styles from '../styles/Gen.module.css';

//

const tabs = [
  {
    tab: 'sceneGenerator',
    label: 'Scene',
  },
  {
    tab: 'skyboxGenerator',
    label: 'Skybox',
  },
  {
    tab: 'metasceneGenerator',
    label: 'Metascene',
  },
  {
    tab: 'titleScreen',
    label: 'Title',
  },
  {
    tab: 'avatarGenerator',
    label: 'Avatar',
  },
  {
    tab: 'celGenerator',
    label: 'Cel',
  },
  {
    tab: 'stepGenerator',
    label: 'Step',
  },
  {
    tab: 'docGenerator',
    label: 'Doc',
  },
  {
    tab: 'npcGenerator',
    label: 'Npc',
  },
  {
    tab: 'mobGenerator',
    label: 'Mob',
  },
  /* {
    tab: 'characterGenerator',
    label: 'Character',
  }, */
  {
    tab: 'item3DGenerator',
    label: 'Item3D',
  },
  {
    tab: 'item2DGenerator',
    label: 'Item2D',
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
            case 'skyboxGenerator': {
              return <SkyboxGeneratorComponent />
            }
            case 'metasceneGenerator': {
              return <MetasceneGeneratorComponent />
            }
            case 'titleScreen': {
              return <TitleScreenComponent />
            }
            case 'avatarGenerator': {
              return <AvatarGeneratorComponent />
            }
            case 'celGenerator': {
              return <CelGeneratorComponent />
            }
            case 'stepGenerator': {
              return <StepGeneratorComponent />
            }
            case 'docGenerator': {
              return <DocGeneratorComponent />
            }
            case 'npcGenerator': {
              return <NpcGeneratorComponent />
            }
            case 'mobGenerator': {
              return <MobGeneratorComponent />
            }
            /* case 'characterGenerator': {
              return <CharacterGeneratorComponent />
            } */
            case 'item2DGenerator': {
              return <Item2DGeneratorComponent />
            }
            case 'item3DGenerator': {
              return <Item3DGeneratorComponent />
            }
            default:
              return null;
          }
        })()
      }
    </div>
  );
};