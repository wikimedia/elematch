'use strict';

var assert = require('assert');
var fs = require('fs');

var ElementMatcher = require('../lib/index');

function id(n, prefix) { return n; }
var figures = 0;
function figure(n, prefix) { figures++; return n; }

var matcher = new ElementMatcher({
    'test-element': id,
    'foo-bar': id,
    'figure': figure,
});

function innerHTML(s) {
    return s.replace(/^<[^>]+>(.*)<\/[^>]+>$/, '$1');
}

var testHead = "<doctype html><head><title>hello</title></head>\n";
var testFooter = "<body></body>";
var customElement = "<test-element foo='bar <figure >' baz=\"booz\">"
            + "<foo-bar></foo-bar><figure>hello</figure></test-element>";

var testDoc = testHead + customElement + testFooter;

module.exports = {
    "basic matching": {
        "custom element": function() {
            var nodes = matcher.matchAll(testDoc);
            var n0 = nodes[0];
            assert.equal(n0.innerHTML, innerHTML(customElement));
            assert.equal(n0.outerHTML, customElement);
            assert.deepEqual(n0.attributes, {
                foo: 'bar <figure >',
                baz: 'booz'
            });
        },
        "figure": function() {
            var testElement = '<figure>foo</figure>';
            var doc = testHead + '<div>' + testElement + '</div>' + testFooter;
            var nodes = matcher.matchAll(doc);
            var n0 = nodes[0];
            assert.equal(n0.innerHTML, innerHTML(testElement));
            assert.equal(n0.outerHTML, testElement);
            assert.deepEqual(n0.attributes, {});
        }
    },
    "performance": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 20;
            for (var i = 0; i < n; i++) {
                matcher.matchAll(obama);
            }
            console.log(figures);
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    }
};

//module.exports.performance.Obama();
