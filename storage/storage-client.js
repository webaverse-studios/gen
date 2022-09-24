import {Web3Storage} from 'web3.storage';

export class StorageClient {
  constructor() {
    const w3sApiKey = process.env.W3S_API_KEY;
    if (!w3sApiKey) {
      throw new Error('no w3s api key found');
    }
    this.client = new Web3Storage({
      token: w3sApiKey,
    });
  }
  async uploadFile(file) {
    // XXX
  }
  async uploadFiles(file) {
    // XXX
  }
  async downloadFile(hash) {
    // XXX
  }
}