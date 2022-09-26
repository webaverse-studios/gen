import uuidByString from 'uuid-by-string';
import {File} from 'web3.storage';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';
import {generateCharacterImage} from '../../generators/image/character.js';

const Character = ({
  // url,
  // id,
  name,
  bio,
  imgUrl,
}) => {
  return (
    <div className={styles.character}>
      <div className={styles.name}>{name}</div>
      <div className={styles.bio}>{bio}</div>
      <img src={imgUrl} className={styles.img} />
    </div>
  );
};
Character.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/characters\/([^\/]*)/);
  let name = match ? match[1] : '';
  name = decodeURIComponent(name);
  name = name.replace(/_/g, ' ');
  name = capitalizeAllWords(name);
  
  const prompt = `\
Generate 50 RPG characters.

# Scillia Doge
## Drop Hunter
Her nickname is Scilly or SLY. 13/F drop hunter. She is an adventurer, swordfighter and fan of potions.

# Drake Silkbourne
## Neural hacker
His nickname is DRK. 15/M hacker. Loves guns. Likes plotting new hacks. He has the best equipment and is always ready for a fight.

# Anemone Sikl
## Lisk Witch
A witch studying to make the best potions. 13/F. She is exceptionally skilled and sells her potions on the black market, but she is very shy.

# Hyacinth Flowers
## Beast Tamer
Scillia's mentor. 15/F beast tamer. She is quite famous. She is known for releasing beasts on her enemies when she get angry.

# Juniper Heartwood
## Academy Engineer
She is an engineer. 17/F engineer. She is new on the street. She has a strong moral compass and it the voice of reason in the group.

# ${name}
##`;

  const c = new Ctx();

  let bio = '';
  const numTries = 5;
  for (let i = 0; i < numTries; i++) {
    bio = await c.aiClient.generate(prompt, '# ');
    bio = bio.trim();
    const bioLines = bio.split(/\n+/);
    if (bioLines.length >= 2) {
      bioLines[0] = bioLines[0]
        .replace(/^"(.+)"$/, '$1')
        .replace(/^'(.+)'$/, '$1');
      bioLines[0] = capitalizeAllWords(bioLines[0]);
      bioLines[1] = capitalize(bioLines[1]);
      bio = bioLines.join('\n');
      break;
    } else {
      bio = '';
    }
  }
  if (!bio) {
    throw new Error('too many retries');
  }

  const imgArrayBuffer = await generateCharacterImage({
    name,
    bio,
  });
  const file = new File([imgArrayBuffer], `${name}.png`);
  const hash = await c.storageClient.uploadFile(file);
  const imgUrl = c.storageClient.getUrl(hash, file.name);

  return {
    // url: req.url,
    id: uuidByString(name),
    name,
    bio,
    imgUrl,
  };
};

export default Character;