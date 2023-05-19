'use strict';

// FIO-Lambda-Dev-ScratchPad

const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
// const cc = new AWS.CodeCommit();
const _ = require('lodash');
const _async = require('async');
const json2csv = require('json2csv').parse;

exports.handler = (event, context, callback) => {
    console.time(context.functionName);
    console.log(context.functionName + " event: " + JSON.stringify(event));
    setupMoment();

    _async.auto(

        {

            set_table_throughput: function(cb) {

                comprehensiveSetTableThroughput('FAC-Transactions', false, 50, 0, cb);

            },

            pull_pending_transactions: function(cb) {

                let params = {
                    TableName: 'FAC-Transactions',
                    ExpressionAttributeValues: { ":true": AWS.DynamoDB.Converter.input(true) },
                    FilterExpression: "pending = :true"
                };

                scanDdb(params, [], function(err, res) {
                    if (err) {
                        cb(err);
                    }
                    else {

                        _.each(res, function(tx) {
                            // console.log(tx.institution_id);
                            delete tx.location;
                        });

                        // let csv = json2csv(res);
                        // console.log('\n' + csv);

                        cb(null, res);
                    }
                });
            },

            pull_matching_non_pending_transactions: ['pull_pending_transactions', function(results, cb) {
                console.log("in pull_matching_non_pending_transactions");
                // query for each one of the pending transactions' id in other transactions' pending_transaction_id field

                var ptids = _.map(results.pull_pending_transactions, 'transaction_id');
                var expressionAttributeValuesObject = {};

                _.each(ptids, function(ptid, i) {
                    expressionAttributeValuesObject[":ptid" + i] = AWS.DynamoDB.Converter.input(ptid);
                });

                var params = {
                    TableName: "FAC-Transactions",
                    FilterExpression: "#ptid IN (" + Object.keys(expressionAttributeValuesObject).toString() + ")",
                    ExpressionAttributeValues: expressionAttributeValuesObject,
                    ExpressionAttributeNames: { '#ptid': 'pending_transaction_id' }
                };

                // console.log(JSON.stringify(params, null, 2));

                var acc = [];

                scanDdb(params, acc, function(err, res) {
                    if (err) {
                        console.log("Scan failed: " + err.message);
                        cb(err);
                    }
                    else {
                        // console.log(JSON.stringify(acc, null, 2));

                        _.each(acc, function(tx) {
                            // console.log(tx.institution_id);
                            delete tx.location;
                        });

                        // if (!_.isEmpty(acc)) {
                        //     let csv = json2csv(acc);
                        //     console.log('\n' + csv);
                        // }

                        cb(null, acc);
                    }
                });
            }],

            delete_pending_transactions_with_matched_non_pending: ['pull_matching_non_pending_transactions', function(results, cb) {

                _async.each(results.pull_matching_non_pending_transactions,

                    function(tx, cb_each) {

                        // delete transaction by pending_transaction_id

                        if (!_.isUndefined(tx.userId) && !_.isUndefined(tx.pending_transaction_id)) {

                            let params = {
                                TableName: process.env.TABLE_TRANSACTIONS || 'FAC-Transactions',
                                Key: {
                                    "userId": AWS.DynamoDB.Converter.input(tx.userId),
                                    "transaction_id": AWS.DynamoDB.Converter.input(tx.pending_transaction_id)
                                }
                            };

                            ddb.deleteItem(params, function(err, data) {
                                if (err) console.log(err, err.stack);
                                else console.log(data);
                                cb_each(err);
                            });
                        }
                        else {
                            console.log('userId and or pending_transaction_id missing from tx: ' + JSON.stringify(tx, null, 2));
                        }

                    },

                    function(err) {
                        if (err) console.log('ERROR in delete each: ' + err.message);
                        else console.log('All ' + results.pull_matching_non_pending_transactions.length + ' delete operations completed.');
                        cb(err);
                    }
                );
            }],

            output_csv: ['pull_pending_transactions', function(results, cb) {

                let olderPendingTransactions = _.filter(results.pull_pending_transactions, function(tx) {
                    return moment().diff(moment(tx.date), 'days') > 7;
                });

                if (!_.isEmpty(olderPendingTransactions)) {
                    let csv = json2csv(olderPendingTransactions);
                    console.log('\n' + csv);
                }

                cb();
            }]

        },

        function(err, results) {
            callback(err, results);
        }
    );
};

// DDB

function scanDdb(params, accumulatorArray, callback) {

    ddb.scan(params,

        function(err, res) {

            if (err) {
                console.log("ERROR in ddb.scan: " + JSON.stringify(err, null, 2));
                callback(err);
            }
            else {

                let out = _.map(res.Items, AWS.DynamoDB.Converter.unmarshall);
                // console.log(JSON.stringify(out, null, 2));
                accumulatorArray.push(...out);

                if (_.isUndefined(res.LastEvaluatedKey)) {
                    console.log('Finished scan operation with a total of ' + accumulatorArray.length + ' transactions');
                    callback(null, accumulatorArray);
                }
                else {
                    console.log('Looping scan operation.');
                    params.ExclusiveStartKey = res.LastEvaluatedKey;
                    scanDdb(params, accumulatorArray, callback);
                }
            }
        }
    );
}

// TABLE THROUGHPUT

function comprehensiveSetTableThroughput(tableName, applyToIndexes, RCU, WCU, callback) {
    console.log('comprehensiveSetTableThroughput()\n ' + tableName + '\n RCU = ' + RCU + '\n WCU = ' + WCU);

    _async.auto(

        {

            // WAIT UNTIL THE TABLE AND INDEXES TO BE IN ACTIVE STATE
            wait_for_ready: function(cb) {
                console.time('wait_for_ready');
                console.log('in wait_for_ready');

                waitForTableAndIndexesToFinishUpdating(tableName, function(err, res) {
                    console.timeEnd('wait_for_ready');

                    if (err) {
                        cb(err);
                    }
                    else {
                        cb(null, res.tableStatusSummary);
                    }
                });
            },

            // INSPECT EXISTING TABLE THROUGHPUT
            inspect_existing_throughput: ['wait_for_ready', function(results, cb) {
                console.time('inspect_existing_throughput');
                console.log('in inspect_existing_throughput');

                let summary = results.wait_for_ready;

                let tableRcuIsSufficient = summary.rcu >= RCU;
                let tableWcuIsSufficient = summary.wcu >= WCU;

                let paramSets = [];

                // BUILD TABLE PARAMS
                if (!tableRcuIsSufficient || !tableWcuIsSufficient) {

                    var targetRcu;

                    if (!tableRcuIsSufficient) {
                        targetRcu = RCU;
                        console.log("Need to change RCU on " + tableName);
                        console.log("Current = " + summary.rcu + ' Target = ' + targetRcu);
                    }
                    else {
                        targetRcu = summary.rcu;
                    }

                    var targetWcu;

                    if (!tableWcuIsSufficient) {
                        targetWcu = WCU;
                        console.log("Need to change WCU on " + tableName);
                        console.log("Current = " + summary.wcu + ' Target = ' + targetWcu);
                    }
                    else {
                        targetWcu = summary.wcu;
                    }

                    let tableUpdateParams = {
                        TableName: tableName,
                        ProvisionedThroughput: {
                            ReadCapacityUnits: targetRcu,
                            WriteCapacityUnits: targetWcu
                        }
                    };

                    paramSets.push(tableUpdateParams);
                }
                else {
                    console.log('Throughput on table is already sufficient. ' + tableName);
                }

                if (applyToIndexes) {

                    // BUILD INDEX PARAMS
                    _.each(summary.indexes, function(index) {

                        let indexRcuIsSufficient = index.rcu >= RCU;
                        let indexWcuIsSufficient = index.wcu >= WCU;

                        if (!indexRcuIsSufficient || !indexWcuIsSufficient) {

                            var targetRcu = index.rcu;

                            if (!indexRcuIsSufficient) {
                                targetRcu = RCU;
                                console.log("Need to change RCU on " + tableName + " " + index.name);
                                console.log("Current = " + index.rcu + ' Target = ' + targetRcu);
                            }

                            var targetWcu = index.wcu;

                            if (!indexWcuIsSufficient) {
                                targetWcu = WCU;
                                console.log("Need to change RCU on " + tableName + " " + index.name);
                                console.log("Current = " + index.wcu + ' Target = ' + targetWcu);
                            }

                            let indexUpdateParams = {

                                TableName: tableName,
                                GlobalSecondaryIndexUpdates: [{
                                    Update: {
                                        IndexName: index.name,
                                        ProvisionedThroughput: {
                                            ReadCapacityUnits: targetRcu,
                                            WriteCapacityUnits: targetWcu
                                        }
                                    }
                                }]
                            };

                            paramSets.push(indexUpdateParams);
                        }
                        else {
                            console.log("Index throughput is already sufficient. " + index.name);
                        }
                    });
                }

                console.log('PARAM SET =\n' + JSON.stringify(paramSets, null, 2));

                console.timeEnd('inspect_existing_throughput');
                cb(null, paramSets);
            }],

            // KICK OFF THROUGHPUT UPDATES
            kick_off_updates: ['inspect_existing_throughput', function(results, cb) {
                console.time('kick_off_updates');
                console.log('in kick_off_updates');

                let paramSets = results.inspect_existing_throughput;

                _async.each(paramSets,

                    function(params, cb_each) {

                        ddb.updateTable(params, function(err, data) {

                            if (err) {

                                if (err.code == "ValidationException" && err.message.startsWith("The provisioned throughput for the table will not change.")) {
                                    console.log('Throughput on table is already set to the right values. Params =\n' + JSON.stringify(params, null, 2));
                                    cb_each();
                                }
                                else if (err.code == "ValidationException" && err.message.startsWith("The provisioned throughput for the index")) {
                                    console.log('Throughput on index is already set to the right values. Params =\n' + JSON.stringify(params, null, 2));
                                    cb_each();
                                }
                                else if (err.code == "LimitExceededException" && err.message.startsWith("Subscriber limit exceeded: Provisioned throughput")) {
                                    console.log('Too many throughput decreases in past hour. Params =\n' + JSON.stringify(params, null, 2));
                                    cb_each();
                                }
                                else {
                                    console.log("FAILED: " + err.message);
                                    console.log('Params =\n' + JSON.stringify(params, null, 2));
                                    cb_each(err);
                                }
                            }
                            else {
                                console.log('update succeeded for params:\n' + JSON.stringify(params, null, 2) + '\n\nwith:\n' + JSON.stringify(data, null, 2));
                                cb_each();
                            }
                        });
                    },

                    function(err) {
                        if (err) {
                            console.log("ERROR in one loop of kick_off_updates: " + err.message);
                        }
                        else {
                            console.log("All of the param updates were submitted successfully.");
                        }
                        console.timeEnd('kick_off_updates');
                        cb(err);
                    }
                );
            }],

            // WAIT UNTIL THE TABLE AND INDEXES TO BE IN ACTIVE STATE
            wait_for_ready_final: ['kick_off_updates', function(results, cb) {
                console.time('wait_for_ready_final');
                console.log('in wait_for_ready_final');

                waitForTableAndIndexesToFinishUpdating(tableName, function(err, res) {
                    console.timeEnd('wait_for_ready_final');
                    cb(err, res);
                });
            }]

        },

        function(err, res) {
            callback(err, res);
        }
    );
}

function waitForTableAndIndexesToFinishUpdating(tableName, callback) {

    let tryCount = 29;
    let intervalMS = 10000;
    let tryNumber = 0;

    _async.retry(

        {
            times: tryCount,
            interval: intervalMS,

            errorFilter: function(err) {
                if (err) {
                    // Don't need to do anything here.
                }

                tryNumber++;

                if (tryNumber < tryCount) {
                    return true; // Try again
                }
                else {
                    callback(tableName + " DIDN'T FINISH UPDATING BEFORE TIMEOUT");
                    return false;
                }
            }

        },

        function(cb_retry) {

            describeTable(tableName, function(err, res) {
                if (err) {
                    callback(err); // Bubble it up, bail out;
                }
                else {

                    let allIndexesAreActive = _.every(res.GlobalSecondaryIndexes, ['IndexStatus', "ACTIVE"]);

                    if (res.TableStatus == 'UPDATING' || !allIndexesAreActive) {
                        console.log('Table and/or indexes are NOT active in ' + tableName + '\n Going to wait and ask again in ' + intervalMS / 1000 + 's.');
                        cb_retry(res.TableStatus);
                    }
                    else {
                        console.log('Table and all indexes are active in ' + tableName);
                        cb_retry(null, res);
                    }
                }
            });

        }, callback
    );
}

function describeTable(tableName, callback) {

    ddb.describeTable({ TableName: tableName }, function(err, data) {
        if (err) {
            console.log("ERROR in describeTable(): " + err, err.stack);
            callback(err);
        }
        else {
            // console.log(data.Table);

            var res = data.Table;

            res.tableStatusSummary = {
                name: tableName,
                status: res.TableStatus,
                rcu: res.ProvisionedThroughput.ReadCapacityUnits,
                wcu: res.ProvisionedThroughput.WriteCapacityUnits,
                indexes: _.map(res.GlobalSecondaryIndexes, function(index) {
                    return {
                        name: index.IndexName,
                        status: index.IndexStatus,
                        rcu: index.ProvisionedThroughput.ReadCapacityUnits,
                        wcu: index.ProvisionedThroughput.WriteCapacityUnits
                    };
                })
            };

            console.log("TABLE STATUS SUMMARY\n" + JSON.stringify(res.tableStatusSummary, null, 2));

            callback(null, res);
        }
    });
}

// MOMENT
const moment = require('moment-timezone');

function setupMoment() {
    moment.tz.setDefault("America/New_York"); // set timezone to eastern
    moment.updateLocale('en', { week: { dow: 1 } }); // Set first day of week to monday
}


// PLAID
const plaid = require('plaid');
var plaidClient;

function getAccountsForItemFromPlaid() {
    plaidClient = initPlaid('development');

    plaidClient.getAccounts('access-development-2733fcac-3cba-427f-b22f-a90a850f32de', function(err, res) {

        if (err != null) {
            if (plaid.isPlaidError(err)) {
                // This is a Plaid error
                console.log(err.error_code + ': ' + err.error_message);
            }
            else {
                // This is a connection error, an Error object
                console.log(err.toString());
            }
            callback(err);
        }
        else {
            // Success
            console.log('got accounts(s): ' + JSON.stringify(res.accounts));
            //2018-04-12 19:04:02.405 [{"account_id":"zQreeVpkWqFyxL83zlGQhmvPjQ7L8VIkqDA7X","balances":{"available":100,"current":110,"limit":null},"mask":"0000","name":"Plaid Checking","official_name":"Plaid Gold Standard 0% Interest Checking","subtype":"checking","type":"depository"},{"account_id":"a5XZZKvzqVUdz4Q9lDbVC3LAD7mpe3f88Xl4dQ","balances":{"available":200,"current":210,"limit":null},"mask":"1111","name":"Plaid Saving","official_name":"Plaid Silver Standard 0.1% Interest Saving","subtype":"savings","type":"depository"},{"account_id":"686qq5jRGWsAQreNX17aHR9DgVPGlBSAMZbjl","balances":{"available":null,"current":1000,"limit":null},"mask":"2222","name":"Plaid CD","official_name":"Plaid Bronze Standard 0.2% Interest CD","subtype":"cd","type":"depository"},{"account_id":"K5doo6v17QUqyWaJvw9VIzRakpQLGkteLm4gya","balances":{"available":null,"current":410,"limit":2000},"mask":"3333","name":"Plaid Credit Card","official_name":"Plaid Diamond 12.5% APR Interest Credit Card","subtype":"credit card","type":"credit"}]
            callback(null, res.accounts);
        }
    });
}

function initPlaid(desiredEnvironment) {

    var env = plaidEnvironmentNameToPlaidNamespace(desiredEnvironment);

    var CLIENT_ID = process.env.PLAID_CLIENT_ID || '5ab119ad8d9239521f158d59';
    var PUBLIC_KEY = process.env.PLAID_PUBLIC_KEY || 'e44a4977074657eac38acd267e54d4';

    console.log('Plaid desired environment: ' + desiredEnvironment);
    console.log('Plaid env url: ' + env);

    switch (desiredEnvironment) {

        case 'sandbox':
            {
                return new plaid.Client(CLIENT_ID, PUBLIC_KEY, process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147', env);
            }

        case 'development':
            {
                return new plaid.Client(CLIENT_ID, PUBLIC_KEY, process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147', env);
            }

        case 'production':
            {
                return new plaid.Client(CLIENT_ID, PUBLIC_KEY, process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147', env);
            }
    }
}

function plaidEnvironmentNameToPlaidNamespace(desiredEnvironment) {

    switch (desiredEnvironment) {
        case 'sandbox':
            return plaid.environments.sandbox;
        case 'development':
            return plaid.environments.development;
        case 'production':
            return plaid.environments.production;
    }
}
