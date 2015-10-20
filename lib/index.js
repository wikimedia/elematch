'use strict';

/**
 * Element matcher class.
 */

function Matcher(spec) {
    this._handlers = spec;
    //this._matchRe = this._compile(spec);
    this._matchRe = new TagMatcher(spec);
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
 * Performance penalty for Obama: About 30% (1.85ms vs. 2.45ms)
 */
var remainingTagPattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:\'[^\']*\'|"[^"]*"))?)*[\\s\\/]*>';
function TagMatcher(spec) {
    this._spec = spec;
    this.lastIndex = 0;
    this._otherTagMatcher = new RegExp('(?:[^<>]*<\/?(?!'
                    + Object.keys(spec).join('|')
                    + ')[a-zA-Z_-]+' + remainingTagPattern + ')+',
                        RegExp.sticky ? 'gy' : 'g');
    this._ourTagMatcher = new RegExp('<(\\/?('
                    + Object.keys(spec).join('|')
                    + '))' + remainingTagPattern, 'g');
    //console.log(this._otherTagMatcher);

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


var ATTRIB_PATTERN = ' ([a-zA-Z][a-zA-Z_-]*)=(?:\'([^\']*)\'|"([^"]*)")';
// Use sticky flag where available.
var ATTRIB = new RegExp(ATTRIB_PATTERN, RegExp.sticky ? 'yg' : 'g');

Matcher.prototype._matchAttributes = function(s, index) {
    ATTRIB.lastIndex = index;
    var attributes = {};
    while (true) {
        var startIndex = ATTRIB.lastIndex;
        var match = ATTRIB.exec(s);
        if (!match || match.index !== startIndex) {
            break;
        }
        // TODO: decode entities
        var val = match[2] || match[3];
        attributes[match[1]] = val;
    }
    return {
        attributes: attributes,
        endOffset: this._matchTagEnd(s, ATTRIB.lastIndex || index),
    };
};

var TAG_END = / ?\/?>/g;
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
        //console.log(match);
        if (!match) {
            break;
        }
        var tagMatch = match[0];
        if (/^<[a-zA-Z]/.test(tagMatch)) {
            // Start tag.

            // If the stack is empty, get the string prefix since the last
            // match.
            var prefix = '';
            if (stack.length === 0) {
                prefix = s.substring(lastEndOffset, match.index);
            }

            var attributeMatch = this._matchAttributes(s, this._matchRe.lastIndex);
            this._matchRe.lastIndex = attributeMatch.endOffset;
            stack.push({
                nodeName: tagMatch.substr(1),
                attributes: attributeMatch.attributes,
                _dsr: [match.index, attributeMatch.endOffset],
                _prefix: prefix,
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

                        // Call the handler
                        results.push(this._handlers[tagName](node, node._prefix));
                        break;
                    }
                }
            }
        }
    }

    return results;
};


module.exports = Matcher;
