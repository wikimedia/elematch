# element-match [![Build Status](https://travis-ci.org/gwicke/element-match.svg?branch=master)](https://travis-ci.org/gwicke/element-match)

Efficient element matching and processing for (X)HTML 5 DOM serialized HTML.

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
regularity of HTML5 DOM (or
[XMLSerializer](https://developer.mozilla.org/en-US/docs/XMLSerializer))
serialization.

Detailed requirements (implicit in HTML5 serialization):

- **Well-formed DOM**: All tags are balanced.
- **Quoted attributes**: All attribute values are quoted using single or
    double quotes. The left angle bracket (`<`) is entity-escaped inside
    attribute values.
