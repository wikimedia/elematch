'use strict';

var assert = require('assert');


var ElementMatcher = require('../lib/index');
function id(n) { return n; }
var matcher = new ElementMatcher({
    'test-element': id,
    'foo-bar': id,
});

var testElement = "<test-element foo='bar' baz=\"booz\"><foo-bar></foo-bar><span>hello</span></test-element>";

function innerHTML(s) {
    return s.replace(/^<[^>]+>(.*)<\/[^>]+>$/, '$1');
}

var testDoc = "<doctype html><head><title>hello</title></head>\n"
        + testElement + "<body></body>";

module.exports = {
    "basic matching": {
        "custom element": function() {
            var nodes = matcher.matchAll(testDoc);
            var n0 = nodes[0];
            assert.equal(n0.innerHTML, innerHTML(testElement));
            assert.equal(n0.outerHTML, testElement);
            assert.deepEqual(n0.attributes, {
                foo: 'bar',
                baz: 'booz'
            });
        }
    }
};
