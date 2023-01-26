export default function handler(request, response) {
  response.status(200).json({
    body: 'Hello serverless',
    // query: request.query,
    // cookies: request.cookies,
  });
}
