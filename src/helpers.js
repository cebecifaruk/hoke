const fs = require('fs');
const path = require('path');
const assert = require('assert');

module.exports.getFileSystemTree = async function getFileSystemTree(basePath) {
    const tree = {};
    const dirents = await fs.promises.readdir(basePath, {
        withFileTypes: true,
    });

    for (const dirent of dirents) {
        switch (true) {
            case dirent.isFile():
            case dirent.isSymbolicLink():
                if (
                    !(
                        dirent.name.endsWith('.mjs') ||
                        dirent.name.endsWith('.js')
                    )
                )
                    continue;

                const module = await import(path.join(basePath, dirent.name));

                if (!(module?.default instanceof Function)) continue;

                let name = dirent.name;
                if (name.endsWith('.mjs')) name = name.slice(0, -4);
                else if (name.endsWith('.js')) name = name.slice(0, -3);

                tree[name] = module.default;

                break;
            case dirent.isDirectory():
                tree[dirent.name] = await getFileSystemTree(
                    path.join(basePath, dirent.name)
                );
                break;
            default:
                break;
        }
    }

    return tree;
};

module.exports.getNestedEntries = function getNestedEntries(
    x,
    base = '',
    seperator = '/'
) {
    assert(x instanceof Object, 'You must provide an object');

    const collection = [];

    for (const [key, value] of Object.entries(x)) {
        if (typeof value === 'object' && !Array.isArray(value))
            getNestedEntries(value, base + seperator + key, seperator).forEach(
                (x) => collection.push(x)
            );
        else collection.push([base + seperator + key, value]);
    }

    return collection;
};

module.exports.get = function get(x, path) {
    if (path.length === 0) return x;
    assert(x instanceof Object, 'Not an object provided');
    return get(x[path[0]], path.slice(1));
};
