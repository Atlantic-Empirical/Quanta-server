//
//  FIO-Analysis-Income
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId, optional: .skipNotify, .pullFullTransactionHistory
//  Output: categories and dateNets
//

'use strict';
const _ = require('lodash');
// const moment = require('moment');
const appRoot = process.cwd();
const moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const qlib = require('../QuantaLib/FIO-QuantaLib');

module.exports = {

    incomeForDate: (dateString, userIncome) => _incomeForDate(dateString, userIncome),
    incomeForDateRange: (startDateString, endDateString, userIncome) =>
        _incomeForDateRange(startDateString, endDateString, userIncome)

};

function _incomeForDate(dateString, userIncome) {
    if (_.isNil(userIncome)) return 0;
    return _
        .chain(userIncome)
        .thru(v => _.concat(v.activeStreams, v.inactiveStreams))
        .filter(incomeStream => {
            let daysToExtendStreams = incomeStream.dateDistribution.avgDiffDays;
            daysToExtendStreams += (incomeStream.periodSize == 'biweekly' ? 5 : 10);
            let adjustedEndDateM = moment(incomeStream.dateDistribution.lastDate).add(daysToExtendStreams, 'days'); // add the grace period
            return qlib.date.dateIsBetween(dateString, incomeStream.dateDistribution.firstDate, adjustedEndDateM.format('YYYY-MM-DD'));
        })
        .map('amountDistribution.dailyEstimate')
        .reduce((m, i) => m + i)
        .value() || 0;
}

function _incomeForDateRange(startDateString, endDateString, userIncome) {
    if (_.isNil(userIncome)) return 0;
    let startM = moment(startDateString);
    let diffDays = moment(endDateString).diff(startM, 'days');
    var outIncomeAmount = 0;
    _.times(diffDays, idx => {
        outIncomeAmount += _incomeForDate(startM.add(idx, 'days'), userIncome);
    });
    return outIncomeAmount;
}
