# elematch [![Build Status](https://travis-ci.org/gwicke/elematch.svg?branch=master)](https://travis-ci.org/gwicke/elematch)

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
    'test-element': handler,
    'foo-bar': handler,
});

var testDoc = "<html><body><div>"
        + "<test-element foo='bar'>foo</test-element>"
        + "</div></body>";

// Finally, execute it all.
var matches = matcher.matchAll(testDoc);

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

Replacing 32 `<figure>` elements in [the Barack Obama
article](en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML)
takes about 2.15ms CPU time.

This compares to these numbers for a smaller (1.1mb) version of the same page:
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

Detailed requirements (all true for HTML5 fragment serializer / XMLSerializer
output):

- **Well-formed DOM**: Handled tags are balanced.
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes. 

### Possible speed-up for XMLSerializer output

The current version pays a ~15% performance penalty for supporting unadorned
(not entity-escaped) angle brackets (`<`) in attribute values. Such escaping
[is guaranteed for XMLSerializer
output](http://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-attr-value)
[as emitted for example by
Parsoid](https://github.com/wikimedia/parsoid/blob/master/lib/XMLSerializer.js),
but [is not required in the HTML5
spec](http://www.w3.org/TR/html5/syntax.html#serializing-html-fragments).
