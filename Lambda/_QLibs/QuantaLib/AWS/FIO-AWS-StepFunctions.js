// FIO-AWS-StepFunctions

'use strict';
const AWS = require('aws-sdk');
const sf = new AWS.StepFunctions();
const _ = require('lodash');

module.exports = {

    getExecutions: (arn, state, callback) => _getExecutions(arn, state, callback),
    launchStep: (machineArn, inputObj, callback, name) => _launchStep(machineArn, inputObj, callback, name),
    describeExecution: (arn, callback) => _describeExecution(arn, callback),

};

function _describeExecution(arn, callback) {
    sf.describeExecution({ executionArn: arn }, (err, res) => {
        if (err) callback(err);
        else {
            // console.log("\nhttps://console.aws.amazon.com/states/home?region=us-east-1#/executions/details/" + res.executionArn);
            if (res.status == "RUNNING" || res.status == "SUCCEEDED") callback(null, res.status);
            else callback(err, "FAILED"); // include TIMED_OUT and ABORTED here
        }
    });
}

function _getExecutions(arn, state, callback, nextToken = undefined, accumulator = []) {

    var params = {
        stateMachineArn: arn,
        maxResults: 0,
        statusFilter: state.toUpperCase()
    };

    if (!_.isUndefined(nextToken))
        params.nextToken = nextToken;

    sf.listExecutions(params, (err, data) => {
        if (err) {
            console.log('ERROR in listExecutions: ' + err);
            callback(err);
        }
        else {
            accumulator.push(...data.executions);
            if (data.nextToken)
                _getExecutions(arn, state, callback, data.nextToken, accumulator);
            else
                callback(null, accumulator);
        }
    });
}

function _launchStep(machineArn, inputObj, callback, name) {
    var params = { stateMachineArn: machineArn };
    if (!_.isUndefined(inputObj)) params.input = JSON.stringify(inputObj);
    if (!_.isUndefined(name)) params.name = name;
    sf.startExecution(params, callback);
}
