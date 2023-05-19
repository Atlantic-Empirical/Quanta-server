// FIO-Analysis-Streamification

'use strict';
const qlib = require('../QuantaLib/FIO-QuantaLib');
const _ = require('lodash');
const _async = require('async');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const uuidv4 = require('uuid/v4');

const DAYS_IN_YEAR = 365.2422;
const DAYS_IN_MONTH = DAYS_IN_YEAR / 12;
const DAYS_IN_QUARTER = DAYS_IN_YEAR / 4;
const DAYS_IN_WEEK = 7; // Yeah, obviously but this makes clear what's happening instead of just using the number 7 everywhere.

const logLevel = ''; // Values: verbose, timers, or empty ('')

const consts = {
    slugLength: 8,
    minTransactionsForStandardStream: 3,
    minTransactionsForWobbilyStream: 4,
    clipTwoRatio: 5,
    clipStandardDeviations: 3,
    toleranceDaysForWeeklyPeriodicity: (1 / 7) * DAYS_IN_WEEK,
    toleranceDaysForBiweeklyPeriodicity: 3,
    toleranceDaysForMonthlyPeriodicity: (1 / 7) * DAYS_IN_MONTH,
    toleranceDaysForQuartlyPeriodicity: (1 / 7) * DAYS_IN_QUARTER,
    toleranceDaysForAnnualPeriodicity: (1 / 7) * DAYS_IN_YEAR,
    streakMinWeekly: 6,
    streakMinBiweekly: 3,
    streakMinMonthly: 3,
    streakMinQuarterly: 3,
    streakMinAnnual: 2,
    rsdCutoffDates: 35,
    rsdCutoffAmounts: 20,
    rsdCutoffWobbilyDateStream: 80,
    streakLastDaysAgoCutoffWeekly: 10,
    streakLastDaysAgoCutoffBiweekly: 25,
    streakLastDaysAgoCutoffMonthly: 40,
    streakLastDaysAgoCutoffQuarterly: 101,
    streakLastDaysAgoCutoffAnnual: 380,
    amountGroupingPercentTolerance: 0.2,
    income_depositSizeCutoff: 101,
    streakLengthToTransactionCountCutoffRatio: 0.5,
};

module.exports = {

    streamify: (transactions, typeOfAnalysis, callback) => _streamify(transactions, typeOfAnalysis, callback),
    vendorAnalysis: transactions => _vendorAnalysis(transactions)

};

function _vendorAnalysis(transactions) {

    let transactionsToAnalyze = _
        .chain(transactions)
        .orderBy('date', 'desc')
        .filter(TX => includeTransactionInAnalysis_spend(TX))
        .value();

    var streamGroups = {};
    _.each(transactionsToAnalyze, tx => addTransactionToStreamGroup(tx, streamGroups));
    streamGroups = _.omitBy(streamGroups, o => o.transactions.length < consts.minTransactionsForStandardStream);
    streamGroups = qlib.obj.compactObject(streamGroups);

    let twelveMonthRangeStartM = moment().subtract(12, 'months').startOf('month');
    let threeMonthRangeStartM = moment().subtract(3, 'months').startOf('month');
    let rangeEndM = moment().subtract(1, 'months').endOf('month');

    let out = _.map(streamGroups, (val, key) => {
        if (_.isNil(val.transactions) || _.isEmpty(val.transactions)) return {};
        else {
            // they have .dateM
            let threeMonthTransactions = _.filter(val.transactions, TX => TX.dateM.isBetween(threeMonthRangeStartM, rangeEndM));
            let threeMonthTotal = qlib.obj.mapReduceFinancial(threeMonthTransactions, 'amount');
            let twelveMonthTransactions = _.filter(val.transactions, TX => TX.dateM.isBetween(twelveMonthRangeStartM, rangeEndM));
            let twelveMonthTotal = qlib.obj.mapReduceFinancial(twelveMonthTransactions, 'amount');
            let firstTx = _.first(val.transactions);
            let o = {
                slug: key,
                name: firstTx.name,
                dailyAvg: _.round(threeMonthTotal / (DAYS_IN_MONTH * 3), 2),
                historicalTwelveMonths: twelveMonthTotal,
                historicalThreeMonths: threeMonthTotal,
                twelveMonthTids: _.map(twelveMonthTransactions, 'transaction_id'),
                threeMonthTids: _.map(threeMonthTransactions, 'transaction_id')
            };
            return o;
        }
    });
    out = _
        .chain(out)
        .compact()
        .orderBy('dailyAvg', 'desc')
        .take(30)
        .value();
    return out;
}

// NOTES
// * Transactions must already have .account, .isSpend, .amountRounded, .isRecognizedTransferOrRefund set on them. See conditionTransactions() in CTN.
// * Have disabled annual and quarterly spend stream output for now, they're not right enough yet.

function _streamify(transactions, typeOfAnalysis, callback) {
    console.time('_streamify-' + typeOfAnalysis);
    // if (logLevel == 'verbose' || logLevel == 'timers')
    //     console.time('_streamify-' + typeOfAnalysis);

    // Prep transactions for streamification
    transactions = _.orderBy(transactions, 'date', 'desc');
    var transactionsToStreamify;
    if (typeOfAnalysis == 'income')
        transactionsToStreamify = _.filter(transactions, TX => includeTransactionInAnalysis_income(TX));
    else if (typeOfAnalysis == 'spend')
        transactionsToStreamify = _.filter(transactions, TX => includeTransactionInAnalysis_spend(TX));
    else {
        callback(null, 'Unsupported type of analysis.');
        return;
    }

    // Put transactions into streamGroups then filter out groups with too few transactions
    var streamGroups = {};
    _.each(transactionsToStreamify, tx => addTransactionToStreamGroup(tx, streamGroups));
    streamGroups = _.omitBy(streamGroups, o => o.transactions.length < consts.minTransactionsForStandardStream);

    // STREAMIFY WITHIN EACH SLUG GROUP
    if (logLevel == 'verbose' || logLevel == 'timers')
        console.time('allSlugs');

    _async.eachOf(streamGroups, (streamGroup, slug, cb_each) => {
            streamGroups[slug] = streamifySlug(streamGroup, slug);
            cb_each();
        },
        (neverThrows) => {
            if (logLevel == 'verbose')
                console.log('******* Finished streamification, now going to cleanup *******');
            // if (logLevel == 'verbose' || logLevel == 'timers')
            //     console.timeEnd('allSlugs');

            streamGroups = qlib.obj.compactObject(streamGroups);

            var out;
            if (typeOfAnalysis == 'income')
                out = buildFinalIncomeObject(streamGroups, transactionsToStreamify);
            else
                out = buildFinalSpendObject(streamGroups);

            // // DEBUGGING
            // var csvToPrint = "";
            // _.each(out,

            //     (streamObj) => {

            //         const fields = ['payeeNameSlug', 'payeeNameFriendly', 'identifiedIn', 'periodSize', 'streamType', 'periodsPerYear',
            //             'transactionCount', 'category_id', 'fioCategoryId', 'dates', 'dateDistribution', 'amountDistribution', 'tids'
            //         ];
            //         const opts = { fields };
            //         let csv = json2csv(streamObj, opts);
            //         csvToPrint += (csv + '\n');
            //     }
            // );
            // let s = _.split(csvToPrint, '\n');
            // var newOut = "";
            // _.each(s, (line, idx) => {
            //     if (idx == 0 || isOdd(idx)) {
            //         newOut = newOut + '\n' + line;
            //     }
            // });
            // console.log(newOut + '\n^^^^^^^^^ CSV ^^^^^^^^^');
            // // DEBUGGING

            if (logLevel == 'verbose')
                console.log(JSON.stringify(out));
            // if (logLevel == 'verbose' || logLevel == 'timers')
            //     console.timeEnd('_streamify-' + typeOfAnalysis);

            console.timeEnd('_streamify-' + typeOfAnalysis);
            callback(neverThrows, out);
        }
    );
}

// FINAL OBJECTS

function buildFinalSpendObject(streamGroups) {

    let out = _
        .chain(streamGroups)
        .map((payeeObj, slug) => buildWinningSpendStreamObject(slug, payeeObj))
        .compact()
        .filter(O => O.periodSize != 'quarter' && O.periodSize != 'year') // IMPORTANT! Excluding these until they are better. 
        .orderBy('amountDistribution.dailyEstimate', 'desc')
        .value();
    return out;
}

function buildFinalIncomeObject(streamGroups, analyzedDeposits) {

    var out = {
        consts: consts, // for refrence/analysis
        activeStreams: _
            .chain(streamGroups)
            .mapValues('winningStream')
            .map((obj, key) => _.chain(obj).set('slug', key).value())
            .compact()
            .filter(O => O.periodSize != 'quarter' && O.periodSize != 'year') // IMPORTANT! Excluding these until they are better. 
            .each(O => {
                delete O.winningStreak; // Big object
                O.transactions = _.map(O.transactions, _.clone); // get our very own copy here.
                let firstTx = _.first(O.transactions);
                O.nameFriendly = friendlyPayeeName(firstTx.name);
                // _.each(O.transactions, TX => {
                //     _.unset(TX, 'account');
                //     _.unset(TX, 'dateM');
                // });
            })
            .map(S => _.set(S, 'tids', _.map(S.transactions, 'transaction_id'))) // add tids
            .value(),
        summary: {
            activeDailyEstimate: 0, // set below
            analyzedAccountMaids: _.chain(analyzedDeposits).map('masterAccountId').uniq().value(),
            oldestActiveStreamStartDate: "", // set below
            analyzedDepositCount: analyzedDeposits.length
        },
    };

    let activeStreamTransactions = _
        .chain(out.activeStreams)
        .map('transactions')
        .flatten()
        .value();

    out.transactionsWithUpdatedFioCatId = _
        .chain(activeStreamTransactions)
        .filter(tx => {
            let catIs200 = tx.fioCategoryId == 200;
            if (!catIs200) tx.fioCategoryId = 200;
            return !catIs200;
        })
        .value();

    out.tidsForActiveStreams = _.map(activeStreamTransactions, 'transaction_id');

    out.summary.oldestActiveStreamStartDate = _
        .chain(out.activeStreams)
        .map('dateDistribution')
        .map('firstDate')
        .sortBy().uniq().first().value() || null;

    out.summary.activeDailyEstimate = _
        .chain(out.activeStreams)
        .map('amountDistribution')
        .map('dailyEstimate')
        .reduce((m, i) => m + i)
        .round(2)
        .value() || 0;

    // OTHER STREAMS

    let amountStreams = _
        .chain(streamGroups)
        .mapValues('amountStreams')
        .map((obj, key) => _.chain(obj).values().each(itm => _.set(itm, 'slug', key)).value())
        .flatten()
        .value();

    let dateStreams = _
        .chain(streamGroups)
        .mapValues('dateStreams')
        .map((obj, key) => _.chain(obj).values().each(itm => _.set(itm, 'slug', key)).value())
        .flatten()
        .value();

    let activeStreamIds = _.map(out.activeStreams, 'streamId');
    let activeStreamSlugs = _.map(out.activeStreams, 'slug');

    out.inactiveStreams = _.concat(amountStreams, dateStreams);
    out.inactiveStreams = _
        .chain(out.inactiveStreams)
        .filter(O => !_.includes(activeStreamIds, O.streamId) && !_.includes(activeStreamSlugs, O.slug)) // Remove any active streams & any slugs that are already represented in active
        .filter(O => O.periodSize != 'quarter' && O.periodSize != 'year' && O.periodSize != 'unknown') // IMPORTANT! Excluding these until they are better. 
        .each(O => {
            delete O.winningStreak; // massive object
            delete O.streamId; // no longer needed and will change every night anyway, not useful to keep around, potentially confusing.
            let firstTx = _.first(O.transactions);
            O.nameFriendly = friendlyPayeeName(firstTx.name);
        })
        .map(S => _.chain(S).set('tids', _.map(S.transactions, 'transaction_id')).omit('transactions').value()) // switch from transactions to tids
        .value();

    // Remove the full transactions from the activestream objects
    _.each(out.activeStreams, AS => _.unset(AS, 'transactions'));

    return out;
}

// TRANSACTION FILTERING

function includeTransactionInAnalysis_spend(tx) {
    if (!tx.isSpend) return false;
    if (tx.account.type != 'credit' && tx.account.type != 'depository') return false;
    return true; // Include it
}

function includeTransactionInAnalysis_income(tx) {
    if (tx.isRecognizedTransferOrRefund) return false;
    if (tx.amountRounded > (-1 * consts.income_depositSizeCutoff)) return false;
    if (_.isUndefined(tx.account)) return false; // this is some sort of mutant, zombie walking dead transaction from an account that's been removed.
    if (tx.account.subtype != 'checking') return false;
    return true; // Include it
}

// GENERIC

function streamifySlug(obj, slug) {
    // console.time("streamifySlug-" + slug);
    // if (logLevel == 'verbose' || logLevel == 'timers')
    //     console.time('streamifySlug-' + slug);
    if (logLevel == 'verbose')
        console.log('\n********** START STREAMIFICATION OF ' + slug + ' **********');
    // if (slug.startsWith('ITUNES')) {
    //     console.log('hji');
    // }

    obj.dateStreams = dateStreamification(obj.transactions, slug);
    obj.amountStreams = amountStreamification(obj.transactions, slug);
    obj.unusedTransactions = _.filter(obj.transactions, TX => { // PERSIST UNUSED TRANSACTIONS
        if (_.includes(obj.dateStreams.utilizedTids, TX.transaction_id)) return false;
        if (_.includes(obj.amountStreams.utilizedTids, TX.transaction_id)) return false;
        return true;
    });
    delete obj.dateStreams.utilizedTids;
    delete obj.amountStreams.utilizedTids;
    obj = qlib.obj.compactObject(obj);
    obj.winningStream = selectWinningStream([obj.dateStreams, obj.amountStreams]);

    // if (logLevel == 'verbose' || logLevel == 'timers')
    //     console.timeEnd('streamifySlug-' + slug);
    if (logLevel == 'verbose')
        console.log('\n^^^^^^^^^ COMPLETED STREAMIFICATION OF ' + slug + ' ^^^^^^^^^');
    // console.timeEnd("streamifySlug-" + slug);
    return obj;
}

function selectWinningStream(streamSetsInPriorityOrder) {
    var out;

    _.each(streamSetsInPriorityOrder,

        streams => {

            if (_.isEmpty(streams)) return; // Continue

            out = _.find(streams, S => S.streamType == 'standard' && S.periodSize == 'biweekly');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffBiweekly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'wobbily' && S.periodSize == 'biweekly');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffBiweekly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'standard' && S.periodSize == 'month');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffMonthly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'wobbily' && S.periodSize == 'month');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffMonthly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'standard' && S.periodSize == 'week');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffWeekly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'wobbily' && S.periodSize == 'week');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffWeekly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'standard' && S.periodSize == 'quarter');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffQuarterly) return false; // Break, this wins

            out = _.find(streams, S => S.streamType == 'standard' && S.periodSize == 'year');
            if (out && out.dateDistribution.lastDaysAgo <= consts.streakLastDaysAgoCutoffAnnual) return false; // Break, this wins

            out = undefined; // Don't accidentially send previous as winner.
        }
    );

    return out;
}

function periodSizeToAnnualCount(sizeString) {
    switch (sizeString) {
        case 'week':
            return 52;
        case 'biweekly':
            return 26;
        case 'month':
            return 12;
        case 'quarter':
            return 4;
        case 'year':
            return 1;
    }
}

function friendlyPayeeName(name) {

    var out = name.toUpperCase();
    out = out.replace(" : ", ":");

    let desIdx = out.indexOf('DES:AUTO');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' PEO ');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' PEO, ');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' LLC ');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' DIRECT DEP');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' DES:DIR DEP');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' DIR DEP');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    desIdx = out.indexOf(' DES:DIRECT DEP');
    if (desIdx > 0)
        out = out.substring(0, desIdx);

    out = _
        .chain(out)
        .toLower()
        .startCase() // also removes ending period it seems
        .truncate({
            'length': 30,
            'separator': ' ',
            'omission': ''
        }) // limit total length
        .value();

    out = qlib.obj.caseInvariantEndStringRemove(out, 'inc');
    out = qlib.obj.caseInvariantEndStringRemove(out, 'zh');
    out = _.replace(out, 'Usa', 'USA');

    return _.trim(out);
}

// SPEND SPECIFIC

function buildWinningSpendStreamObject(payeeSlug, payeeObj) {

    if (_.isUndefined(payeeObj.winningStream)) return; // Not a winner!

    let firstTx = _.first(payeeObj.winningStream.transactions);

    let out = {

        streamType: payeeObj.winningStream.streamType,
        identifiedIn: payeeObj.winningStream.identifiedIn,
        amountDistribution: payeeObj.winningStream.amountDistribution,
        dateDistribution: payeeObj.winningStream.dateDistribution,
        periodSize: payeeObj.winningStream.periodSize,
        nameSlug: payeeSlug,
        nameFriendly: friendlyPayeeName(firstTx.name),
        category_id: firstTx.category_id,
        fioCategoryId: firstTx.fioCategoryId,
        tids: _.map(payeeObj.winningStream.transactions, 'transaction_id'),
        transactionCount: payeeObj.winningStream.transactions.length,
        periodsPerYear: periodSizeToAnnualCount(payeeObj.winningStream.periodSize),
        dates: _.get(payeeObj, 'winningStream.winningStreak.dates', payeeObj.winningStream.dates) || []
    };

    // console.log(JSON.stringify(out, null, 2));
    return out;
}

// DATE STREAMIFICATION

function dateStreamification(transactions, slug) {
    // if (logLevel == 'verbose' || logLevel == 'timers')
    //     console.time('dateStreamification-' + slug);
    if (logLevel == 'verbose')
        console.log('START DATE ANALYSIS');

    // if (logLevel == 'timers')
    // console.time('dateStreamification-moments-' + slug);
    _.each(transactions, T => T.dateM = moment(T.date)); // Add a moment to each transaction
    // if (logLevel == 'timers')
    // console.timeEnd('dateStreamification-moments-' + slug);

    let out = {
        weekly: periodicityAnalysis(transactions, 'week', consts.toleranceDaysForWeeklyPeriodicity, slug),
        biweekly: periodicityAnalysis(transactions, 'biweekly', consts.toleranceDaysForBiweeklyPeriodicity, slug),
        monthly: periodicityAnalysis(transactions, 'month', consts.toleranceDaysForMonthlyPeriodicity, slug),
        quarterly: periodicityAnalysis(transactions, 'quarter', consts.toleranceDaysForQuartlyPeriodicity, slug),
        yearly: periodicityAnalysis(transactions, 'year', consts.toleranceDaysForAnnualPeriodicity, slug)
    };

    out = qlib.obj.removeEmpty(out);

    if (logLevel == 'verbose')
        console.log('START DATE-AMOUNT-STREAM ANALYSIS');

    // if (logLevel == 'timers')
    //     console.time('dateStreamification-amountStream-' + slug);

    _.each(out, (periodObj, periodSizeString, coll) => {
        if (logLevel == 'verbose')
            console.log('-> ' + periodSizeString + ' amount stream analysis');

        // AMOUNT ANALYSIS
        let amountsRounded = _.map(periodObj.transactions, 'amountRounded');
        coll[periodSizeString].amountDistribution = qlib.math.statsForNumberSet(amountsRounded);

        // Do Amount rsd filter here
        let rsd = coll[periodSizeString].amountDistribution.relativeStandardDeviationPct;
        if (rsd > consts.rsdCutoffAmounts) {
            if (logLevel == 'verbose')
                console.log('-> = ELIMINATING ' + periodSizeString + ' DUE TO HIGH AMOUNT RSD = ' + coll[periodSizeString].amountDistribution.relativeStandardDeviationPct + ' Amounts: ' + amountsRounded);
            delete coll[periodSizeString]; // The RSD on the amounts is too high. Kill off this stream;
        }
        else {
            if (logLevel == 'verbose')
                console.log('-> Good amount RSD (' + rsd + ')');
            addAdditionalAmountInfo(coll[periodSizeString]);
            coll[periodSizeString].streamId = uuidv4();
        }
    });

    // if (logLevel == 'timers')
    //     console.timeEnd('dateStreamification-amountStream-' + slug);

    if (logLevel == 'verbose')
        console.log('COMPLETED DATE-AMOUNT-STREAM ANALYSIS with ' + _.keys(out).length + ' streams');

    out.utilizedTids = _
        .chain(out)
        .map((obj, periodSizeString) => obj.transactions)
        .flatten()
        .map('transaction_id')
        .value();

    // if (logLevel == 'verbose' || logLevel == 'timers')
    //     console.timeEnd('dateStreamification-' + slug);
    return out;
}

function periodicityAnalysis(transactions, periodSizeString, toleranceDays, slug) {
    if (logLevel == 'verbose')
        console.log('-> ' + periodSizeString.toUpperCase() + ' periodcity');
    // if (logLevel == 'timers')
    //     console.time('dateStreamification-periodicityAnalysis-' + periodSizeString + '-' + slug);

    // console.log('periodicityAnalysis() ' + periodSizeString);

    var out = {};

    // STRETCH ANALYSIS
    // Use each date as a candidate streak starting point
    var stretches = [];

    _.each(transactions, T => {
        if (!isDateWithinStreakRecencyLimit(T.dateM, periodSizeString))
            return false; // Break loop, remember this is sorted from most recent.
        let stretchObj = buildStretchObjectForDate(T.dateM, transactions, periodSizeString, toleranceDays);
        if (stretchObj)
            stretches.push(stretchObj);
    });

    // IF STRETCH ANALYSIS FAILED, DO WOBBILY DATE ANALYSIS
    let maxVal = _.chain(stretches).map('stretchLength').max().value();

    if (_.isEmpty(stretches) || !isStreakLongEnough(maxVal, periodSizeString)) {
        if (logLevel == 'verbose')
            console.log('--> No standard streak');

        if (periodSizeString == 'week' || periodSizeString == 'biweekly' || periodSizeString == 'month') {
            let wobbilyStreak = findWobbilyStreakIn(transactions, periodSizeString, 'Date', slug, transactions.length);

            if (wobbilyStreak) {

                if (logLevel == 'verbose')
                    console.log('--> Found a wobbily streak');
                out.winningStreak = wobbilyStreak;
                out.transactions = _.filter(transactions, T => _.includes(out.winningStreak.dates, T.date));
                out.streamType = 'wobbily';
                out.periodSize = periodSizeString;
                out.identifiedIn = 'periodicity-wobbily';
            }
            else {
                if (logLevel == 'verbose')
                    console.log('-> ' + periodSizeString.toUpperCase() + ' = No standard streak and no wobbily');
                return; // Bail - stream has no streaks and didn't hit in wobbily analysis
            }
        }
        else {
            if (logLevel == 'verbose')
                console.log('-> ' + periodSizeString.toUpperCase() + ' = No standard streak (and no wobbily analysis).');
            return; // Same bail. Not doing wobbily analysis on quarters or years.
        }
    }
    else {
        // what if there are two streaks of the same length?
        if (logLevel == 'verbose')
            console.log('--> Found a standard ' + periodSizeString + ' streak');
        out.winningStreak = _.find(stretches, S => S.stretchLength == maxVal); // Get the *most recent* index of max val
        out.transactions = _.filter(transactions, T => _.includes(out.winningStreak.dates, T.date));
        out.streamType = 'standard';
        out.periodSize = periodSizeString;
        out.identifiedIn = 'Date Streak Analysis';
    }

    // Add date distribtion 
    out.dateDistribution = qlib.date.dateDistributionForDateSet(_.map(out.transactions, 'date'));

    // Date RSD check
    if (out.dateDistribution.relativeStandardDeviationPct > consts.rsdCutoffDates) {
        if (logLevel == 'verbose')
            console.log('-> Eliminating due to high RSD (' + out.dateDistribution.relativeStandardDeviationPct + ')');
        delete out.winningStreak;
    }

    // console.log('Periodicity analysis output for ' + periodSizeString + ':\n' + JSON.stringify(out, null, 2));
    // if (logLevel == 'timers')
    //     console.timeEnd('dateStreamification-periodicityAnalysis-' + periodSizeString + '-' + slug);
    return out;
}

function isStreakLongEnough(streakLength, periodSizeString) {

    if (_.isUndefined(streakLength))
        return false;

    switch (periodSizeString) {

        case 'week':
            return streakLength >= consts.streakMinWeekly;

        case 'biweekly':
            return streakLength >= consts.streakMinWeekly;

        case 'month':
            return streakLength >= consts.streakMinMonthly;

        case 'quarter':
            return streakLength >= consts.streakMinQuarterly;

        case 'year':
            return streakLength >= consts.streakMinAnnual;
    }
}

function isDateWithinStreakRecencyLimit(date, periodSizeString) {

    let daysAgo = qlib.date.daysAgoForDate(date);

    switch (periodSizeString) {

        case 'week':
            if (daysAgo > consts.streakLastDaysAgoCutoffWeekly)
                return false;

        case 'biweekly':
            if (daysAgo > consts.streakLastDaysAgoCutoffBiweekly)
                return false;

        case 'month':
            if (daysAgo > consts.streakLastDaysAgoCutoffMonthly)
                return false;

        case 'quarter':
            if (daysAgo > consts.streakLastDaysAgoCutoffQuarterly)
                return false;

        case 'year':
            if (daysAgo > consts.streakLastDaysAgoCutoffAnnual)
                return false;
    }

    return true;
}

function buildStretchObjectForDate(dateM, transactions, periodSizeString, toleranceDays) {
    // if (logLevel == 'timers')
    //     console.time('dateStreamification-periodicityAnalysis-buildStretchObjectForDate-' + periodSizeString);

    var out = {
        startDate: dateM.format('YYYY-MM-DD'),
        stretchLength: 0
    };
    out.dates = [out.startDate]; // include the start date, important for transaction pulling later

    var seekDateM;
    var cursorM = moment(dateM);
    let moments = _.map(transactions, 'dateM');

    // console.time('doloop');
    do {
        // console.time('momentMath');
        if (periodSizeString == 'biweekly')
            cursorM.subtract(2, 'weeks'); // step back one period each time around.
        else
            cursorM.subtract(1, periodSizeString); // step back one period each time around.
        // console.timeEnd('momentMath');

        // console.time('closestDateInArray');
        seekDateM = qlib.date.closestDateInMomentArray(moments, cursorM, toleranceDays);
        // console.timeEnd('closestDateInArray');

        if (seekDateM) {
            out.stretchLength++; // date found at interval! keep stepping
            // console.time('format');
            out.dates.push(seekDateM.format('YYYY-MM-DD'));
            // console.timeEnd('format');
        }
        else break;
    } while (true);
    // console.timeEnd('doloop');

    // if (logLevel == 'timers')
    //     console.timeEnd('dateStreamification-periodicityAnalysis-buildStretchObjectForDate-' + periodSizeString);

    if (out.stretchLength == 0)
        return;
    else
        return out;
}

function findWobbilyStreakIn(transactions, periodSizeString, fromAnalysisType, slug, totalTransactionCountForSlug) {
    if (logLevel == 'verbose')
        console.log('---> Start Wobbily Analysis for ' + periodSizeString);

    // Don't use this for quarters or years.
    if (periodSizeString == 'quarter' || periodSizeString == 'year') {
        if (logLevel == 'verbose')
            console.log('----> No wobbily (invalid period size) ' + periodSizeString);
        return; // Bounce
    }

    // Check for sufficient transaction count
    if (transactions.length < consts.minTransactionsForWobbilyStream) {
        if (logLevel == 'verbose')
            console.log('----> No wobbily (too few transactions) ' + periodSizeString);
        return; // Bounce
    }

    // Don't assume transactions are ordered by date
    transactions = _.orderBy(transactions, 'date', 'desc');

    let mostRecentTxDateS = _.first(transactions).date;
    let mostRecentTxDateM = moment(mostRecentTxDateS);
    let oldestTxDateS = _.last(transactions).date;
    let oldestTxDateM = moment(oldestTxDateS);

    var tolerance;
    var periodDayCount;

    switch (periodSizeString) {

        case 'week':
            tolerance = consts.toleranceDaysForWeeklyPeriodicity;
            periodDayCount = DAYS_IN_WEEK;
            break;

        case 'biweekly':
            tolerance = consts.toleranceDaysForBiweeklyPeriodicity;
            periodDayCount = DAYS_IN_WEEK * 2;
            break;

        case 'month':
            tolerance = consts.toleranceDaysForMonthlyPeriodicity;
            periodDayCount = DAYS_IN_MONTH;
            break;

        default: // doesn't support quarters or years.
            return false;
    }

    let daysBetweenFirstAndLastTransactions = mostRecentTxDateM.diff(oldestTxDateM, 'days');
    let expectedTransactions = daysBetweenFirstAndLastTransactions / periodDayCount;

    let streakExists = _.inRange(transactions.length, expectedTransactions - tolerance, expectedTransactions + tolerance + 1);

    if (streakExists) {

        let out = {
            startDate: _.first(transactions).date,
            stretchLength: transactions.length,
            transactions: transactions,
            dates: _.map(transactions, 'date'),
            streamType: 'wobbily',
            periodSize: periodSizeString,
            amountDistribution: qlib.math.statsForNumberSet(_.map(transactions, 'amountRounded')),
            identifiedIn: fromAnalysisType + ' Wobbily-Date Analysis'
        };
        out.dateDistribution = qlib.date.dateDistributionForDateSet(out.dates);
        addAdditionalAmountInfo(out);

        if (out.dateDistribution.relativeStandardDeviationPct > consts.rsdCutoffWobbilyDateStream) {
            if (logLevel == 'verbose')
                console.log('*** DELETING WOBBILY DUE TO *TOO* HIGH DATE RSD: ' + slug);
            return;
        }

        if (out.stretchLength / totalTransactionCountForSlug < consts.streakLengthToTransactionCountCutoffRatio) {
            if (logLevel == 'verbose')
                console.log('*** DELETING WOBBILY DUE TO LENGTH TO TRANSACTION COUNT RATIO: ' + slug);
            return;
        }

        if (logLevel == 'verbose')
            console.log('----> MATCHED WOBBILY for ' + periodSizeString); //+ '\n' + JSON.stringify(out, null, 2));
        return out;
    }
    else {
        if (logLevel == 'verbose')
            console.log('----> No wobbily ' + periodSizeString);
        return;
    }
}

// AMOUNT STREAMIFICATION

function amountStreamification(transactions, slug) {
    if (logLevel == 'verbose') {
        console.time('amountStreamification-' + slug);
        console.log('START AMOUNT ANALYSIS');
    }

    transactions = removeOutlierTransactionsByAmount(transactions, consts.clipStandardDeviations, consts.clipTwoRatio);
    let orderedTransactions = _.orderBy(transactions, 'amountRounded', 'desc');

    let outStreams = {};
    let currentAmountStreamId;

    // BUILD AMOUNT STREAMS
    _.each(orderedTransactions,

        (tx, idx) => {

            if (idx == 0) {
                currentAmountStreamId = tx.amountRounded;
                tx.amountStreamId = currentAmountStreamId;
                outStreams[currentAmountStreamId] = { transactions: [tx] }; // get things started
            }
            else {

                let pctVal = consts.amountGroupingPercentTolerance * currentAmountStreamId;
                let upperLimit = currentAmountStreamId + pctVal;
                let lowerLimit = currentAmountStreamId - pctVal;
                // console.log('Range for ' + currentAmountStreamId + ' = ' + lowerLimit + ' -> ' + upperLimit);

                if (_.inRange(tx.amountRounded, lowerLimit, upperLimit)) {
                    // I'm in!
                    // console.log('Joining amount group for ' + tx.amountRounded + ' ' + slug + ' ' + tx.amount);
                    tx.amountStreamId = currentAmountStreamId;
                    outStreams[currentAmountStreamId].transactions.push(tx);
                }
                else {
                    // I'm starting my own group!
                    // console.log('Starting amount group for ' + tx.amountRounded + ' ' + slug + ' ' + tx.amount);
                    currentAmountStreamId = tx.amountRounded;
                    tx.amountStreamId = currentAmountStreamId;
                    outStreams[currentAmountStreamId] = { transactions: [tx] };
                }
            }
        }
    );

    // // DEBUGGING
    // _.each(outStreams, function(streamObj, streamId, coll) {
    //     const fields = ['transaction_id', 'name', 'date', 'amountRounded', 'amountStreamId'];
    //     const opts = { fields };
    //     let csv = json2csv(streamObj.transactions, opts);
    //     console.log('\n' + csv);
    // });
    // console.log('FIN');
    // // DEBUGGING

    let keys = _.keys(outStreams);
    if (logLevel == 'verbose')
        console.log('Found ' + keys.length + ' amount streams. Starting date analysis of each. ' + keys);

    // DATE ANALYSIS FOR EACH AMOUNT STREAM
    // if (slug == "AMAZON") console.time("date analysis for amount stream");

    _.each(outStreams, (S, amountStreamId, coll) => {
        if (logLevel == 'verbose')
            console.log('-> Date analysis for amount stream: ' + amountStreamId);

        // Identify wobbily streams
        let wobbily = findWobbilyStreakIn(S.transactions, 'week', 'Amount', slug, transactions.length);

        if (_.isUndefined(wobbily))
            wobbily = findWobbilyStreakIn(S.transactions, 'month', 'Amount', slug, transactions.length);

        if (wobbily) {
            if (logLevel == 'verbose')
                console.log('= Got wobbily ' + wobbily.periodSize + ' for amount stream ' + amountStreamId);
            wobbily.skipDateRSD = true; // it was already filtered inside of findWobbilyStreakIn()
            coll['wobbily'] = wobbily;
            delete coll[amountStreamId];
            return; // Continue
        }

        // Do a date deep dive looking for **monthly** only right now
        // todo: later add support for weekly, quarterly, and annual
        if (logLevel == 'verbose')
            console.log('-> Starting date deep dive for stream ' + amountStreamId);

        // Bounce if there are too few transactions to make a stream
        if (!_.isUndefined(S.transactions) && S.transactions.length < consts.minTransactionsForStandardStream) {
            if (logLevel == 'verbose')
                console.log('= Eliminating due to too few transactions');
            delete coll[amountStreamId];
            return; // Continue the each loop.
        }

        S.transactions = _.orderBy(S.transactions, 'date', 'desc');
        let transactionDateMoments = _.chain(S.transactions).map('date').map(dateStr => moment(dateStr)).value();
        let keepThisAmountStream = false;

        if (logLevel == 'verbose')
            console.time('dateAnalysisForAmountStreams-' + slug + '-' + amountStreamId);

        // if (slug == "AMAZON") console.time("4");
        _.each(S.transactions, tx => {
            tx.matchingTransactionDates = identifyIntervalTriad(transactionDateMoments, tx.date, 'month', 1, 2, slug);
            // console.log(tx.amount + ' ' + tx.date + ' ' + JSON.stringify(tx.matchingTransactionDates));
            if (_.isUndefined(tx.matchingTransactionDates.post) && !_.isUndefined(tx.matchingTransactionDates.prior)) {
                tx.streamId = uuidv4();
                if (logLevel == 'verbose')
                    console.log('--> STARTING new streamId: ' + tx.streamId + ' for ' + tx.date + ' amount = ' + tx.amount);
            }
            else if (!_.isUndefined(tx.matchingTransactionDates.post)) {
                tx.streamId = _.find(S.transactions, inspectTx => inspectTx.date == tx.matchingTransactionDates.post).streamId;
                // console.log('--> USING existing streamId: ' + tx.streamId + ' for ' + tx.date + ' amount = ' + tx.amount);
            }
            else {
                // console.log('--> Neither pre nor post were found for ' + tx.date + ' ' + tx.amount + ' leaving grouped with ' + amountStreamId);
                tx.streamId = amountStreamId; // Leave it grouped as it was
                keepThisAmountStream = true; // Meaning that this transaction was unused in a stream so it's current parent stream should persist
            }
        });
        // if (slug == "AMAZON") console.timeEnd("4");

        if (logLevel == 'verbose')
            console.timeEnd('dateAnalysisForAmountStreams-' + slug + '-' + amountStreamId);

        let newStreams = _.groupBy(S.transactions, 'streamId');

        // Condition the new stream objects
        _.each(newStreams, (transactions, streamId) => {
            if (transactions.length < consts.minTransactionsForStandardStream) {
                // console.log('-> Eliminating Amount-Date Stream due to too few transactions ' + streamId);
            }
            else {
                if (logLevel == 'verbose')
                    console.log('-> Valid Amount-Date Stream with ' + transactions.length + ' transactions ' + streamId);
                let dates = _.map(transactions, 'date');
                coll[streamId] = { // add this new stream to outStreams
                    transactions: transactions,
                    streamType: 'standard',
                    periodSize: 'month',
                    dates: dates,
                    dateDistribution: qlib.date.dateDistributionForDateSet(dates),
                    amountDistribution: qlib.math.statsForNumberSet(_.map(transactions, 'amountRounded')),
                    identifiedIn: 'Amount-Date Deep Dive',
                    skipDateRSD: true,
                };
            }
        });

        if (keepThisAmountStream) {
            if (logLevel == 'verbose')
                console.log('-> Keeping existing Amount-Date Stream that didnt hit wobbily or date deep dive ' + amountStreamId);
            let dates = _.map(coll[amountStreamId].transactions, 'date');
            coll[amountStreamId] = { // Flesh out this stream object
                transactions: coll[amountStreamId].transactions,
                streamType: 'amount-date-unknown',
                periodSize: 'unknown',
                dates: dates,
                dateDistribution: qlib.date.dateDistributionForDateSet(dates),
                amountDistribution: qlib.math.statsForNumberSet(_.map(coll[amountStreamId].transactions, 'amountRounded')),
            };
        }
        else {
            if (logLevel == 'verbose')
                console.log('-> Eliminating Amount Stream carcass ' + amountStreamId + ' because its transactions are now in new stream(s)');
            delete coll[amountStreamId]; // Remove this stream from outStreams because all of its transactions are now in 1+ new streams
        }
    });
    // if (slug == "AMAZON") console.timeEnd("date analysis for amount stream");

    // CLEANUP THE STREAM SET
    _.each(outStreams,

        (streamObj, streamId, coll) => {

            // Eliminate streams with too few transactions
            if (streamObj.transactions.length < consts.minTransactionsForStandardStream) {
                if (logLevel == 'verbose')
                    console.log('-> Eliminating Amount-Date stream due to too few transactions ' + streamId);
                delete coll[streamId];
                return; // Continue
            }

            // Eliminate streams with most recent transaction too long ago for period size
            let mostRecentTX = _.first(streamObj.transactions);
            if (!isDateWithinStreakRecencyLimit(mostRecentTX.date, streamObj.periodSize)) {
                if (logLevel == 'verbose')
                    console.log('-> Eliminating dead Amount-Date stream. Last transaction was on ' + mostRecentTX.date + ' ' + streamId);
                delete coll[streamId];
                return; // Continue
            }

            // Eliminate streams with too large RSD
            if (streamObj.dateDistribution.relativeStandardDeviationPct > consts.rsdCutoffDates && !streamObj.skipDateRSD) {
                if (logLevel == 'verbose')
                    console.log('-> Eliminating due to high date RSD (' + streamObj.dateDistribution.relativeStandardDeviationPct + ') ' + streamId);
                delete coll[streamId];
                return; // Continue
            }

            // Keeping the stream!
            addAdditionalAmountInfo(coll[streamId]);
            coll[streamId].streamId = uuidv4();
        }
    );

    // // DEBUGGING
    // _.each(outStreams, function(streamObj, key) {
    //     const fields = ['transaction_id', 'name', 'date', 'amount', 'matchingTransactionDates', 'streamId'];
    //     const opts = { fields };
    //     let csv = json2csv(streamObj.transactions, opts);
    //     console.log('\n' + csv);
    // });
    // // DEBUGGING

    outStreams.utilizedTids = _
        .chain(outStreams)
        .map(obj => obj.transactions)
        .flatten()
        .map('transaction_id')
        .value();

    if (logLevel == 'verbose')
        console.timeEnd('amountStreamification-' + slug);
    return outStreams;
}

function identifyIntervalTriad(dateMoments, inspectDate, intervalSize, intervalCount, toleranceDays, slug) {
    // console.log('INSPECT DATE: ' + inspectDate);

    // Look Before
    let priorInspectDateM = moment(inspectDate).subtract(intervalCount, intervalSize);
    let priorM = qlib.date.closestDateInArray(dateMoments, priorInspectDateM, toleranceDays);
    let priorStr = _.isUndefined(priorM) ? undefined : priorM.format('YYYY-MM-DD');

    // Look After
    let postInspectDateM = moment(inspectDate).add(intervalCount, intervalSize);
    let postM = qlib.date.closestDateInArray(dateMoments, postInspectDateM, toleranceDays);
    let postStr = _.isUndefined(postM) ? undefined : postM.format('YYYY-MM-DD');

    return {
        post: postStr,
        prior: priorStr
    };
}

function addAdditionalAmountInfo(streamObj) {
    try {

        if (streamObj.periodSize == 'unknown') {
            let timesPerYear = DAYS_IN_YEAR / streamObj.dateDistribution.avgDiffDays;
            streamObj.amountDistribution.annualEstimate = _.round(timesPerYear * streamObj.amountDistribution.mean, 2);
        }
        else {
            streamObj.amountDistribution.annualEstimate = _.round(streamObj.amountDistribution.mean * periodSizeToAnnualCount(streamObj.periodSize), 2);
        }

        if (!_.isUndefined(streamObj.amountDistribution.annualEstimate)) {
            streamObj.amountDistribution.dailyEstimate = _.round(streamObj.amountDistribution.annualEstimate / DAYS_IN_YEAR, 2);
            streamObj.amountDistribution.monthlyEstimate = _.round(streamObj.amountDistribution.annualEstimate / 12, 2);
        }

        streamObj.amountDistribution.totalAmountEver = qlib.obj.mapReduceFinancial(streamObj.transactions, 'amount');
        _.each(streamObj.amountDistribution, (v, k, c) => c[k] = Math.abs(v)); // Go positive!
    }
    catch (err) {
        console.log("ERROR in addAdditionalAmountInfo() : " + err);
    }
}

// GROUPING BY TRANSACTION NAME

function nameSlugForTransaction(tx) {
    // Order of operations matters here...
    let nameSlug = tx.name;
    nameSlug = _.startCase(nameSlug); // Removes special characters, casing is irrelevant here. Note that it introduces spaces.
    nameSlug = nameSlug.replace(/\s/g, ''); // Remove *all* spaces
    nameSlug = _.truncate(nameSlug, {
        'omission': '',
        'length': consts.slugLength
    });
    return nameSlug.toUpperCase();
}

function addTransactionToStreamGroup(tx, streamGroups) {
    tx.nameSlug = nameSlugForTransaction(tx);
    if (_.isUndefined(streamGroups[tx.nameSlug]))
        streamGroups[tx.nameSlug] = {}; // Create the group if it doesn't already exist.
    confirmStreamIsPrepped(streamGroups[tx.nameSlug]);
    streamGroups[tx.nameSlug].transactions.push(tx);
}

function confirmStreamIsPrepped(group, streamId) {

    if (_.isUndefined(group.transactions))
        group.transactions = [];

    if (!_.isUndefined(streamId)) {

        if (_.isUndefined(group[streamId]))
            group[streamId] = {};

        if (_.isUndefined(group[streamId].transactions))
            group[streamId].transactions = [];
    }
}

// OUTLIERS

function removeOutlierTransactionsByAmount(transactions, clipStandardDeviations, clipTwoRatio) {
    // console.log('in size = ' + transactions.length);

    // GRAB THE AMOUNTS
    let amounts = _.map(transactions, 'amount');
    // console.log('amounts:\n' + JSON.stringify(amounts));

    let amountsToKeep = excludeOutlyingValuesFromArray(amounts, clipStandardDeviations, clipTwoRatio);
    // console.log('amountsToKeep:\n' + JSON.stringify(amountsToKeep, null, 2));

    // FILTER DOWN TO TRANSACTIONS/DEPOSITS THAT ARE FOR THE NON-CLIPPED AMOUNTS
    let out = _.filter(transactions, TX => _.includes(amountsToKeep, TX.amount));

    let delta = transactions.length - out.length;
    if (logLevel == 'verbose')
        if (delta > 0) console.log('Removed ' + delta + ' outliers.');

    // console.log('out size = ' + out.length);
    return out;
}

function excludeOutlyingValuesFromArray(array, clipStandardDeviations, clipTwoRatio) {
    // Array is expected to be uniq() already
    let amountsOrdered = _.orderBy(array, null, 'asc');

    var out;

    if (array.length >= 3) {
        out = meanAndStandardDeviationClip(amountsOrdered, clipStandardDeviations);
        out = clipApproachTwo(out, clipTwoRatio);
    }
    else {
        if (logLevel == 'verbose')
            console.log('Not enough data to exclude outliers.');
        out = amountsOrdered; // Bail if there isn't enough information for this analysis.
    }

    return out;
}

function meanAndStandardDeviationClip(arrayOfNumbers, clipAtStdDeviations) {

    let mean = _.floor(_.mean(arrayOfNumbers), 2);
    let sd = _.ceil(qlib.math.stdDev(arrayOfNumbers), 2);
    // console.log('mean = ' + mean + ' sd = ' + sd);

    if (sd == 0) {
        return arrayOfNumbers;
    }

    let insideTheSdRange = _.filter(arrayOfNumbers, V => {
        let variationFromMean = Math.abs(mean - V);
        // console.log(variationFromMean);
        return variationFromMean < (sd * clipAtStdDeviations);
    });
    // console.log(JSON.stringify(insideTheSdRange));

    return insideTheSdRange;
}

function clipApproachTwo(orderedArray, cutoff) {
    // console.log('clipApproachTwo(): ' + JSON.stringify(orderedArray));

    var out;
    var recurse = false;

    // CLIP HIGH END VAL
    let amountsWithoutHighest = _.initial(orderedArray);
    let highestAmount = _.last(orderedArray);
    let mean = _.mean(amountsWithoutHighest);
    let ratio = highestAmount / mean;
    // console.log('mean of filtered = ' + mean);
    // console.log('highestAmount = ' + highestAmount);
    // console.log('ratio = ' + ratio);

    if (ratio > cutoff) {
        out = amountsWithoutHighest;
        recurse = true;
        // console.log('set recurse high');
    }
    else {
        out = orderedArray;
    }
    // console.log('out with high end clipped:\n' + JSON.stringify(out, null, 2));

    // CLIP LOW END VAL
    let amountsWithoutLowest = _.tail(out);
    let lowestAmount = _.first(out);
    mean = _.mean(amountsWithoutLowest);
    ratio = lowestAmount / mean;
    // console.log('mean of filtered = ' + mean);
    // console.log('lowestAmount = ' + lowestAmount);
    // console.log('ratio = ' + ratio);

    cutoff = 1 / cutoff;

    if (ratio < cutoff) {
        out = amountsWithoutLowest;
        recurse = true;
        // console.log('set recurse low');
    }
    // console.log('out with low end clipped:\n' + JSON.stringify(out, null, 2));


    // WRAP UP
    if (recurse) {
        // console.log('RECURSING');
        return clipApproachTwo(out);
    }
    else {
        // console.log('NOT RECURSING');
        return out;
    }
}
