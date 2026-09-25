const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const companionFile = /\.(dll|dylib|so(?:\.\d+)*|nnue|net|ini|cfg)$/i;

async function isEngineExecutable(file) {
  try {
    if (!(await fs.stat(file)).isFile()) return false;
    if (process.platform === 'win32') return /\.exe$/i.test(file);
    if (/\.exe$/i.test(file) || companionFile.test(file)) return false;
    await fs.access(file, constants.X_OK);
    return true;
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP'].includes(error.code)) return false;
    throw error;
  }
}

function inside(directory, file) {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  return (
    !!relative &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

async function importEngine(directory, source, folder = false) {
  source = path.resolve(source);
  directory = path.resolve(directory);
  if (folder && inside(source, directory))
    throw new Error('Choose the engine folder itself, not a folder containing the engine library.');
  const stat = await fs.stat(source);
  if (folder ? !stat.isDirectory() : !(await isEngineExecutable(source)))
    throw new Error(
      process.platform === 'win32'
        ? 'Choose an engine .exe file or folder.'
        : 'Choose an engine executable built for this operating system, with execute permission, or an engine folder.'
    );
  if (source === directory || inside(directory, source)) return source;
  const name =
    !folder && process.platform === 'win32'
      ? path.basename(source, path.extname(source))
      : path.basename(source);
  await fs.mkdir(directory, { recursive: true });
  let target;
  for (let suffix = 1; ; suffix++) {
    target = path.join(directory, name + (suffix === 1 ? '' : '-' + suffix));
    try {
      await fs.mkdir(target);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  if (folder) {
    await fs.cp(source, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true
    });
    return target;
  }
  const destination = path.join(target, path.basename(source));
  const companions = await fs.readdir(path.dirname(source), { withFileTypes: true });
  for (const entry of companions) {
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      companionFile.test(entry.name) &&
      (await fs.stat(path.join(path.dirname(source), entry.name))).isFile()
    ) {
      await fs.copyFile(
        path.join(path.dirname(source), entry.name),
        path.join(target, entry.name),
        constants.COPYFILE_EXCL
      );
    }
  }
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
  if (process.platform !== 'win32') await fs.chmod(destination, stat.mode & 0o777);
  return destination;
}

module.exports = { importEngine, isEngineExecutable };
