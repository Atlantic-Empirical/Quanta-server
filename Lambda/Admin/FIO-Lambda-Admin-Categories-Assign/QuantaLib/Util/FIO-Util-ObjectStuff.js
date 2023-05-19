// FIO-Util-ObjectStuff

'use strict';
const _ = require('lodash');

module.exports = {

    compactObject: obj => _compactObject(obj),
    financial: obj => _financial(obj),
    financialString: obj => _financialString(obj),
    mapReduce: (obj, propertyName) => _mapReduce(obj, propertyName),
    mapUnique: (obj, propertyName) => _mapUnique(obj, propertyName),
    mapReduceFinancial: (obj, propertyName) => _mapReduceFinancial(obj, propertyName),
    mapMeanFinancial: (obj, propertyName) => _mapMeanFinancial(obj, propertyName),
    percentage: obj => _percentage(obj),
    removeEmpty: obj => _removeEmpty(obj),
    caseInvariantEndStringRemove: (inString, stringToRemove) => _caseInvariantEndStringRemove(inString, stringToRemove),
    traverseLogObject: obj => _traverseLogObject(obj),
    emojiNumberForChar: (char) => _emojiNumberForChar(char),
    toTitleCase: (str) => _toTitleCase(str),
    isNilOrEmpty: (o, path) => _isNilOrEmpty(o, path),

};

function _toTitleCase(str) {
    if (_.isNil(str) || _.isEmpty(str)) return "";
    else return str.replace(
        /\w\S*/g,
        function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function _isNilOrEmpty(o, path) {
    if (!_.has(o, path)) return false;
    let o1 = _.get(o, path);
    return _.isNil(o1) || _.isEmpty(o1);
}

function _financial(x) {
    var asString = Number.parseFloat(x).toFixed(2);
    var backToNumber = Number.parseFloat(asString);
    return backToNumber;
}

function _financialString(n) {
    return _financial(n).toLocaleString('en', { minimumFractionDigits: 2 });
}

function _emojiNumberForChar(char) {

    switch (char) {

        case '1':
            return '1️⃣';
        case '2':
            return '2️⃣';
        case '3':
            return '3️⃣';
        case '4':
            return '4️⃣';
        case '5':
            return '5️⃣';
        case '6':
            return '6️⃣';
        case '7':
            return '7️⃣';
        case '8':
            return '8️⃣';
        case '9':
            return '9️⃣';
        case '0':
            return '0️⃣';
    }
}

function _mapReduce(a, property) {

    return _
        .chain(a)
        .map(property)
        .filter(v => !_.isNil(v)) // .compact() is not safe for financial values because it smushes 0 as falsey
        .reduce((m, i) => m + i)
        .round(2)
        .value() || 0;
}

function _mapUnique(a, property) {

    return _
        .chain(a)
        .map(property)
        .filter(v => !_.isNil(v)) // .compact() is not safe for financial values because it smushes 0 as falsey
        .flatten()
        .uniq()
        .value();
}

function _mapReduceFinancial(a, property) {

    return _
        .chain(a)
        .map(property)
        .filter(v => !_.isNil(v)) // .compact() is not safe for financial values because it smushes 0 as falsey
        .reduce((m, i) => m + i)
        .round(2)
        .value() || 0;
}

function _mapMeanFinancial(obj, propertyName) {
    return _
        .chain(obj)
        .map(propertyName)
        .filter(v => !_.isNil(v)) // .compact() is not safe for financial values because it smushes 0 as falsey
        .mean()
        .round(2)
        .value() || 0;
}

function _percentage(x) {
    return _.floor(x, 4);
}

function _compactObject(obj) {
    // console.log('compactObject start: ' + JSON.stringify(obj, null, 2));
    // console.log(JSON.stringify(obj));

    if (_.isArray(obj) || _.isPlainObject(obj)) {
        // console.log('isArray or isPlainObject');

        if (_.isArray(obj)) { obj = _.compact(obj) }

        _.each(obj, (val, key) => {

            if (deleteObjectCheck(val)) {
                // console.log('deleting @ ' + key);
                delete obj[key];
            }
            else {
                // console.log('recursing @ ' + key);
                obj[key] = _compactObject(val);
                if (deleteObjectCheck(obj[key])) {
                    // console.log('deleting @ ' + key);
                    delete obj[key];
                }
            }
        });
    }

    return obj;
}

function deleteObjectCheck(obj) {
    // console.log('delete checking ' + JSON.stringify(obj));

    if (_.isNull(obj)) { return true }
    if (_.isUndefined(obj)) { return true }
    if (_.isPlainObject(obj) && _.isEmpty(obj)) { return true }

    // console.log('false');
    return false;
}

// Recursively removes undefined leafs in a string keyed object
const _removeEmpty = (obj) => {
    Object.keys(obj).forEach(key => {
        if (obj[key] && typeof obj[key] === 'object') _removeEmpty(obj[key]);
        else if (obj[key] === undefined) delete obj[key];
    });
    return obj;
};

function _caseInvariantEndStringRemove(inString, stringToRemove) {

    if (_.endsWith(inString.toLowerCase(), stringToRemove)) {
        inString = _.truncate(inString, {
            'length': inString.length - stringToRemove.length,
            'omission': ''
        });
    }

    return inString;
}

function _traverseLogObject(obj) {
    _.forIn(obj, (val, key) => {
        console.log(key, val);
        if (_.isArray(val)) val.forEach(E => _traverseLogObject(E));
        else if (_.isObject(key)) _traverseLogObject(obj[key]);
    });
}
