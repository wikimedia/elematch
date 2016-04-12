'use strict';

var assert = require('assert');
var fs = require('fs');
var assert = require('assert');

var ElementMatcher = require('../lib/index');

var htmlparser2 = require('htmlparser2');
var libxmljs = require("libxmljs");
var domino = require('domino');

function id(n) { return n; }
var figures = 0;
var links = 0;
function figure(n) { figures++; return n; }
function link(n) { links++; return n; }

function bench() {
    var obama = fs.readFileSync('test/obama.html', 'utf8');
    var startTime = Date.now();
    var linkMatcher = new ElementMatcher({
        'a': link,
    });
    var n = 200;
    for (var i = 0; i < n; i++) {
        linkMatcher.matchAll(obama);
    }
    console.log(links / n);
    console.log((Date.now() - startTime) / n + 'ms per match');
}

if (!module.parent) {
    bench();
}
