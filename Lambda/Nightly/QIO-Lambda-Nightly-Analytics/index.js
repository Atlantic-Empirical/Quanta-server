'use strict';
//
//  QIO-Lambda-Nightly-Analytics()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input:
//  Output: 
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const _async = require('async');
const AWS = require('aws-sdk');
const appRoot = process.cwd();
const momentO = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const moment = qlib.date.prepMoment(momentO);

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    _async.auto({
            bank_transaction_count: cb => qlib.ddb.itemCountForTable("FAC-Transactions", cb),
            user_count: cb => qlib.ddb.itemCountForTable("FIO-Table-UserMap", cb),
            bank_link_count: cb => qlib.ddb.itemCountForTable("FIO-Table-Items", cb),
            bank_account_count: cb => qlib.ddb.itemCountForTable("FIO-Table-Accounts", cb),
            subscription_stats: cb => subscriptionStats(cb)
        },
        (err, results) => {
            if (err) callback(err);
            else {
                console.log(JSON.stringify(results, null, 2));
                persistStats(results, (err, res) => {
                    if (err) console.log(err);
                    callback(err, results);
                });
            }
        }
    );
});

function persistStats(stats, callback) {
    stats.date = moment().format('YYYY-MM-DD');
    stats.timestamp = Date.now();
    _.assign(stats, stats.subscription_stats); // Move subscriber stats to top level.
    delete stats.subscription_stats;
    qlib.ddb.putItem('FIO-Table-Analytics-Nightly', stats, callback);
}

function subscriptionStats(callback) {

    let params = {
        TableName: 'FIO-Table-User-Details',
        ExpressionAttributeValues: { ":oti": AWS.DynamoDB.Converter.input(6) },
        FilterExpression: "objectTypeId = :oti",
        ProjectionExpression: "expiresDateSec, is_trial_period, auto_renew_status, is_in_billing_retry_period, expiration_intent, originalTransactionDateSec"
    };

    qlib.ddb.scanWithParams(params, (err, res) => {
        if (err) callback(err);
        else {
            _.each(res, I => {

                I.hours_until_expiry = moment(I.expiresDateSec * 1000).diff(moment(), 'hours');
                I.is_expired = I.hours_until_expiry < -23;
                I.expires_today = _.inRange(I.hours_until_expiry, -23, 24);
                I.auto_renew_status = I.auto_renew_status == "1" || I.auto_renew_status == "true";
                if (I.expires_today) {
                    I.renews_today = I.auto_renew_status;
                }
                if (I.is_expired) {
                    I.subscriptionEndedDate = moment(I.expiresDateSec * 1000).format('YYYY-MM-DD');
                    I.subscriptionDuration = moment(I.expiresDateSec * 1000).diff(moment(I.originalTransactionDateSec * 1000), 'days');
                }
                else {
                    I.subscriptionDuration = moment().diff(moment(I.originalTransactionDateSec * 1000), 'days');
                }

            });

            let activeSubscriptions = _.filter(res, I => !I.is_expired || I.is_in_billing_retry_period == "1");
            let trialSubscriptions = _.filter(activeSubscriptions, I => I.is_trial_period);

            let auto_renew_counts = _.countBy(activeSubscriptions, I => I.auto_renew_status);
            let billing_retry_counts = _.countBy(activeSubscriptions, I => I.is_in_billing_retry_period == "1");
            let expiring_today_counts = _.countBy(activeSubscriptions, I => I.expires_today);
            let renewing_today_count = _.countBy(activeSubscriptions, I => I.renews_today);
            let trials_renewing_today_count = _.countBy(trialSubscriptions, I => I.renews_today);
            let avg_active_subscription_duration_days = _.chain(activeSubscriptions).map('subscriptionDuration').compact().mean().round(1).value();

            var out = {
                sub_churned_count: res.length - activeSubscriptions.length,
                sub_active_count: activeSubscriptions.length,
                sub_in_trial_count: trialSubscriptions.length,
                sub_auto_renewing_count: auto_renew_counts.true,
                sub_in_billing_retry_count: billing_retry_counts.true || 0,
                sub_expiring_today_count: expiring_today_counts.true || 0,
                sub_renewing_today_count: renewing_today_count.true || 0,
                sub_trials_up_for_conversion_today: trials_renewing_today_count.true || 0,
                sub_avg_active_subscription_length_in_days: avg_active_subscription_duration_days
            };

            callback(null, out);
        }
    });
}

// REFERENCE
//  from: https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ReceiptFields.html#//apple_ref/doc/uid/TP40010573-CH106-SW1

// is_in_billing_retry_period
// “1” - App Store is still attempting to renew the subscription.
// “0” - App Store has stopped attempting to renew the subscription

// expiration_intent
// “1” - Customer canceled their subscription.
// “2” - Billing error; for example customer’s payment information was no longer valid.
// “3” - Customer did not agree to a recent price increase.
// “4” - Product was not available for purchase at the time of renewal.
// “5” - Unknown error.

// cancellation_reason
// “1” - Customer canceled their transaction due to an actual or perceived issue within your app.
// “0” - Transaction was canceled for another reason, for example, if the customer made the purchase accidentally.
