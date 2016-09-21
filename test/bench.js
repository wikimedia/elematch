'use strict';

var assert = require('assert');
var fs = require('fs');
var assert = require('assert');

var ElementMatcher = require('../index');

var htmlparser2 = require('htmlparser2');
var libxmljs = require("libxmljs");
var domino = require('domino');

function id(n) { return n; }
var figures = 0;
var links = 0;
function figure(n) { figures++; return n; }
function link(n) { links++; return n; }

function bench(filename) {
    console.log('##', filename, '(all links)');
    var obama = fs.readFileSync(filename, 'utf8');
    var startTime = Date.now();
    var linkMatcher = new ElementMatcher({
        'a': link,
    });
    links = 0;
    var n = 200;
    for (var i = 0; i < n; i++) {
        linkMatcher.match(obama);
    }
    console.log(links / n);
    console.log((Date.now() - startTime) / n + 'ms per match');
}

if (!module.parent) {
    bench('test/obama.html');
    bench('test/Main_Page.html');
}
