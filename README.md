# element-match [![Build Status](https://travis-ci.org/gwicke/element-match.svg?branch=master)](https://travis-ci.org/gwicke/element-match)

Efficient element matching and processing for XMLSerializer serialized HTML.

## Usage

```javascript
var ElementMatcher = require('element-match');

/**
 * @param {object} node, a DOM node like object.
 * @param {string} prefix, the HTML prefix string since the last match.
 * @return {object} Anything really; return values are accumulated in an
 *   array.
 */
function handler(node, prefix) {
    // `node` is .
    // `prefix` is .
    // Do something with the node
    return {
        node: node,
        prefix: prefix,
    };
}

// Create a matcher to handle some elements.
var matcher = new ElementMatcher({
    'test-element': handler,
    'foo-bar': handler,
});

var testDoc = "<html><body><div>"
        + "<test-element foo='bar'>foo</test-element>"
        + "</div></body>";

// Finally, execute it all.
var matches = matcher.matchAll(testDoc);

// [
//   {
//     "node": {
//       "nodeName": "test-element",
//       "attributes": {
//         "foo": "bar"
//       },
//       "outerHTML": "<test-element foo='bar'>foo</test-element>",
//       "innerHTML": "foo"
//     },
//     "prefix": "<html><body><div>"
//   }
// ]
```

## Performance

Replacing 32 `<figure>` elements in [the Barack Obama
article](en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML)
takes about 2.15ms CPU time.

## Syntactical requirements

`element-match` gets much of its efficiency from leveraging the syntactic
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
