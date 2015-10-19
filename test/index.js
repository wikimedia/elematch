'use strict';

var assert = require('assert');

var ElementMatcher = require('../lib/index');

function id(n) { return n; }

var matcher = new ElementMatcher({
    'test-element': id,
    'foo-bar': id,
    'span': id,
});

function innerHTML(s) {
    return s.replace(/^<[^>]+>(.*)<\/[^>]+>$/, '$1');
}

var testHead = "<doctype html><head><title>hello</title></head>\n";
var testFooter = "<body></body>";
var customElement = "<test-element foo='bar' baz=\"booz\">"
            + "<foo-bar></foo-bar><span>hello</span></test-element>";

var testDoc = testHead + customElement + testFooter;

module.exports = {
    "basic matching": {
        "custom element": function() {
            var nodes = matcher.matchAll(testDoc);
            var n0 = nodes[0];
            assert.equal(n0.innerHTML, innerHTML(customElement));
            assert.equal(n0.outerHTML, customElement);
            assert.deepEqual(n0.attributes, {
                foo: 'bar',
                baz: 'booz'
            });
        },
        "span": function() {
            var testElement = '<span>foo</span>';
            var doc = testHead + '<div>' + testElement + '</div>' + testFooter;
            var nodes = matcher.matchAll(doc);
            var n0 = nodes[0];
            assert.equal(n0.innerHTML, innerHTML(testElement));
            assert.equal(n0.outerHTML, testElement);
            assert.deepEqual(n0.attributes, {});
        }
    }
};
