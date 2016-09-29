# web-html-stream [![Build Status](https://travis-ci.org/wikimedia/web-html-stream.svg?branch=master)](https://travis-ci.org/wikimedia/web-html-stream)

Efficient streaming element matching and processing for HTML5 DOM serialized
HTML. Works with [Web
Streams](https://streams.spec.whatwg.org/https://streams.spec.whatwg.org/) as
returned by [fetch](https://fetch.spec.whatwg.org/).

## Usage

```javascript
const htmlStream = require('web-html-stream');

/**
 * @param {object} node, a DOM node like object.
 * @return {object} Anything really; return values are accumulated in an
 *   array.
 */
function handler(node, ctx) {
    // Do something with the node
    return node;
}

const testDoc = "<html><body><div>"
        + "<test-element foo='bar'>foo</test-element>"
        + "</div></body>";

const inputStream = new ReadableStream({
    start(controller) {
        controller.enqueue(testDoc);
        controller.close();
    }
});

// Create a matcher to handle some elements, using CSS syntax. To avoid
// shipping a CSS parser to clients, CSS selectors are only supported in node.
var reader = new htmlStream.HTMLTransformReader(inputStream, {
    transforms: [
        { selector: 'test-element[foo="bar"]', handler: handler },
        { selector: 'foo-bar', handler: handler },
    ],
    ctx: { hello: 'world' }
});

// Create the same matcher using more verbose selector objects. These are
// especially useful when processing dynamic values, as this avoids the need to
// escape special chars in CSS selectors.
reader = new htmlStream.HTMLTransformReader(inputStream, {
    transforms: [{
        selector: {
            nodeName: 'test-element',
            attributes: [['foo', '=', 'bar']]
        },
        handler: handler,
        // Optional: Request node.innerHTML / outerHTML as `ReadableStream`
        // instances. Only available in rule objects.
        stream: false
    }],
    ctx: { hello: 'world' }
});

// Read matches
reader.read()
.then(res => {
    console.log(res);
    return reader.read();
})
// {
//   done: false,
//   value: [
//     "<html><body><div>",
//     {
//       "nodeName": "test-element",
//       "attributes": {
//         "foo": "bar"
//       },
//       "outerHTML": "<test-element foo='bar'>foo</test-element>",
//       "innerHTML": "foo"
//     },
//     "</div></body>"
//   ]
// }
.then(res => console.log);
// { done: true, value: undefined }
```

## Performance

Using [the Barack Obama
article](https://en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML, part of `npm test`):
- `web-html-stream` match & replace all 32 `<figure>` elements: 1.95ms
- `web-html-stream` match & replace all links: 14.98ms
- `web-html-stream` match & replace a specific link (`a[href="./Riverdale,_Chicago"]`): 2.24ms
- `web-html-stream` match & replace references section (`ol[typeof="mw:Extension/references"]`): 3.7ms
- `libxml` DOM parse: 26.3ms
- `libxml` DOM round-trip: 50.8ms
- `htmlparser2` DOM parse: 66.8ms
- `htmlparser2` DOM round-trip: 99.7ms
- `htmlparser2` SAX parse: 70.6ms
- `domino` DOM parse: 225.8ms
- `domino` DOM round-trip: 248.6ms

Using a smaller (1.1mb) version of the same page:
- SAX parse via libxmljs (node) and no-op handlers: 64ms
- XML DOM parse via libxmljs (node): 16ms
  - XPATH match for ID (ex: `dom.find('//*[@id = "mw123"]')`) : 15ms
  - XPATH match for class (ex: `dom.find("//*[contains(concat(' ', normalize-space(@class), ' '), ' interlanguage-link ')]")`: 34ms
- HTML5 DOM parse via Mozilla's [html5ever](https://github.com/servo/html5ever): 32ms
  - full round-trip with serialization: 60ms
- HTML5 DOM parse via domino (node): 220ms

## Syntactical requirements

`web-html-stream` gets much of its efficiency from leveraging the syntactic
regularity of HTML5 and
[XMLSerializer](https://developer.mozilla.org/en-US/docs/XMLSerializer)
DOM serialization.

Detailed requirements (all true for HTML5 and XMLSerializer output):

- **Well-formed DOM**: Handled tags are balanced.
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes.
