'use strict';

const parseCSSSelector = require('./cssSelectorParser');

// Shared patterns
const optionalAttributePattern = '(?:\\s+[a-zA-Z_-]+(?:=(?:"[^"]*"|\'[^\']*\'))?)*';
const remainingTagAssertionPattern = `(?=${optionalAttributePattern}\\s*\\/?>)`;
const remainingTagCloseCapturePattern = `${optionalAttributePattern}\\s*(\\/?)>`;
const remainingTagPattern = `${optionalAttributePattern}\\s*\\/?>`;

// https://www.w3.org/TR/html-markup/syntax.html#syntax-attributes:
// Attribute names must consist of one or more characters other than the space
// characters, U+0000 NULL, """, "'", ">", "/", "=", the control characters,
// and any characters that are not defined by Unicode.
const ATTRIB_NAME_PATTERN = '[^\\s\\0"\'>/=\x00-\x1F\x7F-\x9F]+';
const ATTRIB_PATTERN = `\\s+(${ATTRIB_NAME_PATTERN})=(?:"([^"]*)"|'([^']*)')|`;
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

// Entity decoding. We only support the small set of entities actually used by
// HTML5 serialized as UTF8.
const entityDecodeMap = {
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
};
function decodeEntities(s) {
    return s.replace(/&[#a-zA-Z0-9]+;/g, function(match) {
        const decoded = entityDecodeMap[match];
        if (!decoded) {
           throw new Error("Unsupported entity: " + match);
        }
        return decoded;
    });
}


/**
 * Element matcher.
 */
class Matcher {

     /* Construct a Matcher instance.
      *
      * @param {array|Matcher} spec. One of:
      *   1) An array of rule definitions:
      *      - A `selector` {object} definition, containing
      *        - a `nodeName` {string}, and (optionally)
      *        - `attributes, an array of attribute match definitions:
      *           - `name`: The attribute name.
      *           - `operator`: One of "=", "^=" etc.
      *           - `value`: Expected attribute value or pattern.
      *      - A `handler`, function(node, ctx)
      *      - Optionally, a `stream` boolean. When set, the handler is passed
      *      `innerHTML` and `outerHTML` as a `ReadableStream` instance.
      *   2) A Matcher instance. In this case, the spec & pre-compiled
      *      matchers of that instance are reused, which is significantly more
      *      efficient. Match state and options are unique to the new
      *      instance.
      * @param {object} options (optional)
      *      - {boolean} matchOnly (optional): Only include matches in the values; drop
      *      unmatched content.
      *      - {object} ctx (optional): A context object passed to handlers.
      */
    constructor(spec, reader, options) {
        this._reader = reader;
        if (reader && reader.getReader) {
            // ReadableStream
            this._reader = reader.getReader();
        }
        this._options = options || {};
        if (spec instanceof Matcher) {
            // Share general spec & matchers.
            this._spec = spec._spec;
            this._re = spec._re;

        } else {
            // TODO: Move spec format closer to _handlers, so that we can accept
            // selectors as both string & object.
            this._spec = this._normalizeSpec(spec);
            this._re = {};
            this._makeMatchers(spec);
            // Efficient matcher for random Tags.
            this._re.anyTag = new RegExp(`<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)${remainingTagCloseCapturePattern}`, 'g');
        }

        this._reset();
    }

    _normalizeSpec(spec) {
        // Convert spec to a Matcher spec.
        if (Array.isArray(spec)) {
            spec.forEach(rule => {
                if (typeof rule.selector === 'string') {
                    rule.selector = parseCSSSelector(rule.selector);
                }
            });
        }
        return spec;
    }

    _reset() {
        // Reset match state.
        this._activeMatcher = null;
        this._activeMatcherArgs = null;
        this._input = '';
        this._lastIndex = 0;
        this._matches = [];
    }

    cancel() {
        this._reset();
        if (this._reader && this._reader.cancel) {
           this._reader.cancel();
        }
    }

    read() {
        return this._reader.read()
        .then(res => {
            if (res.done) {
                if (this._matches.length) {
                    const matches = this._matches;
                    this._matches = [];
                    return {
                        value: matches,
                        done: false
                    };
                }
                if (this._input) {
                    const e = new Error("Incomplete match.");
                    e.remaining_input = this._input;
                    this._reset();
                    throw e;
                }
                return res;
            }
            const matchRes = this._match(res.value);
            if (!matchRes.done && matchRes.value.length === 0) {
                // Read some more until we can return something.
                return this.read();
            }
            if (matchRes.done && matchRes.value) {
                matchRes.done = false;
            }
            return matchRes;
        });
    }

    matchSync(input) {
        this._reset();
        const res = this._match(input);
        if (!res.done) {
            this._reset();
            throw new Error("Incomplete match.");
        }
        return res.value;
    }

    /**
     * Match a document, a chunk at a time.
     *
     * @param {string} chunk
     * @return {object}
     *   - {array<string|mixed>} value, an array of literal strings
     *   interspersed with handler return values for matches.
     *   - {boolean} done, whether the matcher has matched a complete
     *   document.
     */
    _match(chunk) {
        const re = this._re;
        this._input += chunk;
        this._lastIndex = 0;

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

        const matches = this._matches;
        this._matches = [];
        return {
            value: matches,
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
                    attributes,
                    outerHTML: this._input.slice(re.otherTag.lastIndex, this._lastIndex),
                    innerHTML: '',
                };
                if (args.rule.stream) {
                    args.node.outerHTML = new ReadableStream({
                        start: controller => {
                            controller.enqueue(args.node.outerHTML);
                            args.outerHTMLController = controller;
                        },
                        pull: controller => {
                            this._reader.read()
                            .then(res => {
                                if (res.done) {
                                    controller.end();
                                }
                                this._matches = this._match(res.value).value;
                            });
                        }
                    });
                    args.node.innerHTML = new ReadableStream({
                        start: controller => {
                            args.innerHTMLController = controller;
                        },
                        pull: controller => {
                            this._reader.read()
                            .then(res => {
                                if (res.done) {
                                    controller.end();
                                }
                                this._matches = this._match(res.value).value;
                            });
                        }
                    });
                    // Call the handler
                    this._matches.push(args.rule.handler(args.node, this._options.ctx));
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

            if (match[2] === args.rule.selector.nodeName) {
                if (match[1]) {
                    // End tag
                    args.depth--;
                    if (args.depth === 0) {
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
                            this._matches.push(args.rule.handler(args.node, this._options.ctx));
                        }

                        this._lastIndex = re.anyTag.lastIndex;
                        this._activeMatcher = null;
                        this._activeMatcherArgs = null;
                        return;
                    }
                } else if (!match[3]) {
                    // Start tag.
                    args.depth++;
                }
            }
        }
    }

    _matchAttributes() {

        ATTRIB.lastIndex = this._lastIndex;
        const attributes = {};
        while (true) {
            const match = ATTRIB.exec(this._input);
            if (match[0].length === 0) {
                break;
            }
            let val = match[2] || match[3];
            if (val.indexOf('&') !== -1) {
                // Decode HTML entities
                val = decodeEntities(val);
            }
            attributes[match[1]] = val;
        }
        this._lastIndex = ATTRIB.lastIndex;
        return attributes;
    }

    _makeMatchers(spec) {
        const self = this;
        this._spec = spec;
        this.lastIndex = 0;
        // Need:
        // - Start tag matcher. Safe, as '<' is always escaped, including
        // attributes.
        // - Random tag matcher. Match as long as level reaches zero.


        const tagMatchPatterns = spec
            .map(rule => self._compileTagMatcher(rule.selector));

        const commentMatchPattern = '!--(?:[^-]*(?:-(?!->))?)*-->';

        // A matcher for the tags we are *not* interested in. Used in HTML5 mode.
        this._re.otherTag = new RegExp(`[^<]*(?:<(?:[\\/! ]*(?!${tagMatchPatterns
        .map(pattern => '(?:' + pattern + ')')
        .join('|')})[a-zA-Z][a-zA-Z0-9_-]*${remainingTagPattern}|${commentMatchPattern})[^<]*)*`, 'g');

        // A matcher for the tags we *are* actually interested in.
        this._re.targetTag = new RegExp(`<(\\/?)(?:${tagMatchPatterns
        .map(pattern => '(' + pattern + ')')
        .join('|')})${remainingTagAssertionPattern}`, 'g');
    }

    _quoteAttributeValue(s, mode) {
        if (/[<'">&]/.test(s)) {
            const map = attrValReplacements[mode];
            // Escape any regexp chars in the value
            s = escapeRegex(s);
            return s.replace(/[<'">&]/g, m => map[m]);
        } else {
            return s;
        }
    }

    _compileTagMatcher(selector) {
        //console.log(JSON.stringify(selector, null, 2));
        if (!selector.nodeName) {
            throw new Error("Only matches for fixed tag names are supported for now!");
        }
        const attributes = selector.attributes;
        let res = selector.nodeName || '';
        if (attributes && attributes.length) {
            if (attributes.length > 1) {
                throw new Error("Only a single attribute match is supported for now!");
            }
            const attributeSelector = attributes[0];
            // Only match on the first attribute
            const attr = {
                name: attributeSelector[0],
                operator: attributeSelector[1],
                value: attributeSelector[2]
            };

            res += `(?=[^>]*?\\s${attr.name}`;
            const doubleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'double');
            const singleQuoteValuePattern = this._quoteAttributeValue(attr.value, 'single');
            if (!attr.operator) {
                 res += '=(?:"[^"]*"|\'[^\']*\'))';
            } else if (attr.operator === '=') {
                res += `=(?:"${doubleQuoteValuePattern}"|'${singleQuoteValuePattern}'))`;
            } else if (attr.operator === '^=') {
                res += `=(?:"${doubleQuoteValuePattern}[^"]*"|'${singleQuoteValuePattern}[^']*'))`;
            } else if (attr.operator === '$=') {
                res += `=(?:"[^"]*${doubleQuoteValuePattern}"|'[^']*${singleQuoteValuePattern}'))`;
            } else if (attr.operator === '~=') {
                res += `=(?:"(?:[^"]+\\s+)*${doubleQuoteValuePattern}(?:\\s+[^"]+)*"|'(?:[^']+\\s)*${singleQuoteValuePattern}(?:\\s[^']+)*'))`;
            } else if (attr.operator === '*=') {
                res += `=(?:"[^"]*${doubleQuoteValuePattern}[^"]*"|'[^']*${singleQuoteValuePattern}[^']*'))`;
            } else {
                throw new Error(`Unsupported attribute predicate: ${attr.operator}`);
            }
        }
        return res;
    }
}

module.exports = Matcher;
