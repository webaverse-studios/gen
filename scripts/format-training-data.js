import path from 'path';
/* import charactersMd from '../../datasets/data/characters.md';
import settingsMd from '../../datasets/data/settings.md';
import itemsMd from '../../datasets/data/items.md';
import cutscenesMd from '../../datasets/data/cutscenes.md';
import chatsMd from '../../datasets/data/chats.md';
import bantersMd from '../../datasets/data/banters.md';
import matchesMd from '../../datasets/data/matches.md'; */
import {capitalizeAllWords, isAllCaps} from '../../utils.js';
import {itemsPromise} from '../../datasets/dataset-specs.js';

//

export default async (req, res) => {
  try {
    const items = await itemsPromise;

    // res.json(items);
    
    // res.send(
    //   items.map(item => _formatItemText(item)).join('\n\n')
    // );
    res.send(
      items.map(item => JSON.stringify(item)).join('\n')
    );
  } catch(err) {
    res.status(500).send(err.stack);
  }
};