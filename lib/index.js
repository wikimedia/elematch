'use strict';

var Entities = require('html-entities').AllHtmlEntities
var entities = new Entities();

// Use sticky flag for RegExps where supported. Support is indicated by the
// RegExp.prototype.sticky flag being false, rather than undefined.
// For v8, see https://code.google.com/p/v8/issues/detail?id=4342.
var globalStickyFlags = RegExp.prototype.sticky === false ? 'gy' : 'g';

/**
 * Element matcher class.
 */

function Matcher(spec) {
    this._handlers = spec;
    this._matchRe = new TagMatcher(spec);
    //this._matchRe = this._compile(spec);
}

// Compile to a single regexp matching all registered tags.
Matcher.prototype._compile = function(spec) {
    var matchReString = '<\\/?(?:'
        + Object.keys(spec)
            .map(function(name) {
                return name.replace(/\-/g, '\\-');
            })
            .join('|')
        + ')(?=[ />])';
    return new RegExp(matchReString, 'g');
};


/*
 * Alternative tag matcher (drop-in for _compile()), which lets us relax the
 * requirement for escaping `<` in attribute values by explicitly matching all
 * tags & implicitly keeping track of in-attribute state.
 *
 * Performance penalty for Obama: About 15% (1.85ms vs. 2.15ms)
 */
var remainingTagPattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:\'[^\']*\'|"[^"]*"))?)*[\\s\\/]*>';
function TagMatcher(spec) {
    this._spec = spec;
    this.lastIndex = 0;
    // Efficient matcher for tags we aren't interested in. Used to consume the
    // bulk of the content, with tags consumed atomically. This avoids
    // matching unadorned < in attribute values.
    this._otherTagMatcher = new RegExp('(?:[^<>]*<\/?(?!'
                    + Object.keys(spec).join('|')
                    + ')[a-zA-Z_-]+' + remainingTagPattern + ')+',
            globalStickyFlags);

    // A matcher for the tags we *are* actually interested in.
    this._ourTagMatcher = new RegExp('<(\\/?('
                    + Object.keys(spec).join('|')
                    + '))' + remainingTagPattern,
            globalStickyFlags);
}

TagMatcher.prototype.exec = function(s) {
    while (true) {
        // Skip over other tags
        this._otherTagMatcher.lastIndex = this.lastIndex;
        var match = this._otherTagMatcher.exec(s);
        // Try to match an actual tag
        if (match.index === this.lastIndex) {
            this._ourTagMatcher.lastIndex = this._otherTagMatcher.lastIndex;
        } else {
            this._ourTagMatcher.lastIndex = this.lastIndex;
        }
        match = this._ourTagMatcher.exec(s);
        if (!match) {
            return null;
        } else if (this._spec[match[2]]) {
            this.lastIndex = match.index + match[1].length + 1;
            return {
                0: '<' + match[1],
                index: match.index,
            };
        }
    }
};


var ATTRIB_PATTERN = '\\s+([a-zA-Z][a-zA-Z_-]*)=(?:\'([^\']*)\'|"([^"]*)")';
var ATTRIB = new RegExp(ATTRIB_PATTERN, globalStickyFlags);

Matcher.prototype._matchAttributes = function(s, index) {
    ATTRIB.lastIndex = index;
    var attributes = {};
    while (true) {
        var startIndex = ATTRIB.lastIndex;
        var match = ATTRIB.exec(s);
        if (!match || match.index !== startIndex) {
            break;
        }
        var val = match[2] || match[3];
        if (/&/.test(val)) {
            // Decode HTML entities
            val = entities.decode(val);
        }
        attributes[match[1]] = val;
    }
    return {
        attributes: attributes,
        endOffset: this._matchTagEnd(s, ATTRIB.lastIndex || index),
    };
};

var TAG_END = new RegExp('\\s*\/?>', globalStickyFlags);
Matcher.prototype._matchTagEnd = function(s, index) {
    TAG_END.lastIndex = index;
    TAG_END.exec(s);
    return TAG_END.lastIndex;
};

Matcher.prototype.matchAll = function(s) {
    var results = [];
    var stack = [];
    this._matchRe.lastIndex = 0;
    while (true) {
        var lastEndOffset = this._matchRe.lastIndex;
        var match = this._matchRe.exec(s);

        if (!match) {
            // Nothing left to process.
            break;
        }

        var tagMatch = match[0];
        if (/^<[a-zA-Z]/.test(tagMatch)) {
            // Start tag.
            var attributeMatch = this._matchAttributes(s, this._matchRe.lastIndex);
            this._matchRe.lastIndex = attributeMatch.endOffset;
            stack.push({
                nodeName: tagMatch.substr(1),
                attributes: attributeMatch.attributes,
                _dsr: [match.index, attributeMatch.endOffset],
                _lastEndOffset: lastEndOffset,
            });
        } else {
            // End tag.
            var tagName = match[0].replace(/<\/?/, '');

            if (stack.length > 0) {
                // Find tag on stack, backwards
                for (var i = stack.length - 1; i >= 0; i--) {
                    // TODO: support nested tags?
                    if (stack[i].nodeName === tagName && i === 0) {
                        var node = stack[i];
                        stack = stack.slice(0, i);

                        // Match to the end of the end tag
                        var endOffset = this._matchTagEnd(s, this._matchRe.lastIndex);
                        this._matchRe.lastIndex = endOffset;
                        node.outerHTML = s.substring(node._dsr[0], endOffset);
                        node.innerHTML = s.substring(node._dsr[1], match.index);

                        // Add HTML string prefix since the previous match.
                        results.push(s.substring(node._lastEndOffset, node._dsr[0]));

                        // Call the handler
                        results.push(this._handlers[tagName](node));
                        break;
                    }
                }
            }
        }
    }

    // Add the HTML suffix, if any.
    if (this._matchRe.lastIndex < s.length) {
        results.push(s.substring(this._matchRe.lastIndex, s.length));
    }

    return results;
};


module.exports = Matcher;
