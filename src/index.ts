import * as vm from "vm";

export const TEST = ":-x";

/**
 * step a: build a proxy fs:
 * - we need requires to resolve and custom scripts added
 * - we need requires to resolve node_modules relative to script added
 * 1 we need fs reads used by script to resolve files relative to script
 *
 * notes: preferbely we would just want to use  babel and call it a day BUT
 *        - webpack provides 'alias' for memory fs - giving us 'dynamic' modules
 */
const fs = require("fs");
const fsp = require("fs").promises; //TODO: fs-extra
const MemoryFS = require("memory-fs");
const memoryFileSystem = new MemoryFS();

/**
 * step b: transpile code
 */
const path = require("path");

import {transform} from "@babel/core";

//todo: use something like 'app-root'
const packageRoot = path.join(__dirname, '..');

// step a problem 1: resolve files relative to script by using fs fallback
//            - under the assumption other fs methods use stat and readFile
const stat = memoryFileSystem.stat.bind(memoryFileSystem);
const read = memoryFileSystem.readFile.bind(memoryFileSystem);

memoryFileSystem.stat = function (path, callback) {
    stat(path, function (error, result) {
        if (error) {
            // nothing was found on the memory fs
            // give the disk a chance to find the file
            return fs.stat(path, callback);
        }
        return callback(error, result);
    });
}

// todo: use a simpler proxy or shared function w/ above
//       this is messy to look at?
memoryFileSystem.readFile = function (path, callback) {
    read(path, function (error, result) {
        if (error) {
            // nothing was found on the memory fs
            // give the disk a chance to read the file
            return fs.readFile(path, callback);
        }
        return callback(error, result);
    });
}


// add ("~/.sample/sample.js")
// we are going use babel core to transpile this file
// give the provider (developers) some muscle
// todo: MAKE THIS SYNC, defer any load to a 'load' method
// todo: make module root the constructor for the loader!!!
// THIS HANDLE JS OR TS!
export async function add(moduleRoot, script: string) {
    console.log("adding script: ", script);

    const location = `//${script}`;
    const scriptText = await fsp.readFile(path.join(moduleRoot, script), 'utf-8');

    console.log('from: ', location);
    console.log(scriptText);

    let options: any = {
        filename: script,
        presets: [
            [path.join(packageRoot, 'node_modules', '@babel/preset-typescript'), {modules: false }],
            [path.join(packageRoot, 'node_modules', '@babel/preset-env')]
        ]
    };

    console.log("babel options: ", options);

    const code = `${scriptText}`;

    let bundle: any = transform(code, options);
    let jsCode: string = bundle.code;

    // write file to temp/proxy (memory) fs
    console.log(jsCode);

    memoryFileSystem.writeFileSync(location, jsCode);
}

// Module, e.g: @upspark/safe -  > // CODE

const modules = {};

// todo: lazy load modules -> just like add
export async function module(title, script) {
    const moduleName = path.basename(script);
    const modulePath = `/__module__${moduleName}`;

    console.log('adding module resolution: ', title, ', path: ', modulePath);

    modules[title] = modulePath;

    const code = await fsp.readFile(script, 'utf-8');

    console.log(code);

    memoryFileSystem.writeFileSync(modulePath, code);
}

// step 3: webpack provided modules w/ script added
//         this allows for the script to use these modules
//         and because webpack is the  bundle system -> if provided script
//                                                      does not use modules / don't add them

const webpack = require('webpack');

// todo: this should/will load the module + loaded scripts
export async function load(root, entry) {
    const outputMemoryFilesystem = new MemoryFS(); // we don't actually want to print files to the host

    const config = {
        context: '/',
        entry: `./${entry}`,
        target: 'node',
        output: {
            path: '/',
            filename: 'bundle.js',
            library: 'runtime'
        },
        externals: {},
        resolve: {
            alias: modules,
            extensions: ['.js', '.ts', '.json'],
            modules: [
                path.join(root, 'node_modules')
            ]
        },
        optimization: {
            minimize: true,
        },
    };

    const compiler = webpack(config);

    compiler.inputFileSystem = memoryFileSystem;
    // compiler.resolvers.normal.fileSystem = compiler.inputFileSystem;
    // compiler.resolvers.context.fileSystem = compiler.inputFileSystem;
    compiler.outputFileSystem = outputMemoryFilesystem;

    async function compile() {
        return new Promise((resolve, reject) => compiler.run((error, stats) => {
            if (error) {
                reject(error);
                return;
            }

            const result = stats.toJson();
            if (result.errors.length) {
                console.error(result.errors.join('\n'));
            }

            const code = outputMemoryFilesystem.readFileSync("/bundle.js", 'utf-8');

            resolve(code);
        }));
    }

    const code = await compile();

    console.log("code:", code);

    const context = {}

    vm.createContext(context);
    vm.runInNewContext( `${code}`, context);

    console.log(context["runtime"].text());
}


// step 1: set "root" directory
// step 2: add modules
// step 3: load
        // - root directory is tree-crawled: ignore: node_modules
        //      - js, ts, JSON files are written to memory fs
        // - modules are written to memory fs
    // returns Promise<{
    //      context,
    //      taskList: returns all task
    //      task("...")
    // }>
    // task("...") fetches a context by name
    // - exposes .run() which executes w/ vargs and return an execution handle
    // - exposes .info() which returns name in various formats and function arguments