'use strict';

const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
const CssSelectorParser = require('css-selector-parser').CssSelectorParser;
const cssParser = new CssSelectorParser();
cssParser.registerSelectorPseudos('has');
cssParser.registerAttrEqualityMods('^', '~', '$', '*');

// Shared patterns
const optionalAttributePattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:"[^"]*"|\'[^\']*\'))?)*';
const remainingTagAssertionPattern = '(?=' + optionalAttributePattern + '\\s*\\/?>)';
const remainingTagCloseCapturePattern = optionalAttributePattern + '\\s*(\\/?)>';
const remainingTagPattern = optionalAttributePattern + '\\s*\\/?>';


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
    this._anyTagMatcher = new RegExp('<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)'
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

    var commentMatchPattern = '!--(?:[^-]*(?:-(?!->))?)*-->';

    // A matcher for the tags we are *not* interested in. Used in HTML5 mode.
    this._otherTagRe = new RegExp('[^<]*(?:<(?:[\\/! ]*(?!'
                    + tagMatchPatterns
                        .map(function(pattern) {
                            return '(?:' + pattern + ')';
                        })
                        .join('|')
                    + ')[a-zA-Z][a-zA-Z0-9_-]*' + remainingTagPattern
                        + '|' + commentMatchPattern + ')[^<]*)*', 'g');

    // A matcher for the tags we *are* actually interested in.
    this._matchRe = new RegExp('<(\\/?)(?:'
                    + tagMatchPatterns
                        .map(function(pattern) {
                            return '(' + pattern + ')';
                        })
                        .join('|')
                    + ')' + remainingTagAssertionPattern, 'g');
};

function escapeRegex(re) {
	return re.replace(/[\^\\$*+?.()|{}\[\]\/]/g, '\\$&');
}

const attrValReplacements = {
    'double': {
        '<': '(?:<|&lt;)',
        '>': '(?:>|&gt;)',
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
        // Escape any regexp chars in the value
        s = escapeRegex(s);
        return s.replace(/[<'">&]/g, function(m) {
                return map[m];
        });
    } else {
        return s;
    }
};

// https://www.w3.org/TR/html-markup/syntax.html#syntax-attributes:
// Attribute names must consist of one or more characters other than the space
// characters, U+0000 NULL, """, "'", ">", "/", "=", the control characters,
// and any characters that are not defined by Unicode.
const ATTRIB_NAME_PATTERN = '[^\\s\\0"\'>/=\x00-\x1F\x7F-\x9F]+';
const ATTRIB_PATTERN = '\\s+(' + ATTRIB_NAME_PATTERN + ')=(?:"([^"]*)"|\'([^\']*)\')|';
const ATTRIB = new RegExp(ATTRIB_PATTERN, 'g');

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


        res += '(?=[^>]*?\\s' + attr.name;
        var doubleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'double');
        var singleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'single');
        if (!attr.operator) {
             res += '=(?:"[^"]*"|\'[^\']*\'))';
        } else if (attr.operator === '=') {
            res += '=(?:"' + doubleQuoteValuePattern + '"|\''
                        + singleQuoteValuePattern + '\'))';
        } else if (attr.operator === '^=') {
            res += '=(?:"' + doubleQuoteValuePattern + '[^"]*"'
                    + '|\'' + singleQuoteValuePattern + '[^\']*\'))';
        } else if (attr.operator === '$=') {
            res += '=(?:"[^"]*' + doubleQuoteValuePattern + '"'
                    + '|\'[^\']*' + singleQuoteValuePattern + '\'))';
        } else if (attr.operator === '~=') {
            res += '=(?:"(?:[^"]+\\s+)*' + doubleQuoteValuePattern + '(?:\\s+[^"]+)*"'
                    + "|'(?:[^']+\\s)*" + singleQuoteValuePattern + "(?:\\s[^']+)*'))";
        } else if (attr.operator === '*=') {
            res += '=(?:"[^"]*' + doubleQuoteValuePattern + '[^"]*"'
                    + "|'[^']*" + singleQuoteValuePattern + "[^']*'))";
        } else {
            throw new Error("Unsupported attribute predicate: " + attr.operator);
        }
    }
    // console.log(res);
    return res;
};

const TAG_END = new RegExp('\\s*\/?>|', 'g');
Matcher.prototype._matchTagEnd = function(s, index) {
    TAG_END.lastIndex = index;
    TAG_END.exec(s);
    return TAG_END.lastIndex;
};

Matcher.prototype.matchElement = function(s, matches, handler, node) {
    var depth = 1;
    // console.log(node._dsr[1], s.slice(node._dsr[1], node._dsr[1] + 660));
    this._anyTagMatcher.lastIndex = node._dsr[1];
    while (true) {
        var match = this._anyTagMatcher.exec(s);
        if (!match) {
            // throw new Error('Did not find end tag for: ' + handler.nodeName);
            return node._dsr[0];
        }
        if (match[1]) {
            // End tag
            depth--;
            if (depth === 0) {
                if (match[2] === handler.nodeName) {
                    node.outerHTML = s.substring(node._dsr[0], this._anyTagMatcher.lastIndex);
                    node.innerHTML = s.substring(node._dsr[1], match.index);

                    // Call the handler
                    matches.push(handler.handler(node));
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
    var matches = [];
    this._matchRe.lastIndex = 0;
    while (true) {
        var lastEndOffset = this._matchRe.lastIndex;

        // Explicitly match tags & attributes to avoid matching literal
        // `<` in attribute values. These are escaped with `&lt;` in XML,
        // but not HTML5.
        this._otherTagRe.lastIndex = this._matchRe.lastIndex;
        this._otherTagRe.exec(s);
        if (this._otherTagRe.lastIndex === s.length) {
            // All matched to the end. Add remainder to buffer & return.
            matches.push(s.slice(lastEndOffset, s.length));
            break;
        }
        this._matchRe.lastIndex = this._otherTagRe.lastIndex;

        var match = this._matchRe.exec(s);

        if (!match) {
            // Nothing left to process. Append remainder. Two consecutive
            // strings at end signal incomplete matches.
            return {
                matches: matches,
                remainder: s.slice(this._otherTagRe.lastIndex, s.length),
            };
        }

        if (!match[1]) {
            // Start tag.

            // Add HTML string prefix since the previous match.
            matches.push(s.substring(lastEndOffset, match.index));

            // Loook up the handler matching the selector, by group index.
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

            // Match attributes
            var attributeMatch = this._matchAttributes(s, this._matchRe.lastIndex);

            // Match the remainder of the element.
            const elementEndOffset = this.matchElement(s, matches, handlerObj, {
                nodeName: handlerObj.nodeName,
                attributes: attributeMatch.attributes,
                _dsr: [match.index, attributeMatch.endOffset],
                _lastEndOffset: lastEndOffset,
            });
            // matchElement returns the start offset if it couldn't complete a
            // match. In that case, abort further matching & return.
            if (elementEndOffset !== match.index) {
                this._matchRe.lastIndex = elementEndOffset;
            } else {
                return {
                    matches: matches,
                    remainder: s.slice(match.index, s.length),
                };
            }
        }
    }
    // console.log(JSON.stringify(matches, null, 2));

    return {
        matches: matches,
        remainder: null,
    };
};


module.exports = Matcher;
