import {
  Qdrant,
} from 'qdrant/index.js';

export class DatabaseClient {
  constructor() {
    this.qdrant = new Qdrant('http://localhost:6333/');
  }
}

/* const name = "pretty_colors";

/// -------------------------------------------------------------------------
/// Create the new collection with the name and schema
const schema = {
    "name":name,
    "vector_size": 3,
    "distance": "Cosine"
};
let create_result = await qdrant.create_collection(name,schema);
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

/// -------------------------------------------------------------------------
/// Upload some points - just five RGB colors
let points = [
    { "id": 1, "payload": {"color": "red"}, "vector": [0.9, 0.1, 0.1] },
    { "id": 2, "payload": {"color": "green"}, "vector": [0.1, 0.9, 0.1] },
    { "id": 3, "payload": {"color": "blue"}, "vector": [0.1, 0.1, 0.9] },
    { "id": 4, "payload": {"color": "purple"}, "vector": [1.0, 0.1, 0.9] },
    { "id": 5, "payload": {"color": "cyan"}, "vector": [0.1, 0.9, 0.8] }
]
let upload_result = await qdrant.upload_points(name,points);
if (upload_result.err) {
    console.error(`ERROR:  Couldn't upload to "${name}"!`);
    console.error(upload_result.err);
} else {
    console.log(`Uploaded to "${name} successfully!"`);
    console.log(upload_result.response);
}

/// -------------------------------------------------------------------------
/// Search the closest color (k=1)
let purplish = [0.8,0.1,0.7];
let search_result = await qdrant.search_collection(name,purplish,1);
if (search_result.err) {
    console.error(`ERROR: Couldn't search ${purplish}`);
    console.error(search_result.err);
} else {
    console.log(`Search results for ${purplish}`);
    console.log(search_result.response);
}


/// -------------------------------------------------------------------------
/// Filtered search the closest color
let filter = {
    "must": [
        { "key": "color", "match": { "keyword": "cyan" } }
    ]
}
let filtered_result = await qdrant.search_collection(name,purplish,1,128,filter);
if (filtered_result.err) {
    console.error(`ERROR: Couldn't search ${purplish} with ${filter}`);
    console.error(filtered_result.err);
} else {
    console.log(`Search results for filtered ${purplish}`);
    console.log(filtered_result.response);
}

/// -------------------------------------------------------------------------
/// Delete the collection
let delete_result = await qdrant.delete_collection(name);
if (delete_result.err) {
    console.error(`ERROR:  Couldn't delete "${name}"!`);
    console.error(delete_result.err);
} else {
    console.log(`Deleted "${name} successfully!"`);
    console.log(delete_result.response);
} */























/* import uuidByString from 'uuid-by-string';
import weaviate from 'weaviate-client';

export class DatabaseClient {
  constructor() {
    this.client = weaviate.client({
      scheme: 'http',
      host: 'weaviate-server.webaverse.com',
    });
  }
  async getByName(className, title) {
    // const id = uuidByString(title);
    const result = await this.client.graphql
      .get()
      .withClassName(className)
      .withFields('title content type')
      .withWhere({
        operator: 'Equal',
        path: [
          'title',
        ],
        valueString: title,
      })
      .do()
    // console.log('got result', JSON.stringify({className, title, result}, null, 2));
    return result?.data?.Get?.[className]?.[0];
  }
  async setByName(className, title, content) {
    const _formatData = (title, content) => {
      if (typeof content === 'string') {
        const match = title.match(/^([^\/]+)\//);
        if (match) {
          const type = match[1];
          // const v = j[k];
          // value.type = type;
          // const match = k.match(/^([^\/]+)/);
          // const type = match?.[1] ?? '';
          // v.type = type;
          return {
            class: className,
            id: uuidByString(title),
            properties: {
              title,
              content,
              type,
            },
          };
        } else {
          return null;
        }
      } else {
        return null;
      }
    };
    const _uploadDatas = async datas => {
      const batcher = this.client.batch.objectsBatcher();
      for (const data of datas) {
        batcher.withObject(data);
      }
      const result = await batcher.do();
      let ok = true;
      for (const item of result) {
        if (item.result.errors) {
          console.warn(item.result.errors);
          ok = false;
        }
      }
      return ok;
    };

    const data = _formatData(title, content);
    if (!data) {
      throw new Error('invalid data');
    }
    const ok = await _uploadDatas([data]);
    if (!ok) {
      throw new Error('failed to upload data');
    }
  }
} */