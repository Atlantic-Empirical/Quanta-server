'use strict';
//
//  QIO-Lambda-ASDS-User-Subscription-ReceiptValidate()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId & .receipt
//  Output: 
//
//  Reference:
//   https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ValidateRemotely.html
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const _async = require('async');
const https = require('https');

// Document
//   https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ValidateRemotely.html

const appStoreSharedSecret = "14c1bd0da30a47faa036286f7083fbf5";
const verifyReceiptURLHost_sandbox = "sandbox.itunes.apple.com";
const verifyReceiptURLHost = "buy.itunes.apple.com";
const verifyReceiptURLPath = "/verifyReceipt";
const expectedBundleId = "app.flow.FlowiOS";
const expectedProductId = "app.Flow.QuantaMonthly";

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    _async.auto({
            extract_metadata: cb => {
                if (_.isUndefined(event.userId)) cb('user context is required');
                else if (_.isUndefined(event.receipt)) cb('receipt is required');
                else cb(null, { userId: event.userId, receipt: event.receipt });
            },
            verify_receipt: ['extract_metadata', (results, cb) => {
                verifyReceipt(results.extract_metadata.receipt, true, (err, res) => {
                    if (err) {
                        if (err.needsSandboxEnv) {
                            console.log('Switching to SANDBOX environment.');
                            verifyReceipt(results.extract_metadata.receipt, false, cb);
                        }
                        else if (res.status == 21006) cb(res); // See status code reference below.
                        else cb(err);
                    }
                    else cb(null, res);
                });
            }],
            process_response: ['verify_receipt', (results, cb) => {
                let response = results.verify_receipt;
                // console.log("RESPONSE FROM RECEIPTVERIFY =\n" + JSON.stringify(response, null, 2));

                // STATUS CHECK
                if (response.status != 0 && response.status != 21006) {
                    cb('Bad status reply from Apple: ' + response.status);
                    return;
                }

                // RECEIPT NULL CHECK
                if (_.isUndefined(response.receipt)) {
                    cb('Receipt is null');
                    return;
                }

                // BUNDLE ID CHECK
                if (!_.isUndefined(response.receipt.bid)) {
                    response.receipt.bundle_id = response.receipt.bid;
                }
                if (response.receipt.bundle_id != expectedBundleId) {
                    cb('Bundle id mismatch.');
                    return;
                }

                // latest_receipt_info CHECK
                // GRAB THE LATEST latest_receipt_info
                var latestReceiptInfo;
                if (_.isUndefined(response.latest_receipt_info) || _.isEmpty(response.latest_receipt_info)) {
                    if (_.isUndefined(response.latest_expired_receipt_info) || _.isEmpty(response.latest_expired_receipt_info)) {
                        cb('Receipt does not include latest_receipt_info.');
                        return;
                    }
                    else {
                        // Using latest_expired_receipt_info
                        if (_.isArray(response.latest_expired_receipt_info))
                            latestReceiptInfo = _.chain(response.latest_expired_receipt_info).orderBy('purchase_date_ms', 'desc').first().value();
                        else
                            latestReceiptInfo = response.latest_expired_receipt_info;
                    }
                }
                else {
                    // Using latest_receipt_info
                    if (_.isArray(response.latest_receipt_info))
                        latestReceiptInfo = _.chain(response.latest_receipt_info).orderBy('purchase_date_ms', 'desc').first().value();
                    else
                        latestReceiptInfo = response.latest_receipt_info;
                }

                // PRODUCT ID CHECK
                if (latestReceiptInfo.product_id != expectedProductId) {
                    cb('Unmatched productId.');
                    return;
                }

                // GRAB pending_renewal_info
                var pendingRenewalInfo = {};
                if (!_.isUndefined(response.pending_renewal_info))
                    if (_.isArray(response.pending_renewal_info))
                        pendingRenewalInfo = _.first(response.pending_renewal_info);
                    else
                        pendingRenewalInfo = response.pending_renewal_info;
                else
                if (!_.isUndefined(response.auto_renew_status))
                    pendingRenewalInfo.auto_renew_status = response.auto_renew_status;

                if (!isNaN(latestReceiptInfo.expires_date)) {
                    latestReceiptInfo.expires_date_ms = latestReceiptInfo.expires_date;
                    delete latestReceiptInfo.expires_date;
                }

                // BUILD OUTPUT FOR FURTHER PROCESSING
                var out = {
                    latest_receipt_b64: response.latest_receipt,
                    originalTransactionDateSec: _.round(latestReceiptInfo.original_purchase_date_ms / 1000, 0),
                    latestTransactionDateSec: _.round(latestReceiptInfo.purchase_date_ms / 1000, 0),
                    expiresDateSec: _.round(latestReceiptInfo.expires_date_ms / 1000, 0),
                    environment: response.environmentIsProd ? "PROD" : "SANDBOX"
                };
                _.assign(out, pendingRenewalInfo, latestReceiptInfo);

                // Conform to Quanta Platform Standards
                if (_.isUndefined(out.expires_date_formatted)) {
                    out.expires_date_formatted = out.expires_date;
                    delete out.expires_date;
                }

                if (_.isUndefined(out.expires_date_formatted_pst)) {
                    out.expires_date_formatted_pst = latestReceiptInfo.expires_date_pst;
                    delete out.expires_date_pst;
                }

                out.bundle_id = response.receipt.bundle_id;
                out.application_version = response.receipt.application_version;

                // Done!
                // console.log('Built Output:\n' + JSON.stringify(out, null, 2));
                cb(null, out);
            }],
            build_client_object: ['process_response', (results, cb) => {
                let o = results.process_response;
                let clientObject = {
                    is_trial_period: o.is_trial_period,
                    originalTransactionDateSec: o.originalTransactionDateSec,
                    expiresDateSec: o.expiresDateSec,
                    latestTransactionDateSec: o.latestTransactionDateSec,
                    auto_renew_status: o.auto_renew_status,
                    expires_date_formatted_pst: o.expires_date_formatted_pst
                };
                // Optionals
                if (!_.isUndefined(o.is_in_billing_retry_period)) clientObject.is_in_billing_retry_period = o.is_in_billing_retry_period;
                if (!_.isUndefined(o.expiration_intent)) clientObject.expiration_intent = o.expiration_intent;
                cb(null, clientObject);
            }],
            persist_user_subscription_state: ['process_response', 'extract_metadata', (results, cb) => {
                var o = results.process_response;
                o.userId = results.extract_metadata.userId;
                persistSubscriptionObject(o, cb);
            }],
        },
        (err, results) => {
            if (err) console.log(err);
            callback(err, results.build_client_object);
        }
    );
});

function persistSubscriptionObject(object, callback) {

    let isOriginal = object.original_transaction_id == object.transaction_id;
    object.objectTypeId = 6;

    // console.log("PERSIST OBJECT =\n" + JSON.stringify(object, null, 2));

    if (isOriginal) {
        // PUT IT
        //  Note: this will also overwrite any existing promoCode status (promoGrantUntilTimestamp & promoCode)
        console.log('IS INITIAL RECEIPT SO PUTTING TO TABLE');
        object.createdTimestamp = Date.now();
        let params = {
            TableName: process.env.TABLE_DETAILS || 'FIO-Table-User-Details',
            Item: AWS.DynamoDB.Converter.marshall(object)
        };
        ddb.putItem(params, callback);
    }
    else {
        // UPDATE IT
        console.log('IS NOT INITIAL RECEIPT SO UPDATING THE RECORD');

        var updateExpression = [];

        updateExpression.push("updatedTimestamp = :timestamp");

        updateExpression.push("transaction_id = :transaction_id");
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
        if (!_.isUndefined(object.latest_receipt_b64))
            updateExpression.push("latest_receipt_b64 = :latest_receipt_b64");

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
        if (!_.isUndefined(object.latest_receipt_b64))
            expressionAttributeValues[":latest_receipt_b64"] = AWS.DynamoDB.Converter.input(object.latest_receipt_b64);
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
                    console.log("Did not update the record because the condition didn't pass.\nMeans there either is NO subscription object in the table OR\nthe subscription object in the table has a later expires date than this receipt.");
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

function verifyReceipt(receiptB64, prodEnv, callback) {

    verifyReceipt_inner(receiptB64, prodEnv).then(

        // On Resolve
        (arg) => {
            // console.log('result with ' + arg);
            let obj = JSON.parse(arg);
            obj.environmentIsProd = prodEnv;
            if (obj.status == 21007) callback({ needsSandboxEnv: true }); // Should be sent to sandbox env
            else callback(null, obj);
        },

        // On Reject
        (arg) => {
            console.log('rejected with ' + arg);
            callback(arg);
        }
    );
}

function verifyReceipt_inner(receipt, inProd) {

    let useHost = inProd ? verifyReceiptURLHost : verifyReceiptURLHost_sandbox;

    return new Promise(

        (resolve, reject) => {

            let data = {
                'receipt-data': receipt,
                'password': appStoreSharedSecret,
            };

            let dataEncoded = JSON.stringify(data);

            let req = https.request({
                    host: useHost,
                    port: 443,
                    path: verifyReceiptURLPath,
                    method: 'POST',
                    headers: {
                        'Content-Length': Buffer.byteLength(dataEncoded),
                        'Content-Type': 'application/json',
                    },
                },
                res => {
                    let buffers = [];
                    res.on('error', reject);
                    res.on('data', buffer => buffers.push(buffer));
                    res.on('end', () =>
                        res.statusCode === 200 ?
                        resolve(Buffer.concat(buffers)) :
                        reject(Buffer.concat(buffers))
                    );
                }
            );
            req.write(dataEncoded);
            req.end();
        }
    );
}

// Status Code / Description

// 21000
// The App Store could not read the JSON object you provided.

// 21002
// The data in the receipt-data property was malformed or missing.

// 21003
// The receipt could not be authenticated.

// 21004
// The shared secret you provided does not match the shared secret on file for your account.

// 21005
// The receipt server is not currently available.

// 21006
// This receipt is valid but the subscription has expired. When this status code is returned to your server, the receipt data is also 
// decoded and returned as part of the response. Only returned for iOS 6 style transaction receipts for auto-renewable subscriptions.

// 21007
// This receipt is from the test environment, but it was sent to the production environment for verification. Send it to the test 
// environment instead.

// 21008
// This receipt is from the production environment, but it was sent to the test environment for verification. Send it to the production 
// environment instead.

// 21010
// This receipt could not be authorized. Treat this the same as if a purchase was never made.

// 21100-21199
// Internal data access error.


// Sample Verify Response
//
// {
//   "status": 0,
//   "environment": "Sandbox",
//   "receipt": {
//     "receipt_type": "ProductionSandbox",
//     "adam_id": 0,
//     "app_item_id": 0,
//     "bundle_id": "app.flow.FlowiOS",
//     "application_version": "11",
//     "download_id": 0,
//     "version_external_identifier": 0,
//     "receipt_creation_date": "2019-01-31 02:20:27 Etc/GMT",
//     "receipt_creation_date_ms": "1548901227000",
//     "receipt_creation_date_pst": "2019-01-30 18:20:27 America/Los_Angeles",
//     "request_date": "2019-01-31 20:27:13 Etc/GMT",
//     "request_date_ms": "1548966433010",
//     "request_date_pst": "2019-01-31 12:27:13 America/Los_Angeles",
//     "original_purchase_date": "2013-08-01 07:00:00 Etc/GMT",
//     "original_purchase_date_ms": "1375340400000",
//     "original_purchase_date_pst": "2013-08-01 00:00:00 America/Los_Angeles",
//     "original_application_version": "1.0",
//     "in_app": [
//       {
//         "quantity": "1",
//         "product_id": "app.Flow.QuantaMonthly",
//         "transaction_id": "1000000498874200",
//         "original_transaction_id": "1000000498874200",
//         "purchase_date": "2019-01-31 02:20:25 Etc/GMT",
//         "purchase_date_ms": "1548901225000",
//         "purchase_date_pst": "2019-01-30 18:20:25 America/Los_Angeles",
//         "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//         "original_purchase_date_ms": "1548901226000",
//         "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//         "expires_date": "2019-01-31 02:24:25 Etc/GMT",
//         "expires_date_ms": "1548901465000",
//         "expires_date_pst": "2019-01-30 18:24:25 America/Los_Angeles",
//         "web_order_line_item_id": "1000000042505606",
//         "is_trial_period": "true",
//         "is_in_intro_offer_period": "false"
//       }
//     ]
//   },
//   "latest_receipt_info": [
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498874200",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:20:25 Etc/GMT",
//       "purchase_date_ms": "1548901225000",
//       "purchase_date_pst": "2019-01-30 18:20:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:24:25 Etc/GMT",
//       "expires_date_ms": "1548901465000",
//       "expires_date_pst": "2019-01-30 18:24:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505606",
//       "is_trial_period": "true",
//       "is_in_intro_offer_period": "false"
//     },
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498874888",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:24:25 Etc/GMT",
//       "purchase_date_ms": "1548901465000",
//       "purchase_date_pst": "2019-01-30 18:24:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:29:25 Etc/GMT",
//       "expires_date_ms": "1548901765000",
//       "expires_date_pst": "2019-01-30 18:29:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505607",
//       "is_trial_period": "false",
//       "is_in_intro_offer_period": "false"
//     },
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498876350",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:29:25 Etc/GMT",
//       "purchase_date_ms": "1548901765000",
//       "purchase_date_pst": "2019-01-30 18:29:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:34:25 Etc/GMT",
//       "expires_date_ms": "1548902065000",
//       "expires_date_pst": "2019-01-30 18:34:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505649",
//       "is_trial_period": "false",
//       "is_in_intro_offer_period": "false"
//     },
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498877136",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:34:25 Etc/GMT",
//       "purchase_date_ms": "1548902065000",
//       "purchase_date_pst": "2019-01-30 18:34:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:39:25 Etc/GMT",
//       "expires_date_ms": "1548902365000",
//       "expires_date_pst": "2019-01-30 18:39:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505726",
//       "is_trial_period": "false",
//       "is_in_intro_offer_period": "false"
//     },
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498877786",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:39:25 Etc/GMT",
//       "purchase_date_ms": "1548902365000",
//       "purchase_date_pst": "2019-01-30 18:39:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:44:25 Etc/GMT",
//       "expires_date_ms": "1548902665000",
//       "expires_date_pst": "2019-01-30 18:44:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505791",
//       "is_trial_period": "false",
//       "is_in_intro_offer_period": "false"
//     },
//     {
//       "quantity": "1",
//       "product_id": "app.Flow.QuantaMonthly",
//       "transaction_id": "1000000498878483",
//       "original_transaction_id": "1000000498874200",
//       "purchase_date": "2019-01-31 02:44:25 Etc/GMT",
//       "purchase_date_ms": "1548902665000",
//       "purchase_date_pst": "2019-01-30 18:44:25 America/Los_Angeles",
//       "original_purchase_date": "2019-01-31 02:20:26 Etc/GMT",
//       "original_purchase_date_ms": "1548901226000",
//       "original_purchase_date_pst": "2019-01-30 18:20:26 America/Los_Angeles",
//       "expires_date": "2019-01-31 02:49:25 Etc/GMT",
//       "expires_date_ms": "1548902965000",
//       "expires_date_pst": "2019-01-30 18:49:25 America/Los_Angeles",
//       "web_order_line_item_id": "1000000042505850",
//       "is_trial_period": "false",
//       "is_in_intro_offer_period": "false"
//     }
//   ],
//   "latest_receipt": "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",
//   "pending_renewal_info": [
//     {
//       "expiration_intent": "1",
//       "auto_renew_product_id": "app.Flow.QuantaMonthly",
//       "original_transaction_id": "1000000498874200",
//       "is_in_billing_retry_period": "0",
//       "product_id": "app.Flow.QuantaMonthly",
//       "auto_renew_status": "0"
//     }
//   ]
// }

// SCRAP

// // Ok, we're good now.
// let in_apps = _.orderBy(response.receipt.in_app, 'expires_date', 'desc');
// cb(null, _.first(in_apps)); // Send the one with the latest expires date onward

// Other stuff available here...

// // LATEST RECEIPT
// //   This is the latest base-64 encoded app receipt
// if (!_.isUndefined(response.latest_receipt)) {
//     console.log('latest_receipt');
//     // console.log(JSON.stringify(response.latest_receipt, null, 2));
// }

// // LATEST RECEIPT INFO
// //   The value of this key is an array containing all in-app purchase transactions. 
// //   This excludes transactions for a consumable product that have been marked as finished by your app.
// if (!_.isUndefined(response.latest_receipt_info)) {
//     console.log('latest_receipt_info');
//     // console.log(JSON.stringify(response.latest_receipt_info, null, 2));
// }

// // LATEST EXPIRED RECEIPT INFO
// //   The JSON representation of the receipt for the expired subscription.
// if (!_.isUndefined(response.latest_expired_receipt_info)) {
//     console.log('latest_expired_receipt_info');
//     // console.log(JSON.stringify(response.latest_expired_receipt_info, null, 2));
// }

// // PENDING RENEWAL INFO
// //   In the JSON file, the value of this key is an array where each element contains the pending renewal information for 
// //   each auto-renewable subscription identified by the Product Identifier. A pending renewal may refer to a renewal that is
// //   scheduled in the future or a renewal that failed in the past for some reason.
// if (!_.isUndefined(response.pending_renewal_info)) {
//     console.log('pending_renewal_info');
//     // console.log(JSON.stringify(response.pending_renewal_info, null, 2));
// }

// // RETRYABLE
// if (!_.isUndefined(response['is-retryable'])) {
//     // console.log('is-retryable = ' + response['is-retryable']);
// }
