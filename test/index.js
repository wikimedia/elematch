'use strict';

var assert = require('assert');
var fs = require('fs');
var assert = require('assert');
const webstreams = require('node-web-streams');
const streamUtil = require('web-stream-util');

const htmlStream = require('../index');
const HTMLTransformReader = htmlStream.HTMLTransformReader;

var htmlparser2 = require('htmlparser2');
var libxmljs = require("libxmljs");
var domino = require('domino');

function id(n) { return n; }
var figures = 0;
var links = 0;
function figure(n) { figures++; return n; }
function link(n) { links++; return n; }

const basicTestOptions = {
    transforms: [
        { selector: 'test-element', handler: id },
        { selector: 'foo-bar', handler: id },
        { selector: 'figure', handler: figure },
    ]
};

const streamTestOptions = {
    transforms: [{
        selector: 'test-element[baz="booz baax boooz"]',
        handler: id,
        stream: true,
    }]
};

const bodyMatchOptions = {
    transforms: [
        { selector: 'body', handler: id, stream: true }
    ],
    matchOnly: true
};

const referenceTestOptions = {
    transforms: [
        { selector: 'ol[typeof="mw:Extension/references"]', handler: link },
    ]
};

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
            const matches = new HTMLTransformReader(testDoc, basicTestOptions).drainSync();
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
            const matches = new HTMLTransformReader(doc, basicTestOptions).drainSync();
            assert.equal(matches[0], testHead + '<div>');
            const m1 = matches[1];
            assert.equal(m1.innerHTML, 'foo');
            assert.equal(m1.outerHTML, testElement);
            assert.deepEqual(m1.attributes, {});
            assert.equal(matches[2], '</div>' + testFooter);
        },
        "doesn't overmatch attributes": function() {
            const matches = new HTMLTransformReader(docWithOverMatch, basicTestOptions)
                .drainSync();
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
            const matches = new HTMLTransformReader(testDoc, streamTestOptions)
                .drainSync();
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
            return streamUtil.readToString(m1.outerHTML)
            .then(outerHTML => {
                assert.equal(outerHTML, customElement);
                return streamUtil.readToString(m1.innerHTML);
            })
            .then(innerHTML => {
                assert.equal(innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
            });
        },
        "ReadableStream innerHTML / outerHTML, chunked parsing": function() {
            const reader = new HTMLTransformReader([
                testDoc.slice(0, 120),
                testDoc.slice(120)
            ], streamTestOptions);

            return reader.read()
            .then(res => {
                const matches = res.value;
                assert.equal(matches[0], testHead);
                const m1 = matches[1];
                if (!(m1.innerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                if (!(m1.outerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                assert.deepEqual(m1.attributes, {
                    foo: 'bar <figure >',
                    baz: 'booz baax boooz'
                });

                return streamUtil.readToString(m1.outerHTML)
                .then(outerHTML => {
                    assert.equal(outerHTML, customElement);
                    return streamUtil.readToString(m1.innerHTML);
                })
                .then(innerHTML => {
                    assert.equal(innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
                });
            })
            // Second chunk
            .then(() => reader.read())
            .then(res => {
                const matches = res.value;
                assert.equal(matches[0], testFooter);
            });
        },
        "streaming body matching": function() {
            const chunks = [testDoc.slice(0, 120), testDoc.slice(120)];
            const reader = new HTMLTransformReader(chunks, bodyMatchOptions);
            return reader.read()
            .then(res => {
                const matches = res.value;
                const m0 = matches[0];
                if (!(m0.innerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                if (!(m0.outerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                return streamUtil.readToString(m0.outerHTML)
                .then(outerHTML => {
                    assert.equal(outerHTML, '<body>\n' + customElement + '</body>');
                    return streamUtil.readToString(m0.innerHTML);
                })
                .then(innerHTML => {
                    assert.equal(innerHTML, '\n' + customElement);
                })
                .then(() => reader.read());
            })
            .then(res => {
                assert.deepEqual(res, { value: undefined, done: true });
            });
        },
        "streaming body matching, multi-chunk body": function() {
            const chunks = [
                testDoc.slice(0, 110),
                testDoc.slice(110, 115),
                testDoc.slice(115, 120),
                testDoc.slice(120)
            ];
            const reader = new HTMLTransformReader(chunks, bodyMatchOptions);
            return reader.read()
            .then(res => {
                const matches = res.value;
                const m0 = matches[0];
                if (!(m0.innerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                if (!(m0.outerHTML instanceof ReadableStream)) {
                    throw new Error("Expected ReadableStream!");
                }
                return streamUtil.readToString(m0.outerHTML)
                .then(outerHTML => {
                    assert.equal(outerHTML, '<body>\n' + customElement + '</body>');
                    return streamUtil.readToString(m0.innerHTML);
                })
                .then(innerHTML => {
                    assert.equal(innerHTML, '\n' + customElement);
                })
                .then(() => reader.read());
            })
            .then(res => {
                assert.deepEqual(res, { value: undefined, done: true });
            });
        }
    },
    "incomplete buffer": {
        "fail matchSync": () => {
            const truncatedCustomElement = customElement.substr(0, customElement.length - 2);
            var doc = testHead + truncatedCustomElement;
            try {
                const match = new HTMLTransformReader(doc, basicTestOptions).drainSync();
            } catch (e) {
                // Okay, everything is fine.
                return;
            }
            throw new Error("Expected matchSync to throw on incomplete input!");
        },
        "custom element": function() {
            const truncatedCustomElement = customElement.substr(0, customElement.length - 2);
            var doc = testHead + truncatedCustomElement;
            const chunks = [
                doc,
                customElement.slice(-2) + '<div class="a"></div>' + testFooter
            ];
            const reader = new HTMLTransformReader(chunks, basicTestOptions);
            return reader.read()
            .then(res => {
                const matches = res.value;
                assert.equal(matches[0], testHead);
                if (matches.length > 1) {
                    throw new Error("Found more matches than expected!");
                }
                assert.equal(res.done, false);
                return reader.read();
            })
            .then(res => {
                const fm0 = res.value[0];
                assert.equal(fm0.innerHTML, '<foo-bar></foo-bar><figure>hello</figure>');
                assert.equal(fm0.outerHTML, customElement);
                assert.deepEqual(fm0.attributes, {
                    foo: 'bar <figure >',
                    baz: 'booz baax boooz'
                });
                assert.equal(res.value[1], '<div class="a"></div>' + testFooter);
                return reader.read();
            })
            .then(res => {
                assert.deepEqual(res, { value: undefined, done: true });
            });
        },
        "incomplete other tag, after tag name": function() {
            const testElement = '<figure>foo</figure>';
            const chunks = [
                testHead + '<div>' + testElement + '</div><othertag ',
                'foo="bar"></othertag></body>'

            ];
            const reader = new HTMLTransformReader(chunks, basicTestOptions);
            return reader.read()
            .then(res => {
                const matches = res.value;
                assert.equal(matches[0], testHead + '<div>');
                const m1 = matches[1];
                assert.equal(m1.innerHTML, 'foo');
                assert.equal(m1.outerHTML, testElement);
                assert.deepEqual(m1.attributes, {});
                assert.equal(res.done, false);
                return reader.read();
            })
            .then(res => {
                assert.equal(res.value[0], '<othertag foo="bar"></othertag></body>');
                return reader.read();
            })
            .then(res => assert.deepEqual(res, { value: undefined, done: true }));
        },
        "incomplete other tag, in attribute": function() {
            var testElement = '<figure>foo</figure>';
            const chunks = [
                testHead + '<div>' + testElement + '</div><othertag foo="bar',
                '"></othertag></body>'

            ];
            const reader = new HTMLTransformReader(chunks, basicTestOptions);
            return reader.read()
            .then(res => {
                const matches = res.value;
                assert.equal(matches[0], testHead + '<div>');
                const m1 = matches[1];
                assert.equal(m1.innerHTML, 'foo');
                assert.equal(m1.outerHTML, testElement);
                assert.deepEqual(m1.attributes, {});
                assert.deepEqual(matches[2], '</div>');
                assert.equal(res.done, false);
                return reader.read();
            })
            .then(res => {
                assert.equal(res.value[0], '<othertag foo="bar"></othertag></body>');
                assert.equal(res.done, false);
                return reader.read();
            })
            .then(res => assert.deepEqual(res, { value: undefined, done: true }));
        },
    },
    'presence': {
        "attribute presence": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo]', handler: id },
            ]}).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[bar]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
    },
    'equality': {
        "match": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo="bar <figure >"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo="boo"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[bar="booz"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
    },
    'prefix': {
        "match": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo^="bar <figure"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo^="boo"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[bar^="booz"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
    },
    'space-delimited attribute': {
        "match": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo~="bar"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[baz~="baax"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[baz~="boooz"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo~="boo"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
        "no attribute of name": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[bar~="booz"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
    },
    'suffix': {
        "match": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo$="figure >"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[baz$=" boooz"]', handler: id },
                ]
            }).drainSync();
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
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[foo$="figure"]', handler: id },
                ]
            }).drainSync();
            assert.equal(matches[0], testDoc);
        },
        "space-delim attribute match, no attribute of name": function() {
            const matches = new HTMLTransformReader(testDoc, {
                transforms: [
                    { selector: 'test-element[bar~="boooz"]', handler: id },
                ]
            }).drainSync();
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
                new HTMLTransformReader(obama, basicTestOptions).drainSync();
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
            var linkReader = new HTMLTransformReader(obama, {
                transforms: [
                    { selector: 'a', handler: link },
                ]
            });
            var n = 100;
            for (var i = 0; i < n; i++) {
                linkReader.drainSync();
            }
            console.log(links / n);
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, specific link": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var specificLinkReader = new HTMLTransformReader(obama, {
                transforms: [{
                    selector: {
                        nodeName: 'a',
                        attributes: [['a', '=', './Riverdale,_Chicago']]
                    },
                    handler: link
                }]
            });
            var startTime = Date.now();
            var n = 50;
            for (var i = 0; i < n; i++) {
                specificLinkReader.drainSync();
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
                new HTMLTransformReader(obama, referenceTestOptions).drainSync();
            }
            console.log((Date.now() - startTime) / n + 'ms per match');
        }
    },
    "performance, body extraction": {
        "Obama": function() {
            var obama = fs.readFileSync('test/obama.html', 'utf8');
            var startTime = Date.now();
            var n = 100;
            for (var i = 0; i < n; i++) {
                new HTMLTransformReader(obama, bodyMatchOptions).drainSync();
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
