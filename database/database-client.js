import weaviate from 'weaviate-client';

export class DatabaseClient {
  constructor() {
    /* const weaviateApiKey = process.env.WEAIVATE_API_KEY;
    if (!weaviateApiKey) {
      throw new Error('no weaviate api key found');
    } */
    this.client = weaviate.client({
      scheme: 'http',
      host: 'weaviate-server.webaverse.com',
    });
  }
  async getByName(schema, name) {
    // XXX
  }
  async setByName(schema, name, value) {
    // XXX
  }
}