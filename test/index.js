'use strict';

var assert = require('assert');


var ElementMatcher = require('../lib/index');
var matcher = new ElementMatcher({
    'test-element': function(node) {
        return node;
    }
});

var testDoc = "<doctype html><head><title>hello</title></head>\n"
        + "<body><test-element foo='bar' baz=\"booz\"><span>hello</span></test-element></body>";

module.exports = {
    "basic matching": {
        "custom element": function() {
            var nodes = matcher.matchAll(testDoc);
            var n0 = nodes[0];
            //assert.equal(n0.innerHTML, '<span>hello</span>');
            assert.equal(n0.outerHTML, "<test-element foo='bar' baz=\"booz\"><span>hello</span></test-element>");
            //assert.deepEqual(n0.attributes, {
            //    foo: 'bar',
            //    baz: 'booz'
            //});
        }
    }
};
