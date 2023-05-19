'use strict';
//
//  QIO-Lambda-ASDS-Item-Delete()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: item_id & userId OR item
//  Output: results
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');
const qplaid = require('./QuantaPlaid/FIO-Plaid');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isUndefined(event.item)) {
        if (_.isUndefined(event.item_id)) {
            console.log("item context is required.");
            callback(null, event);
            return;
        }
        if (_.isUndefined(event.userId)) {
            console.log("user context is required.");
            callback(null, event);
            return;
        }
    }
    else {
        event.item_id = event.item.item_id;
        event.userId = event.item.userId;
    }

    _async.auto({
            ddb_pull_item: cb => {
                if (event.item) cb(null, event.item);
                else qlib.persist.pullItem(event.item_id, cb);
            },
            ddb_getAccountsForItem: cb => qlib.persist.pullItemAccounts(event.item_id, cb, 'masterAccountId'),
            ddb_remove_accounts: ['ddb_getAccountsForItem', (results, cb) => {
                _async.each(results.ddb_getAccountsForItem, (account, cb_each) =>
                    qlib.persist.removeAccount(account.masterAccountId, cb_each),
                    cb
                );
            }],
            ddb_pull_transactions_for_item: cb => qlib.persist.pullItemTransactions(event.item_id, cb, 'transaction_id, userId'),
            delete_transactions: ['ddb_pull_transactions_for_item', (results, cb) => {
                qlib.persist.batchDeleteTransactions(results.ddb_pull_transactions_for_item, cb);
            }],
            pull_webhooks_for_item: cb => qlib.persist.pullItemWebhooks(event.item_id, cb, 'timestamp, item_id'),
            smash_webhooks: ['pull_webhooks_for_item', (results, cb) => qlib.persist.batchDeleteWebhooks(results.pull_webhooks_for_item, cb)],
            plaid_remove_item: ['ddb_pull_item', (results, cb) => qplaid.removeItem(results.ddb_pull_item.access_token, cb)],
            ddb_remove_item: ['delete_transactions', 'ddb_remove_accounts', (results, cb) => qlib.persist.removeItem(event.item_id, cb)],
            quantize: ['ddb_remove_item', (results, cb) => {
                if (!event.cancelCTN)
                    qlib.lambda.invoke('QIO-Lambda-Nightly-User-Quantize', cb, { userId: event.userId }); // Fire and forget
                else cb();
            }]
        },
        (err, results) => {
            console.log('DONE');
            if (err) {
                console.log(JSON.stringify(err, null, 2));
                qlib.log.significantError(err, context.functionName);
            }
            console.log(JSON.stringify(results, null, 2));
            callback(err, _.isNil(err));
        }
    );
});
