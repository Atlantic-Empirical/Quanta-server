// FIO-AWS-SQS

'use strict';
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
const _ = require('lodash');

module.exports = {

    sendMessage: (body, attributes, queueURL, callback) => _sendMessage(body, attributes, queueURL, callback),
    postMessagesForTransactionIngest: (userId, item_id, institution_id, transactions) =>
        _postMessagesForTransactionIngest(userId, item_id, institution_id, transactions),
    deleteMessage: (queueURL, receiptHandle, callback) => sqs.deleteMessage({ ReceiptHandle: receiptHandle, QueueUrl: queueURL }, callback),

};

function _sendMessage(body, queueURL, attributes, callback) {

    let msg = {
        MessageBody: JSON.stringify(body),
        QueueUrl: queueURL
    };

    if (!_.isUndefined(attributes))
        msg.MessageAttributes = attributes;

    // console.log('sqs message: ' + JSON.stringify(msg));

    sqs.sendMessage(msg, function(err, data) {
        if (err) console.log('_sendMessage error:\n' + JSON.stringify(err, null, 2));
        if (!_.isUndefined(callback))
            callback(err, data);
    });
}

function _postMessagesForTransactionIngest(userId, item_id, institution_id, transactions) {
    // NOTE!
    // Chunk the transactions to a size acceptable by SQS && Lambda
    // Message must be shorter than 262144 bytes for SQS and 128kb for Lambda Invocation. 
    // SQS limits: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-limits.html
    // Lambda limits: https://docs.aws.amazon.com/lambda/latest/dg/limits.html
    // Transaction is around 1,200 characters
    let chunkSize = 90;
    let transactionChunks = _.chunk(transactions, chunkSize);
    let queueURL = 'https://sqs.us-east-1.amazonaws.com/475512417340/FIO-Queue-Transactions-ToIngest';
    let messageAttributes = {
        "item_id": {
            DataType: "String",
            StringValue: item_id
        },
        "institution_id": {
            DataType: "String",
            StringValue: institution_id
        },
        "userId": {
            DataType: "String",
            StringValue: userId
        }
    };

    _.each(transactionChunks, C => _sendMessage(C, queueURL, messageAttributes));
}
