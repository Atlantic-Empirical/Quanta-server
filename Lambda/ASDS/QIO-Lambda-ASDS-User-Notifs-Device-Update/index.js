'use strict';
//
//  QIO-Lambda-ASDS-User-Notifs-Device-Update()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: userId, token
//  Output:  results of each step
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');

const platformApplicationArn_prod = 'arn:aws:sns:us-east-1:475512417340:app/APNS/FIO-SNS-APNS-Prod-Application'; // Prod
const platformApplicationArn_sandbox = 'arn:aws:sns:us-east-1:475512417340:app/APNS_SANDBOX/Flow-apns-sandbox'; // Sandbox

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    _async.auto({
            extract_metadata: cb => {
                console.log('in extract_metadata');
                if (_.isUndefined(event.userId)) cb('userId is undefined');
                else if (_.isUndefined(event.token)) cb('token is undefined');
                else if (_.isUndefined(event.platform)) cb('platform is undefined');
                else {
                    let platformApplicationArn = event.platform == "a" ? platformApplicationArn_prod : platformApplicationArn_sandbox;
                    let s = _.split(platformApplicationArn, "/");
                    let out = {
                        userId: event.userId,
                        deviceToken: event.token,
                        targetProdEnv: s[1] == "APNS",
                        platformApplicationArn: platformApplicationArn
                    };
                    // console.log(JSON.stringify(out));
                    // console.timeEnd('extract_metadata');
                    cb(null, out);
                }
            },
            is_device_already_registered_to_user: ['extract_metadata', (results, cb) => {
                console.log('in is_device_already_registered_to_user');
                qlib.persist.pullUserPushDevices(results.extract_metadata.userId, (err, res) => {
                    if (err) cb(err);
                    else {
                        let t = _.find(res, I => {
                            let s = _.split(I.endpointArn, "/");
                            let tokenPlatformIsProd = s[1] == "APNS";
                            return I.tokenValue == results.extract_metadata.deviceToken && results.extract_metadata.targetProdEnv == tokenPlatformIsProd;
                        });
                        if (t) {
                            console.log('NOTE: this token-platform is already in the system. Bailing out.');
                            cb("ALREADY_EXISTS");
                        }
                        else cb();
                    }
                });
            }],
            create_platform_endpoint: ['is_device_already_registered_to_user', 'extract_metadata', (results, cb) => {
                console.log('in create_platform_endpoint');
                qlib.sns.createPlatformEndpoint(results.extract_metadata.userId, results.extract_metadata.deviceToken, results.extract_metadata.platformApplicationArn, cb);
            }],
            store_platform_endpoint: ['create_platform_endpoint', (results, cb) => {
                console.log('in store_platform_endpoint');
                qlib.persist.storePlatformEndpoint(
                    results.extract_metadata.userId,
                    results.extract_metadata.deviceToken,
                    results.create_platform_endpoint.endpointArn,
                    cb);
            }],
            send_welcome_notif: ['create_platform_endpoint', (results, cb) => {
                console.log('in send_welcome_notif');
                qlib.notifs.notifyUser({
                    userId: results.extract_metadata.userId,
                    title: 'Welcome to Quanta',
                    body: "You've Got Money! 💸",
                    badgeCount: 1,
                    sound: 'default',
                    collapseKey: 1,
                }, cb);
            }]
        },
        (err, results) => {
            console.log("DONE");
            if (err) {
                if (err == "ALREADY_EXISTS") callback(null, true);
                else callback(err, false);
            }
            else callback(null, true);
        }
    );
});
