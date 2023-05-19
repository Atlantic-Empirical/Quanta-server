'use strict';

// FIO-Plaid

const plaid = require('plaid');
var clientProd, clientSandbox, clientDev;
const _ = require('lodash');
const _async = require('async');

const q_persist = require("../QuantaLib/Core/FIO-Persist");
const q_notifs = require("../QuantaLib/Core/FIO-Notify");
const q_obj = require("../QuantaLib/Util/FIO-Util-ObjectStuff");
const q_s3 = require("../QuantaLib/AWS/FIO-AWS-S3");
const FIOError = require("../QuantaLib/Helper/FIO-Error");
const q_date = require("../QuantaLib/Util/FIO-Util-Date");
const q_log = require("../QuantaLib/Core/FIO-Logging");
// const q_csv = require("../QuantaLib/Util/QIO-Util-CSV");
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = q_date.prepMoment(momentO);

const biteSize = 500;

module.exports = {

    getAccountsForItem: (access_token, item_id, userId, callback) =>
        _pullItemAccounts(access_token, item_id, userId, callback),
    removeItem: (access_token, callback) => _removeItem(access_token, callback),
    getItem: (access_token, callback) => _getItem(access_token, callback),
    getCategories: callback => _getCategories(callback),
    getInstitution: (institution_id, callback) => _getInstitution(institution_id, callback),
    getInstitutions: (institution_ids, callback) => _getInstitutions(institution_ids, callback),
    pullTransactionsForItem: (item_id, access_token, userId, callback, period, rangeStartDate, rangeEndDate) =>
        _pullTransactionsForItem(item_id, access_token, userId, callback, period, rangeStartDate, rangeEndDate),
    exchangeTokens: (public_token, callback) => _exchangeTokens(public_token, callback),
    createPublicToken: (access_token, callback) => _createPublicToken(access_token, callback),
    updateInstitution: (ins_id, callback, env) => _updateInstitution(ins_id, callback, env),

};

function _updateInstitution(ins_id, callback, env = "production") {
    _getInstitution(ins_id, (err, res) => {
        if (err) callback(err);
        else {
            q_s3.putObject(res.logo, "flow.app.banklogos." + env, ins_id, (err, s3res) => {
                if (err) console.log(JSON.stringify(err, null, 2));
                delete res.logo;
                q_persist.putInstitution(res, callback);
            }, "public-read");
        }
    });
}

function _pullTransactionsForItem(item_id, access_token, userId, callback, period = "sinceLast", rangeStartDate, rangeEndDate) {

    _async.auto({
            get_start_date: cb => {
                switch (period) {
                    case 'all':
                        cb(null, q_date.tenYearsAgoString());
                        break;
                    case 'range':
                        if (_.isUndefined(rangeStartDate)) cb('range start is unspecified');
                        else cb(null, rangeStartDate);
                        break;
                    case 'sinceLast':
                    default:
                        // Changed this to last 45 days
                        cb(null, moment().subtract(45, 'days').format('YYYY-MM-DD'));
                        // qlib.persist.pullLastTransactionRetrievalTimestamp(results.get_props.item_id, cb);
                        break;
                }
            },
            get_end_date: cb => {
                let yesterday = moment().subtract(1, 'days').format("YYYY-MM-DD");
                switch (period) {
                    case 'all':
                    case 'sinceLast':
                        cb(null, yesterday);
                        break;
                    case 'range':
                        if (_.isUndefined(rangeEndDate)) cb('range end is unspecified');
                        else cb(null, rangeEndDate);
                        break;
                }
            },
            recursive_pull: ['get_start_date', 'get_end_date', (results, cb) => {
                console.log('in recursive_pull for ' + results.get_start_date + ' - ' + results.get_end_date);
                _innerPullTransactionsForItem(item_id, userId, access_token, results.get_start_date, results.get_end_date, cb);
            }],
            store_transaction_pull_time: ['recursive_pull', (results, cb) => {
                q_persist.setItemLastTransactionPullToNow(item_id, cb);
            }]
        },
        (err, results) => {
            if (err) {
                q_log.significantError(err, "_pullItemTransactionsFromPlaid");
                callback(new FIOError(err.message));
            }
            else callback(null, results.recursive_pull.transactions);
        }
    );
}

function _innerPullTransactionsForItem(item_id, userId, accessToken, startDate, endDate, callback, cursor = 0, inputArray = []) {
    console.log('ENTER RECURSIVE @: ' + cursor + ' inputArray has ' + inputArray.length + ' items in it.');
    let client = selectClient(accessToken);
    let options = { count: biteSize, offset: cursor };
    console.time('LOOP TIME _pullTransactionsForItem' + cursor.toString());
    // try calling getTransactions 10 times with exponential backoff only on PRODUCT_NOT_READY case
    // (i.e. intervals of 100, 200, 400, 800, 1600, ... milliseconds)
    _async.retry({
            times: 8,
            interval: retryNumber => 250 * Math.pow(2, retryNumber), // 1000 = 2, 4, 8, 16, 32, 64, 128, 256s
            errorFilter: err => err.error_code == "PRODUCT_NOT_READY" // only retry on a specific error
        },
        cb => {
            console.log("about to call getTransactions() with cursor at " + cursor);
            client.getTransactions(accessToken, startDate, endDate, options, (err, res) => {
                // console.log("batch:\n" + JSON.stringify(res));

                scrubTransactionPII(res.transactions);

                // q_csv.objToCsv(res.transactions, (err, res2) => {
                //     if (err) console.log(err);
                //     else console.log(res2);
                // });

                console.log('getTransactions() returned');
                if (err) {
                    console.log('getTransactions error:\n' + JSON.stringify(err, null, 2));
                    if (plaid.isPlaidError(err)) {
                        console.log('*** PLAID ERROR ***');
                        if (err.error_code == 'ITEM_LOGIN_REQUIRED') {
                            cb(null, "ITEM_LOGIN_REQUIRED");
                        }
                        else if (err.error_code == "PRODUCT_NOT_READY") cb(err); // will use the async retry logic above.
                    }
                    else cb(err); // non-plaid error ocurred, use retry logic
                }
                else {
                    // console.log('Received response from plaid.getTransactions():\n' + JSON.stringify(res, null, 2));
                    if (res.total_transactions == 0) {
                        console.log('No new transactions.');
                        let response = {
                            transactions: [], // nothing to report
                            item_id: res.item.item_id,
                            institution_id: res.item.institution_id
                        };
                        cb(null, response);
                    }
                    else {
                        console.log('Received ' + res.transactions.length + ' transactions for item from Plaid.');
                        res.transactions = _.map(res.transactions, tx => {
                            tx = q_obj.compactObject(tx); // Remove the cruft that Plaid sends
                            tx.item_id = item_id;
                            tx.userId = userId;
                            tx.institution_id = res.item.institution_id;
                            return tx;
                        });
                        let outputArray = _.concat(inputArray, res.transactions);
                        cursor += res.transactions.length; // it is zero based (it starts at zero)
                        console.log('Moved cursor to: ' + cursor);
                        if (cursor < res.total_transactions - 1) {
                            // console.log('Going around again.');
                            _innerPullTransactionsForItem(item_id, userId, accessToken, startDate, endDate, callback, cursor, outputArray);
                        }
                        else {
                            let response = {
                                transactions: outputArray,
                                item_id: res.item.item_id,
                                institution_id: res.item.institution_id
                            };
                            console.log('WE ARE DONE with recurisve!!!! Returning: ' + response.transactions.length + ' transactions');
                            cb(null, response);
                        }
                    }
                }
            });
        },
        (err, results) => {
            if (err) callback(err);
            else callback(null, results);
        }
    );
}

function scrubTransactionPII(transactions) {
    _.each(transactions, T => {
        if (!_.isNil(T.account_owner)) delete T.account_owner;
    });
}

function _createPublicToken(access_token, callback) {
    if (_.isUndefined(access_token)) callback(null, 'access_token is required.');
    else {
        let client = selectClient(access_token);
        client.createPublicToken(access_token, (err, res) => {
            if (err) {
                if (plaid.isPlaidError(err)) {
                    var e = Error(err.error_message);
                    e.name = err.error_code;
                    e.message = err.error_message;
                    err = e;
                }
                console.log('ERROR in _removeItem: ', err);
                callback(err);
            }
            else callback(null, res.public_token);
        });
    }
}

function _exchangeTokens(public_token, callback) {
    if (_.isUndefined(public_token)) callback(null, 'public_token is required.');
    else {
        let client = selectClient(public_token);
        client.exchangePublicToken(public_token, (err, res) => {
            if (err) {
                if (plaid.isPlaidError(err)) {
                    // turn it into a node error
                    var e = Error(err.error_message);
                    e.name = err.error_code;
                    e.message = err.error_message;
                    err = e;
                }
                console.log('ERROR in _removeItem: ', err);
            }
            callback(err, res);
        });
    }
}

function _getInstitution(institution_id, callback) {
    let client = selectClient();
    let options = { include_display_data: true };
    client.getInstitutionById(institution_id, options, (err, res) => {
        if (err) {
            if (plaid.isPlaidError(err)) {
                // turn it into a node error
                var e = Error(err.error_message);
                e.name = err.error_code;
                e.message = err.error_message;
                err = e;
            }
            console.log('ERROR in _removeItem: ', err);
            callback(err);
        }
        else callback(null, res.institution);
    });
}

function _getInstitutions(institution_ids, callback) {
    var institutions = [];
    _async.each(institution_ids,
        (institution_id, cb_each) => module.exports.getInstitution(institution_id,
            (err, res) => {
                if (err) cb_each(err);
                else {
                    institutions.push(res);
                    cb_each();
                }
            }),
        (err) => callback(err, institutions)
    );
}

function _getCategories(callback) {
    let client = selectClient();
    client.getCategories((err, res) => {
        if (err) {
            if (plaid.isPlaidError(err)) {
                // turn it into a node error
                var e = Error(err.error_message);
                e.name = err.error_code;
                e.message = err.error_message;
                err = e;
            }
            console.log('ERROR in _removeItem: ', err);
        }
        else {
            _.each(res.categories, cat => {
                console.log("," + cat.category_id + "," + cat.group + "," + _.join(cat.hierarchy));
            });
        }
        callback(err, res);
    });
}

function _getItem(access_token, callback) {
    if (_.isUndefined(access_token)) callback(null, 'access_token is required.');
    else {
        let client = selectClient(access_token);
        client.getItem(access_token, (err, res) => {
            if (err) {
                if (plaid.isPlaidError(err)) {
                    // turn it into a node error
                    var e = Error(err.error_message);
                    e.name = err.error_code;
                    e.message = err.error_message;
                    err = e;
                }
                console.log('ERROR in _removeItem: ', err);
            }
            callback(err, res);
        });
    }
}

function _removeItem(access_token, callback) {
    if (_.isUndefined(access_token)) callback(null, 'access_token is required.');
    else {
        let client = selectClient(access_token);
        client.removeItem(access_token, (err, res) => {
            if (err) {
                if (plaid.isPlaidError(err)) {
                    if (err.error_code == "INVALID_ACCESS_TOKEN") {
                        callback(null, 'Access token not recognized (perhaps already removed).');
                        return;
                    }
                    else {
                        // turn it into a node error
                        var e = Error(err.error_message);
                        e.name = err.error_code;
                        e.message = err.error_message;
                        err = e;
                    }
                }
                console.log('ERROR in _removeItem: ', err);
            }
            callback(err, res);
        });
    }
}

function _pullItemAccounts(access_token, item_id, userId, callback) {
    if (_.isUndefined(access_token)) callback(null, 'access_token is required.');
    else {
        let client = selectClient(access_token);
        client.getAccounts(access_token, (err, res) => {
            if (err) {
                console.log('ERROR in getAccounts: ', err);
                if (plaid.isPlaidError(err)) {
                    if (err.error_code == "ITEM_LOGIN_REQUIRED") {
                        handle_ITEM_LOGIN_REQUIRED(item_id, userId);
                        callback("ITEM_LOGIN_REQUIRED");
                    }
                    else {
                        // turn it into a node error
                        var e = Error(err.error_message);
                        e.name = err.error_code;
                        e.message = err.error_message;
                        err = e;
                        callback(err);
                    }
                }
                else callback(err);
            }
            else {
                _.each(res.accounts, A =>
                    _.each(A.balances,
                        (V, K, C) => { if (_.isNull(V)) delete C[K] } // Remove nulls from balances.
                    )
                );
                // console.log('Got accounts(s): ' + JSON.stringify(res.accounts, null, 2));
                callback(null, res.accounts);
            }
        });
    }
}

function handle_ITEM_LOGIN_REQUIRED(item_id, userId) {
    console.log("ITEM_LOGIN_REQUIRED for:\n  item_id: " + item_id + "\n   userId: " + userId);
    q_persist.setItemNeedsUpdateFlag(item_id);
    let msg = {
        msg: "ITEM_LOGIN_REQUIRED",
        userId: userId,
        item_id: item_id
    };
    q_log.rollbar.info("ITEM_LOGIN_REQUIRED\n" + JSON.stringify(msg));
    q_log.interesting(msg, 'handle_ITEM_LOGIN_REQUIRED');
    q_persist.institutionNameForId(item_id, (err, res) => {
        var bankName = "Your bank";
        if (err) console.log('Failed to get institution_name');
        else bankName = res;
        q_notifs.notifyUser(userId, 'Bank Connection 🔐', bankName + ' has requested that you refresh your connection to Quanta.');
    });
}

// CLIENT

function selectClient(access_token) {

    var env = 'production';

    if (!_.isUndefined(access_token)) {
        let s = _.split(access_token, '-');
        env = s[1];
    }

    switch (env) {
        case 'development':
            clientDev = initPlaid('development');
            return clientDev;
        case 'production':
            clientProd = initPlaid('production');
            return clientProd;
        case 'sandbox':
            clientSandbox = initPlaid('sandbox');
            return clientSandbox;
    }
}

// SETUP

function initPlaid(desiredEnvironment) {

    var env = plaidEnvironmentNameToPlaidNamespace(desiredEnvironment);

    var CLIENT_ID = process.env.PLAID_CLIENT_ID || '5ab119ad8d9239521f158d59';
    var PUBLIC_KEY = process.env.PLAID_PUBLIC_KEY || 'e44a4977074657eac38acd267e54d4';

    switch (desiredEnvironment) {

        case 'sandbox':
            {
                return new plaid.Client(
                    CLIENT_ID,
                    PUBLIC_KEY,
                    process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147',
                    env
                );
            }

        case 'development':
            {
                return new plaid.Client(
                    CLIENT_ID,
                    PUBLIC_KEY,
                    process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147',
                    env
                );
            }

        case 'production':
            {
                return new plaid.Client(
                    CLIENT_ID,
                    PUBLIC_KEY,
                    process.env.PLAID_SECRET || 'e618443b370da7a4b970c6f06af147',
                    env
                );
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
