// FIO-Logging

'use strict';
const AWS = require('aws-sdk');
const cwl = new AWS.CloudWatchLogs();
const _ = require('lodash');
const q_sns = require('../AWS/FIO-AWS-SNS');
const Rollbar = require("rollbar");
var _rollbar;
var rollbarHasBeenInit = false;

const groupName_SignificantErrors = 'FIO-Log-Group-Errors-Significant';
const groupName_InvestigateFurther = 'FIO-Log-Group-InvestigateFurther';
const groupName_Interesting = 'FIO-Log-Group-Interesting';

module.exports = {

    rollbar: _theRollbar(), // expose it
    setRollbarEnv: env => _setRollbarEnv(env),
    interesting: (messageObj, functionName) => _putLogEventWithSequenceToken(messageObj, groupName_Interesting, functionName),
    investigateFurther: (messageObj, functionName) => _putLogEventWithSequenceToken(messageObj, groupName_InvestigateFurther, functionName),
    significantError: (messageObj, functionName) => _putLogEventWithSequenceToken(messageObj, groupName_SignificantErrors, functionName),
    genericPutLogEvent: (messageObj, groupName, streamName) => _putLogEventWithSequenceToken(messageObj, groupName, streamName),
    smsTpf: (msg) => _smsTpf(msg),

};

function _smsTpf(msg) {
    q_sns.publish({
            payload: msg,
            endpointArn: 'arn:aws:sns:us-east-1:475512417340:sms-tpf'
        },
        (err, res) => {
            if (err) console.log('FAILED to sns publish text to tpf: ' + err);
            else console.log(res);
        }
    );
}

function _putLogEventWithSequenceToken(messageObj, groupName, streamName, sequenceToken) {
    console.log('putLogEventWithSequenceToken()');
    console.log('groupName = ' + groupName);
    console.log('streamName = ' + streamName);

    let preppedMessage = JSON.stringify(messageObj, null, 2);
    console.log('MESSAGE:\n' + preppedMessage);

    let params = {
        logGroupName: groupName,
        logStreamName: streamName,
        logEvents: [{
            message: preppedMessage,
            timestamp: Date.now()
        }]
    };

    if (!_.isUndefined(sequenceToken) && !_.isEmpty(sequenceToken))
        params.sequenceToken = sequenceToken;

    // console.log(JSON.stringify(params, null, 2));

    cwl.putLogEvents(params, (err, res) => {

        if (err) {
            if (err.code == 'ResourceNotFoundException' && err.message == 'The specified log group does not exist.') {
                _createLogGroup(groupName, (err, res) => {
                    if (err) console.log(err);
                    else _putLogEventWithSequenceToken(messageObj, groupName, streamName);
                });
            }
            else if (err.code == 'ResourceNotFoundException' && err.message == 'The specified log stream does not exist.') {
                _createLogStream(groupName, streamName, (err, res) => {
                    if (err) console.log(err);
                    else _putLogEventWithSequenceToken(messageObj, groupName, streamName);
                });
            }
            else if (err.code == 'DataAlreadyAcceptedException') {
                _getSequenceToken(groupName, streamName, (err, newSequenceToken) => {
                    if (err) console.log(err);
                    else _putLogEventWithSequenceToken(messageObj, groupName, streamName, newSequenceToken);
                });
            }
            else if (err.code == 'InvalidSequenceTokenException') {
                // "The given sequenceToken is invalid. The next expected sequenceToken is: 49590642936978815254013931168165128425698134452890372338"
                let newSequenceToken = _.chain(err.message).split(":").last().trim().value() || '';
                console.log('newSequenceToken = ' + newSequenceToken);
                _putLogEventWithSequenceToken(messageObj, groupName, streamName, newSequenceToken);
            }
            else console.log('ERROR in putLogEvents:\n' + JSON.stringify(err, null, 2));
        }
    });
}

function _createLogGroup(groupName, callback) { cwl.createLogGroup({ logGroupName: groupName, }, callback) }

function _createLogStream(groupName, streamName, callback) {
    console.log('Creating log stream: ' + streamName);

    cwl.createLogStream({
        logGroupName: groupName,
        logStreamName: streamName
    }, callback);
}

function _getSequenceToken(logGroupName, streamName, callback) {
    console.log('Getting sequence token.');

    let params = {
        logGroupName: logGroupName,
        limit: 1,
        logStreamNamePrefix: streamName,
    };

    cwl.describeLogStreams(params, (err, data) => {
        if (err) callback(err);
        else {
            let stream = _.first(data.logStreams);
            let sequenceToken = _.get(stream, 'uploadSequenceToken');
            console.log('sequenceToken = ' + sequenceToken);
            callback(null, sequenceToken);
        }
    });
}

function _theRollbar() {
    if (!rollbarHasBeenInit) initRollbar();
    return _rollbar;
}

function initRollbar() {
    console.log("*** Rollbar Initialize ***");
    _rollbar = new Rollbar({
        accessToken: '2e4f2dab62b9402c8cf90106d2d2fd96',
        captureUncaught: true,
        captureUnhandledRejections: true,
        environment: 'unconfigured'
    });
    rollbarHasBeenInit = true;
}

function _setRollbarEnv(env) {
    if (env.toLowerCase() == "test" || env.toLowerCase() == "dev" || env.toLowerCase() == "development") env = "development";
    else env = "production";
    _rollbar.configure({ environment: env });
    // _rollbar.configure({ environment: environment, payload: { context: context } });
}

// // reports a string message at the specified level, along with a request and callback
// // only the first param is required
// rollbar.debug("Response time exceeded threshold of 1s", request, callback);
// rollbar.info("Response time exceeded threshold of 1s", request, callback);
// rollbar.warning("Response time exceeded threshold of 1s", request, callback);
// rollbar.error("Response time exceeded threshold of 1s", request, callback);
// rollbar.critical("Response time exceeded threshold of 1s", request, callback);
