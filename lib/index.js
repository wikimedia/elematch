'use strict';

/**
 * Element matcher class.
 */

function Matcher(spec) {
    this._handlers = spec;
    this._matchRe = this._compile(spec);
}

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

var ATTRIB = / ([a-zA-Z][a-zA-Z_-]*)=(?:'([^']*)'|"([^"]*)")/g;
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
        var match = this._matchRe.exec(s);
        if (!match) {
            break;
        }
        var tagMatch = match[0];
        if (/^<[a-zA-Z]/.test(tagMatch)) {
            // Start tag.
            var attributeMatch = this._matchAttributes(s, this._matchRe.lastIndex);
            stack.push({
                nodeName: tagMatch.substr(1),
                attributes: attributeMatch.attributes,
                _dsr: [match.index, attributeMatch.endOffset]
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
                        node.outerHTML = s.substring(node._dsr[0], endOffset);
                        node.innerHTML = s.substring(node._dsr[1], match.index);
                        // Call the handler
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
