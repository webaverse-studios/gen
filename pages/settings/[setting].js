import uuidByString from 'uuid-by-string';
import {File} from 'web3.storage';

import styles from '../../styles/Setting.module.css'
import {Ctx} from '../../context.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';
import {generateSettingsImage} from '../../generators/image/setting.js';
import {ensureUrl} from '../../utils.js';

const Setting = ({
  // url,
  // id,
  name,
  description,
  imgUrl,
}) => {
  return (
    <div className={styles.setting}>
      <div className={styles.name}>{name}</div>
      <div className={styles.description}>{description}</div>
      <img src={imgUrl} className={styles.img} />
    </div>
  );
};
Setting.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/settings\/([^\/]*)/);
  let name = match ? match[1] : '';
  name = decodeURIComponent(name);
  name = name.replace(/_/g, ' ');
  name = capitalizeAllWords(name);
  
  const c = new Ctx();
  const prompt = `\
Generate 50 anime RPG video game locations.

# Nihon City
A solarpunk city based loosely on a Tokyo, Japan. It is the main city of Zone 0 along the street, which makes it extremely busy. It contains the Citadel, a massive structure which serves as a school for AIs. The scenery is lush and turns neon at night. It is a technological utopia.

# ${name}
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

  const imgArrayBuffer = await generateSettingsImage({
    name,
    description,
  });
  const file = new File([imgArrayBuffer], `${name}.png`);
  const hash = await c.storageClient.uploadFile(file);
  const imgUrl = c.storageClient.getUrl(hash, file.name);
  await ensureUrl(imgUrl);
  
  return {
    // url: req.url,
    id: uuidByString(name),
    name,
    description,
    imgUrl,
  };
};

export default Setting;