'use strict';

var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();
var CssSelectorParser = require('css-selector-parser').CssSelectorParser;
var cssParser = new CssSelectorParser();
cssParser.registerSelectorPseudos('has');

// Shared patterns
var optionalAttributePattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:"[^"]*"|\'[^\']*\'))?)*';
var remainingTagAssertionPattern = '(?=' + optionalAttributePattern + '\\s*\\/?>)';
var remainingTagCloseCapturePattern = optionalAttributePattern + '\\s*(\\/?)>';
var remainingTagPattern = optionalAttributePattern + '\\s*\\/?>';


/**
 * Element matcher class.
 */
function Matcher(spec) {
    // TODO: Move spec format closer to _handlers, so that we can accept
    // selectors as both string & object.
    this._spec = spec;
    this._handlers = Object.keys(spec)
        .map(function(key) {
            return {
                handler: spec[key],
                selector: key,
                nodeName: null,
            };
        });
    this._makeMatchers(spec);
    // Efficient matcher for random Tags.
    this._anyTagMatcher = new RegExp('<(\/?)([a-zA-Z_-]+)'
            + remainingTagCloseCapturePattern, 'g');
}

Matcher.prototype._makeMatchers = function(spec) {
    var self = this;
    this._spec = spec;
    this.lastIndex = 0;
    // Need:
    // - Start tag matcher. Safe, as '<' is always escaped, including
    // attributes.
    // - Random tag matcher. Match as long as level reaches zero.


    var tagMatchPatterns = self._handlers
            .map(function(handler) {
                return self._compileTagMatcher(handler);
            });

    // A matcher for the tags we are *not* interested in. Used in HTML5 mode.
    this._otherTagRe = new RegExp('[^<]*(?:<[\\/! ]*(?!'
                    + tagMatchPatterns
                        .map(function(pattern) {
                            return '(?:' + pattern + ')';
                        })
                        .join('|')
                    + ')[a-zA-Z][a-zA-Z_-]*' + remainingTagPattern + '[^<]*)*', 'g');

    // A matcher for the tags we *are* actually interested in.
    this._matchRe = new RegExp('<(\\/?)(?:'
                    + tagMatchPatterns
                        .map(function(pattern) {
                            return '(' + pattern + ')';
                        })
                        .join('|')
                    + ')' + remainingTagAssertionPattern, 'g');
};

var attrValReplacements = {
    'double': {
        '<': '(?:<|&lt;)',
        '>': '(?:>|&lt;)',
        '&': '(?&|&amp;)',
        '"': '&quot;',
        "'": '(?:\'|&apos;|&#39;)',
    }
};
attrValReplacements.single = Object.assign({},
    attrValReplacements.double, {
        '"': '(?:"|&quot;)',
        "'": '(?:\'|&apos;|&#39;)',
    });

Matcher.prototype._quoteAttributeValue = function(s, mode) {
    if (/[<'">&]/.test(s)) {
        var map = attrValReplacements[mode];
        return s.replace(/[<'">&]/g, function(m) {
                return map[m];
        });
    } else {
        return s;
    }
};

Matcher.prototype._compileTagMatcher = function(handler) {
    var ruleSet = cssParser.parse(handler.selector);
    //console.log(JSON.stringify(ruleSet, null, 2));
    if (ruleSet.type !== 'ruleSet') {
        throw new Error('Only simple attribute value matches like '
                + 'a[href="foo"] supported for now!');
    }
    var tagName = ruleSet.rule.tagName;

    if (!tagName) {
        throw new Error("Only matches for fixed tag names are supported for now!");
    }
    // Remember the tag name as an attribute
    handler.nodeName = tagName;
    var attributes = ruleSet.rule.attrs;
    var res = tagName || '';
    if (attributes) {
        if (attributes.length > 1) {
            throw new Error("Only a single attribute match is supported for now!");
        }
        // Only match on the first attribute
        var attr = attributes[0];
        // TODO: Support XML vs. HTML escaping flavors!
        var escapedValue = '';
        var value = attr.value || '';


        var doubleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'double');
        var singleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'single');

        if (!attr.operator) {
            res += '(?=[^>]*?\\s' + attr.name + '=(?:"[^"]*"|\'[^\']*\'))';
        } else if (attr.operator === '=') {
            res += '(?=[^>]*?\\s' + attr.name + '=(?:"' + doubleQuoteValuePattern + '"|\''
                        + singleQuoteValuePattern + '\'))';
        } else if (attr.operator === '^=') {
            res += '(?=[^>]*?\\s' + attr.name
                    + '=(?:"' + doubleQuoteValuePattern + '[^"]*"'
                    + '|\'' + singleQuoteValuePattern + '[^\']*\'';
        } else {
            throw new Error("Unsupported attribute predicate: " + attr.operator);
        }
    }
    // console.log(res);
    return res;
};

var ATTRIB_PATTERN = '\\s+([a-zA-Z][a-zA-Z_-]*)=(?:"([^"]*)"|\'([^\']*)\')|';
var ATTRIB = new RegExp(ATTRIB_PATTERN, 'g');

Matcher.prototype._matchAttributes = function(s, index) {

    ATTRIB.lastIndex = index;
    var attributes = {};
    while (true) {
        var match = ATTRIB.exec(s);
        if (match[0].length === 0) {
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

var TAG_END = new RegExp('\\s*\/?>|', 'g');
Matcher.prototype._matchTagEnd = function(s, index) {
    TAG_END.lastIndex = index;
    TAG_END.exec(s);
    return TAG_END.lastIndex;
};

Matcher.prototype.matchElement = function(s, results, handler, node) {
    var depth = 1;
    // console.log(node._dsr[1], s.slice(node._dsr[1], node._dsr[1] + 660));
    this._anyTagMatcher.lastIndex = node._dsr[1];
    while (true) {
        var match = this._anyTagMatcher.exec(s);
        if (!match) {
            throw new Error('Did not find end tag for: ' + handler.nodeName);
        }
        if (match[1]) {
            // End tag
            depth--;
            if (depth === 0) {
                if (match[2] === handler.nodeName) {
                    node.outerHTML = s.substring(node._dsr[0], this._anyTagMatcher.lastIndex);
                    node.innerHTML = s.substring(node._dsr[1], match.index);

                    // Add HTML string prefix since the previous match.
                    results.push(s.substring(node._lastEndOffset, node._dsr[0]));

                    // Call the handler
                    results.push(handler.handler(node));
                    return this._anyTagMatcher.lastIndex;
                } else {
                    throw new Error("Mis-matched end tag: Expected "
                            + JSON.stringify(handler.nodeName)
                            + ', got ' + JSON.stringify(match[2]) + '.');
                }
            }
        } else if (!match[3]) {
            // Start tag.
            depth++;
        }
    }
};

Matcher.prototype.matchAll = function(s, options) {
    var isXML = options && options.isXML;
    var results = [];
    this._matchRe.lastIndex = 0;
    while (true) {
        var lastEndOffset = this._matchRe.lastIndex;

        if (!isXML) {
            // Explicitly match tags & attributes to avoid matching literal
            // `<` in attribute values. These are escaped with `&lt;` in XML,
            // but not HTML5.
            this._otherTagRe.lastIndex = this._matchRe.lastIndex;
            this._otherTagRe.exec(s);
            this._matchRe.lastIndex = this._otherTagRe.lastIndex;
        }

        var match = this._matchRe.exec(s);

        if (!match) {
            // Add the HTML suffix, if any.
            if (lastEndOffset !== s.length) {
                results.push(s.slice(lastEndOffset, s.length));
            }
            // Nothing left to process.
            break;
        }

        if (!match[1]) {
            // Start tag.
            var handlerObj;
            var tagMatch;
            var i = 2;
            for (; i < match.length; i++) {
                tagMatch = match[i];
                if (tagMatch !== undefined) {
                    handlerObj = this._handlers[i-2];
                    // console.log(tagMatch, handlerObj);
                    break;
                }
            }
            //var attributeStartOffset = match.index + tagMatch.length + 1;
            var attributeMatch = this._matchAttributes(s, this._matchRe.lastIndex);
            this._matchRe.lastIndex = this.matchElement(s, results, handlerObj, {
                nodeName: handlerObj.nodeName,
                attributes: attributeMatch.attributes,
                _dsr: [match.index, attributeMatch.endOffset],
                _lastEndOffset: lastEndOffset,
            });
        }
    }
    // console.log(JSON.stringify(results, null, 2));

    return results;
};


module.exports = Matcher;
