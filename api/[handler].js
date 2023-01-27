export default function handler(request, response) {
  response.status(200).json({
    body: 'Hello root handler: ' + request.url,
    // query: request.query,
    // cookies: request.cookies,
  });
}
