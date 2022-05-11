const jsonschema = require('jsonschema');
const table = require('table');
const { getFileSystemTree, getNestedEntries, get } = require('./helpers.js');

// Simple Setter Functions

Function.prototype.setPath = function (path) {
    this.path = path;
};

Function.prototype.setTitle = function (title) {
    this.title = title;
};

Function.prototype.setDescription = function (desc) {
    this.description = desc;
};

Function.prototype.setHttpMapper = function (...params) {
    this.httpMapper = params;
};

Function.prototype.setParamTypes = function (...types) {
    this.paramTypes = types;
};

Function.prototype.setReturnType = function (type) {
    this.returnType = type;
};

// Invoke functions with type checking and safe calling.

Function.prototype.invoke = function (t, ...params) {
    if (this.paramTypes instanceof Array)
        for (const [i, p] of params.entries()) {
            if (i >= this.paramTypes.length) break;
            const validation = jsonschema.validate(p, this.paramTypes[i]);

            if (!validation.valid) {
                return new Error(
                    `Invalid function call on param ${i}: ` + validation.errors
                );
            }
        }

    try {
        const result = this.call(t, ...params);
        if (result instanceof Promise) {
            return new Promise((res) => {
                result.then(res).catch((e) => res(new Error(e.toString())));
            });
        }
        return result;
    } catch (e) {
        return new Error(e.toString());
    }
};

// Http Middleware Generator

Function.prototype.httpHandler = async function (req, res, next) {
    // Step 0. Check method and path

    if (req.method !== 'POST') return next();
    if (req.path !== this.path) return next();

    // Step 1. Construct function parameters

    const args = this.httpMapper
        ? this.httpMapper.map((e) => get(req, e.split(':')))
        : [req.body];

    // Step 2. Invoke the function in a safe way

    let result = this.invoke({}, ...args);

    if (result instanceof Promise) result = await result;

    const status = result instanceof Error ? 502 : 200;
    result = result instanceof Error ? result.toString() : result;

    // Step 3. Send the right response
    return res.status(status).json(result);

    //     const _result = this.call({}, ...params);
    //     const result = _result instanceof Promise ? await _result : result;
    //     return res.status(200).json(result);
    // } catch (e) {
};

// Documentation Generator

Function.prototype.getOpenapiPath = function () {
    const parameters = this.httpMapper
        ? this.httpMapper.map((e) => ({
              in: e.startsWith('body') ? 'body' : 'header',
              required: true,
          }))
        : [];
    return {
        ['/' + this.path]: {
            post: {
                summary: this.title,
                description: this.description,
                consumes: ['application/json'],
                produces: ['application/json'],
                responses: {},
                tags: [],
                operationId: this.name,
                parameters,
            },
        },
    };
};

// Function Set

function FunctionSet() {
    const result = { functions: [] };
    result.__proto__ = FunctionSet.prototype;
    return result;
}

FunctionSet.prototype.register = function (x) {
    // There are three possible registering options
    if (x instanceof Function) {
        this.functions.push(x);
        return this;
    }

    if (x instanceof Array) {
        for (const f of x) {
            this.register(f);
        }
        return this;
    }

    if (x instanceof Object) {
        // Get paths and corresponding functions
        for (const [path, f] of getNestedEntries(x)) {
            if (f instanceof Function) {
                f.path = path;
                this.register(f);
            }
        }
    }
};

FunctionSet.prototype.registerPath = async function (path, options) {
    this.register(await getFileSystemTree(path));
    return this;
};

FunctionSet.prototype.unregister = function (x) {
    if (x instanceof Function) {
        const index = this.functions.indexOf(x);
        this.functions.splice(index, 1);
        return this;
    }
};

FunctionSet.prototype.invoke = function (path, ...params) {
    // Find the function
    const f = this.functions.find((f) => f.path === '/' + req.path);
    if (f === undefined) throw 'Unknown function path';
    f.invoke({}, ...params);
};

FunctionSet.prototype.httpHandler = function (req, res, next) {
    // Find the function
    const f = this.functions.find((f) => f.path === req.path);
    if (f === undefined) return next();

    // Call its handler
    return f.httpHandler(req, res, next);
};

FunctionSet.prototype.getHttpHandler = function () {
    return (req, res, next) => this.httpHandler(req, res, next);
};

FunctionSet.prototype.documantate = function () {
    const paths = this.functions
        .map((e) => e.getOpenapiPath())
        .reduce((a, x) => Object.assign(a, x), {});
    //     return {
    //         openapi: '3.0.0.',
    //         info: {
    //             version: '1.0.0',
    //             title: '',
    //             description: '',
    //             termsOfService: 'https://google.com',
    //             contact: {
    //                 name: 'API Support',
    //                 url: 'http://www.example.com/support',
    //                 email: 'support@example.com',
    //             },
    //             license: {
    //                 name: 'Apache 2.0',
    //                 url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
    //             },
    //         },
    //         servers: [
    //             {
    //                 url: 'http://localhost:3000',
    //                 description: 'Development server',
    //             },
    //         ],
    //         paths,
    //         tags: [
    //             {
    //                 name: 'pet',
    //                 description: 'Pets operations',
    //             },
    //         ],
    //         security: [
    //             {
    //                 api_key: [],
    //             },
    //         ],
    //         components: {
    //             schemas: {
    //                 Category: {
    //                     type: 'object',
    //                     properties: {
    //                         id: {
    //                             type: 'integer',
    //                             format: 'int64',
    //                         },
    //                         name: {
    //                             type: 'string',
    //                         },
    //                     },
    //                 },
    //             },
    //             responses: {},
    //             parameters: {},
    //             examples: {},
    //             requestBodies: {},
    //             headers: {},
    //             securitySchemes: {},
    //             links: {},
    //             callbacks: {},
    //         },
    //     };
};

FunctionSet.prototype.printTable = function () {
    const columns = ['path', 'title', 'params #', 'description'];
    const mappers = [
        (f) => f.path,
        (f) => f.title,
        (f) => (f.paramTypes instanceof Array ? f.paramTypes.length : null),
        (f) => f.description,
    ];
    const rows = this.functions.map((f) => mappers.map((m) => m(f)));
    const data = [columns, ...rows];
    const tbl = table.table(data, {
        columns: [
            { width: 40 },
            { width: 20 },
            { width: 10, truncate: 10 },
            {
                width: 60,
                truncate: 60,
            },
        ],
    });
    console.log(tbl);
};

module.exports = FunctionSet;
