//
//  QIO-Lambda-ASDS-User-Subscription-PromoCode()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId, .promoCode
//  Output: .expiresTimestamp
//

'use strict';
const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isNil(event.userId) || _.isEmpty(event.userId)) callback("User context required.");
    else if (_.isNil(event.promoCode) || _.isEmpty(event.promoCode)) callback("Missing action");
    else qlib.persist.promoCodeAttemptUse(event.promoCode, event.userId, callback);
});
