import url from 'url';
import {AiServer} from '../../src/servers/ai-server.js'; 

const aiServer = new AiServer();

export default function handler(request, response) {
  aiServer.handleRequest(request, response);
  
  // response.status(200).json({
  //   body: 'Hello content: ' + request.url,
  //   // query: request.query,
  //   // cookies: request.cookies,
  // });
}
