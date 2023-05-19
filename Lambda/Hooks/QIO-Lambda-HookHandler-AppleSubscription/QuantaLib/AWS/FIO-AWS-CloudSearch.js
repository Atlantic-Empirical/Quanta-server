// FIO-AWS-CloudSearch

'use strict';
const AWS = require('aws-sdk');
const cs_endpoint_transaction_search = 'doc-fio-search-transactions-vmge4ywgd6uuvttty6okffmmny.us-east-1.cloudsearch.amazonaws.com';
const csd_transactions = new AWS.CloudSearchDomain({ endpoint: cs_endpoint_transaction_search });
const _ = require('lodash');

module.exports = {

    putTransactions: (transactions, callback) => _putTransactions(transactions, callback),
    performTransactionSearch: (query, filterQuery, callback) =>
        csd_transactions.search({ query: query, filterQuery: filterQuery, sort: 'date desc' }, callback),

};

function _putTransactions(transactions, callback, fromIndex = 0) {

    var documents = [];
    var size = 0;
    var indexReached = fromIndex;

    _.takeWhile(transactions, (tx, index) => {
        if (index < fromIndex) return true; // skip this tx and continue
        let data = {
            type: 'add',
            id: tx.transaction_id,
            fields: conformTxForCloudSearch(tx)
        };
        documents.push(data);
        indexReached++;

        let str = JSON.stringify(data);
        size += str.length * 2;
        // console.log(size + ' bytes @ index ' + index);
        return size < 4990000; // leaves 10,000 bytes (5,000 characters) for anything else added to params
    });

    console.log('record count after filter: ' + documents.length);

    let params = {
        contentType: 'application/json',
        documents: JSON.stringify(documents)
    };

    // let sizeInBytes = params.documents.length * 2;
    // console.log('final size = ' + sizeInBytes + ' bytes');
    // console.log("Uploading docs to CloudSearch domain.");

    csd_transactions.uploadDocuments(params, (err, data) => {
        if (err) {
            console.log('ERROR in _putTransactions: ' + err);
            callback(err);
        }
        else {
            let msg = "Successfully processed " + documents.length + " records in this batch.";
            if (indexReached < transactions.length - 1) {
                console.log("NOTICE: " + transactions.length - (indexReached + 1) + " transactions are going in an additional batch because the size would be too much for a single batch to cloudsearch");
                _putTransactions(transactions, callback, indexReached);
            }
            else callback(null, msg);
        }
    });
}

function conformTxForCloudSearch(tx) {
    return {
        account_id: tx.account_id,
        fiocategoryid: tx.fioCategoryId,
        userid: tx.userId,
        transaction_type: tx.transaction_type,
        institution_id: tx.institution_id,
        item_id: tx.item_id,
        amount: tx.amount,
        date: tx.date,
        transaction_id: tx.transaction_id,
        name: tx.name
    };

    // // Remove fields not stored for search
    // if (!_.isUndefined(txRecord.location)) { delete txRecord.location }
    // if (!_.isUndefined(txRecord.pending)) { delete txRecord.pending }
    // if (!_.isUndefined(txRecord.account_owner)) { delete txRecord.account_owner }
    // if (!_.isUndefined(txRecord.insertTimestamp)) { delete txRecord.insertTimestamp }
    // if (!_.isUndefined(txRecord.category)) { delete txRecord.category }
    // if (!_.isUndefined(txRecord.payment_meta)) { delete txRecord.payment_meta }
    // if (!_.isUndefined(txRecord.pending_transaction_id)) { delete txRecord.pending_transaction_id }
    // if (!_.isUndefined(txRecord.iso_currency_code)) { delete txRecord.iso_currency_code }
    // if (!_.isUndefined(txRecord.masterAccountId)) { delete txRecord.masterAccountId }
    // if (!_.isString(txRecord.category_id) && !_.isNumber(txRecord.category_id)) {
    //     console.log('Bad category_id for transaction_id ' + txRecord.transaction_id);
    //     delete txRecord.category_id;
    // }
    // let out = {};
    // _.forOwn(tx, (value, key) => out[key.toLowerCase()] = value); // all the attribute names are lower case in cloudsearch
    // return out;
}

// cursor: 'STRING_VALUE',
// expr: 'STRING_VALUE',
// facet: 'STRING_VALUE',
// highlight: 'STRING_VALUE',
// partial: true || false,
// queryOptions: 'STRING_VALUE',
// queryParser: simple | structured | lucene | dismax,
// return: 'STRING_VALUE',
// size: 0,
// start: 0,
// stats: 'STRING_VALUE'
