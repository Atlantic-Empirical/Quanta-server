'use strict';
// FIO-Lambda-Dev-ScratchPad

const _ = require("lodash");
const _async = require("async");
const qlib = require("./QuantaLib/FIO-QuantaLib");
const qplaid = require("./QuantaPlaid/FIO-Plaid");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {

    let tx = {
        "account_id": "66jKnKpeXaFRJ47Yd0dKsYZPAPaaKLiaOMJ3B",
        "amount": -5096.35,
        "category": [
            "Transfer",
            "Deposit"
        ],
        "category_id": "21007000",
        "date": "2019-03-29",
        "fioCategoryId": 200,
        "insertTimestamp": 1553994836850,
        "institution_id": "ins_7",
        "iso_currency_code": "USD",
        "item_id": "OgdnJnzypDf3Z7enK5KzSLBJRNpaj7C8zaM9M",
        "masterAccountId": "d5149d99-0951-4a53-94c5-04edf1ba9443",
        "name": "C5739 NATIONSWEL DIR DEP ***********",
        "pending": true,
        "transaction_id": "7LrkpkexXdFmJkbeOvkpupAyVZ7B3ptQN0rZY",
        "transaction_type": "special",
        "userId": "us-east-1:9f443cd6-c450-4844-b331-f509117c02a2"
    };
    qlib.persist.persistUserTransactionCategory("us-east-1:9f443cd6-c450-4844-b331-f509117c02a2", tx, callback);
});
