// import {useRouter} from 'next/router'
import uuidByString from 'uuid-by-string';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';

const Character = ({
  // url,
  id,
  character,
  bio,
}) => {
  return (
    <div className={styles.character}>
      <div className={styles.name}>{character}</div>
      <div className={styles.bio}>{bio}</div>
    </div>
  );
};
Character.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/characters\/([^\/]*)/);
  let character = match ? match[1] : '';
  character = decodeURIComponent(character);
  character = character.replace(/_/g, ' ');
  character = capitalizeAllWords(character);
  
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

# ${character}
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

  return {
    // url: req.url,
    id: uuidByString(character),
    character,
    bio,
  };
};

export default Character;