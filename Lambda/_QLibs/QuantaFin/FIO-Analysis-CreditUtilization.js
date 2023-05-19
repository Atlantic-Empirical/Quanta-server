// FIO-Analysis-CreditUtilization

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
// const moment = require('moment');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");

const DAYS_IN_YEAR = 365.2422;
const AVG_DAYS_PER_MONTH = DAYS_IN_YEAR / 12;
const monthsToAnalyzeForDetailObjects = 12;
const daysToAnalyzeForDetailObjects = _.round(AVG_DAYS_PER_MONTH * monthsToAnalyzeForDetailObjects, 0);

module.exports = {

    buildCreditCardObject: (accounts, activeIncomeDailyEstimate) =>
        _buildCreditCardObject(accounts, activeIncomeDailyEstimate),

};

function _buildCreditCardObject(accounts, activeIncomeDailyEstimate) {
    let ccAccounts = _.filter(accounts, A => A.subtype == 'credit card' && !A.hidden); // Filter to non-hidden cc accountns
    if (_.isEmpty(ccAccounts)) return; // User has no credit card accounts

    var out = {
        accountMaids: _.map(ccAccounts, 'masterAccountId'),
        costOfOneDollar: 0, // set below
        rent: rentSummaryAnalysis(ccAccounts, activeIncomeDailyEstimate),
        daysAnalyzed: 0,
        balance: {
            current: {
                total: _
                    .chain(ccAccounts)
                    .map('balances.current')
                    .filter(v => !_.isNil(v))
                    .reduce((m, i) => m + i)
                    .round(2)
                    .value(),
                totalSubjectToLimit: _
                    .chain(ccAccounts)
                    .filter(A => !_.isNull(A.balances.limit))
                    .map('balances.current')
                    .filter(v => !_.isNil(v))
                    .reduce((m, i) => m + i)
                    .round(2)
                    .value(),
                totalLimit: 0, // set below
                utilizationPercentage: 0, // set below
                totalEffectiveBalance: 0 // set below
            },
            historical: {} // set below
        }
    };

    // Calculate artifical card limits if not provided by plaid
    _.each(ccAccounts, A => {
        if (_.isUndefined(A.balances.limit) &&
            (!_.isUndefined(A.balances.available)) && !_.isUndefined(A.balances.current))
            A.balances.limit = A.balances.current + A.balances.available;
    });

    out.balance.current.totalLimit = _
        .chain(ccAccounts)
        .filter(A => !_.isNull(A.balances.limit) && !_.isUndefined(A.balances.limit))
        .map('balances.limit')
        .filter(v => !_.isNil(v))
        .reduce((m, i) => m + i)
        .round(2)
        .value();
    // console.log('totalLimit = ' + out.totalLimit);

    if (out.totalSubjectToLimit == 0 || out.totalLimit == 0)
        out.balance.current.utilizationPercentage = 0;
    else
        out.balance.current.utilizationPercentage = _.round(out.balance.current.totalSubjectToLimit / out.balance.current.totalLimit, 3);

    // N DAYS OF ENDING BALANCES & UTILIZATION
    var historicalSummary = {
        daysAnalyzed: daysToAnalyzeForDetailObjects,
        dates: []
    };

    var dayBalances = new Array(daysToAnalyzeForDetailObjects);
    _.fill(dayBalances, 0, 0, daysToAnalyzeForDetailObjects + 1);

    var daySubjectToLimit = new Array(daysToAnalyzeForDetailObjects);
    _.fill(daySubjectToLimit, 0, 0, daysToAnalyzeForDetailObjects + 1);

    var dayUtilization = new Array(daysToAnalyzeForDetailObjects);
    _.fill(dayUtilization, 0, 0, daysToAnalyzeForDetailObjects + 1);

    var dayBal;

    let totalLimit = _
        .chain(ccAccounts)
        .filter(A => !_.isNull(A.balances.limit))
        .map('balances.limit')
        .filter(v => !_.isNil(v))
        .reduce((m, i) => m + i)
        .round(2)
        .value();

    // Build Historical Balances
    _.times(daysToAnalyzeForDetailObjects, idx => {
        _.each(ccAccounts, acct => {
            dayBal = _.get(acct.statementDays[idx], 'endingBalance', 0);
            dayBalances[idx] += dayBal;
            if (!_.isNull(acct.balances.limit)) {
                daySubjectToLimit[idx] += dayBal;
            }
        });

        dayBalances[idx] = _.round(dayBalances[idx], 2);
        dayUtilization[idx] = _.round(daySubjectToLimit[idx] / totalLimit, 2);

        historicalSummary.dates.push({
            date: moment().subtract(idx + 1, 'days').format('YYYY-MM-DD'),
            balance: dayBalances[idx],
            utilization: dayUtilization[idx]
        });
    });
    // console.log("dayBalances\n" + JSON.stringify(dayBalances, null, 2));
    // console.log("daySubjectToLimit\n" + JSON.stringify(daySubjectToLimit, null, 2));
    // console.log("dayUtilization\n" + JSON.stringify(dayUtilization, null, 2));
    // console.log('historicalSummary\n' + JSON.stringify(historicalSummary, null, 2));

    // 90 DAY AVERAGE BALANCE
    let totalOfDayBalances = _.reduce(dayBalances, (m, i) => m + i);
    historicalSummary.avgBalance = _.round(totalOfDayBalances / daysToAnalyzeForDetailObjects, 2);
    // console.log('ninetyDayAvgBalance = ' + ninetyDayAvgBalance);

    // M/M CARRY OVER
    let lastDayOfMonthM = moment(); // set to last day of last month
    var carryOvers = [];

    _.times(6, idx => {
        lastDayOfMonthM.subtract(1, 'month').endOf('month');
        let endOfMonthDateStr = lastDayOfMonthM.format('YYYY-MM-DD');
        // console.log(endOfMonthDateStr);
        let eom = _.filter(historicalSummary.dates, D => D.date == endOfMonthDateStr);
        carryOvers.push(eom[0].balance);
    });
    // console.log('carryOvers\n' + JSON.stringify(carryOvers, null, 2));
    historicalSummary.avgMMCarryOver = _.round(_.mean(carryOvers), 2);
    historicalSummary.MMCarryOvers = carryOvers;
    // console.log('historicalSummary\n' + JSON.stringify(historicalSummary, null, 2));

    // COST OF MONEY    
    out.balance.current.totalEffectiveBalance = _.round(out.balance.current.total +
        (out.balance.current.total * (out.rent.dailyPeriodicRate * daysToAnalyzeForDetailObjects)), 2);
    out.costOfOneDollar = _.round(1 + (out.rent.dailyPeriodicRate * daysToAnalyzeForDetailObjects), 2);
    out.balance.historical = historicalSummary;

    return out;
}

function rentSummaryAnalysis(accounts, avgRecentDailyNet) {
    // console.log('rentSummaryAnalysis()');

    // GATHER ALL DAYS FOR ALL ACCOUNTS
    let statementDaysForAllAccounts = _
        .chain(accounts)
        .map('statementDays')
        .union()
        .flatten()
        .value();
    // console.log(JSON.stringify(statementDaysForAllAccounts, null, 2));
    // console.log(statementDaysForAllAccounts.length);

    // LIMIT TO LAST 'daysToAnalyze' & FILTER OUT ANY DAYS WITH NON NUMERIC ADB
    statementDaysForAllAccounts = _
        .chain(statementDaysForAllAccounts)
        .filter(D => {
            let diffDays = moment().diff(moment(D.date), 'days');
            return diffDays < daysToAnalyzeForDetailObjects && _.isNumber(D.adb);
        })
        .value();
    // console.log(JSON.stringify(statementDaysForAllAccounts, null, 2));
    // console.log('length: ' + statementDaysForAllAccounts.length);

    // COLLECT AMOUNTS 
    let interestPaidAcrossAllStatementsAndDates = _
        .chain(statementDaysForAllAccounts)
        .map('interestTransaction.amount')
        .map(I => _.isUndefined(I) ? 0 : I) // Zero if no interest transaction is present.
        // .compact() // do not do this, it breaks the avg per day calc which needs the full count as denominator 
        .flatten()
        .value();
    // console.log(JSON.stringify(interestPaidAcrossAllStatementsAndDates, null, 2));

    let sumOfInterest = _.round(_.sum(interestPaidAcrossAllStatementsAndDates), 2);
    // console.log('sumOfInterest = ' + sumOfInterest);

    let avgInterestPaidPerDay = _.round(sumOfInterest / daysToAnalyzeForDetailObjects, 2);
    // console.log('avgInterestPaidPerDay = ' + avgInterestPaidPerDay);

    // ADD WEIGHTED DPR TO EACH DAY
    _.each(statementDaysForAllAccounts, function(day) {
        if (!_.isUndefined(day.dpr)) {
            day.dpr_weighted = day.dpr * day.adb;
        }
    });
    // console.log(JSON.stringify(adbPrs, null, 2));

    let meanAdb = _.chain(statementDaysForAllAccounts).map('adb').mean().value() || 0;
    // console.log('meanAdb = ' + meanAdb);

    let meanDpr_weighted = _.chain(statementDaysForAllAccounts).map('dpr_weighted').mean().value() || 0;
    // console.log('meanDpr_weighted = ' + meanDpr_weighted);

    let meanDpr = (meanAdb == 0) ? 0 : _.round(meanDpr_weighted / meanAdb, 10);
    // console.log('meanDpr = ' + meanDpr);

    // PUT IT ALL TOGETHER
    let out = {
        daysAnalyzed: daysToAnalyzeForDetailObjects,
        averagePerDay: avgInterestPaidPerDay,
        totalInAnalysisPeriod: sumOfInterest,
        percentOfDailyNet: _.round((avgInterestPaidPerDay / avgRecentDailyNet) * 100, 3) || 0,
        dailyPeriodicRate: meanDpr
    };

    // console.log(JSON.stringify(out, null, 2));
    return out;
}
