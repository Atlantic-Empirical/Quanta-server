//
//  QIO-Lambda-Nightly-User-Quantize()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId, optional: .skipNotify, .pullFullTransactionHistory
//  Output: categories and dateNets
//

'use strict';
const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');
const qfin = require('./QuantaFin/FIO-QuantaFin');
const qplaid = require('./QuantaPlaid/FIO-Plaid');
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isUndefined(event.userId)) {
        console.log('userId is missing');
        callback(null, event);
    }
    else if (!_.isUndefined(event.items) && _.isEmpty(event.items)) {
        console.log('empty items array passed in indicating that this user has no items connected, so bouncing.');
        callback(null, event);
    }
    else {
        delete event.item; // this is not needed anymore, there is also an array of items passed in
        delete event.hasItemsToProcess;
        delete event.pendingTransactionBatchCount;
        quantize(event.userId, callback, event.skipNotify, event.pullFullTransactionHistory);
    }
});

function quantize(userId, callback, skipNotify = false, pullFullTransactionHistory = false) {
    console.time('Quantize()');
    qlib.persist.setUserQuantizeIsRunning(userId, true);
    var timingsObj = {};
    timer('quantize', timingsObj);
    _async.auto({

            // ======================
            // SUBSCRIPTION
            update_subscription_status: cb => {
                console.log('in update_subscription_status');
                timer('update_subscription_status', timingsObj);
                checkSubscriptionStatus(userId, (err, res) =>
                    addTimingCallback('update_subscription_status', timingsObj, cb, err, res));
            },

            // ======================
            // ITEMS FROM DDB;
            pull_items: cb => {
                console.log('in pull_items');
                timer('pull_items', timingsObj);
                qlib.persist.pullUserItems(userId, (err, res) => {
                    if (_.isEmpty(res)) noItemCleanup(userId, callback);
                    else addTimingCallback('pull_items', timingsObj, cb, err, res);
                });
            },
            add_accounts_to_items: ['pull_items', (results, cb) => {
                console.log('in add_accounts_to_items');
                timer('add_accounts_to_items', timingsObj);
                _async.each(results.pull_items, (item, cb_each) =>
                    qlib.persist.pullItemAccounts(item.item_id, (err, res) => {
                        if (err) cb_each(err);
                        else {
                            item.accounts = res;
                            cb_each();
                        }
                    }),
                    err => addTimingCallback('add_accounts_to_items', timingsObj, cb, err, results.pull_items)
                );
            }],
            add_institution_info_to_items: ['pull_items', (results, cb) => {
                console.log('in add_institution_info_to_items');
                timer('add_institution_info_to_items', timingsObj);
                _async.each(results.pull_items, (item, cb_each) =>
                    qlib.persist.pullInstitution(item.institution_id, (err, ins) => {
                        if (err) cb_each(err);
                        else {
                            item.institutionDetails = {
                                colors: ins.colors,
                                brand_name: ins.brand_name,
                                brand_subheading: ins.brand_subheading,
                                link_health_status: ins.link_health_status,
                                health_status: ins.health_status,
                                name: ins.name,
                                url: ins.url,
                                url_account_locked: ins.url_account_locked
                            };
                            cb_each();
                        }
                    }),
                    err => addTimingCallback('add_institution_info_to_items', timingsObj, cb, err, results.pull_items)
                );
            }],

            // ======================
            // FRESH ACCOUNT INFO FROM PLAID
            pull_fresh_account_info: ['add_accounts_to_items', (results, cb) => {
                console.log('in pull_fresh_account_info');
                timer('pull_fresh_account_info', timingsObj);
                _async.each(results.add_accounts_to_items, (item, cb_each) =>
                    qplaid.getAccountsForItem(item.access_token, item.item_id, userId, (err, freshAccounts) => {
                        if (err) {
                            if (err == "ITEM_LOGIN_REQUIRED") {
                                console.log("User has item in need of login. Persisting the emergency userHome and bailing out.");
                                persistItemLoginRequiredUserHome(userId, results.add_accounts_to_items, cb);
                                return false; // exit the loop
                            }
                            console.error('One or more items failed to pull fresh balances from plaid: ' + err.message);
                        }
                        else {
                            qlib.persist.mergeFreshAccountInfoForItem(item, freshAccounts, (err, mergedAccountsForItem) => {
                                if (err) cb_each(err);
                                else {
                                    item.accounts = mergedAccountsForItem;
                                    cb_each();
                                }
                            });
                        }
                    }),
                    (err) => {
                        let accounts = _.chain(results.add_accounts_to_items).map('accounts').flatten().value();
                        addTimingCallback('pull_fresh_account_info', timingsObj, cb, err, accounts);
                    }
                );
            }],
            persist_fresh_account_info: ['pull_fresh_account_info', (results, cb) => {
                console.log('in persist_fresh_account_info');
                timer('persist_fresh_account_info', timingsObj);
                _.each(results.pull_fresh_account_info, i => i.lastSynced = Date.now());
                qlib.persist.batchWriteAccounts(results.pull_fresh_account_info, (err, res) =>
                    addTimingCallback('persist_fresh_account_info', timingsObj, cb, err, res));
            }],

            // ======================
            // INITIALIZE CATEGORY PICKER
            initialize_category_picker: ['pull_fresh_account_info', (results, cb) => {
                console.log('in initialize_category_picker');
                timer('initialize_category_picker', timingsObj);
                qfin.transaction_categorization.init(results.pull_fresh_account_info, (err, res) =>
                    addTimingCallback('initialize_category_picker', timingsObj, cb, err, res));
            }],

            // ======================
            // FRESH TRANSACTIONS FROM PLAID
            pull_fresh_transactions_for_items: ['pull_fresh_account_info', (results, cb) => {
                console.log('in pull_fresh_transactions_for_items');
                timer('pull_fresh_transactions_for_items', timingsObj);
                var transactionAggregator = [];
                var since = pullFullTransactionHistory ? "all" : "sinceLast";
                _async.each(results.add_accounts_to_items, (I, cb_each) =>
                    qplaid.pullTransactionsForItem(I.item_id, I.access_token, userId, (err, res) => {
                        if (err) cb_each(err);
                        else {
                            transactionAggregator.push(...res);
                            let yesterdayTransactions = _.filter(res, T => T.date == moment().subtract(1, 'day').format('YYYY-MM-DD'));
                            I.pulledTransactionCounts = {
                                total: res.length,
                                yesterday: _.get(yesterdayTransactions, 'length', 0)
                            };
                            cb_each();
                        }
                    }, since),
                    err => addTimingCallback('pull_fresh_transactions_for_items', timingsObj, cb, err, transactionAggregator)
                );
            }],
            add_transaction_info_to_new_transactions: ['pull_fresh_transactions_for_items', 'pull_fresh_account_info', 'initialize_category_picker', (results, cb) => {
                console.log('in add_transaction_info_to_new_transactions');
                timer('add_transaction_info_to_new_transactions', timingsObj);
                let out = _.map(results.pull_fresh_transactions_for_items, tx => {
                    tx.insertTimestamp = Date.now();
                    tx.masterAccountId = selectMasterAccountIdForNewTransaction(tx, results.pull_fresh_account_info); // must happen before cat select
                    tx.fioCategoryId = qfin.transaction_categorization.pickFlowCategoryForTransaction(tx);
                    qlib.tx.addTypeToTransaction(tx, results.pull_fresh_account_info);
                    return tx;
                });
                addTimingCallback('add_transaction_info_to_new_transactions', timingsObj, cb, null, out);
            }],
            filter_new_transactions_for_hidden_accounts: ['add_transaction_info_to_new_transactions', (results, cb) => {
                let hiddenAccountMaids = _.chain(results.pull_fresh_account_info).filter(A => A.hidden).map('masterAccountId').value();
                let filteredTransactions = _.filter(results.add_transaction_info_to_new_transactions, TX => !_.includes(hiddenAccountMaids, TX.masterAccountId));
                cb(null, filteredTransactions);
            }],
            persist_fresh_transactions: ['filter_new_transactions_for_hidden_accounts', (results, cb) => {
                console.log('in persist_fresh_transactions');
                timer('persist_fresh_transactions', timingsObj);
                qlib.persist.batchWriteTransactions(results.filter_new_transactions_for_hidden_accounts, (err, result) => {
                    if (!err) console.log(results.filter_new_transactions_for_hidden_accounts.length + ' Fresh transactions written successfully.');
                    addTimingCallback('persist_fresh_transactions', timingsObj, cb, err);
                });
            }],
            delete_pending_transactions: ['filter_new_transactions_for_hidden_accounts', (results, cb) => {
                console.log('in delete_pending');
                timer('delete_pending', timingsObj);
                let pending_tids = _
                    .chain(results.filter_new_transactions_for_hidden_accounts)
                    .map('pending_transaction_id')
                    .compact().value() || [];
                console.log(pending_tids.length + ' pending transactions to delete.');
                qlib.persist.batchDeleteTransactionsByTids(userId, pending_tids, (err, res) =>
                    addTimingCallback('delete_pending', timingsObj, cb, err, res));
            }],
            cloudsearch_ingest: ['filter_new_transactions_for_hidden_accounts', (results, cb) => {
                console.log('in cloudsearch_ingest');
                timer('cloudsearch_ingest', timingsObj);
                qlib.cs.putTransactions(results.filter_new_transactions_for_hidden_accounts, (err, res) =>
                    addTimingCallback('cloudsearch_ingest', timingsObj, cb, err, res)
                );
            }],

            // ======================
            // EXISTING TRANSACTIONS FROM DDB
            pull_transactions_from_ddb: ['pull_fresh_account_info', 'delete_pending_transactions', (results, cb) => {
                // Must wait for delete_pending_transactions in order to ensure that pending txs that are ABOUT to be deleted aren't pulled and included in this night's quantize... Important!
                console.log('in pull_transactions_from_ddb');
                timer('pull_transactions_from_ddb', timingsObj);
                qlib.persist.pullAllUserTransactions(userId, (err, allTransactionsForUser) =>
                    addTimingCallback('pull_transactions_from_ddb', timingsObj, cb, err, allTransactionsForUser)
                );
            }],
            filter_existing_transactions_for_hidden_accounts: ['pull_transactions_from_ddb', (results, cb) => {
                let hiddenAccountMaids = _.chain(results.pull_fresh_account_info).filter(A => A.hidden).map('masterAccountId').value();
                let filteredTransactions = _.filter(results.pull_transactions_from_ddb, TX => !_.includes(hiddenAccountMaids, TX.masterAccountId));
                cb(null, filteredTransactions);
            }],
            update_existing_transaction_categories: ['filter_existing_transactions_for_hidden_accounts', 'initialize_category_picker', (results, cb) => {
                console.log('in update_existing_transaction_categories');
                timer('update_existing_transaction_categories', timingsObj);
                //   Important: This returns just the transactions that received new categories and must be written.
                var transactionsToWrite = _.filter(results.filter_existing_transactions_for_hidden_accounts, (tx) => {
                    let newFioCategory = qfin.transaction_categorization.pickFlowCategoryForTransaction(tx);
                    // console.log(newFioCategory);
                    if (tx.fioCategoryId == newFioCategory) return false; // The category is already correct.
                    else {
                        tx.fioCategoryId = newFioCategory; // new category for this transaction
                        return true; // write it
                    }
                });
                console.log('End of assign_categories. ' + transactionsToWrite.length + ' transactions received new FIO categories.');
                addTimingCallback('update_existing_transaction_categories', timingsObj, cb, null, transactionsToWrite);
            }],
            write_existing_transactions_with_new_categories: ['update_existing_transaction_categories', 'persist_fresh_transactions', (results, cb) => {
                console.log('in write_existing_transactions_with_new_categories');
                console.log(results.update_existing_transaction_categories.length + ' transactions with new categories to write.');
                timer('write_existing_transactions_with_new_categories', timingsObj);
                _async.each(results.update_existing_transaction_categories, (tx, cb_each) =>
                    qlib.persist.persistUserTransactionCategory(userId, tx, cb_each),
                    err => {
                        if (err) console.log('A tx failed to write.');
                        else console.log('All transactions have been processed and written successfully');
                        addTimingCallback('write_existing_transactions_with_new_categories', timingsObj, cb);
                    }
                );
            }],

            // ======================
            // MERGE NEW & EXISTING TRANSACTIONS
            merged_transactions: ['filter_existing_transactions_for_hidden_accounts', 'filter_new_transactions_for_hidden_accounts', 'update_existing_transaction_categories', (results, cb) => {
                console.log('in merged_transactions');
                timer('merged_transactions', timingsObj);
                // IMPORTANT: wait for update_existing_transaction_categories but use filter_existing_transactions_for_hidden_accounts
                let allTransactions = _.concat(results.filter_existing_transactions_for_hidden_accounts, results.filter_new_transactions_for_hidden_accounts);
                allTransactions = _.uniqBy(allTransactions, 'transaction_id'); // There can be duplicates here if a tx was ingested in the past 45 days.
                allTransactions = conditionTransactions(allTransactions, results.pull_fresh_account_info); // IMPORTANT
                addTimingCallback('merged_transactions', timingsObj, cb, null, allTransactions);
            }],
            add_transaction_info_to_items: ['merged_transactions', 'pull_items', (results, cb) => {
                console.log('in add_transaction_info_to_items');
                timer('add_transaction_info_to_items', timingsObj);
                _async.each(results.pull_items, (item, cb_each) =>
                    qlib.persist.pullInstitution(item.institution_id, (err, ins) => {
                        if (err) cb_each(err);
                        else {
                            let transactionsForItem = _
                                .chain(results.merged_transactions)
                                .filter(tx => tx.item_id == item.item_id)
                                .orderBy('date', 'desc')
                                .value();
                            if (transactionsForItem.length > 0) {
                                let latestTransaction = _.first(transactionsForItem);
                                item.transactionDetails = {
                                    oldestTransactionDate: _.chain(transactionsForItem).last().get('date', "").value(),
                                    transactionCount: transactionsForItem.length,
                                    latestTransactionDate: latestTransaction.date,
                                    latestTransactionAmount: latestTransaction.amount,
                                    latestTransactionName: latestTransaction.name
                                };
                            }
                            cb_each();
                        }
                    }),
                    err => addTimingCallback('add_transaction_info_to_items', timingsObj, cb, err, results.pull_items)
                );
            }],

            // ======================
            // INCOME
            streamify_income: ['merged_transactions', (results, cb) => {
                console.log('in streamify_income');
                timer('streamify_income', timingsObj);
                qfin.streams.streamify(results.merged_transactions, 'income', (err, res) => {
                    addTimingCallback('streamify_income', timingsObj, cb, err, res);
                });
            }],
            write_income_transactions_with_new_categories: ['streamify_income', 'write_existing_transactions_with_new_categories', (results, cb) => {
                console.log('in write_income_transactions_with_new_categories');
                console.log(results.streamify_income.transactionsWithUpdatedFioCatId.length + ' income transactions with new categories to write.');
                timer('write_income_transactions_with_new_categories', timingsObj);
                _async.each(results.streamify_income.transactionsWithUpdatedFioCatId, (tx, cb_each) =>
                    qlib.persist.persistUserTransactionCategory(userId, tx, cb_each),
                    err => {
                        if (err) console.log('A tx failed to write.');
                        else console.log('All transactions have been processed and written successfully');
                        _.unset(results.streamify_income, 'transactionsWithUpdatedFioCatId');
                        addTimingCallback('write_income_transactions_with_new_categories', timingsObj, cb);
                    }
                );
            }],

            // ======================
            // SPENDING
            build_spending: ['merged_transactions', (results, cb) => {
                console.log('in build_spending');
                timer('build_spending', timingsObj);
                qfin.spending.buildSpendingSummary(results.merged_transactions, (err, res) => {
                    addTimingCallback('build_spending', timingsObj, cb, err, res);
                });
            }],

            // ======================
            // DATE NETS
            build_date_nets: ['merged_transactions', 'streamify_income', (results, cb) => {
                console.log('in build_date_nets');
                timer('build_date_nets', timingsObj);
                qfin.dateNets.buildDateNets(results.streamify_income, results.merged_transactions, (err, res) =>
                    addTimingCallback('build_date_nets', timingsObj, cb, err, res));
            }],

            // ======================
            // STATEMENT DAYS
            build_statement_days: ['pull_fresh_account_info', 'merged_transactions', (results, cb) => {
                console.log('in build_statement_days');
                timer('build_statement_days', timingsObj);
                //   Important: we're blocking for completion of new category assignment here intentionally but 
                //   using the FULL transaction set from _ddb which have the newly assigned categories as appropriate
                var finalStatementDays = [];
                _async.each(results.pull_fresh_account_info, (account, cb_each) => {
                    if (account.hidden) cb_each();
                    else {
                        let days = qfin.statement.buildStatementDaysForAccount(account, results.merged_transactions);
                        finalStatementDays.push(...days);
                        cb_each();
                    }
                }, err => addTimingCallback('build_statement_days', timingsObj, cb, err, finalStatementDays));
            }],

            // ======================
            // FLOW
            build_daily_flow: ['build_date_nets', 'build_statement_days', (results, cb) => {
                console.log('in build_daily_flow');
                timer('build_daily_flow', timingsObj);
                let dailyFlow = qfin.periods.buildFlowPeriodsForWindowSize(1, results.build_date_nets, results.build_statement_days); // income and home not needed because there's never a projection for daily....
                addTimingCallback('build_daily_flow', timingsObj, cb, null, dailyFlow);
            }],
            build_weekly_flow: ['build_date_nets', 'build_statement_days', 'streamify_income', 'build_spending', (results, cb) => {
                console.log('in build_weekly_flow');
                timer('build_weekly_flow', timingsObj);
                let weeklyFlow = qfin.periods.buildFlowPeriodsForWindowSize(7, results.build_date_nets, results.build_statement_days, results.streamify_income, results.build_spending.daily.averageAmount);
                addTimingCallback('build_weekly_flow', timingsObj, cb, null, weeklyFlow);
            }],
            build_monthly_flow: ['build_date_nets', 'build_statement_days', 'streamify_income', 'build_spending',
                (results, cb) => {
                    console.log('in build_monthly_flow');
                    timer('build_monthly_flow', timingsObj);
                    let monthlyFlow = qfin.periods.buildFlowPeriodsForWindowSize(
                        30,
                        results.build_date_nets,
                        results.build_statement_days,
                        results.streamify_income,
                        results.build_spending.daily.averageAmount
                    );
                    addTimingCallback('build_monthly_flow', timingsObj, cb, null, monthlyFlow);
                }
            ],
            persist_flow: ['build_monthly_flow', 'build_weekly_flow', 'build_daily_flow', (results, cb) => {
                console.log('in persist_flow');
                timer('persist_flow', timingsObj);
                let allFlowObjs = _.concat(results.build_monthly_flow, results.build_weekly_flow, results.build_daily_flow);
                _.each(allFlowObjs, o => { // Lighten the load 
                    _.unset(o, 'periodSummary.transactions.creditCardPayments.transactions');
                    if (qlib.obj.isNilOrEmpty(o, 'periodSummary.transactions.creditCardPayments'))
                        _.unset(o, 'periodSummary.transactions.creditCardPayments');
                });
                qlib.persist.persistUserFlow(userId, allFlowObjs, (err, res) =>
                    addTimingCallback('persist_flow', timingsObj, cb, err, res));
            }],

            // ======================
            // USER HOME
            build_user_home: [
                'pull_fresh_account_info', 'streamify_income', 'merged_transactions', 'add_transaction_info_to_items', 'build_statement_days', 'build_spending', 'build_monthly_flow', 'build_daily_flow',
                (results, cb) => {
                    console.log('in build_user_home');
                    let uh = qfin.userHome.buildUserHome(
                        userId,
                        results.pull_items,
                        results.pull_fresh_account_info,
                        results.merged_transactions,
                        results.streamify_income,
                        results.build_spending,
                        results.build_statement_days,
                        results.build_monthly_flow,
                        results.build_daily_flow
                    );
                    cb(null, uh);
                }
            ],
            persist_user_home: ['build_user_home', (results, cb) => {
                console.log('in persist_user_home');
                timer('persist_user_home', timingsObj);
                qlib.persist.persistUserDetailObject(userId, 0, results.build_user_home, (err, res) =>
                    addTimingCallback('persist_user_home', timingsObj, cb, err, res));
            }],

            // ======================
            // FLOW NOTIF
            flow_notif: ['persist_flow', 'add_accounts_to_items', 'build_date_nets', (results, cb) => {
                console.log('in flow_notif');
                if (skipNotify == true)
                    cb();
                else {
                    timer('flow_notif', timingsObj);
                    let transactionCount = _.chain(results.add_accounts_to_items).map('pulledTransactionCounts.yesterday').reduce((m, i) => m + i).value();
                    qlib.notifs.flowNotify(userId, transactionCount, _.first(results.build_date_nets), (err, res) =>
                        addTimingCallback('flow_notif', timingsObj, cb, err, res));
                }
            }]

        },
        (err, results) => {
            console.log("All steps returned.");
            console.timeEnd('Quantize()');
            qlib.persist.setUserQuantizeIsRunning(userId, false);
            timingsObj['quantize'].end = Date.now();
            timingsObj['quantize'].total = _.round((timingsObj['quantize'].end - timingsObj['quantize'].start) / 1000, 3);
            qlib.log.interesting({
                    err: err,
                    userId: userId,
                    timings: timingsObj,
                },
                "Quantize()");

            // // Output timing info
            // var csv = "\nstep,start,end,total\n";
            // _.forOwn(timingsObj, (v, k) => csv += k + "," + v.start + "," + v.end + "," + v.total + "\n");
            // console.log(csv);

            if (err) {
                if (err == "ITEM_LOGIN_REQUIRED") callback(null, "ITEM_LOGIN_REQUIRED");
                else {
                    let msgStr = JSON.stringify({
                        userId: userId,
                        err: err,
                    }, null, 2);
                    console.log('ULTIMATE ERROR\n' + msgStr);
                    qlib.log.rollbar.critical("QUANTIZE FAIL: " + err.message + "\n" + msgStr);
                    qlib.log.significantError(msgStr, "Quantize");
                    callback(err);
                }
            }
            else callback(null, "Done.");
        }
    );
}

function addTimingCallback(functionName, timingsObj, cb, err, res) {
    // console.log(functionName); 
    timingsObj[functionName].end = Date.now();
    timingsObj[functionName].total = _.round((timingsObj[functionName].end - timingsObj[functionName].start) / 1000, 3);
    if (err) {
        if (_.isString(err)) {
            err = {
                message: err,
                functionName: functionName
            };
        }
        else err.functionName = functionName;
    }
    cb(err, res);
}

function timer(functionName, timingsObj) {
    timingsObj[functionName] = {};
    timingsObj[functionName].start = Date.now();
}

function checkSubscriptionStatus(userId, callback) {
    qlib.persist.pullUserSubscription(userId, (err, subscription) => {
        if (err) callback(err);
        else {
            if (_.isNil(subscription)) callback(null, "User doesn't have a subscription.");
            else if (!_.isNil(subscription.promoCode) && !_.isNil(subscription.promoGrantUntilTimestamp)) {
                let expirationM = moment(subscription.promoGrantUntilTimestamp * 1000);
                if (expirationM.isAfter(moment())) callback(null, 'Completed - is in promoCode period.'); // Code is still in effect / valid
                else revalidateAppleSubscriptionReceipt(userId, subscription.latest_receipt_b64, callback); // promoCode is expired
            }
            else revalidateAppleSubscriptionReceipt(userId, subscription.latest_receipt_b64, callback); // No promoCode
        }
    });
}

function revalidateAppleSubscriptionReceipt(userId, receiptB64, callback) {
    qlib.lambda.invoke("QIO-Lambda-ASDS-User-Subscription-ReceiptValidate", (err, data) => {
        if (err) callback(err);
        else {
            console.log('updateSubscriptionStatus() results: ' + JSON.stringify(data, null, 2));
            callback(null, 'Completed.');
        }
    }, { receipt: receiptB64, userId: userId }, true);
}

function conditionTransactions(transactions, accounts) {

    // FILTER OUT mutant, zombie walking dead transaction from an account that's been removed.
    let masterAccountIds = _.map(accounts, 'masterAccountId');
    transactions = _.filter(transactions, tx => _.includes(masterAccountIds, tx.masterAccountId));

    _.each(transactions, tx => {
        tx.account = _.find(accounts, A => A.masterAccountId == tx.masterAccountId);
        tx.isRecognizedTransferOrRefund = qlib.tx.transactionIsRecognizedTransferOrRefund(tx);
        tx.amountRounded = _.round(tx.amount, 0);
        tx.isSpend =
            tx.amount > 0 && // CONFIRMED positive amounts are spend on BOTH checking and credit accounts
            !tx.isRecognizedTransferOrRefund;
    });

    return transactions;
}

function persistItemLoginRequiredUserHome(userId, items, callback) {
    let out = qfin.userHome.buildItemLoginRequiredUserHome(userId, items);
    qlib.persist.persistUserDetailObject(userId, 0, out, (err, res) => {
        if (err) console.log(err);
        callback("ITEM_LOGIN_REQUIRED", "ITEM_LOGIN_REQUIRED");
    });
}

function selectMasterAccountIdForNewTransaction(tx, accounts) {
    let matchedAccount = _.find(accounts, A => {
        if (!_.isArray(A.account_id)) A.account_id = [A.account_id];
        return _.includes(A.account_id, tx.account_id);
    });

    if (_.isUndefined(matchedAccount)) {
        // oooh, we've got a problem.
        let msg = 'No matching account for transaction_id: ' + tx.transaction_id + ' with account_id: ' + tx.account_id;
        console.log('STOP AND INVESTIGATE THIS ' + msg);
        qlib.log.investigateFurther(msg, 'selectMasterAccountIdForNewTransaction in FIO-Lambda-System-Transactions-Ingest()');
        return '';
    }
    else return matchedAccount.masterAccountId;
}

function noItemCleanup(userId, callback) {
    console.log('This user has no items.');
    qlib.persist.setUserQuantizeIsRunning(userId, false);
    qlib.persist.removeDetailObjectsNoItemCase(userId, (err, result) => {
        if (err) {
            let msg = "Failed to remove all of user's orphaned detail objects.";
            console.log(msg);
            callback(null, msg);
        }
        else {
            let msg = "Removed user's orphaned detail objects";
            console.log(msg);
            callback(null, msg);
        }
    });
}


// function flowNotify(userId, items, dateNets, thisWeek, thisMonth, callback) {
//     // 🆘⚠️🔴🛑💰💵🏦🏆🏅👆👇☝️👍👎💸💩📈📉🤔😬🤗😖😏🤩😎🤯😳🤭😲🤤😋😉😡🤬😠😤😭😫😩😊☺️😇🙂🤑😨😱😥🔼🔽
//     // ❗️✅

//     let yesterdayDateNet = _.first(dateNets);
//     let transactionCount = _.chain(items).map('pulledTransactionCounts.yesterday').reduce((m, i) => m + i).value();

//     qlib.notifs.notifyUser({
//             userId: userId,
//             title: "Yesterday's Net                                          " + netToString(yesterdayDateNet.netAmount),
//             subtitle: flowNotifSubtitle(yesterdayDateNet.netAmount),
//             body: flowNotifBody(yesterdayDateNet, transactionCount, thisWeek, thisMonth),
//             badgeCount: transactionCount,
//             sound: 'default',
//             collapseKey: 1,
//             customData: {
//                 messageType: 1,
//                 date: yesterdayDateNet.date
//             }
//         },
//         callback);
// }

// function flowNotifSubtitle(net) {
//     if (net == 0) return 'YESTERDAY $' + qlib.obj.financialString(Math.abs(net));
//     else return 'YESTERDAY ' + (net > 0 ? '▴ ' : '▾ ') + '$' + qlib.obj.financialString(Math.abs(net));
// }

// function flowNotifBody(yesterdayDateNet, transactionCount, thisWeek, thisMonth) {
//     var body = '';

//     // YESTERDAY
//     body += '   ' + transactionCount + ' Transaction' + (transactionCount != 1 ? 's' : '');
//     body += ': $' + qlib.obj.financial(_.get(yesterdayDateNet, 'income', 0)) + ' In, $' + qlib.obj.financial(Math.abs(_.get(yesterdayDateNet, 'transactions.debits.totalAmount', 0))) + ' Out\n';

//     // // WEEK
//     // body += 'WEEK ';
//     // let weekNet_soFar = _.get(thisWeek, 'periodSummary.netAmount', 0);
//     // let weekNet_projection = _.get(thisWeek, 'projection.net', 0);
//     // body += (weekNet_soFar >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(weekNet_soFar)) + (weekNet_soFar < 0 ? '❗' : ' ✅');
//     // body += ' ⌁ ';
//     // body += (weekNet_projection >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(weekNet_projection)) + (weekNet_projection < 0 ? '❗' : ' ✅') + '\n';

//     // MONTH
//     if (!moment().isSame(thisMonth.startDate, 'day')) {
//         let monthName = moment().format('MMMM');
//         let monthNet_soFar = _.get(thisMonth, 'periodSummary.netAmount', 0);
//         let monthNet_projection = _.get(thisMonth, 'projection.net', 0);
//         body += monthName.toUpperCase() + '\n';
//         body += '   So far: ' + (monthNet_soFar >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_soFar)) + (monthNet_soFar < 0 ? '❗️' : ' ✅') + '\n';
//         body += '   Projection: ' + (monthNet_projection >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_projection)) + (monthNet_projection < 0 ? '❗️' : ' ✅') + '\n';
//     }

//     return body;
// }
