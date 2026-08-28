import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import vm from 'node:vm';

const projectRoot = process.cwd();
const errors = [];

function projectPath(...parts) {
  return join(projectRoot, ...parts);
}

function displayPath(filePath) {
  return relative(projectRoot, filePath).replaceAll('\\', '/');
}

function readProjectFile(filePath) {
  return readFileSync(filePath, 'utf8');
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

function recordSyntaxError(label, source) {
  try {
    new vm.Script(source, { filename: label });
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
  }
}

function validateManifest() {
  const manifestPath = projectPath('appsscript.json');

  try {
    const manifest = JSON.parse(readProjectFile(manifestPath));

    if (manifest.runtimeVersion !== 'V8') {
      errors.push('appsscript.json: runtimeVersion must be V8.');
    }

    if (typeof manifest.timeZone !== 'string' || manifest.timeZone.trim() === '') {
      errors.push('appsscript.json: timeZone must be a non-empty string.');
    }

    if (!manifest.webapp || !manifest.webapp.executeAs || !manifest.webapp.access) {
      errors.push('appsscript.json: webapp.executeAs and webapp.access are required.');
    }
  } catch (error) {
    errors.push(`appsscript.json: ${error.message}`);
  }
}

function validateBackend(backendFiles) {
  for (const filePath of backendFiles) {
    recordSyntaxError(displayPath(filePath), readProjectFile(filePath));
  }

  const backendSource = backendFiles.map(readProjectFile).join('\n');
  const requiredInventoryFunctions = [
    'changeInventoryStock',
    'logInventoryMovement',
    'getInventoryMovementType',
  ];

  for (const functionName of requiredInventoryFunctions) {
    const declarationPattern = new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`, 'g');
    const declarationCount = backendSource.match(declarationPattern)?.length ?? 0;

    if (declarationCount !== 1) {
      errors.push(
        `Backend: expected exactly one ${functionName} declaration; found ${declarationCount}.`
      );
    }
  }
}

function validateHtml(htmlFiles) {
  for (const filePath of htmlFiles) {
    const fileName = displayPath(filePath);
    const source = readProjectFile(filePath);
    const idCounts = new Map();

    for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
      const id = match[1];
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    for (const [id, count] of idCounts) {
      if (count > 1) {
        errors.push(`${fileName}: duplicate HTML id "${id}" appears ${count} times.`);
      }
    }

    let scriptNumber = 0;
    const inlineScriptPattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

    for (const match of source.matchAll(inlineScriptPattern)) {
      scriptNumber += 1;
      const scriptSource = match[1].replace(/<\?(?:!=|=)?[\s\S]*?\?>/g, 'undefined');
      recordSyntaxError(`${fileName}#script-${scriptNumber}`, scriptSource);
    }
  }
}

function validateIncludes() {
  const indexPath = projectPath('Frontend', 'Index.html');
  const source = readProjectFile(indexPath);
  const includePattern = /<\?!=\s*include\s*\(\s*["']([^"']+)["']\s*\)\s*;?\s*\?>/g;

  for (const match of source.matchAll(includePattern)) {
    const includePath = projectPath(`${match[1]}.html`);

    if (!existsSync(includePath)) {
      errors.push(`Frontend/Index.html: included file does not exist: ${match[1]}.html`);
    }
  }
}

function validateFileNames(projectFiles) {
  const doubledExtensionPattern = /\.(?:gs|html|js)\.(?:gs|html|js)$/i;

  for (const filePath of projectFiles) {
    if (doubledExtensionPattern.test(filePath)) {
      errors.push(`${displayPath(filePath)}: doubled source-file extension is not allowed.`);
    }
  }
}

const backendFiles = walkFiles(projectPath('Backend')).filter((filePath) =>
  ['.gs', '.js'].includes(extname(filePath))
);
const htmlFiles = walkFiles(projectPath('Frontend')).filter(
  (filePath) => extname(filePath) === '.html'
);
const projectFiles = [...backendFiles, ...htmlFiles];

validateManifest();
validateBackend(backendFiles);
validateHtml(htmlFiles);
validateIncludes();
validateFileNames(projectFiles);

if (errors.length > 0) {
  console.error(`Project validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Project validation passed (${backendFiles.length} backend files, ${htmlFiles.length} HTML files).`
  );
}
