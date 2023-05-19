'use strict';
//
//  QIO-Lambda-ASDS-User-AuthExists()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .args.phoneNumber
//  Output: bool
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    let pn = (_.isUndefined(event.phoneNumber) && !_.isUndefined(event.args)) ? event.args.phoneNumber : event.phoneNumber;
    if (_.isUndefined(pn)) callback('User constext required.');
    else if (pn.length != 12) callback('Invalid input - a');
    else if (!_.startsWith(pn, '+1')) callback('Invalid input - b');
    else if (_.isNaN(Number(pn.substring(2)))) callback('Invalid input - c');
    else
        qlib.cognito.listCognitoUsers('phone_number', pn, (err, users) => {
            if (err) callback(err);
            else callback(null, !_.isEmpty(users));
        });
});
