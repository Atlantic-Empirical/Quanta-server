'use strict';
//
//  QIO-Lambda-HookHandler-AppleSubscription()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input:
//      https://help.apple.com/app-store-connect/#/dev0067a330b
//      https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/StoreKitGuide/Chapters/Subscriptions.html#//apple_ref/doc/uid/TP40008267-CH7-SW6
//  Output: 
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isNil(event.body) || _.isEmpty(event.body)) {
        qlib.log.investigateFurther('Apple hook is empty.', context.functionName);
        callback(null, { statusCode: 200 });
    }
    else {
        let hookObj = JSON.parse(event.body);
        try {
            smsTpf(hookObj);
            qlib.log.interesting(hookObj, context.functionName);
        }
        catch (e) {
            console.log(e); // not super worried about these.
        }
        processHook(hookObj, (err, res) => {
            if (err) {
                console.log('ERROR in processHook: ' + err);
                qlib.log.significantError(err, context.functionName);
            }
            callback(null, { statusCode: 200 });
        });
    }
});

function smsTpf(hookObj) {
    qlib.log.smsTpf("Got an Apple subscription hook!\n " + hookObj.environment + ": " + hookObj.notification_type);
}

function processHook(hookObj, callback) {
    console.log(JSON.stringify(hookObj, null, 2));

    if (hookObj.notification_type == "INITIAL_BUY") {
        callback(null, 'Do nothing here with initial buy hook.');
        return;
    }

    var persistObject;

    if (!_.isUndefined(hookObj.latest_receipt_info)) {
        persistObject = hookObj.latest_receipt_info;
        persistObject.latest_receipt_b64 = hookObj.latest_receipt;
    }
    else if (!_.isUndefined(hookObj.latest_expired_receipt_info)) {
        persistObject = hookObj.latest_expired_receipt_info;
        persistObject.latest_receipt_b64 = hookObj.latest_expired_receipt;
    }
    else {
        callback(null, 'receipt not found in hook');
        return;
    }

    persistObject.auto_renew_status = hookObj.auto_renew_status;
    persistObject.environment = hookObj.environment.toUpperCase();

    // CONFORM ENVIRONMENTAL DIFFERENCES
    if (persistObject.environment == "PROD") {

        persistObject.expires_date_ms = persistObject.expires_date;
        delete persistObject.expires_date;

        persistObject.bundle_id = persistObject.bid;
        delete persistObject.bid;

        persistObject.application_version = persistObject.bvrs;
        delete persistObject.bvrs;

    }
    else if (persistObject.environment == "SANDBOX") {

        persistObject.expires_date_ms = persistObject.expires_date;
        delete persistObject.expires_date;

        persistObject.bundle_id = persistObject.bid;
        delete persistObject.bid;

        persistObject.application_version = persistObject.bvrs;
        delete persistObject.bvrs;
    }

    persistObject.latestTransactionDateSec = persistObject.purchase_date_ms / 1000;
    persistObject.expiresDateSec = persistObject.expires_date_ms / 1000;

    qlib.ddb.query('FIO-Table-User-Details', 'original_transaction_id', persistObject.original_transaction_id,
        (err, res) => {
            if (err) callback(err);
            else {
                persistObject.userId = res.userId;
                persistSubscriptionObject(persistObject, callback);
            }
        },
        'original_transaction_id-userId-index', 'userId', 1
    );
}

function persistSubscriptionObject(object, callback) {

    let isOriginal = object.original_transaction_id == object.transaction_id;
    object.objectTypeId = 6;

    console.log("PERSIST OBJECT =\n" + JSON.stringify(object, null, 2));

    if (isOriginal) {
        console.log('IS ORIGINAL TRANSACTION -- NOT DOING ANYTHING');
        callback();
    }
    else {
        // UPDATE IT
        console.log('IS NOT ORIGINAL -- UPDATING');

        var updateExpression = [];

        updateExpression.push("updatedTimestamp = :timestamp");

        updateExpression.push("transaction_id = :transaction_id");
        updateExpression.push("latest_receipt_b64 = :latest_receipt_b64");
        updateExpression.push("latestTransactionDateSec = :latestTransactionDateSec");

        updateExpression.push("expires_date_formatted_pst = :expires_date_formatted_pst");
        updateExpression.push("expires_date_formatted = :expires_date_formatted");
        updateExpression.push("expires_date_ms = :expires_date_ms");
        updateExpression.push("expiresDateSec = :expiresDateSec");

        updateExpression.push("purchase_date_ms = :purchase_date_ms");
        updateExpression.push("purchase_date_pst = :purchase_date_pst");
        updateExpression.push("purchase_date = :purchase_date");

        updateExpression.push("is_trial_period = :is_trial_period");
        updateExpression.push("auto_renew_status = :auto_renew_status");
        updateExpression.push("is_in_intro_offer_period = :is_in_intro_offer_period");

        // Optionals
        if (!_.isUndefined(object.expiration_intent))
            updateExpression.push("expiration_intent = :expiration_intent");

        if (!_.isUndefined(object.is_in_billing_retry_period))
            updateExpression.push("is_in_billing_retry_period = :is_in_billing_retry_period");

        // Final Update Expression
        updateExpression = "SET " + _.chain(updateExpression).join(", ").trimEnd(", ");
        console.log(updateExpression);

        // BUILD EXPRESSION ATTRIBUTE VALUES
        var expressionAttributeValues = {

            ":timestamp": AWS.DynamoDB.Converter.input(Date.now()),

            ":transaction_id": AWS.DynamoDB.Converter.input(object.transaction_id),
            ":latest_receipt_b64": AWS.DynamoDB.Converter.input(object.latest_receipt_b64),
            ":latestTransactionDateSec": AWS.DynamoDB.Converter.input(object.latestTransactionDateSec),

            ":expires_date_formatted_pst": AWS.DynamoDB.Converter.input(object.expires_date_formatted_pst),
            ":expires_date_formatted": AWS.DynamoDB.Converter.input(object.expires_date_formatted),
            ":expires_date_ms": AWS.DynamoDB.Converter.input(object.expires_date_ms),
            ":expiresDateSec": AWS.DynamoDB.Converter.input(object.expiresDateSec),

            ":purchase_date_ms": AWS.DynamoDB.Converter.input(object.purchase_date_ms),
            ":purchase_date_pst": AWS.DynamoDB.Converter.input(object.purchase_date_pst),
            ":purchase_date": AWS.DynamoDB.Converter.input(object.purchase_date),

            ":is_trial_period": AWS.DynamoDB.Converter.input(object.is_trial_period),
            ":auto_renew_status": AWS.DynamoDB.Converter.input(object.auto_renew_status),
            ":is_in_intro_offer_period": AWS.DynamoDB.Converter.input(object.is_in_intro_offer_period),
        };

        // Optionals
        if (!_.isUndefined(object.expiration_intent))
            expressionAttributeValues[":expiration_intent"] = AWS.DynamoDB.Converter.input(object.expiration_intent);
        if (!_.isUndefined(object.is_in_billing_retry_period))
            expressionAttributeValues[":is_in_billing_retry_period"] = AWS.DynamoDB.Converter.input(object.is_in_billing_retry_period);

        // PARAMS
        let params = {
            TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
            ExpressionAttributeValues: expressionAttributeValues,
            Key: {
                "userId": AWS.DynamoDB.Converter.input(object.userId),
                "objectTypeId": AWS.DynamoDB.Converter.input(object.objectTypeId),
            },
            UpdateExpression: updateExpression,
            ConditionExpression: "expiresDateSec <= :expiresDateSec" // only update if the expires date is AFTER the one currently in the table.
        };
        // console.log(JSON.stringify(params, null, 2));

        // PERFORM UPDATE
        ddb.updateItem(params, (err, res) => {

            if (err) {
                if (err.code == "ConditionalCheckFailedException") {
                    console.log("Did not update the record because the condition didn't pass.\nMeans there either is NO subscription object in the table OR the subscription object in the table has an expires date equal to or later than this receipt.");
                    tryPutObjectIfItDoesntAlreadyExist(object, callback);
                }
                else callback(err);
            }
            else callback(null, res);
        });
    }
}

function tryPutObjectIfItDoesntAlreadyExist(object, callback) {
    console.log('CONDITIONAL PUT');

    object.createdTimestamp = Date.now();
    let params = {
        TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
        Item: AWS.DynamoDB.Converter.marshall(object),
        ConditionExpression: "attribute_not_exists(userId)"
    };
    ddb.putItem(params, (err, res) => {
        if (err) {
            if (err.code == "ConditionalCheckFailedException") console.log('Subscription record already exists. So did not update. User should be ready to rock.');
            else console.log(err);
        }
        callback(); // We're done here.
    });
}
