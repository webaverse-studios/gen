import uuidByString from 'uuid-by-string';

import styles from '../../styles/Setting.module.css'
import {Ctx} from '../../context.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';

const Setting = ({
  // url,
  id,
  setting,
  description,
}) => {
  return (
    <div className={styles.setting}>
      <div className={styles.name}>{setting}</div>
      <div className={styles.description}>{description}</div>
    </div>
  );
};
Setting.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/settings\/([^\/]*)/);
  let setting = match ? match[1] : '';
  setting = decodeURIComponent(setting);
  setting = setting.replace(/_/g, ' ');
  setting = capitalizeAllWords(setting);
  
  const c = new Ctx();
  const prompt = `\
Generate 50 anime RPG video game settings.

# Nihon City
A solarpunk city based loosely on a Tokyo, Japan. It is the main city of Zone 0 along the street, which makes it extremely busy. It contains the Citadel, a massive structure which serves as a school for AIs. The scenery is lush and turns neon at night. It is a technological utopia.

# ${setting}
`;

  let description = '';
  const numTries = 5;
  for (let i = 0; i < numTries; i++) {
    description = await c.aiClient.generate(prompt, '# ');
    description = description.trim();
    const descriptionLines = description.split(/\n+/);
    if (descriptionLines.length >= 1) {
      descriptionLines[0] = capitalize(descriptionLines[0]);
      description = descriptionLines.join('\n');
      break;
    } else {
      description = '';
    }
  }
  if (!description) {
    throw new Error('too many retries');
  }
  
  return {
    // url: req.url,
    id: uuidByString(setting),
    setting,
    description,
  };
};

export default Setting;