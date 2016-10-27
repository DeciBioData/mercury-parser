import fs from 'fs'
import URL from 'url'
import inquirer from 'inquirer'
import ora from 'ora'

import Mercury from '../dist/mercury'
import {
  stripJunkTags,
  makeLinksAbsolute,
} from 'utils/dom'
import extractorTemplate from './templates/custom-extractor'
import extractorTestTemplate from './templates/custom-extractor-test'

const questions = [
  {
    type: 'input',
    name: 'website',
    message: 'Paste a url to an article you\'d like to create or extend a parser for:',
    validate(value) {
      const { hostname } = URL.parse(value);
      if (hostname) return true;

      return false;
    },
  },
];

inquirer.prompt(questions).then((answers) => {
  scaffoldCustomParser(answers.website);
});

let spinner;
function confirm(fn, args, msg, newParser) {
  spinner = ora({ text: msg });
  spinner.start();
  const result = fn.apply(null, args);

  if (result && result.then) {
    result.then(r => savePage(r, args, newParser));
  } else {
    spinner.succeed();
  }

  return result;
}

function savePage($, [url], newParser) {
  const { hostname } = URL.parse(url);

  spinner.succeed();

  const filename = new Date().getTime();
  const file = `./fixtures/${hostname}/${filename}.html`;
  // fix http(s) relative links:
  makeLinksAbsolute($('*').first(), $, url)
  $('[src], [href]').each((index, node) => {
    const $node = $(node)
    const link = $node.attr('src')
    if (link && link.slice(0, 2) === '//') {
      $node.attr('src', `http:${link}`)
    }
  })
  const html = stripJunkTags($('*').first(), $, ['script']).html();

  fs.writeFileSync(file, html);

  const result = Mercury.parse(url, html).then((result) => {
    if (newParser) {
      confirm(generateScaffold, [url, file, result], 'Generating parser and tests');
      console.log(`Your custom site extractor has been set up. To get started building it, run
      npm run watch:test -- ${hostname}`)
    } else {
      console.log(`
  It looks like you already have a custom parser for this url.
  The page you linked to has been added to ${file}. Copy and paste
  the following code to use that page in your tests:
  const html = fs.readFileSync('${file}');`)
    }
  })
}

function generateScaffold(url, file, result) {
  const { hostname } = URL.parse(url);
  const extractor = extractorTemplate(hostname)
  const extractorTest = extractorTestTemplate(file, url, getDir(url), result)

  fs.writeFileSync(`${getDir(url)}/index.js`, extractor)
  fs.writeFileSync(`${getDir(url)}/index.test.js`, extractorTest)
  fs.appendFileSync(
    './src/extractors/custom/index.js',
    exportString(url),
  )
}

function exportString(url) {
  const { hostname } = URL.parse(url);
  return `export * from './${hostname}'`;
}

function confirmCreateDir(dir, msg) {
  if (!fs.existsSync(dir)) {
    confirm(fs.mkdirSync, [dir], msg);
  }
}

function scaffoldCustomParser(url) {
  const dir = getDir(url);
  const { hostname } = URL.parse(url);
  let newParser = false

  if (!fs.existsSync(dir)) {
    newParser = true
    confirmCreateDir(dir, `Creating ${hostname} directory`);
    confirmCreateDir(`./fixtures/${hostname}`, 'Creating fixtures directory');
  }

    confirm(Mercury.fetchResource, [url], 'Fetching fixture', newParser);
}

function getDir(url) {
  const { hostname } = URL.parse(url);
  return `./src/extractors/custom/${hostname}`;
}