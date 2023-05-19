// FIO-Analysis-DateNets

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const _async = require('async');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const qlib = require('../QuantaLib/FIO-QuantaLib');
const q_income = require('./FIO-Analysis-Income');

module.exports = {

    buildDateNets: (userIncome, transactions, callback) => _buildDateNets(userIncome, transactions, callback)

};

// DATE NETS

function _buildDateNets(userIncome, transactions, callback) {
    let startDate = (_.isNil(userIncome) || _.isEmpty(userIncome.streams)) ?
        "2016-01-01" : // hack
        userIncome.oldestDateEffective;
    // console.log(startDate);
    let startDaysAgo = qlib.date.daysAgoForDate(startDate);
    // console.log('oldestDateEffective_daysAgo: ' + oldestDateEffective_daysAgo + ' oldestDateEffective: ' + JSON.stringify(oldestDateEffective));

    // Ok, now iterate EVERY DATE since that day, inserting, minimally, the income into the dateNet, 
    // looking for spend on EVERY ONE of the days and including as appropriate.
    _async.times(startDaysAgo,
        (idx, cb) => {
            let dateCursor = moment().subtract(idx + 1, 'day').format('YYYY-MM-DD');
            let dateEarned = q_income.incomeForDate(dateCursor, userIncome);
            let transactionsForDate = dateNetTransactionsObjectForDate(dateCursor, userIncome, transactions);
            let dateSpent = 0;
            let depositsTotal = 0;
            var dateNet = { date: dateCursor };
            if (!_.isNil(transactionsForDate) && !_.isEmpty(transactionsForDate)) {
                dateNet.transactions = transactionsForDate;
                if (!_.isNil(transactionsForDate.debits) && !_.isNil(transactionsForDate.debits.totalAmount)) {
                    dateSpent = transactionsForDate.debits.totalAmount;
                }
                if (!_.isNil(transactionsForDate.deposits) && !_.isNil(transactionsForDate.deposits.totalAmount)) {
                    depositsTotal += transactionsForDate.deposits.totalAmount;
                }
            }
            dateNet.netAmount = qlib.obj.financial(dateEarned + depositsTotal + dateSpent); // note that dateSpent is a negative number here, thus we add it.
            dateNet.income = dateEarned;
            cb(null, dateNet);
        },
        (err, netDates) => {
            if (err) {
                console.log('ERROR in _computeDateNets async.times: ' + err);
                callback(err);
            }
            else {
                addFillerDaysForMissingDateNetDates(netDates);
                callback(null, netDates);
            }
        }
    );
}

function dateNetTransactionsObjectForDate(date, userIncome, allTransactions) {
    if (_.isUndefined(date)) return {};
    var out = {
        regularIncome: {
            totalAmount: 0,
            transactionIds: []
        },
        transfers: {
            totalAmount: 0,
            transactionIds: [],
            // transactionSummaries: []
        },
        creditCardPayments: {
            transactions: []
        },
        debits: {
            totalAmount: 0,
            transactionIds: [],
            transactions: []
        },
        deposits: {
            totalAmount: 0,
            transactionIds: []
        }
    };

    // PULL OUT TRANSACTIONS FOR THIS DATE FROM ALL TRANSACTIONS
    let dateTransactions = _.filter(allTransactions, tx => tx.date == date);

    // GO THROUGH THE DATE TRANSACTIONS AND PUT EACH WHERE THEY BELONG IN THE OUT OBJECT (.regularIncome, .transfers, .debits, or .deposits)
    _.each(dateTransactions, transaction => {
        // console.log('TRANSACTION: ' + JSON.stringify(transaction));

        // REGULAR INCOME (build 'transactions.regularIncome for dateNet object')
        if (qlib.tx.transactionIsRecognizedIncome(transaction, userIncome)) {
            out.regularIncome.transactionIds.push(transaction.transaction_id);
            out.regularIncome.totalAmount -= transaction.amount; // Using minus-equals because the values are negative and we want a positive value here.
        }

        // CREDIT CARD PAYMENTS
        else if (transaction.fioCategoryId == 101) {
            out.creditCardPayments.transactions.push(transaction);
        }

        // RECOGNIZED TRANSFERS & REFUNDS
        else if (qlib.tx.transactionIsRecognizedTransferOrRefund(transaction)) {
            out.transfers.transactionIds.push(transaction.transaction_id);
            out.transfers.totalAmount += Math.abs(transaction.amount);
        }

        // DEBITS
        else if (transaction.amount >= 0) {
            out.debits.transactionIds.push(transaction.transaction_id);
            out.debits.totalAmount += transaction.amount;

            // PERSIST MORE INFO FOR DEBITS
            out.debits.transactions.push({
                transaction_id: transaction.transaction_id,
                amount: transaction.amount,
                date: transaction.date,
                name: transaction.name,
                fioCategoryId: transaction.fioCategoryId,
                masterAccountId: transaction.masterAccountId,
            });
        }

        // DEPOSITS
        else {
            out.deposits.transactionIds.push(transaction.transaction_id);
            out.deposits.totalAmount += transaction.amount;
        }
    });

    // DEBITS CLEANUP
    var debitsTotal;
    if (_.isUndefined(out.debits)) {
        delete out.debits;
        debitsTotal = 0;
    }
    else {
        out.debits.totalAmount = qlib.obj.financial(-1 * out.debits.totalAmount);
        debitsTotal = out.debits.totalAmount;
    }

    // DEPOSITS CLEANUP
    var depositsTotal;
    if (_.isUndefined(out.deposits)) {
        delete out.deposits;
        depositsTotal = 0;
    }
    else {
        out.deposits.totalAmount = qlib.obj.financial(-1 * out.deposits.totalAmount);
        depositsTotal = out.deposits.totalAmount;
    }

    // SUM IT ALL UP
    out.totalAmount = qlib.obj.financial(depositsTotal + debitsTotal); // debits are negative, thus the add here.

    // console.log('final transactions object for date: ' + dateSpend.date + '\n' + JSON.stringify(out));
    return out;
}

// function summarizeTransferTx(tx) {
//     return {
//         transaction_id: tx.transaction_id,
//         fioCategoryId: tx.fioCategoryId,
//         amount: tx.amount
//     };
// }

function addFillerDaysForMissingDateNetDates(dateNets) {
    // console.log('addFillerDaysForMissingDateNetDates()');

    if (_.isEmpty(dateNets)) return;

    let oldestDateNet = _.last(dateNets);
    let startDateStr = oldestDateNet.date;

    let datesInSet = _.map(dateNets, 'date');

    var dateCursorM = moment(startDateStr);
    var dateCursorStr;
    var daysInRange = moment().diff(dateCursorM, 'days');

    _.times(daysInRange, function(idx) {

        dateCursorStr = dateCursorM.format('YYYY-MM-DD');
        // console.log(dateCursorStr);

        if (!_.includes(datesInSet, dateCursorStr)) {
            console.log('adding empty date for ' + dateCursorStr);
            dateNets.push(emptyDateNetDayForDate(dateCursorStr));
        }

        dateCursorM.add(1, 'days'); // mutates self
    });

    // Put any newly added dateNets into their right chron position
    dateNets = _.orderBy(dateNets, 'date', 'desc');

    return;
}

function emptyDateNetDayForDate(dayString) {

    return {
        date: dayString,
        income: 0,
        netAmount: 0,
        isFillerObject: true
    };
}

// DATE SPEND

function buildDateSpend(transactions) {
    transactions = _.orderBy(transactions, 'date', 'desc');
    var spendDates = [];
    let nonTransfers = _.filter(transactions, TX => !qlib.tx.transactionIsRecognizedTransferOrRefund(TX));
    _.each(nonTransfers, TX => {
        let sd = _.find(spendDates, SD => SD.date == TX.date);
        if (_.isUndefined(sd)) { // Create new SD record for this transaction
            spendDates.push({
                date: TX.date,
                totalAmount: TX.amount,
                transaction_ids: [TX.transaction_id]
            });
        }
        else if (!_.includes(sd.transaction_ids, TX.transaction_id)) { // Merge this transaction into the spend date only if the transaction_id is unique on the date
            sd.transaction_ids.push(TX.transaction_id);
            sd.totalAmount += TX.amount;
        }
    });
    console.log('Returning from computeDateSpend() with ' + spendDates.length + ' spendDates.');
    spendDates = _.orderBy(spendDates, 'date', 'desc');
    return spendDates;
}
