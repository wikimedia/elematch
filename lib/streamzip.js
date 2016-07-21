'use strict';

var EleMatch = require('./index.js');
const ReadableStream = require("web-streams-polyfill").ReadableStream;

/**
 * StreamZip: Zip and process streams, and return a merged stream.
 *
 * TODO:
 * - Hook up real ReadableStream
 * - Tests
 *
 */



function pipeToCb(stream, cb) {
    var reader = stream.getReader();
    return reader.read()
        .then(function processChunk(res) {
            if (res.done) {
                return;
            }
            cb(res.value);
            return reader.read()
                .then(processChunk);
        });
}

function zipMatches(matches, cb, ctx, offset) {
    offset = offset || 0;
    var bit = matches[offset];
    var bitType = typeof bit;
    var ret;
    if (bitType === 'string') {
        ret = bit;
    } else if (bitType === 'function') {
        ret = bit(ctx);
    } else if (bit instanceof ReadableStream) {
        // Pipe to controller
        ret = pipeToCb(bit, cb);
    } else if (bit.then) {
        // Duck typed Promise
        ret = bit;
    }
    return Promise.resolve(ret)
        .then(cb)
        .then(() => {
            if (offset < matches.length - 1) {
                return zipMatches(matches, cb, ctx, offset + 1);
            } else {
                return;
            }
        });
}

function makePageZipper(inStream, matcher, ctx) {
    var stream = new ReadableStream({
        start(controller) {
            var remainder = '';
            // Get a lock on the stream
            var reader = inStream.getReader();
            return reader.read()
                .then(function process(result) {
                    if (result.done) {
                        if (remainder) {
                            throw new Error('Still have content to process, '
                                    + 'but input stream ended!');
                        }
                        return;
                    }

                    var match = matcher.matchAll(remainder + result.value,
                            { ctx: ctx });
                    remainder = match.remainder || '';

                    return zipMatches(match.matches,
                            controller.enqueue.bind(controller), ctx)
                        .then(process);
                })
            .then(() => controller.close());
        }
    });
    return stream;
}

// Strawman
function test() {
    var handler = function(node) { return function() { return node; } };
    var matcher = new EleMatch({
        'test-element[foo="bar"]': handler,
        'foo-bar': handler,
    });
    var testDoc = "<html><body><div>"
        + "<test-element foo='bar'>foo</test-element>"
        + "</div></body>";
    var inStream = {
        getReader() {
            var isDone = false;
            return {
                read() {
                    if (isDone) {
                        return Promise.resolve({ done: true });
                    } else {
                        isDone = true;
                        return Promise.resolve({
                            value: testDoc,
                            done: false,
                        });
                    }
                }
            };
        }
    };
    var zipper = makePageZipper(inStream, matcher);
    var zipReader = zipper.getReader();
    zipReader.read()
    .then(function print(res) {
        if (res.done) {
            return;
        }
        console.log(res.value);
        return zipReader.read().then(print);
    });
}

test();
