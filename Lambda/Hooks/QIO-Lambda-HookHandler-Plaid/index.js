'use strict';
//
//  QIO-Lambda-HookHandler-Plaid()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: The webhook object from Plaid.
//  Output: Nada
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require("async");
// const qplaid = require("./QuantaPlaid/FIO-Plaid");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    var hookObj;
    if (!_.isNil(event.body)) hookObj = JSON.parse(event.body);
    else hookObj = event; // for debugging
    console.log(JSON.stringify(hookObj, null, 2));

    if (_.isNil(hookObj) || _.isEmpty(hookObj)) callback(null, { StatusCode: 418 });
    else {
        hookObj.timestamp = Date.now();
        qlib.ddb.putItem('FAC-Webhooks', hookObj);
        if (hookObj.error) {
            console.log('Plaid webhook delivered error: ' + hookObj.error);
            qlib.log.investigateFurther(hookObj, context.functionName + " - plaid delivered an error in a webhook");
            callback(null, { StatusCode: 200 });
        }
        else {
            switch (hookObj.webhook_type) {
                case "TRANSACTIONS":
                    switch (hookObj.webhook_code) {
                        case "DEFAULT_UPDATE":
                        case "HISTORICAL_UPDATE":
                        case "INITIAL_UPDATE":
                            break; // Do nothing
                        case "TRANSACTIONS_REMOVED":
                            deleteTransactions(hookObj.item_id, hookObj.removed_transactions);
                            break;
                    }
                    break;
                case 'ITEM':
                    switch (hookObj.webhook_code) {
                        case "WEBHOOK_UPDATE_ACKNOWLEDGED":
                            break;
                        case "ERROR":
                            break;
                    }
                    break;
                default:
                    console.log('unsupported webhook_type: ' + hookObj.webhook_type);
                    qlib.log.investigateFurther(hookObj, context.functionName + " - unsupported webhook_type");
            }
            callback(null, { statusCode: 200 });
        }
    }
});

function deleteTransactions(item_id, tids) {
    if (_.isNil(tids) || _.isEmpty(tids)) console.log("transactionIds are required.");
    else if (_.isNil(item_id)) console.log("item_id required.");
    else _async.auto({
            get_uid: cb => qlib.persist.pullItemUserId(item_id, cb),
            collate_tids_uids: ['get_uid', (results, cb) => {
                if (_.isNil(results.get_uid) || _.isEmpty(results.get_uid))
                    cb('No user found for item. Item was probably deleted yet were still getting hooks from Plaid: ' + item_id);
                else
                    cb(null, _.map(tids, tid => ({ transaction_id: tid, userId: results.get_uid.userId })));
            }],
            delete_transactions: ['collate_tids_uids', (results, cb) => qlib.persist.batchDeleteTransactions(results.collate_tids_uids, cb)]
        },
        (err, results) => {
            if (err) {
                let obj = {
                    err: err,
                    results: results
                };
                console.log(JSON.stringify(obj, null, 2));
                qlib.log.significantError(obj, "QIO-Lambda-HookHandler-Plaid");
            }
        }
    );
}

// Example body: "{\n \"error\": null,\n \"item_id\": \"nrJo9knlzKU4XzRDrNbpfPzp7kn3qbiP9oPlZ\",\n \"new_transactions\": 345,\n \"webhook_code\": \"HISTORICAL_UPDATE\",\n \"webhook_type\": \"TRANSACTIONS\"\n}"

// Example Incoming Webhook Objects:

// HISTORICAL: 
//
// {
//     "error": null,
//     "item_id": "VQQQwKmBEpCv66ByWE59spPBNzrDazibEQ5JX",
//     "new_transactions": 331,
//     "webhook_code": "HISTORICAL_UPDATE",
//     "webhook_type": "TRANSACTIONS"
// }

// INITIAL:
//
// {
//     "error": null,
//     "item_id": "VQQQwKmBEpCv66ByWE59spPBNzrDazibEQ5JX",
//     "new_transactions": 14,
//     "webhook_code": "INITIAL_UPDATE",
//     "webhook_type": "TRANSACTIONS"
// }
// 

// DEFAULT: 
//
// {
//     "error": null,
//     "item_id": "oby9x53KyPs9AJqJMKkACbjve5dKdztBXkqQy",
//     "new_transactions": 2,
//     "webhook_code": "DEFAULT_UPDATE",
//     "webhook_type": "TRANSACTIONS"
// }

// 
// PLAID WEBHOOKS
// 
// \\\
// TRANSACTIONS WEBHOOKS
// Doc: https://plaid.com/docs/api/#transactions-webhooks
// webhook_type: TRANSACTIONS
// webhook_codes:
//  INITIAL_UPDATE	Fired when an Item’s initial transaction pull is completed. Note: The default pull is 30 days.		
//  HISTORICAL_UPDATE	Fired when an Item’s historical transaction pull is completed. Plaid fetches as much data as is available from the financial institution. See data availability by institution.		
//  DEFAULT_UPDATE
//  TRANSACTIONS_REMOVED
//
// \\\
// ITEM WEBHOOKS
// DOC: https://plaid.com/docs/api/#item-webhooks
// webhook_type: ITEM
// webhook_codes:
//  WEBHOOK_UPDATE_ACKNOWLEDGED
//  ERROR
// 
// \\\
// INCOME WEBHOOKS
// Doc: https://plaid.com/docs/api/#income-webhooks
// webhook_type: INCOME
// webhook_code: PRODUCT_READY
//
// \\\
// ASSET WEBHOOKS
// Doc: plaid.com/docs/api/#assets-webhooks
// webhook_type: ASSETS
// webhook_codes:
//  PRODUCT_READY
//  PRODUCT_NOT_READY
//  ASSET_REPORT_ERROR
// 
// \\\
// WEBHOOK ERRORS
// Doc: https://plaid.com/docs/api/#errors
// {
//   "error_type": String,
//   "error_code": String,
//   "error_message": String,
//   "display_message": String
// }
//
// Error Types:
//  INVALID_REQUEST
//  INVALID_INPUT
//  INSTITUTION_ERROR
//  RATE_LIMIT_EXCEEDED
//  API_ERROR
//  ITEM_ERROR


// EXAMPLE full event from API Gateway
// {
//     "resource": "/fac/hook",
//     "path": "/fac/hook",
//     "httpMethod": "POST",
//     "headers": {
//         "Accept-Encoding": "gzip",
//         "CloudFront-Forwarded-Proto": "https",
//         "CloudFront-Is-Desktop-Viewer": "true",
//         "CloudFront-Is-Mobile-Viewer": "false",
//         "CloudFront-Is-SmartTV-Viewer": "false",
//         "CloudFront-Is-Tablet-Viewer": "false",
//         "CloudFront-Viewer-Country": "US",
//         "content-type": "application/json",
//         "Host": "api-dev.chedda.io",
//         "User-Agent": "Go-http-client/2.0",
//         "Via": "2.0 5c7c003054650261f3ca84564e715e56.cloudfront.net (CloudFront)",
//         "X-Amz-Cf-Id": "bbCFCiT7GGjN8jT33hs2dY86B4xAA2JSO49lisU4jlNqEye516bCXA==",
//         "X-Amzn-Trace-Id": "Root=1-5ba20246-fdd74168d8383b40971f7938",
//         "X-Forwarded-For": "52.21.47.157, 54.240.144.64",
//         "X-Forwarded-Port": "443",
//         "X-Forwarded-Proto": "https"
//     },
//     "multiValueHeaders": {
//         "Accept-Encoding": [
//             "gzip"
//         ],
//         "CloudFront-Forwarded-Proto": [
//             "https"
//         ],
//         "CloudFront-Is-Desktop-Viewer": [
//             "true"
//         ],
//         "CloudFront-Is-Mobile-Viewer": [
//             "false"
//         ],
//         "CloudFront-Is-SmartTV-Viewer": [
//             "false"
//         ],
//         "CloudFront-Is-Tablet-Viewer": [
//             "false"
//         ],
//         "CloudFront-Viewer-Country": [
//             "US"
//         ],
//         "content-type": [
//             "application/json"
//         ],
//         "Host": [
//             "api-dev.chedda.io"
//         ],
//         "User-Agent": [
//             "Go-http-client/2.0"
//         ],
//         "Via": [
//             "2.0 5c7c003054650261f3ca84564e715e56.cloudfront.net (CloudFront)"
//         ],
//         "X-Amz-Cf-Id": [
//             "bbCFCiT7GGjN8jT33hs2dY86B4xAA2JSO49lisU4jlNqEye516bCXA=="
//         ],
//         "X-Amzn-Trace-Id": [
//             "Root=1-5ba20246-fdd74168d8383b40971f7938"
//         ],
//         "X-Forwarded-For": [
//             "52.21.47.157, 54.240.144.64"
//         ],
//         "X-Forwarded-Port": [
//             "443"
//         ],
//         "X-Forwarded-Proto": [
//             "https"
//         ]
//     },
//     "queryStringParameters": null,
//     "multiValueQueryStringParameters": null,
//     "pathParameters": null,
//     "stageVariables": null,
//     "requestContext": {
//         "resourceId": "rqd80d",
//         "resourcePath": "/fac/hook",
//         "httpMethod": "POST",
//         "extendedRequestId": "NdVLDECroAMFSsA=",
//         "requestTime": "19/Sep/2018:08:01:10 +0000",
//         "path": "/fac/hook",
//         "accountId": "475512417340",
//         "protocol": "HTTP/1.1",
//         "stage": "Development",
//         "requestTimeEpoch": 1537344070783,
//         "requestId": "2bdee164-bbe2-11e8-9336-c57f69f784aa",
//         "identity": {
//             "cognitoIdentityPoolId": null,
//             "accountId": null,
//             "cognitoIdentityId": null,
//             "caller": null,
//             "sourceIp": "52.21.47.157",
//             "accessKey": null,
//             "cognitoAuthenticationType": null,
//             "cognitoAuthenticationProvider": null,
//             "userArn": null,
//             "userAgent": "Go-http-client/2.0",
//             "user": null
//         },
//         "apiId": "kzcvrr9lol"
//     },
//     "body": "{\n  \"error\": null,\n  \"item_id\": \"RrElbbmdmQFVGBA8ZRX7F7xxxyZzWgHRlJWda\",\n  \"new_transactions\": 386,\n  \"webhook_code\": \"HISTORICAL_UPDATE\",\n  \"webhook_type\": \"TRANSACTIONS\"\n}",
//     "isBase64Encoded": false
// }
