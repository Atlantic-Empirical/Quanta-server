'use strict';

// FIO-Lambda-Dev-ScratchPad

const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const lambda = new AWS.Lambda();
const _ = require('lodash');
const _async = require('async');
const spendStreamer = require('./FIO-Node-Modules/FIO-SpendStreamify.js');


exports.handler = (event, context, callback) => {

    let userId = 'us-east-1:69ba80be-9484-423c-9d23-b82c42ebc734';

    _async.auto({

            // ITEMS
            pull_items: function(cb) {
                console.time('pull_items');
                console.log('in pull_items');

                if (_.isUndefined(event.items)) {

                    pullItemsForUser(userId, function(err, res) {
                        console.timeEnd('pull_items');

                        if (_.isEmpty(res)) {
                            callback(null, 'This user has no items.');
                            return;
                        }
                        else {
                            _.each(res, function(itm) { console.log(itm.item_id) });
                            cb(err, res);
                        }
                    });
                }
                else {
                    console.timeEnd('pull_items');
                    cb(null, event.items);
                }
            },

            // ACCOUNTS
            pull_accounts: ['pull_items', function(results, cb) {
                console.time('pull_accounts');
                console.log('in pull_accounts');

                var accounts = [];

                _async.each(results.pull_items,

                    function(item, cb_each) {

                        pullItemAccounts(item.item_id, function(err, res) {
                            if (err) {
                                cb_each(err);
                            }
                            else {
                                accounts.push(...res);
                                cb_each();
                            }
                        });
                    },

                    function(err) {
                        console.timeEnd('pull_accounts');

                        if (_.isEmpty(accounts)) {
                            callback(null, 'This user has no accounts.');
                            return;
                        }
                        else {
                            cb(err, accounts);
                        }
                    }
                );
            }],

            // TRANSACTIONS
            pull_transactions_from_ddb: ['pull_accounts', function(results, cb) {
                console.time('pull_transactions_from_ddb');
                console.log('in pull_transactions_from_ddb');

                var transactionArray = [];
                recursivePullAllTransactionsForUser(userId, null, transactionArray, results.pull_accounts, function(err, allTransactionsForUser) {
                    console.timeEnd('pull_transactions_from_ddb');
                    cb(err, allTransactionsForUser);
                });
            }],

            // STREAMIFY!
            streamify: ['pull_transactions_from_ddb', function(results, cb) {
                console.time('streamify');
                console.log('in streamify');

                spendStreamer.streamifyTransactions(results.pull_transactions_from_ddb, function(err, res) {
                    console.timeEnd('streamify');
                    cb(err, res);
                });
            }]

        },

        function(err, results) {
            if (err) {
                callback(err);
            }
            else {

                // console.log(JSON.stringify(results.finalize, null, 2));
                callback(null, results.streamify);
                // callback(null, 'hi');
            }
        }
    );
};

// TRANSACTIONS

function recursivePullAllTransactionsForUser(userId, LastEvaluatedKey, transactionArray, accounts, callback) {

    performTransactionQuery(pullTransactionsQueryParams(userId, LastEvaluatedKey), function(err, transactions, LastEvaluatedKey) {
        if (err) {
            callback(err, null);
        }
        else {
            transactionArray = _.concat(transactionArray, transactions);

            if (LastEvaluatedKey) {
                console.log('Looks like we have more transactions to pull.');
                recursivePullAllTransactionsForUser(userId, LastEvaluatedKey, transactionArray, accounts, callback);
            }
            else {
                console.log('Done pulling. Returning ' + transactionArray.length + ' transactions back up the chain.');

                // IMPORTANT:
                transactionArray = conditionTransactions(transactionArray, accounts);

                // Done
                callback(null, transactionArray);
            }
        }
    });
}

function performTransactionQuery(params, callback) {

    ddb.query(params, function(err, d) {
        if (err) {
            console.log('ERROR in pullAllTransactionsForUser: ' + err, err.stack);
            callback(err, null);
        }
        else {
            console.log("Loop pull count: " + d.Items.length);
            // console.log("pullAllTransactionsForUser ddb.query response d: " + JSON.stringify(d));
            let outTransactions = _.map(d.Items, function(item) { return AWS.DynamoDB.Converter.unmarshall(item); });
            callback(null, outTransactions, d.LastEvaluatedKey);
        }
    });
}

function pullTransactionsQueryParams(userId, LastEvaluatedKey) {
    var params = {
        TableName: process.env.TABLE_TRANSACTIONS || 'FAC-Transactions',
        IndexName: 'userId-index',
        ExpressionAttributeValues: { ":v1": AWS.DynamoDB.Converter.input(userId) },
        KeyConditionExpression: "userId = :v1"
    };

    if (!_.isNull(LastEvaluatedKey)) {
        params.ExclusiveStartKey = LastEvaluatedKey;
    }

    return params;
}

function conditionTransactions(transactions, accounts) {

    // FILTER OUT mutant, zombie walking dead transaction from an account that's been removed.
    let accountIds = _.map(accounts, 'masterAccountId');
    transactions = _.filter(transactions, tx => _.includes(accountIds, tx.masterAccountId));

    _.each(transactions,

        function(tx, key) {

            // Add account to each tx
            let matchedAccount = _.find(accounts, A => A.masterAccountId == tx.masterAccountId);
            tx.account = matchedAccount;

            // Add isSpend to each tx
            if ((matchedAccount.type == 'credit' && tx.amount > 0) || (matchedAccount.type == 'depository' && tx.amount < 0)) {
                tx.isSpend = true;
            }
            else {
                tx.isSpend = false;
            }
        }
    );

    return transactions;
}

// ITEMS

function pullItemsForUser(userId, callback) {

    return lambda.invoke({
        FunctionName: "FIO-Lambda-User-Items",
        Payload: JSON.stringify({ userId: userId })

    }, function(error, data) {

        if (error) {
            console.error(JSON.stringify(error));
            callback(error);
        }

        else if (data) {
            // console.log('Payload: ' + data.Payload);
            var temp = JSON.parse(data.Payload);

            _.each(temp, function(itm) {
                delete itm.access_token;
            });

            callback(null, temp.items);
        }
    });
}

// ACCOUNTS

function pullItemAccounts(item_id, callback) {

    let params = {
        TableName: process.env.TABLE_ACCOUNTS || 'FIO-Table-Accounts',
        IndexName: 'item_id-index',
        KeyConditionExpression: "item_id = :v1",
        ExpressionAttributeValues: { ":v1": AWS.DynamoDB.Converter.input(item_id) }
    };

    ddb.query(params, function(err, data) {
        if (err) {
            console.log(err, 'FAILURE: ' + err.stack);
            callback(err, err.stack);
        }
        else {
            // console.log('pullItemAccounts ddb.query response data: ' + JSON.stringify(data));
            let accounts = _.map(_.get(data, 'Items'), AWS.DynamoDB.Converter.unmarshall);
            callback(null, accounts);
        }
    });
}
