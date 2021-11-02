const { promises: fs } = require('fs');
const path = require('path');
const {Reporter} = require('@parcel/plugin');

const ora = require('ora');
const chalk = require('chalk');
const {cosmiconfig} = require('cosmiconfig');
const Prerenderer = require('@prerenderer/prerenderer');
const Puppeteer = require('@prerenderer/renderer-puppeteer');
const htmlnano = require('htmlnano');
const prettyMs = require('pretty-ms');

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

Object.defineProperty(exports, '__esModule', {value: true});

exports.default = new Reporter({
    async report({event, options, logger}) {
        if (event.type === 'buildSuccess') {
            if (process.env.NODE_ENV !== 'production') return;
            const spinner = ora(chalk.grey('Prerendering')).start();
            let routes = ['/']; // the default route
            let rendererConfig = {};
            const found = await cosmiconfig('prerender').search();
            if (found) {
                const {config} = found;
                if (Array.isArray(config)) {
                    routes = config;
                } else {
                    if (config.rendererConfig) ({rendererConfig} = config);
                    if (config.routes) ({routes} = config);
                }
            }
            //const {outDir} = bundler.options;
            // This does not work any more. Use a dirty hack and take the
            // first bundle (which should be in the output root) to determine the absolute path
            // of wherever we output to
            const primaryBundle = event.bundleGraph.getBundles()[0];
            const outDir = path.dirname(primaryBundle.filePath);
            const prerenderer = new Prerenderer({
                staticDir: outDir,
                renderer: new Puppeteer(rendererConfig),
            });
            await prerenderer.initialize();

            const start = Date.now();

            const renderedRoutes = await prerenderer.renderRoutes(routes);

            await Promise.all(
                renderedRoutes.map(async (route) => {
                    const outputDirectory = path.join(outDir, route.route);
                    const file = path.resolve(outputDirectory, 'index.html');
                    await fs.mkdir(outputDirectory, {recursive: true});
                    const {html} = await htmlnano.process(route.html.trim());
                    await fs.writeFile(file, html);
                }),
            );

            const end = Date.now();

            spinner.stopAndPersist({
                symbol: '✨ ',
                text: chalk.green(`Prerendered in ${prettyMs(end - start)}.`),
            });

            prerenderer.destroy();
        }
    }
});
