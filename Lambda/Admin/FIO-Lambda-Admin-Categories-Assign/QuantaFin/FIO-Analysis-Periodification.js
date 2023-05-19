// FIO-Analysis-Periodification

'use strict';
const qlib = require('../QuantaLib/FIO-QuantaLib');
const _ = require('lodash');
// const moment = require('moment');
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);
const q_income = require('./FIO-Analysis-Income');
const q_cats = require('./FIO-Transaction-Categorize');
// const q_datenet = require('./FIO-Analysis-DateNets');
const uuidv4 = require('uuid/v4');
const q_util = require("../QuantaLib/Util/FIO-Util-ObjectStuff");

module.exports = {

    buildFlowPeriodsForWindowSize: (windowSize, dateNets, statementDays, userIncomeForProjection, avgDailySpendForProjection) =>
        _buildFlowPeriodsForWindowSize(windowSize, dateNets, statementDays, userIncomeForProjection, avgDailySpendForProjection)

};

function _buildFlowPeriodsForWindowSize(windowSize, dateNets, statementDays, userIncomeForProjection, avgDailySpendForProjection) {
    setupMoment();
    let userFlow = batchDatesToWindowSize(windowSize, dateNets, statementDays); // BATCH IT UP!

    // ADD PROJECTION (IF NEEDED)
    if (windowSize == 7 || windowSize == 30) {
        let startDateM = moment(_.last(dateNets).date);

        // Guard to ensure that the start date is the beginning of a week/month when appropriate
        if (windowSize == 7) startDateM.startOf('week');
        else if (windowSize == 30) startDateM.startOf('month');

        // END DATE
        let endDateStr = _.first(userFlow).endDate;
        if (moment().isBetween(startDateM, endDateStr, 'day', '[]')) { // console.log('Projection is needed. Building and adding it now.');
            let currentPeriod = _.find(userFlow, p => moment().isBetween(p.startDate, p.endDate, 'day', '[]'));
            // console.log('currentPeriod:\n' + JSON.stringify(currentPeriod, null, 2));
            addProjectionToPeriod(currentPeriod, userIncomeForProjection, avgDailySpendForProjection);
        }
    }

    // // ADD CATEGORIES
    // Removed for now -- they're heavy and not used in the client at present (Mar '19')
    // _.each(userFlow, function(period) {
    //     addCategoriesToPeriod(period);
    // });

    return userFlow;
}

// PERIOD BUILD - BATCHING

function batchDatesToWindowSize(windowSize, dateNets, statementDays) {
    // This is where the magic happens 🧙🔮
    var out;
    if (windowSize == 1)
        out = _.map(dateNets, DN => conformDateObject(DN, statementDays));
    else if (windowSize == 7)
        out = batchForWeeks(dateNets, statementDays);
    else if (windowSize == 30)
        out = batchForMonths(dateNets, statementDays);
    else {
        console.error('Invalid windowSize.');
        return [];
    }
    tagFinalPeriod(out, _.last(dateNets).date);
    return out;
}

function conformDateObject(date, statementDays) {
    let out = {
        periodId: date.date,
        windowSize: 1,
        startDate: date.date,
        endDate: date.date,
        daysInRange: 1,
        daysRemainingInPeriod: 0,
        periodSummary: {
            netAmount: date.netAmount || 0,
            income: date.income || 0,
            transactions: date.transactions,
            balances: balancesForDate(date.date, statementDays)
        }
    };
    addSpendingSummary(out);
    return out;
}

function batchForWeeks(dateNets, statementDays) {

    let cursorM = moment().subtract(1, 'day');
    var allWeeks = [];
    var thisWeek = [];

    _.each(dateNets, dateNet => {
        // console.log(cursorM.format('YYYY-MM-DD'));
        // console.log(cursorM.weekday());
        thisWeek.push(dateNet);
        if (cursorM.weekday() == 0) { // This is monday, stash the weeks and start fresh
            allWeeks.push(thisWeek);
            thisWeek = [];
        }
        cursorM.subtract(1, 'day');
    });

    // Push any tailing days as there usually will be (~6/7 of the time) some previous days in thisWeek when the loop hits the end.
    allWeeks.push(thisWeek);
    return _.map(allWeeks, datesForWeek => batchDaysIntoTemplate(datesForWeek, 7, statementDays));
}

function batchForMonths(dateNets, statementDays) {
    var monthPeriods = [];
    let numberOfMonths = moment().diff(_.last(dateNets).date, 'months') + 1;
    let cursorM = moment();
    _.times(numberOfMonths, idx => {
        let dateNetsForMonth = _.filter(dateNets, dateNet => dateNet.date.startsWith(cursorM.format('YYYY-MM')));
        if (!_.isEmpty(dateNetsForMonth))
            monthPeriods.push(batchDaysIntoTemplate(dateNetsForMonth, 30, statementDays));
        else monthPeriods.push(firstDayOfPeriodObject('month')); // happens legitimately on the first of the month.
        cursorM.subtract(1, 'month');
    });
    return monthPeriods;
}

// dateObjectArray MUST be passed in aligned to week/month boundaries.
function batchDaysIntoTemplate(dateObjectArray, windowSize, accountDays) {
    // console.log('batchDaysIntoTemplate');

    var weekOrMonth;
    if (windowSize == 7) weekOrMonth = 'week';
    else if (windowSize == 30) weekOrMonth = 'month';
    else return 'Invalid windowSize';

    // Sanity check date alignment.
    var startDateStr = _.last(dateObjectArray).date;
    let startDateM = moment(startDateStr).startOf(weekOrMonth); // only changes val for the very first week/month
    startDateStr = startDateM.format('YYYY-MM-DD');
    let endDateM = moment(startDateM).endOf(weekOrMonth); // this is needed for the current week, if yesterday isn't the end of a week/month, this moves it over to align with one.
    let endDateStr = endDateM.format('YYYY-MM-DD');
    let daysRemainingInPeriod = endDateM.diff(moment(), 'days') + 1;
    let daysInRange = endDateM.diff(moment(startDateM), 'days') + 1;

    // Build balances
    var endDateForBalancesStr;
    if (daysRemainingInPeriod >= 0) endDateForBalancesStr = moment().subtract(1, 'day').format('YYYY-MM-DD'); // End date is in the future or is today, use yesterday for balances
    else endDateForBalancesStr = endDateStr;
    let bals = balancesForPeriod(startDateStr, endDateForBalancesStr, accountDays);

    // Calc periodId
    var periodId;
    if (weekOrMonth == 'week') periodId = startDateM.format('gggg-[W]ww'); // the brackets escape the W (for 'week'), https://momentjs.com/docs/#/displaying/format/
    else if (weekOrMonth == 'month') periodId = startDateM.format('YYYY-MM');

    let out = {
        periodId: periodId,
        windowSize: windowSize,
        startDate: startDateStr,
        endDate: endDateStr,
        daysInRange: daysInRange,
        daysRemainingInPeriod: daysRemainingInPeriod,
        periodSummary: {
            netAmount: qlib.obj.mapReduce(dateObjectArray, "netAmount"),
            income: qlib.obj.mapReduce(dateObjectArray, "income"),
            transactions: {
                totalAmount: qlib.obj.mapReduce(dateObjectArray, "transactions.totalAmount"),
                deposits: {
                    totalAmount: qlib.obj.mapReduce(dateObjectArray, "transactions.deposits.totalAmount") || 0,
                    transactionIds: qlib.obj.mapUnique(dateObjectArray, "transactions.deposits.transactionIds")
                },
                debits: {
                    totalAmount: qlib.obj.mapReduce(dateObjectArray, "transactions.debits.totalAmount") || 0,
                    transactionIds: qlib.obj.mapUnique(dateObjectArray, "transactions.debits.transactionIds"),
                    transactions: _.chain(dateObjectArray).map("transactions.debits.transactions").compact().flatten().value()
                },
                transfers: {
                    totalAmount: qlib.obj.mapReduce(dateObjectArray, "transactions.transfers.totalAmount") || 0,
                    transactionIds: qlib.obj.mapUnique(dateObjectArray, "transactions.transfers.transactionIds"),
                },
                regularIncome: {
                    totalAmount: qlib.obj.mapReduce(dateObjectArray, "transactions.regularIncome.totalAmount") || 0,
                    transactionIds: qlib.obj.mapUnique(dateObjectArray, "transactions.regularIncome.transactionIds")
                }
            },
            balances: bals
            // :)
            // 🐾🦁
        },
        dayNets: _.map(dateObjectArray, "netAmount")
    };
    addSpendingSummary(out);
    addCreditCardPayments(out, dateObjectArray);
    return out;
}

function addCreditCardPayments(batch, dateObjectArray) {

    let creditCardPayments = _
        .chain(dateObjectArray)
        .map('transactions.creditCardPayments.transactions')
        .flatten()
        .compact()
        .filter(tx => tx.fioCategoryId == 101)
        .each(tx => delete tx.used) // in case we're running this for a second time on the same transactions
        .groupBy(tx => Math.abs(tx.amount))
        .mapValues(transactionsForAbsAmount => {
            if (transactionsForAbsAmount.length < 3) return transactionsForAbsAmount;
            else {
                let out = {};
                var partitioned = _.partition(transactionsForAbsAmount, tx => tx.amount > 0);
                _.each(partitioned[0], tx => {
                    let matchingTx = _
                        .chain(partitioned[1])
                        .filter(p1Tx => !p1Tx.used)
                        .each(p1Tx => p1Tx.dateDiff = Math.abs(moment(tx.date).diff(p1Tx.date, 'days')))
                        .orderBy('dateDiff', 'asc')
                        .first()
                        .value();
                    if (matchingTx) {
                        out[uuidv4()] = [tx, matchingTx];
                        matchingTx.used = true;
                    }
                    else out[tx.date + '--' + uuidv4()] = [tx]; // nothing left in p1 to match against
                });

                // Now are there any stragglers left in partition1?
                let stragglers = _.filter(partitioned[1], tx => !tx.used);
                if (!_.isEmpty(stragglers)) {
                    _.each(stragglers, tx => out[tx.date + '--' + uuidv4()] = [tx]);
                }
                return out;
            }
        })
        .map(v => {
            if (_.isArray(v)) return v;
            else return _.map(v, v2 => v2);
        })
        .transform((result, value, key) => {
            if (_.isArray(value[0])) result.push(...value);
            else result.push(value);
        }, [])
        .value();

    var out = {
        payments: _.map(creditCardPayments, itm => transformCcPaymentArrayToObject(itm)),
    };

    out.totalAmount = _
        .chain(out.payments)
        .map('amount')
        .reduce((m, i) => m + i)
        .round(2)
        .value() || 0;
    out.sourceAccountNames = _.chain(out.payments).map(pmt => _.get(pmt, 'from.account.displayName', '')).uniq().filter(n => !_.isEmpty(n)).value();
    out.destinationAccountNames = _.chain(out.payments).map(pmt => _.get(pmt, 'to.account.displayName', '')).uniq().filter(n => !_.isEmpty(n)).value();

    if (out.totalAmount > 0) batch.periodSummary.transactions.creditCardPayments = out;
    else _.unset('batch.periodSummary.transactions.creditCardPayments');
}

function addDisplayNameToAccount(account) {
    if (account.name.toLowerCase() == "credit card" || _.isEmpty(account.name)) {
        if (!_.isNil(account.official_name) && !_.isEmpty(account.official_name))
            account.displayName = account.official_name;
    }
    else account.displayName = account.name;
    account.displayName = q_util.toTitleCase(account.displayName);
}

function transformCcPaymentArrayToObject(pmts) {

    let from = _.chain(pmts).filter(i => i.amount > 0).first().value();
    let to = _.chain(pmts).filter(i => i.amount < 0).first().value();

    if (from) {
        addDisplayNameToAccount(from.account);
    }

    if (to) {
        addDisplayNameToAccount(to.account);
    }

    let out = {
        amount: _.isNil(to) ? from.amount : Math.abs(to.amount),
        from: from,
        to: to
    };
    return out;
}

function addSpendingSummary(periodObject) {
    periodObject.periodSummary.spending = {
        actual: _.get(periodObject, 'periodSummary.transactions.debits.totalAmount', 0),
        target: -1,
        projected: 0 // added in addProjectionToPeriod_Inner()
    };
}

function firstDayOfPeriodObject(weekOrMonth) {
    console.log('firstDayOfPeriodObject()');

    var startDateM = moment().startOf(weekOrMonth);
    var endDateM = moment().endOf(weekOrMonth);
    var periodLength = endDateM.diff(startDateM, 'days') + 1;
    var periodId;
    if (weekOrMonth == 'week') periodId = startDateM.format('gggg-[W]ww'); // the brackets escape the W (for 'week'), https://momentjs.com/docs/#/displaying/format/
    else if (weekOrMonth == 'month') periodId = startDateM.format('YYYY-MM');

    let out = {
        periodId: periodId,
        startDate: startDateM.format('YYYY-MM-DD'),
        endDate: endDateM.format('YYYY-MM-DD'),
        daysInRange: periodLength,
        daysRemainingInPeriod: endDateM.diff(moment(), 'days') + 1,
        periodSummary: {
            netAmount: 0,
            income: 0
            // transactions: {} // absent is ok
        },
        dayNets: Array(periodLength).fill(-1),
        includesEndOfData: false
    };
    addSpendingSummary(out);
    return out;
}

function tagFinalPeriod(obj, endOfDataDateStr) {

    _.each(obj, function(w) { w.includesEndOfData = false; }); // makes some client ops faster;

    // find the item in obj array where start-end == final date
    // OR start - end contains end date (inclusive)
    // set endOfDataDate and includesEndOfData in that object

    var d = _.find(obj, function(p) {
        if (endOfDataDateStr == p.startDate) { return true; }
        return moment(endOfDataDateStr).isAfter(moment(p.startDate).subtract(1, 'day'), 'day');
    });

    if (!_.isUndefined(d)) {
        d.includesEndOfData = true;
        d.endOfDataDate = endOfDataDateStr;
    }

    // trim off any entire empty periods that END prior to the endOfDataDate
    obj = _.filter(obj, function(d) { return moment(endOfDataDateStr).isBefore(d.endDate); });
}

// PERIOD BUILD - BALANCES

function balancesForDate(dateStr, statementDays) {
    // Gather account days just for the target date
    var statementDaysForDate = _.filter(statementDays, statementDay => statementDay.date == dateStr);
    if (_.isEmpty(statementDaysForDate))
        return null;
    // console.log(JSON.stringify(statementDaysForDate, null, 2));
    // Now group the account days by account subtype
    let grouped = _.groupBy(statementDaysForDate, 'accountSubtype');
    // Now merge the arrays of account days within each group
    var merged = {};
    _.forOwn(grouped, (value, key, obj) => {
        merged[key] = {
            startingBalance: _
                .chain(value)
                .map('startingBalance')
                .reduce((m, i) => m + i)
                .round(2)
                .value(),
            endingBalance: _
                .chain(value)
                .map('endingBalance')
                .reduce((m, i) => m + i)
                .round(2)
                .value()
        };
    });
    // Now turn merged into a simple array instead of a map
    let out = _.transform(merged, (result, value, key) => {
        let obj = { accountSubtype: key };
        _.forOwn(value, (value, key) => obj[key] = value);
        result.push(obj);
    }, []);
    // console.log(JSON.stringify(out, null, 2));
    return out;
}

function balancesForPeriod(startDateStr, endDateStr, accountDays) {
    // console.log('balancesForPeriod() startDateStr: ' + startDateStr + ' endDateStr: ' + endDateStr);
    let startDayBalances = balancesForDate(startDateStr, accountDays);
    // console.log("startDayBalances:\n" + JSON.stringify(startDayBalances, null, 2));
    var endDayBalances = balancesForDate(endDateStr, accountDays);
    if (_.isNil(endDayBalances)) {
        endDateStr = moment(endDateStr).subtract(1, 'day').format('YYYY-MM-DD'); // try going back one further day
        endDayBalances = balancesForDate(endDateStr, accountDays);
    }
    if (_.isNil(endDayBalances))
        return []; // bail

    // console.log("startDayBalances:\n" + JSON.stringify(endDayBalances, null, 2));
    _.each(startDayBalances, (o, key) => {
        let e = _.find(endDayBalances, { 'accountSubtype': o.accountSubtype });
        if (!_.isNil(e))
            o.endingBalance = e.endingBalance;
    });
    // console.log(JSON.stringify(startDayBalances, null, 2));
    return startDayBalances;
}

// PERIOD BUILD - CATEGORIES

function addCategoriesToPeriod(period) {

    var cats = _.fill(Array(10), 0);
    var tids = new Array(10);
    tids = _.map(tids, function(itm) { return new Array(0) });

    let debitTransactionFragments = _.get(period, "periodSummary.transactions.debits.transactions", []);

    if (_.isEmpty(debitTransactionFragments)) return;

    _.each(debitTransactionFragments, function(txFragment) {

        let idx = q_cats.fioCatToIndex(txFragment.fioCategoryId);

        cats[idx] += txFragment.amount;
        tids[idx].push(txFragment.transaction_id);
    });

    period.periodSummary.categories = new q_cats.FIOSpendCategories(cats, tids);
}

// PERIOD BUILD - PROJECTION

function addProjectionToPeriod(period, userIncome, avgDailySpendForProjection) {
    let startM = moment(period.startDate);
    // console.log(startM.format('YYYY-MM-DD'));

    // INCOME
    // how much do they make each day of this period? Add them up.
    // note that the logic below *WILL* include future income from a recognized stream.
    let perDateIncomeForPeriod = [];

    // Add cut off dates to income
    _.each(userIncome.streams, S =>
        S.dateDistribution.cutoffDate = moment(S.dateDistribution.lastDate).add(userIncome.consts.daysToExtendStreams, 'days').format('YYYY-MM-DD')
    );

    // Pull income for each date
    _.times(period.daysInRange, idx => {
        perDateIncomeForPeriod.push(q_income.incomeForDate(startM.format('YYYY-MM-DD'), userIncome));
        startM.add(1, 'days'); // step forward a day
    });
    // console.log(JSON.stringify(perDateIncomeForPeriod));

    let totalRecognizedIncomeForPeriod = _.reduce(perDateIncomeForPeriod, (m, i) => m + i);
    // console.log(totalRecognizedIncomeForPeriod);

    let realizedSpend = 0;
    if (!_.isUndefined(period.periodSummary) && !_.isUndefined(period.periodSummary.transactions) && !_.isUndefined(period.periodSummary.transactions.debits) && !_.isUndefined(period.periodSummary.transactions.debits.totalAmount)) {
        realizedSpend += period.periodSummary.transactions.debits.totalAmount;
    }
    realizedSpend = qlib.obj.financial(realizedSpend);
    // console.log('realizedSpend = ' + realizedSpend);

    let remainingSpend = qlib.obj.financial(-1 * (period.daysRemainingInPeriod * avgDailySpendForProjection));
    // console.log('leftToSpend = ' + remainingSpend);

    let projectedPeriodSpend = qlib.obj.financial(remainingSpend + realizedSpend); // realizedSpend is negative

    if (_.isUndefined(period.periodSummary.spending)) addSpendingSummary(period);
    period.periodSummary.spending.projected = projectedPeriodSpend;

    // NET
    let projectedPeriodNet = qlib.obj.financial(totalRecognizedIncomeForPeriod + projectedPeriodSpend);

    // // SUMMARIZE
    // console.log("");
    // console.log("=====  PROJECTION  =====");
    // console.log("");
    // console.log('  remainingDays in period = ' + period.daysRemainingInPeriod);
    // console.log('  estimated dailySpend = ' + dailySpend);
    // console.log("");
    // console.log('  realizedSpend = ' + realizedSpend);
    // console.log('  remainingSpend = ' + remainingSpend);
    // console.log("");
    // console.log('  totalRecognizedIncomeForPeriod = ' + totalRecognizedIncomeForPeriod);
    // console.log('  projectedSpendTotal = ' + projectedPeriodSpend);
    // console.log('  projectedPeriodNet = ' + projectedPeriodNet);
    // console.log("");
    // console.log("=====");
    // console.log("");

    period.projection = {
        incomeTotal: totalRecognizedIncomeForPeriod,
        spendTotal: projectedPeriodSpend,
        net: projectedPeriodNet
    };
}

function setupMoment() {
    moment.tz.setDefault("America/New_York"); // set timezone to eastern
    moment.updateLocale('en', { week: { dow: 1 } }); // Set first day of week to monday
}
