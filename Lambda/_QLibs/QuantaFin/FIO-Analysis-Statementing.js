// FIO-Analysis-Statementing

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
// const moment = require('moment');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");

const adbLength = 30;

module.exports = {

    buildStatementDaysForAccount: (account, allTransactions) =>
        _buildStatementDaysForAccount(account, allTransactions)

};

function _buildStatementDaysForAccount(account, allTransactions) {
    let isDepository = (account.type == 'depository');
    let transactionsForAccount = _.filter(allTransactions, tx => tx.masterAccountId == account.masterAccountId);
    let allDays = [];
    let firstTransactionDateStr = _
        .chain(transactionsForAccount)
        .map('date')
        .sort()
        .first()
        .value();
    let firstTransactionM = _.isNil(firstTransactionDateStr) ? moment().subtract(24, 'months') : moment(firstTransactionDateStr);
    let cursorM = moment().subtract(1, 'day'); // yesterday
    let daysToStart = cursorM.diff(firstTransactionM, 'days') + 1; // add one to make it inclusive
    var cursorBalance = account.balances.current;
    var cursorDateStr = cursorM.format('YYYY-MM-DD');
    _.times(daysToStart, index => {
        let dateTransactions = _.filter(transactionsForAccount, tx => tx.date == cursorDateStr);
        let sumOfDayTransactions = _
            .chain(dateTransactions)
            .map('amount')
            .reduce((m, i) => m + i)
            .round(2)
            .value() || 0;
        let dayEndBalance = cursorBalance;
        if (isDepository) cursorBalance += sumOfDayTransactions;
        else cursorBalance -= sumOfDayTransactions;
        cursorBalance = _.round(cursorBalance, 2);
        let dayObj = {
            date: cursorDateStr,
            startingBalance: cursorBalance,
            endingBalance: dayEndBalance,
            masterAccountId: account.masterAccountId,
            accountSubtype: account.subtype
        };
        allDays.push(dayObj);
        cursorM.subtract(1, 'days');
        cursorDateStr = cursorM.format('YYYY-MM-DD');
    });
    // Now add rolling ADB
    _.eachRight(allDays, (day, index, array) => {
        let startIndex = index;
        let endIndex = startIndex + adbLength;
        // console.log(startIndex + ' - ' + endIndex);
        if (endIndex > array.length - 1) day.adb = 'not enough days';
        else {
            let prevDaySet = _.slice(array, startIndex, endIndex);
            day.adb = _
                .chain(prevDaySet)
                .map('endingBalance')
                .mean()
                .round(3)
                .value();
        }
        day.adbPeriod = adbLength;
    });
    if (account.type.toLowerCase() == 'credit') {
        // Add interest transactions
        let interestTransactions = _.filter(transactionsForAccount, tx => tx.category_id == "15002000");
        foldinInterestTransactions(allDays, interestTransactions);
        // Now add daily interest paid
        addDailyInterestPaid(allDays);
    }
    return allDays;
}

function addDailyInterestPaid(allDays) {
    let rollingDPR = -1;
    // go from oldest to newest
    _.eachRight(allDays, day => {
        if (!_.isUndefined(day.interestRates) && !_.isUndefined(day.interestRates.dailyPeriodicRate_DPR)) {
            rollingDPR = day.interestRates.dailyPeriodicRate_DPR / 100;
        }
        if (rollingDPR != -1) {
            day.interestPaid = _.round(rollingDPR * day.endingBalance, 2);
            day.dpr = rollingDPR;
        }
    });
    // now go from newest to oldest to assign dpr to the days PRIOR to first interest transaction.
    _.each(allDays, day => {
        if (day.dpr == -1) {
            if (rollingDPR != -1) {
                day.interestPaid = _.round(rollingDPR * day.endingBalance, 2);
                day.dpr = rollingDPR;
            }
        }
        else rollingDPR = day.dpr;
    });
}

function foldinInterestTransactions(allDays, interestTransactions) {
    interestTransactions = _.sortBy(interestTransactions, 'date');
    _.each(interestTransactions, interestTX => {
        let i = _.findIndex(allDays, day => day.date == interestTX.date);
        allDays[i].interestRates = interestRatesForDay(interestTX.amount, allDays[i].adb, allDays[i].adbPeriod);
        allDays[i].interestTransaction = interestTX;
    });
}

function interestRatesForDay(interestTransactionAmount, ADB, adbPeriod) {
    if (!_.isNumber(ADB)) return undefined;
    let spr = interestTransactionAmount / ADB;
    let dpr = spr / adbPeriod;
    let apr = dpr * 365;
    let out = {
        dailyPeriodicRate_DPR: _.round(dpr * 100, 2),
        monthPeriodicRate_MPR: _.round(spr * 100, 2),
        imputedAnnualPeriodicRate_APR: _.round(apr * 100, 2)
    };
    return out;
}
