//
//  QIO-Analysis-Spending
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId, optional: .skipNotify, .pullFullTransactionHistory
//  Output: categories and dateNets
//

'use strict';
const _ = require('lodash');
const _async = require('async');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const qlib = require('../QuantaLib/FIO-QuantaLib');
const q_cats = require('./FIO-Transaction-Categorize');
const q_streams = require("./FIO-Analysis-Streamification");

const spendingSummaryMonthsToAnalyze = 12;
const daysToAnalyze = 91;
const bleCategoryIds = ['A', 'B', 'C', 'D', 'E', 'F'];


module.exports = {

    buildSpendingSummary: (transactions, callback) => _buildSpendingSummary(transactions, callback),

};

function _buildSpendingSummary(transactions, callback) {
    _async.parallel({
            monthTotals: cb => {
                let startDateM = moment().subtract(spendingSummaryMonthsToAnalyze, 'months');
                let out = _ // this is expected to return an array of 13 becacuse there are days in month at either end
                    .chain(transactions)
                    .filter(tx => tx.isSpend && !(moment(tx.date).isBefore(startDateM))) // shouldn't transactionIsRecognizedTransferOrRefund() be used to determine isSpend?
                    .each(tx => tx.amount = Math.abs(tx.amount)) // to get us on the same coordinate system (Credit vs. Debit)
                    .groupBy(tx => tx.date.substring(0, 7))
                    .map((monthTransactionArray, key) => {
                        return {
                            amount: qlib.obj.mapReduceFinancial(monthTransactionArray, 'amount'),
                            month: key
                        };
                    })
                    .orderBy('month', 'asc')
                    .value();
                cb(null, out);
            },
            dailyAvg: cb => {
                let out = _
                    .chain(transactions)
                    .filter(tx => tx.isSpend)
                    .groupBy('date')
                    .map((dateTransactionArray, key) => ({
                        amount: qlib.obj.mapReduceFinancial(dateTransactionArray, 'amount'),
                        date: key
                    }))
                    .orderBy('date', 'desc')
                    .take(daysToAnalyze)
                    .map('amount')
                    .mean()
                    .round(2)
                    .value();
                cb(null, out);
            },
            spendStreams: cb => q_streams.streamify(transactions, 'spend', cb),
            basicLivingExpenses: cb => buildBasicLivingExpenses(transactions, cb)
        },
        (err, res) => {
            if (err) callback(err);
            else {
                let out = {
                    totalAmount: qlib.obj.mapReduceFinancial(res.monthTotals, 'amount'),
                    months: res.monthTotals,
                    monthsAnalyzed: spendingSummaryMonthsToAnalyze,
                    categories: q_cats.buildCategorySummary(transactions),
                    vendorAnalysis: q_streams.vendorAnalysis(transactions),
                    basicLivingExpenses: res.basicLivingExpenses,
                    daily: {
                        averageAmount: res.dailyAvg,
                        daysAnalyzed: daysToAnalyze
                    },
                    streams: res.spendStreams
                };
                callback(null, out);
            }
        }
    );
}

function buildBasicLivingExpenses(transactions, callback) {
    let out = {
        estimatedMonthlyAmount: 0,
        months: []
    };
    let startDateM = moment().subtract(6, 'months').startOf('month');
    let endDateM = moment().subtract(1, 'month').endOf('month');
    let transactionsFilteredAndGroupedByMonth = _
        .chain(transactions)
        .filter(tx => {
            let txM = moment(tx.date);
            if (txM.isBefore(startDateM)) return false;
            if (txM.isAfter(endDateM)) return false;
            if (qlib.tx.transactionIsRecognizedTransferOrRefund(tx)) return false;
            if (!isEligibleFioCategory(tx.fioCategoryId)) return false;
            // todo: Probbaly more filtering possible here
            return true;
        })
        .each(tx => assignBleCat(tx))
        .filter(tx => _.has(tx, 'bleCat'))
        .orderBy('date', 'desc') // so they're ordered within the month groups
        .groupBy(tx => moment(tx.date).format('YYYY-MM'))
        .value();
    _.each(transactionsFilteredAndGroupedByMonth, (monthTxs, monthStr) => {
        out.months.push({
            monthTotal: qlib.obj.mapReduceFinancial(monthTxs, 'amount'),
            allTids: _.map(monthTxs, 'transaction_id'),
            monthStr: monthStr,
            monthStartDate: moment(monthStr, "YYYY-MM").startOf('month').format('YYYY-MM-DD'),
            monthEndDate: moment(monthStr, "YYYY-MM").endOf('month').format('YYYY-MM-DD'),
            byCategory: buildBleCategoryFinalObject(monthTxs)
        });
    });
    out.estimatedMonthlyAmount = qlib.obj.mapMeanFinancial(out.months, 'monthTotal');
    out.summary = buildBleSummary(out);
    console.log(JSON.stringify(out, null, 2));
    callback(null, out);
}

function buildBleSummary(o) {
    var out = [];
    let allMonthCats = _
        .chain(o.months)
        .map('byCategory')
        .flatten()
        .value();
    _.each(bleCategoryIds, catId => {
        let catMonthsForId = _.filter(allMonthCats, i => i.categoryId.toUpperCase() == catId);
        out.push({
            categoryId: catId,
            average: qlib.obj.mapMeanFinancial(catMonthsForId, 'amount'),
            friendlyName: friendlyNameForBleCat(catId)
        });
    });
    return out;
}

function buildBleCategoryFinalObject(transactions) {
    let grouped = _.groupBy(transactions, 'bleCat');
    let out = _.transform(grouped, (result, transactionsForBleCat, bleCat) => {
        result.push({
            categoryId: bleCat,
            amount: qlib.obj.mapReduceFinancial(transactionsForBleCat, 'amount'),
            tids: _.map(transactionsForBleCat, 'transaction_id')
        });
        return result;
    }, []);
    return out;
}

function friendlyNameForBleCat(catId) {
    switch (catId.toUpperCase()) {
        case 'A':
            return "Roof";
        case 'B':
            return "Food";
        case 'C':
            return "Utilities";
        case 'D':
            return "Health";
        case 'E':
            return "Transportation";
        case 'F':
            return "Family";
        default:
            "Unrecognized";
    }
}

/**
 * A : Roof	        : Rent, mortgage, insurance
 * B : Food	        : Groceries
 * C : Utilities	: Internet, pge
 * D : Docs & Meds  : 	
 * E : Transpo	    : Car, public transit, insurance, parking
 * F : Family	    : Childcare / Tuition, Pet care (Food, walking, vet, etc)
 * @param  {Transaction} tx blerg
 * @return {Transaction} tx tx blerg
 */
function assignBleCat(tx) {
    let c = tx.fioCategoryId;
    let pc = tx.category_id;

    // 2000	Family & Friends
    if (c >= 2000 && c < 3000) { // Not all qualify as ble.

        // REJECTED category_ids
        switch (pc) {
            // case '17018000': // Gyms and Fitness Centers
            //     return tx;
        }

        // ACCEPTED category_ids
        switch (pc) {
            case '18069000': // Service	Veterinarians
            case '19042000': // Shops	Pets
                tx.bleCat = "F";
                break;

            default:
                tx.bleCat = "*F";
        }
    }

    // 3000	Health & Fitness & Personal Care
    else if (c >= 3000 && c < 4000) { // Not all qualify as ble.

        // REJECTED category_ids
        switch (pc) {
            case '17018000': // Gyms and Fitness Centers
            case '18045000': // Place	Service	Personal Care (Ex: Dry Cleaning & Great Jones Spa)
                console.log("Excluding " + tx.name);
                return tx; // Strong Exclude
        }

        // ACCEPTED category_ids
        switch (pc) {
            case '19043000': // Pharmacies
                tx.bleCat = "D";
                break;
            default:
                tx.bleCat = "*D";
        }
    }

    // 4000	At Home / Domestic Life
    else if (c >= 4000 && c < 5000) { // Not all qualify as ble.

        // REJECTED category_ids
        switch (pc) {
            case '18020001': // Service	Financial	Taxes
            case '18014000': // Service	Credit Counseling and Bankruptcy Services
            case '18045000': // Place	Service	Personal Care (Ex: Dry Cleaning & Great Jones Spa)
            case '18045003': // Service	Personal Care	Spas
            case '18058000': // Service	Shipping and Freight
            case '18061000': // Service	Subscription (Ex. Netflix, Spotify)
            case '19019000': // Shops	Digital Purchase (Ex. Google)
            case '19024000': // Florists
            case '19027000': // Shops	Furniture and Home Decor
            case '19030000': // Shops	Hardware Store
            case '19054000': // Shops	Lawn and Garden
            case '20002000': // Tax	Payment
                console.log("Excluding " + tx.name);
                return tx; // Strong Exclude
        }

        // ACCEPTED category_ids
        switch (pc) {

            // Food / Groceries
            case '19047000': // Supermarkets and Groceries
                tx.bleCat = "B";
                break;

                // Utilities
            case '18031000': // Service	Internet Services
                tx.bleCat = "C";
                break;

            default:
                tx.bleCat = "*A/B/C";
        }

        // String logic
        let nameLower = tx.name.toLowerCase();
        if (nameLower.includes("real estate bill payment")) tx.bleCat = "A"; // Gaetani Real Estate Bill Payment
        if (nameLower.includes("mortgage")) tx.bleCat = "A"; // WELLS FARGO HOME MORTGAGE Bill Payment ()
    }

    // 6000	Transpo
    else if (c >= 6000 && c < 7000) { // For now including all
        tx.bleCat = "E";
    }

    if (_.isNil(tx.bleCat)) { // Probably: a transaction was passed in with an unrecognized fioCatId
        return tx;
    }
    else if (tx.bleCat.startsWith("*")) {
        console.log(tx.name);
        console.log(pc);
        console.log(c);
        console.log(tx.bleCat);
        console.log("===================");
        console.log();
        _.unset(tx, 'bleCat'); // Exclude these
    }
    return tx;
}

/**
 * Description blerg
 * @param  {Number} fioCategoryId hi blerg
 * @return {Bool} Should blerg
 */
function isEligibleFioCategory(fioCategoryId) {
    let c = fioCategoryId;

    // 0	Mystery
    // 100	Transfers
    // 101	Credit Card Payments
    // 200	Payroll / Recognized Income
    // 300	Refunds
    // 400	Unidentified Deposits
    // 500	Interest Earned
    if (c >= 0 && c < 1000) return false;

    // 1000	Shopping
    if (c >= 1000 && c < 2000) return false;

    // 2000	Family & Friends
    if (c >= 2000 && c < 3000) return true;

    // 3000	Health & Fitness & Personal Care
    if (c >= 3000 && c < 4000) return true;

    // 4000	At Home / Domestic Life
    if (c >= 4000 && c < 5000) return true;

    // 5000	On the Town
    if (c >= 5000 && c < 6000) return false;

    // 6000	Transpo
    if (c >= 6000 && c < 7000) return true;

    // 7000	Travel
    if (c >= 7000 && c < 8000) return false;

    // 8000	Money Fire
    if (c >= 8000 && c < 9000) return false;

    // 9000	Career, Professional, & Business
    if (c >= 9000 && c < 10000) return false;

    return false; // In case any cases were missed.
}
