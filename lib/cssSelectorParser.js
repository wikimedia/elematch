'use strict';

const SELECTOR_RE = /^\s*([^\[\s]+)\s*(?:\[\s*([^=\^*~\$\s]+)\s*(?:([\^\$~\*]?=)\s*"([^\]]*)"\s*)?\])?\s*$/;

const valueDecodeTable = {
    'n': '\n',
    'r': '\r',
    't': '\t',
    'f': '\f',
    '"': '"',
    '\\': '\\'
};


/**
 * Simple CSS selector parser.
 *
 * Limitations:
 * - Only supports single attribute selector.
 */
function parseCSSSelector(selector) {
    const match = SELECTOR_RE.exec(selector);
    if (!match) {
        throw new Error("Unsupported or invalid CSS selector: " + selector);
    }
    const res = { nodeName: match[1].trim() };
    if (match[2]) {
        const attr = [match[2]];
        if (match[3]) { attr.push(match[3]); }
        // Decode the attribute value
        if(match[4]) {
            attr.push(match[4].replace(/\\([nrtf"\\])/g, function(_, k) {
                return valueDecodeTable[k];
            }));
        }
        res.attributes = [attr];
    }
    return res;
}

module.exports = parseCSSSelector;
