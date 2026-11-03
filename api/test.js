function testHandler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, message: 'Vercel serverless works!' }));
}
module.exports = testHandler;
module.exports.default = testHandler;
