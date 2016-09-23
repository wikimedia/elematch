'use strict';

// XXX: Only include this when using node. Skip when compiling with
// browserify.
const ReadableStream = require('node-web-streams').ReadableStream;

// XXX: We don't really need a full set of attributes for most content, and
// this module is rather large for client-side use. Use a small inline
// definition along the lines of attrValReplacements instead?
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();

// Shared patterns
const optionalAttributePattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:"[^"]*"|\'[^\']*\'))?)*';
const remainingTagAssertionPattern = '(?=' + optionalAttributePattern + '\\s*\\/?>)';
const remainingTagCloseCapturePattern = optionalAttributePattern + '\\s*(\\/?)>';
const remainingTagPattern = optionalAttributePattern + '\\s*\\/?>';

// https://www.w3.org/TR/html-markup/syntax.html#syntax-attributes:
// Attribute names must consist of one or more characters other than the space
// characters, U+0000 NULL, """, "'", ">", "/", "=", the control characters,
// and any characters that are not defined by Unicode.
const ATTRIB_NAME_PATTERN = '[^\\s\\0"\'>/=\x00-\x1F\x7F-\x9F]+';
const ATTRIB_PATTERN = '\\s+(' + ATTRIB_NAME_PATTERN + ')=(?:"([^"]*)"|\'([^\']*)\')|';
const ATTRIB = new RegExp(ATTRIB_PATTERN, 'g');
const TAG_END = new RegExp('\\s*\/?>|', 'g');

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


/**
 * Element matcher.
 */
class Matcher {

     /* @param {object} options (optional)
     *      - {boolean} matchOnly: Only include matches in the value; drop
     *      unmatched content.
     */
    constructor(spec, options) {
        this._options = options || {};
        if (spec instanceof Matcher) {
            // Share general spec & matchers.
            this._spec = spec._spec;
            this._re = spec._re;

        } else {
            // TODO: Move spec format closer to _handlers, so that we can accept
            // selectors as both string & object.
            this._spec = spec;
            this._re = {};
            this._makeMatchers(spec);
            // Efficient matcher for random Tags.
            this._re.anyTag = new RegExp('<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)'
                    + remainingTagCloseCapturePattern, 'g');
        }

        // Set up match state.
        this._activeMatcher = null;
        this._activeMatcherState = null;
        this._input = '';
        this._lastIndex = 0;
        this._matches = [];
    }

    clone() {
        return new Matcher(this);
    }

    reset() {
        this._input = '';
        this._lastIndex = 0;
        this._activeMatcher = null;
        this._activeMatcherArgs = null;
    }

    /**
     * Match a document, a chunk at a time.
     *
     * @param {string} chunk
     * @return {object}
     *   - {array<string|mixed>} value, an array of literal strings
     *   interspersed with handler return value for matches.
     *   - {boolean} done, whether the matcher has matched a complete
     *   document.
     */
    match(chunk, options) {
        options = options || {};
        const re = this._re;
        this._input += chunk;
        this._lastIndex = 0;
        this._matches = [];

        // Main document parse loop.
        let prevIndex;
        do {
            prevIndex = this._lastIndex;
            if (!this._activeMatcher) {
                // Explicitly match tags & attributes to avoid matching literal
                // `<` in attribute values. These are escaped with `&lt;` in XML,
                // but not HTML5.
                re.otherTag.lastIndex = this._lastIndex;
                re.otherTag.exec(this._input);
                if (re.otherTag.lastIndex !== this._lastIndex) {
                    // Matched some content.
                    if (!this._options.matchOnly) {
                        // Add to matches.
                        this._matches.push(this._input.slice(this._lastIndex,
                            re.otherTag.lastIndex));
                    }
                    this._lastIndex = re.otherTag.lastIndex;
                }
                if (re.otherTag.lastIndex === this._input.length) {
                    // All done.
                    this._lastIndex = 0;
                    this._input = '';
                    break;
                }
                this._activeMatcherArgs = null;
                prevIndex = this._lastIndex;
            }

            this._matchElement();
        } while (this._lastIndex !== prevIndex);

        return {
            value: this._matches,
            done: this._lastIndex === this._input.length
        };
    }

    _matchTagEnd() {
        TAG_END.lastIndex = this._lastIndex;
        TAG_END.exec(this._input);
        this._lastIndex = TAG_END.lastIndex;
    }

    _matchElement() {
        let args = this._activeMatcherArgs;
        const re = this._re;
        if (!args) {
            // First call.
            re.targetTag.lastIndex = this._lastIndex;

            // TODO: Move this to matchElement!
            // Try to match a target tag.
            const targetMatch = re.targetTag.exec(this._input);
            // Match the remainder of the element.

            if (!targetMatch) {
                // Can't match a targetTag yet. Wait for more input.
                this._input = this._input.slice(this._lastIndex);
                this._lastIndex = 0;
                return;
            }

            this._activeMatcher = this._matchElement;
            this._lastIndex = re.targetTag.lastIndex;

            if (!targetMatch[1]) {
                // Start tag.

                // The attribute match is guaranteed to complete, as our targetTag
                // regexp asserts that the entire tag (incl attributes) is
                // available.
                const attributes = this._matchAttributes();
                // Consume the tag end & update this._lastIndex
                this._matchTagEnd();

                // Set up elementMatcherArgs
                this._activeMatcherArgs = args = {};
                // Look up the handler matching the selector, by group index.
                for (let i = 2; i < targetMatch.length; i++) {
                    let tagMatch = targetMatch[i];
                    if (tagMatch !== undefined) {
                        args.rule = this._spec[i-2];
                        break;
                    }
                }
                args.node = {
                    nodeName: args.rule.selector.nodeName,
                    attributes: attributes,
                    outerHTML: this._input.slice(re.otherTag.lastIndex, this._lastIndex),
                    innerHTML: '',
                };
                if (args.rule.stream) {
                    args.node.outerHTML = new ReadableStream({
                        start(controller) {
                            controller.enqueue(args.node.outerHTML);
                            args.outerHTMLController = controller;
                        }
                    });
                    args.node.innerHTML = new ReadableStream({
                        start(controller) {
                            args.innerHTMLController = controller;
                        }
                    });
                    // Call the handler
                    this._matches.push(args.rule.handler(args.node));
                }
                args.depth = 1;
            } else {
                throw new Error("Stray end tag!");
            }
        }

        re.anyTag.lastIndex = this._lastIndex;

        while (true) {
            const lastAnyIndex = re.anyTag.lastIndex;
            const match = re.anyTag.exec(this._input);
            if (!match) {
                // Can't complete a match.
                if (this._lastIndex) {
                    if (args.rule.stream) {
                        const chunk = this._input.substring(this._lastIndex,
                            lastAnyIndex);
                        args.outerHTMLController.enqueue(chunk);
                        args.innerHTMLController.enqueue(chunk);
                        this._input = this._input.slice(lastAnyIndex);
                        this._lastIndex = 0;
                    } else {
                        // Hold onto the entire input for the element.
                        this._input = this._input.slice(this._lastIndex);
                        this._lastIndex = 0;
                    }
                }
                return;
            }
            if (match[1]) {
                // End tag
                args.depth--;
                if (args.depth === 0) {
                    if (match[2] === args.rule.selector.nodeName) {
                        const outerChunk = this._input.substring(this._lastIndex,
                                re.anyTag.lastIndex);
                        const innerChunk = this._input.substring(this._lastIndex, match.index);
                        if (args.rule.stream) {
                            args.outerHTMLController.enqueue(outerChunk);
                            args.outerHTMLController.close();
                            args.innerHTMLController.enqueue(innerChunk);
                            args.innerHTMLController.close();
                        } else {
                            args.node.outerHTML += outerChunk;
                            args.node.innerHTML += innerChunk;
                            // Call the handler
                            this._matches.push(args.rule.handler(args.node));
                        }

                        this._lastIndex = re.anyTag.lastIndex;
                        this._activeMatcher = null;
                        this._activeMatcherArgs = null;
                        return;
                    } else {
                        throw new Error("Mis-matched end tag: Expected "
                                + JSON.stringify(args.rule.selector.nodeName)
                                + ', got ' + JSON.stringify(match[2]) + '.');
                    }
                }
            } else if (!match[3]) {
                // Start tag.
                args.depth++;
            }
        }
    }

    _matchAttributes() {

        ATTRIB.lastIndex = this._lastIndex;
        var attributes = {};
        while (true) {
            var match = ATTRIB.exec(this._input);
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
        this._lastIndex = ATTRIB.lastIndex;
        return attributes;
    }

    _makeMatchers(spec) {
        var self = this;
        this._spec = spec;
        this.lastIndex = 0;
        // Need:
        // - Start tag matcher. Safe, as '<' is always escaped, including
        // attributes.
        // - Random tag matcher. Match as long as level reaches zero.


        var tagMatchPatterns = spec
            .map(function(rule) {
                return self._compileTagMatcher(rule.selector);
            });

        var commentMatchPattern = '!--(?:[^-]*(?:-(?!->))?)*-->';

        // A matcher for the tags we are *not* interested in. Used in HTML5 mode.
        this._re.otherTag = new RegExp('[^<]*(?:<(?:[\\/! ]*(?!'
            + tagMatchPatterns
                .map(function(pattern) {
                    return '(?:' + pattern + ')';
                })
                .join('|')
                + ')[a-zA-Z][a-zA-Z0-9_-]*' + remainingTagPattern
                + '|' + commentMatchPattern + ')[^<]*)*', 'g');

        // A matcher for the tags we *are* actually interested in.
        this._re.targetTag = new RegExp('<(\\/?)(?:'
            + tagMatchPatterns
                .map(function(pattern) {
                    return '(' + pattern + ')';
                })
                .join('|')
                + ')' + remainingTagAssertionPattern, 'g');
    }

    _quoteAttributeValue(s, mode) {
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
    }

    _compileTagMatcher(selector) {
        //console.log(JSON.stringify(selector, null, 2));
        if (!selector.nodeName) {
            throw new Error("Only matches for fixed tag names are supported for now!");
        }
        var attributes = selector.attributes;
        var res = selector.nodeName || '';
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
        return res;
    }
}

module.exports = Matcher;
