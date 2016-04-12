# elematch [![Build Status](https://travis-ci.org/wikimedia/elematch.svg?branch=master)](https://travis-ci.org/wikimedia/elematch)

Efficient element matching and processing for HTML5 DOM serialized HTML.

## Usage

```javascript
var EleMatch = require('elematch');

/**
 * @param {object} node, a DOM node like object.
 * @return {object} Anything really; return values are accumulated in an
 *   array.
 */
function handler(node) {
    // Do something with the node
    return node;
}

// Create a matcher to handle some elements.
var matcher = new EleMatch({
    'test-element[foo="bar"]': handler,
    'foo-bar': handler,
});

var testDoc = "<html><body><div>"
        + "<test-element foo='bar'>foo</test-element>"
        + "</div></body>";

// Finally, execute it all.
var matches = matcher.matchAll(testDoc, { isXML: false });

// [
//   "<html><body><div>",
//   {
//     "nodeName": "test-element",
//     "attributes": {
//       "foo": "bar"
//     },
//     "outerHTML": "<test-element foo='bar'>foo</test-element>",
//     "innerHTML": "foo"
//   },
//   "</div></body>"
// ]
```

## Performance

Using [the Barack Obama
article](https://en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML, part of `npm test`):
- `elematch` match & replace all 32 `<figure>` elements: 1.78ms
- `elematch` match & replace all 32 `<figure>` elements, isXML: 1.66ms
- `elematch` match & replace all 1852 links: 19.52ms
- `elematch` match & replace all 1852 links, isXML: 11.57ms
- `elematch` match & replace a specific link (`a[href="./Riverdale,_Chicago"]`): 2.0ms
- `elematch` match & replace a specific link (`a[href="./Riverdale,_Chicago"]`), isXML: 1.96ms
- `elematch` match & replace references section (`ol[typeof="mw:Extension/references"]`): 3.4ms
- `elematch` match & replace references section (`ol[typeof="mw:Extension/references"]`), isXML: 3.3ms
- `libxml` DOM parse: 26.3ms
- `libxml` DOM round-trip: 42.1ms
- `htmlparser2` DOM parse: 66.8ms
- `htmlparser2` DOM round-trip: 94.9ms
- `htmlparser2` SAX parse: 70.6ms
- `domino` DOM parse: 228.9ms
- `domino` DOM round-trip: 257.2ms

Using a smaller (1.1mb) version of the same page:
- SAX parse via libxmljs (node) and no-op handlers: 64ms
- XML DOM parse via libxmljs (node): 16ms
  - XPATH match for ID (ex: `dom.find('//*[@id = "mw123"]')`) : 15ms
  - XPATH match for class (ex: `dom.find("//*[contains(concat(' ', normalize-space(@class), ' '), ' interlanguage-link ')]")`: 34ms
- HTML5 DOM parse via Mozilla's [html5ever](https://github.com/servo/html5ever): 32ms
  - full round-trip with serialization: 60ms
- HTML5 DOM parse via domino (node): 220ms

## Syntactical requirements

`elematch` gets much of its efficiency from leveraging the syntactic
regularity of HTML5 and
[XMLSerializer](https://developer.mozilla.org/en-US/docs/XMLSerializer)
DOM serialization.

Detailed requirements (all true for HTML5 and XMLSerializer output):

- **Well-formed DOM**: Handled tags are balanced.
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes.

### `isXML` option: Faster matching for XML

When `matchAll()` is passed `{ isXML: true }` in the second parameter, it will
exploit the [stricter escaping rules in the XML
spec](https://www.w3.org/TR/xml/#syntax) to gain some performance.

In particular, it exploits the following difference in how `<` is escaped in
attributes:

- In XML, `<` is entity-escaped as `&lt;` in all contexts, including
    attributes. `>` *may* be escaped, but this is not required.
- In HTML5, bare `<` are permitted in attributes. Specifically, [the spec only
    requires escaping of `"` within
    attributes](https://html.spec.whatwg.org/multipage/syntax.html#escapingString):
    > If the algorithm was invoked in the attribute mode, replace any
    > occurrences of the """ character by the string "&quot;".

As a consequence, matching XML-serialized HTML can be significantly faster
than HTML5-serialized HTML, as there is no need to parse each tag & attribute
in order to avoid matching bare `<` in attributes when looking for the next
interesting tag.
