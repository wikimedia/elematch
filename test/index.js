'use strict';

var assert = require('assert');
var fs = require('fs');

var ElementMatcher = require('../lib/index');

function id(n) { return n; }
var figures = 0;
function figure(n) { figures++; return n; }

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
            assert.equal(nodes[0], testHead);
            var n1 = nodes[1];
            assert.equal(n1.innerHTML, innerHTML(customElement));
            assert.equal(n1.outerHTML, customElement);
            assert.deepEqual(n1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz'
            });
            assert.equal(nodes[2], testFooter);
        },
        "figure": function() {
            var testElement = '<figure>foo</figure>';
            var doc = testHead + '<div>' + testElement + '</div>' + testFooter;
            var nodes = matcher.matchAll(doc);
            assert.equal(nodes[0], testHead + '<div>');
            var n1 = nodes[1];
            assert.equal(n1.innerHTML, innerHTML(testElement));
            assert.equal(n1.outerHTML, testElement);
            assert.deepEqual(n1.attributes, {});
            assert.equal(nodes[2], '</div>' + testFooter);
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
