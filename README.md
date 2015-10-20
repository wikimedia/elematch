# element-match [![Build Status](https://travis-ci.org/gwicke/element-match.svg?branch=master)](https://travis-ci.org/gwicke/element-match)

Efficient element matching and processing for XMLSerializer serialized HTML.

## Usage

```javascript
var ElementMatcher = require('element-match');

function handler(node) {
    // Do something with the node
    return Promise.resolve(node.outerHTML);
}

var matcher = new ElementMatcher({
    'test-element': handler,
    'foo-bar': handler,
});

var matches = matcher.machAll(someDoc);
```

## Performance

Replacing 32 `<figure>` elements in [the Barack Obama
article](en.wikipedia.org/api/rest_v1/page/html/Barack_Obama) (1.5mb HTML)
takes about 1.9ms CPU time.

## Syntactical requirements

`element-match` gets much of its efficiency from leveraging the syntactic
regularity of
[XMLSerializer](https://developer.mozilla.org/en-US/docs/XMLSerializer)
DOM serialization.

Detailed requirements:

- **Well-formed DOM**: Handled tags are balanced (HTML5, XMLSerializer).
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes (HTML5, XMLSerializer). 
- **`<` escaped in attribute values**: In attribute values, the left angle
    bracket (`<`) is entity-escaped. This is [not required in the HTML5
    spec](http://www.w3.org/TR/html5/syntax.html#serializing-html-fragments),
    but *is* required in [the XMLSerializer
    spec](http://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-attr-value).
    [Parsoid](https://www.mediawiki.org/wiki/Parsoid) HTML is serialized [using
    the XMLSerializer
    algorithm](https://github.com/wikimedia/parsoid/blob/master/lib/XMLSerializer.js).
