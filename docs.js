import { context } from '@actions/github'
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

const getPackagePaths = async () => {
    const apis = await fs.promises.readdir(path.join('apis'), { withFileTypes: true })
    
    const paths = [
        ...apis
            .filter(dirent => dirent.isDirectory())
            .map(dirent => `apis/${dirent.name}`)
    ];

    return paths;
};

const buildReadme = async (basePath) => {
    const readmeTemplate = await fs.promises.readFile(path.join(basePath, '.README.hbs'), 'utf8');
    const packageRaw = await fs.promises.readFile(path.join(basePath, 'package.json'), 'utf8');

    const template = Handlebars.compile(readmeTemplate);

    const data = {
        package: JSON.parse(packageRaw),
        github: context
    };

    const result = template(data);

    await fs.promises.writeFile(path.join(basePath, 'README.md'), result);
};

for (const packagePath of await getPackagePaths()) {
    await buildReadme(packagePath);
}