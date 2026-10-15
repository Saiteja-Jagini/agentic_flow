#!/usr/bin/env node
const { main } = require('../src/cli');

main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error.message);
  process.exitCode = 2;
});
