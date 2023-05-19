'use strict';
// FIO-Lambda-Dev-ScratchPad

const _ = require("lodash");
const _async = require("async");
const qlib = require("./QuantaLib/FIO-QuantaLib");
const qplaid = require("./QuantaPlaid/FIO-Plaid");
const fuzz = require('fuzzball');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    let s1 = "C5739 NATIONSWEL DIR DEP";
    let s2 = "C 5739 Nationswel Dir Dep";
    let s3 = "";

    let fuzz_ratio = fuzz.ratio(s1, s2);
    callback(null, fuzz_ratio);
});
