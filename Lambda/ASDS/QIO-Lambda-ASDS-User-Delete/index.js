'use strict';
//
//  QIO-Lambda-ASDS-User-Delete()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId, .username
//  Output: results
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isNil(event.userId) || _.isNil(event.username)) {
        console.log("user context is required.");
        callback(null, event);
    }
    else _async.auto({
            ddb_pull_items: cb => qlib.persist.pullUserItems(event.userId, cb),
            smash_items: ['ddb_pull_items', (results, cb) => {
                _async.each(results.ddb_pull_items, (item, cb_each) =>
                    qlib.lambda.invoke('QIO-Lambda-ASDS-Item-Delete', cb_each, { item: item, cancelCTN: true }), cb); // Fire and forget
            }],
            push_devices_for_user: cb => qlib.persist.pullUserPushDevices(event.userId, cb),
            smash_push_devices: ['push_devices_for_user', (results, cb) => {
                _async.each(results.push_devices_for_user, (PD, cb_each) =>
                    qlib.sns.deleteEndpoint(PD.endpointArn, cb_each),
                    err => {
                        if (err) cb(err);
                        else qlib.persist.batchDeletePushDevices(results.push_devices_for_user, cb);
                    }
                );
            }],
            pull_detail_objs: cb => qlib.persist.pullUserDetailObjects(event.userId, cb),
            smash_detail_objs: ['pull_detail_objs', (results, cb) => qlib.persist.batchDeleteDetailObjs(results.pull_detail_objs, cb)],
            pull_flow: cb => qlib.persist.pullUserFlow(event.userId, cb),
            smash_flow: ['pull_flow', (results, cb) => qlib.persist.batchDeleteUserFlow(results.pull_flow, cb)],
            remove_fedId: cb => qlib.cognito.deleteFederatedIdentityForUser(event.userId, cb),
            pull_sub: cb => qlib.persist.pullUserSub(event.userId, cb),
            remove_cogId: ['pull_sub', (results, cb) => qlib.cognito.deleteCognitoIdentityForUserSub(results.pull_sub, cb)],
            remove_from_userMap: ['remove_cogId', (results, cb) => qlib.persist.removeUserFromUserMapTable(event.userId, cb)]
        },
        (err, results) => {
            // console.log(JSON.stringify(results, null, 2));
            if (err) {
                err.function = context.functionName;
                err.userId = event.userId;
                let msg = JSON.stringify(err, null, 2);
                context.log(msg);
                qlib.log.significantError(err, context.functionName);
                qlib.log.rollbar.critical(context.functionName.toUpperCase() + "\n" + msg);
                console.log("FAILURE");
                callback(null, false);
            }
            else {
                console.log('SUCCESS');
                callback(null, true);
            }
        }
    );
});
