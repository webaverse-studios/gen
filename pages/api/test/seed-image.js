// import {createCanvas, loadImage} from 'canvas';
import {createSeedImage} from '../../canvas/seed-image.js';

/* character = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 128, 1, 256],
  promptFn() {
    return `anime style video game character concept, full body, ${highlightString} on ${artPlatformsStrings.character}`;
  },
})
backpack = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 128, 1, 256],
  promptFn(name = 'backpack') {
    return `video game item concept render, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
sword = this.#makeSeededMethod({
  seedArgs: [512, 512, 32, 128, 1, 256, {
    // monochrome: true,
  }],
  promptFn(name = 'huge sword') {
    return `video game item concept render, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
rifle = this.#makeSeededMethod({
  seedArgs: [512, 512, 128, 64, 1, 256],
  promptFn(name = 'rifle') {
    return `video game item concept art render, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
pistol = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 64, 1, 256],
  promptFn(name = 'pistol') {
    return `video game item concept art render, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
potion = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 64, 1, 256],
  promptFn(name = 'potion') {
    return `video game item concept art render, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
chestArmor = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 128, 1, 256],
  promptFn(name = 'chest armor') {
    return `video game item concept art, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
legArmor = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 128, 1, 256],
  promptFn(name = 'leg armor') {
    return `video game item concept art, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
helmet = this.#makeSeededMethod({
  seedArgs: [512, 512, 64, 64, 1, 256],
  promptFn(name = 'helmet') {
    return `video game item concept art, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
location = this.#makeUnseededMethod({
  promptFn(name = 'magical jungle') {
    return `anime style video game location concept art, screenshot, without text, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
})
map = this.#makeUnseededMethod({
  promptFn(name = 'sakura forest') {
    return `anime style map page side render, without text, ${highlightString} on ${artPlatformsStrings.item}, ${name}`;
  },
}) */

// /api/seed-image?args=[512, 512, 64, 128, 1, 256]

/*
// character: [512, 512, 64, 128, 1, 256]
// backpack: [512, 512, 64, 128, 1, 256]
// sword: [512, 512, 32, 128, 1, 256]
// rifle: [512, 512, 128, 64, 1, 256]
// pistol: [512, 512, 64, 64, 1, 256]
// potion: [512, 512, 64, 64, 1, 256]
// chestArmor: [512, 512, 64, 128, 1, 256]
// legArmor: [512, 512, 64, 128, 1, 256]
// helmet: [512, 512, 64, 64, 1, 256]
// location: [512, 512, 64, 64, 1, 256]
// map: [512, 512, 64, 64, 1, 256]
*/

const CanvasImage = async (req, res) => {
  const {args} = req.query;

  if (args) {
    try {
      const argsJson = JSON.parse(args);

      const canvas = createSeedImage.apply(null, argsJson);

      /* const size = 256;
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#F00';
      ctx.fillRect(0, 0, size, size); */

      res.setHeader('Content-Type', 'image/png');
      canvas.createPNGStream().pipe(res);
    } catch(err) {
      console.warn(err);
      res.send(err.stack)
    }
  } else {
    res.send(400);
  }
};
export default CanvasImage;