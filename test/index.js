'use strict';

var assert = require('assert');
var fs = require('fs');
var assert = require('assert');
const ReadableStream = require('node-web-streams').ReadableStream;

var ElementMatcher = require('../index');

var htmlparser2 = require('htmlparser2');
var libxmljs = require("libxmljs");
var domino = require('domino');

function id(n) { return n; }
var figures = 0;
var links = 0;
function figure(n) { figures++; return n; }
function link(n) { links++; return n; }

// XML enscaping rules: https://www.w3.org/TR/xml/#syntax

const matcher = new ElementMatcher({
    'test-element': id,
    'foo-bar': id,
    'figure': figure,
});

const streamMatcher = new ElementMatcher([
    {
        selector: {
            nodeName: 'test-element',
            attributes: [
                {
                    name: 'baz',
                    operator: '=',
                    value: 'booz baax boooz'
                }
            ]
        },
        handler: id,
        stream: true,
    }
]);
const bodyMatcher = new ElementMatcher([
    {
        selector: {
            nodeName: 'body',
        },
        handler: id,
        stream: true,
    }
], {
    matchOnly: true
});

function streamToText(stream) {
    let res = '';
    const reader = stream.getReader();
    function pump() {
        return reader.read()
        .then(readRes => {
            if (readRes.done) {
                return res;
            }
            res += readRes.value;
            return pump();
        });
    }
    return pump();
}

var referencesMatcher = new ElementMatcher({
    'ol[typeof="mw:Extension/references"]': link,
});

function innerHTML(s) {
    return s.replace(/^<[^>]+>(.*)<\/[^>]+>$/, '$1');
}

var testHead = "<doctype html><head><title>hello</title></head><body>\n";
var testFooter = "</body>";
var customElement = "<test-element foo='bar &lt;figure &gt;' baz=\"booz baax boooz\">"
            + "<foo-bar></foo-bar><figure>hello</figure></test-element>";

var testDoc = testHead + customElement + testFooter;
var docWithOverMatch = testHead + customElement + '<div class="a"></div>' + testFooter;
module.exports = {
    "basic matching": {
        "custom element": function() {
            const match = matcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "figure": function() {
            var testElement = '<figure>foo</figure>';
            var doc = testHead + '<div>' + testElement + '</div>' + testFooter;
            const match = matcher.match(doc);
            const matches = match.values;
            assert.equal(matches[0], testHead + '<div>');
            const m1 = matches[1];
            assert.equal(m1.innerHTML, 'foo');
            assert.equal(m1.outerHTML, testElement);
            assert.deepEqual(m1.attributes, {});
            assert.equal(matches[2], '</div>' + testFooter);
        },
        "doesn't overmatch attributes": function() {
            const match = matcher.match(docWithOverMatch);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], '<div class="a"></div>'+ testFooter);
        },
    },
    "stream matching": {
        "ReadableStream innerHTML / outerHTML": function() {
            const matches = streamMatcher.match(testDoc).values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            if (!(m1.innerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            if (!(m1.outerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            assert.equal(matches[2], testFooter);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            return streamToText(m1.outerHTML)
            .then(outerHTML => {
                assert.equal(outerHTML, customElement);
                return streamToText(m1.innerHTML);
            })
            .then(innerHTML => {
                assert.equal(innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            });
        },
        "ReadableStream innerHTML / outerHTML, chunked writing": function() {
            const firstHalf = testDoc.slice(0, 120);
            const secondHalf = testDoc.slice(120);
            const matches = streamMatcher.match(firstHalf).values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            if (!(m1.innerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            if (!(m1.outerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            const secondMatches = streamMatcher.match(secondHalf).values;
            assert.equal(secondMatches[0], testFooter);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            return streamToText(m1.outerHTML)
            .then(outerHTML => {
                assert.equal(outerHTML, customElement);
                return streamToText(m1.innerHTML);
            })
            .then(innerHTML => {
                assert.equal(innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            });
        },
        "streaming body matching": function() {
            const firstHalf = testDoc.slice(0, 120);
            const secondHalf = testDoc.slice(120);
            const matches = bodyMatcher.match(firstHalf).values;
            const m0 = matches[0];
            if (!(m0.innerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            if (!(m0.outerHTML instanceof ReadableStream)) {
                throw new Error("Expected ReadableStream!");
            }
            const secondMatch = bodyMatcher.match(secondHalf);
            assert.deepEqual(secondMatch, { values: [], done: true });
            return streamToText(m0.outerHTML)
            .then(outerHTML => {
                assert.equal(outerHTML, '<body>\n' + customElement + '</body>');
                return streamToText(m0.innerHTML);
            })
            .then(innerHTML => {
                assert.equal(innerHTML, '\n' + customElement);
            });
        },
    },
    "incomplete buffer": {
        "custom element": function() {
            const truncatedCustomElement = customElement.substr(0, customElement.length - 2);
            var doc = testHead + truncatedCustomElement;
            const match = matcher.match(doc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            if (matches.length > 1) {
                throw new Error("Found more matches than expected!");
            }
            assert.equal(match.done, false);
            const finalMatch = matcher.match(customElement.slice(-2) + '<div class="a"></div>' + testFooter);
            const fm0 = finalMatch.values[0];
            assert.equal(fm0.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(fm0.outerHTML, customElement);
            assert.deepEqual(fm0.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(finalMatch.values[1], '<div class="a"></div>' + testFooter);
        },
        "incomplete other tag, after tag name": function() {
            matcher.reset();
            var testElement = '<figure>foo</figure>';
            var doc = testHead + '<div>' + testElement + '</div><othertag ';
            const match = matcher.match(doc);
            const matches = match.values;
            assert.equal(matches[0], testHead + '<div>');
            const m1 = matches[1];
            assert.equal(m1.innerHTML, 'foo');
            assert.equal(m1.outerHTML, testElement);
            assert.deepEqual(m1.attributes, {});
            assert.equal(match.done, false);
            const finalMatch = matcher.match('foo="bar"></othertag></body>');
            assert.equal(finalMatch.values[0], '<othertag foo="bar"></othertag></body>');
            assert.equal(finalMatch.done, true);
        },
        "incomplete other tag, in attribute": function() {
            matcher.reset();
            var testElement = '<figure>foo</figure>';
            var doc = testHead + '<div>' + testElement + '</div><othertag foo="bar';
            const match = matcher.match(doc);
            const matches = match.values;
            assert.equal(matches[0], testHead + '<div>');
            const m1 = matches[1];
            assert.equal(m1.innerHTML, 'foo');
            assert.equal(m1.outerHTML, testElement);
            assert.deepEqual(m1.attributes, {});
            assert.deepEqual(matches[2], '</div>');
            assert.equal(match.done, false);
            const finalMatch = matcher.match('"></othertag></body>');
            assert.equal(finalMatch.values[0], '<othertag foo="bar"></othertag></body>');
            assert.equal(finalMatch.done, true);
        },
    },
    'presence': {
        "attribute presence": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "attribute presence, no match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[bar]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
    },
    'equality': {
        "match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo="bar <figure >"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "no value match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo="boo"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[bar="booz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
    },
    'prefix': {
        "match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo^="bar <figure"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "no value match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo^="boo"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[bar^="booz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
    },
    'space-delimited attribute': {
        "match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo~="bar"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "match, middle": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[baz~="baax"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "match, end": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[baz~="boooz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "no value match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo~="boo"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[bar~="booz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
    },
    'suffix': {
        "match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo$="figure >"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "another match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[baz$=" boooz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testHead);
            const m1 = matches[1];
            assert.equal(m1.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            assert.equal(m1.outerHTML, customElement);
            assert.deepEqual(m1.attributes, {
                foo: 'bar <figure >',
                baz: 'booz baax boooz'
            });
            assert.equal(matches[2], testFooter);
        },
        "no value match": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[foo$="figure"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
        "space-delim attribute match, no attribute of name": function() {
            const attribMatcher = new ElementMatcher({
                'test-element[bar~="boooz"]': id,
            });
            const match = attribMatcher.match(testDoc);
            const matches = match.values;
            assert.equal(matches[0], testDoc);
        },
    },
    "performance, figures": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            figures = 0;
            var n = 200;
            for (var i = 0; i < n; i++) {
                matcher.match(obama);
            }
            console.log(figures);
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, links": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            links = 0;
            var startTime = Date.now();
            var linkMatcher = new ElementMatcher({
                'a': link,
            });
            var n = 100;
            for (var i = 0; i < n; i++) {
                linkMatcher.match(obama);
            }
            console.log(links / n);
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, specific link": {
        "Obama": function() {
            var specificLinkMatcher = new ElementMatcher({
                'a[href="./Riverdale,_Chicago"]': link,
            });
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 50;
            for (var i = 0; i < n; i++) {
                specificLinkMatcher.match(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, references": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 100;
            for (var i = 0; i < n; i++) {
                referencesMatcher.match(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, htmlparser2 Default": {
        "Obama": function() {
            var handler = new htmlparser2.DefaultHandler();
            var parser = new htmlparser2.Parser(handler);
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                parser.parseComplete(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');

        }
    },
    "performance, htmlparser2 DOM": {
        "Obama": function() {
            var handler = new htmlparser2.DomHandler();
            var parser = new htmlparser2.Parser(handler);
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                parser.parseComplete(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');

        }
    },
    "performance, htmlparser2 DOM round-trip": {
        "Obama": function() {
            var dom;
            var handler = new htmlparser2.DomHandler(function(err, res) {
                dom = res;
            });
            var parser = new htmlparser2.Parser(handler);
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                parser.parseComplete(obama);
                htmlparser2.DomUtils.getOuterHTML(dom);
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');

        }
    },
    "performance, libxml DOM parse": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                libxmljs.parseXml(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');
        }
    },
    "performance, libxml DOM round-trip": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                var doc = libxmljs.parseXml(obama);
                doc.toString();
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');
        }
    },
    "performance, domino DOM parse": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                var doc = domino.createDocument(obama);
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');
        }
    },
    "performance, domino DOM round-trip": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 10;
            for (var i = 0; i < n; i++) {
                var doc = domino.createDocument(obama);
                var html = doc.outerHTML;
            }
            console.log((Date.now() - startTime) / n + 'ms per parse');
        }
    },
};

//module.exports.performance.Obama();
