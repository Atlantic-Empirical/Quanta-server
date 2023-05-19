// FIO-Analysis-UserHome

'use strict';
const _ = require('lodash');
const qlib = require('../QuantaLib/FIO-QuantaLib');
const q_creditCards = require('./FIO-Analysis-CreditUtilization');
const q_savings = require("./FIO-Analysis-Savings");

const DAYS_IN_YEAR = 365.2422;
const AVG_DAYS_PER_MONTH = DAYS_IN_YEAR / 12;

module.exports = {

    buildUserHome: (userId, items, accounts, transactions, income, spending, statementDays, flowMonths, flowDays) =>
        _buildUserHome(userId, items, accounts, transactions, income, spending, statementDays, flowMonths, flowDays),

    buildItemLoginRequiredUserHome: (userId, accounts, items) =>
        _buildItemLoginRequiredUserHome(userId, accounts, items)

};

function _buildUserHome(userId, items, accounts, transactions, income, spending, statementDays, flowMonths, flowDays) {

    let clonedAccounts = _.cloneDeep(accounts);
    let clonedIncome = _.cloneDeep(income);
    let clonedSpending = _.cloneDeep(spending);
    let clonedItems = _.cloneDeep(items);

    _.each(clonedAccounts, account => { // Merge statement days into accounts
        if (!account.hidden)
            account.statementDays = _.filter(statementDays, SD => SD.masterAccountId == account.masterAccountId);
    });

    _.each(clonedItems, I => {
        if (_.isNil(I.createdDate)) I.createdDate = "2019-01-01";
    });

    let quantaObject = {
        userId: userId,
        items: clonedItems,
        accounts: clonedAccounts,
        transactionOverview: buildTransactionOverview(transactions),
        spending: clonedSpending,
        moneyRental: {
            creditCards: q_creditCards.buildCreditCardObject(clonedAccounts, clonedIncome.summary.activeDailyEstimate)
        },
        income: cleanIncome(clonedIncome),
        financialIndependence: q_savings.buildFinancialIndependenceObject(clonedAccounts, clonedSpending, flowMonths, transactions, income, flowDays),
        flowScore: new FlowScore(userId),
        builtAtTicks: (new Date()).getTime()
    };

    // Now remove the statement dates as they're not needed by the client, and make the object too big to store and also they're stored already in FIO-Table-Account-Days
    _.each(quantaObject.accounts, A => delete A.statementDays);
    _.each(clonedAccounts, A => delete A.statementDays);
    _.each(quantaObject.items, I => delete I.accounts); // Remove accounts from items, they already are in their own property at root of the object. Save space.

    return quantaObject;
}

function cleanIncome(income) {
    if (!_.isNil(income) && !_.isNil(income.transactionsWithUpdatedFioCatId))
        _.unset(income, 'transactionsWithUpdatedFioCatId');
    return income;
}

function _buildItemLoginRequiredUserHome(userId, items) {
    let out = {
        userId: userId,
        items: items,
        builtAtTicks: (new Date()).getTime()
    };
    return out;
}

function buildTransactionOverview(transactions) {
    let clonedTransactions = _.cloneDeep(transactions);
    let filteredTransactions = _
        .chain(clonedTransactions)
        .filter(tx => tx.account.subtype == 'checking' && !qlib.tx.transactionIsRecognizedTransferOrRefund(tx))
        .map('amount')
        .partition(n => n > 0)
        .map(valueArray => _.reduce(valueArray, (m, i) => m + i))
        .map(v => _.round(v * -1, 2))
        .value();
    // console.log('buildOverview tx count = ' + filteredTransactions.length);

    return {
        transactionCount: clonedTransactions.length,
        oldestTransactionDate: _.chain(clonedTransactions).orderBy('date', 'asc').first().value().date || '',
        totalIn: filteredTransactions[1],
        totalOut: filteredTransactions[0]
    };
}

class FlowScore {
    constructor() {
        this.responsibility = "B";
        this.magnitude = 65;
    }
}
