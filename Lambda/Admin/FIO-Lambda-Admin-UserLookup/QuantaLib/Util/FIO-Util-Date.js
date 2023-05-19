// FIO-Util-Date

'use strict';
const _ = require('lodash');
const appRoot = process.cwd();
const Moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const MomentRange = require(appRoot + "/ThirdParty/moment-range/moment-range");
const momentObj = MomentRange.extendMoment(Moment);
const moment = _prepMoment(momentObj);
const q_math = require('./FIO-Util-Math');

module.exports = {

    prepMoment: m => _prepMoment(m),
    dateIsBetween: (inspectDate, startDate, endDate) => _dateIsBetween(inspectDate, startDate, endDate),
    daysAgoForDate: dateStringOrMoment => _daysAgoForDate(dateStringOrMoment),
    closestDateInArray: (momentArray, inspectDateStrOrM, toleranceDays) => _closestDateInArray(momentArray, inspectDateStrOrM, toleranceDays),
    closestDateInMomentArray: (moments, m, toleranceDays) => _closestDateInMomentArray(moments, m, toleranceDays),
    dateDistributionForDateSet: dateStrings => _dateDistributionForDateSet(dateStrings),
    tenYearsAgoString: () => moment().subtract(10, 'years').format("YYYY-MM-DD"),

};

function _dateIsBetween(inspectDate, startDate, endDate) {
    let start = moment(startDate, 'YYYY-MM-DD');
    let end = moment(endDate, 'YYYY-MM-DD').add(1, 'days');
    let inspectDateM = moment(inspectDate, 'YYYY-MM-DD');
    let res = moment().range(start, end).contains(inspectDateM);
    // console.log('dateIsBetween(' + inspectDate + ') ' + startDate + ' -- ' + endDate + ' = ' + res);
    return res;
}

function _dateDistributionForDateSet(dateStrings) {
    // console.log('Analyze date distribution of:\n' + JSON.stringify(dateStrings, null, 2));
    var diffDays = [];
    _.each(dateStrings, (dateString, index, collection) => {
        let m1 = moment(dateString);
        if (index + 1 < collection.length) {
            let d2String = collection[index + 1];
            let d = m1.diff(d2String, 'days');
            // console.log(dateString + ' - ' + d2String + ' diff days: ' + d.toString());
            diffDays.push(d);
        }
    });
    // EXCLUDE 0 CASES (WHEN THERE WERE TWO TRANSACTIONS ON SAME DAY)
    diffDays = _.filter(diffDays, diff => diff != 0);
    let avgDiffDays = _.round(_.mean(diffDays), 2) || 0;
    // console.log('avgerage days: ' + avgDiffDays);
    let standardDeviation = q_math.stdDev(diffDays) || 0;
    // console.log('stdDev: ' + standardDeviation);
    let relativeStandardDeviationPct = q_math.relativeStandardDeviation(standardDeviation, avgDiffDays); //_.round((100 * standardDeviation) / avgDiffDays, 2) || 0;
    // console.log('relativeStandardDeviation: ' + relativeStandardDeviation);
    let out = {
        avgDiffDays: avgDiffDays,
        standardDeviation: standardDeviation,
        relativeStandardDeviationPct: relativeStandardDeviationPct,
        firstDate: _.last(dateStrings),
        lastDate: _.first(dateStrings),
    };
    let projectedNextDateM = moment(out.lastDate).add(out.avgDiffDays, 'days');
    out.daysUntilNext = Math.abs(moment().diff(projectedNextDateM, 'days'));
    // ADD DAYS-AGO
    out.lastDaysAgo = _daysAgoForDate(out.lastDate);
    out.firstDaysAgo = _daysAgoForDate(out.firstDate);
    out.duration = out.firstDaysAgo - out.lastDaysAgo;
    // console.log('Date Distribution Summary:\n' + JSON.stringify(out, null, 2));
    return out;
}

function _daysAgoForDate(dateStringOrMoment) {
    return moment().diff(moment(dateStringOrMoment), 'days');
}

function _closestDateInMomentArray(moments, compareMoment, toleranceDays) {
    let compareSecs = compareMoment.unix();
    let sec_per_day = 24 * 60 * 60;
    let tolerance_sec = sec_per_day * toleranceDays;
    let out = _
        .chain(moments)
        .filter(m => {
            m.diffSec = Math.abs(m.unix() - compareSecs);
            return m.diffSec < tolerance_sec;
        })
        .orderBy('diffSec', 'asc')
        .first()
        .value();
    return out;
}

function _closestDateInArray(momentArray, inspectDateStrOrM, toleranceDays) {

    var inspectMoment;
    if (_.isString(inspectDateStrOrM))
        inspectMoment = moment(inspectDateStrOrM);
    else
        inspectMoment = inspectDateStrOrM;

    let out = _
        .chain(momentArray)
        .each(m => m.diff = Math.abs(inspectMoment.diff(m)))
        .orderBy('diff', 'asc')
        .first()
        .value();

    // let out = _
    //     .chain(momentArray)
    //     .each(m => m.diff = Math.abs(moment(inspectDateStrOrM).diff(m)))
    //     .orderBy('diff', 'asc')
    //     .first()
    //     .value();

    if (moment.duration(out.diff).asDays() > toleranceDays) return; // Nearest date is outside the tolerance.
    else return out;
}

function _prepMoment(m) {
    m.updateLocale('en', { week: { dow: 1 } }); // Set first day of week to monday
    m.tz.setDefault("America/New_York"); // set timezone to eastern
    return m;
}
