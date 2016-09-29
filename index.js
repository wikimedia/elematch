'use strict';

// Shim ReadableStream in node
if (global && !global.ReadableStream) {
    global.ReadableStream = require('node-web-streams').ReadableStream;
}

module.exports = require('./lib/index.js');
