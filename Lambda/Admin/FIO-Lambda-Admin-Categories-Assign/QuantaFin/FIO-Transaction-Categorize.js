// FIO-Transaction-Categorize.js

'use strict';
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse');
// const moment = require('moment');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const q_obj = require('../QuantaLib/Util/FIO-Util-ObjectStuff');
const q_tx = require('../QuantaLib/Core/FIO-Transactions');

const csvFileName = "FIO-Transaction-Category-Mapping.csv";
const daysToLookbackForCategorySummarization = 90;

var categoryMap;
var accounts;
var isInitialized = false;

module.exports = {

    init: (accounts, callback) => _init(accounts, callback),
    pickFlowCategoryForTransaction: tx => _pickFlowCategoryForTransaction(tx),
    fioCatToIndex: cat => _fioCatToIndex(cat),
    buildCategorySummary: transactions => _buildCategorySummary(transactions)

};

function _init(accts, callback) {
    accounts = accts;
    let filePath = path.resolve(__dirname + '/' + csvFileName);
    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
        if (err) {
            console.log(err);
            if (callback) callback(err);
        }
        else {
            csvParse(data, {
                cast: true,
                columns: true
            }, (err, csvObject) => {
                if (err) {
                    console.log(err);
                    if (callback) callback(err);
                }
                else {
                    // All undefined categories become mystery category!
                    _.each(csvObject, o => {
                        if (!_.isNumber(o.flowId)) { o.flowId = 0; }
                    });
                    categoryMap = csvObject;
                    if (callback) callback();
                    isInitialized = true;
                }
            });
        }
    });
}

function _pickFlowCategoryForTransaction(tx) {

    if (!isInitialized) {
        console.log("*** WARNING: CATEGORY PICKER WAS NOT INITIALIZED BEFORE CALLING PICKCATEGORY()");
        return;
    }

    let a = accountForTransaction(tx, accounts);
    if (_.isUndefined(a)) {
        console.log("WARNING no account found for transaction");
        console.log(tx.item_id + ',' + tx.account_id + ',' + tx.masterAccountId);
        return -1; // this is some sort of mutant, zombie walking dead transaction from an account that's been removed.
    }

    // console.log(a.type);
    // let accountType = a.type.toLowerCase();
    let accountSubtype = a.subtype.toLowerCase();
    let accountIsCreditCard = (accountSubtype == 'credit card');

    let nameLower = tx.name.toLowerCase();
    let nameUpper = tx.name.toUpperCase();
    let amountIsNegative = tx.amount < 0;
    let amountIsPositive = tx.amount > 0;

    // TRANSFERS = 100
    if (nameLower.includes('transfer')) return 100;
    if (nameLower.includes('qapital inc')) return 100;
    if (nameLower.includes('e*trade des:ach trnsfr')) return 100;
    if (nameLower.includes('baird des:credit')) return 100;
    if (nameLower.includes('wealthfront inc')) return 100;

    // TRANSFERS::Credit Card Payments = 101
    // Positive amounts on cc accounts are payments
    if (accountIsCreditCard && tx.category_id == 21005000 && nameUpper.includes('PAYMENT')) return 101;
    if (nameUpper.startsWith('CAPITAL ONE') && tx.category_id == 16000000 && !amountIsNegative) return 101;
    if (nameUpper.startsWith('AMEX EPAYMENT') && tx.category_id == 16000000 && !amountIsNegative) return 101;
    if (nameUpper.startsWith('CITI CARD ONLINEWITHDRAWLPAYMENT') && !amountIsNegative) return 101;

    // REGULAR INCOME = 200
    if (nameLower.startsWith('sequoia one peo') && amountIsNegative) return 200;
    if (nameLower.includes(' peo ') && amountIsNegative) return 200;

    // REFUNDS = 300
    if (nameLower.includes('bill.com') && amountIsNegative) return 300;
    if (nameLower.includes('return of') && amountIsNegative) return 300;
    if (nameLower.includes('returned') && amountIsNegative) return 300;
    if (nameLower.includes('expensify') && amountIsNegative) return 300;
    if (tx.category_id == 19000000 && amountIsNegative) return 300; // Category is 'Shops' and money is incoming
    if (accountIsCreditCard && amountIsNegative) return 300; // refunds to credit cards

    // UNIDENTIFIED DEPOSITS = 400
    if (nameLower.includes('venmo') && amountIsNegative && !accountIsCreditCard) return 400;

    // SHOPPING = 1000
    if (nameUpper.includes('AMAZON')) return 1000;
    if (nameUpper.includes('NEOMODERN')) return 1000;
    if (nameUpper.includes('BOOKSTORE')) return 1000; // e.g. THE USC BOOKSTORE
    if (nameUpper.includes('CHRISTMAS TREE LOT')) return 1000; // e.g. The Guardsmen Christmas Tree Lot

    // FAMILY & FRIENDS = 2000
    if (nameUpper.includes(' PAWS ')) return 2000; // 🐾
    if (nameUpper.includes('NATIONWIDE PET INS') && tx.category_id == 18030000) return 2000; // Pet insurance
    if (nameUpper.includes('PETPLAN USA')) return 2000; // Pet insurance
    if (nameUpper.includes('DOGS ALL DAY') && tx.category_id == 18000000) return 2000; // Waffles' doggy day care in charlotte
    if (nameUpper.includes('DOG GROOMING')) return 2000;

    // HEALTH & FITNESS = 3000
    if (nameUpper.includes('INTERNATIONAL ORANGE')) return 3000;
    if (nameUpper.includes('THE CLINIC')) return 3000;
    if (nameUpper.includes('ONE MED')) return 3000;
    if (nameUpper.includes(' D.O. ')) return 3000; // CURTIS P. ROSS D.O. 02/20 PURCHASE

    // AT HOME, DOMESTIC, HOUSEHOLD = 4000
    if (nameUpper.includes(' RENT ') && tx.category_id != '22005000' && amountIsPositive) return 4000; // Careful about car rental && transfers with the word 'RENT' in them
    if (nameUpper.includes(' MORTGAGE ') && amountIsPositive) return 4000; // careful about transfers with word 'MORTGAGE' in them
    if (nameUpper.includes('CREDITSECURE')) return 4000; // Treat credit monitoring as essential
    if (nameUpper.includes('REAL ESTATE') && tx.category_id == '21003000') return 4000; // e.g. Gaetani Real Estate Bill Payment
    if (nameUpper.includes('GARMENT') && tx.category_id == '18045000') return 4000; // e.g. Mulberry's Garment
    if (nameUpper.includes('CLEANER') && tx.category_id == '18045000') return 4000; // e.g. Greenstreets Cleaner
    if (nameUpper.includes('CLEANLY') && tx.category_id == '18045000') return 4000;
    if (nameUpper.includes('RINSE') && tx.category_id == '18045000') return 4000;
    if (nameUpper.includes('FRAMEBRIDGE')) return 4000;
    if (nameUpper.includes('AUDIBLE')) return 4000;
    if (nameUpper.includes('U.S. POST OFFICE')) return 4000;
    if (nameUpper.includes('NEWSPAPER')) return 4000; // e.g. THE ECONOMIST NEWSPAPER
    if (nameUpper.includes('NEST LABS')) return 4000;
    if (nameUpper.includes('SIRIUS RADIO')) return 4000;
    if (nameUpper.includes('KQED INC')) return 4000;

    // ON THE TOWN = 5000
    if (nameLower.includes('caviar gosq.com') && tx.category_id == 21010003) return 5000; // Caviar processes with Square
    if (nameLower.includes('lucky dog bark and brew')) return 5000; // Lizzy bar in charlotte
    if (nameUpper.includes('GOTTS ROADSIDE')) return 5000;
    if (nameUpper.includes('CLUB NAUTIQUE')) return 5000;
    if (nameUpper.includes('ROY RODGERS')) return 5000;
    if (nameUpper.includes('SOHO HOUSE')) return 5000;

    // TRANSPO = 6000
    if (nameUpper.includes('BMWFINANCIAL SVS') && tx.category_id == 18020004) return 6000; // Transpo - Lauren's car payment
    if (nameUpper.includes('DMV') && tx.category_id == 12009000) return 6000; // Car registration
    if (nameUpper.includes('ALLSTATE') && tx.category_id == 18030000) return 6000; // Could also be other type of insurance
    if (nameUpper.includes('GEICO') && tx.category_id == 18030000) return 6000;

    // TRAVEL = 7000
    if (nameUpper.includes('AIRLINES')) return 7000;
    if (nameLower.includes('allianztravelinsurance')) return 7000;
    if (nameLower.includes('gogoair')) return 7000;
    if (nameUpper.includes('RITZCARLTON')) return 7000;
    if (nameUpper.includes('INFLIGHT WIFI')) return 7000; // SWA INFLIGHT WIFI
    if (nameUpper.includes('AIRBNB')) return 7000; // 

    // BIOHAZARD = 8000
    // 

    // CAREER & PROFESSIONAL = 9000
    if (nameUpper.includes('REALTOR ASSOCIATION')) return 9000; // Lizzy professional association
    if (nameUpper.includes('LINKEDIN')) return 9000;
    if (nameUpper.includes('DOMAIN') && tx.category_id == 18000000) return 9000;
    if (nameUpper.includes('GOLDENFROGI')) return 9000;

    // FALL-THROUGH
    // look up the transaction in the categoryMap
    let newCatObj = _.find(categoryMap, o => o.plaidId == tx.category_id);
    // console.log(JSON.stringify(newCatObj));
    if (_.isUndefined(newCatObj)) {
        return 0; // Mystery money
    }
    else {
        return newCatObj.flowId;
    }
}

function accountForTransaction(tx, accounts) {
    return _.find(accounts, A => A.masterAccountId == tx.masterAccountId);
}

function _fioCatToIndex(cat) {

    switch (true) {

        case (cat < 1000):
            return 0;

        case (cat < 2000):
            return 1;

        case (cat < 3000):
            return 2;

        case (cat < 4000):
            return 3;

        case (cat < 5000):
            return 4;

        case (cat < 6000):
            return 5;

        case (cat < 7000):
            return 6;

        case (cat < 8000):
            return 7;

        case (cat < 9000):
            return 8;

        case (cat < 10000):
            return 9;

        default:
            return 0;
    }
}

function _buildCategorySummary(transactions) {

    // Filter out transactions prior to days to lookback
    let startDateM = moment().subtract(daysToLookbackForCategorySummarization, 'days');
    let transactionsSinceLookbackCutoff = _.filter(transactions, tx => {
        return moment(tx.date).isAfter(startDateM);
    });
    // console.log((transactions.length - transactionsSinceLookbackCutoff.length) + ' older transactions removed from transaction set.');

    // filter out transfers
    let nonTransferTransactions = _.filter(transactionsSinceLookbackCutoff, tx => {
        return !q_tx.transactionIsRecognizedTransferOrRefund(tx);
    });
    // console.log((transactionsSinceLookbackCutoff.length - nonTransferTransactions.length) + ' transfers removed from transaction set.');

    var catSums = _.fill(Array(10), 0);
    var tids = new Array(10);
    tids = _.map(tids, itm => new Array(0));

    _.each(nonTransferTransactions, tx => {
        if (tx.amount > 0) {
            // console.log(tx.category_id + " - " + tx.category);
            let idx = _fioCatToIndex(tx.fioCategoryId);
            catSums[idx] += tx.amount;
            tids[idx].push(tx.transaction_id);
        }
    });

    let out = {
        amounts: _.chain(catSums).map(itm => _.round(itm, 2)).toArray().value(),
        tids: tids,
        lookbackDayCount: daysToLookbackForCategorySummarization,
        startDate: moment().subtract(daysToLookbackForCategorySummarization, 'days').format('YYYY-MM-DD'),
        endDate: moment().subtract(1, 'day').format('YYYY-MM-DD'),
        names: [
            'Mystery',
            'Shopping',
            'Family & Friends',
            'Health & Wellness',
            'At Home',
            'On the Town',
            'Transportation',
            'Travel',
            'Biohazard',
            'Career & Professional'
        ],
        descriptions: [

            // Mystery
            "Quanta cannot determine which category these transactions belong in.",

            // Shopping
            "General shopping is included here.",

            // Family & Friends
            "Everything that goes into taking care of your family, your friends, and your pets.",

            // Health & Wellness
            "Everything that goes into taking care of your health and overall wellbeing. Like gyms, doctors, yoga, and eyeglasses. Hair and nail maintenance goes here too.",

            // At Home
            "Household stuff, furniture, housekeeping, entertainment services like Netflix, Hulu, and HBO. Professional services like tax preparation goes here as well.",

            //"On the Town"
            "All your spending around going out. Eating, drinking, concert tickets, and the like.",

            // "Transportation"
            "Getting around in every sense. Car payment, registration & insurance, parking, Uber, Lyft, taxis, public transit, and the like.",

            // "Travel"
            "You're going places, this is where you see how much it costs. Plane tickets and hotels are the main things that land here.",

            // "Biohazard"
            "Oh sh!z this money is hazardous to health! Fines, fees, citations, interest -- might as well throw this cash into an incinerator.",

            // "Professional & Career"
            "Everything related to making your professional life go. Like conferences & courses."
        ]
    };

    out.total = _.reduce(out.amounts, (m, i) => m + i);
    out.percentages = _.map(out.amounts, amt => q_obj.percentage(amt / out.total));

    return out;
}
