'use strict';

// Single start tag regexp
// Once found, look for end tag or same start tag (stack)


function Matcher(spec) {
    this._handlers = spec;
    this._matchRe = this._compile(spec);
}

Matcher.prototype._compile = function(spec) {
    var matchReString = Object.keys(spec)
        .map(function(name) {
            return '</?'
                + name.replace(/\-/g, '\\-')
                + '(?=[ />])';
        })
        .join('|');
    return new RegExp(matchReString, 'g');
};

var END_TAG_MATCH = /(?: [a-zA-Z][a-zA-Z_-]*=(?:'[^']*'|"[^"]*"))* ?\/?>/g;

Matcher.prototype.matchAll = function(s) {
    var results = [];
    var stack = [];
    this._matchRe.lastIndex = 0;
    var matchRe = this._matchRe;
    var match;
    while (match = matchRe.exec(s)) {
        var tagMatch = match[0];
        if (/^<[a-zA-Z]/.test(tagMatch)) {
            // Start tag.
            stack.push({
                name: tagMatch.substr(1),
                startOffset: match.index,
            });
        } else {
            // End tag.
            var tagName = match[0].replace(/<\/?/, '');

            // Match to the end of the end tag
            END_TAG_MATCH.lastIndex = matchRe.lastIndex;
            var endMatch = END_TAG_MATCH.exec(s);
            var endOffset = END_TAG_MATCH.lastIndex;

            if (stack.length > 0) {
                // Find tag on stack, backwards
                for (var i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].name === tagName) {
                        var stackEntry = stack[i];
                        stack = stack.slice(0, i);
                        // Call the handler
                        var node = {
                            nameName: tagName,
                            outerHTML: s.substring(stackEntry.startOffset, endOffset)
                        };
                        results.push(this._handlers[tagName](node));
                        break;
                    }
                }
            }
        }
    }
    return results;
};



module.exports = Matcher;
