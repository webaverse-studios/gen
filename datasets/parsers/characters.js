import {Dataset} from './datasets.js';

const characters = new Dataset({
  prefix: `Generate 50 video game RPG NPC characters.`,
  items: [
    `\
# Scillia Doge
## Class: Drop Hunter
Her nickname is Scilly or SLY. 13/F drop hunter. She is an adventurer, swordfighter and fan of potions.
`,
`# Drake Silkbourne
## Class: Neural hacker
His nickname is DRK. 15/M hacker. Loves guns. Likes plotting new hacks. He has the best equipment and is always ready for a fight.
`,
`# Anemone Sikl
## Class: Lisk Witch
A witch studying to make the best potions. 13/F. She is exceptionally skilled and sells her potions on the black market, but she is very shy.
`,
`# Hyacinth Flowers
## Class: Beast Tamer
Scillia's mentor. 15/F beast tamer. She is quite famous. She is known for releasing beasts on her enemies when she get angry.
`,
`# Juniper Heartwood
## Class: Academy Engineer
She is an engineer. 17/F engineer. She is new on the street. She has a strong moral compass and it the voice of reason in the group.
`
  ],
  parse: s => {
    const match = s.match(/^# (.*)\n## Class: (.*)\n(.*)/);
    if (match) {
      const [_, name, className, bio] = match;
      return {
        name,
        '## Class: ': className,
        '': bio,
      };
    } else {
      return match;
    }
  },
});
export default characters;