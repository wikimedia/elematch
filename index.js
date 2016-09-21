'use strict';

/**
 * Fully-featured entrypoint with CSS selector support.
 *
 * For a lightweight client-side version, require 'lib/matcher' instead.
 */

const CssSelectorParser = require('css-selector-parser').CssSelectorParser;
const cssParser = new CssSelectorParser();
cssParser.registerSelectorPseudos('has');
cssParser.registerAttrEqualityMods('^', '~', '$', '*');
const Matcher = require('./lib/matcher.js');

class CSSMatcher extends Matcher {
    constructor(spec) {
        // Convert spec to a Matcher spec.
        if (Array.isArray(spec)) {
            spec.forEach(rule => {
                if (typeof rule.selector === 'string') {
                    rule.selector = CSSMatcher._parseCSSSelector(rule.selector);
                }
            });
        } else if (typeof spec === 'object') {
            spec = Object.keys(spec)
                .map(function(key) {
                    return {
                        handler: spec[key],
                        selector: CSSMatcher._parseCSSSelector(key),
                    };
                });
        }

        super(spec);
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
