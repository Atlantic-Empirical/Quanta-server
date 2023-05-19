//
//  QIO-Lambda-ASDS-Item-Create()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: Also works for Item reconnect
//  Input: See bottom of file
//  Output Adds: Nothing, this method posts SQS messages to be processed by FIO-Lambda-System-Transactions-Ingest()
//

'use strict';
const qlib = require("./QuantaLib/FIO-QuantaLib");
const qplaid = require('./QuantaPlaid/FIO-Plaid');

const _ = require("lodash");
const _async = require('async');
const uuidv4 = require("uuid/v4");

const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));
    _async.auto({
            prep_input: cb => {
                event.item = event.args.item;
                event.force = event.args.force;
                event.isUpdate = event.args.isUpdate;
                delete event.args;
                if (_.isUndefined(event.userId)) { cb('userId is undefined'); }
                else if (_.isUndefined(event.item)) { cb('item is undefined'); }
                else if (_.isUndefined(event.item.metadata)) { cb('item metadata is undefined'); }
                else if (_.isUndefined(event.item.token)) { cb('token is undefined'); }
                else {
                    let tokenSplit = _.split(event.item.token, '-'); // extract the env
                    let out = {
                        userId: event.userId,
                        force: event.force,
                        update: event.isUpdate,
                        public_token: event.item.token,
                        link_session_id: event.item.linkSessionId,
                        status: event.item.metadata.status,
                        request_id: event.item.metadata.request_id,
                        institution_name: event.item.metadata.institution.name,
                        institution_id: event.item.metadata.institution.institution_id,
                        env: tokenSplit[1]
                    };

                    // Useful for debugging, leave here.
                    if (!_.isUndefined(event.access_token))
                        out.access_token = event.access_token;
                    if (!_.isUndefined(event.item_id))
                        out.item_id = event.item_id;

                    console.log(JSON.stringify(out, null, 2));
                    cb(null, out);
                }
            },
            reconnect_gate: ['prep_input', (results, cb) => {
                qlib.persist.pullUserItems(results.prep_input.userId, (err, res) => {
                    if (err) cb(err);
                    else {
                        let institution_ids = _.map(res, 'institution_id');
                        let institutionIsAlreadyLinkedToUser = _.includes(institution_ids, results.prep_input.institution_id);
                        if (institutionIsAlreadyLinkedToUser) {
                            if (event.isUpdate) {
                                console.log("Going to update item: " + res.item_id);
                                cb(null, res);
                            }
                            else if (!_.isNil(event.force) && event.force == true) {
                                console.log("User wants new link to same bank.");
                                cb(null, res);
                            }
                            else {
                                var e = new Error('This institution is already linked to this user.');
                                e.lineNumber = 1;
                                cb(e);
                            }
                        }
                        else cb(null, res); // Good to go. Totally new institution for this user.
                    }
                });
            }],
            exchange_tokens: ['reconnect_gate', (results, cb) => {
                if (_.isUndefined(results.prep_input.access_token)) {
                    qplaid.exchangeTokens(results.prep_input.public_token, (err, res) => {
                        if (err) cb(err);
                        else cb(null, _.pick(res, 'access_token', 'item_id'));
                    });
                }
                else cb(null, _.pick(results.prep_input, 'access_token', 'item_id'));
            }],
            persist_item: ['prep_input', 'exchange_tokens', 'reconnect_gate', (results, cb) => {
                var item;
                if (results.prep_input.update == true) {
                    item = _.find(results.reconnect_gate, I => I.item_id == results.exchange_tokens.item_id);
                    if (_.isNil(item)) { // this should NEVER happen
                        cb("ERROR: in persist_item the updated item_id was not matched.");
                    }
                    else {
                        item.link_session_id = results.prep_input.link_session_id;
                        item.access_token = results.exchange_tokens.access_token;
                        item.needsUpdate = false;
                        item.credentialsUpdatedTimestamp = Date.now();
                        item.credentialsUpdatedDate = moment().format('YYYY-MM-DD');
                    }
                }
                else {
                    item = {
                        userId: results.prep_input.userId,
                        institution_name: results.prep_input.institution_name,
                        institution_id: results.prep_input.institution_id,
                        link_session_id: results.prep_input.link_session_id,
                        access_token: results.exchange_tokens.access_token,
                        item_id: results.exchange_tokens.item_id,
                        env: results.prep_input.env,
                        needsUpdate: false,
                        createdTimestamp: Date.now(),
                        createdDate: moment().format('YYYY-MM-DD'),
                        lastTransactionPull: 0
                    };
                }
                qlib.persist.persistItem(item, (err, res) => {
                    if (err) cb(err);
                    else cb(null, item);
                });
            }],
            get_institution_display_data: ['prep_input', 'reconnect_gate', 'exchange_tokens', (results, cb) => {
                qplaid.updateInstitution(results.prep_input.institution_id, cb, results.prep_input.env);
            }],
            pull_accounts: ['exchange_tokens', (results, cb) => {
                qplaid.getAccountsForItem(results.exchange_tokens.access_token, results.exchange_tokens.item_id, results.prep_input.userId, cb);
            }],
            merge_accounts: ['pull_accounts', (results, cb) => {
                if (results.prep_input.update == true) {
                    qlib.persist.mergeFreshAccountInfoForItem(results.persist_item, results.pull_accounts, (err, mergedAccountsForItem) => {
                        if (err) cb(err);
                        else cb(null, mergedAccountsForItem);
                    });
                }
                else cb(null, results.pull_accounts);
            }],
            store_accounts: ['merge_accounts', 'prep_input', 'exchange_tokens', (results, cb) => {
                let accountsToPut = _.map(results.merge_accounts, account => {
                    account.userId = results.prep_input.userId;
                    account.item_id = results.exchange_tokens.item_id;
                    account.institution_id = results.prep_input.institution_id;
                    account.institution_name = results.prep_input.institution_name;
                    account.lastSynced = Date.now();
                    account.env = results.prep_input.env;
                    account.masterAccountId = uuidv4();
                    return account;
                });
                qlib.persist.persistItemAccounts(accountsToPut, cb);
            }],
            loop_historical_webhook: ['exchange_tokens', (results, cb) => {
                if (results.prep_input.force == true) cb();
                else if (results.prep_input.update == true) cb();
                else {
                    webhookLoop(results.exchange_tokens.item_id, (err, res) => {
                        if (err) cb(err); // This means either there was an error pulling the webhook or after all the loops there still was no HISTORICAL_UPDATE
                        else cb(); // Good to go, nothing more to say.
                    });
                }
            }],
            quantize_user: ['prep_input', 'store_accounts', 'loop_historical_webhook', (results, cb) => {
                qlib.persist.quantizeUser(results.prep_input.userId, cb, true);
            }]
        },
        (err, results) => {
            if (err) {
                console.log('FINAL ERROR: ' + err);
                qlib.log.significantError({
                    err: err,
                    results: results
                }, context.functionName);
            }
            else {
                let msg = "NEW ITEM: " + results.exchange_tokens.item_id + " userId: " + results.prep_input.userId;
                qlib.log.interesting(msg, context.functionName);
                qlib.log.smsTpf(msg);
            }

            console.log('results: ' + JSON.stringify(results, null, 2));
            callback(err, _.isNil(err));
        }
    );
});

function webhookLoop(item_id, callback) {
    _async.retry({
            times: 8,
            interval: retryNumber => 1093 * Math.pow(2, retryNumber)
            // 1093 = 2.2, 4.3, 9, 17.5, 35, 70, 140, 280s -- to maximize use of the Lambda function time
        },
        cb => {
            qlib.persist.pullItemHistoricalWebhookCount(item_id, (err, count) => {
                if (err) callback(err); // This is a real error, bounce hard.
                else {
                    if (count == 0) {
                        let msg = "Item does not have a HISTORICAL_UPDATE yet.";
                        console.log(msg);
                        cb(new qlib.FIOError(msg));
                    }
                    else {
                        console.log("Item *HAS* a HISTORICAL_UPDATE!.");
                        cb(null, count);
                    }
                }
            });
        }, callback
    );
}

// SAMPLE INPUT
// {
//     "userId": "us-east-1:0e8b454a-9291-444b-bd99-093d50db01eb",
//     "args": {
//         "item": {
//             "metadata": {
//                 "status": "connected",
//                 "request_id": "s4XYXAyW66WAp5W",
//                 "institution": {
//                     "name": "American Express",
//                     "institution_id": "ins_10"
//                 }
//             },
//             "linkSessionId": "1f257f29-e1ce-4cc7-85a5-25c5bde4a381",
//             "token": "public-development-02da4815-093f-4e4a-b37c-9c191c7499a6"
//         },
//         "force": t/f,
//         "isUpdate": t/f
//     }
// }
