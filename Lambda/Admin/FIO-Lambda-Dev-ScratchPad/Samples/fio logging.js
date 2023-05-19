'use strict';

// FIO-Lambda-Dev-ScratchPad

const AWS = require('aws-sdk');
// const ddb = new AWS.DynamoDB();
// const _ = require('lodash');
// const _async = require('async');
const qlib = require('./QuantaLib/FIO-QuantaLib');

exports.handler = (event, context, callback) => {
    // let groupName = 'FIO-Log-Group-Errors-Significant';
    // log.putLogEvent('test test test, this is a test, WONDER WOMAN!!!!', groupName, context.functionName, callback);

    let msg = {
        propOne: 'hi prop one',
        propTwo: 'hi prop two',
        propThree: {
            propThreeA: 'you oyafew;fklaw',
            propThreeB: 'afewklaghklajewfhklajewhflkajewfhl'
        }
    };

    qlib.log.interesting(msg, 'hihohidyho()', callback);
};
