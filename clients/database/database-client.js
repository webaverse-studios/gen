// import {AiClient} from './clients/ai/ai-client.js';
// import databaseClient from './clients/database/database-client.js';
import {
  getDatasetSpecs,
  getDatasetItems,
  getTrainingItems,
  getDatasetItemsForDatasetSpec,
} from '../../lore/dataset-engine/dataset-specs.js';
// import {DatasetGenerator} from './lore/dataset-engine/dataset-generator.js';
// import {
//   formatDatasetItems,
//   formatDatasetItemsForPolyfill,
// } from '../../lore/dataset-engine/dataset-parser.js';
import {
  Qdrant,
} from '../../qdrant/index.js';

import getUuid from 'uuid-by-string';
// const uuidV3Hash = s => getUuid(s, 3);
const uuidV5Hash = s => getUuid(s, 5);
// import murmurhash from 'murmurhash';
// const murmurhash3 = murmurhash.v3;

const embeddingDimensions = 1536;

export class DatabaseClient {
  constructor({
    aiClient,
  }) {
    this.aiClient = aiClient;
    
    this.qdrant = new Qdrant('http://localhost:6333/');
  }
  async init() {
    const {
      aiClient,
      qdrant,
    } = this;
    const datasetSpecs = await getDatasetSpecs();

    // console.log('got dataset specs', datasetSpecs);
    // console.log('got dataset items', datasetItems);

    for (let i = 0; i < datasetSpecs.length; i++) {
      const datasetSpec = datasetSpecs[i];
      const {type} = datasetSpec;

      const name = type;

      const schema = {
        "name": name,
        "vectors": {
          "size": embeddingDimensions,
          "distance": "Cosine",
        },
      };

      let delete_result = await qdrant.delete_collection(name);
      if (delete_result.err) {
        console.error(`ERROR:  Couldn't delete "${name}"!`);
        console.error(delete_result.err);
      } else {
        console.log(`Deleted "${name} successfully!"`);
        console.log(delete_result.response);
      }

      /// -------------------------------------------------------------------------
      /// Create the new collection with the name and schema
      let create_result = await qdrant.create_collection(name, schema);
      if (create_result.err) {
        console.error(`ERROR:  Couldn't create collection "${name}"!`);
        console.error(create_result.err);
      } else {
        console.log(`Success! Collection "${name} created!"`);
        console.log(create_result.response);
      }

      /// -------------------------------------------------------------------------
      /// Show the collection info as it exists in the Qdrant engine
      let collection_result = await qdrant.get_collection(name);
      if (collection_result.err) {
        console.error(`ERROR:  Couldn't access collection "${name}"!`);
        console.error(collection_result.err);
      } else {
        console.log(`Collection "${name} found!"`);
        console.log(collection_result.response);
      }

      let datasetItems = await getDatasetItemsForDatasetSpec(datasetSpec);
      datasetItems = datasetItems.slice(0, 8); // XXX
      console.log('create points from', datasetItems);

      // compute points
      const points = [];
      for (let i = 0; i < datasetItems.length; i++) {
        const item = datasetItems[i];
        const itemString = JSON.stringify(item);
        const id = murmurhash3(itemString);
        const vector = await aiClient.embed(itemString);
        // console.log('embed vectors', vector);
        const point = {
          id,
          payload: item,
          vector,
        };
        // console.log('add point', point);
        points.push(point);
      }
      console.log('got points', points);
      // const points = datasetItems.map(item => {
      //   return {
      //     // id: item.id,
      //     payload: item,
      //     vector: item.embedding,
      //   };
      // });
      let upload_points_result = await qdrant.upload_points(name, points);
      console.log('upload points', upload_points_result);
    }
  }
  getId(type, value) {
    const hashKey = value !== undefined ?
      `${type}:${JSON.stringify(value)}`
    :
      (Math.random() + '');
    const uuidHash = uuidV5Hash(hashKey);
    return uuidHash;
  }
  async getItem(id) {
    const points = await this.qdrant.retrieve_points(type, {
      ids: [
        id,
      ],
    });
    console.log('got item', points);
    debugger;
    return points;
  }
  async getItems(ids) {
    const points = await this.qdrant.retrieve_points(type, {
      ids,
    });
    return points;
  }
  async setItem(type, value) {
    const id = this.getId(type, value);
    const vector = await this.aiClient.embed(value);
    await this.qdrant.upload_points(type, [{
      id,
      payload: value,
      vector,
    }]);
    return id;
  }
  async deleteItem(type, id) {
    await this.qdrant.delete_points(type, [
      id,
    ]);
  }
}