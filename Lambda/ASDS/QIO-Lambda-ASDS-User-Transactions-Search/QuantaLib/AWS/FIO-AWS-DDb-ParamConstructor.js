'use strict';

// FIO-AWS-DDb-ParamConstructor

const AWS = require('aws-sdk');
const _ = require('lodash');

const ddb_limit_maxRecordsPermittedInBatchGet = 100;
const ddb_limit_maxRecordsPermittedInBatchWriteItem = 25;

module.exports = {

    constructParamsForProto: (proto) => _constructParamsForProto(proto),
    testHarness: () => _testHarness()

};

function _testHarness(proto) {
    if (_.isNil(proto)) proto = {
        method: "batchWriteItem_put",
        // method: "deleteItem, updateItem, getItem, query, scan, putItem, batchGetItem, batchWriteItem_put, batchWriteItem_delete",
        tableName: "FIO-Table-Named",
        indexName: "fio_table-index",
        key: {
            hash: ['name', 'value'],
            sort: ['name', 'value'] // Optional
        },
        keys: [{
            hash: ['name', 'value'],
            sort: ['name', 'value'] // Optional
        }, {
            hash: ['name', 'value'],
            sort: ['name', 'value'] // Optional
        }],
        item: {
            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44",
            "account_owner": "T R PURNELL-FISHER 7005",
            "amount": 128.64,
            "category": [
                "Shops"
            ],
            "location": {
                "address": "PO BOX 81226 -",
                "city": "Seattle",
                "state": "WA"
            }
        },
        items: [{
                "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44",
                "account_owner": "T R PURNELL-FISHER 7005",
                "amount": 128.64,
                "category": [
                    "Shops"
                ],
                "location": {
                    "address": "PO BOX 81226 -",
                    "city": "Seattle",
                    "state": "WA"
                }
            },
            {
                "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44",
                "account_owner": "T R PURNELL-FISHER 7005",
                "amount": 128.64,
                "category": [
                    "Shops"
                ],
                "location": {
                    "address": "PO BOX 81226 -",
                    "city": "Seattle",
                    "state": "WA"
                }
            }
        ],
        filters: {
            names: "transaction_id, sub",
            values: "tid_123,kafwehfklahewjf-awekfjhakwehf-kahewfawe"
        },
        conditions: {
            names: "single string, csv string, or string array",
            values: "single string, csv string, or string array"
        },
        updates: {
            action: "SET", // single string: <SET, ADD, DELETE, PUT> currently supporting only one action per request 
            names: "updatePropNameOne, updatePropNameTwo",
            values: "updatePropValOne, updatePropValTwo"
        },
        projections: "blergOne, sub", //single string, csv string or string array
        limit: 0,
        select: 'string',
        returnValue: 'string'
    };
    return _constructParamsForProto(proto);
}

function _constructParamsForProto(proto) {
    // console.log("constructParamsForProto()\nPROTO\n" + JSON.stringify(proto, null, 2));

    if (_.isNil(proto.tableName)) return "Table name is required.";
    // console.log(JSON.stringify(proto, null, 2));

    var params = { TableName: proto.tableName };

    if (!_.isNil(_.get(proto, 'key.names'))) proto.key.names = adaptThing(proto.key.names);
    if (!_.isNil(_.get(proto, 'key.values'))) proto.key.values = adaptThing(proto.key.values);
    if (!_.isNil(_.get(proto, 'filters.names'))) proto.filters.names = adaptThing(proto.filters.names);
    if (!_.isNil(_.get(proto, 'filters.values'))) proto.filters.values = adaptThing(proto.filters.values);
    if (!_.isNil(_.get(proto, 'conditions.names'))) proto.conditions.names = adaptThing(proto.conditions.names);
    if (!_.isNil(_.get(proto, 'conditions.values'))) proto.conditions.values = adaptThing(proto.conditions.values);
    if (!_.isNil(_.get(proto, 'updates.names'))) proto.updates.names = adaptThing(proto.updates.names);
    if (!_.isNil(_.get(proto, 'updates.values'))) proto.updates.values = adaptThing(proto.updates.values);
    if (!_.isNil(_.get(proto, 'projections'))) proto.projections = adaptThing(proto.projections);
    // if (!_.isNil(_.get(proto, 'keys'))) {
    //     proto.keys.names = adaptThing(proto.keys.names);
    //     proto.keys.values = adaptThing(proto.keys.values);
    // }

    var out;

    switch (proto.method.toLowerCase()) {

        case 'deleteitem':
            out = completeParamsForDeleteItem(params, proto);
            break;

        case 'updateitem':
            out = completeParamsForUpdateItem(params, proto);
            break;

        case 'getitem':
            out = completeParamsForGetItem(params, proto);
            break;

        case 'query':
            out = completeParamsForQuery(params, proto);
            break;

        case 'scan':
            if (!_.isNil(proto.indexName) && !_.isEmpty(proto.indexName)) params.IndexName = proto.indexName;
            out = completeParamsForScan(params, proto);
            break;

        case 'putitem':
            out = completeParamsForPutItem(params, proto);
            break;

        case 'batchgetitem':
            out = buildParamsForBatchGet(proto);
            break;

        case 'batchwriteitem_put':
            out = buildParamsForBatchWriteItem_put(proto);
            break;

        case 'batchwriteitem_delete':
            out = buildParamsForBatchWriteItem_delete(proto);
            break;

        default:
            return "UNSUPPORTED PROTO METHOD";
    }

    // console.log("\nPARAMS\n" + JSON.stringify(out, null, 2));
    return out;
}

// PARAMS FOR REQUEST TYPES

function buildParamsForBatchWriteItem_delete(proto) {
    if (_.isNil(proto.keys)) return "How about some keys to delete homie~";
    let params = _
        .chain(proto.keys.values)
        .map(V => _.pick(V, proto.keys.names))
        .each(key => _.forOwn(key, (v, k, o) => o[k] = AWS.DynamoDB.Converter.input(v)))
        .chunk(ddb_limit_maxRecordsPermittedInBatchWriteItem)
        .map(valueChunk => ({
            RequestItems: {
                [proto.tableName]: _.map(valueChunk, (V, idx) => ({ DeleteRequest: { Key: V } }))
            }
        }))
        .value();
    return params;
}

function buildParamsForBatchWriteItem_put(proto) {
    if (_.isNil(proto.items)) return "How about some items to put homie~";
    let params = _
        .chain(proto.items)
        .each(I => {
            let js = JSON.stringify(I);
            if (js.length > 400000)
                console.log("MAJOR PROBLEM: THIS BATCH WRITE ITEM IS TOO BIG (over the 400k limit)");
        })
        .chunk(ddb_limit_maxRecordsPermittedInBatchWriteItem)
        .map(itemChunk => ({
            RequestItems: {
                [proto.tableName]: _.map(itemChunk, itm => ({ PutRequest: { Item: AWS.DynamoDB.Converter.marshall(itm) } }))
            }
        }))
        .value();
    return params;
}

function buildParamsForBatchGet(proto) {
    if (_.isNil(proto.keys)) return "Keys are required.";
    return _
        .chain(proto.keys)
        .transform((res, key) =>
            res.push(_.fromPairs(_.compact([key.hash, _.get(key, 'sort')]))))
        .each(key =>
            _.forOwn(key, (v, k, o) =>
                o[k] = AWS.DynamoDB.Converter.input(v)))
        .chunk(ddb_limit_maxRecordsPermittedInBatchGet)
        .transform((res, keyChunk) =>
            res.push({
                RequestItems: {
                    [proto.tableName]: { Keys: keyChunk }
                }
            }))
        .each(I =>
            addProjectionToParams(I['RequestItems'][proto.tableName], proto.projections))
        .value();
}

function completeParamsForScan(params, proto) {

    // REQUIRED
    // none

    // OPTIONAL
    addProjectionToParams(params, proto.projections);
    addFilterToParams(params, proto.filters);
    addLimitToParams(params, proto.limit);
    addSelectToParams(params, proto.select);
    addIndexToParams(params, proto.indexName);

    return params;
}

function completeParamsForQuery(params, proto) {
    if (_.isNil(proto.key)) return "Key is required.";

    // REQUIRED
    addKeyConditionToParams(params, proto.key);

    // OPTIONAL
    addProjectionToParams(params, proto.projections);
    addFilterToParams(params, proto.filters);
    addLimitToParams(params, proto.limit);
    addSelectToParams(params, proto.select);
    addIndexToParams(params, proto.indexName);

    return params;
}

function completeParamsForGetItem(params, proto) {
    if (_.isNil(proto.key)) return "Key is required.";

    // REQUIRED
    addKeyToParams(params, proto.key);

    // OPTIONAL
    addProjectionToParams(params, proto.projections);

    return params;
}

function completeParamsForUpdateItem(params, proto) {
    if (_.isNil(proto.key)) return "Key is required.";
    if (_.isNil(proto.updates)) return "Update object is absent";

    // REQUIRED
    addKeyToParams(params, proto.key);
    params.UpdateExpression = proto.updates.action.toUpperCase();
    let nameObj = adaptStringArray(proto.updates.names, '#un');
    params.ExpressionAttributeNames = _.merge(nameObj, _.get(params, 'ExpressionAttributeNames', {}));
    let keyNameKeys = _.keys(params.ExpressionAttributeNames);
    params.ExpressionAttributeValues = {};
    _.each(proto.updates.values, (V, idx, coll) => {
        let valTag = ":un" + idx;
        params.ExpressionAttributeValues[valTag] = AWS.DynamoDB.Converter.input(V);
        params.UpdateExpression +=
            (idx > 0 ? ", " : " ") +
            keyNameKeys[idx] +
            (proto.updates.action.toUpperCase() == "SET" ? ' = ' : ' ') +
            valTag;
    });

    // OPTIONAL
    addReturnValueToParams(params, proto.returnValue);
    // addConditionsToParams(params, proto.conditions); // not currently supported

    return params;
}

function completeParamsForDeleteItem(params, proto) {
    if (_.isNil(proto.key)) return "Key is required.";

    // REQUIRED
    addKeyToParams(params, proto.key);

    // OPTIONAL
    // addConditionsToParams(params, proto.conditions); // not currently supported

    return params;
}

function completeParamsForPutItem(params, proto) {

    // REQUIRED
    params.Item = AWS.DynamoDB.Converter.marshall(proto.item);

    // OPTIONAL
    // addConditionsToParams(params, proto.conditions); // not currently supported

    return params;
}

// ADDING PARAMS

function addReturnValueToParams(params, returnValue) {
    if (!_.isNil(returnValue) && !_.isEmpty(returnValue))
        params.ReturnValues = returnValue; // yes, it is supposed to be plural
}

function addIndexToParams(params, indexName) {
    if (!_.isNil(indexName) && !_.isEmpty(indexName))
        params.IndexName = indexName;
}

function addLimitToParams(params, limit) {
    if (!_.isNil(limit) && limit > 0)
        params.Limit = limit;
}

function addSelectToParams(params, select) {
    if (!_.isNil(select) && !_.isEmpty(select))
        params.Select = select;
}

function addFilterToParams(params, protoFilters) {
    if (_.isNil(protoFilters)) return;
    if (_.isNil(protoFilters.names) || _.isNil(protoFilters.values)) return;

    if (_.isNil(params.ExpressionAttributeNames)) params.ExpressionAttributeNames = {};
    if (_.isNil(params.ExpressionAttributeValues)) params.ExpressionAttributeValues = {};
    let finalFilterNames = _.map(protoFilters.names, (N, idx) => {
        let tag = "#fn" + idx;
        params.ExpressionAttributeNames[tag] = N;
        return tag;
    });
    _.each(protoFilters.values, (V, idx) =>
        params.ExpressionAttributeValues[":vf" + idx] = AWS.DynamoDB.Converter.input(V));
    params.FilterExpression = "";
    _.each(finalFilterNames, (N, idx) =>
        params.FilterExpression += (idx > 0 ? " AND " : "") + (N + " = :vf" + idx));
}

function addKeyConditionToParams(params, protoKey) {
    let nameObj = adaptStringArray(protoKey.names, '#an');
    params.ExpressionAttributeNames = _.merge(nameObj, _.get(params, 'ExpressionAttributeNames', {}));
    let keyNameKeys = _.keys(params.ExpressionAttributeNames);
    params.KeyConditionExpression = "";
    _.each(keyNameKeys, (N, idx) => params.KeyConditionExpression += (idx > 0 ? " AND " : "") + (N + " = :v" + idx));
    let valueObj = adaptStringArray(protoKey.values, ':v', true);
    params.ExpressionAttributeValues = _.merge(valueObj, _.get(params, 'ExpressionAttributeValues', {}));
}

function addProjectionToParams(params, projections) {
    if (_.isNil(projections)) return;

    if (_.isNil(params.ExpressionAttributeNames)) params.ExpressionAttributeNames = {};
    let outProjectionArray = _.map(projections, (P, idx) => {
        let tag = "#p" + idx;
        params.ExpressionAttributeNames[tag] = P;
        return tag;
    });
    params.ProjectionExpression = _.join(outProjectionArray, ',');
}

function addKeyToParams(params, protoKey) {
    params.Key = _.transform(protoKey.names, (res, KN, idx) => res[KN] = AWS.DynamoDB.Converter.input(protoKey.values[idx]), {});
}

// function addConditionsToParams(params, protoKey) {
//     return "NOT IMPLEMENTED";
// }

// HELPER

function adaptStringArray(array, prefix, convertForDdb = false) {
    let out = {};
    _.each(array, (N, idx) => out[prefix + idx] = convertForDdb ? AWS.DynamoDB.Converter.input(N) : N);
    return out;
}

function adaptThing(obj) {
    if (!_.isArray(obj)) {
        if (_.isString(obj) && obj.includes(',')) return _.chain(obj).split(',').map(_.trim).value();
        else return [obj];
    }
    else return _.filter(obj, o => !_.isUndefined(o));
}

// const ddb_reservedWordsCSV = "ABORT,ABSOLUTE,ACTION,ADD,AFTER,AGENT,AGGREGATE,ALL,ALLOCATE,ALTER,ANALYZE,AND,ANY,ARCHIVE,ARE,ARRAY,AS,ASC,ASCII,ASENSITIVE,ASSERTION,ASYMMETRIC,AT,ATOMIC,ATTACH,ATTRIBUTE,AUTH,AUTHORIZATION,AUTHORIZE,AUTO,AVG,BACK,BACKUP,BASE,BATCH,BEFORE,BEGIN,BETWEEN,BIGINT,BINARY,BIT,BLOB,BLOCK,BOOLEAN,BOTH,BREADTH,BUCKET,BULK,BY,BYTE,CALL,CALLED,CALLING,CAPACITY,CASCADE,CASCADED,CASE,CAST,CATALOG,CHAR,CHARACTER,CHECK,CLASS,CLOB,CLOSE,CLUSTER,CLUSTERED,CLUSTERING,CLUSTERS,COALESCE,COLLATE,COLLATION,COLLECTION,COLUMN,COLUMNS,COMBINE,COMMENT,COMMIT,COMPACT,COMPILE,COMPRESS,CONDITION,CONFLICT,CONNECT,CONNECTION,CONSISTENCY,CONSISTENT,CONSTRAINT,CONSTRAINTS,CONSTRUCTOR,CONSUMED,CONTINUE,CONVERT,COPY,CORRESPONDING,COUNT,COUNTER,CREATE,CROSS,CUBE,CURRENT,CURSOR,CYCLE,DATA,DATABASE,DATE,DATETIME,DAY,DEALLOCATE,DEC,DECIMAL,DECLARE,DEFAULT,DEFERRABLE,DEFERRED,DEFINE,DEFINED,DEFINITION,DELETE,DELIMITED,DEPTH,DEREF,DESC,DESCRIBE,DESCRIPTOR,DETACH,DETERMINISTIC,DIAGNOSTICS,DIRECTORIES,DISABLE,DISCONNECT,DISTINCT,DISTRIBUTE,DO,DOMAIN,DOUBLE,DROP,DUMP,DURATION,DYNAMIC,EACH,ELEMENT,ELSE,ELSEIF,EMPTY,ENABLE,END,EQUAL,EQUALS,ERROR,ESCAPE,ESCAPED,EVAL,EVALUATE,EXCEEDED,EXCEPT,EXCEPTION,EXCEPTIONS,EXCLUSIVE,EXEC,EXECUTE,EXISTS,EXIT,EXPLAIN,EXPLODE,EXPORT,EXPRESSION,EXTENDED,EXTERNAL,EXTRACT,FAIL,FALSE,FAMILY,FETCH,FIELDS,FILE,FILTER,FILTERING,FINAL,FINISH,FIRST,FIXED,FLATTERN,FLOAT,FOR,FORCE,FOREIGN,FORMAT,FORWARD,FOUND,FREE,FROM,FULL,FUNCTION,FUNCTIONS,GENERAL,GENERATE,GET,GLOB,GLOBAL,GO,GOTO,GRANT,GREATER,GROUP,GROUPING,HANDLER,HASH,HAVE,HAVING,HEAP,HIDDEN,HOLD,HOUR,IDENTIFIED,IDENTITY,IF,IGNORE,IMMEDIATE,IMPORT,IN,INCLUDING,INCLUSIVE,INCREMENT,INCREMENTAL,INDEX,INDEXED,INDEXES,INDICATOR,INFINITE,INITIALLY,INLINE,INNER,INNTER,INOUT,INPUT,INSENSITIVE,INSERT,INSTEAD,INT,INTEGER,INTERSECT,INTERVAL,INTO,INVALIDATE,IS,ISOLATION,ITEM,ITEMS,ITERATE,JOIN,KEY,KEYS,LAG,LANGUAGE,LARGE,LAST,LATERAL,LEAD,LEADING,LEAVE,LEFT,LENGTH,LESS,LEVEL,LIKE,LIMIT,LIMITED,LINES,LIST,LOAD,LOCAL,LOCALTIME,LOCALTIMESTAMP,LOCATION,LOCATOR,LOCK,LOCKS,LOG,LOGED,LONG,LOOP,LOWER,MAP,MATCH,MATERIALIZED,MAX,MAXLEN,MEMBER,MERGE,METHOD,METRICS,MIN,MINUS,MINUTE,MISSING,MOD,MODE,MODIFIES,MODIFY,MODULE,MONTH,MULTI,MULTISET,NAME,NAMES,NATIONAL,NATURAL,NCHAR,NCLOB,NEW,NEXT,NO,NONE,NOT,NULL,NULLIF,NUMBER,NUMERIC,OBJECT,OF,OFFLINE,OFFSET,OLD,ON,ONLINE,ONLY,OPAQUE,OPEN,OPERATOR,OPTION,OR,ORDER,ORDINALITY,OTHER,OTHERS,OUT,OUTER,OUTPUT,OVER,OVERLAPS,OVERRIDE,OWNER,PAD,PARALLEL,PARAMETER,PARAMETERS,PARTIAL,PARTITION,PARTITIONED,PARTITIONS,PATH,PERCENT,PERCENTILE,PERMISSION,PERMISSIONS,PIPE,PIPELINED,PLAN,POOL,POSITION,PRECISION,PREPARE,PRESERVE,PRIMARY,PRIOR,PRIVATE,PRIVILEGES,PROCEDURE,PROCESSED,PROJECT,PROJECTION,PROPERTY,PROVISIONING,PUBLIC,PUT,QUERY,QUIT,QUORUM,RAISE,RANDOM,RANGE,RANK,RAW,READ,READS,REAL,REBUILD,RECORD,RECURSIVE,REDUCE,REF,REFERENCE,REFERENCES,REFERENCING,REGEXP,REGION,REINDEX,RELATIVE,RELEASE,REMAINDER,RENAME,REPEAT,REPLACE,REQUEST,RESET,RESIGNAL,RESOURCE,RESPONSE,RESTORE,RESTRICT,RESULT,RETURN,RETURNING,RETURNS,REVERSE,REVOKE,RIGHT,ROLE,ROLES,ROLLBACK,ROLLUP,ROUTINE,ROW,ROWS,RULE,RULES,SAMPLE,SATISFIES,SAVE,SAVEPOINT,SCAN,SCHEMA,SCOPE,SCROLL,SEARCH,SECOND,SECTION,SEGMENT,SEGMENTS,SELECT,SELF,SEMI,SENSITIVE,SEPARATE,SEQUENCE,SERIALIZABLE,SESSION,SET,SETS,SHARD,SHARE,SHARED,SHORT,SHOW,SIGNAL,SIMILAR,SIZE,SKEWED,SMALLINT,SNAPSHOT,SOME,SOURCE,SPACE,SPACES,SPARSE,SPECIFIC,SPECIFICTYPE,SPLIT,SQL,SQLCODE,SQLERROR,SQLEXCEPTION,SQLSTATE,SQLWARNING,START,STATE,STATIC,STATUS,STORAGE,STORE,STORED,STREAM,STRING,STRUCT,STYLE,SUB,SUBMULTISET,SUBPARTITION,SUBSTRING,SUBTYPE,SUM,SUPER,SYMMETRIC,SYNONYM,SYSTEM,TABLE,TABLESAMPLE,TEMP,TEMPORARY,TERMINATED,TEXT,THAN,THEN,THROUGHPUT,TIME,TIMESTAMP,TIMEZONE,TINYINT,TO,TOKEN,TOTAL,TOUCH,TRAILING,TRANSACTION,TRANSFORM,TRANSLATE,TRANSLATION,TREAT,TRIGGER,TRIM,TRUE,TRUNCATE,TTL,TUPLE,TYPE,UNDER,UNDO,UNION,UNIQUE,UNIT,UNKNOWN,UNLOGGED,UNNEST,UNPROCESSED,UNSIGNED,UNTIL,UPDATE,UPPER,URL,USAGE,USE,USER,USERS,USING,UUID,VACUUM,VALUE,VALUED,VALUES,VARCHAR,VARIABLE,VARIANCE,VARINT,VARYING,VIEW,VIEWS,VIRTUAL,VOID,WAIT,WHEN,WHENEVER,WHERE,WHILE,WINDOW,WITH,WITHIN,WITHOUT,WORK,WRAPPED,WRITE,YEAR,ZONE";
