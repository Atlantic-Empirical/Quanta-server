// FIO-Lambda-Admin-Categories-Assign()
// Input: .userId

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const _async = require('async');
const qlib = require('./QuantaLib/FIO-QuantaLib');
const qfin = require('./QuantaFin/FIO-QuantaFin');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    _async.auto({
            pull_accounts: cb => qlib.persist.pullUserAccounts(event.userId, cb),
            pull_transactions: cb => qlib.persist.pullAllUserTransactions(event.userId, cb),
            init_category_picker: ['pull_accounts', (results, cb) => qfin.transaction_categorization.init(results.pull_accounts, cb)],
            assign_categories: ['init_category_picker', 'pull_transactions', 'pull_accounts', (results, cb) => {
                console.log('pulled ' + results.pull_transactions.length + ' transactions. Starting to assign categories and update the transaction in the table');
                let transactionsToWrite = _.filter(results.pull_transactions, tx => {
                    let newFioCategory = qfin.transaction_categorization.pickFlowCategoryForTransaction(tx);
                    // console.log(newFioCategory);
                    if (tx.fioCategoryId == newFioCategory) return false; // category is already correct
                    else {
                        // new category for this transaction
                        tx.fioCategoryId = newFioCategory;
                        console.log('New category (' + newFioCategory + ') for: ' + tx.name);
                        return true; // write it
                    }
                });
                console.log('End of assign_categories. ' + transactionsToWrite.length + ' transactions received new FIO categories.');
                cb(null, transactionsToWrite);
            }],
            write_transactions: ['assign_categories', (results, cb) => qlib.persist.batchWriteTransactions(results.assign_categories, cb)]
        },
        (err, results) => {
            if (err) console.log('err = ', err);
            // if (results) console.log('results = ' + JSON.stringify(results, null, 2));
            callback(err, 'done');
        }
    );
});
