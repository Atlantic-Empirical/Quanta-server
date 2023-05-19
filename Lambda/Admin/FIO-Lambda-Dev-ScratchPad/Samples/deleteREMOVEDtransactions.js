'use strict';

// FIO-Lambda-Dev-ScratchPad

const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const lambda = new AWS.Lambda();
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

            pull_transaction_removed_webhooks: function(cb) {

                let params = {
                    TableName: 'FAC-Webhooks',
                    ExpressionAttributeValues: { ":removed": AWS.DynamoDB.Converter.input('TRANSACTIONS_REMOVED') },
                    FilterExpression: "webhook_code = :removed",
                    ProjectionExpression: 'removed_transactions, item_id'
                };

                scanDdb(params, [], function(err, res) {
                    if (err) {
                        cb(err);
                    }
                    else {

                        let keys = _
                            .chain(res)
                            .map('item_id')
                            .flatten()
                            .uniq()
                            .value() || [];
                        // console.log(JSON.stringify(keys, null, 2));

                        let out = {};

                        _.each(keys, function(key) {

                            let tidsForKey = _
                                .chain(res)
                                .filter(function(itm) { return itm.item_id == key })
                                .map('removed_transactions')
                                .flatten()
                                .uniq()
                                .value() || [];

                            out[key] = tidsForKey;
                        });

                        console.log(JSON.stringify(out, null, 2));
                        cb(null, out);
                    }
                });

            },

            delete_transactions: ['pull_transaction_removed_webhooks', function(results, cb) {

                _.each(results.pull_transaction_removed_webhooks, function(val, key) {

                    lambda.invoke(

                        {
                            FunctionName: "FIO-Lambda-User-Transactions-Delete",
                            Payload: JSON.stringify({
                                item_id: key,
                                transactionIds: val
                            })
                        },

                        function(error, data) {
                            if (error) { console.error(JSON.stringify(error)); }
                            else { console.log('Payload: ' + data.Payload); }
                        }
                    );
                });

                cb();
            }]

        },

        function(err, results) {
            callback(err, 'hi');
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
                    console.log('Finished scan operation with a total of ' + accumulatorArray.length + ' records');
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

const moment = require('moment-timezone');

function setupMoment() {
    moment.tz.setDefault("America/New_York"); // set timezone to eastern
    moment.updateLocale('en', { week: { dow: 1 } }); // Set first day of week to monday
}
