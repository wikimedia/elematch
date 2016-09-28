'use strict';

/**
 * Fully-featured entrypoint with CSS selector support.
 *
 * For a lightweight client-side version, require 'lib/matcher' instead.
 */

// Shim ReadableStream in node
if (global && !global.ReadableStream) {
    global.ReadableStream = require('node-web-streams').ReadableStream;
}

const CssSelectorParser = require('css-selector-parser').CssSelectorParser;
const cssParser = new CssSelectorParser();
cssParser.registerSelectorPseudos('has');
cssParser.registerAttrEqualityMods('^', '~', '$', '*');
const Matcher = require('./lib/matcher.js');

class CSSMatcher extends Matcher {
     /* Construct a CSSMatcher instance.
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
        // Convert spec to a Matcher spec.
        if (Array.isArray(spec)) {
            spec.forEach(rule => {
                if (typeof rule.selector === 'string') {
                    rule.selector = CSSMatcher._parseCSSSelector(rule.selector);
                }
            });
        } else if (typeof spec === 'object'
            && !(spec instanceof CSSMatcher)
            && !(spec instanceof Matcher)) {
            spec = Object.keys(spec)
                .map(key => ({
                handler: spec[key],
                selector: CSSMatcher._parseCSSSelector(key)
            }));
        }

        super(spec, reader, options);
    }

    static _parseCSSSelector(selector) {
        selector = cssParser.parse(selector).rule;
        if (selector.type &&
            (selector.type !== 'ruleSet' && selector.type !== 'rule')) {
            throw new Error('Only simple attribute value matches like '
                + 'a[href="foo"] supported for now!');
        }
        // Normalize the selector to use nodeName / attributes
        return {
            nodeName: selector.tagName,
            attributes: selector.attrs,
        };
    }
}

module.exports = CSSMatcher;
