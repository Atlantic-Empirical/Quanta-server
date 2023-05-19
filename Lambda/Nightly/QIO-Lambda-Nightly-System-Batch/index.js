'use strict';
//
//  QIO-Lambda-Nightly-System-Batch()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: Nothing
//  Output: User count
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const q_plaid = require("./QuantaPlaid/FIO-Plaid");
const _ = require("lodash");
const _async = require('async');
const AWS = require('aws-sdk');
const cognitoISP = new AWS.CognitoIdentityServiceProvider();
const cbr = require('cognito-backup-restore');
const userPoolId = 'us-east-1_qEX0vG1or';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    var skipNotify = context.functionName.toLowerCase() == "test";
    var pullFullTransactionHistory = false; // only applies to running in C9
    if (context.functionName.toLowerCase() != "test") pullFullTransactionHistory = false; // override in prod

    _async.auto({
            pull_all_userids: cb => {
                qlib.ddb.pullAllItemsFromTable('FIO-Table-UserMap', (err, res) => {
                    if (err) cb(err);
                    else cb(null, _.map(res, 'userId'));
                }, 'userId');
            },
            launch_per_user_quantize: ['pull_all_userids', (results, cb) => {
                _async.each(results.pull_all_userids, (uid, cb_each) =>
                    qlib.lambda.invoke("QIO-Lambda-Nightly-User-Quantize", cb_each, { userId: uid, skipNotify: skipNotify, pullFullTransactionHistory: pullFullTransactionHistory }, false), // Do not wait for Quantize to run
                    (err) => {
                        if (err) console.log("ERROR in Quantize() invoke: " + err.message);
                        else console.log("Launched Quantize for all users.");
                        cb(err);
                    }
                );
            }],
            tidy_cloudwatch_logs: cb => qlib.cw.cloudWatchLogTidy(cb),
            pending_transaction_sweep: cb => qlib.persist.pendingTransactionSweep(cb),
            backup_cognito_user_pool: cb => {
                cbr.backupUsers(cognitoISP, userPoolId, '/tmp')
                    .then(() => {
                        let filenameJson = 'us-east-1_qEX0vG1or.json';
                        let filePath = path.resolve('/tmp/' + filenameJson);
                        fs.readFile(filePath, { encoding: 'utf-8' }, (err, res) => {
                            if (err) console.log(err);
                            else {
                                let zip = new AdmZip();
                                zip.addFile(filenameJson, Buffer.alloc(res.length, res));
                                let zipBuffer = zip.toBuffer();
                                qlib.s3.putObject(zipBuffer, 'io.chedda.backups', userPoolId + moment().format('-YYYY-MM-DD-HH-MM-ss') + '.zip', (err, res) => {
                                    if (err) cb(err);
                                    else {
                                        console.log('Cognito User Pool Backup completed');
                                        cb();
                                    }
                                });
                            }
                        });
                    })
                    .catch((err) => {
                        console.error(err);
                        cb(err);
                    });
            },
            pull_linked_institutions: cb => {
                qlib.ddb.scan('FIO-Table-Items', (err, res) => {
                    if (err) cb(err);
                    else {
                        let out = _.chain(res).map('institution_id').uniq().value();
                        cb(null, out);
                    }
                }, undefined, undefined, undefined, 'institution_id');
            },
            update_institutions: ['pull_linked_institutions', (results, cb) => {
                _async.each(
                    results.pull_linked_institutions,
                    (iid, cb_each) => q_plaid.updateInstitution(iid, cb_each),
                    cb
                );
            }]
        },
        (err, results) => {
            if (err) console.log('FINAL ERROR:\n', JSON.stringify(err, null, 2));
            // else console.log('FINAL RESULTS = ' + JSON.stringify(results, null, 2));
            let msg = 'DONE. User Count: ' + results.pull_all_userids.length;
            console.log(msg);
            qlib.log.interesting(msg, "QIO-Lambda-Nightly-System-Batch");
            callback(err, msg);
        }
    );
});
