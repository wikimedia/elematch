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

Using [the Barack Obama
article](https://en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML, part of `npm test`):
- `elematch` match & replace all 32 `<figure>` elements: 1.95ms
- `elematch` match & replace all 1852 links: 13.9ms
- `elematch` match & replace a specific link (`a[href="./Riverdale,_Chicago"]`): 1.9ms
- `elematch` match & replace references section (`ol[typeof="mw:Extension/references"]`): 3.7ms
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

Detailed requirements (all true for XMLSerializer output):

- **Well-formed DOM**: Handled tags are balanced.
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes.
- **`<` escaped as `&lt;`**: This is not true for HTML5-serialized attributes.
    A previous version suported matching HTML5 without this escaping, at a
    moderate performance penalty. We can bring this back if there is demand.


### Syntax background

There are significant differences in how [the XML standard](https://www.w3.org/TR/xml/#syntax
) and [the HTML5
standard](https://html.spec.whatwg.org/multipage/syntax.html#escapingString)
escape strings:

- In XML, `<` is entity-escaped as `&lt;` in all contexts, including
    attributes. `>` *may* be escaped, but this is not required.
- In HTML5, bare `<` are permitted in attributes. Specifically, [the spec only
    requires escaping of `"` within
    attributes](https://html.spec.whatwg.org/multipage/syntax.html#escapingString):
    > If the algorithm was invoked in the attribute mode, replace any
    > occurrences of the """ character by the string "&quot;".

As a consequence, matching XML-serialized HTML can be significantly faster
than HTML5-serialized HTML. A previous version of `elematch` supported this,
and showed roughly a ~15% performance penalty.
