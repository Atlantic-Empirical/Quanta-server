// FIO-Notify 

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const _async = require('async');

const q_persist = require("./FIO-Persist");
const q_ddb = require("../AWS/FIO-AWS-DDb");
const q_sns = require("../AWS/FIO-AWS-SNS");
const q_obj = require("../Util/FIO-Util-ObjectStuff");

module.exports = {

    notifyUser: (protoMessage, callback) => _notifyUser(protoMessage, callback),
    flowNotify: (userId, yesterdayDateNet, callback) =>
        _flowNotify(userId, yesterdayDateNet, callback),

};

function _notifyUser(protoMessage, callback) {
    _async.auto({
        pull_erns: cb => {
            q_ddb.query('NP-Push-Device-Tokens', ['userId', 'tokenPlatform'], [protoMessage.userId, 0], cb, undefined, 'endpointArn, tokenPlatform', 0, 'SPECIFIC_ATTRIBUTES');
        },
        format_bodies: ['pull_erns', (results, cb) => {
            _.each(results.pull_erns, ern => {
                let s = _.split(ern.endpointArn, "/");
                let isProd = s[1] == "APNS";
                ern.payload = buildApnPayload(protoMessage, isProd);
                ern.messageStructure = 'json';
            });
            cb(null, results.pull_erns);
        }],
        dispatch_messages: ['format_bodies', (results, cb) => {
            var publishResults = [];
            _async.each(results.format_bodies,
                (item, cb_each) => {
                    q_sns.publish(item,
                        (err, data) => {
                            if (err) {
                                console.log('ERROR in _notifyUser.publish():\n' + JSON.stringify(err, null, 2));
                                publishResults.push(err);
                            }
                            else publishResults.push(data);
                            cb_each();
                        }
                    );
                },
                err => cb(err, publishResults)
            );
        }]
    }, callback);
}

function buildApnPayload(protoMessage, forProd) {

    if (!forProd) protoMessage.body += "\n[SANDBOX]";

    let apnObj = {
        aps: {
            alert: {
                title: protoMessage.title,
                subtitle: protoMessage.subtitle,
                body: protoMessage.body
            },
            sound: protoMessage.sound,
            badge: protoMessage.badgeCount,
        },
        customData: protoMessage.customData
    };
    if (!_.isNil(protoMessage.category))
        apnObj.aps.category = protoMessage.category;
    if (protoMessage.isMutable)
        apnObj.aps["mutable-content"] = 1;

    var messageBodyObjJSON = JSON.stringify(apnObj);
    let payload = forProd ? { APNS: messageBodyObjJSON } : { APNS_SANDBOX: messageBodyObjJSON };
    let payloadStr = JSON.stringify(payload);
    console.log("Final payload JSON: " + payloadStr);
    return payloadStr;
}

// SAMPLE PROTOMESSAGE: 
// { 
//     userId: userId, 
//     title: messageTitle(dateNet), 
//     body: messageBody(dateNet, transactionCount), 
//     badgeCount: transactionCount, 
//     sound: 'default', 
//     collapseKey: 1, 
//     customData: { 
//         messageType: 1, 
//         date: yesterdayDateNet.date 
//     } 
// }; 

function _flowNotify(userId, yesterdayDateNet, callback) {
    // 🆘⚠️🔴🛑💰💵🏦🏆🏅👆👇☝️👍👎💸💩📈📉🤔😬🤗😖😏🤩😎🤯😳🤭😲🤤😋😉😡🤬😠😤😭😫😩😊☺️😇🙂🤑😨😱😥🔼🔽 ❗️✅ 

    var tids = [];
    tids.push(...yesterdayDateNet.transactions.regularIncome.transactionIds);
    tids.push(...yesterdayDateNet.transactions.debits.transactionIds);
    tids.push(...yesterdayDateNet.transactions.deposits.transactionIds);
    tids.push(...yesterdayDateNet.transactions.transfers.transactionIds);
    let transactionCount = tids.length;

    q_persist.pullUserTransactions(userId, tids, false, (err, res) => {
        if (err) callback(err);
        else {
            let transactions = _.map(res, tx => {
                return {
                    name: tx.name,
                    amount: tx.amount,
                    tid: tx.transaction_id
                };
            });
            _notifyUser({
                    userId: userId,
                    title: "Yesterday's Net: " + netToString(yesterdayDateNet.netAmount),
                    subtitle: transactionCount + " Transactions",
                    body: flowNotifBody(yesterdayDateNet, transactionCount),
                    badgeCount: transactionCount,
                    sound: 'default',
                    collapseKey: 1,
                    customData: {
                        messageType: 1,
                        date: yesterdayDateNet.date,
                        transactions: transactions
                        // urlImageString: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
                    },
                    category: "FLOW_NOTIF",
                    isMutable: true
                },
                callback
            );
        }
    });
}

function netToString(net) {
    if (net == 0) return '$0';
    else {
        let isPositive = net > 0;
        var body = (isPositive ? '↑ ' : '↓ ');
        body += '$' + q_obj.financialString(Math.abs(net));
        if (isPositive) { body += " 🏅" }
        return body;
    }
}

function flowNotifBody(yesterdayDateNet, transactionCount) {
    var body = '';
    body += '   💰 In: $' + q_obj.financial(_.get(yesterdayDateNet, 'income', 0)) + '\n';
    body += '   💸 Out: $' + q_obj.financial(Math.abs(_.get(yesterdayDateNet, 'transactions.debits.totalAmount', 0)));
    return body;
}
