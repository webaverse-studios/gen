import uuidByString from 'uuid-by-string';
import Markdown from 'marked-react';

import styles from '../../styles/Item.module.css'
import {Ctx} from '../../context.js';
import {cleanName} from '../../utils.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';

const Item = ({
  title,
  content,
}) => {
  return (
    <div className={styles.item}>
      <div className={styles.name}>{title}</div>
      <div className={styles.markdown}>
        <Markdown gfm baseURL="">{content}</Markdown>
      </div>
    </div>
  );
};
Item.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/items\/([^\/]*)/);
  let name = match ? match[1] : '';
  name = decodeURIComponent(name);
  name = cleanName(name);

  const c = new Ctx();
  const title = `items/${name}`;
  const id = uuidByString(title);
  const query = await c.databaseClient.getByName('Content', title);
  if (query) {
    const {content} = query;
    return {
      id,
      title,
      content,
    };
  } else {
    const prompt = `\
Generate 50 RPG items. The setting is a high tech anime fantasy world.

# Pistol
## Anime-style pistol with Kanji markings on it. It is early-game starting gear and doesn't do much damage, but it is stealthy and can probably take down a small animal.

# Basiheart
## A mechanical heart that seems to be still beating. It is dark gray in color and has a large port on the back, presumably for attaching it to something. It is a quest item for a quest that has not been implemented yet.

# Target Dummy
## Humanoid target dummy with no arms or legs. It is made of plastic and jumps when you hit it. It's kind of creepy, but also kind of cute. Players use it for target practice when there is are no other players or NPCs around.

# Helm
## Steel helm. It offers good protection for the head, but it is quite heavy and will slow you down. It looks like it can be upgraded and enchanted with a appropriate ingredients. Take it to an NPC specializing in tech or magic upgrades to customize it.

# Rocket Launcher
## Military-style shoulder-mounted rocket launcher. It is very powerful, but is also very loud and will attract attention and hit you with splash damage if you're not careful. Can be used to rocket jump at the cost of HP.

# Torch
## Wooden torch with a cloth wick. It is good for lighting your way in dark places, but if oyu can see the monsters, that means they can see you too. Careful not to start a fire.

# Ball
## Sparkly bouncy ball that makes a cute sound when you throw it. NPCs use it to train their pets, but most players just use it for fun. It can be used as a weapon in a pinch, but the throw damage is very low.

# Pickaxe
## Large, modern heavy steel pickaxe. It can be used to break objects and mine materials in the world. Make sure you pick up the drops! It can be used as a weapon for medium damage. The base pickaxe can be upgraded with various mods that specialize it for mining specific materials at accelerated rates.

# Flower
## Brightly-colored flower that can be found growing in the wild. It can be used to make potions, as a decorative item in your home, or given to another player as a gift. Some NPCs really like flowers so giving them one might get you a quest or discount.

# Hookshot
## Handeld device that fires chain with a grappling hook. Can be used to reach high places, or to pull enemies towards you. Professional player use it to set up combos, but it takes a lot of practice. Not recommended for beginner players.

# Bomb
## A small, round bomb that can be thrown or placed. It will explode after 5 seconds, damaging anything nearby. They can be used to clear obstacles or damage enemies. A bomb that takes damage (either ranged or melee) will explode instantly, so it makes for a good combo with a ranged weapon.

# Eyeblaster
## High-tech neon colored pistol that fires a beam of energy. It is a long-range, single-target weapon that does high damage. It has a very long cooldown, so use it wisely.

# Katana
## A large, sharp sword. It is the traditional weapon of the Japanese samurai. It is very powerful, but also very slow. It can be used to parry enemy attacks and deflect projectiles by pressing guard at the right time.

# Platemail
## A full set of heavy armor. It offers good protection, but it is very slow and will drain your stamina quickly. It is best used by tank classes combined with heavy weapons, or by support classes that don't need to attack but can buff their allies.

# Giant Scissors
## A large pair of scissors. They can be used to cut through objects or as a weapon. They are very slow, but they can hit multiple targets with one swing. They can also be used to cut hair, but only if the person being cut is okay with it.

# Lantern
## A small, handheld lantern with a regenerating oil source. It is a source of light in dark places, but has a short cooldown every 2 minutes to regenerate its oil. When broken, it causes a small area fire.

# Silsword
## A large, curved sword made of a strange blue metal. It is very light and fast, and deals high damage, but doesn't provide much in the way of protection and you need to be up close to use it. Best used by fast characters with high stamina, dodge, and luck stats.

# Chainmail
## A shirt made of interlocking metal rings. Mid-tier armor that offers good protection and is light enough that it won't slow you down too much. It can be futher enchanted with various effects to better suit your needs.

# Gauntlets
## A pair of gloves made of metal or leather. They offer good protection for the hands, but can limit your dexterity. They can be enchanted with various effects to better suit your needs.

# Short Sword
## A small, one-handed sword. It is quick and light, and can be used in one hand so you can equip another item in your off-hand. Paired with a shield, it balances attack and defense. Paired with a gun or spell, it provides a combination of melee and ranged capability. Paired with another sword, it can double your attack rate.

# Rifle
## A large, two-handed gun with a rapid fire rate but relatively high recoil. It is good for medium to long range. When pecked, it can have decent accuracy, but long bursts tend to be spray-and-pray. It can be fitted with a scope for better accuracy at the cost of mobility.

# Potion
A small bottle filled with a glowing liquid. There are many different kinds of potions, each with a different effect. Some restore HP, some give you buffs, some are used for cooking, and some are just for show. Be careful not to drink a poison potion by mistake!

# Tech Gauntlets
## A pair of gauntlets with various tech gadgets built into them. They can be used to hack devices, open locked doors, or give you a +1 to your tech skills. They can also be used in combat for electric damage, but they are not very effective and you are better off using a weapon.

# Power Armor
## A full set of powered armor. It is very bulky and loud, but it gives you +2 to all stats and makes you immune to most damage types. It runs on a battery that needs to be recharged periodically, and if the battery runs out you are stuck in the armor until someone can help you get out.

# Jetpack
## A small, personal jetpack. It gives you the ability to fly for a short period of time, but is very loud and will attract attention. It can be used in combat to dodge enemy attacks or get to high places, but it is not very durable and will break and explode if it takes too much damage.

# Wings
## A pair of wings that give you the ability to fly. They are made of feathers and are very light, and they are also very quiet. However, if you are hit while flying you will be knocked off course, and they cannot take many hits. If your wings are destroyed while flying, expect to take a ton of fall damage.

# Invisibility Cloak
## A cloak that makes you invisible to most players, NPCs, mobs, and pets. It is perfect for sneaking around, but it doesn't work against high tech security cameras or thermal vision. It also doesn't protect you from damage, or area effects like poison. Also, running will de-cloak you temporarily, so it's not super useful in a fight.

# ${name}
##`;

  let description = '';
  const numTries = 5;
  for (let i = 0; i < numTries; i++) {
    description = await c.aiClient.generate(prompt, '\n\n');
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

    const imgUrl = `/api/items/${name}/images/main.png`;

    const content = `\
# ${name}
${description}
![](${encodeURI(imgUrl)})
`;

    await c.databaseClient.setByName('Content', title, content);
    
    return {
      id,
      title,
      content,
    };
  }
};

export default Item;