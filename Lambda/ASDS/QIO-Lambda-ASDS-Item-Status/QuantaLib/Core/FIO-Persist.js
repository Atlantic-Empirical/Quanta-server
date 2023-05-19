// FIO-Persist

'use strict';
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const _ = require('lodash');
const _async = require('async');
require('../Helper/cycle.js');
const uuidv4 = require('uuid/v4');

// const moment = require("moment");
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");

const q_ddb = require('../AWS/FIO-AWS-DDb');
const q_date = require("../Util/FIO-Util-Date");
const q_log = require('./FIO-Logging');
const q_lambda = require('../AWS/FIO-AWS-Lambda');
const q_obj = require("../Util/FIO-Util-ObjectStuff");

module.exports = {

    // INSTITUTIONS
    putInstitution: (obj, callback) => q_ddb.putItem('QIO-Table-Institutions', obj, callback),
    pullInstitution: (ins_id, callback) =>
        q_ddb.getItem('QIO-Table-Institutions', 'institution_id', ins_id, callback),

    // PROMO CODES
    putPromoCode: (obj, callback) => q_ddb.putItem('QIO-Table-PromoCodes', obj, callback),
    pullPromoCode: (promoCode, callback) =>
        q_ddb.getItem('QIO-Table-PromoCodes', 'promoCode', promoCode, callback),
    promoCodeAttemptUse: (promoCode, userId, callback) => _promoCodeAttemptUse(promoCode, userId, callback),

    // USER - Subscription
    pullUserSubscription: (userId, callback) => _pullUserSubscription(userId, callback),
    pullUserSubscriptionReceipt: (userId, callback) => _pullUserSubscriptionReceipt(userId, callback),

    // ITEM
    pullItem: (item_id, callback, projections) =>
        q_ddb.getItem('FIO-Table-Items', 'item_id', item_id, callback, projections),
    pullItemByLinkSessionId: (link_session_id, callback, projections) =>
        q_ddb.query('FIO-Table-Items', 'link_session_id', link_session_id, callback, 'link_session_id-index', projections, 1),
    removeItem: (item_id, callback) => q_ddb.deleteItem('FIO-Table-Items', 'item_id', item_id, callback),
    persistItem: (item, callback) => q_ddb.putItem('FIO-Table-Items', item, callback),
    pullItemAccounts: (item_id, callback, projection) => _pullItemAccounts(item_id, callback, projection),
    persistItemAccounts: (accounts, callback) =>
        q_ddb.batchWrite('FIO-Table-Accounts', accounts, callback),
    pullItemTransactions: (item_id, callback, projection) =>
        q_ddb.query('FAC-Transactions', 'item_id', item_id, callback, 'item_id-index', projection),
    pullItemUserId: (item_id, callback) =>
        q_ddb.getItem('FIO-Table-Items', 'item_id', item_id, callback, undefined, 'userId'),
    pullItemWebhooks: (item_id, callback, projections) =>
        q_ddb.query('FAC-Webhooks', 'item_id', item_id, callback, 'item_id-index', projections),
    pullItemHistoricalWebhookCount: (item_id, callback) => _pullItemHistoricalWebhookCount(item_id, callback),
    setItemLastTransactionPullToNow: (item_id, callback) => _setItemLastTransactionPullToNow(item_id, callback),
    setItemNeedsUpdateFlag: (item_id) => _setItemNeedsUpdateFlag(item_id),
    pullLastTransactionRetrievalTimestamp: (item_id, callback) =>
        _pullLastTransactionRetrievalTimestamp(item_id, callback),
    institutionNameForId: (item_id, callback) =>
        q_ddb.getItem('FIO-Table-Items', 'item_id', item_id, callback, undefined, 'institution_name'),
    oldestTransactionDateForItem: (item_id, callback) => _oldestTransactionDateForItem(item_id, callback),
    transactionCountForItem: (item_id, callback) => _transactionCountForItem(item_id, callback),
    transactionSummaryForItem: (item_id, callback) => _transactionSummaryForItem(item_id, callback),

    // USER - Transactions
    pullUserTransactions: (userId, transaction_ids, includeAccount, callback, projections) =>
        _pullUserTransactions(userId, transaction_ids, includeAccount, callback, projections),
    pullAllUserTransactions: (userId, callback) => _pullAllUserTransactions(userId, callback),
    persistUserTransactionCategory: (userId, transaction, callback) =>
        _persistUserTransactionCategory(userId, transaction, callback),
    batchDeleteTransactions: (transactions, callback) =>
        q_ddb.batchDelete('FAC-Transactions', transactions, 'userId', 'transaction_id', callback),
    batchDeleteTransactionsByTids: (userId, tids, callback) =>
        _batchDeleteTransactionsByTids(userId, tids, callback),
    batchWriteTransactions: (transactions, callback) =>
        q_ddb.batchWrite('FAC-Transactions', transactions, callback),
    pullUserTotalTransactionCount: (userId, callback) =>
        q_ddb.query('FAC-Transactions', 'userId', userId, callback, 'userId-index', undefined, 0, "COUNT"),

    // USER - Items
    pullUserItems: (userId, callback) =>
        q_ddb.query('FIO-Table-Items', 'userId', userId, callback, 'userId-index'),

    // USER - Details
    persistUserDetailObject: (userId, type, object, callback) =>
        _persistUserDetailObject(userId, type, object, callback),
    pullUserDetailObjects: (userId, callback, projection) =>
        q_ddb.query('FIO-Table-User-Details', 'userId', userId, callback, 'userId-index', projection),
    persistUserFlow: (userId, thatFlow, callback) => _persistUserFlow(userId, thatFlow, callback),
    pullUserFlow: (userId, callback) =>
        q_ddb.query('FIO-Table-User-Flow', 'userId', userId, callback, 'userId-to-periodId-index'),
    batchDeleteDetailObjs: (detailObjs, callback) =>
        q_ddb.batchDelete('FIO-Table-User-Details', detailObjs, 'userId', 'objectTypeId', callback),
    batchDeleteUserFlow: (flowObjs, callback) =>
        q_ddb.batchDelete('FIO-Table-User-Flow', flowObjs, 'userId', 'periodId', callback),
    removeDetailObjectsNoItemCase: (userId, callback) => _removeDetailObjectsNoItemCase(userId, callback),

    // USER - Push Devices / Notif Related
    pullUserPushDevices: (userId, callback) =>
        q_ddb.query('NP-Push-Device-Tokens', 'userId', userId, callback, 'userId-index'),
    batchDeletePushDevices: (devices, callback) =>
        q_ddb.batchDelete('NP-Push-Device-Tokens', devices, 'tokenPlatform', 'userId', callback),
    storePlatformEndpoint: (userId, deviceToken, endpointArn, callback) =>
        _storePlatformEndpoint(userId, deviceToken, endpointArn, callback),
    pullUserDeviceToken: (userId, callback) =>
        q_ddb.query('NP-Push-Device-Tokens', ['userId', 'tokenPlatform'], [userId, 0], callback),

    // USER - Other
    pullUserAccounts: (userId, callback) => _pullUserAccounts(userId, callback),
    pullUserSub: (userId, callback) => _pullUserSub(userId, callback),
    removeUserFromUserMapTable: (userId, callback) =>
        q_ddb.deleteItem('FIO-Table-UserMap', 'userId', userId, callback),
    pullUserIdForSub: (sub, callback) => _pullUserIdForSub(sub, callback),
    setUserQuantizeIsRunning: (userId, isRunning) => _setUserQuantizeIsRunning(userId, isRunning),
    userQuantizeStatus: (userId, callback) => _userQuantizeStatus(userId, callback),
    quantizeUser: (userId, callback, pullFullTransactionHistory) =>
        _invokeQuantizeUser(userId, callback, pullFullTransactionHistory),

    // ACCOUNTS
    persistAccountFreshBalances: (account, callback) => _persistAccountFreshBalances(account, callback),
    persistAccount: (account, callback) => _persistAccount(account, callback),
    removeAccount: (masterAccountId, callback) =>
        q_ddb.deleteItem('FIO-Table-Accounts', 'masterAccountId', masterAccountId, callback),
    batchWriteAccounts: (accounts, callback) => q_ddb.batchWrite('FIO-Table-Accounts', accounts, callback),
    setAccountHidden: (userId, callback, account_ids, masterAccountIds, newHiddenState) =>
        _setAccountsHidden(userId, callback, account_ids, masterAccountIds, newHiddenState),
    pullAccountTransactions: (maid, callback) => _pullAccountTransactions(maid, callback),
    mergeFreshAccountInfoForItem: (item, freshAccountsFromPlaid, callback) =>
        _mergeFreshAccountInfoForItem(item, freshAccountsFromPlaid, callback),

    // OTHER
    batchDeleteWebhooks: (hooks, callback) =>
        q_ddb.batchDelete('FAC-Webhooks', hooks, 'item_id', 'timestamp', callback),

    // SYSTEM
    pullAllPendingTransactions: callback => _pullAllPendingTransactions(callback),
    pendingTransactionSweep: callback => _pendingTransactionSweep(callback),
    updateTransactionMasterAccountIds: (oldMaid, newMaid, userId, callback) =>
        _updateTransactionMasterAccountIds(oldMaid, newMaid, userId, callback),

};

// PROMO CODES

function _promoCodeAttemptUse(promoCode, userId, callback) {

    _async.auto({

            pull_promo_code: cb => { // Does this code exist and if so is it still active?
                module.exports.pullPromoCode(promoCode, (err, pc) => {
                    if (err) cb(err);
                    else {
                        if (_.isNil(pc)) {
                            console.log("promoCode doesn't exist");
                            cb("Invalid code.");
                        }
                        else if (!_.isNil(pc.disabled) && pc.disabled) {
                            console.log("Code is disabled.");
                            cb("Invalid code.");
                        }
                        else if (!_.isNil(pc.codeRetireTimestamp) && pc.codeRetireTimestamp != 0 && pc.codeRetireTimestamp < Date.now()) {
                            console.log("Code is retired");
                            cb("Invalid code.");
                        }
                        else if (pc.useCountLimit > 0 && (pc.useCount >= pc.useCountLimit)) {
                            console.log("Code is capped out.");
                            cb("Invalid code.");
                        }
                        else cb(null, pc);
                    }
                });
            },

            does_user_exist: cb => {
                _pullUserSub(userId, (err, res) => {
                    if (err) cb(err);
                    else if (_.isNil(res)) cb("User not found for id: " + userId);
                    else cb(null, res);
                });
            },

            is_user_entitled_to_use_code: ['pull_promo_code', 'does_user_exist', (results, cb) => {
                _pullUserSubscription(userId, (err, userSubscription) => {
                    if (err) callback(err);
                    else {
                        var grantExpiresForUserTimestamp = 0;
                        if (!_.isNil(results.pull_promo_code.grantDurationDays))
                            grantExpiresForUserTimestamp = moment().add(results.pull_promo_code.grantDurationDays, 'days').unix();
                        else if (!_.isNil(results.pull_promo_code.grantUntilDate))
                            grantExpiresForUserTimestamp = moment(results.pull_promo_code.grantUntilDate).unix();
                        else
                            cb("Invalid grant period in results.pull_promo_code object.");

                        if (!_.isNil(userSubscription) && !_.isNil(userSubscription.promoCode)) {
                            let m = "Promo code already used (userSubscription.promoCode)";
                            console.log(m);
                            cb(m);
                        }
                        else cb(null, grantExpiresForUserTimestamp);
                    }
                });
            }],

            update_user_subscription: ['is_user_entitled_to_use_code', 'pull_promo_code', (results, cb) => {
                q_ddb.update('FIO-Table-User-Details', 'userId', userId, 'SET', ['promoGrantUntilTimestamp', 'promoCode'], [results.is_user_entitled_to_use_code, promoCode], (err, res1) => {
                    if (err) cb("Failed to update subscription.");
                    else cb();
                }, 'objectTypeId', 6);
            }],

            update_promo_code_object: ['is_user_entitled_to_use_code', 'pull_promo_code', (results, cb) => {
                if (_.isNil(results.pull_promo_code.useCount)) results.pull_promo_code.useCount = 0;
                results.pull_promo_code.useCount++;
                results.pull_promo_code.lastGrantTimestamp = Date.now();
                results.pull_promo_code.lastGrantDate = moment().format('YYYY-MM-DD');
                q_ddb.update('QIO-Table-PromoCodes', 'promoCode', promoCode, 'SET', ['useCount', 'lastGrantTimestamp', 'lastGrantDate', 'lastGrantUserId'], [results.pull_promo_code.useCount, results.pull_promo_code.lastGrantTimestamp, results.pull_promo_code.lastGrantDate, userId], (err, res2) => {
                    if (err) callback("Failed to update the PC object.");
                    else cb();
                });
            }]

        },
        (err, results) => {
            console.log(JSON.stringify(results, null, 2));
            if (err) {
                console.log(JSON.stringify(err, null, 2));
                callback(null, { promoGrantUntilTimestamp: 0 });
            }
            else {
                console.log("Promo code free period applied until " + moment.unix(results.is_user_entitled_to_use_code).format('YYYY-MM-DD'));
                callback(null, { promoGrantUntilTimestamp: results.is_user_entitled_to_use_code });
            }
        }
    );
}

// NOTIFS

function _storePlatformEndpoint(userId, deviceToken, endpointArn, callback) {
    q_ddb.putItem('NP-Push-Device-Tokens', {
        userId: userId,
        tokenPlatform: 0,
        tokenValue: deviceToken,
        endpointArn: endpointArn
    }, callback);
}

// TRANSACTIONS

function _updateTransactionMasterAccountIds(oldMaid, newMaid, userId, callback) {
    _async.auto({
        pull_transactions: cb => _pullAccountTransactions(oldMaid, cb, 'transaction_id'),
        put_transactions: ['pull_transactions', (results, cb) => {
            _async.each(results.pull_transactions, (tx, cb_each) => {
                // console.log(tx.transaction_id);
                q_ddb.update('FAC-Transactions', 'userId', userId,
                    'SET', 'masterAccountId', newMaid, cb_each,
                    'transaction_id', tx.transaction_id);
            }, cb);
        }]
    }, callback);
}

function _pendingTransactionSweep(callback) {
    _async.auto({
            // set_table_throughput: cb => q_ddb.comprehensiveSetTableThroughput('FAC-Transactions', false, 50, 0, 'minval', cb), // not relevant in on-demand billingMode
            pull_pending_transactions: cb => module.exports.pullAllPendingTransactions(cb),
            pull_matching_non_pending_transactions: ['pull_pending_transactions', (results, cb) => {
                var ptids = _.map(results.pull_pending_transactions, 'transaction_id');
                pullMatchingNonPendingTransactions(ptids, cb);
            }],
            delete_pending_transactions_with_matched_non_pending: ['pull_matching_non_pending_transactions', (results, cb) => {
                let collatedForBatchDelete = _
                    .chain(results.pull_matching_non_pending_transactions)
                    .filter(TX => !_.isNil(TX.userId) && !_.isNil(TX.pending_transaction_id))
                    .map(TX => ({ transaction_id: TX.pending_transaction_id, userId: TX.userId }))
                    .value();
                module.exports.batchDeleteTransactions(collatedForBatchDelete, cb);
            }],
            log_counts: ['pull_pending_transactions', 'pull_matching_non_pending_transactions', (results, cb) => {
                q_log.interesting({
                    totalPendingTransactionsBeforeCull: results.pull_pending_transactions.length,
                    matchedNonPendingTransactions: results.pull_matching_non_pending_transactions.length,
                    totalPendingTransactionsAfterCull: results.pull_pending_transactions.length - results.pull_matching_non_pending_transactions.length
                }, "_pendingTransactionSweep");
                cb();
            }],
        },
        (err, results) => {
            if (err) console.log('ERROR in _pendingTransactionSweep: ' + err);
            callback(err, results);
        }
    );
}

function _pullAllPendingTransactions(callback) {
    q_ddb.scan('FAC-Transactions', (err, res) => {
        if (err) callback(err);
        else {
            _.each(res, tx => delete tx.location);
            // let csv = json2csv(res);
            // console.log('\n' + csv);
            callback(null, res);
        }
    }, 'pending', true);

    // let params = {
    //     TableName: ,
    //     ExpressionAttributeValues: { ":true": AWS.DynamoDB.Converter.input(true) },
    //     FilterExpression: "pending = :true"
    // };
}

function pullMatchingNonPendingTransactions(tids, callback) {
    console.log("in pull_matching_non_pending_transactions");
    // query for each one of the pending transactions' id in other transactions' pending_transaction_id field

    let chunks = _.chunk(tids, 99); // limit is 100. 
    let out = [];

    _async.each(chunks, (chunk, cb_each) => {

            var expressionAttributeValuesObject = {};
            _.each(chunk, (ptid, i) =>
                expressionAttributeValuesObject[":ptid" + i] = AWS.DynamoDB.Converter.input(ptid));

            var params = {
                TableName: "FAC-Transactions",
                FilterExpression: "#ptid IN (" + Object.keys(expressionAttributeValuesObject).toString() + ")",
                ExpressionAttributeValues: expressionAttributeValuesObject,
                ExpressionAttributeNames: { '#ptid': 'pending_transaction_id' }
            };

            q_ddb.scanWithParams(params, (err, res) => {
                if (err) cb_each(err);
                else {
                    _.each(res, tx => delete tx.location);
                    out.push(...res);
                    cb_each();
                }
            });
        },
        err => {
            if (err) callback(err);
            else callback(null, out);
        }
    );
}

function _batchDeleteTransactionsByTids(userId, tids, callback) {
    let objs = _.map(tids, tid => ({ transaction_id: tid, userId: userId }));
    q_ddb.batchDelete('FAC-Transactions', objs, 'userId', 'transaction_id', callback);
}

function _pullUserTransactions(userId, transaction_ids, includeAccount, callback, projections = "") {
    if (_.isUndefined(userId)) callback("User context is required.");
    else if (_.isUndefined(transaction_ids) || _.isEmpty(transaction_ids)) {
        _pullAllUserTransactions(userId, (err, res) => {
            if (err) callback(err);
            else filterTransactionsForHiddenAccounts(userId, res, callback);
        }); // Need to scan user transactions
    }
    else {
        if (!_.isArray(transaction_ids)) transaction_ids = [transaction_ids];
        let keys = _
            .chain(transaction_ids)
            .compact()
            .filter(tid => !_.isEmpty(tid))
            .map(tid => ({
                userId: userId,
                transaction_id: tid
            }))
            .value();
        q_ddb.batchGet('FAC-Transactions', keys, 'userId', (err, res) => {
            if (err) callback(err);
            else {
                if (includeAccount) addAccountDetailsToTransactions(res, (err, res) => {
                    if (err) callback(err);
                    else filterTransactionsForHiddenAccounts(userId, res, callback);
                });
                else filterTransactionsForHiddenAccounts(userId, res, callback);
            }
        }, projections, 'transaction_id');
    }
}

function filterTransactionsForHiddenAccounts(userId, transactions, callback) {
    _pullUserAccounts(userId, (err, res) => {
        if (err) callback(err);
        else {
            console.log('Transaction count before filter = ' + transactions.length);
            let hiddenAccountMaids = _.chain(res).filter(A => A.hidden).map('masterAccountId').value();
            let filteredTransactions = _.filter(transactions, TX => !_.includes(hiddenAccountMaids, TX.masterAccountId));
            console.log('Transaction count before filter = ' + filteredTransactions.length);
            callback(null, filteredTransactions);
        }
    });
}

function _pullAllUserTransactions(userId, callback, LastEvaluatedKey, aggregator = []) {
    performTransactionQuery(userId, LastEvaluatedKey, (err, transactions, LastEvaluatedKey) => {
        if (err) callback(err);
        else {
            aggregator = _.concat(aggregator, transactions);
            if (LastEvaluatedKey) {
                console.log('Looks like we have more transactions to scan.');
                _pullAllUserTransactions(userId, callback, LastEvaluatedKey, aggregator);
            }
            else {
                console.log('Done scanning. Returning ' + aggregator.length + ' transactions back up the chain.');
                callback(null, aggregator);
            }
        }
    });
}

function performTransactionQuery(userId, LastEvaluatedKey, callback) {

    var params = {
        TableName: process.env.TABLE_TRANSACTIONS || 'FAC-Transactions',
        IndexName: 'userId-index',
        ExpressionAttributeValues: { ":v1": AWS.DynamoDB.Converter.input(userId) },
        KeyConditionExpression: "userId = :v1"
    };

    if (!_.isNull(LastEvaluatedKey)) {
        params.ExclusiveStartKey = LastEvaluatedKey;
    }

    ddb.query(params, (err, data) => {
        if (err) {
            console.log('ERROR in performTransactionQuery: ' + err);
            callback(err);
        }
        else {
            console.log("Loop pull count: " + data.Items.length);
            // console.log("pullAllTransactionsForUser ddb.query response d: " + JSON.stringify(d));
            let outTransactions = _.map(_.get(data, 'Items'), AWS.DynamoDB.Converter.unmarshall);
            callback(null, outTransactions, data.LastEvaluatedKey);
        }
    });
}

function addAccountDetailsToTransactions(transactions, callback) {

    if (_.isEmpty(transactions)) {
        callback(null, transactions);
        return;
    }

    let uniqueMasterAccountIds = _
        .chain(transactions)
        .map('masterAccountId')
        .uniq().value();

    var accounts = [];

    _async.each(uniqueMasterAccountIds,

        (masterAccountId, cb_each) => {
            q_ddb.getItem('FIO-Table-Accounts', 'masterAccountId', masterAccountId, (err, res) => {
                if (err) cb_each(err);
                else {
                    accounts.push(res);
                    cb_each();
                }
            }, undefined, 'institution_name, masterAccountId, name');
        },

        (err) => {
            if (err) callback(err);
            else {
                // that's the end - all the loops have returned.

                _.each(transactions, tx => {
                    let matchedAccount = _.find(accounts, ai => ai.masterAccountId == tx.masterAccountId);
                    // console.log('lookup: ' + JSON.stringify(matchedAccount));
                    tx.account_name = matchedAccount.name;
                    tx.account_institution_name = matchedAccount.institution_name;
                });

                callback(null, transactions);
            }
        }
    );
}

function _persistUserTransactionCategory(userId, transaction, callback) {

    let params = {
        TableName: "FAC-Transactions",
        ExpressionAttributeValues: { ":c": AWS.DynamoDB.Converter.input(transaction.fioCategoryId) },
        Key: {
            "userId": AWS.DynamoDB.Converter.input(userId),
            "transaction_id": AWS.DynamoDB.Converter.input(transaction.transaction_id)
        },
        UpdateExpression: "SET fioCategoryId = :c"
    };
    // console.log(JSON.stringify(params, null, 2));

    ddb.updateItem(params, function(err, data) {

        if (err) {
            // console.log(err, 'Failed to batch write in putTransactionsIntoDdb():\n' + err.message + ' Stack:\n' + err.stack);

            // if (err.code == "ProvisionedThroughputExceededException") { // not relevant in on-demand billingMode
            //     console.log('ProvisionedThroughputExceededException. Going to increase throughput.');

            //     // Increase write throughput
            //     // this should use ddb.waitForState()
            //     q_ddb.comprehensiveSetTableThroughput('FAC-Transactions', true, 100, 100, 'minval', (err, result) => {
            //         if (err) console.log(err);
            //         _persistUserTransactionCategory(userId, transaction, callback); // retry WITHOUT backoff
            //     });
            // }
            // else {
            console.log('unhandled write error: ' + err);
            callback(err, 'bailed out due to write error: ' + err);
            // }
        }
        else {
            // console.log(JSON.stringify(data));
            // console.log('transaction updated: ' + transaction.transaction_id);
            callback(err, data);
        }
    });
}

// USER DETAILS

function _persistUserDetailObject(userId, type, object, callback) {
    // console.log('persistDetailObject() type: ' + type + ' object: ' + JSON.stringify(object, null, 2));
    if (_.isUndefined(object)) deleteUserDetailObject(userId, type, callback); // Item is orphaned, delete any remanant.
    else {
        object.objectTypeId = type;
        object.userId = userId;
        object.createdTimestamp = Date.now();
        let params = {
            TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
            Item: AWS.DynamoDB.Converter.marshall(object)
        };
        // console.log(JSON.stringify(params, null, 2));
        ddb.putItem(params, (err, data) => {
            if (err) {
                console.log('ERROR: _persistDetailObject (put) (type ' + type + '): ' + err);
                let decycled = JSON.decycle(object);
                console.log("\nNAUGHTY OBJECT =\n" + JSON.stringify(decycled, null, 2));
            }
            callback(err);
        });
    }
}

function _removeDetailObjectsNoItemCase(userId, callback) {
    _async.parallel([
        cb => deleteUserDetailObject(userId, 0, cb),
        cb => deleteUserDetailObject(userId, 1, cb),
        cb => deleteUserDetailObject(userId, 3, cb),
        cb => deleteUserDetailObject(userId, 4, cb),
        cb => deleteUserDetailObject(userId, 5, cb)
    ], callback);
}

function deleteUserDetailObject(userId, objectTypeId, callback) {
    let deleteParams = {
        TableName: process.env.TABLE_USER_DETAILS || 'FIO-Table-User-Details',
        Key: {
            "userId": AWS.DynamoDB.Converter.input(userId),
            "objectTypeId": AWS.DynamoDB.Converter.input(objectTypeId)
        }
    };
    ddb.deleteItem(deleteParams, (err, data) => {
        if (err) console.log('persistDetailObject FAILURE to delete orphaned item: ' + err.message);
        // else { console.log('ddb.query response data: ' + JSON.stringify(data)) }
        callback(err);
    });
}

function _persistUserFlow(userId, thatFlow, callback) {
    let objs = _.map(thatFlow, I => {
        I.userId = userId;
        I.createdTimestamp = Date.now();
        return I;
    });
    q_ddb.batchWrite('FIO-Table-User-Flow', objs, callback);
}

// SUBSCRIPTIONS

function _pullUserSubscription(userId, callback) {

    let params = {
        TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
        ExpressionAttributeValues: {
            ":v1": AWS.DynamoDB.Converter.input(userId),
            ":v2": AWS.DynamoDB.Converter.input(6)
        },
        KeyConditionExpression: "userId = :v1 AND objectTypeId = :v2"
    };

    ddb.query(params, (err, d) => {
        if (err) callback(err);
        else {
            let objs = _.map(d.Items, I => AWS.DynamoDB.Converter.unmarshall(I));
            callback(null, _.first(objs));
        }
    });
}

function _pullUserSubscriptionReceipt(userId, callback) {

    let params = {
        TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
        ExpressionAttributeValues: {
            ":v1": AWS.DynamoDB.Converter.input(userId),
            ":v2": AWS.DynamoDB.Converter.input(6)
        },
        KeyConditionExpression: "userId = :v1 AND objectTypeId = :v2",
        ProjectionExpression: "latest_receipt_b64"
    };

    ddb.query(params, function(err, d) {
        if (err) callback(err);
        else {
            let objs = _.map(d.Items, I => AWS.DynamoDB.Converter.unmarshall(I));
            let first = _.first(objs);
            if (_.isUndefined(first)) callback('No existing subscription object for user.');
            else if (_.isUndefined(first.latest_receipt_b64)) callback('No latest receipt string.');
            else callback(null, first.latest_receipt_b64);
        }
    });
}

// USER

function _pullUserSub(userId, callback) {
    q_ddb.getItem('FIO-Table-UserMap', 'userId', userId, (err, res) => {
        if (err) callback(err);
        else callback(null, _.get(res, 'sub'));
    }, 'sub');
}

function _pullUserIdForSub(sub, callback) {
    q_ddb.query('FIO-Table-UserMap', 'sub', sub, (err, res) => {
        if (err) callback(err);
        else callback(null, _.get(res, 'userId'));
    }, "sub-index", 'userId', 1);
}

function _setUserQuantizeIsRunning(userId, isRunning) {
    var prefix = "started-";
    if (!isRunning) prefix = "finished-";
    q_ddb.update('FIO-Table-UserMap', 'userId', userId, 'SET', 'quantizeStatus', prefix + Date.now());
}

function _userQuantizeStatus(userId, callback) {
    q_ddb.getItem('FIO-Table-UserMap', 'userId', userId, callback, 'quantizeStatus');
}

function _invokeQuantizeUser(userId, callback, pullFullTransactionHistory = false) {
    q_lambda.invoke('QIO-Lambda-Nightly-User-Quantize', callback, {
        userId: userId,
        pullFullTransactionHistory: pullFullTransactionHistory
    });
}

// ACCOUNTS

// pullAccountTransactions(
function _pullAccountTransactions(maid, callback, projections = undefined) {
    if (_.isNil(maid) || _.isEmpty(maid)) callback("Account context is required.");
    else {
        q_ddb.scan('FAC-Transactions', (err, res) => {
            if (err) callback(err);
            else {
                _.each(res, tx => delete tx.location);
                callback(null, res);
            }
        }, 'masterAccountId', maid, undefined, projections);
    }
}

function _setAccountsHidden(userId, callback, account_ids, masterAccountIds, newHiddenState = true) {
    _pullUserAccounts(userId, (err, res) => {
        if (err) callback(err);
        else {
            if (_.isEmpty(res)) callback();
            else {
                var accountMasterIdsToHide;
                if (!_.isNil(account_ids)) {
                    accountMasterIdsToHide = _
                        .chain(res)
                        .filter(A => {
                            if (_.isArray(A.account_id)) {
                                let i = _.intersection(A.account_id, account_ids);
                                return !_.isEmpty(i);
                            }
                            else return _.includes(account_ids, A.account_id);
                        })
                        .map('masterAccountId')
                        .value();
                }
                else if (!_.isNil(masterAccountIds)) {
                    accountMasterIdsToHide = _
                        .chain(res)
                        .map('masterAccountId')
                        .intersection(masterAccountIds) // ensures we're mutating only user's own accounts
                        .value();
                }
                _async.each(accountMasterIdsToHide, (maid, cb_each) => {
                    console.log(maid);
                    q_ddb.update('FIO-Table-Accounts', 'masterAccountId', maid, 'set', 'hidden', newHiddenState, (err, res) => {
                        if (err) console.log('ERROR in _setAccountsHidden: ' + err);
                        else console.log('_setAccountsHidden succeeded');
                        cb_each(err);
                    });

                }, err => callback(null, _.isNil(err)));
            }
        }
    });
}

function _pullUserAccounts(userId, callback) {

    let params = {
        TableName: process.env.TABLE_ACCOUNTS || 'FIO-Table-Accounts',
        IndexName: 'userId-index',
        KeyConditionExpression: "userId = :v1",
        ExpressionAttributeValues: { ":v1": AWS.DynamoDB.Converter.input(userId) }
    };

    ddb.query(params, (err, data) => {
        if (err) {
            console.log('ERROR in _pullUserAccounts: ' + err);
            callback(err);
        }
        else {
            // console.log('ddb.query response data: ' + JSON.stringify(data));
            let accounts = _.map(_.get(data, 'Items'), AWS.DynamoDB.Converter.unmarshall);
            // console.log(JSON.stringify(accounts, null, 2));
            callback(null, accounts);
        }
    });
}

function _persistAccountFreshBalances(account, callback) {
    q_ddb.update('FIO-Table-Accounts', 'masterAccountId', account.masterAccountId, 'set', ['balances', 'lastSynced'], [account.balances, Date.now()], (err, res) => {
        if (err) {
            console.log('ERROR: _persistAccountFreshBalances: ' + err);
            let decycled = JSON.decycle(account);
            console.log("\nNAUGHTY OBJECT =\n" + JSON.stringify(decycled, null, 2));
        }
        callback(err);
    });
}

function _persistAccount(account, callback) {

    let params = {
        TableName: process.env.TABLE_ACCOUNTS || 'FIO-Table-Accounts',
        Item: AWS.DynamoDB.Converter.marshall(account)
    };
    // console.log(JSON.stringify(params, null, 2));

    ddb.putItem(params, (err, data) => {
        if (err) {
            console.log('ERROR: _persistNewAccount (put): ' + err);
            let decycled = JSON.decycle(account);
            console.log("\nNAUGHTY OBJECT =\n" + JSON.stringify(decycled, null, 2));
        }
        callback(err);
    });
}

function addDisplayNameToAccount(account) {
    var tDisplayName = "";
    if (!_.isNil(account)) {
        if (_.isNil(account.name)) {
            if (!_.isNil(account.official_name)) tDisplayName = account.official_name;
        }
        else {
            if (account.name.toLowerCase() == "credit card" || _.isEmpty(account.name)) {
                if (!_.isNil(account.official_name) && !_.isEmpty(account.official_name))
                    tDisplayName = account.official_name;
            }
            else tDisplayName = account.name;
        }
    }
    account.displayName = q_obj.toTitleCase(tDisplayName);
}

// Input: an existing item and the response from Plaid for getAccounts for that item.
// Returns updated array for item.accounts -- adding fresh balances, consolidates under masterAccountIds, removes closed accounts
// Calling code must persist item.accounts and quantize the user after calling this.
function _mergeFreshAccountInfoForItem(item, freshAccountsFromPlaid, callback) {
    // There are three classes of accounts at this point that need to be consolidated into two.
    // Three = 
    //      Existing & included in freshAccountsFromPlaid
    //      Existing & NOT included in freshAccountsFromPlaid
    //      NOT existing & included in freshAccountsFromPlaid
    var outItemAccounts = [];

    _async.auto({

            arrayify_account_ids: cb => {
                _.each(item.accounts, A => {
                    if (!_.isArray(A.account_id)) A.account_id = [A.account_id];
                });
                cb();
            },

            // Existing & included in freshAccountsFromPlaid
            clean_case: ['arrayify_account_ids', (results, cb) => {
                _.each(freshAccountsFromPlaid, (freshAccount, idx) => {
                    let targetAccount = _.find(item.accounts, A => _.includes(A.account_id, freshAccount.account_id));
                    if (!_.isNil(targetAccount)) {
                        targetAccount.balances = freshAccount.balances;
                        outItemAccounts.push(targetAccount);
                        delete freshAccountsFromPlaid[idx];
                        _.pull(item.accounts, targetAccount);
                    }
                });
                freshAccountsFromPlaid = _.compact(freshAccountsFromPlaid);
                cb();
            }],

            // Existing & NOT included in freshAccountsFromPlaid
            //      Cleanup the ones that could be due to a bug (hack-on-hack)
            //      And ones that seem to have been closed.
            //      This checks to see any of the existing accounts (that by definition have separate maids)
            //      share account_ids. If so, merge them under a single maid.
            closed_and_bug_cases: ['clean_case', (results, cb) => {
                // Now item.accounts includes only those that were not included in freshAccountsFromPlaid
                // That means they were either closed or exist due to a bug.

                _async.eachOf(item.accounts, (existingAccount, idx, cb_each) => {
                    let matchedAccounts = matchAccountToExistingAccounts(existingAccount, outItemAccounts);

                    switch (matchedAccounts.length) {

                        case 0:
                            // This account was closed.
                            existingAccount.isClosed = true;
                            outItemAccounts.push(existingAccount);
                            delete item.accounts[idx];
                            cb_each();
                            break;

                        case 1:
                            // This is the bug case
                            let newMaid = matchedAccounts[0].masterAccountId;
                            let oldMaid = existingAccount.masterAccountId;
                            handleBugCase(oldMaid, newMaid, item.userId, (err, res) => {
                                if (err) cb_each(err);
                                else {
                                    delete item.accounts[idx];
                                    cb_each();
                                }
                            });
                            break;

                        default:
                            console.log("WARNING!\nMore than one matching account returned.");
                            // wtf, unhandled case
                            cb_each();
                    }
                }, cb);
            }],

            // NOT existing & included in freshAccountsFromPlaid
            new_accounts: ['closed_and_bug_cases', (results, cb) => {
                // freshAccountsFromPlaid now only includes the accounts that were not existing already.
                // Meaning likely newly opened accounts at the institution.
                _.each(freshAccountsFromPlaid, accountNew => {
                    accountNew.masterAccountId = uuidv4();
                    accountNew.userId = item.userId;
                    accountNew.env = item.env;
                    accountNew.institution_name = item.institution_name;
                    accountNew.item_id = item.item_id;
                    accountNew.lastSynced = Date.now();
                    accountNew.institution_id = item.institution_id;
                    outItemAccounts.push(accountNew);
                });
                cb();
            }]

        },
        (err, results) => {
            if (err) callback(err);
            else {
                item.accounts = _.compact(item.accounts);
                // Sanity check, item.accounts should now be empty.
                callback(null, outItemAccounts);
            }
        }
    );
}

function handleBugCase(oldMaid, newMaid, userId, callback) {
    console.log('Bug Case: ' + oldMaid + ' -> ' + newMaid);
    _async.auto({
        update_transactions: cb => _updateTransactionMasterAccountIds(oldMaid, newMaid, userId, cb),
        remove_dupe_accounts: ['update_transactions', (results, cb) => module.exports.removeAccount(oldMaid, cb)]
    }, callback);
}

// Returns array of possible matches
function matchAccountToExistingAccounts(acct, accounts) {
    let matchedTypeAndSubtype = _.filter(accounts, accountExisting =>
        accountExisting.type == acct.type &&
        accountExisting.subtype == acct.subtype
    );
    let matchedName = _.filter(accounts, accountExisting => accountExisting.name == acct.name);
    let matchedOfficialName = _.filter(accounts, accountExisting => accountExisting.official_name == acct.official_name);
    return _.intersectionBy(matchedTypeAndSubtype, matchedName, matchedOfficialName, 'account_id');
}

// ITEMS

function _pullItemAccounts(item_id, callback, projection) {
    q_ddb.query('FIO-Table-Accounts', 'item_id', item_id, (err, res) => {
        if (err) callback(err);
        else {
            _.each(res, a => addDisplayNameToAccount(a));
            callback(null, res);
        }
    }, 'item_id-index', projection);
}

function _pullItemHistoricalWebhookCount(item_id, callback) {
    q_ddb.query('FAC-Webhooks', 'item_id', item_id, callback, 'item_id-index', undefined, 0, 'COUNT', 'webhook_code', 'HISTORICAL_UPDATE');
}

function _pullLastTransactionRetrievalTimestamp(item_id, callback) {
    const sinceLastTransactionPullDaysToExtendBack = 20;
    q_ddb.getItem('FIO-Table-Items', 'item_id', item_id, (err, item) => {
        if (err) {
            console.log('ERROR in _pullLastTransactionRetrievalTimestamp: ' + err);
            callback(err);
        }
        else {
            if (_.isUndefined(item) || _.isUndefined(item.lastTransactionPull) || item.lastTransactionPull == 0) {
                console.log('Last transaction pull is NEVER -- setting to ten years ago');
                callback(null, q_date.tenYearsAgoString());
            }
            else {
                let lastTransactionPullM = moment(item.lastTransactionPull);
                let todayM = moment();
                console.log('last transaction pull was at: ' + lastTransactionPullM.format('dddd, MMMM Do YYYY, h:mm:ss a'));

                // check to ensure that we're not setting start date to today
                if (lastTransactionPullM.isSameOrAfter(todayM, 'day')) {
                    lastTransactionPullM = todayM.subtract(sinceLastTransactionPullDaysToExtendBack, 'day'); // set to N days ago to ensure that no transactions are missed.
                    console.log('setting transaction pull start date to: ' + lastTransactionPullM.format('YYYY-MM-DD'));
                }
                callback(null, lastTransactionPullM.format('YYYY-MM-DD'));
            }
        }
    }, undefined, 'lastTransactionPull');
}

function _setItemLastTransactionPullToNow(item_id, callback) {
    q_ddb.update('FIO-Table-Items', 'item_id', item_id, 'set', 'lastTransactionPull', Date.now(), (err, res) => {
        if (err) console.log('ERROR in _setItemLastTransactionPullToNow: ' + err);
        else console.log('_setItemLastTransactionPullToNow succeeded');
        callback(err);
    });
}

function _setItemNeedsUpdateFlag(item_id) {
    q_ddb.update('FIO-Table-Items', 'item_id', item_id, 'set', 'needsUpdate', true, (err, res) => {
        if (err) console.log('failed to setItemNeedsUpdateFlag: ' + err);
        else console.log('setItemNeedsUpdateFlag succeeded');
    });
}

function _transactionCountForItem(item_id, callback) {
    q_ddb.query('FAC-Transactions', 'item_id', item_id, (err, res) => {
        if (err) {
            console.log('Error in ddb.query: ' + err, err.stack);
            callback(err);
        }
        else {
            // console.log('ddb.query response data: ' + JSON.stringify(data));
            callback(null, res);
        }
    }, 'item_id-index', undefined, 0, "COUNT");
}

function _transactionSummaryForItem(item_id, callback) {
    q_ddb.query('FAC-Transactions', 'item_id', item_id, (err, res) => {
        if (err) callback(err);
        else {
            if (_.isNil(res) || _.isEmpty(res)) callback();
            else {
                let transactionsSorted = _.orderBy(res, 'date', 'desc');
                let out = {
                    transactionCount: transactionsSorted.length,
                    oldestTransaction: _.chain(transactionsSorted).map('date').last().value(),
                    transactions: transactionsSorted,
                };
                if (!_.isNil(out.oldestTransaction))
                    out.daysSinceFirst = moment().diff(moment(out.oldestTransaction), 'days');
                callback(null, out);
            }
        }
    }, 'item_id-index', 'date,amount,name,qioTransactionType,transaction_id,item_id');
}

function _oldestTransactionDateForItem(item_id, callback) {
    q_ddb.query('FAC-Transactions', 'item_id', item_id, (err, res) => {
        if (err) callback(err);
        else {
            // console.log('ddb.query response data: ' + JSON.stringify(data));
            let out = _.chain(res).map('date').sort().first().value();
            callback(null, out);
        }
    }, 'item_id-index', 'date');
}

// SCRAP

// function pullSingleUserTransaction(userId, transaction_id, includeAccount, callback) {
//     let projection = includeAccount ? "account_id" : undefined;

//     q_ddb.getItem('FAC-Transactions', ['userId', 'transaction_id'], [userId, transaction_id], (err, res) => {
//         if (err) callback(err);
//         else {
//             if (_.isUndefined(res) || _.isEmpty(res)) {
//                 callback();
//             }
//             else if (includeAccount) {

//                 addAccountDetailsToTransactions([res], (err, res) => {
//                     if (err) callback(err);
//                     else {
//                         let out = _.map(res, tx => q_obj.compactObject(tx));
//                         callback(null, out);
//                     }
//                 });
//             }
//             else
//                 callback(null, q_obj.compactObject(res));
//         }
//     }, undefined, projection);
// }
