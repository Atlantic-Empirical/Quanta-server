// FIO-AWS-SNS

'use strict';
const AWS = require('aws-sdk');
const sns = new AWS.SNS();
const _ = require('lodash');

module.exports = {

    publish: (msg, callback) => _publish(msg, callback),
    deleteEndpoint: (arn, callback) => sns.deleteEndpoint({ EndpointArn: arn }, callback),
    createPlatformEndpoint: (userId, deviceToken, platformAppArn, callback) => _createPlatformEndpoint(userId, deviceToken, platformAppArn, callback),
    sendSMS: (msg, phone_number, callback) => _sendSMS(msg, phone_number, callback),

};

function _sendSMS(msg, phone_number, callback) {
    sns.publish({
            Message: msg,
            PhoneNumber: phone_number
        },
        (err, data) => {
            if (err) console.log('ERROR in FIO-AWS-SNS _sendSMS: ' + err);
            callback(err, data);
        }
    );
}

function _publish(msg, callback) {
    sns.publish({
            Message: msg.payload,
            MessageStructure: (_.isNil(msg.messageStructure) || _.isEmpty(msg.messageStructure)) ? undefined : 'json',
            TargetArn: msg.endpointArn
        },
        (err, data) => {
            if (err) console.log('ERROR in  FIO-AWS-SNS _publish: ' + err);
            callback(err, data);
        }
    );
}

function _createPlatformEndpoint(userId, deviceToken, platformAppArn, callback) {

    sns.createPlatformEndpoint({
            PlatformApplicationArn: platformAppArn,
            Token: deviceToken,
            CustomUserData: userId
        },
        (err, data) => {
            if (err) {
                if (err.code == "InvalidParameter" && err.message.includes('already exists')) {
                    // extract endpoint from the message, this sucks.
                    // "Invalid parameter: Token Reason: Endpoint arn:aws:sns:us-east-1:475512417340:endpoint/APNS_SANDBOX/Flow-apns-sandbox/94348c13-4a92-3914-832b-4aaca36220c1 already exists with the same Token, but different attributes."
                    let s = _.split(err.message, ' ');
                    let endpointErn = s[5];

                    module.exports.deleteEndpoint(endpointErn, (err, res) => {
                        if (err) callback(err);
                        else _createPlatformEndpoint(userId, deviceToken, callback);
                    });
                }
                else callback(err);
            }
            else {
                // console.log(JSON.stringify(data));
                // console.log('New Endpoint ARN: ' + data['EndpointArn']);
                callback(null, {
                    endpointArn: data['EndpointArn'],
                    userId: userId,
                    deviceToken: deviceToken
                });
            }
        }
    );
}

function updatePlatformEndpoint(userId, deviceToken, callback) {

    // var params = {
    //     Attributes: { /* required */
    //         '<String>': 'STRING_VALUE',
    //         /* '<String>': ... */
    //     },
    //     EndpointArn: 'STRING_VALUE' /* required */
    // };
    // sns.setEndpointAttributes(params, function(err, data) {
    //     if (err) console.log(err, err.stack);
    //     else console.log(data);
    // });
}
