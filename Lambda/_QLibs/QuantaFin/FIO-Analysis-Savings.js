// FIO-Analysis-Savings

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const q_obj = require("../QuantaLib/Util/FIO-Util-ObjectStuff.js");
const q_income = require("./FIO-Analysis-Income.js");

const DAYS_IN_YEAR = 365.2422;
const AVG_DAYS_PER_MONTH = DAYS_IN_YEAR / 12;
const monthsToAnalyzeForDetailObjects = 12;
const targetCushionMonths = 4;
const daysToAnalyzeForDetailObjects = _.round(AVG_DAYS_PER_MONTH * monthsToAnalyzeForDetailObjects, 0);
const safeWithdrawalRatePercentage = 0.04;

module.exports = {

    buildFinancialIndependenceObject: (accounts, spending, flowMonths, transactions, income, flowDays) =>
        _buildFinancialIndependenceObject(accounts, spending, flowMonths, transactions, income, flowDays),

};

function _buildFinancialIndependenceObject(accounts, spending, flowMonths, transactions, income, flowDays) {
    let allLongTermAccounts = filterAccountsToType(accounts, "allLongTerm");
    let liquidCushion = buildLiquidSavingsObject(accounts, flowMonths, spending);
    let totalCapital = q_obj.mapReduceFinancial(allLongTermAccounts, 'balances.current');
    let out = {
        totalCapital: totalCapital,
        safeWithdrawal: _.round(totalCapital * safeWithdrawalRatePercentage, 2),
        liquidCushion: liquidCushion,
        savingsRate: buildSavingsRateSummary(transactions, income, flowDays)
    };

    return out;
}

function buildSavingsRateSummary(transactions, income, flowDays) {
    if (_.isNil(transactions) || _.isEmpty(transactions)) return;
    if (_.isNil(income) || _.isEmpty(income)) return;

    let ninetyDaysAgoM = moment().subtract(91, 'days');
    let ninetyDaysAgoStr = ninetyDaysAgoM.format('YYYY-MM-DD');
    let oneYearAgoM = moment().subtract(366, 'days');
    let oneYearAgoStr = oneYearAgoM.format('YYYY-MM-DD');
    let yesterdayStr = moment().subtract(1, 'day').format('YYYY-MM-DD');

    let out = {
        depositsSum_90d: 0,
        depositsSum_365d: 0,
        withdrawalsSum_90d: 0,
        withdrawalsSum_365d: 0,
        netLongtermMoney_90d: 0,
        netLongtermMoney_365d: 0,
        income_90d: q_income.incomeForDateRange(ninetyDaysAgoStr, yesterdayStr, income),
        income_365d: q_income.incomeForDateRange(oneYearAgoStr, yesterdayStr, income),
        net_365d: _
            .chain(flowDays).take(365)
            .map('periodSummary.netAmount')
            .reduce((m, i) => m + i)
            .round(2).value(),
        net_90d: _
            .chain(flowDays).take(91)
            .map('periodSummary.netAmount')
            .reduce((m, i) => m + i)
            .round(2).value(),
        dateStr_90d: ninetyDaysAgoStr,
        dateStr_365d: oneYearAgoStr,
        actualSavingsRate_90d: 0,
        actualSavingsRate_365d: 0,
        potentialSavingsRate_90d: 0,
        potentialSavingsRate_365d: 0,
        withdrawalTids: [],
        depositTids: []
    };

    // ACTUAL
    // 365 DAYS

    let longTermMoneyDeposits = _
        .chain(transactions)
        .filter(tx => {
            if (!accountIsLongTerm(tx.account)) return false;
            if (tx.amount > 0) return false;
            if (moment(tx.date).isBefore(oneYearAgoM)) return false; // we're not using transactions older than one year
            return true;
        })
        .value();

    let longTermMoneyWithdrawals = _
        .chain(transactions)
        .filter(tx => {
            if (!accountIsLongTerm(tx.account)) return false;
            if (tx.amount < 0) return false;
            if (moment(tx.date).isBefore(oneYearAgoM)) return false; // we're not using transactions older than one year
            return true;
        })
        .value();

    out.depositTids = _.map(longTermMoneyDeposits, 'transaction_id');
    out.withdrawalTids = _.map(longTermMoneyWithdrawals, 'transaction_id');
    out.depositsSum_365d = q_obj.mapReduceFinancial(longTermMoneyDeposits, 'amount');
    out.withdrawalsSum_365d = q_obj.mapReduceFinancial(longTermMoneyWithdrawals, 'amount');
    out.netLongtermMoney_365d = out.depositsSum_365d - out.withdrawalsSum_365d;

    if (out.income_365d > 0) {
        out.actualSavingsRate_365d = _.round(out.netLongtermMoney_365d / out.income_365d, 2);
    }

    // 90 DAYS
    longTermMoneyDeposits = _.filter(longTermMoneyDeposits, tx => moment(tx.date).isAfter(ninetyDaysAgoM));
    longTermMoneyWithdrawals = _.filter(longTermMoneyWithdrawals, tx => moment(tx.date).isAfter(ninetyDaysAgoM));

    out.depositsSum_90d = q_obj.mapReduceFinancial(longTermMoneyDeposits, 'amount');
    out.withdrawalsSum_90d = q_obj.mapReduceFinancial(longTermMoneyWithdrawals, 'amount');
    out.netLongtermMoney_90d = out.depositsSum_90d - out.withdrawalsSum_90d;

    if (out.income_90d > 0) {
        out.actualSavingsRate_90d = _.round(out.netLongtermMoney_90d / out.income_90d, 2);
    }

    // POTENTIAL
    // "potential" reflects the amount you came out ahead for the month but not whether you actually put the surplus into savings/investments.
    if (out.income_90d > 0) {
        out.potentialSavingsRate_90d = _.round(Math.max(out.net_90d, 0) / out.income_90d, 2);
    }

    if (out.income_365d > 0) {
        out.potentialSavingsRate_365d = _.round(Math.max(out.net_365d, 0) / out.income_365d, 2);
    }

    return out;
}

function buildLiquidSavingsObject(accounts, flowMonths, spending) {
    let liquidSavingsAccounts = filterAccountsToType(accounts, "liquidSavings");
    if (_.isEmpty(liquidSavingsAccounts)) return; // User has no savings accounts

    let totalBalance = q_obj.mapReduceFinancial(liquidSavingsAccounts, 'balances.current');
    let spendDenominator = _.get(spending, 'basicLivingExpenses.estimatedMonthlyAmount', 0);
    let survivabilityMonths = spendDenominator == 0 ? 0 : _.round(totalBalance / spendDenominator, 2);
    let percentageOfTargetMonths = _.round((survivabilityMonths / targetCushionMonths) * 100, 2);

    let out = {
        current: {
            balance: totalBalance,
            months: survivabilityMonths,
            monthsAsPercentage: percentageOfTargetMonths
        },
        historical: {
            months: [], // set below
            dates: [], // set below
            averageBalance: 0, // set below
            daysAnalyzed: daysToAnalyzeForDetailObjects
        },
        accountMaids: _.map(liquidSavingsAccounts, 'masterAccountId'),
        consts: {
            targetSafetyMonths: targetCushionMonths
        }
    };

    var cursorM = moment().subtract(1, 'day');
    _.times(daysToAnalyzeForDetailObjects,
        idx => {
            let v = {
                date: cursorM.format('YYYY-MM-DD'),
                balance: 0
            };
            _.each(liquidSavingsAccounts, A => {
                let dayObj = _.find(A.statementDays, O => O.date == v.date);
                v.balance += _.get(dayObj, 'endingBalance', 0);
            });
            out.historical.dates.push(v);
            cursorM.subtract(1, 'day');
        }
    );

    // Now go by months to build the data model for the "over time" graphs in the savings detail view
    _.each(flowMonths, flowMonth => {
        let monthStr = moment(flowMonth.startDate).format('YYYY-MM');
        let balances = _.get(flowMonth, 'periodSummary.balances');
        var monthSavingsBalanceDelta = 0;
        var bufferAtStartOfMonth = 0;

        // Calculate realized savings rate if there are balances
        if (!_.isUndefined(balances)) {
            let overallEndingBalance = _
                .chain(balances)
                .filter(I => accountIsLiquidSavings(I))
                .map('endingBalance')
                .reduce((m, i) => m + i)
                .round(2)
                .value() || 0;
            // console.log('overallEndingBalance = ' + overallEndingBalance);
            let overallStartingBalance = _
                .chain(balances)
                .filter(I => accountIsLiquidSavings(I))
                .map('startingBalance')
                .reduce((m, i) => m + i)
                .round(2)
                .value() || 0;
            // console.log('overallStartingBalance = ' + overallStartingBalance);
            monthSavingsBalanceDelta = _.round(overallEndingBalance - overallStartingBalance, 2);
            if (_.isNaN(monthSavingsBalanceDelta)) // guarding against the unknown here.
                monthSavingsBalanceDelta = 0;
            let avgSpendThreePriorMonths = monthlySpendAvgForPriorMonths(spending.months, 3, monthStr) || 0;
            if (avgSpendThreePriorMonths > 0)
                bufferAtStartOfMonth = _.round(overallStartingBalance / avgSpendThreePriorMonths, 1);
        }

        out.historical.months.push({
            month: monthStr,
            bufferAtStartOfMonth: bufferAtStartOfMonth
        });
    });

    out.historical.averageBalance = _.chain(out.historical.dates).map('balance').mean().round(2).value();

    return out;
}

// ACCOUNT TYPE FILTERING
// https://plaid.com/docs/#account-types

function filterAccountsToType(accounts, type) {
    return _.filter(accounts, acct => {
        if (_.isUndefined(acct)) return false;
        if (_.isObject(acct) && _.isEmpty(acct)) return false;
        if (acct.hidden) return false;
        switch (type) {
            case "liquidSavings":
                return accountIsLiquidSavings(acct);
            case "allLongTerm":
                return accountIsLongTerm(acct);
        }
    });
}

function accountIsLiquidSavings(obj) {
    var subtypeLower = "";
    if (!_.isNil(obj.subtype))
        subtypeLower = obj.subtype.toLowerCase();
    else if (!_.isNil(obj.accountSubtype))
        subtypeLower = obj.accountSubtype.toLowerCase();
    else return false;

    switch (subtypeLower) {
        case 'savings':
        case 'money market':
        case 'checking':
        case 'brokerage':
            return true;

        default:
            return false;
    }
}

function accountIsLongTerm(obj) {
    var typeLower = "";
    if (!_.isNil(obj.type)) typeLower = obj.type.toLowerCase();
    else if (!_.isNil(obj.type)) typeLower = obj.accountType.toLowerCase();
    else return false;

    if (typeLower == "brokerage") return true;
    else if (typeLower == "depository") {
        var subtypeLower = "";
        if (!_.isNil(obj.subtype)) subtypeLower = obj.subtype.toLowerCase();
        else if (!_.isNil(obj.accountSubtype)) subtypeLower = obj.accountSubtype.toLowerCase();
        else return false;
        if (subtypeLower === "savings") return true;
        if (subtypeLower === "money market") return true;
        if (subtypeLower === "cd") return true;
    }

    return false;
}

function monthlySpendAvgForPriorMonths(monthObjects, monthCount, fromMonthStr) {
    var out = 0;
    let sortedMonths = _
        .chain(monthObjects)
        .orderBy('month', 'desc')
        .tail() // don't include the current partial month.
        .dropRight(1) // don't include the oldest month which is also partial.
        .value();
    _.each(sortedMonths, (M, idx) => {
        if (M.month == fromMonthStr) {
            out = _
                .chain(monthObjects)
                .slice(idx, idx + monthCount)
                .map('amount')
                .mean()
                .round(2)
                .value();
            return false; // Break loop
        }
    });
    // console.log('monthlySpendAvgForPriorMonths = ' + out);
    return out;
}
