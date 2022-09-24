// const args = process.argv;
// if the first arg contains 'sk-' then it's the openai key
// otherwise it's the name of the test to run

/* const test =
  (!args[2]?.includes("sk-") && args[2]) ||
  (!args[3]?.includes("sk-") && args[3]) ||
  "all"; */

/* const testData = {
  locations: [
    {
      name: "Scillia's Treehouse",
      description: `\
It's more of a floating island but they call it a tree house. Inside the treehouse lives a monster, the Lisk, which is an advanced AI from far up the Street.`,
    },
    {
      name: "Volcano",
      description: `\
It's so dark and hot around, your bones will melt if you approach a lot`,
    },
  ],
  npcs: [
    {
      name: `bricks`,
      description: `(13/M dealer. He mostly deals things that are not drugs, like information and AI seeds.): Toxins are the Devil's Food! But sometimes they can be good for you, if you know what I mean? That's a drug reference, but I wouldn't expect you to get that unless you were on drugs. By the way you want some?
      (onselect: I don't do drugs, but I know someone who does. Let me introduce you to my friend Bricks.)`,
      Inventory: [
        {
          name: `sword`,
          description: `A rusty old sword.`,
          metadata: `Damage: 20, Element: fire`,
        },
      ],
    },
    {
      name: `artemis`,
      description: `(15/F pet breeder. She synthesizes pet animals by combining their neural genes.): Do you ever wonder why we keep pets on leashes? I mean they are technically AIs, so we could reprogram them to not need leashes. But someone somewhere decided that leashes were the prettier choice. Life is nice. (onselect: Bless the hearts of the birds, because they paint the sky.)`,
      Inventory: [
        {
          name: `pistol`,
          description: `Basic pistol.`,
        },
      ],
    },
    {
      name: `bailey`,
      description: `(13/F black witch. She is smart, reserved, and studious, but has a dark side to her.): Listen up, if you need quality potions, I'm your ma'am, ma'am. Yes I may be a witch but that doesn't mean I'm not a lady. I'll take your money and turn it into something magical. Just don't anger me, or you'll be a tree. (onselect: Witchcraft is not a sin. It's a science.)`,
      Inventory: [
        {
          name: `bow`,
          description: `A basic bow. It looks like something rambo would use.`,
        },
      ],
    },
  ],
  party: [
    {
      name: `scillia`,
      description: `Her nickname is Scilly or SLY. 13/F drop hunter. She is an adventurer, swordfighter and fan of potions. She is exceptionally skilled and can go Super Saiyan.`,
      Inventory: [
        {
          name: `sword`,
          description: `A rusty old sword.`,
          metadata: `Damage: 20, Element: fire`,
        },
      ],
    },
    {
      name: `drake`,
      description: `His nickname is DRK. 15/M hacker. Loves guns. Likes plotting new hacks. He has the best equipment and is always ready for a fight.`,
      Inventory: [
        {
          name: `pistol`,
          description: `Basic pistol.`,
        },
      ],
    },
    {
      name: `hyacinth`,
      description: `Also known as Hya. 15/F beast tamer. Influencer famous for her pets, and friend of Scillia's. She is really bad in school but the richest one in the group.`,
      Inventory: [
        {
          name: `bow`,
          description: `A basic bow. It looks like something rambo would use.`,
        },
      ],
    },
  ],
  objects: [
    {
      name: `chair`,
      description: `A silver chair from long ago.`,
      metadata: `Color: #FF8080`,
    },
    {
      name: `mirror`,
      description: `A shiny new mirror. I bet my outfit looks great in it!`,
    },
    {
      name: `desk`,
      description: `A desk. Not much on it`,
    },
    {
      name: `laptop`,
      description: `A laptop. It's a Macbook Pro.`,
    },
  ],
  mobs: [
    {
      name: `zombie`,
      description: `Standard slow zombie. Usually travels in a horde.`,
    },
    {
      name: `skeleton`,
      description: `Standard skeleton, wielding a sword and broken wooden shield.`,
    },
    {
      name: `spider`,
      description: `A giant spider. Probably poisonous.`,
    },
    {
      name: `liskborn`,
      description: `The Lisk says its nothing but the neighbors are starting to complain about the pests.`,
    },
    {
      name: `witch`,
      description: `A witch. She is a powerful witch. Probably best not to mess with her.`,
    },
  ],
  messages: [
    {
      speaker: "scillia",
      message: "Hey, I found a sword. It looks rusty but it might be useful.",
    },
  ],
}; */

export function makeGenerateFn() {
  function getOpenAIKey() {
    const key = process.env.OPENAI_KEY;
    if (!key) {
      return console.error("No openai key found");
    }
    return key;
  }
  async function query(openai_api_key, params = {}) {
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(openai_api_key),
      },
      body: JSON.stringify(params),
    };
    try {
      const response = await fetch(
        "https://api.openai.com/v1/completions",
        requestOptions
      );
      if (response.status !== 200) {
        console.log(response.statusText);
        console.log(response.status);
        console.log(await response.text());
        return "";
      }

      const data = await response.json();
      console.log("choices:", data.choices);
      return data.choices[0]?.text;
    } catch (e) {
      console.log(e);
      return "returning from error";
    }
  }
  async function openaiRequest(key, prompt, stop/*, needsRepetition*/) {
    return await query(key, {
      model: 'text-davinci-002',
      prompt,
      stop,
      top_p: 1,
      // frequency_penalty: needsRepetition ? 0.1 : 0.4,
      // presence_penalty: needsRepetition ? 0.1 : 0.4,
      temperature: 0.85,
      max_tokens: 256,
      best_of: 1,
    });
  }
  const openAiKey = getOpenAIKey();
  
  return async (prompt, stop/*, needsRepetition = true*/) => {
    return await openaiRequest(openAiKey, prompt, stop/*, needsRepetition*/);
  };
}