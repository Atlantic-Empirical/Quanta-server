'use strict';
//
//  QIO-Lambda-ASDS-Item-Status()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .item_id OR .link_session_id AND .userId -- to verify that the requester owns the item
//  Output: 
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if ((_.isNil(event.item_id) || _.isEmpty(event.item_id)) && (_.isNil(event.link_session_id) || _.isEmpty(event.link_session_id))) callback('item context is required');
    else if (_.isNil(event.userId) || _.isEmpty(event.userId)) callback("user context required");
    else pullItem(event.item_id, event.link_session_id, (err, item) => {
        if (err) callback(err);
        else if (_.isNil(item) || _.isEmpty(item)) callback(null, "Item doesn't exist");
        else if (event.userId != item.userId) callback(null, "Item does not belong to user.");
        else if (_.isEmpty(item.access_token)) {
            event.hasAccessToken = false;
            callback(null, event); // BAIL IF THERE ISN'T AN ACCESS TOKEN YET. ALL THE FOLLOWING IN PARRALLEL WOULD FAIL.
        }
        else buildItemStatus(item, event, callback);
    });
});

function buildItemStatus(item, event, callback) {
    let item_id = item.item_id;
    _async.parallel({
            webhook_summary: cb_parallel => buildWebhookSummary(item_id, cb_parallel),
            accounts: cb_parallel => qlib.persist.pullItemAccounts(item_id, cb_parallel),
            user_quantize_status: cb_parallel => {
                qlib.persist.userQuantizeStatus(event.userId, (err, res) => {
                    if (err) cb_parallel(err);
                    else if (_.isNil(res) || _.isEmpty(res)) cb_parallel(null, 'NOT_STARTED');
                    else {
                        let s = _.split(res.quantizeStatus, "-");
                        let runStampIsAfterItemCreateStamp = s[1] > item.createdTimestamp;
                        if (s[0].toLowerCase() == 'started') {
                            if (runStampIsAfterItemCreateStamp) cb_parallel(null, 'RUNNING');
                            else cb_parallel(null, 'RUNNING'); // either was already running when item was created or got stuck in running state and is actually not running'
                        }
                        else if (s[0].toLowerCase() == 'finished') {
                            if (runStampIsAfterItemCreateStamp) cb_parallel(null, 'SUCCEEDED');
                            else cb_parallel(null, 'NOT_STARTED');
                        }
                        else cb_parallel('Unexpected quantizeStatus');
                    }
                });
            },
            transaction_count: cb_parallel => qlib.persist.pullUserTotalTransactionCount(event.userId, cb_parallel),
            transaction_summary: cb_parallel => qlib.persist.transactionSummaryForItem(item_id, cb_parallel),
            flow_date_count: cb_parallel =>
                qlib.ddb.query('FIO-Table-User-Flow', ['userId', 'windowSize'], [event.userId, 1], cb_parallel, 'userId-windowSize-index', undefined, 0, 'COUNT') // FLOW --- WARNING: this is across all items. Shouldn't it be limited to just the request item?
        },
        (err, results) => {
            if (err) callback(err);
            else {
                event.hasAccessToken = !_.isUndefined(item.access_token); // Item-New() TOKEN EXCHANGE gives us:
                event.item_id = item_id;
                event.accounts = results.accounts; // Item-New() ACCOUNTS pull gives us:
                event.webhookSummary = results.webhook_summary; // Item-New() BATCH START blocks on HISTORICAL_UPDATE webhook
                event.quantizeStatus = results.user_quantize_status;
                event.totalTransactionCount = results.transaction_count;

                // BATCH IS RUNNING OR HAS SUCCEEDED
                if (results.user_quantize_status == "SUCCEEDED" || results.user_quantize_status == "RUNNING") {
                    event.transactionSummary = results.transaction_summary; // this will change during transaction ingestion.
                    event.flowDateCount = results.flow_date_count;
                    event.oldestFlowDate = moment().subtract(results.flow_date_count, 'days').format('YYYY-MM-DD');
                    // Tell the client to pull userHome, userIncome, savingsDetail, ccDetail, flowDays/Weeks/Months
                    event.itemSetupCompleted = (results.user_quantize_status == "SUCCEEDED");
                }
                else event.itemSetupCompleted = false;

                console.log("FINAL OBJECT:\n" + JSON.stringify(event, null, 2));
                callback(null, event);
            }
        }
    );
}

function pullItem(item_id, link_session_id, callback) {
    let projections = "userId, access_token, item_id, createdTimestamp";
    if (!_.isNil(item_id) && !_.isEmpty(item_id)) qlib.persist.pullItem(item_id, callback, projections);
    else if (!_.isNil(link_session_id) && !_.isEmpty(link_session_id)) qlib.persist.pullItemByLinkSessionId(link_session_id, callback, projections);
    else callback("Need item_id or link_session_id.");
}

function buildWebhookSummary(item_id, callback) {

    qlib.persist.pullItemWebhooks(item_id, (err, hooks) => {
        if (err) callback(err);
        else {
            _.remove(hooks, h => h.webhook_type != "TRANSACTIONS");

            let historical = _.find(hooks, h => h.webhook_code == 'HISTORICAL_UPDATE');
            let initial = _.find(hooks, h => h.webhook_code == 'INITIAL_UPDATE');
            let removed = _.filter(hooks, h => h.webhook_code == 'TRANSACTIONS_REMOVED');

            let transactionsRemovedCount = _.chain(removed).map('removed_transactions').value().length;
            var secondsBetweenInitialAndHistoricalHooks = -1;
            var initialMStr = "";

            if (!_.isUndefined(historical) && !_.isUndefined(initial)) {
                let historicalM = moment(historical.timestamp);
                let initialM = moment(initial.timestamp);
                initialMStr = initialM.format('YYYY-MM-DD');
                let diff = historicalM.diff(initialM);
                secondsBetweenInitialAndHistoricalHooks = diff / 1000;
            }

            let totalWebhookTransactions = _
                .chain(hooks)
                .map('new_transactions')
                .compact()
                .reduce(function(m, i) { return m + i })
                .value() || 0;

            let webhookSummary = {
                totalTransactionHookCount: hooks.length,
                initialHookDate: initialMStr,
                transactionCountTotal: totalWebhookTransactions,
                transactionsRemovedCount: transactionsRemovedCount,
                numberOfTransactionsThatShouldBeInSystem: totalWebhookTransactions - transactionsRemovedCount,
                historicalTransactionsHook: historical,
                initialTransactionsHook: initial,
                secondsBetweenInitialAndHistoricalHooks: secondsBetweenInitialAndHistoricalHooks
            };

            // console.log(JSON.stringify(txWebhooks, null, 2));
            callback(null, webhookSummary);
        }
    });
}
