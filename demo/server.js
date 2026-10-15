const { createDemoServer } = require('./application');
const port = Number(process.env.DEMO_PORT || 4173);
const server = createDemoServer(process.env.DEMO_SCENARIO || 'working');
if (require.main === module) server.listen(port, '127.0.0.1', () => console.log(`Demo ready on http://127.0.0.1:${port}`));
module.exports = { server, port, createDemoServer };
