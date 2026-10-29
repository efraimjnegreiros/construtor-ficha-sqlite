const MIN_NODE = [20, 19];

export function validateRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    throw new Error(`Versão incompatível do Node.js: ${process.versions.node}. Use Node.js >= ${MIN_NODE.join('.')}.`);
  }
  return { node: process.versions.node };
}
