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
    return await this.client.put([file]);
  }
  async uploadFiles(files) {
    return await this.client.put(files);
  }
  async downloadFile(hash) {
    // XXX
  }
  getUrl(hash, name) {
    return `https://w3s.link/ipfs/${hash}/${name}`;
  }
}