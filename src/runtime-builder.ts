import {ModuleMap} from "./module-map";

class RuntimeBuilder {

    public modules: ModuleMap = {};

    constructor(public root:string) {
    }

    /**
     * Map a script to a import path for use by the runtime
     *
     * For example:
     *      module("@made-up-scope/made-up-package", "./some-script");
     *
     *  When loaded, the contents of "some-script" is now available
     *  when using require or import in the entrypoint or runtime scripts
     *
     * @param key the module key to be used by scripts in require or import statements
     * @param path the module source code to be loaded when required or imported
     */
    module(key: string, path: string): RuntimeBuilder {
        this.modules[key] = path;

        return this;
    }

    load(entrypoint: string) {

    }

}