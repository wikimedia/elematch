'use strict';

const assert = require('assert');
const parseCSSSelector = require('../lib/cssSelectorParser');

const testData = [
    {
        input: 'a[href="https://foo.bar"]',
        output: {
            nodeName: 'a',
            attributes: [['href', '=', 'https://foo.bar']]
        }
    }, {
        input: 'a[href*="https://foo.bar"]',
        output: {
            nodeName: 'a',
            attributes: [['href', '*=', 'https://foo.bar']]
        }
    }, {
        input: 'a[href^="https://foo.bar"]',
        output: {
            nodeName: 'a',
            attributes: [['href', '^=', 'https://foo.bar']]
        }
    }, {
        input: ' a[href ~= "https://foo.bar" ]',
        output: {
            nodeName: 'a',
            attributes: [['href', '~=', 'https://foo.bar']]
        }
    }, {
        input: ' a[href ]',
        output: {
            nodeName: 'a',
            attributes: [['href']]
        }
    }, {
        input: ' a ',
        output: {
            nodeName: 'a',
        }
    }, {
        input: ' a[href ~= "\\n\\r\\t\\f\\\\\\"" ]',
        output: {
            nodeName: 'a',
            attributes: [['href', '~=', '\n\r\t\f\\\"']]
        }
    }
];

module.exports = {
    'cssSelectorParser': function() {
        return testData.forEach(pair =>
           assert.deepEqual(parseCSSSelector(pair.input), pair.output)
        );
    }
};
