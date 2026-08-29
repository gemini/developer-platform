const RFQ_DELIVERY_ENUM_MEMBERS = [
  ["RESERVED_CLOSED", "CLOSED"],
  ["ACCEPTED", "ACCEPTED"],
  ["CONFIRMED", "CONFIRMED"],
  ["DECLINED", "DECLINED"],
  ["FINALIZED", "FINALIZED"],
  ["FAILED", "FAILED"],
];

function enumMembers(body) {
  return [...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)",?\s*$/gm)]
    .map(([, name, value]) => [name, value]);
}

function isRfqDeliveryEnum(body) {
  const members = enumMembers(body);
  if (members.length !== RFQ_DELIVERY_ENUM_MEMBERS.length) return false;

  const valuesByName = new Map(members);
  return RFQ_DELIVERY_ENUM_MEMBERS.every(
    ([name, value]) => valuesByName.get(name) === value,
  );
}

// Preserve the public enum export emitted by the previous generated schema
// numbering. Locate the RFQ delivery enum by its stable wire values because
// Modelina's anonymous schema suffix can shift whenever the upstream schema
// adds or reorders unrelated anonymous definitions.
export function addCompatibilityAliases(source) {
  const matches = [...source.matchAll(/^export enum ([A-Za-z_$][\w$]*) \{\r?\n([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => isRfqDeliveryEnum(body));
  if (matches.length !== 1) {
    throw new Error(`generate-ws-types: expected one RFQ delivery enum, found ${matches.length}.`);
  }

  const generatedName = matches[0][1];
  if (generatedName === "AnonymousSchema_152") return source;

  const alias = `export { ${generatedName} as AnonymousSchema_152 };`;
  if (source.includes(alias)) return source;
  return `${source}\n\n/** @deprecated Use ${generatedName}. */\n${alias}`;
}
