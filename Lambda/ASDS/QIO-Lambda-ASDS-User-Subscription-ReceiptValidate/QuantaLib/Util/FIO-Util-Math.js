// FIO-Util-Math

'use strict';
const _ = require('lodash');
// const _async = require('async');

module.exports = {

    stdDev: numbers => _stdDev(numbers),
    relativeStandardDeviation: (standardDeviation, avg) => _relativeStdDev(standardDeviation, avg),
    isOdd: num => _isOdd(num),
    statsForNumberSet: (numbers, roundFactor) => _statsForNumberSet(numbers, roundFactor),
    randomInt: (max) => _randomInt(max = Infinity),
    coinFlip: () => _coinFlip,

};

const _isOdd = (num) => (num % 2) == 1;
const _randomInt = (max) => Math.floor(Math.random() * Math.floor(max));
const _coinFlip = () => (Math.floor(Math.random() * 2) == 0);

function _relativeStdDev(stdDev, avg) {
    let out = _.round((100 * stdDev) / avg, 2);
    if (_.isNaN(out)) out = 0;
    return out;
}

function _stdDev(numbers) {
    // console.log(numbers);

    let avg = _.mean(numbers);
    // console.log('shittttt: ' + avg);
    avg = Math.abs(avg);
    // console.log('fuck afvg: ' + avg);

    let diffs = _.map(numbers, n => Math.pow(n - avg, 2));
    // console.log(diffs);
    let sumOfDiffs = _.reduce(diffs, (m, i) => m + i);
    // console.log('fucking: ' + sumOfDiffs);

    let v = sumOfDiffs / (numbers.length - 1);
    // console.log('gdi: ' + v);

    let out = _.round(Math.sqrt(v), 2);
    if (_.isNaN(out)) out = 0;
    // console.log('out: ' + out);

    return out;
}

function _statsForNumberSet(numbers, roundFactor = 2) {

    let out = {};
    out.mean = _.chain(numbers).mean().round(roundFactor).value();
    out.standardDeviation = _stdDev(numbers);
    out.relativeStandardDeviationPct = _relativeStdDev(out.standardDeviation, out.mean);
    out.sum = _.sum(numbers);

    // console.log('amountAnalysis_spend = \n' + JSON.stringify(out, null, 2));
    return out;
}
