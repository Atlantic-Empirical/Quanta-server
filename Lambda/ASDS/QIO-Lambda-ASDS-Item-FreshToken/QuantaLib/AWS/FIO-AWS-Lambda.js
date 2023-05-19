// FIO-AWS-Lambda

'use strict';
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const _ = require("lodash");

module.exports = {

    invoke: (name, callback, payload, requestResponse) => _invoke(name, callback, payload, requestResponse),
    createFunction: (name, zip, memory, timeout, description) => _createFunction(name, zip, memory, timeout, description),
    deleteFunction: (name) => _deleteFunction(name),

};

function _deleteFunction(name) {
    lambda.deleteFunction({ FunctionName: name }, (err, data) => {
        if (err) console.log(err, err.stack);
        else console.log(data);
    });
}

function _createFunction(name, zip, memory = 128, timeout = 30, description = "") {
    lambda.createFunction({
        Code: { ZipFile: zip },
        Description: description,
        FunctionName: name,
        Handler: "index.handler",
        MemorySize: memory,
        Publish: true,
        Role: "arn:aws:iam::475512417340:role/Role-Chedda-Lambda",
        Runtime: "nodejs8.10",
        Timeout: timeout,
        DeadLetterConfig: { TargetArn: "arn:aws:sqs:us-east-1:475512417340:FIO-Queue-LambdaDeadLetters" },
        TracingConfig: { Mode: "Active" }
    }, (err, data) => {
        if (err) console.log(err, err.stack);
        else console.log(data);
    });
}

function _invoke(name, callback, payload, requestResponse = false) {
    var params = {
        FunctionName: name,
        InvocationType: requestResponse ? 'RequestResponse' : 'Event'
    };
    if (!_.isNil(payload))
        params.Payload = JSON.stringify(payload);
    // console.log('lambda invoke params =\n' + JSON.stringify(params, null, 2));
    lambda.invoke(params,
        (err, data) => {
            if (err) callback(err);
            else if (data) {
                if (data.StatusCode == 202 && !requestResponse)
                    callback(); // Not waiting for response.
                else {
                    let payload = JSON.parse(data.Payload);
                    console.log('lambda.invoke response for ' + name + '\nPayload: ' + JSON.stringify(payload, null, 2));
                    if (payload.errorMessage) callback(payload.errorMessage); // happens on timeout of lambda and other things
                    callback(null, payload);
                }
            }
            else callback(); // Nothing was returned
        }
    );
}
